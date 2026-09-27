// SPDX-License-Identifier: Apache-2.0
// Define bounded evidence views, current memory metadata and policy commands.
import { object, decimal, hex, handle, scope, small, type Scope } from './shared-protocol.js';
import type { Decoded } from './payload.js';
import { choice, type ControlChoice } from './controls.js';
export interface MemoryRow { id: string; version: string; kind: number; scope: Scope; owner: string; room: string; bytes: string; source: string; actor: string }
export function memoryRow(value: unknown): MemoryRow {
  const r = object(value);
  return { id: hex(r.id), version: decimal(r.version), kind: small(r.kind), scope: scope(r.scope), owner: hex(r.owner),
    room: hex(r.room), bytes: decimal(r.bytes), source: hex(r.source), actor: hex(r.actor) };
}
export interface EvidenceDetail { row: MemoryRow; base64: string; decoded: Decoded; truncated: boolean }
export interface Policy { epoch: string; control_revision: string; abi: number; state: string; reason: string;
  review_enabled: boolean; pending: number; active_rows: number; status: number; counters: Record<string, string> }
export interface Affect { enabled: boolean; revision: string; fast: number[]; slow: number[]; scale: number;
  events: number; actuators: number; spent: number; role: number; model: string | null; probes: string[] }
export interface EvidenceState {
  reading: boolean; space: string; rows: MemoryRow[]; next: string; detail?: EvidenceDetail; error: string;
  policy?: Policy; policyError: string; policyDenied: boolean; affect?: Affect; affectError: string;
}
export const emptyEvidence = (): EvidenceState => ({ reading: false, space: '', rows: [], next: '0', error: '', policyError: '', policyDenied: false, affectError: '' });
export const policyActions = ['pause', 'resume', 'stop', 'review_on', 'review_off'] as const;
export type PolicyAction = typeof policyActions[number];
export type EvidenceCommand =
  | { type: 'evidenceList'; cursor: string }
  | { type: 'evidenceRead'; id: string; version?: string }
  | { type: 'activityRead' }
  | { type: 'policyAction'; action: PolicyAction; epoch: string; revision: string }
  | { type: 'controlSelect'; value: ControlChoice | null };
export function evidenceCommand(r: Record<string, unknown>): EvidenceCommand | undefined {
  switch (r.type) {
    case 'evidenceList': return { type: r.type, cursor: decimal(r.cursor) };
    case 'evidenceRead': return { type: r.type, id: hex(r.id), ...(r.version === undefined ? {} : { version: decimal(r.version) }) };
    case 'activityRead': return { type: r.type };
    case 'policyAction':
      if (!policyActions.includes(r.action as PolicyAction)) throw Error('Invalid policy action.');
      return { type: r.type, action: r.action as PolicyAction, epoch: decimal(r.epoch), revision: decimal(r.revision) };
    case 'controlSelect': return { type: r.type, value: r.value === null ? null : choice(r.value) };
  }
}
export function publication(r: Record<string, unknown>) {
  return { type: 'sharedPublish' as const, destination: handle(r.destination, 'spc'), id: hex(r.id), version: decimal(r.version) };
}
