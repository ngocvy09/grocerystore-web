/*
 * api.js - the DATA LAYER of the website (the "DAO" tier).
 *
 * It mirrors the MySQL database (schema.sql / seed.sql) table by table:
 *   users, categories, products, inventory_batches, orders, order_items
 * with the same column names, the same ENUM values (CUSTOMER / MANAGER / DELIVERYMAN,
 * PENDING / BEING_DELIVERED / DELIVERED) and the same rules (unique username and phone,
 * a category with products cannot be deleted, a product that is in an order cannot be
 * deleted, one inventory row per product, ...).
 *
 * The pages never see the raw tables. They call UserDAO, ProductDAO and OrderDAO, which
 * return the plain objects ("DTOs") described above each DAO. When the Java backend is
 * ready, keep the same function names and the same returned objects, and replace the
 * inside of each function with fetch('/api/...'). No page has to change.
 *
 * DEMO ONLY: the real database stores a bcrypt hash in users.password and the Java code
 * checks it with bcrypt. The browser demo keeps the plain text here instead.
 */
(function (global) {
  'use strict';

  const KEY = 'grocerystore_db_v2';
  const STATUS = { PENDING: 'PENDING', BEING_DELIVERED: 'BEING_DELIVERED', DELIVERED: 'DELIVERED' };
  const FLOW = [STATUS.PENDING, STATUS.BEING_DELIVERED, STATUS.DELIVERED];

  // Java: InsufficientStockException
  class InsufficientStockError extends Error {
    constructor(productName, available) {
      super('Not enough stock for ' + productName + '. Available: ' + available);
      this.name = 'InsufficientStockError';
      this.available = available;
    }
  }

  // ---------- helpers ----------
  const pad = n => String(n).padStart(2, '0');
  const dateStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dateTimeStr = d => dateStr(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const todayStr = () => dateStr(new Date());
  const daysFromNow = n => { if (n === null) return null; const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); };
  const timeFromNow = ms => dateTimeStr(new Date(Date.now() + ms));
  const HOUR = 3600000, DAY = 86400000;
  const round2 = x => Math.round(x * 100) / 100;
  const copy = x => JSON.parse(JSON.stringify(x));
  const take = (db, key) => db.next[key]++;                 // like AUTO_INCREMENT

  // ---------- starting data (same as seed.sql) ----------
  function seed() {
    const PW = 'Password123!';
    const user = (id, name, username, phone, role, address, staff) =>
      ({ user_id: id, name, username, phone_number: phone, password: PW, role, address, staff_id: staff, active: true });

    const categories = [
      [1, 'Dairy', 'Milk, cheese and yogurt'],
      [2, 'Bakery', 'Fresh bread and pastries'],
      [3, 'Fruit & Vegetables', 'Fresh produce'],
      [4, 'Beverages', 'Juice and water'],
      [5, 'Pantry', 'Dry and canned goods']
    ].map(c => ({ category_id: c[0], category_name: c[1], description: c[2] }));

    // [id, name, price, expires in N days (null = never), category_id]
    const products = [
      [1, 'Fresh Milk 1L', 1.80, 4, 1], [2, 'Yogurt 4-pack', 2.40, 10, 1],
      [3, 'Cheddar Cheese 200g', 3.50, 40, 1], [4, 'Cream 250ml', 1.90, -2, 1],
      [5, 'White Bread', 1.50, 2, 2], [6, 'Croissant', 1.20, 1, 2],
      [7, 'Apples 1kg', 2.90, 9, 3], [8, 'Bananas 1kg', 1.60, 5, 3],
      [9, 'Orange Juice 1L', 2.50, 60, 4], [10, 'Mineral Water 1.5L', 0.80, 365, 4],
      [11, 'Rice 5kg', 8.90, 500, 5], [12, 'Pasta 500g', 1.40, 400, 5],
      [13, 'Canned Tomatoes', 1.10, 700, 5], [14, 'Sea Salt 500g', 0.90, null, 5]
    ].map(p => ({ product_id: p[0], product_name: p[1], price: p[2], expiration_date: daysFromNow(p[3]), category_id: p[4] }));

    // [product_id, quantity, low_stock_threshold, restocked N days ago (null = never)]
    const batches = [
      [1, 6, 10, 3], [2, 40, 10, 6], [3, 25, 10, 12], [4, 8, 10, 15], [5, 30, 10, 1],
      [6, 4, 10, 1], [7, 50, 10, 5], [8, 35, 10, 5], [9, 60, 10, 20], [10, 120, 20, 30],
      [11, 0, 5, 45], [12, 80, 10, 25], [13, 70, 10, 25], [14, 45, 10, null]
    ].map((b, i) => ({
      batch_id: i + 1, product_id: b[0], quantity: b[1], low_stock_threshold: b[2],
      restock_date: b[3] === null ? null : daysFromNow(-b[3])
    }));

    return {
      users: [
        user(1, 'Jordan Ellis', 'manager1', '0901000001', 'MANAGER', null, 'S001'),
        user(2, 'Casey Brooks', 'delivery1', '0901000002', 'DELIVERYMAN', null, 'S002'),
        user(3, 'Jamie Carter', 'jamie', '0902000001', 'CUSTOMER', '12 Example Street, District 1', null),
        user(4, 'Riley Morgan', 'riley', '0902000002', 'CUSTOMER', '45 Sample Avenue, District 3', null)
      ],
      categories, products, inventory_batches: batches,
      orders: [
        { order_id: 1, customer_id: 3, order_date: timeFromNow(-3 * DAY), status: 'DELIVERED', total_amount: 5.10, delivery_address: '12 Example Street, District 1', deliveryman_id: 2 },
        { order_id: 2, customer_id: 4, order_date: timeFromNow(-2 * HOUR), status: 'PENDING', total_amount: 8.30, delivery_address: '45 Sample Avenue, District 3', deliveryman_id: null },
        { order_id: 3, customer_id: 3, order_date: timeFromNow(-1 * DAY), status: 'BEING_DELIVERED', total_amount: 6.10, delivery_address: '12 Example Street, District 1', deliveryman_id: 2 }
      ],
      order_items: [
        { order_id: 1, product_id: 1, quantity: 2, unit_price: 1.80 },
        { order_id: 1, product_id: 5, quantity: 1, unit_price: 1.50 },
        { order_id: 2, product_id: 7, quantity: 2, unit_price: 2.90 },
        { order_id: 2, product_id: 9, quantity: 1, unit_price: 2.50 },
        { order_id: 3, product_id: 12, quantity: 2, unit_price: 1.40 },
        { order_id: 3, product_id: 13, quantity: 3, unit_price: 1.10 }
      ],
      next: { user_id: 5, category_id: 6, product_id: 15, batch_id: 15, order_id: 4 }
    };
  }

  function read() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    if (!raw) { const db = seed(); write(db); return db; }
    return JSON.parse(raw);
  }
  function write(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  // ---------- table rows -> objects the pages use ----------
  function userDTO(u) {
    return { id: u.user_id, name: u.name, username: u.username, phone: u.phone_number,
             role: u.role, address: u.address, staffId: u.staff_id };
  }
  // product + its category name + its inventory_batches row
  function productDTO(db, p) {
    const cat = db.categories.find(c => c.category_id === p.category_id);
    const b = db.inventory_batches.find(x => x.product_id === p.product_id);
    return {
      id: p.product_id, name: p.product_name, price: p.price,
      expirationDate: p.expiration_date,                       // null = does not expire
      categoryId: p.category_id, category: cat ? cat.category_name : '',
      quantity: b ? b.quantity : 0,
      lowStockThreshold: b ? b.low_stock_threshold : 10,
      restockDate: b ? b.restock_date : null                   // last restock
    };
  }
  // order + customer name + deliveryman name + its order_items
  function orderDTO(db, o) {
    const cust = db.users.find(u => u.user_id === o.customer_id);
    const dm = db.users.find(u => u.user_id === o.deliveryman_id);
    const items = db.order_items.filter(i => i.order_id === o.order_id).map(i => {
      const p = db.products.find(x => x.product_id === i.product_id);
      return { productId: i.product_id, name: p ? p.product_name : '(deleted product)', qty: i.quantity, unitPrice: i.unit_price };
    });
    return {
      id: o.order_id, customerId: o.customer_id, customerName: cust ? cust.name : '',
      date: o.order_date.slice(0, 10), dateTime: o.order_date,
      status: o.status, total: o.total_amount, address: o.delivery_address,
      deliverymanId: o.deliveryman_id, deliverymanName: dm ? dm.name : null, items
    };
  }
  const newestFirst = (a, b) => (a.dateTime < b.dateTime ? 1 : a.dateTime > b.dateTime ? -1 : b.id - a.id);

  // =====================================================================
  // UserDAO      returns { id, name, username, phone, role, address, staffId }
  // =====================================================================
  const UserDAO = {
    // returns the user, or null when username/password are wrong
    async authenticate(username, password) {
      const u = read().users.find(x => x.username.toLowerCase() === String(username).trim().toLowerCase());
      if (!u || u.password !== password) return null;
      if (!u.active) throw new Error('This account has been disabled.');
      return userDTO(u);
    },
    // register a new CUSTOMER: { name, phone, address, username, password }
    async insert(c) {
      const db = read();
      const username = String(c.username).trim();
      if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase()))
        throw new Error('That username is already taken.');
      if (db.users.some(u => u.phone_number === c.phone))
        throw new Error('That phone number is already registered.');
      db.users.push({
        user_id: take(db, 'user_id'), name: c.name, username, phone_number: c.phone,
        password: c.password, role: 'CUSTOMER', address: c.address, staff_id: null, active: true
      });
      write(db);
    }
  };

  // =====================================================================
  // ProductDAO   returns { id, name, price, expirationDate, categoryId, category,
  //                        quantity, lowStockThreshold, restockDate }
  // =====================================================================
  const ProductDAO = {
    async findAll() { const db = read(); return db.products.map(p => productDTO(db, p)); },
    async search(keyword) {
      const k = String(keyword || '').toLowerCase().trim();
      const db = read();
      return db.products.filter(p => p.product_name.toLowerCase().includes(k)).map(p => productDTO(db, p));
    },
    // p = { name, price, categoryId, expirationDate|null, quantity, lowStockThreshold }
    // creates the product AND its single inventory_batches row
    async insert(p) {
      const db = read();
      const id = take(db, 'product_id');
      db.products.push({ product_id: id, product_name: p.name, price: p.price,
                         expiration_date: p.expirationDate || null, category_id: p.categoryId });
      db.inventory_batches.push({ batch_id: take(db, 'batch_id'), product_id: id, quantity: p.quantity,
                                  low_stock_threshold: p.lowStockThreshold, restock_date: todayStr() });
      write(db);
      return productDTO(db, db.products[db.products.length - 1]);
    },
    // p = same fields plus id
    async update(p) {
      const db = read();
      const row = db.products.find(x => x.product_id === p.id);
      const batch = db.inventory_batches.find(x => x.product_id === p.id);
      if (!row) throw new Error('Product not found.');
      row.product_name = p.name; row.price = p.price;
      row.category_id = p.categoryId; row.expiration_date = p.expirationDate || null;
      if (batch) { batch.quantity = p.quantity; batch.low_stock_threshold = p.lowStockThreshold; }
      write(db);
    },
    // FK rule: a product that appears in an order cannot be deleted (RESTRICT).
    // Its inventory_batches row is deleted with it (CASCADE).
    async delete(id) {
      const db = read();
      const p = db.products.find(x => x.product_id === id);
      const used = new Set(db.order_items.filter(i => i.product_id === id).map(i => i.order_id)).size;
      if (used > 0) throw new Error('Cannot delete "' + (p ? p.product_name : '') + '": it appears in ' + used + ' order(s).');
      db.products = db.products.filter(x => x.product_id !== id);
      db.inventory_batches = db.inventory_batches.filter(x => x.product_id !== id);
      write(db);
    },
    // Manager.restock(): add units and record today as the restock date
    async restock(id, addQuantity) {
      const db = read();
      const b = db.inventory_batches.find(x => x.product_id === id);
      if (!b) throw new Error('Product not found.');
      b.quantity += addQuantity;
      b.restock_date = todayStr();
      write(db);
    },

    // ----- categories: { id, name, description } -----
    async findCategories() {
      return read().categories.map(c => ({ id: c.category_id, name: c.category_name, description: c.description || '' }));
    },
    async insertCategory(c) {
      const db = read();
      if (db.categories.some(x => x.category_name.toLowerCase() === c.name.toLowerCase()))
        throw new Error('That category already exists.');
      db.categories.push({ category_id: take(db, 'category_id'), category_name: c.name, description: c.description || null });
      write(db);
    },
    // FK rule: a category that still has products cannot be deleted (RESTRICT)
    async deleteCategory(id) {
      const db = read();
      const cat = db.categories.find(c => c.category_id === id);
      const used = db.products.filter(p => p.category_id === id).length;
      if (used > 0) throw new Error('Cannot delete "' + (cat ? cat.category_name : '') + '": ' + used + ' product(s) still use it.');
      db.categories = db.categories.filter(c => c.category_id !== id);
      write(db);
    }
  };

  // =====================================================================
  // OrderDAO     returns { id, customerId, customerName, date, dateTime, status, total,
  //                        address, deliverymanId, deliverymanName,
  //                        items: [{ productId, name, qty, unitPrice }] }
  // =====================================================================
  const OrderDAO = {
    // order = { customerId, items: [{ productId, qty }] }
    // The delivery address is COPIED from the customer, unit_price is the price today.
    // Throws InsufficientStockError when stock is too low (then nothing is saved).
    async createOrder(order) {
      const db = read();
      const customer = db.users.find(u => u.user_id === order.customerId && u.role === 'CUSTOMER');
      if (!customer) throw new Error('Customer not found.');
      if (!order.items.length) throw new Error('The order has no items.');

      const lines = order.items.map(it => {
        const p = db.products.find(x => x.product_id === it.productId);
        if (!p) throw new Error('That product no longer exists.');
        if (p.expiration_date && p.expiration_date < todayStr())
          throw new Error(p.product_name + ' is expired and cannot be ordered.');
        const b = db.inventory_batches.find(x => x.product_id === p.product_id);
        const available = b ? b.quantity : 0;
        if (it.qty > available) throw new InsufficientStockError(p.product_name, available);
        return { p, b, qty: it.qty };
      });

      lines.forEach(l => { l.b.quantity -= l.qty; });
      const id = take(db, 'order_id');
      const total = round2(lines.reduce((s, l) => s + l.p.price * l.qty, 0));
      db.orders.push({
        order_id: id, customer_id: customer.user_id, order_date: dateTimeStr(new Date()),
        status: STATUS.PENDING, total_amount: total, delivery_address: customer.address, deliveryman_id: null
      });
      lines.forEach(l => db.order_items.push({ order_id: id, product_id: l.p.product_id, quantity: l.qty, unit_price: l.p.price }));
      write(db);
      return orderDTO(db, db.orders[db.orders.length - 1]);
    },
    async findAll() { const db = read(); return db.orders.map(o => orderDTO(db, o)).sort(newestFirst); },
    async findByCustomer(customerId) {
      const db = read();
      return db.orders.filter(o => o.customer_id === customerId).map(o => orderDTO(db, o)).sort(newestFirst);
    },
    // a deliveryman sees the orders nobody has taken yet (PENDING) and his own orders
    async findForDeliveryman(deliverymanId) {
      const db = read();
      return db.orders.filter(o => o.status === STATUS.PENDING || o.deliveryman_id === deliverymanId)
        .map(o => orderDTO(db, o)).sort(newestFirst);
    },
    // PENDING -> BEING_DELIVERED (sets deliveryman_id) -> DELIVERED (same deliveryman only)
    async updateStatus(orderId, newStatus, deliverymanId) {
      const db = read();
      const o = db.orders.find(x => x.order_id === orderId);
      if (!o) throw new Error('Order not found.');
      if (FLOW.indexOf(newStatus) !== FLOW.indexOf(o.status) + 1)
        throw new Error('An order must go Pending > Being Delivered > Delivered.');
      if (newStatus === STATUS.BEING_DELIVERED) {
        if (!deliverymanId) throw new Error('A deliveryman is needed to start a delivery.');
        o.deliveryman_id = deliverymanId;
      } else if (newStatus === STATUS.DELIVERED && o.deliveryman_id !== deliverymanId) {
        throw new Error('This order is being delivered by another deliveryman.');
      }
      o.status = newStatus;
      write(db);
    }
  };

  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  global.DAO = { UserDAO, ProductDAO, OrderDAO, STATUS, InsufficientStockError, reset };
})(window);