// SPDX-License-Identifier: Apache-2.0
// Manage local history and navigate bounded project files.
import { useEffect, useState } from 'react';
import type { FileEntry } from '../shared/types';
import { useStore, send } from './store';
export function Project() {
  const { state } = useStore(), [path, setPath] = useState(state.folder), [waiting, setWaiting] = useState(false);
  const conversation = state.project.conversations.find(c => c.id === state.selected), [title, setTitle] = useState(conversation?.title || '');
  useEffect(() => setTitle(conversation?.title || ''), [conversation?.id, conversation?.title]);
  async function open() { setWaiting(true); try { await send({ type: 'openProject', path }); } finally { setWaiting(false); } }
  return <div className="form-panel"><span className="eyebrow">LOCAL STORAGE</span><h2>Project folder</h2>
    <p>Select an existing folder. PRISM stores conversations in its private <code>.prism</code> directory.</p>
    <label>Folder path<input aria-label="Folder path" value={path} onChange={e => setPath(e.target.value)} /></label>
    <div className="button-row"><button onClick={async () => { const result = await send({ type: 'chooseFolder' }); if (result?.folder) setPath(result.folder); }}>Browse folders</button>
      <button className="primary" disabled={state.connected || state.busy || state.uploading || waiting} onClick={() => void open()}>Open project</button></div>
    {state.connected && <p className="warning">Disconnect before changing project folders.</p>}
    {!!state.catalog.recent.length && <label>Recent projects<select aria-label="Recent projects" value="" onChange={e => setPath(e.target.value)}><option value="">Select a folder</option>{state.catalog.recent.map(p => <option key={p}>{p}</option>)}</select></label>}
    <dl><dt>Current folder</dt><dd>{state.folder}</dd><dt>History</dt><dd>{state.saved ? 'Saved locally' : 'Save failed'}</dd><dt>Conversations</dt><dd>{state.project.conversations.length} / 64</dd></dl>
    <button onClick={() => void send({ type: 'exportProject' })}>Export project history</button>
    {conversation && <><h3>Selected conversation</h3><label>Conversation name<input aria-label="Conversation name" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <div className="button-row"><button onClick={() => void send({ type: 'renameConversation', id: conversation.id, title })}>Rename conversation</button>
        <button onClick={() => void send({ type: 'archiveConversation', id: conversation.id, archived: !conversation.archived })}>{conversation.archived ? 'Restore conversation' : 'Archive conversation'}</button></div></>}
    <p className="footnote">Archive hides local history from the main list. It does not delete device memory. Export contains history and source references, without media bytes.</p>
    {state.project.conversations.some(c => c.archived) && <details><summary>Archived conversations</summary>{state.project.conversations.filter(c => c.archived).map(c =>
      <div className="button-row" key={c.id}><span>{c.title}</span><button onClick={() => void send({ type: 'archiveConversation', id: c.id, archived: false })}>Restore {c.title}</button></div>)}</details>}
    <p className="footnote">Project files are read-only. A project folder is not sent to the model.</p>
  </div>;
}
export function Files() {
  const { state } = useStore(), [files, setFiles] = useState<FileEntry[]>([]), [path, setPath] = useState(''), [name, setName] = useState(''), [content, setContent] = useState('');
  async function refresh(next = path) { setName(''); setContent(''); const reply = await send({ type: 'files', path: next }); if (reply?.files) { setPath(next); setFiles(reply.files); } }
  useEffect(() => { setPath(''); setFiles([]); void refresh(''); }, [state.folder]);
  return <div className="form-panel"><div className="split-heading"><div><span className="eyebrow">READ-ONLY</span><h2>Project files</h2></div><button onClick={() => void refresh()}>Refresh</button></div>
    <p className="path">{state.folder}{path ? '/' + path : ''}</p><button disabled={!path} onClick={() => void refresh(path.split('/').slice(0, -1).join('/'))}>Up one folder</button>
    <div className="file-list">{files.map(file => <button key={file.name} onClick={async () => {
      const next = path ? `${path}/${file.name}` : file.name;
      if (file.kind === 'directory') { await refresh(next); return; }
      setName(''); setContent(''); const reply = await send({ type: 'readFile', name: next }); if (reply?.text !== undefined) { setName(next); setContent(reply.text); }
    }}><span>{file.kind === 'directory' ? 'DIR' : 'TXT'}</span><strong>{file.name}</strong><small>{file.bytes.toLocaleString()} B</small></button>)}</div>
    {!files.length && <p className="muted">No visible files in this folder.</p>}
    <p className="footnote">Up to 128 entries per folder. UTF-8 previews are limited to 128 KiB. Hidden paths and links are excluded.</p>
    {name && <><h3>{name}</h3><pre className="file-preview">{content || '(Empty file)'}</pre></>}
  </div>;
}
