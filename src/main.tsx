// SPDX-License-Identifier: Apache-2.0
// Compose a dockable desktop workspace with local project navigation.
import { createRoot } from 'react-dom/client';
import { DockviewReact } from 'dockview-react';
import { themeLight } from 'dockview';
import { useState } from 'react';
import { initialize, send, useStore } from './store';
import { titles, windows, type PanelId } from './windows';
import { Panel } from './panels';
import 'dockview/dist/styles/dockview.css';
import './style.css';
import './panels.css';
const components = { panel: Panel };
const themes = { silver: themeLight, graphite: { ...themeLight, name: 'prism-graphite', colorScheme: 'dark' as const } };
function App() {
  const { state, error, clear } = useStore(), [menu, setMenu] = useState(false);
  return <main className="app-shell" data-theme={state.theme}>
    <div className="shell-cap" aria-hidden="true"><span /><i /><i /><i /></div>
    <header className="app-header"><div className="brand"><img src="/prism-rendered.png" alt="" /><div><strong>AOTX-PRISM</strong><span>PROJECT RUNTIME INTERFACE &amp; SESSION MANAGER</span></div></div>
      <div className="version"><span>LOCAL WORKSPACE</span><b>Desktop interface</b></div></header>
    <div className="connection-strip"><span><i className={`status-dot ${state.connected ? 'online' : ''}`} />
      {state.connected ? 'Gateway connected' : 'Gateway disconnected'}</span><span>AOTX-PRISM / {state.version}</span></div>
    <nav className="menu-bar" aria-label="Application menu">
      <button onClick={() => windows.open('project')}>Project</button><button onClick={() => windows.open('connection')}>Connection</button>
      <button onClick={() => windows.open('models')}>Models</button><button onClick={() => windows.open('affect')}>Affect</button><button onClick={() => windows.open('runtime')}>Runtime setup</button>
      <button onClick={() => windows.open('shared', false)}>CCIR workspace</button>
      <div className="window-menu"><button aria-expanded={menu} onClick={() => setMenu(!menu)}>Windows</button>
        {menu && <div className="menu-popup" onKeyDown={e => { if (e.key === 'Escape') setMenu(false); }}>
          {(Object.keys(titles) as PanelId[]).map(id => <button key={id} onClick={() => { windows.open(id); setMenu(false); }}>{titles[id]}</button>)}
          <hr /><button onClick={() => { windows.reset(); setMenu(false); }}>Reset layout</button></div>}</div>
      <div className="menu-spacer" /><label className="theme-control">Theme<select aria-label="Theme" value={state.theme} onChange={e => void send({ type: 'theme', value: e.target.value as 'silver' | 'graphite' })}>
        <option value="silver">Silver</option><option value="graphite">Graphite</option></select></label>
    </nav>
    <div className="app-body"><aside className="sidebar"><div className="project-card"><span className="eyebrow">CURRENT PROJECT</span>
      <h2>{state.project.name}</h2><button className="path" title={state.folder} onClick={() => windows.open('project')}>{state.folder}</button></div>
      <button className="new-conversation" onClick={() => windows.setup('ordinary')}>+ New conversation</button><div className="sidebar-label">CONVERSATIONS <span>{state.project.conversations.length}</span></div>
      <div className="conversation-list">{state.project.conversations.filter(c => !c.archived).map(c => <button key={c.id} className={state.selected === c.id ? 'selected' : ''} onClick={() => {
        void send({ type: 'select', id: c.id }); windows.open('conversation', false);
      }}><span className="conversation-icon">#</span><span>{c.title}<small>{c.turns.length} {c.turns.length === 1 ? 'message' : 'messages'}</small></span></button>)}</div>
      <div className="sidebar-bottom"><button onClick={() => windows.open('files')}>Project files <span>Read-only</span></button>
        <div><span className={`status-dot ${state.connected ? 'online' : ''}`} />{state.connected ? 'Gateway connected' : 'Gateway offline'}</div>
        <p>Project history stays in the folder shown above.</p></div></aside>
      <div className="workspace"><DockviewReact floatingGroupBounds="boundedWithinViewport" components={components} theme={themes[state.theme]} onReady={event => windows.attach(event.api)} className="dockview-theme-light" /></div>
    </div>
    {(error || state.notice || !state.saved) && <div className={`notice ${error || !state.saved ? 'warning' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{error || state.notice}</span>{error && <button aria-label="Dismiss error" onClick={clear}>Dismiss</button>}</div>}
    <footer><span><i className={`status-dot ${state.connected ? 'online' : ''}`} />{state.busy ? 'Reading device output' : 'Ready'}</span>
      <span>{state.project.model || 'No model selected'}</span><span className={state.saved ? '' : 'warning'}>{state.saved ? 'History saved locally' : 'History save failed'}</span></footer>
    <div className="shell-bottom" aria-hidden="true" />
  </main>;
}
initialize().then(() => createRoot(document.getElementById('root')!).render(<App />)).catch(error => {
  document.getElementById('root')!.textContent = error.message;
});
