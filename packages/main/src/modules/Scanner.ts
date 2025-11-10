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
 * If current frequency is in the profile, starts from the next one.
 * Otherwise, starts from the first frequency in the profile.
 */
async function startScan(profileId: number): Promise<{success: boolean; error?: string}> {
  try {
    // Clear any pending unsquelch timer
    if (unsquelchTimer) {
      clearTimeout(unsquelchTimer);
      unsquelchTimer = null;
    }

    // Stop any existing scan
    if (scannerState.isScanning) {
      stopScan();
    }

    // Load frequencies for this profile (only enabled ones)
    const frequencies = profileFrequencyRepository.getEnabledByProfileId(profileId);

    if (frequencies.length === 0) {
      return {success: false, error: 'No enabled frequencies in profile'};
    }

    // Determine starting index based on current frequency
    let startIndex = 0;
    const currentFreqHz = scannerState.currentFrequency?.FrequencyHz;
    console.log("current", currentFreqHz);
    if (currentFreqHz) {
      const foundIndex = frequencies.findIndex(f => f.FrequencyHz === currentFreqHz);
      console.log('found', foundIndex)
      if (foundIndex !== -1) {
        // Current frequency is in profile, start from next (wrap around)
        startIndex = (foundIndex + 1) % frequencies.length;
        console.log('start', startIndex, frequencies[startIndex])
      }
      // Otherwise startIndex remains 0 (start from beginning)
    }

    // Initialize scanner state
    scannerState = {
      isScanning: true,
      profileId,
      frequencies,
      currentIndex: startIndex,
      currentFrequency: frequencies[startIndex],
      hasReceivedActiveSignal: false,
      waitingForUnsquelch: false,
    };

    // Start at the determined frequency
    await setFrequency(frequencies[startIndex].FrequencyHz);

    // Notify renderer
    notifyRenderer('scanner:started', {
      profileId,
      frequency: frequencies[startIndex].FrequencyHz,
      channel: frequencies[startIndex].Channel,
    });

    notifyRenderer('scanner:frequencyChange', {
      frequency: frequencies[startIndex].FrequencyHz,
      channel: frequencies[startIndex].Channel,
      index: startIndex,
      total: frequencies.length,
      hasReceivedActiveSignal: false,
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
 * Preserves the profile, frequencies, and current frequency so scanning can resume
 */
function stopScan(): {success: boolean} {
  if (unsquelchTimer) {
    clearTimeout(unsquelchTimer);
    unsquelchTimer = null;
  }

  const wasScanning = scannerState.isScanning;

  // Preserve profile, frequencies, and current frequency for resume
  scannerState.isScanning = false;
  scannerState.hasReceivedActiveSignal = false;
  scannerState.waitingForUnsquelch = false;

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
    hasReceivedActiveSignal: scannerState.hasReceivedActiveSignal,
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

      // Notify renderer that we've paused on a signal
      notifyRenderer('scanner:frequencyChange', {
        frequency: scannerState.currentFrequency?.FrequencyHz,
        channel: scannerState.currentFrequency?.Channel,
        index: scannerState.currentIndex,
        total: scannerState.frequencies.length,
        hasReceivedActiveSignal: true,
      });
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
 * Set frequency manually (not part of scanning)
 * Updates both the radio and the scanner's current frequency tracking
 */
async function setFrequencyManually(
  frequencyHz: number,
): Promise<{success: boolean; error?: string}> {
  try {
    // Set the radio frequency
    await setFrequency(frequencyHz);

    // Update scanner state to track this frequency
    // Look up if this frequency exists in the current profile
    const matchingFreq = scannerState.frequencies.find(f => f.FrequencyHz === frequencyHz);

    if (matchingFreq) {
      // It's in the current profile, update with full info
      scannerState.currentFrequency = matchingFreq;
    } else {
      // It's not in the profile (or no profile loaded), create a minimal entry
      scannerState.currentFrequency = {
        Id: 0,
        ProfileId: scannerState.profileId ?? 0,
        FrequencyHz: frequencyHz,
        Channel: null,
        Enabled: true,
      };
    }

    // Notify renderer
    notifyRenderer('scanner:frequencyChange', {
      frequency: frequencyHz,
      channel: matchingFreq?.Channel ?? null,
      index: scannerState.currentIndex,
      total: scannerState.frequencies.length,
      hasReceivedActiveSignal: false,
    });

    return {success: true};
  } catch (error) {
    console.error('Failed to set frequency:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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

  // Set frequency manually
  ipcMain.handle('scanner:setFrequency', async (_, frequencyHz: number) => {
    return setFrequencyManually(frequencyHz);
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
