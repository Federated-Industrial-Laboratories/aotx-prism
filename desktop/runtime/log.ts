// SPDX-License-Identifier: Apache-2.0
// Withhold possible credential prefixes until output chunks can be safely joined.
import { StringDecoder } from 'node:string_decoder';
export class PrivateLog {
  private pending = ''; private decoder = new StringDecoder('utf8');
  constructor(private secret: string) { if (!secret) throw Error('A log credential is required.'); }
  append(bytes: Buffer): string {
    this.pending += this.decoder.write(bytes);
    this.pending = this.pending.replaceAll(this.secret, '[credential]');
    let keep = Math.min(this.secret.length - 1, this.pending.length);
    while (keep && !this.secret.startsWith(this.pending.slice(-keep))) keep--;
    const safe = this.pending.slice(0, this.pending.length - keep); this.pending = this.pending.slice(this.pending.length - keep);
    return safe;
  }
  finish(): string {
    const safe = this.append(Buffer.from(this.decoder.end()));
    const tail = this.pending ? '[credential fragment]' : ''; this.pending = ''; return safe + tail;
  }
}
