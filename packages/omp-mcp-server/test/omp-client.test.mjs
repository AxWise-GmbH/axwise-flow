import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.mjs';
import { inspectOmp, runEngineeringTask, evaluateWithJev, contextualSubdirectoryPrompt } from '../src/omp-client.mjs';

const fixture = fileURLToPath(new URL('./fixtures/fake-omp.mjs', import.meta.url));
const ACCOUNT = 'a'.repeat(64);

async function setup(t, env = {}) {
  const root = await mkdtemp(join(tmpdir(), 'orqanix-omp-'));
  const workspace = join(root, 'workspace');
  const stateDir = join(root, 'state');
  await mkdir(workspace);
  const argsFile = join(root, 'args.jsonl');
  const binary = join(root, 'fake-omp.mjs');
  await writeFile(
    binary,
    `#!/usr/bin/env node\nprocess.env.FAKE_OMP_ARGS_FILE=${JSON.stringify(argsFile)};await import(${JSON.stringify(fixture)});\n`,
    { mode: 0o700 }
  );
  await chmod(binary, 0o700);
  const connector = join(root, 'connector.mjs');
  await writeFile(
    connector,
    "if(process.argv[2]==='token')process.stdout.write('fixture-access-token-1234567890\\n');else process.exitCode=2;\n",
    { mode: 0o600 }
  );
  const connectorConfig = join(root, 'preview.json');
  await writeFile(
    connectorConfig,
    `${JSON.stringify({ apiUrl: 'https://preview.example.test' })}\n`,
    { mode: 0o600 }
  );
  const config = await loadConfig({
    argv: [
      '--workspace',
      workspace,
      '--omp',
      binary,
      '--node',
      process.execPath,
      '--connector',
      connector,
      '--connector-config',
      connectorConfig,
      '--account-hash',
      ACCOUNT,
      '--state-dir',
      stateDir,
    ],
    env: {
      ORQANIX_OMP_TIMEOUT_MS: '10000',
      ORQANIX_OMP_STARTUP_TIMEOUT_MS: '1000',
      ORQANIX_OMP_MAX_OUTPUT_BYTES: '4096',
      ...env,
    },
  });
  t.after(() => {});
  return { root, workspace, stateDir, argsFile, connectorConfig, config };
}

test('configuration binds one workspace and writes a secret-free Orqanix model profile', async (t) => {
  const { workspace, stateDir, config } = await setup(t);
  assert.equal(config.workspace, await realpath(workspace));
  assert.equal(config.stateDir, await realpath(stateDir));
  const models = await readFile(config.modelsFile, 'utf8');
  assert.match(models, /baseUrl: "https:\/\/preview\.example\.test\/desktop\/v1"/);
  assert.match(models, /apiKey: ORQANIX_OMP_TOKEN/);
  assert.match(models, new RegExp(`X-Orqaly-Account-Hash: "${ACCOUNT}"`));
  assert.equal(models.includes('fixture-access-token'), false);
  await assert.rejects(
    loadConfig({
      argv: [
        '--workspace',
        '/',
        '--omp',
        config.binary,
        '--node',
        process.execPath,
        '--connector',
        config.connector,
        '--connector-config',
        config.connectorConfig,
        '--account-hash',
        ACCOUNT,
        '--state-dir',
        stateDir,
      ],
      env: {},
    }),
    /filesystem root/
  );
  await assert.rejects(loadConfig({ argv: ['--unknown', workspace], env: {} }), /Use one value/);
});

test('status uses real OMP JSONL RPC with Orqanix auth and leaves skills enabled', async (t) => {
  const { stateDir, argsFile, config } = await setup(t);
  const status = await inspectOmp({ config });
  assert.equal(status.status, 'available');
  assert.deepEqual(status.model, { provider: 'fixture-provider', id: 'fixture-model' });
  assert.deepEqual(status.tools, ['read', 'lsp']);
  assert.equal(status.skillsEnabled, true);
  const invocation = JSON.parse((await readFile(argsFile, 'utf8')).trim());
  assert.deepEqual(invocation.args.slice(0, 4), ['--mode', 'rpc', '--cwd', config.workspace]);
  assert.equal(invocation.args.includes('--no-skills'), false);
  assert.equal(invocation.args.includes('--no-extensions'), true);
  assert.equal(invocation.args[invocation.args.indexOf('--model') + 1], 'orqanix/orqaly-gemini');
  assert.equal(invocation.args[invocation.args.indexOf('--thinking') + 1], 'high');
  assert.equal(invocation.tokenPresent, true);
  assert.equal(invocation.agentDir, await realpath(stateDir));
  assert.equal(JSON.stringify(status).includes('fixture-access-token'), false);
});

test('bounded edit preserves skills, limits tools, and returns structured output', async (t) => {
  const { argsFile, config } = await setup(t);
  const value = await runEngineeringTask({
    config,
    task: 'Inspect the fixture',
    mode: 'edit',
  });
  assert.equal(value.status, 'review_required');
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.verified, false);
  assert.equal(value.assistantText, 'Completed fixture task.');
  assert.deepEqual(value.toolsUsed, ['read']);
  assert.equal(value.outputTruncated, false);
  const invocation = JSON.parse((await readFile(argsFile, 'utf8')).trim());
  assert.equal(
    invocation.args[invocation.args.indexOf('--tools') + 1],
    'read,grep,glob,lsp,edit,write,todo'
  );
  assert.equal(invocation.args.includes('--no-skills'), false);
  assert.equal(invocation.args.includes('bash'), false);
});

test('timeout and caller cancellation terminate a stalled RPC task', async (t) => {
  const { config } = await setup(t);
  const timed = await runEngineeringTask({
    config,
    task: 'timeout-fixture',
    mode: 'inspect',
    timeoutMs: 20,
  });
  assert.equal(timed.status, 'timed_out');
  assert.equal(timed.code, 'TIMEOUT');
  const controller = new AbortController();
  const pending = runEngineeringTask({
    config,
    task: 'timeout-fixture',
    mode: 'inspect',
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 20);
  const cancelled = await pending;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.code, 'CANCELLED');
});

test('provider errors are failed results and do not leak raw provider details', async (t) => {
  const { config } = await setup(t);
  const value = await runEngineeringTask({
    config,
    task: 'provider-error-fixture',
    mode: 'inspect',
  });
  assert.equal(value.status, 'failed');
  assert.equal(value.code, 'MODEL_REQUEST_FAILED');
  assert.equal(JSON.stringify(value).includes('private provider detail'), false);
});

test('inspection does not claim semantic review of uncaptured evidence', async (t) => {
  const { config } = await setup(t);
  const value = await runEngineeringTask({ config, task: 'inspect workspace', mode: 'inspect' });
  assert.equal(value.status, 'completed');
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.verified, false);
});

test('actual failing tests override even a positive injected review', async (t) => {
  const { config } = await setup(t);
  const value = await runEngineeringTask({ config, task: 'Inspect the fixture', mode: 'edit',
    testCommand: ['node', '-e', 'process.exit(1)'],
    jevEvaluator: async () => ({ review: { status: 'passed' } }),
  });
  assert.equal(value.status, 'review_required');
  assert.equal(value.evidence.tests.exitCode, 1);
  assert.equal(value.review.reason, 'tests_failed');
  assert.equal(value.verified, false);
});

test('Jev gateway uses OAuth and rejects mismatched evidence receipts', async () => {
  const config = { conversationId: 'fixed-conversation', apiBaseUrl: 'https://preview.example.test/desktop/v1', accountHash: ACCOUNT };
  const request = { taskId: 'task', inputHash: 'b'.repeat(64), evidence: {}, researchReferences: [] };
  const value = await evaluateWithJev({ config, request, tokenProvider: async () => 'ephemeral-oauth-token',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://preview.example.test/desktop/v1/engineering/review');
      assert.equal(options.headers.Authorization, 'Bearer ephemeral-oauth-token');
      assert.equal(options.headers['X-Orqaly-Account-Hash'], ACCOUNT);
      return { ok: true, json: async () => ({ ...request, evidenceHash: 'wrong', review: { status: 'passed' } }) };
    },
  });
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.review.reason, 'invalid_review_receipt');
  assert.equal(JSON.stringify(value).includes('ephemeral-oauth-token'), false);
});

test('contextualSubdirectoryPrompt appends domain instructions for known subpaths', () => {
  assert.ok(contextualSubdirectoryPrompt('inspect apps/orqaly hero component').includes('SimpleDesign'));
  assert.ok(contextualSubdirectoryPrompt('fix bug in backend/services').includes('FastAPI'));
  assert.ok(contextualSubdirectoryPrompt('update ui/desktop prompt.ts').includes('Electron'));
  assert.equal(contextualSubdirectoryPrompt('general overview'), '');
});
