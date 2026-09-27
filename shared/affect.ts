// SPDX-License-Identifier: Apache-2.0
// Validate exact runtime affect settings and bounded operator commands.
import { object, number } from './validate.js';
import { decimal } from './shared-protocol.js';
export const affectKeys = ['affect.on', 'quality.on', 'affect.probe_gain', 'affect.decay_fast', 'affect.decay_slow',
  'affect.gain_fast', 'affect.gain_slow', 'affect.cap_valence', 'affect.cap_arousal', 'affect.temperature_gain',
  'affect.voice_gain', 'affect.steer_gain', 'affect.budget'] as const;
export interface AffectSetting { key: string; value: number; minimum: number; maximum: number; scale: number }
export interface AffectSettings { epoch: string; revision: string; writable: boolean; pending: number; settings: AffectSetting[] }
export interface AffectSettingsState { reading: boolean; value?: AffectSettings; error: string; denied: boolean }
export type AffectCommand = { type: 'affectRead' } |
  { type: 'affectSet'; epoch: string; revision: string; key: string; value: number; scale: number };
const integer = (v: unknown, low: number, high: number) => {
  const n = number(v, low, high); if (!Number.isInteger(n)) throw Error('Use an exact scaled integer.'); return n;
};
export function affectCommand(r: Record<string, unknown>): AffectCommand | undefined {
  if (r.type === 'affectRead') return { type: r.type };
  if (r.type !== 'affectSet') return;
  if (!affectKeys.includes(r.key as typeof affectKeys[number])) throw Error('Invalid affect setting.');
  if (r.scale !== 1 && r.scale !== 10000) throw Error('Invalid affect scale.');
  return { type: r.type, epoch: decimal(r.epoch), revision: decimal(r.revision), key: r.key as string,
    value: integer(r.value, -10000, 40000), scale: r.scale };
}
export function affectSettings(value: unknown): AffectSettings {
  const r = object(value), paths = object(r.paths);
  if (r.schema !== 'aotx.affect.settings.v1' || r.scope !== 'runtime' || r.effect !== 'next_sequence' ||
      paths.native !== true || paths.shared !== true || paths.ordinary_http !== false || typeof r.writable !== 'boolean' ||
      !Array.isArray(r.settings) || r.settings.length !== affectKeys.length) throw Error('Unsupported affect settings response.');
  const settings = r.settings.map((value, i) => {
    const v = object(value);
    if (v.key !== affectKeys[i] || (v.scale !== 1 && v.scale !== 10000)) throw Error('Invalid affect setting row.');
    const low = integer(v.minimum, -10000, 40000), high = integer(v.maximum, low, 40000);
    return { key: affectKeys[i], value: integer(v.value, low, high), minimum: low, maximum: high, scale: v.scale };
  });
  const epoch = decimal(r.epoch); if (epoch === '0') throw Error('Invalid runtime epoch.');
  return { epoch, revision: decimal(r.revision), writable: r.writable, pending: integer(r.pending_local, 0, 64), settings };
}
