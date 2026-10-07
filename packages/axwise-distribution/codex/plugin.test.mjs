import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const plugin = process.env.AXWISE_PLUGIN_TEST_ROOT
  ? resolve(process.env.AXWISE_PLUGIN_TEST_ROOT) : join(root, 'axwise');
const json = async path => JSON.parse(await readFile(path, 'utf8'));

async function client(t) {
  const temp = await mkdtemp(join(tmpdir(), 'axwise-plugin-test-'));
  const config = (await json(join(plugin, '.mcp.json'))).mcpServers['axwise-rust'];
  const command = config.command.replaceAll('${PLUGIN_ROOT}', plugin);
  // Use a separate host-selected store, keeping the actual host HOME unchanged.
  const child = spawn(command, [...config.args, '--state-dir', join(temp, 'state')], {
    cwd: temp, env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let sequence = 0;
  let buffer = '';
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  child.stdout.on('data', data => {
    buffer += data;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const message = JSON.parse(line);
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
  });
  function rpc(method, params) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}; ${errors}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  child.on('error', error => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  });
  t.after(async () => {
    child.stdin.end();
    if (child.exitCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => { child.kill(); resolve(); }, 1000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    for (const item of pending.values()) clearTimeout(item.timer);
    await rm(temp, { recursive: true, force: true });
  });
  const initialized = await rpc('initialize', {
    protocolVersion: '2025-06-18', capabilities: {},
    clientInfo: { name: 'axwise-plugin-contract-test', version: '0.1.0' },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return { rpc, initialized, temp };
}

test('package keeps portable and Codex wiring equivalent, without credentials or fixed project/session', async () => {
  const manifest = await json(join(plugin, 'plugin.json'));
  const compatibility = await json(join(plugin, '.codex-plugin/plugin.json'));
  const portable = await json(join(plugin, 'mcp.json'));
  const legacy = await json(join(plugin, '.mcp.json'));
  assert.equal(manifest.name, compatibility.name);
  assert.equal(manifest.version, compatibility.version);
  assert.deepEqual(manifest.extensions['com.openai'].interface, compatibility.interface);
  assert.deepEqual(portable.mcpServers['axwise-rust'].args, legacy.mcpServers['axwise-rust'].args);
  assert.equal(portable.mcpServers['axwise-rust'].command, './bin/axwise');
  assert.equal(legacy.mcpServers['axwise-rust'].command.replaceAll('${PLUGIN_ROOT}', plugin), join(plugin, 'bin/axwise'));
  assert.deepEqual(portable.mcpServers['axwise-rust'].args, ['--model-access', 'host']);
  assert.equal(portable.mcpServers['axwise-rust'].cwd, undefined);
  assert.equal(portable.mcpServers['axwise-rust'].env, undefined);
  assert.ok(compatibility.interface.shortDescription.length <= 30);
  const runtime = await json(join(plugin, 'RUNTIME.json'));
  const digest = createHash('sha256').update(await readFile(join(plugin, runtime.binary))).digest('hex');
  assert.equal(digest, runtime.sha256);
});

test('actual bundled Rust server starts in the host workspace and advertises the nine supported tools', async t => {
  const { rpc, initialized } = await client(t);
  assert.deepEqual(initialized.serverInfo, { name: 'axwise', version: '0.5.2' });
  const result = await rpc('tools/list', {});
  assert.deepEqual(result.tools.map(t => t.name).sort(), [
    'prepare_discovery', 'research_market', 'generate_personas', 'simulate_interviews',
    'chat_with_persona', 'analyze_interviews', 'create_prd', 'create_delivery_brief', 'advance_artifact',
  ].sort());
  for (const tool of result.tools) {
    for (const key of ['readOnlyHint', 'openWorldHint', 'destructiveHint']) {
      assert.equal(typeof tool.annotations?.[key], 'boolean', `${tool.name}: ${key}`);
    }
  }
});

test('normal discovery uses the current host model and cannot report pending work as a saved result', async t => {
  const { rpc, temp } = await client(t);
  const response = await rpc('tools/call', { name: 'prepare_discovery', arguments: {
    brief: 'Propose a ten-week cat-food pilot in three Estonia pet shops; product prices are unknown.',
    region: 'Estonia', depth: 'standard',
  } });
  assert.equal(response.isError, false);
  const pending = response.structuredContent;
  assert.equal(pending.status, 'model_request');
  assert.equal(pending.modelAccess, 'host_chat');
  assert.equal(pending.stage, 'generate');
  assert.equal(pending.nextTool, 'advance_artifact');
  assert.equal(pending.storageAccepted, undefined);
  assert.ok(pending.responseSchema);
  const files = await readdir(join(temp, 'state'), { recursive: true });
  assert.equal(files.some(f => /op-.*\.(md|json)$/.test(f)), false);
  const scopes = files.filter(f => f.startsWith('local-'));
  assert.ok(scopes.length > 0);
});

test('missing saved artifact is rejected before generation instead of silently rebuilding evidence', async t => {
  const { rpc } = await client(t);
  const response = await rpc('tools/call', { name: 'analyze_interviews', arguments: {
    decisionQuestion: 'What should this pilot validate?', outputs: ['jobs_pains'],
    references: [{ operationId: 'op-missing', sha256: '0'.repeat(64) }],
  } });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /artifact_not_found/);
});

test('invalid candidate returns an explicit repair request and remains unsaved', async t => {
  const { rpc, temp } = await client(t);
  const initial = await rpc('tools/call', { name: 'prepare_discovery', arguments: {
    brief: 'Propose a bounded three-shop Estonia cat-food pilot.',
  } });
  const response = await rpc('tools/call', { name: 'advance_artifact', arguments: {
    requestId: initial.structuredContent.requestId, stage: 'generate', payload: { invented: true },
  } });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.status, 'model_request');
  const prompt = JSON.parse(response.structuredContent.userPrompt);
  assert.ok(prompt.repairDefects.length > 0);
  assert.equal(response.structuredContent.storageAccepted, undefined);
  const files = await readdir(join(temp, 'state'), { recursive: true });
  assert.equal(files.some(f => /op-.*\.(md|json)$/.test(f)), false);
});
