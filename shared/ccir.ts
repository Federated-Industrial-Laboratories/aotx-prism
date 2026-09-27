// SPDX-License-Identifier: Apache-2.0
// Define complete runtime file actions and their observed local progress.
import { text } from './validate.js';
import { runtimeProfile, type RuntimeProfile } from './setup.js';
import { hex } from './shared-protocol.js';
export interface CcirPlan { profile: RuntimeProfile; output: string; phrases: string; settings: string }
export interface CcirInspection { path: string; bytes: number; lineage: string; generation: string; roles: string[]; features: number; slots: number; architecture: number; assets: string[]; detail: string }
export interface CcirEstimate { bytes: number; free: number; files: number; models: string }
export interface CcirState { phase: 'idle' | 'working' | 'complete' | 'failed'; action: string; error: string; logs: string; inspection?: CcirInspection; estimate?: CcirEstimate }
export type CcirCommand =
  | { type: 'ccirEstimate'; plan: CcirPlan } | { type: 'ccirCreate'; plan: CcirPlan }
  | { type: 'ccirInspect'; build: string; path: string }
  | { type: 'ccirCopy'; build: string; path: string; output: string }
  | { type: 'ccirCancel' }
  | { type: 'participantCreate'; name: string; id?: string };
export function localPath(value: unknown, empty = false) {
  const result = text(value, 2048, empty);
  if ((!empty || result) && (!result.startsWith('/') || /[\r\n]/.test(result))) throw Error('Use an absolute local path.');
  return result;
}
export function ccirCommand(row: Record<string, unknown>): CcirCommand | undefined {
  switch (row.type) {
    case 'ccirEstimate': case 'ccirCreate': {
      const p = row.plan as CcirPlan;
      if (!p || typeof p !== 'object') throw Error('Invalid runtime file plan.');
      return { type: row.type, plan: { profile: runtimeProfile(p.profile), output: localPath(p.output), phrases: localPath(p.phrases, true), settings: localPath(p.settings, true) } };
    }
    case 'ccirInspect': return { type: row.type, build: localPath(row.build), path: localPath(row.path) };
    case 'ccirCopy': return { type: row.type, build: localPath(row.build), path: localPath(row.path), output: localPath(row.output) };
    case 'ccirCancel': return { type: row.type };
    case 'participantCreate': {
      const id = row.id === undefined || row.id === '' ? undefined : hex(row.id);
      if (id && /^0+$/.test(id)) throw Error('Use a nonzero participant ID.');
      return { type: row.type, name: text(row.name, 80), ...(id ? { id } : {}) };
    }
  }
}
