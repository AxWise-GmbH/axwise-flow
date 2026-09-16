import { z } from 'zod';

export const NOTIFICATION_EVENT_CLASSES = [
  'agent_outreach',
  'agent_update',
  'approval_required',
  'customer_input_required',
  'deadline_risk',
  'run_completed',
  'run_failed',
  'security_alert',
];
export const NOTIFICATION_URGENCIES = ['low', 'normal', 'high', 'critical'];
export const EXTERNAL_NOTIFICATION_CHANNELS = ['email', 'push', 'sms', 'webhook'];
export const NOTIFICATION_OUTREACH_KINDS = ['arbitrary_agent_outreach', 'task_event'];

const ScopeIdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const OpaqueReferenceSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const DedupeKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const AwareDateTimeSchema = z.string().datetime({ offset: true });
const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const JsonObjectSchema = z.record(z.string(), z.unknown());

function sortedUnique(schema, message, { minimum = 0, maximum = 100 } = {}) {
  return z
    .array(schema)
    .min(minimum)
    .max(maximum)
    .superRefine((items, context) => {
      const canonical = [...new Set(items)].sort();
      if (
        canonical.length !== items.length ||
        canonical.some((item, index) => item !== items[index])
      ) {
        context.addIssue({ code: 'custom', message });
      }
    });
}

function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

const TenantScopeSchema = {
  organizationId: ScopeIdentifierSchema,
  workspaceId: ScopeIdentifierSchema,
  principalId: ScopeIdentifierSchema,
};

export const QuietHoursV1Schema = z
  .object({
    timeZone: z.string().min(1).max(100),
    startLocalTime: LocalTimeSchema,
    endLocalTime: LocalTimeSchema,
  })
  .strict()
  .superRefine((quietHours, context) => {
    if (!isTimeZone(quietHours.timeZone)) {
      context.addIssue({ code: 'custom', path: ['timeZone'], message: 'unknown time zone' });
    }
    if (quietHours.startLocalTime === quietHours.endLocalTime) {
      context.addIssue({
        code: 'custom',
        message: 'quiet-hours start and end must differ',
      });
    }
  });

export const ProactiveNotificationEventV1Schema = z
  .object({
    version: z.literal('orqaly_proactive_notification_event_v1'),
    ...TenantScopeSchema,
    eventId: z.string().uuid(),
    eventClass: z.enum(NOTIFICATION_EVENT_CLASSES),
    urgency: z.enum(NOTIFICATION_URGENCIES),
    outreachKind: z.enum(NOTIFICATION_OUTREACH_KINDS),
    sourceAgentId: z.string().uuid().nullable(),
    runId: z.string().uuid().nullable(),
    subjectReference: OpaqueReferenceSchema,
    deduplicationKey: DedupeKeySchema,
    requestedExternalChannels: sortedUnique(
      z.enum(EXTERNAL_NOTIFICATION_CHANNELS),
      'requested external channels must be sorted and unique',
      { maximum: EXTERNAL_NOTIFICATION_CHANNELS.length }
    ),
    safePayload: JsonObjectSchema,
    occurredAt: AwareDateTimeSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (event.outreachKind === 'arbitrary_agent_outreach') {
      if (event.eventClass !== 'agent_outreach') {
        context.addIssue({
          code: 'custom',
          path: ['eventClass'],
          message: 'arbitrary Agent outreach must use the agent_outreach event class',
        });
      }
      if (event.sourceAgentId === null) {
        context.addIssue({
          code: 'custom',
          path: ['sourceAgentId'],
          message: 'arbitrary Agent outreach requires a source Agent',
        });
      }
    } else if (event.eventClass === 'agent_outreach') {
      context.addIssue({
        code: 'custom',
        path: ['outreachKind'],
        message: 'agent_outreach is reserved for explicitly arbitrary Agent outreach',
      });
    }
  });

export const NotificationPreferenceV1Schema = z
  .object({
    version: z.literal('orqaly_notification_preference_v1'),
    ...TenantScopeSchema,
    status: z.enum(['active', 'paused']),
    enabledEventClasses: sortedUnique(
      z.enum(NOTIFICATION_EVENT_CLASSES),
      'enabled event classes must be sorted and unique',
      { maximum: NOTIFICATION_EVENT_CLASSES.length }
    ),
    enabledExternalChannels: sortedUnique(
      z.enum(EXTERNAL_NOTIFICATION_CHANNELS),
      'enabled external channels must be sorted and unique',
      { maximum: EXTERNAL_NOTIFICATION_CHANNELS.length }
    ),
    minimumExternalUrgency: z.enum(NOTIFICATION_URGENCIES),
    quietHours: QuietHoursV1Schema.nullable(),
    allowCriticalDuringQuietHours: z.boolean(),
    allowArbitraryAgentOutreach: z.boolean(),
    updatedAt: AwareDateTimeSchema,
  })
  .strict();

export const NotificationChannelGrantV1Schema = z
  .object({
    version: z.literal('orqaly_notification_channel_grant_v1'),
    ...TenantScopeSchema,
    grantId: z.string().uuid(),
    status: z.enum(['active', 'revoked', 'expired']),
    channel: z.enum(EXTERNAL_NOTIFICATION_CHANNELS),
    eventClasses: sortedUnique(
      z.enum(NOTIFICATION_EVENT_CLASSES),
      'grant event classes must be sorted and unique',
      { minimum: 1, maximum: NOTIFICATION_EVENT_CLASSES.length }
    ),
    allowedOutreachKinds: sortedUnique(
      z.enum(NOTIFICATION_OUTREACH_KINDS),
      'grant outreach kinds must be sorted and unique',
      { minimum: 1, maximum: NOTIFICATION_OUTREACH_KINDS.length }
    ),
    minimumUrgency: z.enum(NOTIFICATION_URGENCIES),
    agentId: z.string().uuid().nullable(),
    validFrom: AwareDateTimeSchema,
    validUntil: AwareDateTimeSchema.nullable(),
    revokedAt: AwareDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((grant, context) => {
    if (grant.validUntil !== null && Date.parse(grant.validUntil) <= Date.parse(grant.validFrom)) {
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'grant expiry must follow its start',
      });
    }
    if (grant.allowedOutreachKinds.includes('arbitrary_agent_outreach') && grant.agentId === null) {
      context.addIssue({
        code: 'custom',
        path: ['agentId'],
        message: 'arbitrary Agent outreach grants must bind an exact Agent',
      });
    }
    if (grant.status === 'revoked' && grant.revokedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['revokedAt'],
        message: 'revoked grants require a revocation timestamp',
      });
    }
    if (grant.status === 'active' && grant.revokedAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['revokedAt'],
        message: 'active grants cannot have a revocation timestamp',
      });
    }
  });

export const NotificationPolicyInputV1Schema = z
  .object({
    event: ProactiveNotificationEventV1Schema,
    preference: NotificationPreferenceV1Schema.nullable(),
    grants: z.array(NotificationChannelGrantV1Schema).max(100),
    priorDeliveryKeys: sortedUnique(HashSchema, 'prior delivery keys must be sorted and unique', {
      maximum: 1_000,
    }),
    evaluatedAt: AwareDateTimeSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const grantIds = input.grants.map((grant) => grant.grantId);
    if (new Set(grantIds).size !== grantIds.length) {
      context.addIssue({ code: 'custom', path: ['grants'], message: 'grant IDs must be unique' });
    }
  });

export const NOTIFICATION_POLICY_DECISIONS = [
  'deduplicated',
  'deferred',
  'denied',
  'persist_durable_in_app',
  'ready_for_external_dispatch',
];

export const NOTIFICATION_POLICY_REASONS = [
  'already_recorded',
  'arbitrary_agent_outreach_disabled',
  'channel_disabled',
  'durable_in_app',
  'event_class_disabled',
  'missing_matching_standing_grant',
  'policy_requirements_satisfied',
  'preferences_unavailable',
  'quiet_hours',
  'urgency_below_threshold',
];

const NotificationPolicyIntentV1Schema = z
  .object({
    channel: z.enum(['in_app', ...EXTERNAL_NOTIFICATION_CHANNELS]),
    deliveryKey: HashSchema,
    decision: z.enum(NOTIFICATION_POLICY_DECISIONS),
    reason: z.enum(NOTIFICATION_POLICY_REASONS),
    standingGrantId: z.string().uuid().nullable(),
    providerDeliveryPerformed: z.literal(false),
  })
  .strict();

export const NotificationPolicyResultV1Schema = z
  .object({
    version: z.literal('orqaly_notification_policy_result_v1'),
    eventId: z.string().uuid(),
    intents: z.array(NotificationPolicyIntentV1Schema).min(1).max(5),
  })
  .strict();
