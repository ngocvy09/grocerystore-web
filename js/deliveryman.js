'use strict';

const me = requireRole('Deliveryman');
let orders = [];
let selectedId = null;      // the order the deliveryman clicked

async function init() {
  if (!me) return;
  $('#who').textContent = '👤 ' + me.name;
  $('#logout').onclick = logout;
  await reload();
}

async function reload() {
  orders = await DAO.OrderDAO.findAll();
  renderRows();
  renderDetails();
}

// ---------- the table on the left ----------
function renderRows() {
  $('#rows').innerHTML = orders.length ? orders.map(o => {
    const cls = o.status === 'Delivered' ? 'row-done' : o.status === 'Being Delivered' ? 'row-active' : '';
    return '<tr class="clickable ' + cls + (o.id === selectedId ? ' selected' : '') + '" data-id="' + esc(o.id) + '">' +
      '<td><b>' + esc(o.id) + '</b></td>' +
      '<td>' + esc(o.customerName) + '</td>' +
      '<td>' + esc(o.address) + '</td>' +
      '<td>' + statusBadge(o.status) + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="empty">No orders assigned.</td></tr>';

  $$('#rows tr[data-id]').forEach(tr => tr.onclick = () => {
    selectedId = tr.dataset.id;
    renderRows();
    renderDetails();
  });
}

// ---------- the details card on the right ----------
function renderDetails() {
  const o = orders.find(x => x.id === selectedId);
  const box = $('#details');
  if (!o) {
    box.innerHTML = '<div class="section-title">Order details</div><div class="muted">Select an order to see its details.</div>';
    return;
  }
  // what is the next status? Pending -> Being Delivered -> Delivered
  const next = o.status === 'Pending' ? 'Being Delivered' : o.status === 'Being Delivered' ? 'Delivered' : null;
  const label = next === 'Being Delivered' ? 'Start delivery' : 'Mark as Delivered';

  box.innerHTML =
    '<div class="section-title">Order ' + esc(o.id) + '</div>' +
    '<ul class="detail-list">' +
      '<li><b>Customer:</b> ' + esc(o.customerName) + '</li>' +
      '<li><b>Address:</b> ' + esc(o.address) + '</li>' +
      '<li><b>Items:</b> ' + o.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ') + '</li>' +
      '<li><b>Total:</b> ' + money(o.total) + '</li>' +
      '<li><b>Status:</b> ' + statusBadge(o.status) + '</li>' +
    '</ul>' +
    (next ? '<button class="btn primary block" id="advance">' + label + '</button>'
          : '<div class="success-text">✔ This order has been delivered.</div>');

  const btn = $('#advance');
  if (btn) btn.onclick = async () => {
    const ok = await confirmDialog(label + ' for order ' + o.id + '?', 'Please confirm', label);
    if (!ok) return;
    try {
      await DAO.OrderDAO.updateStatus(o.id, next);
      toast('Order ' + o.id + ' is now "' + next + '".', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    await reload();
  };
}

init();