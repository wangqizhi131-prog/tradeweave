import { createClient } from '@libsql/client';
import { randomUUID, createHash } from 'node:crypto';

const revision = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }

// Remote libSQL storage for hosted instances whose local filesystem is ephemeral.
export async function openRemoteStorage(url, authToken, seed) {
  const db = createClient({ url, authToken, intMode: 'number' });
  await db.execute('PRAGMA foreign_keys=ON');
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS catalog (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, revision TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, paypal_id TEXT UNIQUE, owner TEXT NOT NULL, request_key TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(owner,request_key));
    CREATE TABLE IF NOT EXISTS holds (order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL, variant_id TEXT NOT NULL, quantity INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(order_id,product_id,variant_id));
    CREATE TABLE IF NOT EXISTS metrics (key TEXT PRIMARY KEY, count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(owner,request_key));
    CREATE TABLE IF NOT EXISTS media (hash TEXT PRIMARY KEY, content_type TEXT NOT NULL, bytes BLOB NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_owner ON orders(owner,created_at);
  `);
  if (!(await db.execute('SELECT id FROM catalog WHERE id=1')).rows.length) {
    await db.execute({ sql: 'INSERT INTO catalog VALUES (1,?,?)', args: [JSON.stringify(seed), revision(seed)] });
  }
  const transaction = async fn => {
    const tx = await db.transaction('write');
    try { const value = await fn(tx); await tx.commit(); return value; }
    catch (error) { await tx.rollback(); throw error; }
  };
  const rows = async (conn, sql, args = []) => (await conn.execute({ sql, args })).rows;
  const catalog = async (conn = db) => {
    const row = (await rows(conn, 'SELECT data,revision FROM catalog WHERE id=1'))[0];
    return { store: JSON.parse(row.data), revision: row.revision };
  };
  const writeCatalog = async (conn, data) => conn.execute({ sql: 'UPDATE catalog SET data=?, revision=? WHERE id=1', args: [JSON.stringify(data), revision(data)] });
  const get = async (id, conn = db) => {
    const row = (await rows(conn, 'SELECT data FROM orders WHERE id=? OR paypal_id=?', [id, id]))[0];
    return row ? JSON.parse(row.data) : null;
  };
  const put = (conn, order) => conn.execute({ sql: 'UPDATE orders SET paypal_id=?,state=?,data=? WHERE id=?', args: [order.orderId || null, order.status, JSON.stringify(order), order.id] });
  const held = async (productId, variantId = '', except = '', conn = db) => Number((await rows(conn, 'SELECT COALESCE(SUM(quantity),0) AS count FROM holds WHERE product_id=? AND variant_id=? AND expires_at>? AND order_id<>?', [productId, variantId || '', Date.now(), except]))[0].count);
  const expire = conn => conn.execute({ sql: 'DELETE FROM holds WHERE expires_at<?', args: [Date.now()] });
  async function reserve(conn, order, indefinite = false) {
    await expire(conn);
    const current = (await catalog(conn)).store;
    for (const item of order.items) {
      const product = current.products.find(p => p.id === item.productId), variant = product?.variants.find(v => v.id === item.variantId);
      const onHand = item.variantId ? variant?.stock : product?.stock;
      if (onHand === undefined || onHand - await held(item.productId, item.variantId, order.id, conn) < item.quantity) fail(409, 'An item no longer has enough stock. No new payment capture was started. Review the cart.');
    }
    for (const item of order.items) await conn.execute({ sql: 'INSERT INTO holds VALUES (?,?,?,?,?) ON CONFLICT(order_id,product_id,variant_id) DO UPDATE SET expires_at=excluded.expires_at,quantity=excluded.quantity', args: [order.id, item.productId, item.variantId || '', item.quantity, indefinite ? 8640000000000000 : Date.now() + 2 * 60 * 60 * 1000] });
  }
  return {
    db, catalog,
    async putMedia(hash, contentType, bytes) { await db.execute({ sql: 'INSERT INTO media VALUES (?,?,?) ON CONFLICT(hash) DO NOTHING', args: [hash, contentType, bytes] }); },
    async getMedia(hash) { const row = (await rows(db, 'SELECT content_type,bytes FROM media WHERE hash=?', [hash]))[0]; return row ? { contentType: row.content_type, bytes: Buffer.from(row.bytes) } : null; },
    get,
    held,
    async bump(key) { await db.execute({ sql: 'INSERT INTO metrics VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1', args: [key] }); },
    async metrics() { const values = Object.fromEntries((await rows(db, 'SELECT key,count FROM metrics')).map(row => [row.key, Number(row.count)])); return { answers: values.buyerAnswers || 0, checkouts: Number((await rows(db, 'SELECT COUNT(*) AS count FROM orders WHERE paypal_id IS NOT NULL'))[0].count), completed: Number((await rows(db, "SELECT COUNT(*) AS count FROM orders WHERE state='COMPLETED'"))[0].count) }; },
    async tickets(owner) { return (await rows(db, owner ? 'SELECT data FROM tickets WHERE owner=? ORDER BY created_at DESC LIMIT 100' : 'SELECT data FROM tickets ORDER BY created_at DESC LIMIT 500', owner ? [owner] : [])).map(row => JSON.parse(row.data)); },
    async addTicket(owner, requestKey, question, context) { return transaction(async tx => { const prior = (await rows(tx, 'SELECT data FROM tickets WHERE owner=? AND request_key=?', [owner, requestKey]))[0]; if (prior) { const ticket = JSON.parse(prior.data); if (ticket.question !== question || ticket.productId !== context.productId || ticket.orderId !== context.orderId || JSON.stringify(ticket.history || []) !== JSON.stringify(context.history || [])) fail(409, 'This question reference was already used. Refresh your questions before sending another.'); return ticket; } const now = new Date().toISOString(), ticket = { id: randomUUID(), owner, question, ...context, status: 'OPEN', reply: '', createdAt: now, updatedAt: now }; await tx.execute({ sql: 'INSERT INTO tickets VALUES (?,?,?,?,?)', args: [ticket.id, owner, requestKey, JSON.stringify(ticket), Date.now()] }); return ticket; }); },
    async replyTicket(id, reply, status) { return transaction(async tx => { const row = (await rows(tx, 'SELECT data FROM tickets WHERE id=?', [id]))[0]; if (!row) fail(404, 'Question not found.'); const ticket = { ...JSON.parse(row.data), reply, status, updatedAt: new Date().toISOString() }; await tx.execute({ sql: 'UPDATE tickets SET data=? WHERE id=?', args: [JSON.stringify(ticket), id] }); return ticket; }); },
    async findRequest(owner, key) { const row = (await rows(db, 'SELECT data FROM orders WHERE owner=? AND request_key=?', [owner, key]))[0]; return row ? JSON.parse(row.data) : null; },
    async saveCatalog(next, expected) { return transaction(async tx => {
      if ((await catalog(tx)).revision !== expected) fail(409, 'The catalog changed. Reload the latest details before saving.');
      for (const old of (await catalog(tx)).store.products) {
        const product = next.products.find(p => p.id === old.id);
        if (await held(old.id, '', '', tx) && (!product || product.variants.length || product.stock < await held(old.id, '', '', tx))) fail(409, 'This product has reserved stock. Keep enough stock until its checkouts are resolved.');
        for (const option of old.variants) if (await held(old.id, option.id, '', tx)) { const updated = product?.variants.find(v => v.id === option.id); if (!updated || updated.stock < await held(old.id, option.id, '', tx)) fail(409, 'A variant has reserved stock. Resolve its checkouts before removing it or reducing stock below the reservation.'); }
      }
      await writeCatalog(tx, next); return catalog(tx);
    }); },
    async publicStore() { const value = (await catalog()).store; return { ...value, products: await Promise.all(value.products.filter(p => p.status === 'active').map(async p => { const variants = await Promise.all(p.variants.map(async v => ({ ...v, stock: Math.max(0, v.stock - await held(p.id, v.id)) }))); return { ...p, variants, stock: variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : Math.max(0, p.stock - await held(p.id)) }; })) }; },
    async begin(owner, items, requestKey) { return transaction(async tx => {
      const row = (await rows(tx, 'SELECT data FROM orders WHERE owner=? AND request_key=?', [owner, requestKey]))[0];
      if (row) { const order = JSON.parse(row.data); if (JSON.stringify(order.items.map(i => [i.productId,i.variantId,i.quantity])) !== JSON.stringify(items.map(i => [i.productId,i.variantId,i.quantity]))) fail(409, 'Use a new checkout reference for a changed cart.'); return order; }
      const now = new Date().toISOString(), amount = (items.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0) / 100).toFixed(2);
      const order = { id: randomUUID(), owner, requestKey, checkoutToken: randomUUID(), orderId: null, status: 'CREATING', amount, currency: 'USD', items, quantity: items.reduce((sum, i) => sum + i.quantity, 0), productName: items.length === 1 ? items[0].name : items.length + ' products', productId: items.length === 1 ? items[0].productId : 'cart', variantId: items.length === 1 ? items[0].variantId : null, createdAt: now, updatedAt: now, fulfillment: 'UNFULFILLED', events: [{ at: now, text: 'Checkout snapshot created.' }] };
      await tx.execute({ sql: 'INSERT INTO orders VALUES (?,?,?,?,?,?,?)', args: [order.id, null, owner, requestKey, order.status, JSON.stringify(order), Date.now()] }); await reserve(tx, order); return order;
    }); },
    async update(id, changes, event) { return transaction(async tx => { const order = await get(id, tx); if (!order) fail(404, 'Order not found.'); Object.assign(order, changes, { updatedAt: new Date().toISOString() }); if (event) order.events.push({ at: order.updatedAt, text: event }); await put(tx, order); return order; }); },
    async prepareCapture(id) { return transaction(async tx => { const order = await get(id, tx); if (!order) fail(404, 'Order not found.'); if (order.status === 'COMPLETED') return order; if (['CANCELLED', 'FAILED', 'DECLINED', 'DENIED'].includes(order.status)) fail(409, 'This checkout is closed. Start a new checkout.'); await reserve(tx, order, true); order.status = 'CAPTURE_PENDING'; order.updatedAt = new Date().toISOString(); await put(tx, order); return order; }); },
    async complete(id, result) { return transaction(async tx => {
      const order = await get(id, tx); if (!order) fail(404, 'Order not found.');
      if (['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(result.status) && !order.inventoryApplied) {
        const value = (await catalog(tx)).store;
        for (const item of order.items) { const product = value.products.find(p => p.id === item.productId), variant = product?.variants.find(v => v.id === item.variantId); if (variant) { variant.stock = Math.max(0, variant.stock - item.quantity); product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0); } else if (product && !item.variantId) product.stock = Math.max(0, product.stock - item.quantity); }
        await writeCatalog(tx, value); order.inventoryApplied = true;
      }
      Object.assign(order, result, { updatedAt: new Date().toISOString() });
      if (['COMPLETED', 'DECLINED', 'DENIED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.status)) await tx.execute({ sql: 'DELETE FROM holds WHERE order_id=?', args: [order.id] });
      if (order.events.at(-1)?.text !== 'PayPal returned ' + result.status + '.') order.events.push({ at: order.updatedAt, text: 'PayPal returned ' + result.status + '.' });
      await put(tx, order); return order;
    }); },
    async release(id, status = 'CANCELLED') { return transaction(async tx => { const order = await get(id, tx); if (!order) fail(404, 'Order not found.'); if (['CAPTURE_PENDING', 'PENDING', 'COMPLETED'].includes(order.status)) fail(409, 'Reconcile this payment before cancelling its reservation.'); order.status = status; order.updatedAt = new Date().toISOString(); await tx.execute({ sql: 'DELETE FROM holds WHERE order_id=?', args: [order.id] }); await put(tx, order); return order; }); },
    async list(owner) { return (await rows(db, owner ? 'SELECT data FROM orders WHERE owner=? ORDER BY created_at DESC LIMIT 200' : 'SELECT data FROM orders ORDER BY created_at DESC LIMIT 500', owner ? [owner] : [])).map(row => JSON.parse(row.data)); },
    async fulfill(id, tracking) { return transaction(async tx => { const order = await get(id, tx); if (!order) fail(404, 'Order not found.'); if (order.status !== 'COMPLETED') fail(409, 'Only a completed payment can be marked fulfilled.'); if (order.fulfillment === 'FULFILLED' && order.tracking === tracking) return order; order.fulfillment = 'FULFILLED'; order.tracking = tracking; order.updatedAt = new Date().toISOString(); order.events.push({ at: order.updatedAt, text: 'Merchant marked the sandbox order fulfilled.' }); await put(tx, order); return order; }); }
  };
}
