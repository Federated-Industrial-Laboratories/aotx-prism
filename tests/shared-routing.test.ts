// SPDX-License-Identifier: Apache-2.0
// Detect wrong selected resources and obsolete asynchronous result pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { MutationJournal, emptyJournal } from '../desktop/shared/journal.ts';
import { SharedSession } from '../desktop/shared/session.ts';
import { emptyProject } from '../desktop/storage.ts';
import { SharedFixture, identity } from './shared-fixture.ts';
async function until(check: () => boolean) { for (let i = 0; i < 300 && !check(); i++) await delay(5); assert.ok(check()); }
function context(index = 0) {
  const journal = new MutationJournal(emptyJournal(), () => {}), fixture = new SharedFixture(index, () => journal.data);
  const session = new SharedSession(journal, () => {}), project = { ...emptyProject('Routes'), model: 'text', maxTokens: 8 };
  const caps = { epoch: '1', models: [{ id: 'text', sha256: identity(1, 64), input: ['text'], controls: [], automatic_memory: false }], features: {}, promptBytes: 2048, outputBytes: 1024, outputTokens: 64, uploadBytes: 0 };
  return { journal, fixture, session, project, caps };
}
for (const count of [1, 64]) test(`select ${count} distinct conversations from one shared resource list`, async () => {
  const c = context(), { fixture, session, project, caps, journal } = c;
  const ids = Array.from({ length: count }, (_, i) => `con-${fixture.lineage}-${identity(i + 1000)}`);
  const original = fixture.value.bind(fixture);
  fixture.value = async (path, body) => {
    const route = new URL(path, 'http://localhost').pathname;
    if (route.endsWith('/conversations') && !body) return { status: 200, value: { ...fixture.base(), space: fixture.space,
      items: ids.map(id => ({ id, space: fixture.space, next_order: '1', event_floor: '0', busy: false })), next_cursor: '0' } };
    if (ids.some(id => route.endsWith(`/conversations/${id}`))) return { status: 200, value: { ...fixture.base(), id: route.split('/').at(-1), space: fixture.space } };
    return original(path, body);
  };
  try {
    await session.connect(fixture.gateway()); await session.execute({ type: 'sharedSelect', kind: 'space', id: fixture.space }, project);
    assert.equal(session.state.conversations.items.length, count);
    for (let i = 0; i < count; i++) {
      fixture.conversation = ids[(i * 17) % count];
      await session.execute({ type: 'sharedSelect', kind: 'conversation', id: fixture.conversation }, project);
      await session.execute({ type: 'sharedSend', text: `Source for selected row ${i}` }, project, caps);
      await until(() => !session.state.watching.length);
      const row = journal.data.records.at(-1)!;
      assert.equal(row.path, `/aotx/v1/shared/conversations/${fixture.conversation}/inputs`);
      assert.equal(JSON.parse(row.body).text, `Source for selected row ${i}`); assert.equal(session.state.error, '');
    }
    assert.equal(new Set(journal.data.records.map(r => r.path)).size, count);
  } finally { await session.disconnect(); }
});
for (const count of [1, 64]) test(`recheck ${count} cached terminal receipts after reconnect`, async () => {
  for (let i = 0; i < count; i++) {
    const { fixture, session, project, journal } = context(i);
    try {
      await session.connect(fixture.gateway()); await session.execute({ type: 'sharedSave' }, project); await until(() => !session.state.watching.length);
      const row = journal.data.records[0], original = fixture.value.bind(fixture); await session.disconnect();
      let reads = 0; const status = [403, 404, 410, 503][i % 4];
      fixture.value = async (path, body) => { if (!body && path.includes('/operations/')) { reads++; return { status, value: {} }; } return original(path, body); };
      await session.connect(fixture.gateway()); await session.execute({ type: 'sharedRead', key: row.key }, project); await until(() => !session.state.watching.length);
      assert.equal(reads, 1); assert.match(session.state.error, new RegExp(String(status))); assert.deepEqual(journal.data.records[0].result, row.result);
    } finally { await session.disconnect(); }
  }
});
for (const count of [1, 64]) test(`discard ${count} obsolete event responses and failures`, async () => {
  for (let i = 0; i < count; i++) {
    const { fixture, session, project } = context(i), old = fixture.conversation, other = `con-${fixture.lineage}-${identity(10000 + i)}`;
    const event = (n: number) => ({ id: `op-${fixture.lineage}-${identity(n)}`, actor: fixture.actor, input_order: String(n), state: 'completed',
      saved_admission: true, saved_terminal: true, output_bytes: '0', status: 200, output_tokens: 0, finish: 0, admission_source: '1', terminal_source: '2', gap: false, sequence: '1' });
    let block = false, release!: () => void, pending = false;
    const gate = new Promise<void>(r => { release = r; }), original = fixture.value.bind(fixture);
    fixture.value = async (path, body) => {
      const route = new URL(path, 'http://localhost').pathname;
      if (route.endsWith(`/conversations/${other}`)) return { status: 200, value: { ...fixture.base(), id: other, space: fixture.space } };
      if (route.endsWith('/events')) {
        const stale = route.includes(old) && block; if (stale) { pending = true; await gate; }
        return { status: stale && i % 2 ? 403 : 200, value: { ...fixture.base(), space: fixture.space,
          items: [event(route.includes(old) ? 801 : 802)], next_cursor: '0', gap: false, event_floor: '0' } };
      }
      return original(path, body);
    };
    try {
      await session.connect(fixture.gateway()); await session.execute({ type: 'sharedSelect', kind: 'space', id: fixture.space }, project);
      await session.execute({ type: 'sharedSelect', kind: 'conversation', id: old }, project);
      block = true; await session.execute({ type: 'sharedSave' }, project); await until(() => pending);
      await session.execute({ type: 'sharedSelect', kind: 'conversation', id: other }, project);
      release(); await until(() => !session.state.watching.length);
      assert.equal(session.state.selectedConversation, other); assert.equal(session.state.events.items[0].id, event(802).id); assert.equal(session.state.error, '');
    } finally { release(); await session.disconnect(); }
  }
});
