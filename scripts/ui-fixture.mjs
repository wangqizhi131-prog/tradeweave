// Disposable browser fixture. REST calls are simulated; --sdk-render loads PayPal's public script only.
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { normalizeStore } from '../catalog.mjs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdir } from 'node:fs/promises';
import { openStorage } from '../storage.mjs';
import { simulatedAssistantResponse } from './fixtures/simulated-ai.mjs';

const payments = process.argv.includes('--payments'), renderSdk = process.argv.includes('--sdk-render');
const failAiOnce = process.argv.includes('--ai-failure-once');
if (payments && renderSdk) throw new Error('Choose the simulated adapter or official SDK render check, not both.');
const portArguments = process.argv.filter(argument => argument.startsWith('--port='));
if (portArguments.length > 1) throw new Error('Pass at most one --port=NUMBER option.');
const fixturePort = portArguments.length ? Number(portArguments[0].slice('--port='.length)) : 4174;
if (!Number.isInteger(fixturePort) || fixturePort < 4174 || fixturePort > 65535) throw new Error('Fixture port must be an integer from 4174 through 65535.');
const temporary = await mkdtemp(join(tmpdir(), 'tradeweave-ui-'));
const orders = new Map(), requests = new Map();
let orderCount = 0, captureCount = 0, aiCount = 0;
const seed = normalizeStore(JSON.parse(await readFile(new URL('../store-data.json', import.meta.url), 'utf8')));
const second = structuredClone(seed.products[0]);
second.id = 'fixture-options';
second.name = { en: 'Nanjing Woven Market Tote', zh: '南京手织市集包' };
second.subtitle = { en: 'A useful carryall, made slowly.', zh: '慢慢织成，日常好用。' };
second.description = { en: 'A handwoven cotton carryall for small everyday finds.', zh: '手工编织棉布，适合收纳日常随身物品。' };
second.images = [];
second.variants = [{ id: 'fixture-small', name: { en: 'Small', zh: '小号' }, sku: 'UI-S', price: '12.50', stock: 2 }, { id: 'fixture-large', name: { en: 'Large', zh: '大号' }, sku: 'UI-L', price: '18.00', stock: 3 }];
second.stock = 5; second.price = '12.50'; seed.products.push(second);
const edgeCases = process.argv.includes('--edge-cases');
if (edgeCases) {
  const product = seed.products[0], media = join(temporary, 'media'); await mkdir(media);
  product.name = { en: 'W'.repeat(100), zh: '测'.repeat(100) };
  product.description = { en: ('Long description for interface verification. ').repeat(40).slice(0, 1200), zh: '仅用于长文本界面验证。'.repeat(120).slice(0, 1200) };
  product.variants = Array.from({ length: 12 }, (_, index) => ({ id: 'edge-option-' + index, name: { en: ('Option ' + (index + 1) + ' ' + 'V'.repeat(60)).slice(0, 60), zh: ('规格' + (index + 1) + '测'.repeat(60)).slice(0, 60) }, sku: 'EDGE-' + index, price: (100 + index).toFixed(2), stock: 1 }));
  product.stock = 12; product.price = '100.00'; product.images = [];
  // Six distinct, valid 1px PNGs exercise upload/gallery layout without third-party assets.
  const crc32 = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, crc]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  for (let index = 0; index < 6; index++) {
    const shade = 80 + index * 25, bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, shade, shade, shade, 255]))), chunk('IEND', Buffer.alloc(0))]);
    const filename = createHash('sha256').update(bytes).digest('hex') + '.png'; await writeFile(join(media, filename), bytes); product.images.push('/media/' + filename);
  }
  const storage = openStorage(temporary, seed);
  storage.addTicket('fixture-edge-owner', 'edge-question-001', '长问题测试'.repeat(400).slice(0, 2000), { productId: product.id, productName: product.name.en, orderId: null, history: [] }); storage.db.close();
}
await writeFile(join(temporary, 'store-data.json'), JSON.stringify(seed));
Object.assign(process.env, { ENV_FILE: join(temporary, 'absent.env'), DISABLE_LOCAL_EDITOR: '0', PORT: String(fixturePort), HOST: '127.0.0.1', DATA_DIR: temporary, STORE_FILE: join(temporary, 'store-data.json'), MEDIA_DIR: join(temporary, 'media'), PAYPAL_CLIENT_ID: renderSdk ? 'sb' : payments ? 'fixture-client' : '', PAYPAL_CLIENT_SECRET: payments || renderSdk ? 'fixture-secret' : '', AI_API_KEY: 'isolated-ui-response', AI_MODEL: 'fixture', AI_API_URL: 'https://fixture.invalid/ai' });
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target === 'https://fixture.invalid/ai') { aiCount++; if (failAiOnce && aiCount === 1) return new Response(JSON.stringify({ error: { message: 'SECRET_FIXTURE_PROVIDER_DETAIL_MUST_NOT_LEAK' } }), { status: 429, headers: { 'content-type': 'application/json' } }); return json(simulatedAssistantResponse(options.body)); }
  if (!payments || !target.startsWith('https://api-m.sandbox.paypal.com/')) throw new Error('Fixture blocks provider traffic.');
  if (target.endsWith('/v1/oauth2/token')) return json({ access_token: 'fixture-token' });
  if (target.endsWith('/v2/checkout/orders')) {
    const key = options.headers['paypal-request-id']; if (requests.has(key)) return json({ id: requests.get(key), status: 'CREATED' });
    const id = 'UIORDER' + String(++orderCount).padStart(8, '0'), data = JSON.parse(options.body); orders.set(id, { ...data, id, status: 'CREATED', mode: 'COMPLETED' }); requests.set(key, id); return json({ id, status: 'CREATED' });
  }
  const capture = target.endsWith('/capture'), id = target.split('/').at(capture ? -2 : -1), order = orders.get(id);
  if (!order) throw new Error('Unknown fixture order.');
  if (capture) {
    if (order.status !== 'APPROVED') throw new Error('Fixture order was not approved.'); captureCount++;
    const unit = order.purchase_units[0], status = order.mode === 'LOST' ? 'COMPLETED' : order.mode;
    order.status = status === 'PENDING' ? 'COMPLETED' : status;
    unit.payments = { captures: [{ id: 'CAPTURE' + id, status, amount: unit.amount }] };
    if (order.mode === 'LOST') throw new Error('Fixture dropped the response after recording capture.');
  }
  return json(order);
};
const { server } = await import('../server.mjs');
if (payments || renderSdk) {
  const app = server.listeners('request')[0]; server.removeListener('request', app);
  server.on('request', async (req, res) => {
    const fixtureOrigin = 'http://127.0.0.1:' + fixturePort;
    const path = new URL(req.url, fixtureOrigin).pathname;
    if (req.method === 'GET' && ['/shop', '/shop/'].includes(path)) {
      let html = await readFile(new URL('../storefront.html', import.meta.url), 'utf8');
      html = payments ? html.replace('<script src="/storefront.js', '<script src="/fixture-paypal.js"></script><script src="/storefront.js') : html.replace('<body class="shop-body">', '<body class="shop-body"><aside class="shop-preview">OFFICIAL SDK RENDER CHECK · public sandbox ID · order creation and capture disabled</aside>');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html);
    }
    if (renderSdk && ['/api/paypal/order', '/api/paypal/capture', '/api/paypal/reconcile', '/api/paypal/cancel', '/fixture/payment', '/fixture-paypal.js'].includes(path)) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Official SDK render check only. No orders or captures are allowed in this fixture.' })); }
    if (req.method === 'GET' && path === '/fixture-paypal.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return res.end(await readFile(new URL('./fixtures/paypal-ui.js', import.meta.url))); }
    if (req.method === 'POST' && path === '/fixture/payment') {
      if (req.headers.origin !== fixtureOrigin) { res.writeHead(403); return res.end(); }
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1000) { res.writeHead(413); return res.end(); } }
      try {
        const input = JSON.parse(raw);
        if (input.completePending) for (const order of orders.values()) { const capture = order.purchase_units[0].payments?.captures?.[0]; if (capture?.status === 'PENDING') capture.status = 'COMPLETED'; }
        else { const order = orders.get(input.id); if (!order || !['COMPLETED', 'PENDING', 'DECLINED', 'LOST'].includes(input.mode)) throw new Error('Invalid fixture input'); order.status = 'APPROVED'; order.mode = input.mode; order.purchase_units[0].shipping = { name: { full_name: 'Simulated Browser Buyer' }, address: { address_line_1: '1 Fixture Street', country_code: 'US' } }; }
        res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ orders: orderCount, captureRequests: captureCount }));
      } catch { res.writeHead(400); return res.end(); }
    }
    app(req, res);
  });
}
let closing = false;
let closePromise = null, exitCode = 0;
async function close(code = 0) {
  if (code > exitCode) exitCode = code;
  if (closePromise) return closePromise;
  if (closing) return; closing = true;
  closePromise = (async () => {
    const serverClosed = new Promise(resolve => {
      try { server.close(error => resolve(error)); }
      catch (error) { resolve(error); }
    });
    server.closeAllConnections?.();
    await serverClosed;
    if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith('tradeweave-ui-')) throw new Error('Unexpected fixture cleanup target');
    await rm(temporary, { recursive: true, force: true }); process.exit(exitCode);
  })();
  return closePromise;
}
function requestClose(code = 0) { void close(code).catch(error => { console.error('Fixture cleanup failed:', error.message); process.exit(1); }); }
server.on('error', error => {
  console.error('Fixture could not listen on port ' + fixturePort + ': ' + (error.code || 'server error'));
  process.stdin.pause(); requestClose(1);
});
process.on('SIGINT', () => requestClose()); process.on('SIGTERM', () => requestClose());
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => { if (input.trim().toLowerCase() === 'q') requestClose(); });
process.stdin.on('end', () => requestClose());
console.log('Disposable UI fixture at http://127.0.0.1:' + fixturePort + ' — simulated AI' + (failAiOnce ? ' (first request fails, retry succeeds)' : '') + '; ' + (renderSdk ? 'official public sandbox SDK render only; REST payment routes disabled.' : payments ? 'simulated payment adapter (not PayPal SDK).' : 'PayPal disabled.'));
console.log('Stop with Ctrl+C, type q and press Enter, or close the launcher input to close the server and remove its temporary data.');
console.log('Fixture data: ' + temporary);
