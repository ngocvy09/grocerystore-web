/*
 * api.js - the DATA LAYER of the website.
 * Pages only call UserDAO, ProductDAO and OrderDAO (like the Java classes in the report).
 * For now the data lives in the browser (localStorage). Later your teammates'
 * Java backend can replace the inside of each function with a fetch() call.
 */
(function (global) {
  'use strict';

  const KEY = 'grocerystore_db_v1';
  const STATUS = { PENDING: 'Pending', ACTIVE: 'Being Delivered', DONE: 'Delivered' };

  class InsufficientStockError extends Error {
    constructor(productName, available) {
      super('Not enough stock for ' + productName + '. Available: ' + available);
      this.name = 'InsufficientStockError';
      this.available = available;
    }
  }

  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const copy = x => JSON.parse(JSON.stringify(x));

  // ---------- starting data ----------
  function seed() {
    const products = [
      [1, 'Bread', 'Bakery', 25000, 22, 10, 3, 5],
      [2, 'Milk', 'Dairy', 32000, 5, 10, 20, 2],
      [3, 'Eggs (10)', 'Dairy', 38000, 15, 10, 25, 10],
      [4, 'Rice 5kg', 'Dry goods', 120000, 8, 10, 200, 7],
      [5, 'Apple', 'Fruit', 45000, 30, 10, 6, 4],
      [6, 'Tomato', 'Vegetables', 28000, 40, 10, 5, 6],
      [7, 'Orange juice', 'Drinks', 35000, 25, 10, 60, 8],
      [8, 'Instant noodles', 'Dry goods', 6000, 60, 20, 180, 12],
      [9, 'Banana', 'Fruit', 22000, 18, 10, 4, 3]
    ].map(p => ({
      id: p[0], name: p[1], category: p[2], price: p[3], quantity: p[4], minStock: p[5],
      expirationDate: inDays(p[6]), restockDate: inDays(p[7])
    }));
    const byId = id => products.find(p => p.id === id);
    const mkOrder = (id, customerName, username, address, lines, status, daysAgo) => {
      const items = lines.map(l => ({ productId: l[0], name: byId(l[0]).name, price: byId(l[0]).price, qty: l[1] }));
      return {
        id, customerName, username, address, items, status,
        total: items.reduce((s, i) => s + i.price * i.qty, 0),
        date: inDays(-daysAgo)
      };
    };
    return {
      users: [
        { username: 'customer', password: '1', role: 'Customer', name: 'Demo Customer', phone: '0901234567', address: '28 Le Loi Street, District 1' },
        { username: 'manager', password: '1', role: 'Manager', name: 'An', phone: '0901234567' },
        { username: 'deliveryman', password: '1', role: 'Deliveryman', name: 'Ben', phone: '0905678901' }
      ],
      categories: [
        { name: 'Bakery', description: 'Bread, cakes and pastries' },
        { name: 'Dairy', description: 'Milk, eggs and cheese' },
        { name: 'Dry goods', description: 'Rice, noodles and pantry items' },
        { name: 'Fruit', description: 'Fresh fruit' },
        { name: 'Vegetables', description: 'Fresh vegetables' },
        { name: 'Drinks', description: 'Juice, water and soft drinks' }
      ],
      products,
      orders: [
        mkOrder('CA010203', 'Alice', 'customer', '28 Le Loi Street', [[1, 2], [2, 1]], STATUS.DONE, 3),
        mkOrder('CA010204', 'Binh', 'binh', '15 Nguyen Hue Street', [[4, 1], [3, 2]], STATUS.PENDING, 0),
        mkOrder('CA010205', 'Chau', 'chau', '102 Tran Hung Dao Street', [[5, 3]], STATUS.ACTIVE, 0)
      ],
      nextProductId: 10,
      orderCounter: 10205
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

  // ---------- UserDAO ----------
  const UserDAO = {
    async authenticate(username, password) {
      const u = read().users.find(x => x.username === String(username).toLowerCase());
      if (!u || u.password !== password) return null;
      const out = copy(u); delete out.password; return out;
    },
    async insert(user) {
      const db = read();
      const username = String(user.username).toLowerCase();
      if (db.users.some(u => u.username === username)) throw new Error('That username is already taken.');
      db.users.push(Object.assign({}, user, { username, role: 'Customer' }));
      write(db);
    },
    async update(user) {
      const db = read();
      const i = db.users.findIndex(u => u.username === user.username);
      if (i >= 0) { db.users[i] = Object.assign(db.users[i], user); write(db); }
    }
  };

  // ---------- ProductDAO ----------
  const ProductDAO = {
    async findAll() { return copy(read().products); },
    async search(keyword) {
      const k = String(keyword || '').toLowerCase().trim();
      return copy(read().products.filter(p => p.name.toLowerCase().includes(k)));
    },
    async insert(p) {
      const db = read();
      const product = Object.assign({ minStock: 10 }, p, { id: db.nextProductId++ });
      db.products.push(product); write(db); return copy(product);
    },
    async update(p) {
      const db = read();
      const i = db.products.findIndex(x => x.id === p.id);
      if (i >= 0) { Object.assign(db.products[i], p); write(db); }
    },
    async delete(id) {
      const db = read();
      db.products = db.products.filter(p => p.id !== id); write(db);
    },
    async updateStock(id, quantity) {
      const db = read();
      const p = db.products.find(x => x.id === id);
      if (p) { p.quantity = quantity; write(db); }
    },
    async restock(id, addQuantity, restockDate) {
      const db = read();
      const p = db.products.find(x => x.id === id);
      if (!p) return;
      p.quantity += addQuantity;
      if (restockDate) p.restockDate = restockDate;
      write(db);
    },
    async findCategories() { return copy(read().categories); },
    async insertCategory(c) {
      const db = read();
      if (db.categories.some(x => x.name.toLowerCase() === c.name.toLowerCase()))
        throw new Error('That category already exists.');
      db.categories.push({ name: c.name, description: c.description || '' }); write(db);
    },
    async deleteCategory(name) {
      const db = read();
      const used = db.products.filter(p => p.category === name).length;
      if (used > 0) throw new Error('Cannot delete "' + name + '": ' + used + ' product(s) still use it.');
      db.categories = db.categories.filter(c => c.name !== name); write(db);
    }
  };

  // ---------- OrderDAO ----------
  const OrderDAO = {
    async createOrder(order) {
      const db = read();
      const lines = order.items.map(it => {
        const p = db.products.find(x => x.id === it.productId);
        if (!p) throw new Error('That product no longer exists.');
        if (it.qty > p.quantity) throw new InsufficientStockError(p.name, p.quantity);
        return { p, qty: it.qty };
      });
      lines.forEach(l => { l.p.quantity -= l.qty; });
      db.orderCounter += 1;
      const items = lines.map(l => ({ productId: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty }));
      const created = {
        id: 'CA' + String(db.orderCounter).padStart(6, '0'),
        customerName: order.customerName, username: order.username, address: order.address,
        items, total: items.reduce((s, i) => s + i.price * i.qty, 0),
        status: STATUS.PENDING, date: iso(new Date())
      };
      db.orders.unshift(created);
      write(db);
      return copy(created);
    },
    async findAll() { return copy(read().orders); },
    async findByCustomer(username) { return copy(read().orders.filter(o => o.username === username)); },
    async updateStatus(id, newStatus) {
      const db = read();
      const o = db.orders.find(x => x.id === id);
      if (!o) return;
      const order = [STATUS.PENDING, STATUS.ACTIVE, STATUS.DONE];
      if (order.indexOf(newStatus) !== order.indexOf(o.status) + 1)
        throw new Error('An order must go Pending > Being Delivered > Delivered.');
      o.status = newStatus; write(db);
    }
  };

  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  global.DAO = { UserDAO, ProductDAO, OrderDAO, STATUS, InsufficientStockError, reset };
})(window);