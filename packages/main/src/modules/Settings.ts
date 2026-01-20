import type {AppModule} from '../AppModule.js';
import {ipcMain} from 'electron';
import Store from 'electron-store';

/**
 * Settings Module
 *
 * Manages application settings using electron-store for persistence
 */

export interface AppSettings {
  unsquelchWaitTime: number; // milliseconds
}

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  unsquelchWaitTime: 2000, // 2 seconds
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

    disable() {
      ipcMain.removeHandler('settings:getAll');
      ipcMain.removeHandler('settings:get');
      ipcMain.removeHandler('settings:update');
      ipcMain.removeHandler('settings:reset');
    },
  };
}

// Export getter for use in other modules
export function getUnsquelchWaitTime(): number {
  return store.get('unsquelchWaitTime', DEFAULT_SETTINGS.unsquelchWaitTime);
}
