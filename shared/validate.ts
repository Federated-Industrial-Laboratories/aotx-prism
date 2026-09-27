// SPDX-License-Identifier: Apache-2.0
// Validate persisted project data and view commands before they cross boundaries.
import type { Command, Project, Turn } from './types.js';
import { setupCommand } from './setup.js';
export const MAX_PROJECT = 16 * 1024 * 1024;
export const MAX_OUTPUT = 1024 * 1024;
export const HANDLE = /^req-[0-9a-f]{16}-[0-9a-f]{32}$/;
const ID = /^[0-9a-f-]{36}$/;
const PHASES = new Set(['submitting', 'accepted', 'running', 'completed', 'failed',
  'cancelled', 'unknown', 'interrupted', 'expired']);
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, limit: number, empty = false): string {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim()) || value.includes('\0'))
    throw Error('Invalid text field.');
  return value;
}
export function number(value: unknown, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
    throw Error('Invalid numeric field.');
  return value;
}
export function endpoint(value: unknown): string {
  const url = new URL(text(value, 2048));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw Error('Use an HTTP or HTTPS gateway URL without credentials or query fields.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw Error('Remote gateways require HTTPS. Use a loopback tunnel for local HTTP.');
  return url.href.replace(/\/$/, '');
}
export function project(value: unknown): Project {
  const row = object(value);
  if (row.schema === 1) { row.schema = 2; row.profiles = []; }
  if (row.schema !== 2) throw Error('Unsupported project version.');
  if (!Array.isArray(row.profiles) || row.profiles.length > 32) throw Error('Invalid profile count.');
  const names = new Set<string>();
  for (const value of row.profiles) {
    const p = object(value), name = text(p.name, 80); text(p.model, 256);
    if (names.has(name) || !/^[a-f0-9]{64}$/.test(text(p.sha256, 64))) throw Error('Invalid generation profile.');
    names.add(name); number(p.temperature, 0, 2);
    if (!Number.isInteger(number(p.maxTokens, 1, 1048576))) throw Error('Invalid profile token limit.');
  }
  text(row.name, 120); text(row.model, 256, true); text(row.endpoint, 2048, true);
  if (row.endpoint) endpoint(row.endpoint);
  number(row.maxTokens, 1, 1048576); number(row.temperature, 0, 2);
  if (!Number.isInteger(row.maxTokens) || !Array.isArray(row.conversations) || row.conversations.length > 64)
    throw Error('Invalid project capacity.');
  const ids = new Set<string>();
  for (const raw of row.conversations) {
    const conversation = object(raw), id = text(conversation.id, 36);
    if (!ID.test(id) || ids.has(id)) throw Error('Invalid conversation identity.');
    ids.add(id); text(conversation.title, 120);
    if (conversation.archived !== undefined && typeof conversation.archived !== 'boolean') throw Error('Invalid archive state.');
    if (!Array.isArray(conversation.turns) || conversation.turns.length > 128) throw Error('Invalid conversation length.');
    for (const item of conversation.turns) { validateTurn(item);
      const turnId = (item as Turn).id; if (ids.has(turnId)) throw Error('Repeated turn identity.'); ids.add(turnId);
    }
  }
  return row as unknown as Project;
}
function validateTurn(value: unknown): void {
  const row = object(value);
  if (!ID.test(text(row.id, 36)) || !PHASES.has(text(row.phase, 20))) throw Error('Invalid turn identity or state.');
  text(row.prompt, 65536); text(row.model, 256); endpoint(row.endpoint);
  text(row.reply, MAX_OUTPUT, true); text(row.error, 1024, true); text(row.created, 40);
  if (row.media !== undefined) {
    if (!Array.isArray(row.media) || row.media.length > 8) throw Error('Invalid attachment count.');
    for (const item of row.media) {
      const m = object(item);
      if (!/^media-[a-f0-9]{32}$/.test(text(m.id, 38)) || !/^[a-f0-9]{64}$/.test(text(m.sha256, 64)) || !['image', 'audio'].includes(String(m.modality))) throw Error('Invalid saved attachment.');
      text(m.name, 255); endpoint(m.endpoint); text(m.epoch, 20); number(m.bytes, 1, 33554432);
    }
  }
  if (row.handle !== undefined && !HANDLE.test(text(row.handle, 53))) throw Error('Invalid request handle.');
  if (row.epoch !== undefined && !/^\d{1,20}$/.test(text(row.epoch, 20))) throw Error('Invalid runtime epoch.');
  number(row.cursor, 0, MAX_OUTPUT);
  if (!Number.isInteger(row.cursor) || typeof row.cancelRequested !== 'boolean') throw Error('Invalid request state.');
  const encoded = text(row.bytes, Math.ceil(MAX_OUTPUT / 3) * 4, true);
  if (Buffer.from(encoded, 'base64').toString('base64') !== encoded) throw Error('Invalid output bytes.');
  const length = encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (length !== row.cursor) throw Error('Invalid output cursor.');
  const complete = ['completed', 'failed', 'cancelled'].includes(String(row.phase));
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(encoded, 'base64'), { stream: !complete });
  if (decoded !== row.reply) throw Error('Stored reply text does not match its output bytes.');
  if (row.usage !== undefined) {
    const usage = object(row.usage);
    for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'])
      if (!Number.isInteger(number(usage[key], 0, 2147483647))) throw Error('Invalid token count.');
  }
}
export function terminal(turn: Turn): boolean {
  return ['completed', 'failed', 'cancelled', 'expired'].includes(turn.phase);
}
export function command(value: unknown): Command {
  const row = object(value), type = text(row.type, 24);
  const setup = setupCommand(row); if (setup) return setup;
  switch (type) {
    case 'state': case 'chooseFolder': case 'disconnect': case 'uploadMedia': case 'listMedia': break;
    case 'files': relativePath(row.path ?? '', true); break;
    case 'removeAttachment': case 'deleteMedia': if (!/^media-[a-f0-9]{32}$/.test(text(row.id, 38))) throw Error('Invalid media handle.'); break;
    case 'openProject': text(row.path, 4096); break;
    case 'connect': endpoint(row.url); if (!/^[^\s\x00-\x1f\x7f]{32,256}$/.test(text(row.token, 256))) throw Error('Enter a valid bearer token.'); break;
    case 'newConversation': text(row.title, 120); break;
    case 'select': case 'cancel': case 'resume': text(row.id, 36); break;
    case 'send': text(row.id, 36); text(row.text, 65536); break;
    case 'profile': text(row.model, 256); number(row.maxTokens, 1, 1048576); number(row.temperature, 0, 2);
      if (!Number.isInteger(row.maxTokens)) throw Error('Use a whole token limit.'); break;
    case 'readFile': relativePath(row.name); break;
    case 'layout': text(row.value, 262144); break;
    case 'theme': if (!['silver', 'graphite'].includes(String(row.value))) throw Error('Invalid theme.'); break;
    default: throw Error('Unsupported desktop command.');
  }
  return row as unknown as Command;
}
export function relativePath(value: unknown, empty = false): string {
  const path = text(value, 4096, empty);
  if (empty && path === '') return path;
  if (path.includes('\\') || path.split('/').length > 16 || path.split('/').some(p => !p || p.startsWith('.') || p.length > 255)) throw Error('Select a visible path inside the project.');
  return path;
}
