import {
  MEMORY_CLASSIFICATIONS,
  MemoryRoutingInputV1Schema,
  MemoryRoutingRequestV1Schema,
  MemoryRoutingResultV1Schema,
  TrustedMemoryRetrievalScopeV1Schema,
} from '../domain/memory-contracts.js';

const classificationRank = new Map(
  MEMORY_CLASSIFICATIONS.map((classification, index) => [classification, index])
);

function sameTenant(left, right) {
  return (
    left.organizationId === right.organizationId &&
    left.workspaceId === right.workspaceId &&
    left.principalId === right.principalId
  );
}

function hasExactScopeBinding(namespace, trustedScope) {
  switch (namespace.scopeKind) {
    case 'workspace':
    case 'user':
      return true;
    case 'project':
      return namespace.projectReference === trustedScope.projectReference;
    case 'conversation':
      return namespace.conversationReference === trustedScope.conversationReference;
    case 'task':
      return (
        namespace.projectReference === trustedScope.projectReference &&
        namespace.conversationReference === trustedScope.conversationReference &&
        namespace.taskReference === trustedScope.taskReference
      );
    case 'agent':
      return namespace.agentId === trustedScope.agentId;
    default:
      return false;
  }
}

function intersects(left, right) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function matchedTopics(candidate, namespace, request) {
  const taskTopics = new Set(request.topics);
  const namespaceTopics = new Set(namespace.allowedTopics);
  return candidate.topics
    .filter((topic) => taskTopics.has(topic) && namespaceTopics.has(topic))
    .sort();
}

function isExpired(expiresAt, asOfEpoch) {
  return expiresAt !== null && Date.parse(expiresAt) <= asOfEpoch;
}

function assertRequestWithinTrustedSemantics(request, trustedScope) {
  const allowedTopics = new Set(trustedScope.allowedTopics);
  if (
    !trustedScope.allowedDomains.includes(request.domain) ||
    request.topics.some((topic) => !allowedTopics.has(topic))
  ) {
    throw new Error('memory_routing_request_outside_trusted_semantics');
  }
}

function namespaceExclusionReason(namespace, request, trustedScope, asOfEpoch) {
  if (!sameTenant(namespace, trustedScope)) return 'tenant_scope_mismatch';
  if (!hasExactScopeBinding(namespace, trustedScope)) return 'namespace_scope_mismatch';
  if (namespace.status !== 'active') return 'namespace_inactive';
  if (isExpired(namespace.expiresAt, asOfEpoch)) return 'namespace_expired';
  if (!namespace.allowedDomains.includes(request.domain)) return 'namespace_domain_mismatch';
  if (!intersects(namespace.allowedTopics, request.topics)) return 'namespace_topic_mismatch';
  if (!namespace.allowedPurposes.includes(trustedScope.purpose)) {
    return 'namespace_purpose_mismatch';
  }
  return null;
}

function candidateExclusionReason(
  candidate,
  namespace,
  namespaceDenialReason,
  request,
  trustedScope,
  asOfEpoch
) {
  if (!sameTenant(candidate, trustedScope)) return 'tenant_scope_mismatch';
  if (!namespace) return 'namespace_unknown';
  if (namespaceDenialReason) return namespaceDenialReason;
  if (candidate.status !== 'active') return 'memory_inactive';
  if (Date.parse(candidate.recordedAt) > asOfEpoch) return 'memory_not_yet_valid';
  if (isExpired(candidate.expiresAt, asOfEpoch)) return 'memory_expired';
  if (candidate.domain !== request.domain) return 'memory_domain_mismatch';
  if (matchedTopics(candidate, namespace, request).length === 0) {
    return 'memory_topic_mismatch';
  }
  if (!candidate.purposes.includes(trustedScope.purpose)) return 'memory_purpose_mismatch';
  const permittedRank = Math.min(
    classificationRank.get(trustedScope.maximumClassification),
    classificationRank.get(namespace.maximumClassification)
  );
  if (classificationRank.get(candidate.classification) > permittedRank) {
    return 'classification_not_permitted';
  }
  return null;
}

function resolveParsedNamespaces(trustedScope, request, namespaces) {
  const asOfEpoch = Date.parse(trustedScope.asOf);
  const accessibleNamespaces = [];
  const denialReasonByNamespaceId = new Map();

  for (const namespace of namespaces) {
    const reason = namespaceExclusionReason(namespace, request, trustedScope, asOfEpoch);
    if (reason) {
      denialReasonByNamespaceId.set(namespace.namespaceId, reason);
    } else {
      accessibleNamespaces.push(namespace);
    }
  }

  return { accessibleNamespaces, denialReasonByNamespaceId };
}

// The trusted scope argument is an explicit trust boundary. Callers must derive it
// from authenticated principal and persisted run/Agent records, never request JSON.
export function resolveAccessibleMemoryNamespaces(trustedScope, request, namespaces) {
  const parsedScope = TrustedMemoryRetrievalScopeV1Schema.parse(trustedScope);
  const parsedRequest = MemoryRoutingRequestV1Schema.parse(request);
  assertRequestWithinTrustedSemantics(parsedRequest, parsedScope);
  const parsedInput = MemoryRoutingInputV1Schema.parse({
    request: parsedRequest,
    namespaces,
    candidates: [],
  });
  return resolveParsedNamespaces(parsedScope, parsedRequest, parsedInput.namespaces)
    .accessibleNamespaces;
}

export function routeMemory(input, trustedScope) {
  const parsedScope = TrustedMemoryRetrievalScopeV1Schema.parse(trustedScope);
  const parsed = MemoryRoutingInputV1Schema.parse(input);
  const { request } = parsed;
  assertRequestWithinTrustedSemantics(request, parsedScope);
  const namespaceById = new Map(
    parsed.namespaces.map((namespace) => [namespace.namespaceId, namespace])
  );
  const { accessibleNamespaces, denialReasonByNamespaceId } = resolveParsedNamespaces(
    parsedScope,
    request,
    parsed.namespaces
  );
  const asOfEpoch = Date.parse(parsedScope.asOf);
  const matches = [];
  const excluded = [];

  for (const candidate of parsed.candidates) {
    const namespace = namespaceById.get(candidate.namespaceId);
    const reason = candidateExclusionReason(
      candidate,
      namespace,
      denialReasonByNamespaceId.get(candidate.namespaceId),
      request,
      parsedScope,
      asOfEpoch
    );
    if (reason) {
      excluded.push({ memoryItemId: candidate.memoryItemId, reason });
      continue;
    }
    matches.push({
      candidate,
      matchedTopics: matchedTopics(candidate, namespace, request),
      namespaceScopeKind: namespace.scopeKind,
    });
  }

  matches.sort((left, right) => {
    const topicDifference = right.matchedTopics.length - left.matchedTopics.length;
    if (topicDifference) return topicDifference;
    const recordedDifference =
      Date.parse(right.candidate.recordedAt) - Date.parse(left.candidate.recordedAt);
    if (recordedDifference) return recordedDifference;
    return left.candidate.memoryItemId.localeCompare(right.candidate.memoryItemId);
  });

  const selectedMatches = matches.slice(0, request.maximumItems);
  for (const overflow of matches.slice(request.maximumItems)) {
    excluded.push({ memoryItemId: overflow.candidate.memoryItemId, reason: 'result_limit' });
  }
  excluded.sort((left, right) => left.memoryItemId.localeCompare(right.memoryItemId));

  const selected = selectedMatches.map(
    ({ candidate, matchedTopics: topics, namespaceScopeKind }) => ({
      memoryItemId: candidate.memoryItemId,
      namespaceId: candidate.namespaceId,
      namespaceScopeKind,
      contentReference: candidate.contentReference,
      classification: candidate.classification,
      matchedTopics: topics,
    })
  );

  return MemoryRoutingResultV1Schema.parse({
    version: 'orqaly_memory_routing_result_v1',
    projectReference: parsedScope.projectReference,
    conversationReference: parsedScope.conversationReference,
    taskReference: parsedScope.taskReference,
    agentId: parsedScope.agentId,
    selected,
    excluded,
    zeroMemoryReason:
      selected.length > 0
        ? null
        : accessibleNamespaces.length === 0
          ? 'no_accessible_namespaces'
          : 'no_matching_memory',
  });
}
