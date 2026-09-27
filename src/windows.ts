// SPDX-License-Identifier: Apache-2.0
// Restore bounded panel layouts and expose keyboard-accessible dock commands.
import type { DockviewApi, SerializedDockview } from 'dockview';
import { send, snapshot } from './store';
export const titles = { conversation: 'Conversation', connection: 'Connection', project: 'Project',
  models: 'Models', files: 'Project files', inspector: 'Request details', activity: 'Activity' } as const;
export type PanelId = keyof typeof titles;
export function validateLayout(raw: string): SerializedDockview {
  if (raw.length > 262144) throw Error('Invalid layout size.');
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !value.panels || value.popoutGroups?.length) throw Error('Invalid layout.');
  const panels = Object.entries(value.panels);
  if (panels.length > 7 || panels.some(([id, p]) => !Object.hasOwn(titles, id) ||
      (p as { contentComponent?: string }).contentComponent !== 'panel')) throw Error('Invalid panel identity.');
  let nodes = 0;
  function visit(item: unknown, depth: number): void {
    if (++nodes > 5000 || depth > 24) throw Error('Invalid layout depth.');
    if (typeof item === 'number' && (!Number.isFinite(item) || Math.abs(item) > 20000)) throw Error('Invalid panel geometry.');
    if (item && typeof item === 'object') for (const child of Object.values(item)) visit(child, depth + 1);
  }
  visit(value, 0); return value;
}
class Windows {
  api?: DockviewApi; private restoring = false; private timer?: ReturnType<typeof setTimeout>;
  attach(api: DockviewApi) {
    this.api = api; this.restoring = true;
    try { const raw = snapshot().layout; if (raw) api.fromJSON(validateLayout(raw)); else this.reset(); }
    catch { this.reset(); }
    if (!api.getPanel('conversation')) this.open('conversation', false);
    this.restoring = false;
    api.onDidLayoutChange(() => {
      if (this.restoring) return;
      clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), 250);
    });
  }
  private geometry() {
    const w = this.api?.width || 1000, h = this.api?.height || 700;
    return { x: Math.max(8, w - 450), y: 24, width: Math.min(420, w - 16), height: Math.min(520, h - 40) };
  }
  open(id: PanelId, floating = true) {
    if (!this.api) return;
    const panel = this.api.getPanel(id) || this.api.addPanel({ id, title: titles[id], component: 'panel',
      minimumWidth: 260, minimumHeight: 180, ...(floating ? { floating: this.geometry() } : {}) });
    panel.api.setActive(); this.save();
  }
  float(id: PanelId) { const panel = this.api?.getPanel(id); if (panel) { this.api!.addFloatingGroup(panel, this.geometry()); this.save(); } }
  dock(id: PanelId) { const panel = this.api?.getPanel(id); if (panel) {
    const group = this.api!.addGroup({ direction: 'right' }); panel.api.moveTo({ group }); this.save();
  } }
  close(id: PanelId) { const panel = this.api?.getPanel(id); if (panel) this.api!.removePanel(panel); this.save(); }
  reset() {
    if (!this.api) return; this.restoring = true; this.api.clear(); this.open('conversation', false);
    this.restoring = false; this.save();
  }
  save() { if (this.api && !this.restoring) void send({ type: 'layout', value: JSON.stringify(this.api.toJSON()) }); }
}
export const windows = new Windows();
