'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal API surface for the region-select overlay.
// Exposes ONLY the two IPC channels the overlay actually needs, so even if an
// attacker can write to screenshot-overlay.html they cannot reach the broader
// IPC bus or Node primitives.
contextBridge.exposeInMainWorld('screenshotOverlay', {
  cancel: ()      => ipcRenderer.send('screenshot-overlay:cancel'),
  select: (rect)  => ipcRenderer.send('screenshot-overlay:select', rect),
});
