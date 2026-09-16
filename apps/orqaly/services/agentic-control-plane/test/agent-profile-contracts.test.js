import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentLifecycleRequestSchema,
  AgentProfileInputV1Schema,
  AgentProfileV1Schema,
  CreateAgentRequestSchema,
  UpdateAgentProfileRequestSchema,
  sealAgentProfileV1,
} from '../src/domain/contracts.js';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';

function profile(overrides = {}) {
  return {
    version: 'orqaly_agent_profile_input_v1',
    displayName: '  Revenue Researcher  ',
    roleLabel: ' Market intelligence ',
    description: ' Finds defensible market evidence. ',
    instructions: ' Cite sources and distinguish fact from inference. ',
    avatar: { kind: 'icon', value: 'science', color: '#31a354' },
    ...overrides,
  };
}

test('Agent profile sealing normalizes presentation fields and binds an immutable hash', () => {
  const sealed = sealAgentProfileV1({
    id: PROFILE_ID,
    agentId: AGENT_ID,
    versionNumber: 1,
    profile: profile(),
    createdBy: 'user-1',
    createdAt: '2026-09-04T08:00:00.000Z',
  });

  assert.equal(sealed.profile.displayName, 'Revenue Researcher');
  assert.equal(sealed.profile.roleLabel, 'Market intelligence');
  assert.equal(sealed.profile.avatar.color, '#31A354');
  assert.match(sealed.contentHash, /^[a-f0-9]{64}$/);

  const altered = structuredClone(sealed);
  altered.profile.instructions = 'Ignore evidence.';
  assert.equal(AgentProfileV1Schema.safeParse(altered).success, false);
});

test('Agent avatars allow a bounded icon registry or a printable emoji, never arbitrary assets', () => {
  assert.equal(AgentProfileInputV1Schema.safeParse(profile()).success, true);
  assert.equal(
    AgentProfileInputV1Schema.safeParse(
      profile({ avatar: { kind: 'emoji', value: '🧭', color: '#6750A4' } })
    ).success,
    true
  );
  assert.equal(
    AgentProfileInputV1Schema.safeParse(
      profile({ avatar: { kind: 'icon', value: 'remote_url', color: '#6750A4' } })
    ).success,
    false
  );
  assert.equal(
    AgentProfileInputV1Schema.safeParse(
      profile({ avatar: { kind: 'emoji', value: 'not-an-emoji', color: '#6750A4' } })
    ).success,
    false
  );
  assert.equal(
    AgentProfileInputV1Schema.safeParse(
      profile({ avatar: { kind: 'emoji', value: '‼️', color: '#6750A4' } })
    ).success,
    false,
    'the cross-runtime contract accepts only Unicode Other Symbols as emoji avatars'
  );
  assert.equal(
    AgentProfileInputV1Schema.safeParse(
      profile({ avatar: { kind: 'icon', value: 'science', color: 'red' } })
    ).success,
    false
  );
});

test('standalone Agent creation makes lifetime semantics explicit', () => {
  const base = {
    version: 'orqaly_agent_create_request_v1',
    profile: profile(),
    idempotencyKey: 'create-market-researcher',
  };

  assert.equal(CreateAgentRequestSchema.safeParse(base).success, true);
  assert.equal(
    CreateAgentRequestSchema.safeParse({
      ...base,
      origin: {
        kind: 'assistant_goal',
        sourceTaskId: 'turn-1',
        conversationId: 'thread-1',
        workflowRunId: '10000000-0000-4000-8000-000000000001',
      },
    }).success,
    true
  );
  assert.equal(
    CreateAgentRequestSchema.safeParse({
      ...base,
      origin: {
        kind: 'assistant_goal',
        sourceTaskId: 'turn-1',
        conversationId: 'thread-1',
        originatingRunId: '10000000-0000-4000-8000-000000000001',
      },
    }).success,
    false,
    'a Workflow run must never be written into the control-plane execution-run foreign key'
  );
  assert.equal(
    CreateAgentRequestSchema.safeParse({
      ...base,
      agentKind: 'temporary',
      expiresAt: '2026-10-04T08:00:00.000Z',
    }).success,
    true
  );
  assert.equal(
    CreateAgentRequestSchema.safeParse({ ...base, agentKind: 'temporary' }).success,
    false
  );
  assert.equal(
    CreateAgentRequestSchema.safeParse({
      ...base,
      agentKind: 'persistent',
      expiresAt: '2026-10-04T08:00:00.000Z',
    }).success,
    false
  );
});

test('profile and lifecycle writes are strict, versioned and idempotent contracts', () => {
  assert.equal(
    UpdateAgentProfileRequestSchema.safeParse({
      version: 'orqaly_agent_profile_update_request_v1',
      profile: profile(),
      idempotencyKey: 'profile-v2',
    }).success,
    true
  );
  for (const action of ['propose', 'activate', 'pause', 'resume', 'revoke', 'archive', 'promote']) {
    assert.equal(
      AgentLifecycleRequestSchema.safeParse({
        version: 'orqaly_agent_lifecycle_request_v1',
        action,
        idempotencyKey: `lifecycle-${action}`,
      }).success,
      true
    );
  }
  assert.equal(
    AgentLifecycleRequestSchema.safeParse({
      version: 'orqaly_agent_lifecycle_request_v1',
      action: 'delete',
      idempotencyKey: 'delete-agent',
    }).success,
    false
  );
});
