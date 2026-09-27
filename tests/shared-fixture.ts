// SPDX-License-Identifier: Apache-2.0
// Supply distinct shared identities, split output and controlled transport failures.
import assert from 'node:assert/strict';
import { Gateway } from '../desktop/gateway.ts';
import type { JournalData } from '../shared/shared.ts';
export const identity = (n: number, width = 32) => n.toString(16).padStart(width, '0');
export class SharedFixture {
  lineage: string; actor: string; sequence = 1; registered = true; posts: string[] = [];
  status = 0; lose = false; wrongActor = false; gap = false; saved = true;
  records = new Map<string, Record<string, any>>(); space: string; conversation: string;
  constructor(readonly index: number, private stored: () => JournalData) {
    this.lineage = identity(index + 100); this.actor = identity(index + 200);
    this.space = `spc-${this.lineage}-${identity(index + 300)}`;
    this.conversation = `con-${this.lineage}-${identity(index + 400)}`;
  }
  save() { return { source: '40', generation: '3', incarnation: identity(500), boot: '1', commit_sha256: identity(600, 64), pending_bytes: this.saved ? '0' : '10', error: 0 }; }
  base() { return { schema: 'aotx.shared.resource.v1', lineage: this.lineage, save: this.save() }; }
  person() { return { ...this.base(), participant: this.actor, registered: this.registered, next_sequence: String(this.sequence), retry_floor: '1' }; }
  async value(path: string, encoded?: string) {
    const url = new URL(path, 'http://127.0.0.1:8080'), route = url.pathname.replace('/aotx/v1/shared', '');
    if (encoded) {
      const b = JSON.parse(encoded); this.posts.push(encoded);
      if (route.endsWith('/inputs')) assert.equal(route, `/conversations/${this.conversation}/inputs`);
      assert.ok(this.stored().records.some(r => r.body === encoded), 'The exact body must be stored before transport.');
      if (this.status) return { status: this.status, value: {} };
      let r = [...this.records.values()].find(r => r.sequence === b.sequence);
      if (r) assert.equal(r.body, encoded);
      else {
        assert.equal(b.lineage, this.lineage); assert.equal(b.sequence, String(this.sequence++));
        const operation = route === '/participant' ? 1 : route === '/spaces' ? 2 : route.endsWith('/members') ? 3 : route.endsWith('/conversations') ? 4 : route.endsWith('/inputs') ? 5 : route.endsWith('/cancel') ? 6 : route === '/retire' ? 7 : 9;
        r = { id: `op-${this.lineage}-${identity(this.index * 100 + this.sequence + 700)}`, actor: this.actor,
          operation_key: b.operation_key, sequence: b.sequence, next_sequence: String(this.sequence), operation,
          resource: b.operation_key, accepted: true, device_committed: true, saved_admission: true,
          admission_source: '10', terminal_source: '20', input_order: b.sequence, status: 0, gap: false,
          usage: { input_tokens: 4, output_tokens: 8 }, finish: 1, body: encoded };
        this.records.set(r.id, r); if (operation === 1) this.registered = true;
      }
      if (this.lose) { this.lose = false; throw Error('Lost admission'); }
      return { status: 200, value: this.result(r, 0, false) };
    }
    if (route === '/participant') return { status: 200, value: this.person() };
    if (route === '/capabilities') return { status: 200, value: { ...this.person(), persistence: 'complete_runtime' } };
    if (route.startsWith('/operations/')) {
      const r = this.records.get(route.split('/')[2]); if (!r) return { status: 410, value: {} };
      return { status: 200, value: this.result(r, Number(url.searchParams.get('offset') || 0), true) };
    }
    let items: unknown[] = [];
    if (route === '/spaces') items = [{ id: this.space, owner: this.actor, scope: 'private', permissions: ['read', 'write', 'manage'] }];
    if (route === `/spaces/${this.space}`) return { status: 200, value: { ...this.base(), id: this.space, scope: 'private', permissions: ['read', 'write', 'manage'] } };
    if (route === `/conversations/${this.conversation}`) return { status: 200, value: { ...this.base(), id: this.conversation, space: this.space } };
    if (route.endsWith('/conversations')) items = [{ id: this.conversation, space: this.space, next_order: '1', event_floor: '0', busy: false }];
    return { status: 200, value: { ...this.base(), space: this.space, items, next_cursor: '0', gap: this.gap, event_floor: this.gap ? '20' : '0' } };
  }
  result(record: Record<string, any>, offset: number, complete: boolean) {
    const { body, ...r } = record;
    const bytes = Buffer.from(`Reply ${this.index}: \u20ac`), end = complete ? bytes.length : bytes.length - 1;
    const part = bytes.subarray(offset, Math.max(offset, end));
    return { ...this.base(), ...r, actor: this.wrongActor ? identity(99999) : this.actor,
      state: complete ? 'completed' : 'running', status: complete ? 200 : 0, saved_terminal: complete && this.saved,
      offset: String(offset), next_offset: String(offset + part.length), output_bytes: String(bytes.length),
      output: { base64: part.toString('base64'), bytes: String(part.length), text: null } };
  }
  gateway(url = 'http://127.0.0.1:8080') {
    return new Gateway(url, 'fixture-token', (async (input: string | URL | Request, init: RequestInit) => {
      const response = await this.value(String(input), init.body ? Buffer.from(init.body as Uint8Array).toString() : undefined);
      return new Response(JSON.stringify(response.value), { status: response.status });
    }) as typeof fetch);
  }
}
