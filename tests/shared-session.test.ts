// SPDX-License-Identifier: Apache-2.0
// Exercise durable shared recovery, distinct routing and refused or changed results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ProjectStore, emptyProject } from '../desktop/storage.ts';
import { MutationJournal, emptyJournal } from '../desktop/shared/journal.ts';
import { SharedSession } from '../desktop/shared/session.ts';
import { receipt } from '../shared/shared-protocol.ts';
import { SharedFixture, identity } from './shared-fixture.ts';
import type { Capabilities } from '../shared/types.ts';
function context(i = 0) {
  const folder = mkdtempSync(join(tmpdir(), 'prism-shared-')); let store = new ProjectStore(folder);
  const fixture = new SharedFixture(i, () => store.readShared());
  let journal = new MutationJournal(store.readShared(), value => store.writeShared(value));
  let session = new SharedSession(journal, () => {});
  const project = { ...emptyProject(`Project ${i}`), model: `model-${i}`, maxTokens: 8 };
  const caps: Capabilities = { epoch: String(i + 1), models: [{ id: project.model, sha256: identity(i + 1, 64), input: ['text', 'image'], automatic_memory: false, controls: [] }], features: {}, outputTokens: 256, outputBytes: 65536, promptBytes: 8192, uploadBytes: 10000 };
  return { fixture, project, caps, get session() { return session; }, get journal() { return journal; },
    async open() { await session.connect(fixture.gateway()); await session.execute({ type: 'sharedSelect', kind: 'space', id: fixture.space }, project); await session.execute({ type: 'sharedSelect', kind: 'conversation', id: fixture.conversation }, project); },
    async reopen() { await session.disconnect(); store.close(); store = new ProjectStore(folder); journal = new MutationJournal(store.readShared(), v => store.writeShared(v)); session = new SharedSession(journal, () => {}); },
    async close() { await session.disconnect(); store.close(); rmSync(folder, { recursive: true }); } };
}
async function settled(session: SharedSession) {
  for (let i = 0; i < 100 && session.state.watching.length; i++) await delay(10);
  assert.deepEqual(session.state.watching, []); assert.equal(session.state.error, '');
}
for (const count of [1, 64]) test(`persist and recover ${count} distinct shared routes and UTF-8 results`, async () => {
  for (let i = 0; i < count; i++) {
    const c = context(i);
    try {
      await c.open(); c.fixture.lose = true;
      await assert.rejects(c.session.execute({ type: 'sharedSend', text: `Distinct source ${i}` }, c.project, c.caps));
      const row = c.journal.data.records[0]; assert.equal(c.fixture.posts.length, 1); assert.equal(row.handle, '');
      assert.equal(row.path, `/aotx/v1/shared/conversations/${c.fixture.conversation}/inputs`);
      assert.equal(JSON.parse(row.body).model, c.project.model);
      await c.reopen(); await c.open(); assert.equal(c.fixture.posts.length, 1, 'Reconnect must not replay a mutation.');
      await c.session.execute({ type: 'sharedRetry', key: row.key }, c.project); await settled(c.session);
      assert.equal(c.fixture.posts[0], c.fixture.posts[1]); assert.equal(c.fixture.sequence, 2);
      const final = c.journal.data.records[0], result = receipt(final.result, c.fixture.lineage);
      assert.equal(result.actor, c.fixture.actor); assert.equal(result.saved_terminal, true);
      assert.equal(Buffer.from(result.bytes).toString(), `Reply ${i}: \u20ac`);
      await c.reopen(); assert.deepEqual(c.journal.data.records[0], final);
    } finally { await c.close(); }
  }
});
for (const count of [1, 64]) test(`shared status separates device completion from durable completion: ${count} distinct cases`, async () => {
  for (let index = 0; index < count; index++) {
  const c = context(index); try {
    await c.open(); c.fixture.saved = false;
    await c.session.execute({ type: 'sharedSave' }, c.project); await delay(30);
    assert.equal(receipt(c.journal.data.records[0].result, c.fixture.lineage).saved_terminal, false);
    assert.equal(c.session.state.watching.length, 1); c.fixture.saved = true; await settled(c.session);
    assert.equal(receipt(c.journal.data.records[0].result, c.fixture.lineage).saved_terminal, true);
  } finally { await c.close(); }
  }
});
for (const count of [1, 64]) test(`shared status 200 publishes the saved resource label and refreshes participant state: ${count} distinct cases`, async () => {
  for (let index = 0; index < count; index++) {
  const c = context(index); try {
    await c.open();
    await c.session.execute({ type: 'sharedSpace', scope: 'private', name: `Named space ${index}` }, c.project);
    await settled(c.session);
    const row = c.journal.data.records[0], result = receipt(row.result, c.fixture.lineage);
    assert.equal(result.status, 200);
    assert.equal(c.journal.data.labels[`spc-${c.fixture.lineage}-${result.resource}`], `Named space ${index}`);
    assert.equal(c.session.state.person?.save.pending_bytes, '0');
    assert.equal(c.session.state.person?.next_sequence, '2');
  } finally { await c.close(); }
  }
});
for (const count of [1, 64]) test(`restored endpoints require explicit matching lineage and actor before retry: ${count} distinct cases`, async () => {
  for (let index = 0; index < count; index++) {
  const c = context(index); try {
    await c.open(); c.fixture.lose = true;
    await assert.rejects(c.session.execute({ type: 'sharedSave' }, c.project)); const row = c.journal.data.records[0];
    await c.session.connect(c.fixture.gateway('http://127.0.0.1:8081'));
    await assert.rejects(c.session.execute({ type: 'sharedRetry', key: row.key }, c.project), /another connection/);
    c.fixture.actor = identity(10000);
    await assert.rejects(c.session.execute({ type: 'sharedReattach', key: row.key }, c.project), /identity changed/);
    c.fixture.actor = row.actor;
    await c.session.execute({ type: 'sharedReattach', key: row.key }, c.project);
    await c.session.execute({ type: 'sharedRetry', key: row.key }, c.project); await settled(c.session);
    assert.equal(c.fixture.posts[0], c.fixture.posts[1]);
  } finally { await c.close(); }
  }
});
for (const count of [1, 64]) test(`wrong receipts, revoked access, saturation and event gaps stay explicit: ${count} distinct cases`, async () => {
  for (let index = 0; index < count; index++) {
  for (const status of [403, 409, 410, 429, 503]) {
    const c = context(index * 1000 + status); try {
      await c.open(); c.fixture.status = status;
      await assert.rejects(c.session.execute({ type: 'sharedSave' }, c.project));
      assert.equal(c.journal.data.records[0].refusal, status); assert.equal(c.journal.data.records[0].result, undefined);
      assert.equal(c.fixture.posts.length, 1);
    } finally { await c.close(); }
  }
  const c = context(index); try {
    await c.open(); c.fixture.wrongActor = true;
    await assert.rejects(c.session.execute({ type: 'sharedSave' }, c.project), /does not match/);
    assert.equal(c.journal.data.records[0].result, undefined);
    c.fixture.gap = true; await c.session.list('events', '0');
    assert.equal(c.session.state.events.gap, true); assert.equal(c.session.state.events.floor, '20');
  } finally { await c.close(); }
  }
});
for (const count of [1, 64]) test(`cancellation retains the exact target sequence and membership retains explicit rights: ${count} distinct cases`, async () => {
  for (let index = 0; index < count; index++) {
  const c = context(index); try {
    await c.open(); c.fixture.saved = false;
    await c.session.execute({ type: 'sharedSend', text: 'Cancelable input' }, c.project, c.caps);
    const input = c.journal.data.records[0];
    await c.session.execute({ type: 'sharedCancel', key: input.key }, c.project);
    const cancel = c.journal.data.records[1];
    assert.equal(cancel.path, `/aotx/v1/shared/operations/${input.handle}/cancel`);
    assert.equal(JSON.parse(cancel.body).target_sequence, input.sequence);
    assert.notEqual(cancel.sequence, input.sequence); c.fixture.saved = true; await settled(c.session);
    const permissions = [[], ['read'], ['read', 'write'], ['read', 'write', 'manage']][index % 4];
    await c.session.execute({ type: 'sharedMember', participant: identity(999 + index), permissions: permissions }, c.project); await settled(c.session);
    const member = c.journal.data.records.at(-1)!;
    assert.equal(member.path, `/aotx/v1/shared/spaces/${c.fixture.space}/members`);
    assert.deepEqual(JSON.parse(member.body).permissions, permissions);
  } finally { await c.close(); }
  }
});
test('failed journal writes prevent transmission and concurrent writers cannot overwrite', async () => {
  const journal = new MutationJournal(emptyJournal(), () => { throw Error('Disk full'); });
  const fixture = new SharedFixture(0, () => journal.data), session = new SharedSession(journal, () => {});
  await session.connect(fixture.gateway());
  await assert.rejects(session.execute({ type: 'sharedSave' }, emptyProject('Disk')), /Disk full/);
  assert.equal(fixture.posts.length, 0); assert.equal(session.state.saved, false); await session.disconnect();
  const folder = mkdtempSync(join(tmpdir(), 'prism-shared-lock-'));
  const first = new ProjectStore(folder), second = new ProjectStore(folder);
  try { first.readShared(); second.readShared(); first.writeShared(emptyJournal()); assert.throws(() => second.writeShared(emptyJournal()), /Another application/); }
  finally { first.close(); second.close(); rmSync(folder, { recursive: true }); }
});
