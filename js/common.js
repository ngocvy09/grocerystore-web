/* common.js - small helpers shared by all pages */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

// make text safe to put inside HTML
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const money = n => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';

// ---------- session (who is logged in) ----------
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('session')); } catch (e) { return null; }
}
function setSession(user) { sessionStorage.setItem('session', JSON.stringify(user)); }
// if the wrong person (or nobody) is logged in, send them back to the login page
function requireRole(role) {
  const s = getSession();
  if (!s || s.role !== role) { location.href = 'index.html'; return null; }
  return s;
}
function logout() { sessionStorage.removeItem('session'); location.href = 'index.html'; }

// ---------- toast (small message that disappears) ----------
function toast(message, type) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ---------- modal dialogs ----------
function openModal(content, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const card = document.createElement('div');
  card.className = 'modal';
  card.appendChild(content);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  function close(value) {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (onClose) onClose(value);
  }
  function onKey(e) { if (e.key === 'Escape') close(null); }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(null); });
  return { close, card };
}
function dialog({ title, message, buttons }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<h3>' + esc(title) + '</h3><p>' + esc(message) + '</p><div class="modal-actions"></div>';
    let modal;
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.primary ? 'primary' : 'secondary');
      btn.textContent = b.label;
      btn.onclick = () => modal.close(b.value);
      $('.modal-actions', wrap).appendChild(btn);
    });
    modal = openModal(wrap, resolve);
  });
}
const confirmDialog = (message, title, okLabel) => dialog({
  title: title || 'Please confirm', message,
  buttons: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, primary: true }]
}).then(v => v === true);

// ---------- small renderers ----------
function statusBadge(status) {
  const cls = status === 'Delivered' ? 'done' : status === 'Being Delivered' ? 'active' : 'pending';
  return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
}
function steps(status) {
  const list = ['Pending', 'Being Delivered', 'Delivered'];
  const current = list.indexOf(status);
  return '<div class="steps">' + list.map((s, i) =>
    '<span class="step' + (i <= current ? ' reached' : '') + '">' + (i <= current ? '● ' : '○ ') + s + '</span>'
  ).join('<span class="step-arrow">›</span>') + '</div>';
}
// the same category always gets the same colour
function categoryColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return 'hsl(' + h + ' 62% 60%)';
}
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysUntil(isoDate) {
  const a = new Date(today() + 'T00:00:00'), b = new Date(isoDate + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}