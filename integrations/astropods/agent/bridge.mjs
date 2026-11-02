import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the platform credential inside its supported container. The shop uses a separate local key.
export function createGatewayBridge(env = process.env, callGateway = fetch) {
  let calls = 0, busy = false, endpoint;
  try {
    endpoint = new URL((env.ASTRO_GATEWAY_URL || '').replace(/\/+$/, '') + '/v1/chat/completions');
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) endpoint = null;
  } catch { endpoint = null; }
  const ready = Boolean(endpoint && env.ASTRO_GATEWAY_API_KEY && env.MODEL_DEFAULT && env.TRADEWEAVE_BRIDGE_KEY?.length >= 24);
  const reply = (res, status, data) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  return createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (req.method === 'GET' && path === '/health') return reply(res, ready ? 200 : 503, { ready });
    if (req.method !== 'POST' || path !== '/v1/chat/completions') return reply(res, 404, { error: { message: 'Not found.' } });
    if (!ready) return reply(res, 503, { error: { message: 'Gateway bridge is not configured.' } });
    const expected = Buffer.from('Bearer ' + env.TRADEWEAVE_BRIDGE_KEY), supplied = Buffer.from(req.headers.authorization || '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return reply(res, 401, { error: { message: 'Bridge authentication required.' } });
    let size = 0, chunks = [], data;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64000) return reply(res, 413, { error: { message: 'Request is too large.' } });
        chunks.push(chunk);
      }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return reply(res, 400, { error: { message: 'Send valid JSON.' } }); }
    if (!data || data.model !== 'tradeweave-gateway' || data.stream || !Array.isArray(data.messages) || !data.messages.length || data.messages.length > 12 || data.messages.some(message => !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 18000)) {
      return reply(res, 400, { error: { message: 'Use the TradeWeave model alias and a non-streaming text conversation.' } });
    }
    // Deliberately bounded test session; this resets on restart and is not a provider billing limit.
    if (busy || calls >= 20) return reply(res, 429, { error: { message: 'Bridge session is busy or its 20-request test allowance is exhausted.' } });
    busy = true; calls++;
    try {
      const response = await callGateway(endpoint.href, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { authorization: 'Bearer ' + env.ASTRO_GATEWAY_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ model: env.MODEL_DEFAULT, max_tokens: 500, stream: false, messages: data.messages.map(({ role, content }) => ({ role, content })) })
      });
      let result;
      try { result = await response.json(); }
      catch { result = null; }
      if (!response.ok) {
        const safe = value => typeof value === 'string' ? value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64) : '';
        console.error(`Managed gateway returned HTTP ${response.status}; type=${safe(result?.error?.type)}; code=${safe(result?.error?.code)}.`);
        return reply(res, 502, { error: { message: 'The managed model could not complete the request.' } });
      }
      const answer = result?.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 18000) return reply(res, 502, { error: { message: 'The managed model did not return a valid answer.' } });
      return reply(res, 200, { model: env.MODEL_DEFAULT, choices: [{ message: { role: 'assistant', content: answer.trim() } }] });
    } catch (error) {
      const safeCode = value => typeof value === 'string' ? value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 48) : '';
      const kind = error?.name === 'TimeoutError' ? 'timeout' : 'network or response error';
      const code = safeCode(error?.cause?.code || error?.code) || 'unknown';
      console.error(`Managed gateway request failed (${kind}; code=${code}).`);
      return reply(res, 502, { error: { message: 'The managed model is unavailable. Try again later.' } });
    }
    finally { busy = false; }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createGatewayBridge();
  server.listen(Number(process.env.PORT || 80), '0.0.0.0', () => console.log('TradeWeave gateway bridge is listening.'));
}
