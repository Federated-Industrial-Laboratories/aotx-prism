// SPDX-License-Identifier: Apache-2.0
// Create and inspect complete files with installed tools and preserve inputs on failure.
import { randomBytes } from 'node:crypto';
import { accessSync, constants, closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdtempSync, openSync, readdirSync,
  readSync, realpathSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { run } from './process.js';
import { inspect } from './inspect.js';
import type { CcirPlan, CcirInspection, CcirState, CcirCommand, CcirEstimate } from '../../shared/ccir.js';
type Execute = typeof run;
export function emptyCheckpoint(lineage: Buffer) {
  if (lineage.length !== 16 || lineage.every(b => b === 0)) throw Error('Invalid new runtime lineage.');
  const bytes = Buffer.alloc(128); bytes.write('AOTXOBJ1'); bytes.writeUInt32LE(1, 8); bytes.writeUInt32LE(128, 12);
  bytes.writeUInt32LE(256, 16); lineage.copy(bytes, 48);
  bytes.writeBigUInt64LE(128n, 64); bytes.writeBigUInt64LE(128n, 72); bytes.writeBigUInt64LE(128n, 80); bytes.writeUInt32LE(1, 88);
  return bytes;
}
function destination(path: string) {
  try { lstatSync(path); throw Error('Select a destination that does not exist.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const directory = realpathSync(dirname(path)); accessSync(directory, constants.W_OK); return directory;
}
export async function inspectCcir(build: string, path: string, execute: Execute = run): Promise<CcirInspection> {
  const file = realpathSync(path), fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd); if (!before.isFile()) throw Error('Select a regular runtime file.');
    const detail = await execute(join(build, 'aotx_ccir'), ['inspect', file], build, 1200000);
    const generation = detail.match(/^file 0: verified generation (\d+)/m)?.[1];
    const lineage = detail.match(/^lineage ([0-9a-f]{32}) incarnation [0-9a-f]{32}$/m)?.[1];
    const section = detail.match(/^section \d+ type 5 schema [1-7] required 1 id [0-9a-f]{32} offset (\d+) bytes (\d+)$/m);
    if (!generation || !lineage || !section) throw Error('This file is not a supported complete runtime.');
    const offset = Number(section[1]), bytes = Number(section[2]);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || bytes < 256 || bytes > 256 + 256 * 384 || offset + bytes > before.size) throw Error('Invalid runtime index bounds.');
    const index = Buffer.alloc(bytes); if (readSync(fd, index, 0, bytes, offset) !== bytes) throw Error('The runtime index read stopped.');
    const after = fstatSync(fd), named = statSync(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || named.ino !== before.ino || named.dev !== before.dev) throw Error('The runtime file changed during inspection. Read it again.');
    const count = index.readUInt32LE(16), features = index.readUInt32LE(20);
    if (index.subarray(0, 8).toString() !== 'AOTXRT01' || index.readUInt32LE(12) !== 384 || bytes !== 256 + count * 384 || !(features & 8)) throw Error('The complete runtime must include shared state.');
    const roles = index.subarray(64, 128).toString().split('\0')[0].split(',');
    if (!roles.includes('embedding')) throw Error('The shared runtime requires its embedding model.');
    const assets = Array.from({ length: count }, (_, i) => index.subarray(256 + i * 384 + 64, 256 + i * 384 + 320).toString().split('\0')[0]);
    return { path: file, bytes: before.size, lineage, generation, roles, features, slots: index.readUInt32LE(28), architecture: index.readUInt32LE(36), assets, detail };
  } finally { closeSync(fd); }
}
function treeSize(root: string) {
  let bytes = 0, files = 0, visited = 0;
  const walk = (directory: string, depth: number) => {
    if (depth > 16) throw Error('The asset folder is too deep.');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++visited > 8192) throw Error('The asset folder has too many entries.');
      if (entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else { const info = statSync(path); if (!info.isFile()) throw Error('Assets must be regular files.'); bytes += info.size; files++; }
    }
  };
  walk(root, 0); return { bytes, files };
}
export async function estimateCcir(plan: CcirPlan, execute: Execute = run): Promise<CcirEstimate> {
  const p = { ...plan.profile, ccir: undefined, participant: undefined }, checked = await inspect(p, execute);
  const directory = destination(plan.output), models = treeSize(p.models), modules = treeSize(p.modules);
  const extra = [plan.phrases, plan.settings].filter(Boolean).reduce((sum, file) => sum + statSync(file).size, 0);
  const disk = statfsSync(directory);
  return { bytes: models.bytes + modules.bytes + extra + 134217728, free: disk.bavail * disk.bsize, files: models.files + modules.files, models: checked.models };
}
function publish(temporary: string, output: string) {
  const fd = openSync(temporary, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); }
  linkSync(temporary, output);
  const directory = openSync(dirname(output), constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
export class CcirManager {
  state: CcirState = { phase: 'idle', action: '', error: '', logs: '' };
  private abort?: AbortController; private task?: Promise<void>;
  private checkedPlan = '';
  constructor(private changed: (state: CcirState) => void, private execute: Execute = run) {}
  start(cmd: Exclude<CcirCommand, { type: 'ccirCancel' | 'participantCreate' }>) {
    if (this.task) throw Error('Wait for the current file operation.');
    if (cmd.type === 'ccirCreate' && this.checkedPlan !== JSON.stringify(cmd.plan)) throw Error('Check the selected assets and disk requirement before creation.');
    this.abort = new AbortController();
    this.state = { phase: 'working', action: cmd.type, error: '', logs: '' }; this.emit();
    const execute: Execute = async (file, args, cwd, timeout, _signal, gpu) => {
      const output = await this.execute(file, args, cwd, timeout, this.abort!.signal, gpu);
      this.state.logs = (this.state.logs + output + '\n').slice(-65536); this.emit(); return output;
    };
    this.task = this.work(cmd, execute).then(() => { this.state.phase = 'complete'; }, error => {
      this.state.phase = 'failed'; this.state.error = error.message;
    }).finally(() => { this.task = undefined; this.emit(); });
  }
  private emit() { this.changed(structuredClone(this.state)); }
  private async work(cmd: Exclude<CcirCommand, { type: 'ccirCancel' | 'participantCreate' }>, execute: Execute) {
    if (cmd.type === 'ccirInspect') { this.state.inspection = await inspectCcir(cmd.build, cmd.path, execute); return; }
    if (cmd.type === 'ccirEstimate') { this.state.estimate = await estimateCcir(cmd.plan, execute); this.checkedPlan = JSON.stringify(cmd.plan); return; }
    const output = cmd.type === 'ccirCreate' ? cmd.plan.output : cmd.output;
    const directory = destination(output), temporary = mkdtempSync(join(directory, '.prism-ccir-'));
    const staged = join(temporary, 'runtime.aotxccir');
    try {
      const build = cmd.type === 'ccirCreate' ? cmd.plan.profile.build : cmd.build;
      if (cmd.type === 'ccirCreate') {
        const { plan } = cmd, p = plan.profile;
        this.state.estimate = await estimateCcir(plan, execute); this.emit();
        if (this.state.estimate.bytes > this.state.estimate.free) throw Error('The destination needs more free disk space.');
        const lineage = randomBytes(16), input = join(temporary, 'empty.bin'), packed = join(temporary, 'empty.aotxccir'), prepared = join(temporary, 'prepared.aotxccir');
        writeFileSync(input, emptyCheckpoint(lineage), { mode: 0o600 });
        await execute(join(build, 'aotx_ccir'), ['pack', packed, input, lineage.toString('hex'), '0', '0', '0'], build);
        await execute(join(build, 'aotx_ccir_state'), [packed, prepared], build, 120000, undefined, p.gpu);
        await execute(join(build, 'aotx_ccir_pack'), ['--memory', prepared, '--models', p.models, '--roles', `${p.role},embedding`, '--modules', p.modules,
          '--output', staged, '--shared', ...(plan.phrases ? ['--phrases', plan.phrases] : []), ...(plan.settings ? ['--settings', plan.settings] : [])], build, 1200000);
      } else await execute(join(build, 'aotx_ccir'), ['compact', cmd.path, staged], build, 1200000);
      const inspection = await inspectCcir(build, staged, execute);
      if (this.abort?.signal.aborted) throw Error('The file operation was cancelled.');
      publish(staged, output); this.state.inspection = { ...inspection, path: realpathSync(output) };
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  async cancel() { this.abort?.abort(); await this.task; }
}
