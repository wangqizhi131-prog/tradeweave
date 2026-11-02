import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const revision = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
export function openStorage(directory, seed) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'tradeweave.sqlite'), { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS catalog (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, revision TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, paypal_id TEXT UNIQUE, owner TEXT NOT NULL, request_key TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(owner,request_key));
    CREATE TABLE IF NOT EXISTS holds (order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL, variant_id TEXT NOT NULL, quantity INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(order_id,product_id,variant_id));
    CREATE TABLE IF NOT EXISTS metrics (key TEXT PRIMARY KEY, count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(owner,request_key));
    CREATE TABLE IF NOT EXISTS media (hash TEXT PRIMARY KEY, content_type TEXT NOT NULL, bytes BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_owner ON orders(owner,created_at);`);
  if (!db.prepare('SELECT id FROM catalog WHERE id=1').get()) db.prepare('INSERT INTO catalog VALUES (1,?,?)').run(JSON.stringify(seed), revision(seed));
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const catalog = () => { const row = db.prepare('SELECT data,revision FROM catalog WHERE id=1').get(); return { store: JSON.parse(row.data), revision: row.revision }; };
  const writeCatalog = data => db.prepare('UPDATE catalog SET data=?, revision=? WHERE id=1').run(JSON.stringify(data), revision(data));
  const get = id => { const row = db.prepare('SELECT data FROM orders WHERE id=? OR paypal_id=?').get(id, id); return row ? JSON.parse(row.data) : null; };
  const put = order => db.prepare('UPDATE orders SET paypal_id=?,state=?,data=? WHERE id=?').run(order.orderId || null, order.status, JSON.stringify(order), order.id);
  const held = (productId, variantId = '', except = '') => Number(db.prepare('SELECT COALESCE(SUM(quantity),0) AS count FROM holds WHERE product_id=? AND variant_id=? AND expires_at>? AND order_id<>?').get(productId, variantId || '', Date.now(), except).count);
  const expire = () => db.prepare('DELETE FROM holds WHERE expires_at<?').run(Date.now());
  function reserve(order, indefinite = false) {
    expire(); const current = catalog().store;
    for (const item of order.items) {
      const product = current.products.find(p => p.id === item.productId), variant = product?.variants.find(v => v.id === item.variantId);
      const onHand = item.variantId ? variant?.stock : product?.stock;
      if (onHand === undefined || onHand - held(item.productId, item.variantId, order.id) < item.quantity) fail(409, 'An item no longer has enough stock. No new payment capture was started. Review the cart.');
    }
    for (const item of order.items) db.prepare('INSERT INTO holds VALUES (?,?,?,?,?) ON CONFLICT(order_id,product_id,variant_id) DO UPDATE SET expires_at=excluded.expires_at,quantity=excluded.quantity').run(order.id, item.productId, item.variantId || '', item.quantity, indefinite ? 8640000000000000 : Date.now() + 2 * 60 * 60 * 1000);
  }
  return {
    db, catalog, get, held,
    putMedia(hash, contentType, bytes) { db.prepare('INSERT INTO media VALUES (?,?,?) ON CONFLICT(hash) DO NOTHING').run(hash, contentType, bytes); },
    getMedia(hash) { const row = db.prepare('SELECT content_type,bytes FROM media WHERE hash=?').get(hash); return row ? { contentType: row.content_type, bytes: Buffer.from(row.bytes) } : null; },
    bump(key) { db.prepare('INSERT INTO metrics VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key); },
    metrics() { return { answers: Number(db.prepare("SELECT count FROM metrics WHERE key='buyerAnswers'").get()?.count || 0), checkouts: Number(db.prepare('SELECT COUNT(*) AS count FROM orders WHERE paypal_id IS NOT NULL').get().count), completed: Number(db.prepare("SELECT COUNT(*) AS count FROM orders WHERE state='COMPLETED'").get().count) }; },
    tickets(owner) { return db.prepare(owner ? 'SELECT data FROM tickets WHERE owner=? ORDER BY created_at DESC LIMIT 100' : 'SELECT data FROM tickets ORDER BY created_at DESC LIMIT 500').all(...(owner ? [owner] : [])).map(row => JSON.parse(row.data)); },
    addTicket(owner, requestKey, question, context) { return transaction(() => { const prior = db.prepare('SELECT data FROM tickets WHERE owner=? AND request_key=?').get(owner, requestKey); if (prior) { const ticket = JSON.parse(prior.data); if (ticket.question !== question || ticket.productId !== context.productId || ticket.orderId !== context.orderId || JSON.stringify(ticket.history || []) !== JSON.stringify(context.history || [])) fail(409, 'This question reference was already used. Refresh your questions before sending another.'); return ticket; } const now = new Date().toISOString(), ticket = { id: randomUUID(), owner, question, ...context, status: 'OPEN', reply: '', createdAt: now, updatedAt: now }; db.prepare('INSERT INTO tickets VALUES (?,?,?,?,?)').run(ticket.id, owner, requestKey, JSON.stringify(ticket), Date.now()); return ticket; }); },
    replyTicket(id, reply, status) { return transaction(() => { const row = db.prepare('SELECT data FROM tickets WHERE id=?').get(id); if (!row) fail(404, 'Question not found.'); const ticket = { ...JSON.parse(row.data), reply, status, updatedAt: new Date().toISOString() }; db.prepare('UPDATE tickets SET data=? WHERE id=?').run(JSON.stringify(ticket), id); return ticket; }); },
    findRequest(owner, key) { const row = db.prepare('SELECT data FROM orders WHERE owner=? AND request_key=?').get(owner, key); return row ? JSON.parse(row.data) : null; },
    saveCatalog(next, expected) { return transaction(() => {
      if (catalog().revision !== expected) fail(409, 'The catalog changed. Reload the latest details before saving.');
      for (const old of catalog().store.products) {
        const product = next.products.find(p => p.id === old.id);
        if (held(old.id) && (!product || product.variants.length || product.stock < held(old.id))) fail(409, 'This product has reserved stock. Keep enough stock until its checkouts are resolved.');
        for (const option of old.variants) if (held(old.id, option.id)) { const updated = product?.variants.find(v => v.id === option.id); if (!updated || updated.stock < held(old.id, option.id)) fail(409, 'A variant has reserved stock. Resolve its checkouts before removing it or reducing stock below the reservation.'); }
      }
      writeCatalog(next); return catalog();
    }); },
    publicStore() { const value = catalog().store; return { ...value, products: value.products.filter(p => p.status === 'active').map(p => { const variants = p.variants.map(v => ({ ...v, stock: Math.max(0, v.stock - held(p.id, v.id)) })); return { ...p, variants, stock: variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : Math.max(0, p.stock - held(p.id)) }; }) }; },
    begin(owner, items, requestKey) { return transaction(() => {
      const row = db.prepare('SELECT data FROM orders WHERE owner=? AND request_key=?').get(owner, requestKey);
      if (row) { const order = JSON.parse(row.data); if (JSON.stringify(order.items.map(i => [i.productId,i.variantId,i.quantity])) !== JSON.stringify(items.map(i => [i.productId,i.variantId,i.quantity]))) fail(409, 'Use a new checkout reference for a changed cart.'); return order; }
      const now = new Date().toISOString(), amount = (items.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0) / 100).toFixed(2);
      const order = { id: randomUUID(), owner, requestKey, checkoutToken: randomUUID(), orderId: null, status: 'CREATING', amount, currency: 'USD', items, quantity: items.reduce((sum, i) => sum + i.quantity, 0), productName: items.length === 1 ? items[0].name : items.length + ' products', productId: items.length === 1 ? items[0].productId : 'cart', variantId: items.length === 1 ? items[0].variantId : null, createdAt: now, updatedAt: now, fulfillment: 'UNFULFILLED', events: [{ at: now, text: 'Checkout snapshot created.' }] };
      db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?)').run(order.id, null, owner, requestKey, order.status, JSON.stringify(order), Date.now()); reserve(order); return order;
    }); },
    update(id, changes, event) { return transaction(() => { const order = get(id); if (!order) fail(404, 'Order not found.'); Object.assign(order, changes, { updatedAt: new Date().toISOString() }); if (event) order.events.push({ at: order.updatedAt, text: event }); put(order); return order; }); },
    prepareCapture(id) { return transaction(() => { const order = get(id); if (!order) fail(404, 'Order not found.'); if (order.status === 'COMPLETED') return order; if (['CANCELLED', 'FAILED', 'DECLINED', 'DENIED'].includes(order.status)) fail(409, 'This checkout is closed. Start a new checkout.'); reserve(order, true); order.status = 'CAPTURE_PENDING'; order.updatedAt = new Date().toISOString(); put(order); return order; }); },
    complete(id, result) { return transaction(() => {
      const order = get(id); if (!order) fail(404, 'Order not found.');
      if (['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(result.status) && !order.inventoryApplied) {
        const value = catalog().store;
        for (const item of order.items) {
          const product = value.products.find(p => p.id === item.productId), variant = product?.variants.find(v => v.id === item.variantId);
          if (variant) { variant.stock = Math.max(0, variant.stock - item.quantity); product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0); }
          else if (product && !item.variantId) product.stock = Math.max(0, product.stock - item.quantity);
        }
        writeCatalog(value); order.inventoryApplied = true;
      }
      Object.assign(order, result, { updatedAt: new Date().toISOString() });
      if (['COMPLETED', 'DECLINED', 'DENIED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.status)) db.prepare('DELETE FROM holds WHERE order_id=?').run(order.id);
      if (order.events.at(-1)?.text !== 'PayPal returned ' + result.status + '.') order.events.push({ at: order.updatedAt, text: 'PayPal returned ' + result.status + '.' });
      put(order); return order;
    }); },
    release(id, status = 'CANCELLED') { return transaction(() => { const order = get(id); if (!order) fail(404, 'Order not found.'); if (['CAPTURE_PENDING', 'PENDING', 'COMPLETED'].includes(order.status)) fail(409, 'Reconcile this payment before cancelling its reservation.'); order.status = status; order.updatedAt = new Date().toISOString(); db.prepare('DELETE FROM holds WHERE order_id=?').run(order.id); put(order); return order; }); },
    list(owner) { return db.prepare(owner ? 'SELECT data FROM orders WHERE owner=? ORDER BY created_at DESC LIMIT 200' : 'SELECT data FROM orders ORDER BY created_at DESC LIMIT 500').all(...(owner ? [owner] : [])).map(row => JSON.parse(row.data)); },
    fulfill(id, tracking) { return transaction(() => { const order = get(id); if (!order) fail(404, 'Order not found.'); if (order.status !== 'COMPLETED') fail(409, 'Only a completed payment can be marked fulfilled.'); if (order.fulfillment === 'FULFILLED' && order.tracking === tracking) return order; order.fulfillment = 'FULFILLED'; order.tracking = tracking; order.updatedAt = new Date().toISOString(); order.events.push({ at: order.updatedAt, text: 'Merchant marked the sandbox order fulfilled.' }); put(order); return order; }); }
  };
}
