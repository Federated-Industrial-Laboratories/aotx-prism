// SPDX-License-Identifier: Apache-2.0
// Define the project data and the bounded desktop commands exposed to views.
export type Phase = 'submitting' | 'accepted' | 'running' | 'completed' | 'failed' |
  'cancelled' | 'unknown' | 'interrupted' | 'expired';
import type { SetupCommand, RuntimeState, RuntimeInspection, LocalCatalog, Gpu } from './setup.js';
import type { SharedCommand, SharedState } from './shared.js';
import type { CcirCommand, CcirState } from './ccir.js';
export interface Media { id: string; name: string; modality: 'image' | 'audio'; sha256: string; bytes: number; endpoint: string; epoch: string; phase?: number; status?: number }
export interface GenerationProfile { name: string; model: string; sha256: string; maxTokens: number; temperature: number }
export interface Turn {
  id: string; prompt: string; model: string; endpoint: string; phase: Phase;
  handle?: string; epoch?: string; bytes: string; cursor: number; reply: string;
  error: string; created: string; cancelRequested: boolean;
  media?: Media[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
export interface Conversation { id: string; title: string; turns: Turn[]; archived?: boolean }
export interface Project {
  schema: 2; name: string; endpoint: string; model: string; profiles: GenerationProfile[];
  maxTokens: number; temperature: number; conversations: Conversation[];
}
export interface Model {
  id: string; sha256: string; input: string[]; automatic_memory: boolean;
  controls: { name: string; available: boolean; accepted_doses: number[] }[];
}
export interface Capabilities {
  epoch: string; models: Model[]; outputTokens: number; outputBytes: number;
  promptBytes: number; uploadBytes: number; features: Record<string, boolean>;
}
export interface FileEntry { name: string; kind: 'file' | 'directory'; bytes: number }
export interface State {
  version: string; project: Project; folder: string; selected: string;
  connected: boolean; capabilities?: Capabilities; busy: boolean;
  notice: string; saved: boolean; layout: string | null; theme: 'silver' | 'graphite';
  catalog: LocalCatalog; runtime: RuntimeState; attachments: Media[]; uploading: boolean;
  shared: SharedState;
  ccir: CcirState;
}
export type Command = SetupCommand | SharedCommand | CcirCommand
  | { type: 'state' } | { type: 'chooseFolder' }
  | { type: 'openProject'; path: string }
  | { type: 'connect'; url: string; token: string } | { type: 'disconnect' }
  | { type: 'newConversation'; title: string } | { type: 'select'; id: string }
  | { type: 'profile'; model: string; maxTokens: number; temperature: number }
  | { type: 'send'; id: string; text: string }
  | { type: 'cancel' | 'resume'; id: string }
  | { type: 'files'; path?: string } | { type: 'readFile'; name: string }
  | { type: 'uploadMedia' | 'listMedia' } | { type: 'removeAttachment' | 'deleteMedia'; id: string }
  | { type: 'layout'; value: string } | { type: 'theme'; value: 'silver' | 'graphite' };
export interface Reply { state: State; folder?: string; files?: FileEntry[]; text?: string; inspection?: RuntimeInspection; media?: Media[]; gpus?: Gpu[] }
export interface Bridge {
  command(command: Command): Promise<Reply>;
  subscribe(listener: (state: State) => void): () => void;
}
declare global { interface Window { prism?: Bridge } }
