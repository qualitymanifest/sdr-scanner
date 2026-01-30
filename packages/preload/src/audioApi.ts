import {ipcRenderer} from 'electron';

export interface AudioPlaybackStatus {
  isPlaying: boolean;
  filePath: string | null;
}

export const audioApi = {
  /**
   * Play an audio file
   */
  play: (filePath: string): Promise<{success: boolean; error?: string}> => {
    return ipcRenderer.invoke('audio:play', filePath);
  },

  /**
   * Stop the currently playing audio
   */
  stop: (): Promise<{success: boolean; error?: string}> => {
    return ipcRenderer.invoke('audio:stop');
  },

  /**
   * Get the current playback status
   */
  getStatus: (): Promise<AudioPlaybackStatus> => {
    return ipcRenderer.invoke('audio:getStatus');
  },

  /**
   * Get the currently playing file path
   */
  getCurrentFile: (): Promise<string | null> => {
    return ipcRenderer.invoke('audio:getCurrentFile');
  },
};
