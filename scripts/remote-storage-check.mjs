import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { openRemoteStorage } from '../storage-remote.mjs';

const seed = { shop: { name: 'Fixture' }, products: [{ id: 'fixture-item', status: 'active', stock: 4, variants: [], name: { en: 'Fixture item' } }] };
if (process.argv[2] === '--worker') {
  const url = 'file:' + process.argv[3].replaceAll('\\', '/');
  let storage = await openRemoteStorage(url, undefined, seed);
  const initial = await storage.catalog();
  const order = await storage.begin('buyer-a', [{ productId: 'fixture-item', variantId: null, name: 'Fixture item', sku: '', price: '5.00', quantity: 2 }], 'request-12345678');
  assert.equal((await storage.publicStore()).products[0].stock, 2, 'An active checkout must reserve remote stock.');
  await storage.complete(order.id, { status: 'COMPLETED', captureId: 'sandbox-capture' });
  const competing = await Promise.allSettled([
    storage.begin('buyer-b', [{ productId: 'fixture-item', variantId: null, name: 'Fixture item', sku: '', price: '5.00', quantity: 2 }], 'race-request-b123'),
    storage.begin('buyer-c', [{ productId: 'fixture-item', variantId: null, name: 'Fixture item', sku: '', price: '5.00', quantity: 2 }], 'race-request-c123')
  ]);
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent checkout requests must not oversell remote stock.');
  assert.equal(competing.filter(result => result.status === 'rejected').length, 1, 'The checkout that loses the final stock must be rejected.');
  const winner = competing.find(result => result.status === 'fulfilled').value;
  assert.equal((await storage.publicStore()).products[0].stock, 0, 'The winning checkout must hold the last available remote stock.');
  await storage.release(winner.id);
  const ticket = await storage.addTicket('buyer-a', 'question-123456', 'When will this arrive?', { productId: 'fixture-item', orderId: null, history: [] });
  await storage.replyTicket(ticket.id, 'The maker has not specified a date.', 'ANSWERED');
  assert.equal((await storage.catalog()).store.products[0].stock, 2, 'A completed checkout must deduct remote stock exactly once.');
  assert.notEqual(initial.revision, (await storage.catalog()).revision, 'Inventory changes must update the catalog revision.');
  storage.db.close();
  storage = await openRemoteStorage(url, undefined, seed);
  assert.equal((await storage.get(order.id)).status, 'COMPLETED', 'Orders must survive closing and reopening the remote database connection.');
  assert.equal((await storage.list('buyer-a')).length, 1);
  assert.equal((await storage.tickets('buyer-a'))[0].status, 'ANSWERED');
  assert.equal((await storage.publicStore()).products[0].stock, 2);
  assert.equal((await storage.metrics()).completed, 1);
  storage.db.close();
  console.log('PASS: optional libSQL adapter preserves checkout, inventory and buyer questions across database reopen.');
} else {
  const directory = await mkdtemp(join(tmpdir(), 'tradeweave-libsql-check-'));
  const database = join(directory, 'remote.sqlite');
  const databaseUrl = 'file:' + database.replaceAll('\\', '/');
  const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const serverPath = join(appRoot, 'server.mjs');
  let running;
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', database], { stdio: 'inherit', windowsHide: true });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, 'The isolated remote storage checks must pass.');

    const startServer = async () => {
      const server = spawn(process.execPath, [serverPath], { cwd: appRoot, env: { ...process.env, HOST: '127.0.0.1', PORT: '0', ENV_FILE: join(directory, 'empty.env'), DATA_DIR: join(directory, 'unused-local-data'), MEDIA_DIR: join(directory, 'media'), TURSO_DATABASE_URL: databaseUrl, TURSO_AUTH_TOKEN: 'local-protocol-test-token', AI_API_KEY: '', AI_MODEL: '', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let output = '';
      server.stdout.setEncoding('utf8'); server.stderr.setEncoding('utf8');
      server.stdout.on('data', chunk => { output += chunk; }); server.stderr.on('data', chunk => { output += chunk; });
      const port = await new Promise((resolvePort, reject) => {
        const timeout = setTimeout(() => reject(new Error('Remote-storage server did not start. ' + output)), 10000);
        const check = () => { const match = output.match(/TradeWeave is ready on port (\d+)/); if (match) { clearTimeout(timeout); resolvePort(Number(match[1])); } };
        server.stdout.on('data', check);
        server.once('error', error => { clearTimeout(timeout); reject(error); });
        server.once('exit', code => { if (!output.includes('TradeWeave is ready on port ')) { clearTimeout(timeout); reject(new Error('Remote-storage server exited before listening (code ' + code + '). ' + output)); } });
        check();
      });
      return { server, base: 'http://127.0.0.1:' + port, stop: async () => { if (server.exitCode === null && server.signalCode === null) { server.kill(); await once(server, 'exit'); } } };
    };
    running = await startServer();
    const submitted = await fetch(running.base + '/api/buyer/ticket', { method: 'POST', headers: { 'content-type': 'application/json', origin: running.base }, body: JSON.stringify({ productId: 'fixture-item', question: 'Will it arrive Friday?', requestKey: 'server-test-123456', history: [] }) });
    assert.equal(submitted.status, 200, 'The server must await and save a ticket through the configured remote store.');
    const cookie = submitted.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie, 'A buyer owner cookie must be issued for remote-store questions.');
    const created = await submitted.json();
    await running.stop();
    running = await startServer();
    const refreshed = await fetch(running.base + '/api/buyer/tickets', { headers: { cookie } });
    assert.equal(refreshed.status, 200, 'The restarted server must serve buyer-owned questions from the remote store.');
    assert.equal((await refreshed.json()).tickets.find(ticket => ticket.id === created.id)?.question, 'Will it arrive Friday?');
    await running.stop();
    console.log('PASS: server routes await remote storage and retain a buyer question across app restart.');
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
}
