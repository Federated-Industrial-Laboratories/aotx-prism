// SPDX-License-Identifier: Apache-2.0
// Show readable request activity and an optional bounded visual field.
import { useEffect, useRef, useState } from 'react';
import { send, useStore } from './store';

function Rain({ active, symbols }: { active: boolean; symbols: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current!, context = element.getContext('2d'); if (!context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)'); let frame = 0, last = 0, step = 0;
    function draw(now: number) {
      if (!document.hidden && now - last > 90) {
        last = now; const w = Math.min(1600, element.clientWidth), h = Math.min(800, element.clientHeight);
        if (element.width !== w) element.width = w; if (element.height !== h) element.height = h;
        context!.fillStyle = '#111b23'; context!.fillRect(0, 0, w, h); context!.font = '12px monospace';
        for (let col = 0; col < Math.floor(w / 18); col++) for (let row = 0; row < 10; row++) {
          context!.fillStyle = `rgba(173,195,212,${(10 - row) / (active ? 14 : 35)})`;
          context!.fillText(symbols.charAt((col + row + step) % symbols.length), col * 18 + 7, ((col * 31 + step * 4 - row * 18) % h + h) % h);
        } if (active) step++;
      }
      if (!document.hidden && !motion.matches && active) frame = requestAnimationFrame(draw);
    }
    function restart() { cancelAnimationFrame(frame); draw(performance.now() + 100); }
    const resize = new ResizeObserver(restart); resize.observe(element);
    motion.addEventListener('change', restart); document.addEventListener('visibilitychange', restart); restart();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); motion.removeEventListener('change', restart); document.removeEventListener('visibilitychange', restart); };
  }, [active, symbols]);
  return <canvas ref={canvas} className="rain" aria-hidden="true" />;
}

let showVisual = false;
export function Activity({ visible = true }: { visible?: boolean }) {
  const { state } = useStore(), [visual, setVisual] = useState(showVisual), [observing, setObserving] = useState(true);
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
  const active = state.connected && (state.busy || shared.watching.length > 0 || policy?.state === 'active' || policy?.state === 'recording');
  const symbols = [policy?.counters.completed, policy?.counters.decision, ...shared.events.items.map(row => row.id)].filter(Boolean).join('') || '0';
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
    <h3>Conversation events</h3>{shared.events.gap && <p className="warning">The event page has a gap. Earlier events are unavailable.</p>}
    <div className="activity-events">{shared.events.items.length ? shared.events.items.map(row => <article key={String(row.id)}><b>Input {String(row.input_order)} / {String(row.state)}</b>
      <span>{String(row.output_bytes)} output bytes / {row.saved_terminal ? 'Result saved' : 'Result not yet saved'}</span><code>{String(row.id)}</code>
      <button disabled={!shared.connected} onClick={() => void send({ type: 'sharedInspect', id: String(row.id) })}>Read event result</button></article>) : <p>No conversation events in the selected page.</p>}</div>
    {shared.inspected && <blockquote className="source-quote">{shared.inspected.text || 'This operation has no text output.'}</blockquote>}
    {e.affect && <details><summary>Reported affect state</summary><p>Affect is {e.affect.enabled ? 'enabled' : 'disabled'}. These are runtime values.</p>
      <dl><dt>Fast valence / arousal</dt><dd>{e.affect.fast.slice(0, 2).join(' / ')} (Q15)</dd><dt>Slow valence / arousal</dt><dd>{e.affect.slow.slice(0, 2).join(' / ')} (Q15)</dd>
        <dt>Probe availability</dt><dd>{e.affect.probes.join(' / ')}</dd><dt>Revision</dt><dd>{e.affect.revision}</dd><dt>Model SHA-256</dt><dd><code>{e.affect.model || 'Unavailable'}</code></dd></dl></details>}
    {e.affectError && <p className="footnote">Affect read: {e.affectError}</p>}
    <button aria-expanded={visual} onClick={() => { showVisual = !visual; setVisual(showVisual); }}>{visual ? 'Hide visualization' : 'Show visualization'}</button>
    {visual && visible && <section className="visualisation-panel" aria-label="Runtime visualization"><div className="message-head"><strong>Runtime visualization</strong><span>{active ? 'Reported work active' : 'Quiet'}</span></div>
      <Rain active={active && observing} symbols={symbols} /><p className="footnote">The field uses reported counters and event identifiers. Read the tiles for exact state.</p></section>}
    <p className="footnote">The visualization generates no model requests. Close or hide this panel to stop observation.</p>
  </div>;
}
