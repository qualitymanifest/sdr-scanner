/**
 * Access preload APIs exposed via contextBridge
 * The preload layer base64-encodes the exported names
 */

function getPreloadApi<T>(name: string): T {
  const encodedName = btoa(name);
  const api = (window as any)[encodedName];
  if (!api) {
    throw new Error(`Preload API "${name}" not found`);
  }
  return api as T;
}

// Import types from preload (if available)
// For now, we'll define the types inline based on the sdrApi module

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

export interface SDRApi {
  start: (config?: SDRConfig) => Promise<SDRResponse>;
  stop: () => Promise<SDRResponse>;
  setFrequency: (frequency: number) => Promise<SDRResponse>;
  getStatus: () => Promise<SDRStatus>;
  onAudioData: (callback: (data: SDRAudioData) => void) => () => void;
  onError: (callback: (error: SDRError) => void) => () => void;
}

// Export the SDR API
export const sdrApi = getPreloadApi<SDRApi>('sdrApi');
