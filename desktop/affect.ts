// SPDX-License-Identifier: Apache-2.0
// Read authoritative affect settings and never retry an uncertain operator write.
import { affectSettings, type AffectCommand, type AffectSettingsState } from '../shared/affect.js';
import { Gateway, GatewayError } from './gateway.js';
export class AffectSettingsClient {
  state: AffectSettingsState = { reading: false, error: '', denied: false };
  constructor(private changed: (state: AffectSettingsState) => void) {}
  private emit() { this.changed(structuredClone(this.state)); }
  clear() { this.state = { reading: false, error: '', denied: false }; this.emit(); }
  async read(gateway: Gateway, epoch: string, signal: AbortSignal) {
    this.state.value = undefined; this.state.error = ''; this.state.reading = true; this.emit();
    try {
      const current = affectSettings((await gateway.json('/aotx/v1/affect/settings', signal)).value);
      if (current.epoch !== epoch) throw Error('The runtime epoch changed. Reconnect before changing settings.');
      this.state.value = current;
    } catch (error) {
      this.state.error = error instanceof GatewayError && error.status === 403 ? 'Operator or telemetry permission is required.' :
        error instanceof GatewayError && [404, 501].includes(error.status) ? 'This runtime does not expose affect settings.' :
          error instanceof Error ? error.message : 'Affect settings are unavailable.';
    } finally { this.state.reading = false; this.emit(); }
  }
  async set(gateway: Gateway, cmd: Extract<AffectCommand, { type: 'affectSet' }>, signal: AbortSignal) {
    const current = this.state.value, row = current?.settings.find(s => s.key === cmd.key);
    if (!current || this.state.reading || this.state.denied || !current.writable || current.pending ||
        current.epoch !== cmd.epoch || current.revision !== cmd.revision || !row || row.scale !== cmd.scale ||
        cmd.value < row.minimum || cmd.value > row.maximum) throw Error('Refresh affect settings before changing a value.');
    this.state.value = undefined; this.state.reading = true; this.state.error = ''; this.emit();
    try {
      const { type: _, ...fields } = cmd;
      const next = affectSettings((await gateway.json('/aotx/v1/affect/settings', signal,
        { schema: 'aotx.affect.settings.mutation.v1', ...fields })).value);
      if (next.epoch !== current.epoch || BigInt(next.revision) !== BigInt(current.revision) + 1n ||
          next.settings.find(s => s.key === cmd.key)?.value !== cmd.value) throw Error('The setting readback does not match the change.');
      this.state.value = next;
    } catch (error) {
      if (error instanceof GatewayError && error.status === 403) this.state.denied = true;
      this.state.error = `${error instanceof Error ? error.message : 'The setting result is unknown.'} Refresh before another change. The request was not repeated.`;
      throw error;
    } finally { this.state.reading = false; this.emit(); }
  }
}
