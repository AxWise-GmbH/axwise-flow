import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { createMcpTools, serveMcp, TOOLS } from '../src/mcp.mjs';

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
  assert.equal(
    (await call('orqanix_engineering_exec', { task: 'Run it', test_command: ['node', '--test'] }))
      .isError,
    true
  );
  assert.equal((await call('orqanix_engineering_exec', { task: 'Run it' })).isError, false);
  assert.deepEqual(modes, ['inspect', 'edit', 'exec']);
  assert.equal(starts, 3);
});

test('tool descriptions do not overclaim Jev or verification outside edit', () => {
  const inspect = TOOLS.find((tool) => tool.name === 'orqanix_engineering_inspect');
  const exec = TOOLS.find((tool) => tool.name === 'orqanix_engineering_exec');
  assert.equal(/Jev review|verified|exit codes|stdout|stderr/i.test(inspect.description), false);
  assert.equal(/TypeSafe Jev|verified turn|real exit codes|captured stdout/i.test(exec.description), false);
  assert.equal(Object.hasOwn(exec.inputSchema.properties, 'test_command'), false);
});

test('tool annotations disclose all open-world reach and edit describes conditional review', () => {
  const edit = TOOLS.find((tool) => tool.name === 'orqanix_engineering_edit');
  const exec = TOOLS.find((tool) => tool.name === 'orqanix_engineering_exec');
  assert.equal(edit.annotations.openWorldHint, true);
  assert.equal(exec.annotations.openWorldHint, true);
  assert.match(edit.description, /shell access is not exposed/);
  assert.match(edit.description, /test_command is an arbitrary local process/);
  assert.match(edit.description, /open-world unless the desktop separately sandboxes or allowlists it/);
  assert.match(edit.description, /When the Jev capability is enabled/);
  assert.match(edit.description, /when disabled/);
  assert.match(exec.description, /filesystem or network effects/);
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
      'orqanix_engineering_exec',
    ]
  );
  assert.equal(replies[0].result.instructions.includes('Goose tools and skills remain'), true);
  assert.equal(replies[1].result.tools[0].annotations.readOnlyHint, true);
  assert.equal(replies[1].result.tools[1].annotations.readOnlyHint, true);
  assert.equal(replies[1].result.tools[2].annotations.destructiveHint, true);
  assert.equal(replies[1].result.tools[3].annotations.destructiveHint, true);
  assert.deepEqual(replies[1].result.tools[0].inputSchema.required, []);
});
