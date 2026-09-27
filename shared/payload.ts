// SPDX-License-Identifier: Apache-2.0
// Decode documented memory bytes for display without deriving cognitive state.
export interface Reference { label: string; id: string; version?: string; representation?: number }
export interface Span { label: string; start: number; length: number }
export interface Decoded { format: string; state: 'known' | 'unknown' | 'invalid'; fields: Record<string, string>;
  text?: string; references: Reference[]; spans: Span[]; error?: string }
export const kindNames: Record<number, string> = { 1: 'Source event', 2: 'Assertion', 3: 'Appraisal', 4: 'Relationship',
  5: 'Cue', 6: 'Intention', 7: 'Working memory', 8: 'Media', 9: 'Component', 10: 'Selection', 11: 'Policy', 12: 'Identity', 13: 'Task review' };
export function decodePayload(bytes: Uint8Array, kind: number): Decoded {
  const result: Decoded = { format: 'Unknown payload', state: 'unknown', fields: {}, references: [], spans: [] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at: number) => view.getUint32(at, true), u64 = (at: number) => view.getBigUint64(at, true).toString();
  const hex = (at: number, count: number) => { require(at + count <= bytes.length); return Array.from(bytes.slice(at, at + count), v => v.toString(16).padStart(2, '0')).join(''); };
  function require(pass: boolean) { if (!pass) throw Error('The payload does not match this format.'); }
  const zero = (at: number, count: number) => { require(at + count <= bytes.length && bytes.slice(at, at + count).every(v => !v)); };
  const exact = (length: number) => require(bytes.length === length);
  const ref = (label: string, at: number, versionAt?: number) => {
    const id = hex(at, 16); if (!/^0+$/.test(id)) result.references.push({ label, id, ...(versionAt === undefined ? {} : { version: u64(versionAt) }) });
  };
  const digest = (label: string, at: number) => { result.fields[label] = hex(at, 32); };
  const span = (label: string, at: number) => { const start = u32(at), length = u32(at + 4); require(length > 0 || start === 0); result.spans.push({ label, start, length }); };
  const scaled = (at: number) => { const v = u32(at); require(v <= 1000000 || v === 0xffffffff); return v === 0xffffffff ? 'Unknown' : `${v} / 1000000`; };
  const text = (at: number, length: number) => {
    require(length > 0 && length <= 2048 && bytes.length === at + length);
    const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.slice(at));
    require(!/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(value)); return value;
  };
  const magic = new TextDecoder().decode(bytes.slice(0, 8));
  try {
    if (['AOTXMEM1', 'AOTXMEM2', 'AOTXMEM3', 'AOTXMEM4'].includes(magic)) {
      result.format = ({ AOTXMEM1: 'Source text', AOTXMEM2: 'Task-bound text', AOTXMEM3: 'Extracted statement', AOTXMEM4: 'Task review' })[magic]!; require(bytes.length >= 16);
      const expected = Number(magic.at(-1));
      if (u32(8) !== expected) return result;
      if (expected === 1) { zero(16, 16); result.text = text(32, u32(12)); }
      if (expected === 2 || expected === 4) {
        require(bytes.length >= 64 && u32(32) <= 1); zero(36, 28); ref('Task', 16);
        require(result.references.length === 1); result.fields['Task match required'] = u32(32) ? 'Yes' : 'No';
        result.text = text(64, u32(12));
        if (expected === 4) require(kind === 13 && u32(32) === 1 && result.text === 'Review the supported outcome before repeating this task.');
      }
      if (expected === 3) {
        require(bytes.length >= 96); zero(88, 8);
        const labels = ['Participant identity', 'Task', 'Assertion', 'Correction'];
        require(u32(16) >= 1 && u32(16) <= labels.length); result.fields['Statement type'] = labels[u32(16) - 1];
        result.spans.push({ label: 'Source quote', start: u32(20), length: u32(12) });
        digest('Processor SHA-256', 24); digest('Model SHA-256', 56); result.text = text(96, u32(12));
      }
    } else if (magic === 'AOTXREL1') {
      result.format = 'Relationship evidence'; require(bytes.length >= 12); if (u32(8) !== 1) return result;
      exact(192); require(kind === 4 && u32(12) === 1); zero(160, 32);
      result.fields['Source exposure'] = String(u32(12));
      ['Regard gain', 'Regard loss', 'Task trust gain', 'Task trust loss'].forEach((key, i) => { result.fields[key] = scaled(16 + 4 * i); });
      ref('Task', 32); span('Outcome quote', 48); span('Task quote', 56); span('Commitment quote', 64);
      digest('Processor SHA-256', 72); digest('Model SHA-256', 104); ref('Appraisal work', 136, 152);
    } else if (magic === 'AOTXAPQ1') {
      result.format = 'Appraisal work'; require(bytes.length >= 12); if (u32(8) !== 1) return result;
      exact(160); require(kind === 11 && u32(12) <= 3); zero(60, 4); zero(152, 8);
      result.fields.State = ['Pending', 'Completed', 'Refused', 'Interrupted'][u32(12)]; result.fields.Status = String(u32(56));
      ref('Configuration', 16, 32); ref('Task', 40); ref('Task descriptor', 128, 144);
      digest('Processor SHA-256', 64); digest('Model SHA-256', 96);
    } else if (magic === 'AOTXAPC1') {
      result.format = 'Appraisal configuration'; require(bytes.length >= 12); if (u32(8) !== 1) return result;
      exact(96); require(kind === 11); zero(72, 24);
      ['Flags', 'Pages', 'Output tokens', 'Ticks', 'Recall floor', 'Priority', 'Work rows'].forEach((key, i) => { result.fields[key] = String(u32(12 + 4 * i)); });
      digest('Processor SHA-256', 40);
    } else if (kind === 3) {
      result.format = 'Appraisal'; require(bytes.length >= 4); const version = u32(0);
      if (![1, 2].includes(version)) return result;
      exact(version === 1 ? 32 : 128); require(u32(24) === 1 && u32(16) <= 4); zero(28, 4);
      ['Benefit', 'Harm', 'Arousal'].forEach((key, i) => { result.fields[key] = scaled(4 + i * 4); });
      result.fields.Confidence = scaled(20); result.fields.Consequence = ['Unknown', '1', '2', '3', '4'][u32(16)];
      if (version === 2) { digest('Processor SHA-256', 32); digest('Model SHA-256', 64); ref('Appraisal work', 96, 112); span('Outcome quote', 120); }
    } else if (kind === 10) {
      result.format = 'Evidence selection'; require(bytes.length >= 16); if (u32(0) !== 1) return result;
      const count = u32(4); require(count <= 64); exact(16 + count * 32); zero(8, 8);
      for (let i = 0; i < count; i++) {
        const at = 16 + i * 32, id = hex(at, 16), representation = u32(at + 24);
        require(!/^0+$/.test(id) && ['1', '2'].includes(String(representation)) && u64(at + 16) !== '0'); zero(at + 28, 4);
        result.references.push({ label: `Evidence ${i + 1}`, id, version: u64(at + 16), representation });
      }
    } else return result;
    result.state = 'known'; return result;
  } catch {
    return { format: result.format, state: 'invalid', fields: {}, references: [], spans: [], error: 'Unsupported or invalid payload layout. Inspect the exact bytes.' };
  }
}
