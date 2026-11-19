'use strict';

const me = requireRole('Manager');
let tab = 'products';
let products = [], categories = [], orders = [];

function init() {
  if (!me) return;
  $('#who').textContent = '👤 ' + me.name;
  $('#logout').onclick = logout;
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
    '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th class="num">Price</th><th class="num">Quantity</th><th></th></tr></thead><tbody>' +
    (products.map(p =>
      '<tr><td>' + p.id + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.category) + '</td>' +
      '<td class="num">' + money(p.price) + '</td><td class="num">' + p.quantity + '</td>' +
      '<td><button class="btn secondary small" data-edit="' + p.id + '">Edit</button> ' +
      '<button class="btn danger small" data-del="' + p.id + '">Delete</button></td></tr>').join('')
      || '<tr><td colspan="6" class="empty">No products yet.</td></tr>') +
    '</tbody></table></div>' +
    '<div class="form-row"><button class="btn primary" id="add-product">+ Add product</button></div>';

  $('#add-product').onclick = () => productForm(null);
  $$('[data-edit]').forEach(b => b.onclick = () => productForm(products.find(p => p.id === Number(b.dataset.edit))));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const p = products.find(x => x.id === Number(b.dataset.del));
    if (!await confirmDialog('Delete "' + p.name + '"?', 'Delete product', 'Delete')) return;
    await DAO.ProductDAO.delete(p.id);
    toast('Product deleted.', 'success');
    render();
  });
}

// one dialog used for both Add (p = null) and Edit (p = the product)
function productForm(p) {
  const wrap = document.createElement('div');
  const options = categories.map(c =>
    '<option' + (p && p.category === c.name ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  wrap.innerHTML =
    '<h3>' + (p ? 'Edit product' : 'Add product') + '</h3>' +
    '<div class="field"><label>Name</label><input id="f-name" value="' + esc(p ? p.name : '') + '"></div>' +
    '<div class="field"><label>Category</label><select id="f-cat">' + options + '</select></div>' +
    '<div class="field"><label>Price (VND)</label><input id="f-price" type="number" min="0" value="' + (p ? p.price : '') + '"></div>' +
    '<div class="field"><label>Quantity</label><input id="f-qty" type="number" min="0" value="' + (p ? p.quantity : '') + '"></div>' +
    '<div class="field"><label>Expiration date</label><input id="f-exp" type="date" value="' + (p ? p.expirationDate : '') + '"></div>' +
    '<div class="error-text" id="f-err"></div>' +
    '<div class="modal-actions"><button class="btn secondary" id="f-cancel">Cancel</button><button class="btn primary" id="f-save">Save</button></div>';
  const modal = openModal(wrap);
  $('#f-cancel', wrap).onclick = () => modal.close();
  $('#f-save', wrap).onclick = async () => {
    const name = $('#f-name', wrap).value.trim();
    const category = $('#f-cat', wrap).value;
    const price = Number($('#f-price', wrap).value);
    const qty = Number($('#f-qty', wrap).value);
    const exp = $('#f-exp', wrap).value;
    const err = $('#f-err', wrap);
    if (!name) { err.textContent = 'Name is required.'; return; }
    if (!category) { err.textContent = 'Create a category first.'; return; }
    if (!(price > 0)) { err.textContent = 'Price must be greater than 0.'; return; }
    if (!Number.isInteger(qty) || qty < 0) { err.textContent = 'Quantity must be 0 or more.'; return; }
    if (!exp) { err.textContent = 'Please choose an expiration date.'; return; }
    const data = { name, category, price, quantity: qty, expirationDate: exp };
    if (p) await DAO.ProductDAO.update(Object.assign({ id: p.id }, data));
    else await DAO.ProductDAO.insert(Object.assign(data, { restockDate: today() }));
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
      '<td class="num">' + products.filter(p => p.category === c.name).length + '</td>' +
      '<td><button class="btn danger small" data-cdel="' + esc(c.name) + '">Delete</button></td></tr>').join('')
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
    if (!await confirmDialog('Delete category "' + b.dataset.cdel + '"?', 'Delete category', 'Delete')) return;
    try { await DAO.ProductDAO.deleteCategory(b.dataset.cdel); toast('Category deleted.', 'success'); }
    catch (e) { toast(e.message, 'error'); }     // e.g. products still use it
    render();
  });
}

// =================== TAB 3: STOCK ===================
function renderStock() {
  const lowCount = products.filter(p => p.quantity <= p.minStock).length;
  const soonCount = products.filter(p => daysUntil(p.expirationDate) <= 7).length;
  $('#content').innerHTML =
    '<div class="section-title">Stock monitoring</div>' +
    '<div class="stats">' +
      '<div class="stat"><div class="muted">Low stock items</div><div class="stat-value" style="color:var(--danger)">' + lowCount + '</div></div>' +
      '<div class="stat"><div class="muted">Expiring within 7 days</div><div class="stat-value" style="color:#ff9800">' + soonCount + '</div></div>' +
    '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Name</th><th class="num">Quantity</th><th class="num">Minimum</th><th>Expires</th><th>Next restock</th><th>Status</th><th></th></tr></thead><tbody>' +
    products.map(p => {
      const st = p.quantity <= p.minStock ? 'low' : daysUntil(p.expirationDate) <= 7 ? 'soon' : 'ok';
      const label = st === 'low' ? 'Low stock' : st === 'soon' ? 'Expiring soon' : 'OK';
      return '<tr class="' + (st === 'low' ? 'row-low' : st === 'soon' ? 'row-soon' : '') + '">' +
        '<td><b>' + esc(p.name) + '</b></td><td class="num">' + p.quantity + '</td><td class="num">' + p.minStock + '</td>' +
        '<td>' + esc(p.expirationDate) + '</td><td>' + esc(p.restockDate || '-') + '</td>' +
        '<td><span class="badge ' + st + '">' + label + '</span></td>' +
        '<td><button class="btn primary small" data-restock="' + p.id + '">Restock</button></td></tr>';
    }).join('') +
    '</tbody></table></div>' +
    '<p class="legend">Red = quantity at or below the minimum · Orange = expires within 7 days</p>';
  $$('[data-restock]').forEach(b => b.onclick = () => restockForm(products.find(p => p.id === Number(b.dataset.restock))));
}

function restockForm(p) {
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<h3>Restock ' + esc(p.name) + '</h3>' +
    '<div class="field"><label>Units to add</label><input id="r-qty" type="number" min="1" value="10"></div>' +
    '<div class="field"><label>Next restock date</label><input id="r-date" type="date"></div>' +
    '<div class="error-text" id="r-err"></div>' +
    '<div class="modal-actions"><button class="btn secondary" id="r-cancel">Cancel</button><button class="btn primary" id="r-save">Restock</button></div>';
  const modal = openModal(wrap);
  $('#r-cancel', wrap).onclick = () => modal.close();
  $('#r-save', wrap).onclick = async () => {
    const qty = Number($('#r-qty', wrap).value);
    if (!Number.isInteger(qty) || qty < 1) { $('#r-err', wrap).textContent = 'Enter a whole number of 1 or more.'; return; }
    await DAO.ProductDAO.restock(p.id, qty, $('#r-date', wrap).value || null);
    modal.close();
    toast(p.name + ' restocked (+' + qty + ').', 'success');
    render();
  };
}

// =================== TAB 4: ORDERS ===================
function renderOrders() {
  $('#content').innerHTML =
    '<div class="section-title">All orders</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Order ID</th><th>Date</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>' +
    (orders.map(o =>
      '<tr><td><b>' + esc(o.id) + '</b></td><td>' + esc(o.date) + '</td><td>' + esc(o.customerName) + '</td>' +
      '<td>' + o.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ') + '</td>' +
      '<td class="num">' + money(o.total) + '</td><td>' + statusBadge(o.status) + '</td></tr>').join('')
      || '<tr><td colspan="6" class="empty">No orders yet.</td></tr>') +
    '</tbody></table></div>';
}

// =================== TAB 5: SALES REPORT ===================
function renderReport() {
  const delivered = orders.filter(o => o.status === 'Delivered');
  const revenue = delivered.reduce((s, o) => s + o.total, 0);

  const counts = { 'Pending': 0, 'Being Delivered': 0, 'Delivered': 0 };
  orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
  const max = Math.max(1, ...Object.values(counts));
  const colors = { 'Pending': '#90a4ae', 'Being Delivered': '#ff9800', 'Delivered': '#1b9a3b' };

  const sold = {};                         // product name -> units sold
  orders.forEach(o => o.items.forEach(i => { sold[i.name] = (sold[i.name] || 0) + i.qty; }));
  const top = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top.length ? top[0][1] : 1;

  $('#content').innerHTML =
    '<div class="section-title">Sales report</div>' +
    '<div class="stats">' +
      '<div class="stat"><div class="muted">Total orders</div><div class="stat-value">' + orders.length + '</div></div>' +
      '<div class="stat"><div class="muted">Delivered orders</div><div class="stat-value">' + delivered.length + '</div></div>' +
      '<div class="stat"><div class="muted">Revenue (delivered)</div><div class="stat-value">' + money(revenue) + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="section-title">Orders by status</div>' +
    Object.entries(counts).map(([k, v]) =>
      '<div class="bar-row"><div class="bar-label">' + k + '</div><div class="bar-track"><div class="bar-fill" style="width:' +
      (v / max * 100) + '%;background:' + colors[k] + '"></div></div><div class="bar-count">' + v + '</div></div>').join('') +
    '</div>' +
    '<div class="card" style="margin-top:16px"><div class="section-title">Best-selling products</div>' +
    (top.length ? top.map(([k, v]) =>
      '<div class="bar-row"><div class="bar-label">' + esc(k) + '</div><div class="bar-track"><div class="bar-fill" style="width:' +
      (v / topMax * 100) + '%;background:var(--brand)"></div></div><div class="bar-count">' + v + '</div></div>').join('')
      : '<div class="muted">No sales yet.</div>') +
    '</div>';
}

init();