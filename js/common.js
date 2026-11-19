/* common.js - small helpers shared by all pages */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

// make text safe to put inside HTML
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// prices in the database are DECIMAL(10,2). Change 'USD' here to change the currency everywhere.
const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = n => moneyFormat.format(n);

// order ids are numbers in the database; show them like CA000001
const orderCode = id => 'CA' + String(id).padStart(6, '0');

// ---------- session (who is logged in) ----------
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('session')); } catch (e) { return null; }
}
function setSession(user) { sessionStorage.setItem('session', JSON.stringify(user)); }
// role is 'CUSTOMER', 'MANAGER' or 'DELIVERYMAN'
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

// ---------- order status (database values -> words and colours) ----------
const STATUS_FLOW = ['PENDING', 'BEING_DELIVERED', 'DELIVERED'];
const STATUS_LABEL = { PENDING: 'Pending', BEING_DELIVERED: 'Being Delivered', DELIVERED: 'Delivered' };
const statusLabel = s => STATUS_LABEL[s] || s;

function statusBadge(status) {
  const cls = status === 'DELIVERED' ? 'done' : status === 'BEING_DELIVERED' ? 'active' : 'pending';
  return '<span class="badge ' + cls + '">' + esc(statusLabel(status)) + '</span>';
}
function steps(status) {
  const current = STATUS_FLOW.indexOf(status);
  return '<div class="steps">' + STATUS_FLOW.map((s, i) =>
    '<span class="step' + (i <= current ? ' reached' : '') + '">' + (i <= current ? '● ' : '○ ') + statusLabel(s) + '</span>'
  ).join('<span class="step-arrow">›</span>') + '</div>';
}

// ---------- dates and stock ----------
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
// days from today until a date. A product that never expires (null) gives Infinity.
function daysUntil(isoDate) {
  if (!isoDate) return Infinity;
  const a = new Date(today() + 'T00:00:00'), b = new Date(isoDate + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
// 'expired' | 'low' | 'soon' | 'ok'  (used by the manager's Stock tab)
function stockState(p) {
  const d = daysUntil(p.expirationDate);
  if (d < 0) return 'expired';
  if (p.quantity <= p.lowStockThreshold) return 'low';
  if (d <= 7) return 'soon';
  return 'ok';
}