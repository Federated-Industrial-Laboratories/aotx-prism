// SPDX-License-Identifier: Apache-2.0
// Offer only advertised discrete controls for the currently selected exact model.
import { send, useStore } from './store';
export function Controls() {
  const { state } = useStore(), model = state.capabilities?.models.find(m => m.id === state.project.model);
  const available = !!state.connected && !!state.capabilities?.features.control_selection;
  return <section className="control-selection"><h3>Qualified controls</h3><p>Selection applies to new inputs with the current model. Each dose uses its exact qualification.</p>
    <label>Control and dose<select aria-label="Control and dose" value={state.control ? `${model?.controls.findIndex(c => c.name === state.control?.name)}:${state.control.dose}` : ''} disabled={!available}
      onChange={event => {
        if (!event.target.value) { void send({ type: 'controlSelect', value: null }); return; }
        const [index, raw] = event.target.value.split(':'), c = model?.controls[Number(index)];
        if (model && c?.qualification_sha256) void send({ type: 'controlSelect', value: { model: model.id, sha256: model.sha256, name: c.name, qualification: c.qualification_sha256, dose: Number(raw) } });
      }}><option value="">No explicit control</option>{model?.controls.flatMap((c, i) => c.available ? c.accepted_doses.map(dose =>
        <option key={`${c.name}:${dose}`} value={`${i}:${dose}`}>{c.name} / {dose / c.dose_scale}</option>) : [<option key={c.name} disabled>{c.name} / unavailable</option>])}</select></label>
    {!available && <p className="muted">Explicit controls are unavailable on this connection.</p>}
    {state.control && <details><summary>Selected qualification</summary><dl><dt>Model SHA-256</dt><dd><code>{state.control.sha256}</code></dd>
      <dt>Qualification SHA-256</dt><dd><code>{state.control.qualification}</code></dd><dt>Discrete dose</dt><dd>{state.control.dose} / 10000</dd></dl></details>}
    <p className="footnote">Shared affect must be off. After affect is disabled, send one input without an explicit control before selecting one.</p>
  </section>;
}
