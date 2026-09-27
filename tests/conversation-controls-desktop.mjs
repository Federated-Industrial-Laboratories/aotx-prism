// SPDX-License-Identifier: Apache-2.0
// Exercise the visible shared workspace and exact recovery with isolated local fixtures.
// Inputs: built app and optional PRISM_TEST_OUTPUT. Output: check receipt. Exit: 0 pass, 1 failure.
import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { PromptFixture } from './prompt-fixture.ts';
import { settings } from './affect-fixture.ts';
import { DEFAULT_PROMPT } from '../shared/conversation.ts';
import { ProjectStore } from '../desktop/storage.ts';
import { caps, token } from './fixture.ts';
import { waitState } from './ui.mjs';
const root = mkdtempSync(join(tmpdir(), 'prism-shared-ui-')), directory = join(root, 'desktop'), project = join(directory, 'Workspace');
mkdirSync(project, { recursive: true });
const store = new ProjectStore(project), fixture = new PromptFixture(42, () => store.readShared());
const output = process.env.PRISM_TEST_OUTPUT; if (output) mkdirSync(output, { recursive: true });
const errors = [], checks = [], writes = [], current = settings(); let refusal = 0;
const discovery = structuredClone(caps); discovery.features.affect_settings = true;
const server = createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return; }
    const parts = []; for await (const part of req) parts.push(part);
    if (req.url === '/aotx/v1/capabilities') { res.end(JSON.stringify(discovery)); return; }
    if (req.url === '/aotx/v1/affect/settings') {
      if (parts.length) {
        const cmd = JSON.parse(Buffer.concat(parts).toString()); writes.push(cmd);
        if (refusal) { res.writeHead(refusal).end('{}'); return; }
        assert.equal(cmd.revision, current.revision);
        current.settings.find(s => s.key === cmd.key).value = cmd.value;
        current.revision = String(BigInt(current.revision) + 1n);
      }
      res.end(JSON.stringify(current)); return;
    }
    const result = await fixture.value(req.url, parts.length ? Buffer.concat(parts).toString() : undefined);
    res.writeHead(result.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(result.value));
  } catch (error) { if (error.message !== 'Lost admission') errors.push(error.message); req.socket.destroy(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, PRISM_STATE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
let app, page;
async function launch() {
  app = await electron.launch({ chromiumSandbox: true, executablePath: resolve('node_modules/electron/dist/electron'), args: ['.'], env });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Project', exact: true }).waitFor();
}
async function connect() {
  await page.getByRole('button', { name: 'Connection', exact: true }).click();
  await page.getByLabel('Gateway URL', { exact: true }).fill(url); await page.getByLabel('Bearer token', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Connect', exact: true }).click(); await waitState(page, s => s.connected);
  await page.getByRole('button', { name: 'Close connection', exact: true }).click();
  await page.getByRole('button', { name: 'CCIR workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Open shared workspace', exact: true }).click(); await waitState(page, s => s.shared.connected);
}
async function check(name, work) { await work(); checks.push(name); console.log(`PASS ${name}`); }
try {
  await launch(); await connect();
  await page.getByRole('button', { name: 'Close shared', exact: true }).click();
  await check('ordinary setup retains explicit and blank instructions in dockable windows', async () => {
    await page.getByRole('button', { name: '+ New conversation', exact: true }).click();
    assert.equal(await page.getByLabel('System prompt', { exact: true }).inputValue(), DEFAULT_PROMPT);
    await page.getByLabel('New conversation name', { exact: true }).fill('Reference notes');
    await page.getByLabel('System prompt', { exact: true }).fill('Use the project reference. €');
    await page.getByRole('button', { name: 'Dock setup', exact: true }).click();
    await page.getByRole('button', { name: 'Maximize setup', exact: true }).click();
    const promptBox = await page.getByLabel('System prompt', { exact: true }).boundingBox();
    const nameBox = await page.getByLabel('New conversation name', { exact: true }).boundingBox();
    assert.ok(promptBox.width >= nameBox.width - 2 && promptBox.height >= 140);
    if (output) await page.screenshot({ path: join(output, 'setup-silver.png') });
    assert.equal(await page.locator('dialog, [aria-modal="true"]').count(), 0);
    await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
    const s = await waitState(page, s => s.project.conversations.length === 1);
    assert.equal(s.project.conversations[0].systemPrompt, 'Use the project reference. €');
    await page.getByRole('button', { name: '+ New conversation', exact: true }).click();
    await page.getByLabel('System prompt', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
    const blank = await waitState(page, s => s.project.conversations.length === 2);
    assert.equal(blank.project.conversations[1].systemPrompt, '');
  });
  await check('CCIR setup sends exact instructions and reads the selected prompt', async () => {
    await page.getByRole('button', { name: 'CCIR workspace', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(fixture.space) }).click();
    await page.getByRole('button', { name: new RegExp(fixture.conversation) }).click();
    await waitState(page, s => s.shared.prompt?.text === fixture.prompt);
    await page.getByRole('button', { name: 'New CCIR conversation', exact: true }).click();
    assert.equal(await page.getByLabel('Conversation type', { exact: true }).inputValue(), 'shared');
    await page.getByLabel('System prompt', { exact: true }).fill('Follow the current request. €');
    await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
    await waitState(page, s => s.shared.records[0]?.result?.saved_terminal && !s.shared.watching.length);
    assert.equal(JSON.parse(fixture.posts[0]).system_prompt, 'Follow the current request. €');
    await page.getByRole('button', { name: 'Close shared', exact: true }).click();
  });
  await check('runtime settings report exact readback and reject uncertain changes', async () => {
    await page.getByRole('button', { name: 'Affect', exact: true }).click(); await waitState(page, s => s.affect.value?.revision === '0');
    await page.getByLabel('Affect setting', { exact: true }).selectOption('affect.decay_fast');
    await page.getByLabel('Affect value', { exact: true }).fill('0.25');
    await page.getByRole('button', { name: 'Apply setting', exact: true }).click(); await waitState(page, s => s.affect.value?.revision === '1');
    assert.equal(writes[0].value, 2500); assert.equal(writes[0].scale, 10000);
    refusal = 409; await page.getByLabel('Affect value', { exact: true }).fill('0.3');
    await page.getByRole('button', { name: 'Apply setting', exact: true }).click(); await waitState(page, s => s.affect.error.includes('not repeated'));
    assert.equal(writes.length, 2); assert.equal(await page.getByRole('button', { name: 'Apply setting', exact: true }).count(), 0);
    refusal = 0; current.writable = false;
    await page.getByRole('button', { name: 'Refresh affect settings', exact: true }).click(); await waitState(page, s => s.affect.value?.writable === false);
    assert.equal(await page.getByRole('button', { name: 'Apply setting', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Maximize affect', exact: true }).click();
    await page.getByLabel('Theme', { exact: true }).selectOption('graphite');
    if (output) await page.screenshot({ path: join(output, 'affect-graphite.png') });
    await page.getByRole('button', { name: 'Close affect', exact: true }).click();
  });
  await check('activity retains readable output without a visualization', async () => {
    await page.getByRole('button', { name: 'Windows', exact: true }).click();
    await page.locator('.menu-popup').getByRole('button', { name: 'Activity', exact: true }).click();
    assert.equal(await page.locator('canvas').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Show visualization', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Close activity', exact: true }).click();
  });
  assert.deepEqual(errors, []);
  if (output) writeFileSync(join(output, 'desktop.json'), JSON.stringify({ checks, errors, posts: fixture.posts.length, writes }, null, 2));
} catch (error) {
  if (app && output) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  store.close(); rmSync(root, { recursive: true, force: true });
}
