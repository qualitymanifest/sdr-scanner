import type {AppModule} from '../AppModule.js';
import {ipcMain, BrowserWindow} from 'electron';
import {createRequire} from 'node:module';
import {handleAudioData as notifyScanner} from './Scanner.js';

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
 * Internal function to stop the SDR and clean up resources
 */
async function stopSDR(): Promise<void> {
  if (!radio || !isRunning) {
    return;
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

        // Send only metadata to renderer for UI updates
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('sdr:audioData', {
            signalLevel,
            squelched,
          });
        }

        // TODO: Handle recording here in the main process
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
      frequency: radio?.getFrequency?.() ?? null,
    };
  });
}

// Helper to get the main window
function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}
