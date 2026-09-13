import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CANONICALIZATION_ALGORITHM, canonicalJsonSha256 } from '../src/domain/canonical.js';
import { axwisePlanHashPayload, materializeAxwisePlan } from '../src/integrations/axwise-wire.js';
import {
  AGENT_COORDINATOR_ID,
  AGENT_REVIEWER_ID,
  AGENT_WORKER_ID,
  HASH_A,
  HASH_B,
  HASH_C,
  TEAM_ID,
} from './fixtures.js';

const GOLDEN_PLAN_HASH = '0d527095c77da21716d5e53aef264305c95fa3751885051b2d174094a795354c';
const GOLDEN_INPUT_HASH = '3323400217c4633ee90dadf85c64110d0da8eba7450e0411ff0a2a19dd87fb8c';
const GOLDEN_EXTERNAL_PLAN_HASH =
  '1894dc3355a689b42567e777afcb3b558aaea005390c40b9352ae8f0e3e9e53e';
const GOLDEN_EXTERNAL_PLAN_BYTES_HASH =
  'ef85ca7a09a6edb04db75a161d7656204a8bb4339c2cab7bcd3359485d67b508';
const GOLDEN_EXTERNAL_INPUT_HASH =
  '8cfaaf2cd017d5a1851172705ed5622c8e1d52cfe172035bf9f1999290134363';
const GOLDEN_PLAN_PATH = new URL(
  './fixtures/axwise_execution_plan_v1_golden.json',
  import.meta.url
);
const GOLDEN_EXTERNAL_PLAN_PATH = new URL(
  './fixtures/axwise_external_action_plan_v1_golden.json',
  import.meta.url
);

function goldenSourcePlan() {
  return JSON.parse(readFileSync(GOLDEN_PLAN_PATH, 'utf8'));
}

function sourcePlan() {
  const input = { objective: 'Compare the options' };
  const plan = {
    contract_version: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    plan_id: 'axwise-plan-1',
    plan_version: 1,
    content_hash: '0'.repeat(64),
    owning_agent_id: AGENT_COORDINATOR_ID,
    team_id: TEAM_ID,
    team_member_ids: [AGENT_COORDINATOR_ID, AGENT_WORKER_ID, AGENT_REVIEWER_ID].sort(),
    nodes: [
      {
        node_id: 'research',
        title: 'Research options',
        objective: 'Compare the options with evidence',
        step_kind: 'reason',
        descriptor: {
          contract_version: '1.0',
          descriptor_key: 'agent_reason_v1',
          schema_version: '1.0',
          content_hash: HASH_A,
        },
        executor_binding: {
          contract_version: '1.0',
          binding_key: 'bounded_agent_executor',
          binding_version: '1.0',
          content_hash: HASH_B,
        },
        assigned_agent_id: AGENT_WORKER_ID,
        persona_version: {
          contract_version: '1.0',
          persona_id: 'worker-persona',
          persona_version: '1',
          content_hash: HASH_C,
        },
        reviewer_agent_id: AGENT_REVIEWER_ID,
        requires_distinct_reviewer: true,
        dependencies: [],
        canonical_input_hash: canonicalJsonSha256(input),
        expected_output_schema_hash: HASH_C,
        effect_profile: { externality: 'none', mutation: 'none', flags: [] },
        data_egress_profile: {
          mode: 'deny_all',
          destination_classes: [],
          provider_classes: [],
          region_classes: [],
          permitted_input_classifications: [],
          permitted_output_classifications: [],
          redaction_required: false,
          dlp_required: false,
          provider_retention_policy_required: false,
          provider_training_policy_required: false,
        },
        limits: {
          maximum_turns: 4,
          maximum_tokens: 8_000,
          maximum_tool_calls: 2,
          maximum_runtime_seconds: 120,
          maximum_attempts: 1,
          maximum_cost_minor: 0,
          currency: 'EUR',
        },
        deadline: null,
      },
    ],
    created_at: '2026-09-04T10:00:00.000Z',
  };
  plan.content_hash = canonicalJsonSha256(axwisePlanHashPayload(plan));
  return plan;
}

function externalSourcePlan() {
  const input = { recordId: 'record-1', status: 'active' };
  const plan = sourcePlan();
  const node = plan.nodes[0];
  node.node_id = 'update-record';
  node.title = 'Update one CRM record';
  node.objective = 'Apply the approved status to the exact record';
  node.step_kind = 'connector_write';
  node.descriptor.descriptor_key = 'record_update_v1';
  node.reviewer_agent_id = null;
  node.requires_distinct_reviewer = false;
  node.canonical_input_hash = canonicalJsonSha256(input);
  node.effect_profile = {
    externality: 'write',
    mutation: 'update',
    flags: [],
  };
  node.external_action = {
    version: 'orqaly_external_action_spec_v1',
    effect_id: '88888888-8888-4888-8888-888888888888',
    provider_operation: {
      contract_version: '1.0',
      operation_key: 'records.update',
      operation_version: '1.0',
      content_hash: HASH_A,
    },
    connection: {
      connection_reference: 'connection-1',
      provider_key: 'example_crm',
      credential_owner_principal_id: 'user-1',
      requested_scopes: ['records.read', 'records.write'],
    },
    targets: [
      {
        target_type: 'business_record',
        target_reference: 'record-1',
        target_hash: null,
      },
    ],
    external_preconditions: [
      {
        precondition_type: 'record_version',
        target_reference: 'record-1',
        expected_state_hash: HASH_B,
      },
    ],
    idempotency: { scope: 'logical_effect', key: 'update-record-1-v1' },
    reconciliation: {
      strategy: 'provider_idempotency',
      lookup_operation: null,
    },
    compensation: { strategy: 'none', operation: null },
  };
  plan.content_hash = canonicalJsonSha256(axwisePlanHashPayload(plan));
  return { input, plan };
}

test('maps strict AxWise snake_case contracts into hash-bound Orqaly plan v2', () => {
  const source = sourcePlan();
  const result = materializeAxwisePlan({
    sourceDecisionId: 'decision-1',
    axwisePlan: source,
    canonicalInputsByNode: { research: { objective: 'Compare the options' } },
  });
  assert.equal(result.version, 'orqaly_execution_plan_v2');
  assert.equal(result.sourceContentHash, source.content_hash);
  assert.equal(result.nodes[0].descriptor.descriptorKey, 'agent_reason_v1');
  assert.equal(result.nodes[0].personaVersion.personaId, 'worker-persona');
  assert.equal(result.nodes[0].limits.maximumAttempts, 1);
});

test('accepts the unchanged AxWise ExecutionPlanV1 RFC 8785 golden digest', () => {
  const source = goldenSourcePlan();
  const sourceBeforeMaterialization = JSON.stringify(source);
  const canonicalInput = {
    objective: 'Compare café delivery options',
    scope: 'current_workspace',
  };

  assert.equal(source.content_hash, GOLDEN_PLAN_HASH);
  assert.equal(source.created_at, '2026-09-04T10:00:00Z');
  assert.equal(Object.hasOwn(source.nodes[0], 'reviewer_agent_id'), false);
  assert.equal(Object.hasOwn(source.nodes[0], 'deadline'), false);
  assert.equal(source.nodes[0].canonical_input_hash, GOLDEN_INPUT_HASH);
  assert.equal(canonicalJsonSha256(canonicalInput), GOLDEN_INPUT_HASH);
  assert.equal(canonicalJsonSha256(axwisePlanHashPayload(source)), GOLDEN_PLAN_HASH);

  const result = materializeAxwisePlan({
    sourceDecisionId: 'golden-decision-2026-09-04',
    axwisePlan: source,
    canonicalInputsByNode: { 'compare-options': canonicalInput },
  });

  assert.equal(JSON.stringify(source), sourceBeforeMaterialization);
  assert.equal(result.sourceContentHash, GOLDEN_PLAN_HASH);
  assert.equal(result.createdAt, '2026-09-04T10:00:00Z');
  assert.equal(result.nodes[0].reviewerAgentId, null);
  assert.equal(result.nodes[0].deadline, null);
});

test('mapper refuses missing inputs, missing limits and hash drift', () => {
  assert.throws(() =>
    materializeAxwisePlan({
      sourceDecisionId: 'decision-1',
      axwisePlan: sourcePlan(),
      canonicalInputsByNode: {},
    })
  );
  assert.throws(() =>
    materializeAxwisePlan({
      sourceDecisionId: 'decision-1',
      axwisePlan: sourcePlan(),
      canonicalInputsByNode: { research: { changed: true } },
    })
  );
  const missingLimits = sourcePlan();
  delete missingLimits.nodes[0].limits;
  missingLimits.content_hash = canonicalJsonSha256(axwisePlanHashPayload(missingLimits));
  assert.throws(() =>
    materializeAxwisePlan({
      sourceDecisionId: 'decision-1',
      axwisePlan: missingLimits,
      canonicalInputsByNode: { research: { objective: 'Compare the options' } },
    })
  );
  const missingAuthority = sourcePlan();
  delete missingAuthority.nodes[0].effect_profile;
  missingAuthority.content_hash = canonicalJsonSha256(axwisePlanHashPayload(missingAuthority));
  assert.throws(() =>
    materializeAxwisePlan({
      sourceDecisionId: 'decision-1',
      axwisePlan: missingAuthority,
      canonicalInputsByNode: { research: { objective: 'Compare the options' } },
    })
  );
});

test('maps a complete AxWise external action into the Orqaly action-intent source', () => {
  const { input, plan } = externalSourcePlan();
  const result = materializeAxwisePlan({
    sourceDecisionId: 'decision-external-1',
    axwisePlan: plan,
    canonicalInputsByNode: { 'update-record': input },
  });

  const action = result.nodes[0].externalAction;
  assert.equal(action.effectId, '88888888-8888-4888-8888-888888888888');
  assert.equal(action.providerOperation.operationKey, 'records.update');
  assert.equal(action.connection.connectionReference, 'connection-1');
  assert.deepEqual(action.connection.requestedScopes, ['records.read', 'records.write']);
  assert.equal(action.targets[0].targetReference, 'record-1');
  assert.equal(action.externalPreconditions[0].expectedStateHash, HASH_B);

  const incomplete = structuredClone(plan);
  delete incomplete.nodes[0].external_action;
  incomplete.content_hash = canonicalJsonSha256(axwisePlanHashPayload(incomplete));
  assert.throws(() =>
    materializeAxwisePlan({
      sourceDecisionId: 'decision-external-1',
      axwisePlan: incomplete,
      canonicalInputsByNode: { 'update-record': input },
    })
  );
});

test('preserves Python tuple ordering for prefix external references', () => {
  const { input, plan } = externalSourcePlan();
  plan.nodes[0].external_action.targets = [
    { target_type: 'business_record', target_reference: 'record', target_hash: null },
    { target_type: 'business_record', target_reference: 'record/', target_hash: null },
  ];
  plan.nodes[0].external_action.external_preconditions = [
    {
      precondition_type: 'record_version',
      target_reference: 'record',
      expected_state_hash: HASH_A,
    },
    {
      precondition_type: 'record_version',
      target_reference: 'record/',
      expected_state_hash: HASH_B,
    },
  ];
  plan.content_hash = canonicalJsonSha256(axwisePlanHashPayload(plan));

  const result = materializeAxwisePlan({
    sourceDecisionId: 'decision-prefix-order',
    axwisePlan: plan,
    canonicalInputsByNode: { 'update-record': input },
  });
  assert.deepEqual(
    result.nodes[0].externalAction.targets.map((target) => target.targetReference),
    ['record', 'record/']
  );
});

test('accepts the cross-runtime AxWise external-action plan golden', () => {
  const fixtureBytes = readFileSync(GOLDEN_EXTERNAL_PLAN_PATH);
  const source = JSON.parse(fixtureBytes.toString('utf8'));
  const canonicalInput = { recordId: 'record-1', status: 'active' };

  assert.equal(
    createHash('sha256').update(fixtureBytes).digest('hex'),
    GOLDEN_EXTERNAL_PLAN_BYTES_HASH
  );
  assert.equal(source.content_hash, GOLDEN_EXTERNAL_PLAN_HASH);
  assert.equal(canonicalJsonSha256(canonicalInput), GOLDEN_EXTERNAL_INPUT_HASH);
  assert.equal(canonicalJsonSha256(axwisePlanHashPayload(source)), GOLDEN_EXTERNAL_PLAN_HASH);

  const result = materializeAxwisePlan({
    sourceDecisionId: 'golden-external-decision-2026-09-04',
    axwisePlan: source,
    canonicalInputsByNode: { 'update-record': canonicalInput },
  });
  assert.equal(result.nodes[0].externalAction.providerOperation.operationKey, 'records.update');
  assert.equal(result.nodes[0].externalAction.connection.providerKey, 'example_crm');
  assert.equal(result.nodes[0].externalAction.targets[0].targetReference, 'record-1');
});
