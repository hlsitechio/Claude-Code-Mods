// Captures unhandled renderer errors for debugging via the console / window.__errs.
// Loaded BEFORE any other script in index.html so it catches early init errors.
window.__errs = [];
window.addEventListener('error', e => {
  window.__errs.push({
    msg:  e.message,
    src:  e.filename,
    line: e.lineno,
    col:  e.colno,
  });
});
