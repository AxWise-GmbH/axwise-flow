// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import {
  agentEvaluationConfigFromEnvironment,
  createAgentEvaluationOidcVerifier,
} from '../server/workflow-v2/agent-evaluation-config.js';
import { AgentEvaluationExecuteSchema, createAgentEvaluationService } from '../server/workflow-v2/agent-evaluation-service.js';
import { createAgentEvaluationRouter } from '../server/workflow-v2/agent-evaluation-http.js';
import { sha256Hex } from '../lib/workflow-v2/canonical.js';
import { buildEvaluationCatalog } from '../../../scripts/agent-evaluations/catalog.mjs';
import { evaluateOutput } from '../../../scripts/agent-evaluations/evaluate.mjs';

const runId = '11111111-1111-4111-8111-111111111111';
const slot = '2026-09-21T12:00:00.000Z';
const executeBody = { runId, slot, category: 'message', templateId: 'message-1', templateVersion: 1,
  prompt: 'Explain the observed retry behavior.', criteria: ['Explains the causal chain.'], arm: 'orqanix' };
const config = { audience: 'https://preview-api.example.test',
  serviceAccount: 'orqanix-evaluations-runner@axwise-v2-preview-001.iam.gserviceaccount.com',
  userId: 'user_benchmark1234' };
const servers = [];

afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
  server.closeAllConnections(); server.close(resolve);
}))));

function json(value) { return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }); }

describe('evaluation configuration and identity', () => {
  it('is absent by default and refuses production or partial preview configuration', () => {
    expect(agentEvaluationConfigFromEnvironment({ ORQALY_ENVIRONMENT: 'preview' })).toBeNull();
    expect(() => agentEvaluationConfigFromEnvironment({ ORQALY_AGENT_EVALUATION_ENABLED: 'true',
      ORQALY_ENVIRONMENT: 'prod', ORQALY_AGENT_EVALUATION_AUDIENCE: config.audience,
      ORQALY_AGENT_EVALUATION_SERVICE_ACCOUNT: config.serviceAccount, ORQALY_EVALUATION_USER_ID: config.userId }))
      .toThrow(/preview-only/);
    expect(() => agentEvaluationConfigFromEnvironment({ ORQALY_AGENT_EVALUATION_ENABLED: 'true',
      ORQALY_ENVIRONMENT: 'preview' })).toThrow();
  });

  it('binds a verified Google token to the exact configured service-account email', async () => {
    const client = { verifyIdToken: vi.fn(async ({ audience }) => ({ getPayload: () => ({
      iss: 'https://accounts.google.com', aud: audience, sub: '123', email: config.serviceAccount,
      email_verified: true,
    }) })) };
    await expect(createAgentEvaluationOidcVerifier(config, client)('signed.jwt')).resolves.toEqual({
      subject: '123', email: config.serviceAccount,
    });
    client.verifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ iss: 'https://accounts.google.com',
      sub: '456', email: 'other@axwise-v2-preview-001.iam.gserviceaccount.com', email_verified: true }) });
    await expect(createAgentEvaluationOidcVerifier(config, client)('other.jwt')).rejects.toMatchObject({ status: 403 });
  });
});

describe('real evaluation service contracts', () => {
  it('captures actual operation usage after a completed persisted turn', async () => {
    const assistantService = { send: vi.fn(async () => ({ route: 'DIRECT_ANSWER', persisted: false,
      message: { parts: [{ type: 'operation_status', status: 'running', retryAfterSeconds: 1 }] } })),
      resume: vi.fn(async () => ({ route: 'DIRECT_ANSWER', persisted: true,
        message: { parts: [{ type: 'text', markdown: 'A completed answer.' }] } })),
      readTurnMetrics: vi.fn(async () => ({ latencyMs: 700, inputTokens: 25,
        outputTokens: 12, totalTokens: 37 })) };
    const service = createAgentEvaluationService({ assistantService, userId: config.userId,
      geminiApiKey: 'server-gemini-key', sleep: async () => {} });
    const result = await service.execute(executeBody);
    expect(result.usage).toEqual({ promptTokens: 25, completionTokens: 12, totalTokens: 37 });
    expect(assistantService.readTurnMetrics).toHaveBeenCalledWith(
      { userId: config.userId }, result.path.threadId, result.path.turnId
    );
    expect(assistantService.resume).toHaveBeenCalledOnce();
  });

  it.each([null, { latencyMs: 700, inputTokens: 25 },
    { latencyMs: 700, inputTokens: 25, outputTokens: 12, totalTokens: -1 }])(
    'keeps unknown usage for absent or incomplete reported metrics: %j', async (metrics) => {
      const assistantService = { send: vi.fn(async () => ({ route: 'DIRECT_ANSWER', persisted: true,
        message: { parts: [{ type: 'text', markdown: 'A completed answer.' }] } })),
        resume: vi.fn(), readTurnMetrics: vi.fn(async () => metrics) };
      const service = createAgentEvaluationService({ assistantService, userId: config.userId,
        geminiApiKey: 'server-gemini-key' });
      expect((await service.execute(executeBody)).usage).toBeNull();
    }
  );

  it('preserves a completed answer when operation metrics are unavailable', async () => {
    const assistantService = { send: vi.fn(async () => ({ route: 'DIRECT_ANSWER', persisted: true,
      message: { parts: [{ type: 'text', markdown: 'A completed answer.' }] } })),
      resume: vi.fn(), readTurnMetrics: vi.fn(async () => { throw new Error('operation not found'); }) };
    const service = createAgentEvaluationService({ assistantService, userId: config.userId,
      geminiApiKey: 'server-gemini-key' });
    await expect(service.execute(executeBody)).resolves.toMatchObject({ status: 'completed',
      output: 'A completed answer.', usage: null });
  });

  it('bounds optional metrics lookup without adding its wait to execution timing', async () => {
    vi.useFakeTimers();
    try {
      const assistantService = { send: vi.fn(async () => ({ route: 'DIRECT_ANSWER', persisted: true,
        message: { parts: [{ type: 'text', markdown: 'A completed answer.' }] } })),
        resume: vi.fn(), readTurnMetrics: vi.fn(() => new Promise(() => {})) };
      const service = createAgentEvaluationService({ assistantService, userId: config.userId,
        geminiApiKey: 'server-gemini-key' });
      const pending = service.execute(executeBody);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(pending).resolves.toMatchObject({ status: 'completed', usage: null,
        evidence: { latencyMs: 0 } });
    } finally { vi.useRealTimers(); }
  });

  it('accepts the actual runner judge payload through the strict API contract', async () => {
    let caseData;
    for (let offset = 0; offset < 30 && !caseData; offset++) {
      caseData = buildEvaluationCatalog({ slot: new Date(Date.parse(slot) + offset * 900000) }).cases
        .find(item => item.templateId === 'message-json-normalization');
    }
    expect(caseData).toBeTruthy();
    const fetchImpl = vi.fn(async () => json({ model: 'jev-1.13.0', answers: {
      criterion_1: { type: 'noul', noul: 0.9 }, criterion_2: { type: 'noul', noul: 0.9 },
      criterion_3: { type: 'noul', noul: 0.9 }, overall_quality: { type: 'noul', noul: 0.9 },
    } }));
    const service = createAgentEvaluationService({ assistantService: { send: vi.fn(), resume: vi.fn() },
      userId: config.userId, geminiApiKey: 'server-gemini-key', typesafeApiKey: 'typesafe-key', fetchImpl });
    const result = await evaluateOutput({ runId, caseData,
      output: JSON.stringify({ project: 'Northstar', priorities: ['accessibility', 'observability', 'reliability'], owner: 'Mina' }),
      judge: body => service.judge(body) });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.evaluation.verdict).toBe('passed');
    const upstream = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(upstream.state.prompt).toBe(caseData.prompt);
    expect(upstream.state.verifiedChecks).toEqual(expect.any(Array));
    expect(upstream.questions.criterion_1.instructions).toContain(
      'Facts explicitly provided in the task are usable evidence'
    );
    expect(upstream.questions.criterion_1.instructions).toContain(
      'must not be recounted, re-estimated, or overridden'
    );
    expect(upstream.questions.overall_quality.instructions).toContain(
      'Do not impose unstated requirements.'
    );
    expect(result.evidence.judge.evidenceHash).toBe(sha256Hex(JSON.stringify(upstream.state)));
  });

  it('sends vanilla Gemini the exact user prompt with no Orqanix guidance or system message', async () => {
    const fetchImpl = vi.fn(async () => json({ id: 'provider-1', model: 'gemini-3.8-flash-202609',
      choices: [{ message: { content: 'A direct baseline answer.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 7, completion_tokens: 10, total_tokens: 17 } }));
    const service = createAgentEvaluationService({ assistantService: { send: vi.fn(), resume: vi.fn() },
      userId: config.userId, geminiApiKey: 'server-gemini-key', typesafeApiKey: 'typesafe-key', fetchImpl });
    const result = await service.execute({ ...executeBody, category: 'coding', arm: 'vanilla',
      prompt: 'Return the complete final file.' });
    expect(result).toMatchObject({ status: 'completed', arm: 'vanilla', output: 'A direct baseline answer.',
      path: { kind: 'vanilla_gemini', productContext: false } });
    const upstream = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(upstream).toEqual({ model: 'gemini-3.8-flash',
      messages: [{ role: 'user', content: 'Return the complete final file.' }], reasoning_effort: 'high',
      max_completion_tokens: 8192 });
    expect(JSON.stringify(upstream)).not.toMatch(/Orqanix|system|product/i);
  });

  it('generates plans through research artifact mode without starting a Goal', async () => {
    const send = vi.fn(async () => ({ route: 'AXWISE_ONE_SHOT', persisted: true,
      message: { model: 'gemini-3.8-flash', modelVersion: '2026-09', parts: [
        { type: 'artifact', markdown: '# Plan\n\n1. Change it.\n\n## Acceptance criteria\n- Tests pass.' },
        { type: 'source', title: 'Docs', url: 'https://example.test/docs', sourceTypes: ['official'] },
      ] } }));
    const service = createAgentEvaluationService({ assistantService: { send, resume: vi.fn() },
      userId: config.userId, geminiApiKey: 'server-gemini-key', typesafeApiKey: 'typesafe-key' });
    const result = await service.execute({ ...executeBody, category: 'plan', arm: 'orqanix' });
    expect(send.mock.calls[0][2]).toMatchObject({ intent: 'research', message: executeBody.prompt });
    expect(send.mock.calls[0][2].intent).not.toBe('goal');
    expect(result).toMatchObject({ status: 'completed', output: expect.stringContaining('# Plan'),
      sources: [{ url: 'https://example.test/docs' }], path: { route: 'AXWISE_ONE_SHOT' } });
  });

  it('gives Jev exact evaluator-fetched excerpts and rejects a changed excerpt hash', async () => {
    const excerpt = 'The official API requires an idempotency key for every retry.';
    const fetchImpl = vi.fn(async () => json({ model: 'jev-latest', answers: {
      criterion_1: { type: 'noul', noul: 0.9 }, overall_quality: { type: 'noul', noul: 0.85 },
    } }));
    const service = createAgentEvaluationService({ assistantService: { send: vi.fn(), resume: vi.fn() },
      userId: config.userId, geminiApiKey: 'server-gemini-key', typesafeApiKey: 'typesafe-key', fetchImpl });
    const command = { runId, category: 'research', prompt: 'Using the supplied official source, explain retries.',
      criteria: ['Cites the retry requirement.'],
      output: 'Retries use an idempotency key.', sources: [{ url: 'https://example.test/official',
        excerpt, contentHash: sha256Hex(excerpt) }] };
    const first = await service.judge(command);
    expect(first).toMatchObject({ verdict: 'passed', advisory: true,
      provider: 'typesafe', criteriaResults: [{ passed: true }] });
    const firstState = JSON.parse(fetchImpl.mock.calls[0][1].body).state;
    expect(firstState.prompt).toBe(command.prompt);
    expect(firstState.verifiedChecks).toEqual([]);
    expect(firstState.sources[0]).toEqual(command.sources[0]);
    const verified = await service.judge({ ...command,
      verifiedChecks: ['The measured output length is within the requested bound.'] });
    expect(verified.evidenceHash).not.toBe(first.evidenceHash);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).state.verifiedChecks)
      .toEqual(['The measured output length is within the requested bound.']);
    const changedPrompt = await service.judge({ ...command, prompt: `${command.prompt} Be concise.` });
    expect(changedPrompt.evidenceHash).not.toBe(first.evidenceHash);
    await expect(service.judge({ ...command, sources: [{ ...command.sources[0], excerpt: `${excerpt} Changed.` }] }))
      .rejects.toMatchObject({ name: 'ZodError' });
    await expect(service.judge({ ...command, unexpected: true }))
      .rejects.toMatchObject({ name: 'ZodError' });
    await expect(service.judge({ ...command, prompt: 'x'.repeat(24_001) }))
      .rejects.toMatchObject({ name: 'ZodError' });
    await expect(service.judge({ ...command, verifiedChecks: ['x'.repeat(2001)] }))
      .rejects.toMatchObject({ name: 'ZodError' });
    await expect(service.judge({ ...command, verifiedChecks: Array(17).fill('Measured.') }))
      .rejects.toMatchObject({ name: 'ZodError' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

async function routerFixture(overrides = {}) {
  const service = { execute: vi.fn(async (body) => ({ status: 'completed', ...AgentEvaluationExecuteSchema.parse(body), output: 'ok' })),
    judge: vi.fn(async () => ({ verdict: 'passed', advisory: true, provider: 'typesafe' })) };
  const commandService = { session: vi.fn(async () => ({ userId: config.userId, tenantBound: true })) };
  const oidcVerifier = vi.fn(async (token) => token === 'valid.jwt' ? { email: config.serviceAccount, subject: '123' }
    : Promise.reject(Object.assign(new Error('denied'), { status: 403 })));
  const app = express();
  app.use('/internal/evaluations/v1', createAgentEvaluationRouter({ config, service, commandService,
    oidcVerifier, geminiApiKey: 'server-gemini-key', fetchImpl: vi.fn(), ...overrides }));
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  servers.push(server);
  const call = (body = executeBody, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/internal/evaluations/v1/execute`, {
    method: 'POST', headers: { 'X-Orqaly-Evaluation-Authorization': 'Bearer valid.jwt', 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { call, service, commandService, oidcVerifier };
}

describe('machine evaluation HTTP boundary', () => {
  it('denies unverifiable and cross-identity callers before session, parsing, or execution', async () => {
    const f = await routerFixture();
    const response = await f.call('{invalid', { 'X-Orqaly-Evaluation-Authorization': 'Bearer wrong.jwt' });
    expect(response.status).toBe(403);
    expect(f.commandService.session).not.toHaveBeenCalled();
    expect(f.service.execute).not.toHaveBeenCalled();
    const other = await routerFixture({ oidcVerifier: async () => ({ email: 'other@example.test', subject: '2' }) });
    expect((await other.call()).status).toBe(403);
    expect(other.service.execute).not.toHaveBeenCalled();
  });

  it('rejects identity/model/tenant overrides and bounded invalid input', async () => {
    const f = await routerFixture();
    for (const body of [{ ...executeBody, userId: 'user_other' }, { ...executeBody, tenantId: 'tenant_other' },
      { ...executeBody, model: 'attacker-model' }, { ...executeBody, prompt: 'x'.repeat(24_001) }]) {
      const response = await f.call(body);
      expect(response.status).toBe(400);
    }
    expect(f.service.execute).toHaveBeenCalledTimes(4);
  });

  it('accepts only the dedicated evaluation authorization header', async () => {
    const f = await routerFixture();
    expect((await f.call()).status).toBe(200);
    expect(f.service.execute).toHaveBeenCalledWith(executeBody, { signal: expect.any(AbortSignal) });
    const standardOnly = await f.call(executeBody, {
      'X-Orqaly-Evaluation-Authorization': '', Authorization: 'Bearer valid.jwt',
    });
    expect(standardOnly.status).toBe(401);
  });
});
