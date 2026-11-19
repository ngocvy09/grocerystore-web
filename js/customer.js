'use strict';

const me = requireRole('Customer');
let products = [];
let categories = [];
let category = 'All';
let keyword = '';
const cart = new Map();     // productId -> quantity

async function init() {
  if (!me) return;
  $('#who').textContent = '👤 ' + me.name;
  $('#logout').onclick = logout;
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
  products = await DAO.ProductDAO.findAll();
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
  const names = ['All'].concat(categories.map(c => c.name));
  $('#chips').innerHTML = names.map(n =>
    '<button class="chip' + (n === category ? ' selected' : '') + '" data-c="' + esc(n) + '">' + esc(n) + '</button>'
  ).join('');
  $$('#chips .chip').forEach(b => b.onclick = () => {
    category = b.dataset.c;
    renderChips();
    renderGrid();
  });
}

function stockText(p) {
  if (p.quantity <= 0) return '<span class="stock-out">Out of stock</span>';
  if (p.quantity <= p.minStock) return '<span class="stock-low">Only ' + p.quantity + ' left</span>';
  return '<span class="stock-ok">In stock: ' + p.quantity + '</span>';
}

function renderGrid() {
  const list = products.filter(p =>
    (category === 'All' || p.category === category) &&
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

function renderCart() {
  let total = 0, count = 0;
  const rows = [];
  cart.forEach((qty, id) => {
    const p = products.find(x => x.id === id);
    if (!p) { cart.delete(id); return; }
    total += p.price * qty;
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
  $('#total').textContent = money(total);
  $('#cart-pill').textContent = '🧺 ' + count;
  $$('#cart-rows [data-id]').forEach(b =>
    b.onclick = () => addToCart(Number(b.dataset.id), Number(b.dataset.d)));
}

// ---------- place order ----------
async function placeOrder() {
  if (!cart.size) { toast('Your cart is empty.', 'warn'); return; }
  let total = 0;
  cart.forEach((qty, id) => { total += products.find(p => p.id === id).price * qty; });

  const ok = await confirmDialog('Place this order? Total: ' + money(total), 'Confirm order', 'Place order');
  if (!ok) return;
  try {
    const order = await DAO.OrderDAO.createOrder({
      username: me.username,
      customerName: me.name,
      address: me.address || 'No address',
      items: Array.from(cart).map(([productId, qty]) => ({ productId, qty }))
    });
    cart.clear();
    await reload();                      // stock numbers have changed
    toast('Order ' + order.id + ' placed.', 'success');
    switchView('orders');
  } catch (e) {
    toast(e.message, 'error');
    await reload();
  }
}

// ---------- My orders ----------
async function renderOrders() {
  const orders = await DAO.OrderDAO.findByCustomer(me.username);
  $('#orders').innerHTML = orders.length ? orders.map(o =>
    '<div class="card order-card">' +
      '<div class="order-head"><div><b>' + esc(o.id) + '</b> <span class="muted">· ' + esc(o.date) + '</span></div>' + statusBadge(o.status) + '</div>' +
      '<ul class="order-items">' + o.items.map(i => '<li>' + esc(i.name) + ' × ' + i.qty + '</li>').join('') + '</ul>' +
      '<div class="total-row"><span class="muted">Total</span><span class="price">' + money(o.total) + '</span></div>' +
      steps(o.status) +
    '</div>'
  ).join('') : '<div class="card empty">You have not placed any orders yet.</div>';
}

init();