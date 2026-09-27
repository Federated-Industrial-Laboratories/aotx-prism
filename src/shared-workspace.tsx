// SPDX-License-Identifier: Apache-2.0
// Present persistent scopes, shared conversations and exact request recovery.
import { useState } from 'react';
import { send, useStore } from './store';
import { windows } from './windows';
import { receipt, receiptLabel, type Scope } from '../shared/shared-protocol';
import type { Mutation } from '../shared/shared';
function SavedRequest({ row }: { row: Mutation }) {
  const { state } = useStore(), current = row.result ? receipt(row.result, row.lineage) : undefined;
  const sameIdentity = state.shared.person?.lineage === row.lineage && state.shared.person?.participant === row.actor;
  const sameEndpoint = state.project.endpoint === row.endpoint;
  const watching = state.shared.watching.includes(row.key), canRead = state.shared.connected && sameIdentity && sameEndpoint;
  const final = current && !['accepted', 'queued', 'running'].includes(current.state);
  return <article className="shared-receipt"><header><b>{row.label}</b><span>{current?.state || (row.refusal ? `HTTP ${row.refusal}` : 'Admission unknown')}</span></header>
    <p>{current ? receiptLabel(current) : 'The request is saved locally. Device acceptance is not verified.'}</p>
    {current && <p className={current.save.error ? 'warning' : 'footnote'}>Generation {current.save.generation} / Pending {current.save.pending_bytes} bytes / Save error {current.save.error}</p>}
    <div className="button-row"><button disabled={!canRead || !row.handle || watching} onClick={() => void send({ type: 'sharedRead', key: row.key })}>Read result</button>
      <button disabled={!canRead || watching || !!current?.saved_terminal} onClick={() => void send({ type: 'sharedRetry', key: row.key })}>Retry exact request</button>
      <button disabled={!canRead || !row.handle || !!final || current?.operation !== 5} onClick={() => void send({ type: 'sharedCancel', key: row.key })}>Cancel input</button>
      {!sameEndpoint && <button disabled={!state.shared.connected || !sameIdentity} onClick={() => void send({ type: 'sharedReattach', key: row.key })}>Attach to matching restored runtime</button>}</div>
    <details><summary>Request identity</summary><dl><dt>Sequence</dt><dd>{row.sequence}</dd><dt>Gateway</dt><dd>{row.endpoint}</dd>
      <dt>Participant</dt><dd><code>{row.actor}</code></dd><dt>Lineage</dt><dd><code>{row.lineage}</code></dd><dt>Operation key</dt><dd><code>{row.key}</code></dd>
      <dt>Receipt</dt><dd><code>{row.handle || 'Not received'}</code></dd><dt>Canonical request</dt><dd><pre className="file-preview">{row.body}</pre></dd></dl></details>
  </article>;
}
export function SharedWorkspace() {
  const { state } = useStore(), shared = state.shared, person = shared.person;
  const [name, setName] = useState(''), [scope, setScope] = useState<Scope>('private'), [member, setMember] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['read']), [draft, setDraft] = useState(''), [sending, setSending] = useState(false);
  const [conversationName, setConversationName] = useState(''), [floor, setFloor] = useState('');
  const selected = shared.spaces.items.find(s => s.id === shared.selectedSpace);
  const inputs = shared.records.filter(r => r.lineage === person?.lineage && r.path === `/aotx/v1/shared/conversations/${shared.selectedConversation}/inputs`);
  const label = (id: string) => shared.labels[id] || id;
  async function submit() {
    setSending(true); try { const result = await send({ type: 'sharedSend', text: draft }); if (result) setDraft(''); } finally { setSending(false); }
  }
  return <div className="form-panel shared-workspace"><div className="section-heading"><div><span className="eyebrow">PERSISTENT / CCIR</span><h2>Shared workspace</h2></div>
    <button disabled={!state.connected || shared.connected} onClick={() => void send({ type: 'sharedConnect' })}>Open shared workspace</button></div>
    {!shared.connected ? <p>Connect a gateway with shared grants, then open its persistent workspace. Ordinary conversations use separate local history.</p> : <>
      <dl className="identity-grid"><dt>Participant</dt><dd><code>{person?.participant}</code></dd><dt>Runtime lineage</dt><dd><code>{person?.lineage}</code></dd>
        <dt>Registration</dt><dd>{person?.registered ? 'Registered' : 'Registration required'}</dd><dt>Next sequence / Retry floor</dt><dd>{person?.next_sequence} / {person?.retry_floor}</dd></dl>
      {!person?.registered && <button className="primary" onClick={() => void send({ type: 'sharedRegister' })}>Register participant</button>}
      {person?.registered && <>
        <div className="shared-columns"><section className="framed-section"><h3>Spaces</h3>
          <div className="button-row"><button onClick={() => void send({ type: 'sharedPage', kind: 'spaces', cursor: '0' })}>Refresh spaces</button>
            <button disabled={shared.spaces.next === '0'} onClick={() => void send({ type: 'sharedPage', kind: 'spaces', cursor: shared.spaces.next })}>Next spaces</button></div>
          <div className="shared-list">{shared.spaces.items.map(s => <button key={String(s.id)} className={s.id === shared.selectedSpace ? 'selected' : ''}
            onClick={() => void send({ type: 'sharedSelect', kind: 'space', id: String(s.id) })}><b>{label(String(s.id))}</b><small>{String(s.scope)} / {(s.permissions as string[]).join(', ')}</small></button>)}</div>
          {!shared.spaces.items.length && <p>No spaces on this page.</p>}
          <details><summary>Create a space</summary><label>Space name<input aria-label="Space name" value={name} onChange={e => setName(e.target.value)} maxLength={120} /></label>
            <label>Memory scope<select aria-label="Memory scope" value={scope} onChange={e => setScope(e.target.value as Scope)}><option value="private">Private</option><option value="room">Room</option><option value="instance">Instance</option></select></label>
            <p className="footnote">Scope cannot change. Instance spaces permit registered participants with current shared grants. Names are saved in this project only.</p>
            <button disabled={!name} onClick={() => void send({ type: 'sharedSpace', scope, name })}>Create space</button></details>
        </section><section className="framed-section"><h3>Conversations</h3>
          {!shared.selectedSpace ? <p>Select a space.</p> : <><div className="button-row"><button onClick={() => void send({ type: 'sharedPage', kind: 'conversations', cursor: '0' })}>Refresh conversations</button>
            <button disabled={shared.conversations.next === '0'} onClick={() => void send({ type: 'sharedPage', kind: 'conversations', cursor: shared.conversations.next })}>Next conversations</button></div>
            <div className="shared-list">{shared.conversations.items.map(c => <button key={String(c.id)} className={c.id === shared.selectedConversation ? 'selected' : ''} onClick={() => void send({ type: 'sharedSelect', kind: 'conversation', id: String(c.id) })}>
              <b>{label(String(c.id))}</b><small>{c.busy ? 'Active input' : 'Available'} / Next order {String(c.next_order)}</small></button>)}</div>
            <label>Conversation name<input aria-label="Shared conversation name" value={conversationName} onChange={e => setConversationName(e.target.value)} maxLength={120} /></label>
            <button disabled={!conversationName} onClick={() => void send({ type: 'sharedConversation', name: conversationName })}>Create conversation</button></>}
        </section></div>
        {shared.selectedSpace && <details><summary>Space membership and names</summary><p><code>{shared.selectedSpace}</code> / {String(selected?.scope || '')}</p>
          <label>Space label<input aria-label="Space label" defaultValue={label(shared.selectedSpace)} key={shared.selectedSpace} maxLength={120} onBlur={e => {
            if (e.target.value.trim()) void send({ type: 'sharedLabel', id: shared.selectedSpace, name: e.target.value });
          }} /></label>
          <div className="button-row"><button onClick={() => void send({ type: 'sharedPage', kind: 'members', cursor: '0' })}>Refresh members</button>
            <button disabled={shared.members.next === '0'} onClick={() => void send({ type: 'sharedPage', kind: 'members', cursor: shared.members.next })}>Next members</button></div>
          {shared.members.items.map(m => <p key={String(m.participant)}><code>{String(m.participant)}</code> / {(m.permissions as string[]).join(', ') || 'No rights'}</p>)}
          <label>Member participant ID<input aria-label="Member participant ID" value={member} onChange={e => setMember(e.target.value)} maxLength={32} /></label>
          <div className="button-row">{['read', 'write', 'manage'].map(right => <label className="check-label" key={right}><input type="checkbox" checked={permissions.includes(right)} onChange={e => setPermissions(p => e.target.checked ? [...p, right] : p.filter(v => v !== right))} />{right}</label>)}</div>
          <button disabled={!member} onClick={() => void send({ type: 'sharedMember', participant: member, permissions })}>Set member rights</button>
          <p className="footnote">An empty rights selection blocks access. The runtime checks current grants and manage permission.</p>
        </details>}
        {shared.selectedConversation && <section className="shared-chat"><h3>{label(shared.selectedConversation)}</h3>
          {inputs.map(row => { const body = JSON.parse(row.body), result = row.result ? receipt(row.result, row.lineage) : undefined;
            return <div key={row.key} className="shared-turn"><article className="shared-message"><header>You</header><p>{body.text}</p></article>
              {result && <article className="shared-message"><header>{body.model}</header><p>{new TextDecoder('utf-8', { fatal: true }).decode(result.bytes, { stream: !['completed', 'failed', 'cancelled', 'interrupted'].includes(result.state) || result.next_offset !== result.output_bytes })}</p></article>}
              <SavedRequest row={row} /></div>;
          })}
          <form onSubmit={e => { e.preventDefault(); void submit(); }}><label>Message<textarea aria-label="Shared message" value={draft} onChange={e => setDraft(e.target.value)} disabled={sending} /></label>
            <div className="button-row"><button type="submit" className="primary" disabled={sending || (!draft.trim() && !state.attachments.length) || !shared.saved}>Send shared input</button>
              <button type="button" onClick={() => windows.open('models')}>Model settings</button><button type="button" onClick={() => windows.open('sources')}>Media sources</button></div>
            <p className="footnote">{state.project.model} / {state.project.maxTokens} output tokens / {new TextEncoder().encode(draft).length + state.attachments.length * 73} of 2,048 input bytes</p>
            <p className="footnote">Disconnect does not cancel input. Cancellation cannot undo committed memory.</p></form>
          <h3>Ordered events</h3><div className="button-row"><button onClick={() => void send({ type: 'sharedPage', kind: 'events', cursor: '0' })}>Refresh events</button>
            <button disabled={shared.events.next === '0'} onClick={() => void send({ type: 'sharedPage', kind: 'events', cursor: shared.events.next })}>Next events</button></div>
          {shared.events.gap && <p className="warning">Earlier events are unavailable. Current event floor: {shared.events.floor}.</p>}
          {shared.events.items.map(e => <div className="event-row" key={String(e.id)}><span>{String(e.input_order)} / {String(e.state)} / {e.saved_terminal ? 'Result saved' : 'Result not saved'}</span>
            <button onClick={() => void send({ type: 'sharedInspect', id: String(e.id) })}>Read event {String(e.input_order)}</button></div>)}
          {shared.inspected && <div className="info-box"><p>{receiptLabel(shared.inspected.receipt)}</p><pre className="file-preview">{shared.inspected.text}</pre></div>}
        </section>}
        <h3>Durable state</h3><p>Generation {person.save.generation} / Pending {person.save.pending_bytes} bytes / Save error {person.save.error}</p>
        <button onClick={() => void send({ type: 'sharedSave' })}>Save runtime state</button>
        <details><summary>Receipt capacity</summary><p>Retire only receipts with saved terminal results. Old handles then become unavailable.</p>
          <label>New retry floor<input aria-label="New retry floor" value={floor} onChange={e => setFloor(e.target.value)} /></label>
          <button disabled={!floor} onClick={() => void send({ type: 'sharedRetire', floor })}>Retire saved receipts</button></details>
      </>}
    </>}
    {shared.error && <p className="warning" role="alert">{shared.error}</p>}
    {!shared.saved && <p className="warning">The shared journal could not be saved. Reopen this project before new requests.</p>}
    <details><summary>Saved shared requests ({shared.records.length})</summary>
      <p className="footnote">These are local records. Reconnect and read a receipt to check current access and save state. The local limit is 256 requests per project.</p>
      {[...shared.records].reverse().map(row => <SavedRequest key={row.key} row={row} />)}</details>
  </div>;
}
