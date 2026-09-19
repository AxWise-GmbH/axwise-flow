import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { createMcpTools, serveMcp } from '../src/mcp.mjs';

test('tool wrapper binds the configured workspace and rejects invalid tasks', async () => {
  let starts = 0;
  const modes = [];
  const call = createMcpTools({
    config: { workspace: '/fixed/workspace' },
    inspect: async () => {
      starts += 1;
      return { status: 'available' };
    },
    run: async ({ mode }) => {
      starts += 1;
      modes.push(mode);
      return { status: 'completed' };
    },
  });
  assert.equal(
    (await call('orqanix_engineering_inspect', { task: '', cwd: '/' })).isError,
    true
  );
  assert.equal((await call('orqanix_engineering_edit', { task: '' })).isError, true);
  assert.equal((await call('orqanix_engineering_edit', { task: 'x', timeout_seconds: 1 })).isError, true);
  assert.equal(starts, 0);
  assert.equal(
    (await call('orqanix_engineering_inspect', { task: 'Inspect it' })).isError,
    false
  );
  assert.equal((await call('orqanix_engineering_edit', { task: 'Edit it' })).isError, false);
  assert.deepEqual(modes, ['inspect', 'edit']);
  assert.equal(starts, 2);
});

test('MCP handshake exposes status, read-only inspection and approved editing', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let received = '';
  output.on('data', (data) => {
    received += data.toString();
  });
  const run = serveMcp({ input, output, call: async () => ({ content: [] }) });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })}\n`);
  input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  await run;
  const replies = received.trim().split('\n').map(JSON.parse);
  assert.equal(replies[0].result.serverInfo.name, 'orqanix-engineering');
  assert.deepEqual(
    replies[1].result.tools.map((tool) => tool.name),
    [
      'orqanix_engineering_status',
      'orqanix_engineering_inspect',
      'orqanix_engineering_edit',
    ]
  );
  assert.equal(replies[0].result.instructions.includes('Goose tools and skills remain'), true);
  assert.equal(replies[1].result.tools[0].annotations.readOnlyHint, true);
  assert.equal(replies[1].result.tools[1].annotations.readOnlyHint, true);
  assert.equal(replies[1].result.tools[2].annotations.destructiveHint, true);
  assert.deepEqual(replies[1].result.tools[0].inputSchema.required, []);
});
