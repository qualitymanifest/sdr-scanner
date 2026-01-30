import type {AppModule} from '../AppModule.js';
import {ipcMain} from 'electron';
import fs from 'fs';
import wav from 'wav';
import Speaker from 'speaker';

/**
 * Audio Playback Module
 *
 * Manages playback of recorded WAV files through the system speakers
 */

interface PlaybackState {
  filePath: string | null;
  reader: wav.Reader | null;
  speaker: any; // Speaker instance doesn't have types
  isPlaying: boolean;
}

const state: PlaybackState = {
  filePath: null,
  reader: null,
  speaker: null,
  isPlaying: false,
};

function stopPlayback() {
  if (state.speaker) {
    // Use close() instead of end() for immediate stop
    if (typeof state.speaker.close === 'function') {
      state.speaker.close();
    } else {
      state.speaker.end();
    }
    state.speaker = null;
  }
  if (state.reader) {
    state.reader.unpipe();
    // Destroy the reader to stop reading immediately
    if (typeof state.reader.destroy === 'function') {
      state.reader.destroy();
    }
    state.reader = null;
  }
  state.isPlaying = false;
  state.filePath = null;
}

export function createAudioPlaybackModule(): AppModule {
  return {
    enable() {
      // Play a recording
      ipcMain.handle('audio:play', async (_event, filePath: string) => {
        try {
          // Stop any currently playing audio
          if (state.isPlaying) {
            stopPlayback();
          }

          // Check if file exists
          if (!fs.existsSync(filePath)) {
            return {success: false, error: 'File not found'};
          }

          // Create file stream
          const fileStream = fs.createReadStream(filePath);

          // Create WAV reader
          const reader = new wav.Reader();

          // Pipe the file stream to the WAV reader BEFORE setting up format listener
          fileStream.pipe(reader);

          // Wait for WAV format to be parsed
          await new Promise<void>((resolve, reject) => {
            reader.on('format', (format: wav.Format) => {
              try {
                // Create speaker with the audio format from the WAV file
                const speaker = new Speaker({
                  channels: format.channels,
                  bitDepth: format.bitDepth,
                  sampleRate: format.sampleRate,
                });

                // Handle speaker errors
                speaker.on('error', (err: Error) => {
                  console.error('Speaker error:', err);
                  stopPlayback();
                });

                // Handle playback completion
                speaker.on('close', () => {
                  stopPlayback();
                });

                // Pipe the audio data to the speaker
                reader.pipe(speaker);

                // Update state
                state.filePath = filePath;
                state.reader = reader;
                state.speaker = speaker;
                state.isPlaying = true;

                resolve();
              } catch (err) {
                reject(err);
              }
            });

            reader.on('error', reject);
            fileStream.on('error', reject);
          });

          return {success: true};
        } catch (error) {
          console.error('Failed to play audio:', error);
          stopPlayback();
          return {success: false, error: String(error)};
        }
      });

      // Stop playback
      ipcMain.handle('audio:stop', () => {
        try {
          stopPlayback();
          return {success: true};
        } catch (error) {
          return {success: false, error: String(error)};
        }
      });

      // Get playback status
      ipcMain.handle('audio:getStatus', () => {
        return {
          isPlaying: state.isPlaying,
          filePath: state.filePath,
        };
      });

      // Get currently playing file path
      ipcMain.handle('audio:getCurrentFile', () => {
        return state.filePath;
      });
    },
  };
}
