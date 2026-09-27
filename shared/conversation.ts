// SPDX-License-Identifier: Apache-2.0
// Supply a neutral default for explicitly created conversations.
export const DEFAULT_PROMPT = 'Respond to the current request using the available context. Distinguish facts from uncertainty. Ask for clarification when needed.';
export const PROMPT_BYTES = 4096;
export function systemPrompt(value: unknown, limit = PROMPT_BYTES): string {
  if (typeof value !== 'string' || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value) || new TextEncoder().encode(value).length > limit)
    throw Error(`The system prompt must contain at most ${limit.toLocaleString('en-US')} UTF-8 bytes.`);
  return value;
}
