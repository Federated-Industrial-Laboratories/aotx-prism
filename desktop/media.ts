// SPDX-License-Identifier: Apache-2.0
// Transfer selected media bytes and retain exact gateway source identities.
import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { Gateway, epoch } from './gateway.js';
import { object, text, number } from '../shared/validate.js';
import type { Media } from '../shared/types.js';
function source(raw: unknown, endpoint: string, runtime: string, name?: string, ready = true): Media {
  const m = object(raw), id = text(m.id, 38), sha256 = text(m.sha256, 64);
  if (!/^media-[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(sha256) || ![1, 3].includes(m.format as number)) throw Error('Invalid media source.');
  const phase = number(m.phase, 0, 7), status = number(m.status, 0, 4294967295);
  if (!Number.isInteger(phase) || !Number.isInteger(status) || (ready && (phase !== 6 || status !== 0))) throw Error('The media source is not ready.');
  if (typeof m.bytes !== 'string' || !/^\d+$/.test(m.bytes)) throw Error('Invalid media byte count.');
  return { id, sha256, bytes: number(Number(m.bytes), 1, 33554432), modality: m.format === 1 ? 'image' : 'audio',
    name: name || id, endpoint, epoch: runtime, ...(ready ? {} : { phase, status }) };
}
export async function upload(gateway: Gateway, file: string, limit: number, runtime: string, signal: AbortSignal): Promise<Media> {
  const ext = extname(file).toLowerCase(), mime = ['.jpg', '.jpeg'].includes(ext) ? 'image/jpeg' : ext === '.wav' ? 'audio/wav' : '';
  if (!mime || !limit) throw Error('Select a JPEG or WAV supported by the current model.');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes: Buffer;
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size < 12 || info.size > limit) throw Error('The attachment exceeds the gateway limit or is not a regular file.');
    bytes = Buffer.alloc(info.size + 1); let length = 0, count = 0;
    do { count = readSync(fd, bytes, length, bytes.length - length, null); length += count; } while (count && length < bytes.length);
    if (length !== info.size) throw Error('The attachment changed during reading.'); bytes = bytes.subarray(0, length);
  } finally { closeSync(fd); }
  if (mime === 'image/jpeg' ? bytes[0] !== 255 || bytes[1] !== 216 : bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw Error('The selected file has an invalid media header.');
  const result = source((await gateway.json('/aotx/v1/media', signal, bytes, mime)).value, gateway.url, runtime, basename(file));
  if (result.bytes !== bytes.length || result.sha256 !== createHash('sha256').update(bytes).digest('hex') || result.modality !== (mime === 'image/jpeg' ? 'image' : 'audio')) throw Error('The uploaded source does not match the selected file.');
  return result;
}
export async function list(gateway: Gateway, runtime: string, signal: AbortSignal): Promise<Media[]> {
  const sources: Media[] = [], cursors = new Set<string>(); let cursor = '';
  for (let page = 0; page < 16; page++) {
    const row = object((await gateway.json(`/aotx/v1/media${cursor ? '?cursor=' + cursor : ''}`, signal)).value);
    if (row.schema !== 'aotx.media-list.v1' || epoch(row.runtime_epoch) !== runtime || !Array.isArray(row.data) || row.data.length > 128) throw Error('Invalid media list.');
    for (const raw of row.data) sources.push(source(raw, gateway.url, runtime, undefined, false));
    if (sources.length > 128) throw Error('The media list exceeds the client limit.');
    if (row.next_cursor === null) return sources;
    cursor = text(row.next_cursor, 20);
    if (!/^\d+$/.test(cursor) || cursors.has(cursor)) throw Error('Invalid media list cursor.'); cursors.add(cursor);
  }
  throw Error('The media list exceeds the page limit.');
}
