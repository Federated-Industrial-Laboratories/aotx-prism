// SPDX-License-Identifier: Apache-2.0
// Route shared operations through a durable local journal and verify each returned identity.
import { setTimeout as delay } from 'node:timers/promises';
import { affect } from '../observation.js';
import { selection, type ControlChoice } from '../../shared/controls.js';
import { Gateway, GatewayError } from '../gateway.js';
import { MutationJournal } from './journal.js';
import { PREFIX, participant, receipt, resource, page, handle, rights, OutputWindow, type Receipt, type Row } from '../../shared/shared-protocol.js';
import { emptyShared, emptyPage, type SharedState, type SharedCommand, type Mutation } from '../../shared/shared.js';
import type { Capabilities, Media, Project } from '../../shared/types.js';
const terminal = (r: Receipt) => !['accepted', 'queued', 'running'].includes(r.state);
const definitive = new Set([400, 401, 403, 404, 409, 410, 413, 422]);
export class SharedSession {
  state: SharedState = emptyShared();
  private gateway?: Gateway; private abort = new AbortController();
  private tasks = new Map<string, Promise<void>>();
  private pageReads = new Map<string, number>();
  constructor(readonly journal: MutationJournal, private changed: (state: SharedState) => void) { this.sync(); }
  private sync() { this.state.records = structuredClone(this.journal.data.records); this.state.labels = { ...this.journal.data.labels }; }
  private emit() { this.sync(); this.changed(structuredClone(this.state)); }
  private write(work: () => void) {
    try { work(); } catch (error) { this.state.saved = false; this.emit(); throw error; }
  }
  private ready() {
    if (!this.gateway || !this.state.connected || !this.state.person) throw Error('Open the shared workspace first.');
    return { gateway: this.gateway, person: this.state.person };
  }
  private async get(path: string): Promise<unknown> {
    const { gateway } = this.ready(); return (await gateway.json(PREFIX + path, this.abort.signal)).value;
  }
  async connect(gateway: Gateway) {
    await this.disconnect(); this.abort = new AbortController();
    const caps = resource((await gateway.json(PREFIX + '/capabilities', this.abort.signal)).value);
    if (caps.persistence !== 'complete_runtime') throw Error('This gateway requires a complete shared runtime.');
    const person = participant((await gateway.json(PREFIX + '/participant', this.abort.signal)).value);
    if (person.lineage !== caps.lineage || /^0+$/.test(person.participant) || person.next_sequence === '0') throw Error('Invalid shared participant.');
    this.gateway = gateway; this.state = { ...emptyShared(), person, connected: true, saved: this.state.saved };
    this.emit(); if (person.registered) await this.list('spaces', '0');
  }
  async disconnect() {
    this.abort.abort(); await Promise.allSettled(this.tasks.values()); this.tasks.clear();
    this.gateway = undefined; this.state.connected = false; this.state.watching = []; this.state.inspected = undefined; this.emit();
  }
  private async identity() {
    const { person } = this.ready(), next = participant(await this.get('/participant'));
    if (next.lineage !== person.lineage || next.participant !== person.participant) throw Error('The shared identity changed. Reconnect before new work.');
    this.state.person = next; return next;
  }
  private row(key: string) {
    const row = this.journal.data.records.find(r => r.key === key); if (!row) throw Error('Select a saved shared request.'); return row;
  }
  private match(row: Mutation, endpoint = true) {
    const { gateway, person } = this.ready();
    if (row.lineage !== person.lineage || row.actor !== person.participant || (endpoint && row.endpoint !== gateway.url))
      throw Error('The saved request belongs to another connection. Attach it only after verifying the matching participant and lineage.');
  }
  async list(kind: 'spaces' | 'members' | 'conversations' | 'events', cursor: string) {
    const { person } = this.ready();
    const space = this.state.selectedSpace, conversation = this.state.selectedConversation, signal = this.abort.signal;
    const ticket = (this.pageReads.get(kind) || 0) + 1; this.pageReads.set(kind, ticket);
    const current = () => !signal.aborted && this.pageReads.get(kind) === ticket &&
      (kind === 'spaces' || (space === this.state.selectedSpace && (kind !== 'events' || conversation === this.state.selectedConversation)));
    const path = kind === 'spaces' ? '/spaces' : kind === 'events' ? `/conversations/${handle(this.state.selectedConversation, 'con', person.lineage)}/events` :
      `/spaces/${handle(this.state.selectedSpace, 'spc', person.lineage)}/${kind}`;
    try {
      const raw = await this.get(`${path}?cursor=${cursor}&limit=64`), r = resource(raw, person.lineage);
      if (!current()) return;
      if (kind !== 'spaces' && r.space !== space) throw Error('The shared page belongs to another space.');
      this.state[kind] = page(raw, kind, person.lineage);
    }
    catch (error) { if (!current()) return; this.state[kind] = emptyPage(); this.state.inspected = undefined; this.emit(); throw error; }
    this.emit();
  }
  private async prepare(path: string, fields: Row, label: string) {
    if (!this.state.saved) throw Error('Reopen the project after the shared journal save failure.');
    if (this.tasks.size >= 8) throw Error('Wait for a shared result before new work.');
    const { gateway } = this.ready(), person = await this.identity();
    if (this.journal.data.records.some(r => r.lineage === person.lineage && r.actor === person.participant &&
        r.sequence === person.next_sequence && !r.handle && !definitive.has(r.refusal)))
      throw Error('Resolve the saved request with this sequence before new work. Use its exact retry.');
    let row!: Mutation;
    this.write(() => { row = this.journal.prepare(gateway.url, person, path, fields, label); }); this.emit();
    await this.submit(row); return row.key;
  }
  private validateResult(raw: unknown, row: Mutation) {
    const r = receipt(raw, row.lineage);
    const operation = row.path.endsWith('/participant') ? 1 : row.path.endsWith('/spaces') ? 2 : row.path.endsWith('/members') ? 3 :
      row.path.endsWith('/conversations') ? 4 : row.path.endsWith('/inputs') ? 5 : row.path.endsWith('/cancel') ? 6 : row.path.endsWith('/retire') ? 7 : row.path.endsWith('/save') ? 9 : 8;
    if (r.actor !== row.actor || r.operation_key !== row.key || r.sequence !== row.sequence || r.operation !== operation ||
        (row.handle && r.id !== row.handle)) throw Error('The operation receipt does not match the saved request.');
    return r;
  }
  private retain(raw: unknown, row: Mutation, output: OutputWindow) {
    const r = this.validateResult(raw, row); output.apply(r);
    if (output.invalid || output.gap) throw Error('The result contains changed bytes or a missing output span.');
    const value = { ...(raw as Row), offset: '0', next_offset: output.cursor,
      output: { bytes: output.cursor, base64: Buffer.from(output.bytes).toString('base64'), text: output.text } };
    this.write(() => this.journal.update(row.key, { handle: r.id, refusal: 0, result: value })); this.emit(); return r;
  }
  private output(row: Mutation) {
    const result = new OutputWindow(); if (row.result) result.apply(this.validateResult(row.result, row)); return result;
  }
  private fail(row: Mutation, error: unknown) {
    if (this.abort.signal.aborted) return;
    const status = error instanceof GatewayError ? error.status : 0;
    if (this.state.saved) {
      try { this.write(() => this.journal.update(row.key, { refusal: status })); }
      catch { this.state.error = 'The shared journal could not be saved. Reopen the project.'; this.emit(); return; }
    }
    this.state.error = status ? `Shared gateway HTTP ${status}. The saved request is retained.` :
      'The shared result could not be verified. Read the saved receipt or use an exact retry.'; this.emit();
  }
  private async submit(row: Mutation) {
    this.match(row); const { gateway } = this.ready();
    try {
      const raw = (await gateway.json(row.path, this.abort.signal, Buffer.from(row.body), 'application/json')).value;
      this.retain(raw, row, this.output(row)); this.watch(row.key); await this.identity();
    } catch (error) { this.fail(row, error); throw error; }
  }
  private watch(key: string) {
    if (this.tasks.has(key)) return;
    this.state.watching.push(key);
    const work = this.poll(key).catch(error => this.fail(this.row(key), error)).finally(() => {
      this.tasks.delete(key); this.state.watching = this.state.watching.filter(k => k !== key); this.emit();
    });
    this.tasks.set(key, work); this.emit();
  }
  private async poll(key: string) {
    let row = this.row(key); this.match(row);
    const output = this.output(row);
    while (!this.abort.signal.aborted) {
      row = this.row(key);
      const raw = await this.get(`/operations/${handle(row.handle, 'op', row.lineage)}?offset=${output.cursor}`);
      const current = this.retain(raw, row, output);
      if (current.save.error) throw Error('The runtime reports a persistent save error.');
      if (current && terminal(current) && current.saved_terminal && output.complete) {
        if (current.status === 200 && current.device_committed) {
          if (current.operation === 2 || current.operation === 4) this.write(() => this.journal.label(`${current.operation === 2 ? 'spc' : 'con'}-${row.lineage}-${current.resource}`, row.label));
          await this.identity();
          if (this.state.person?.registered) await this.list('spaces', '0');
          if (this.state.selectedSpace) await this.list('conversations', '0');
          if (this.state.selectedConversation) await this.list('events', '0');
        }
        return;
      }
      await delay(250, undefined, { signal: this.abort.signal });
    }
  }
  async inspect(id: string) {
    const { person } = this.ready(); handle(id, 'op', person.lineage); this.state.inspected = undefined; this.emit();
    const output = new OutputWindow(); let last: Receipt;
    do {
      const before = output.cursor;
      last = receipt(await this.get(`/operations/${id}?offset=${output.cursor}`), person.lineage);
      if (last.id !== id) throw Error('The selected operation changed.');
      output.apply(last); if (output.invalid || output.gap) throw Error('The result has unavailable or invalid bytes.');
      if (output.cursor === before && output.cursor !== last.output_bytes) throw Error('The result read made no progress. Read it again.');
    } while (output.cursor !== last.output_bytes);
    this.state.inspected = { receipt: last, text: output.text }; this.emit();
  }
  async execute(cmd: SharedCommand, project: Project, caps?: Capabilities, attachments: Media[] = [], control?: ControlChoice) {
    this.state.error = '';
    switch (cmd.type) {
      case 'sharedConnect': throw Error('Use the current gateway connection.');
      case 'sharedPage': await this.list(cmd.kind, cmd.cursor); break;
      case 'sharedSelect': {
        const { person } = this.ready();
        if (cmd.kind === 'space') {
          const r = resource(await this.get(`/spaces/${handle(cmd.id, 'spc', person.lineage)}`), person.lineage);
          if (r.id !== cmd.id) throw Error('The selected space changed.');
          this.state.selectedSpace = cmd.id; this.state.selectedConversation = ''; this.state.events = emptyPage();
          await this.list('conversations', '0'); await this.list('members', '0');
        } else {
          const r = resource(await this.get(`/conversations/${handle(cmd.id, 'con', person.lineage)}`), person.lineage);
          if (r.id !== cmd.id || r.space !== this.state.selectedSpace) throw Error('The conversation belongs to another space.');
          this.state.selectedConversation = cmd.id; await this.list('events', '0');
        }
        this.state.inspected = undefined; break;
      }
      case 'sharedRegister': await this.prepare('/participant', {}, 'Register participant'); break;
      case 'sharedSpace': await this.prepare('/spaces', { scope: cmd.scope }, cmd.name); break;
      case 'sharedConversation': await this.prepare(`/spaces/${handle(this.state.selectedSpace, 'spc')}/conversations`, {}, cmd.name); break;
      case 'sharedMember': await this.prepare(`/spaces/${handle(this.state.selectedSpace, 'spc')}/members`, { participant: cmd.participant, permissions: cmd.permissions }, 'Change membership'); await this.list('members', '0'); break;
      case 'sharedSend': {
        const { gateway } = this.ready(), model = caps?.models.find(m => m.id === project.model);
        if (!model || !model.input.includes('text') || project.maxTokens > caps!.outputTokens) throw Error('Select an available model and output limit.');
        if ((!cmd.text.trim() && !attachments.length) || Buffer.byteLength(cmd.text) + attachments.length * 73 > 2048) throw Error('The shared input exceeds 2,048 bytes or is empty.');
        if (attachments.some(m => m.endpoint !== gateway.url || m.epoch !== caps?.epoch || !model.input.includes(m.modality))) throw Error('These attachments are unavailable for this runtime and model.');
        const selected = selection(control, control ? await gateway.discover(this.abort.signal) : caps, project.model);
        if (selected && affect(await this.get(`/conversations/${handle(this.state.selectedConversation, 'con')}/affect`), this.state).enabled) throw Error('Explicit controls require affect to be disabled by the runtime operator.');
        await this.prepare(`/conversations/${handle(this.state.selectedConversation, 'con')}/inputs`, { text: cmd.text, model: project.model,
          ...(selected ? { control: selected } : {}), max_output_tokens: project.maxTokens, temperature: project.temperature,
          ...(attachments.length ? { media: attachments.map(m => ({ type: m.modality, sha256: m.sha256 })) } : {}) }, 'Conversation input'); break;
      }
      case 'sharedPublish': {
        const { person } = this.ready();
        const destination = handle(cmd.destination, 'spc', person.lineage);
        const r = resource(await this.get(`/spaces/${destination}`), person.lineage);
        if (r.id !== destination || !rights(r.permissions).includes('manage')) throw Error('The destination requires management permission.');
        await this.prepare(`/spaces/${destination}/publish/${cmd.id}`, { source_version: cmd.version }, 'Publish evidence'); break;
      }
      case 'sharedSave': await this.prepare('/save', {}, 'Save runtime'); break;
      case 'sharedRetire': await this.prepare('/retire', { retry_floor: cmd.floor }, 'Retire saved receipts'); break;
      case 'sharedInspect': await this.inspect(cmd.id); break;
      case 'sharedLabel': this.write(() => this.journal.label(cmd.id, cmd.name)); break;
      case 'sharedReattach': {
        const row = this.row(cmd.key); await this.identity(); this.match(row, false);
        this.write(() => this.journal.update(row.key, { endpoint: this.ready().gateway.url })); break;
      }
      case 'sharedRetry': { const row = this.row(cmd.key); await this.identity(); this.match(row); await this.submit(row); break; }
      case 'sharedRead': { const row = this.row(cmd.key); this.match(row); if (!row.handle) throw Error('No saved receipt is available.'); this.watch(row.key); break; }
      case 'sharedCancel': {
        const row = this.row(cmd.key); this.match(row);
        await this.prepare(`/operations/${handle(row.handle, 'op', row.lineage)}/cancel`, { target_sequence: row.sequence }, 'Cancel input'); this.watch(row.key); break;
      }
    }
    this.emit();
  }
}
