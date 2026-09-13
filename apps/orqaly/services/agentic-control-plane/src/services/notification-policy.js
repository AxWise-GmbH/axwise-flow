import { canonicalJsonSha256 } from '../domain/canonical.js';
import {
  NOTIFICATION_URGENCIES,
  NotificationPolicyInputV1Schema,
  NotificationPolicyResultV1Schema,
} from '../domain/notification-contracts.js';

const urgencyRank = new Map(NOTIFICATION_URGENCIES.map((urgency, index) => [urgency, index]));

function sameTenant(left, right) {
  return (
    left.organizationId === right.organizationId &&
    left.workspaceId === right.workspaceId &&
    left.principalId === right.principalId
  );
}

function deliveryKey(event, channel) {
  return canonicalJsonSha256({
    organizationId: event.organizationId,
    workspaceId: event.workspaceId,
    principalId: event.principalId,
    deduplicationKey: event.deduplicationKey,
    channel,
  });
}

function localMinutes(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function clockMinutes(localTime) {
  const [hour, minute] = localTime.split(':').map(Number);
  return hour * 60 + minute;
}

function isQuietHours(evaluatedAt, quietHours) {
  if (quietHours === null) return false;
  const current = localMinutes(evaluatedAt, quietHours.timeZone);
  const start = clockMinutes(quietHours.startLocalTime);
  const end = clockMinutes(quietHours.endLocalTime);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function activeMatchingGrant(grants, event, channel, evaluatedAt) {
  const evaluatedEpoch = Date.parse(evaluatedAt);
  return grants
    .filter((grant) => {
      if (!sameTenant(grant, event)) return false;
      if (grant.status !== 'active' || grant.revokedAt !== null) return false;
      if (grant.channel !== channel) return false;
      if (!grant.eventClasses.includes(event.eventClass)) return false;
      if (!grant.allowedOutreachKinds.includes(event.outreachKind)) return false;
      if (urgencyRank.get(event.urgency) < urgencyRank.get(grant.minimumUrgency)) return false;
      if (Date.parse(grant.validFrom) > evaluatedEpoch) return false;
      if (grant.validUntil !== null && Date.parse(grant.validUntil) <= evaluatedEpoch) {
        return false;
      }
      if (grant.agentId !== null && grant.agentId !== event.sourceAgentId) return false;
      if (
        event.outreachKind === 'arbitrary_agent_outreach' &&
        (grant.agentId === null || grant.agentId !== event.sourceAgentId)
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => left.grantId.localeCompare(right.grantId))[0];
}

function intent(channel, key, decision, reason, standingGrantId = null) {
  return {
    channel,
    deliveryKey: key,
    decision,
    reason,
    standingGrantId,
    providerDeliveryPerformed: false,
  };
}

function externalIntent(input, channel, priorDeliveryKeys) {
  const { event, preference, grants, evaluatedAt } = input;
  const key = deliveryKey(event, channel);
  if (priorDeliveryKeys.has(key)) {
    return intent(channel, key, 'deduplicated', 'already_recorded');
  }
  if (!preference || preference.status !== 'active' || !sameTenant(preference, event)) {
    return intent(channel, key, 'denied', 'preferences_unavailable');
  }
  if (!preference.enabledEventClasses.includes(event.eventClass)) {
    return intent(channel, key, 'denied', 'event_class_disabled');
  }
  if (!preference.enabledExternalChannels.includes(channel)) {
    return intent(channel, key, 'denied', 'channel_disabled');
  }
  if (urgencyRank.get(event.urgency) < urgencyRank.get(preference.minimumExternalUrgency)) {
    return intent(channel, key, 'denied', 'urgency_below_threshold');
  }
  if (
    event.outreachKind === 'arbitrary_agent_outreach' &&
    !preference.allowArbitraryAgentOutreach
  ) {
    return intent(channel, key, 'denied', 'arbitrary_agent_outreach_disabled');
  }
  const grant = activeMatchingGrant(grants, event, channel, evaluatedAt);
  if (!grant) {
    return intent(channel, key, 'denied', 'missing_matching_standing_grant');
  }
  if (
    isQuietHours(evaluatedAt, preference.quietHours) &&
    !(event.urgency === 'critical' && preference.allowCriticalDuringQuietHours)
  ) {
    return intent(channel, key, 'deferred', 'quiet_hours', grant.grantId);
  }
  return intent(
    channel,
    key,
    'ready_for_external_dispatch',
    'policy_requirements_satisfied',
    grant.grantId
  );
}

export function evaluateNotificationPolicy(value) {
  const input = NotificationPolicyInputV1Schema.parse(value);
  const priorDeliveryKeys = new Set(input.priorDeliveryKeys);
  const inAppKey = deliveryKey(input.event, 'in_app');
  const intents = [
    priorDeliveryKeys.has(inAppKey)
      ? intent('in_app', inAppKey, 'deduplicated', 'already_recorded')
      : intent('in_app', inAppKey, 'persist_durable_in_app', 'durable_in_app'),
    ...input.event.requestedExternalChannels.map((channel) =>
      externalIntent(input, channel, priorDeliveryKeys)
    ),
  ];

  return NotificationPolicyResultV1Schema.parse({
    version: 'orqaly_notification_policy_result_v1',
    eventId: input.event.eventId,
    intents,
  });
}
