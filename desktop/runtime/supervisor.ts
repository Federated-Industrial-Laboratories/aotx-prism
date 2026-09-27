// SPDX-License-Identifier: Apache-2.0
// Own the runtime and gateway children until stop or loss of the desktop IPC link.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from './inspect.js';
import { environment } from './process.js';
import { saveOwned } from './save.js';
import { inspectCcir } from './ccir.js';
import { OwnedGroup } from './group.js';
import { PrivateLog } from './log.js';
import { runtimeProfile, type RuntimeProfile } from '../../shared/setup.js';
const children: ChildProcess[] = [];
const kinds = new Map<ChildProcess, string>();
const groups = new Map<ChildProcess, OwnedGroup>();
let privateLog: PrivateLog;
let stopping = false, folder = '', logs = '', token = '', started = false;
let checkInstallation = inspect;
let profile: RuntimeProfile | undefined, gatewayUrl = '', connected = false, durable: unknown;
const report = (value: object) => { if (process.connected) process.send?.(value); };
function log(data: Buffer) {
  logs = (logs + privateLog.append(data)).slice(-65536);
  report({ logs });
}
async function stop(failed = false, message = '') {
  if (stopping) return; stopping = true;
  report({ phase: 'stopping' });
  if (profile?.ccir && connected) {
    try {
      durable = await saveOwned(gatewayUrl, token, profile.participant!, folder, AbortSignal.timeout(300000));
      report({ durability: 'Saved terminal receipt received. Stopping owned processes.' });
    } catch (error) { failed = true; message = 'The final shared save was not confirmed. The last durable generation is retained.'; }
  } else if (profile?.ccir) { failed = true; message ||= 'The shared runtime stopped before save confirmation.'; }
  for (const child of [...children].reverse()) {
    await groups.get(child)!.stop(profile?.ccir ? 120000 : 30000);
  }
  logs = (logs + (privateLog?.finish() || '')).slice(-65536);
  if ([...groups.values()].some(group => group.forced || group.error)) { failed = true; message = 'An owned process group required forced cleanup. Read its log.'; }
  if (!failed && children.some(c => ['runtime', 'gateway'].includes(kinds.get(c) || '') && c.exitCode !== 0)) {
    failed = true; message = 'An owned process did not exit cleanly. Read its log.';
  }
  if (!failed && profile?.ccir) {
    try { await inspectCcir(profile.build, profile.ccir); report({ durability: 'Saved runtime file verified after shutdown.' }); }
    catch { failed = true; message = 'The saved runtime file failed verification after shutdown.'; }
  }
  if (folder) writeFileSync(join(folder, 'result.json'), JSON.stringify({ status: failed ? 'failed' : 'stopped', error: message,
    children: children.map(c => ({ kind: kinds.get(c), exit: c.exitCode, signal: c.signalCode,
      groupStopped: !groups.get(c)!.error, forced: groups.get(c)!.forced })), logs, durable }), { mode: 0o600 });
  report({ phase: failed ? 'failed' : 'stopped', error: message, logs });
  if (process.connected) process.disconnect();
}
function child(file: string, args: string[], cwd: string, gpu: string, kind = 'check') {
  if (stopping) throw Error('Startup was stopped.');
  const proc = spawn(file, args, { cwd, env: environment(gpu), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  groups.set(proc, new OwnedGroup(proc));
  children.push(proc); kinds.set(proc, kind); proc.stdout!.on('data', log); proc.stderr!.on('data', log);
  proc.on('error', error => { void stop(true, error.message); });
  return proc;
}
async function freePort() {
  const server = createServer(); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function start(value: unknown) {
  if (started) throw Error('The runtime already started.'); started = true;
  const p = runtimeProfile(value); profile = p; token = randomBytes(32).toString('hex'); privateLog = new PrivateLog(token);
  report({ phase: 'starting', profile: p });
  const inspected = await checkInstallation(p, async (file, args, cwd, timeout = 120000) => {
    const proc = child(file, args, cwd || p.build, p.gpu); let output = '', failure = '';
    const kill = () => { if (proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* The process already stopped. */ } } };
    const timer = setTimeout(() => { failure = 'The installation check exceeded its deadline.'; kill(); }, timeout);
    const read = (bytes: Buffer) => { if (output.length + bytes.length > 262144) { failure = 'The installation check exceeded its output limit.'; kill(); } else output += bytes.toString(); };
    proc.stdout!.on('data', read); proc.stderr!.on('data', read);
    try { await new Promise<void>((resolve, reject) => { proc.once('error', reject); proc.once('close', code => failure || code !== 0 ? reject(Error(failure || output.trim() || 'The installation check failed.')) : resolve()); }); }
    finally { clearTimeout(timer); }
    return output.trim();
  }); if (stopping) return;
  report({ inspection: inspected });
  folder = mkdtempSync(join(p.folder, 'prism-'));
  const journal = join(folder, 'journal'), socket = join(journal, 'service.sock');
  if (Buffer.byteLength(socket) > 107) throw Error('Select a shorter runtime folder path.');
  mkdirSync(join(folder, 'files'), { mode: 0o700 });
  const port = await freePort(), url = `http://127.0.0.1:${port}`; gatewayUrl = url;
  const config = join(folder, 'gateway.json'), grants = join(folder, 'grants'), settings = join(folder, 'settings');
  writeFileSync(settings, 'window.on = 0\ntui.on = 0\n', { mode: 0o600 });
  writeFileSync(config, JSON.stringify({ socket, host: '127.0.0.1', port, revision: '1', models: { local: { role: p.role, published_at: 0 } },
    principals: [{ id: p.participant || randomBytes(16).toString('hex'), token_sha256: [createHash('sha256').update(token).digest('hex')],
      models: ['local'], actions: ['infer', 'upload', 'telemetry', ...(p.ccir ? ['shared_read', 'shared_write', 'shared_manage'] : [])], pages: 0, tokens: 256, requests: 2, media: 16, media_bytes: 33554432 }],
    origins: [], urls: { public: false, private: [] } }), { mode: 0o600 });
  report({ folder, url });
  const python = (args: string[]) => child(p.python, ['-I', '-u', '-c',
    'import sys,runpy; sys.path.insert(0,sys.argv.pop(1)); runpy.run_module("gateway",run_name="__main__")', p.gateway, ...args], p.gateway, p.gpu, args[0] === 'serve' ? 'gateway' : 'grants');
  const grant = python(['grants', '--config', config, '--output', grants]);
  const grantTimer = setTimeout(() => { void stop(true, 'The gateway grant command exceeded its deadline.'); }, 30000);
  try { await new Promise<void>((resolve, reject) => { grant.once('error', reject); grant.once('close', code => code === 0 ? resolve() : reject(Error('The gateway grants could not be written.'))); }); }
  finally { clearTimeout(grantTimer); }
  const boot = child(join(p.build, 'aotx_boot'), ['--journal', journal, ...(p.ccir ? ['--ccir', p.ccir] : ['--models', p.models, '--roles', p.role,
    '--modules', p.modules, '--settings', settings]), '--root', join(folder, 'files'), '--service-grants', grants, '--ticks', '0'], p.build, p.gpu, 'runtime');
  let deadline = p.ccir ? Infinity : Date.now() + 180000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    if (boot.exitCode !== null || boot.signalCode !== null) throw Error('The runtime exited during startup. Read its log.');
    try { ready = readFileSync(join(journal, 'phase'), 'utf8').startsWith('running '); } catch { /* Wait for the runtime phase file. */ }
    if (ready) break; await delay(200);
  }
  if (stopping) return; if (!ready) throw Error('Runtime startup exceeded its deadline.');
  const gateway = python(['serve', '--config', config]);
  deadline = Date.now() + 30000;
  ready = false;
  while (!stopping && Date.now() < deadline) {
    if (gateway.exitCode !== null || gateway.signalCode !== null) throw Error('The gateway exited during startup. Read its log.');
    try {
      const response = await fetch(`${url}/aotx/v1/capabilities`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1000) });
      ready = response.ok && (await response.json() as { schema: string }).schema === 'aotx.capabilities.v1';
    } catch { /* Wait for the local gateway. */ }
    if (ready) break; await delay(200);
  }
  if (stopping) return; if (!ready) throw Error('Gateway startup exceeded its deadline.');
  connected = true; report({ phase: 'ready', url, token });
  while (!stopping) {
    if ([boot, gateway].some(c => c.exitCode !== null || c.signalCode !== null)) throw Error('An owned runtime process exited.');
    await delay(500);
  }
}
export function serve(check = inspect) {
checkInstallation = check;
process.on('message', message => {
  const row = message as { type: string; profile?: unknown };
  if (row.type === 'stop') void stop();
  if (row.type === 'start') void start(row.profile).catch(error => stop(true, error.message));
});
process.on('disconnect', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) serve();
