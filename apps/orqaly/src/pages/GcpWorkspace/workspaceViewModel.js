const ACTIVE_RUN_STATUSES = new Set([
  'requested',
  'queued',
  'running',
  'polling',
  'awaiting_gate_1',
  'awaiting_gate_2',
  'awaiting_approval',
]);

const COMPLETED_RUN_STATUSES = new Set(['completed', 'completed_with_evidence_gaps']);
const ATTENTION_RUN_STATUSES = new Set([
  'awaiting_gate_1',
  'awaiting_gate_2',
  'awaiting_approval',
  'blocked',
  'failed',
]);

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function finiteNumber(...values) {
  return values.find((value) => Number.isFinite(value));
}

function epoch(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function workflowSnapshot(item) {
  if (item?.workflow?.run) return item.workflow;
  if (item?.run) return item;
  if (item?.id) return { run: item };
  return null;
}

function normalizeWorkflowList(items) {
  return firstArray(items)
    .map(workflowSnapshot)
    .filter((item) => item?.run?.id);
}

function normalizeCapabilities(items) {
  const seen = new Set();
  const normalized = [];
  for (const item of firstArray(items)) {
    const candidate =
      typeof item === 'string'
        ? { id: item, label: humanize(item) }
        : {
            id: item?.id || item?.key || item?.name,
            label: item?.label || humanize(item?.name || item?.id || item?.key),
            description: item?.description || item?.summary || '',
            agentCount: Number.isFinite(item?.agentCount) ? item.agentCount : null,
          };
    if (!candidate.id || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    normalized.push(candidate);
  }
  return normalized;
}

function normalizeLabelledContract(value, { kindKeys = [], labelKeys = [] } = {}) {
  if (typeof value === 'string' && value.trim()) {
    return { kind: value, label: humanize(value) };
  }
  if (!value || typeof value !== 'object') return {};

  const kind = kindKeys.map((key) => value[key]).find(Boolean) || null;
  const label = labelKeys.map((key) => value[key]).find(Boolean) || null;
  return {
    ...value,
    ...(kind ? { kind } : {}),
    ...(label ? { label } : kind ? { label: humanize(kind) } : {}),
  };
}

export function normalizeDelegatedAgents(response = {}) {
  const root = response?.workspace || response || {};
  return firstArray(root.agents, root.delegatedAgents, response.delegatedAgents).map(
    (agent, index) => {
      const profileRecord =
        agent?.currentProfile || agent?.current_profile || agent?.profileVersion || agent?.profile;
      const profile = profileRecord?.profile || profileRecord || {};
      const lifetimeValue = String(
        agent?.agentKind ||
          agent?.agent_kind ||
          agent?.lifetime ||
          agent?.lifecycle ||
          agent?.retention ||
          'temporary'
      ).toLowerCase();
      const persistent = ['persistent', 'digital_twin', 'digital-twin'].includes(lifetimeValue);
      const executorPersona = normalizeLabelledContract(
        agent?.executorPersona || agent?.executor_persona || agent?.persona,
        {
          kindKeys: ['role', 'kind', 'type'],
          labelKeys: ['label', 'name'],
        }
      );
      const memoryScope = normalizeLabelledContract(
        agent?.memoryScope || agent?.memory_scope || agent?.memory,
        {
          kindKeys: ['kind', 'scope', 'type'],
          labelKeys: ['label', 'summary', 'name'],
        }
      );
      const runtime = normalizeLabelledContract(agent?.runtime || agent?.executionRuntime, {
        kindKeys: ['provider', 'kind', 'type'],
        labelKeys: ['label', 'name'],
      });
      const toolExecution = normalizeLabelledContract(
        agent?.toolExecution || agent?.tool_execution,
        {
          kindKeys: ['status', 'kind'],
          labelKeys: ['label'],
        }
      );
      const workflowRunId =
        agent?.workflowRunId || agent?.workflow_run_id || agent?.runId || agent?.run_id || null;

      return {
        ...agent,
        id: agent?.id || agent?.agentId || `delegated-agent-${index}`,
        runId: workflowRunId,
        workflowRunId,
        threadId: agent?.threadId || agent?.assistantThreadId || agent?.thread_id || null,
        name:
          profile?.displayName ||
          profile?.display_name ||
          agent?.displayName ||
          agent?.display_name ||
          agent?.name ||
          agent?.label ||
          'Task Agent',
        role:
          profile?.roleLabel || profile?.role_label || agent?.roleLabel || agent?.role_label || '',
        description: profile?.description || agent?.description || '',
        instructions: profile?.instructions || agent?.instructions || '',
        avatar: profile?.avatar ||
          agent?.avatar || {
            kind: agent?.avatar_kind || 'icon',
            value: agent?.avatar_value || 'smart_toy',
            color: agent?.avatar_color || '#6750A4',
          },
        profile: profileRecord || null,
        profileVersion:
          profileRecord?.versionNumber ||
          profileRecord?.version_number ||
          agent?.profileVersion ||
          agent?.profile_version ||
          null,
        profileHash:
          profileRecord?.contentHash ||
          profileRecord?.content_hash ||
          agent?.profileHash ||
          agent?.profile_hash ||
          null,
        version: Number(agent?.version || agent?.rowVersion || agent?.row_version || 1),
        createdFrom: agent?.createdFrom || agent?.created_from || 'task',
        task: agent?.task || agent?.objective || agent?.request || '',
        lifetime: persistent ? 'persistent' : 'temporary',
        status:
          agent?.state || agent?.status || agent?.workflowStatus || agent?.runStatus || 'draft',
        executorPersona,
        memoryScope,
        runtime,
        toolExecution,
        capabilities:
          agent?.capabilities && typeof agent.capabilities === 'object' ? agent.capabilities : {},
        sourceTaskId: agent?.sourceTaskId || agent?.source_task_id || null,
        originatingRunId: agent?.originatingRunId || agent?.originating_run_id || null,
        runCount: Number(agent?.runCount || agent?.run_count || 0),
        createdAt: agent?.createdAt || agent?.created_at || null,
        updatedAt:
          agent?.updatedAt || agent?.updated_at || agent?.createdAt || agent?.created_at || null,
      };
    }
  );
}

export function normalizeOverview(response = {}) {
  const root = response?.overview || response || {};
  const recent = root?.recent || {};
  const threads = firstArray(root.threads, root.assistantThreads, recent.threads, response.threads);
  const workflows = normalizeWorkflowList(
    firstArray(root.workflows, root.runs, recent.workflows, recent.runs, response.workflows)
  );

  return {
    ...root,
    threads,
    workflows,
    notifications: firstArray(root.notifications, root.attention, root.alerts),
    activity: firstArray(root.activity, root.events, root.recentActivity),
    results: firstArray(root.results, response.results),
    metrics:
      root.metrics && typeof root.metrics === 'object'
        ? root.metrics
        : root.counts && typeof root.counts === 'object'
          ? root.counts
          : {},
    usage: root.usage && typeof root.usage === 'object' ? root.usage : {},
  };
}

export function normalizeWorkspace(response = {}) {
  const root = response?.workspace || response || {};
  const session = response?.session || root?.session || {};
  const agents = firstArray(root.agents, root.tenantAgents, response.agents);
  const declaredCapabilities = firstArray(root.capabilities, response.capabilities);
  const agentCapabilities = agents.flatMap((agent) =>
    Array.isArray(agent?.capabilities) ? agent.capabilities : []
  );
  const tenant =
    root.tenant ||
    (root.tenantId
      ? { id: root.tenantId, name: root.name || root.tenantName || 'Personal workspace' }
      : null);

  return {
    ...root,
    tenant,
    agents,
    members: firstArray(root.members, root.workspaceMembers),
    capabilities: normalizeCapabilities(
      declaredCapabilities.length ? declaredCapabilities : agentCapabilities
    ),
    tenantBound: Boolean(
      root.tenantBound ?? session.tenantBound ?? tenant ?? ['ready', 'active'].includes(root.status)
    ),
  };
}

export function humanize(value) {
  return String(value || '')
    .replaceAll(/[_-]+/gu, ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}

export function shortReference(value) {
  const text = String(value || '');
  if (!text) return '';
  return text.length > 12 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text;
}

export function formatWhen(value) {
  const parsed = epoch(value);
  if (!parsed) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function workflowStatus(workflow) {
  return workflow?.run?.status || workflow?.status || 'unknown';
}

export function workflowTitle(workflow) {
  const run = workflow?.run || workflow || {};
  return (
    workflow?.title ||
    run.title ||
    workflow?.request ||
    run.request ||
    `Goal ${shortReference(run.id) || 'without a title'}`
  );
}

export function workflowWhen(workflow) {
  const run = workflow?.run || workflow || {};
  return run.updatedAt || run.updated_at || run.createdAt || run.created_at || '';
}

export function workflowHref(workflow) {
  const id = workflow?.run?.id || workflow?.id;
  return id ? `/goals?run=${encodeURIComponent(id)}` : '/goals';
}

export function threadHref(thread) {
  return thread?.id ? `/assistant?thread=${encodeURIComponent(thread.id)}` : '/assistant';
}

export function overviewMetrics(overview) {
  const workflows = overview?.workflows || [];
  const threads = overview?.threads || [];
  const statuses = workflows.map(workflowStatus);
  const explicit = overview?.metrics || {};

  return {
    conversations:
      finiteNumber(explicit.conversations, explicit.assistantThreads, explicit.threadCount) ??
      threads.length,
    goals:
      finiteNumber(explicit.goals, explicit.workflows, explicit.runCount, explicit.total) ??
      workflows.length,
    active:
      finiteNumber(explicit.active, explicit.activeGoals, explicit.activeRuns) ??
      statuses.filter((status) => ACTIVE_RUN_STATUSES.has(status)).length,
    approvals:
      finiteNumber(explicit.approvals, explicit.awaitingApproval) ??
      statuses.filter((status) => status.startsWith('awaiting_')).length,
    completed:
      finiteNumber(explicit.completed, explicit.completedGoals, explicit.completedRuns) ??
      statuses.filter((status) => COMPLETED_RUN_STATUSES.has(status)).length,
  };
}

function normalizeNotification(item, index) {
  const id = item?.id || item?.eventId || `notification-${index}`;
  const statusByKind = {
    approval_required: 'awaiting_approval',
    run_blocked: 'blocked',
    run_failed: 'failed',
    evidence_gaps: 'completed_with_evidence_gaps',
  };
  return {
    id,
    runId: item?.runId || null,
    title: item?.title || item?.label || item?.subject || 'Workspace notification',
    description: item?.description || item?.message || item?.body || '',
    severity: item?.severity || item?.tone || 'info',
    href:
      item?.href ||
      item?.path ||
      (item?.runId ? `/goals?run=${encodeURIComponent(item.runId)}` : null),
    status: item?.status || statusByKind[item?.kind] || null,
    at: item?.at || item?.occurredAt || item?.createdAt || item?.created_at || null,
  };
}

export function attentionItems(overview) {
  const explicit = (overview?.notifications || []).map(normalizeNotification);
  const explicitIds = new Set(explicit.map((item) => item.id));
  const explicitRunIds = new Set(explicit.map((item) => item.runId).filter(Boolean));
  const derived = (overview?.workflows || []).flatMap((workflow) => {
    const run = workflow.run;
    const status = workflowStatus(workflow);
    if (
      !ATTENTION_RUN_STATUSES.has(status) ||
      explicitIds.has(run.id) ||
      explicitRunIds.has(run.id)
    )
      return [];
    const approval = status.startsWith('awaiting_');
    return [
      {
        id: run.id,
        title: approval ? `${workflowTitle(workflow)} needs approval` : workflowTitle(workflow),
        description: approval
          ? 'Review the pending gate before work continues.'
          : status === 'blocked'
            ? 'The goal stopped at an evidence or safety boundary.'
            : 'The latest goal attempt needs review.',
        severity: approval ? 'warning' : 'error',
        href: workflowHref(workflow),
        status,
        at: workflowWhen(workflow),
      },
    ];
  });
  return [...explicit, ...derived].sort((left, right) => epoch(right.at) - epoch(left.at));
}

function normalizeActivity(item, index) {
  return {
    id: item?.id || item?.eventId || `activity-${index}`,
    title:
      item?.title ||
      item?.workflowTitle ||
      item?.label ||
      humanize(item?.type || item?.eventType || item?.kind) ||
      'Activity',
    description: item?.description || item?.message || item?.summary || item?.label || '',
    at: item?.at || item?.occurredAt || item?.createdAt || item?.created_at || null,
    href:
      item?.href ||
      item?.path ||
      (item?.runId ? `/goals?run=${encodeURIComponent(item.runId)}` : null),
    meta: item?.meta || item?.status || humanize(item?.kind) || '',
  };
}

export function activityItems(overview, limit = 20) {
  const explicit = (overview?.activity || []).map(normalizeActivity);
  const derivedThreads = (overview?.threads || []).map((thread) => ({
    id: `thread-${thread.id}`,
    title: thread.title || 'Assistant conversation',
    description: 'Assistant conversation updated',
    at: thread.updatedAt || thread.updated_at || thread.createdAt || thread.created_at || null,
    href: threadHref(thread),
    meta: 'Chat',
  }));
  const derivedWorkflows = (overview?.workflows || []).map((workflow) => ({
    id: `workflow-${workflow.run.id}`,
    title: workflowTitle(workflow),
    description: `Goal is ${humanize(workflowStatus(workflow)).toLocaleLowerCase()}.`,
    at: workflowWhen(workflow),
    href: workflowHref(workflow),
    meta: 'Goal',
  }));
  const source = explicit.length
    ? [...explicit, ...derivedThreads]
    : [...derivedThreads, ...derivedWorkflows];
  return [...source].sort((left, right) => epoch(right.at) - epoch(left.at)).slice(0, limit);
}

export function resultItems(overview) {
  if (overview?.results?.length) {
    return overview.results.map((result) => ({
      run: {
        id: result.runId,
        title: result.title,
        status: result.status,
        updatedAt: result.completedAt,
        evidenceReadiness: result.evidenceReadiness,
        finalArtifact: result.artifact || null,
      },
    }));
  }
  return (overview?.workflows || []).filter((workflow) => {
    const status = workflowStatus(workflow);
    return COMPLETED_RUN_STATUSES.has(status) || Boolean(workflow?.run?.finalArtifact);
  });
}

export function workspaceName(workspace) {
  return (
    workspace?.tenant?.name || workspace?.displayName || workspace?.name || 'Personal workspace'
  );
}

export function agentName(agent, index = 0) {
  return agent?.name || agent?.label || `Agent ${index + 1}`;
}

export { ACTIVE_RUN_STATUSES, ATTENTION_RUN_STATUSES, COMPLETED_RUN_STATUSES };
