/**
 * toast.js — lightweight notification system
 *
 * Usage:
 *   window.showToast('Saved', 'success')
 *   window.showToast('IPC error: ' + e.message, 'error')
 *   window.showToast('No project loaded', 'warning')
 *   window.showToast('Tip: use /help', 'info')
 *
 * Types: 'info' | 'success' | 'warning' | 'error'
 * Duration: milliseconds (default 4000)
 */

(function () {
  'use strict';

  let _stack = null;

  function _getStack() {
    if (_stack) return _stack;
    _stack = document.createElement('div');
    _stack.className = 'toast-stack';
    document.body.appendChild(_stack);
    return _stack;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} [type='info']
   * @param {number} [duration=4000]  ms before auto-dismiss (0 = sticky)
   */
  window.showToast = function showToast(message, type = 'info', duration = 4000) {
    const stack = _getStack();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icon = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' }[type] || 'ℹ';
    toast.innerHTML = `
      <span class="toast__icon">${icon}</span>
      <span class="toast__msg">${_escape(String(message))}</span>
      <button class="toast__close" aria-label="Dismiss">×</button>
    `;

    // Dismiss on close button
    toast.querySelector('.toast__close').addEventListener('click', () => _dismiss(toast));

    // Dismiss on click anywhere on toast
    toast.addEventListener('click', (e) => {
      if (!e.target.classList.contains('toast__close')) _dismiss(toast);
    });

    stack.appendChild(toast);

    // Trigger enter animation next frame
    requestAnimationFrame(() => toast.classList.add('toast--visible'));

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => _dismiss(toast), duration);
    }

    return toast;
  };

  function _dismiss(toast) {
    if (!toast || toast._dismissing) return;
    toast._dismissing = true;
    toast.classList.remove('toast--visible');
    toast.classList.add('toast--leaving');
    setTimeout(() => { try { toast.remove(); } catch {} }, 280);
  }

  function _escape(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
