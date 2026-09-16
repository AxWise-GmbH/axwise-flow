import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MemoryNamespacePolicyV1Schema,
  MemoryRoutingRequestV1Schema,
  TrustedMemoryRetrievalScopeV1Schema,
} from '../src/domain/memory-contracts.js';
import { resolveAccessibleMemoryNamespaces, routeMemory } from '../src/services/memory-router.js';

const PROJECT_A = 'project/acme-saas';
const PROJECT_B = 'project/weather-app';
const CONVERSATION_A = 'conversation/sms-setup';
const CONVERSATION_B = 'conversation/weather-chat';
const TASK_A = 'task/sms-provider-setup';
const TASK_B = 'task/weather-forecast';
const AGENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SMS_NAMESPACE_ID = '11111111-1111-4111-8111-111111111111';

function trustedScope(overrides = {}) {
  return {
    version: 'orqaly_trusted_memory_retrieval_scope_v1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    projectReference: PROJECT_A,
    conversationReference: CONVERSATION_A,
    taskReference: TASK_A,
    agentId: AGENT_A,
    allowedDomains: ['b2b.saas'],
    allowedTopics: ['sms_service_setup'],
    purpose: 'task_execution',
    maximumClassification: 'internal',
    asOf: '2026-09-04T12:00:00.000Z',
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    version: 'orqaly_memory_routing_request_v1',
    domain: 'b2b.saas',
    topics: ['sms_service_setup'],
    maximumItems: 10,
    ...overrides,
  };
}

function defaultBindings(scopeKind) {
  const empty = {
    projectReference: null,
    conversationReference: null,
    taskReference: null,
    agentId: null,
  };
  switch (scopeKind) {
    case 'project':
      return { ...empty, projectReference: PROJECT_A };
    case 'conversation':
      return { ...empty, conversationReference: CONVERSATION_A };
    case 'task':
      return {
        ...empty,
        projectReference: PROJECT_A,
        conversationReference: CONVERSATION_A,
        taskReference: TASK_A,
      };
    case 'agent':
      return { ...empty, agentId: AGENT_A };
    default:
      return empty;
  }
}

function namespace(namespaceId, overrides = {}) {
  const scopeKind = overrides.scopeKind ?? 'task';
  return {
    version: 'orqaly_memory_namespace_policy_v1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    namespaceId,
    scopeKind,
    ...defaultBindings(scopeKind),
    status: 'active',
    allowedDomains: ['b2b.saas'],
    allowedTopics: ['sms_service_setup'],
    allowedPurposes: ['task_execution'],
    maximumClassification: 'internal',
    expiresAt: null,
    ...overrides,
  };
}

function candidate(memoryItemId, namespaceId, overrides = {}) {
  return {
    version: 'orqaly_memory_candidate_v1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    memoryItemId,
    namespaceId,
    status: 'active',
    domain: 'b2b.saas',
    topics: ['sms_service_setup'],
    purposes: ['task_execution'],
    classification: 'internal',
    contentReference: `memory/${memoryItemId}`,
    recordedAt: '2026-09-04T10:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

test('routes only scope-resolved, topic-safe, purpose-safe, unexpired memory', () => {
  const matchingId = '40000000-0000-4000-8000-000000000001';
  const namespaceDomainId = '40000000-0000-4000-8000-000000000002';
  const memoryDomainId = '40000000-0000-4000-8000-000000000003';
  const namespaceExpiredId = '40000000-0000-4000-8000-000000000004';
  const namespacePausedId = '40000000-0000-4000-8000-000000000005';
  const futureMemoryId = '40000000-0000-4000-8000-000000000006';
  const memoryExpiredId = '40000000-0000-4000-8000-000000000007';
  const restrictedId = '40000000-0000-4000-8000-000000000008';
  const wrongPurposeId = '40000000-0000-4000-8000-000000000009';
  const crossProjectId = '40000000-0000-4000-8000-000000000010';
  const weatherNamespaceId = '22222222-2222-4222-8222-222222222222';
  const expiredNamespaceId = '33333333-3333-4333-8333-333333333333';
  const pausedNamespaceId = '44444444-4444-4444-8444-444444444444';
  const otherProjectNamespaceId = '55555555-5555-4555-8555-555555555555';
  const result = routeMemory(
    {
      request: request(),
      namespaces: [
        namespace(SMS_NAMESPACE_ID),
        namespace(weatherNamespaceId, {
          allowedDomains: ['personal.weather'],
          allowedTopics: ['weather_forecast'],
        }),
        namespace(expiredNamespaceId, {
          expiresAt: '2026-09-04T11:59:59.000Z',
        }),
        namespace(pausedNamespaceId, { status: 'paused' }),
        namespace(otherProjectNamespaceId, {
          scopeKind: 'project',
          projectReference: PROJECT_B,
          conversationReference: null,
          taskReference: null,
          agentId: null,
        }),
      ],
      candidates: [
        candidate(matchingId, SMS_NAMESPACE_ID),
        candidate(namespaceDomainId, weatherNamespaceId, {
          domain: 'personal.weather',
          topics: ['weather_forecast'],
        }),
        candidate(memoryDomainId, SMS_NAMESPACE_ID, {
          domain: 'personal.weather',
          topics: ['weather_forecast'],
        }),
        candidate(namespaceExpiredId, expiredNamespaceId),
        candidate(namespacePausedId, pausedNamespaceId),
        candidate(futureMemoryId, SMS_NAMESPACE_ID, {
          recordedAt: '2026-09-04T12:00:01.000Z',
        }),
        candidate(memoryExpiredId, SMS_NAMESPACE_ID, {
          expiresAt: '2026-09-04T11:59:59.000Z',
        }),
        candidate(restrictedId, SMS_NAMESPACE_ID, {
          classification: 'confidential',
        }),
        candidate(wrongPurposeId, SMS_NAMESPACE_ID, { purposes: ['research'] }),
        candidate(crossProjectId, otherProjectNamespaceId),
      ],
    },
    trustedScope()
  );

  assert.deepEqual(
    result.selected.map((item) => item.memoryItemId),
    [matchingId]
  );
  assert.equal(result.selected[0].namespaceScopeKind, 'task');
  const reasons = new Map(result.excluded.map((item) => [item.memoryItemId, item.reason]));
  assert.equal(reasons.get(namespaceDomainId), 'namespace_domain_mismatch');
  assert.equal(reasons.get(memoryDomainId), 'memory_domain_mismatch');
  assert.equal(reasons.get(namespaceExpiredId), 'namespace_expired');
  assert.equal(reasons.get(namespacePausedId), 'namespace_inactive');
  assert.equal(reasons.get(futureMemoryId), 'memory_not_yet_valid');
  assert.equal(reasons.get(memoryExpiredId), 'memory_expired');
  assert.equal(reasons.get(restrictedId), 'classification_not_permitted');
  assert.equal(reasons.get(wrongPurposeId), 'memory_purpose_mismatch');
  assert.equal(reasons.get(crossProjectId), 'namespace_scope_mismatch');
  assert.equal(result.zeroMemoryReason, null);
});

test('resolves broad user/workspace and only exact contextual namespaces', () => {
  const namespaces = [
    namespace('10000000-0000-4000-8000-000000000001', { scopeKind: 'workspace' }),
    namespace('10000000-0000-4000-8000-000000000002', { scopeKind: 'user' }),
    namespace('10000000-0000-4000-8000-000000000003', { scopeKind: 'project' }),
    namespace('10000000-0000-4000-8000-000000000004', {
      scopeKind: 'conversation',
    }),
    namespace('10000000-0000-4000-8000-000000000005', { scopeKind: 'task' }),
    namespace('10000000-0000-4000-8000-000000000006', { scopeKind: 'agent' }),
    namespace('10000000-0000-4000-8000-000000000007', {
      scopeKind: 'project',
      projectReference: PROJECT_B,
      conversationReference: null,
      taskReference: null,
      agentId: null,
    }),
    namespace('10000000-0000-4000-8000-000000000008', {
      scopeKind: 'conversation',
      projectReference: null,
      conversationReference: CONVERSATION_B,
      taskReference: null,
      agentId: null,
    }),
    namespace('10000000-0000-4000-8000-000000000009', {
      taskReference: TASK_B,
    }),
    namespace('10000000-0000-4000-8000-000000000010', {
      scopeKind: 'agent',
      projectReference: null,
      conversationReference: null,
      taskReference: null,
      agentId: AGENT_B,
    }),
  ];

  const accessible = resolveAccessibleMemoryNamespaces(trustedScope(), request(), namespaces);
  assert.deepEqual(
    accessible.map((item) => item.namespaceId),
    namespaces.slice(0, 6).map((item) => item.namespaceId)
  );
});

for (const scenario of [
  {
    name: 'cross-project',
    overrides: {
      scopeKind: 'project',
      projectReference: PROJECT_B,
      conversationReference: null,
      taskReference: null,
      agentId: null,
    },
  },
  {
    name: 'same-user cross-conversation',
    overrides: { conversationReference: CONVERSATION_B },
  },
  {
    name: 'cross-task',
    overrides: { taskReference: TASK_B },
  },
  {
    name: 'cross-agent',
    overrides: {
      scopeKind: 'agent',
      projectReference: null,
      conversationReference: null,
      taskReference: null,
      agentId: AGENT_B,
    },
  },
]) {
  test(`${scenario.name} memory is inaccessible despite the same tenant and topic`, () => {
    const namespaceId = '60000000-0000-4000-8000-000000000001';
    const itemId = '60000000-0000-4000-8000-000000000002';
    const result = routeMemory(
      {
        request: request(),
        namespaces: [namespace(namespaceId, scenario.overrides)],
        candidates: [candidate(itemId, namespaceId)],
      },
      trustedScope()
    );

    assert.deepEqual(result.selected, []);
    assert.deepEqual(result.excluded, [
      { memoryItemId: itemId, reason: 'namespace_scope_mismatch' },
    ]);
    assert.equal(result.zeroMemoryReason, 'no_accessible_namespaces');
  });
}

for (const scenario of [
  { name: 'organization', overrides: { organizationId: 'org-2' } },
  { name: 'workspace', overrides: { workspaceId: 'workspace-2' } },
  { name: 'user', overrides: { principalId: 'user-2' } },
]) {
  test(`namespace from another ${scenario.name} never enters the trusted scope`, () => {
    const namespaceId = '61000000-0000-4000-8000-000000000001';
    const itemId = '61000000-0000-4000-8000-000000000002';
    const result = routeMemory(
      {
        request: request(),
        namespaces: [namespace(namespaceId, scenario.overrides)],
        candidates: [candidate(itemId, namespaceId)],
      },
      trustedScope()
    );

    assert.deepEqual(result.selected, []);
    assert.deepEqual(result.excluded, [{ memoryItemId: itemId, reason: 'tenant_scope_mismatch' }]);
    assert.equal(result.zeroMemoryReason, 'no_accessible_namespaces');
  });
}

test('rejects mixed-topic candidates when pairwise matches have no shared topic', () => {
  const mixedTopicId = '70000000-0000-4000-8000-000000000001';
  const result = routeMemory(
    {
      request: request({ topics: ['sms_service_setup', 'weather_forecast'] }),
      namespaces: [namespace(SMS_NAMESPACE_ID, { allowedTopics: ['sms_service_setup'] })],
      candidates: [candidate(mixedTopicId, SMS_NAMESPACE_ID, { topics: ['weather_forecast'] })],
    },
    trustedScope({ allowedTopics: ['sms_service_setup', 'weather_forecast'] })
  );

  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, [
    { memoryItemId: mixedTopicId, reason: 'memory_topic_mismatch' },
  ]);
  assert.equal(result.zeroMemoryReason, 'no_matching_memory');
});

test('routes a candidate only through topics shared by request, namespace, and memory', () => {
  const sharedTopicId = '80000000-0000-4000-8000-000000000001';
  const result = routeMemory(
    {
      request: request({ topics: ['sms_service_setup', 'weather_forecast'] }),
      namespaces: [
        namespace(SMS_NAMESPACE_ID, {
          allowedTopics: ['customer_research', 'sms_service_setup'],
        }),
      ],
      candidates: [
        candidate(sharedTopicId, SMS_NAMESPACE_ID, {
          topics: ['sms_service_setup', 'weather_forecast'],
        }),
      ],
    },
    trustedScope({ allowedTopics: ['sms_service_setup', 'weather_forecast'] })
  );

  assert.deepEqual(result.selected, [
    {
      memoryItemId: sharedTopicId,
      namespaceId: SMS_NAMESPACE_ID,
      namespaceScopeKind: 'task',
      contentReference: `memory/${sharedTopicId}`,
      classification: 'internal',
      matchedTopics: ['sms_service_setup'],
    },
  ]);
  assert.deepEqual(result.excluded, []);
});

test('no namespaces intentionally produces a valid zero-memory context', () => {
  const result = routeMemory(
    { request: request(), namespaces: [], candidates: [] },
    trustedScope()
  );
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, []);
  assert.equal(result.zeroMemoryReason, 'no_accessible_namespaces');
});

test('tenant mismatch and result limits fail closed without leaking content', () => {
  const firstId = '90000000-0000-4000-8000-000000000001';
  const newerId = '90000000-0000-4000-8000-000000000002';
  const otherUserId = '90000000-0000-4000-8000-000000000003';
  const result = routeMemory(
    {
      request: request({ maximumItems: 1 }),
      namespaces: [namespace(SMS_NAMESPACE_ID)],
      candidates: [
        candidate(firstId, SMS_NAMESPACE_ID),
        candidate(newerId, SMS_NAMESPACE_ID, {
          recordedAt: '2026-09-04T11:00:00.000Z',
        }),
        candidate(otherUserId, SMS_NAMESPACE_ID, { principalId: 'user-2' }),
      ],
    },
    trustedScope()
  );
  assert.deepEqual(
    result.selected.map((item) => item.memoryItemId),
    [newerId]
  );
  assert.equal(
    result.excluded.find((item) => item.memoryItemId === firstId).reason,
    'result_limit'
  );
  assert.equal(
    result.excluded.find((item) => item.memoryItemId === otherUserId).reason,
    'tenant_scope_mismatch'
  );
  assert.equal('content' in result.selected[0], false);
});

test('routing request cannot supply identities, authorization, purpose, clearance or time', () => {
  for (const forbidden of [
    { authorizedNamespaceIds: [SMS_NAMESPACE_ID] },
    { organizationId: 'org-1' },
    { workspaceId: 'workspace-1' },
    { principalId: 'user-1' },
    { projectReference: PROJECT_A },
    { conversationReference: CONVERSATION_A },
    { taskReference: TASK_A },
    { agentId: AGENT_A },
    { purpose: 'task_execution' },
    { maximumClassification: 'restricted' },
    { asOf: '2020-01-01T00:00:00.000Z' },
    { allowedDomains: ['b2b.saas'] },
    { allowedTopics: ['sms_service_setup'] },
  ]) {
    assert.equal(
      MemoryRoutingRequestV1Schema.safeParse({ ...request(), ...forbidden }).success,
      false
    );
  }
});

test('model-supplied semantic relabeling cannot widen the persisted task scope', () => {
  const broadNamespace = namespace('a0000000-0000-4000-8000-000000000001', {
    scopeKind: 'user',
  });
  const matchingItem = candidate(
    'a0000000-0000-4000-8000-000000000002',
    broadNamespace.namespaceId
  );
  const weatherScope = trustedScope({
    allowedDomains: ['personal.weather'],
    allowedTopics: ['weather_forecast'],
  });

  assert.throws(
    () =>
      routeMemory(
        {
          request: request(),
          namespaces: [broadNamespace],
          candidates: [matchingItem],
        },
        weatherScope
      ),
    /memory_routing_request_outside_trusted_semantics/
  );
  assert.throws(
    () =>
      routeMemory(
        {
          request: request({ domain: 'personal.weather' }),
          namespaces: [broadNamespace],
          candidates: [matchingItem],
        },
        weatherScope
      ),
    /memory_routing_request_outside_trusted_semantics/
  );
});

test('trusted scope and namespace contracts reject ambiguous binding shapes', () => {
  assert.equal(
    TrustedMemoryRetrievalScopeV1Schema.safeParse({
      ...trustedScope(),
      authorizedNamespaceIds: [SMS_NAMESPACE_ID],
    }).success,
    false
  );
  assert.equal(
    MemoryNamespacePolicyV1Schema.safeParse(
      namespace(SMS_NAMESPACE_ID, { scopeKind: 'project', projectReference: null })
    ).success,
    false
  );
  assert.equal(
    MemoryNamespacePolicyV1Schema.safeParse(namespace(SMS_NAMESPACE_ID, { agentId: AGENT_A }))
      .success,
    false
  );
  assert.equal(
    MemoryRoutingRequestV1Schema.safeParse({
      ...request(),
      topics: ['sms_service_setup', 'sms_service_setup'],
    }).success,
    false
  );
});
