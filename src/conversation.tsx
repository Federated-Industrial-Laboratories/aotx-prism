// SPDX-License-Identifier: Apache-2.0
// Present exact saved replies and keep uncertain requests distinct from completed work.
import { useEffect, useRef, useState } from 'react';
import { useStore, send } from './store';
import { windows } from './windows';
const drafts = new Map<string, string>();
export function Conversation() {
  const { state } = useStore(), conversation = state.project.conversations.find(c => c.id === state.selected);
  const [draft, setDraft] = useState(drafts.get(state.selected) || ''), end = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(drafts.get(state.selected) || ''); }, [state.selected]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [conversation?.turns.at(-1)?.reply.length]);
  const pending = conversation?.turns.some(t => !['completed', 'failed', 'cancelled', 'expired'].includes(t.phase));
  async function submit() {
    if (!conversation || !draft.trim()) return;
    const text = draft, id = conversation.id;
    const result = await send({ type: 'send', id, text });
    if (result) { drafts.delete(id); setDraft(''); }
  }
  return <div className="conversation-view">
    <div className="conversation-heading"><div><span className="eyebrow">ORDINARY CONVERSATION</span>
      <h1>{conversation?.title || 'A clear place to begin'}</h1></div>
      <button className="subtle" onClick={() => windows.open('models')}>{state.project.model || 'Select model'}</button></div>
    <div className="messages" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions">
      {!conversation?.turns.length && <div className="welcome">
        <img src="/prism.svg" alt="" /><p className="eyebrow">PROJECT / RUNTIME / SESSION</p>
        <h2>Your workspace, connected.</h2>
        <p>Open a project folder. Connect to AOTX. Start a conversation with an available model.</p>
        <div className="steps"><button onClick={() => windows.open('project')}><b>01</b> Open project</button>
          <button onClick={() => windows.open('connection')}><b>02</b> Connect gateway</button>
          <button onClick={() => void send({ type: 'newConversation', title: `Conversation ${state.project.conversations.length + 1}` })}><b>03</b> New conversation</button></div>
        <p className="footnote">History stays in your project folder. These conversations do not update CCIR memory.</p>
      </div>}
      {conversation?.turns.map(turn => <article className="turn" key={turn.id} data-turn={turn.id}>
        <div className="message user-message"><span className="eyebrow">YOU</span><pre>{turn.prompt}</pre></div>
        <div className="message assistant-message"><div className="message-head"><span className="eyebrow">{turn.model}</span>
          <span className={`phase phase-${turn.phase}`}>{turn.phase}</span></div>
          <pre>{turn.reply || (turn.phase === 'submitting' ? 'Submitting request...' : turn.phase === 'accepted' || turn.phase === 'running' ? 'Waiting for output...' : 'No output received.')}</pre>
          {turn.error && <p className="warning">{turn.error}</p>}
          {turn.cancelRequested && turn.phase !== 'cancelled' && <p className="footnote">Cancellation was requested. The displayed state is the last device result.</p>}
          <div className="button-row">
            {turn.handle && !['completed', 'failed', 'cancelled', 'expired'].includes(turn.phase) && <>
              <button disabled={!state.connected || state.busy} onClick={() => void send({ type: 'resume', id: turn.id })}>Read result</button>
              <button disabled={!state.connected || turn.cancelRequested} onClick={() => void send({ type: 'cancel', id: turn.id })}>Cancel request</button></>}
            <button className="subtle" onClick={() => windows.open('inspector')}>Request details</button></div></div>
      </article>)}<div ref={end} />
    </div>
    <form className="composer" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <textarea aria-label="Message" placeholder={conversation ? 'Write a message...' : 'Create a conversation to begin.'}
        disabled={!conversation} value={draft} maxLength={65536}
        onChange={e => { drafts.set(state.selected, e.target.value); setDraft(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); if (!state.busy && !pending && state.connected) void submit(); } }} />
      <div className="composer-bottom"><span>{state.connected ? 'Text conversation' : 'Connect a gateway to send'} <span className="muted">/ Ctrl+Enter</span></span>
        <button className="primary" type="submit" disabled={!state.connected || state.busy || !draft.trim() || !conversation || pending || !state.saved}>Send message</button></div>
    </form>
  </div>;
}
