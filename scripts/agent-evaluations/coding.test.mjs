import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  let reviewRequest;
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
    jevEvaluator: async (args) => {
      reviewRequest = args.request;
      return passingReview(args);
    },
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
  assert.equal(reviewRequest.evidence.changedFilesStatus, 'captured');
  assert.deepEqual(reviewRequest.evidence.changedFiles, [
    { path: caseData.fixture.targetFilename, change: 'edited' },
  ]);
  assert.equal(reviewRequest.evidence.relevantIgnoredFilesChanged, false);
  assert.equal(arm.evidence.changedFilesStatus, 'captured');
  assert.deepEqual(arm.evidence.changedFiles, reviewRequest.evidence.changedFiles);
  assert.equal(arm.evidence.relevantIgnoredFilesChanged, false);
});

test('vanilla arm preserves a non-passing Jev reason with its changed-file evidence', async () => {
  const caseData = codingCase();
  const arm = await runVanillaCodingArm({
    caseData,
    apiBaseUrl: BASE,
    accountHash: ACCOUNT,
    conversationId: 'evaluation-coding',
    tokenProvider: TOKEN,
    vanillaCall: async () => ({ output: passingSource(caseData), model: 'gemini-direct' }),
    jevEvaluator: async ({ request }) => ({
      taskId: request.taskId,
      inputHash: request.inputHash,
      evidenceHash: createHash('sha256').update(JSON.stringify(request.evidence)).digest('hex'),
      review: {
        status: 'not_evaluated',
        advisory: true,
        reason: 'missing_changed_file_evidence',
      },
    }),
  });
  assert.equal(arm.evaluation.verdict, 'not_evaluated');
  assert.equal(arm.evidence.review.reason, 'missing_changed_file_evidence');
  assert.equal(arm.evidence.changedFilesStatus, 'captured');
  assert.deepEqual(arm.evidence.changedFiles, [
    { path: caseData.fixture.targetFilename, change: 'edited' },
  ]);
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

test('a provider-truncated coding response remains incomplete instead of a quality failure', async () => {
  let reviews = 0;
  const arm = await runVanillaCodingArm({ caseData: codingCase(), apiBaseUrl: BASE, accountHash: ACCOUNT,
    conversationId: 'evaluation-truncated', tokenProvider: TOKEN,
    vanillaCall: async () => ({ status: 'failed', model: 'gemini-3.8-flash', output: 'partial output', error: { code: 'OUTPUT_TRUNCATED' } }),
    jevEvaluator: async () => { reviews++; return {}; } });
  assert.equal(arm.status, 'failed');
  assert.equal(arm.evaluation.verdict, 'not_evaluated');
  assert.equal(arm.error, 'OUTPUT_TRUNCATED');
  assert.equal(arm.output, 'partial output');
  assert.equal(reviews, 0);
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

test('retired coding arm performs no provider, token, fixture or review work', async () => {
  const unexpected = async () => { throw new Error('retired arm must not execute'); };
  const arm = await runOrqanixCodingArm({
    caseData: codingCase(), tokenProvider: unexpected, jevEvaluator: unexpected,
    workRoot: '/unwritable/retired-coding-arm',
  });
  assert.equal(arm.status, 'failed');
  assert.equal(arm.executionSucceeded, false);
  assert.equal(arm.error, 'NATIVE_CODING_ADAPTER_UNAVAILABLE');
  assert.equal(arm.evaluation.verdict, 'not_evaluated');
  assert.equal(arm.elapsedMs, 0);
  assert.equal(arm.evidence.execution, 'unavailable');
  assert.equal(arm.evidence.benchmark, 'scripts/benchmark-native-engineering.mjs');
  assert.equal(arm.evidence.tests, undefined);
});

test('pair keeps the direct-model comparator while reporting unavailable native adapter', async () => {
  const caseData = codingCase();
  const seen = [];
  const pair = await runCodingPair({
    caseData, apiBaseUrl: BASE, accountHash: ACCOUNT,
    conversationId: 'evaluation-coding', tokenProvider: TOKEN,
    vanillaCall: async ({ prompt }) => {
      seen.push(prompt);
      return { output: passingSource(caseData), model: 'gemini-direct' };
    },
    jevEvaluator: passingReview,
  });
  assert.deepEqual(seen, [caseData.prompt]);
  assert.equal(pair.orqanix.status, 'failed');
  assert.equal(pair.orqanix.error, 'NATIVE_CODING_ADAPTER_UNAVAILABLE');
  assert.equal(pair.orqanix.evaluation.verdict, 'not_evaluated');
  assert.equal(pair.vanilla.evaluation.verdict, 'passed');
});

test('pair records comparator failures without fabricating either arm success', async () => {
  const pair = await runCodingPair({
    caseData: codingCase(), apiBaseUrl: BASE, accountHash: ACCOUNT,
    conversationId: 'evaluation-coding', tokenProvider: TOKEN,
    vanillaCall: async () => { throw new Error('private provider detail'); },
    jevEvaluator: passingReview,
  });
  assert.equal(pair.orqanix.error, 'NATIVE_CODING_ADAPTER_UNAVAILABLE');
  assert.equal(pair.vanilla.status, 'failed');
  assert.equal(pair.vanilla.error, 'coding_arm_failed');
  assert.equal(pair.vanilla.evaluation.verdict, 'not_evaluated');
  assert.equal(JSON.stringify(pair).includes('private provider detail'), false);
});
