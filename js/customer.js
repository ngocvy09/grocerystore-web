'use strict';

const me = requireRole('CUSTOMER');
let products = [];
let categories = [];
let category = 'all';       // 'all' or a category id (as text)
let keyword = '';
const cart = new Map();     // productId -> quantity

async function init() {
  if (!me) return;
$('#who').innerHTML = icon('user') + esc(me.name);  $('#logout').onclick = logout;
  $('#search').addEventListener('input', e => {
    keyword = e.target.value.toLowerCase().trim();
    renderGrid();
  });
  $$('.nav-item').forEach(b => b.onclick = () => switchView(b.dataset.view));
  $('#place').onclick = placeOrder;
  await reload();
}

// load fresh data from the data layer, then redraw everything
async function reload() {
  const all = await DAO.ProductDAO.findAll();
  products = all.filter(p => daysUntil(p.expirationDate) >= 0);   // expired products are not sold
  categories = await DAO.ProductDAO.findCategories();
  renderChips();
  renderGrid();
  renderCart();
}

// ---------- Shop / My orders switch ----------
function switchView(view) {
  $('#view-shop').classList.toggle('hidden', view !== 'shop');
  $('#view-orders').classList.toggle('hidden', view !== 'orders');
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'orders') renderOrders();
}

// ---------- chips and product cards ----------
function renderChips() {
  const chips = [{ id: 'all', name: 'All' }].concat(categories.map(c => ({ id: String(c.id), name: c.name })));
  $('#chips').innerHTML = chips.map(c =>
    '<button class="chip' + (c.id === category ? ' selected' : '') + '" data-c="' + esc(c.id) + '">' + esc(c.name) + '</button>'
  ).join('');
  $$('#chips .chip').forEach(b => b.onclick = () => {
    category = b.dataset.c;
    renderChips();
    renderGrid();
  });
}

function stockText(p) {
  if (p.quantity <= 0) return '<span class="stock-out">Out of stock</span>';
  if (p.quantity <= p.lowStockThreshold) return '<span class="stock-low">Only ' + p.quantity + ' left</span>';
  return '<span class="stock-ok">In stock: ' + p.quantity + '</span>';
}

function renderGrid() {
  const list = products.filter(p =>
    (category === 'all' || String(p.categoryId) === category) &&
    p.name.toLowerCase().includes(keyword));

  if (!list.length) {
    $('#grid').innerHTML = '<div class="empty card" style="grid-column:1/-1">No products found.</div>';
    return;
  }
  $('#grid').innerHTML = list.map(p =>
    '<div class="product-card">' +
      '<div class="card-image" style="background:' + categoryColor(p.category) + '">' + esc(p.name.charAt(0).toUpperCase()) + '</div>' +
      '<div class="product-name">' + esc(p.name) + '</div>' +
      '<span class="tag">' + esc(p.category) + '</span>' +
      '<div class="price">' + money(p.price) + '</div>' +
      stockText(p) +
      '<button class="btn primary small" data-add="' + p.id + '"' + (p.quantity <= 0 ? ' disabled' : '') + '>+ Add to cart</button>' +
    '</div>'
  ).join('');
  $$('#grid [data-add]').forEach(b => b.onclick = () => addToCart(Number(b.dataset.add), 1));
}

// ---------- cart ----------
// delta = +1 to add one, -1 to remove one
function addToCart(id, delta) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const wanted = (cart.get(id) || 0) + delta;
  if (wanted > p.quantity) {            // friendly version of InsufficientStockException
    toast('Not enough stock for ' + p.name + '. Available: ' + p.quantity, 'warn');
    return;
  }
  if (wanted <= 0) cart.delete(id); else cart.set(id, wanted);
  renderCart();
}

function cartTotal() {
  let total = 0;
  cart.forEach((qty, id) => { const p = products.find(x => x.id === id); if (p) total += p.price * qty; });
  return Math.round(total * 100) / 100;
}

function renderCart() {
  let count = 0;
  const rows = [];
  cart.forEach((qty, id) => {
    const p = products.find(x => x.id === id);
    if (!p) { cart.delete(id); return; }
    count += qty;
    rows.push(
      '<div class="cart-row"><div class="info">' +
        '<div class="product-name">' + esc(p.name) + '</div>' +
        '<div class="cart-line">' + money(p.price * qty) + '</div></div>' +
        '<div class="stepper">' +
          '<button data-id="' + id + '" data-d="-1">−</button><b>' + qty + '</b>' +
          '<button data-id="' + id + '" data-d="1">+</button>' +
        '</div></div>');
  });
  $('#cart-rows').innerHTML = rows.length ? rows.join('') : '<div class="muted">Your cart is empty.</div>';
  $('#total').textContent = money(cartTotal());
$('#cart-count').textContent = count;  $$('#cart-rows [data-id]').forEach(b =>
    b.onclick = () => addToCart(Number(b.dataset.id), Number(b.dataset.d)));
}

// ---------- place order ----------
async function placeOrder() {
  if (!cart.size) { toast('Your cart is empty.', 'warn'); return; }
  const ok = await confirmDialog(
    'Place this order? Total: ' + money(cartTotal()) + '\nDelivery address: ' + (me.address || '-'),
    'Confirm order', 'Place order');
  if (!ok) return;
  try {
    const order = await DAO.OrderDAO.createOrder({
      customerId: me.id,
      items: Array.from(cart).map(([productId, qty]) => ({ productId, qty }))
    });
    cart.clear();
    await reload();                      // stock numbers have changed
    toast('Order ' + orderCode(order.id) + ' placed.', 'success');
    switchView('orders');
  } catch (e) {
    toast(e.message, 'error');
    await reload();
  }
}

// ---------- My orders ----------
async function renderOrders() {
  const orders = await DAO.OrderDAO.findByCustomer(me.id);
  $('#orders').innerHTML = orders.length ? orders.map(o =>
    '<div class="card order-card">' +
      '<div class="order-head"><div><b>' + esc(orderCode(o.id)) + '</b> <span class="muted">· ' + esc(o.date) + '</span></div>' + statusBadge(o.status) + '</div>' +
      '<ul class="order-items">' + o.items.map(i => '<li>' + esc(i.name) + ' × ' + i.qty + '</li>').join('') + '</ul>' +
      '<div class="muted" style="margin-top:8px">Deliver to: ' + esc(o.address) +
        (o.deliverymanName ? ' · Deliveryman: ' + esc(o.deliverymanName) : '') + '</div>' +
      '<div class="total-row"><span class="muted">Total</span><span class="price">' + money(o.total) + '</span></div>' +
      steps(o.status) +
    '</div>'
  ).join('') : '<div class="card empty">You have not placed any orders yet.</div>';
}

init();