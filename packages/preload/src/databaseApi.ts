import {ipcRenderer} from 'electron';

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

export interface Recording {
  Id: number;
  Frequency: number; // in Hz
  Datetime: string; // ISO 8601 format
  FilePath: string;
  TranscriptionText: string | null;
  TranscriptionStatus: 'pending' | 'processing' | 'success' | 'failed';
}

/**
 * Database API for managing profiles and frequencies from the renderer process
 */
export const databaseApi = {
  // Profile operations
  profiles: {
    /**
     * Create a new profile
     * @param name - Profile name (max 100 characters)
     * @returns Promise with the new profile ID
     */
    create: (name: string): Promise<CreateProfileResponse> => {
      return ipcRenderer.invoke('db:profile:create', name);
    },

    /**
     * Get all profiles
     * @returns Promise with array of profiles
     */
    getAll: (): Promise<Profile[]> => {
      return ipcRenderer.invoke('db:profile:getAll');
    },

    /**
     * Get a profile by ID
     * @param id - Profile ID
     * @returns Promise with the profile or undefined
     */
    getById: (id: number): Promise<Profile | undefined> => {
      return ipcRenderer.invoke('db:profile:getById', id);
    },

    /**
     * Get a profile with all its frequencies
     * @param id - Profile ID
     * @returns Promise with the profile and frequencies or undefined
     */
    getWithFrequencies: (id: number): Promise<ProfileWithFrequencies | undefined> => {
      return ipcRenderer.invoke('db:profile:getWithFrequencies', id);
    },

    /**
     * Update a profile's name
     * @param id - Profile ID
     * @param name - New profile name
     * @returns Promise with success status
     */
    update: (id: number, name: string): Promise<DatabaseResponse> => {
      return ipcRenderer.invoke('db:profile:update', id, name);
    },

    /**
     * Delete a profile (also deletes all associated frequencies)
     * @param id - Profile ID
     * @returns Promise with success status
     */
    delete: (id: number): Promise<DatabaseResponse> => {
      return ipcRenderer.invoke('db:profile:delete', id);
    },
  },

  // Frequency operations
  frequencies: {
    /**
     * Add a frequency to a profile
     * @param profileId - Profile ID
     * @param frequencyHz - Frequency in Hz
     * @param channel - Optional channel number
     * @param enabled - Whether the frequency is enabled (default: true)
     * @returns Promise with the new frequency ID
     */
    create: (
      profileId: number,
      frequencyHz: number,
      channel: number | null = null,
      enabled: boolean = true,
    ): Promise<CreateFrequencyResponse> => {
      return ipcRenderer.invoke('db:frequency:create', profileId, frequencyHz, channel, enabled);
    },

    /**
     * Get all frequencies for a profile
     * @param profileId - Profile ID
     * @returns Promise with array of frequencies
     */
    getByProfileId: (profileId: number): Promise<ProfileFrequency[]> => {
      return ipcRenderer.invoke('db:frequency:getByProfileId', profileId);
    },

    /**
     * Get only enabled frequencies for a profile
     * @param profileId - Profile ID
     * @returns Promise with array of enabled frequencies
     */
    getEnabledByProfileId: (profileId: number): Promise<ProfileFrequency[]> => {
      return ipcRenderer.invoke('db:frequency:getEnabledByProfileId', profileId);
    },

    /**
     * Update a frequency
     * @param id - Frequency ID
     * @param frequencyHz - New frequency in Hz
     * @param channel - New channel number
     * @param enabled - Whether the frequency is enabled
     * @returns Promise with success status
     */
    update: (
      id: number,
      frequencyHz: number,
      channel: number | null,
      enabled: boolean,
    ): Promise<DatabaseResponse> => {
      return ipcRenderer.invoke('db:frequency:update', id, frequencyHz, channel, enabled);
    },

    /**
     * Update only the enabled status of a frequency
     * @param id - Frequency ID
     * @param enabled - Whether the frequency is enabled
     * @returns Promise with success status
     */
    updateEnabled: (id: number, enabled: boolean): Promise<DatabaseResponse> => {
      return ipcRenderer.invoke('db:frequency:updateEnabled', id, enabled);
    },

    /**
     * Delete a frequency
     * @param id - Frequency ID
     * @returns Promise with success status
     */
    delete: (id: number): Promise<DatabaseResponse> => {
      return ipcRenderer.invoke('db:frequency:delete', id);
    },

    /**
     * Delete all frequencies for a profile
     * @param profileId - Profile ID
     * @returns Promise with number of deleted frequencies
     */
    deleteByProfileId: (profileId: number): Promise<number> => {
      return ipcRenderer.invoke('db:frequency:deleteByProfileId', profileId);
    },
  },

  // Recording operations
  recordings: {
    /**
     * Get all recordings ordered by datetime descending (most recent first)
     * @returns Promise with array of recordings
     */
    getAll: (): Promise<Recording[]> => {
      return ipcRenderer.invoke('db:recording:getAll');
    },

    /**
     * Search recordings by transcription text using full-text search
     * @param searchQuery - Text to search for in transcriptions
     * @returns Promise with array of matching recordings
     */
    search: (searchQuery: string): Promise<Recording[]> => {
      return ipcRenderer.invoke('db:recording:search', searchQuery);
    },

    /**
     * Filter recordings by various criteria
     * @param options - Filter options
     * @returns Promise with array of filtered recordings
     */
    filter: (options: {
      frequencyMin?: number;
      frequencyMax?: number;
      datetimeStart?: string;
      datetimeEnd?: string;
      transcriptionStatus?: Recording['TranscriptionStatus'];
      searchText?: string;
    }): Promise<Recording[]> => {
      return ipcRenderer.invoke('db:recording:filter', options);
    },

    /**
     * Delete a recording by file path
     * @param filePath - Recording file path
     * @returns Promise with success status
     */
    delete: (filePath: string): Promise<DatabaseResponse> => {
      return ipcRenderer.invoke('db:recording:delete', filePath);
    },
  },
};
