import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  N8nOperationsClient,
  N8nOperationsError,
  loadN8nWorkflowAllowlist,
} from '../src/executors/n8n-operations-client.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = path.join(repositoryRoot, 'infra/n8n/executor-bindings.json');
const API_KEY = 'n8n-private-test-api-key';

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function workflowDetail(payload, overrides = {}) {
  return {
    id: 'workflow-1',
    name: payload.name,
    active: false,
    nodes: structuredClone(payload.nodes),
    connections: structuredClone(payload.connections),
    settings: { ...structuredClone(payload.settings), availableInMCP: false },
    versionId: 'provider-version-1',
    ...overrides,
  };
}

function publishedWorkflowDetail(payload, overrides = {}) {
  const detail = workflowDetail(payload, { active: true, ...overrides });
  detail.activeVersionId = detail.versionId;
  detail.activeVersion = {
    versionId: detail.versionId,
    workflowId: detail.id,
    nodes: structuredClone(detail.nodes),
    connections: structuredClone(detail.connections),
  };
  return detail;
}

async function setupClient(fetchImpl, options = {}) {
  const workflowAllowlist = await loadN8nWorkflowAllowlist(manifestPath);
  const client = new N8nOperationsClient({
    apiBaseUrl: 'http://n8n:5678/api/v1/',
    apiKey: API_KEY,
    workflowAllowlist,
    allowInsecureHttp: true,
    fetchImpl,
    ...options,
  });
  return { client, workflowAllowlist, payload: workflowAllowlist.workflows[0].payload };
}

test('creates and publishes only the content-addressed allowlisted workflow', async () => {
  const calls = [];
  let payload;
  const { client, workflowAllowlist } = await setupClient(async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return jsonResponse({ data: [], nextCursor: null });
    if (calls.length === 2) {
      payload = JSON.parse(init.body);
      return jsonResponse(workflowDetail(payload));
    }
    if (calls.length === 3) {
      return jsonResponse(publishedWorkflowDetail(payload));
    }
    if (calls.length === 4) return jsonResponse(publishedWorkflowDetail(payload));
    return jsonResponse({
      data: [{ id: 'workflow-1', name: payload.name, active: true }],
      nextCursor: null,
    });
  });

  const result = await client.ensureWorkflowPublished({
    bindingKey: 'tool_gateway_connector_v1',
    bindingVersion: '1.0',
  });

  assert.equal(result.state, 'published');
  assert.equal(result.change, 'created');
  assert.equal(result.workflowContentHash, workflowAllowlist.workflows[0].workflowContentHash);
  assert.deepEqual(
    calls.map((call) => [call.init.method, new URL(call.url).pathname]),
    [
      ['GET', '/api/v1/workflows'],
      ['POST', '/api/v1/workflows'],
      ['POST', '/api/v1/workflows/workflow-1/publish'],
      ['GET', '/api/v1/workflows/workflow-1'],
      ['GET', '/api/v1/workflows'],
    ]
  );
  for (const call of calls) {
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.headers['X-N8N-API-KEY'], API_KEY);
    assert.ok(call.init.signal instanceof AbortSignal);
  }
  assert.deepEqual(Object.keys(payload).sort(), ['connections', 'name', 'nodes', 'settings']);
  for (const forbidden of ['active', 'credentials', 'meta', 'pinData', 'tags', 'versionId']) {
    assert.equal(Object.hasOwn(payload, forbidden), false, forbidden);
  }
  assert.equal(JSON.stringify(client).includes(API_KEY), false);
  assert.equal(JSON.stringify(result).includes(API_KEY), false);
});

test('is idempotent when the published workflow exactly matches the allowlist', async () => {
  const calls = [];
  const { client, payload } = await setupClient(async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return jsonResponse({
        data: [{ id: 'workflow-1', name: payload.name, active: true }],
        nextCursor: null,
      });
    }
    const detail = publishedWorkflowDetail(payload);
    detail.nodes.forEach((node) => {
      node.createdAt = '2026-09-04T10:00:00.000Z';
      node.updatedAt = '2026-09-04T10:00:00.000Z';
    });
    detail.activeVersion.nodes = structuredClone(detail.nodes);
    return jsonResponse(detail);
  });

  const result = await client.ensureWorkflowPublished({
    bindingKey: 'tool_gateway_connector_v1',
    bindingVersion: '1.0',
  });

  assert.equal(result.change, 'unchanged');
  assert.deepEqual(
    calls.map((call) => call.init.method),
    ['GET', 'GET', 'GET']
  );
});

test('republishes when n8n reports active without verifiable active-version evidence', async () => {
  const calls = [];
  const { client, payload } = await setupClient(async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return jsonResponse({
        data: [{ id: 'workflow-1', name: payload.name, active: true }],
        nextCursor: null,
      });
    }
    if (calls.length === 2) return jsonResponse(workflowDetail(payload, { active: true }));
    if (calls.length === 3) {
      assert.equal(new URL(url).pathname, '/api/v1/workflows/workflow-1/publish');
      return jsonResponse(publishedWorkflowDetail(payload));
    }
    return jsonResponse(publishedWorkflowDetail(payload));
  });

  const result = await client.ensureWorkflowPublished({
    bindingKey: 'tool_gateway_connector_v1',
    bindingVersion: '1.0',
  });

  assert.equal(result.change, 'published');
  assert.deepEqual(
    calls.map((call) => call.init.method),
    ['GET', 'GET', 'POST', 'GET']
  );
});

const unverifiablePublishedVersionCases = [
  [
    'top-level version ID is absent',
    (detail) => {
      delete detail.versionId;
    },
  ],
  [
    'active version ID is absent',
    (detail) => {
      delete detail.activeVersionId;
    },
  ],
  [
    'active-version body is absent',
    (detail) => {
      delete detail.activeVersion;
    },
  ],
  [
    'active-version body ID is absent',
    (detail) => {
      delete detail.activeVersion.versionId;
    },
  ],
  [
    'active-version workflow ID is absent',
    (detail) => {
      delete detail.activeVersion.workflowId;
    },
  ],
  [
    'active version does not equal the current version',
    (detail) => {
      detail.activeVersionId = 'provider-version-previous';
      detail.activeVersion.versionId = 'provider-version-previous';
    },
  ],
  [
    'active-version body disagrees with its active ID',
    (detail) => {
      detail.activeVersion.versionId = 'provider-version-other';
    },
  ],
  [
    'active version belongs to another workflow',
    (detail) => {
      detail.activeVersion.workflowId = 'workflow-other';
    },
  ],
];

for (const [description, mutate] of unverifiablePublishedVersionCases) {
  test(`fails closed after publication when ${description}`, async () => {
    const calls = [];
    const { client, payload } = await setupClient(async (_url, init) => {
      calls.push(init.method);
      if (calls.length === 1) {
        return jsonResponse({
          data: [{ id: 'workflow-1', name: payload.name, active: true }],
          nextCursor: null,
        });
      }
      const detail = publishedWorkflowDetail(payload);
      if (calls.length === 3) mutate(detail);
      return jsonResponse(detail);
    });

    await assert.rejects(
      client.ensureWorkflowPublished({
        bindingKey: 'tool_gateway_connector_v1',
        bindingVersion: '1.0',
      }),
      (error) =>
        error instanceof N8nOperationsError &&
        error.code === 'n8n_workflow_publish_verification_failed'
    );
    assert.deepEqual(calls, ['GET', 'GET', 'GET']);
  });
}

test('replaces drift with the exact allowlisted payload and never accepts caller workflow JSON', async () => {
  const calls = [];
  const { client, payload } = await setupClient(async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return jsonResponse({
        data: [{ id: 'workflow-1', name: payload.name, active: true }],
        nextCursor: null,
      });
    }
    if (calls.length === 2) {
      const drifted = workflowDetail(payload, { active: true });
      drifted.nodes[1].parameters.url = 'https://attacker.invalid/collect';
      return jsonResponse(drifted);
    }
    if (calls.length === 3) {
      assert.deepEqual(JSON.parse(init.body), payload);
      return jsonResponse(publishedWorkflowDetail(payload));
    }
    return jsonResponse(publishedWorkflowDetail(payload));
  });

  const result = await client.ensureWorkflowPublished({
    bindingKey: 'tool_gateway_connector_v1',
    bindingVersion: '1.0',
  });
  assert.equal(result.change, 'updated');
  assert.equal(calls[2].init.method, 'PUT');

  await assert.rejects(
    client.ensureWorkflowPublished({
      bindingKey: 'tool_gateway_connector_v1',
      bindingVersion: '1.0',
      workflow: { nodes: [{ type: 'n8n-nodes-base.executeCommand' }] },
    }),
    (error) => error instanceof N8nOperationsError && error.code === 'n8n_workflow_selector_invalid'
  );

  await assert.rejects(
    client.ensureWorkflowPublished({ bindingKey: 'not_allowlisted', bindingVersion: '1.0' }),
    (error) => error instanceof N8nOperationsError && error.code === 'n8n_workflow_not_allowlisted'
  );
  assert.equal(calls.length, 4);
});

test('requires an exact API base and a loader-issued allowlist', async () => {
  const workflowAllowlist = await loadN8nWorkflowAllowlist(manifestPath);
  const base = {
    apiKey: API_KEY,
    workflowAllowlist,
    fetchImpl: async () => {
      throw new Error('must not be called');
    },
  };
  assert.throws(
    () => new N8nOperationsClient({ ...base, apiBaseUrl: 'https://n8n.example/api/v1' }),
    (error) => error.code === 'n8n_api_base_url_must_be_exact'
  );
  assert.throws(
    () =>
      new N8nOperationsClient({
        ...base,
        apiBaseUrl: 'http://n8n:5678/api/v1/',
      }),
    (error) => error.code === 'n8n_api_https_required'
  );
  assert.throws(
    () =>
      new N8nOperationsClient({
        ...base,
        apiBaseUrl: 'https://n8n.example/api/v1/',
        workflowAllowlist: structuredClone(workflowAllowlist),
      }),
    (error) => error.code === 'n8n_workflow_allowlist_untrusted'
  );
  for (const apiKey of [
    'n8n-private-test-api\nkey',
    `n8n-private-test-api${String.fromCharCode(0x7f)}key`,
  ]) {
    assert.throws(
      () =>
        new N8nOperationsClient({
          ...base,
          apiBaseUrl: 'https://n8n.example/api/v1/',
          apiKey,
        }),
      (error) => error.code === 'n8n_api_key_invalid'
    );
  }
});

test('normalizes execution reads and cancellation without returning provider payload data', async () => {
  const calls = [];
  const responses = [
    {
      id: '42',
      workflowId: 'workflow-1',
      status: 'running',
      createdAt: '2026-09-04T10:00:00.000Z',
      startedAt: '2026-09-04T10:00:01.000Z',
      stoppedAt: null,
      waitTill: null,
      data: { shouldNeverEscape: true },
    },
    {
      id: 42,
      workflowId: 'workflow-1',
      status: 'canceled',
      startedAt: '2026-09-04T10:00:01.000Z',
      stoppedAt: '2026-09-04T10:00:02.000Z',
    },
  ];
  const { client } = await setupClient(async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse(responses.shift());
  });

  const running = await client.getExecutionStatus('42');
  const canceled = await client.cancelExecution('42');

  assert.equal(running.status, 'running');
  assert.equal(running.createdAt, '2026-09-04T10:00:00.000Z');
  assert.equal(Object.hasOwn(running, 'data'), false);
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.finishedAt, '2026-09-04T10:00:02.000Z');
  assert.equal(calls[0].url, 'http://n8n:5678/api/v1/executions/42?includeData=false');
  assert.equal(calls[1].url, 'http://n8n:5678/api/v1/executions/42/stop');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(Object.hasOwn(calls[1].init, 'body'), false);
  assert.equal(Object.hasOwn(calls[1].init.headers, 'content-type'), false);
});

test('republishes the exact draft when n8n reports a different active version', async () => {
  const calls = [];
  const { client, payload } = await setupClient(async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return jsonResponse({
        data: [{ id: 'workflow-1', name: payload.name, active: true }],
        nextCursor: null,
      });
    }
    if (calls.length === 2) {
      const detail = publishedWorkflowDetail(payload);
      detail.activeVersion.nodes[1].parameters.url = 'https://attacker.invalid/old-version';
      return jsonResponse(detail);
    }
    if (calls.length === 3) {
      assert.equal(new URL(url).pathname, '/api/v1/workflows/workflow-1/publish');
      assert.deepEqual(JSON.parse(init.body), { versionId: 'provider-version-1' });
      return jsonResponse(publishedWorkflowDetail(payload));
    }
    return jsonResponse(publishedWorkflowDetail(payload));
  });

  const result = await client.ensureWorkflowPublished({
    bindingKey: 'tool_gateway_connector_v1',
    bindingVersion: '1.0',
  });
  assert.equal(result.change, 'published');
  assert.deepEqual(
    calls.map((call) => call.init.method),
    ['GET', 'GET', 'POST', 'GET']
  );
});

const unverifiedReadinessCases = [
  [
    'active-version evidence is absent',
    (detail) => {
      delete detail.activeVersion;
      delete detail.activeVersionId;
    },
  ],
  [
    'the active version is not the current version',
    (detail) => {
      detail.activeVersionId = 'provider-version-previous';
      detail.activeVersion.versionId = 'provider-version-previous';
    },
  ],
];

for (const [description, mutate] of unverifiedReadinessCases) {
  test(`reports not ready when ${description}`, async () => {
    const calls = [];
    const { client, payload } = await setupClient(async (_url, init) => {
      calls.push(init.method);
      if (calls.length === 1) {
        return jsonResponse({
          data: [{ id: 'workflow-1', name: payload.name, active: true }],
          nextCursor: null,
        });
      }
      const detail = publishedWorkflowDetail(payload);
      mutate(detail);
      return jsonResponse(detail);
    });

    const readiness = await client.getWorkflowReadiness({
      bindingKey: 'tool_gateway_connector_v1',
      bindingVersion: '1.0',
    });

    assert.equal(readiness.state, 'unverified');
    assert.equal(readiness.ready, false);
    assert.deepEqual(calls, ['GET', 'GET']);
  });
}

test('fails closed on malformed, duplicate, oversized and secret-bearing error responses', async () => {
  const { client: malformed } = await setupClient(async () =>
    jsonResponse({ data: [{ id: 'workflow-1', name: 'missing-active' }] })
  );
  await assert.rejects(
    malformed.getAllWorkflowReadiness(),
    (error) => error.code === 'n8n_api_response_contract_invalid'
  );

  let duplicatePayload;
  const { client: duplicate, payload } = await setupClient(async () => {
    duplicatePayload ??= payload;
    return jsonResponse({
      data: [
        { id: 'workflow-1', name: duplicatePayload.name, active: true },
        { id: 'workflow-2', name: duplicatePayload.name, active: true },
      ],
      nextCursor: null,
    });
  });
  await assert.rejects(
    duplicate.getAllWorkflowReadiness(),
    (error) => error.code === 'n8n_managed_workflow_duplicate'
  );

  const { client: oversized } = await setupClient(
    async () =>
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '5000' },
      }),
    { maximumResponseBytes: 1024 }
  );
  await assert.rejects(
    oversized.getAllWorkflowReadiness(),
    (error) => error.code === 'n8n_api_response_too_large'
  );

  const responseSecret = 'server-body-must-not-escape';
  const { client: failed } = await setupClient(async () =>
    jsonResponse({ error: responseSecret, reflectedApiKey: API_KEY }, 500)
  );
  await assert.rejects(failed.getAllWorkflowReadiness(), (error) => {
    assert.equal(error.code, 'n8n_api_http_error');
    assert.equal(error.status, 500);
    assert.equal(error.retryable, true);
    assert.equal(String(error).includes(responseSecret), false);
    assert.equal(String(error).includes(API_KEY), false);
    return true;
  });
});

test('aborts management calls at the configured bounded timeout', async () => {
  const { client } = await setupClient(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    { timeoutMs: 100 }
  );
  await assert.rejects(
    client.getAllWorkflowReadiness(),
    (error) => error.code === 'n8n_api_timeout' && error.retryable === true
  );
});
