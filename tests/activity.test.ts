// SPDX-License-Identifier: Apache-2.0
// Keep bounded activity pages independent from shared event selection and refresh their status.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller } from '../desktop/controller.ts';
import { Catalog } from '../desktop/catalog.ts';
import { Gateway } from '../desktop/gateway.ts';
import { SharedFixture, identity } from './shared-fixture.ts';
import { emptyJournal } from '../desktop/shared/journal.ts';
import { caps, token } from './fixture.ts';
for (const count of [1, 64]) test(`browse ${count} independent activity histories beyond the first 64 events`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-activity-'));
  try { for (let i = 0; i < count; i++) {
    const folder = join(root, `project-${i}`); mkdirSync(folder);
    const f = new SharedFixture(i + 100, emptyJournal); let fail = false;
    const events = Array.from({ length: 65 }, (_, j) => ({ id: `op-${f.lineage}-${identity(i * 100 + j + 1)}`, actor: f.actor,
      input_order: String(j + 1), state: j === 64 ? 'running' : 'completed', sequence: String(j + 1), saved_admission: true,
      saved_terminal: j !== 64, output_bytes: String(i + j * 17), status: 200, output_tokens: i + j + 1, finish: 1,
      admission_source: String(i * 100 + j), terminal_source: String(i * 100 + j + 1), gap: false }));
    const request = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/aotx/v1/capabilities') return new Response(JSON.stringify(caps));
      if (url.pathname.endsWith('/policy') || url.pathname.endsWith('/affect')) return new Response('{}', { status: 404 });
      if (url.pathname.endsWith('/events')) {
        if (fail) return new Response('{}', { status: 403 });
        const start = Math.max(Number(url.searchParams.get('cursor')), 1), items = events.filter(e => Number(e.input_order) >= start).slice(0, 64);
        return new Response(JSON.stringify({ ...f.base(), space: f.space, items, next_cursor: String(start + items.length), next_order: '66', event_floor: '1', gap: false }));
      }
      const result = await f.value(String(input)); return new Response(JSON.stringify(result.value), { status: result.status });
    };
    const client = new Controller(folder, () => {}, (url, secret) => new Gateway(url, secret, request as typeof fetch), () => {}, new Catalog(join(root, `catalog-${i}`)));
    try {
      await client.run({ type: 'connect', url: 'http://127.0.0.1:8080', token }); await client.run({ type: 'sharedConnect' });
      await client.run({ type: 'sharedSelect', kind: 'space', id: f.space }); await client.run({ type: 'sharedSelect', kind: 'conversation', id: f.conversation });
      await client.run({ type: 'sharedPage', kind: 'events', cursor: '65' });
      await client.run({ type: 'activityRead' });
      assert.equal(client.state.evidence.events.items.length, 64); assert.equal(client.state.evidence.events.next, '65');
      assert.equal(client.state.shared.events.items[0].id, events[64].id);
      await client.run({ type: 'activityPage', cursor: client.state.evidence.events.next });
      assert.equal(client.state.evidence.events.items[0].id, events[64].id); assert.equal(client.state.evidence.events.next, '0');
      events[64].state = 'completed'; events[64].saved_terminal = true;
      await client.run({ type: 'activityRead' });
      assert.equal(client.state.evidence.eventCursor, '65'); assert.equal(client.state.evidence.events.items[0].state, 'completed');
      assert.equal(client.state.shared.events.items[0].state, 'running');
      await client.run({ type: 'sharedPage', kind: 'events', cursor: '0' }); await client.run({ type: 'activityRead' });
      assert.equal(client.state.evidence.events.items[0].id, events[64].id); assert.equal(client.state.shared.events.items[0].id, events[0].id);
      fail = true; await client.run({ type: 'activityRead' }); assert.equal(client.state.evidence.events.items.length, 0); assert.ok(client.state.evidence.eventError);
    } finally { await client.close(); }
  } } finally { rmSync(root, { recursive: true }); }
});
