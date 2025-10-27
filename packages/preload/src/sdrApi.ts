import {ipcRenderer} from 'electron';

export interface SDRConfig {
  sampleRate?: number;
  bufsPerSec?: number;
}

export interface SDRAudioData {
  left: number[];
  right: number[];
  signalLevel: number;
  squelched: boolean;
}

export interface SDRError {
  message: string;
  stack?: string;
}

export interface SDRStatus {
  isRunning: boolean;
  frequency: number | null;
}

export interface SDRResponse {
  success: boolean;
  error?: string;
}

/**
 * SDR API for controlling the radio from the renderer process
 */
export const sdrApi = {
  /**
   * Start the SDR radio with optional configuration
   */
  start: (config?: SDRConfig): Promise<SDRResponse> => {
    return ipcRenderer.invoke('sdr:start', config);
  },

  /**
   * Stop the SDR radio
   */
  stop: (): Promise<SDRResponse> => {
    return ipcRenderer.invoke('sdr:stop');
  },

  /**
   * Set the frequency to tune to (in Hz)
   * @param frequency - Frequency in Hz (e.g., 162_550_000 for 162.550 MHz)
   */
  setFrequency: (frequency: number): Promise<SDRResponse> => {
    return ipcRenderer.invoke('sdr:setFrequency', frequency);
  },

  /**
   * Get current SDR status
   */
  getStatus: (): Promise<SDRStatus> => {
    return ipcRenderer.invoke('sdr:getStatus');
  },

  /**
   * Register a callback for audio data events
   * @param callback - Called when audio data is available
   * @returns Function to remove the listener
   */
  onAudioData: (callback: (data: SDRAudioData) => void): (() => void) => {
    const listener = (_event: unknown, data: SDRAudioData) => callback(data);
    ipcRenderer.on('sdr:audioData', listener);
    return () => ipcRenderer.removeListener('sdr:audioData', listener);
  },

  /**
   * Register a callback for error events
   * @param callback - Called when an error occurs
   * @returns Function to remove the listener
   */
  onError: (callback: (error: SDRError) => void): (() => void) => {
    const listener = (_event: unknown, error: SDRError) => callback(error);
    ipcRenderer.on('sdr:error', listener);
    return () => ipcRenderer.removeListener('sdr:error', listener);
  },
};
