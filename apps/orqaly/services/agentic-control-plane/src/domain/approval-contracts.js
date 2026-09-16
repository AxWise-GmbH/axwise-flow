import crypto from 'node:crypto';
import { z } from 'zod';
import { CANONICALIZATION_ALGORITHM, canonicalJson, canonicalJsonSha256 } from './canonical.js';
import { STEP_KINDS } from './contracts.js';
import {
  AwareDateTimeSchema,
  CompensationPolicyV1Schema,
  ConnectionReferenceV1Schema,
  DataEgressProfileV2Schema,
  DescriptorVersionRefV2Schema,
  EffectProfileV2Schema,
  EffectTargetV1Schema,
  ExecutionLimitsV2Schema,
  ExecutorBindingVersionRefV2Schema,
  ExternalPreconditionV1Schema,
  HashSchema,
  IdempotencyBindingV1Schema,
  JsonObjectSchema,
  OpaqueReferenceSchema,
  PersonaVersionRefV2Schema,
  ProviderOperationVersionRefV1Schema,
  ReconciliationPolicyV1Schema,
} from './execution-contracts.js';

export const ACTION_INTENT_HASH_DOMAIN = 'orqaly.action-intent.v1\0';
export const APPROVAL_SUBJECT_HASH_DOMAIN = 'orqaly.approval.v1\0';

const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/);

const PresentationVersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const REDACTED_PARAMETER_VALUE = '[REDACTED]';
const SECRET_PARAMETER_KEYS = new Set([
  'accesstoken',
  'apikey',
  'apitoken',
  'authorization',
  'authtoken',
  'bearertoken',
  'clientsecret',
  'cookie',
  'credential',
  'credentials',
  'idtoken',
  'password',
  'passwd',
  'privatekey',
  'refreshtoken',
  'secret',
  'session',
  'sessionid',
  'token',
]);
const RAW_SECRET_PATTERNS = [
  /(?:basic|bearer)\s+[A-Za-z0-9._~+/-]{8,}={0,2}/i,
  /-----BEGIN (?:ENCRYPTED |RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /(?:gh[opusr]_|github_pat_|sk-(?:live|test|proj)-|xox[baprs]-)[A-Za-z0-9._-]{8,}/i,
  /https?:\/\/[^\s/:]+:[^\s/@]+@/i,
  /(?:password|passwd|client[ _-]?secret|api[ _-]?key|access[ _-]?token)\s*(?:is|=|:)\s*\S+/i,
];

function domainSeparatedCanonicalHash(domain, value) {
  return crypto
    .createHash('sha256')
    .update(domain, 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

function sortedUniqueObjects(schema, identity, message, maximum = 200) {
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

function jsonPointerToken(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function isSensitiveParameterKey(key) {
  return SECRET_PARAMETER_KEYS.has(
    String(key)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );
}

function looksLikeRawSecret(value) {
  return typeof value === 'string' && RAW_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function redactCanonicalValue(value, path, redactedPaths) {
  if (looksLikeRawSecret(value)) {
    redactedPaths.push(path || '/');
    return REDACTED_PARAMETER_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactCanonicalValue(item, `${path}/${index}`, redactedPaths)
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const itemPath = `${path}/${jsonPointerToken(key)}`;
        if (isSensitiveParameterKey(key)) {
          redactedPaths.push(itemPath);
          return [key, REDACTED_PARAMETER_VALUE];
        }
        return [key, redactCanonicalValue(item, itemPath, redactedPaths)];
      })
    );
  }
  return value;
}

function unsafePresentationPaths(value, path = '') {
  if (looksLikeRawSecret(value)) return [path || '/'];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => unsafePresentationPaths(item, `${path}/${index}`));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const itemPath = `${path}/${jsonPointerToken(key)}`;
    if (isSensitiveParameterKey(key) && item !== REDACTED_PARAMETER_VALUE) {
      return [itemPath];
    }
    return unsafePresentationPaths(item, itemPath);
  });
}

export function redactApprovalCanonicalParameters(parameters) {
  const redactedPaths = [];
  const canonicalParameters = redactCanonicalValue(parameters, '', redactedPaths);
  return {
    canonicalParameters,
    redactedParameterPaths: [...new Set(redactedPaths)].sort(),
  };
}

export const StoredPersonaVersionRefV1Schema = PersonaVersionRefV2Schema.extend({
  personaVersionId: z.string().uuid(),
});

export const DelegationVersionRefV1Schema = z
  .object({
    delegationId: z.string().uuid(),
    version: z.number().int().min(1),
    policyHash: HashSchema,
  })
  .strict();

export const PlanVersionRefV1Schema = z
  .object({
    planId: z.string().uuid(),
    planVersionId: z.string().uuid(),
    planVersion: z.number().int().min(1),
    contentHash: HashSchema,
  })
  .strict();

export const PolicyVersionRefV1Schema = z
  .object({
    policyId: OpaqueReferenceSchema,
    policyVersion: z.string().min(1).max(64),
    contentHash: HashSchema,
  })
  .strict();

const ActionIntentShape = z
  .object({
    version: z.literal('orqaly_action_intent_v1'),
    contractVersion: z.literal('1.0').default('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    organizationId: OpaqueReferenceSchema,
    workspaceId: OpaqueReferenceSchema,
    principalId: OpaqueReferenceSchema,
    actionIntentId: z.string().uuid(),
    effectId: z.string().uuid(),
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
    stepKind: z.enum(STEP_KINDS),
    agentId: z.string().uuid(),
    personaVersion: StoredPersonaVersionRefV1Schema,
    planVersion: PlanVersionRefV1Schema,
    delegation: DelegationVersionRefV1Schema,
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    canonicalParameters: JsonObjectSchema,
    canonicalInputHash: HashSchema,
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    targets: sortedUniqueObjects(
      EffectTargetV1Schema,
      (target) =>
        canonicalJson([target.targetType, target.targetReference, target.targetHash || '']),
      'action intent targets must be sorted and unique',
      100
    ).min(1),
    externalPreconditions: sortedUniqueObjects(
      ExternalPreconditionV1Schema,
      (item) =>
        canonicalJson([item.preconditionType, item.targetReference, item.expectedStateHash]),
      'action intent preconditions must be sorted and unique',
      100
    ),
    connection: ConnectionReferenceV1Schema,
    providerOperation: ProviderOperationVersionRefV1Schema,
    idempotency: IdempotencyBindingV1Schema,
    policy: PolicyVersionRefV1Schema,
    reconciliation: ReconciliationPolicyV1Schema,
    compensation: CompensationPolicyV1Schema,
    createdAt: AwareDateTimeSchema,
    contentHash: HashSchema,
  })
  .strict();

export function actionIntentV1HashPayload(intent) {
  const { contentHash: _ignored, ...payload } = intent;
  return payload;
}

export function actionIntentV1Hash(intent) {
  return domainSeparatedCanonicalHash(ACTION_INTENT_HASH_DOMAIN, actionIntentV1HashPayload(intent));
}

export const ActionIntentV1Schema = ActionIntentShape.superRefine((intent, context) => {
  if (canonicalJsonSha256(intent.canonicalParameters) !== intent.canonicalInputHash) {
    context.addIssue({
      code: 'custom',
      path: ['canonicalInputHash'],
      message: 'action intent parameters do not match the canonical input hash',
    });
  }
  if (intent.effectProfile.externality === 'none') {
    context.addIssue({
      code: 'custom',
      path: ['effectProfile', 'externality'],
      message: 'an action intent must describe an external effect',
    });
  }
  if (intent.effectProfile.externality === 'read' && intent.externalPreconditions.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['externalPreconditions'],
      message: 'external preconditions are valid only for writes',
    });
  }
  if (
    intent.effectProfile.externality === 'write' &&
    ['update', 'delete'].includes(intent.effectProfile.mutation) &&
    intent.externalPreconditions.length === 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['externalPreconditions'],
      message: 'update and delete intents require an exact external precondition',
    });
  }
  if (intent.delegation.policyHash !== intent.policy.contentHash) {
    context.addIssue({
      code: 'custom',
      path: ['policy', 'contentHash'],
      message: 'policy identity must match the exact delegation policy hash',
    });
  }
  if (actionIntentV1Hash(intent) !== intent.contentHash) {
    context.addIssue({
      code: 'custom',
      path: ['contentHash'],
      message: 'action intent hash does not match its domain-separated canonical bytes',
    });
  }
});

export function sealActionIntentV1(intent) {
  const payload = actionIntentV1HashPayload(intent);
  return ActionIntentV1Schema.parse({
    ...payload,
    contentHash: domainSeparatedCanonicalHash(ACTION_INTENT_HASH_DOMAIN, payload),
  });
}

export const ApprovalStepBindingV1Schema = z
  .object({
    stepId: z.string().uuid(),
    nodeId: OpaqueReferenceSchema,
    title: z.string().trim().min(1).max(500),
    objective: z.string().trim().min(1).max(4_000),
    stepKind: z.enum(STEP_KINDS),
    agentId: z.string().uuid(),
    personaVersion: StoredPersonaVersionRefV1Schema,
    delegation: DelegationVersionRefV1Schema,
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    canonicalParameters: JsonObjectSchema,
    canonicalInputHash: HashSchema,
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    limits: ExecutionLimitsV2Schema,
    deadline: AwareDateTimeSchema.nullable(),
    humanReadableEffect: z
      .object({
        summary: z.string().trim().min(1).max(4_000),
        risks: z.array(z.string().trim().min(1).max(1_000)).max(100),
      })
      .strict(),
    actionIntent: ActionIntentV1Schema.nullable(),
  })
  .strict()
  .superRefine((step, context) => {
    if (canonicalJsonSha256(step.canonicalParameters) !== step.canonicalInputHash) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalInputHash'],
        message: 'approval step parameters do not match the canonical input hash',
      });
    }
    if (step.effectProfile.externality === 'none' && step.actionIntent !== null) {
      context.addIssue({
        code: 'custom',
        path: ['actionIntent'],
        message: 'a non-external approval step cannot bind an action intent',
      });
    }
    if (step.effectProfile.externality !== 'none' && step.actionIntent === null) {
      context.addIssue({
        code: 'custom',
        path: ['actionIntent'],
        message: 'an external approval step must bind its immutable action intent',
      });
    }
    if (!step.actionIntent) return;
    const exactBindings = [
      [step.stepId, step.actionIntent.stepId],
      [step.stepKind, step.actionIntent.stepKind],
      [step.agentId, step.actionIntent.agentId],
      [canonicalJson(step.personaVersion), canonicalJson(step.actionIntent.personaVersion)],
      [canonicalJson(step.delegation), canonicalJson(step.actionIntent.delegation)],
      [canonicalJson(step.descriptor), canonicalJson(step.actionIntent.descriptor)],
      [canonicalJson(step.executorBinding), canonicalJson(step.actionIntent.executorBinding)],
      [step.canonicalInputHash, step.actionIntent.canonicalInputHash],
      [
        canonicalJson(step.canonicalParameters),
        canonicalJson(step.actionIntent.canonicalParameters),
      ],
      [canonicalJson(step.effectProfile), canonicalJson(step.actionIntent.effectProfile)],
      [canonicalJson(step.dataEgressProfile), canonicalJson(step.actionIntent.dataEgressProfile)],
    ];
    if (exactBindings.some(([expected, observed]) => expected !== observed)) {
      context.addIssue({
        code: 'custom',
        path: ['actionIntent'],
        message: 'action intent does not match the exact approved step authority',
      });
    }
  });

export const ApprovalSubjectV1Schema = z
  .object({
    version: z.literal('orqaly_approval_subject_v1'),
    contractVersion: z.literal('1.0').default('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    subjectKind: z.literal('plan'),
    organizationId: OpaqueReferenceSchema,
    workspaceId: OpaqueReferenceSchema,
    approverPrincipalId: OpaqueReferenceSchema,
    runId: z.string().uuid(),
    sourceDecisionId: OpaqueReferenceSchema,
    owningAgentId: z.string().uuid(),
    teamId: z.string().uuid(),
    planVersion: PlanVersionRefV1Schema,
    steps: sortedUniqueObjects(
      ApprovalStepBindingV1Schema,
      (step) => step.nodeId,
      'approval steps must be sorted by node ID and unique'
    ).min(1),
    budget: z
      .object({
        amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        currency: z
          .string()
          .length(3)
          .regex(/^[A-Z]{3}$/),
      })
      .strict(),
    issuedAt: AwareDateTimeSchema,
    expiresAt: AwareDateTimeSchema,
    nonce: z.string().uuid(),
  })
  .strict()
  .superRefine((subject, context) => {
    if (new Date(subject.expiresAt) <= new Date(subject.issuedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'approval subject expiry must be after issue time',
      });
    }
    for (const [index, step] of subject.steps.entries()) {
      if (!step.actionIntent) continue;
      const intent = step.actionIntent;
      const exactBindings = [
        [subject.organizationId, intent.organizationId],
        [subject.workspaceId, intent.workspaceId],
        [subject.approverPrincipalId, intent.principalId],
        [subject.runId, intent.runId],
        [subject.planVersion.planId, intent.planVersion.planId],
        [subject.planVersion.planVersionId, intent.planVersion.planVersionId],
        [subject.planVersion.planVersion, intent.planVersion.planVersion],
        [subject.planVersion.contentHash, intent.planVersion.contentHash],
      ];
      if (exactBindings.some(([expected, observed]) => expected !== observed)) {
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'actionIntent'],
          message: 'action intent is outside the approval subject identity',
        });
      }
    }
  });

const ApprovalOperationPresentationV1Schema = z
  .object({
    kind: z.enum(['agent_step', 'provider_operation']),
    key: OpaqueReferenceSchema,
    version: PresentationVersionSchema,
    contentHash: HashSchema,
  })
  .strict();

const ApprovalConnectionPresentationV1Schema = z
  .object({
    connectionReference: OpaqueReferenceSchema,
    providerKey: OpaqueReferenceSchema,
    requestedScopes: z.array(OpaqueReferenceSchema).max(100),
  })
  .strict();

const ApprovalActionPresentationV1Schema = z
  .object({
    actionIntentId: z.string().uuid(),
    effectId: z.string().uuid(),
    providerOperation: ProviderOperationVersionRefV1Schema,
    connection: ApprovalConnectionPresentationV1Schema,
    targets: z.array(EffectTargetV1Schema).min(1).max(100),
    externalPreconditions: z.array(ExternalPreconditionV1Schema).max(100),
    idempotency: IdempotencyBindingV1Schema,
    reconciliation: ReconciliationPolicyV1Schema,
    compensation: CompensationPolicyV1Schema,
  })
  .strict();

const ApprovalPresentationStepV1Schema = z
  .object({
    stepId: z.string().uuid(),
    nodeId: OpaqueReferenceSchema,
    title: z.string().trim().min(1).max(500),
    objective: z.string().trim().min(1).max(4_000),
    operation: ApprovalOperationPresentationV1Schema,
    agent: z
      .object({
        agentId: z.string().uuid(),
        personaVersion: StoredPersonaVersionRefV1Schema,
        delegation: DelegationVersionRefV1Schema,
      })
      .strict(),
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    canonicalParameters: JsonObjectSchema,
    canonicalInputHash: HashSchema,
    redactedParameterPaths: z.array(z.string().min(1).max(2_000)).max(200),
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    limits: ExecutionLimitsV2Schema,
    deadline: AwareDateTimeSchema.nullable(),
    humanReadableEffect: z
      .object({
        summary: z.string().trim().min(1).max(4_000),
        risks: z.array(z.string().trim().min(1).max(1_000)).max(100),
      })
      .strict(),
    action: ApprovalActionPresentationV1Schema.nullable(),
  })
  .strict()
  .superRefine((step, context) => {
    const unsafePaths = unsafePresentationPaths(step);
    if (unsafePaths.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalParameters'],
        message: 'approval presentation contains raw credential or token material',
      });
    }
    const canonicalRedactions = [...new Set(step.redactedParameterPaths)].sort();
    if (
      canonicalRedactions.length !== step.redactedParameterPaths.length ||
      canonicalRedactions.some((item, index) => item !== step.redactedParameterPaths[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['redactedParameterPaths'],
        message: 'redacted parameter paths must be sorted and unique',
      });
    }
    if (step.effectProfile.externality === 'none' && step.action !== null) {
      context.addIssue({
        code: 'custom',
        path: ['action'],
        message: 'a non-external approval presentation cannot expose an action',
      });
    }
    if (step.effectProfile.externality !== 'none' && step.action === null) {
      context.addIssue({
        code: 'custom',
        path: ['action'],
        message: 'an external approval presentation requires its safe action fields',
      });
    }
  });

export const ApprovalPresentationV1Schema = z
  .object({
    version: z.literal('orqaly_approval_presentation_v1'),
    title: z.string().trim().min(1).max(500),
    subjectKind: z.literal('plan'),
    planVersion: PlanVersionRefV1Schema,
    owningAgentId: z.string().uuid(),
    teamId: z.string().uuid(),
    budget: z
      .object({
        amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        currency: z
          .string()
          .length(3)
          .regex(/^[A-Z]{3}$/),
      })
      .strict(),
    issuedAt: AwareDateTimeSchema,
    expiresAt: AwareDateTimeSchema,
    steps: z.array(ApprovalPresentationStepV1Schema).min(1).max(200),
  })
  .strict();

export function buildApprovalPresentationV1(subjectInput) {
  const subject = ApprovalSubjectV1Schema.parse(subjectInput);
  return ApprovalPresentationV1Schema.parse({
    version: 'orqaly_approval_presentation_v1',
    title: 'Approve this Agent plan',
    subjectKind: subject.subjectKind,
    planVersion: subject.planVersion,
    owningAgentId: subject.owningAgentId,
    teamId: subject.teamId,
    budget: subject.budget,
    issuedAt: subject.issuedAt,
    expiresAt: subject.expiresAt,
    steps: subject.steps.map((step) => {
      const safeParameters = redactApprovalCanonicalParameters(step.canonicalParameters);
      const operation = step.actionIntent
        ? {
            kind: 'provider_operation',
            key: step.actionIntent.providerOperation.operationKey,
            version: step.actionIntent.providerOperation.operationVersion,
            contentHash: step.actionIntent.providerOperation.contentHash,
          }
        : {
            kind: 'agent_step',
            key: step.descriptor.descriptorKey,
            version: step.descriptor.schemaVersion,
            contentHash: step.descriptor.contentHash,
          };
      const action = step.actionIntent
        ? {
            actionIntentId: step.actionIntent.actionIntentId,
            effectId: step.actionIntent.effectId,
            providerOperation: step.actionIntent.providerOperation,
            connection: {
              connectionReference: step.actionIntent.connection.connectionReference,
              providerKey: step.actionIntent.connection.providerKey,
              requestedScopes: step.actionIntent.connection.requestedScopes,
            },
            targets: step.actionIntent.targets,
            externalPreconditions: step.actionIntent.externalPreconditions,
            idempotency: step.actionIntent.idempotency,
            reconciliation: step.actionIntent.reconciliation,
            compensation: step.actionIntent.compensation,
          }
        : null;
      return {
        stepId: step.stepId,
        nodeId: step.nodeId,
        title: step.title,
        objective: step.objective,
        operation,
        agent: {
          agentId: step.agentId,
          personaVersion: step.personaVersion,
          delegation: step.delegation,
        },
        descriptor: step.descriptor,
        executorBinding: step.executorBinding,
        canonicalParameters: safeParameters.canonicalParameters,
        canonicalInputHash: step.canonicalInputHash,
        redactedParameterPaths: safeParameters.redactedParameterPaths,
        effectProfile: step.effectProfile,
        dataEgressProfile: step.dataEgressProfile,
        limits: step.limits,
        deadline: step.deadline,
        humanReadableEffect: step.humanReadableEffect,
        action,
      };
    }),
  });
}

export function approvalSubjectV1Hash(subject) {
  const parsed = ApprovalSubjectV1Schema.parse(subject);
  return domainSeparatedCanonicalHash(APPROVAL_SUBJECT_HASH_DOMAIN, parsed);
}

export const ApprovalDecisionRequestSchema = z
  .object({
    version: z.literal('orqaly_approval_decision_request_v1'),
    idempotencyKey: IdempotencyKeySchema,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(2_000).nullable().default(null),
  })
  .strict();
