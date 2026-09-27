// SPDX-License-Identifier: Apache-2.0
// Present nonmodal project, connection, model and request panels.
import { useEffect, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { Project, Files } from './projects';
import { Runtime } from './runtime';
import { MediaSources } from './sources';
import { useStore, send } from './store';
import { windows, type PanelId } from './windows';
import { Conversation } from './conversation';
import { Activity } from './rain';
function Connection() {
  const { state } = useStore(), [url, setUrl] = useState(state.project.endpoint || 'http://127.0.0.1:8080');
  const [token, setToken] = useState(''), [waiting, setWaiting] = useState(false);
  async function connect() { setWaiting(true); await send({ type: 'connect', url, token }); setToken(''); setWaiting(false); }
  return <div className="form-panel"><span className="eyebrow">AOTX GATEWAY</span><h2>Connect your runtime</h2>
    <p>Use the gateway URL and bearer token from your AOTX configuration.</p>
    <form onSubmit={e => { e.preventDefault(); void connect(); }}>
      <label>Gateway URL<input aria-label="Gateway URL" value={url} disabled={state.connected || waiting} onChange={e => setUrl(e.target.value)} /></label>
      <label>Bearer token<input aria-label="Bearer token" type="password" autoComplete="off" spellCheck={false} value={token} disabled={state.connected || waiting} onChange={e => setToken(e.target.value)} /></label>
      <div className="button-row"><button type="submit" className="primary" disabled={state.connected || waiting || !token}>{waiting ? 'Connecting...' : 'Connect'}</button>
        <button type="button" disabled={!state.connected} onClick={() => { setToken(''); void send({ type: 'disconnect' }); }}>Disconnect</button></div>
    </form><p className="footnote">The token stays in memory until disconnect or exit. Remote connections require HTTPS. Loopback HTTP supports local gateways and SSH tunnels.</p>
    <div className="info-box"><span className={`status-dot ${state.connected ? 'online' : ''}`} /> {state.connected ? 'Connected' : 'Disconnected'}
      <p>Disconnect stops output reads. It does not cancel device work.</p></div>
  </div>;
}
function Models() {
  const { state } = useStore(), [model, setModel] = useState(state.project.model), [tokens, setTokens] = useState(state.project.maxTokens);
  const [temperature, setTemperature] = useState(state.project.temperature), [profileName, setProfileName] = useState('');
  useEffect(() => { setModel(state.project.model); setTokens(state.project.maxTokens); setTemperature(state.project.temperature); },
    [state.project.model, state.project.maxTokens, state.project.temperature]);
  const caps = state.capabilities, current = caps?.models.find(m => m.id === model);
  return <div className="form-panel"><span className="eyebrow">RUNTIME CAPABILITIES</span><h2>Available models</h2>
    {!caps ? <p>Connect to a gateway to read its models and limits.</p> : <>
      <label>Model<select aria-label="Model" value={model} onChange={e => setModel(e.target.value)}>
        {caps.models.filter(m => m.input.includes('text')).map(m => <option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
      <div className="field-pair"><label>Maximum output tokens<input aria-label="Maximum output tokens" type="number" min="1" max={caps.outputTokens} value={tokens} onChange={e => setTokens(Number(e.target.value))} /></label>
        <label>Temperature<input aria-label="Temperature" type="number" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} /></label></div>
      <button className="primary" disabled={!state.connected} onClick={() => void send({ type: 'profile', model, maxTokens: tokens, temperature })}>Apply settings</button>
      <h3>Generation profiles</h3><label>Profile name<input aria-label="Generation profile name" value={profileName} onChange={e => setProfileName(e.target.value)} /></label>
      <button disabled={!profileName} onClick={() => void send({ type: 'saveProfile', name: profileName })}>Save current settings</button>
      {state.project.profiles.map(p => <div className="button-row" key={p.name}><span>{p.name}</span><button onClick={() => void send({ type: 'applyProfile', name: p.name })}>Apply {p.name}</button>
        <button onClick={() => void send({ type: 'removeProfile', name: p.name })}>Remove {p.name}</button></div>)}
      <dl><dt>Prompt limit</dt><dd>{caps.promptBytes.toLocaleString()} bytes</dd><dt>Output limit</dt><dd>{caps.outputTokens.toLocaleString()} tokens</dd><dt>Model SHA-256</dt><dd><code>{current?.sha256}</code></dd><dt>Model inputs</dt><dd>{current?.input.join(', ')}</dd>
        <dt>Runtime epoch</dt><dd>{caps.epoch}</dd><dt>Automatic memory capability</dt><dd>{current?.automatic_memory ? 'Available for this model' : 'Unavailable for this model'}</dd></dl>
      <p className="footnote">Attachments require a matching model input and media permission. Memory and controls require a separate CCIR connection.</p>
      <h3>Gateway features</h3><div className="capabilities">{Object.entries(caps.features).map(([key, value]) =>
        <div key={key}><span>{key.replaceAll('_', ' ')}</span><span className={value ? 'available' : 'muted'}>{value ? 'Available' : 'Unavailable'}</span></div>)}</div>
    </>}
  </div>;
}
function Inspector() {
  const { state } = useStore(), turns = state.project.conversations.find(c => c.id === state.selected)?.turns || [];
  const [id, setId] = useState(''), turn = turns.find(t => t.id === id) || turns.at(-1);
  return <div className="form-panel"><span className="eyebrow">NATIVE REQUEST</span><h2>Request details</h2>
    {!turn ? <p>Send a message to inspect its request handle and output state.</p> : <>
      <label>Saved request<select aria-label="Saved request" value={turn.id} onChange={e => setId(e.target.value)}>
        {turns.map((t, i) => <option key={t.id} value={t.id}>{i + 1}. {t.prompt.slice(0, 48)}</option>)}</select></label>
      <dl><dt>State</dt><dd>{turn.phase}</dd><dt>Handle</dt><dd><code>{turn.handle || 'Not received'}</code></dd>
        <dt>Gateway</dt><dd>{turn.endpoint}</dd><dt>Model</dt><dd>{turn.model}</dd><dt>Runtime epoch</dt><dd>{turn.epoch || 'Unknown'}</dd>
        <dt>Received output</dt><dd>{turn.cursor.toLocaleString()} bytes</dd><dt>Tokens</dt><dd>{turn.usage ? `${turn.usage.prompt_tokens} input / ${turn.usage.completion_tokens} output` : 'Unavailable'}</dd>
        <dt>Local history</dt><dd>{state.saved ? 'Saved' : 'Save failed'}</dd><dt>Device persistence</dt><dd>Ephemeral</dd></dl>
      <p className="footnote">Ordinary requests expire when the runtime epoch ends or the gateway reclaims the request. Local history remains.</p>
    </>}
  </div>;
}
const panels = { conversation: Conversation, connection: Connection, project: Project, models: Models, files: Files, runtime: Runtime, sources: MediaSources, inspector: Inspector, activity: Activity };
export function Panel(props: IDockviewPanelProps) {
  const id = props.api.id as PanelId, Component = panels[id];
  const [maximized, setMaximized] = useState(false);
  const [visible, setVisible] = useState(props.api.isVisible);
  useEffect(() => {
    const subscription = windows.api?.onDidMaximizedGroupChange(() => setMaximized(props.api.isMaximized()));
    const visibility = props.api.onDidVisibilityChange(event => setVisible(event.isVisible));
    return () => { subscription?.dispose(); visibility.dispose(); };
  }, [props.api]);
  if (!Component) return null;
  return <section className={`panel panel-${id}`} data-panel={id} aria-label={props.api.title}>
    <div className="panel-tools"><span>{id === 'conversation' ? 'SESSION WORKSPACE' : 'UTILITY WINDOW'}</span>
      <button aria-label={`Float ${id}`} onClick={() => windows.float(id)}>Float</button>
      <button aria-label={`Dock ${id}`} onClick={() => windows.dock(id)}>Dock</button>
      <button aria-label={`${maximized ? 'Restore' : 'Maximize'} ${id}`} onClick={() => windows.maximize(id)}>{maximized ? 'Restore' : 'Maximize'}</button>
      <button aria-label={`Close ${id}`} onClick={() => windows.close(id)}>Close</button></div>{id === 'activity' ? <Activity visible={visible} /> : <Component />}
  </section>;
}
