// SPDX-License-Identifier: Apache-2.0
// Verify project isolation, revision conflicts, bounded previews and corrupt data refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ProjectStore } from '../desktop/storage.ts';
for (const count of [1, 64]) test(`round-trip ${count} distinct conversations`, () => {
  const folder = mkdtempSync(join(tmpdir(), 'prism-storage-'));
  try {
    let store = new ProjectStore(folder), project = store.read();
    project.conversations = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), title: `Conversation ${i}`, turns: [{ id: randomUUID(), prompt: `Prompt ${i}`, model: 'text', endpoint: 'http://127.0.0.1:1',
      phase: 'completed', handle: 'req-0000000000000001-' + i.toString(16).padStart(32, '0'), epoch: '1',
      bytes: Buffer.from(`Reply ${i}`).toString('base64'), cursor: Buffer.byteLength(`Reply ${i}`), reply: `Reply ${i}`,
      error: '', created: '2026-01-01T00:00:00Z', cancelRequested: false }] }));
    store.write(project); store.close(); store = new ProjectStore(folder);
    assert.deepEqual(store.read(), project); store.close();
    assert.equal(statSync(join(folder, '.prism')).mode & 0o077, 0);
    assert.equal(statSync(join(folder, '.prism/project.sqlite3')).mode & 0o077, 0);
  } finally { rmSync(folder, { recursive: true }); }
});
test('conflicting writers preserve the first committed state', () => {
  const folder = mkdtempSync(join(tmpdir(), 'prism-conflict-'));
  try {
    const a = new ProjectStore(folder), b = new ProjectStore(folder), x = a.read(), y = b.read();
    x.name = 'First'; a.write(x); y.name = 'Second'; assert.throws(() => b.write(y), /Another application/);
    assert.equal(a.read().name, 'First'); a.close(); b.close();
  } finally { rmSync(folder, { recursive: true }); }
});
test('previews refuse links, traversal, oversized and invalid text files', () => {
  const folder = mkdtempSync(join(tmpdir(), 'prism-files-'));
  try {
    const store = new ProjectStore(folder); store.read(); writeFileSync(join(folder, 'readme.txt'), 'Local file');
    symlinkSync('/etc/passwd', join(folder, 'link')); writeFileSync(join(folder, 'large.txt'), Buffer.alloc(131073));
    writeFileSync(join(folder, 'binary'), Buffer.from([255]));
    assert.equal(store.readFile('readme.txt'), 'Local file');
    for (const name of ['../outside', '.prism', 'link', 'large.txt', 'binary']) assert.throws(() => store.readFile(name));
    assert.ok(!store.files().some(f => f.name === 'link')); store.close();
  } finally { rmSync(folder, { recursive: true }); }
});
test('metadata links and corrupt stored projects are refused', () => {
  const folder = mkdtempSync(join(tmpdir(), 'prism-corrupt-'));
  try {
    const outside = join(folder, 'outside'); mkdirSync(outside); symlinkSync(outside, join(folder, '.prism'));
    assert.throws(() => new ProjectStore(folder), /private/); rmSync(join(folder, '.prism'));
    const store = new ProjectStore(folder); store.read(); store.close();
    const db = new DatabaseSync(join(folder, '.prism/project.sqlite3')); db.exec("UPDATE project SET data='{}'"); db.close();
    const broken = new ProjectStore(folder); assert.throws(() => broken.read(), /version/); broken.close();
  } finally { rmSync(folder, { recursive: true }); }
});
for (const count of [1, 64]) test(`refuse moved project roots and inconsistent output across ${count} files and turns`, async () => {
  const { renameSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'prism-integrity-')), folder = join(root, 'project'), outside = join(root, 'outside');
  mkdirSync(folder); mkdirSync(outside);
  try {
    const store = new ProjectStore(folder), project = store.read();
    for (let i = 0; i < count; i++) {
      writeFileSync(join(folder, `file-${i}.txt`), `Inside ${i}`); writeFileSync(join(outside, `file-${i}.txt`), `Outside ${i}`);
      project.conversations.push({ id: randomUUID(), title: `Conversation ${i}`, turns: [{ id: randomUUID(), prompt: `Prompt ${i}`,
        model: 'text', endpoint: 'http://127.0.0.1:1', phase: 'completed', bytes: Buffer.from(`Device ${i}`).toString('base64'),
        cursor: Buffer.byteLength(`Device ${i}`), reply: `Device ${i}`, error: '', created: 'test', cancelRequested: false }] });
    }
    store.write(project); store.close();
    for (let i = 0; i < count; i++) {
      const invalid = structuredClone(project); invalid.conversations[i].turns[0].reply = `Replaced ${i}`;
      const db = new DatabaseSync(join(folder, '.prism/project.sqlite3'));
      db.prepare('UPDATE project SET data=? WHERE id=1').run(JSON.stringify(invalid)); db.close();
      const reader = new ProjectStore(folder); assert.throws(() => reader.read(), /does not match/); reader.close();
    }
    const selected = new ProjectStore(folder);
    renameSync(folder, join(root, 'moved')); symlinkSync(outside, folder);
    for (let i = 0; i < count; i++) assert.throws(() => selected.readFile(`file-${i}.txt`), /moved or changed/);
    assert.throws(() => selected.files(), /moved or changed/);
    assert.throws(() => selected.write(project), /moved or changed/); selected.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
