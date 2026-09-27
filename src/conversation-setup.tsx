// SPDX-License-Identifier: Apache-2.0
// Create conversations with explicit instructions before the first input.
import { useEffect, useState } from 'react';
import { DEFAULT_PROMPT, PROMPT_BYTES } from '../shared/conversation';
import { send, useStore } from './store';
import { windows } from './windows';
export function ConversationSetup({ initialKind = 'ordinary' }: { initialKind?: 'ordinary' | 'shared' }) {
  const { state } = useStore();
  const [kind, setKind] = useState<'ordinary' | 'shared'>(initialKind);
  useEffect(() => setKind(initialKind), [initialKind]);
  const [name, setName] = useState(`Conversation ${state.project.conversations.length + 1}`);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT), [creating, setCreating] = useState(false);
  const limit = kind === 'shared' ? state.shared.promptBytes : PROMPT_BYTES;
  const available = kind === 'ordinary' || (state.shared.connected && !!state.shared.selectedSpace && !!limit);
  const bytes = new TextEncoder().encode(prompt).length;
  async function create() {
    setCreating(true);
    try {
      const reply = await send(kind === 'ordinary' ? { type: 'newConversation', title: name, systemPrompt: prompt } : { type: 'sharedConversation', name, systemPrompt: prompt });
      if (reply) { windows.close('setup'); windows.open(kind === 'ordinary' ? 'conversation' : 'shared', false); }
    } finally { setCreating(false); }
  }
  return <div className="form-panel"><span className="eyebrow">CONVERSATION / SETUP</span><h2>New conversation</h2>
    <p>Set instructions before the first message. Existing conversations keep their instructions.</p>
    <form onSubmit={event => { event.preventDefault(); void create(); }}>
      <label>Conversation type<select aria-label="Conversation type" value={kind} disabled={creating} onChange={event => setKind(event.target.value as 'ordinary' | 'shared')}>
        <option value="ordinary">Ordinary / local history</option><option value="shared">CCIR / persistent memory</option></select></label>
      {kind === 'shared' && <p className={available ? 'footnote' : 'warning'}>{available ? `Space: ${state.shared.labels[state.shared.selectedSpace] || state.shared.selectedSpace}` :
        'Open the shared workspace and select a space on a runtime with conversation prompt support.'}</p>}
      <label>Conversation name<input aria-label="New conversation name" value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={creating} /></label>
      <label>System prompt<textarea aria-label="System prompt" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={creating} rows={7} /></label>
      <p className={bytes > limit ? 'warning' : 'footnote'}>{bytes.toLocaleString()} / {limit.toLocaleString()} UTF-8 bytes. A blank field adds no identity instructions.</p>
      <div className="button-row"><button type="button" disabled={creating} onClick={() => setPrompt(DEFAULT_PROMPT)}>Use neutral default</button>
        <button type="submit" className="primary" disabled={creating || !available || !name.trim() || bytes > limit}>Create conversation</button></div>
    </form><h3>Generation settings</h3><p>{state.project.model || 'No model selected'} / {state.project.maxTokens} output tokens / Temperature {state.project.temperature}</p>
    <button onClick={() => windows.open('models')}>Model settings</button>
    <p className="footnote">Ordinary history is saved in this project. CCIR instructions are saved by the runtime and remain fixed for the conversation.</p>
  </div>;
}
