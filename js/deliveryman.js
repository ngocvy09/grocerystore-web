'use strict';

const me = requireRole('DELIVERYMAN');
let orders = [];
let selectedId = null;      // the order the deliveryman clicked

async function init() {
  if (!me) return;
$('#who').innerHTML = icon('user') + esc(me.name);  $('#logout').onclick = logout;
  await reload();
}

async function reload() {
  // orders nobody has taken yet (Pending) + the orders this deliveryman is delivering or has delivered
  orders = await DAO.OrderDAO.findForDeliveryman(me.id);
  renderRows();
  renderDetails();
}

// ---------- the table on the left ----------
function renderRows() {
  $('#rows').innerHTML = orders.length ? orders.map(o => {
    const cls = o.status === 'DELIVERED' ? 'row-done' : o.status === 'BEING_DELIVERED' ? 'row-active' : '';
    return '<tr class="clickable ' + cls + (o.id === selectedId ? ' selected' : '') + '" data-id="' + o.id + '">' +
      '<td><b>' + esc(orderCode(o.id)) + '</b></td>' +
      '<td>' + esc(o.customerName) + '</td>' +
      '<td>' + esc(o.address) + '</td>' +
      '<td>' + statusBadge(o.status) + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="empty">No orders assigned.</td></tr>';

  $$('#rows tr[data-id]').forEach(tr => tr.onclick = () => {
    selectedId = Number(tr.dataset.id);
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
  // what is the next status? PENDING -> BEING_DELIVERED -> DELIVERED
  const next = o.status === 'PENDING' ? 'BEING_DELIVERED' : o.status === 'BEING_DELIVERED' ? 'DELIVERED' : null;
  const label = next === 'BEING_DELIVERED' ? 'Start delivery' : 'Mark as Delivered';

  box.innerHTML =
    '<div class="section-title">Order ' + esc(orderCode(o.id)) + '</div>' +
    '<ul class="detail-list">' +
      '<li><b>Customer:</b> ' + esc(o.customerName) + '</li>' +
      '<li><b>Address:</b> ' + esc(o.address) + '</li>' +
      '<li><b>Items:</b> ' + o.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ') + '</li>' +
      '<li><b>Total:</b> ' + money(o.total) + '</li>' +
      '<li><b>Status:</b> ' + statusBadge(o.status) + '</li>' +
    '</ul>' +
    (next ? '<button class="btn primary block" id="advance">' + label + '</button>'
          : '<div class="success-text">' + icon('check') + 'This order has been delivered.</div>');

  const btn = $('#advance');
  if (btn) btn.onclick = async () => {
    const ok = await confirmDialog(label + ' for order ' + orderCode(o.id) + '?', 'Please confirm', label);
    if (!ok) return;
    try {
      await DAO.OrderDAO.updateStatus(o.id, next, me.id);
      toast('Order ' + orderCode(o.id) + ' is now "' + statusLabel(next) + '".', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    await reload();
  };
}

init();