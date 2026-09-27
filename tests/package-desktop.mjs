// SPDX-License-Identifier: Apache-2.0
// Verify installed upgrades and exact persistence for distinct conversation batches.
// Inputs: current and previous bundles, display and output path. Output: receipt. Exit: 0 pass, 1 failure.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, token } from './fixture.ts';
import { waitState } from './ui.mjs';
const bundle = resolve(process.env.PRISM_TEST_BUNDLE), previous = resolve(process.env.PRISM_TEST_PREVIOUS);
const output = process.env.PRISM_TEST_OUTPUT;
const old = JSON.parse(readFileSync(join(previous, 'manifest.json')));
const current = JSON.parse(readFileSync(join(bundle, 'manifest.json')));
assert.notEqual(old.source_commit, current.source_commit, 'Use two distinct verified source packages.');
if (output) mkdirSync(output, { recursive: true });
const batches = [];
for (const count of [1, 64]) {
  const root = mkdtempSync(join(tmpdir(), 'prism-upgrade-')), prefix = join(root, 'Local Applications');
  const project = join(root, 'Preserved project'), state = join(root, 'state');
  mkdirSync(project);
  const checks = [], errors = [], env = { ...process.env, PRISM_STATE_DIR: state };
  delete env.ELECTRON_RUN_AS_NODE;
  const server = await fixture(false, 1, true);
  let app, expected;
  function install(source, action = 'install') {
    return execFileSync('python3', [join(source, 'install.py'), action, '--prefix', prefix], { encoding: 'utf8' });
  }
  async function launch() {
    app = await electron.launch({ chromiumSandbox: true, executablePath: join(prefix, 'bin/aotx-prism'), args: [], env });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: 'Project', exact: true }).waitFor();
    assert.equal(await app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox')), false);
    return page;
  }
  async function command(page, value) { return (await page.evaluate(value => window.prism.command(value), value)).state; }
  async function openProject(page) {
    await page.getByRole('button', { name: 'Project', exact: true }).click();
    await page.getByLabel('Folder path').fill(project);
    await page.getByRole('button', { name: 'Open project', exact: true }).click();
    await page.getByRole('button', { name: 'Close project', exact: true }).click();
  }
  async function history(page) {
    const snapshot = await command(page, { type: 'state' });
    assert.equal(snapshot.runtime.phase, 'stopped');
    assert.equal(snapshot.connected, false);
    assert.deepEqual(snapshot.project, expected);
    assert.equal(snapshot.project.conversations.length, count);
    for (const conversation of expected.conversations) {
      const selected = await command(page, { type: 'select', id: conversation.id });
      assert.equal(selected.selected, conversation.id);
      assert.deepEqual(selected.project.conversations.find(c => c.id === selected.selected), conversation);
    }
    await page.getByRole('heading', { name: expected.conversations.at(-1).title, exact: true }).waitFor();
    assert.equal(await page.locator('.assistant-message pre').innerText(), server.bytes.toString());
  }
  async function check(name, work) { await work(); checks.push(name); console.log(`PASS N=${count} ${name}`); }
  try {
    await check('install and create distinct persistent conversations through desktop commands', async () => {
      install(previous);
      const page = await launch(); await openProject(page);
      await command(page, { type: 'connect', url: server.url, token });
      for (let i = 0; i < count; i++) {
        const title = `Retained conversation ${count}-${i}`;
        const created = await command(page, { type: 'newConversation', title });
        const prompt = `Retain project item ${count}-${i}: value ${i * 17 + 3}.`;
        await command(page, { type: 'send', id: created.selected, text: prompt });
        const saved = await waitState(page, state => !state.busy);
        const conversation = saved.project.conversations.find(c => c.id === created.selected);
        assert.equal(conversation.title, title); assert.equal(conversation.turns.length, 1);
        assert.equal(conversation.turns[0].prompt, prompt); assert.equal(conversation.turns[0].phase, 'completed');
        assert.equal(conversation.turns[0].reply, server.bytes.toString());
      }
      expected = (await command(page, { type: 'disconnect' })).project;
      assert.equal(new Set(expected.conversations.map(c => c.id)).size, count);
      assert.equal(new Set(expected.conversations.map(c => c.turns[0].prompt)).size, count);
      assert.equal(server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).length, count);
      await page.getByLabel('Theme', { exact: true }).selectOption('graphite');
      await app.close(); app = undefined;
    });
    await check('upgrade and reopen every retained conversation', async () => {
      install(bundle);
      assert.ok(realpathSync(join(prefix, 'share/aotx-prism/current')).endsWith(current.version + '-' + current.source_commit.slice(0, 12)));
      const page = await launch();
      assert.equal(await page.getByLabel('Theme', { exact: true }).inputValue(), 'graphite');
      await openProject(page); await history(page);
      const profile = { name: 'Unavailable installation', build: join(root, 'absent'), gateway: root, python: '/usr/bin/python3',
        models: root, modules: root, folder: root, gpu: 'GPU-00000000-0000-0000-0000-000000000001', role: 'language' };
      await command(page, { type: 'runtimeStart', profile });
      const failed = await waitState(page, state => state.runtime.phase === 'failed');
      assert.match(failed.runtime.error, /ENOENT/); await command(page, { type: 'runtimeStop' });
      if (output) await page.screenshot({ path: join(output, `upgraded-project-${count}.png`) });
      await app.close(); app = undefined;
    });
    await check('uninstall preserves exact data and reinstall restores every conversation', async () => {
      const paths = [join(project, '.prism/project.sqlite3'), join(state, 'workspace.json')];
      const hashes = () => paths.map(path => createHash('sha256').update(readFileSync(path)).digest('hex'));
      const before = hashes(); install(bundle, 'uninstall'); assert.deepEqual(hashes(), before);
      for (const name of ['bin/aotx-prism', 'share/aotx-prism', 'share/applications/aotx-prism.desktop']) {
        assert.equal(existsSync(join(prefix, name)), false);
      }
      install(bundle); const page = await launch(); await openProject(page); await history(page);
      assert.equal(await page.getByLabel('Theme', { exact: true }).inputValue(), 'graphite');
      await app.close(); app = undefined; install(bundle, 'uninstall');
    });
    assert.deepEqual(errors, []);
    batches.push({ count, checks, errors, conversations: expected.conversations.map(c => ({ id: c.id, title: c.title, prompt: c.turns[0].prompt })) });
  } catch (error) {
    if (app && output) await (await app.firstWindow()).screenshot({ path: join(output, `failure-${count}.png`) }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close().catch(() => {});
    await server.close(); rmSync(root, { recursive: true, force: true });
  }
}
if (output) writeFileSync(join(output, 'upgrade.json'), JSON.stringify({ batches, previous: old.source_commit,
  current: current.source_commit, launcher: 'installed shell launcher', sandbox: true, source: 'local HTTP fixture; no GPU inference' }, null, 2));
