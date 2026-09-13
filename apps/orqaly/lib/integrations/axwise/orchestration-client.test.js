import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrchestrationDecision,
  getOrchestrationDecision,
  getPersonaResearchResult,
  getPersonaResearchStatus,
  refreshOrchestrationResearch,
  replanOrchestrationDecision,
  submitOrchestrationOutcome,
  listOrchestrationOutcomes,
} from './orchestration-client.js';

describe('AxWise orchestration client', () => {
  beforeEach(() => {
    vi.stubEnv('AXWISE_API_URL', 'https://axwise.test/api/orqaly-axwise/v1/');
    vi.stubEnv('AXWISE_API_KEY', 'server-secret');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ decision_id: 'decision-1' }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('creates an idempotent decision with the M2M and trace headers', async () => {
    await createOrchestrationDecision(
      { contract_version: '1.0' },
      { idempotencyKey: 'goal:g1:0', requestId: 'request-1' }
    );
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://axwise.test/api/orqaly-axwise/v1/orchestration/decisions');
    expect(options.method).toBe('POST');
    expect(options.headers['x-axwise-key']).toBe('server-secret');
    expect(options.headers['Idempotency-Key']).toBe('goal:g1:0');
    expect(options.headers['X-Request-ID']).toBe('request-1');
  });

  it('requires an idempotency key for create', () => {
    expect(() => createOrchestrationDecision({})).toThrow(/idempotencyKey/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retrieves decision-authorized durable dual-persona research with tenant scoping', async () => {
    const tenant = { orgId: 'org-1', userId: 'user-1' };
    await getPersonaResearchStatus('hybrid/1', tenant);
    await getPersonaResearchResult('hybrid/1', tenant);

    expect(global.fetch.mock.calls[0][0]).toContain('/runs/hybrid%2F1/status');
    expect(global.fetch.mock.calls[1][0]).toContain('/runs/hybrid%2F1');
    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers['X-Orqaly-Org-ID']).toBe('org-1');
      expect(options.headers['X-Orqaly-User-ID']).toBe('user-1');
    }
  });

  it('scopes reads, research refreshes and replans to the verified tenant', async () => {
    const tenant = { orgId: 'org-1', userId: 'user-1' };
    await getOrchestrationDecision('decision/1', tenant);
    await refreshOrchestrationResearch('decision-1', tenant, {
      idempotencyKey: 'refresh-1',
      requestId: 'request-2',
    });
    await replanOrchestrationDecision(
      'decision-1',
      tenant,
      {
        contract_version: '1.0',
        trigger: 'human_override',
        reason: 'Owner changed direction',
        human_instruction: 'Use the alternate plan',
      },
      { idempotencyKey: 'replan-1', requestId: 'request-3' }
    );

    expect(global.fetch.mock.calls[0][0]).toContain('decision%2F1');
    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers['X-Orqaly-Org-ID']).toBe('org-1');
      expect(options.headers['X-Orqaly-User-ID']).toBe('user-1');
    }
  });

  it('submits and lists Phase 4 outcomes with tenant and idempotency headers', async () => {
    const tenant = { orgId: 'org-1', userId: 'user-1' };
    await submitOrchestrationOutcome(
      'decision/1',
      tenant,
      { contract_version: '1.0', outcome_id: 'outcome-1', decision_id: 'decision/1' },
      { idempotencyKey: 'outcome-key-1' }
    );
    await listOrchestrationOutcomes('decision/1', tenant);

    expect(global.fetch.mock.calls[0][0]).toContain('/decision%2F1/outcomes');
    expect(global.fetch.mock.calls[0][1].method).toBe('POST');
    expect(global.fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('outcome-key-1');
    expect(global.fetch.mock.calls[1][1].method).toBe('GET');
    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers['X-Orqaly-Org-ID']).toBe('org-1');
      expect(options.headers['X-Orqaly-User-ID']).toBe('user-1');
    }
  });

  it('surfaces only structured AxWise error diagnostics', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: (name) => (name === 'x-request-id' ? 'request-header-1' : null) },
      text: async () =>
        JSON.stringify({
          detail: {
            code: 'AXWISE_UPSTREAM_DECISION_NOT_FOUND',
            message: 'upstream orchestration decision was not found',
            request_id: 'request-body-1',
          },
        }),
    });
    const error = await createOrchestrationDecision({}, { idempotencyKey: 'goal:g1:0' }).catch(
      (caught) => caught
    );

    expect(error.message).toContain('AXWISE_UPSTREAM_DECISION_NOT_FOUND');
    expect(error.message).toContain('request-body-1');
    expect(error.status).toBe(404);
    expect(error.code).toBe('AXWISE_UPSTREAM_DECISION_NOT_FOUND');
  });

  it('does not include arbitrary partner response bodies in thrown errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      headers: { get: () => null },
      text: async () => 'tenant-private-validation-payload',
    });

    const error = await createOrchestrationDecision({}, { idempotencyKey: 'goal:g1:0' }).catch(
      (caught) => caught
    );
    expect(error.message).toBe('AxWise orchestration API error: HTTP 422');
    expect(error.message).not.toContain('tenant-private');
    expect(error.code).toBe('AXWISE_HTTP_422');
  });

  it('rejects a loopback destination in Production before sending a goal decision', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('AXWISE_API_URL', 'http://127.0.0.1:8791/api/orqaly-axwise/v1');

    await expect(createOrchestrationDecision({}, { idempotencyKey: 'goal:g1:0' })).rejects.toThrow(
      /HTTPS|loopback/
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
