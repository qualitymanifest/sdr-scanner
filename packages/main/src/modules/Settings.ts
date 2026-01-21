import type {AppModule} from '../AppModule.js';
import {ipcMain} from 'electron';
import Store from 'electron-store';

/**
 * Settings Module
 *
 * Manages application settings using electron-store for persistence
 */

export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';

export interface AppSettings {
  unsquelchWaitTime: number; // milliseconds
  recordingTimeout: number; // milliseconds
  minimumRecordingDuration: number; // milliseconds
  transcriptionModel: WhisperModel;
}

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  unsquelchWaitTime: 2000, // 2 seconds
  recordingTimeout: 2000, // 2 seconds
  minimumRecordingDuration: 1000, // 1 second
  transcriptionModel: 'base', // Default to base model (good balance)
};

// Create persistent store
const store = new Store<AppSettings>({
  defaults: DEFAULT_SETTINGS,
});

export function createSettingsModule(): AppModule {
  return {
    enable() {
      // Get all settings
      ipcMain.handle('settings:getAll', () => {
        return store.store;
      });

      // Get a specific setting
      ipcMain.handle('settings:get', (_event, key: keyof AppSettings) => {
        return store.get(key);
      });

      // Update settings (partial update)
      ipcMain.handle('settings:update', (_event, settings: Partial<AppSettings>) => {
        try {
          // Validate settings before saving
          if (settings.unsquelchWaitTime !== undefined) {
            if (typeof settings.unsquelchWaitTime !== 'number' || settings.unsquelchWaitTime < 0) {
              return { success: false, error: 'Unsquelch wait time must be a positive number' };
            }
          }
          if (settings.recordingTimeout !== undefined) {
            if (typeof settings.recordingTimeout !== 'number' || settings.recordingTimeout < 0) {
              return { success: false, error: 'Recording timeout must be a positive number' };
            }
          }
          if (settings.minimumRecordingDuration !== undefined) {
            if (typeof settings.minimumRecordingDuration !== 'number' || settings.minimumRecordingDuration < 0) {
              return { success: false, error: 'Minimum recording duration must be a positive number' };
            }
          }
          if (settings.transcriptionModel !== undefined) {
            const validModels: WhisperModel[] = ['tiny', 'base', 'small', 'medium', 'large-v3'];
            if (!validModels.includes(settings.transcriptionModel)) {
              return { success: false, error: 'Invalid transcription model' };
            }
          }

          // Update the store
          for (const [key, value] of Object.entries(settings)) {
            store.set(key as keyof AppSettings, value);
          }

          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      });

      // Reset to defaults
      ipcMain.handle('settings:reset', () => {
        try {
          store.clear();
          return { success: true };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      });
    },
  };
}

// Export getters for use in other modules
export function getUnsquelchWaitTime(): number {
  return store.get('unsquelchWaitTime', DEFAULT_SETTINGS.unsquelchWaitTime);
}

export function getRecordingTimeout(): number {
  return store.get('recordingTimeout', DEFAULT_SETTINGS.recordingTimeout);
}

export function getMinimumRecordingDuration(): number {
  return store.get('minimumRecordingDuration', DEFAULT_SETTINGS.minimumRecordingDuration);
}

export function getTranscriptionModel(): WhisperModel {
  return store.get('transcriptionModel', DEFAULT_SETTINGS.transcriptionModel);
}
