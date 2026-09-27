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
import { SharedFixture } from './shared-fixture.ts';
import { ProjectStore } from '../desktop/storage.ts';
import { caps, token } from './fixture.ts';
import { waitState } from './ui.mjs';
const root = mkdtempSync(join(tmpdir(), 'prism-shared-ui-')), directory = join(root, 'desktop'), project = join(directory, 'Workspace');
mkdirSync(project, { recursive: true });
const store = new ProjectStore(project), fixture = new SharedFixture(42, () => store.readShared());
const output = process.env.PRISM_TEST_OUTPUT; if (output) mkdirSync(output, { recursive: true });
const errors = [], checks = [];
const server = createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return; }
    const parts = []; for await (const part of req) parts.push(part);
    if (req.url === '/aotx/v1/capabilities') { res.end(JSON.stringify(caps)); return; }
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
  await check('shared scope selection and exact UTF-8 result', async () => {
    await page.getByRole('button', { name: new RegExp(fixture.space) }).click();
    await page.getByRole('button', { name: new RegExp(fixture.conversation) }).click();
    await page.getByLabel('Shared message', { exact: true }).fill('Shared interface check');
    await page.getByRole('button', { name: 'Send shared input', exact: true }).click();
    const s = await waitState(page, s => s.shared.records.at(-1)?.result?.saved_terminal && !s.shared.watching.length);
    assert.equal(s.shared.records[0].result.status, 200);
    assert.equal(await page.locator('.shared-message').last().locator('p').innerText(), 'Reply 42: \u20ac');
    assert.equal(fixture.posts.length, 1);
    if (output) await page.screenshot({ path: join(output, 'shared-silver.png') });
  });
  await check('uncertain admission remains exact across desktop restart', async () => {
    fixture.lose = true;
    await page.getByLabel('Shared message', { exact: true }).fill('Retain this distinct request across restart');
    await page.getByRole('button', { name: 'Send shared input', exact: true }).click();
    const before = await waitState(page, s => s.shared.records.length === 2 && !!s.shared.error);
    assert.equal(before.shared.records[1].handle, ''); await app.close(); await launch(); await connect();
    assert.equal(fixture.posts.length, 2);
    const details = page.locator('details').filter({ has: page.getByText('Saved shared requests (2)', { exact: true }) });
    await details.locator('summary').first().click();
    const pending = details.locator('.shared-receipt').filter({ hasText: 'Admission unknown' });
    await pending.getByRole('button', { name: 'Retry exact request', exact: true }).click();
    const after = await waitState(page, s => s.shared.records[1].result?.saved_terminal && !s.shared.watching.length);
    assert.equal(after.shared.records[1].key, before.shared.records[1].key);
    assert.equal(fixture.posts[1], fixture.posts[2]); assert.equal(fixture.sequence, 3);
  });
  await check('saved result read reports expiration and retains local output', async () => {
    const original = fixture.value.bind(fixture); let reads = 0;
    fixture.value = async (path, body) => {
      if (!body && path.includes('/operations/')) { reads++; return { status: 410, value: {} }; }
      return original(path, body);
    };
    await page.getByRole('button', { name: 'Read result', exact: true }).first().click();
    const state = await waitState(page, s => s.shared.error.includes('410') && !s.shared.watching.length);
    assert.equal(reads, 1); assert.equal(state.shared.records[0].result.output.text, 'Reply 42: \u20ac');
    await page.getByText('Shared gateway HTTP 410. The saved request is retained.', { exact: true }).waitFor();
    fixture.value = original;
  });
  await check('graphite, minimum size and floating shared headers remain readable', async () => {
    await page.getByLabel('Theme', { exact: true }).selectOption('graphite');
    await page.getByRole('button', { name: 'Float shared', exact: true }).click();
    const tab = page.locator('.dv-resize-container .dv-tab').filter({ hasText: 'Shared workspace' });
    assert.equal(await tab.count(), 1);
    assert.equal(await tab.evaluate(e => getComputedStyle(e).color !== getComputedStyle(e).backgroundColor), true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 620));
    const bounds = await page.locator('[data-panel="shared"]').boundingBox(); assert.ok(bounds.width > 200 && bounds.height > 100);
    if (output) await page.screenshot({ path: join(output, 'shared-graphite-minimum.png') });
    assert.equal(await page.locator('dialog, [aria-modal="true"]').count(), 0);
  });
  assert.deepEqual(errors, []);
  if (output) writeFileSync(join(output, 'desktop.json'), JSON.stringify({ checks, errors, posts: fixture.posts.length }, null, 2));
} catch (error) {
  if (app && output) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (app) await app.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  store.close(); rmSync(root, { recursive: true, force: true });
}
