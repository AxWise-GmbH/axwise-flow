// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import { createAxWiseClient } from './axwise-client.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const tenantId = id(1);
const operationId = id(2);

function envelope() {
  const input = {
    type: 'CompileScopeV2',
    request: 'Create an Estonia cat-food launch PRD.',
    objectiveOnlyContext: [],
    safeDefaults: {
      geography: [],
      acceptedSourceTypes: [],
      assumptions: [],
      limits: [],
      policies: [],
    },
  };
  return {
    operationId,
    operationType: input.type,
    owner: {
      tenantId,
      organizationId: null,
      userId: 'user_axwiseclient123',
    },
    workflow: {
      runId: id(3),
      stageId: id(4),
      stageAttemptId: id(5),
    },
    contractVersion: 'axwise.operation.v2',
    canonicalInputHash: canonicalHash(input),
    input,
  };
}

function acceptedResponse(input = envelope()) {
  return {
    status: 'accepted',
    operationId,
    canonicalInputHash: input.canonicalInputHash,
    statusUrl: `https://axwise.test/v2/operations/${operationId}?tenantId=${tenantId}`,
    retryAfterSeconds: 1,
  };
}

describe('AxWise Cloud Run client', () => {
  it('preserves Google ID-token Headers objects and tenant-bound status URLs', async () => {
    const input = envelope();
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.headers.authorization).toBe('Bearer preview-id-token');
      expect(init.headers['idempotency-key']).toBe(operationId);
      expect(JSON.parse(init.body)).toEqual(input);
      return new Response(JSON.stringify(acceptedResponse(input)), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => new Headers({ authorization: 'Bearer preview-id-token' }),
      fetchImpl,
    });

    await expect(client.submit(input)).resolves.toMatchObject({
      status: 'accepted',
      operationId,
      statusUrl: acceptedResponse(input).statusUrl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('classifies a lost POST response as ambiguous and keeps deterministic same-operation recovery', async () => {
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({}),
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('connection reset after send')),
    });

    await expect(client.submit(envelope())).rejects.toMatchObject({
      name: 'AxWiseDispatchError',
      errorClass: 'AXWISE_NETWORK',
      retryable: true,
      disposition: 'ambiguous',
    });
    expect(client.deterministicStatusUrl(operationId, tenantId)).toBe(
      `https://axwise.test/v2/operations/${operationId}?tenantId=${tenantId}`
    );
  });

  it('preserves an optional retry time from a typed terminal failure', async () => {
    const retryAt = '2026-09-01T10:10:00.000Z';
    const diagnostics = {
      route: 'grounded_search',
      status: 'rate_limited',
      retryAfterSeconds: 450,
      primary: {
        route: 'google_grounded_search',
        status: 'rate_limited',
        upstreamStatusCode: 429,
      },
    };
    const input = envelope();
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({}),
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'failed',
            operationId,
            canonicalInputHash: input.canonicalInputHash,
            retryable: true,
            errorClass: 'AXWISE_RATE_LIMITED',
            retryAt,
            retryAfterSeconds: 450,
            diagnostics,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      ),
    });

    await expect(client.submit(input)).resolves.toMatchObject({
      status: 'failed',
      retryAt,
      retryAfterSeconds: 450,
      diagnostics,
    });
  });

  it.each([
    {
      retryAt: '2026-09-01T12:10:00.000+02:00',
    },
    {
      diagnostics: {
        route: 'grounded_search',
        status: 'failed',
        primary: {
          route: 'google_grounded_search',
          status: 'failed',
          primaryStatus: 'not_allowed_in_phase',
        },
      },
    },
  ])('rejects drift from the strict AxWise failure contract: %j', async (drift) => {
    const input = envelope();
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({}),
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'failed',
            operationId,
            canonicalInputHash: input.canonicalInputHash,
            retryable: true,
            errorClass: 'AXWISE_FAILED',
            ...drift,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      ),
    });

    await expect(client.submit(input)).rejects.toMatchObject({
      errorClass: 'AXWISE_INVALID_TERMINAL_CONTRACT',
      retryable: false,
    });
  });

  it.each([
    [`https://axwise.test/v2/operations/${operationId}?tenantId=${id(99)}`, 'another tenant'],
    [`https://evil.test/v2/operations/${operationId}?tenantId=${tenantId}`, 'another origin'],
    [`https://axwise.test/v2/operations/status/${operationId}?tenantId=${tenantId}`, 'another path'],
    [
      `https://axwise.test/v2/operations/${operationId}?tenantId=${tenantId}&redirect=true`,
      'extra query state',
    ],
  ])('rejects a status URL bound to %s (%s)', async (statusUrl) => {
    const input = envelope();
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({}),
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...acceptedResponse(input), statusUrl }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
      ),
    });

    await expect(client.submit(input)).rejects.toMatchObject({
      errorClass: 'AXWISE_STATUS_URL_REJECTED',
      retryable: false,
      disposition: 'terminal',
    });
  });

  it('classifies poll 404 as a same-envelope redispatch signal', async () => {
    const statusUrl = `https://axwise.test/v2/operations/${operationId}?tenantId=${tenantId}`;
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({}),
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    });

    await expect(client.poll(statusUrl, operationId, tenantId)).rejects.toMatchObject({
      errorClass: 'AXWISE_OPERATION_NOT_FOUND',
      status: 404,
      retryable: true,
      disposition: 'not_found',
    });
  });

  it('propagates status-read cancellation to the upstream GET without turning it into a retryable failure', async () => {
    const controller = new AbortController();
    let upstreamSignal;
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      upstreamSignal = signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      markStarted();
    }));
    const client = createAxWiseClient({ baseUrl: 'https://axwise.test', authHeaders: async () => ({}), fetchImpl });
    const reason = new Error('status wait ended');
    const result = expect(client.poll(client.deterministicStatusUrl(operationId, tenantId), operationId, tenantId,
      { signal: controller.signal })).rejects.toBe(reason);
    await started;
    controller.abort(reason);
    await result;
    expect(upstreamSignal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not issue a status GET if cancellation happens while authenticating upstream', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn();
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => { controller.abort(); return {}; },
      fetchImpl,
    });
    await expect(client.poll(client.deterministicStatusUrl(operationId, tenantId), operationId, tenantId,
      { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads typed cursor events and cancels through tenant-bound operation endpoints', async () => {
    const input = envelope();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            operationId,
            after: 0,
            nextAfter: 1,
            hasMore: false,
            events: [
              {
                operationId,
                sequence: 1,
                eventType: 'running',
                status: 'running',
                occurredAt: '2026-09-02T10:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            operationId,
            status: 'cancelled',
            canonicalInputHash: input.canonicalInputHash,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({ authorization: 'Bearer token' }),
      fetchImpl,
    });

    await expect(client.events(operationId, tenantId)).resolves.toMatchObject({
      nextAfter: 1,
      events: [{ eventType: 'running' }],
    });
    await expect(client.cancel(operationId, tenantId)).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://axwise.test/v2/operations/${operationId}/events?tenantId=${tenantId}&after=0&limit=200`
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      `https://axwise.test/v2/operations/${operationId}/cancel?tenantId=${tenantId}`
    );
  });

  it('fails a received schema-invalid terminal result instead of polling it forever', async () => {
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({}),
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'completed',
        operationId,
        canonicalInputHash: envelope().canonicalInputHash,
        result: { resultType: 'unknown_terminal_shape' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    });

    await expect(client.submit(envelope())).rejects.toMatchObject({
      errorClass: 'AXWISE_INVALID_TERMINAL_CONTRACT',
      retryable: false,
      disposition: 'terminal',
    });
  });

  it('keeps a malformed nonterminal acceptance on same-operation ambiguous recovery', async () => {
    const client = createAxWiseClient({
      baseUrl: 'https://axwise.test',
      authHeaders: async () => ({}),
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        status: 'accepted',
        operationId,
      }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      })),
    });

    await expect(client.submit(envelope())).rejects.toMatchObject({
      errorClass: 'AXWISE_INVALID_CONTRACT',
      retryable: true,
      disposition: 'ambiguous',
    });
  });
});
