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

export interface SDRRecordingStatus {
  isRecordingEnabled: boolean;
  isRecording: boolean;
  currentRecordingPath: string | null;
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
  startRecording: () => Promise<SDRResponse>;
  stopRecording: () => Promise<SDRResponse>;
  getRecordingStatus: () => Promise<SDRRecordingStatus>;
}

// Database API types (matching preload/src/databaseApi.ts)
export interface Profile {
  Id: number;
  Name: string;
}

export interface ProfileFrequency {
  Id: number;
  ProfileId: number;
  FrequencyHz: number;
  Channel: number | null;
  Enabled: boolean;
}

export interface ProfileWithFrequencies extends Profile {
  frequencies: ProfileFrequency[];
}

export interface DatabaseResponse {
  success: boolean;
  error?: string;
}

export interface CreateProfileResponse extends DatabaseResponse {
  id?: number;
}

export interface CreateFrequencyResponse extends DatabaseResponse {
  id?: number;
}

export interface DatabaseApi {
  profiles: {
    create: (name: string) => Promise<CreateProfileResponse>;
    getAll: () => Promise<Profile[]>;
    getById: (id: number) => Promise<Profile | undefined>;
    getWithFrequencies: (id: number) => Promise<ProfileWithFrequencies | undefined>;
    update: (id: number, name: string) => Promise<DatabaseResponse>;
    delete: (id: number) => Promise<DatabaseResponse>;
  };
  frequencies: {
    create: (
      profileId: number,
      frequencyHz: number,
      channel?: number | null,
      enabled?: boolean,
    ) => Promise<CreateFrequencyResponse>;
    getByProfileId: (profileId: number) => Promise<ProfileFrequency[]>;
    getEnabledByProfileId: (profileId: number) => Promise<ProfileFrequency[]>;
    update: (
      id: number,
      frequencyHz: number,
      channel: number | null,
      enabled: boolean,
    ) => Promise<DatabaseResponse>;
    updateEnabled: (id: number, enabled: boolean) => Promise<DatabaseResponse>;
    delete: (id: number) => Promise<DatabaseResponse>;
    deleteByProfileId: (profileId: number) => Promise<number>;
  };
}

// Scanner API types (matching preload/src/scannerApi.ts)
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
  hasReceivedActiveSignal: boolean;
}

export interface ScannerApi {
  start: (profileId: number) => Promise<ScannerResponse>;
  stop: () => Promise<ScannerResponse>;
  moveToNext: () => Promise<ScannerResponse>;
  setFrequency: (frequencyHz: number) => Promise<ScannerResponse>;
  getStatus: () => Promise<ScannerStatus>;
  findFrequencyByChannel: (channel: number) => Promise<{success: boolean; frequencyHz?: number; error?: string}>;
  onFrequencyChange: (callback: (data: ScannerFrequencyChange) => void) => () => void;
  onStarted: (callback: (data: {profileId: number; frequency: number; channel: number | null}) => void) => () => void;
  onStopped: (callback: () => void) => () => void;
}

// Export the SDR API
export const sdrApi = getPreloadApi<SDRApi>('sdrApi');

// Export the Database API
export const databaseApi = getPreloadApi<DatabaseApi>('databaseApi');

// Export the Scanner API
export const scannerApi = getPreloadApi<ScannerApi>('scannerApi');

// Settings API types (matching preload/src/settingsApi.ts)
export interface AppSettings {
  unsquelchWaitTime: number; // milliseconds
  recordingTimeout: number; // milliseconds
  minimumRecordingDuration: number; // milliseconds
}

export interface SettingsResponse {
  success: boolean;
  error?: string;
}

export interface SettingsApi {
  getAll: () => Promise<AppSettings>;
  get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>;
  update: (settings: Partial<AppSettings>) => Promise<SettingsResponse>;
  reset: () => Promise<SettingsResponse>;
}

// Export the Settings API
export const settingsApi = getPreloadApi<SettingsApi>('settingsApi');
