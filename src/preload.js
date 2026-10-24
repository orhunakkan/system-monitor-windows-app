'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sysmon', {
  platform: process.platform,
  sample: () => ipcRenderer.invoke('stats:sample'),
  settings: () => ipcRenderer.invoke('settings:all'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  onSettings: (fn) => ipcRenderer.on('settings:changed', (_e, s) => fn(s)),
  windowAction: (action) => ipcRenderer.send('window:action', action),
  windowState: () => ipcRenderer.invoke('window:state'),
  onWindowState: (fn) => ipcRenderer.on('window:state', (_e, s) => fn(s)),
  openDialog: (name) => ipcRenderer.send('app:open-dialog', name),
  openUrl: (url) => ipcRenderer.send('app:open-url', url),
  quit: () => ipcRenderer.send('app:quit')
});
