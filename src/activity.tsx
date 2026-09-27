// SPDX-License-Identifier: Apache-2.0
// Show readable request events and reported background activity.
import { useEffect, useState } from 'react';
import { send, useStore } from './store';

export function Activity({ visible = true }: { visible?: boolean }) {
  const { state } = useStore(), [observing, setObserving] = useState(true);
  const e = state.evidence, policy = e.policy, shared = state.shared;
  useEffect(() => {
    if (!visible || !state.connected || !observing) return;
    let stopped = false, busy = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      clearTimeout(timer); if (stopped || document.hidden || busy) return;
      busy = true; await send({ type: 'activityRead' }); busy = false;
      if (!stopped && !document.hidden) timer = setTimeout(poll, 2500);
    };
    const visibility = () => { clearTimeout(timer); if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', visibility); void poll();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [visible, state.connected, shared.selectedConversation, observing]);
  return <div className="form-panel"><span className="eyebrow">RUNTIME / ACTIVITY</span><h2>Runtime activity</h2>
    <p>Reported background processing, conversation events and saved work.</p>
    {e.reading && <p role="status">Refreshing reported state.</p>}
    <div className="button-row"><button disabled={!state.connected} onClick={() => void send({ type: 'activityRead' })}>Refresh activity</button>
      <label className="check-field"><input type="checkbox" checked={observing} onChange={event => setObserving(event.target.checked)} />Observe while this panel is visible</label></div>
    <div className="activity-tiles">
      <section className="activity-tile"><h3>Gateway</h3><p>{state.connected ? 'Connected' : 'Disconnected'}</p></section>
      <section className="activity-tile"><h3>Background policy</h3><p>{policy?.state || 'Unavailable'}</p><small>{policy?.reason || e.policyError}</small></section>
      <section className="activity-tile"><h3>Completed work</h3><p>{policy?.counters.completed || 'Unavailable'}</p><small>{policy ? `${policy.pending} pending / ${policy.active_rows} active rows` : 'Read policy state to inspect work.'}</small></section>
    </div>
    {policy && <><dl><dt>Task reviews</dt><dd>{policy.review_enabled ? 'Enabled' : 'Disabled'}</dd><dt>Interrupted</dt><dd>{policy.counters.interrupted}</dd>
      <dt>Refused</dt><dd>{policy.counters.refused}</dd><dt>Saved generation</dt><dd>{policy.counters.saved_generation}</dd></dl>
      <details><summary>Policy controls and counters</summary><p>Actions require policy management permission. Each action uses the displayed epoch and revision.</p>
        <div className="button-row">{(['pause', 'resume', 'stop', 'review_on', 'review_off'] as const).map(action => <button key={action} disabled={e.reading || policy.abi < 3 || e.policyDenied || !state.connected}
          onClick={() => void send({ type: 'policyAction', action, epoch: policy.epoch, revision: policy.control_revision })}>{({ pause: 'Pause background work', resume: 'Resume background work', stop: 'Stop background work', review_on: 'Enable task reviews', review_off: 'Disable task reviews' })[action]}</button>)}</div>
        <dl><dt>Epoch</dt><dd>{policy.epoch}</dd><dt>Revision</dt><dd>{policy.control_revision}</dd><dt>Device status</dt><dd>{policy.status}</dd>
          {Object.entries(policy.counters).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl></details></>}
    {e.policyError && <p className="warning">{e.policyError}</p>}
    {e.policyDenied && <p className="footnote">This connection has no policy management permission.</p>}
    <h3>Conversation events</h3><p className="footnote">Up to 64 events per page. Refresh keeps this page. Select the next page for later events.</p>
    <div className="button-row"><button disabled={!shared.connected || !shared.selectedConversation || e.reading} onClick={() => void send({ type: 'activityPage', cursor: '0' })}>First event page</button>
      <button disabled={!shared.connected || e.reading || e.events.next === '0'} onClick={() => void send({ type: 'activityPage', cursor: e.events.next })}>Next event page</button></div>
    {e.eventError && <p className="warning">{e.eventError}</p>}{e.events.gap && <p className="warning">The event page has a gap. Earlier events are unavailable.</p>}
    <div className="activity-events">{e.events.items.length ? e.events.items.map(row => <article key={String(row.id)}><b>Input {String(row.input_order)} / {String(row.state)}</b>
      <span>{String(row.output_bytes)} output bytes / {row.saved_terminal ? 'Result saved' : 'Result not yet saved'}</span><code>{String(row.id)}</code>
      <button disabled={!shared.connected} onClick={() => void send({ type: 'sharedInspect', id: String(row.id) })}>Read event result</button></article>) : <p>No conversation events in the selected page.</p>}</div>
    {shared.inspected && <blockquote className="source-quote">{shared.inspected.text || 'This operation has no text output.'}</blockquote>}
    <p className="footnote">Close or hide this panel to stop observation.</p>
  </div>;
}
