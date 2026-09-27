// SPDX-License-Identifier: Apache-2.0
// Check migration, exact profiles, nested file boundaries and media request lifetimes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { Controller } from '../desktop/controller.ts';
import { ProjectStore, emptyProject } from '../desktop/storage.ts';
import { Catalog } from '../desktop/catalog.ts';
import { inspect } from '../desktop/runtime/inspect.ts';
import { atomicExport } from '../desktop/export.ts';
import { Gateway, capabilities } from '../desktop/gateway.ts';
import { list } from '../desktop/media.ts';
import { fixture, token, caps } from './fixture.ts';
async function idle(c: Controller) { for (let i = 0; i < 150; i++) { if (!c.state.busy) return; await delay(40); } throw Error('Request did not finish.'); }
test('schema one history retains its original bytes and migrates without dropping turns', () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-migration-'));
  try {
    const store = new ProjectStore(root); store.close();
    const db = new DatabaseSync(join(root, '.prism/project.sqlite3'));
    const old = { ...emptyProject('Original'), schema: 1 };
    old.conversations = Array.from({length:64}, (_,i) => ({ id:randomUUID(), title:`History ${i}`, turns:[{ id:randomUUID(), prompt:`Prompt ${i}`, model:'text', endpoint:'http://localhost:8080', phase:'completed' as const, bytes:Buffer.from(`Reply ${i}`).toString('base64'), cursor:Buffer.byteLength(`Reply ${i}`), reply:`Reply ${i}`, error:'', created:'2026-01-01T00:00:00Z', cancelRequested:false }] })); delete (old as any).profiles;
    const bytes = JSON.stringify(old); db.prepare('UPDATE project SET data=?').run(bytes); db.exec('PRAGMA user_version=1'); db.close();
    const migrated = new ProjectStore(root), value = migrated.read();
    assert.deepEqual(value.conversations, old.conversations); assert.equal(value.name, 'Original'); assert.equal(value.schema, 2); assert.deepEqual(value.profiles, []); migrated.write(value); migrated.close();
    const verify = new DatabaseSync(join(root, '.prism/project.sqlite3'));
    assert.equal(verify.prepare('SELECT data FROM original_project WHERE version=1').get()!.data, bytes); verify.close();
  } finally { rmSync(root, { recursive: true }); }
});
test('nested previews exclude hidden paths, traversal and intermediate symbolic links', () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-nested-')), outside = mkdtempSync(join(tmpdir(), 'prism-outside-'));
  const store = new ProjectStore(root);
  try {
    mkdirSync(join(root, 'one/two'), { recursive: true }); writeFileSync(join(root, 'one/two/local.txt'), 'Nested bytes');
    writeFileSync(join(outside, 'secret.txt'), 'Outside'); symlinkSync(outside, join(root, 'one/escape'));
    assert.equal(store.readFile('one/two/local.txt'), 'Nested bytes'); assert.deepEqual(store.files('one').map(f => f.name), ['two']);
    for (const path of ['../secret.txt', 'one/../../secret.txt', 'one/escape/secret.txt', 'one/.hidden/file', '/secret.txt']) assert.throws(() => store.readFile(path));
    assert.throws(() => store.files('one/escape'));
    const exported = join(root, 'history.json'); atomicExport(exported, JSON.stringify(emptyProject('Export')));
    assert.equal(JSON.parse(readFileSync(exported, 'utf8')).name, 'Export');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.json')); assert.throws(() => atomicExport(join(root, 'link.json'), 'changed'));
    assert.equal(readFileSync(join(outside, 'secret.txt'), 'utf8'), 'Outside');
  } finally { store.close(); rmSync(root, { recursive: true }); rmSync(outside, { recursive: true }); }
});
test('generation profiles bind exact models and archive survives project reopening', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-profile-')), server = await fixture();
  let client = new Controller(root, () => {});
  try {
    await client.run({ type: 'connect', url: server.url, token });
    await client.run({ type: 'profile', model: 'text', maxTokens: 71, temperature: 0.3 });
    await client.run({ type: 'saveProfile', name: 'Precise' });
    await client.run({ type: 'profile', model: 'text', maxTokens: 12, temperature: 1 });
    await client.run({ type: 'applyProfile', name: 'Precise' }); assert.equal(client.state.project.maxTokens, 71);
    client.state.capabilities!.models[0].sha256 = 'b'.repeat(64);
    await assert.rejects(client.run({ type: 'applyProfile', name: 'Precise' }), /exact model/);
    await client.run({ type: 'newConversation', title: 'Original' }); const id = client.state.selected;
    await client.run({ type: 'renameConversation', id, title: 'Saved name' }); await client.run({ type: 'archiveConversation', id, archived: true });
    await assert.rejects(client.run({ type: 'send', id, text: 'Do not send' }), /Restore/);
    await client.close(); client = new Controller(root, () => {});
    assert.equal(client.state.project.conversations[0].title, 'Saved name'); assert.equal(client.state.project.conversations[0].archived, true);
    assert.equal(client.state.project.profiles[0].sha256, 'a'.repeat(64));
  } finally { await client.close(); await server.close(); rmSync(root, { recursive: true }); }
});
test('media sends exact handles, drains output, survives history and exposes interrupted uploads without retry', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-media-')), server = await fixture(true), client = new Controller(root, () => {});
  const jpg = join(root, 'sample.jpg'); writeFileSync(jpg, Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0]));
  try {
    await client.run({ type: 'connect', url: server.url, token }); await client.run({ type: 'newConversation', title: 'Media' });
    await client.uploadFile(jpg); const media = structuredClone(client.state.attachments[0]);
    await client.run({ type: 'send', id: client.state.selected, text: 'Read this image.' }); await idle(client);
    const request = server.calls.find(c => c.path.endsWith('/requests'))!.body as any;
    assert.deepEqual(request.messages[1].content[1], { type: 'media', media_id: media.id, modality: 'image' });
    assert.deepEqual(client.state.project.conversations[0].turns[0].media, [media]);
    server.mode('lost'); await assert.rejects(client.uploadFile(jpg));
    const uploads = server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/media'));
    assert.equal(uploads.length, 2); assert.equal((await client.run({ type: 'listMedia' })).media!.length, 2);
    await client.run({ type: 'deleteMedia', id: media.id }); assert.equal((await client.run({ type: 'listMedia' })).media!.length, 1);
    client.state.capabilities!.epoch = '2';
    await assert.rejects(client.run({ type: 'send', id: client.state.selected, text: 'Old media' }), /another runtime/);
    assert.ok(!JSON.stringify(client.state).includes(token));
  } finally { await client.close(); await server.close(); rmSync(root, { recursive: true }); }
});
test('inspection executes fixed arguments and rejects incompatible builds before model inspection', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-inspect-')), gpu = 'GPU-11111111-2222-3333-4444-555555555555', calls: string[][] = [];
  try {
    for (const name of ['aotx_boot', 'aotx_feed', 'aotx_drain', 'aotx_service', 'aotx_models', 'python']) writeFileSync(join(root, name), '', { mode: 0o700 });
    const profile = { name: 'Local', build: root, gateway: root, python: join(root, 'python'), models: root, modules: root, folder: root, gpu, role: 'language' as const };
    const result = await inspect(profile, async (file, args) => { calls.push([file, ...args]); return file.endsWith('aotx_boot') ? 'aotx 0.3.5 profile 12g arch sm_86 slots 64' : file.endsWith('nvidia-smi') ? `${gpu}, Test GPU, 10240, 12288` : 'checked'; });
    assert.equal(result.gpus[0].uuid, gpu); assert.ok(calls.some(c => c.includes('check') && c.includes('--dir')));
    await assert.rejects(inspect(profile, async () => 'aotx 9.0.0 profile other arch sm_99 slots 1'), /requires/);
    const catalog = new Catalog(join(root, 'private')); catalog.edit(v => { v.runtimes.push(profile); }); catalog.recent(root);
    assert.deepEqual(new Catalog(join(root, 'private')).value.runtimes, [profile]);
  } finally { rmSync(root, { recursive: true }); }
});

test('media lists retain pending and refused sources and reject changed runtime identities', async () => {
  const data = [2, 7].map((phase, i) => ({ id: 'media-' + String(i + 1).padStart(32, '0'), sha256: String(i).repeat(64), bytes: '24', phase, status: i ? 2 : 0, format: 1 }));
  const row = { schema: 'aotx.media-list.v1', runtime_epoch: '1', data, next_cursor: null };
  const gateway = new Gateway('http://127.0.0.1:8080', token, async () => new Response(JSON.stringify(row)));
  const signal = new AbortController().signal;
  assert.deepEqual((await list(gateway, '1', signal)).map(m => [m.phase, m.status]), [[2, 0], [7, 2]]);
  await assert.rejects(list(gateway, '2', signal), /Invalid media list/);
  (data[0] as any).format = '1'; await assert.rejects(list(gateway, '1', signal), /Invalid media source/);
  const limits = { ...caps.limits, upload_bytes: 33554432, private_media_bytes: '1e6' };
  assert.throws(() => capabilities({ ...caps, limits, features: { ...caps.features, private_media: true } }), /Invalid media quota/);
});
test('project changes clear staged media and catalog failures retain the current project', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-project-switch-')), next = mkdtempSync(join(tmpdir(), 'prism-project-next-'));
  const catalog = new Catalog(), client = new Controller(root, () => {}, undefined, undefined, catalog);
  try {
    client.state.attachments = [{ id: 'media-' + '1'.repeat(32), name: 'sample.jpg', modality: 'image', sha256: 'a'.repeat(64), bytes: 20, endpoint: 'http://127.0.0.1:8080', epoch: '1' }];
    await client.run({ type: 'openProject', path: next }); assert.deepEqual(client.state.attachments, []);
    catalog.recent = () => { throw Error('Catalog write failed'); };
    await assert.rejects(client.run({ type: 'openProject', path: root }), /Catalog write failed/);
    assert.equal(client.state.folder, next); await client.run({ type: 'newConversation', title: 'Still open' });
    assert.equal(client.state.project.conversations.at(-1)!.title, 'Still open');
  } finally { await client.close(); rmSync(root, { recursive: true }); rmSync(next, { recursive: true }); }
});
