// SPDX-License-Identifier: Apache-2.0
// Keep owned runtime credentials in the desktop process and expose its observed state.
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { environment } from './process.js';
import type { RuntimeProfile, RuntimeState } from '../../shared/setup.js';
export class RuntimeManager {
  state: RuntimeState = { phase: 'stopped', folder: '', url: '', logs: '', error: '' };
  private worker?: ChildProcess; private token = ''; private finished?: Promise<void>;
  constructor(private changed: (state: RuntimeState) => void = () => {}, private workerFile = fileURLToPath(new URL('./supervisor.js', import.meta.url))) {}
  start(profile: RuntimeProfile) {
    if (this.worker) throw Error('Stop the owned runtime before starting another.');
    this.token = ''; this.state = { phase: 'starting', profile, folder: '', url: '', logs: '', error: '' }; this.changed(this.state);
    const worker = fork(this.workerFile, [], {
      execArgv: [], env: { ...environment(), ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    this.worker = worker;
    this.finished = new Promise(resolve => {
      worker.on('message', message => {
        const value = message as Partial<RuntimeState> & { token?: string };
        if (value.token) this.token = value.token;
        for (const key of ['phase', 'folder', 'url', 'logs', 'error', 'durability'] as const) if (value[key] !== undefined) Object.assign(this.state, { [key]: value[key] });
        this.changed(structuredClone(this.state));
      });
      worker.once('error', error => { this.state.error = error.message; });
      worker.once('close', () => {
        if (!['failed', 'stopped'].includes(this.state.phase)) { this.state.phase = 'failed'; this.state.error ||= 'Runtime supervision ended unexpectedly.'; }
        this.worker = undefined; this.token = ''; this.changed(structuredClone(this.state)); resolve();
      });
    });
    worker.send({ type: 'start', profile });
  }
  connection() {
    if (this.state.phase !== 'ready' || !this.token) throw Error('Start the owned runtime and wait for readiness.');
    return { url: this.state.url, token: this.token };
  }
  async stop() {
    if (this.worker?.connected) this.worker.send({ type: 'stop' });
    await this.finished;
  }
}
