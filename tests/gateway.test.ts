// SPDX-License-Identifier: Apache-2.0
// Verify native request bounds, identities, output cursors and admission uncertainty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Gateway, GatewayError, capabilities, output } from '../desktop/gateway.ts';
import { endpoint } from '../shared/validate.ts';
import type { Turn } from '../shared/types.ts';
import { handle, status, caps, fixture, token } from './fixture.ts';
const turn: Turn = { id: 'a'.repeat(36), prompt: 'Test', model: 'text', endpoint: 'http://127.0.0.1:1',
  phase: 'accepted', handle, epoch: '1', bytes: '', cursor: 0, reply: '', error: '', created: 'test', cancelRequested: false };
test('endpoint policy and scaled model control doses', () => {
  assert.equal(endpoint('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234');
  for (const url of ['file:///tmp/app', 'http://example.com', 'https://user:pass@example.com', 'https://example.com?token=x']) assert.throws(() => endpoint(url));
  const copy = structuredClone(caps) as any;
  copy.models[0].controls = [{ name: 'curiosity', available: true, accepted_doses: [-10000, 10000] }];
  assert.deepEqual(capabilities(copy).models[0].controls[0].accepted_doses, [-10000, 10000]);
});
test('terminal windows drain fully and preserve split UTF-8', () => {
  const bytes = Buffer.from('a\u20acb');
  const a = output(status(0, bytes, 2), turn); assert.equal(a.reply, 'a'); assert.equal(a.phase, 'running');
  const b = output(status(2, bytes, 4), a); assert.equal(b.reply, 'a\u20ac'); assert.equal(b.phase, 'running');
  const c = output(status(4, bytes, 5), b); assert.equal(c.reply, 'a\u20acb'); assert.equal(c.phase, 'completed');
});
test('refuse invalid identity, cursor, base64, UTF-8 and total bounds', () => {
  const bytes = Buffer.from('hello'), original = status(0, bytes, bytes.length);
  for (const edit of [
    (v: any) => { v.id = handle.replace(/a$/, 'b'); }, (v: any) => { v.runtime_epoch = '2'; },
    (v: any) => { v.output.cursor = '1'; }, (v: any) => { v.output.next_cursor = '6'; },
    (v: any) => { v.output.total_bytes = '1048577'; }, (v: any) => { v.output.bytes = '!!!!'; },
    (v: any) => { v.output.bytes = Buffer.from([255, 255, 255, 255, 255]).toString('base64'); },
  ]) { const value = structuredClone(original); edit(value); assert.throws(() => output(value, turn)); }
});
test('HTTP lifecycle keeps one admission and an exact handle after bad JSON', async () => {
  const server = await fixture();
  try {
    const client = new Gateway(server.url, token), signal = new AbortController().signal;
    assert.equal((await client.discover(signal)).models[0].id, 'text');
    server.mode('lost-handle');
    await assert.rejects(client.submit({}, signal), (error: unknown) => error instanceof GatewayError && error.handle === handle);
    assert.equal(server.calls.filter(c => c.method === 'POST').length, 1);
    await client.cancel(handle, signal); assert.equal(server.calls.at(-1)?.path, `/aotx/v1/requests/${handle}/cancel`);
  } finally { await server.close(); }
});
test('refuse redirects and responses above the byte limit', async () => {
  const signal = new AbortController().signal;
  let options: RequestInit | undefined, size = 2097152;
  const client = new Gateway('https://example.com', token, (async (_url: unknown, init: RequestInit) => {
    options = init; const json = JSON.stringify(caps);
    return new Response(json + ' '.repeat(size - Buffer.byteLength(json)));
  }) as typeof fetch);
  assert.equal((await client.discover(signal)).models[0].id, 'text');
  size++; await assert.rejects(client.discover(signal)); assert.equal(options?.redirect, 'error');
});
