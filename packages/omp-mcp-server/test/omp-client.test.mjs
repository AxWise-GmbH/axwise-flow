import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { chmod, mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../src/config.mjs';
import {
  BOUNDED_SYSTEM_PROMPT,
  contextualSubdirectoryPrompt,
  evaluateWithJev,
  inspectOmp,
  runEngineeringTask,
} from '../src/omp-client.mjs';

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

function git(workspace, args) {
  return execFileSync('git', args, { cwd: workspace });
}

async function initializeCommittedWorkspace(workspace) {
  git(workspace, ['init', '-q']);
  await writeFile(join(workspace, 'tracked.txt'), 'before\n');
  git(workspace, ['add', 'tracked.txt']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'fixture baseline',
  ]);
}

test('configuration binds one workspace and writes a secret-free Orqanix model profile', async (t) => {
  const { workspace, stateDir, config } = await setup(t);
  assert.equal(config.workspace, await realpath(workspace));
  assert.equal(config.stateDir, await realpath(stateDir));
  assert.equal(config.jevEnabled, true);
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

test('Jev capability configuration is strict, defaults on, and supports CLI override', async (t) => {
  assert.equal((await setup(t, { ORQANIX_JEV_ENABLED: 'false' })).config.jevEnabled, false);
  const { config, workspace, stateDir } = await setup(t);
  const base = [
    '--workspace', workspace,
    '--omp', config.binary,
    '--node', process.execPath,
    '--connector', config.connector,
    '--connector-config', config.connectorConfig,
    '--account-hash', ACCOUNT,
    '--state-dir', stateDir,
  ];
  assert.equal((await loadConfig({ argv: [...base, '--jev-enabled', '0'], env: {} })).jevEnabled, false);
  await assert.rejects(
    loadConfig({ argv: [...base, '--jev-enabled', 'sometimes'], env: {} }),
    /Jev capability must be/
  );
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
  assert.equal(invocation.args[invocation.args.indexOf('--tools') + 1].includes('bash'), false);
});

test('approved test command runs before final capture and its tracked edit is attributed', async (t) => {
  const { config, workspace } = await setup(t);
  await initializeCommittedWorkspace(workspace);
  let request;
  const value = await runEngineeringTask({
    config,
    task: 'Inspect the fixture',
    mode: 'edit',
    testCommand: [
      'node',
      '-e',
      "require('node:fs').writeFileSync('tracked.txt', 'changed by test\\n')",
    ],
    jevEvaluator: async (input) => {
      request = input.request;
      return { review: { status: 'not_evaluated', reason: 'fixture' } };
    },
  });
  assert.equal(value.evidence.tests.status, 'passed');
  assert.deepEqual(value.changedFiles, [{ path: 'tracked.txt', change: 'edited' }]);
  assert.deepEqual(request.evidence.changedFiles, value.changedFiles);
  assert.match(value.evidence.diff.after, /changed by test/);
});

test('a commit made by the approved test command invalidates final evidence', async (t) => {
  const { config, workspace } = await setup(t);
  await initializeCommittedWorkspace(workspace);
  const script = [
    "const { writeFileSync } = require('node:fs')",
    "const { execFileSync } = require('node:child_process')",
    "writeFileSync('tracked.txt', 'committed by test\\n')",
    "execFileSync('git', ['add', 'tracked.txt'])",
    "execFileSync('git', ['-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'commit', '-qm', 'test command commit'])",
  ].join(';');
  const value = await runEngineeringTask({
    config,
    task: 'Inspect the fixture',
    mode: 'edit',
    acceptanceCriteria: ['test completes'],
    testCommand: ['node', '-e', script],
    jevEvaluator: async () => ({ review: { status: 'passed' } }),
  });
  assert.equal(value.evidence.tests.status, 'passed');
  assert.equal(value.evidence.diff.status, 'unavailable');
  assert.equal(value.changedFilesStatus, 'unavailable');
  assert.deepEqual(value.changedFiles, []);
  assert.equal(value.verified, false);
  assert.equal(value.status, 'review_required');
});

test('a relevant ignored-file edit is explicit and disqualifies verification', async (t) => {
  const { config, workspace } = await setup(t);
  await initializeCommittedWorkspace(workspace);
  await writeFile(join(workspace, '.gitignore'), 'private-state/\n');
  git(workspace, ['add', '.gitignore']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'ignore private state',
  ]);
  await mkdir(join(workspace, 'private-state'));
  await writeFile(join(workspace, 'private-state', 'state.txt'), 'before\n');
  let reviewCalls = 0;
  const value = await runEngineeringTask({
    config,
    task: 'edit-ignored-fixture',
    mode: 'edit',
    acceptanceCriteria: ['fixture completes'],
    testCommand: ['node', '-e', 'process.exit(0)'],
    jevEvaluator: async () => {
      reviewCalls += 1;
      return { review: { status: 'passed' } };
    },
  });
  assert.equal(reviewCalls, 0);
  assert.equal(value.relevantIgnoredFilesChanged, true);
  assert.equal(value.evidence.relevantIgnoredFilesChanged, true);
  assert.deepEqual(value.changedFiles, [
    { path: 'private-state/state.txt', change: 'edited' },
  ]);
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.review.reason, 'ignored_files_changed');
  assert.equal(value.verified, false);
});

test('sensitive test output is redacted from receipts with Jev enabled or disabled', async (t) => {
  for (const jevEnabled of ['1', '0']) {
    const { config } = await setup(t, { ORQANIX_JEV_ENABLED: jevEnabled });
    let reviewCalls = 0;
    const value = await runEngineeringTask({
      config,
      task: 'Inspect the fixture',
      mode: 'edit',
      testCommand: ['node', '-e', "console.log('AKIA' + 'ABCDEFGHIJKLMNOP')"],
      jevEvaluator: async ({ request }) => {
        reviewCalls += 1;
        assert.equal(JSON.stringify(request).includes('AKIAABCDEFGHIJKLMNOP'), false);
        return { review: { status: 'passed' } };
      },
    });
    assert.equal(JSON.stringify(value).includes('AKIAABCDEFGHIJKLMNOP'), false);
    assert.equal(value.evidence.tests.redacted, true);
    assert.match(value.evidence.tests.output, /REDACTED/);
    assert.equal(reviewCalls, jevEnabled === '1' ? 1 : 0);
    assert.equal(
      value.review.reason,
      jevEnabled === '1' ? 'sensitive_test_output' : 'disabled_by_user'
    );
    assert.equal(value.verified, false);
  }
});

test('sensitive OMP assistant output is redacted from the receipt', async (t) => {
  const { config } = await setup(t);
  const value = await runEngineeringTask({
    config,
    task: 'secret-output-fixture',
    mode: 'inspect',
  });
  assert.equal(value.status, 'completed');
  assert.equal(value.assistantOutputRedacted, true);
  assert.match(value.assistantText, /REDACTED/);
  assert.equal(JSON.stringify(value).includes('AKIAABCDEFGHIJKLMNOP'), false);
});

test('exec exposes shell but not direct edit or write tools', async (t) => {
  const { argsFile, config } = await setup(t);
  const value = await runEngineeringTask({
    config,
    task: 'Run the fixture',
    mode: 'exec',
  });
  assert.equal(value.status, 'completed');
  const invocation = JSON.parse((await readFile(argsFile, 'utf8')).trim());
  assert.equal(
    invocation.args[invocation.args.indexOf('--tools') + 1],
    'read,grep,glob,lsp,bash,todo'
  );
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.verified, false);
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

test('disabled Jev still captures evidence but never calls review or verifies', async (t) => {
  const { config } = await setup(t, { ORQANIX_JEV_ENABLED: '0' });
  let reviewCalls = 0;
  const value = await runEngineeringTask({
    config,
    task: 'Inspect the fixture',
    mode: 'edit',
    acceptanceCriteria: ['fixture completes'],
    testCommand: ['node', '-e', 'process.exit(0)'],
    jevEvaluator: async () => {
      reviewCalls += 1;
      return { review: { status: 'passed' } };
    },
  });
  assert.equal(reviewCalls, 0);
  assert.equal(value.status, 'review_required');
  assert.deepEqual(value.review, {
    status: 'not_evaluated',
    advisory: true,
    reason: 'disabled_by_user',
  });
  assert.equal(value.evidence.tests.status, 'passed');
  assert.equal(value.verified, false);
  assert.equal(value.changedFilesStatus, 'unavailable');
  assert.deepEqual(value.changedFiles, []);
  assert.deepEqual(value.evidence.changedFiles, value.changedFiles);
});

test('disabled Jev keeps its explicit reason when local tests fail', async (t) => {
  const { config } = await setup(t, { ORQANIX_JEV_ENABLED: 'false' });
  const value = await runEngineeringTask({
    config,
    task: 'Inspect the fixture',
    mode: 'edit',
    testCommand: ['node', '-e', 'process.exit(1)'],
    jevEvaluator: async () => {
      throw new Error('Jev must remain unmounted.');
    },
  });
  assert.equal(value.evidence.tests.status, 'failed');
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.review.reason, 'disabled_by_user');
  assert.equal(value.verified, false);
});

test('disabled Jev keeps its explicit reason when an ignored file changes', async (t) => {
  const { config, workspace } = await setup(t, { ORQANIX_JEV_ENABLED: '0' });
  await initializeCommittedWorkspace(workspace);
  await writeFile(join(workspace, '.gitignore'), 'private-state/\n');
  git(workspace, ['add', '.gitignore']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'ignore private state',
  ]);
  await mkdir(join(workspace, 'private-state'));
  await writeFile(join(workspace, 'private-state', 'state.txt'), 'before\n');
  let reviewCalls = 0;
  const value = await runEngineeringTask({
    config,
    task: 'edit-ignored-fixture',
    mode: 'edit',
    acceptanceCriteria: ['fixture completes'],
    testCommand: ['node', '-e', 'process.exit(0)'],
    jevEvaluator: async () => {
      reviewCalls += 1;
      return { review: { status: 'passed' } };
    },
  });
  assert.equal(reviewCalls, 0);
  assert.equal(value.relevantIgnoredFilesChanged, true);
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.review.reason, 'disabled_by_user');
  assert.equal(value.verified, false);
});

test('changed-file receipt is part of hashed evidence before Jev evaluation', async (t) => {
  const { config, workspace } = await setup(t);
  execFileSync('git', ['init', '-q'], { cwd: workspace });
  let request;
  const value = await runEngineeringTask({
    config,
    task: 'edit-file-fixture',
    mode: 'edit',
    jevEvaluator: async (input) => {
      request = input.request;
      return { review: { status: 'not_evaluated', reason: 'fixture' } };
    },
  });
  assert.equal(request.evidence.changedFilesStatus, 'captured');
  assert.deepEqual(request.evidence.changedFiles, [
    { path: 'fixture-change.mjs', change: 'new' },
  ]);
  const exactHash = createHash('sha256')
    .update(JSON.stringify(request.evidence))
    .digest('hex');
  assert.equal(value.evidenceHash, exactHash);
  assert.deepEqual(value.changedFiles, request.evidence.changedFiles);
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

test('Jev rejects sensitive request content before token lookup or network access', async () => {
  const config = {
    conversationId: 'fixed-conversation',
    apiBaseUrl: 'https://preview.example.test/desktop/v1',
    accountHash: ACCOUNT,
  };
  let tokenCalls = 0;
  let fetchCalls = 0;
  const value = await evaluateWithJev({
    config,
    request: {
      taskId: 'task',
      inputHash: 'b'.repeat(64),
      evidence: { tests: { output: 'AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP' } },
      researchReferences: [],
    },
    tokenProvider: async () => {
      tokenCalls += 1;
      return 'must-not-be-requested';
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('must not upload');
    },
  });
  assert.equal(tokenCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(value.review.status, 'not_evaluated');
  assert.equal(value.review.reason, 'sensitive_evidence');
});

test('Jev detects sensitive values by structured field name before upload', async () => {
  let externalCalls = 0;
  const value = await evaluateWithJev({
    config: {
      conversationId: 'fixed-conversation',
      apiBaseUrl: 'https://preview.example.test/desktop/v1',
      accountHash: ACCOUNT,
    },
    request: {
      taskId: 'task',
      inputHash: 'b'.repeat(64),
      evidence: { tests: { password: 'this-is-not-safe-to-upload' } },
      researchReferences: [],
    },
    tokenProvider: async () => {
      externalCalls += 1;
      return 'must-not-be-requested';
    },
    fetchImpl: async () => {
      externalCalls += 1;
      throw new Error('must not upload');
    },
  });
  assert.equal(externalCalls, 0);
  assert.equal(value.review.reason, 'sensitive_evidence');
});

test('contextualSubdirectoryPrompt appends domain instructions for known subpaths', () => {
  assert.ok(contextualSubdirectoryPrompt('inspect apps/orqaly hero component').includes('SimpleDesign'));
  assert.ok(contextualSubdirectoryPrompt('fix bug in backend/services').includes('FastAPI'));
  assert.ok(contextualSubdirectoryPrompt('update ui/desktop prompt.ts').includes('Electron'));
  assert.equal(contextualSubdirectoryPrompt('general overview'), '');
});

test('bounded prompt forbids unapproved external side effects', () => {
  assert.match(BOUNDED_SYSTEM_PROMPT, /Do not use network access/);
  assert.match(BOUNDED_SYSTEM_PROMPT, /install dependencies/);
  assert.match(BOUNDED_SYSTEM_PROMPT, /commit or push Git changes/);
  assert.match(BOUNDED_SYSTEM_PROMPT, /deploy/);
  assert.match(BOUNDED_SYSTEM_PROMPT, /unless the approved task explicitly requests/);
});
