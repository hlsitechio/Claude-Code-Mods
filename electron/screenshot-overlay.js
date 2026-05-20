'use strict';

// Screenshot region-selection overlay logic.
// Uses the limited window.screenshotOverlay API exposed by screenshot-overlay-preload.js.
// No Node integration — even if this file is compromised the worst possible
// outcome is invoking the two whitelisted IPC channels.

const api = window.screenshotOverlay;
const sel = document.getElementById('sel');
let sx = 0, sy = 0, dragging = false;

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') api.cancel();
});

document.addEventListener('mousedown', e => {
  dragging = true;
  sx = e.clientX; sy = e.clientY;
  sel.style.display = 'block';
  sel.style.left   = sx + 'px';
  sel.style.top    = sy + 'px';
  sel.style.width  = '0px';
  sel.style.height = '0px';
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const x = Math.min(e.clientX, sx);
  const y = Math.min(e.clientY, sy);
  const w = Math.abs(e.clientX - sx);
  const h = Math.abs(e.clientY - sy);
  sel.style.left   = x + 'px';
  sel.style.top    = y + 'px';
  sel.style.width  = w + 'px';
  sel.style.height = h + 'px';
  sel.dataset.size = w + ' × ' + h;
});

document.addEventListener('mouseup', e => {
  if (!dragging) return;
  dragging = false;
  const x = Math.min(e.clientX, sx);
  const y = Math.min(e.clientY, sy);
  const w = Math.abs(e.clientX - sx);
  const h = Math.abs(e.clientY - sy);
  if (w < 5 || h < 5) {
    // Too small — reset
    sel.style.display = 'none';
    return;
  }
  // Pass screen-relative coordinates (window is at 0,0 full-screen)
  api.select({ x, y, width: w, height: h });
});
