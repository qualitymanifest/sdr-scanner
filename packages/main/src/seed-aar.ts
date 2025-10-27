import Database from 'better-sqlite3';
import {app} from 'electron';
import path from 'node:path';

// AAR frequency data from https://kohlin.com/freq/AAR_freqs.htm
const aarFrequencies = [
  {channel: 1, mhz: 159.910},
  {channel: 2, mhz: 159.930},
  {channel: 3, mhz: 160.025},
  {channel: 4, mhz: 160.085},
  {channel: 5, mhz: 160.115},
  {channel: 6, mhz: 160.170},
  {channel: 7, mhz: 160.215},
  {channel: 8, mhz: 160.230},
  {channel: 9, mhz: 160.245},
  {channel: 10, mhz: 160.260},
  {channel: 11, mhz: 160.275},
  {channel: 12, mhz: 160.290},
  {channel: 13, mhz: 160.305},
  {channel: 14, mhz: 160.320},
  {channel: 15, mhz: 160.335},
  {channel: 16, mhz: 160.350},
  {channel: 17, mhz: 160.365},
  {channel: 18, mhz: 160.380},
  {channel: 19, mhz: 160.395},
  {channel: 20, mhz: 160.410},
  {channel: 21, mhz: 160.425},
  {channel: 22, mhz: 160.440},
  {channel: 23, mhz: 160.455},
  {channel: 24, mhz: 160.470},
  {channel: 25, mhz: 160.485},
  {channel: 26, mhz: 160.500},
  {channel: 27, mhz: 160.515},
  {channel: 28, mhz: 160.530},
  {channel: 29, mhz: 160.545},
  {channel: 30, mhz: 160.560},
  {channel: 31, mhz: 160.575},
  {channel: 32, mhz: 160.590},
  {channel: 33, mhz: 160.605},
  {channel: 34, mhz: 160.620},
  {channel: 35, mhz: 160.635},
  {channel: 36, mhz: 160.650},
  {channel: 37, mhz: 160.665},
  {channel: 38, mhz: 160.680},
  {channel: 39, mhz: 160.695},
  {channel: 40, mhz: 160.710},
  {channel: 41, mhz: 160.725},
  {channel: 42, mhz: 160.740},
  {channel: 43, mhz: 160.755},
  {channel: 44, mhz: 160.770},
  {channel: 45, mhz: 160.785},
  {channel: 46, mhz: 160.800},
  {channel: 47, mhz: 160.815},
  {channel: 48, mhz: 160.830},
  {channel: 49, mhz: 160.845},
  {channel: 50, mhz: 160.860},
  {channel: 51, mhz: 160.875},
  {channel: 52, mhz: 160.890},
  {channel: 53, mhz: 160.905},
  {channel: 54, mhz: 160.920},
  {channel: 55, mhz: 160.935},
  {channel: 56, mhz: 160.950},
  {channel: 57, mhz: 160.965},
  {channel: 58, mhz: 160.980},
  {channel: 59, mhz: 160.995},
  {channel: 60, mhz: 161.010},
  {channel: 61, mhz: 161.025},
  {channel: 62, mhz: 161.040},
  {channel: 63, mhz: 161.055},
  {channel: 64, mhz: 161.070},
  {channel: 65, mhz: 161.085},
  {channel: 66, mhz: 161.100},
  {channel: 67, mhz: 161.115},
  {channel: 68, mhz: 161.130},
  {channel: 69, mhz: 161.145},
  {channel: 70, mhz: 161.160},
  {channel: 71, mhz: 161.175},
  {channel: 72, mhz: 161.190},
  {channel: 73, mhz: 161.205},
  {channel: 74, mhz: 161.220},
  {channel: 75, mhz: 161.235},
  {channel: 76, mhz: 161.250},
  {channel: 77, mhz: 161.265},
  {channel: 78, mhz: 161.280},
  {channel: 79, mhz: 161.295},
  {channel: 80, mhz: 161.310},
  {channel: 81, mhz: 161.325},
  {channel: 82, mhz: 161.340},
  {channel: 83, mhz: 161.355},
  {channel: 84, mhz: 161.370},
  {channel: 85, mhz: 161.385},
  {channel: 86, mhz: 161.400},
  {channel: 87, mhz: 161.415},
  {channel: 88, mhz: 161.430},
  {channel: 89, mhz: 161.445},
  {channel: 90, mhz: 161.460},
  {channel: 91, mhz: 161.475},
  {channel: 92, mhz: 161.490},
  {channel: 93, mhz: 161.505},
  {channel: 94, mhz: 161.520},
  {channel: 95, mhz: 161.535},
  {channel: 96, mhz: 161.550},
  {channel: 97, mhz: 161.565},
  {channel: 98, mhz: 161.580},
  {channel: 99, mhz: 161.595},
  {channel: 100, mhz: 161.610},
];

export function seedAARProfile() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'sdr-scanner.db');

  console.log('[Seed] Opening database at:', dbPath);

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  try {
    // Check if AAR profile already exists
    const existingProfile = db
      .prepare('SELECT Id FROM Profiles WHERE Name = ?')
      .get('AAR') as {Id: number} | undefined;

    let profileId: number;

    if (existingProfile) {
      console.log('[Seed] AAR profile already exists with ID:', existingProfile.Id);
      profileId = existingProfile.Id;

      // Clear existing frequencies
      const deleteStmt = db.prepare('DELETE FROM ProfileFrequency WHERE ProfileId = ?');
      const result = deleteStmt.run(profileId);
      console.log('[Seed] Cleared', result.changes, 'existing frequencies');
    } else {
      // Create AAR profile
      const insertProfile = db.prepare('INSERT INTO Profiles (Name) VALUES (?)');
      const result = insertProfile.run('AAR');
      profileId = result.lastInsertRowid as number;
      console.log('[Seed] Created AAR profile with ID:', profileId);
    }

    // Insert all frequencies
    const insertFrequency = db.prepare(
      'INSERT INTO ProfileFrequency (ProfileId, FrequencyHz, Channel, Enabled) VALUES (?, ?, ?, 1)',
    );

    const insertMany = db.transaction((frequencies: typeof aarFrequencies) => {
      for (const freq of frequencies) {
        // Convert MHz to Hz
        const frequencyHz = Math.round(freq.mhz * 1_000_000);
        insertFrequency.run(profileId, frequencyHz, freq.channel);
      }
    });

    insertMany(aarFrequencies);

    console.log(
      `[Seed] Successfully inserted ${aarFrequencies.length} AAR frequencies (channels 1-100)`,
    );
    console.log('[Seed] Frequency range: 159.910 MHz - 161.610 MHz');

    // Verify the insert
    const count = db
      .prepare('SELECT COUNT(*) as count FROM ProfileFrequency WHERE ProfileId = ?')
      .get(profileId) as {count: number};

    console.log('[Seed] Verification: Database contains', count.count, 'frequencies for AAR profile');
  } catch (error) {
    console.error('[Seed] Error seeding AAR profile:', error);
    throw error;
  } finally {
    db.close();
  }
}
