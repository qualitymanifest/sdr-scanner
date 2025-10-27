import {ipcRenderer} from 'electron';

export interface ScannerStatus {
  isScanning: boolean;
  profileId: number | null;
  currentFrequency: {
    frequencyHz: number;
    channel: number | null;
  } | null;
  currentIndex: number;
  totalFrequencies: number;
}

export interface ScannerResponse {
  success: boolean;
  error?: string;
}

export interface ScannerFrequencyChange {
  frequency: number;
  channel: number | null;
  index: number;
  total: number;
}

/**
 * Scanner API for controlling frequency scanning from the renderer process
 */
export const scannerApi = {
  /**
   * Start scanning with a profile
   * @param profileId - The ID of the profile to scan
   */
  start: (profileId: number): Promise<ScannerResponse> => {
    return ipcRenderer.invoke('scanner:start', profileId);
  },

  /**
   * Stop scanning (hold on current frequency)
   */
  stop: (): Promise<ScannerResponse> => {
    return ipcRenderer.invoke('scanner:stop');
  },

  /**
   * Get current scanner status
   */
  getStatus: (): Promise<ScannerStatus> => {
    return ipcRenderer.invoke('scanner:getStatus');
  },

  /**
   * Register a callback for scanner frequency change events
   * @param callback - Called when the scanner changes frequency
   * @returns Function to remove the listener
   */
  onFrequencyChange: (callback: (data: ScannerFrequencyChange) => void): (() => void) => {
    const listener = (_event: unknown, data: ScannerFrequencyChange) => callback(data);
    ipcRenderer.on('scanner:frequencyChange', listener);
    return () => ipcRenderer.removeListener('scanner:frequencyChange', listener);
  },

  /**
   * Register a callback for scanner started events
   * @param callback - Called when scanning starts
   * @returns Function to remove the listener
   */
  onStarted: (callback: (data: {profileId: number; frequency: number; channel: number | null}) => void): (() => void) => {
    const listener = (_event: unknown, data: {profileId: number; frequency: number; channel: number | null}) => callback(data);
    ipcRenderer.on('scanner:started', listener);
    return () => ipcRenderer.removeListener('scanner:started', listener);
  },

  /**
   * Register a callback for scanner stopped events
   * @param callback - Called when scanning stops
   * @returns Function to remove the listener
   */
  onStopped: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('scanner:stopped', listener);
    return () => ipcRenderer.removeListener('scanner:stopped', listener);
  },
};
