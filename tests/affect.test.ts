// SPDX-License-Identifier: Apache-2.0
// Check setting authority, refusal, recovery and exact revisions across runtime identities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AffectSettingsClient } from '../desktop/affect.ts';
import { Gateway } from '../desktop/gateway.ts';
import { affectSettings } from '../shared/affect.ts';
import { command } from '../shared/validate.ts';
import { runtimeActions } from '../shared/setup.ts';
import { settings } from './affect-fixture.ts';
for (const n of [1, 64]) test(`affect settings bind ${n} distinct epochs, grants and revisions`, async () => {
  for (let i = 0; i < n; i++) {
    const epoch = String(i + 1), initial = String(9007199254740993n + BigInt(i));
    let current = settings(epoch, initial), status = 200, lost = false, posts: any[] = [];
    const gateway = new Gateway('http://127.0.0.1:8123', 'test-token', (async (_url: unknown, init: RequestInit) => {
      if (init.body) {
        const body = JSON.parse(Buffer.from(init.body as Uint8Array).toString()); posts.push(body);
        if (status === 200) {
          assert.equal(body.epoch, epoch); assert.equal(body.revision, current.revision);
          current.revision = String(BigInt(current.revision) + 1n);
          current.settings.find(s => s.key === body.key)!.value = body.value;
        }
        if (lost) throw Error('Lost write result.');
      }
      return new Response(JSON.stringify(current), { status });
    }) as typeof fetch);
    const client = new AffectSettingsClient(() => {}), signal = new AbortController().signal;
    const write = () => ({ type: 'affectSet' as const, epoch, revision: client.state.value!.revision,
      key: 'affect.decay_fast', value: 2000 + i, scale: 10000 });
    await client.read(gateway, epoch, signal); const first = write();
    await client.set(gateway, first, signal);
    assert.equal(client.state.value!.revision, String(BigInt(initial) + 1n));
    await assert.rejects(client.set(gateway, first, signal)); assert.equal(posts.length, 1);
    for (const code of [409, 410, 429, 503, 403]) {
      const cmd = write(); status = code;
      await assert.rejects(client.set(gateway, cmd, signal)); assert.equal(client.state.value, undefined);
      assert.ok(client.state.error.includes('not repeated'));
      status = 200; await client.read(gateway, epoch, signal);
    }
    assert.equal(posts.length, 6); assert.equal(client.state.denied, true);
    await assert.rejects(client.set(gateway, write(), signal)); assert.equal(posts.length, 6);
    client.clear(); await client.read(gateway, epoch, signal); lost = true;
    await assert.rejects(client.set(gateway, write(), signal)); assert.equal(posts.length, 7);
    lost = false; await client.read(gateway, epoch, signal);
    assert.equal(client.state.value!.revision, String(BigInt(initial) + 2n));
    current.writable = false; await client.read(gateway, epoch, signal);
    await assert.rejects(client.set(gateway, write(), signal)); assert.equal(posts.length, 7);
    await client.read(gateway, String(i + 1000), signal); assert.equal(client.state.value, undefined);
    client.clear(); assert.deepEqual(client.state, { reading: false, denied: false, error: '' });
  }
});
test('affect validation refuses malformed scope, scales and commands', () => {
  for (const edit of [(v: any) => v.paths.ordinary_http = true, (v: any) => v.settings.reverse(),
    (v: any) => v.settings[0].value = 1.5, (v: any) => v.epoch = 1,
    (v: any) => v.settings[0].scale = 2, (v: any) => v.settings.pop()]) {
    const v = settings(); edit(v); assert.throws(() => affectSettings(v));
  }
  const cmd = { type: 'affectSet', epoch: '1', revision: '0', key: 'affect.on', value: 1, scale: 1 };
  assert.deepEqual(command(cmd), cmd);
  for (const v of [{ ...cmd, key: 'sample.temperature' }, { ...cmd, value: 0.5 }, { ...cmd, scale: 2 }]) assert.throws(() => command(v));
  assert.ok(!runtimeActions({} as any).includes('affect_manage'));
  assert.ok(runtimeActions({ affectManage: true } as any).includes('affect_manage'));
});
