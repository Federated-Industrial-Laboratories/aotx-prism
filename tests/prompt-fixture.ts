// SPDX-License-Identifier: Apache-2.0
// Add prompt capability and exact scoped readback to the shared fixture.
import { SharedFixture } from './shared-fixture.ts';
export class PromptFixture extends SharedFixture {
  prompt: string | null = 'Use the selected project. €';
  promptEnabled = true;
  promptStatus = 200;
  promptId = '';
  override async value(path: string, body?: string) {
    if (!body && path.endsWith('/prompt')) return { status: this.promptStatus, value: {
      ...this.base(), id: this.promptId || this.conversation, space: this.space,
      prompt: { schema: 'aotx.conversation.prompt.v1', mode: this.prompt === null ? 'runtime' : 'explicit',
        system_prompt: this.prompt, bytes: this.prompt === null ? 0 : Buffer.byteLength(this.prompt), mutable: false } } };
    const result = await super.value(path, body);
    if (path.endsWith('/capabilities') && this.promptEnabled) Object.assign(result.value, {
      features: { conversation_prompt: true }, limits: { system_prompt_bytes: 2048 } });
    return result;
  }
}
