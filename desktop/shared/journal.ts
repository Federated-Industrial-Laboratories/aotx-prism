// SPDX-License-Identifier: Apache-2.0
// Retain canonical shared mutations before transport and preserve exact recovery identities.
import { randomBytes } from 'node:crypto';
import { endpoint, text, object } from '../../shared/validate.js';
import { decimal, hex, handle, PREFIX, receipt, OutputWindow, type Participant } from '../../shared/shared-protocol.js';
import type { Mutation, JournalData } from '../../shared/shared.js';
export type { Mutation, JournalData } from '../../shared/shared.js';
export const emptyJournal = (): JournalData => ({ schema: 1, records: [], labels: {} });
export function mutationPath(path: unknown, lineage: string): string {
  const p = text(path, 256);
  if ([`${PREFIX}/participant`, `${PREFIX}/spaces`, `${PREFIX}/save`, `${PREFIX}/retire`].includes(p)) return p;
  const found = p.match(/^\/aotx\/v1\/shared\/(spaces|conversations|operations)\/([^/]+)\/(members|conversations|inputs|cancel|publish)(?:\/([a-f0-9]{32}))?$/);
  if (!found) throw Error('Invalid shared mutation path.');
  const [, type, id, action, objectId] = found;
  if (type === 'spaces' && ['members', 'conversations', 'publish'].includes(action)) handle(id, 'spc', lineage);
  else if (type === 'conversations' && action === 'inputs') handle(id, 'con', lineage);
  else if (type === 'operations' && action === 'cancel') handle(id, 'op', lineage);
  else throw Error('Invalid shared mutation path.');
  if ((action === 'publish') !== !!objectId) throw Error('Invalid publication path.');
  return p;
}
export function journal(value: unknown): JournalData {
  const raw = object(value);
  if (raw.schema !== 1 || !Array.isArray(raw.records) || raw.records.length > 256) throw Error('Invalid shared journal.');
  const keys = new Set<string>();
  const records = raw.records.map(value => {
    const row = object(value), lineage = hex(row.lineage), actor = hex(row.actor), key = hex(row.key);
    if ([lineage, actor, key].some(v => /^0+$/.test(v)) || keys.has(key)) throw Error('Invalid saved mutation identity.'); keys.add(key);
    const body = text(row.body, 16384), decoded = object(JSON.parse(body)), sequence = decimal(row.sequence);
    if (decoded.schema !== 'aotx.shared.mutation.v1' || decoded.lineage !== lineage || decoded.operation_key !== key || decoded.sequence !== sequence || sequence === '0') throw Error('The saved mutation body changed.');
    const id = text(row.handle, 69, true); if (id) handle(id, 'op', lineage);
    if (row.result !== undefined) {
      const result = receipt(row.result, lineage);
      if (result.id !== id || result.actor !== actor || result.operation_key !== key || result.sequence !== sequence || result.offset !== '0') throw Error('Invalid saved shared result.');
      const output = new OutputWindow(); output.apply(result);
      if (output.invalid || output.gap) throw Error('Invalid saved shared output bytes.');
    }
    if (!Number.isInteger(row.refusal) || Number(row.refusal) < 0 || Number(row.refusal) > 599) throw Error('Invalid saved mutation status.');
    return { key, endpoint: endpoint(row.endpoint), lineage, actor, sequence, path: mutationPath(row.path, lineage), body,
      handle: id, refusal: Number(row.refusal), created: text(row.created, 40), label: text(row.label, 120),
      ...(row.result === undefined ? {} : { result: object(row.result) }) };
  });
  const labels = object(raw.labels);
  if (Object.keys(labels).length > 256) throw Error('The local shared label limit is 256.');
  for (const [id, value] of Object.entries(labels)) { handle(id, id.startsWith('spc-') ? 'spc' : 'con'); text(value, 120); }
  return { schema: 1, records, labels: labels as Record<string, string> };
}
export class MutationJournal {
  data: JournalData;
  constructor(value: unknown, private write: (value: JournalData) => void) { this.data = journal(value); }
  edit(change: (data: JournalData) => void) {
    const next = structuredClone(this.data); change(next); journal(next);
    if (Buffer.byteLength(JSON.stringify(next)) > 16777216) throw Error('The shared journal reached its storage limit. Export it before new work.');
    this.write(next); this.data = next;
  }
  prepare(url: string, person: Participant, path: string, fields: Record<string, unknown>, label: string): Mutation {
    const key = randomBytes(16).toString('hex');
    const body = JSON.stringify({ ...fields, schema: 'aotx.shared.mutation.v1', lineage: person.lineage, operation_key: key, sequence: person.next_sequence });
    const record: Mutation = { key, endpoint: endpoint(url), lineage: person.lineage, actor: person.participant, sequence: person.next_sequence,
      path: mutationPath(PREFIX + path, person.lineage), body, handle: '', refusal: 0, created: new Date().toISOString(), label };
    this.edit(data => { data.records.push(record); }); return structuredClone(record);
  }
  update(key: string, change: Pick<Partial<Mutation>, 'handle' | 'refusal' | 'result' | 'endpoint'>) {
    this.edit(data => { const row = data.records.find(r => r.key === key); if (!row) throw Error('The shared mutation was not found.'); Object.assign(row, change); });
  }
  label(id: string, name: string) { this.edit(data => { data.labels[id] = name; }); }
}
