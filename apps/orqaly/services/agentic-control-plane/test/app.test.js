import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { signPrincipalForTest } from '../src/auth/principal.js';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import { sealAgentProfileV1 } from '../src/domain/contracts.js';
import { appConfig, principal } from './fixtures.js';

const httpTest = process.env.TEST_LOCAL_HTTP === 'true' ? test : test.skip;

async function withServer(options, operation) {
  const app = createApp(options);
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function currentPrincipal(overrides = {}) {
  const issuedAt = new Date(Date.now() - 1_000);
  const expiresAt = new Date(issuedAt.getTime() + 60_000);
  return principal({
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...overrides,
  });
}

function authHeaders(config, value = currentPrincipal(), request) {
  const binding = {
    method: request.method,
    path: request.path,
    bodyHash: canonicalJsonSha256(request.body ?? null),
    idempotencyKey: request.idempotencyKey || null,
    ifMatch: request.ifMatch || null,
  };
  const signed = signPrincipalForTest(value, config.ORQALY_PRINCIPAL_SIGNING_KEY, binding);
  return {
    'content-type': 'application/json',
    'x-request-id': value.requestId,
    'x-orqaly-principal': signed.encodedPrincipal,
    'x-orqaly-principal-signature': signed.signature,
  };
}

const pool = {
  async query() {
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  },
};

httpTest('health and readiness are explicit and do not imply execution is enabled', async () => {
  const config = appConfig();
  await withServer({ config, pool }, async (url) => {
    const health = await fetch(`${url}/healthz`).then((response) => response.json());
    assert.equal(health.status, 'ok');
    assert.equal(health.executionRequested, false);
    assert.equal(health.executionEnabled, false);
    assert.equal(health.executionReady, false);
    assert.equal(health.executionStatus, 'disabled');
    const readyResponse = await fetch(`${url}/readyz`);
    const ready = await readyResponse.json();
    assert.equal(readyResponse.status, 200);
    assert.equal(ready.version, 'orqaly_agent_runtime_status_v1');
    assert.equal(ready.status, 'ready');
    assert.equal(ready.executionRequested, false);
    assert.equal(ready.executionEnabled, false);
    assert.equal(ready.executionReady, false);
    assert.equal(ready.executionStatus, 'disabled');
  });
});

httpTest(
  'the preview execution flag records intent but cannot advertise dispatchability',
  async () => {
    const config = appConfig({ AGENTIC_EXECUTION_ENABLED: true });
    const request = {
      version: 'orqaly_task_admission_request_v1',
      task: { title: 'Prepare a comparison', description: '' },
      requestedSteps: [{ stepKind: 'reason', descriptorKey: 'agent_reason_v1' }],
    };
    await withServer({ config, pool }, async (url) => {
      const ready = await fetch(`${url}/readyz`).then((response) => response.json());
      assert.equal(ready.status, 'ready', 'only control-plane readiness is claimed');
      assert.equal(ready.executionRequested, true);
      assert.equal(ready.executionEnabled, false);
      assert.equal(ready.executionReady, false);
      assert.equal(ready.executionStatus, 'release_gated');

      const response = await fetch(`${url}/v1/task-admissions`, {
        method: 'POST',
        headers: authHeaders(config, currentPrincipal(), {
          method: 'POST',
          path: '/v1/task-admissions',
          body: request,
        }),
        body: JSON.stringify(request),
      });
      const admission = await response.json();
      assert.equal(admission.executable, true);
      assert.equal(admission.executionRequested, true);
      assert.equal(admission.executionEnabled, false);
      assert.equal(admission.executionReady, false);
      assert.equal(admission.dispatchable, false);
    });
  }
);

httpTest(
  'task admission requires a signed principal and distinguishes ready from dispatchable',
  async () => {
    const config = appConfig();
    const body = JSON.stringify({
      version: 'orqaly_task_admission_request_v1',
      task: { title: 'Prepare a comparison', description: '' },
      requestedSteps: [{ stepKind: 'reason', descriptorKey: 'agent_reason_v1' }],
    });
    await withServer({ config, pool }, async (url) => {
      const unauthorized = await fetch(`${url}/v1/task-admissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      assert.equal(unauthorized.status, 401);

      const unauthorizedScope = await fetch(`${url}/v1/task-admissions`, {
        method: 'POST',
        headers: authHeaders(config, currentPrincipal({ scopes: ['agentic:read'] }), {
          method: 'POST',
          path: '/v1/task-admissions',
          body: JSON.parse(body),
        }),
        body,
      });
      assert.equal(unauthorizedScope.status, 403);
      assert.equal((await unauthorizedScope.json()).error.code, 'principal_scope_required');

      const response = await fetch(`${url}/v1/task-admissions`, {
        method: 'POST',
        headers: authHeaders(config, currentPrincipal(), {
          method: 'POST',
          path: '/v1/task-admissions',
          body: JSON.parse(body),
        }),
        body,
      });
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.equal(result.status, 'ready');
      assert.equal(result.executable, true);
      assert.equal(result.dispatchable, false);
    });
  }
);

httpTest(
  'approval decisions reject a signed service principal before opening a transaction',
  async () => {
    const config = appConfig();
    let connectCount = 0;
    const transactionPool = {
      ...pool,
      async connect() {
        connectCount += 1;
        throw new Error('transaction must not be opened');
      },
    };
    const request = {
      version: 'orqaly_approval_decision_request_v1',
      idempotencyKey: 'service-decision',
      decision: 'approve',
      reason: 'must be rejected',
    };

    await withServer({ config, pool: transactionPool }, async (url) => {
      const response = await fetch(
        `${url}/v1/approvals/11111111-1111-4111-8111-111111111111/decision`,
        {
          method: 'POST',
          headers: {
            ...authHeaders(config, currentPrincipal({ actorType: 'service' }), {
              method: 'POST',
              path: '/v1/approvals/11111111-1111-4111-8111-111111111111/decision',
              body: request,
              idempotencyKey: request.idempotencyKey,
              ifMatch: '1',
            }),
            'idempotency-key': request.idempotencyKey,
            'if-match': '1',
          },
          body: JSON.stringify(request),
        }
      );

      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'human_principal_required');
      assert.equal(connectCount, 0);
    });
  }
);

httpTest('principal-scoped rate limit and structured contract errors fail closed', async () => {
  const config = appConfig({ RATE_LIMIT_MAX_REQUESTS: 1 });
  const headers = authHeaders(config, currentPrincipal(), {
    method: 'POST',
    path: '/v1/task-admissions',
    body: { invalid: true },
  });
  await withServer({ config, pool }, async (url) => {
    const first = await fetch(`${url}/v1/task-admissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ invalid: true }),
    });
    assert.equal(first.status, 400);
    assert.equal((await first.json()).error.code, 'request_contract_invalid');

    const second = await fetch(`${url}/v1/task-admissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ invalid: true }),
    });
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error.code, 'rate_limit_exceeded');
  });
});

httpTest(
  'Agent writes require a human with the dedicated write scope before database access',
  async () => {
    const config = appConfig();
    let connectCount = 0;
    const guardedPool = {
      ...pool,
      async connect() {
        connectCount += 1;
        throw new Error('transaction must not be opened');
      },
    };
    const request = {
      version: 'orqaly_agent_create_request_v1',
      profile: {
        version: 'orqaly_agent_profile_input_v1',
        displayName: 'Research Scout',
        roleLabel: 'Evidence researcher',
        description: '',
        instructions: 'Cite evidence.',
        avatar: { kind: 'icon', value: 'science', color: '#6750A4' },
      },
      idempotencyKey: 'create-research-scout',
    };

    await withServer({ config, pool: guardedPool }, async (url) => {
      const service = await fetch(`${url}/v1/agents`, {
        method: 'POST',
        headers: {
          ...authHeaders(config, currentPrincipal({ actorType: 'service' }), {
            method: 'POST',
            path: '/v1/agents',
            body: request,
            idempotencyKey: request.idempotencyKey,
          }),
          'idempotency-key': request.idempotencyKey,
        },
        body: JSON.stringify(request),
      });
      assert.equal(service.status, 403);
      assert.equal((await service.json()).error.code, 'human_principal_required');

      const missingScope = await fetch(`${url}/v1/agents`, {
        method: 'POST',
        headers: {
          ...authHeaders(config, currentPrincipal({ scopes: ['agentic:read'] }), {
            method: 'POST',
            path: '/v1/agents',
            body: request,
            idempotencyKey: request.idempotencyKey,
          }),
          'idempotency-key': request.idempotencyKey,
        },
        body: JSON.stringify(request),
      });
      assert.equal(missingScope.status, 403);
      assert.equal((await missingScope.json()).error.code, 'principal_scope_required');

      const keyMismatch = await fetch(`${url}/v1/agents`, {
        method: 'POST',
        headers: {
          ...authHeaders(config, currentPrincipal(), {
            method: 'POST',
            path: '/v1/agents',
            body: request,
            idempotencyKey: 'different-key',
          }),
          'idempotency-key': 'different-key',
        },
        body: JSON.stringify(request),
      });
      assert.equal(keyMismatch.status, 400);
      assert.equal((await keyMismatch.json()).error.code, 'idempotency_key_mismatch');

      const profileRequest = {
        version: 'orqaly_agent_profile_update_request_v1',
        profile: request.profile,
        idempotencyKey: 'profile-without-version',
      };
      const missingIfMatch = await fetch(
        `${url}/v1/agents/11111111-1111-4111-8111-111111111111/profile`,
        {
          method: 'PATCH',
          headers: {
            ...authHeaders(config, currentPrincipal(), {
              method: 'PATCH',
              path: '/v1/agents/11111111-1111-4111-8111-111111111111/profile',
              body: profileRequest,
              idempotencyKey: profileRequest.idempotencyKey,
            }),
            'idempotency-key': profileRequest.idempotencyKey,
          },
          body: JSON.stringify(profileRequest),
        }
      );
      assert.equal(missingIfMatch.status, 428);
      assert.equal((await missingIfMatch.json()).error.code, 'if_match_required');
    });
    assert.equal(connectCount, 0);
  }
);

httpTest('Agent detail returns the rich profile projection and a version ETag', async () => {
  const config = appConfig();
  const agentId = '11111111-1111-4111-8111-111111111111';
  const sealedProfile = sealAgentProfileV1({
    id: '22222222-2222-4222-8222-222222222222',
    agentId,
    versionNumber: 2,
    profile: {
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Research Scout',
      roleLabel: 'Evidence researcher',
      description: 'Finds defensible evidence.',
      instructions: 'Cite evidence.',
      avatar: { kind: 'emoji', value: '🧭', color: '#365E8D' },
    },
    createdBy: 'user-1',
    createdAt: '2026-09-04T08:00:00.000Z',
  });
  const transactionClient = {
    async query(sql) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact === 'BEGIN' || compact === 'COMMIT' || compact === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (compact.startsWith("select set_config('app.organization_id'")) {
        return { rows: [{}], rowCount: 1 };
      }
      if (compact.includes('from agentic.agents a') && compact.includes('where a.id = $1')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: agentId,
              display_name: 'Research Scout',
              agent_kind: 'persistent',
              state: 'active',
              source_task_id: null,
              source_decision_id: null,
              project_id: null,
              conversation_id: null,
              originating_run_id: null,
              expires_at: null,
              version: 5,
              created_from: 'manual',
              activated_at: '2026-09-04T08:30:00.000Z',
              paused_at: null,
              revoked_at: null,
              archived_at: null,
              created_at: '2026-09-04T08:00:00.000Z',
              updated_at: '2026-09-04T09:00:00.000Z',
              profile_id: sealedProfile.id,
              profile_version_number: sealedProfile.versionNumber,
              profile_display_name: sealedProfile.profile.displayName,
              profile_role_label: sealedProfile.profile.roleLabel,
              profile_description: sealedProfile.profile.description,
              profile_instructions: sealedProfile.profile.instructions,
              profile_avatar_kind: sealedProfile.profile.avatar.kind,
              profile_avatar_value: sealedProfile.profile.avatar.value,
              profile_avatar_color: sealedProfile.profile.avatar.color,
              profile_content_hash: sealedProfile.contentHash,
              profile_created_by: sealedProfile.createdBy,
              profile_created_at: sealedProfile.createdAt,
              persona_contract_version: null,
              persona_id: null,
              persona_content_hash: null,
              run_count: 0,
              latest_run_id: null,
              latest_run_source_task_id: null,
              latest_run_state: null,
              latest_run_created_at: null,
              latest_run_updated_at: null,
            },
          ],
        };
      }
      throw new Error(`unexpected query: ${compact}`);
    },
    release() {},
  };
  const transactionPool = {
    ...pool,
    async connect() {
      return transactionClient;
    },
  };

  await withServer({ config, pool: transactionPool }, async (url) => {
    const response = await fetch(`${url}/v1/agents/${agentId}`, {
      headers: authHeaders(config, currentPrincipal(), {
        method: 'GET',
        path: `/v1/agents/${agentId}`,
      }),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('etag'), '"5"');
    assert.equal(result.agent.profile.profile.displayName, 'Research Scout');
    assert.equal(result.agent.profile.profile.avatar.value, '🧭');
    assert.equal(result.agent.persona_id, null);
  });
});
