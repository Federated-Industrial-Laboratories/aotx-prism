// SPDX-License-Identifier: Apache-2.0
// Verify typed evidence offsets, exact references and unknown values with distinct payloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePayload } from '../shared/payload.ts';
import { identity } from './shared-fixture.ts';
export function source(text: string, format = 1) {
  const header = format === 1 ? 32 : format === 3 ? 96 : 64;
  const textBytes = Buffer.from(text), b = Buffer.alloc(header + textBytes.length);
  b.write(`AOTXMEM${format}`); b.writeUInt32LE(format, 8); b.writeUInt32LE(textBytes.length, 12); textBytes.copy(b, header); return b;
}
for (const count of [1, 64]) test(`decode ${count} distinct source, assertion, appraisal and review groups`, () => {
  for (let i = 0; i < count; i++) {
    const text = `Exact source ${i}: \u20ac`, event = source(text), assertion = source(text, 3);
    assertion.writeUInt32LE(i % 4 + 1, 16); assertion.writeUInt32LE(i * 3, 20); assertion.fill(i + 1, 24, 88);
    assert.equal(decodePayload(event, 1).text, text);
    const parsed = decodePayload(assertion, i % 4 === 0 ? 12 : 2); assert.equal(parsed.text, text);
    assert.equal(parsed.spans[0].start, i * 3); assert.equal(parsed.fields['Processor SHA-256'], (i + 1).toString(16).padStart(2, '0').repeat(32));
    const appraisal = Buffer.alloc(128); appraisal.writeUInt32LE(2); appraisal.writeUInt32LE(i * 151, 4);
    appraisal.writeUInt32LE(0xffffffff, 8); appraisal.writeUInt32LE(i * 71, 12); appraisal.writeUInt32LE(i % 5, 16); appraisal.writeUInt32LE(1000000 - i, 20);
    appraisal.writeUInt32LE(1, 24); Buffer.from(identity(i + 200), 'hex').copy(appraisal, 96); appraisal.writeBigUInt64LE(BigInt(i + 5), 112);
    const a = decodePayload(appraisal, 3); assert.equal(a.state, 'known'); assert.equal(a.fields.Benefit, `${i * 151} / 1000000`); assert.equal(a.fields.Harm, 'Unknown');
    assert.deepEqual(a.references[0], { label: 'Appraisal work', id: identity(i + 200), version: String(i + 5) });
    const selection = Buffer.alloc(16 + 5 * 32); selection.writeUInt32LE(1); selection.writeUInt32LE(5, 4);
    for (let j = 0; j < 5; j++) { const at = 16 + j * 32; Buffer.from(identity(i * 10 + j + 1), 'hex').copy(selection, at); selection.writeBigUInt64LE(BigInt(i * 100 + j + 1), at + 16); selection.writeUInt32LE(1, at + 24); }
    const refs = decodePayload(selection, 10).references; assert.equal(refs.length, 5);
    refs.forEach((r, j) => { assert.equal(r.id, identity(i * 10 + j + 1)); assert.equal(r.version, String(i * 100 + j + 1)); });
    const review = source('Review the supported outcome before repeating this task.', 4); Buffer.from(identity(i + 1), 'hex').copy(review, 16); review.writeUInt32LE(1, 32);
    const cue = decodePayload(review, 13); assert.equal(cue.state, 'known'); assert.equal(cue.references[0].id, identity(i + 1));
    const relation = Buffer.alloc(192); relation.write('AOTXREL1'); relation.writeUInt32LE(1, 8); relation.writeUInt32LE(1, 12);
    relation.writeUInt32LE(i, 16); relation.writeUInt32LE(0xffffffff, 20); relation.writeUInt32LE(i * 7, 24); relation.writeUInt32LE(0xffffffff, 28);
    relation.writeUInt32LE(i + 3, 48); relation.writeUInt32LE(i + 1, 52);
    const r = decodePayload(relation, 4); assert.equal(r.state, 'known'); assert.equal(r.fields['Regard gain'], `${i} / 1000000`); assert.equal(r.fields['Regard loss'], 'Unknown'); assert.equal(r.spans[0].start, i + 3);
    const queue = Buffer.alloc(160); queue.write('AOTXAPQ1'); queue.writeUInt32LE(1, 8); queue.writeUInt32LE(i % 4, 12);
    Buffer.from(identity(i + 500), 'hex').copy(queue, 16); queue.writeBigUInt64LE(BigInt(i + 7), 32);
    assert.equal(decodePayload(queue, 11).references[0].version, String(i + 7));
  }
});
for (const count of [1, 64]) test(`unknown formats and malformed layouts reject ${count} distinct payloads`, () => {
  for (let i = 0; i < count; i++) {
  const text = `Saved source ${i}`, b = source(text); b.writeUInt32LE(99 + i, 8);
  assert.equal(decodePayload(b, 1).state, 'unknown');
  for (const length of [0, 8, 15, 31, 33]) assert.notEqual(decodePayload(source(text).subarray(0, length), 1).state, 'known');
  const appraisal = Buffer.alloc(32); appraisal.writeUInt32LE(1); appraisal.writeUInt32LE(1, 24); appraisal.writeUInt32LE(1000001 + i, 4);
  assert.equal(decodePayload(appraisal, 3).state, 'invalid');
  const invalid = source(text); invalid[32] = 255; assert.equal(decodePayload(invalid, 1).text, undefined);
  const selection = Buffer.alloc(16); selection.writeUInt32LE(1); selection.writeUInt32LE(65 + i, 4); assert.equal(decodePayload(selection, 10).state, 'invalid');
  }
});
