// SPDX-License-Identifier: Apache-2.0
// Verify exact control selection on ordinary and shared inputs and explicit publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { capabilities, Gateway } from '../desktop/gateway.ts';
import { Controller } from '../desktop/controller.ts';
import { runtimeActions, runtimeProfile } from '../shared/setup.ts';
import { Catalog } from '../desktop/catalog.ts';
import { ProjectStore, emptyProject } from '../desktop/storage.ts';
import { SharedSession } from '../desktop/shared/session.ts';
import { MutationJournal, emptyJournal } from '../desktop/shared/journal.ts';
import { choice, control, selection } from '../shared/controls.ts';
import { caps as baseCaps, token } from './fixture.ts';
import { identity, SharedFixture } from './shared-fixture.ts';
import type { Turn } from '../shared/types.ts';
export function advertised(index: number) {
  return { schema: 'aotx.control.v1', name: `control-${index}`, kind: 'residual_vector', available: true,
    positions: 'response', hook: 1, layers: [index % 64], dose_scale: 10000, accepted_doses: [100 + index], combinations: false, qualification_sha256: identity(index + 400, 64) };
}
function discovery(count: number) {
  return { ...baseCaps, features: { ...baseCaps.features, control_selection: true }, models: Array.from({ length: count }, (_, i) =>
    ({ ...baseCaps.models[0], id: `model-${i}`, sha256: identity(i + 1, 64), controls: [advertised(i)] })) };
}
async function until(check: () => boolean) { for (let i = 0; i < 300 && !check(); i++) await delay(5); assert.ok(check()); }
for (const count of [1, 64]) test(`route ${count} qualified ordinary controls and preserve their saved identities`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-control-')), available = discovery(count); let posts: any[] = [];
  class Client extends Gateway {
    async discover() { return capabilities(available); }
    async submit(body: unknown) { posts.push(body); return { handle: `req-0000000000000001-${identity(posts.length)}`, epoch: '1' }; }
    async read(turn: Turn) { return { ...turn, phase: 'completed' as const, reply: 'Result', bytes: Buffer.from('Result').toString('base64'), cursor: 6 }; }
  }
  mkdirSync(join(root, 'project'));
  const client = new Controller(join(root, 'project'), () => {}, (url, token) => new Client(url, token), () => {}, new Catalog(join(root, 'catalog')));
  try {
    await client.run({ type: 'connect', url: 'http://127.0.0.1:8080', token });
    for (let i = 0; i < count; i++) {
      const m = available.models[i], c = m.controls[0];
      await client.run({ type: 'profile', model: m.id, maxTokens: 8, temperature: 0 }); assert.equal(client.state.control, undefined);
      await client.run({ type: 'controlSelect', value: { model: m.id, sha256: m.sha256, name: c.name, qualification: c.qualification_sha256, dose: c.accepted_doses[0] } });
      await client.run({ type: 'newConversation', title: `Input ${i}` }); await client.run({ type: 'send', id: client.state.selected, text: `Prompt ${i}` }); await until(() => !client.state.busy);
      assert.deepEqual(posts[i].control, { schema: 'aotx.control.selection.v1', kind: 'residual_vector', qualification_sha256: c.qualification_sha256, dose: c.accepted_doses[0] });
      assert.equal(posts[i].model, m.id);
    }
    const last = available.models.at(-1)!.controls[0]; last.qualification_sha256 = identity(90000, 64);
    await assert.rejects(client.run({ type: 'send', id: client.state.selected, text: 'Changed qualification' }), /exact model/); assert.equal(posts.length, count);
    const store = new ProjectStore(join(root, 'project'));
    assert.equal(store.read().conversations.at(-1)?.turns[0].control?.qualification, identity(count - 1 + 400, 64)); store.close();
    await client.run({ type: 'disconnect' }); assert.equal(client.state.control, undefined);
  } finally { await client.close(); rmSync(root, { recursive: true }); }
});
for (const count of [1, 64]) test(`bind ${count} shared controls and publications to exact selected identities`, async () => {
  const journal = new MutationJournal(emptyJournal(), () => {}), f = new SharedFixture(9, () => journal.data), available = discovery(count);
  const original = f.value.bind(f); let enabled = false, manage = true;
  f.value = async (path, body) => {
    const route = new URL(path, 'http://localhost').pathname;
    if (route === '/aotx/v1/capabilities') return { status: 200, value: available };
    if (route.endsWith('/affect')) return { status: 200, value: { ...f.base(), id: f.conversation, space: f.space, affect: {
      schema: 'aotx.affect.scope.v1', enabled, revision: '1', fast_q15: [0,0,0,0], slow_q15: [0,0,0,0], scale_q16: 65535, event_mask: 0,
      actuator_flags: 0, budget_spent: 0, model_role: 0, model_sha256: identity(1,64), probes_at_last_turn: { valence: 'unavailable', arousal: 'unavailable' } } } };
    if (!body && /\/spaces\/spc-/.test(route) && !route.includes('/conversations') && !route.includes('/members')) return {
      status: 200, value: { ...f.base(), id: route.split('/').at(-1), permissions: manage ? ['read','manage'] : ['read'] } };
    const response = await original(path, body);
    if (body && route.includes('/publish/')) { const id = (response.value as any).id; f.records.get(id)!.operation = 8; (response.value as any).operation = 8; }
    return response;
  };
  const session = new SharedSession(journal, () => {});
  try {
    await session.connect(f.gateway()); const project = { ...emptyProject('Shared'), maxTokens: 8 };
    await session.execute({ type: 'sharedSelect', kind: 'space', id: f.space }, project);
    await session.execute({ type: 'sharedSelect', kind: 'conversation', id: f.conversation }, project);
    for (let i = 0; i < count; i++) {
      project.model = `model-${i}`; const m = available.models[i], c = m.controls[0];
      const selected = { model: m.id, sha256: m.sha256, name: c.name, qualification: c.qualification_sha256, dose: c.accepted_doses[0] };
      enabled = true; const before = f.posts.length;
      await assert.rejects(session.execute({ type: 'sharedSend', text: `Input ${i}` }, project, capabilities(available), [], selected), /affect/); assert.equal(f.posts.length, before);
      enabled = false; await session.execute({ type: 'sharedSend', text: `Input ${i}` }, project, capabilities(available), [], selected); await until(() => !session.state.watching.length);
      assert.equal(JSON.parse(f.posts.at(-1)!).control.qualification_sha256, c.qualification_sha256);
      const destination = `spc-${f.lineage}-${identity(i + 5000)}`, id = identity(i + 6000), version = String(i + 3);
      manage = false; await assert.rejects(session.execute({ type: 'sharedPublish', destination, id, version }, project), /management/); assert.equal(f.posts.length, before + 1);
      manage = true; await session.execute({ type: 'sharedPublish', destination, id, version }, project); await until(() => !session.state.watching.length);
      const row = journal.data.records.at(-1)!; assert.equal(row.path, `/aotx/v1/shared/spaces/${destination}/publish/${id}`); assert.equal(JSON.parse(row.body).source_version, version); assert.equal(session.state.error, '');
    }
  } finally { await session.disconnect(); }
});
test('unsupported controls and unadvertised doses cannot become selections', () => {
  const caps = capabilities(discovery(1)), c = caps.models[0].controls[0];
  const value = { model: caps.models[0].id, sha256: caps.models[0].sha256, name: c.name, qualification: c.qualification_sha256!, dose: 100 };
  assert.ok(selection(choice(value), caps, value.model));
  for (const edit of [{ dose: 101 }, { qualification: identity(9000,64) }, { sha256: identity(8000,64) }, { model: 'other' }]) assert.throws(() => selection({ ...value, ...edit }, caps, value.model));
  for (const edit of [{ schema: 'future' }, { kind: 'future' }, { available: false }, { combinations: true }, { qualification_sha256: identity(0,64) }]) assert.equal(control({ ...advertised(0), ...edit }).available, false);
  for (const doses of [[0], [1.5], [100,100], [40001]]) assert.throws(() => control({ ...advertised(0), accepted_doses: doses }));
});

for (const count of [1, 64]) test(`grant policy management only to ${count} explicit runtime profile choices`, () => {
  for (let i = 0; i < count; i++) {
    const base = { name: `Runtime ${i}`, build: '/build', gateway: '/gateway', python: '/python', models: '/models', modules: '/modules', folder: `/runs/${i}`,
      gpu: `GPU-11111111-2222-3333-4444-${identity(i + 1).slice(-12)}`, role: 'language' };
    assert.equal(runtimeActions(runtimeProfile(base)).includes('policy_manage'), false);
    const selected = runtimeProfile({ ...base, policyManage: i % 2 === 0 });
    assert.equal(runtimeActions(selected).includes('policy_manage'), i % 2 === 0);
    assert.throws(() => runtimeProfile({ ...base, policyManage: 'true' }), /policy permission/);
  }
});
