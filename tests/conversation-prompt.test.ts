// SPDX-License-Identifier: Apache-2.0
// Check prompt identity, persistence and byte bounds across distinct conversations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Controller } from '../desktop/controller.ts';
import { ProjectStore } from '../desktop/storage.ts';
import { DEFAULT_PROMPT, systemPrompt } from '../shared/conversation.ts';
import { fixture, token } from './fixture.ts';
async function idle(c: Controller) {
  for (let i = 0; i < 150; i++) { if (!c.state.busy) return; await delay(20); }
  throw Error('The request did not complete.');
}
for (const n of [1, 64]) test(`system prompts persist for ${n} distinct conversations`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-prompts-')), server = await fixture(false, 1, true);
  let client = new Controller(root, () => {});
  try {
    await client.run({ type: 'connect', url: server.url, token });
    for (let i = 0; i < n; i++) {
      await client.run({ type: 'newConversation', title: `Conversation ${i}`, systemPrompt: `Use the reference ${i}. €` });
      await client.run({ type: 'send', id: client.state.selected, text: `Request ${i}` }); await idle(client);
      assert.equal(client.state.project.conversations[i].turns[0].phase, 'completed');
    }
    const posts = server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests'));
    assert.equal(posts.length, n);
    posts.forEach((p, i) => assert.deepEqual((p.body as any).messages,
      [{ role: 'system', content: `Use the reference ${i}. €` }, { role: 'user', content: `Request ${i}` }]));
    await client.close(); client = new Controller(root, () => {});
    client.state.project.conversations.forEach((c, i) => assert.equal(c.systemPrompt, `Use the reference ${i}. €`));
  } finally { await client.close(); await server.close(); rmSync(root, { recursive: true }); }
});
test('new defaults, explicit blank and existing histories keep distinct prompt behavior', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-prompt-default-')), server = await fixture(false, 1, true);
  let client = new Controller(root, () => {});
  try {
    await client.run({ type: 'newConversation', title: 'Existing' }); await client.close();
    const store = new ProjectStore(root), saved = store.read(); delete saved.conversations[0].systemPrompt; store.write(saved); store.close();
    client = new Controller(root, () => {}); await client.run({ type: 'connect', url: server.url, token });
    await client.run({ type: 'send', id: client.state.selected, text: 'Existing request' }); await idle(client);
    await client.run({ type: 'newConversation', title: 'Default' });
    await client.run({ type: 'send', id: client.state.selected, text: 'Default request' }); await idle(client);
    await client.run({ type: 'newConversation', title: 'Blank', systemPrompt: '' });
    await client.run({ type: 'send', id: client.state.selected, text: 'Blank request' }); await idle(client);
    const posts = server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).map(c => c.body as any);
    assert.equal(posts[0].messages[0].role, 'user');
    assert.deepEqual(posts[1].messages[0], { role: 'system', content: DEFAULT_PROMPT });
    assert.equal(posts[2].messages[0].role, 'user');
    assert.equal(systemPrompt('é'.repeat(2048)).length, 2048);
    await assert.rejects(client.run({ type: 'newConversation', title: 'Too large', systemPrompt: 'é'.repeat(2049) }), /4,096/);
    assert.throws(() => systemPrompt('invalid\0prompt'));
    assert.throws(() => systemPrompt(42));
    assert.equal(client.state.project.conversations.length, 3);
  } finally { await client.close(); await server.close(); rmSync(root, { recursive: true }); }
});
