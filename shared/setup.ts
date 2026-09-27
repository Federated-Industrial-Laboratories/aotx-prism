// SPDX-License-Identifier: Apache-2.0
// Define local runtime profiles and bounded setup commands.
import { object, text, number } from './validate.js';
export interface RuntimeProfile {
  name: string; build: string; gateway: string; python: string; models: string;
  modules: string; folder: string; gpu: string; role: 'language' | 'language-q4' | 'language-audio';
  ccir?: string; participant?: string; policyManage?: boolean;
}
export interface RuntimeState {
  phase: 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed';
  folder: string; url: string; logs: string; error: string; profile?: RuntimeProfile;
  durability?: string;
}
export interface Gpu { uuid: string; name: string; freeMiB: number; totalMiB: number }
export interface RuntimeInspection { version: string; models: string; gpus: Gpu[] }
export interface LocalCatalog { schema: 1; recent: string[]; runtimes: RuntimeProfile[]; participants?: { id: string; name: string }[] }
export type SetupCommand =
  | { type: 'runtimeInspect' | 'runtimeSave' | 'runtimeStart'; profile: RuntimeProfile }
  | { type: 'runtimeStop' | 'runtimeConnect' | 'runtimeDevices' }
  | { type: 'runtimeRemove'; name: string }
  | { type: 'choosePath'; kind: 'directory' | 'file' }
  | { type: 'renameConversation'; id: string; title: string }
  | { type: 'archiveConversation'; id: string; archived: boolean }
  | { type: 'saveProfile'; name: string }
  | { type: 'applyProfile' | 'removeProfile'; name: string }
  | { type: 'exportProject' };
export function runtimeProfile(value: unknown): RuntimeProfile {
  const p = object(value);
  const path = (key: string) => {
    const result = text(p[key], 2048);
    if (!result.startsWith('/') || /[\r\n]/.test(result)) throw Error('Use an absolute local path.');
    return result;
  };
  const role = text(p.role, 32);
  if (!['language', 'language-q4', 'language-audio'].includes(role)) throw Error('Select an inference role.');
  const gpu = text(p.gpu, 80);
  if (!/^GPU-[a-fA-F0-9-]{36}$/.test(gpu)) throw Error('Select a GPU UUID from the device list.');
  if (p.policyManage !== undefined && typeof p.policyManage !== 'boolean') throw Error('Invalid policy permission.');
  const ccir = p.ccir !== undefined ? path('ccir') : undefined;
  const participant = ccir ? text(p.participant, 32) : undefined;
  if (participant && (!/^[0-9a-f]{32}$/.test(participant) || /^0+$/.test(participant))) throw Error('Select a local participant.');
  return { name: text(p.name, 80), build: path('build'), gateway: path('gateway'), python: path('python'),
    models: ccir ? text(p.models, 2048, true) : path('models'), modules: ccir ? text(p.modules, 2048, true) : path('modules'),
    folder: path('folder'), gpu, ...(p.policyManage === undefined ? {} : { policyManage: p.policyManage as boolean }), role: role as RuntimeProfile['role'], ...(ccir ? { ccir, participant } : {}) };
}
export function setupCommand(row: Record<string, unknown>): SetupCommand | undefined {
  switch (row.type) {
    case 'runtimeInspect': case 'runtimeSave': case 'runtimeStart': return { type: row.type, profile: runtimeProfile(row.profile) };
    case 'runtimeStop': case 'runtimeConnect': case 'runtimeDevices': case 'exportProject': return { type: row.type };
    case 'runtimeRemove': case 'applyProfile': case 'removeProfile': case 'saveProfile': return { type: row.type, name: text(row.name, 80) };
    case 'choosePath': if (row.kind !== 'directory' && row.kind !== 'file') throw Error('Invalid path type.'); return { type: row.type, kind: row.kind };
    case 'renameConversation': return { type: row.type, id: text(row.id, 36), title: text(row.title, 120) };
    case 'archiveConversation': if (typeof row.archived !== 'boolean') throw Error('Invalid archive state.'); return { type: row.type, id: text(row.id, 36), archived: row.archived };
  }
}
export function gpuRows(output: string): Gpu[] {
  return output.trim().split('\n').filter(Boolean).slice(0, 64).map(line => {
    const [uuid, name, free, total] = line.split(',').map(s => s.trim());
    if (!/^GPU-[a-fA-F0-9-]{36}$/.test(uuid)) throw Error('Invalid GPU identity.');
    return { uuid, name: text(name, 256), freeMiB: number(Number(free), 0, 1048576), totalMiB: number(Number(total), 1, 1048576) };
  });
}

export function runtimeActions(profile: RuntimeProfile): string[] {
  return ['infer', 'upload', 'telemetry', ...(profile.ccir ? ['shared_read', 'shared_write', 'shared_manage'] : []),
    ...(profile.policyManage ? ['policy_manage'] : [])];
}
