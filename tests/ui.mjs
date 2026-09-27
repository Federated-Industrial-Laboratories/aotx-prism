// SPDX-License-Identifier: Apache-2.0
// Await desktop IPC snapshots before applying a visible acceptance predicate.
export async function waitState(page, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const { state } = await page.evaluate(() => window.prism.command({ type: 'state' }));
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('The desktop state deadline expired.');
}
