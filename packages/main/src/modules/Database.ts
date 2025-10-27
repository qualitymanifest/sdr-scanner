import Database from 'better-sqlite3';
import {app, ipcMain} from 'electron';
import path from 'node:path';
import type {AppModule} from '../AppModule.js';

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

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

function initializeSchema(database: Database.Database) {
  // Create Profiles table
  database.exec(`
    CREATE TABLE IF NOT EXISTS Profiles (
      Id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      Name TEXT NOT NULL CHECK(length(Name) <= 100)
    )
  `);

  // Create ProfileFrequency table
  database.exec(`
    CREATE TABLE IF NOT EXISTS ProfileFrequency (
      Id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      ProfileId INTEGER NOT NULL,
      FrequencyHz INTEGER NOT NULL,
      Channel INTEGER,
      Enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (ProfileId) REFERENCES Profiles(Id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better query performance
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_profile_frequency_profile_id
    ON ProfileFrequency(ProfileId)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_profile_frequency_enabled
    ON ProfileFrequency(Enabled)
  `);
}

function setupIPCHandlers() {
  // Profile IPC handlers
  ipcMain.handle('db:profile:create', async (_, name: string) => {
    try {
      const id = profileRepository.create(name);
      return {success: true, id};
    } catch (error) {
      console.error('Failed to create profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('db:profile:getAll', async () => {
    try {
      return profileRepository.getAll();
    } catch (error) {
      console.error('Failed to get profiles:', error);
      return [];
    }
  });

  ipcMain.handle('db:profile:getById', async (_, id: number) => {
    try {
      return profileRepository.getById(id);
    } catch (error) {
      console.error('Failed to get profile:', error);
      return undefined;
    }
  });

  ipcMain.handle('db:profile:getWithFrequencies', async (_, id: number) => {
    try {
      return profileRepository.getWithFrequencies(id);
    } catch (error) {
      console.error('Failed to get profile with frequencies:', error);
      return undefined;
    }
  });

  ipcMain.handle('db:profile:update', async (_, id: number, name: string) => {
    try {
      const success = profileRepository.update(id, name);
      return {success};
    } catch (error) {
      console.error('Failed to update profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('db:profile:delete', async (_, id: number) => {
    try {
      const success = profileRepository.delete(id);
      return {success};
    } catch (error) {
      console.error('Failed to delete profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Frequency IPC handlers
  ipcMain.handle('db:frequency:create', async (_, profileId: number, frequencyHz: number, channel: number | null, enabled: boolean) => {
    try {
      const id = profileFrequencyRepository.create(profileId, frequencyHz, channel, enabled);
      return {success: true, id};
    } catch (error) {
      console.error('Failed to create frequency:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('db:frequency:getByProfileId', async (_, profileId: number) => {
    try {
      return profileFrequencyRepository.getByProfileId(profileId);
    } catch (error) {
      console.error('Failed to get frequencies:', error);
      return [];
    }
  });

  ipcMain.handle('db:frequency:getEnabledByProfileId', async (_, profileId: number) => {
    try {
      return profileFrequencyRepository.getEnabledByProfileId(profileId);
    } catch (error) {
      console.error('Failed to get enabled frequencies:', error);
      return [];
    }
  });

  ipcMain.handle('db:frequency:update', async (_, id: number, frequencyHz: number, channel: number | null, enabled: boolean) => {
    try {
      const success = profileFrequencyRepository.update(id, frequencyHz, channel, enabled);
      return {success};
    } catch (error) {
      console.error('Failed to update frequency:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('db:frequency:updateEnabled', async (_, id: number, enabled: boolean) => {
    try {
      const success = profileFrequencyRepository.updateEnabled(id, enabled);
      return {success};
    } catch (error) {
      console.error('Failed to update frequency enabled status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('db:frequency:delete', async (_, id: number) => {
    try {
      const success = profileFrequencyRepository.delete(id);
      return {success};
    } catch (error) {
      console.error('Failed to delete frequency:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('db:frequency:deleteByProfileId', async (_, profileId: number) => {
    try {
      return profileFrequencyRepository.deleteByProfileId(profileId);
    } catch (error) {
      console.error('Failed to delete frequencies by profile:', error);
      return 0;
    }
  });
}

export function createDatabaseModule(): AppModule {
  return {
    enable() {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'sdr-scanner.db');

      console.log('[Database] Initializing database at:', dbPath);

      db = new Database(dbPath);

      // Enable foreign keys
      db.pragma('foreign_keys = ON');

      // Initialize schema
      initializeSchema(db);

      console.log('[Database] Database initialized successfully');

      // Setup IPC handlers
      setupIPCHandlers();
    },
  };
}

// Database operations
export const profileRepository = {
  create(name: string): number {
    const db = getDatabase();
    const stmt = db.prepare('INSERT INTO Profiles (Name) VALUES (?)');
    const result = stmt.run(name);
    return result.lastInsertRowid as number;
  },

  getAll(): Profile[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT Id, Name FROM Profiles ORDER BY Name');
    return stmt.all() as Profile[];
  },

  getById(id: number): Profile | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT Id, Name FROM Profiles WHERE Id = ?');
    return stmt.get(id) as Profile | undefined;
  },

  update(id: number, name: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE Profiles SET Name = ? WHERE Id = ?');
    const result = stmt.run(name, id);
    return result.changes > 0;
  },

  delete(id: number): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM Profiles WHERE Id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  getWithFrequencies(id: number): ProfileWithFrequencies | undefined {
    const profile = this.getById(id);
    if (!profile) return undefined;

    const frequencies = profileFrequencyRepository.getByProfileId(id);
    return {
      ...profile,
      frequencies,
    };
  },
};

export const profileFrequencyRepository = {
  create(profileId: number, frequencyHz: number, channel: number | null = null, enabled: boolean = true): number {
    const db = getDatabase();
    const stmt = db.prepare(
      'INSERT INTO ProfileFrequency (ProfileId, FrequencyHz, Channel, Enabled) VALUES (?, ?, ?, ?)',
    );
    const result = stmt.run(profileId, frequencyHz, channel, enabled ? 1 : 0);
    return result.lastInsertRowid as number;
  },

  getByProfileId(profileId: number): ProfileFrequency[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT Id, ProfileId, FrequencyHz, Channel, Enabled
      FROM ProfileFrequency
      WHERE ProfileId = ?
      ORDER BY FrequencyHz
    `);
    const rows = stmt.all(profileId) as Array<Omit<ProfileFrequency, 'Enabled'> & {Enabled: number}>;
    return rows.map(row => ({
      ...row,
      Enabled: row.Enabled === 1,
    }));
  },

  getEnabledByProfileId(profileId: number): ProfileFrequency[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT Id, ProfileId, FrequencyHz, Channel, Enabled
      FROM ProfileFrequency
      WHERE ProfileId = ? AND Enabled = 1
      ORDER BY FrequencyHz
    `);
    const rows = stmt.all(profileId) as Array<Omit<ProfileFrequency, 'Enabled'> & {Enabled: number}>;
    return rows.map(row => ({
      ...row,
      Enabled: row.Enabled === 1,
    }));
  },

  update(id: number, frequencyHz: number, channel: number | null, enabled: boolean): boolean {
    const db = getDatabase();
    const stmt = db.prepare(
      'UPDATE ProfileFrequency SET FrequencyHz = ?, Channel = ?, Enabled = ? WHERE Id = ?',
    );
    const result = stmt.run(frequencyHz, channel, enabled ? 1 : 0, id);
    return result.changes > 0;
  },

  updateEnabled(id: number, enabled: boolean): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE ProfileFrequency SET Enabled = ? WHERE Id = ?');
    const result = stmt.run(enabled ? 1 : 0, id);
    return result.changes > 0;
  },

  delete(id: number): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM ProfileFrequency WHERE Id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  deleteByProfileId(profileId: number): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM ProfileFrequency WHERE ProfileId = ?');
    const result = stmt.run(profileId);
    return result.changes;
  },
};
