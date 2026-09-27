// SPDX-License-Identifier: Apache-2.0
// Check the visible desktop against an operator-supplied live gateway.
// Inputs: private JSON config with url and token, output folder. Output: receipt. Exit: 0 pass, 1 failure.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath) throw Error('Supply a private gateway config and output folder.');
const config = JSON.parse(readFileSync(configPath, 'utf8')), output = resolve(outputPath);
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), 'prism-live-'));
const env = { ...process.env, PRISM_STATE_DIR: temporary }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: resolve('node_modules/electron/dist/electron'), args: ['.'], env });
const report = { checks: [], turns: [], state: temporary };
try {
  const page = await app.firstWindow(); await page.getByText('Conversation workspace', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Connection', exact: true }).click();
  await page.getByLabel('Gateway URL', { exact: true }).fill(config.url);
  await page.getByLabel('Bearer token', { exact: true }).fill(config.token);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByText('Gateway connected.', { exact: true }).waitFor();
  report.checks.push('Live capability discovery');
  await page.getByRole('button', { name: 'Close connection', exact: true }).click();
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByLabel('Maximum output tokens', { exact: true }).fill('64');
  await page.getByLabel('Temperature', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  await page.getByRole('button', { name: 'Close models', exact: true }).click();
  await page.getByRole('button', { name: '+ New conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
  for (const prompt of ['The check color is blue. Reply with the check color only.', 'What check color did I give you? Reply with that color only.']) {
    await page.getByLabel('Message', { exact: true }).fill(prompt);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.waitForFunction(n => document.querySelectorAll('.phase-completed').length === n, report.turns.length + 1, { timeout: 180000 });
    const state = (await page.evaluate(() => window.prism.command({ type: 'state' }))).state;
    const turn = state.project.conversations[0].turns.at(-1);
    assert.ok(turn.reply.trim()); assert.ok(turn.handle); assert.equal(turn.phase, 'completed'); assert.equal(state.saved, true);
    const response = await fetch(`${config.url}/aotx/v1/requests/${turn.handle}`, { headers: { Authorization: `Bearer ${config.token}` } });
    assert.equal(response.status, 200); const native = await response.json();
    assert.equal(Buffer.from(native.output.bytes, 'base64').toString(), turn.reply);
    report.turns.push({ handle: turn.handle, reply: turn.reply, cursor: turn.cursor, usage: turn.usage });
    report.checks.push('Exact native output equals visible saved reply');
  }
  assert.ok(report.turns.every(t => /blue/i.test(t.reply)));
  report.checks.push('Two-turn history retains the stated color');
  await page.screenshot({ path: join(output, 'live-conversation.png') });
  await page.getByRole('button', { name: 'Connection', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  report.status = 'PASS';
} finally {
  await app.close(); writeFileSync(join(output, 'live.json'), JSON.stringify(report, null, 2));
}
