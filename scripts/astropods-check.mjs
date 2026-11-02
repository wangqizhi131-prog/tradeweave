import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createGatewayBridge } from '../integrations/astropods/agent/bridge.mjs';

const env = { ASTRO_GATEWAY_URL: 'https://gateway.invalid/', ASTRO_GATEWAY_API_KEY: 'synthetic-managed-secret', MODEL_DEFAULT: 'claude-haiku-4-5', TRADEWEAVE_BRIDGE_KEY: 'synthetic-local-key-for-check-only' };
let mode = 'OK', calls = [], releaseHeld, signalHeld;
const held = new Promise(resolve => { signalHeld = resolve; });
const upstream = async (url, options) => {
  calls.push({ url, options });
  if (mode === 'HOLD') { signalHeld(); await new Promise(resolve => { releaseHeld = resolve; }); }
  if (mode === 'THROW') throw Object.assign(new Error(env.ASTRO_GATEWAY_API_KEY), { cause: Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }) });
  if (mode === 'ERROR') return new Response(JSON.stringify({ error: { message: env.ASTRO_GATEWAY_API_KEY } }), { status: 403 });
  if (mode === 'BAD_JSON') return new Response('not-json');
  return Response.json(mode === 'EMPTY' ? { choices: [] } : { choices: [{ message: { content: '  Seller confirmation is needed.  ' } }] });
};
const start = async server => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
};
const stop = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
const unconfigured = createGatewayBridge({}, upstream), absentBase = await start(unconfigured);
try {
  assert.equal((await fetch(absentBase + '/health')).status, 503);
  assert.equal((await fetch(absentBase + '/v1/chat/completions', { method: 'POST' })).status, 503);
  assert.equal(calls.length, 0);
} finally { await stop(unconfigured); }

const server = createGatewayBridge(env, upstream), base = await start(server);
const payload = { model: 'tradeweave-gateway', messages: [{ role: 'system', content: 'Use seller facts only.' }, { role: 'user', content: 'Can you guarantee Friday delivery?' }] };
const send = async (body = payload, auth = true) => {
  const response = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + env.TRADEWEAVE_BRIDGE_KEY } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};
try {
  assert.deepEqual(await (await fetch(base + '/health')).json(), { ready: true });
  assert.equal((await fetch(base + '/unknown')).status, 404);
  assert.equal((await send(payload, false)).status, 401);
  assert.equal((await send('not-json')).status, 400);
  for (const body of [null, {}, { ...payload, stream: true }, { ...payload, model: 'expensive-client-choice' }, { ...payload, messages: [{ role: 'tool', content: 'x' }] }, { ...payload, messages: Array(13).fill({ role: 'user', content: 'x' }) }]) assert.equal((await send(body)).status, 400);
  assert.equal((await send({ ...payload, messages: [{ role: 'user', content: 'x'.repeat(65000) }] })).status, 413);
  assert.equal(calls.length, 0, 'Invalid requests must never reach the gateway.');
  const good = await send({ ...payload, max_tokens: 100000, messages: payload.messages.map(message => ({ ...message, tool_calls: [{ hidden: 'ignored' }] })) });
  assert.equal(good.status, 200); assert.equal(good.data.choices[0].message.content, 'Seller confirmation is needed.');
  const first = calls[0], forwarded = JSON.parse(first.options.body);
  assert.equal(first.url, 'https://gateway.invalid/v1/chat/completions');
  assert.equal(first.options.headers.authorization, 'Bearer ' + env.ASTRO_GATEWAY_API_KEY);
  assert.ok(!JSON.stringify(first.options).includes(env.TRADEWEAVE_BRIDGE_KEY));
  assert.equal(forwarded.model, env.MODEL_DEFAULT); assert.equal(forwarded.max_tokens, 500); assert.equal(forwarded.stream, false);
  assert.deepEqual(forwarded.messages, payload.messages);
  for (mode of ['ERROR', 'THROW', 'BAD_JSON', 'EMPTY']) {
    const logs = [], originalError = console.error;
    if (mode === 'THROW') console.error = (...args) => logs.push(args.join(' '));
    try {
      const result = await send(); assert.equal(result.status, 502);
      assert.ok(!JSON.stringify(result).includes(env.ASTRO_GATEWAY_API_KEY), 'Gateway secrets must not appear in errors.');
      if (mode === 'THROW') {
        assert.match(logs.join(' '), /code=ECONNRESET/);
        assert.ok(!logs.join(' ').includes(env.ASTRO_GATEWAY_API_KEY), 'Network error logs must not contain request credentials.');
        assert.ok(!logs.join(' ').includes('socket reset'), 'Network error logs must omit raw error messages.');
      }
    } finally { console.error = originalError; }
  }
  mode = 'HOLD'; const firstPending = send(); await held;
  assert.equal((await send()).status, 429); mode = 'OK'; releaseHeld(); assert.equal((await firstPending).status, 200);
  while (calls.length < 20) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429); assert.equal(calls.length, 20);
  console.log('PASS: Astropods bridge configuration, authentication, request bounds, fixed model/token limit, secret isolation, provider errors, concurrency and 20-attempt session cap. All gateway responses simulated.');
} finally { await stop(server); }
