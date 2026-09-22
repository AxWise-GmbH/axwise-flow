#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

if (process.env.FAKE_OMP_ARGS_FILE) {
  appendFileSync(process.env.FAKE_OMP_ARGS_FILE, `${JSON.stringify({
    args: process.argv.slice(2),
    tokenPresent: process.env.ORQANIX_OMP_TOKEN === 'fixture-access-token-1234567890',
    agentDir: process.env.PI_CODING_AGENT_DIR,
  })}\n`);
}

process.stdout.write(`${JSON.stringify({
  type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1], maxFrameBytes: 1_048_576,
})}\n`);

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  const command = JSON.parse(line);
  if (command.type === 'get_state') {
    process.stdout.write(`${JSON.stringify({ id: command.id, type: 'response', command: 'get_state', success: true, data: {
      model: { provider: 'fixture-provider', id: 'fixture-model' }, thinkingLevel: 'medium',
      dumpTools: [{ name: 'read' }, { name: 'lsp' }],
    } })}\n`);
  } else if (command.type === 'prompt') {
    if (command.message.includes('failure-fixture')) {
      process.stdout.write(`${JSON.stringify({ id: command.id, type: 'response', command: 'prompt', success: false, error: 'fixture' })}\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ id: command.id, type: 'response', command: 'prompt', success: true, data: { agentInvoked: true } })}\n`);
      if (command.message.includes('provider-error-fixture')) {
        const message = {
          role: 'assistant',
          content: [],
          stopReason: 'error',
          errorMessage: 'private provider detail must not escape',
        };
        process.stdout.write(`${JSON.stringify({ type: 'agent_start' })}\n`);
        process.stdout.write(`${JSON.stringify({ type: 'message_end', message })}\n`);
        process.stdout.write(
          `${JSON.stringify({ type: 'agent_end', messages: [message], isTerminal: true })}\n`
        );
      } else if (!command.message.includes('timeout-fixture')) {
        if (command.message.includes('edit-file-fixture')) {
          writeFileSync('fixture-change.mjs', 'export const changed = true;\n');
        }
        if (command.message.includes('edit-ignored-fixture')) {
          writeFileSync('private-state/state.txt', 'changed by fixture\n');
        }
        const completion = command.message.includes('secret-output-fixture')
          ? 'AKIAABCDEFGHIJKLMNOP'
          : 'Completed fixture task.';
        process.stdout.write(`${JSON.stringify({ type: 'agent_start' })}\n`);
        process.stdout.write(`${JSON.stringify({ type: 'tool_execution_start', toolName: 'read' })}\n`);
        process.stdout.write(`${JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: completion } })}\n`);
        process.stdout.write(`${JSON.stringify({ type: 'agent_end', messages: [], isTerminal: true })}\n`);
      }
    }
  } else if (command.type === 'abort') {
    process.stdout.write(`${JSON.stringify({ id: command.id, type: 'response', command: 'abort', success: true })}\n`);
  }
}
