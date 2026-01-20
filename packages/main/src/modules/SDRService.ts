import type {AppModule} from '../AppModule.js';
import {ipcMain, BrowserWindow, app} from 'electron';
import {createRequire} from 'node:module';
import {handleAudioData as notifyScanner, isScanning} from './Scanner.js';
import {getRecordingTimeout, getMinimumRecordingDuration} from './Settings.js';
import {queueTranscription} from './TranscriptionService.js';
import {recordingRepository, parseRecordingFileName} from './Database.js';
import path from 'node:path';
import fs from 'node:fs';
import dayjs from 'dayjs';
import {FileWriter as WavFileWriter} from 'wav';
import {parseFile} from 'music-metadata';

const require = createRequire(import.meta.url);
const SDRRadio = require('rtlfmjs');
const Speaker = require('speaker');

/**
 * SDR Service Module
 *
 * Manages the SDR radio device, providing frequency control,
 * audio streaming, and signal monitoring capabilities.
 */

let radio: InstanceType<typeof SDRRadio> | null = null;
let speaker: any | null = null;
let isRunning = false;
let isMuted = false;

// Recording state
let isRecordingEnabled = false;
let currentRecordingWriter: WavFileWriter | null = null;
let currentRecordingPath: string | null = null;
let recordingTimeoutTimer: NodeJS.Timeout | null = null;

/**
 * Get the current radio instance (for use by Scanner module)
 */
export function getRadioInstance() {
  return radio;
}

/**
 * Check if SDR is running
 */
export function isSDRRunning() {
  return isRunning;
}

/**
 * Check if recording is currently active
 */
export function isRecording() {
  return isRecordingEnabled && currentRecordingWriter !== null;
}

/**
 * Get the current tuned frequency from the radio
 * rtlfmjs stores frequency as: tuned frequency = centerFrequency - offset
 */
function getRadioFrequency(): number | null {
  if (!radio) {
    return null;
  }
  return radio.centerFrequency - radio.offset;
}

/**
 * Create a recording filename based on current frequency and timestamp
 * Format: {freq}_{MM}-{DD}-{YYYY}-{HH}-{mm}-{ss}.wav
 * Example: 161-175_01-20-2025-06-19-45.wav
 */
function createRecordingFileName(frequencyHz: number): string {
  // Convert frequency from Hz to MHz and format with hyphen
  const freqMHz = (frequencyHz / 1_000_000).toFixed(3);
  const freqFormatted = freqMHz.replace('.', '-');

  // Format date/time using dayjs
  const timestamp = dayjs().format('MM-DD-YYYY-HH-mm-ss');

  return `${freqFormatted}_${timestamp}.wav`;
}

/**
 * Get the recordings directory path, creating it if it doesn't exist
 */
function getRecordingsDirectory(): string {
  const userDataPath = app.getPath('userData');
  const recordingsPath = path.join(userDataPath, 'recordings');

  // Create directory if it doesn't exist
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }

  return recordingsPath;
}

/**
 * Start a new recording file
 */
function startRecording(): void {
  if (!radio || !isRunning) {
    console.error('Cannot start recording: SDR is not running');
    return;
  }

  if (currentRecordingWriter) {
    console.warn('Recording already in progress');
    return;
  }

  try {
    const frequencyHz = getRadioFrequency();
    if (frequencyHz === null) {
      console.error('Cannot get radio frequency');
      return;
    }

    const recordingsDir = getRecordingsDirectory();
    const filename = createRecordingFileName(frequencyHz);
    const filePath = path.join(recordingsDir, filename);

    // Create WAV file writer
    currentRecordingWriter = new WavFileWriter(filePath, {
      sampleRate: 48000,
      channels: 1,
      bitDepth: 16,
    });

    currentRecordingPath = filePath;

    console.log(`Started recording to: ${filePath}`);

    // If NOT in scanning mode, start the recording timeout timer
    // In scanning mode, the Scanner's unsquelchTimer will handle finalization
    if (!isScanning()) {
      recordingTimeoutTimer = setTimeout(() => {
        console.log('Recording timeout expired, finalizing recording');
        finalizeRecording();
      }, getRecordingTimeout());
    }
  } catch (error) {
    console.error('Failed to start recording:', error);
    currentRecordingWriter = null;
    currentRecordingPath = null;
  }
}

/**
 * Write audio data to the current recording file
 */
function writeAudioToRecording(audioBuffer: Buffer): void {
  if (!currentRecordingWriter) {
    return;
  }

  try {
    currentRecordingWriter.write(audioBuffer);

    // Reset recording timeout timer (for manual hold mode only)
    // In scanning mode, we don't use the recording timeout timer
    if (!isScanning()) {
      if (recordingTimeoutTimer) {
        clearTimeout(recordingTimeoutTimer);
      }

      // Restart the recording timeout timer
      recordingTimeoutTimer = setTimeout(() => {
        console.log('Recording timeout expired, finalizing recording');
        finalizeRecording();
      }, getRecordingTimeout());
    }
  } catch (error) {
    console.error('Failed to write audio to recording:', error);
    finalizeRecording();
  }
}

/**
 * Finalize the current recording and close the file
 */
export function finalizeRecording(): void {
  if (!currentRecordingWriter || !currentRecordingPath) {
    return;
  }

  // Clear recording timeout timer
  if (recordingTimeoutTimer) {
    clearTimeout(recordingTimeoutTimer);
    recordingTimeoutTimer = null;
  }

  const filePath = currentRecordingPath;

  try {
    // Close the WAV file writer (automatically updates header)
    currentRecordingWriter.end();

    console.log(`Finalized recording: ${filePath}`);

    // Call post-recording processing
    doneRecording(filePath);
  } catch (error) {
    console.error('Error finalizing recording:', error);
  }

  // Reset recording state
  currentRecordingWriter = null;
  currentRecordingPath = null;
}

/**
 * Function called when a recording is complete
 */
async function doneRecording(filePath: string): Promise<void> {
  console.log(`Recording complete: ${filePath}`);

  try {
    // Get the duration of the recording
    const metadata = await parseFile(filePath);
    const durationMs = (metadata.format.duration ?? 0) * 1000;
    const minDuration = getMinimumRecordingDuration();

    // Delete if too short
    if (durationMs < minDuration) {
      console.log(`Recording too short (${durationMs.toFixed(0)}ms < ${minDuration}ms), deleting: ${filePath}`);
      fs.unlinkSync(filePath);
      return;
    }

    console.log(`Recording duration: ${durationMs.toFixed(0)}ms`);

    // Extract frequency and datetime from filename and add to database
    const fileName = path.basename(filePath);
    const {frequency, datetime} = parseRecordingFileName(fileName);
    const recordingId = recordingRepository.create(filePath, frequency, datetime, 'pending');
    console.log(`Added recording to database with ID ${recordingId}`);

    // Queue transcription (runs in background)
    queueTranscription(filePath)
      .then(result => {
        console.log(`Transcription complete for ${path.basename(filePath)}: "${result.text.substring(0, 50)}..."`);
        // Update database with transcription result
        recordingRepository.updateTranscription(filePath, 'success', result.text);
      })
      .catch(error => {
        console.error(`Transcription failed for ${path.basename(filePath)}:`, error);
        // Update database with transcription failure status
        recordingRepository.updateTranscription(filePath, 'failed', null);
      });
  } catch (error) {
    console.error('Error processing recording:', error);
  }
}

/**
 * Internal function to stop the SDR and clean up resources
 */
async function stopSDR(): Promise<void> {
  if (!radio || !isRunning) {
    return;
  }

  // Finalize any open recording
  if (currentRecordingWriter) {
    finalizeRecording();
  }

  // Stop writing to speaker immediately
  const speakerToClose = speaker;
  speaker = null;
  isRunning = false;

  // Remove all event listeners to stop data flow
  radio.removeAllListeners();

  await radio.stop();
  radio = null;

  // Clean up speaker - must close properly to prevent hanging process
  if (speakerToClose) {
    // End the speaker stream immediately without draining
    speakerToClose.end();
  }
}

export function createSDRService(): AppModule {
  return {
    enable(context) {
      // Initialize IPC handlers for SDR control
      setupIPCHandlers();

      // Register cleanup handler for app shutdown
      context.app.on('will-quit', () => {
        // Finalize any open recording
        if (currentRecordingWriter) {
          try {
            currentRecordingWriter.end();
          } catch (error) {
            console.error('Error finalizing recording on shutdown:', error);
          }
        }

        // Just stop everything immediately, don't wait for async cleanup
        isRunning = false;

        if (speaker) {
          speaker.end();
          speaker = null;
        }

        if (radio) {
          radio.removeAllListeners();
          // Directly terminate worker without waiting for graceful shutdown
          radio._stopped = true;
          radio.running = false;
          if (radio.worker) {
            radio.worker.terminate();
            radio.worker = null;
          }
          // Don't close SDR device - let OS clean it up
          radio = null;
        }
      });
    },
  };
}

function setupIPCHandlers() {
  // Start the SDR radio
  ipcMain.handle('sdr:start', async (_, config?: {
    sampleRate?: number;
    bufsPerSec?: number;
  }) => {
    try {
      if (isRunning) {
        return {success: false, error: 'SDR is already running'};
      }

      // Initialize speaker for audio output
      speaker = new Speaker({
        channels: 1,
        bitDepth: 16,
        sampleRate: 48000,
        signed: true,
        float: false,
        littleEndian: true,
      });

      radio = new SDRRadio({
        sampleRate: config?.sampleRate ?? 1_600_000,
        bufsPerSec: config?.bufsPerSec ?? 10,
      });

      // Set up event listeners
      radio.on('audioData', ({left, signalLevel, squelched}: {
        left: Buffer;
        right: Buffer;
        signalLevel: number;
        squelched: boolean;
      }) => {
        // Play audio through speakers (in main process)
        if (speaker) {
          if (!isMuted && !squelched) {
            speaker.write(left);
          } else {
            // Write silence to prevent buffer underflow warnings
            const silence = Buffer.alloc(left.length);
            speaker.write(silence);
          }
        }

        // Notify scanner module about audio data for scan control
        notifyScanner({signalLevel, squelched});

        // Handle recording
        if (isRecordingEnabled) {
          if (!squelched) {
            // Active transmission - record it
            if (!currentRecordingWriter) {
              // Start new recording
              startRecording();
            }
            // Write audio data to recording
            if (currentRecordingWriter) {
              writeAudioToRecording(left);
            }
          }
          // If squelched, don't write data, but let timers continue
        }

        // Send only metadata to renderer for UI updates
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('sdr:audioData', {
            signalLevel,
            squelched,
          });
        }
      });

      radio.on('error', (err: Error) => {
        console.error('SDR error:', err);
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('sdr:error', {
            message: err.message,
            stack: err.stack,
          });
        }
      });

      await radio.start();
      isRunning = true;

      return {success: true};
    } catch (error) {
      console.error('Failed to start SDR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Stop the SDR radio
  ipcMain.handle('sdr:stop', async () => {
    try {
      if (!radio || !isRunning) {
        return {success: false, error: 'SDR is not running'};
      }

      await stopSDR();
      return {success: true};
    } catch (error) {
      console.error('Failed to stop SDR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Set frequency
  ipcMain.handle('sdr:setFrequency', async (_, frequency: number) => {
    try {
      if (!radio || !isRunning) {
        return {success: false, error: 'SDR is not running'};
      }

      // Finalize any current recording before changing frequency
      if (currentRecordingWriter) {
        finalizeRecording();
      }

      await radio.setFrequency(frequency);
      return {success: true};
    } catch (error) {
      console.error('Failed to set frequency:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get current status
  ipcMain.handle('sdr:getStatus', async () => {
    return {
      isRunning,
      frequency: getRadioFrequency(),
    };
  });

  // Start recording
  ipcMain.handle('sdr:startRecording', async () => {
    try {
      if (!isRunning) {
        return {success: false, error: 'SDR is not running'};
      }

      isRecordingEnabled = true;
      return {success: true};
    } catch (error) {
      console.error('Failed to start recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Stop recording
  ipcMain.handle('sdr:stopRecording', async () => {
    try {
      isRecordingEnabled = false;

      // Finalize any current recording
      if (currentRecordingWriter) {
        finalizeRecording();
      }

      return {success: true};
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get recording status
  ipcMain.handle('sdr:getRecordingStatus', async () => {
    return {
      isRecordingEnabled,
      isRecording: isRecording(),
      currentRecordingPath: currentRecordingPath ?? null,
    };
  });
}

// Helper to get the main window
function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}
