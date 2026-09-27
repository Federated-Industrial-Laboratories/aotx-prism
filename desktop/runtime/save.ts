// SPDX-License-Identifier: Apache-2.0
// Save an owned shared runtime before shutdown and retain exact shutdown request bytes.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Gateway } from '../gateway.js';
import { atomicExport } from '../export.js';
import { participant, receipt, PREFIX, type Receipt } from '../../shared/shared-protocol.js';
export async function saveOwned(url: string, token: string, actor: string, folder: string, signal: AbortSignal) {
  const gateway = new Gateway(url, token), records: { path: string; body: string; result?: unknown }[] = [];
  const persist = () => atomicExport(join(folder, 'shutdown-requests.json'), JSON.stringify(records));
  async function mutate(path: string) {
    const person = participant((await gateway.json(PREFIX + '/participant', signal)).value);
    if (person.participant !== actor) throw Error('The owned participant changed before shutdown.');
    const key = randomBytes(16).toString('hex');
    const body = JSON.stringify({ schema: 'aotx.shared.mutation.v1', lineage: person.lineage, operation_key: key, sequence: person.next_sequence });
    const record: typeof records[number] = { path, body }; records.push(record); persist();
    let raw = (await gateway.json(PREFIX + path, signal, Buffer.from(body), 'application/json')).value;
    let r: Receipt;
    while (true) {
      r = receipt(raw, person.lineage);
      if (r.actor !== actor || r.operation_key !== key || r.sequence !== person.next_sequence || r.operation !== (path === '/participant' ? 1 : 9)) throw Error('The shutdown receipt does not match.');
      record.result = raw; persist();
      if (r.save.error) throw Error('The runtime reports a persistent save error.');
      if (!['accepted', 'queued', 'running'].includes(r.state) && r.saved_terminal) break;
      await delay(250, undefined, { signal });
      raw = (await gateway.json(`${PREFIX}/operations/${r.id}`, signal)).value;
    }
    if (r.state !== 'completed' || r.status !== 200 || !r.accepted || !r.device_committed || !r.saved_admission || r.save.pending_bytes !== '0' ||
        /^0+$/.test(r.save.commit_sha256) || r.save.generation === '0') throw Error('The owned runtime did not confirm a complete save.');
    return r;
  }
  const person = participant((await gateway.json(PREFIX + '/participant', signal)).value);
  if (!person.registered) await mutate('/participant');
  return mutate('/save');
}
