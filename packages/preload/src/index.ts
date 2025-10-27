import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer} from 'electron';
import {sdrApi} from './sdrApi.js';
import {databaseApi} from './databaseApi.js';
import {scannerApi} from './scannerApi.js';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

export {sha256sum, versions, send, sdrApi, databaseApi, scannerApi};
