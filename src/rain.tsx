// SPDX-License-Identifier: Apache-2.0
// Draw a bounded decorative field beside the exact current request state.
import { useEffect, useRef } from 'react';
import { useStore } from './store';
export function Activity() {
  const { state } = useStore(), canvas = useRef<HTMLCanvasElement>(null);
  const turn = state.project.conversations.find(c => c.id === state.selected)?.turns.at(-1);
  useEffect(() => {
    const element = canvas.current!, context = element.getContext('2d'); if (!context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)'); let frame = 0, last = 0, step = 0;
    function draw(now: number) {
      if (!document.hidden && now - last > 90) {
        last = now; const w = Math.min(1000, element.clientWidth), h = 220;
        if (element.width !== w) element.width = w; element.height = h;
        context!.fillStyle = '#111716'; context!.fillRect(0, 0, w, h); context!.font = '12px monospace';
        for (let col = 0; col < Math.floor(w / 18); col++) for (let row = 0; row < 10; row++) {
          context!.fillStyle = `rgba(125,199,167,${(10 - row) / 14})`;
          context!.fillText('01'.charAt((col + row + step) % 2), col * 18 + 7, ((col * 31 + step * 4 - row * 18) % h + h) % h);
        } step++;
      }
      if (!motion.matches) frame = requestAnimationFrame(draw);
    }
    function restart() { cancelAnimationFrame(frame); draw(performance.now() + 100); }
    motion.addEventListener('change', restart); restart();
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', restart); };
  }, []);
  return <div className="form-panel"><span className="eyebrow">OPTIONAL ACTIVITY VIEW</span><h2>Runtime activity</h2>
    <canvas ref={canvas} className="rain" aria-hidden="true" /><p className="footnote">Decorative field. The text below reports the current request.</p>
    <dl><dt>Connection</dt><dd>{state.connected ? 'Connected' : 'Disconnected'}</dd><dt>Current request</dt><dd>{turn?.phase || 'None'}</dd>
      <dt>Output bytes</dt><dd>{turn?.cursor || 0}</dd></dl>
    <p className="muted">CCIR idle output is not connected in this version.</p>
  </div>;
}
