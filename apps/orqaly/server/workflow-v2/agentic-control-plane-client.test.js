import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import {
  AgenticControlPlaneError,
  createAgenticControlPlaneClient,
  createAgenticControlPlaneClientFromEnvironment,
} from './agentic-control-plane-client.js';

const SIGNING_KEY = 'agentic-test-signing-key-that-is-at-least-32-characters';
const OWNER = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  userId: 'user_agentbridge123',
};
const AGENT_ID = '00000000-0000-4000-8000-000000000002';

function successful(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status || 200,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

function agentProjection(overrides = {}) {
  const profile = {
    version: 'orqaly_agent_profile_input_v1',
    displayName: 'Research Scout',
    roleLabel: 'Evidence researcher',
    description: 'Finds bounded evidence.',
    instructions: 'Cite evidence and mark uncertainty.',
    avatar: { kind: 'icon', value: 'science', color: '#6750A4' },
  };
  return {
    id: AGENT_ID,
    display_name: profile.displayName,
    agent_kind: 'persistent',
    state: 'active',
    source_task_id: null,
    source_decision_id: null,
    project_id: null,
    conversation_id: null,
    originating_run_id: null,
    workflow_run_id: null,
    expires_at: null,
    version: 1,
    created_from: 'manual',
    activated_at: '2026-09-04T10:00:00.000Z',
    paused_at: null,
    revoked_at: null,
    archived_at: null,
    created_at: '2026-09-04T09:00:00.000Z',
    updated_at: '2026-09-04T10:00:00.000Z',
    profile: {
      version: 'orqaly_agent_profile_v1',
      id: '00000000-0000-4000-8000-000000000003',
      agentId: AGENT_ID,
      versionNumber: 1,
      contentHash: canonicalHash(profile),
      profile,
      createdBy: OWNER.userId,
      createdAt: '2026-09-04T09:00:00.000Z',
    },
    persona_contract_version: null,
    persona_id: null,
    persona_content_hash: null,
    run_count: 0,
    latest_run: null,
    ...overrides,
  };
}

describe('Agentic control-plane client', () => {
  it('derives a short-lived least-scope signed user principal and preserves Cloud Run auth', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        successful(
          { version: 'orqaly_agent_list_v1', agents: [] },
          { headers: { 'x-request-id': 'control-plane-request', etag: '"7"' } }
        )
      );
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.example.run.app',
      signingKey: SIGNING_KEY,
      audience: 'agentic-audience',
      authHeaders: async () => new Headers({ authorization: 'Bearer cloud-run-token' }),
      fetchImpl,
      now: () => new Date('2026-09-04T10:00:00.000Z'),
      requestId: () => 'request-agent-list-1',
    });

    const result = await client.listAgents(OWNER, { limit: 12, state: 'active' });

    expect(result).toEqual({
      status: 200,
      body: { version: 'orqaly_agent_list_v1', agents: [] },
      headers: { requestId: 'control-plane-request', etag: '"7"', retryAfter: null },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://agentic.example.run.app/v1/agents?limit=12&state=active');
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe('Bearer cloud-run-token');
    expect(init.headers['x-request-id']).toBe('request-agent-list-1');

    const encoded = init.headers['x-orqaly-principal'];
    const principal = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    expect(principal).toEqual({
      version: 'orqaly_request_principal_v1',
      audience: 'agentic-audience',
      requestId: 'request-agent-list-1',
      ...OWNER,
      actorType: 'user',
      roles: ['owner'],
      scopes: ['agentic:read'],
      request: {
        method: 'GET',
        path: '/v1/agents?limit=12&state=active',
        bodyHash: canonicalHash(null),
        idempotencyKey: null,
        ifMatch: null,
      },
      issuedAt: '2026-09-04T10:00:00.000Z',
      expiresAt: '2026-09-04T10:01:00.000Z',
    });
    expect(init.headers['x-orqaly-principal-signature']).toBe(
      crypto.createHmac('sha256', SIGNING_KEY).update(encoded).digest('base64url')
    );
  });

  it('forwards only contract concurrency and idempotency headers for Agent mutations', async () => {
    const createdAgent = agentProjection();
    const updatedAgent = agentProjection({ version: 3 });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        successful(
          {
            version: 'orqaly_agent_create_result_v1',
            agent: createdAgent,
            replayed: false,
          },
          { status: 201, headers: { etag: '"1"' } }
        )
      )
      .mockResolvedValueOnce(
        successful(
          {
            version: 'orqaly_agent_profile_update_result_v1',
            agent: updatedAgent,
            unchanged: false,
            replayed: false,
          },
          { headers: { etag: '"3"' } }
        )
      );
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl,
      requestId: () => 'request-agent-write-1',
    });
    const createRequest = {
      version: 'orqaly_agent_create_request_v1',
      idempotencyKey: 'create-agent-1',
    };
    const updateRequest = {
      version: 'orqaly_agent_profile_update_request_v1',
      idempotencyKey: 'update-agent-1',
    };

    await client.createAgent(OWNER, createRequest);
    await client.updateAgentProfile(OWNER, AGENT_ID, updateRequest, '"2"');

    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(createRequest),
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'idempotency-key': 'create-agent-1',
      }),
    });
    const update = fetchImpl.mock.calls[1];
    expect(update[0]).toBe(`https://agentic.test/v1/agents/${AGENT_ID}/profile`);
    expect(update[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify(updateRequest),
      headers: expect.objectContaining({
        'idempotency-key': 'update-agent-1',
        'if-match': '"2"',
      }),
    });
    const updatePrincipal = JSON.parse(
      Buffer.from(update[1].headers['x-orqaly-principal'], 'base64url').toString('utf8')
    );
    expect(updatePrincipal.scopes).toEqual(['agentic:agent:write']);
    expect(updatePrincipal.request).toEqual({
      method: 'PATCH',
      path: `/v1/agents/${AGENT_ID}/profile`,
      bodyHash: canonicalHash(updateRequest),
      idempotencyKey: 'update-agent-1',
      ifMatch: '"2"',
    });
  });

  it('rejects malformed successful bodies and incoherent Agent version ETags', async () => {
    const malformed = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          successful({ version: 'orqaly_agent_list_v1', agents: [{ id: AGENT_ID }] })
        ),
    });
    await expect(malformed.listAgents(OWNER)).rejects.toMatchObject({
      code: 'AGENT_RUNTIME_INVALID_RESPONSE',
      status: 502,
      retryable: false,
    });

    const mismatchedVersion = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          successful(
            { version: 'orqaly_agent_detail_v1', agent: agentProjection() },
            { headers: { etag: '"2"' } }
          )
        ),
    });
    await expect(mismatchedVersion.readAgent(OWNER, AGENT_ID)).rejects.toMatchObject({
      code: 'AGENT_RUNTIME_VERSION_ETAG_MISMATCH',
      status: 502,
      retryable: false,
    });

    const invalidProfile = agentProjection();
    invalidProfile.profile = { ...invalidProfile.profile, contentHash: 'a'.repeat(64) };
    const tamperedProfile = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          successful(
            { version: 'orqaly_agent_detail_v1', agent: invalidProfile },
            { headers: { etag: '"1"' } }
          )
        ),
    });
    await expect(tamperedProfile.readAgent(OWNER, AGENT_ID)).rejects.toMatchObject({
      code: 'AGENT_RUNTIME_INVALID_RESPONSE',
      status: 502,
    });
  });

  it('requires runtime status to separate control-plane readiness from effective execution', async () => {
    const body = {
      version: 'orqaly_agent_runtime_status_v1',
      service: 'orqaly-agentic-control-plane',
      status: 'ready',
      executionRequested: true,
      executionEnabled: false,
      executionReady: false,
      executionStatus: 'release_gated',
    };
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl: vi.fn().mockResolvedValue(successful(body)),
    });

    await expect(client.runtimeStatus()).resolves.toMatchObject({ body });
  });

  it('preserves safe typed control-plane contract failures', async () => {
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl: vi.fn().mockResolvedValue(
        successful(
          {
            error: {
              code: 'agent_version_conflict',
              requestId: 'upstream-conflict',
              details: { expected: 3 },
            },
          },
          { status: 409 }
        )
      ),
    });

    await expect(client.readAgent(OWNER, AGENT_ID)).rejects.toMatchObject({
      name: 'AgenticControlPlaneError',
      code: 'agent_version_conflict',
      status: 409,
      upstreamStatus: 409,
      retryable: false,
      publicBody: {
        error: {
          code: 'agent_version_conflict',
          requestId: 'upstream-conflict',
          details: { expected: 3 },
        },
      },
    });
  });

  it('does not turn a broken bridge signature into a browser authentication failure', async () => {
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          successful({ error: { code: 'principal_signature_invalid' } }, { status: 401 })
        ),
    });

    await expect(client.listAgents(OWNER)).rejects.toMatchObject({
      code: 'AGENT_RUNTIME_AUTHENTICATION_FAILED',
      status: 502,
      upstreamStatus: 401,
      publicBody: {
        error: expect.objectContaining({ code: 'AGENT_RUNTIME_AUTHENTICATION_FAILED' }),
      },
    });
  });

  it('bounds both authentication latency and response bytes', async () => {
    const latencyClient = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      authHeaders: () => new Promise(() => {}),
      fetchImpl: vi.fn(),
      timeoutMs: 100,
    });
    await expect(latencyClient.listAgents(OWNER)).rejects.toMatchObject({
      code: 'AGENT_RUNTIME_TIMEOUT',
      status: 504,
      retryable: true,
    });

    const bytesClient = createAgenticControlPlaneClient({
      baseUrl: 'https://agentic.test',
      signingKey: SIGNING_KEY,
      fetchImpl: vi.fn().mockResolvedValue(successful({ value: 'x'.repeat(2_000) })),
      maximumResponseBytes: 1_024,
    });
    await expect(bytesClient.listAgents(OWNER)).rejects.toMatchObject({
      code: 'AGENT_RUNTIME_RESPONSE_TOO_LARGE',
      status: 502,
    });
  });

  it('requires complete paired environment configuration and allows loopback HTTP only', () => {
    expect(createAgenticControlPlaneClientFromEnvironment({})).toBeNull();
    expect(() =>
      createAgenticControlPlaneClientFromEnvironment({
        AGENTIC_CONTROL_PLANE_URL: 'https://agentic.test',
      })
    ).toThrow(/configured together/);
    expect(() =>
      createAgenticControlPlaneClient({
        baseUrl: 'http://agentic.test',
        signingKey: SIGNING_KEY,
      })
    ).toThrow(/must use HTTPS/);
    expect(() =>
      createAgenticControlPlaneClient({
        baseUrl: 'https://agentic.test/unsafe-prefix',
        signingKey: SIGNING_KEY,
      })
    ).toThrow(/must be an origin/);
    expect(
      createAgenticControlPlaneClientFromEnvironment({
        AGENTIC_CONTROL_PLANE_URL: 'http://127.0.0.1:8089',
        AGENTIC_PRINCIPAL_SIGNING_KEY: SIGNING_KEY,
      })
    ).toBeTruthy();
  });

  it('exposes a typed error class for the HTTP boundary', () => {
    expect(
      new AgenticControlPlaneError('unavailable', {
        code: 'AGENT_RUNTIME_UNAVAILABLE',
        status: 503,
        retryable: true,
      })
    ).toMatchObject({ name: 'AgenticControlPlaneError', status: 503 });
  });
});
