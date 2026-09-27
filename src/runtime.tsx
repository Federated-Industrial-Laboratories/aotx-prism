// SPDX-License-Identifier: Apache-2.0
// Present explicit local runtime ownership and reusable machine profiles.
import { useState } from 'react';
import type { RuntimeProfile, RuntimeInspection, Gpu } from '../shared/setup';
import { send, useStore } from './store';
const empty: RuntimeProfile = { name: 'Local runtime', build: '', gateway: '', python: '', models: '', modules: '', folder: '', gpu: '', role: 'language' };
export function Runtime() {
  const { state } = useStore(), [profile, setProfile] = useState<RuntimeProfile>(state.catalog.runtimes[0] || empty);
  const [inspection, setInspection] = useState<RuntimeInspection>(), [gpus, setGpus] = useState<Gpu[]>([]), [checking, setChecking] = useState(false);
  const runtime = state.runtime, running = ['starting', 'ready', 'stopping'].includes(runtime.phase);
  const edit = (key: keyof RuntimeProfile, value: string) => { setProfile(p => ({ ...p, [key]: value })); setInspection(undefined); };
  const paths = { build: 'AOTX build folder', gateway: 'Gateway package folder', python: 'Gateway Python', models: 'Model store', modules: 'AOTX modules', folder: 'Runtime storage folder' } as const;
  async function check() { setChecking(true); try { const reply = await send({ type: 'runtimeInspect', profile }); if (reply?.inspection) { setInspection(reply.inspection); setGpus(reply.inspection.gpus); } } finally { setChecking(false); } }
  return <div className="form-panel"><span className="eyebrow">LOCAL / RUNTIME</span><h2>Runtime setup</h2>
    <p>Use an installed AOTX 0.3.5 build and gateway environment. Model files stay in their selected store.</p>
    <label>Saved runtime<select aria-label="Saved runtime" value={state.catalog.runtimes.some(p => p.name === profile.name) ? profile.name : ''} onChange={e => { const p = state.catalog.runtimes.find(p => p.name === e.target.value); if (p) { setProfile(p); setInspection(undefined); } }}>
      <option value="">New profile</option>{state.catalog.runtimes.map(p => <option key={p.name}>{p.name}</option>)}</select></label>
    <label>Runtime profile name<input aria-label="Runtime profile name" value={profile.name} onChange={e => edit('name', e.target.value)} /></label>
    {Object.entries(paths).map(([key, label]) => <label key={key}>{label}<div className="path-picker"><input aria-label={label} value={profile[key as keyof typeof paths]} onChange={e => edit(key as keyof RuntimeProfile, e.target.value)} />
      <button aria-label={`Browse ${label}`} onClick={async () => { const result = await send({ type: 'choosePath', kind: key === 'python' ? 'file' : 'directory' }); if (result?.folder) edit(key as keyof RuntimeProfile, result.folder); }}>Browse</button></div></label>)}
    <div className="button-row"><button onClick={async () => { const reply = await send({ type: 'runtimeDevices' }); if (reply?.gpus) setGpus(reply.gpus); }}>Refresh GPUs</button></div>
    <label>GPU<select aria-label="Runtime GPU" value={profile.gpu} onChange={e => edit('gpu', e.target.value)}><option value="">Select a GPU</option>
      {profile.gpu && !gpus.some(g => g.uuid === profile.gpu) && <option value={profile.gpu}>{profile.gpu} (not checked)</option>}
      {gpus.map(g => <option key={g.uuid} value={g.uuid}>{g.name} / {g.uuid.slice(-8)} / {g.freeMiB} MiB free</option>)}</select></label>
    <label>Active model role<select aria-label="Active model role" value={profile.role} onChange={e => edit('role', e.target.value)}>
      <option>language</option><option>language-q4</option><option>language-audio</option></select></label>
    <div className="button-row"><button disabled={checking} onClick={() => void check()}>{checking ? 'Checking installation...' : 'Check installation'}</button>
      <button disabled={!profile.gpu} onClick={() => void send({ type: 'runtimeSave', profile })}>Save runtime profile</button>
      <button disabled={!state.catalog.runtimes.some(p => p.name === profile.name)} onClick={() => void send({ type: 'runtimeRemove', name: profile.name })}>Remove profile</button></div>
    {inspection && <dl><dt>Compiled capacity</dt><dd>{inspection.version}</dd><dt>Model store check</dt><dd><pre className="file-preview">{inspection.models}</pre></dd></dl>}
    <h3>Owned runtime</h3><dl><dt>State</dt><dd>{runtime.phase}</dd><dt>Storage</dt><dd>{runtime.folder || 'No run started'}</dd>
      <dt>GPU</dt><dd>{runtime.profile?.gpu || 'None'}</dd><dt>Gateway</dt><dd>{runtime.url || 'Unavailable'}</dd></dl>
    <div className="button-row"><button className="primary" disabled={running || state.connected || checking || !profile.gpu} onClick={() => void send({ type: 'runtimeStart', profile })}>Start runtime</button>
      <button disabled={runtime.phase !== 'ready' || state.connected} onClick={() => void send({ type: 'runtimeConnect' })}>Connect owned runtime</button>
      <button disabled={!running || runtime.phase === 'stopping'} onClick={() => void send({ type: 'runtimeStop' })}>Stop owned runtime</button></div>
    <p className="footnote">Closing PRISM stops its owned runtime. Each start creates a new journal. External gateways stay under their operator's control.</p>
    {runtime.error && <p className="warning">{runtime.error}</p>}{runtime.logs && <details><summary>Startup and process log</summary><pre className="file-preview">{runtime.logs}</pre></details>}
  </div>;
}
