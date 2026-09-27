// SPDX-License-Identifier: Apache-2.0
// Inspect owned gateway media and explicitly remove unused sources.
import { useEffect, useState } from 'react';
import type { Media } from '../shared/types';
import { send, useStore } from './store';
export function MediaSources() {
  const { state } = useStore(), [sources, setSources] = useState<Media[]>([]), [selected, setSelected] = useState(''), [confirm, setConfirm] = useState(false);
  useEffect(() => { setSources([]); setSelected(''); setConfirm(false); }, [state.connected, state.project.endpoint, state.capabilities?.epoch]);
  async function refresh() { setSources([]); setConfirm(false); const reply = await send({ type: 'listMedia' }); if (reply?.media) setSources(reply.media); }
  const source = sources.find(s => s.id === selected && s.endpoint === state.project.endpoint && s.epoch === state.capabilities?.epoch), usable = state.connected && state.capabilities?.features.private_media;
  return <div className="form-panel"><span className="eyebrow">GATEWAY / SOURCES</span><h2>Media sources</h2>
    <p>Uploads remain on this gateway until removed. Use this list after an interrupted upload before selecting the file again.</p>
    <button disabled={!usable} onClick={() => void refresh()}>Refresh sources</button>
    {!usable && <p className="muted">Connect to a gateway with media permission.</p>}
    <label>Source<select aria-label="Media source" value={selected} onChange={e => { setSelected(e.target.value); setConfirm(false); }}><option value="">Select a source</option>{sources.map(m => <option key={m.id}>{m.id}</option>)}</select></label>
    {source && <><dl><dt>Media type</dt><dd>{source.modality}</dd><dt>State</dt><dd>{source.phase === 6 ? 'Ready' : source.phase === 7 ? 'Refused' : 'Preparing'} / status {source.status}</dd><dt>Bytes</dt><dd>{source.bytes}</dd><dt>SHA-256</dt><dd>{source.sha256}</dd><dt>Runtime epoch</dt><dd>{source.epoch}</dd></dl>
      <p>Removing this source prevents later use of its saved history references. Active requests can refuse removal.</p>
      <label><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> Remove this exact gateway source</label>
      <button disabled={!usable || !confirm} onClick={async () => { if (await send({ type: 'deleteMedia', id: source.id })) await refresh(); }}>Delete selected source</button></>}
  </div>;
}
