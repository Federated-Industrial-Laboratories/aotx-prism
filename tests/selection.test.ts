// SPDX-License-Identifier: Apache-2.0
// Verify distinct profile, media and installation selections across bounded request batches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Controller } from '../desktop/controller.ts';
import { inspect } from '../desktop/runtime/inspect.ts';
import { fixture, token } from './fixture.ts';
async function idle(c: Controller) { for (let i = 0; i < 150; i++) { if (!c.state.busy) return; await delay(10); } throw Error('Request did not finish.'); }
for (const count of [1, 64]) {
  test(`route ${count} distinct saved profiles to their selected model and generation values`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'prism-profile-routing-')), server = await fixture(false, 2, true), client = new Controller(root, () => {});
    try {
      await client.run({ type: 'connect', url: server.url, token });
      for (let i = 0; i < count; i++) {
        const first = `First ${i % 16}`, selected = `Selected ${i % 16}`, maxTokens = 130 + i, temperature = i / 100;
        await client.run({ type: 'profile', model: 'text', maxTokens: 10 + i, temperature: 1 });
        await client.run({ type: 'saveProfile', name: first });
        await client.run({ type: 'profile', model: 'text-1', maxTokens, temperature });
        await client.run({ type: 'saveProfile', name: selected });
        await client.run({ type: 'applyProfile', name: first }); await client.run({ type: 'applyProfile', name: selected });
        assert.equal(client.state.project.model, 'text-1'); assert.equal(client.state.project.maxTokens, maxTokens); assert.equal(client.state.project.temperature, temperature);
        await client.run({ type: 'newConversation', title: `Profile ${i}` });
        await client.run({ type: 'send', id: client.state.selected, text: `Distinct profile request ${i}` }); await idle(client);
        const request = server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).at(-1)!.body as any;
        assert.equal(request.model, 'text-1'); assert.equal(request.max_tokens, maxTokens); assert.equal(request.temperature, temperature);
        assert.equal(request.messages[0].content, `Distinct profile request ${i}`);
      }
      assert.equal(server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).length, count);
    } finally { await client.close(); await server.close(); rmSync(root, { recursive: true }); }
  });
  test(`route two distinct media references in each of ${count} requests`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'prism-media-routing-')), server = await fixture(true, 1, true), client = new Controller(root, () => {});
    const seen = new Set<string>();
    try {
      await client.run({ type: 'connect', url: server.url, token });
      for (let i = 0; i < count; i++) {
        await client.run({ type: 'newConversation', title: `Media ${i}` });
        for (let j = 0; j < 2; j++) {
          const file = join(root, `source-${i}-${j}.jpg`), bytes = Buffer.alloc(24, i + j); bytes[0] = 255; bytes[1] = 216; bytes[2] = j; bytes[3] = i;
          writeFileSync(file, bytes); await client.uploadFile(file);
        }
        const sources = structuredClone(client.state.attachments); assert.equal(sources.length, 2); assert.notEqual(sources[0].sha256, sources[1].sha256);
        for (const source of sources) { assert.ok(!seen.has(source.id)); seen.add(source.id); }
        await client.run({ type: 'send', id: client.state.selected, text: `Read sources ${i}.` }); await idle(client);
        const request = server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).at(-1)!.body as any;
        assert.deepEqual(request.messages[0].content.slice(1), sources.map(m => ({ type: 'media', media_id: m.id, modality: m.modality })));
        assert.deepEqual(client.state.project.conversations[i].turns[0].media, sources);
        for (const source of sources) await client.run({ type: 'deleteMedia', id: source.id });
      }
      assert.equal(seen.size, count * 2); assert.equal(server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).length, count);
    } finally { await client.close(); await server.close(); rmSync(root, { recursive: true }); }
  });
  test(`inspect ${count} installations with distinct executable and component paths`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'prism-path-routing-'));
    try {
      for (let i = 0; i < count; i++) {
        const paths = Object.fromEntries(['build', 'gateway', 'models', 'modules', 'folder'].map(k => [k, join(root, `${k}-${i}`)]));
        for (const path of Object.values(paths)) mkdirSync(path);
        for (const file of ['aotx_boot', 'aotx_feed', 'aotx_drain', 'aotx_service', 'aotx_models']) writeFileSync(join(paths.build, file), '', { mode: 0o700 });
        const python = join(root, `python-${i}`); writeFileSync(python, '', { mode: 0o700 });
        const gpu = 'GPU-' + randomUUID(), calls: { file: string; args: string[]; cwd?: string }[] = [];
        const profile = { name: `Installation ${i}`, build: paths.build, gateway: paths.gateway, models: paths.models, modules: paths.modules, folder: paths.folder, python, gpu, role: 'language' as const };
        const result = await inspect(profile, async (file, args, cwd) => {
          calls.push({ file, args, cwd });
          return file.endsWith('aotx_boot') ? 'aotx 0.3.5 profile 12g arch sm_86 slots 64' : file.endsWith('nvidia-smi') ? `${gpu}, Device ${i}, 10240, 12288` : `Verified ${i}`;
        });
        assert.equal(calls.length, 4); assert.equal(result.models, `Verified ${i}`); assert.equal(result.gpus[0].uuid, gpu);
        assert.deepEqual(calls[0], { file: join(paths.build, 'aotx_boot'), args: ['--version'], cwd: paths.build });
        assert.deepEqual(calls[2], { file: join(paths.build, 'aotx_models'), args: ['--dir', paths.models, 'check'], cwd: paths.gateway });
        assert.equal(calls[3].file, python); assert.equal(calls[3].args.at(-1), paths.gateway); assert.equal(calls[3].cwd, paths.gateway);
      }
    } finally { rmSync(root, { recursive: true }); }
  });
}
