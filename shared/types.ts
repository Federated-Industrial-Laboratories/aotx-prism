// SPDX-License-Identifier: Apache-2.0
// Define the project data and the bounded desktop commands exposed to views.
export type Phase = 'submitting' | 'accepted' | 'running' | 'completed' | 'failed' |
  'cancelled' | 'unknown' | 'interrupted' | 'expired';
export interface Turn {
  id: string; prompt: string; model: string; endpoint: string; phase: Phase;
  handle?: string; epoch?: string; bytes: string; cursor: number; reply: string;
  error: string; created: string; cancelRequested: boolean;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
export interface Conversation { id: string; title: string; turns: Turn[] }
export interface Project {
  schema: 1; name: string; endpoint: string; model: string;
  maxTokens: number; temperature: number; conversations: Conversation[];
}
export interface Model {
  id: string; sha256: string; input: string[]; automatic_memory: boolean;
  controls: { name: string; available: boolean; accepted_doses: number[] }[];
}
export interface Capabilities {
  epoch: string; models: Model[]; outputTokens: number; outputBytes: number;
  promptBytes: number; features: Record<string, boolean>;
}
export interface FileEntry { name: string; kind: 'file' | 'directory'; bytes: number }
export interface State {
  version: string; project: Project; folder: string; selected: string;
  connected: boolean; capabilities?: Capabilities; busy: boolean;
  notice: string; saved: boolean; layout: string | null; theme: 'silver' | 'graphite';
}
export type Command =
  | { type: 'state' } | { type: 'chooseFolder' }
  | { type: 'openProject'; path: string }
  | { type: 'connect'; url: string; token: string } | { type: 'disconnect' }
  | { type: 'newConversation'; title: string } | { type: 'select'; id: string }
  | { type: 'profile'; model: string; maxTokens: number; temperature: number }
  | { type: 'send'; id: string; text: string }
  | { type: 'cancel' | 'resume'; id: string }
  | { type: 'files' } | { type: 'readFile'; name: string }
  | { type: 'layout'; value: string } | { type: 'theme'; value: 'silver' | 'graphite' };
export interface Reply { state: State; folder?: string; files?: FileEntry[]; text?: string }
export interface Bridge {
  command(command: Command): Promise<Reply>;
  subscribe(listener: (state: State) => void): () => void;
}
declare global { interface Window { prism?: Bridge } }
