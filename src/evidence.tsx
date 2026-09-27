// SPDX-License-Identifier: Apache-2.0
// Present scoped memory metadata, exact payloads and explicit publication targets.
import { useEffect, useState } from 'react';
import { send, useStore } from './store';
import { kindNames } from '../shared/payload';
export function Evidence() {
  const { state } = useStore(), e = state.evidence, detail = e.detail, decoded = detail?.decoded;
  const [destination, setDestination] = useState(''), [publish, setPublish] = useState(false);
  const shared = state.shared, ready = shared.connected && !!shared.selectedSpace;
  useEffect(() => { setDestination(''); setPublish(false); }, [shared.selectedSpace, detail?.row.id, detail?.row.version]);
  return <div className="form-panel evidence-panel"><span className="eyebrow">CCIR / EVIDENCE</span><h2>Memory and source evidence</h2>
    <p>Read retained records in the selected shared space. Source text remains separate from inferred records.</p>
    <div className="button-row"><button disabled={!ready} onClick={() => void send({ type: 'evidenceList', cursor: '0' })}>Refresh memory</button>
      <button disabled={!ready || e.next === '0'} onClick={() => void send({ type: 'evidenceList', cursor: e.next })}>Next memory page</button></div>
    {!ready && <p>Open a shared workspace and select a space first.</p>}
    {e.error && <p className="warning" role="status">{e.error} No current detail is shown.</p>}
    <div className="memory-list" aria-label="Memory records">{e.rows.map((row, i) => <button key={`${row.id}:${row.version}:${i}`} className={detail?.row.id === row.id ? 'selected' : ''}
      onClick={() => void send({ type: 'evidenceRead', id: row.id, version: row.version })}>
      <b>{kindNames[row.kind] || `Object kind ${row.kind}`}</b><span>{row.scope} / version {row.version} / {row.bytes} bytes</span><code>{row.id}</code></button>)}</div>
    {detail && decoded && <section className="evidence-detail"><header className="message-head"><strong>{kindNames[detail.row.kind] || 'Memory object'}</strong><span>{detail.row.scope}</span></header>
      <div className="evidence-body"><h3>{decoded.format}</h3><p>Current version {detail.row.version}. {detail.truncated ? 'Only the first 1 MiB is shown.' : 'The complete payload was read.'}</p>
        {decoded.error && <p className="warning">{decoded.error}</p>}
        {decoded.state === 'unknown' && <p>This payload has no supported text view. Its exact bytes remain available below.</p>}
        {decoded.text !== undefined && <blockquote className="source-quote">{decoded.text}</blockquote>}
        <dl>{Object.entries(decoded.fields).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
        {decoded.spans.length > 0 && <><h3>Recorded source spans</h3>{decoded.spans.map(span => <p key={span.label}>{span.label}: {span.length ? `${span.length} bytes at offset ${span.start}` : 'No supported quote'}</p>)}</>}
        {detail.row.source !== '0'.repeat(32) && <><button onClick={() => void send({ type: 'evidenceRead', id: detail.row.source })}>Read current source</button>
          <p className="footnote">This endpoint omits the source version. A current source alone cannot verify a historical citation.</p></>}
        {decoded.references.length > 0 && <><h3>Recorded references</h3><div className="reference-list">{decoded.references.map((ref, i) => <article key={`${ref.id}:${i}`}><b>{ref.label}</b>
          <code>{ref.id}</code><span>{ref.version ? `Exact version ${ref.version}` : 'Current version only'}</span>
          <button onClick={() => void send({ type: 'evidenceRead', id: ref.id, ...(ref.version ? { version: ref.version } : {}) })}>Read {ref.label.toLowerCase()}</button></article>)}</div></>}
        <details><summary>Identity and exact bytes</summary><dl><dt>Object</dt><dd><code>{detail.row.id}</code></dd><dt>Owner</dt><dd><code>{detail.row.owner}</code></dd>
          <dt>Actor</dt><dd><code>{detail.row.actor}</code></dd><dt>Source</dt><dd><code>{detail.row.source}</code></dd><dt>Room</dt><dd><code>{detail.row.room}</code></dd></dl>
          <label>Base64 payload<textarea aria-label="Base64 payload" readOnly rows={5} value={detail.base64} /></label></details>
        <details><summary>Publish this record</summary><p>Publication creates a destination-scoped copy through the runtime. Select its destination explicitly.</p>
          <label>Destination space<select aria-label="Publication destination" value={destination} onChange={event => { setDestination(event.target.value); setPublish(false); }}>
            <option value="">Select a destination</option>{shared.spaces.items.filter(row => (row.permissions as string[]).includes('manage')).map(row =>
              <option key={String(row.id)} value={String(row.id)}>{shared.labels[String(row.id)] || row.id as string} / {String(row.scope)}</option>)}</select></label>
          <label className="check-field"><input type="checkbox" checked={publish} onChange={event => setPublish(event.target.checked)} />Publish this exact version to the selected space</label>
          <button disabled={!destination || !publish || !ready} onClick={async () => { setPublish(false); await send({ type: 'sharedPublish', destination, id: detail.row.id, version: detail.row.version }); }}>Publish record</button></details>
      </div></section>}
    <p className="footnote">Corrections use shared conversation input when automatic memory is available for the selected model. Direct memory editing is unavailable.</p>
    <p className="footnote">Task reviews retain outcome evidence. New task bindings and historical payload versions are unavailable through this gateway.</p>
  </div>;
}
