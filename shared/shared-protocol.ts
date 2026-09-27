// SPDX-License-Identifier: Apache-2.0
// Check shared identities, counters and exact output spans before display.
export const PREFIX = '/aotx/v1/shared';
export const MAX_OUTPUT = 1024 * 1024;
export type Row = Record<string, unknown>;
export function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid shared object.');
  return value as Row;
}
export function decimal(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > 18446744073709551615n)
    throw Error('Invalid shared counter.');
  return value;
}
export function hex(value: unknown, bytes = 16): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) throw Error('Invalid shared identity.');
  return value;
}
export function handle(value: unknown, kind: 'op' | 'spc' | 'con', lineage?: string): string {
  if (typeof value !== 'string' || !new RegExp(`^${kind}-[0-9a-f]{32}-[0-9a-f]{32}$`).test(value)) throw Error('Invalid shared handle.');
  const parts = value.split('-');
  if (/^0+$/.test(parts[1]) || /^0+$/.test(parts[2]) || (lineage && parts[1] !== lineage)) throw Error('Shared lineage does not match.');
  return value;
}
export function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw Error('Invalid shared flag.');
  return value;
}
export function small(value: unknown, max = 0xffffffff): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw Error('Invalid shared limit.');
  return value;
}
export const scopes = ['private', 'room', 'instance'] as const;
export type Scope = typeof scopes[number];
export function scope(value: unknown): Scope {
  if (!scopes.includes(value as Scope)) throw Error('Invalid shared scope.');
  return value as Scope;
}
export function rights(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 3 || value.some(v => !['read', 'write', 'manage'].includes(v)))
    throw Error('Invalid shared rights.');
  if (new Set(value).size !== value.length) throw Error('Duplicate shared rights.');
  return value as string[];
}
export interface Save { source: string; generation: string; incarnation: string; boot: string; commit_sha256: string; pending_bytes: string; error: number }
export function saved(value: unknown): Save {
  const s = object(value);
  return { source: decimal(s.source), generation: decimal(s.generation), incarnation: hex(s.incarnation),
    boot: decimal(s.boot), commit_sha256: hex(s.commit_sha256, 32), pending_bytes: decimal(s.pending_bytes), error: small(s.error) };
}
export interface Participant { lineage: string; participant: string; registered: boolean; next_sequence: string; retry_floor: string; save: Save }
export function participant(value: unknown): Participant {
  const r = resource(value);
  return { lineage: hex(r.lineage), participant: hex(r.participant), registered: flag(r.registered),
    next_sequence: decimal(r.next_sequence), retry_floor: decimal(r.retry_floor), save: saved(r.save) };
}
export function resource(value: unknown, lineage?: string): Row {
  const r = object(value);
  if (r.schema !== 'aotx.shared.resource.v1' || (lineage && r.lineage !== lineage)) throw Error('Invalid shared resource.');
  hex(r.lineage); saved(r.save); return r;
}
export interface Page { items: Row[]; next: string; gap: boolean; floor: string }
export function page(value: unknown, kind: 'spaces' | 'members' | 'conversations' | 'events', lineage: string): Page {
  const r = resource(value, lineage);
  if (!Array.isArray(r.items) || r.items.length > 256) throw Error('Invalid shared page.');
  const items = r.items.map(value => {
    const row = object(value);
    if (kind === 'spaces') { handle(row.id, 'spc', lineage); scope(row.scope); rights(row.permissions); hex(row.owner); }
    if (kind === 'members') { hex(row.participant); rights(row.permissions); }
    if (kind === 'conversations') { handle(row.id, 'con', lineage); handle(row.space, 'spc', lineage); decimal(row.next_order); decimal(row.event_floor); flag(row.busy); }
    if (kind === 'events') { handle(row.id, 'op', lineage); hex(row.actor); decimal(row.input_order); phase(row.state); flag(row.saved_admission); flag(row.saved_terminal); decimal(row.output_bytes); small(row.status);
      small(row.output_tokens); small(row.finish); decimal(row.admission_source); decimal(row.terminal_source); flag(row.gap);
      if (row.sequence !== null) decimal(row.sequence); }
    return row;
  });
  return { items, next: decimal(r.next_cursor), gap: kind === 'events' ? flag(r.gap) : false,
    floor: kind === 'events' ? decimal(r.event_floor) : '0' };
}
export const phases = ['accepted', 'queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'] as const;
export function phase(value: unknown): string {
  if (!phases.includes(value as typeof phases[number])) throw Error('Invalid shared operation state.');
  return value as string;
}
export interface Receipt {
  id: string; lineage: string; actor: string; operation_key: string; sequence: string | null; next_sequence: string | null;
  state: string; status: number; operation: number; resource: string; space?: string;
  accepted: boolean; device_committed: boolean; saved_admission: boolean; saved_terminal: boolean; gap: boolean;
  offset: string; next_offset: string; output_bytes: string; bytes: Uint8Array; save: Save;
  admission_source: string; terminal_source: string; input_order: string; input_tokens: number; output_tokens: number; finish: number;
}
export function receipt(value: unknown, lineage: string): Receipt {
  const r = resource(value, lineage), out = object(r.output), usage = object(r.usage);
  const offset = decimal(r.offset), next = decimal(r.next_offset), total = decimal(r.output_bytes);
  if (typeof out.base64 !== 'string' || out.base64.length > MAX_OUTPUT * 2) throw Error('Invalid shared output.');
  const raw = atob(out.base64), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (btoa(raw) !== out.base64 || decimal(out.bytes) !== String(bytes.length) || BigInt(next) - BigInt(offset) !== BigInt(bytes.length) ||
      BigInt(next) > BigInt(total) || BigInt(total) > BigInt(MAX_OUTPUT)) throw Error('Shared output exceeds its span or limit.');
  return { id: handle(r.id, 'op', lineage), lineage, actor: hex(r.actor), operation_key: hex(r.operation_key),
    sequence: r.sequence === null ? null : decimal(r.sequence), next_sequence: r.next_sequence === null ? null : decimal(r.next_sequence), state: phase(r.state), status: small(r.status), operation: small(r.operation),
    resource: hex(r.resource), space: r.space === undefined ? undefined : handle(r.space, 'spc', lineage),
    accepted: flag(r.accepted), device_committed: flag(r.device_committed), saved_admission: flag(r.saved_admission),
    saved_terminal: flag(r.saved_terminal), gap: flag(r.gap), offset, next_offset: next, output_bytes: total, bytes,
    save: saved(r.save), admission_source: decimal(r.admission_source), terminal_source: decimal(r.terminal_source),
    input_order: decimal(r.input_order), input_tokens: small(usage.input_tokens), output_tokens: small(usage.output_tokens), finish: small(r.finish) };
}
export class OutputWindow {
  id = ''; cursor = '0'; bytes = new Uint8Array(0); text = ''; gap = false; invalid = false; complete = false;
  private decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  reset(id = '') { this.id = id; this.cursor = '0'; this.bytes = new Uint8Array(0); this.text = ''; this.gap = this.invalid = this.complete = false;
    this.decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); }
  apply(r: Receipt) {
    if (r.id !== this.id) this.reset(r.id);
    const offset = BigInt(r.offset), cursor = BigInt(this.cursor);
    if (offset > cursor) { this.gap = true; return; }
    const skip = cursor - offset;
    if (skip > BigInt(r.bytes.length)) return;
    const begin = Number(offset), overlap = Number(skip);
    for (let i = 0; i < overlap; i++) if (this.bytes[begin + i] !== r.bytes[i]) { this.invalid = true; return; }
    const add = r.bytes.slice(overlap), final = !['accepted', 'queued', 'running'].includes(r.state) && r.next_offset === r.output_bytes;
    if (this.invalid || (this.complete && add.length)) { this.invalid = true; return; }
    if (!add.length && this.complete) return;
    const merged = new Uint8Array(this.bytes.length + add.length); merged.set(this.bytes); merged.set(add, this.bytes.length);
    if (merged.length > MAX_OUTPUT) throw Error('Shared output limit reached.');
    try { this.text += this.decoder.decode(add, { stream: !final }); }
    catch { this.invalid = true; }
    this.bytes = merged; this.cursor = r.next_offset; this.complete = final; this.gap ||= r.gap;
  }
}
export function receiptLabel(r: Pick<Receipt, 'accepted' | 'device_committed' | 'saved_admission' | 'saved_terminal'>): string {
  return `Accepted: ${r.accepted ? 'yes' : 'no'} / Committed: ${r.device_committed ? 'yes' : 'no'} / Admission saved: ${r.saved_admission ? 'yes' : 'no'} / Result saved: ${r.saved_terminal ? 'yes' : 'no'}`;
}
