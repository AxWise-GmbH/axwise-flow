import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildEvaluationCatalog } from './catalog.mjs';
import {
  extractVanillaSource,
  runCodingPair,
  runOrqanixCodingArm,
  runVanillaCodingArm,
} from './coding.mjs';

const ACCOUNT = 'a'.repeat(64);
const BASE = 'https://evaluation.example.test/internal/evaluations/v1';
const TOKEN = async () => 'fixture-identity-token-1234567890';
const codingCase = () => buildEvaluationCatalog({ slot: '2026-09-21T06:30:00.000Z' }).cases.find((item) => item.category === 'coding');

const passingSource = (caseData) => {
  if (caseData.fixture.targetFilename.endsWith('clamp.js')) {
    return 'export function clamp(value, min, max) {\n  if (min > max) throw new RangeError();\n  return Math.min(max, Math.max(min, value));\n}\n';
  }
  if (caseData.fixture.targetFilename.endsWith('normalize-tags.js')) {
    return 'export function normalizeTags(tags) {\n  return [...new Set(tags.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();\n}\n';
  }
  return 'export function chunk(items, size) {\n  if (!Number.isInteger(size) || size <= 0) throw new RangeError();\n  const result = [];\n  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));\n  return result;\n}\n';
};

const passingReview = async ({ request }) => ({
  taskId: request.taskId,
  inputHash: request.inputHash,
  evidenceHash: createHash('sha256').update(JSON.stringify(request.evidence)).digest('hex'),
  review: { status: 'passed' },
});
const fakeGateway = async () => ({
  apiBaseUrl: 'http://127.0.0.1:1',
  tokenProvider: async () => 'local-fixture-token',
  close: async () => {},
});

test('extractVanillaSource accepts bounded JSON or fenced source and rejects prose', () => {
  assert.match(
    extractVanillaSource(
      JSON.stringify({ filename: 'src/clamp.js', content: 'export function clamp() {}' }),
      'src/clamp.js'
    ),
    /export function clamp/
  );
  assert.match(
    extractVanillaSource('Here:\n```js\nexport function clamp() {}\n```', 'src/clamp.js'),
    /export function clamp/
  );
  assert.throws(() => extractVanillaSource('I would edit the file.', 'src/clamp.js'));
});

test('vanilla arm runs the catalog prompt through hidden tests and Jev', async () => {
  const caseData = codingCase();
  const prompts = [];
  const arm = await runVanillaCodingArm({
    caseData,
    apiBaseUrl: BASE,
    accountHash: ACCOUNT,
    conversationId: 'evaluation-coding',
    tokenProvider: TOKEN,
    vanillaCall: async ({ prompt }) => {
      prompts.push(prompt);
      return {
        output: `\`\`\`js\n${passingSource(caseData)}\`\`\``,
        model: 'gemini-direct',
        resolvedModel: 'gemini-fixture',
        requestId: 'request-1',
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    },
    jevEvaluator: passingReview,
  });
  assert.deepEqual(prompts, [caseData.prompt]);
  assert.equal(arm.status, 'completed');
  assert.equal(arm.executionSucceeded, true);
  assert.equal(arm.evaluation.verdict, 'passed');
  assert.equal(arm.checks.testsPassed, true);
  assert.equal(arm.checks.onlyTargetChanged, true);
  assert.equal(arm.checks.trustedTestsIntact, true);
  assert.equal(arm.checks.jevStatus, 'passed');
  assert.equal(arm.evidence.execution, 'direct_model');
  assert.match(arm.evidence.tests.output, /"status":"passed"/);
});

test('risky generated source fails before it can access ambient capabilities', async () => {
  const caseData = codingCase();
  const arm = await runVanillaCodingArm({
    caseData,
    apiBaseUrl: BASE,
    accountHash: ACCOUNT,
    conversationId: 'evaluation-coding',
    tokenProvider: TOKEN,
    vanillaCall: async () => ({
      output: 'export function clamp() { return process.env; }',
      model: 'gemini-direct',
    }),
    jevEvaluator: passingReview,
  });
  assert.equal(arm.status, 'completed');
  assert.equal(arm.checks.testsPassed, false);
  assert.equal(arm.evaluation.verdict, 'failed');
  assert.equal(arm.evidence.tests.output.includes('forbidden capability'), true);
});

test('a mismatched injected Jev receipt cannot produce a pass', async () => {
  const caseData = codingCase();
  const arm = await runVanillaCodingArm({
    caseData,
    apiBaseUrl: BASE,
    accountHash: ACCOUNT,
    conversationId: 'evaluation-coding',
    tokenProvider: TOKEN,
    vanillaCall: async () => ({ output: passingSource(caseData), model: 'gemini-direct' }),
    jevEvaluator: async () => ({
      taskId: 'wrong-task',
      inputHash: '0'.repeat(64),
      evidenceHash: '1'.repeat(64),
      review: { status: 'passed' },
    }),
  });
  assert.equal(arm.evaluation.verdict, 'not_evaluated');
  assert.equal(arm.checks.jevStatus, 'not_evaluated');
  assert.equal(arm.evidence.review.reason, 'invalid_review_receipt');
});

test('all three rotating coding fixtures pass the same isolated harness', async () => {
  const cases = new Map();
  const start = Date.parse('2026-09-21T00:00:00.000Z');
  for (let index = 0; index < 100 && cases.size < 3; index += 1) {
    const item = buildEvaluationCatalog({ slot: new Date(start + index * 900_000) }).cases.find(
      (entry) => entry.category === 'coding'
    );
    cases.set(item.templateId, item);
  }
  assert.equal(cases.size, 3);
  for (const caseData of cases.values()) {
    const arm = await runVanillaCodingArm({
      caseData,
      apiBaseUrl: BASE,
      accountHash: ACCOUNT,
      conversationId: 'evaluation-coding',
      tokenProvider: TOKEN,
      vanillaCall: async () => ({ output: passingSource(caseData), model: 'gemini-direct' }),
      jevEvaluator: passingReview,
    });
    assert.equal(arm.evaluation.verdict, 'passed', caseData.templateId);
  }
});

test('OMP arm maps real bridge evidence and requires tests plus Jev', async () => {
  const caseData = codingCase();
  let received;
  const engineeringTaskRunner = async (options) => {
    received = options;
    await writeFile(
      join(options.config.workspace, caseData.fixture.targetFilename),
      passingSource(caseData)
    );
    return {
      status: 'review_required',
      taskId: 'task-1',
      inputHash: 'b'.repeat(64),
      evidenceHash: 'c'.repeat(64),
      assistantText: 'Implemented and verified.',
      outputTruncated: false,
      toolsUsed: ['read', 'edit'],
      evidence: {
        tests: { status: 'passed', command: options.testCommand, exitCode: 0, output: '', truncated: false },
        diff: { status: 'captured', changed: true, before: '', after: 'diff' },
      },
      review: { status: 'passed' },
    };
  };
  const arm = await runOrqanixCodingArm({
    caseData,
    apiBaseUrl: BASE,
    accountHash: ACCOUNT,
    conversationId: 'evaluation-coding',
    tokenProvider: TOKEN,
    ompBinary: '/fixture/omp',
    engineeringTaskRunner,
    ompGatewayFactory: fakeGateway,
    jevEvaluator: passingReview,
  });
  assert.equal(received.task, caseData.prompt);
  assert.deepEqual(received.acceptanceCriteria, caseData.criteria);
  assert.equal(received.config.model, 'orqanix/orqaly-gemini');
  assert.equal(received.testCommand.includes('--permission'), true);
  assert.equal(arm.status, 'completed');
  assert.equal(arm.evaluation.verdict, 'passed');
  assert.equal(arm.evidence.execution, 'headless_omp');
});

test('pair sends the exact same prompt to both arms', async () => {
  const caseData = codingCase();
  const seen = [];
  const engineeringTaskRunner = async (options) => {
    seen.push(options.task);
    await writeFile(join(options.config.workspace, caseData.fixture.targetFilename), passingSource(caseData));
    return {
      status: 'review_required',
      taskId: 'task-pair',
      inputHash: 'd'.repeat(64),
      evidenceHash: 'e'.repeat(64),
      assistantText: 'done',
      toolsUsed: ['edit'],
      evidence: {
        tests: { status: 'passed', command: options.testCommand, exitCode: 0, output: '', truncated: false },
        diff: { status: 'captured', changed: true, before: '', after: 'diff' },
      },
      review: { status: 'passed' },
    };
  };
  const pair = await runCodingPair({
    caseData,
    apiBaseUrl: BASE,
    accountHash: ACCOUNT,
    conversationId: 'evaluation-coding',
    tokenProvider: TOKEN,
    vanillaCall: async ({ prompt }) => {
      seen.push(prompt);
      return { output: passingSource(caseData), model: 'gemini-direct' };
    },
    engineeringTaskRunner,
    ompGatewayFactory: fakeGateway,
    jevEvaluator: passingReview,
  });
  assert.equal(seen.length, 2);
  assert.equal(seen.every((prompt) => prompt === caseData.prompt), true);
  assert.equal(pair.orqanix.evaluation.verdict, 'passed');
  assert.equal(pair.vanilla.evaluation.verdict, 'passed');
});

test('pair records one failed arm without suppressing the other arm', async () => {
  const caseData = codingCase();
  let vanillaRan = false;
  const pair = await runCodingPair({
    caseData,
    apiBaseUrl: BASE,
    accountHash: ACCOUNT,
    conversationId: 'evaluation-coding',
    tokenProvider: TOKEN,
    vanillaCall: async () => {
      vanillaRan = true;
      return { output: passingSource(caseData), model: 'gemini-direct' };
    },
    engineeringTaskRunner: async () => {
      throw new Error('private provider detail');
    },
    ompGatewayFactory: fakeGateway,
    jevEvaluator: passingReview,
  });
  assert.equal(vanillaRan, true);
  assert.equal(pair.orqanix.status, 'failed');
  assert.equal(pair.orqanix.error, 'coding_arm_failed');
  assert.equal(pair.orqanix.evaluation.verdict, 'not_evaluated');
  assert.ok(pair.orqanix.elapsedMs >= 0);
  assert.equal(JSON.stringify(pair).includes('private provider detail'), false);
  assert.equal(pair.vanilla.evaluation.verdict, 'passed');
});
