// SPDX-License-Identifier: Apache-2.0
// Check installed runtime tools, active model files and the selected GPU.
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './process.js';
import { gpuRows, runtimeProfile, type RuntimeProfile, type RuntimeInspection } from '../../shared/setup.js';
export async function inspect(raw: RuntimeProfile, execute = run): Promise<RuntimeInspection> {
  const p = runtimeProfile(raw);
  for (const path of [p.build, p.gateway, p.folder, ...(p.ccir ? [] : [p.models, p.modules])]) if (!statSync(realpathSync(path)).isDirectory()) throw Error('Select existing runtime directories.');
  for (const path of ['aotx_boot', 'aotx_feed', 'aotx_drain', 'aotx_service', 'aotx_models']) accessSync(join(p.build, path), constants.X_OK);
  accessSync(p.python, constants.X_OK);
  const version = await execute(join(p.build, 'aotx_boot'), ['--version'], p.build, 10000);
  if (!/^aotx 0\.3\.5 profile \S+ arch sm_\d+ slots \d+$/.test(version)) throw Error('This client requires an AOTX 0.3.5 build.');
  const gpus = gpuRows(await execute('/usr/bin/nvidia-smi', ['--query-gpu=uuid,name,memory.free,memory.total', '--format=csv,noheader,nounits'], undefined, 10000));
  if (!gpus.some(g => g.uuid === p.gpu)) throw Error('The selected GPU is not available.');
  let models: string;
  if (p.ccir) {
    const { inspectCcir } = await import('./ccir.js');
    const file = await inspectCcir(p.build, p.ccir, execute);
    if (!file.roles.includes(p.role)) throw Error('The selected model role is absent from the runtime file.');
    models = file.detail;
  } else models = await execute(join(p.build, 'aotx_models'), ['--dir', p.models, 'check'], p.gateway);
  await execute(p.python, ['-I', '-c', 'import sys; sys.path.insert(0, sys.argv[1]); import gateway.__main__', p.gateway], p.gateway, 10000);
  return { version, models, gpus };
}
