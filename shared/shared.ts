// SPDX-License-Identifier: Apache-2.0
// Define shared workspace snapshots and validate explicit shared commands.
import { text } from './validate.js';
import { decimal, hex, handle, scope, rights, type Scope, type Participant, type Page, type Receipt } from './shared-protocol.js';
export interface Mutation {
  key: string; endpoint: string; lineage: string; actor: string; sequence: string;
  path: string; body: string; handle: string; refusal: number; created: string;
  label: string; result?: Record<string, unknown>;
}
export interface JournalData { schema: 1; records: Mutation[]; labels: Record<string, string> }
export interface SharedState {
  connected: boolean; person?: Participant; selectedSpace: string; selectedConversation: string;
  spaces: Page; members: Page; conversations: Page; events: Page;
  records: Mutation[]; labels: Record<string, string>; watching: string[];
  error: string; saved: boolean; inspected?: { receipt: Receipt; text: string };
}
export const emptyPage = (): Page => ({ items: [], next: '0', gap: false, floor: '0' });
export const emptyShared = (): SharedState => ({ connected: false, selectedSpace: '', selectedConversation: '',
  spaces: emptyPage(), members: emptyPage(), conversations: emptyPage(), events: emptyPage(),
  records: [], labels: {}, watching: [], error: '', saved: true });
export type SharedCommand =
  | { type: 'sharedConnect' | 'sharedRegister' | 'sharedSave' }
  | { type: 'sharedPage'; kind: 'spaces' | 'members' | 'conversations' | 'events'; cursor: string }
  | { type: 'sharedSpace'; scope: Scope; name: string }
  | { type: 'sharedConversation'; name: string }
  | { type: 'sharedSelect'; kind: 'space' | 'conversation'; id: string }
  | { type: 'sharedMember'; participant: string; permissions: string[] }
  | { type: 'sharedSend'; text: string }
  | { type: 'sharedRetry' | 'sharedRead' | 'sharedCancel' | 'sharedReattach'; key: string }
  | { type: 'sharedInspect'; id: string }
  | { type: 'sharedLabel'; id: string; name: string }
  | { type: 'sharedRetire'; floor: string };
export function sharedCommand(row: Record<string, unknown>): SharedCommand | undefined {
  switch (row.type) {
    case 'sharedConnect': case 'sharedRegister': case 'sharedSave': return { type: row.type };
    case 'sharedPage':
      if (!['spaces', 'members', 'conversations', 'events'].includes(String(row.kind))) throw Error('Invalid shared page.');
      return { type: row.type, kind: row.kind as 'spaces', cursor: decimal(row.cursor) };
    case 'sharedSpace': return { type: row.type, scope: scope(row.scope), name: text(row.name, 120) };
    case 'sharedConversation': return { type: row.type, name: text(row.name, 120) };
    case 'sharedSelect':
      if (row.kind !== 'space' && row.kind !== 'conversation') throw Error('Invalid shared selection.');
      return { type: row.type, kind: row.kind, id: handle(row.id, row.kind === 'space' ? 'spc' : 'con') };
    case 'sharedMember': return { type: row.type, participant: hex(row.participant), permissions: rights(row.permissions) };
    case 'sharedSend': return { type: row.type, text: text(row.text, 2048, true) };
    case 'sharedRetry': case 'sharedRead': case 'sharedCancel': case 'sharedReattach': return { type: row.type, key: hex(row.key) };
    case 'sharedInspect': return { type: row.type, id: handle(row.id, 'op') };
    case 'sharedLabel': return { type: row.type, id: handle(row.id, String(row.id).startsWith('spc-') ? 'spc' : 'con'), name: text(row.name, 120) };
    case 'sharedRetire': return { type: row.type, floor: decimal(row.floor) };
  }
}
