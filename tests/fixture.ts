// SPDX-License-Identifier: Apache-2.0
// Supply a bounded gateway fixture with explicit byte windows and request modes.
import { createServer } from 'node:http';
import { once } from 'node:events';
export const token = 'test-only-token-'.repeat(3);
export const handle = 'req-0000000000000001-' + 'a'.repeat(32);
export const caps = { schema: 'aotx.capabilities.v1', runtime_epoch: '1',
  models: [{ id: 'text', role: 0, sha256: 'a'.repeat(64), input: ['text'], automatic_memory: false, controls: [] }],
  limits: { output_tokens: 512, output_bytes: 1048576, wrapped_prompt_bytes: 16384 },
  features: { chat_completions: true, continuing_ccir: false, tools: false } };
export function status(cursor: number, bytes: Buffer, next: number, phase = 'completed') {
  return { schema: 'aotx.request.v1', id: handle, runtime_epoch: '1', state: phase, status: 0,
    cancel_requested: phase === 'cancelled', usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
    output: { encoding: 'base64', bytes: bytes.subarray(cursor, next).toString('base64'), cursor: String(cursor),
      next_cursor: String(next), total_bytes: String(bytes.length) } };
}
export async function fixture() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let mode: 'normal' | 'lost' | 'lost-handle' | 'expired' | 'hold' = 'normal', cancelled = false;
  const bytes = Buffer.from('Hello, project. Unicode: \u20ac.');
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return; }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const url = new URL(req.url!, 'http://localhost');
    calls.push({ method: req.method!, path: url.pathname + url.search, body: raw ? JSON.parse(raw) : null });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('capabilities')) { res.end(JSON.stringify(caps)); return; }
    if (req.method === 'POST' && url.pathname.endsWith('/cancel')) { cancelled = true; res.end(JSON.stringify(status(0, bytes, bytes.length, 'cancelled'))); return; }
    if (req.method === 'POST') {
      if (mode === 'lost') { req.socket.destroy(); return; }
      res.setHeader('X-Request-ID', handle);
      if (mode === 'lost-handle') { res.end('{broken'); return; }
      cancelled = false; res.writeHead(202).end(JSON.stringify({ schema: 'aotx.admission.v1', id: handle, runtime_epoch: '1', state: 'accepted' })); return;
    }
    if (mode === 'expired') { res.writeHead(410).end('{}'); return; }
    const cursor = Number(url.searchParams.get('cursor') || 0), next = Math.min(bytes.length, cursor + 2);
    res.end(JSON.stringify(status(cursor, bytes, mode === 'hold' ? cursor : next, cancelled ? 'cancelled' : mode === 'hold' ? 'running' : 'completed')));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { calls, bytes, url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    mode: (value: typeof mode) => { mode = value; }, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
