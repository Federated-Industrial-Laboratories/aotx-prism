// SPDX-License-Identifier: Apache-2.0
// Execute fixed local commands with bounded output and process deadlines.
import { spawn } from 'node:child_process';
export function environment(gpu?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' };
  for (const key of ['HOME', 'USER', 'TMPDIR', 'LD_LIBRARY_PATH']) if (process.env[key]) env[key] = process.env[key];
  if (gpu) env.CUDA_VISIBLE_DEVICES = gpu;
  return env;
}
export function run(file: string, args: string[], cwd?: string, timeout = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env: environment(), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let output = '', failure = '';
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* The process can exit before the signal. */ } } };
    const timer = setTimeout(() => { failure = 'The local command exceeded its deadline.'; kill(); }, timeout);
    const data = (part: Buffer) => {
      if (Buffer.byteLength(output) + part.length > 262144) { failure = 'The local command exceeded its output limit.'; kill(); }
      else output += part.toString();
    };
    child.stdout.on('data', data); child.stderr.on('data', data);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); failure || code !== 0 ? reject(Error(failure || output.trim() || 'The local command failed.')) : resolve(output.trim()); });
  });
}
