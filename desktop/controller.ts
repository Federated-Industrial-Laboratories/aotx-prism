// SPDX-License-Identifier: Apache-2.0
// Own project transactions and request lifecycles independently of open panels.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Gateway, GatewayError, handleEpoch } from './gateway.js';
import { ProjectStore } from './storage.js';
import { command, terminal } from '../shared/validate.js';
import { Catalog } from './catalog.js';
import { RuntimeManager } from './runtime/manager.js';
import { inspect } from './runtime/inspect.js';
import { run } from './runtime/process.js';
import { gpuRows } from '../shared/setup.js';
import { upload, list } from './media.js';
import type { Command, Project, Reply, State, Turn } from '../shared/types.js';
export class Controller {
  private store: ProjectStore;
  private runtime: RuntimeManager;
  private gateway?: Gateway;
  private abort = new AbortController();
  private task?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  state: State;
  constructor(folder: string, private readonly emit: (state: State) => void,
    private readonly makeGateway = (url: string, token: string) => new Gateway(url, token),
    private readonly preferences = (_layout: string | null, _theme: State['theme']) => {},
    private readonly catalog = new Catalog()) {
    this.store = new ProjectStore(folder);
    let project: Project;
    try { project = this.store.read(); } catch (error) { this.store.close(); throw error; }
    for (const conversation of project.conversations) for (const turn of conversation.turns) {
      if (!terminal(turn)) { turn.phase = turn.handle ? 'interrupted' : 'unknown'; turn.error = 'The previous connection ended. Read the saved handle to check the result.'; }
    }
    this.store.write(project);
    this.runtime = new RuntimeManager(runtime => {
      this.state.runtime = runtime; this.publish();
      if (runtime.phase === 'failed' && this.state.connected && this.state.project.endpoint === runtime.url) void this.run({ type: 'disconnect' });
    });
    this.state = { catalog: structuredClone(catalog.value), runtime: structuredClone(this.runtime.state), attachments: [], uploading: false, version: 'development', project, folder: this.store.folder, selected: project.conversations[0]?.id || '',
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
  private idle(): void { if (this.state.busy || this.state.uploading) throw Error('Wait for the active request, or disconnect first.'); }
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
      case 'chooseFolder': case 'choosePath': case 'exportProject': case 'uploadMedia': throw Error('Use the desktop file picker.');
      case 'runtimeInspect': return { state: structuredClone(this.state), inspection: await inspect(cmd.profile) };
      case 'runtimeDevices': return { state: structuredClone(this.state), gpus: gpuRows(await run('/usr/bin/nvidia-smi', ['--query-gpu=uuid,name,memory.free,memory.total', '--format=csv,noheader,nounits'], undefined, 10000)) };
      case 'runtimeSave':
        this.catalog.edit(c => { if (!c.runtimes.some(p => p.name === cmd.profile.name) && c.runtimes.length >= 32) throw Error('The runtime profile limit is 32.'); c.runtimes = [...c.runtimes.filter(p => p.name !== cmd.profile.name), cmd.profile]; }); break;
      case 'runtimeRemove': this.catalog.edit(c => { c.runtimes = c.runtimes.filter(p => p.name !== cmd.name); }); break;
      case 'runtimeStart': this.idle(); if (this.state.connected) throw Error('Disconnect before starting an owned runtime.'); this.runtime.start(cmd.profile); break;
      case 'runtimeConnect': return this.execute({ type: 'connect', ...this.runtime.connection() });
      case 'runtimeStop':
        if (this.state.connected && this.state.project.endpoint === this.runtime.state.url) await this.execute({ type: 'disconnect' });
        await this.runtime.stop(); break;
      case 'renameConversation': case 'archiveConversation':
        this.persist(p => {
          const c = p.conversations.find(c => c.id === cmd.id); if (!c) throw Error('Select a saved conversation.');
          if (cmd.type === 'renameConversation') c.title = cmd.title;
          else { if (c.turns.some(t => !terminal(t))) throw Error('Resolve pending requests before archiving.'); c.archived = cmd.archived; }
        }); break;
      case 'saveProfile': {
        const model = this.state.capabilities?.models.find(m => m.id === this.state.project.model);
        if (!model) throw Error('Connect to verify the selected model before saving a profile.');
        this.persist(p => {
          if (!p.profiles.some(v => v.name === cmd.name) && p.profiles.length >= 32) throw Error('The generation profile limit is 32.');
          p.profiles = [...p.profiles.filter(v => v.name !== cmd.name), { name: cmd.name, model: model.id, sha256: model.sha256, maxTokens: p.maxTokens, temperature: p.temperature }];
        }); break;
      }
      case 'applyProfile': {
        const profile = this.state.project.profiles.find(p => p.name === cmd.name);
        if (!profile || !this.state.capabilities?.models.some(m => m.id === profile.model && m.sha256 === profile.sha256)) throw Error('This profile requires its exact model identity.');
        return this.execute({ type: 'profile', ...profile });
      }
      case 'removeProfile': this.persist(p => { p.profiles = p.profiles.filter(v => v.name !== cmd.name); }); break;
      case 'removeAttachment': this.state.attachments = this.state.attachments.filter(m => m.id !== cmd.id); break;
      case 'listMedia': return { state: structuredClone(this.state), media: await list(this.connected(), this.state.capabilities!.epoch, this.abort.signal) };
      case 'deleteMedia':
        await this.connected().json(`/aotx/v1/media/${cmd.id}`, this.abort.signal, undefined, undefined, 'DELETE');
        this.state.attachments = this.state.attachments.filter(m => m.id !== cmd.id); break;
      case 'openProject': {
        this.idle();
        if (this.gateway) throw Error('Disconnect before changing the project folder.');
        const store = new ProjectStore(cmd.path);
        try {
          const project = store.read();
          for (const conversation of project.conversations) for (const turn of conversation.turns) {
            if (!terminal(turn)) turn.phase = turn.handle ? 'interrupted' : 'unknown';
          }
          store.write(project); this.catalog.recent(store.folder); this.store.close(); this.store = store;
          this.state = { ...this.state, project, folder: store.folder, selected: project.conversations[0]?.id || '',
            saved: true, notice: '', capabilities: undefined, attachments: [] };
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
        this.state.attachments = this.state.attachments.filter(m => m.endpoint === gateway.url && m.epoch === caps.epoch);
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
        if (conversation.archived) throw Error('Restore the conversation before sending.');
        const input = (text: string, media: State['attachments']) => {
          if (media.some(m => m.endpoint !== gateway.url || m.epoch !== this.state.capabilities?.epoch)) throw Error('This history has media from another runtime. Start another conversation.');
          if (!media.length) return text;
          if (media.some(m => !this.state.capabilities?.models.find(model => model.id === project.model)?.input.includes(m.modality))) throw Error('The selected model does not accept these attachments.');
          return [{ type: 'text', text }, ...media.map(m => ({ type: 'media', media_id: m.id, modality: m.modality }))];
        };
        const attachments = structuredClone(this.state.attachments);
        const messages = conversation.turns.filter(t => t.phase === 'completed').flatMap(t => [
          { role: 'user', content: input(t.prompt, t.media || []) }, { role: 'assistant', content: t.reply }]);
        messages.push({ role: 'user', content: input(cmd.text, attachments) });
        if (Buffer.byteLength(JSON.stringify(messages)) > (this.state.capabilities?.promptBytes || 0))
          throw Error('The conversation exceeds the gateway prompt limit. Start another conversation.');
        const turn: Turn = { id: randomUUID(), prompt: cmd.text, model: project.model, endpoint: gateway.url,
          media: attachments, phase: 'submitting', bytes: '', cursor: 0, reply: '', error: '', created: new Date().toISOString(), cancelRequested: false };
        this.persist(p => p.conversations.find(c => c.id === cmd.id)!.turns.push(turn)); this.state.attachments = [];
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
      case 'files': return { state: structuredClone(this.state), files: this.store.files(cmd.path) };
      case 'readFile': return { state: structuredClone(this.state), text: this.store.readFile(cmd.name) };
      case 'layout': this.preferences(cmd.value, this.state.theme); this.state.layout = cmd.value; break;
      case 'theme': this.preferences(this.state.layout, cmd.value); this.state.theme = cmd.value; break;
    }
    this.state.catalog = structuredClone(this.catalog.value);
    this.publish(); return { state: structuredClone(this.state) };
  }
  async uploadFile(file: string): Promise<Reply> {
    this.idle(); const gateway = this.connected(), caps = this.state.capabilities!;
    if (this.state.attachments.length >= 8) throw Error('The attachment limit is eight.');
    const modality = /\.wav$/i.test(file) ? 'audio' : 'image';
    if (!caps.features.private_media || !caps.models.find(m => m.id === this.state.project.model)?.input.includes(modality)) throw Error('The selected model does not accept this media type.');
    this.state.uploading = true; this.publish();
    try {
      this.state.attachments.push(await upload(gateway, file, caps.uploadBytes, caps.epoch, this.abort.signal));
      this.state.notice = 'Attachment ready. It remains on the gateway until removed.';
    } catch (error) { this.state.notice = 'Upload did not complete. Inspect gateway sources before sending it again.'; throw error; }
    finally { this.state.uploading = false; this.publish(); }
    return { state: structuredClone(this.state) };
  }
  async close(): Promise<void> { this.abort.abort(); await this.task; await this.runtime.stop(); this.store.close(); }
}
