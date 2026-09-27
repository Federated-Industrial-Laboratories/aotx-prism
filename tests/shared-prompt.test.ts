// SPDX-License-Identifier: Apache-2.0
// Check canonical prompt recovery, scoped readback and old-server refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { SharedSession } from '../desktop/shared/session.ts';
import { MutationJournal, emptyJournal } from '../desktop/shared/journal.ts';
import { emptyProject } from '../desktop/storage.ts';
import { PromptFixture } from './prompt-fixture.ts';
import { identity } from './shared-fixture.ts';
for (const n of [1, 64]) test(`shared prompts retain exact bytes and scope for ${n} conversations`, async () => {
  for (let i = 0; i < n; i++) {
    let saved = emptyJournal();
    const fixture = new PromptFixture(i, () => saved), project = emptyProject('Prompt checks');
    let client = new SharedSession(new MutationJournal(saved, v => saved = structuredClone(v)), () => {});
    const open = async () => {
      await client.connect(fixture.gateway());
      await client.execute({ type: 'sharedSelect', kind: 'space', id: fixture.space }, project);
      await client.execute({ type: 'sharedSelect', kind: 'conversation', id: fixture.conversation }, project);
    };
    try {
      await open(); assert.equal(client.state.prompt!.text, fixture.prompt);
      for (const prompt of ['', null, `Distinct instruction ${i}. €`]) {
        fixture.prompt = prompt; await client.readPrompt();
        assert.deepEqual(client.state.prompt, { mode: prompt === null ? 'runtime' : 'explicit', text: prompt });
      }
      fixture.promptId = `con-${fixture.lineage}-${identity(99999)}`; await client.readPrompt();
      assert.equal(client.state.prompt, undefined); assert.ok(client.state.promptError.includes('another conversation'));
      fixture.promptId = ''; fixture.promptStatus = 403; await client.readPrompt(); assert.equal(client.state.prompt, undefined);
      fixture.promptStatus = 200; fixture.lose = true;
      await assert.rejects(client.execute({ type: 'sharedConversation', name: `Conversation ${i}`, systemPrompt: fixture.prompt! }, project));
      assert.equal(JSON.parse(saved.records[0].body).system_prompt, fixture.prompt);
      await client.disconnect();
      client = new SharedSession(new MutationJournal(saved, v => saved = structuredClone(v)), () => {}); await open();
      assert.equal(fixture.posts.length, 1);
      await client.execute({ type: 'sharedRetry', key: saved.records[0].key }, project);
      for (let j = 0; j < 100 && client.state.watching.length; j++) await delay(10);
      assert.equal(client.state.error, ''); assert.equal(fixture.posts[0], fixture.posts[1]);
      assert.equal(client.state.watching.length, 0);
      fixture.promptEnabled = false; await open(); assert.equal(client.state.promptBytes, 0);
      await assert.rejects(client.execute({ type: 'sharedConversation', name: 'Unsupported', systemPrompt: '' }, project));
      assert.equal(fixture.posts.length, 2);
    } finally { await client.disconnect(); }
  }
});
