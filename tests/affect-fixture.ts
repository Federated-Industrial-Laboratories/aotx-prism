// SPDX-License-Identifier: Apache-2.0
// Supply bounded setting rows and exact operator revisions for interface checks.
import { affectKeys } from '../shared/affect.ts';
export function settings(epoch = '1', revision = '0', writable = true) {
  return { schema: 'aotx.affect.settings.v1', epoch, revision, writable, pending_local: 0,
    scope: 'runtime', effect: 'next_sequence', paths: { native: true, shared: true, ordinary_http: false },
    settings: affectKeys.map((key, i) => ({ key, value: i < 2 ? 0 : 5000,
      minimum: 0, maximum: i < 2 ? 1 : 10000, scale: i < 2 ? 1 : 10000 })) };
}
