// SPDX-License-Identifier: Apache-2.0
// Check complete file metadata, fixed tool arguments, private publication and saved shutdown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { CcirManager, emptyCheckpoint, inspectCcir } from '../desktop/runtime/ccir.ts';
import { runtimeProfile, type RuntimeProfile } from '../shared/setup.ts';
import { Catalog } from '../desktop/catalog.ts';
import { saveOwned } from '../desktop/runtime/save.ts';
import { identity } from './shared-fixture.ts';
function file(path: string, slots = 64, features = 8) {
  const bytes = Buffer.alloc(512); bytes.write('AOTXRT01', 128); bytes.writeUInt32LE(2, 136); bytes.writeUInt32LE(384, 140);
  bytes.writeUInt32LE(features, 148); bytes.writeUInt32LE(slots, 156); bytes.writeUInt32LE(86, 164); bytes.write('language,embedding', 192);
  writeFileSync(path, bytes, { mode: 0o600 });
}
const detail = `file 0: verified generation 3 sections 1 checkpoint 0 durable 0 tick 0 fallback 0 trailing 0\nlineage ${identity(1)} incarnation ${identity(2)}\nsection 0 type 5 schema 2 required 1 id ${identity(5)} offset 128 bytes 256`;
for (const count of [1, 64]) test(`inspect ${count} distinct complete files without activation`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-ccir-index-'));
  try {
    for (let i = 0; i < count; i++) {
      const path = join(root, `${i}.aotxccir`); file(path, i + 1);
      const result = await inspectCcir('/build', path, async (command, args) => {
        assert.equal(command, '/build/aotx_ccir'); assert.deepEqual(args, ['inspect', path]); return detail;
      });
      assert.equal(result.slots, i + 1); assert.equal(result.path, path); assert.deepEqual(result.roles, ['language', 'embedding']);
    }
    const invalid = join(root, 'invalid'); file(invalid, 64, 0);
    await assert.rejects(inspectCcir('/build', invalid, async () => detail), /shared state/);
    await assert.rejects(inspectCcir('/build', invalid, async () => detail.replace('offset 128', 'offset 99999999')), /bounds/);
  } finally { rmSync(root, { recursive: true }); }
});
for (const count of [1, 64]) test(`create and copy use fixed commands, an explicit GPU and a new destination: ${count} distinct cases`, async () => {
  for (let index = 0; index < count; index++) {
  const root = mkdtempSync(join(tmpdir(), 'prism-ccir-files-'));
  for (const name of ['build', 'models', 'modules', 'gateway', 'runs']) mkdirSync(join(root, name));
  for (const name of ['aotx_boot', 'aotx_feed', 'aotx_drain', 'aotx_service', 'aotx_models']) writeFileSync(join(root, 'build', name), '', { mode: 0o700 });
  writeFileSync(join(root, 'python'), '', { mode: 0o700 }); writeFileSync(join(root, 'models', 'weight.gguf'), `fixture ${index}`);
  const profile: RuntimeProfile = { name: `Files ${index}`, build: join(root, 'build'), models: join(root, 'models'), modules: join(root, 'modules'),
    gateway: join(root, 'gateway'), python: join(root, 'python'), folder: join(root, 'runs'), gpu: `GPU-11111111-2222-3333-4444-${identity(index + 1).slice(-12)}`, role: 'language' };
  const calls: { command: string; args: string[]; gpu?: string }[] = [];
  const manager = new CcirManager(() => {}, async (command, args, _cwd, _timeout, _signal, gpu) => {
    calls.push({ command, args, gpu });
    if (command.endsWith('nvidia-smi')) return `${profile.gpu}, GPU, 12000, 12288`;
    if (args.includes('--version')) return 'aotx 0.3.5 profile 12g arch sm_86 slots 64';
    if (args[0] === 'inspect') return detail;
    if (command.endsWith('aotx_ccir_state')) {
      assert.equal(gpu, profile.gpu);
      const bytes = readFileSync(join(args[0], '..', 'empty.bin')); assert.equal(bytes.length, 128); assert.equal(bytes.subarray(0, 8).toString(), 'AOTXOBJ1');
      assert.equal(bytes.readBigUInt64LE(80), 128n); assert.equal(bytes.readUInt32LE(88), 1);
    }
    if (command.endsWith('aotx_ccir_pack')) file(args[args.indexOf('--output') + 1], index + 1);
    if (args[0] === 'compact') file(args[2], index + 1);
    return 'Checked';
  });
  const plan = { profile, output: join(root, 'created.aotxccir'), phrases: '', settings: '' };
  const finish = async () => { for (let i = 0; i < 100 && manager.state.phase === 'working'; i++) await delay(5); assert.equal(manager.state.phase, 'complete', manager.state.error); };
  try {
    assert.throws(() => manager.start({ type: 'ccirCreate', plan }), /Check the selected assets/);
    manager.start({ type: 'ccirEstimate', plan }); await finish(); assert.ok(manager.state.estimate!.bytes > 134217728);
    manager.start({ type: 'ccirCreate', plan }); await finish(); assert.ok(existsSync(plan.output));
    assert.equal(statSync(plan.output).mode & 0o077, 0);
    const pack = calls.find(c => c.command.endsWith('aotx_ccir_pack'))!;
    assert.ok(pack.args.includes('--shared')); assert.equal(pack.args[pack.args.indexOf('--roles') + 1], 'language,embedding');
    manager.start({ type: 'ccirCopy', build: profile.build, path: plan.output, output: join(root, 'copy.aotxccir') }); await finish();
    assert.deepEqual(readFileSync(plan.output), readFileSync(join(root, 'copy.aotxccir')));
    manager.start({ type: 'ccirCreate', plan }); await delay(10); assert.equal(manager.state.phase, 'failed');
    assert.match(manager.state.error, /does not exist/);
    assert.throws(() => runtimeProfile({ ...profile, ccir: '', participant: identity(3) }), /Invalid text/);
    assert.throws(() => emptyCheckpoint(Buffer.alloc(16)), /lineage/);
    const directory = join(root, 'catalog'), catalog = new Catalog(directory); catalog.participant('First'); catalog.participant('Second');
    assert.notEqual(catalog.value.participants![0].id, catalog.value.participants![1].id);
    catalog.participant('Restored participant', identity(123));
    assert.equal(catalog.value.participants!.at(-1)!.id, identity(123));
    assert.throws(() => catalog.participant('Duplicate', identity(123)), /distinct/);
    assert.deepEqual(new Catalog(directory).value.participants, catalog.value.participants);
  } finally { await manager.cancel(); rmSync(root, { recursive: true }); }
  }
});
for (const count of [1, 64]) test(`owned shutdown records its request before transport and requires saved terminal state: ${count} distinct cases`, async t => {
  for (let index = 0; index < count; index++) {
  const root = mkdtempSync(join(tmpdir(), 'prism-ccir-save-'));
  const lineage = identity(index * 10 + 1), actor = identity(index * 10 + 2), id = `op-${lineage}-${identity(index * 10 + 3)}`;
  const save = { source: '10', generation: '2', incarnation: identity(4), boot: '1', commit_sha256: identity(5, 64), pending_bytes: '0', error: 0 };
  const base = { schema: 'aotx.shared.resource.v1', lineage, save }; let body: any, reads = 0, saved = false;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    let value: unknown;
    if (url.endsWith('/participant')) value = { ...base, participant: actor, registered: true, next_sequence: String(index + 9), retry_floor: '1' };
    else {
      if (init.body) {
        const canonical = Buffer.from(init.body as Uint8Array).toString(); body = JSON.parse(canonical);
        const journal = JSON.parse(readFileSync(join(root, 'shutdown-requests.json'), 'utf8'));
        assert.equal(journal[0].body, canonical); assert.equal(journal[0].path, '/save');
      } else { reads++; saved = true; }
      value = { ...base, id, actor, operation_key: body.operation_key, sequence: String(index + 9), next_sequence: String(index + 10), operation: 9, resource: identity(0),
        state: 'completed', status: 200, accepted: true, device_committed: true, saved_admission: true, saved_terminal: saved, gap: false,
        admission_source: '8', terminal_source: '10', input_order: '0', offset: '0', next_offset: '0', output_bytes: '0',
        output: { base64: '', bytes: '0' }, usage: { input_tokens: 0, output_tokens: 0 }, finish: 0 };
    }
    return new Response(JSON.stringify(value));
  });
  try {
    const result = await saveOwned('http://127.0.0.1:8080', 'fixture', actor, root, AbortSignal.timeout(2000));
    assert.equal(reads, 1); assert.equal(result.saved_terminal, true);
    await assert.rejects(saveOwned('http://127.0.0.1:8080', 'fixture', identity(99999), root, AbortSignal.timeout(2000)), /participant changed/);
  } finally { t.mock.restoreAll(); rmSync(root, { recursive: true }); }
  }
});
