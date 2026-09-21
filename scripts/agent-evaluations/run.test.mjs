import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluationTransport, cycleId, runEvaluationCycle } from './run.mjs';

test('transport confines workload identity to the preview API and uses custom OIDC header', async () => {
  assert.throws(() => createEvaluationTransport({ apiOrigin: 'https://unrelated.run.app', tokenProvider: async () => 'secret' }));
  let call;
  const transport = createEvaluationTransport({ tokenProvider: async () => 'test-token', fetchImpl: async (url, options) => {
    call = { url, options }; return Response.json({ status: 'completed' });
  } });
  await transport.execute({ prompt: 'fixture' });
  assert.match(call.url, /\/internal\/evaluations\/v1\/execute$/);
  assert.equal(call.options.headers.Authorization, undefined);
  assert.equal(call.options.headers['X-Orqaly-Evaluation-Authorization'], 'Bearer test-token');
  assert.equal(call.options.redirect, 'error');
  assert.doesNotMatch(call.options.body, /test-token/);
});

test('cycles retain provider failures, exact paired inputs, and separately recorded quality failures', async () => {
  const requests = [];
  const slot = '2026-09-21T09:00:00.000Z';
  const result = await runEvaluationCycle({ slot, runnerRevision: 'a'.repeat(40), tokenProvider: async () => 'token',
    now: () => new Date('2026-09-21T09:02:00.000Z'),
    transport: { base: 'https://example.invalid/internal/evaluations/v1',
      execute: async body => {
        requests.push(body);
        if (body.category === 'search' && body.arm === 'orqanix') throw new Error('evaluation_http_502');
        if (body.category === 'research' && body.arm === 'vanilla') return { ...body, runId: 'wrong-run', status: 'completed', output: 'wrong receipt' };
        if (body.category === 'plan' && body.arm === 'orqanix') return { ...body, status: 'completed', output: 'tampered', evidence: { outputHash: '0'.repeat(64) } };
        return { ...body, status: 'completed', output: 'Fixture answer', model: 'gemini-3.8-flash',
          path: { kind: 'orqanix_assistant', route: 'AXWISE_ONE_SHOT' },
          usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 } };
      }, judge: async () => ({ verdict: 'failed' }) },
    evaluator: async () => ({ evaluation: { verdict: 'failed', reason: 'fixture_check_failed' }, evidence: {} }),
    codingRunner: async ({ caseData, vanillaCall }) => {
      await vanillaCall(caseData.prompt);
      const arm = { status: 'completed', model: 'gemini-3.8-flash', elapsedMs: 42, output: 'code',
        evaluation: { verdict: 'passed', reason: 'fixture_tests_passed' }, evidence: { tests: { status: 'passed' } } };
      return { orqanix: arm, vanilla: arm };
    },
  });
  assert.equal(result.record.runId, cycleId(slot));
  assert.equal(result.record.cases.length, 5);
  const search = result.record.cases.find(item => item.category === 'search');
  assert.equal(search.arms.orqanix.status, 'failed');
  assert.equal(search.arms.orqanix.evaluation.verdict, 'not_evaluated');
  assert.equal(search.arms.vanilla.status, 'completed');
  assert.equal(search.arms.vanilla.evaluation.verdict, 'failed');
  assert.equal(result.record.cases.find(item => item.category === 'research').arms.vanilla.error, 'execution_receipt_identity_mismatch');
  assert.equal(result.record.cases.find(item => item.category === 'plan').arms.orqanix.error, 'execution_receipt_hash_mismatch');
  assert.deepEqual(search.arms.vanilla.usage, { inputTokens: 4, outputTokens: 6, totalTokens: 10 });
  for (const category of ['message', 'search', 'research', 'plan']) {
    const pair = requests.filter(item => item.category === category);
    assert.equal(pair.length, 2);
    assert.equal(pair[0].prompt, pair[1].prompt);
    assert.deepEqual(pair[0].criteria, pair[1].criteria);
  }
  assert.ok(result.record.cases.every(item => Object.values(item.arms).every(arm => typeof arm.endpoint === 'string')));
  assert.equal(result.evidence.cases[0].arms.orqanix.output, 'Fixture answer');
  assert.match(result.evidence.methodology.codingScope, /does not exercise packaged desktop UI/);
});
