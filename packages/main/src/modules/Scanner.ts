import type {AppModule} from '../AppModule.js';
import {ipcMain, BrowserWindow} from 'electron';
import {profileFrequencyRepository, type ProfileFrequency} from './Database.js';
import {getRadioInstance, isSDRRunning} from './SDRService.js';

/**
 * Scanner Module
 *
 * Manages frequency scanning based on profiles, with squelch detection
 * and automatic frequency switching.
 */

interface ScannerState {
  isScanning: boolean;
  profileId: number | null;
  frequencies: ProfileFrequency[];
  currentIndex: number;
  currentFrequency: ProfileFrequency | null;
  hasReceivedActiveSignal: boolean; // Track if we've ever received an active signal on current freq
  waitingForUnsquelch: boolean;
}

const UNSQUELCH_WAIT_TIME = 2000; // 2 seconds in milliseconds

let scannerState: ScannerState = {
  isScanning: false,
  profileId: null,
  frequencies: [],
  currentIndex: 0,
  currentFrequency: null,
  hasReceivedActiveSignal: false,
  waitingForUnsquelch: false,
};

let unsquelchTimer: NodeJS.Timeout | null = null;

export function createScannerModule(): AppModule {
  return {
    enable() {
      setupIPCHandlers();
    },
  };
}

/**
 * Set the frequency using the SDR radio instance
 */
async function setFrequency(frequencyHz: number): Promise<void> {
  const radio = getRadioInstance();
  if (!radio || !isSDRRunning()) {
    throw new Error('SDR is not running');
  }

  await radio.setFrequency(frequencyHz);
}

/**
 * Notify renderer of scanner updates
 */
function notifyRenderer(event: string, data: any) {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(event, data);
  }
}

/**
 * Start scanning with a profile
 */
async function startScan(profileId: number): Promise<{success: boolean; error?: string}> {
  try {
    // Stop any existing scan
    if (scannerState.isScanning) {
      stopScan();
    }

    // Load frequencies for this profile (only enabled ones)
    const frequencies = profileFrequencyRepository.getEnabledByProfileId(profileId);

    if (frequencies.length === 0) {
      return {success: false, error: 'No enabled frequencies in profile'};
    }

    // Initialize scanner state
    scannerState = {
      isScanning: true,
      profileId,
      frequencies,
      currentIndex: 0,
      currentFrequency: frequencies[0],
      hasReceivedActiveSignal: false,
      waitingForUnsquelch: false,
    };

    // Start at the first frequency
    await setFrequency(frequencies[0].FrequencyHz);

    // Notify renderer
    notifyRenderer('scanner:started', {
      profileId,
      frequency: frequencies[0].FrequencyHz,
      channel: frequencies[0].Channel,
    });

    notifyRenderer('scanner:frequencyChange', {
      frequency: frequencies[0].FrequencyHz,
      channel: frequencies[0].Channel,
      index: 0,
      total: frequencies.length,
    });

    return {success: true};
  } catch (error) {
    console.error('Failed to start scan:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stop scanning
 */
function stopScan(): {success: boolean} {
  if (unsquelchTimer) {
    clearTimeout(unsquelchTimer);
    unsquelchTimer = null;
  }

  const wasScanning = scannerState.isScanning;

  scannerState = {
    isScanning: false,
    profileId: null,
    frequencies: [],
    currentIndex: 0,
    currentFrequency: null,
    hasReceivedActiveSignal: false,
    waitingForUnsquelch: false,
  };

  if (wasScanning) {
    notifyRenderer('scanner:stopped', {});
  }

  return {success: true};
}

/**
 * Move to the next frequency in the scan list
 */
async function moveToNextFrequency() {
  if (!scannerState.isScanning || scannerState.frequencies.length === 0) {
    return;
  }

  // Move to next frequency (wrap around)
  scannerState.currentIndex = (scannerState.currentIndex + 1) % scannerState.frequencies.length;
  const nextFreq = scannerState.frequencies[scannerState.currentIndex];

  // Reset state for new frequency
  scannerState.currentFrequency = nextFreq;
  scannerState.hasReceivedActiveSignal = false;
  scannerState.waitingForUnsquelch = false;

  await setFrequency(nextFreq.FrequencyHz);

  notifyRenderer('scanner:frequencyChange', {
    frequency: nextFreq.FrequencyHz,
    channel: nextFreq.Channel,
    index: scannerState.currentIndex,
    total: scannerState.frequencies.length,
  });
}

/**
 * Handle audio data event from SDR
 * This is called by the SDR service when audio data is received
 */
export function handleAudioData(data: {signalLevel: number; squelched: boolean}) {
  if (!scannerState.isScanning) {
    return;
  }

  const {squelched} = data;

  // Case 1: Not squelched (active signal)
  if (!squelched) {
    // Mark that we've received an active signal on this frequency
    if (!scannerState.hasReceivedActiveSignal) {
      scannerState.hasReceivedActiveSignal = true;
    }

    // If we were waiting for unsquelch, cancel the timer
    if (scannerState.waitingForUnsquelch) {
      if (unsquelchTimer) {
        clearTimeout(unsquelchTimer);
        unsquelchTimer = null;
      }
      scannerState.waitingForUnsquelch = false;
    }

    // Stay on this frequency
    return;
  }

  // Case 2: Squelched
  if (squelched) {
    // If we've never received an active signal on this frequency, move immediately
    if (!scannerState.hasReceivedActiveSignal) {
      moveToNextFrequency();
      return;
    }

    // If we have received an active signal before, wait 2 seconds before moving
    if (!scannerState.waitingForUnsquelch) {
      scannerState.waitingForUnsquelch = true;

      // Wait 2 seconds to see if it becomes unsquelched again
      unsquelchTimer = setTimeout(() => {
        // After 2 seconds, if still squelched, move to next frequency
        if (scannerState.isScanning && scannerState.waitingForUnsquelch) {
          moveToNextFrequency();
        }
      }, UNSQUELCH_WAIT_TIME);
    }

    // If already waiting, do nothing - timer will handle it
    return;
  }
}

/**
 * Get current scanner status
 */
function getScannerStatus() {
  return {
    isScanning: scannerState.isScanning,
    profileId: scannerState.profileId,
    currentFrequency: scannerState.currentFrequency
      ? {
          frequencyHz: scannerState.currentFrequency.FrequencyHz,
          channel: scannerState.currentFrequency.Channel,
        }
      : null,
    currentIndex: scannerState.currentIndex,
    totalFrequencies: scannerState.frequencies.length,
  };
}

function setupIPCHandlers() {
  // Start scanning
  ipcMain.handle('scanner:start', async (_, profileId: number) => {
    return startScan(profileId);
  });

  // Stop scanning (hold)
  ipcMain.handle('scanner:stop', async () => {
    return stopScan();
  });

  // Get scanner status
  ipcMain.handle('scanner:getStatus', async () => {
    return getScannerStatus();
  });
}

// Helper to get the main window
function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}
