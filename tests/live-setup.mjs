// SPDX-License-Identifier: Apache-2.0
// Exercise an owned runtime through the visible desktop with installed operator assets.
// Inputs: local profile JSON, output folder and optional JPEG. Output: receipt. Exit: 0 pass, 1 failure.
import { _electron as electron } from 'playwright';
import { waitState } from './ui.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const [profilePath, outputPath, image] = process.argv.slice(2);
if (!profilePath || !outputPath) throw Error('Supply a local runtime profile and output folder.');
const profile = JSON.parse(readFileSync(profilePath, 'utf8')), output = resolve(outputPath);
mkdirSync(output, { recursive: true });
const statePath = mkdtempSync(join(tmpdir(), 'prism-owned-view-')), env = { ...process.env, PRISM_STATE_DIR: statePath }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: resolve('node_modules/electron/dist/electron'), args: ['.'], env });
const receipt = { statePath, checks: [], turns: [], errors: [] }; let runtime;
try {
  const page = await app.firstWindow(); page.on('pageerror', error => receipt.errors.push(error.message));
  await page.getByText('Conversation workspace', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Runtime setup', exact: true }).click();
  const fields = { name: 'Runtime profile name', build: 'AOTX build folder', gateway: 'Gateway package folder', python: 'Gateway Python', models: 'Model store', modules: 'AOTX modules', folder: 'Runtime storage folder' };
  for (const [key, label] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(profile[key]);
  await page.getByRole('button', { name: 'Refresh GPUs', exact: true }).click();
  await page.getByLabel('Runtime GPU', { exact: true }).selectOption(profile.gpu); await page.getByLabel('Active model role', { exact: true }).selectOption(profile.role);
  await page.getByRole('button', { name: 'Save runtime profile', exact: true }).click();
  await page.getByRole('button', { name: 'Start runtime', exact: true }).click();
  await waitState(page, state => ['ready', 'failed'].includes(state.runtime.phase), 300000);
  runtime = (await page.evaluate(() => window.prism.command({ type: 'state' }))).state.runtime;
  if (runtime.phase !== 'ready') throw Error(`${runtime.error}\n${runtime.logs}`);
  receipt.runtime = runtime; receipt.checks.push('Installed build, model check and explicit GPU startup');
  await page.getByRole('button', { name: 'Connect owned runtime', exact: true }).click(); await page.getByText('Gateway connected.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close runtime', exact: true }).click();
  const state = (await page.evaluate(() => window.prism.command({ type: 'state' }))).state; receipt.capabilities = state.capabilities;
  await page.getByRole('button', { name: 'Models', exact: true }).click(); await page.getByLabel('Maximum output tokens', { exact: true }).fill('8');
  await page.getByLabel('Temperature', { exact: true }).fill('0'); await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  await page.getByLabel('Generation profile name', { exact: true }).fill('Bounded response'); await page.getByRole('button', { name: 'Save current settings', exact: true }).click();
  await page.getByRole('button', { name: 'Close models', exact: true }).click();
  await page.getByRole('button', { name: '+ New conversation', exact: true }).click();
  async function turn(prompt) {
    await page.getByLabel('Message', { exact: true }).fill(prompt); await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await waitState(page, state => !state.busy, 180000);
    const current = (await page.evaluate(() => window.prism.command({ type: 'state' }))).state;
    const saved = current.project.conversations.find(c => c.id === current.selected).turns.at(-1);
    assert.equal(saved.phase, 'completed', saved.error); assert.ok(saved.reply.trim()); assert.equal(current.saved, true);
    assert.equal(await page.locator('.assistant-message pre').last().innerText(), saved.reply);
    assert.equal(Buffer.from(saved.bytes, 'base64').toString(), saved.reply); receipt.turns.push(saved);
  }
  if (!process.env.PRISM_STOP_CHECK) { await turn('Reply with one short greeting.'); receipt.checks.push('Owned gateway text reply equals saved and visible bytes'); }
  if (image && !process.env.PRISM_STOP_CHECK) {
    assert.ok(state.capabilities.models.find(m => m.id === state.project.model).input.includes('image'));
    await page.getByRole('button', { name: '+ New conversation', exact: true }).click();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, resolve(image));
    await page.getByRole('button', { name: 'Attach media', exact: true }).click();
    await waitState(page, state => state.attachments.length === 1, 180000);
    const attached = (await page.evaluate(() => window.prism.command({ type: 'state' }))).state.attachments[0];
    assert.equal(attached.sha256, createHash('sha256').update(readFileSync(image)).digest('hex'));
    await turn('Describe this image briefly.'); assert.equal(receipt.turns.at(-1).media[0].id, attached.id);
    const sources = await page.evaluate(() => window.prism.command({ type: 'listMedia' })); assert.ok(sources.media.some(m => m.id === attached.id));
    await page.evaluate(id => window.prism.command({ type: 'deleteMedia', id }), attached.id);
    const after = await page.evaluate(() => window.prism.command({ type: 'listMedia' })); assert.ok(!after.media.some(m => m.id === attached.id));
    receipt.checks.push('Advertised JPEG upload, exact source digest, request reference and explicit removal');
  }
  await page.screenshot({ path: join(output, 'owned-conversation.png') });
  await page.getByRole('button', { name: 'Runtime setup', exact: true }).click(); await page.getByRole('button', { name: 'Stop owned runtime', exact: true }).click();
  await waitState(page, state => state.runtime.phase === 'stopped', 70000);
  const stopped = (await page.evaluate(() => window.prism.command({ type: 'state' }))).state;
  assert.equal(stopped.connected, false); assert.ok(stopped.project.profiles.some(p => p.name === 'Bounded response'));
  receipt.processResult = JSON.parse(readFileSync(join(runtime.folder, 'result.json'), 'utf8'));
  assert.equal(receipt.processResult.status, 'stopped'); assert.ok(receipt.processResult.children.length >= 3);
  assert.ok(receipt.processResult.children.every(child => child.exit === 0 && child.signal === null));
  receipt.checks.push('Owned stop disconnects and verifies clean child exits'); assert.deepEqual(receipt.errors, []); receipt.status = 'PASS';
} catch (error) { receipt.status = 'FAIL'; receipt.failure = error.message; await (await app.firstWindow()).screenshot({ path: join(output, 'failure.png') }); throw error; }
finally { await app.close(); writeFileSync(join(output, 'live.json'), JSON.stringify(receipt, null, 2)); }
