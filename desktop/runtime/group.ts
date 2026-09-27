// SPDX-License-Identifier: Apache-2.0
// Reap direct children and stop remaining members of each owned process group.
import type { ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
export function groupAlive(id: number): boolean {
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8'), fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (Number(fields[2]) === id && !['Z', 'X'].includes(fields[0])) return true;
    } catch { /* A process can exit during the group check. */ }
  }
  return false;
}
function signal(id: number | undefined, value: NodeJS.Signals) {
  if (id) try { process.kill(-id, value); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
}
async function cleanup(id?: number): Promise<boolean> {
  if (!id || !groupAlive(id)) return false;
  signal(id, 'SIGTERM');
  for (let i = 0; i < 20; i++) { if (!groupAlive(id)) return false; await delay(50); }
  signal(id, 'SIGKILL');
  for (let i = 0; i < 40; i++) { if (!groupAlive(id)) return true; await delay(50); }
  throw Error('An owned process group did not stop.');
}
export class OwnedGroup {
  readonly finished: Promise<void>;
  forced = false; error = '';
  constructor(readonly child: ChildProcess) {
    let cleaning: Promise<void> | undefined;
    const clean = () => cleaning ||= cleanup(child.pid).then(forced => { this.forced ||= forced; }).catch(error => { this.error = error.message; });
    child.once('exit', clean);
    this.finished = new Promise(resolve => child.once('close', () => { void clean().then(resolve); }));
  }
  async stop(grace = 30000) {
    const child = this.child;
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const timer = setTimeout(() => { this.forced = true; try { signal(child.pid, 'SIGKILL'); } catch (error) { this.error = (error as Error).message; } }, grace);
    try { await this.finished; } finally { clearTimeout(timer); }
  }
}
