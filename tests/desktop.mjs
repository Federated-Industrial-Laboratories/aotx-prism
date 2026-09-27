// SPDX-License-Identifier: Apache-2.0
// Exercise visible desktop workflows with an isolated local HTTP fixture.
// Inputs: built app, display and optional PRISM_TEST_OUTPUT. Output: check receipt. Exit: 0 pass, 1 failure.
import { _electron as electron } from 'playwright';
import { waitState } from './ui.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixture, token } from './fixture.ts';
const temporary = mkdtempSync(join(tmpdir(), 'prism-desktop-'));
const project = join(temporary, 'Local project'); mkdirSync(project); writeFileSync(join(project, 'readme.txt'), 'A local project file.');
const output = process.env.PRISM_TEST_OUTPUT;
if (output) mkdirSync(output, { recursive: true });
const server = await fixture(), checks = [], errors = [];
let app;
const env = { ...process.env, PRISM_STATE_DIR: join(temporary, 'desktop') }; delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  app = await electron.launch({ chromiumSandbox: true, executablePath: process.env.PRISM_TEST_PACKAGE ? resolve(process.env.PRISM_TEST_PACKAGE, 'runtime/electron') : resolve('node_modules/electron/dist/electron'), args: process.env.PRISM_TEST_PACKAGE ? [] : ['.'], env });
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByText('Conversation workspace', { exact: true }).waitFor(); return page;
}
async function check(name, fn) { await fn(); checks.push(name); console.log(`PASS ${name}`); }
try {
  let page = await launch();
  await check('sandbox and optional activity default', async () => {
    const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);
    const renderer=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getOSProcessId());
    assert.match(readFileSync(`/proc/${renderer}/status`,'utf8'),/^Seccomp:\s+2$/m);
    assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.webSecurity, true);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.locator('[data-panel="activity"]').count(), 0);
    assert.equal(await page.locator('dialog, [aria-modal="true"]').count(), 0);
    assert.ok(await page.locator('.brand img').evaluate(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.getByRole('heading', { name: 'Connect to AOTX', exact: true }).count(), 1);
    assert.equal(await page.locator('.shell-cap').getAttribute('aria-hidden'), 'true');
    await page.getByRole('button', { name: 'Project', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Connection');
    await page.keyboard.press('Enter');
    await page.getByLabel('Gateway URL', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close connection', exact: true }).click();
  });
  await check('open project folder and local file preview', async () => {
    await page.getByRole('button', { name: 'Project', exact: true }).click();
    await page.getByLabel('Folder path').fill(project);
    await page.locator('[data-panel="project"]').getByRole('button', { name: 'Open project', exact: true }).click();
    await page.locator('.project-card h2').filter({ hasText: 'Local project' }).waitFor();
    await page.getByRole('button', { name: 'Close project', exact: true }).click();
    await page.getByRole('button', { name: 'Project files Read-only' }).click();
    await page.getByRole('button', { name: 'TXT readme.txt' }).click();
    await page.getByText('A local project file.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close files', exact: true }).click();
  });
  await check('nonmodal setup permits conversation editing and dock resize', async () => {
    await page.getByRole('button', { name: '+ New conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Connection', exact: true }).click();
    await page.getByLabel('Message', { exact: true }).fill('Hello from the desktop.');
    assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'Hello from the desktop.');
    await page.getByRole('button', { name: 'Dock connection', exact: true }).click();
    const before = await page.locator('[data-panel="connection"]').boundingBox();
    const sash = page.locator('.dv-sash-container .dv-sash').filter({ visible: true }).first();
    const box = await sash.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
    const after = await page.locator('[data-panel="connection"]').boundingBox();
    assert.ok(Math.abs(after.width - before.width) > 20);
    await page.getByRole('button', { name: 'Float connection', exact: true }).click();
    assert.equal(await page.locator('.dv-resize-container [data-panel="connection"]').count(), 1);
    const tab = page.locator('.dv-resize-container .dv-tab').filter({ hasText: 'Connection' });
    assert.equal(await tab.count(), 1);
    assert.equal(await tab.evaluate(element => {
      const style = getComputedStyle(element); return style.color !== style.backgroundColor;
    }), true);
    if (output) await page.screenshot({ path: join(output, 'floating-silver.png') });
    await page.getByLabel('Gateway URL', { exact: true }).fill(server.url);
    await page.getByLabel('Bearer token', { exact: true }).fill(token);
    await page.getByRole('button', { name: 'Maximize connection', exact: true }).click();
    await page.getByRole('button', { name: 'Restore connection', exact: true }).click();
    assert.equal(await page.getByLabel('Gateway URL', { exact: true }).inputValue(), server.url);
    assert.equal(await page.getByLabel('Bearer token', { exact: true }).inputValue(), token);
    assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'Hello from the desktop.');
  });
  await check('real IPC and HTTP conversation completes and saves', async () => {
    await page.getByLabel('Gateway URL', { exact: true }).fill(server.url);
    await page.getByLabel('Bearer token', { exact: true }).fill(token);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByText('Gateway connected.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Bearer token', { exact: true }).inputValue(), '');
    await page.getByRole('button', { name: 'Close connection', exact: true }).click();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.locator('.phase-completed').waitFor({ timeout: 20000 });
    assert.equal(await page.locator('.assistant-message pre').innerText(), server.bytes.toString());
    assert.equal(server.calls.filter(c => c.method === 'POST' && c.path.endsWith('/requests')).length, 1);
    if (output) await page.screenshot({ path: join(output, 'conversation-silver.png') });
  });
  await check('theme and optional activity window', async () => {
    await page.getByLabel('Theme', { exact: true }).selectOption('graphite');
    await page.getByRole('button', { name: 'Windows', exact: true }).click();
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await page.getByText('Runtime activity', { exact: true }).waitFor();
    assert.equal(await page.locator('canvas').count(), 0);
    assert.equal(await page.locator('.activity-tile').count(), 3);
    const tab = page.locator('.dv-resize-container .dv-tab').filter({ hasText: 'Activity' });
    assert.equal(await tab.count(), 1);
    assert.equal(await tab.evaluate(element => {
      const style = getComputedStyle(element); return style.color !== style.backgroundColor;
    }), true);
    if (output) await page.screenshot({ path: join(output, 'floating-graphite.png') });
    assert.equal(await page.getByRole('button', { name: 'Show visualization', exact: true }).count(), 0);
    const before = await page.locator('[data-panel="activity"]').boundingBox();
    await page.getByRole('button', { name: 'Maximize activity', exact: true }).click();
    await page.getByRole('button', { name: 'Restore activity', exact: true }).waitFor();
    const larger = await page.locator('[data-panel="activity"]').boundingBox();
    assert.ok(larger.width > before.width + 100);
    if (output) await page.screenshot({ path: join(output, 'activity-graphite.png') });
    await page.getByRole('button', { name: 'Restore activity', exact: true }).click();
    const restored = await page.locator('[data-panel="activity"]').boundingBox();
    assert.ok(Math.abs(restored.width - before.width) < 2);
    assert.equal(await page.locator('.dv-resize-container [data-panel="activity"]').count(), 1);
    assert.equal(await page.locator('canvas').count(), 0);
    await page.getByRole('button', { name: 'Close activity', exact: true }).click();
    assert.equal(await page.locator('canvas').count(), 0);
  });
  await check('native close clears maximization and saves the actual layout', async () => {
    await page.getByRole('button', { name: 'Connection', exact: true }).click();
    await page.getByRole('button', { name: 'Maximize connection', exact: true }).click();
    await page.getByRole('button', { name: 'Close Connection', exact: true }).click();
    await waitState(page, state => !JSON.parse(state.layout).panels.connection);
    await page.getByRole('button', { name: 'Maximize conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Restore conversation', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Restore conversation', exact: true }).click();
  });
  await check('close and reopen the actual saved project', async () => {
    await app.close(); page = await launch();
    await page.getByRole('button', { name: 'Project', exact: true }).click();
    await page.getByLabel('Folder path').fill(project);
    await page.locator('[data-panel="project"]').getByRole('button', { name: 'Open project', exact: true }).click();
    await page.getByRole('button', { name: 'Close project', exact: true }).click();
    await page.locator('.phase-completed').waitFor();
    assert.equal(await page.locator('.assistant-message pre').innerText(), server.bytes.toString());
    assert.equal(await page.getByLabel('Theme', { exact: true }).inputValue(), 'graphite');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 620));
    await page.getByLabel('Message', { exact: true }).fill('A draft in the minimum window size.');
    const composer = await page.getByRole('button', { name: 'Send message', exact: true }).boundingBox();
    assert.ok(composer && composer.y >= 0 && composer.y + composer.height <= (await page.evaluate(() => innerHeight)));
    if (output) await page.screenshot({ path: join(output, 'minimum-graphite.png') });
    const database = readFileSync(join(project, '.prism/project.sqlite3'));
    assert.ok(!database.includes(Buffer.from(token)));
  });
  assert.deepEqual(errors, []); checks.push('no renderer errors');
  if (output) writeFileSync(join(output, 'desktop.json'), JSON.stringify({ package: process.env.PRISM_TEST_PACKAGE || null, checks, errors, source: 'local HTTP fixture; no GPU inference claim' }, null, 2));
} catch (error) {
  if (app && output) await (await app.firstWindow()).screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { if (app) await app.close().catch(() => {}); await server.close(); rmSync(temporary, { recursive: true, force: true }); }
