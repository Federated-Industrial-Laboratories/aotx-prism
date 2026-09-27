// SPDX-License-Identifier: Apache-2.0
// Check distinct mutation identities, exact recovery bytes and failed-write atomicity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MutationJournal, emptyJournal, journal } from '../desktop/shared/journal.ts';
import { type Participant } from '../shared/shared-protocol.ts';
const lineage = '1'.repeat(32), actor = '2'.repeat(32);
const person: Participant = { lineage, participant: actor, registered: true, next_sequence: '1', retry_floor: '1',
  save: { source: '0', generation: '1', incarnation: '3'.repeat(32), boot: '1', commit_sha256: '4'.repeat(64), pending_bytes: '0', error: 0 } };
for (const count of [1, 64]) test(`retain exact shared input and sequence for ${count} distinct mutations`, () => {
  let stored = emptyJournal(); const log = new MutationJournal(stored, value => { stored = structuredClone(value); });
  for (let i = 0; i < count; i++) {
    const id = (i + 1).toString(16).padStart(32, '0'), sequence = String(i + 1);
    const row = log.prepare('http://127.0.0.1:8080', { ...person, next_sequence: sequence }, `/conversations/con-${lineage}-${id}/inputs`,
      { text: `Distinct input ${i} with Unicode \u20ac`, model: 'text', max_output_tokens: 8 }, `Input ${i}`);
    assert.equal(stored.records.at(-1)!.body, row.body); assert.equal(JSON.parse(row.body).sequence, sequence);
    log.update(row.key, { handle: `op-${lineage}-${id}` });
  }
  const reopened = new MutationJournal(JSON.parse(JSON.stringify(stored)), () => {});
  assert.equal(new Set(reopened.data.records.map(row => row.key)).size, count);
  assert.deepEqual(reopened.data, log.data);
  for (let i = 0; i < count; i++) assert.equal(JSON.parse(reopened.data.records[i].body).text, `Distinct input ${i} with Unicode \u20ac`);
  const changed = structuredClone(stored); changed.records[0].sequence = '99'; assert.throws(() => journal(changed), /body changed/);
  const failed = new MutationJournal(stored, () => { throw Error('Disk full'); });
  assert.throws(() => failed.prepare('http://127.0.0.1:8080', person, '/save', {}, 'Save'), /Disk full/);
  assert.deepEqual(failed.data, reopened.data);
});
test('saved mutations cannot switch lineage, endpoint protocol or route during recovery', () => {
  const log = new MutationJournal(emptyJournal(), () => {});
  const row = log.prepare('http://127.0.0.1:8080', person, '/spaces', { scope: 'private' }, 'Private space');
  for (const path of ['/aotx/v1/shared/spaces/../../admin', `/aotx/v1/shared/operations/op-${'a'.repeat(32)}-${actor}/cancel`, '/v1/chat/completions']) {
    const value = structuredClone(log.data); value.records[0].path = path; assert.throws(() => journal(value));
  }
  assert.throws(() => log.update(row.key, { handle: `op-${'b'.repeat(32)}-${actor}` }));
  const value = structuredClone(log.data); value.records[0].endpoint = 'file:///etc/passwd'; assert.throws(() => journal(value));
});
