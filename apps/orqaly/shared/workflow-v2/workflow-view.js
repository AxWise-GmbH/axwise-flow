// Read-only presentation adapters for already-authorized, JSON-shaped public DTOs. These
// projections do not authorize commands, verify business value, create durable
// work, or replace the state/hashes owned by their source ledgers.
const VERSION = 'orqaly.workflow-view.v1';
const SHA256 = /^[a-f0-9]{64}$/;
const STATUS_LABELS = {
  requested: 'Requested',
  accepted: 'Accepted',
  submitted: 'Submitted',
  queued: 'Queued',
  running: 'In progress',
  polling: 'In progress',
  cancel_requested: 'Cancellation requested',
  awaiting_gate_1: 'Scope approval pending',
  awaiting_gate_2: 'Plan approval pending',
  awaiting_capability_input: 'Capability input needed',
  awaiting_approval: 'Approval pending',
  preparing: 'Preparing',
  needs_input: 'Input needed',
  input_requested: 'Input requested',
  approval_requested: 'Approval requested',
  draft: 'Draft recorded',
  reviewed: 'Review recorded',
  completed: 'Completed',
  completed_with_evidence_gaps: 'Completed with evidence gaps',
  unsupported: 'Unsupported',
  blocked: 'Blocked',
  failed: 'Failed',
  cancelled: 'Cancelled',
  deploying: 'Deploying',
  deployment_unknown: 'Deployment needs verification',
  ready: 'Ready to test',
  active: 'Recorded active',
  paused: 'Recorded paused',
  outcome_unknown: 'Execution outcome unknown',
  succeeded: 'Execution recorded as succeeded',
};

function requireValue(condition, code) {
  if (!condition) throw new TypeError(`workflow_view_${code}`);
}

function identifier(value) {
  requireValue(typeof value === 'string' && value.length > 0, 'identity_required');
  return value;
}

function text(value) {
  return typeof value === 'string' ? value : null;
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function copy(value, parents = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  requireValue(value && typeof value === 'object' && !parents.has(value), 'json_value_required');
  requireValue(
    Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)),
    'plain_json_required'
  );
  parents.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => copy(item, parents))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item, parents)]));
  parents.delete(value);
  return result;
}

function scopeOf(value) {
  return {
    tenantId: identifier(value?.tenantId),
    ownerUserId: identifier(value?.ownerUserId),
  };
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const key = (kind, ...ids) =>
  [kind, ...ids.map((id) => encodeURIComponent(identifier(id)))].join(':');
const status = (domain, raw, basis = 'ledger') => {
  const recorded = text(raw);
  return {
    domain,
    raw: recorded,
    label:
      recorded && Object.hasOwn(STATUS_LABELS, recorded)
        ? STATUS_LABELS[recorded]
        : 'Status unknown',
    basis,
  };
};

function view(source, scope, title, rawStatus, domain) {
  return {
    schemaVersion: VERSION,
    id: key(source.kind, ...(source.threadId ? [source.threadId] : []), source.id),
    source,
    scope: scopeOf(scope),
    title: text(title),
    objective: null,
    status: status(domain, rawStatus),
    evidenceReadiness: null,
    rowVersion: null,
    createdAt: null,
    updatedAt: null,
    inputs: null,
    outputs: [],
    steps: [],
    attempts: [],
    links: { goalRunId: null, buildRequestId: null, solutionId: null },
    children: [],
    issues: [],
  };
}

function canonicalReference(reference, runId) {
  requireValue(
    reference && typeof reference.artifactHash === 'string' && SHA256.test(reference.artifactHash),
    'artifact_hash_required'
  );
  return {
    family: 'canonical_artifact',
    runId: identifier(runId),
    artifactId: identifier(reference.artifactId),
    artifactHash: reference.artifactHash,
    kind: identifier(reference.kind),
  };
}

function canonicalOutputs(snapshot, records) {
  const references = new Map();
  for (const reference of [
    snapshot.run.finalArtifact,
    ...snapshot.stages.map((stage) => stage.outputArtifact),
  ].filter(Boolean)) {
    const normalized = canonicalReference(reference, snapshot.run.id);
    const previous = references.get(normalized.artifactId);
    requireValue(!previous || same(previous, normalized), 'conflicting_artifact_reference');
    references.set(normalized.artifactId, normalized);
  }
  const byId = new Map();
  for (const record of records) {
    const reference = references.get(record.artifactId);
    requireValue(
      reference &&
        record.artifactHash === reference.artifactHash &&
        record.kind === reference.kind &&
        (!record.runId || record.runId === snapshot.run.id),
      'artifact_record_mismatch'
    );
    requireValue(!byId.has(record.artifactId), 'duplicate_artifact_record');
    byId.set(record.artifactId, record);
  }
  return [...references.values()].map((reference) => {
    const record = byId.get(reference.artifactId);
    return {
      reference,
      // final_markdown does not imply PRD; missing content classification stays unknown.
      artifactType: null,
      contentType: text(record?.contentType),
      sourceArtifactIds: record ? copy(record.sourceArtifactIds ?? null) : null,
      inputHash: text(record?.inputHash),
    };
  });
}

/** Project a PublicWorkflowSnapshot, without changing its operational contract. */
export function projectGoalWork(snapshot, { artifactRecords = [] } = {}) {
  requireValue(snapshot?.run && Array.isArray(snapshot.stages), 'goal_snapshot_required');
  const run = snapshot.run;
  const stageIds = new Set(snapshot.stages.map((stage) => identifier(stage.id)));
  requireValue(stageIds.size === snapshot.stages.length, 'duplicate_stage_identity');
  const attempts = snapshot.attempts || [];
  requireValue(
    new Set(attempts.map((attempt) => identifier(attempt.id))).size === attempts.length,
    'duplicate_attempt_identity'
  );
  for (const attempt of attempts)
    requireValue(stageIds.has(attempt.stageId), 'attempt_stage_mismatch');
  const result = view(
    { kind: 'goal_run', id: identifier(run.id) },
    run,
    run.request,
    run.status,
    'goal_run'
  );
  result.objective = text(run.request);
  result.evidenceReadiness = text(run.evidenceReadiness);
  result.rowVersion = number(run.rowVersion);
  result.createdAt = text(run.createdAt);
  result.updatedAt = text(run.updatedAt);
  result.requestHash = text(run.requestHash);
  result.outputs = canonicalOutputs(snapshot, artifactRecords);
  result.steps = snapshot.stages.map((stage) => ({
    id: identifier(stage.id),
    kind: text(stage.kind),
    stageKey: text(stage.stageKey),
    ordinal: number(stage.ordinal),
    rowVersion: number(stage.rowVersion),
    status: status('goal_stage', stage.status),
    inputHash: text(stage.inputHash),
    output: stage.outputArtifact ? canonicalReference(stage.outputArtifact, run.id) : null,
  }));
  result.attempts = (snapshot.attempts || []).map((attempt) => ({
    id: identifier(attempt.id),
    stageId: identifier(attempt.stageId),
    attemptNumber: number(attempt.attemptNumber),
    operationId: text(attempt.operationId),
    inputHash: text(attempt.inputHash),
    rowVersion: number(attempt.rowVersion),
    status: status('goal_attempt', attempt.status),
  }));
  result.dependencies = copy(snapshot.dependencies || []);
  result.approvals = copy(snapshot.approvals || []);
  return result;
}

function researchOutcome(user, responses, events, threadId) {
  requireValue(responses.length <= 1, 'ambiguous_assistant_response');
  const response = responses[0];
  if (response) {
    requireValue(
      response.route === user.route && response.axwiseOperationId === user.axwiseOperationId,
      'assistant_response_identity_mismatch'
    );
  }
  const parts = response?.parts || [];
  const artifacts = parts.flatMap((part, partIndex) =>
    part.type === 'artifact'
      ? [
          {
            reference: {
              family: 'assistant_message_part',
              threadId,
              turnId: user.turnId,
              messageId: identifier(response.id),
              partIndex,
            },
            artifactType: 'research',
            title: text(part.title),
            contentType: text(part.contentType),
            operationId: text(response.axwiseOperationId),
            model: text(response.model),
            modelVersion: text(response.modelVersion),
          },
        ]
      : []
  );
  const operationStatuses = parts.filter((part) => part.type === 'operation_status');
  requireValue(operationStatuses.length <= 1, 'ambiguous_assistant_status');
  const operation = operationStatuses[0];
  // send/resume pendingMessage is transient; its persisted:false flag is on the
  // outer response, not on the message. Owned thread reads contain only terminal
  // assistant outcomes. This shape check is not an independent persistence proof.
  requireValue(
    !operation || ['failed', 'cancelled'].includes(operation.status),
    'persisted_terminal_message_required'
  );
  requireValue(
    !operation || operation.operationId === user.axwiseOperationId,
    'operation_identity_mismatch'
  );
  requireValue(!artifacts.length || !operation, 'ambiguous_assistant_outcome');
  const terminal = artifacts.length
    ? 'completed'
    : ['failed', 'cancelled'].includes(operation?.status)
      ? operation.status
      : null;
  const orderedEvents = events
    .filter((event) => event.turnId === user.turnId)
    .map((event) => {
      requireValue(
        event.threadId === threadId &&
          event.operationId === user.axwiseOperationId &&
          event.route === user.route,
        'event_identity_mismatch'
      );
      requireValue(
        Number.isSafeInteger(event.sequence) && event.sequence > 0,
        'event_sequence_required'
      );
      return event;
    })
    .sort((left, right) => left.sequence - right.sequence);
  requireValue(
    new Set(orderedEvents.map((event) => event.sequence)).size === orderedEvents.length,
    'ambiguous_event_sequence'
  );
  const lifecycle = orderedEvents.filter((event) =>
    [
      'submitted',
      'running',
      'input_requested',
      'approval_requested',
      'cancel_requested',
      'completed',
      'failed',
      'cancelled',
    ].includes(event.type)
  );
  const terminalEvents = lifecycle.filter((event) =>
    ['completed', 'failed', 'cancelled'].includes(event.type)
  );
  const observedTerminals = new Set(terminalEvents.map((event) => event.type));
  if (terminal) observedTerminals.add(terminal);
  requireValue(observedTerminals.size <= 1, 'conflicting_terminal_status');
  const last = terminalEvents.at(-1) || lifecycle.at(-1);
  const raw = terminal || last?.type || operation?.status || null;
  const projectedStatus = status(
    'assistant_operation',
    raw,
    terminal ? 'message' : last ? 'event' : operation ? 'message' : 'not_recorded'
  );
  if (!terminal && last?.type === 'completed') projectedStatus.label = 'Completion event recorded';
  return {
    status: projectedStatus,
    outputs: artifacts,
    issues:
      last?.type === 'completed' && !terminal ? [{ code: 'terminal_result_not_recorded' }] : [],
  };
}

/** Only persisted AXWISE_ONE_SHOT work is included; ordinary chat stays chat. */
export function projectAssistantWork({ thread, messages = [], events = [] }) {
  const threadId = identifier(thread?.id);
  const scope = scopeOf(thread);
  const users = new Map();
  const responses = new Map();
  const seenMessages = new Set();
  for (const message of messages) {
    requireValue(message.threadId === threadId, 'thread_identity_mismatch');
    requireValue(!seenMessages.has(identifier(message.id)), 'duplicate_message_identity');
    seenMessages.add(message.id);
    if (message.route !== 'AXWISE_ONE_SHOT') continue;
    requireValue(message.persisted !== false, 'persisted_messages_required');
    identifier(message.turnId);
    requireValue(['user', 'assistant'].includes(message.role), 'message_role_required');
    if (message.role === 'user') {
      requireValue(!users.has(message.turnId), 'duplicate_turn_identity');
      users.set(message.turnId, message);
    } else if (message.role === 'assistant') {
      responses.set(message.turnId, [...(responses.get(message.turnId) || []), message]);
    }
  }
  for (const turnId of responses.keys())
    requireValue(users.has(turnId), 'assistant_user_not_loaded');
  const children = new Map();
  for (const user of users.values()) {
    const provenance = [
      user.requestedIntent,
      user.resolvedRoute,
      user.routePolicyVersion,
      user.routeReasonCode,
    ];
    const present = provenance.filter((value) => value !== undefined).length;
    requireValue(present === 0 || present === provenance.length, 'incomplete_route_provenance');
    requireValue(!present || user.resolvedRoute === user.route, 'route_provenance_mismatch');
    if (!user.retryOfTurnId) continue;
    requireValue(!children.has(user.retryOfTurnId), 'ambiguous_retry_branch');
    children.set(user.retryOfTurnId, user.turnId);
  }
  const groups = new Map();
  for (const user of users.values()) {
    const visited = new Set([user.turnId]);
    let root = user;
    while (root.retryOfTurnId && users.has(root.retryOfTurnId)) {
      requireValue(!visited.has(root.retryOfTurnId), 'cyclic_retry_lineage');
      visited.add(root.retryOfTurnId);
      root = users.get(root.retryOfTurnId);
    }
    groups.set(root.turnId, root);
  }
  return [...groups.values()]
    .map((root) => {
      const chain = [];
      let current = root;
      while (current) {
        chain.push(current);
        current = users.get(children.get(current.turnId));
      }
      const latest = chain.at(-1);
      const outcome = researchOutcome(latest, responses.get(latest.turnId) || [], events, threadId);
      const objective =
        root.parts
          ?.filter((part) => part.type === 'text')
          .map((part) => part.markdown)
          .join('\n') || null;
      const result = view(
        { kind: 'assistant_turn', threadId, id: root.turnId },
        scope,
        objective,
        null,
        'assistant_operation'
      );
      result.objective = objective;
      result.createdAt = text(root.createdAt);
      // No per-turn updatedAt exists in this DTO. Request creation time is not
      // the last lifecycle update, and optional event pages may be incomplete.
      result.status = outcome.status;
      result.outputs = chain.flatMap(
        (user) => researchOutcome(user, responses.get(user.turnId) || [], events, threadId).outputs
      );
      result.issues = outcome.issues;
      result.lineageComplete = !root.retryOfTurnId;
      if (!result.lineageComplete)
        result.issues.push({ code: 'retry_parent_not_loaded', turnId: root.retryOfTurnId });
      result.routing = {
        route: root.route,
        requestedIntent: text(root.requestedIntent),
        resolvedRoute: text(root.resolvedRoute),
        routePolicyVersion: text(root.routePolicyVersion),
        routeReasonCode: text(root.routeReasonCode),
      };
      result.attempts = chain.map((user) => ({
        turnId: user.turnId,
        createdAt: text(user.createdAt),
        retryOfTurnId: text(user.retryOfTurnId),
        operationId: text(user.axwiseOperationId),
        status: researchOutcome(user, responses.get(user.turnId) || [], events, threadId).status,
      }));
      return result;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function automationOutput(value, solutionId, kind) {
  if (!value.workflowHash) return null;
  requireValue(
    typeof value.workflowHash === 'string' && SHA256.test(value.workflowHash),
    'workflow_hash_required'
  );
  if (value.bundleHash != null)
    requireValue(
      typeof value.bundleHash === 'string' && SHA256.test(value.bundleHash),
      'bundle_hash_required'
    );
  return {
    artifactType: 'automation',
    reference: {
      family: 'automation',
      kind: kind === 'solution_version' && value.revisionId ? 'solution_revision' : kind,
      solutionId: text(solutionId),
      buildRequestId: kind === 'build_draft' ? identifier(value.id) : null,
      revisionId: kind === 'solution_revision' ? identifier(value.id) : text(value.revisionId),
      version: number(value.version),
      inputVersion: number(value.inputVersion),
      rowVersion: kind === 'build_draft' ? number(value.rowVersion) : null,
      workflowHash: value.workflowHash,
      bundleHash: text(value.bundleHash),
    },
    title: text(value.name),
    status: status(kind === 'build_draft' ? 'solution_build' : 'automation_runtime', value.status),
  };
}

/** Pass one existing ledger DTO at a time; scope is caller read context, not authorization. */
export function projectSolutionWork({
  scope,
  build = null,
  solution = null,
  revisions = [],
  invocations = [],
}) {
  requireValue(Boolean(build) !== Boolean(solution), 'one_solution_backing_required');
  const value = build || solution;
  const kind = build ? 'solution_build' : 'solution';
  const result = view(
    { kind, id: identifier(value.id) },
    scope,
    value.name,
    value.status,
    build ? 'solution_build' : 'automation_runtime'
  );
  for (const field of ['tenantId', 'ownerUserId']) {
    requireValue(value[field] == null || value[field] === result.scope[field], 'scope_mismatch');
  }
  result.objective = text(build ? value.instruction : value.purpose);
  result.rowVersion = number(value.rowVersion);
  result.createdAt = text(value.createdAt);
  result.updatedAt = text(value.updatedAt);
  result.links = {
    goalRunId: build ? text(value.runId) : null,
    buildRequestId: build ? value.id : text(value.buildRequestId),
    solutionId: solution ? value.id : text(value.solutionId),
  };
  if (build) {
    requireValue(!value.source?.runId || value.source.runId === value.runId, 'source_run_mismatch');
    result.inputs = Array.isArray(value.source?.artifacts)
      ? value.source.artifacts.map((reference) => canonicalReference(reference, value.runId))
      : null;
    result.sourceContext = {
      authority: text(value.source?.authority),
      taskHash: text(value.source?.taskHash),
      contextHash: text(value.source?.contextHash),
      threadId: text(value.source?.threadId),
      turnId: text(value.source?.turnId),
    };
    result.operation = value.operation ? copy(value.operation) : null;
    requireValue(!revisions.length && !invocations.length, 'solution_details_require_solution');
  } else {
    result.runtime = {
      runtimeActive: typeof value.runtimeActive === 'boolean' ? value.runtimeActive : null,
      deploymentRecorded: value.deployment != null,
      lastError: text(value.lastError),
    };
  }
  const output = automationOutput(
    value,
    result.links.solutionId,
    build ? 'build_draft' : 'solution_version'
  );
  if (output) result.outputs.push(output);
  for (const revision of revisions) {
    requireValue(revision.solutionId === value.id, 'revision_solution_mismatch');
    const artifact = automationOutput(revision, value.id, 'solution_revision');
    if (artifact) {
      const previous = result.outputs.find((item) => item.reference.revisionId === revision.id);
      requireValue(
        !previous || same(previous.reference, artifact.reference),
        'conflicting_revision_reference'
      );
      if (!previous) result.outputs.push(artifact);
    }
  }
  result.receipts = invocations.map((invocation) => {
    requireValue(
      invocation.solutionId == null || invocation.solutionId === value.id,
      'invocation_solution_mismatch'
    );
    for (const field of ['tenantId', 'ownerUserId']) {
      requireValue(
        invocation[field] == null || invocation[field] === result.scope[field],
        'invocation_scope_mismatch'
      );
    }
    const revisionId = invocation.revisionId == null ? null : identifier(invocation.revisionId);
    const expected = revisionId
      ? revisions.find((revision) => revision.id === revisionId) ||
        (value.revisionId === revisionId ? value : null)
      : value.revisionId == null
        ? value
        : null;
    const workflowHash =
      invocation.workflowHash == null ? null : identifier(invocation.workflowHash);
    if (workflowHash !== null) requireValue(SHA256.test(workflowHash), 'invocation_hash_required');
    const expectedHash = text(expected?.workflowHash);
    if (expectedHash && workflowHash !== null)
      requireValue(expectedHash === workflowHash, 'invocation_revision_hash_mismatch');
    return {
      id: identifier(invocation.id),
      // The public DTO omits solutionId. Context is the caller's per-Solution
      // authorized read, not a claim of an independently bound receipt field.
      solutionId: value.id,
      solutionBinding: invocation.solutionId == null ? 'caller_read_context' : 'supplied_identity',
      revisionId,
      workflowHash,
      revisionContext:
        expectedHash && workflowHash !== null
          ? 'matched_loaded_reference'
          : expected
            ? 'hash_not_recorded'
            : 'not_loaded',
      executionId: text(invocation.executionId),
      mode: text(invocation.mode),
      status: status('automation_execution', invocation.status),
      createdAt: text(invocation.createdAt),
      completedAt: text(invocation.completedAt),
    };
  });
  return result;
}

/** Join only explicit existing FK links; child statuses never replace parent status. */
export function mergeLinkedWorkflows(views) {
  const entries = new Map();
  let scope = null;
  for (const candidate of views) {
    requireValue(candidate?.schemaVersion === VERSION, 'projection_version_required');
    const item = copy(candidate);
    requireValue(
      ['goal_run', 'assistant_turn', 'solution_build', 'solution'].includes(item.source?.kind),
      'source_kind_required'
    );
    requireValue(
      item.id ===
        key(
          item.source.kind,
          ...(item.source.threadId ? [item.source.threadId] : []),
          item.source.id
        ),
      'projection_identity_mismatch'
    );
    requireValue(item.children.length === 0, 'flat_projections_required');
    if (!scope) scope = scopeOf(item.scope);
    requireValue(same(scope, scopeOf(item.scope)), 'mixed_scope');
    const previous = entries.get(item.id);
    requireValue(!previous || same(previous, item), 'ambiguous_duplicate_projection');
    entries.set(item.id, item);
  }
  const goals = new Map(
    [...entries.values()]
      .filter((item) => item.source.kind === 'goal_run')
      .map((item) => [item.source.id, item])
  );
  const builds = new Map(
    [...entries.values()]
      .filter((item) => item.source.kind === 'solution_build')
      .map((item) => [item.source.id, item])
  );
  const attached = new Set();
  for (const item of entries.values()) {
    if (item.source.kind !== 'solution' || !item.links.buildRequestId) continue;
    const parent = builds.get(item.links.buildRequestId);
    if (!parent) {
      item.issues.push({ code: 'build_parent_not_loaded', id: item.links.buildRequestId });
      continue;
    }
    requireValue(
      !parent.links.solutionId || parent.links.solutionId === item.source.id,
      'conflicting_solution_link'
    );
    requireValue(!parent.children.length, 'ambiguous_solution_link');
    parent.children.push(item);
    attached.add(item.id);
  }
  for (const item of builds.values()) {
    if (!item.links.goalRunId) continue;
    const parent = goals.get(item.links.goalRunId);
    if (!parent) {
      item.issues.push({ code: 'goal_parent_not_loaded', id: item.links.goalRunId });
      continue;
    }
    parent.children.push(item);
    attached.add(item.id);
  }
  return [...entries.values()]
    .filter((item) => !attached.has(item.id))
    .map((item) => {
      item.children.sort((left, right) => left.id.localeCompare(right.id));
      return item;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
