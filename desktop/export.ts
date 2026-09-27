// SPDX-License-Identifier: Apache-2.0
// Replace only the explicitly selected export path with a private complete file.
import { openSync, closeSync, writeFileSync, fsyncSync, renameSync, unlinkSync, lstatSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export function atomicExport(path: string, data: string) {
  try { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw Error('Select a regular export file.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temporary = `${path}.${randomUUID()}`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(temporary, path); } finally { try { unlinkSync(temporary); } catch { /* A successful rename consumes the temporary file. */ } }
}
