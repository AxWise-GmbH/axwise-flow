import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import {
  CreateAgentRequestSchema,
  UpdateAgentProfileRequestSchema,
  AgentLifecycleRequestSchema,
  agentProfileV1HashPayload,
  sealAgentProfileV1,
} from '../src/domain/contracts.js';
import {
  boundedAgentExpiry,
  changeAgentLifecycle,
  createAgent,
  listAgentRuns,
  updateAgentProfile,
} from '../src/repositories/control-plane-repository.js';
import { principal } from './fixtures.js';

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const MUTATION_ID = '33333333-3333-4333-8333-333333333333';

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function scriptedClient(steps) {
  const pending = [...steps];
  return {
    async query(sql, parameters = []) {
      const step = pending.shift();
      assert.ok(step, `unexpected query: ${compactSql(sql)}`);
      assert.match(compactSql(sql), step.match);
      if (step.inspect) step.inspect(parameters, compactSql(sql));
      const value = typeof step.result === 'function' ? step.result(parameters) : step.result;
      const rows = value?.rows || [];
      return { rows, rowCount: value?.rowCount ?? rows.length };
    },
    assertDone() {
      assert.equal(pending.length, 0, `unconsumed query expectations: ${pending.length}`);
    },
  };
}

function profile(overrides = {}) {
  return {
    version: 'orqaly_agent_profile_input_v1',
    displayName: 'Research Scout',
    roleLabel: 'Evidence researcher',
    description: 'Finds and compares evidence.',
    instructions: 'Cite evidence and mark uncertainty.',
    avatar: { kind: 'emoji', value: '🧭', color: '#365E8D' },
    ...overrides,
  };
}

function projectionRow({
  id = AGENT_ID,
  sealedProfile,
  agentKind = 'persistent',
  state = 'draft',
  agentVersion = 1,
  expiresAt = null,
  createdFrom = 'manual',
  runCount = 0,
  latestRun = null,
} = {}) {
  return {
    id,
    display_name: sealedProfile.profile.displayName,
    agent_kind: agentKind,
    state,
    source_task_id: null,
    source_decision_id: null,
    project_id: null,
    conversation_id: null,
    originating_run_id: null,
    workflow_run_id: null,
    expires_at: expiresAt,
    version: agentVersion,
    created_from: createdFrom,
    activated_at: state === 'active' ? '2026-09-04T09:00:00.000Z' : null,
    paused_at: state === 'paused' ? '2026-09-04T09:30:00.000Z' : null,
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
    run_count: runCount,
    latest_run_id: latestRun?.id || null,
    latest_run_source_task_id: latestRun?.sourceTaskId || null,
    latest_run_state: latestRun?.state || null,
    latest_run_created_at: latestRun?.createdAt || null,
    latest_run_updated_at: latestRun?.updatedAt || null,
  };
}

function capturedProfile(parameters) {
  return sealAgentProfileV1({
    id: parameters[0],
    agentId: parameters[4],
    versionNumber: parameters[5],
    profile: {
      version: 'orqaly_agent_profile_input_v1',
      displayName: parameters[6],
      roleLabel: parameters[7],
      description: parameters[8],
      instructions: parameters[9],
      avatar: { kind: parameters[10], value: parameters[11], color: parameters[12] },
    },
    createdBy: parameters[14],
    createdAt: parameters[15],
  });
}

test('temporary Agent expiry is capped from trusted control-plane time', () => {
  const now = new Date('2026-09-04T10:00:00.000Z');
  assert.equal(
    boundedAgentExpiry({ agentKind: 'temporary', expiresAt: '2099-01-01T00:00:00.000Z' }, now),
    '2026-12-03T10:00:00.000Z'
  );
  assert.equal(boundedAgentExpiry({ agentKind: 'persistent', expiresAt: null }, now), null);
  assert.throws(
    () =>
      boundedAgentExpiry({ agentKind: 'temporary', expiresAt: '2026-09-04T09:59:59.000Z' }, now),
    (error) => error.status === 400 && error.code === 'agent_expiry_must_be_future'
  );
});

test('standalone Agent creation persists a first-class profile, event and replayable response', async () => {
  const actor = principal();
  const request = CreateAgentRequestSchema.parse({
    version: 'orqaly_agent_create_request_v1',
    profile: profile(),
    idempotencyKey: 'create-research-scout',
  });
  const captured = {};
  const client = scriptedClient([
    {
      match: /insert into agentic\.agent_mutation_requests/,
      inspect(parameters) {
        assert.deepEqual(parameters.slice(0, 3), ['org-1', 'workspace-1', 'user-1']);
        assert.equal(parameters[3], 'create');
        assert.equal(parameters[4], null);
        assert.equal(parameters[5], request.idempotencyKey);
      },
      result: { rows: [{ id: MUTATION_ID }] },
    },
    {
      match: /insert into agentic\.agents/,
      inspect(parameters, sql) {
        captured.agentId = parameters[0];
        assert.match(captured.agentId, /^[a-f0-9-]{36}$/);
        assert.deepEqual(parameters.slice(1, 4), ['org-1', 'workspace-1', 'user-1']);
        assert.equal(parameters[4], 'Research Scout');
        assert.equal(parameters[5], 'persistent');
        assert.deepEqual(parameters.slice(6, 9), [null, null, null]);
        assert.equal(parameters[9], null);
        assert.equal(parameters[10], 'manual');
        assert.match(sql, /source_task_id, conversation_id, workflow_run_id/);
        assert.doesNotMatch(sql, /source_task_id, conversation_id, originating_run_id/);
      },
      result: { rowCount: 1 },
    },
    {
      match: /insert into agentic\.agent_profile_versions/,
      inspect(parameters) {
        captured.sealedProfile = capturedProfile(parameters);
        assert.equal(parameters[4], captured.agentId);
        assert.equal(parameters[5], 1);
        assert.equal(parameters[13], captured.sealedProfile.contentHash);
      },
      result: { rowCount: 1 },
    },
    {
      match: /update agentic\.agents set current_profile_version_id/,
      inspect(parameters) {
        assert.deepEqual(parameters, [captured.sealedProfile.id, captured.agentId]);
      },
      result: { rowCount: 1 },
    },
    {
      match: /insert into agentic\.agent_events/,
      inspect(parameters) {
        assert.deepEqual(parameters.slice(0, 5), [
          'org-1',
          'workspace-1',
          'user-1',
          captured.agentId,
          'agent.created',
        ]);
        assert.equal(parameters[5], 'human');
        assert.equal(parameters[7], actor.requestId);
      },
      result: { rowCount: 1 },
    },
    {
      match: /from agentic\.agents a .*where a\.id = \$1/,
      result: () => ({
        rows: [projectionRow({ id: captured.agentId, sealedProfile: captured.sealedProfile })],
      }),
    },
    {
      match: /update agentic\.agent_mutation_requests set state = 'completed'/,
      inspect(parameters) {
        const response = JSON.parse(parameters[0]);
        assert.equal(response.agent.id, captured.agentId);
        assert.equal(response.agent.profile.versionNumber, 1);
        assert.equal(parameters[1], MUTATION_ID);
      },
      result: { rowCount: 1 },
    },
  ]);

  const result = await createAgent(client, actor, request);
  assert.equal(result.version, 'orqaly_agent_create_result_v1');
  assert.equal(result.agent.created_from, 'manual');
  assert.equal(result.agent.source_task_id, null);
  assert.equal(result.agent.profile.profile.avatar.value, '🧭');
  assert.equal(
    result.agent.persona_id,
    null,
    'the UI profile must not masquerade as an execution persona'
  );
  assert.equal(result.replayed, false);
  client.assertDone();
});

test('repository rejects a service principal before an Agent mutation query', async () => {
  let queryCount = 0;
  const client = {
    async query() {
      queryCount += 1;
      throw new Error('query must not run');
    },
  };
  const request = CreateAgentRequestSchema.parse({
    version: 'orqaly_agent_create_request_v1',
    profile: profile(),
    idempotencyKey: 'service-create',
  });

  await assert.rejects(
    () => createAgent(client, principal({ actorType: 'service' }), request),
    (error) => error.status === 403 && error.code === 'human_principal_required'
  );
  assert.equal(queryCount, 0);
});

test('profile and lifecycle mutations return the same 404 before claiming an RLS-hidden Agent', async () => {
  const actor = principal();
  const profileRequest = UpdateAgentProfileRequestSchema.parse({
    version: 'orqaly_agent_profile_update_request_v1',
    profile: profile(),
    idempotencyKey: 'missing-profile-target',
  });
  const lifecycleRequest = AgentLifecycleRequestSchema.parse({
    version: 'orqaly_agent_lifecycle_request_v1',
    action: 'pause',
    idempotencyKey: 'missing-lifecycle-target',
  });
  const profileClient = scriptedClient([
    {
      match: /select a\.id, case .* as state, a\.version::integer as version/,
      result: { rows: [] },
    },
  ]);
  const lifecycleClient = scriptedClient([
    {
      match:
        /select a\.id, a\.agent_kind, case .* as state, a\.expires_at, a\.version::integer as version/,
      result: { rows: [] },
    },
  ]);

  await assert.rejects(
    () => updateAgentProfile(profileClient, actor, AGENT_ID, 1, profileRequest),
    (error) => error.status === 404 && error.code === 'agent_not_found'
  );
  await assert.rejects(
    () => changeAgentLifecycle(lifecycleClient, actor, AGENT_ID, 1, lifecycleRequest),
    (error) => error.status === 404 && error.code === 'agent_not_found'
  );
  profileClient.assertDone();
  lifecycleClient.assertDone();
});

test('standalone Agent creation replays the exact completed result for the same key and hash', async () => {
  const actor = principal();
  const request = CreateAgentRequestSchema.parse({
    version: 'orqaly_agent_create_request_v1',
    profile: profile(),
    idempotencyKey: 'create-research-scout',
  });
  const stored = {
    version: 'orqaly_agent_create_result_v1',
    agent: { id: AGENT_ID },
    replayed: false,
  };
  const client = scriptedClient([
    {
      match: /insert into agentic\.agent_mutation_requests/,
      result: { rowCount: 0 },
    },
    {
      match: /select id, operation, agent_id, request_hash, state, response_payload/,
      result: {
        rows: [
          {
            id: MUTATION_ID,
            operation: 'create',
            agent_id: null,
            request_hash: canonicalJsonSha256(request),
            state: 'completed',
            response_payload: stored,
          },
        ],
      },
    },
  ]);

  const result = await createAgent(client, actor, request);
  assert.deepEqual(result, { ...stored, replayed: true });
  client.assertDone();
});

test('profile edits append an immutable profile revision and CAS-update the Agent', async () => {
  const actor = principal();
  const currentProfile = sealAgentProfileV1({
    id: PROFILE_ID,
    agentId: AGENT_ID,
    versionNumber: 1,
    profile: profile(),
    createdBy: actor.userId,
    createdAt: '2026-09-04T08:00:00.000Z',
  });
  const request = UpdateAgentProfileRequestSchema.parse({
    version: 'orqaly_agent_profile_update_request_v1',
    profile: profile({
      displayName: 'Research Captain',
      roleLabel: 'Senior evidence researcher',
      avatar: { kind: 'icon', value: 'science', color: '#8E44AD' },
    }),
    idempotencyKey: 'research-profile-v2',
  });
  const captured = {};
  const client = scriptedClient([
    {
      match: /select a\.id, case .* as state, a\.version::integer as version/,
      result: {
        rows: [
          {
            id: AGENT_ID,
            state: 'active',
            version: 4,
            profile_version_number: 1,
            profile_content_hash: currentProfile.contentHash,
          },
        ],
      },
    },
    {
      match: /insert into agentic\.agent_mutation_requests/,
      inspect(parameters) {
        assert.equal(parameters[3], 'profile_update');
        assert.equal(parameters[4], AGENT_ID);
      },
      result: { rows: [{ id: MUTATION_ID }] },
    },
    {
      match: /insert into agentic\.agent_profile_versions/,
      inspect(parameters) {
        captured.sealedProfile = capturedProfile(parameters);
        assert.equal(captured.sealedProfile.versionNumber, 2);
      },
      result: { rowCount: 1 },
    },
    {
      match: /update agentic\.agents set display_name/,
      inspect(parameters) {
        assert.deepEqual(parameters, ['Research Captain', captured.sealedProfile.id, AGENT_ID, 4]);
      },
      result: { rows: [{ version: 5 }] },
    },
    {
      match: /insert into agentic\.agent_events/,
      inspect(parameters) {
        assert.equal(parameters[4], 'agent.profile_updated');
        const payload = JSON.parse(parameters[6]);
        assert.equal(payload.previousProfileHash, currentProfile.contentHash);
        assert.equal(payload.profileVersion, 2);
      },
      result: { rowCount: 1 },
    },
    {
      match: /from agentic\.agents a .*where a\.id = \$1/,
      result: () => ({
        rows: [
          projectionRow({
            sealedProfile: captured.sealedProfile,
            state: 'active',
            agentVersion: 5,
          }),
        ],
      }),
    },
    {
      match: /update agentic\.agent_mutation_requests set state = 'completed'/,
      result: { rowCount: 1 },
    },
  ]);

  const result = await updateAgentProfile(client, actor, AGENT_ID, 4, request);
  assert.equal(result.unchanged, false);
  assert.equal(result.agent.version, 5);
  assert.equal(result.agent.profile.versionNumber, 2);
  assert.equal(result.agent.profile.profile.displayName, 'Research Captain');
  client.assertDone();
});

test('an identical profile is idempotently acknowledged without creating a new revision', async () => {
  const actor = principal();
  const currentProfile = sealAgentProfileV1({
    id: PROFILE_ID,
    agentId: AGENT_ID,
    versionNumber: 3,
    profile: profile(),
    createdBy: actor.userId,
    createdAt: '2026-09-04T08:00:00.000Z',
  });
  const request = UpdateAgentProfileRequestSchema.parse({
    version: 'orqaly_agent_profile_update_request_v1',
    profile: profile(),
    idempotencyKey: 'same-profile',
  });
  assert.equal(
    currentProfile.contentHash,
    canonicalJsonSha256(agentProfileV1HashPayload(request.profile))
  );
  const client = scriptedClient([
    {
      match: /select a\.id, case .* as state, a\.version::integer as version/,
      result: {
        rows: [
          {
            id: AGENT_ID,
            state: 'active',
            version: 7,
            profile_version_number: 3,
            profile_content_hash: currentProfile.contentHash,
          },
        ],
      },
    },
    {
      match: /insert into agentic\.agent_mutation_requests/,
      result: { rows: [{ id: MUTATION_ID }] },
    },
    {
      match: /from agentic\.agents a .*where a\.id = \$1/,
      result: {
        rows: [projectionRow({ sealedProfile: currentProfile, state: 'active', agentVersion: 7 })],
      },
    },
    {
      match: /update agentic\.agent_mutation_requests set state = 'completed'/,
      result: { rowCount: 1 },
    },
  ]);

  const result = await updateAgentProfile(client, actor, AGENT_ID, 7, request);
  assert.equal(result.unchanged, true);
  assert.equal(result.agent.version, 7);
  assert.equal(result.agent.profile.versionNumber, 3);
  client.assertDone();
});

test('temporary Agent promotion preserves state, removes expiry and records the transition', async () => {
  const actor = principal();
  const existingProfile = sealAgentProfileV1({
    id: PROFILE_ID,
    agentId: AGENT_ID,
    versionNumber: 1,
    profile: profile(),
    createdBy: actor.userId,
    createdAt: '2026-09-04T08:00:00.000Z',
  });
  const request = AgentLifecycleRequestSchema.parse({
    version: 'orqaly_agent_lifecycle_request_v1',
    action: 'promote',
    reason: 'Keep this specialist for future research.',
    idempotencyKey: 'promote-research-scout',
  });
  const client = scriptedClient([
    {
      match:
        /select a\.id, a\.agent_kind, case .* as state, a\.expires_at, a\.version::integer as version/,
      result: {
        rows: [
          {
            id: AGENT_ID,
            agent_kind: 'temporary',
            state: 'active',
            expires_at: '2026-09-11T08:00:00.000Z',
            version: 2,
          },
        ],
      },
    },
    {
      match: /insert into agentic\.agent_mutation_requests/,
      result: { rows: [{ id: MUTATION_ID }] },
    },
    {
      match: /update agentic\.agents set agent_kind/,
      inspect(parameters) {
        assert.deepEqual(parameters, ['persistent', 'active', null, AGENT_ID, 2]);
      },
      result: { rows: [{ version: 3 }] },
    },
    {
      match: /insert into agentic\.agent_events/,
      inspect(parameters) {
        assert.equal(parameters[4], 'agent.lifecycle_changed');
        assert.deepEqual(JSON.parse(parameters[6]), {
          action: 'promote',
          fromKind: 'temporary',
          toKind: 'persistent',
          fromState: 'active',
          toState: 'active',
          reasonProvided: true,
        });
      },
      result: { rowCount: 1 },
    },
    {
      match: /from agentic\.agents a .*where a\.id = \$1/,
      result: {
        rows: [
          projectionRow({
            sealedProfile: existingProfile,
            agentKind: 'persistent',
            state: 'active',
            agentVersion: 3,
          }),
        ],
      },
    },
    {
      match: /update agentic\.agent_mutation_requests set state = 'completed'/,
      result: { rowCount: 1 },
    },
  ]);

  const result = await changeAgentLifecycle(client, actor, AGENT_ID, 2, request);
  assert.equal(result.agent.agent_kind, 'persistent');
  assert.equal(result.agent.expires_at, null);
  assert.equal(result.agent.state, 'active');
  client.assertDone();
});

test('Agent run history verifies ownership first and normalizes database numeric/time values', async () => {
  const client = scriptedClient([
    {
      match: /select id from agentic\.agents where id = \$1/,
      inspect(parameters) {
        assert.deepEqual(parameters, [AGENT_ID]);
      },
      result: { rows: [{ id: AGENT_ID }] },
    },
    {
      match: /from agentic\.execution_runs where agent_id = \$1/,
      inspect(parameters) {
        assert.deepEqual(parameters, [AGENT_ID, 12]);
      },
      result: {
        rows: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            source_task_id: 'task-42',
            team_id: null,
            plan_id: 'plan-42',
            plan_version_id: null,
            state: 'completed',
            requested_by: 'user-1',
            budget_minor: '500',
            reserved_minor: '120',
            spent_minor: '95',
            currency: 'EUR',
            deadline_at: new Date('2026-09-04T11:00:00.000Z'),
            started_at: new Date('2026-09-04T10:00:00.000Z'),
            terminal_at: new Date('2026-09-04T10:30:00.000Z'),
            version: '6',
            created_at: new Date('2026-09-04T09:55:00.000Z'),
            updated_at: new Date('2026-09-04T10:30:00.000Z'),
          },
        ],
      },
    },
  ]);

  const result = await listAgentRuns(client, AGENT_ID, { limit: 12 });
  assert.equal(result.length, 1);
  assert.equal(result[0].budget_minor, 500);
  assert.equal(result[0].spent_minor, 95);
  assert.equal(result[0].version, 6);
  assert.equal(result[0].terminal_at, '2026-09-04T10:30:00.000Z');
  client.assertDone();
});
