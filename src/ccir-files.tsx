// SPDX-License-Identifier: Apache-2.0
// Present complete runtime creation, inspection and stopped-file copies.
import { useState } from 'react';
import { send, useStore } from './store';
import { windows } from './windows';
import type { CcirPlan } from '../shared/ccir';
export function CcirFiles() {
  const { state } = useStore(), [profileName, setProfileName] = useState(state.catalog.runtimes[0]?.name || '');
  const [path, setPath] = useState(''), [output, setOutput] = useState(''), [phrases, setPhrases] = useState(''), [settings, setSettings] = useState('');
  const [checked, setChecked] = useState('');
  const profile = state.catalog.runtimes.find(p => p.name === profileName), current = state.ccir, busy = current.phase === 'working';
  const plan: CcirPlan | undefined = profile ? { profile: { ...profile, ccir: undefined, participant: undefined }, output, phrases, settings } : undefined;
  const samePlan = plan && JSON.stringify(plan) === checked;
  const gib = (bytes: number) => `${(bytes / 1073741824).toFixed(2)} GiB`;
  return <div className="form-panel"><span className="eyebrow">STORAGE / CCIR</span><h2>Complete runtime files</h2>
    <p>A complete file holds model assets and durable runtime state. Use a compatible AOTX build and GPU to activate it.</p>
    <label>Installed runtime profile<select aria-label="CCIR runtime profile" value={profileName} onChange={e => setProfileName(e.target.value)}>
      <option value="">Select a profile</option>{state.catalog.runtimes.map(p => <option key={p.name}>{p.name}</option>)}</select></label>
    <button onClick={() => windows.open('runtime')}>Runtime profiles</button>
    <h3>Open and inspect</h3><label>Complete runtime file<div className="path-picker"><input aria-label="Complete runtime file" value={path} onChange={e => setPath(e.target.value)} />
      <button onClick={async () => { const reply = await send({ type: 'choosePath', kind: 'file' }); if (reply?.folder) setPath(reply.folder); }}>Browse CCIR</button></div></label>
    <button disabled={!profile || !path || busy} onClick={() => profile && void send({ type: 'ccirInspect', build: profile.build, path })}>Inspect and verify</button>
    <p className="footnote">Inspection does not activate code. Activation requires trusted components. A file in use can change during inspection.</p>
    <h3>Create or copy</h3><label>New destination path<input aria-label="New CCIR destination" value={output} onChange={e => setOutput(e.target.value)} /></label>
    <p className="footnote">The destination must not exist. A copy requires a stopped writer and retains the selected saved generation.</p>
    <button disabled={!profile || !path || !output || busy} onClick={() => profile && void send({ type: 'ccirCopy', build: profile.build, path, output })}>Copy stopped runtime</button>
    <details><summary>Create a new shared runtime</summary>
      <p>Creation prepares an empty memory checkpoint on the selected GPU and copies the configured assets into a new file.</p>
      <dl><dt>Model store</dt><dd>{profile?.models || 'Select a configured profile'}</dd><dt>Data-only module folder</dt><dd>{profile?.modules || 'Not selected'}</dd>
        <dt>Active roles</dt><dd>{profile?.role}, embedding</dd><dt>GPU</dt><dd>{profile?.gpu || 'Not selected'}</dd></dl>
      <p className="footnote">The store must contain the embedding model. Select data-only modules, including the conductor role. Model files remain unchanged.</p>
      <label>Refusal phrase file<input aria-label="Refusal phrase file" value={phrases} onChange={e => setPhrases(e.target.value)} /></label>
      <p className="footnote">Affect builds require this operator asset or quality/refusal-phrases.txt in the model store.</p>
      <label>Device settings file (optional)<input aria-label="Device settings file" value={settings} onChange={e => setSettings(e.target.value)} /></label>
      <div className="button-row"><button disabled={!plan || !output || busy} onClick={async () => {
        if (plan) { const reply = await send({ type: 'ccirEstimate', plan }); if (reply) setChecked(JSON.stringify(plan)); }
      }}>Check creation assets</button>
        <button className="primary" disabled={!samePlan || !current.estimate || current.phase !== 'complete'} onClick={() => plan && void send({ type: 'ccirCreate', plan })}>Create shared runtime</button></div>
      {current.estimate && <dl><dt>Asset files inspected</dt><dd>{current.estimate.files}</dd><dt>Initial storage allowance</dt><dd>{gib(current.estimate.bytes)}</dd><dt>Free destination space</dt><dd>{gib(current.estimate.free)}</dd>
        <dt>Models</dt><dd><pre className="file-preview">{current.estimate.models}</pre></dd></dl>}
      <p className="footnote">The allowance includes all regular asset files and 128 MiB for initial metadata. Saved history needs additional disk space.</p>
    </details>
    <h3>File operation</h3><p role="status">{current.phase}{current.action ? ` / ${current.action.replace(/^ccir/, '')}` : ''}</p>
    <button disabled={!busy} onClick={() => void send({ type: 'ccirCancel' })}>Cancel file operation</button>
    {current.error && <p className="warning">{current.error}</p>}
    {current.inspection && <dl><dt>Verified file</dt><dd><code>{current.inspection.path}</code></dd><dt>Size</dt><dd>{gib(current.inspection.bytes)}</dd>
      <dt>Lineage</dt><dd><code>{current.inspection.lineage}</code></dd><dt>Generation</dt><dd>{current.inspection.generation}</dd>
      <dt>Compiled capacity</dt><dd>{current.inspection.slots} slots / sm_{current.inspection.architecture}</dd><dt>Roles</dt><dd>{current.inspection.roles.join(', ')}</dd>
      <dt>Assets</dt><dd><pre className="file-preview">{current.inspection.assets.join('\n')}</pre></dd></dl>}
    {current.logs && <details><summary>File tool output</summary><pre className="file-preview">{current.logs}</pre></details>}
  </div>;
}
