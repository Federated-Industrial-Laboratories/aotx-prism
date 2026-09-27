// SPDX-License-Identifier: Apache-2.0
// Read bounded current evidence and policy state through the authorized gateway.
import { Gateway } from './gateway.js';
import { object, decimal, small, flag, hex, resource, handle, rights, PREFIX } from '../shared/shared-protocol.js';
import { memoryRow, emptyEvidence, type EvidenceState, type Policy, type Affect, type PolicyAction } from '../shared/evidence.js';
import { decodePayload } from '../shared/payload.js';
import type { SharedState } from '../shared/shared.js';
const LIMIT = 1024 * 1024;
const counters = ['control_revision', 'source_frontier', 'completed', 'interrupted', 'refused', 'decision',
  'saved_generation', 'maximum_ns', 'last_ns', 'written_bytes', 'result_bytes'];
export function policyJson(raw: string): unknown {
  return JSON.parse(raw, ((key: string, value: unknown, context?: { source?: string }) => {
    if (key !== 'epoch' && !counters.includes(key)) return value;
    if (typeof value !== 'number' || !context?.source) throw Error('Exact policy counters are unavailable.');
    return decimal(context.source);
  }) as Parameters<typeof JSON.parse>[1]);
}
export function policy(value: unknown): Policy {
  const r = object(value);
  if (r.schema !== 'aotx.policy.v1' || !['off', 'quiet', 'active', 'paused', 'stopped', 'error', 'recording'].includes(String(r.state)) ||
      !['quiet', 'foreground', 'paused', 'capacity', 'active', 'disabled'].includes(String(r.reason))) throw Error('Invalid policy state.');
  const values: Record<string, string> = {}; for (const key of counters) values[key] = decimal(r[key]);
  return { epoch: decimal(r.epoch), control_revision: values.control_revision, abi: small(r.abi), state: String(r.state),
    reason: String(r.reason), review_enabled: flag(r.review_enabled), pending: small(r.pending), active_rows: small(r.active_rows), status: small(r.status), counters: values };
}
export function affect(value: unknown, shared: SharedState): Affect {
  const r = resource(value, shared.person!.lineage), a = object(r.affect), probes = object(a.probes_at_last_turn);
  if (r.id !== shared.selectedConversation || r.space !== shared.selectedSpace || a.schema !== 'aotx.affect.scope.v1') throw Error('The affect scope changed.');
  const axes = (v: unknown) => {
    if (!Array.isArray(v) || v.length !== 4 || v.some(x => !Number.isInteger(x) || x < -32768 || x > 32767) || v[2] || v[3]) throw Error('Invalid affect axes.');
    return v as number[];
  };
  const available = ['valence', 'arousal'].map(k => {
    if (!['available', 'unavailable'].includes(String(probes[k]))) throw Error('Invalid affect probe state.'); return String(probes[k]);
  });
  if (typeof a.budget_spent !== 'number' || !Number.isFinite(a.budget_spent) || a.budget_spent < 0) throw Error('Invalid affect budget.');
  return { enabled: flag(a.enabled), revision: decimal(a.revision), fast: axes(a.fast_q15), slow: axes(a.slow_q15),
    scale: small(a.scale_q16, 65535), events: small(a.event_mask, 32767), actuators: small(a.actuator_flags, 15), spent: a.budget_spent,
    role: small(a.model_role), model: a.model_sha256 === null ? null : hex(a.model_sha256, 32), probes: available };
}
export class Observation {
  state: EvidenceState = emptyEvidence();
  constructor(private changed: (state: EvidenceState) => void) {}
  private emit() { this.changed(structuredClone(this.state)); }
  clear() { this.state = emptyEvidence(); this.emit(); }
  clearMemory() { this.state.space = ''; this.state.rows = []; this.state.next = '0'; this.state.detail = undefined; this.state.affect = undefined; this.state.error = ''; this.emit(); }
  private scope(shared: SharedState) {
    if (!shared.connected || !shared.person) throw Error('Open the shared workspace first.');
    return { lineage: shared.person.lineage, space: handle(shared.selectedSpace, 'spc', shared.person.lineage) };
  }
  async memory(gateway: Gateway, shared: SharedState, signal: AbortSignal, id?: string, version?: string, cursor = '0') {
    const { lineage, space } = this.scope(shared);
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
    this.state.detail = undefined; this.state.error = ''; this.state.space = space;
    if (!id) { this.state.rows = []; this.state.next = '0'; } this.emit();
    try {
      let offset = 0, expected = '', bytes = Buffer.alloc(0);
      for (let pages = 0; pages < 512; pages++) {
        const path = `${PREFIX}/spaces/${space}/memory${id ? `/${hex(id)}?offset=${offset}` : `?cursor=${decimal(cursor)}&limit=64`}`;
        const r = resource((await gateway.json(path, bounded)).value, lineage);
        if (r.space !== space || !rights(r.permissions).includes('read') || !Array.isArray(r.items) || r.items.length > 64) throw Error('Invalid evidence page.');
        const rows = r.items.map(memoryRow), out = object(r.payload), next = decimal(r.next_offset);
        if (typeof out.base64 !== 'string' || out.base64.length > LIMIT * 2) throw Error('Invalid evidence bytes.');
        const part = Buffer.from(out.base64, 'base64');
        if (part.toString('base64') !== out.base64 || decimal(out.bytes) !== String(part.length)) throw Error('Invalid evidence byte count.');
        if (!id) {
          if (part.length || next !== '0') throw Error('Invalid evidence list payload.');
          this.state.rows = rows; this.state.next = decimal(r.next_cursor); this.emit(); return;
        }
        if (rows.length !== 1 || rows[0].id !== id || (version !== undefined && rows[0].version !== version)) throw Error('The referenced version is not available through the current-version endpoint.');
        const row = rows[0], identity = JSON.stringify(row);
        if ((expected && expected !== identity) || BigInt(next) !== BigInt(offset + part.length) || BigInt(next) > BigInt(row.bytes)) throw Error('The evidence identity or byte span changed.');
        expected = identity;
        const take = part.subarray(0, LIMIT - bytes.length); bytes = Buffer.concat([bytes, take]); offset += part.length;
        if (BigInt(offset) === BigInt(row.bytes) || bytes.length === LIMIT) {
          const truncated = BigInt(bytes.length) !== BigInt(row.bytes);
          this.state.detail = { row, base64: bytes.toString('base64'), truncated,
            decoded: truncated ? { format: 'Bounded byte preview', state: 'unknown', fields: {}, references: [], spans: [] } : decodePayload(bytes, row.kind) };
          this.emit(); return;
        }
        if (!part.length) throw Error('The evidence read made no progress.');
      }
      throw Error('The evidence read exceeded its page limit.');
    } catch (error) { this.state.detail = undefined; this.state.error = error instanceof Error ? error.message : 'Evidence is unavailable.'; this.emit(); throw error; }
  }
  async activity(gateway: Gateway, shared: SharedState, signal: AbortSignal) {
    this.state.reading = true; this.state.policyError = ''; this.state.affectError = ''; this.emit();
    if (!shared.connected || !shared.selectedConversation) this.state.affect = undefined;
    const checks = [this.readPolicy(gateway, signal)];
    if (shared.connected && shared.selectedConversation) checks.push((async () => {
      try { this.state.affect = affect((await gateway.json(`${PREFIX}/conversations/${handle(shared.selectedConversation, 'con')}/affect`, signal)).value, shared); }
      catch (error) { this.state.affect = undefined; this.state.affectError = error instanceof Error ? error.message : 'Affect is unavailable.'; }
    })());
    await Promise.all(checks); this.state.reading = false; this.emit();
  }
  private async readPolicy(gateway: Gateway, signal: AbortSignal) {
    try { this.state.policy = policy((await gateway.json('/aotx/v1/policy', signal, undefined, undefined, undefined, policyJson)).value); }
    catch (error) { this.state.policy = undefined; this.state.policyError = error instanceof Error ? error.message : 'Policy is unavailable.'; }
  }
  async action(gateway: Gateway, action: PolicyAction, epoch: string, revision: string, signal: AbortSignal) {
    const current = this.state.policy;
    if (this.state.reading || !current || current.abi < 3 || current.epoch !== epoch || current.control_revision !== revision || this.state.policyDenied)
      throw Error('Refresh policy state before an operator action.');
    this.state.policy = undefined; this.emit();
    const body = Buffer.from(`{"action":${JSON.stringify(action)},"epoch":${decimal(epoch)},"control_revision":${decimal(revision)}}`);
    try { this.state.policy = policy((await gateway.json('/aotx/v1/policy', signal, body, 'application/json', undefined, policyJson)).value); this.state.policyError = ''; }
    catch (error) {
      this.state.policyError = `${error instanceof Error ? error.message : 'Policy action failed.'} Refresh before another action. The action was not repeated.`;
      if ((error as { status?: number }).status === 403) this.state.policyDenied = true;
      throw error;
    } finally { this.emit(); }
  }
}
