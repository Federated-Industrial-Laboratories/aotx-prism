// SPDX-License-Identifier: Apache-2.0
// Exercise saved admission, disconnect, recovery, cancellation and uncertain submission.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Controller } from '../desktop/controller.ts';
import { ProjectStore } from '../desktop/storage.ts';
import { fixture, token, handle } from './fixture.ts';
async function until(check: () => boolean) { for (let i = 0; i < 150; i++) { if (check()) return; await delay(40); } throw Error('State deadline exceeded.'); }
test('conversation survives disconnect, GET recovery, cancellation and application restart', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'prism-controller-')), server = await fixture();
  let client = new Controller(folder, () => {});
  try {
    await client.run({ type: 'connect', url: server.url, token });
    await client.run({ type: 'newConversation', title: 'Native conversation' });
    const id = client.state.selected; server.mode('hold');
    await client.run({ type: 'send', id, text: 'Hello' });
    await until(() => !!client.state.project.conversations[0].turns[0].handle);
    const disk = new ProjectStore(folder); assert.equal(disk.read().conversations[0].turns[0].handle, handle); disk.close();
    await client.run({ type: 'disconnect' });
    assert.equal(client.state.project.conversations[0].turns[0].phase, 'interrupted');
    await client.close(); client = new Controller(folder, () => {});
    await client.run({ type: 'connect', url: server.url, token }); server.mode('normal');
    const turn = client.state.project.conversations[0].turns[0];
    await client.run({ type: 'resume', id: turn.id }); await until(() => !client.state.busy);
    assert.equal(client.state.project.conversations[0].turns[0].reply, server.bytes.toString());
    assert.equal(client.state.project.conversations[0].turns[0].phase, 'completed');
    assert.equal(server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).length, 1);
    server.mode('hold'); await client.run({ type: 'send', id, text: 'Second prompt' });
    await until(() => !!client.state.project.conversations[0].turns[1].handle);
    const second = client.state.project.conversations[0].turns[1];
    await client.run({ type: 'cancel', id: second.id }); server.mode('normal'); await until(() => !client.state.busy);
    assert.equal(client.state.project.conversations[0].turns[1].phase, 'cancelled');
    const submission = server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).at(-1)!.body as any;
    assert.deepEqual(submission.messages.map((m: any) => m.role), ['system', 'user', 'assistant', 'user']);
    await client.close(); client = new Controller(folder, () => {});
    assert.equal(client.state.project.conversations[0].turns.length, 2);
    assert.ok(!JSON.stringify(client.state).includes(token));
  } finally { await client.close(); await server.close(); rmSync(folder, { recursive: true }); }
});
test('uncertain submission never retries and cannot be appended as successful history', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'prism-unknown-')), server = await fixture(), client = new Controller(folder, () => {});
  try {
    await client.run({ type: 'connect', url: server.url, token }); await client.run({ type: 'newConversation', title: 'Unknown' });
    server.mode('lost'); await client.run({ type: 'send', id: client.state.selected, text: 'Uncertain' });
    await until(() => !client.state.busy);
    assert.equal(client.state.project.conversations[0].turns[0].phase, 'unknown');
    assert.equal(server.calls.filter(c => c.method === 'POST').length, 1);
    await assert.rejects(client.run({ type: 'send', id: client.state.selected, text: 'Duplicate' }), /Resolve/);
    assert.equal(server.calls.filter(c => c.method === 'POST').length, 1);
  } finally { await client.close(); await server.close(); rmSync(folder, { recursive: true }); }
});
test('HTTP error handles remain recoverable and epoch loss remains explicit', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'prism-handle-')), server = await fixture(), client = new Controller(folder, () => {});
  try {
    await client.run({ type: 'connect', url: server.url, token }); await client.run({ type: 'newConversation', title: 'Handle' });
    server.mode('lost-handle'); await client.run({ type: 'send', id: client.state.selected, text: 'Recover by handle' });
    await until(() => !client.state.busy);
    const turn = client.state.project.conversations[0].turns[0];
    assert.equal(turn.handle, handle); assert.equal(turn.phase, 'interrupted');
    server.mode('expired'); await client.run({ type: 'resume', id: turn.id }); await until(() => !client.state.busy);
    assert.equal(client.state.project.conversations[0].turns[0].phase, 'expired');
    assert.equal(server.calls.filter(c => c.method === 'POST').length, 1);
  } finally { await client.close(); await server.close(); rmSync(folder, { recursive: true }); }
});
test('terminal device state is retained when the local save conflicts', async () => {
  const { Gateway } = await import('../desktop/gateway.ts');
  const { caps } = await import('./fixture.ts');
  const folder = mkdtempSync(join(tmpdir(), 'prism-save-failure-'));
  class ConflictingGateway extends Gateway {
    async discover() { const { capabilities } = await import('../desktop/gateway.ts'); return capabilities(caps); }
    async submit() { return { handle, epoch: '1' }; }
    async read(turn: import('../shared/types.ts').Turn) {
      const other = new ProjectStore(folder), project = other.read(); project.name = 'Other writer'; other.write(project); other.close();
      return { ...turn, phase: 'completed' as const, reply: 'Completed output', bytes: Buffer.from('Completed output').toString('base64'), cursor: 16 };
    }
  }
  const client = new Controller(folder, () => {}, (url, token) => new ConflictingGateway(url, token));
  try {
    await client.run({ type: 'connect', url: 'http://127.0.0.1:1', token });
    await client.run({ type: 'newConversation', title: 'Save conflict' });
    await client.run({ type: 'send', id: client.state.selected, text: 'Hello' }); await until(() => !client.state.busy);
    const turn = client.state.project.conversations[0].turns[0];
    assert.equal(turn.phase, 'completed'); assert.equal(turn.reply, 'Completed output'); assert.equal(client.state.saved, false);
    assert.match(client.state.notice, /could not be saved/);
    const disk = new ProjectStore(folder); assert.equal(disk.read().conversations[0].turns[0].phase, 'accepted'); disk.close();
    await assert.rejects(client.run({ type: 'send', id: client.state.selected, text: 'Next' }), /Reopen/);
  } finally { await client.close(); rmSync(folder, { recursive: true }); }
});
for (const count of [1, 64]) test(`route ${count} distinct conversations with distinct native handles`, async () => {
  const { Gateway, capabilities } = await import('../desktop/gateway.ts');
  const { caps } = await import('./fixture.ts');
  const folder = mkdtempSync(join(tmpdir(), 'prism-routes-')), replies = new Map<string, string>(); let sequence = 0;
  class RoutedGateway extends Gateway {
    async discover() { return capabilities(caps); }
    async submit(body: unknown) {
      const messages = (body as { messages: { content: string }[] }).messages;
      const identity = 'req-0000000000000001-' + (++sequence).toString(16).padStart(32, '0');
      replies.set(identity, `Reply to ${messages.at(-1)!.content}`); return { handle: identity, epoch: '1' };
    }
    async read(turn: import('../shared/types.ts').Turn) {
      const reply = replies.get(turn.handle!)!;
      return { ...turn, phase: 'completed' as const, reply, bytes: Buffer.from(reply).toString('base64'), cursor: Buffer.byteLength(reply) };
    }
  }
  let client = new Controller(folder, () => {}, (url, token) => new RoutedGateway(url, token));
  try {
    await client.run({ type: 'connect', url: 'http://127.0.0.1:1', token });
    for (let i = 0; i < count; i++) await client.run({ type: 'newConversation', title: `Conversation ${i}` });
    for (let i = count - 1; i >= 0; i--) {
      const id = client.state.project.conversations[i].id;
      await client.run({ type: 'send', id, text: `Prompt ${i}` }); await until(() => !client.state.busy);
      const turns = client.state.project.conversations[i].turns;
      assert.equal(turns.length, 1); assert.equal(turns[0].prompt, `Prompt ${i}`); assert.equal(turns[0].reply, `Reply to Prompt ${i}`);
    }
    const expected = structuredClone(client.state.project); await client.close(); client = new Controller(folder, () => {});
    assert.deepEqual(client.state.project, expected);
    assert.equal(new Set(expected.conversations.map(c => c.turns[0].handle)).size, count);
  } finally { await client.close(); rmSync(folder, { recursive: true }); }
});
