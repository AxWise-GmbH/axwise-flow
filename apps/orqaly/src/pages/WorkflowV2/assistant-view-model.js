import {
  ASSISTANT_MODES,
  assistantIntentForRoute,
  assistantModeForRoute,
} from './assistant-modes.js';
import { isCanonicalPublicHttpsUrl } from '../../../shared/workflow-v2/public-https-url.js';

const TERMINAL_ACTIVITY_TYPES = new Set(['completed', 'failed', 'cancelled']);
const ACTIVE_ACTIVITY_TYPES = new Set(['accepted', 'running', 'cancel_requested']);
const AXWISE_ROUTES = new Set(['DIRECT_ANSWER', 'DISCOVER', 'AXWISE_ONE_SHOT']);
const SAFE_UPSTREAM_TYPES = new Set([
  'accepted',
  'running',
  'heartbeat',
  'cancel_requested',
  'cancelled',
  'completed',
  'failed',
]);
const ACTIVITY_STEP_ORDER = new Map(
  [
    'routed',
    'retry',
    'submitted',
    'accepted',
    'running',
    'heartbeat',
    'tool_started',
    'tool_completed',
    'cancel_requested',
    'completed',
    'failed',
    'cancelled',
  ].map((key, index) => [key, index])
);

const ASSISTANT_INTENTS = new Set(Object.keys(ASSISTANT_MODES));
const ASSISTANT_ROUTES = new Set([
  'DIRECT_ANSWER',
  'DISCOVER',
  'AXWISE_ONE_SHOT',
  'PROPOSE_GOAL',
  'START_GOAL',
  'CONTINUE_GOAL',
]);
const ROUTE_REASON_DETAILS = Object.freeze({
  active_goal_continue: 'The request matched a continuation of the active Goal.',
  assistant_direct: 'You selected Assistant for this message.',
  auto_direct: 'Auto kept this request in the conversation.',
  bounded_research: 'Auto matched a bounded research task.',
  contextual_follow_up: 'The request matched a conversational follow-up.',
  context_required: 'The request needs conversation context before more work starts.',
  durable_work: 'Auto matched work that benefits from a tracked Agent workflow.',
  explicit_goal_start: 'The request explicitly asked to delegate work to an Agent.',
  grounded_sources_requested: 'Auto matched an explicit grounded-source requirement.',
  requested_goal: 'You selected Agent for this message.',
  requested_research: 'You selected Research for this message.',
  verification_requested: 'Auto matched a request that needs grounded verification.',
});

function routingField(message, field, nestedField = field) {
  if (message?.[field] !== undefined && message[field] !== null) return message[field];
  const nested = message?.routingProvenance;
  return nested && typeof nested === 'object' ? nested[nestedField] : undefined;
}

function safeRequestedIntent(value) {
  return typeof value === 'string' && ASSISTANT_INTENTS.has(value) ? value : null;
}

function safeResolvedRoute(message) {
  const persisted = routingField(message, 'resolvedRoute');
  if (typeof persisted === 'string' && ASSISTANT_ROUTES.has(persisted)) return persisted;
  return message?.route;
}

function safePolicyVersion(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,47}$/iu.test(value) ? value : null;
}

function reasonDetail(reasonCode, requestedIntent) {
  if (typeof reasonCode !== 'string') return null;
  const normalized = reasonCode.trim().toLocaleLowerCase().replaceAll('-', '_');
  if (normalized === 'explicit_intent' && requestedIntent) {
    return `You selected ${ASSISTANT_MODES[requestedIntent].label} for this message.`;
  }
  if (normalized === 'explicit_assistant') return 'You selected Assistant for this message.';
  if (normalized === 'explicit_research') return 'You selected Research for this message.';
  if (normalized === 'explicit_goal') return 'You selected Agent for this message.';
  return ROUTE_REASON_DETAILS[normalized] || null;
}

/**
 * Present routing provenance without guessing how legacy turns were selected. New records carry
 * the requested intent and resolved route; older records can only truthfully expose the route.
 */
export function assistantRoutingProvenance(message) {
  const requestedIntent = safeRequestedIntent(routingField(message, 'requestedIntent'));
  const resolvedRoute = safeResolvedRoute(message);
  const resolvedIntent = assistantIntentForRoute(resolvedRoute);
  const resolvedMode = ASSISTANT_MODES[resolvedIntent];
  const optimistic = message?.id?.startsWith('optimistic:');
  const reasonCode = routingField(message, 'routeReasonCode', 'reasonCode');
  const policyVersion = safePolicyVersion(
    routingField(message, 'routePolicyVersion', 'policyVersion')
  );

  let label;
  let detail;
  if (requestedIntent === 'auto') {
    label = optimistic ? 'Auto · routing' : `Auto → ${resolvedMode.label}`;
    detail = optimistic
      ? 'Orqanix is choosing an action for this message.'
      : reasonDetail(reasonCode, requestedIntent) ||
        `Auto selected ${resolvedMode.label} for this message.`;
  } else if (requestedIntent) {
    const requestedMode = ASSISTANT_MODES[requestedIntent];
    label =
      requestedIntent === resolvedIntent
        ? `${requestedMode.label} selected`
        : `${requestedMode.label} → ${resolvedMode.label}`;
    detail =
      reasonDetail(reasonCode, requestedIntent) ||
      `You selected ${requestedMode.label} for this message.`;
  } else {
    label = `Route · ${resolvedMode.label}`;
    detail = 'This earlier turn records the route, but not how the mode was selected.';
  }

  if (policyVersion) detail = `${detail} Routing policy: ${policyVersion}.`;
  return { detail, label, policyVersion, reasonCode, requestedIntent, resolvedIntent };
}

export function assistantMessageText(message) {
  return message.parts
    .filter((part) => part.type === 'text' || part.type === 'artifact')
    .map((part) => part.markdown)
    .join('\n\n')
    .trim();
}

export function assistantVerifiableHttpsUrl(value) {
  if (!isCanonicalPublicHttpsUrl(value)) return null;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

export function assistantMessageHasVerifiableSources(message) {
  return assistantMessageEvidence(message).supportedClaimCount > 0;
}

export function assistantMessageStructuredSources(message) {
  if (!Array.isArray(message?.parts)) return [];
  const sources = [];
  const seenUrls = new Set();
  for (const part of message.parts) {
    if (part?.type !== 'source') continue;
    const url = assistantVerifiableHttpsUrl(part.url);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    sources.push({ ...part, url });
  }
  return sources;
}

const SOURCE_TYPE_LABELS = Object.freeze({
  academic: 'Academic',
  documentation: 'Documentation',
  first_party: 'First-party source',
  government: 'Government',
  grounded_web: 'Web source',
  official: 'Official source',
  official_documentation: 'Official documentation',
  primary: 'Primary source',
  regulator: 'Regulator',
  web: 'Web source',
  web_search: 'Web source',
});

function humanizedSourceType(value) {
  const normalized = String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_');
  if (!normalized) return null;
  if (SOURCE_TYPE_LABELS[normalized]) return SOURCE_TYPE_LABELS[normalized];
  const words = normalized.split('_').filter(Boolean);
  if (!words.length) return null;
  const label = words.join(' ');
  return `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`;
}

function uniqueHumanizedSourceTypes(sourceTypes) {
  const labels = (Array.isArray(sourceTypes) ? sourceTypes : [])
    .map(humanizedSourceType)
    .filter(Boolean);
  return [...new Set(labels)];
}

/**
 * Build one evidence view for the whole assistant message. A canonical source URL receives one
 * number for every claim in the message; discovered-but-uncited pages remain visible without being
 * presented as support. A claim is supported only when every supplied citation is safe and maps
 * to the returned structured source catalogue.
 */
export function assistantMessageEvidence(message) {
  if (!Array.isArray(message?.parts)) {
    return {
      claims: [],
      citedSources: [],
      discoveredSources: [],
      sources: [],
      supportedClaimCount: 0,
      uncitedClaimCount: 0,
      unmatchedClaimCount: 0,
    };
  }

  const structuredSources = assistantMessageStructuredSources(message).map((source) => {
    const { sourceTypes, ...sourceFields } = source;
    return {
      ...sourceFields,
      hostname: new URL(source.url).hostname,
      sourceTypeLabels: uniqueHumanizedSourceTypes(sourceTypes),
    };
  });
  const structuredByUrl = new Map(structuredSources.map((source) => [source.url, source]));
  const factParts = message.parts.filter((part) => part?.type === 'fact');
  const citedUrlSet = new Set();

  for (const fact of factParts) {
    for (const value of Array.isArray(fact.sourceUrls) ? fact.sourceUrls : []) {
      const url = assistantVerifiableHttpsUrl(value);
      if (url && structuredByUrl.has(url)) citedUrlSet.add(url);
    }
  }

  const citedSources = structuredSources.filter((source) => citedUrlSet.has(source.url));
  const discoveredSources = structuredSources.filter((source) => !citedUrlSet.has(source.url));
  const sources = [...citedSources, ...discoveredSources].map((source, index) => ({
    ...source,
    number: index + 1,
  }));
  const numberedByUrl = new Map(sources.map((source) => [source.url, source]));

  const claims = factParts.map((fact) => {
    const rawSourceUrls = Array.isArray(fact.sourceUrls) ? fact.sourceUrls : [];
    const citationUrls = [];
    let unsafeCitationCount = 0;
    for (const value of rawSourceUrls) {
      const url = assistantVerifiableHttpsUrl(value);
      if (!url) {
        unsafeCitationCount += 1;
      } else if (!citationUrls.includes(url)) {
        citationUrls.push(url);
      }
    }
    const citationSources = citationUrls.map((url) => numberedByUrl.get(url)).filter(Boolean);
    const unmatchedUrls = citationUrls.filter((url) => !numberedByUrl.has(url));
    const status =
      rawSourceUrls.length === 0
        ? 'uncited'
        : unsafeCitationCount > 0 || unmatchedUrls.length > 0 || citationSources.length === 0
          ? 'unmatched'
          : 'supported';
    return {
      statement: fact.statement,
      status,
      citationSources,
      unmatchedUrls,
      unsafeCitationCount,
    };
  });

  return {
    claims,
    citedSources: sources.slice(0, citedSources.length),
    discoveredSources: sources.slice(citedSources.length),
    sources,
    supportedClaimCount: claims.filter((claim) => claim.status === 'supported').length,
    uncitedClaimCount: claims.filter((claim) => claim.status === 'uncited').length,
    unmatchedClaimCount: claims.filter((claim) => claim.status === 'unmatched').length,
  };
}

function markdownLinkLabel(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

export function assistantArtifactDownloadMarkdown(markdown, sources = []) {
  const uniqueSources = [];
  const seenUrls = new Set();
  for (const source of sources) {
    const url = assistantVerifiableHttpsUrl(source?.url);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    uniqueSources.push({ ...source, url });
  }
  if (!uniqueSources.length) return markdown;
  const sourceList = uniqueSources
    .map((source) => `- [${markdownLinkLabel(source.title)}](<${source.url}>)`)
    .join('\n');
  return `${markdown.trimEnd()}\n\n## Sources\n\n${sourceList}\n`;
}

/**
 * Retry user records repeat the immutable root request for execution identity. The transcript
 * should show that request once and label its assistant responses as attempts in one turn.
 */
export function buildAssistantMessageView(messages) {
  const retryChildByParent = new Map(
    messages
      .filter((message) => message.role === 'user' && message.retryOfTurnId)
      .map((message) => [message.retryOfTurnId, message])
  );
  const retryTurnIds = new Set(
    messages
      .filter((message) => message.role === 'user' && message.retryOfTurnId)
      .map((message) => message.turnId)
  );
  const attempts = new Map();
  const retriedTurns = new Set();

  for (const root of messages.filter(
    (message) => message.role === 'user' && !message.retryOfTurnId
  )) {
    const chain = [root];
    const seen = new Set([root.turnId]);
    let current = root;
    while (retryChildByParent.has(current.turnId)) {
      retriedTurns.add(current.turnId);
      const child = retryChildByParent.get(current.turnId);
      if (seen.has(child.turnId)) break;
      chain.push(child);
      seen.add(child.turnId);
      current = child;
    }
    chain.forEach((attempt, index) => {
      attempts.set(attempt.turnId, {
        rootTurnId: root.turnId,
        attemptNumber: index + 1,
        attemptCount: chain.length,
      });
    });
  }

  return {
    entries: messages
      .filter((message) => !(message.role === 'user' && retryTurnIds.has(message.turnId)))
      .map((message) => ({
        message,
        ...(message.role === 'assistant'
          ? attempts.get(message.turnId) || {
              rootTurnId: message.turnId,
              attemptNumber: 1,
              attemptCount: 1,
            }
          : {}),
      })),
    retriedTurns,
  };
}

export function retryAvailability(part, now = Date.now()) {
  if (part.type !== 'operation_status' || part.status !== 'failed') {
    return { available: false, retryAt: null };
  }
  const retryAt = part.retryAt ? new Date(part.retryAt).getTime() : null;
  return {
    available: part.retryMode === 'new_attempt' && (!Number.isFinite(retryAt) || retryAt <= now),
    retryAt: Number.isFinite(retryAt) ? retryAt : null,
  };
}

export function mergeAssistantActivityEvents(current, incoming, limit = 10_000) {
  const byIdentity = new Map();
  for (const event of [...current, ...incoming]) {
    if (!event || typeof event.turnId !== 'string') continue;
    const identity =
      typeof event.id === 'string'
        ? `id:${event.id}`
        : Number.isInteger(event.sequence)
          ? `sequence:${event.sequence}`
          : null;
    if (!identity) continue;
    byIdentity.set(identity, event);
  }
  return [...byIdentity.values()]
    .sort((left, right) => {
      const sequence = (left.sequence || 0) - (right.sequence || 0);
      if (sequence) return sequence;
      return String(left.id || '').localeCompare(String(right.id || ''));
    })
    .slice(-limit);
}

function safeUpstreamType(event) {
  if (event.type !== 'progress') return null;
  const value = event.payload?.eventType;
  return typeof value === 'string' && SAFE_UPSTREAM_TYPES.has(value) ? value : null;
}

function completedStep(route, hasResearchEvidence) {
  if (route === 'AXWISE_ONE_SHOT') {
    if (hasResearchEvidence === false) {
      return {
        key: 'completed',
        label: 'Research saved without verifiable sources',
        detail:
          'The response was saved, but no verifiable source URL is linked to a returned fact.',
      };
    }
    if (hasResearchEvidence === true) {
      return {
        key: 'completed',
        label: 'Research completed with sources',
        detail: 'The sourced response was saved to this conversation.',
      };
    }
    return {
      key: 'completed',
      label: 'Research completed',
      detail: 'The operation completed; source availability is not yet known.',
    };
  }
  if (route === 'DIRECT_ANSWER' || route === 'DISCOVER') {
    return {
      key: 'completed',
      label: 'Response completed',
      detail: 'The response was saved to this conversation.',
    };
  }
  if (route === 'PROPOSE_GOAL') {
    return {
      key: 'completed',
      label: 'Goal proposal ready',
      detail: 'Review the proposal before starting tracked work.',
    };
  }
  if (route === 'START_GOAL') {
    return {
      key: 'completed',
      label: 'Goal created',
      detail: 'The new tracked Goal is now available in this conversation.',
    };
  }
  if (route === 'CONTINUE_GOAL') {
    return {
      key: 'completed',
      label: 'Goal continued',
      detail: 'Orqanix linked the existing tracked Goal.',
    };
  }
  return {
    key: 'completed',
    label: 'Completed',
    detail: 'The response was saved to this conversation.',
  };
}

function activityStep(event, route, hasResearchEvidence) {
  const mode = assistantModeForRoute(route);
  const intent = assistantIntentForRoute(route);
  const axwiseBacked = AXWISE_ROUTES.has(route);
  const upstream = safeUpstreamType(event);
  if (event.type === 'routed') {
    return {
      key: 'routed',
      label: `Routed to ${mode.label}`,
      detail: mode.description,
    };
  }
  if (event.type === 'retry_created') {
    return { key: 'retry', label: 'New attempt created', detail: 'Using the original request.' };
  }
  if (event.type === 'submitted') {
    if (!axwiseBacked) {
      return {
        key: 'submitted',
        label: 'Goal creation started',
        detail: 'Orqanix started creating the tracked Goal.',
      };
    }
    return {
      key: 'submitted',
      label: 'Request sent to the reasoning service',
      detail: 'Orqanix began sending your request to the cloud reasoning service.',
    };
  }
  if (event.type === 'running' || upstream === 'running') {
    if (!axwiseBacked) {
      return {
        key: 'running',
        label: 'Preparing the Goal',
        detail: mode.pendingDescription,
      };
    }
    return {
      key: 'running',
      label:
        upstream === 'running'
          ? intent === 'research'
            ? 'Grounded research running'
            : 'Response running'
          : 'Reasoning request in progress',
      detail:
        upstream === 'running' ? mode.pendingDescription : 'The reasoning service is processing your request.',
    };
  }
  if (upstream === 'accepted' && axwiseBacked) {
    return {
      key: 'accepted',
      label: 'The reasoning service accepted your request',
      detail: 'Waiting for execution.',
    };
  }
  if (upstream === 'heartbeat' && axwiseBacked) {
    return {
      key: 'heartbeat',
      label: 'The reasoning service is still working',
      detail: 'The worker lease is healthy.',
    };
  }
  if (event.type === 'tool_started') {
    return {
      key: 'tool_started',
      label: 'A tool started',
      detail: 'Tool details are kept private.',
    };
  }
  if (event.type === 'tool_completed') {
    return {
      key: 'tool_completed',
      label: 'A tool finished',
      detail: 'Tool details are kept private.',
    };
  }
  // Approval/input lifecycle events are reserved by the shared contract, but this chat does
  // not yet have typed response actions for them. Do not expose a dead-end waiting state until
  // the matching pause/resume UI and server command are implemented.
  if (event.type === 'approval_requested' || event.type === 'input_requested') return null;
  if (event.type === 'cancel_requested' || upstream === 'cancel_requested') {
    return {
      key: 'cancel_requested',
      label: 'Stop requested',
      detail: 'Finishing cancellation safely.',
    };
  }
  if (event.type === 'completed') {
    return completedStep(route, hasResearchEvidence);
  }
  if (event.type === 'failed') {
    return { key: 'failed', label: 'Attempt failed', detail: 'The request did not complete.' };
  }
  if (event.type === 'cancelled') {
    return {
      key: 'cancelled',
      label: 'Turn stopped',
      detail: 'No further work will run for this attempt.',
    };
  }
  return null;
}

function fallbackSteps(route, status, hasResearchEvidence) {
  const mode = assistantModeForRoute(route);
  const steps = [{ key: 'routed', label: `Routed to ${mode.label}`, detail: mode.description }];
  const axwiseBacked = AXWISE_ROUTES.has(route);
  if (axwiseBacked && (ACTIVE_ACTIVITY_TYPES.has(status) || TERMINAL_ACTIVITY_TYPES.has(status))) {
    steps.push({
      key: 'submitted',
      label: 'Request sent to the reasoning service',
      detail: 'Orqanix began sending your request to the cloud reasoning service.',
    });
  }
  if (axwiseBacked && status === 'accepted') {
    steps.push({
      key: 'accepted',
      label: 'The reasoning service accepted your request',
      detail: 'Waiting for execution.',
    });
  }
  if (axwiseBacked && ['running', 'cancel_requested'].includes(status)) {
    steps.push({
      key: 'running',
      label: 'Reasoning request in progress',
      detail: 'Waiting for the reasoning service to finish.',
    });
  }
  if (status === 'cancel_requested') {
    steps.push({
      key: 'cancel_requested',
      label: 'Stop requested',
      detail: 'Finishing cancellation safely.',
    });
  }
  if (status === 'completed') {
    steps.push(completedStep(route, hasResearchEvidence));
  }
  if (status === 'failed') {
    steps.push({ key: 'failed', label: 'Attempt failed', detail: 'The request did not complete.' });
  }
  if (status === 'cancelled') {
    steps.push({
      key: 'cancelled',
      label: 'Turn stopped',
      detail: 'No further work will run for this attempt.',
    });
  }
  return steps;
}

export function buildAssistantActivityView({
  events = [],
  route,
  status,
  hasResearchEvidence = null,
}) {
  const mode = assistantModeForRoute(route);
  const intent = assistantIntentForRoute(route);
  const byStep = new Map(
    fallbackSteps(route, status, hasResearchEvidence).map((step) => [step.key, step])
  );
  for (const event of events) {
    const step = activityStep(event, route, hasResearchEvidence);
    if (step) byStep.set(step.key, step);
  }
  const steps = [...byStep.values()].sort(
    (left, right) =>
      (ACTIVITY_STEP_ORDER.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
      (ACTIVITY_STEP_ORDER.get(right.key) ?? Number.MAX_SAFE_INTEGER)
  );
  const terminal = TERMINAL_ACTIVITY_TYPES.has(status);
  const active = ACTIVE_ACTIVITY_TYPES.has(status);
  const normalizedSteps = steps.map((step, index) => ({
    ...step,
    state:
      active && index === steps.length - 1
        ? 'active'
        : step.key === 'failed'
          ? 'failed'
          : step.key === 'cancelled'
            ? 'cancelled'
            : 'completed',
  }));
  let headline;
  if (status === 'failed') headline = `${mode.label} attempt failed`;
  else if (status === 'cancelled')
    headline = intent === 'research' ? 'Research stopped' : 'Response stopped';
  else if (status === 'cancel_requested') headline = 'Stopping…';
  else if (status === 'completed') headline = completedStep(route, hasResearchEvidence).label;
  else if (status === 'accepted') headline = `${mode.label} queued`;
  else if (intent === 'research') headline = 'Researching your request';
  else headline = 'Assistant is responding';

  return {
    active,
    evidenceGap:
      route === 'AXWISE_ONE_SHOT' && status === 'completed' && hasResearchEvidence === false,
    headline,
    mode,
    steps: normalizedSteps,
    terminal,
  };
}
