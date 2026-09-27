// SPDX-License-Identifier: Apache-2.0
// Own project transactions and request lifecycles independently of open panels.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Gateway, GatewayError, handleEpoch } from './gateway.js';
import { ProjectStore } from './storage.js';
import { command, terminal } from '../shared/validate.js';
import type { Command, Project, Reply, State, Turn } from '../shared/types.js';
export class Controller {
  private store: ProjectStore;
  private gateway?: Gateway;
  private abort = new AbortController();
  private task?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  state: State;
  constructor(folder: string, private readonly emit: (state: State) => void,
    private readonly makeGateway = (url: string, token: string) => new Gateway(url, token),
    private readonly preferences = (_layout: string | null, _theme: State['theme']) => {}) {
    this.store = new ProjectStore(folder);
    let project: Project;
    try { project = this.store.read(); } catch (error) { this.store.close(); throw error; }
    for (const conversation of project.conversations) for (const turn of conversation.turns) {
      if (!terminal(turn)) { turn.phase = turn.handle ? 'interrupted' : 'unknown'; turn.error = 'The previous connection ended. Read the saved handle to check the result.'; }
    }
    this.store.write(project);
    this.state = { version: 'development', project, folder: this.store.folder, selected: project.conversations[0]?.id || '',
      connected: false, busy: false, notice: '', saved: true, layout: null, theme: 'silver' };
  }
  private publish(): void { this.emit(structuredClone(this.state)); }
  private persist(edit: (project: Project) => void): void {
    const next = structuredClone(this.state.project); edit(next);
    try { this.store.write(next); }
    catch (error) { this.state.project = next; this.state.saved = false; this.state.notice = 'The project could not be saved. Reopen it before new work.'; this.publish(); throw error; }
    this.state.project = next; this.state.saved = true; this.publish();
  }
  private turn(id: string): Turn {
    const turn = this.state.project.conversations.flatMap(c => c.turns).find(t => t.id === id);
    if (!turn) throw Error('The saved request was not found.'); return turn;
  }
  private update(id: string, edit: Partial<Turn>): void {
    this.persist(project => {
      const turn = project.conversations.flatMap(c => c.turns).find(t => t.id === id);
      if (!turn) throw Error('The saved request was not found.'); Object.assign(turn, edit);
    });
  }
  private idle(): void { if (this.state.busy) throw Error('Wait for the active request, or disconnect first.'); }
  private connected(): Gateway { if (!this.gateway || !this.state.connected) throw Error('Connect to a gateway first.'); return this.gateway; }
  private start(work: () => Promise<void>): void {
    this.state.busy = true; this.state.notice = ''; this.publish();
    this.task = work().catch(() => {
      if (!this.state.notice) this.state.notice = 'The request stopped. Read its saved state before continuing.';
    }).finally(() => { this.state.busy = false; this.publish(); });
  }
  private async poll(id: string, gateway: Gateway): Promise<void> {
    while (!this.abort.signal.aborted) {
      const turn = this.turn(id);
      const next = await gateway.read(turn, this.abort.signal);
      this.update(id, next);
      if (terminal(next)) return;
      await delay(180, undefined, { signal: this.abort.signal });
    }
    throw Error('Connection closed.');
  }
  private failure(id: string, error: unknown): void {
    const current = this.turn(id), status = error instanceof GatewayError ? error.status : 0;
    if (terminal(current)) return;
    const handle = current.handle || (error instanceof GatewayError ? error.handle : undefined);
    const expired = !!handle && (status === 404 || status === 410);
    const phase = expired ? 'expired' : handle ? 'interrupted' : 'unknown';
    const detail = expired ? 'The gateway cannot recover this request. The saved reply is retained.' :
      handle ? 'Output reading stopped. Reconnect to the same gateway and read this request again.' :
      'No verified handle is available. The gateway may have accepted this prompt. It was not sent again.';
    this.update(id, { phase, error: detail, ...(handle ? { handle, epoch: handleEpoch(handle) } : {}) });
  }
  async run(raw: unknown): Promise<Reply> {
    const operation = this.queue.then(() => this.execute(command(raw)));
    this.queue = operation.catch(() => {}); return operation;
  }
  private async execute(cmd: Command): Promise<Reply> {
    switch (cmd.type) {
      case 'state': break;
      case 'chooseFolder': throw Error('Use the desktop folder picker.');
      case 'openProject': {
        this.idle();
        if (this.gateway) throw Error('Disconnect before changing the project folder.');
        const store = new ProjectStore(cmd.path);
        try {
          const project = store.read();
          for (const conversation of project.conversations) for (const turn of conversation.turns) {
            if (!terminal(turn)) turn.phase = turn.handle ? 'interrupted' : 'unknown';
          }
          store.write(project); this.store.close(); this.store = store;
          this.state = { ...this.state, project, folder: store.folder, selected: project.conversations[0]?.id || '',
            saved: true, notice: '', capabilities: undefined };
        } catch (error) { store.close(); throw error; }
        break;
      }
      case 'connect': {
        this.idle(); if (this.gateway) throw Error('Disconnect before changing the connection.');
        const gateway = this.makeGateway(cmd.url, cmd.token), abort = new AbortController();
        const caps = await gateway.discover(abort.signal);
        if (!caps.features.chat_completions || !caps.models.some(m => m.input.includes('text')))
          throw Error('This gateway does not expose a text conversation model.');
        this.persist(project => {
          project.endpoint = gateway.url;
          if (!caps.models.some(m => m.id === project.model && m.input.includes('text')))
            project.model = caps.models.find(m => m.input.includes('text'))!.id;
          project.maxTokens = Math.min(project.maxTokens, caps.outputTokens);
        });
        this.gateway = gateway; this.abort = abort;
        this.state.capabilities = caps; this.state.connected = true; this.state.notice = 'Gateway connected.';
        break;
      }
      case 'disconnect':
        this.abort.abort(); await this.task; this.task = undefined; this.gateway = undefined;
        this.state.connected = false; this.state.notice = 'Disconnected. Device requests are not cancelled.'; break;
      case 'newConversation': {
        const id = randomUUID();
        this.persist(project => {
          if (project.conversations.length >= 64) throw Error('This project has 64 conversations. Open another project folder.');
          project.conversations.push({ id, title: cmd.title, turns: [] });
        }); this.state.selected = id; break;
      }
      case 'select':
        if (!this.state.project.conversations.some(c => c.id === cmd.id)) throw Error('Select a saved conversation.');
        this.state.selected = cmd.id; break;
      case 'profile': {
        const caps = this.state.capabilities; this.connected();
        if (!caps?.models.some(m => m.id === cmd.model && m.input.includes('text')) || cmd.maxTokens > caps.outputTokens)
          throw Error('Select an available model and token limit.');
        this.persist(p => { p.model = cmd.model; p.maxTokens = cmd.maxTokens; p.temperature = cmd.temperature; }); break;
      }
      case 'send': {
        this.idle(); if (!this.state.saved) throw Error('Reopen the project before new work.');
        const gateway = this.connected(), project = this.state.project;
        const conversation = project.conversations.find(c => c.id === cmd.id);
        if (!conversation) throw Error('Select a conversation.');
        if (conversation.turns.some(t => !terminal(t))) throw Error('Resolve the previous request or start another conversation.');
        if (conversation.turns.length >= 128) throw Error('Start another conversation. The turn limit is 128.');
        const messages = conversation.turns.filter(t => t.phase === 'completed').flatMap(t => [
          { role: 'user', content: t.prompt }, { role: 'assistant', content: t.reply }]);
        messages.push({ role: 'user', content: cmd.text });
        if (Buffer.byteLength(messages.map(m => m.content).join('')) > (this.state.capabilities?.promptBytes || 0))
          throw Error('The conversation exceeds the gateway prompt limit. Start another conversation.');
        const turn: Turn = { id: randomUUID(), prompt: cmd.text, model: project.model, endpoint: gateway.url,
          phase: 'submitting', bytes: '', cursor: 0, reply: '', error: '', created: new Date().toISOString(), cancelRequested: false };
        this.persist(p => p.conversations.find(c => c.id === cmd.id)!.turns.push(turn));
        this.start(async () => {
          try {
            const admission = await gateway.submit({ model: turn.model, messages, max_tokens: project.maxTokens,
              temperature: project.temperature }, this.abort.signal);
            this.update(turn.id, { ...admission, phase: 'accepted' });
            await this.poll(turn.id, gateway);
          } catch (error) { this.failure(turn.id, error); }
        }); break;
      }
      case 'resume': {
        this.idle(); const gateway = this.connected(), turn = this.turn(cmd.id);
        if (!turn.handle || terminal(turn)) throw Error('This request has no pending handle.');
        if (turn.endpoint !== gateway.url) throw Error('Connect to the original gateway URL.');
        this.start(async () => {
          try { await this.poll(turn.id, gateway); } catch (error) { this.failure(turn.id, error); }
        }); break;
      }
      case 'cancel': {
        const gateway = this.connected(), turn = this.turn(cmd.id);
        if (!turn.handle || terminal(turn) || turn.endpoint !== gateway.url) throw Error('No active handle is available on this gateway.');
        await gateway.cancel(turn.handle, this.abort.signal);
        this.update(turn.id, { cancelRequested: true });
        this.state.notice = 'Cancellation requested. Read the final device state.'; break;
      }
      case 'files': return { state: structuredClone(this.state), files: this.store.files() };
      case 'readFile': return { state: structuredClone(this.state), text: this.store.readFile(cmd.name) };
      case 'layout': this.preferences(cmd.value, this.state.theme); this.state.layout = cmd.value; break;
      case 'theme': this.preferences(this.state.layout, cmd.value); this.state.theme = cmd.value; break;
    }
    this.publish(); return { state: structuredClone(this.state) };
  }
  async close(): Promise<void> { this.abort.abort(); await this.task; this.store.close(); }
}
