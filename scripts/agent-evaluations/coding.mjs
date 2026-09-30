import { execFile as nodeExecFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const MAX_SOURCE_BYTES = 16_384;
const TARGET_FILENAME = /^src\/[a-z][a-z0-9-]*\.js$/;
const EXPORT_FUNCTION = /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/;
const SHA256 = /^[a-f0-9]{64}$/;
const DEFAULT_TIMEOUT_MS = 180_000;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const jsonHash = (value) => sha256(JSON.stringify(value));

function execute(file, args, options = {}) {
  return new Promise((resolve) => {
    nodeExecFile(
      file,
      args,
      {
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        maxBuffer: 32_768,
        ...options,
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });
}

function assertCodingCase(caseData) {
  if (
    !caseData ||
    caseData.category !== 'coding' ||
    typeof caseData.prompt !== 'string' ||
    !caseData.prompt.trim() ||
    !Array.isArray(caseData.criteria) ||
    caseData.criteria.length === 0 ||
    caseData.criteria.some((criterion) => typeof criterion !== 'string' || !criterion.trim())
  ) {
    throw new Error('A catalog coding case with prompt and acceptance criteria is required.');
  }
  const fixture = caseData.fixture;
  if (
    !fixture ||
    !TARGET_FILENAME.test(fixture.targetFilename || '') ||
    typeof fixture.starter !== 'string' ||
    Buffer.byteLength(fixture.starter, 'utf8') > MAX_SOURCE_BYTES ||
    !Array.isArray(fixture.tests) ||
    fixture.tests.length === 0
  ) {
    throw new Error('The coding case fixture is invalid.');
  }
  const match = fixture.starter.match(EXPORT_FUNCTION);
  if (!match) throw new Error('The coding starter must contain one named exported function.');
  for (const item of fixture.tests) {
    if (!item || !Array.isArray(item.args)) throw new Error('Every coding test must provide args.');
    if (!Object.hasOwn(item, 'expected') && typeof item.throws !== 'string') {
      throw new Error('Every coding test must provide expected or throws.');
    }
  }
  return { fixture, exportName: match[1] };
}

const notEvaluatedReview = (reason) => ({
  review: { status: 'not_evaluated', advisory: true, reason },
});

async function invokeValidatedJev(evaluator, args) {
  try {
    const receipt = await evaluator(args);
    if (
      receipt?.taskId !== args.request.taskId ||
      receipt?.inputHash !== args.request.inputHash ||
      receipt?.evidenceHash !== jsonHash(args.request.evidence) ||
      !['passed', 'failed', 'not_evaluated'].includes(receipt.review?.status)
    ) {
      return notEvaluatedReview('invalid_review_receipt');
    }
    return receipt;
  } catch {
    return notEvaluatedReview(args.signal?.aborted ? 'cancelled' : 'review_unavailable');
  }
}

function machineJevEvaluator({ apiBaseUrl, tokenProvider }) {
  return async ({ request, signal }) => {
    try {
      const token = await tokenProvider({}, signal);
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/engineering/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orqaly-Evaluation-Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) {
        return notEvaluatedReview(`gateway_http_${response.status}`);
      }
      const receipt = await response.json();
      if (
        receipt.taskId !== request.taskId ||
        receipt.inputHash !== request.inputHash ||
        receipt.evidenceHash !== jsonHash(request.evidence) ||
        !['passed', 'failed', 'not_evaluated'].includes(receipt.review?.status)
      ) {
        return notEvaluatedReview('invalid_review_receipt');
      }
      return receipt;
    } catch {
      return notEvaluatedReview(signal?.aborted ? 'cancelled' : 'review_unavailable');
    }
  };
}

function hiddenTestSource({ targetPath, exportName, tests }) {
  return `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const target = ${JSON.stringify(targetPath)};
const source = await readFile(target, 'utf8');
assert.ok(Buffer.byteLength(source, 'utf8') <= ${MAX_SOURCE_BYTES}, 'implementation is too large');
assert.doesNotMatch(source, /(?:^|[;{}\\n])\\s*import(?:\\s|\\()|\\brequire\\s*\\(|\\b(?:process|globalThis|constructor|fetch|WebSocket|XMLHttpRequest)\\b|node:|https?:/m, 'implementation uses a forbidden capability');
  const context = vm.createContext(Object.freeze({}));
const module = new vm.SourceTextModule(source, { context, identifier: target });
await module.link(() => { throw new Error('imports are forbidden'); });
await module.evaluate({ timeout: 2_000 });
const implementation = module.namespace[${JSON.stringify(exportName)}];
assert.equal(typeof implementation, 'function', 'named export is missing');
const cases = ${JSON.stringify(tests)};
for (const item of cases) {
  const args = structuredClone(item.args);
  const before = structuredClone(args);
  if (item.throws) {
    assert.throws(() => implementation(...args), { name: item.throws });
  } else {
    const result = implementation(...args);
    const comparable = result !== null && typeof result === 'object'
      ? JSON.parse(JSON.stringify(result))
      : result;
    assert.deepEqual(comparable, item.expected);
  }
  assert.deepEqual(args, before, 'input arguments were mutated');
}
process.stdout.write(JSON.stringify({ status: 'passed', count: cases.length }) + '\\n');
`;
}

async function git(workspace, args) {
  const result = await execute('git', args, { cwd: workspace, timeout: 10_000 });
  if (result.error) throw new Error(`Fixture git command failed: ${args[0]}`);
  return result.stdout;
}

async function createFixture(caseData, workRoot) {
  const { fixture, exportName } = assertCodingCase(caseData);
  await mkdir(workRoot, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(await realpath(workRoot), 'orqanix-coding-'));
  const workspace = join(root, 'workspace');
  const testDir = join(root, 'trusted-tests');
  const targetPath = join(workspace, fixture.targetFilename);
  const testPath = join(testDir, 'verify.mjs');
  await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
  await mkdir(testDir, { mode: 0o700 });
  await writeFile(targetPath, fixture.starter, { mode: 0o600 });
  await writeFile(join(workspace, 'package.json'), '{"private":true,"type":"module"}\n', {
    mode: 0o600,
  });
  const testSource = hiddenTestSource({ targetPath, exportName, tests: fixture.tests });
  await writeFile(testPath, testSource, { mode: 0o400 });
  await chmod(testDir, 0o500);
  await git(workspace, ['init', '--quiet']);
  await git(workspace, ['add', '--', 'package.json', fixture.targetFilename]);
  await git(workspace, [
    '-c',
    'user.name=Orqanix Evaluation',
    '-c',
    'user.email=evaluation@invalid',
    'commit',
    '--quiet',
    '-m',
    'evaluation fixture',
  ]);
  return {
    root,
    workspace,
    targetPath,
    targetFilename: fixture.targetFilename,
    testDir,
    testPath,
    testHash: sha256(testSource),
    exportName,
  };
}

async function removeFixture(fixture) {
  await chmod(fixture.testDir, 0o700).catch(() => {});
  await chmod(fixture.testPath, 0o600).catch(() => {});
  await rm(fixture.root, { recursive: true, force: true });
}

function verificationCommand(fixture) {
  return [
    'node',
    '--permission',
    `--allow-fs-read=${fixture.testPath}`,
    `--allow-fs-read=${fixture.targetPath}`,
    '--experimental-vm-modules',
    fixture.testPath,
  ];
}

async function fixtureChecks(fixture, testResult) {
  const status = (await git(fixture.workspace, ['status', '--short', '--untracked-files=all']))
    .trimEnd()
    .split('\n')
    .filter((line) => line.trim());
  const changedPaths = status.map((line) => line.slice(3));
  const testHash = sha256(await readFile(fixture.testPath));
  const target = await readFile(fixture.targetPath);
  return {
    codeChanged: changedPaths.includes(fixture.targetFilename),
    onlyTargetChanged:
      changedPaths.length === 1 && changedPaths[0] === fixture.targetFilename,
    testsPassed: testResult?.status === 'passed',
    testOutputTruncated: testResult?.truncated === true,
    trustedTestsIntact: testHash === fixture.testHash,
    targetHash: sha256(target),
    changedPaths,
  };
}

function armEvaluation(checks, jevStatus) {
  const deterministicResults = [
    { criterion: 'implementation_changed', passed: checks.codeChanged },
    { criterion: 'only_target_changed', passed: checks.onlyTargetChanged },
    { criterion: 'hidden_tests_passed', passed: checks.testsPassed },
    { criterion: 'trusted_tests_intact', passed: checks.trustedTestsIntact },
  ];
  const deterministicPassed =
    deterministicResults.every((item) => item.passed) && !checks.testOutputTruncated;
  if (!deterministicPassed) {
    return {
      verdict: 'failed',
      criteriaResults: deterministicResults,
      reason: 'coding_evidence_did_not_pass',
    };
  }
  if (jevStatus === 'not_evaluated' || !jevStatus) {
    return {
      verdict: 'not_evaluated',
      criteriaResults: deterministicResults,
      reason: 'jev_review_unavailable',
    };
  }
  const criteriaResults = [
    ...deterministicResults,
    { criterion: 'jev_review_passed', passed: jevStatus === 'passed' },
  ];
  return {
    verdict: jevStatus === 'passed' ? 'passed' : 'failed',
    criteriaResults,
    ...(jevStatus === 'passed' ? {} : { reason: 'jev_review_failed' }),
  };
}

function vanillaChangedFileEvidence(fixture, checks) {
  const changedPaths = Array.isArray(checks.changedPaths) ? checks.changedPaths : [];
  const safelyCaptured =
    (changedPaths.length === 0 && checks.codeChanged === false) ||
    (changedPaths.length === 1 &&
      changedPaths[0] === fixture.targetFilename &&
      checks.codeChanged === true &&
      checks.onlyTargetChanged === true);
  if (!safelyCaptured) {
    return {
      changedFilesStatus: 'unavailable',
      changedFiles: [],
      relevantIgnoredFilesChanged: false,
    };
  }
  return {
    changedFilesStatus: 'captured',
    changedFiles: checks.codeChanged
      ? [{ path: fixture.targetFilename, change: 'edited' }]
      : [],
    relevantIgnoredFilesChanged: false,
  };
}

function outputText(response) {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return '';
  if (typeof response.output === 'string') return response.output;
  if (typeof response.content === 'string') return response.content;
  const content = response.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

export function extractVanillaSource(response, targetFilename) {
  const text = outputText(response).trim();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES * 2) {
    throw new Error('Vanilla model returned no bounded source output.');
  }
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.filename === undefined || parsed.filename === targetFilename) &&
      typeof parsed.content === 'string'
    ) {
      if (Buffer.byteLength(parsed.content, 'utf8') > MAX_SOURCE_BYTES) throw new Error();
      return parsed.content;
    }
  } catch {}
  const fence = text.match(/```(?:javascript|js|mjs)?\s*\n([\s\S]*?)```/i);
  const source = fence ? fence[1] : text;
  if (
    Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES ||
    !source.match(EXPORT_FUNCTION)
  ) {
    throw new Error('Vanilla model output did not contain the requested named export.');
  }
  return source;
}

function reviewConfig({ apiBaseUrl, accountHash, conversationId }) {
  if (typeof accountHash !== 'string' || !SHA256.test(accountHash)) {
    throw new Error('A dedicated evaluation account hash is required.');
  }
  if (typeof conversationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) {
    throw new Error('A dedicated evaluation conversation ID is required.');
  }
  return { accountHash, conversationId, apiBaseUrl: apiBaseUrl.replace(/\/$/, '') };
}

export const NATIVE_CODING_BENCHMARK = 'scripts/benchmark-native-engineering.mjs';

/** The removed delegated coding arm is unavailable; native Goose has a separate harness. */
export async function runOrqanixCodingArm() {
  const timestamp = new Date().toISOString();
  return {
    status: 'failed',
    executionSucceeded: false,
    model: 'native-goose/unavailable',
    endpoint: 'native-goose/evaluation-adapter-unavailable',
    startedAt: timestamp,
    finishedAt: timestamp,
    elapsedMs: 0,
    output: '',
    evaluation: { verdict: 'not_evaluated', reason: 'native_coding_adapter_unavailable' },
    evidence: {
      execution: 'unavailable',
      benchmark: NATIVE_CODING_BENCHMARK,
      reason: 'The cloud coding adapter is retired. Use the separate native Goose benchmark; no coding model or tests ran for this arm.',
    },
    error: 'NATIVE_CODING_ADAPTER_UNAVAILABLE',
  };
}

async function evaluateVanillaWithJev({
  fixture,
  config,
  caseData,
  tokenProvider,
  jevEvaluator,
  checks,
  testResult,
  signal,
}) {
  const taskId = randomUUID();
  const inputHash = jsonHash({
    task: caseData.prompt,
    acceptanceCriteria: caseData.criteria,
    researchReferences: [],
  });
  const changedFileEvidence = vanillaChangedFileEvidence(fixture, checks);
  const evidence = {
    diff: {
      status: 'captured',
      before: caseData.fixture.starter,
      after: await readFile(fixture.targetPath, 'utf8'),
      changed: checks.codeChanged,
    },
    tests: testResult,
    toolsUsed: [],
    ...changedFileEvidence,
  };
  try {
    const receipt = await invokeValidatedJev(jevEvaluator, {
      config,
      signal,
      tokenProvider,
      request: {
        taskId,
        conversationId: config.conversationId,
        task: caseData.prompt,
        inputHash,
        acceptanceCriteria: caseData.criteria,
        researchReferences: [],
        evidence,
      },
    });
    return { taskId, inputHash, evidence, review: receipt?.review || { status: 'not_evaluated' } };
  } catch {
    return {
      taskId,
      inputHash,
      evidence,
      review: { status: 'not_evaluated', reason: 'review_unavailable' },
    };
  }
}

/** Execute the vanilla comparator and verify its source with the exact same hidden tests. */
export async function runVanillaCodingArm({
  caseData,
  apiBaseUrl,
  accountHash,
  conversationId,
  tokenProvider,
  vanillaCall,
  signal,
  workRoot = join(tmpdir(), 'orqanix-agent-evaluations'),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  jevEvaluator,
  keepWorkspace = false,
}) {
  if (typeof vanillaCall !== 'function') throw new Error('vanillaCall is required.');
  if (typeof tokenProvider !== 'function') throw new Error('tokenProvider is required.');
  const fixture = await createFixture(caseData, workRoot);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  try {
    if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.startsWith('https://')) {
      throw new Error('A HTTPS evaluation gateway base URL is required.');
    }
    const config = reviewConfig({ apiBaseUrl, accountHash, conversationId });
    const response = await vanillaCall({ prompt: caseData.prompt, signal, caseData });
    const rawOutput = outputText(response);
    if (response?.status && response.status !== 'completed') {
      return {
        status: 'failed', executionSucceeded: false, model: response.model || 'vanilla',
        ...(response.resolvedModel ? { resolvedModel: response.resolvedModel } : {}),
        startedAt, finishedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
        output: rawOutput, error: response.error?.code || 'execution_incomplete',
        evaluation: { verdict: 'not_evaluated', reason: response.error?.code || 'execution_incomplete' },
        evidence: { execution: 'direct_model', providerEvidence: response.evidence || null },
        ...(response.usage ? { usage: response.usage } : {}),
      };
    }
    let source;
    try {
      source = extractVanillaSource(response, fixture.targetFilename);
      await writeFile(fixture.targetPath, source, { mode: 0o600 });
    } catch (error) {
      return {
        status: 'completed',
        executionSucceeded: true,
        model: response?.model || 'vanilla',
        ...(response?.resolvedModel ? { resolvedModel: response.resolvedModel } : {}),
        endpoint: response?.endpoint || apiBaseUrl,
        startedAt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        output: rawOutput,
        checks: {
          codeChanged: false,
          onlyTargetChanged: false,
          testsPassed: false,
          trustedTestsIntact: true,
          jevStatus: 'not_evaluated',
        },
        evaluation: { verdict: 'failed', reason: error.message },
        evidence: { execution: 'direct_model', requestId: response?.requestId || null },
        ...(response?.usage ? { usage: response.usage } : {}),
      };
    }
    const command = verificationCommand(fixture);
    const verification = await execute(process.execPath, command.slice(1), {
      cwd: fixture.workspace,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
      timeout: Math.min(timeoutMs, 120_000),
      maxBuffer: 16_000,
    });
    const testResult = {
      status: verification.error ? 'failed' : 'passed',
      command,
      exitCode: verification.error
        ? Number.isInteger(verification.error.code)
          ? verification.error.code
          : null
        : 0,
      output: `${verification.stdout}${verification.stderr}`.slice(0, 16_000),
      truncated: `${verification.stdout}${verification.stderr}`.length > 16_000,
    };
    const checks = await fixtureChecks(fixture, testResult);
    const receipt = await evaluateVanillaWithJev({
      fixture,
      config,
      caseData,
      tokenProvider,
      jevEvaluator: jevEvaluator || machineJevEvaluator({ apiBaseUrl, tokenProvider }),
      checks,
      testResult,
      signal,
    });
    return {
      status: 'completed',
      executionSucceeded: true,
      model: response?.model || 'vanilla',
      ...(response?.resolvedModel ? { resolvedModel: response.resolvedModel } : {}),
      endpoint: response?.endpoint || apiBaseUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      output: rawOutput,
      checks: { ...checks, jevStatus: receipt.review.status },
      evaluation: armEvaluation(checks, receipt.review.status),
      evidence: {
        execution: 'direct_model',
        requestId: response?.requestId || null,
        taskId: receipt.taskId,
        inputHash: receipt.inputHash,
        evidenceHash: jsonHash(receipt.evidence),
        targetHash: checks.targetHash,
        tests: testResult,
        diff: receipt.evidence.diff,
        changedFilesStatus: receipt.evidence.changedFilesStatus,
        changedFiles: receipt.evidence.changedFiles,
        relevantIgnoredFilesChanged: receipt.evidence.relevantIgnoredFilesChanged,
        review: receipt.review,
      },
      ...(response?.usage ? { usage: response.usage } : {}),
    };
  } finally {
    if (!keepWorkspace) await removeFixture(fixture);
  }
}

/** Preserve the direct-model comparator and record the unavailable coding arm explicitly. */
export async function runCodingPair(options) {
  const settledArm = async (operation, model, execution) => {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    try {
      return await operation();
    } catch {
      return {
        status: 'failed',
        executionSucceeded: false,
        model,
        endpoint: options.apiBaseUrl,
        startedAt,
        finishedAt: new Date().toISOString(),
        elapsedMs: performance.now() - started,
        output: '',
        checks: {
          codeChanged: false,
          onlyTargetChanged: false,
          testsPassed: false,
          trustedTestsIntact: false,
          jevStatus: 'not_evaluated',
        },
        evaluation: { verdict: 'not_evaluated', reason: 'execution_incomplete' },
        evidence: { execution },
        error: 'coding_arm_failed',
      };
    }
  };
  const [orqanix, vanilla] = await Promise.all([
    settledArm(() => runOrqanixCodingArm(options), 'native-goose/unavailable', 'unavailable'),
    settledArm(() => runVanillaCodingArm(options), 'vanilla', 'direct_model'),
  ]);
  return { orqanix, vanilla };
}
