// Element-to-Source Picker for Vite + React dev builds
// =====================================================
// Paste into any dev-mode React app's console (or run via chrome_runtime_eval).
// Hover any element → cyan outline + "<Component>  file.tsx:line" tooltip.
// Click → captures the source location into window.__pickerResult.
//
// Requires: Vite/Webpack dev build with @babel/plugin-transform-react-jsx-source
//           (default in CRA, Vite, Next dev mode — adds fiber._debugSource).
//
// Reads:
//   window.__pickerResult = { tag, text, source: { fileName, lineNumber, componentType } }
//   window.__pickerDone   = true once clicked

(() => {
  // Clean previous instance
  document.querySelectorAll('[data-picker]').forEach(e => e.remove());
  window.__pickerResult = null;
  window.__pickerDone = false;

  const findFiber = el => {
    const k = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    return k ? el[k] : null;
  };

  // Walk up the fiber chain until we find a node with _debugSource.
  // Returns { fileName, lineNumber, columnNumber, componentType }.
  const findSource = fiber => {
    let f = fiber, depth = 0;
    while (f && depth < 30) {
      if (f._debugSource) {
        const t = typeof f.type === 'string'
          ? f.type
          : (f.type?.displayName || f.type?.name || '?');
        return { ...f._debugSource, componentType: t };
      }
      f = f.return;
      depth++;
    }
    return null;
  };

  // Full chain (useful for understanding component hierarchy).
  const findSourceChain = fiber => {
    const chain = [];
    let f = fiber, depth = 0;
    while (f && depth < 30) {
      if (f._debugSource) {
        const t = typeof f.type === 'string'
          ? f.type
          : (f.type?.displayName || f.type?.name || '?');
        chain.push({
          type: t,
          file: f._debugSource.fileName.split(/[\\/]/).pop(),
          line: f._debugSource.lineNumber,
        });
      }
      f = f.return;
      depth++;
    }
    return chain;
  };

  // Outline overlay
  const overlay = document.createElement('div');
  overlay.dataset.picker = '1';
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: '2px solid #00e5ff',
    background: 'rgba(0,229,255,0.18)',
    zIndex: 2147483647,
    transition: 'all 60ms',
    display: 'none',
    boxShadow: '0 0 12px rgba(0,229,255,0.6)',
  });
  document.body.appendChild(overlay);

  // Floating filename:line tooltip
  const tip = document.createElement('div');
  tip.dataset.picker = '1';
  Object.assign(tip.style, {
    position: 'fixed',
    pointerEvents: 'none',
    background: '#0a0a0a',
    color: '#00e5ff',
    padding: '6px 10px',
    font: '600 12px ui-monospace, SFMono-Regular, monospace',
    zIndex: 2147483647,
    borderRadius: '6px',
    display: 'none',
    border: '1px solid #00e5ff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  });
  document.body.appendChild(tip);

  // Top banner
  const banner = document.createElement('div');
  banner.dataset.picker = '1';
  banner.textContent = '🎯 PICKER ACTIVE — hover & click any element';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#00e5ff',
    color: '#000',
    padding: '8px 16px',
    font: '600 13px ui-sans-serif, system-ui',
    zIndex: 2147483647,
    borderRadius: '999px',
    boxShadow: '0 4px 20px rgba(0,229,255,0.5)',
  });
  document.body.appendChild(banner);

  const move = e => {
    const el = e.target;
    if (el.dataset?.picker) return;
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block',
      left: r.x + 'px',
      top: r.y + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    });
    const f = findFiber(el);
    const s = f ? findSource(f) : null;
    tip.textContent = s
      ? `<${s.componentType}>  ${s.fileName.split(/[\\/]/).pop()}:${s.lineNumber}`
      : '(no source — not a dev build?)';
    Object.assign(tip.style, {
      display: 'block',
      left: r.x + 'px',
      top: Math.max(4, r.y - 30) + 'px',
    });
  };

  const click = e => {
    const el = e.target;
    if (el.dataset?.picker) return;
    e.preventDefault();
    e.stopPropagation();
    const f = findFiber(el);
    const s = f ? findSource(f) : null;
    const chain = f ? findSourceChain(f) : [];
    window.__pickerResult = {
      tag: el.tagName,
      text: (el.textContent || '').slice(0, 120),
      classes: (el.className && el.className.toString) ? el.className.toString() : '',
      source: s,
      chain,
    };
    window.__pickerDone = true;
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    [overlay, tip, banner].forEach(n => n.remove());
    console.log('[picker]', window.__pickerResult);
  };

  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);

  return 'picker installed — click any element on the page';
})();
