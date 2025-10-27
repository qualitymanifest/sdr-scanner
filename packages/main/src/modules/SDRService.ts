import type {AppModule} from '../AppModule.js';
import type {ModuleContext} from '../ModuleContext.js';
import {ipcMain, BrowserWindow} from 'electron';
import {createRequire} from 'node:module';

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

export function createSDRService(): AppModule {
  return {
    enable() {
      // Initialize IPC handlers for SDR control
      setupIPCHandlers();
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
        if (!isMuted && !squelched && speaker) {
          speaker.write(left);
        }

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

      await radio.stop();
      radio = null;
      isRunning = false;

      // Clean up speaker
      if (speaker) {
        speaker.end();
        speaker = null;
      }

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
