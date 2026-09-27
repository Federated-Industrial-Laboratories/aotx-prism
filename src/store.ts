// SPDX-License-Identifier: Apache-2.0
// Keep immutable desktop snapshots and command errors available to every panel.
import { useSyncExternalStore } from 'react';
import type { State, Command, Reply } from '../shared/types';
let state: State | undefined, error = '', revision = 0;
const listeners = new Set<() => void>();
function notify() { revision++; for (const listener of listeners) listener(); }
function receive(next: State) { state = next; notify(); }
export async function initialize(): Promise<void> {
  if (!window.prism) throw Error('Open this interface in the AOTX-PRISM desktop application.');
  window.prism.subscribe(receive);
  receive((await window.prism.command({ type: 'state' })).state);
}
export async function send(cmd: Command): Promise<Reply | undefined> {
  try { const reply = await window.prism!.command(cmd); receive(reply.state); error = ''; notify(); return reply; }
  catch (failure) { error = failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'The command failed.'; notify(); }
}
export function useStore() {
  useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
  return { state: state!, error, clear: () => { error = ''; notify(); } };
}
export function snapshot(): State { return state!; }
