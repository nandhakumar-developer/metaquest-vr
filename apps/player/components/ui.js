/** Small DOM/formatting helpers shared by the Quest player modules. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '--';
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

let toastTimer = null;
export function showToast(message, tone = 'info', duration = 4200) {
  const host = $('#toasts');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast toast--${tone}`;
  node.textContent = message;
  host.appendChild(node);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.classList.add('toast--leaving');
    window.setTimeout(() => node.remove(), 220);
  }, duration);
}

export function setConnection(state, label) {
  const pill = $('#connection-pill');
  if (!pill) return;
  pill.dataset.state = state;
  const text = $('#connection-label');
  if (text) text.textContent = label;
}
