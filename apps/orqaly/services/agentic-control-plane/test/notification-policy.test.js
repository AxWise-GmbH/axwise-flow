import assert from 'node:assert/strict';
import test from 'node:test';
import { ProactiveNotificationEventV1Schema } from '../src/domain/notification-contracts.js';
import { evaluateNotificationPolicy } from '../src/services/notification-policy.js';

const EVENT_ID = '70000000-0000-4000-8000-000000000001';
const AGENT_ID = '70000000-0000-4000-8000-000000000002';
const OTHER_AGENT_ID = '70000000-0000-4000-8000-000000000003';
const GRANT_ID = '70000000-0000-4000-8000-000000000004';

function event(overrides = {}) {
  return {
    version: 'orqaly_proactive_notification_event_v1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    eventId: EVENT_ID,
    eventClass: 'run_failed',
    urgency: 'high',
    outreachKind: 'task_event',
    sourceAgentId: AGENT_ID,
    runId: '70000000-0000-4000-8000-000000000005',
    subjectReference: 'run/failed-1',
    deduplicationKey: 'run-failed-1',
    requestedExternalChannels: ['email'],
    safePayload: { summary: 'The run needs attention.' },
    occurredAt: '2026-09-04T12:00:00.000Z',
    ...overrides,
  };
}

function preference(overrides = {}) {
  return {
    version: 'orqaly_notification_preference_v1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    status: 'active',
    enabledEventClasses: ['run_failed'],
    enabledExternalChannels: ['email', 'sms'],
    minimumExternalUrgency: 'normal',
    quietHours: null,
    allowCriticalDuringQuietHours: false,
    allowArbitraryAgentOutreach: false,
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

function grant(overrides = {}) {
  return {
    version: 'orqaly_notification_channel_grant_v1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    grantId: GRANT_ID,
    status: 'active',
    channel: 'email',
    eventClasses: ['run_failed'],
    allowedOutreachKinds: ['task_event'],
    minimumUrgency: 'normal',
    agentId: null,
    validFrom: '2026-09-01T00:00:00.000Z',
    validUntil: '2026-10-01T00:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    event: event(),
    preference: preference(),
    grants: [grant()],
    priorDeliveryKeys: [],
    evaluatedAt: '2026-09-04T12:01:00.000Z',
    ...overrides,
  };
}

test('always produces a durable in-app intent and requires a standing grant externally', () => {
  const result = evaluateNotificationPolicy(input({ grants: [] }));
  assert.equal(result.intents[0].channel, 'in_app');
  assert.equal(result.intents[0].decision, 'persist_durable_in_app');
  assert.equal(result.intents[1].channel, 'email');
  assert.equal(result.intents[1].decision, 'denied');
  assert.equal(result.intents[1].reason, 'missing_matching_standing_grant');
  assert.equal(
    result.intents.every((intent) => !intent.providerDeliveryPerformed),
    true
  );
});

test('matching preference and active grant produce only an external dispatch intent', () => {
  const result = evaluateNotificationPolicy(input());
  const email = result.intents.find((intent) => intent.channel === 'email');
  assert.equal(email.decision, 'ready_for_external_dispatch');
  assert.equal(email.standingGrantId, GRANT_ID);
  assert.equal(email.providerDeliveryPerformed, false);
});

test('quiet hours defer normal external notifications but explicit critical override can pass', () => {
  const quietPreference = preference({
    quietHours: {
      timeZone: 'UTC',
      startLocalTime: '22:00',
      endLocalTime: '07:00',
    },
  });
  const quietInput = input({
    preference: quietPreference,
    evaluatedAt: '2026-09-04T22:30:00.000Z',
  });
  const deferred = evaluateNotificationPolicy(quietInput).intents[1];
  assert.equal(deferred.decision, 'deferred');
  assert.equal(deferred.reason, 'quiet_hours');
  assert.equal(deferred.standingGrantId, GRANT_ID);

  const critical = evaluateNotificationPolicy({
    ...quietInput,
    event: event({ urgency: 'critical' }),
    preference: { ...quietPreference, allowCriticalDuringQuietHours: true },
  }).intents[1];
  assert.equal(critical.decision, 'ready_for_external_dispatch');
});

test('arbitrary Agent outreach needs user opt-in and a standing grant for that exact Agent', () => {
  const outreachEvent = event({
    eventClass: 'agent_outreach',
    outreachKind: 'arbitrary_agent_outreach',
    runId: null,
  });
  const outreachPreference = preference({
    enabledEventClasses: ['agent_outreach'],
    allowArbitraryAgentOutreach: true,
  });
  const genericResult = evaluateNotificationPolicy({
    ...input(),
    event: outreachEvent,
    preference: outreachPreference,
  });
  assert.equal(genericResult.intents[1].reason, 'missing_matching_standing_grant');

  const exactGrant = grant({
    eventClasses: ['agent_outreach'],
    allowedOutreachKinds: ['arbitrary_agent_outreach'],
    agentId: AGENT_ID,
  });
  const exactResult = evaluateNotificationPolicy({
    ...input(),
    event: outreachEvent,
    preference: outreachPreference,
    grants: [exactGrant],
  });
  assert.equal(exactResult.intents[1].decision, 'ready_for_external_dispatch');

  const otherAgentResult = evaluateNotificationPolicy({
    ...input(),
    event: outreachEvent,
    preference: outreachPreference,
    grants: [{ ...exactGrant, agentId: OTHER_AGENT_ID }],
  });
  assert.equal(otherAgentResult.intents[1].reason, 'missing_matching_standing_grant');
});

test('event class, urgency, preference opt-in and tenant scope all fail closed', () => {
  const disabledEventClass = evaluateNotificationPolicy({
    ...input(),
    preference: preference({ enabledEventClasses: ['run_completed'] }),
  }).intents[1];
  assert.equal(disabledEventClass.reason, 'event_class_disabled');

  const lowUrgency = evaluateNotificationPolicy({
    ...input(),
    event: event({ urgency: 'low' }),
  }).intents[1];
  assert.equal(lowUrgency.reason, 'urgency_below_threshold');

  const crossTenantGrant = evaluateNotificationPolicy({
    ...input(),
    grants: [grant({ workspaceId: 'workspace-2' })],
  }).intents[1];
  assert.equal(crossTenantGrant.reason, 'missing_matching_standing_grant');

  const arbitraryDisabled = evaluateNotificationPolicy({
    ...input(),
    event: event({
      eventClass: 'agent_outreach',
      outreachKind: 'arbitrary_agent_outreach',
    }),
    preference: preference({ enabledEventClasses: ['agent_outreach'] }),
    grants: [
      grant({
        eventClasses: ['agent_outreach'],
        allowedOutreachKinds: ['arbitrary_agent_outreach'],
        agentId: AGENT_ID,
      }),
    ],
  }).intents[1];
  assert.equal(arbitraryDisabled.reason, 'arbitrary_agent_outreach_disabled');
});

test('expired and revoked grants never authorize an external proactive delivery', () => {
  const expired = evaluateNotificationPolicy({
    ...input(),
    grants: [
      grant({
        status: 'expired',
        validUntil: '2026-09-04T12:00:00.000Z',
      }),
    ],
  }).intents[1];
  assert.equal(expired.reason, 'missing_matching_standing_grant');

  const revoked = evaluateNotificationPolicy({
    ...input(),
    grants: [
      grant({
        status: 'revoked',
        revokedAt: '2026-09-04T11:00:00.000Z',
      }),
    ],
  }).intents[1];
  assert.equal(revoked.reason, 'missing_matching_standing_grant');
});

test('delivery keys deduplicate every channel without performing provider delivery', () => {
  const first = evaluateNotificationPolicy(input());
  const replay = evaluateNotificationPolicy({
    ...input(),
    priorDeliveryKeys: first.intents.map((intent) => intent.deliveryKey).sort(),
  });
  assert.equal(
    replay.intents.every((intent) => intent.decision === 'deduplicated'),
    true
  );
  assert.equal(
    replay.intents.every((intent) => !intent.providerDeliveryPerformed),
    true
  );
});

test('notification contracts reject unknown fields and ambiguous arbitrary outreach', () => {
  assert.equal(
    ProactiveNotificationEventV1Schema.safeParse({ ...event(), unexpected: true }).success,
    false
  );
  assert.equal(
    ProactiveNotificationEventV1Schema.safeParse({
      ...event(),
      eventClass: 'agent_outreach',
      outreachKind: 'task_event',
    }).success,
    false
  );
});
