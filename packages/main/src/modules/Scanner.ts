import type {AppModule} from '../AppModule.js';
import {ipcMain, BrowserWindow} from 'electron';
import {profileFrequencyRepository, type ProfileFrequency} from './Database.js';
import {getRadioInstance, isSDRRunning} from './SDRService.js';
import {getUnsquelchWaitTime} from './Settings.js';

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
  currentFrequency: ProfileFrequency | null;
  hasReceivedActiveSignal: boolean; // Track if we've ever received an active signal on current freq
  waitingForUnsquelch: boolean;
}

let scannerState: ScannerState = {
  isScanning: false,
  profileId: null,
  frequencies: [],
  currentFrequency: null,
  hasReceivedActiveSignal: false,
  waitingForUnsquelch: false,
};

/**
 * Get the current index of the current frequency in the frequencies array
 * Returns -1 if current frequency is not in the array
 */
function getCurrentIndex(): number {
  if (!scannerState.currentFrequency || scannerState.frequencies.length === 0) {
    return -1;
  }
  return scannerState.frequencies.findIndex(
    f => f.FrequencyHz === scannerState.currentFrequency?.FrequencyHz
  );
}

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
 * Also notifies the renderer of the frequency change with current scanner state
 */
async function setFrequency(frequencyHz: number): Promise<void> {
  const radio = getRadioInstance();
  if (!radio || !isSDRRunning()) {
    throw new Error('SDR is not running');
  }

  await radio.setFrequency(frequencyHz);

  // Notify renderer of frequency change with current scanner state
  notifyRenderer('scanner:frequencyChange', {
    frequency: frequencyHz,
    channel: scannerState.currentFrequency?.Channel ?? null,
    index: getCurrentIndex(),
    total: scannerState.frequencies.length,
    hasReceivedActiveSignal: scannerState.hasReceivedActiveSignal,
  });
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
 * Can be used during scanning or manually when not scanning
 */
async function moveToNextFrequency(): Promise<{success: boolean; error?: string}> {
  try {
    // Must have frequencies loaded
    if (scannerState.frequencies.length === 0) {
      return {success: false, error: 'No frequencies loaded'};
    }

    // Move to next frequency (wrap around)
    const currentIndex = getCurrentIndex();
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % scannerState.frequencies.length;
    const nextFreq = scannerState.frequencies[nextIndex];

    // Reset state for new frequency
    scannerState.currentFrequency = nextFreq;
    scannerState.hasReceivedActiveSignal = false;
    scannerState.waitingForUnsquelch = false;

    await setFrequency(nextFreq.FrequencyHz);

    return {success: true};
  } catch (error) {
    console.error('Failed to move to next frequency:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
        index: getCurrentIndex(),
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

      // Wait for configured time to see if it becomes unsquelched again
      unsquelchTimer = setTimeout(() => {
        // After wait time, if still squelched, move to next frequency
        if (scannerState.isScanning && scannerState.waitingForUnsquelch) {
          moveToNextFrequency();
        }
      }, getUnsquelchWaitTime());
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
  // Save previous state for rollback on error
  const previousFrequency = scannerState.currentFrequency;

  try {
    // Update scanner state to track this frequency BEFORE calling setFrequency
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

    // Set the radio frequency (will also notify renderer)
    await setFrequency(frequencyHz);

    return {success: true};
  } catch (error) {
    // Rollback scanner state on error
    scannerState.currentFrequency = previousFrequency;

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
    currentIndex: getCurrentIndex(),
    totalFrequencies: scannerState.frequencies.length,
  };
}

/**
 * Find frequency by channel number in the current profile
 * Returns null if not found or no profile loaded
 */
function findFrequencyByChannel(
  channel: number,
): {success: boolean; frequencyHz?: number; error?: string} {
  if (scannerState.frequencies.length === 0) {
    return {success: false, error: 'No profile loaded'};
  }

  const frequency = scannerState.frequencies.find(f => f.Channel === channel);

  if (!frequency) {
    return {success: false, error: 'Channel not found in profile'};
  }

  return {success: true, frequencyHz: frequency.FrequencyHz};
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

  // Move to next frequency (manual or during scan)
  ipcMain.handle('scanner:moveToNext', async () => {
    return moveToNextFrequency();
  });

  // Set frequency manually
  ipcMain.handle('scanner:setFrequency', async (_, frequencyHz: number) => {
    return setFrequencyManually(frequencyHz);
  });

  // Get scanner status
  ipcMain.handle('scanner:getStatus', async () => {
    return getScannerStatus();
  });

  // Find frequency by channel number
  ipcMain.handle('scanner:findFrequencyByChannel', async (_, channel: number) => {
    return findFrequencyByChannel(channel);
  });
}

// Helper to get the main window
function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}
