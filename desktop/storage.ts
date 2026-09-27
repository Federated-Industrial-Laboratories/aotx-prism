// SPDX-License-Identifier: Apache-2.0
// Store bounded project history in private SQLite transactions and read selected files.
import { DatabaseSync } from 'node:sqlite';
import { lstatSync, mkdirSync, realpathSync, opendirSync, openSync, closeSync,
  fstatSync, readSync, constants, chmodSync } from 'node:fs';
import { join, basename } from 'node:path';
import { MAX_PROJECT, project } from '../shared/validate.js';
import type { Project, FileEntry } from '../shared/types.js';
export function emptyProject(name: string): Project {
  return { schema: 1, name: name.slice(0, 120) || 'Project', endpoint: '', model: '',
    maxTokens: 128, temperature: 0.7, conversations: [] };
}
export class ProjectStore {
  readonly folder: string;
  private db!: DatabaseSync;
  private readonly directoryFd: number;
  private readonly anchoredFolder: string;
  private revision = 0;
  constructor(folder: string) {
    this.folder = realpathSync(folder);
    this.directoryFd = openSync(this.folder, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    this.anchoredFolder = `/proc/self/fd/${this.directoryFd}`;
    try { this.openDatabase(); } catch (error) { closeSync(this.directoryFd); throw error; }
  }
  private openDatabase(): void {
    const directory = join(this.anchoredFolder, '.prism');
    try { mkdirSync(directory, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077))
      throw Error('The project metadata folder must be private and owned by this account.');
    const path = join(directory, 'project.sqlite3');
    for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
      try {
        const file = lstatSync(candidate);
        if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.uid !== process.getuid?.())
          throw Error('Invalid project database file.');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    this.db = new DatabaseSync(path, { timeout: 2000, enableDoubleQuotedStringLiterals: false, allowExtension: false });
    try {
      chmodSync(path, 0o600);
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
      if (version.user_version !== 0 && version.user_version !== 1) throw Error('Unsupported project database version.');
      this.db.exec('CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL) STRICT; PRAGMA user_version=1;');
      this.db.prepare('INSERT OR IGNORE INTO project VALUES (1, 0, ?)').run(JSON.stringify(emptyProject(basename(this.folder))));
    } catch (error) { this.db.close(); throw error; }
  }
  private checkFolder(): void {
    let current;
    try { current = lstatSync(this.folder); } catch { throw Error('The project folder moved or changed. Reopen it.'); }
    const opened = fstatSync(this.directoryFd);
    if (!current.isDirectory() || current.dev !== opened.dev || current.ino !== opened.ino)
      throw Error('The project folder moved or changed. Reopen it.');
  }
  read(): Project {
    this.checkFolder();
    const row = this.db.prepare('SELECT revision, length(CAST(data AS BLOB)) AS bytes, CASE WHEN length(CAST(data AS BLOB))<=16777216 THEN data END AS data FROM project WHERE id=1').get() as { revision: number; bytes: number; data: string } | undefined;
    if (!row || row.bytes > MAX_PROJECT) throw Error('Project data is missing or exceeds the size limit.');
    const value = project(JSON.parse(row.data));
    this.revision = row.revision;
    return value;
  }
  write(value: Project): void {
    this.checkFolder();
    project(value);
    const data = JSON.stringify(value);
    if (Buffer.byteLength(data) > MAX_PROJECT) throw Error('The project history reached its storage limit.');
    const result = this.db.prepare('UPDATE project SET data=?, revision=revision+1 WHERE id=1 AND revision=?').run(data, this.revision);
    if (result.changes !== 1) throw Error('Another application changed this project. Reopen it before writing.');
    this.revision++;
  }
  files(): FileEntry[] {
    this.checkFolder();
    const directory = opendirSync(this.anchoredFolder), files: FileEntry[] = [];
    try {
      for (let inspected = 0; inspected < 4096 && files.length < 128; inspected++) {
        const entry = directory.readSync(); if (!entry) break;
        if (entry.name.startsWith('.') || (!entry.isFile() && !entry.isDirectory())) continue;
        try {
          const info = lstatSync(join(this.anchoredFolder, entry.name));
          if (info.isFile() || info.isDirectory()) files.push({ name: entry.name,
            kind: info.isDirectory() ? 'directory' : 'file', bytes: info.size });
        } catch { /* Files can disappear while a directory is read. */ }
      }
    } finally { directory.closeSync(); }
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }
  readFile(name: string): string {
    this.checkFolder();
    if (!name || /[\\/\0]/.test(name) || name.startsWith('.')) throw Error('Select a project file.');
    const fd = openSync(join(this.anchoredFolder, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = fstatSync(fd);
      if (!info.isFile() || info.size > 131072) throw Error('Text previews require a regular file of at most 128 KiB.');
      const bytes = Buffer.alloc(131073); let length = 0, count = 0;
      do { count = readSync(fd, bytes, length, bytes.length - length, null); length += count; } while (count && length < bytes.length);
      if (length > 131072) throw Error('The text file exceeds 128 KiB.');
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    } finally { closeSync(fd); }
  }
  close(): void { try { this.db.close(); } finally { closeSync(this.directoryFd); } }
}
