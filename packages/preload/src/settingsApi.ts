import {ipcRenderer} from 'electron';

/**
 * Settings API - Exposed to renderer via preload
 *
 * Provides access to application settings
 */

export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';

export interface AppSettings {
  unsquelchWaitTime: number; // milliseconds
  recordingTimeout: number; // milliseconds
  minimumRecordingDuration: number; // milliseconds
  transcriptionModel: WhisperModel;
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

export const settingsApi: SettingsApi = {
  getAll: () => ipcRenderer.invoke('settings:getAll'),
  get: (key) => ipcRenderer.invoke('settings:get', key),
  update: (settings) => ipcRenderer.invoke('settings:update', settings),
  reset: () => ipcRenderer.invoke('settings:reset'),
};
