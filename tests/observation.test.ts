// SPDX-License-Identifier: Apache-2.0
// Exercise exact policy integers, current-version reads, cold data and scoped identity failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Observation, policyJson } from '../desktop/observation.ts';
import { Gateway } from '../desktop/gateway.ts';
import { emptyShared } from '../shared/shared.ts';
import { SharedFixture, identity } from './shared-fixture.ts';
import { emptyJournal } from '../desktop/shared/journal.ts';
const signal = () => new AbortController().signal;
function payload(i: number) { const text = Buffer.from(`Exact quote ${i}: \u20ac`), b = Buffer.alloc(32 + text.length); b.write('AOTXMEM1'); b.writeUInt32LE(1, 8); b.writeUInt32LE(text.length, 12); text.copy(b, 32); return b; }
function context(i = 0) {
  const fixture = new SharedFixture(i, emptyJournal), shared = { ...emptyShared(), connected: true, person: fixture.person(), selectedSpace: fixture.space, selectedConversation: fixture.conversation };
  const b = payload(i), row = { id: identity(i + 5), version: String(i + 7), kind: 1, scope: 'private', owner: identity(i + 15), room: identity(0), bytes: String(b.length), source: identity(0), actor: fixture.actor };
  let failure = 0, changed = false, wrongScope = false; const posts: string[] = [];
  const epoch = String(18446744073709551000n + BigInt(i)), revision = String(9007199254741000n + BigInt(i));
  const policy = `{"schema":"aotx.policy.v1","epoch":${epoch},"control_revision":${revision},"abi":3,"mode":1,"state":"quiet","reason":"quiet","review_enabled":true,"pending":${i},"active_rows":0,"status":0,${['source_frontier','completed','interrupted','refused','decision','saved_generation','maximum_ns','last_ns','written_bytes','result_bytes'].map((k,j) => `"${k}":${9007199254741100n + BigInt(i * 20 + j)}`).join(',')}}`;
  const gateway = new Gateway('http://127.0.0.1:8080', 'fixture', (async (input: string, init: RequestInit) => {
    const url = new URL(input);
    if (init.body) posts.push(Buffer.from(init.body as Uint8Array).toString());
    if (failure) return new Response('{}', { status: failure });
    if (url.pathname.endsWith('/policy')) return new Response(policy);
    const offset = Number(url.searchParams.get('offset') || 0), detail = url.pathname.endsWith(row.id), part = detail ? b.subarray(offset, offset + 7) : Buffer.alloc(0);
    return new Response(JSON.stringify({ ...fixture.base(), space: wrongScope ? `spc-${fixture.lineage}-${identity(8888)}` : fixture.space, permissions: ['read'],
      items: [{ ...row, version: changed && offset ? '9999' : row.version }], next_cursor: '0', next_offset: detail ? String(offset + part.length) : '0',
      payload: { base64: part.toString('base64'), bytes: String(part.length) } }));
  }) as typeof fetch);
  return { shared, row, gateway, posts, epoch, revision, policy, setFailure: (v: number) => { failure = v; }, change: () => { changed = true; }, scope: () => { wrongScope = true; } };
}
for (const count of [1, 64]) test(`read ${count} distinct scoped sources without crossing a version or cold boundary`, async () => {
  for (let i = 0; i < count; i++) {
    const c = context(i), observer = new Observation(() => {});
    await observer.memory(c.gateway, c.shared, signal()); assert.equal(observer.state.rows[0].id, c.row.id);
    await observer.memory(c.gateway, c.shared, signal(), c.row.id, c.row.version); assert.equal(observer.state.detail?.decoded.text, `Exact quote ${i}: \u20ac`);
    c.setFailure([403,404,503][i % 3]); await assert.rejects(observer.memory(c.gateway, c.shared, signal(), c.row.id)); assert.equal(observer.state.detail, undefined);
    c.setFailure(0); await assert.rejects(observer.memory(c.gateway, c.shared, signal(), c.row.id, '5000'), /referenced version/);
    c.change(); await assert.rejects(observer.memory(c.gateway, c.shared, signal(), c.row.id), /changed/); assert.equal(observer.state.detail, undefined);
    c.scope(); await assert.rejects(observer.memory(c.gateway, c.shared, signal()), /Invalid evidence page/); assert.deepEqual(observer.state.rows, []);
  }
});
for (const count of [1, 64]) test(`retain ${count} exact policy revisions and refuse stale or denied actions`, async () => {
  for (let i = 0; i < count; i++) {
    const c = context(i), observer = new Observation(() => {}), shared = emptyShared();
    await observer.activity(c.gateway, shared, signal()); assert.equal(observer.state.policy?.epoch, c.epoch); assert.equal(observer.state.policy?.control_revision, c.revision);
    await assert.rejects(observer.action(c.gateway, 'pause', c.epoch, String(BigInt(c.revision) - 1n), signal()), /Refresh/); assert.equal(c.posts.length, 0);
    await observer.action(c.gateway, 'pause', c.epoch, c.revision, signal()); assert.ok(c.posts[0].includes(`"epoch":${c.epoch}`)); assert.ok(c.posts[0].includes(`"control_revision":${c.revision}`));
    c.setFailure(i % 2 ? 403 : 409); await assert.rejects(observer.action(c.gateway, 'resume', c.epoch, c.revision, signal()));
    assert.equal(c.posts.length, 2); assert.equal(observer.state.policy, undefined); assert.equal(observer.state.policyDenied, !!(i % 2));
    await assert.rejects(observer.action(c.gateway, 'resume', c.epoch, c.revision, signal())); assert.equal(c.posts.length, 2);
  }
});
test('policy integers reject rounded, negative, fractional and out-of-range encodings', () => {
  for (const raw of ['-1', '1.5', '1e3', '18446744073709551616', '"9007199254740993"']) assert.throws(() => policyJson(`{"epoch":${raw}}`));
  assert.equal((policyJson('{"epoch":18446744073709551615}') as any).epoch, '18446744073709551615');
});
