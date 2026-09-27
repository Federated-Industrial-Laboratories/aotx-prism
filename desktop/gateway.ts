// SPDX-License-Identifier: Apache-2.0
// Read bounded native gateway messages without retries or credential redirects.
import { endpoint, object, text, number, HANDLE, MAX_OUTPUT } from '../shared/validate.js';
import type { Capabilities, Model, Turn } from '../shared/types.js';
export class GatewayError extends Error {
  constructor(message: string, readonly status = 0, readonly handle?: string) { super(message); }
}
function decimal(value: unknown): number {
  const raw = text(value, 20);
  if (!/^\d+$/.test(raw)) throw Error('Invalid byte cursor.');
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_OUTPUT) throw Error('Output exceeds the client limit.');
  return n;
}
export function epoch(value: unknown): string {
  const raw = text(value, 20);
  if (!/^[1-9]\d{0,19}$/.test(raw) || BigInt(raw) > 0xffffffffffffffffn) throw Error('Invalid runtime epoch.');
  return raw;
}
export function handleEpoch(handle: string): string { return BigInt(`0x${handle.slice(4, 20)}`).toString(); }
export function capabilities(value: unknown): Capabilities {
  const row = object(value), limits = object(row.limits), features = object(row.features);
  if (row.schema !== 'aotx.capabilities.v1' || !Array.isArray(row.models) || row.models.length > 64)
    throw Error('Unsupported gateway capabilities.');
  const ids = new Set<string>();
  const models = row.models.map((raw): Model => {
    const m = object(raw), id = text(m.id, 256), sha256 = text(m.sha256, 64);
    if (ids.has(id) || !/^[a-f0-9]{64}$/.test(sha256) || !Array.isArray(m.input) ||
        m.input.some(x => !['text', 'image', 'audio'].includes(String(x))) || typeof m.automatic_memory !== 'boolean')
      throw Error('Invalid model capabilities.');
    ids.add(id);
    if (!Array.isArray(m.controls) || m.controls.length > 64) throw Error('Invalid control capabilities.');
    const controls = m.controls.map(raw => {
      const c = object(raw);
      if (typeof c.available !== 'boolean' || !Array.isArray(c.accepted_doses) || c.accepted_doses.length > 64)
        throw Error('Invalid control capabilities.');
      return { name: text(c.name, 128), available: c.available,
        accepted_doses: c.accepted_doses.map(d => number(d, -40000, 40000)) };
    });
    return { id, sha256, input: m.input as string[], automatic_memory: m.automatic_memory, controls };
  });
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(features)) if (typeof value === 'boolean') flags[key] = value;
  const bounded = (value: unknown, max: number) => {
    const n = number(value, 1, max); if (!Number.isInteger(n)) throw Error('Invalid gateway limit.'); return n;
  };
  const mediaBytes = flags.private_media ? text(limits.private_media_bytes, 20) : '0';
  if (!/^\d+$/.test(mediaBytes)) throw Error('Invalid media quota.');
  const mediaQuota = number(Number(mediaBytes), 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(mediaQuota)) throw Error('Invalid media quota.');
  return { epoch: epoch(row.runtime_epoch), models, features: flags,
    outputTokens: bounded(limits.output_tokens, 1048576), outputBytes: bounded(limits.output_bytes, 1073741824),
    promptBytes: bounded(limits.wrapped_prompt_bytes, 1073741824),
    uploadBytes: flags.private_media ? Math.min(bounded(limits.upload_bytes, 1073741824), mediaQuota, 33554432) : 0 };
}
export function output(value: unknown, turn: Turn): Turn {
  const row = object(value), part = object(row.output);
  if (row.schema !== 'aotx.request.v1' || row.id !== turn.handle || epoch(row.runtime_epoch) !== turn.epoch ||
      part.encoding !== 'base64' || typeof row.cancel_requested !== 'boolean') throw Error('Request identity or output format changed.');
  if (!['queued', 'preparing', 'running', 'completed', 'failed', 'cancelled'].includes(String(row.state)))
    throw Error('Unsupported request state.');
  const cursor = decimal(part.cursor), next = decimal(part.next_cursor), total = decimal(part.total_bytes);
  const encoded = text(part.bytes, Math.ceil(MAX_OUTPUT / 3) * 4, true), bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || cursor !== turn.cursor || next !== cursor + bytes.length || next > total)
    throw Error('Invalid output byte window.');
  const joined = Buffer.concat([Buffer.from(turn.bytes, 'base64'), bytes]);
  if (joined.length !== next) throw Error('Invalid stored byte cursor.');
  const end = ['completed', 'failed', 'cancelled'].includes(String(row.state)) && next === total;
  const usage = object(row.usage);
  const count = (v: unknown) => { const n = number(v, 0, 2147483647); if (!Number.isInteger(n)) throw Error('Invalid token count.'); return n; };
  return { ...turn, bytes: joined.toString('base64'), cursor: next,
    reply: new TextDecoder('utf-8', { fatal: true }).decode(joined, { stream: !end }),
    phase: end ? row.state as Turn['phase'] : 'running', cancelRequested: row.cancel_requested,
    error: end && row.state === 'failed' ? `The runtime returned status ${number(row.status, 0, 4294967295)}.` : '',
    usage: { prompt_tokens: count(usage.prompt_tokens), completion_tokens: count(usage.completion_tokens), total_tokens: count(usage.total_tokens) } };
}
export class Gateway {
  readonly url: string;
  constructor(url: string, private readonly token: string, private readonly request: typeof fetch = fetch) { this.url = endpoint(url); }
  async json(path: string, signal: AbortSignal, body?: unknown, mime?: string, method?: string): Promise<{ value: unknown; handle?: string }> {
    let handle: string | undefined;
    try {
      const encoded = body === undefined ? undefined : mime ? body as Buffer : JSON.stringify(body);
      if (encoded && Buffer.byteLength(encoded) > (mime ? 33554432 : 2 * 1024 * 1024)) throw Error('The request body exceeds the client limit.');
      const response = await this.request(this.url + path, { method: method || (body === undefined ? 'GET' : 'POST'),
        headers: { Authorization: `Bearer ${this.token}`, ...(encoded ? { 'Content-Type': mime || 'application/json' } : {}) },
        body: Buffer.isBuffer(encoded) ? new Uint8Array(encoded) : encoded, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(mime ? 300000 : 30000)]) });
      const header = response.headers.get('x-request-id');
      if (header && HANDLE.test(header)) handle = header;
      if (response.status === 204 && method === 'DELETE') return { value: null };
      const reader = response.body?.getReader();
      if (!reader) throw Error('The gateway returned no response body.');
      const pieces: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 2 * 1024 * 1024) throw Error('The gateway response exceeds the client limit.');
          pieces.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (!response.ok) throw new GatewayError(`Gateway HTTP ${response.status}.`, response.status, handle);
      return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(pieces))), handle };
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(signal.aborted ? 'Connection closed.' : 'The gateway response could not be verified.', 0, handle);
    }
  }
  async discover(signal: AbortSignal): Promise<Capabilities> { return capabilities((await this.json('/aotx/v1/capabilities', signal)).value); }
  async submit(body: unknown, signal: AbortSignal): Promise<{ handle: string; epoch: string }> {
    const reply = await this.json('/aotx/v1/requests', signal, body);
    try {
      const row = object(reply.value), handle = text(row.id, 53), runtime = epoch(row.runtime_epoch);
      if (row.schema !== 'aotx.admission.v1' || row.state !== 'accepted' || !HANDLE.test(handle) ||
          (reply.handle && reply.handle !== handle) || handleEpoch(handle) !== runtime) throw Error('Invalid admission.');
      return { handle, epoch: runtime };
    } catch { throw new GatewayError('The admission could not be verified. Do not resend this prompt.', 0, reply.handle); }
  }
  async read(turn: Turn, signal: AbortSignal): Promise<Turn> {
    if (!turn.handle || !HANDLE.test(turn.handle)) throw Error('No request handle is available.');
    return output((await this.json(`/aotx/v1/requests/${turn.handle}?cursor=${turn.cursor}`, signal)).value, turn);
  }
  async cancel(handle: string, signal: AbortSignal): Promise<void> {
    if (!HANDLE.test(handle)) throw Error('Invalid request handle.');
    await this.json(`/aotx/v1/requests/${handle}/cancel`, signal, {});
  }
}
