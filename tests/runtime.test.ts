// SPDX-License-Identifier: Apache-2.0
// Exercise real process supervision with bounded executable fixtures and no GPU work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fork } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { RuntimeManager } from '../desktop/runtime/manager.ts';
import type { RuntimeProfile } from '../shared/setup.ts';
async function until(check: () => boolean) { for (let i = 0; i < 150; i++) { if (check()) return; await delay(40); } throw Error('Process state deadline exceeded.'); }
function fixture(root: string) {
  const supervisor = pathToFileURL(resolve('dist-desktop/desktop/runtime/supervisor.js')).href;
  const worker = join(root, 'worker.mjs');
  writeFileSync(worker, `import {serve} from ${JSON.stringify(supervisor)}; serve(async () => ({version:'fixture', models:'fixture', gpus:[]}));`);
  const boot = `#!${process.execPath}\nimport fs from 'node:fs';
const args=process.argv, journal=args[args.indexOf('--journal')+1];
fs.mkdirSync(journal,{recursive:true});fs.writeFileSync(journal+'/phase','running fixture');
fs.writeFileSync(journal+'/gpu',process.env.CUDA_VISIBLE_DEVICES);
process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},500);`;
  const python = `#!${process.execPath}\nimport fs from 'node:fs';import http from 'node:http';import crypto from 'node:crypto';
const args=process.argv;
if(args.includes('grants')) {fs.writeFileSync(args[args.indexOf('--output')+1],'fixture grants');process.exit(0);}
const config=JSON.parse(fs.readFileSync(args[args.indexOf('--config')+1]));
if(config.principals.some(p=>p.tokens>=4096)){process.stderr.write('Grant exceeds sequence capacity');process.exit(2);}
const server=http.createServer((req,res)=>{const hash=crypto.createHash('sha256').update((req.headers.authorization||'').slice(7)).digest('hex');
if(hash!==config.principals[0].token_sha256[0]){res.writeHead(401).end('{}');return;} res.end(JSON.stringify({schema:'aotx.capabilities.v1'}));});
server.listen(config.port,config.host);process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`;
  writeFileSync(join(root, 'aotx_boot'), boot, { mode: 0o700 }); writeFileSync(join(root, 'python'), python, { mode: 0o700 });
  const profile: RuntimeProfile = { name: 'Fixture', build: root, gateway: root, python: join(root, 'python'), models: root,
    modules: root, folder: root, gpu: 'GPU-11111111-2222-3333-4444-555555555555', role: 'language' };
  return { worker, profile };
}
test('owned runtime becomes ready, keeps its token private and stops all owned children', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-runtime-')), { worker, profile } = fixture(root);
  const manager = new RuntimeManager(() => {}, worker);
  try {
    manager.start(profile); await until(() => manager.state.phase === 'ready' || manager.state.phase === 'failed');
    assert.equal(manager.state.phase, 'ready', manager.state.error);
    const connection = manager.connection(); assert.equal(connection.token.length, 64);
    assert.ok(!JSON.stringify(manager.state).includes(connection.token));
    assert.equal(readFileSync(join(manager.state.folder, 'journal/gpu'), 'utf8'), profile.gpu);
    assert.throws(() => manager.start(profile), /Stop/);
    await manager.stop(); assert.equal(manager.state.phase, 'stopped'); assert.throws(() => manager.connection(), /Start/);
    const result = JSON.parse(readFileSync(join(manager.state.folder, 'result.json'), 'utf8'));
    assert.equal(result.children.length, 3); assert.ok(result.children.every((c: any) => c.exit === 0));
    await assert.rejects(fetch(connection.url));
  } finally { await manager.stop(); rmSync(root, { recursive: true }); }
});
test('lost desktop IPC stops the supervised runtime without adopting stored process IDs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-lost-parent-')), { worker, profile } = fixture(root);
  const child = fork(worker, [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let phase = '', folder = '';
  child.on('message', value => { const row = value as any; phase = row.phase || phase; folder = row.folder || folder; });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    child.send({ type: 'start', profile }); await until(() => phase === 'ready'); child.disconnect(); await exited;
    const result = JSON.parse(readFileSync(join(folder, 'result.json'), 'utf8'));
    assert.equal(result.status, 'stopped'); assert.ok(result.children.every((c: any) => c.exit === 0));
  } finally { if (child.connected) { child.send({ type: 'stop' }); await exited; } rmSync(root, { recursive: true }); }
});
test('startup refusal reports failure and closes its gateway grant process', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-refusal-')), { worker, profile } = fixture(root), manager = new RuntimeManager(() => {}, worker);
  writeFileSync(join(root, 'aotx_boot'), `#!${process.execPath}\nprocess.stderr.write('Model refused');process.exit(3);`, { mode: 0o700 });
  try {
    manager.start(profile); await until(() => manager.state.phase === 'failed'); await manager.stop();
    assert.match(manager.state.error, /startup/); assert.match(manager.state.logs, /Model refused/);
    const result = JSON.parse(readFileSync(join(manager.state.folder, 'result.json'), 'utf8')); assert.equal(result.status, 'failed');
    assert.equal(result.children[1].exit, 3);
  } finally { await manager.stop(); rmSync(root, { recursive: true }); }
});

test('an owned runtime with a failed shutdown is not reported as stopped', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prism-stop-failure-')), { worker, profile } = fixture(root);
  const boot = join(root, 'aotx_boot'); writeFileSync(boot, readFileSync(boot, 'utf8').replace("process.on('SIGTERM',()=>process.exit(0))", "process.on('SIGTERM',()=>process.exit(3))"));
  const manager = new RuntimeManager(() => {}, worker);
  try {
    manager.start(profile); await until(() => manager.state.phase === 'ready'); await manager.stop();
    assert.equal(manager.state.phase, 'failed'); assert.match(manager.state.error, /exit cleanly/);
    const result = JSON.parse(readFileSync(join(manager.state.folder, 'result.json'), 'utf8'));
    assert.equal(result.status, 'failed'); assert.equal(result.children.find((c: any) => c.kind === 'runtime').exit, 3);
  } finally { await manager.stop(); rmSync(root, { recursive: true }); }
});
