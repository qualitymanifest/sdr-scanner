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

export interface Recording {
  Id: number;
  Frequency: number; // in Hz
  Datetime: string; // ISO 8601 format
  FilePath: string;
  TranscriptionText: string | null;
  TranscriptionStatus: 'pending' | 'processing' | 'success' | 'failed';
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

  // Create Recordings table
  database.exec(`
    CREATE TABLE IF NOT EXISTS Recordings (
      Id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      Frequency INTEGER NOT NULL,
      Datetime TEXT NOT NULL,
      FilePath TEXT NOT NULL UNIQUE,
      TranscriptionText TEXT,
      TranscriptionStatus TEXT NOT NULL CHECK(TranscriptionStatus IN ('pending', 'processing', 'success', 'failed'))
    )
  `);

  // Create indexes for recordings
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_recordings_datetime
    ON Recordings(Datetime)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_recordings_frequency
    ON Recordings(Frequency)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_recordings_status
    ON Recordings(TranscriptionStatus)
  `);

  // Create full-text search virtual table for transcription text
  // Using contentless FTS table (simpler and avoids sync issues)
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS Recordings_fts USING fts5(
      TranscriptionText,
      tokenize='porter unicode61'
    )
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

  // Recording IPC handlers
  ipcMain.handle('db:recording:getAll', async () => {
    try {
      return recordingRepository.getAll();
    } catch (error) {
      console.error('Failed to get recordings:', error);
      return [];
    }
  });

  ipcMain.handle('db:recording:search', async (_, searchQuery: string) => {
    try {
      return recordingRepository.search(searchQuery);
    } catch (error) {
      console.error('Failed to search recordings:', error);
      return [];
    }
  });

  ipcMain.handle('db:recording:filter', async (_, options: Parameters<typeof recordingRepository.filter>[0]) => {
    try {
      return recordingRepository.filter(options);
    } catch (error) {
      console.error('Failed to filter recordings:', error);
      return [];
    }
  });

  ipcMain.handle('db:recording:delete', async (_, filePath: string) => {
    try {
      const success = recordingRepository.delete(filePath);
      return {success};
    } catch (error) {
      console.error('Failed to delete recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
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

      // Check if FTS table is corrupted and rebuild if needed
      try {
        // Try a simple query on the FTS table
        db.prepare('SELECT COUNT(*) FROM Recordings_fts').get();
      } catch (error: any) {
        if (error.code === 'SQLITE_CORRUPT_VTAB' || error.message?.includes('malformed')) {
          console.warn('[Database] FTS table corrupted, rebuilding...');
          rebuildRecordingsFTS();
        } else {
          throw error;
        }
      }

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

/**
 * Extract frequency and datetime from filename
 * Format: {freq}_{MM}-{DD}-{YYYY}-{HH}-{mm}-{ss}.wav
 * Example: 161-175_01-20-2025-06-19-45.wav
 */
export function parseRecordingFileName(fileName: string): {frequency: number; datetime: string} {
  // Remove .wav extension
  const nameWithoutExt = fileName.replace(/\.wav$/, '');

  // Split on underscore
  const [freqPart, datePart] = nameWithoutExt.split('_');

  // Parse frequency: convert "161-175" to 161.175 MHz, then to Hz
  const freqMHz = parseFloat(freqPart.replace('-', '.'));
  const frequencyHz = Math.round(freqMHz * 1_000_000);

  // Parse date: MM-DD-YYYY-HH-mm-ss
  const [month, day, year, hour, minute, second] = datePart.split('-');

  // Create ISO 8601 datetime string
  const datetime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

  return {frequency: frequencyHz, datetime};
}

/**
 * Rebuild the FTS table from existing recordings
 * Call this if the FTS table becomes corrupted
 */
export function rebuildRecordingsFTS(): void {
  const db = getDatabase();

  console.log('[Database] Rebuilding Recordings FTS table...');

  // Drop the old FTS table - try multiple approaches
  try {
    db.exec('DROP TABLE IF EXISTS Recordings_fts');
  } catch (error) {
    console.error('[Database] Error dropping FTS table with DROP TABLE:', error);
    // Try alternative approach - drop the shadow tables directly
    try {
      db.exec('DROP TABLE IF EXISTS Recordings_fts_data');
      db.exec('DROP TABLE IF EXISTS Recordings_fts_idx');
      db.exec('DROP TABLE IF EXISTS Recordings_fts_docsize');
      db.exec('DROP TABLE IF EXISTS Recordings_fts_config');
      db.exec('DROP TABLE IF EXISTS Recordings_fts_content');
    } catch (shadowError) {
      console.error('[Database] Error dropping FTS shadow tables:', shadowError);
    }
  }

  // Recreate the FTS table
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS Recordings_fts USING fts5(
        TranscriptionText,
        tokenize='porter unicode61'
      )
    `);
  } catch (error) {
    console.error('[Database] Error creating FTS table:', error);
    throw error;
  }

  // Repopulate from existing recordings
  let recordings: Array<{Id: number; TranscriptionText: string | null}> = [];
  try {
    recordings = db.prepare('SELECT Id, TranscriptionText FROM Recordings').all() as Array<{Id: number; TranscriptionText: string | null}>;
  } catch (error) {
    console.error('[Database] Error fetching recordings:', error);
    throw error;
  }

  const insertStmt = db.prepare('INSERT INTO Recordings_fts(rowid, TranscriptionText) VALUES (?, ?)');

  let successCount = 0;
  for (const recording of recordings) {
    try {
      insertStmt.run(recording.Id, recording.TranscriptionText || '');
      successCount++;
    } catch (error) {
      console.error(`[Database] Error inserting recording ${recording.Id} into FTS:`, error);
    }
  }

  console.log(`[Database] Rebuilt FTS table with ${successCount}/${recordings.length} recordings`);
}

export const recordingRepository = {
  /**
   * Insert a new recording into the database
   */
  create(filePath: string, frequency: number, datetime: string, transcriptionStatus: Recording['TranscriptionStatus'] = 'pending'): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO Recordings (Frequency, Datetime, FilePath, TranscriptionText, TranscriptionStatus)
      VALUES (?, ?, ?, NULL, ?)
    `);
    const result = stmt.run(frequency, datetime, filePath, transcriptionStatus);
    const recordingId = result.lastInsertRowid as number;

    // Insert empty entry into FTS table (will be populated when transcription completes)
    try {
      const ftsStmt = db.prepare(`INSERT INTO Recordings_fts(rowid, TranscriptionText) VALUES (?, ?)`);
      ftsStmt.run(recordingId, '');
    } catch (error: any) {
      // If FTS table is corrupted, rebuild it and retry
      if (error.code === 'SQLITE_CORRUPT_VTAB' || error.message?.includes('malformed')) {
        console.warn('[Database] FTS corruption detected during insert, rebuilding...');
        rebuildRecordingsFTS();

        // Retry the FTS insert
        try {
          const ftsStmt = db.prepare(`INSERT INTO Recordings_fts(rowid, TranscriptionText) VALUES (?, ?)`);
          ftsStmt.run(recordingId, '');
        } catch (retryError) {
          console.error('[Database] Failed to insert into FTS even after rebuild:', retryError);
        }
      } else {
        console.error('[Database] Error inserting into FTS table:', error);
      }
    }

    return recordingId;
  },

  /**
   * Get all recordings, ordered by datetime descending (most recent first)
   */
  getAll(): Recording[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT Id, Frequency, Datetime, FilePath, TranscriptionText, TranscriptionStatus
      FROM Recordings
      ORDER BY Datetime DESC
    `);
    return stmt.all() as Recording[];
  },

  /**
   * Get a single recording by file path
   */
  getByPath(filePath: string): Recording | undefined {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT Id, Frequency, Datetime, FilePath, TranscriptionText, TranscriptionStatus
      FROM Recordings
      WHERE FilePath = ?
    `);
    return stmt.get(filePath) as Recording | undefined;
  },

  /**
   * Update transcription status and optionally text
   */
  updateTranscription(filePath: string, status: Recording['TranscriptionStatus'], text: string | null = null): boolean {
    const db = getDatabase();

    // Get the recording ID first
    const recording = this.getByPath(filePath);
    if (!recording) {
      return false;
    }

    // Update the main table
    const stmt = db.prepare(`
      UPDATE Recordings
      SET TranscriptionStatus = ?, TranscriptionText = ?
      WHERE FilePath = ?
    `);
    const result = stmt.run(status, text, filePath);

    // Update FTS table with error recovery
    if (result.changes > 0) {
      try {
        const ftsStmt = db.prepare(`
          UPDATE Recordings_fts
          SET TranscriptionText = ?
          WHERE rowid = ?
        `);
        ftsStmt.run(text || '', recording.Id);
      } catch (error: any) {
        // If FTS table is corrupted, rebuild it and retry
        if (error.code === 'SQLITE_CORRUPT_VTAB' || error.message?.includes('malformed')) {
          console.warn('[Database] FTS corruption detected during update, rebuilding...');
          rebuildRecordingsFTS();

          // Retry the FTS update
          try {
            const ftsStmt = db.prepare(`
              UPDATE Recordings_fts
              SET TranscriptionText = ?
              WHERE rowid = ?
            `);
            ftsStmt.run(text || '', recording.Id);
          } catch (retryError) {
            console.error('[Database] Failed to update FTS even after rebuild:', retryError);
          }
        } else {
          console.error('[Database] Error updating FTS table:', error);
        }
      }
    }

    return result.changes > 0;
  },

  /**
   * Delete a recording by file path
   */
  delete(filePath: string): boolean {
    const db = getDatabase();

    // Get the recording ID first
    const recording = this.getByPath(filePath);
    if (!recording) {
      return false;
    }

    // Delete from main table
    const stmt = db.prepare('DELETE FROM Recordings WHERE FilePath = ?');
    const result = stmt.run(filePath);

    // Delete from FTS table
    if (result.changes > 0) {
      const ftsStmt = db.prepare('DELETE FROM Recordings_fts WHERE rowid = ?');
      ftsStmt.run(recording.Id);
    }

    return result.changes > 0;
  },

  /**
   * Search recordings by transcription text using full-text search
   */
  search(searchQuery: string): Recording[] {
    const db = getDatabase();

    // Sanitize the search query for FTS5
    // Remove or escape special FTS5 characters: " * ( ) AND OR NOT
    const sanitized = searchQuery
      .replace(/[":*()]/g, ' ') // Replace FTS5 special chars with space
      .trim()
      .split(/\s+/) // Split into words
      .filter(word => word.length > 0) // Remove empty strings
      .map(word => `"${word}"`) // Quote each word to make it a phrase search
      .join(' '); // Join with space (implicit AND)

    // If sanitized query is empty, return empty results
    if (!sanitized) {
      return [];
    }

    const stmt = db.prepare(`
      SELECT r.Id, r.Frequency, r.Datetime, r.FilePath, r.TranscriptionText, r.TranscriptionStatus
      FROM Recordings r
      WHERE r.Id IN (
        SELECT rowid FROM Recordings_fts WHERE Recordings_fts MATCH ?
      )
      ORDER BY r.Datetime DESC
    `);
    return stmt.all(sanitized) as Recording[];
  },

  /**
   * Filter recordings by various criteria
   */
  filter(options: {
    frequencyMin?: number;
    frequencyMax?: number;
    datetimeStart?: string;
    datetimeEnd?: string;
    transcriptionStatus?: Recording['TranscriptionStatus'];
    searchText?: string;
  }): Recording[] {
    const db = getDatabase();
    const conditions: string[] = [];
    const values: any[] = [];

    if (options.frequencyMin !== undefined) {
      conditions.push('r.Frequency >= ?');
      values.push(options.frequencyMin);
    }

    if (options.frequencyMax !== undefined) {
      conditions.push('r.Frequency <= ?');
      values.push(options.frequencyMax);
    }

    if (options.datetimeStart !== undefined) {
      conditions.push('r.Datetime >= ?');
      values.push(options.datetimeStart);
    }

    if (options.datetimeEnd !== undefined) {
      conditions.push('r.Datetime <= ?');
      values.push(options.datetimeEnd);
    }

    if (options.transcriptionStatus !== undefined) {
      conditions.push('r.TranscriptionStatus = ?');
      values.push(options.transcriptionStatus);
    }

    let query: string;
    if (options.searchText) {
      // Sanitize the search text for FTS5
      const sanitized = options.searchText
        .replace(/[":*()]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 0)
        .map(word => `"${word}"`)
        .join(' ');

      // If sanitized query is empty, skip FTS and use regular query
      if (!sanitized) {
        query = `
          SELECT Id, Frequency, Datetime, FilePath, TranscriptionText, TranscriptionStatus
          FROM Recordings r
          ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
          ORDER BY Datetime DESC
        `;
      } else {
        // Use FTS for text search
        query = `
          SELECT r.Id, r.Frequency, r.Datetime, r.FilePath, r.TranscriptionText, r.TranscriptionStatus
          FROM Recordings r
          WHERE r.Id IN (
            SELECT rowid FROM Recordings_fts WHERE Recordings_fts MATCH ?
          )
          ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
          ORDER BY r.Datetime DESC
        `;
        values.unshift(sanitized);
      }
    } else {
      // Regular query
      query = `
        SELECT Id, Frequency, Datetime, FilePath, TranscriptionText, TranscriptionStatus
        FROM Recordings r
        ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
        ORDER BY Datetime DESC
      `;
    }

    const stmt = db.prepare(query);
    return stmt.all(...values) as Recording[];
  },
};
