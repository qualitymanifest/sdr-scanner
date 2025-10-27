import type {AppModule} from '../AppModule.js';
import type {ModuleContext} from '../ModuleContext.js';
import {ipcMain, BrowserWindow} from 'electron';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const SDRRadio = require('rtlfmjs');

/**
 * SDR Service Module
 *
 * Manages the SDR radio device, providing frequency control,
 * audio streaming, and signal monitoring capabilities.
 */

let radio: InstanceType<typeof SDRRadio> | null = null;
let isRunning = false;

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

      radio = new SDRRadio({
        sampleRate: config?.sampleRate ?? 1_600_000,
        bufsPerSec: config?.bufsPerSec ?? 10,
      });

      // Set up event listeners
      radio.on('audioData', ({left, right, signalLevel, squelched}: {
        left: Buffer;
        right: Buffer;
        signalLevel: number;
        squelched: boolean;
      }) => {
        // Send audio data and signal info to renderer for display
        // The renderer will handle speaker output and recording
        // Note: left/right are Int16LE Buffers from rtlfmjs
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('sdr:audioData', {
            // Send buffer data as array for IPC - these are Int16LE samples
            left: Array.from(left),
            right: Array.from(right),
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

      await radio.stop();
      radio = null;
      isRunning = false;

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
