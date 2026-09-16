import { z } from 'zod';
import { CANONICALIZATION_ALGORITHM, canonicalJson, canonicalJsonSha256 } from './canonical.js';
import { STEP_KINDS } from './contracts.js';
import {
  AwareDateTimeSchema,
  CanonicalKeySchema,
  DataEgressProfileV2Schema,
  DescriptorVersionRefV2Schema,
  EffectProfileV2Schema,
  EffectTargetV1Schema,
  ExecutionLimitsV2Schema,
  ExecutorBindingVersionRefV2Schema,
  ExternalActionSpecV1Schema,
  OpaqueReferenceSchema,
  PersonaVersionRefV2Schema,
} from './execution-contracts.js';

function sortedUnique(schema, identity, message, maximum = 100) {
  return z
    .array(schema)
    .max(maximum)
    .superRefine((items, context) => {
      const identities = items.map(identity);
      const canonical = [...new Set(identities)].sort();
      if (
        canonical.length !== identities.length ||
        canonical.some((item, index) => item !== identities[index])
      ) {
        context.addIssue({ code: 'custom', message });
      }
    });
}

export function effectTargetIdentity(target) {
  return canonicalJson([target.targetType, target.targetReference, target.targetHash || '']);
}

export function canonicalEffectTargetCeiling(targets) {
  const targetsByIdentity = new Map();
  for (const target of targets) targetsByIdentity.set(effectTargetIdentity(target), target);
  return [...targetsByIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, target]) => target);
}

export const DelegationAuthorityCeilingV1Schema = z
  .object({
    allowedDescriptorFamilies: sortedUnique(
      CanonicalKeySchema,
      (value) => value,
      'delegated descriptor families must be sorted and unique'
    ),
    allowedEffectProfiles: sortedUnique(
      EffectProfileV2Schema,
      canonicalJson,
      'delegated effect profiles must be canonically sorted and unique'
    ),
    allowedTargets: sortedUnique(
      EffectTargetV1Schema,
      effectTargetIdentity,
      'delegated targets must be canonically sorted and unique'
    ),
    allowedDataClasses: sortedUnique(
      CanonicalKeySchema,
      (value) => value,
      'delegated data classes must be sorted and unique'
    ),
    maximumCostMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/),
  })
  .strict();

export const DelegationPolicyNodeV1Schema = z
  .object({
    nodeId: OpaqueReferenceSchema,
    stepKind: z.enum(STEP_KINDS),
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    personaVersion: PersonaVersionRefV2Schema,
    canonicalInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedOutputSchemaHash: z.string().regex(/^[a-f0-9]{64}$/),
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    externalAction: ExternalActionSpecV1Schema.nullable(),
    limits: ExecutionLimitsV2Schema,
    deadline: AwareDateTimeSchema.nullable(),
  })
  .strict();

export const DelegationPolicySnapshotV1Schema = z
  .object({
    version: z.literal('orqaly_agent_delegation_policy_v1'),
    contractVersion: z.literal('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    runId: z.string().uuid(),
    planId: z.string().uuid(),
    planVersionId: z.string().uuid(),
    agentId: z.string().uuid(),
    sourceTaskId: OpaqueReferenceSchema,
    authorityCeiling: DelegationAuthorityCeilingV1Schema,
    nodes: sortedUnique(
      DelegationPolicyNodeV1Schema,
      (node) => node.nodeId,
      'delegation policy nodes must be sorted by node ID and unique',
      200
    ).min(1),
  })
  .strict();

export function delegationPolicySnapshotV1Hash(snapshot) {
  return canonicalJsonSha256(DelegationPolicySnapshotV1Schema.parse(snapshot));
}

export class DelegationAuthorityMismatchError extends Error {
  constructor(reason) {
    super('action_intent_outside_delegation');
    this.name = 'DelegationAuthorityMismatchError';
    this.code = 'action_intent_outside_delegation';
    this.reason = reason;
  }
}

function mismatch(reason) {
  throw new DelegationAuthorityMismatchError(reason);
}

function exact(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function actionFromIntent(intent) {
  return {
    version: 'orqaly_external_action_spec_v1',
    effectId: intent.effectId,
    providerOperation: intent.providerOperation,
    connection: intent.connection,
    targets: intent.targets,
    externalPreconditions: intent.externalPreconditions,
    idempotency: intent.idempotency,
    reconciliation: intent.reconciliation,
    compensation: intent.compensation,
  };
}

function planPersonaFromStoredPersona(persona) {
  return {
    contractVersion: persona.contractVersion,
    personaId: persona.personaId,
    personaVersion: persona.personaVersion,
    contentHash: persona.contentHash,
  };
}

/**
 * Proves that a sealed ActionIntent is no broader than its exact immutable
 * per-Agent policy and the accepted plan node from which that policy was made.
 */
export function assertActionIntentWithinDelegation(intent, nodeId, delegation) {
  const parsed = DelegationPolicySnapshotV1Schema.safeParse(delegation.policySnapshot);
  if (!parsed.success) mismatch('policy_snapshot_invalid');
  const snapshot = parsed.data;
  if (delegationPolicySnapshotV1Hash(snapshot) !== delegation.policyHash) {
    mismatch('policy_hash_mismatch');
  }
  if (delegation.agentId !== undefined && delegation.agentId !== snapshot.agentId) {
    mismatch('delegation_agent_mismatch');
  }
  if (!exact(delegation.allowedTargets, snapshot.authorityCeiling.allowedTargets)) {
    mismatch('stored_target_ceiling_mismatch');
  }
  if (intent.agentId !== snapshot.agentId) mismatch('action_agent_mismatch');
  if (
    intent.delegation.policyHash !== delegation.policyHash ||
    intent.policy.contentHash !== delegation.policyHash
  ) {
    mismatch('action_policy_mismatch');
  }
  if (delegation.id !== undefined && intent.delegation.delegationId !== delegation.id) {
    mismatch('action_delegation_id_mismatch');
  }
  if (delegation.version !== undefined && intent.delegation.version !== delegation.version) {
    mismatch('action_delegation_version_mismatch');
  }

  const policyNode = snapshot.nodes.find((node) => node.nodeId === nodeId);
  if (!policyNode) mismatch('policy_node_missing');
  const exactNodeBindings = [
    [intent.stepKind, policyNode.stepKind],
    [intent.descriptor, policyNode.descriptor],
    [intent.executorBinding, policyNode.executorBinding],
    [planPersonaFromStoredPersona(intent.personaVersion), policyNode.personaVersion],
    [intent.canonicalInputHash, policyNode.canonicalInputHash],
    [intent.effectProfile, policyNode.effectProfile],
    [intent.dataEgressProfile, policyNode.dataEgressProfile],
  ];
  if (exactNodeBindings.some(([candidate, ceiling]) => !exact(candidate, ceiling))) {
    mismatch('action_node_authority_mismatch');
  }
  if (policyNode.externalAction === null) mismatch('external_action_not_delegated');

  const ceilingTargets = new Set(
    snapshot.authorityCeiling.allowedTargets.map(effectTargetIdentity)
  );
  if (intent.targets.some((target) => !ceilingTargets.has(effectTargetIdentity(target)))) {
    mismatch('action_target_outside_ceiling');
  }
  if (!exact(actionFromIntent(intent), policyNode.externalAction)) {
    mismatch('action_external_authority_mismatch');
  }
  return snapshot;
}
