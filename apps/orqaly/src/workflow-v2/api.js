import {
  AssistantTurnEventBatchSchema,
  AssistantTurnEventSchema,
} from './assistant-event-validation.js';
import { GoalWorkflowViewResponseSchema } from '../../shared/workflow-v2/goal-workflow-view-contract.js';

const API_BASE = (import.meta.env.VITE_ORQALY_API_URL || '').replace(/\/$/, '');

export class WorkflowApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'WorkflowApiError';
    this.status = status;
    this.code = code;
  }
}

export function createWorkflowV2Client(getToken, baseUrl = API_BASE) {
  if (!baseUrl) throw new Error('VITE_ORQALY_API_URL is required');
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  async function request(path, init = {}, { includeMarkdownMetadata = false } = {}) {
    const token = await getToken();
    if (!token) throw new WorkflowApiError(401, 'UNAUTHENTICATED', 'sign-in required');
    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new WorkflowApiError(
        response.status,
        body.error?.code || 'REQUEST_FAILED',
        body.error?.message || 'request failed'
      );
    }
    if (response.headers.get('content-type')?.includes('text/markdown')) {
      const markdown = await response.text();
      return includeMarkdownMetadata ? { markdown, etag: response.headers.get('etag') } : markdown;
    }
    return response.json();
  }

  async function streamAssistantEvents(threadId, { after = 0, limit = 100, signal, onEvent } = {}) {
    const token = await getToken();
    if (!token) throw new WorkflowApiError(401, 'UNAUTHENTICATED', 'sign-in required');
    const params = new URLSearchParams({ after: String(after), limit: String(limit) });
    const response = await fetch(
      `${normalizedBaseUrl}/v2/assistant/threads/${threadId}/events?${params}`,
      {
        method: 'GET',
        headers: { accept: 'text/event-stream', authorization: `Bearer ${token}` },
        signal,
      }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new WorkflowApiError(
        response.status,
        body.error?.code || 'REQUEST_FAILED',
        body.error?.message || 'request failed'
      );
    }
    if (!response.body?.getReader) {
      throw new WorkflowApiError(
        502,
        'ASSISTANT_EVENT_STREAM_UNAVAILABLE',
        'event stream unavailable'
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events = [];
    let cursor = after;
    let buffer = '';
    const consume = (block) => {
      const fields = block.split('\n').reduce(
        (value, line) => {
          const separator = line.indexOf(':');
          if (separator < 0) return value;
          const key = line.slice(0, separator);
          const fieldValue = line.slice(separator + 1).trimStart();
          if (key === 'data') value.data.push(fieldValue);
          else value[key] = fieldValue;
          return value;
        },
        { data: [] }
      );
      if (!fields.data.length) return;
      const value = JSON.parse(fields.data.join('\n'));
      if (fields.event === 'assistant_turn') {
        const event = AssistantTurnEventSchema.parse(value);
        cursor = Math.max(cursor, event.sequence);
        events.push(event);
        onEvent?.(event);
      } else if (fields.event === 'cursor') {
        cursor = Math.max(cursor, Number(value.cursor) || 0);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/gu, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer.trim());
    return AssistantTurnEventBatchSchema.parse({ events, cursor });
  }

  return {
    session() {
      return request('/v2/session', { method: 'POST' });
    },
    capabilityWorkConfiguration() {
      return request('/v2/capability-work/configuration', { cache: 'no-store' });
    },
    startCapabilityWork(command) {
      return request('/v2/capability-work', { method: 'POST', cache: 'no-store', body: JSON.stringify(command) });
    },
    approveCapabilityScope(runId, command) {
      return request(`/v2/capability-work/${encodeURIComponent(runId)}/scope`, { method: 'POST', cache: 'no-store', body: JSON.stringify(command) });
    },
    admitCapabilityCorpus(runId, command) {
      return request(`/v2/capability-work/${encodeURIComponent(runId)}/corpus`, { method: 'POST', cache: 'no-store', body: JSON.stringify(command) });
    },
    prepareCapabilityOperation(runId, draft) {
      return request(`/v2/capability-work/${encodeURIComponent(runId)}/prepare`, { method: 'POST', cache: 'no-store', body: JSON.stringify(draft) });
    },
    confirmCapabilityOperation(runId, command) {
      return request(`/v2/capability-work/${encodeURIComponent(runId)}/confirm`, { method: 'POST', cache: 'no-store', body: JSON.stringify(command) });
    },
    workspace() {
      return request('/v2/workspace');
    },
    overview({ limit = 25 } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      return request(`/v2/overview?${params}`);
    },
    activity({ limit = 50 } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      return request(`/v2/activity?${params}`);
    },
    assistantThreads({ limit = 25 } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      return request(`/v2/assistant/threads?${params}`);
    },
    agents({ limit = 100, state } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (state) params.set('state', state);
      return request(`/v2/agents?${params}`);
    },
    agent(agentId) {
      return request(`/v2/agents/${encodeURIComponent(agentId)}`);
    },
    createAgent(command) {
      return request('/v2/agents', {
        method: 'POST',
        headers: { 'idempotency-key': command.idempotencyKey },
        body: JSON.stringify(command),
      });
    },
    updateAgentProfile(agentId, expectedVersion, command) {
      return request(`/v2/agents/${encodeURIComponent(agentId)}/profile`, {
        method: 'PATCH',
        headers: {
          'idempotency-key': command.idempotencyKey,
          'if-match': String(expectedVersion),
        },
        body: JSON.stringify(command),
      });
    },
    changeAgentLifecycle(agentId, expectedVersion, command) {
      return request(`/v2/agents/${encodeURIComponent(agentId)}/lifecycle`, {
        method: 'POST',
        headers: {
          'idempotency-key': command.idempotencyKey,
          'if-match': String(expectedVersion),
        },
        body: JSON.stringify(command),
      });
    },
    agentRuns(agentId, { limit = 50 } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      return request(`/v2/agents/${encodeURIComponent(agentId)}/runs?${params}`);
    },
    agentRuntimeStatus() {
      return request('/v2/agent-runtime/status');
    },
    agentSolutions(agentId) {
      return request(`/v2/agents/${encodeURIComponent(agentId)}/solutions`);
    },
    solutions() {
      return request('/v2/solutions');
    },
    solutionConversation(id, { draftId } = {}) {
      const query = draftId ? `?${new URLSearchParams({ draftId })}` : '';
      return request(`/v2/solutions/${encodeURIComponent(id)}/conversation${query}`);
    },
    sendSolutionConversationTurn(id, command, idempotencyKey) {
      return request(`/v2/solutions/${encodeURIComponent(id)}/conversation/turns`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: JSON.stringify(command),
      });
    },
    solutionBuildRequests({ runId, agentId } = {}) {
      const params = new URLSearchParams();
      if (runId) params.set('runId', runId);
      if (agentId) params.set('agentId', agentId);
      return request(`/v2/solution-build-requests${params.size ? `?${params}` : ''}`);
    },
    solutionBuildRequest(id) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}`);
    },
    createSolutionBuildRequest(command, key) {
      return request('/v2/solution-build-requests', {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    answerSolutionBuildRequest(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/answers`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    reviewSolutionBuildRequest(id, command) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        body: JSON.stringify(command),
      });
    },
    retrySolutionBuildRequest(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    testSolutionBuildRequest(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    repairSolutionBuildRequest(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/repair`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    cancelSolutionBuildRequest(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    createSolutionBuildConnection(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/connections`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    revokeSolutionBuildConnection(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/connections/revoke`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    confirmSolutionBuildRequest(id, command, key) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/confirm`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    nativeBuildRequestSession(id, { mode = 'view' } = {}) {
      return request(`/v2/solution-build-requests/${encodeURIComponent(id)}/native-session`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
    },
    buildRequestEndpoint(id) {
      return `${normalizedBaseUrl}/v2/solution-build-requests/${encodeURIComponent(id)}`;
    },
    solution(id) {
      return request(`/v2/solutions/${encodeURIComponent(id)}`);
    },
    solutionAppKeys(solutionId) {
      return request(`/v2/solutions/${encodeURIComponent(solutionId)}/app-keys`);
    },
    createSolutionAppKey(solution, command, key) {
      return request(`/v2/solutions/${encodeURIComponent(solution.id)}/app-keys`, {
        method: 'POST',
        headers: {
          'if-match': `"${solution.rowVersion}"`,
          'idempotency-key': key,
        },
        body: JSON.stringify({ ...command, workflowHash: solution.workflowHash }),
      });
    },
    revokeSolutionAppKey(solutionId, key) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/app-keys/${encodeURIComponent(key.id)}/revoke`,
        {
          method: 'POST',
          headers: { 'if-match': `"${key.rowVersion}"` },
          body: JSON.stringify({}),
        }
      );
    },
    appInvocationEndpoint(solutionId) {
      return `${normalizedBaseUrl}/invoke/v1/solutions/${encodeURIComponent(solutionId)}`;
    },
    solutionRevisions(id) {
      return request(`/v2/solutions/${encodeURIComponent(id)}/revisions`);
    },
    solutionRevisionSetup(solutionId, revisionId) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/connections`
      );
    },
    solutionFailureProbes(solutionId, revisionId) {
      return request(`/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/failure-probes`);
    },
    testSolutionFailureHandler(solutionId, revisionId, command, key) {
      return request(`/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/failure-probes`, {
        method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(command),
      });
    },
    reconcileSolutionFailureProbe(solutionId, revisionId, probeId) {
      return request(`/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/failure-probes/${encodeURIComponent(probeId)}/reconcile`, {
        method: 'POST', body: '{}',
      });
    },
    createSolutionRevisionConnection(solutionId, revisionId, command, key) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/connections`,
        {
          method: 'POST',
          headers: { 'idempotency-key': key },
          body: JSON.stringify(command),
        }
      );
    },
    revokeSolutionRevisionConnection(solutionId, revisionId, command, key) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/connections/revoke`,
        {
          method: 'POST',
          headers: { 'idempotency-key': key },
          body: JSON.stringify(command),
        }
      );
    },
    createSolutionDraft(solution) {
      return request(`/v2/solutions/${encodeURIComponent(solution.id)}/revisions`, {
        method: 'POST',
        headers: { 'if-match': `"${solution.rowVersion}"` },
      });
    },
    forkSolutionRevision(solutionId, revisionId, command, key) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/fork`,
        {
          method: 'POST',
          headers: { 'if-match': `"${command.expectedVersion}"`, 'idempotency-key': key },
          body: JSON.stringify({
            workflowHash: command.workflowHash,
            ...(command.bundleHash ? { bundleHash: command.bundleHash } : {}),
          }),
        }
      );
    },
    reviewSolutionRevision(solutionId, revision) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revision.id)}/review`,
        {
          method: 'POST',
          headers: { 'if-match': `"${revision.rowVersion}"` },
          ...(revision.bundleHash
            ? { body: JSON.stringify({ bundleHash: revision.bundleHash }) }
            : {}),
        }
      );
    },
    decideSolutionRevision(solutionId, revision, action) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revision.id)}/decision`,
        {
          method: 'POST',
          headers: { 'if-match': `"${revision.rowVersion}"` },
          body: JSON.stringify({
            action,
            workflowHash: revision.workflowHash,
            ...(revision.bundleHash ? { bundleHash: revision.bundleHash } : {}),
          }),
        }
      );
    },
    testSolutionRevision(solutionId, revisionId, input, key, authorization = {}) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/revisions/${encodeURIComponent(revisionId)}/invocations`,
        {
          method: 'POST',
          headers: { 'idempotency-key': key },
          body: JSON.stringify({ input, ...authorization }),
        }
      );
    },
    nativeSolutionSession(
      solutionId,
      { revisionId = null, mode = 'view', dependencyId = null } = {}
    ) {
      return request(`/v2/solutions/${encodeURIComponent(solutionId)}/native-session`, {
        method: 'POST',
        body: JSON.stringify({ revisionId, mode, ...(dependencyId ? { dependencyId } : {}) }),
      });
    },
    createSolution(command, key) {
      return request('/v2/solutions', {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    decideSolution(solution, action) {
      return request(`/v2/solutions/${encodeURIComponent(solution.id)}/decision`, {
        method: 'POST',
        headers: { 'if-match': `"${solution.rowVersion}"` },
        body: JSON.stringify({
          action,
          workflowHash: solution.workflowHash,
          environmentId: solution.environment?.id ?? null,
        }),
      });
    },
    invokeSolution(id, input, mode, key, authorization = {}) {
      return request(`/v2/solutions/${encodeURIComponent(id)}/invocations`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify({ input, mode, ...authorization }),
      });
    },
    solutionSchedules(id) {
      return request(`/v2/solutions/${encodeURIComponent(id)}/schedules`);
    },
    listSolutionCodingJobs(solutionId, { runId }) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/coding-jobs?runId=${encodeURIComponent(runId)}`
      );
    },
    readSolutionCodingJob(solutionId, jobId, { runId }) {
      return request(
        `/v2/solutions/${encodeURIComponent(solutionId)}/coding-jobs/${encodeURIComponent(jobId)}?runId=${encodeURIComponent(runId)}`
      );
    },
    createSolutionCodingJob(solutionId, command, key) {
      return request(`/v2/solutions/${encodeURIComponent(solutionId)}/coding-jobs`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    ...Object.fromEntries(
      ['approve', 'run', 'cancel', 'reconcile'].map((action) => [
        `${action}SolutionCodingJob`,
        (solutionId, jobId, command, key) =>
          request(
            `/v2/solutions/${encodeURIComponent(solutionId)}/coding-jobs/${encodeURIComponent(jobId)}/${action}`,
            {
              method: 'POST',
              headers: key ? { 'idempotency-key': key } : {},
              body: JSON.stringify(command),
            }
          ),
      ])
    ),
    createSolutionSchedule(id, command, key) {
      return request(`/v2/solutions/${encodeURIComponent(id)}/schedules`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(command),
      });
    },
    pauseSolutionSchedule(id, scheduleId) {
      return request(
        `/v2/solutions/${encodeURIComponent(id)}/schedules/${encodeURIComponent(scheduleId)}/pause`,
        { method: 'POST', body: '{}' }
      );
    },
    solutionEndpoint(id) {
      return `${normalizedBaseUrl}/v2/solutions/${encodeURIComponent(id)}/invocations`;
    },
    assistantThread(threadId) {
      return request(`/v2/assistant/threads/${threadId}`);
    },
    assistantSend(threadId, command) {
      return request(`/v2/assistant/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify(command),
      });
    },
    assistantResume(threadId, turnId) {
      return request(`/v2/assistant/threads/${threadId}/turns/${turnId}/resume`, {
        method: 'POST',
      });
    },
    assistantCancel(threadId, turnId) {
      return request(`/v2/assistant/threads/${threadId}/turns/${turnId}/cancel`, {
        method: 'POST',
      });
    },
    assistantRetry(threadId, turnId, command) {
      return request(`/v2/assistant/threads/${threadId}/turns/${turnId}/retry`, {
        method: 'POST',
        body: JSON.stringify(command),
      });
    },
    assistantEvents({ threadId, after = 0, limit = 100 }) {
      const params = new URLSearchParams({ after: String(after), limit: String(limit) });
      return request(`/v2/assistant/threads/${threadId}/events?${params}`);
    },
    streamAssistantEvents,
    list({ limit = 25 } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      return request(`/v2/workflows?${params}`);
    },
    start({ commandId, issuedAt, mode, request: goalRequest }) {
      return request('/v2/workflows', {
        method: 'POST',
        body: JSON.stringify({ commandId, issuedAt, mode, request: goalRequest }),
      });
    },
    read(runId) {
      return request(`/v2/workflows/${runId}`);
    },
    /** @returns {Promise<import('../../shared/workflow-v2/goal-workflow-view-contract.js').GoalWorkflowViewResponse>} */
    async goalWorkflowView(runId, { signal } = {}) {
      const response = GoalWorkflowViewResponseSchema.parse(
        await request(`/v2/workflow-views/goal-runs/${encodeURIComponent(runId)}`, {
          method: 'GET',
          signal,
          cache: 'no-store',
        })
      );
      if (response.workflow.source.id !== runId) {
        throw new WorkflowApiError(
          502,
          'WORKFLOW_VIEW_MISMATCH',
          'Goal workflow metadata identity did not match.'
        );
      }
      return response;
    },
    artifact(runId, artifactId, { markdown = false, includeMetadata = false } = {}) {
      return request(
        `/v2/workflows/${runId}/artifacts/${artifactId}`,
        { headers: markdown ? { accept: 'text/markdown' } : undefined },
        { includeMarkdownMetadata: markdown && includeMetadata }
      );
    },
    readExecutableAction(runId) {
      return request(`/v1/runs/${encodeURIComponent(runId)}/executable-actions`);
    },
    proposeExecutableAction(runId, proposal) {
      return request(`/v1/runs/${encodeURIComponent(runId)}/executable-actions`, {
        method: 'POST',
        body: JSON.stringify(proposal),
      });
    },
    decideExecutableAction(actionId, decision, rowVersion) {
      return request(`/v1/executable-actions/${encodeURIComponent(actionId)}/decision`, {
        method: 'POST',
        headers: { 'if-match': `"${rowVersion}"` },
        body: JSON.stringify(decision),
      });
    },
    approve(runId, command) {
      return request(`/v2/workflows/${runId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'approve_artifact', ...command }),
      });
    },
    reviseScope(runId, command) {
      return request(`/v2/workflows/${runId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'revise_scope', ...command }),
      });
    },
  };
}
