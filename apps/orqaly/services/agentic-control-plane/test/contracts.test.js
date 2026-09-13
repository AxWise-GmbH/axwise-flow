import assert from 'node:assert/strict';
import test from 'node:test';
import { MaterializeAgentRequestSchema } from '../src/domain/contracts.js';
import {
  ExecutionPlanV2Schema,
  executionPlanV2HashPayload,
} from '../src/domain/execution-contracts.js';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import {
  AGENT_COORDINATOR_ID,
  AGENT_REVIEWER_ID,
  AGENT_WORKER_ID,
  materializedPlan,
  proposalRequest,
} from './fixtures.js';

test('accepts a proposal but keeps it explicitly distinct from executable plan v2', () => {
  const parsed = MaterializeAgentRequestSchema.parse(proposalRequest());
  assert.equal(parsed.plan.version, 'orqaly_execution_plan_proposal_v1');
});

test('proposal rejects duplicate team identities, cycles and dependent reviewers', () => {
  const duplicate = proposalRequest();
  duplicate.team[2].agentRef = 'worker';
  assert.equal(MaterializeAgentRequestSchema.safeParse(duplicate).success, false);

  const cycle = proposalRequest();
  cycle.team[0].parentAgentRef = 'worker';
  assert.equal(MaterializeAgentRequestSchema.safeParse(cycle).success, false);

  const dependentReview = proposalRequest();
  dependentReview.plan.steps[0].reviewerAgentRef = 'coordinator';
  assert.equal(MaterializeAgentRequestSchema.safeParse(dependentReview).success, false);
});

test('materialized plan pins durable identities, bindings and RFC 8785 hashes', () => {
  const parsed = ExecutionPlanV2Schema.parse(materializedPlan());
  assert.equal(parsed.owningAgentId, AGENT_COORDINATOR_ID);
  assert.equal(parsed.nodes[0].assignedAgentId, AGENT_WORKER_ID);
  assert.equal(parsed.nodes[0].personaVersion.personaId, 'worker-persona');
  assert.equal(parsed.nodes[0].reviewerAgentId, AGENT_REVIEWER_ID);
  assert.equal(parsed.nodes[0].executorBinding.bindingVersion, '1.0');
});

test('materialized plan rejects altered plan and input hashes', () => {
  const badPlanHash = materializedPlan();
  badPlanHash.contentHash = 'f'.repeat(64);
  assert.equal(ExecutionPlanV2Schema.safeParse(badPlanHash).success, false);

  const badInputHash = materializedPlan();
  badInputHash.nodes[0].canonicalInputHash = 'e'.repeat(64);
  badInputHash.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(badInputHash));
  assert.equal(ExecutionPlanV2Schema.safeParse(badInputHash).success, false);
});

test('materialized plan requires explicit effect and egress authority', () => {
  const missingEffect = materializedPlan();
  delete missingEffect.nodes[0].effectProfile;
  missingEffect.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(missingEffect));
  assert.equal(ExecutionPlanV2Schema.safeParse(missingEffect).success, false);

  const missingEgress = materializedPlan();
  delete missingEgress.nodes[0].dataEgressProfile;
  missingEgress.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(missingEgress));
  assert.equal(ExecutionPlanV2Schema.safeParse(missingEgress).success, false);

  const missingPersona = materializedPlan();
  delete missingPersona.nodes[0].personaVersion;
  missingPersona.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(missingPersona));
  assert.equal(ExecutionPlanV2Schema.safeParse(missingPersona).success, false);
});

test('materialized plan rejects cycles and unsafe connector effect mismatch', () => {
  const cycle = materializedPlan();
  cycle.nodes.push({
    ...structuredClone(cycle.nodes[0]),
    nodeId: 'second',
    dependencies: ['research'],
  });
  cycle.nodes[0].dependencies = ['second'];
  cycle.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(cycle));
  assert.equal(ExecutionPlanV2Schema.safeParse(cycle).success, false);

  const connector = materializedPlan();
  connector.nodes[0].stepKind = 'connector_write';
  connector.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(connector));
  assert.equal(ExecutionPlanV2Schema.safeParse(connector).success, false);
});

test('internal inbox notification can correctly have no external effect', () => {
  const notification = materializedPlan();
  notification.nodes[0].stepKind = 'notify';
  notification.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(notification));
  assert.equal(ExecutionPlanV2Schema.safeParse(notification).success, true);
});
