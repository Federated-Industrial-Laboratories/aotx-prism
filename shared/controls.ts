// SPDX-License-Identifier: Apache-2.0
// Bind explicit steering to an advertised model, qualification and discrete dose.
import { object, text, number } from './validate.js';
import { hex } from './shared-protocol.js';
import type { Capabilities } from './types.js';
export interface Control {
  schema: string; name: string; available: boolean; kind: string; positions: string;
  hook: number; layers: number[]; dose_scale: number; accepted_doses: number[];
  combinations: boolean; qualification_sha256: string | null;
}
export interface ControlChoice { model: string; sha256: string; name: string; qualification: string; dose: number }
export function control(value: unknown): Control {
  const r = object(value);
  if (typeof r.available !== 'boolean' || !Array.isArray(r.accepted_doses) || r.accepted_doses.length > 16 ||
      !Array.isArray(r.layers) || r.layers.length > 64 || typeof r.combinations !== 'boolean') throw Error('Invalid control capability.');
  const doses = r.accepted_doses.map(v => number(v, -40000, 40000));
  const layers = r.layers.map(v => number(v, 0, 63));
  if (doses.some(v => !Number.isInteger(v) || !v) || new Set(doses).size !== doses.length ||
      layers.some(v => !Number.isInteger(v)) || new Set(layers).size !== layers.length) throw Error('Invalid control values.');
  const schema = text(r.schema, 128), kind = text(r.kind, 128), positions = text(r.positions, 32);
  const qualification = r.qualification_sha256 === null ? null : hex(r.qualification_sha256, 32);
  const supported = schema === 'aotx.control.v1' && kind === 'residual_vector' &&
    ['response', 'all'].includes(positions) && r.hook === 1 && r.dose_scale === 10000 && !r.combinations;
  return { schema, kind, name: text(r.name, 128), positions, hook: number(r.hook, 0, 0xffffffff), layers,
    dose_scale: number(r.dose_scale, 1, 0xffffffff), accepted_doses: doses, combinations: r.combinations,
    available: r.available && supported && !!qualification && !/^0+$/.test(qualification) && doses.length > 0 && layers.length > 0,
    qualification_sha256: qualification };
}
export function choice(value: unknown): ControlChoice {
  const r = object(value), dose = number(r.dose, -40000, 40000);
  if (!Number.isInteger(dose) || !dose) throw Error('Select an accepted control dose.');
  return { model: text(r.model, 256), sha256: hex(r.sha256, 32), name: text(r.name, 128), qualification: hex(r.qualification, 32), dose };
}
export function selection(value: ControlChoice | undefined, caps: Capabilities | undefined, model: string) {
  if (!value) return undefined;
  const m = caps?.models.find(m => m.id === model && m.sha256 === value.sha256);
  const c = m?.controls.find(c => c.name === value.name && c.available && c.qualification_sha256 === value.qualification);
  if (!caps?.features.control_selection || value.model !== model || !c?.accepted_doses.includes(value.dose))
    throw Error('The selected control is unavailable for this exact model. Select it again after connecting.');
  return { schema: 'aotx.control.selection.v1', kind: 'residual_vector', qualification_sha256: value.qualification, dose: value.dose };
}
