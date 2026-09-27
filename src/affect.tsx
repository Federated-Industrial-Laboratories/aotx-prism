// SPDX-License-Identifier: Apache-2.0
// Present qualified controls and separately granted runtime affect settings.
import { useEffect, useState } from 'react';
import { Controls } from './controls';
import { send, useStore } from './store';
const labels: Record<string, string> = {
  'affect.on': 'Affect enabled', 'quality.on': 'Quality measurements enabled', 'affect.probe_gain': 'Probe contribution',
  'affect.decay_fast': 'Fast state retention', 'affect.decay_slow': 'Slow state retention',
  'affect.gain_fast': 'Fast response gain', 'affect.gain_slow': 'Slow response gain',
  'affect.cap_valence': 'Valence limit', 'affect.cap_arousal': 'Arousal limit',
  'affect.temperature_gain': 'Temperature coupling', 'affect.voice_gain': 'Voice coupling',
  'affect.steer_gain': 'Composite steering strength', 'affect.budget': 'Divergence budget',
};
export function Affect() {
  const { state } = useStore(), config = state.affect, current = config.value, reported = state.evidence.affect;
  const [key, setKey] = useState('affect.on'), [draft, setDraft] = useState('');
  const row = current?.settings.find(s => s.key === key);
  useEffect(() => { if (state.connected && state.capabilities?.features.affect_settings) void send({ type: 'affectRead' }); }, [state.connected, state.capabilities?.epoch]);
  useEffect(() => { setDraft(row ? String(row.value / row.scale) : ''); }, [key, current?.revision, current?.epoch, row?.value]);
  const number = Number(draft), scaled = row ? Math.round(number * row.scale) : NaN;
  const valid = !!row && /^-?\d+(\.\d{1,4})?$/.test(draft) && Math.abs(number * row.scale - scaled) < 1e-7 && scaled >= row.minimum && scaled <= row.maximum;
  const writable = current?.writable && !config.reading && !config.denied && !current.pending;
  return <div className="form-panel"><span className="eyebrow">MODEL / AFFECT</span><h2>Affect and model controls</h2>
    <p>Model: {state.project.model || 'Not selected'}</p><Controls />
    <h3>Runtime affect settings</h3>
    <p>These settings apply to native and CCIR sequences across this runtime. Ordinary HTTP conversations use the qualified controls above.</p>
    <button disabled={!state.connected || config.reading} onClick={() => void send({ type: 'affectRead' })}>Refresh affect settings</button>
    {config.reading && <p role="status">Reading runtime settings.</p>}{config.error && <p className="warning">{config.error}</p>}
    {!state.connected && <p>Connect a gateway to inspect affect support and permissions.</p>}
    {state.connected && !state.capabilities?.features.affect_settings && <p className="footnote">This connection does not advertise runtime affect settings.</p>}
    {current && <><p role="status">{current.writable && !config.denied ? 'Operator control available.' : 'Read-only. Affect management permission is required.'}</p>
      {!!current.pending && <p className="warning">Local setting changes are pending. Refresh before applying another change.</p>}
      <label>Setting<select aria-label="Affect setting" value={key} onChange={event => setKey(event.target.value)}>{current.settings.map(s =>
        <option key={s.key} value={s.key}>{labels[s.key]}</option>)}</select></label>
      {row && <form onSubmit={event => { event.preventDefault(); if (valid) void send({ type: 'affectSet', key, value: scaled, scale: row.scale, epoch: current.epoch, revision: current.revision }); }}>
        <label>Value{row.scale === 1 ? <select aria-label="Affect value" value={draft} disabled={!writable} onChange={event => setDraft(event.target.value)}><option value="0">Off</option><option value="1">On</option></select> :
          <input aria-label="Affect value" type="number" value={draft} min={row.minimum / row.scale} max={row.maximum / row.scale} step="0.0001" disabled={!writable} onChange={event => setDraft(event.target.value)} />}</label>
        <p className="footnote">Current value: {row.value / row.scale}. Range: {row.minimum / row.scale} to {row.maximum / row.scale}.</p>
        <button type="submit" className="primary" disabled={!writable || !valid || scaled === row.value}>Apply setting</button></form>}
      <details><summary>All current settings</summary><dl>{current.settings.map(s => <div key={s.key}><dt>{labels[s.key]}</dt><dd>{s.value / s.scale}</dd></div>)}</dl></details>
      <p className="footnote">Revision {current.revision}. Changes apply to the next sequence. A reply already in progress keeps its settings.</p>
      <p className="footnote">Settings do not qualify missing probes or composite assets. A device change is separate from a saved CCIR checkpoint.</p></>}
    <h3>Selected CCIR state</h3>
    <button disabled={!state.shared.connected || !state.shared.selectedConversation || state.evidence.reading} onClick={() => void send({ type: 'activityRead' })}>Refresh scoped affect</button>
    {reported ? <dl><dt>Affect at last turn</dt><dd>{reported.enabled ? 'Enabled' : 'Disabled'}</dd>
      <dt>Fast valence / arousal</dt><dd>{reported.fast.slice(0, 2).join(' / ')} (Q15)</dd><dt>Slow valence / arousal</dt><dd>{reported.slow.slice(0, 2).join(' / ')} (Q15)</dd>
      <dt>Probes at last turn</dt><dd>{reported.probes.join(' / ')}</dd><dt>State revision</dt><dd>{reported.revision}</dd><dt>Model SHA-256</dt><dd><code>{reported.model || 'Unavailable'}</code></dd></dl> :
      <p>Select a CCIR conversation to read its reported state.</p>}
    {state.evidence.affectError && <p className="warning">{state.evidence.affectError}</p>}
    <button disabled={!state.shared.connected} onClick={() => void send({ type: 'sharedSave' })}>Save CCIR state</button>
    <p className="footnote">The shared workspace shows the save receipt. Reported affect describes runtime state.</p>
  </div>;
}
