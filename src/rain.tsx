// SPDX-License-Identifier: Apache-2.0
// Show readable request activity and an optional bounded visual field.
import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';

function Rain({ active }: { active: boolean }) {
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
          context!.fillText('01'.charAt((col + row + step) % 2), col * 18 + 7, ((col * 31 + step * 4 - row * 18) % h + h) % h);
        } if (active) step++;
      }
      if (!motion.matches && active) frame = requestAnimationFrame(draw);
    }
    function restart() { cancelAnimationFrame(frame); draw(performance.now() + 100); }
    const resize = new ResizeObserver(restart); resize.observe(element);
    motion.addEventListener('change', restart); document.addEventListener('visibilitychange', restart); restart();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); motion.removeEventListener('change', restart); document.removeEventListener('visibilitychange', restart); };
  }, [active]);
  return <canvas ref={canvas} className="rain" aria-hidden="true" />;
}

let showVisual = false;
export function Activity() {
  const { state } = useStore(), [visual, setVisual] = useState(showVisual);
  const turn = state.project.conversations.find(c => c.id === state.selected)?.turns.at(-1);
  return <div className="form-panel"><span className="eyebrow">RUNTIME / ACTIVITY</span><h2>Runtime activity</h2>
    <p>Connection and request state for the current conversation.</p>
    <div className="activity-tiles">
      <section className="activity-tile"><h3>Gateway</h3><p>{state.connected ? 'Connected' : 'Disconnected'}</p></section>
      <section className="activity-tile"><h3>Current request</h3><p>{turn?.phase || 'No request'}</p></section>
      <section className="activity-tile"><h3>Received output</h3><p>{(turn?.cursor || 0).toLocaleString()} bytes</p></section>
    </div>
    <p className="footnote">This connection reports ordinary requests. CCIR background activity is not available in this view.</p>
    <button aria-expanded={visual} onClick={() => { showVisual = !visual; setVisual(showVisual); }}>{visual ? 'Hide visualization' : 'Show visualization'}</button>
    {visual && <section className="visualisation-panel" aria-label="Request visualization"><div className="message-head"><strong>Request visualization</strong><span>{state.busy ? 'Reading output' : 'Quiet'}</span></div>
      <Rain active={state.connected && state.busy} /><p className="footnote">The field moves while output is read. Read the tiles for request state.</p></section>}
  </div>;
}
