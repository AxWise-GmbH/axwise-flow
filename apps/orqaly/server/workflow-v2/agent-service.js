import { WorkflowCommandError } from './command-service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AGENT_STATES = new Set([
  'draft',
  'proposed',
  'active',
  'paused',
  'revoked',
  'expired',
  'archived',
]);

function requireAgentId(agentId) {
  if (!UUID_PATTERN.test(agentId || '')) {
    throw new WorkflowCommandError('INVALID_AGENT_ID', 'Agent ID must be a UUID', 400);
  }
  return agentId;
}

function readState(state) {
  if (state === undefined || state === null || state === '') return undefined;
  if (!AGENT_STATES.has(state)) {
    throw new WorkflowCommandError('INVALID_AGENT_STATE', 'Agent state is invalid', 400);
  }
  return state;
}

function workflowRun(agent) {
  if (!agent?.runId) return null;
  return {
    id: agent.runId,
    workflowRunId: agent.runId,
    source: 'orqaly_workflow_v2',
    title: agent.task || 'Agent assignment',
    state: agent.status || 'unknown',
    source_task_id: agent.executionAgent?.source?.turnId || null,
    created_at: agent.createdAt || null,
    updated_at: agent.updatedAt || agent.createdAt || null,
  };
}

function runTimestamp(run) {
  const parsed = Date.parse(
    run?.updated_at || run?.updatedAt || run?.created_at || run?.createdAt || ''
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function overlayDefined(base, overlay) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== undefined && (value !== null || !(key in merged))) merged[key] = value;
  }
  return merged;
}

function mergeDuplicateRun(left, right) {
  const rightIsNewer = runTimestamp(right) >= runTimestamp(left);
  return rightIsNewer ? overlayDefined(left, right) : overlayDefined(right, left);
}

function mergeRunHistory(controlPlaneRuns, assignments, agentId, limit) {
  const byId = new Map();
  for (const run of controlPlaneRuns || []) {
    if (run?.id) byId.set(run.id, mergeDuplicateRun(byId.get(run.id) || {}, run));
  }
  for (const assignment of assignments || []) {
    if (assignment?.id !== agentId) continue;
    const run = workflowRun(assignment);
    if (run) byId.set(run.id, mergeDuplicateRun(byId.get(run.id) || {}, run));
  }
  return [...byId.values()]
    .sort(
      (left, right) => runTimestamp(right) - runTimestamp(left) || right.id.localeCompare(left.id)
    )
    .slice(0, limit);
}

export function createAgentService({ repository, controlPlaneClient }) {
  if (!repository || !controlPlaneClient) {
    throw new Error('agent service requires a repository and control-plane client');
  }

  async function owner(auth) {
    if (!auth?.userId) throw new WorkflowCommandError('UNAUTHENTICATED', 'sign-in required', 401);
    const tenantId = await repository.resolveTenant({ userId: auth.userId });
    if (!tenantId) {
      throw new WorkflowCommandError('TENANT_NOT_BOUND', 'identity has no tenant', 403);
    }
    // Preview has one Orqaly-owned workspace per Clerk user. The agentic control plane keeps
    // organization/workspace dimensions explicit, so both are server-derived from that tenant;
    // no tenant or principal identifiers are ever accepted from browser JSON.
    return {
      organizationId: tenantId,
      workspaceId: tenantId,
      userId: auth.userId,
    };
  }

  async function assignmentStats(scope, agentIds) {
    if (typeof repository.readAgentAssignmentStats !== 'function' || !agentIds.length) {
      return new Map();
    }
    const stats = await repository.readAgentAssignmentStats(
      scope.workspaceId,
      scope.userId,
      agentIds
    );
    return new Map(stats.map((stat) => [stat.agentId, stat]));
  }

  async function assignmentsForAgent(scope, agentId, limit) {
    if (typeof repository.listAgentAssignmentsForAgent !== 'function') return [];
    return repository.listAgentAssignmentsForAgent(scope.workspaceId, scope.userId, agentId, limit);
  }

  function enrichAgent(agent, stats) {
    if (!stats?.latestAssignment) return agent;
    const workflowLatest = workflowRun(stats.latestAssignment);
    const latest = mergeRunHistory(
      agent.latest_run ? [agent.latest_run] : [],
      [stats.latestAssignment],
      agent.id,
      1
    )[0];
    const knownDuplicate = agent.latest_run?.id === workflowLatest?.id ? 1 : 0;
    return {
      ...agent,
      run_count: Number(agent.run_count || 0) + Number(stats.runCount || 0) - knownDuplicate,
      latest_run: latest,
    };
  }

  async function list(auth, limit = 100, state) {
    const scope = await owner(auth);
    const response = await controlPlaneClient.listAgents(scope, {
      limit,
      state: readState(state),
    });
    const agents = response.body?.agents || [];
    const statsByAgentId = await assignmentStats(
      scope,
      agents.map((agent) => agent.id)
    );
    return {
      ...response,
      body: {
        ...response.body,
        // Workflow assignments enrich only Agents returned by the control plane. Historical
        // Assistant-only pseudo-Agents intentionally remain Goals until an explicit migration.
        agents: agents.map((agent) => enrichAgent(agent, statsByAgentId.get(agent.id))),
      },
    };
  }

  async function create(auth, request) {
    return controlPlaneClient.createAgent(await owner(auth), { ...request, origin: null });
  }

  async function createFromAssignment(auth, request, origin) {
    return controlPlaneClient.createAgent(await owner(auth), { ...request, origin });
  }

  async function read(auth, agentId) {
    const scope = await owner(auth);
    const checkedAgentId = requireAgentId(agentId);
    const [response, statsByAgentId] = await Promise.all([
      controlPlaneClient.readAgent(scope, checkedAgentId),
      assignmentStats(scope, [checkedAgentId]),
    ]);
    return {
      ...response,
      body: {
        ...response.body,
        agent: response.body?.agent
          ? enrichAgent(response.body.agent, statsByAgentId.get(checkedAgentId))
          : response.body?.agent,
      },
    };
  }

  async function updateProfile(auth, agentId, ifMatch, request) {
    return controlPlaneClient.updateAgentProfile(
      await owner(auth),
      requireAgentId(agentId),
      request,
      ifMatch
    );
  }

  async function lifecycle(auth, agentId, ifMatch, request) {
    return controlPlaneClient.changeAgentLifecycle(
      await owner(auth),
      requireAgentId(agentId),
      request,
      ifMatch
    );
  }

  async function runs(auth, agentId, limit = 100) {
    const scope = await owner(auth);
    const checkedAgentId = requireAgentId(agentId);
    const [response, assignmentRows] = await Promise.all([
      controlPlaneClient.listAgentRuns(scope, checkedAgentId, { limit }),
      assignmentsForAgent(scope, checkedAgentId, limit),
    ]);
    return {
      ...response,
      body: {
        ...response.body,
        agentId: checkedAgentId,
        runs: mergeRunHistory(response.body?.runs, assignmentRows, checkedAgentId, limit),
      },
    };
  }

  async function runtimeStatus(auth) {
    await owner(auth);
    const response = await controlPlaneClient.runtimeStatus();
    return {
      ...response,
      body: {
        version: 'orqaly_agent_runtime_status_v1',
        configured: true,
        status:
          response.body.status === 'ready' ? 'identity_ready_execution_locked' : 'unavailable',
        controlPlane: {
          service: response.body.service || 'orqaly-agentic-control-plane',
          status: response.body.status,
        },
        execution: {
          enabled: response.body.executionEnabled === true,
          connected: false,
          status: 'release_gated',
          provider: 'n8n',
          mode: 'self_hosted',
        },
      },
    };
  }

  return {
    list,
    create,
    createFromAssignment,
    read,
    updateProfile,
    lifecycle,
    runs,
    runtimeStatus,
  };
}
