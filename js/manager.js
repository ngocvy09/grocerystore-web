'use strict';

const me = requireRole('MANAGER');
let tab = 'products';
let products = [], categories = [], orders = [];
let reportFrom = '', reportTo = '';       // date range of the sales report ('' = no limit)

function init() {
  if (!me) return;
$('#who').innerHTML = icon('user') + esc(me.name);  $('#logout').onclick = logout;
  $$('#tabs .tab').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  render();
}

// load fresh data, then draw the selected tab
async function render() {
  $$('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  products = await DAO.ProductDAO.findAll();
  categories = await DAO.ProductDAO.findCategories();
  orders = await DAO.OrderDAO.findAll();
  const draw = { products: renderProducts, categories: renderCategories, stock: renderStock,
                 orders: renderOrders, report: renderReport };
  draw[tab]();
}

// =================== TAB 1: PRODUCTS ===================
function renderProducts() {
  $('#content').innerHTML =
    '<div class="section-title">Products</div>' +
    '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th class="num">Price</th><th class="num">Quantity</th><th>Expires</th><th></th></tr></thead><tbody>' +
    (products.map(p =>
      '<tr><td>' + p.id + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.category) + '</td>' +
      '<td class="num">' + money(p.price) + '</td><td class="num">' + p.quantity + '</td>' +
      '<td>' + esc(p.expirationDate || 'Never') + '</td>' +
      '<td><button class="btn secondary small" data-edit="' + p.id + '">Edit</button> ' +
      '<button class="btn danger small" data-del="' + p.id + '">Delete</button></td></tr>').join('')
      || '<tr><td colspan="7" class="empty">No products yet.</td></tr>') +
    '</tbody></table></div>' +
    '<div class="form-row"><button class="btn primary" id="add-product">+ Add product</button></div>';

  $('#add-product').onclick = () => productForm(null);
  $$('[data-edit]').forEach(b => b.onclick = () => productForm(products.find(p => p.id === Number(b.dataset.edit))));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const p = products.find(x => x.id === Number(b.dataset.del));
    if (!await confirmDialog('Delete "' + p.name + '"?', 'Delete product', 'Delete')) return;
    try { await DAO.ProductDAO.delete(p.id); toast('Product deleted.', 'success'); }
    catch (e) { toast(e.message, 'error'); }          // e.g. the product is in an order
    render();
  });
}

// one dialog used for both Add (p = null) and Edit (p = the product)
function productForm(p) {
  const wrap = document.createElement('div');
  const options = categories.map(c =>
    '<option value="' + c.id + '"' + (p && p.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  wrap.innerHTML =
    '<h3>' + (p ? 'Edit product' : 'Add product') + '</h3>' +
    '<div class="field"><label>Name</label><input id="f-name" value="' + esc(p ? p.name : '') + '"></div>' +
    '<div class="field"><label>Category</label><select id="f-cat">' + options + '</select></div>' +
    '<div class="field"><label>Price</label><input id="f-price" type="number" min="0" step="0.01" value="' + (p ? p.price : '') + '"></div>' +
    '<div class="field"><label>Quantity in stock</label><input id="f-qty" type="number" min="0" step="1" value="' + (p ? p.quantity : '') + '"></div>' +
    '<div class="field"><label>Low-stock threshold</label><input id="f-low" type="number" min="0" step="1" value="' + (p ? p.lowStockThreshold : 10) + '"></div>' +
    '<div class="field"><label>Expiration date (leave empty if it never expires)</label><input id="f-exp" type="date" value="' + (p && p.expirationDate ? p.expirationDate : '') + '"></div>' +
    '<div class="error-text" id="f-err"></div>' +
    '<div class="modal-actions"><button class="btn secondary" id="f-cancel">Cancel</button><button class="btn primary" id="f-save">Save</button></div>';
  const modal = openModal(wrap);
  $('#f-cancel', wrap).onclick = () => modal.close();
  $('#f-save', wrap).onclick = async () => {
    const name = $('#f-name', wrap).value.trim();
    const categoryId = Number($('#f-cat', wrap).value);
    const priceText = $('#f-price', wrap).value.trim();
    const price = Number(priceText);
    const quantity = Number($('#f-qty', wrap).value);
    const lowStockThreshold = Number($('#f-low', wrap).value);
    const expirationDate = $('#f-exp', wrap).value || null;
    const err = $('#f-err', wrap);
    if (!name) { err.textContent = 'Name is required.'; return; }
    if (!categoryId) { err.textContent = 'Create a category first.'; return; }
    if (priceText === '' || !(price >= 0)) { err.textContent = 'Price must be 0 or more.'; return; }
    if (!Number.isInteger(quantity) || quantity < 0) { err.textContent = 'Quantity must be a whole number, 0 or more.'; return; }
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) { err.textContent = 'Threshold must be a whole number, 0 or more.'; return; }
    const data = { name, categoryId, price: Math.round(price * 100) / 100, quantity, lowStockThreshold, expirationDate };
    if (p) await DAO.ProductDAO.update(Object.assign({ id: p.id }, data));
    else await DAO.ProductDAO.insert(data);
    modal.close();
    toast('Product saved.', 'success');
    render();
  };
}

// =================== TAB 2: CATEGORIES ===================
function renderCategories() {
  $('#content').innerHTML =
    '<div class="section-title">Categories</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th class="num">Products</th><th></th></tr></thead><tbody>' +
    (categories.map(c =>
      '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.description) + '</td>' +
      '<td class="num">' + products.filter(p => p.categoryId === c.id).length + '</td>' +
      '<td><button class="btn danger small" data-cdel="' + c.id + '">Delete</button></td></tr>').join('')
      || '<tr><td colspan="4" class="empty">No categories.</td></tr>') +
    '</tbody></table></div>' +
    '<div class="card" style="margin-top:16px"><div class="section-title">Add category</div>' +
    '<div class="form-row" style="margin-top:0">' +
      '<div class="field"><label>Name</label><input id="c-name"></div>' +
      '<div class="field"><label>Description</label><input id="c-desc"></div>' +
      '<button class="btn primary" id="c-add">Add</button></div>' +
    '<div class="error-text" id="c-err"></div></div>';

  $('#c-add').onclick = async () => {
    const name = $('#c-name').value.trim();
    if (!name) { $('#c-err').textContent = 'Category name is required.'; return; }
    try {
      await DAO.ProductDAO.insertCategory({ name, description: $('#c-desc').value.trim() });
    } catch (e) { $('#c-err').textContent = e.message; return; }
    toast('Category added.', 'success');
    render();
  };
  $$('[data-cdel]').forEach(b => b.onclick = async () => {
    const c = categories.find(x => x.id === Number(b.dataset.cdel));
    if (!await confirmDialog('Delete category "' + c.name + '"?', 'Delete category', 'Delete')) return;
    try { await DAO.ProductDAO.deleteCategory(c.id); toast('Category deleted.', 'success'); }
    catch (e) { toast(e.message, 'error'); }     // products still use it
    render();
  });
}

// =================== TAB 3: STOCK ===================
function renderStock() {
  const lowCount = products.filter(p => p.quantity <= p.lowStockThreshold).length;
  const soonCount = products.filter(p => { const d = daysUntil(p.expirationDate); return d >= 0 && d <= 7; }).length;
  const expiredCount = products.filter(p => daysUntil(p.expirationDate) < 0).length;
  $('#content').innerHTML =
    '<div class="section-title">Stock monitoring</div>' +
    '<div class="stats">' +
      '<div class="stat"><div class="muted">Low stock items</div><div class="stat-value" style="color:var(--danger)">' + lowCount + '</div></div>' +
      '<div class="stat"><div class="muted">Expiring within 7 days</div><div class="stat-value" style="color:#ff9800">' + soonCount + '</div></div>' +
      '<div class="stat"><div class="muted">Expired</div><div class="stat-value" style="color:var(--danger)">' + expiredCount + '</div></div>' +
    '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Name</th><th class="num">Quantity</th><th class="num">Low-stock at</th><th>Expires</th><th>Last restocked</th><th>Status</th><th></th></tr></thead><tbody>' +
    products.map(p => {
      const st = stockState(p);
      const label = { expired: 'Expired', low: 'Low stock', soon: 'Expiring soon', ok: 'OK' }[st];
      const badge = st === 'expired' ? 'low' : st;
      return '<tr class="' + (st === 'expired' || st === 'low' ? 'row-low' : st === 'soon' ? 'row-soon' : '') + '">' +
        '<td><b>' + esc(p.name) + '</b></td><td class="num">' + p.quantity + '</td><td class="num">' + p.lowStockThreshold + '</td>' +
        '<td>' + esc(p.expirationDate || 'Never') + '</td><td>' + esc(p.restockDate || '-') + '</td>' +
        '<td><span class="badge ' + badge + '">' + label + '</span></td>' +
        '<td><button class="btn primary small" data-restock="' + p.id + '">Restock</button></td></tr>';
    }).join('') +
    '</tbody></table></div>' +
    '<p class="legend">Red = expired, or quantity at or below the low-stock level · Orange = expires within 7 days</p>';
  $$('[data-restock]').forEach(b => b.onclick = () => restockForm(products.find(p => p.id === Number(b.dataset.restock))));
}

function restockForm(p) {
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<h3>Restock ' + esc(p.name) + '</h3>' +
    '<p>Now in stock: ' + p.quantity + '. The last-restocked date will be set to today.</p>' +
    '<div class="field"><label>Units to add</label><input id="r-qty" type="number" min="1" step="1" value="10"></div>' +
    '<div class="error-text" id="r-err"></div>' +
    '<div class="modal-actions"><button class="btn secondary" id="r-cancel">Cancel</button><button class="btn primary" id="r-save">Restock</button></div>';
  const modal = openModal(wrap);
  $('#r-cancel', wrap).onclick = () => modal.close();
  $('#r-save', wrap).onclick = async () => {
    const qty = Number($('#r-qty', wrap).value);
    if (!Number.isInteger(qty) || qty < 1) { $('#r-err', wrap).textContent = 'Enter a whole number of 1 or more.'; return; }
    await DAO.ProductDAO.restock(p.id, qty);
    modal.close();
    toast(p.name + ' restocked (+' + qty + ').', 'success');
    render();
  };
}

// =================== TAB 4: ORDERS ===================
function renderOrders() {
  $('#content').innerHTML =
    '<div class="section-title">All orders</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Order ID</th><th>Date</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Status</th><th>Deliveryman</th></tr></thead><tbody>' +
    (orders.map(o =>
      '<tr><td><b>' + esc(orderCode(o.id)) + '</b></td><td>' + esc(o.date) + '</td><td>' + esc(o.customerName) + '</td>' +
      '<td>' + o.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ') + '</td>' +
      '<td class="num">' + money(o.total) + '</td><td>' + statusBadge(o.status) + '</td>' +
      '<td>' + esc(o.deliverymanName || '-') + '</td></tr>').join('')
      || '<tr><td colspan="7" class="empty">No orders yet.</td></tr>') +
    '</tbody></table></div>';
}

// =================== TAB 5: SALES REPORT (+ print / save as PDF) ===================
function renderReport() {
  // 1. which orders are in the chosen period
  const list = orders.filter(o => (!reportFrom || o.date >= reportFrom) && (!reportTo || o.date <= reportTo));
  const delivered = list.filter(o => o.status === 'DELIVERED');
  const revenue = Math.round(delivered.reduce((s, o) => s + o.total, 0) * 100) / 100;
  const average = delivered.length ? revenue / delivered.length : 0;

  // 2. orders by status
  const counts = { PENDING: 0, BEING_DELIVERED: 0, DELIVERED: 0 };
  list.forEach(o => { counts[o.status] += 1; });
  const maxCount = Math.max(1, ...Object.values(counts));
  const colors = { PENDING: '#90a4ae', BEING_DELIVERED: '#ff9800', DELIVERED: '#1b9a3b' };

  // 3. best-selling products and sales per category (every order in the period)
  const categoryOf = {};
  products.forEach(p => { categoryOf[p.id] = p.category; });
  const units = {}, byCategory = {};
  list.forEach(o => o.items.forEach(i => {
    units[i.name] = (units[i.name] || 0) + i.qty;
    const cat = categoryOf[i.productId] || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + i.qty * i.unitPrice;
  }));
  const top = Object.entries(units).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top.length ? top[0][1] : 1;
  const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const catMax = cats.length ? cats[0][1] : 1;

  const period = (!reportFrom && !reportTo) ? 'All dates'
    : (reportFrom || 'the beginning') + '  to  ' + (reportTo || 'today');
  const bar = (label, text, pct, color) =>
    '<div class="bar-row"><div class="bar-label">' + esc(label) + '</div><div class="bar-track"><div class="bar-fill" style="width:' +
    pct + '%;background:' + color + '"></div></div><div class="bar-count wide">' + esc(text) + '</div></div>';

  $('#content').innerHTML =
    // ----- on screen only: title, date filter and the print button -----
    '<div class="no-print">' +
      '<div class="section-title">Sales report</div>' +
      '<div class="card"><div class="form-row" style="margin-top:0">' +
        '<div class="field"><label>From</label><input id="rp-from" type="date" value="' + esc(reportFrom) + '"></div>' +
        '<div class="field"><label>To</label><input id="rp-to" type="date" value="' + esc(reportTo) + '"></div>' +
        '<button class="btn secondary" id="rp-clear">Clear dates</button>' +
        '<button class="btn primary" id="rp-print">' + icon('printer') + 'Print / Save as PDF</button>' +
      '</div></div>' +
    '</div>' +

    // ----- the report itself (this part is what gets printed) -----
    '<div id="report-sheet">' +
      '<div class="print-only report-head">' +
        '<div class="report-title">' + icon('cart') + 'Grocery Store — Sales report</div>' +
        '<div>Period: ' + esc(period) + '</div>' +
        '<div>Generated: ' + esc(new Date().toLocaleString()) + ' by ' + esc(me.name) + '</div>' +
      '</div>' +
      '<div class="stats" style="margin-top:16px">' +
        '<div class="stat"><div class="muted">Total orders</div><div class="stat-value">' + list.length + '</div></div>' +
        '<div class="stat"><div class="muted">Delivered orders</div><div class="stat-value">' + delivered.length + '</div></div>' +
        '<div class="stat"><div class="muted">Revenue (delivered)</div><div class="stat-value">' + money(revenue) + '</div></div>' +
        '<div class="stat"><div class="muted">Average delivered order</div><div class="stat-value">' + money(average) + '</div></div>' +
      '</div>' +
      '<div class="card"><div class="section-title">Orders by status</div>' +
        Object.entries(counts).map(([k, v]) => bar(statusLabel(k), String(v), v / maxCount * 100, colors[k])).join('') +
      '</div>' +
      '<div class="card" style="margin-top:16px"><div class="section-title">Best-selling products (units ordered)</div>' +
        (top.length ? top.map(([k, v]) => bar(k, String(v), v / topMax * 100, 'var(--brand)')).join('')
                    : '<div class="muted">No sales in this period.</div>') +
      '</div>' +
      '<div class="card" style="margin-top:16px"><div class="section-title">Sales by category (value ordered)</div>' +
        (cats.length ? cats.map(([k, v]) => bar(k, money(v), v / catMax * 100, 'var(--brand-dark)')).join('')
                     : '<div class="muted">No sales in this period.</div>') +
      '</div>' +
      '<div class="section-title" style="margin-top:20px">Orders in this period</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Order ID</th><th>Date</th><th>Customer</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>' +
        (list.map(o => '<tr><td><b>' + esc(orderCode(o.id)) + '</b></td><td>' + esc(o.date) + '</td><td>' + esc(o.customerName) +
          '</td><td class="num">' + money(o.total) + '</td><td>' + esc(statusLabel(o.status)) + '</td></tr>').join('')
          || '<tr><td colspan="5" class="empty">No orders in this period.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="legend">Revenue counts delivered orders only. The product and category charts count every order in the period.</p>' +
    '</div>';

  $('#rp-from').onchange = e => { reportFrom = e.target.value; renderReport(); };
  $('#rp-to').onchange = e => { reportTo = e.target.value; renderReport(); };
  $('#rp-clear').onclick = () => { reportFrom = ''; reportTo = ''; renderReport(); };
  // in the print window choose "Save as PDF" as the printer to get a PDF file
  $('#rp-print').onclick = () => window.print();
}

init();