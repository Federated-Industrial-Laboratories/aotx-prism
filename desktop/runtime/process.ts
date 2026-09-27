// SPDX-License-Identifier: Apache-2.0
// Execute fixed local commands with bounded output and process deadlines.
import { spawn } from 'node:child_process';
import { OwnedGroup } from './group.js';
export function environment(gpu?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' };
  for (const key of ['HOME', 'USER', 'TMPDIR', 'LD_LIBRARY_PATH']) if (process.env[key]) env[key] = process.env[key];
  if (gpu) env.CUDA_VISIBLE_DEVICES = gpu;
  return env;
}
export function run(file: string, args: string[], cwd?: string, timeout = 120000, signal?: AbortSignal, gpu?: string): Promise<string> {
  if (signal?.aborted) return Promise.reject(Error('The local command was cancelled.'));
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env: environment(gpu), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const group = new OwnedGroup(child);
    let output = '', failure = '';
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* The process can exit before the signal. */ } } };
    const timer = setTimeout(() => { failure = 'The local command exceeded its deadline.'; kill(); }, timeout);
    const cancel = () => { failure = 'The local command was cancelled.'; void group.stop(1000); };
    signal?.addEventListener('abort', cancel, { once: true });
    const data = (part: Buffer) => {
      if (Buffer.byteLength(output) + part.length > 262144) { failure = 'The local command exceeded its output limit.'; kill(); }
      else output += part.toString();
    };
    child.stdout.on('data', data); child.stderr.on('data', data);
    child.once('error', error => { failure = error.message; });
    void group.finished.then(() => {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (group.forced || group.error) failure ||= group.error || 'The local command required forced cleanup.';
      failure || child.exitCode !== 0 ? reject(Error(failure || output.trim() || 'The local command failed.')) : resolve(output.trim());
    });
  });
}
export class CommandRunner {
  private abort = new AbortController(); private active = new Set<Promise<string>>();
  run = (file: string, args: string[], cwd?: string, timeout?: number): Promise<string> => {
    const work = run(file, args, cwd, timeout, this.abort.signal); this.active.add(work);
    void work.then(() => this.active.delete(work), () => this.active.delete(work)); return work;
  };
  async close() { this.abort.abort(); await Promise.allSettled([...this.active]); }
}
