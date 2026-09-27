// SPDX-License-Identifier: Apache-2.0
// Save local machine profiles and recent folders without project credentials.
import { lstatSync, mkdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeProfile, type LocalCatalog } from '../shared/setup.js';
import { object, text } from '../shared/validate.js';
export class Catalog {
  value: LocalCatalog = { schema: 1, recent: [], runtimes: [] };
  private file?: string;
  constructor(directory?: string) {
    if (!directory) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw Error('The local settings folder must be private.');
    this.file = join(directory, 'catalog.json');
    try {
      const stat = lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576 || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw Error('Invalid local catalog file.');
      const raw = object(JSON.parse(readFileSync(this.file, 'utf8')));
      if (raw.schema !== 1 || !Array.isArray(raw.recent) || raw.recent.length > 20 || !Array.isArray(raw.runtimes) || raw.runtimes.length > 32) throw Error('Unsupported local catalog.');
      this.value = { schema: 1, recent: raw.recent.map(p => text(p, 4096)), runtimes: raw.runtimes.map(runtimeProfile) };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  edit(change: (value: LocalCatalog) => void) {
    const next = structuredClone(this.value); change(next);
    if (this.file) {
      const temporary = `${this.file}.${randomUUID()}`;
      const fd = openSync(temporary, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(next)); fsyncSync(fd); } finally { closeSync(fd); }
      try { renameSync(temporary, this.file); } finally { try { unlinkSync(temporary); } catch { /* The atomic rename removes the temporary file. */ } }
    }
    this.value = next;
  }
  recent(folder: string) { this.edit(v => { v.recent = [folder, ...v.recent.filter(p => p !== folder)].slice(0, 20); }); }
}
