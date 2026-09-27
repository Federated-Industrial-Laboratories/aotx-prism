// SPDX-License-Identifier: Apache-2.0
// Expose typed desktop commands without a generic renderer IPC bridge.
import { contextBridge, ipcRenderer } from 'electron';
import type { Command, State } from '../shared/types.js';
contextBridge.exposeInMainWorld('prism', {
  command: (command: Command) => ipcRenderer.invoke('prism:command', command),
  subscribe: (listener: (state: State) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, state: State) => listener(state);
    ipcRenderer.on('prism:state', receive);
    return () => ipcRenderer.removeListener('prism:state', receive);
  },
});
