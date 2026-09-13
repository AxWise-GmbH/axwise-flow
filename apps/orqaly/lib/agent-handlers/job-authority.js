/**
 * Central runtime authority gate for service-role queue execution.
 *
 * `agent_jobs.user_id` is the only tenant authority. Queue payload identifiers
 * are untrusted references: this module resolves them against owner-scoped
 * durable rows, checks their cross-links, and returns one deeply-frozen
 * snapshot for dispatch/finalization. It deliberately does not resolve
 * credentials, call models, invoke tools, mutate state, or perform network I/O.
 */

import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';
import { normalizeToolIds } from '../_shared/tool-ids.js';

export const JOB_OWNER_VALIDATION_ERROR = 'JOB_OWNER_VALIDATION_ERROR';

export const RUNTIME_JOB_TYPES = Object.freeze([
  'agent',
  'axwise-ground',
  'axwise-outcome',
  'communicator-process',
  'concilium-evaluate',
  'council-meeting',
  'evaluate',
  'execute-task',
  'execute-workflow',
  'library-calibration',
  'loop-refine-parent-deliverables',
  'orchestrate-goal',
  'prompt-refinement',
  'pulse-cycle',
  'run-llm',
]);

const RUNTIME_JOB_TYPE_SET = new Set(RUNTIME_JOB_TYPES);
const OWNER_ALIASES = Object.freeze(['_userId', 'userId', 'user_id']);
const PREDEFINED_TOOL_IDS = new Set(PREDEFINED_TOOLS.map((tool) => String(tool.id)));

const TABLE_SPECS = Object.freeze({
  agent_blueprints: {
    ownerColumn: 'user_id',
    select:
      'id, user_id, name, description, category, system_prompt, provider, model, temperature, max_tokens, tools, status, updated_at',
  },
  agent_teams: {
    ownerColumn: 'user_id',
    select: 'id, user_id, leader_id, goal_id, is_active, updated_at',
  },
  agents: {
    ownerColumn: 'user_id',
    select: 'id, user_id, name, category, status, capabilities, metadata, updated_at',
  },
  communication_channels: {
    ownerColumn: 'connected_by',
    select: 'id, connected_by, platform, status, last_active',
  },
  concilium: {
    ownerColumn: 'user_id',
    select: 'id, user_id, status, updated_at',
  },
  concilium_agents: {
    ownerColumn: 'user_id',
    select: 'id, user_id, board_id, status, pulse_goal_id, updated_at',
  },
  concilium_teams: {
    ownerColumn: 'user_id',
    select: 'id, user_id, leader_id, is_active, updated_at',
  },
  goals: {
    ownerColumn: 'user_id',
    select:
      'id, user_id, status, updated_at, org_id, team_id, agent_team_id, concilium_id, workflow_id, executor_type, executor_id, parent_goal_id, continuation_goal_id, data',
  },
  jobs: {
    ownerColumn: 'user_id',
    select: 'id, user_id, goal_id, assigned_agent_id, concilium_id, status, updated_at',
  },
  knowledge_documents: {
    ownerColumn: 'user_id',
    select: 'id, user_id, organization_id, concilium_id, category, metadata, updated_at',
  },
  organizations: {
    ownerColumn: 'user_id',
    select: 'id, user_id, parent_id, consilium_id, is_active, updated_at',
  },
  partners: {
    ownerColumn: 'user_id',
    select: 'id, user_id, updated_at',
  },
  team_tasks: {
    ownerColumn: 'user_id',
    select:
      'id, user_id, title, description, assigned_to, job_pool_id, goal_id, agent_id, status, prompt_version_id, data, updated_at',
  },
  tools: {
    ownerColumn: 'user_id',
    select: 'id, user_id, status, connection_type, updated_at',
  },
  workflows: {
    ownerColumn: 'user_id',
    select: 'id, user_id, enabled, data, updated_at',
  },
});

function textId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function jobOwnerValidationError(reason) {
  const error = new Error(`${JOB_OWNER_VALIDATION_ERROR}: ${reason}`);
  error.code = JOB_OWNER_VALIDATION_ERROR;
  return error;
}

export function isJobOwnerValidationError(value) {
  return Boolean(
    value?.code === JOB_OWNER_VALIDATION_ERROR ||
    String(value instanceof Error ? value.message : value || '').startsWith(
      `${JOB_OWNER_VALIDATION_ERROR}:`
    )
  );
}

function assert(condition, reason) {
  if (!condition) throw jobOwnerValidationError(reason);
}

function assertActiveResource(table, row, label) {
  if (table === 'organizations') {
    assert(row.is_active === true, `${label} is not active`);
  } else if (table === 'agent_teams' || table === 'concilium_teams') {
    assert(row.is_active === true, `${label} is not active`);
  } else if (table === 'concilium') {
    assert(row.status === 'active', `${label} is not active`);
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  const normalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (!entry || typeof entry !== 'object') return entry;
    const result = {};
    for (const key of Object.keys(entry).sort()) {
      if (entry[key] !== undefined) result[key] = normalize(entry[key]);
    }
    return result;
  };
  return JSON.stringify(normalize(value));
}

function readAliasedId(source, aliases, label, { required = false } = {}) {
  const object = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const values = [];
  for (const alias of aliases) {
    if (!Object.hasOwn(object, alias) || object[alias] == null || object[alias] === '') continue;
    assert(typeof object[alias] === 'string', `${label}.${alias} must be a string`);
    const value = object[alias].trim();
    assert(value, `${label}.${alias} must not be blank`);
    values.push({ alias, value });
  }
  const distinct = [...new Set(values.map(({ value }) => value))];
  assert(distinct.length <= 1, `${label} aliases disagree`);
  const value = distinct[0] || null;
  if (required) assert(value, `${label} is required`);
  return value;
}

function readArrayIds(value, label) {
  if (value == null) return [];
  assert(Array.isArray(value), `${label} must be an array`);
  const ids = value.map((entry, index) => {
    const candidate = typeof entry === 'string' ? entry : entry?.id;
    assert(typeof candidate === 'string' && candidate.trim(), `${label}[${index}] is invalid`);
    return candidate.trim();
  });
  return [...new Set(ids)];
}

function assertOwnerAliases(payload, ownerId) {
  const scopes = [
    ['payload', payload],
    ['payload.agentContext', payload?.agentContext],
    ['payload.tenant', payload?.tenant],
  ];
  for (const [label, scope] of scopes) {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) continue;
    for (const alias of OWNER_ALIASES) {
      if (!Object.hasOwn(scope, alias)) continue;
      assert(scope[alias] === ownerId, `${label}.${alias} does not match agent_jobs.user_id`);
    }
  }
}

function canonicalPayload(payload, ownerId) {
  const canonical = {
    ...payload,
    _userId: ownerId,
    userId: ownerId,
    user_id: ownerId,
  };
  if (payload.agentContext && typeof payload.agentContext === 'object') {
    canonical.agentContext = {
      ...payload.agentContext,
      _userId: ownerId,
      userId: ownerId,
      user_id: ownerId,
    };
  }
  if (payload.tenant && typeof payload.tenant === 'object') {
    canonical.tenant = {
      ...payload.tenant,
      _userId: ownerId,
      userId: ownerId,
      user_id: ownerId,
    };
  }
  return canonical;
}

/**
 * Canonicalize only the durable owner aliases. Resource identity remains
 * untrusted until `authorizeQueuedJob` finishes.
 */
export function canonicalizeJobOwner(job) {
  const ownerId = textId(job?.user_id);
  assert(ownerId, 'agent_jobs.user_id is required');
  assert(textId(job?.id), 'agent_jobs.id is required');
  const payload = job?.payload;
  assert(
    payload && typeof payload === 'object' && !Array.isArray(payload),
    'job payload is required'
  );
  assertOwnerAliases(payload, ownerId);
  return { ...job, user_id: ownerId, payload: canonicalPayload(payload, ownerId) };
}

class AuthorityBuilder {
  constructor(admin, job) {
    assert(admin && typeof admin.from === 'function', 'database authority client is required');
    this.admin = admin;
    this.job = job;
    this.ownerId = job.user_id;
    this.type = job.payload.type;
    this.references = {};
    this.cache = new Map();
    this.resources = new Map();
    this.execution = null;
    this.agentTable = null;
  }

  reference(name, value) {
    if (!value) return null;
    const current = this.references[name];
    assert(!current || current === value, `${name} references disagree`);
    this.references[name] = value;
    return value;
  }

  async owned(table, id, label = table) {
    const resourceId = textId(id);
    assert(resourceId, `${label} id is required`);
    const spec = TABLE_SPECS[table];
    assert(spec, `unsupported authority table ${table}`);
    const cacheKey = `${table}:${resourceId}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const promise = (async () => {
      let response;
      try {
        response = await this.admin
          .from(table)
          .select(spec.select)
          .eq('id', resourceId)
          .eq(spec.ownerColumn, this.ownerId)
          .maybeSingle();
      } catch (error) {
        throw jobOwnerValidationError(
          `${label} authority lookup failed: ${String(error?.message || error)}`
        );
      }
      if (response?.error) {
        throw jobOwnerValidationError(
          `${label} authority lookup failed: ${String(response.error.message || response.error)}`
        );
      }
      const row = response?.data;
      assert(row, `${label} is missing or belongs to another owner`);
      assert(textId(row.id) === resourceId, `${label} lookup returned an ambiguous row`);
      assert(
        textId(row[spec.ownerColumn]) === this.ownerId,
        `${label} does not belong to agent_jobs.user_id`
      );
      assertActiveResource(table, row, label);
      const safeRow = cloneJson(row);
      if (!this.resources.has(table)) this.resources.set(table, new Map());
      this.resources.get(table).set(resourceId, safeRow);
      return safeRow;
    })();
    this.cache.set(cacheKey, promise);
    return promise;
  }

  async ownedMany(table, ids, label = table) {
    return Promise.all(
      [...new Set((ids || []).filter(Boolean))].map((id) => this.owned(table, id, label))
    );
  }

  mergeExecution(patch) {
    this.execution = { ...(this.execution || {}), ...(patch || {}) };
  }

  resource(table, id) {
    return this.resources.get(table)?.get(textId(id)) || null;
  }

  async relatedRows(table, relationColumn, relationId, select, label) {
    let response;
    try {
      response = await this.admin.from(table).select(select).eq(relationColumn, relationId);
    } catch (error) {
      throw jobOwnerValidationError(
        `${label} authority lookup failed: ${String(error?.message || error)}`
      );
    }
    if (response?.error) {
      throw jobOwnerValidationError(
        `${label} authority lookup failed: ${String(response.error.message || response.error)}`
      );
    }
    const rows = response?.data || [];
    assert(Array.isArray(rows), `${label} authority lookup was ambiguous`);
    for (const row of rows) {
      assert(textId(row.user_id) === this.ownerId, `${label} contains a foreign or ownerless row`);
    }
    return cloneJson(rows);
  }

  snapshot() {
    const resources = {};
    for (const [table, rows] of [...this.resources.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      resources[table] = [...rows.values()].sort((a, b) =>
        String(a.id).localeCompare(String(b.id))
      );
    }
    const refs = this.references;
    return deepFreeze({
      version: 'orqaly_job_authority_v1',
      userId: this.ownerId,
      queueJobId: this.job.id,
      type: this.type,
      goalId: refs.goalId || null,
      taskId: refs.taskId || null,
      workJobId: refs.jobId || null,
      agentId: refs.agentId || null,
      agentTable: this.agentTable,
      teamId: refs.teamId || null,
      conciliumId: refs.conciliumId || null,
      workflowId: refs.workflowId || null,
      organizationId: refs.organizationId || null,
      channelId: refs.channelId || null,
      decisionId: refs.decisionId || null,
      parentGoalId: refs.parentGoalId || null,
      continuationGoalId: refs.continuationGoalId || null,
      payload: this.sanitizedPayload(),
      resources,
      ...(this.execution ? { execution: cloneJson(this.execution) } : {}),
    });
  }

  sanitizedPayload() {
    const payload = cloneJson(this.job.payload);
    const refs = this.references;
    const replaceAliases = (aliases, value) => {
      for (const alias of aliases) delete payload[alias];
      if (value) {
        for (const alias of aliases) payload[alias] = value;
      }
    };

    payload.type = this.type;
    payload._userId = this.ownerId;
    payload.userId = this.ownerId;
    payload.user_id = this.ownerId;
    replaceAliases(['goalId', 'goal_id'], refs.goalId);
    replaceAliases(['taskId', 'task_id'], refs.taskId);
    replaceAliases(['jobId', 'job_id', 'jobPoolId', 'job_pool_id'], refs.jobId);
    replaceAliases(['agentId', 'agent_id', 'assignedAgentId', 'assigned_agent_id'], refs.agentId);
    replaceAliases(['teamId', 'team_id'], refs.teamId);
    replaceAliases(['conciliumId', 'concilium_id', 'boardId', 'board_id'], refs.conciliumId);
    replaceAliases(['workflowId', 'workflow_id'], refs.workflowId);
    replaceAliases(['organizationId', 'organization_id', 'orgId', 'org_id'], refs.organizationId);
    replaceAliases(['channelId', 'channel_id'], refs.channelId);
    replaceAliases(['decisionId', 'decision_id'], refs.decisionId);
    replaceAliases(['parentGoalId', 'parent_goal_id'], refs.parentGoalId);
    replaceAliases(['continuationGoalId', 'continuation_goal_id'], refs.continuationGoalId);

    if (payload.tenant && typeof payload.tenant === 'object' && !Array.isArray(payload.tenant)) {
      for (const alias of OWNER_ALIASES) payload.tenant[alias] = this.ownerId;
      for (const alias of ['organizationId', 'organization_id', 'orgId', 'org_id']) {
        delete payload.tenant[alias];
      }
      if (refs.organizationId) payload.tenant.orgId = refs.organizationId;
    }
    if (
      payload.triggerData &&
      typeof payload.triggerData === 'object' &&
      !Array.isArray(payload.triggerData)
    ) {
      delete payload.triggerData.goalId;
      delete payload.triggerData.goal_id;
      if (refs.goalId) {
        payload.triggerData.goalId = refs.goalId;
        payload.triggerData.goal_id = refs.goalId;
      }
    }

    if (['agent', 'execute-task'].includes(this.type) && refs.agentId && this.agentTable) {
      const agent = this.resource(this.agentTable, refs.agentId);
      assert(agent, 'authorized agent snapshot is unavailable');
      const metadata = agent.metadata && typeof agent.metadata === 'object' ? agent.metadata : {};
      payload.agentContext = {
        id: refs.agentId,
        _agentId: refs.agentId,
        agentId: refs.agentId,
        agent_id: refs.agentId,
        _userId: this.ownerId,
        userId: this.ownerId,
        user_id: this.ownerId,
        ...(this.agentTable === 'agent_blueprints' ? { blueprint_id: refs.agentId } : {}),
        name: agent.name || 'AI Agent',
        role: this.execution?.requiredRole || agent.category || 'general',
        description: agent.description || '',
        capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
        system_prompt:
          this.agentTable === 'agent_blueprints'
            ? typeof agent.system_prompt === 'string'
              ? agent.system_prompt
              : ''
            : typeof metadata.system_prompt === 'string'
              ? metadata.system_prompt
              : '',
        ...(this.agentTable === 'agents' ? { metadata } : {}),
      };
      if (this.agentTable === 'agent_blueprints') {
        payload.blueprintId = refs.agentId;
        payload.blueprint_id = refs.agentId;
        payload.provider = agent.provider || payload.provider;
        payload.model = agent.model || payload.model;
        if (agent.temperature != null) payload.temperature = agent.temperature;
        if (agent.max_tokens != null) payload.maxTokens = agent.max_tokens;
      }
      const toolIds = this.execution?.toolIds || this.execution?.grantedToolIds || [];
      payload.tools = toolIds.slice();
      payload.toolIds = toolIds.slice();
      if (this.execution?.toolGrants) payload.toolGrants = cloneJson(this.execution.toolGrants);
      if (this.execution?.authorizationSnapshotHash) {
        payload.authorizationSnapshotHash = this.execution.authorizationSnapshotHash;
      }
      if (this.type === 'execute-task') {
        const task = this.resource('team_tasks', refs.taskId);
        assert(task, 'authorized execute-task snapshot is unavailable');
        delete payload.prompt;
        delete payload.jobDescription;
        delete payload.context;
        payload.task = String(task.description || task.title || '').trim();
        payload.taskTitle = String(task.title || '').trim();
        payload.agentName = String(agent.name || task.assigned_to || 'Agent').trim();
        payload.assigned_to = String(task.assigned_to || agent.name || 'Agent').trim();
      }
    } else {
      // No other queue handler consumes an agentContext snapshot. Keeping it
      // would preserve untrusted identity/prompt bytes that finalizers might
      // accidentally start treating as authority later.
      delete payload.agentContext;
    }

    return payload;
  }
}

function collectReferences(payload) {
  const tenant = payload?.tenant && typeof payload.tenant === 'object' ? payload.tenant : {};
  const topOrg = readAliasedId(
    payload,
    ['organizationId', 'organization_id', 'orgId', 'org_id'],
    'organization'
  );
  const tenantOrg = readAliasedId(
    tenant,
    ['organizationId', 'organization_id', 'orgId', 'org_id'],
    'tenant organization'
  );
  assert(
    !topOrg || !tenantOrg || topOrg === tenantOrg,
    'organization and tenant organization disagree'
  );

  const topAgentId = readAliasedId(
    payload,
    ['agentId', 'agent_id', 'assignedAgentId', 'assigned_agent_id'],
    'agent'
  );
  const nestedAgentId = agentContextId(payload);
  assert(
    !topAgentId || !nestedAgentId || topAgentId === nestedAgentId,
    'agent and agentContext references disagree'
  );

  return {
    goalId: readAliasedId(payload, ['goalId', 'goal_id'], 'goal'),
    taskId: readAliasedId(payload, ['taskId', 'task_id'], 'task'),
    jobId: readAliasedId(payload, ['jobId', 'job_id', 'jobPoolId', 'job_pool_id'], 'job'),
    agentId: topAgentId || nestedAgentId,
    teamId: readAliasedId(payload, ['teamId', 'team_id'], 'team'),
    conciliumId: readAliasedId(
      payload,
      ['conciliumId', 'concilium_id', 'boardId', 'board_id'],
      'concilium'
    ),
    workflowId: readAliasedId(payload, ['workflowId', 'workflow_id'], 'workflow'),
    organizationId: topOrg || tenantOrg,
    channelId: readAliasedId(payload, ['channelId', 'channel_id'], 'channel'),
  };
}

async function authorizeOrganization(builder, organizationId) {
  if (!organizationId) return null;
  if (organizationId === builder.ownerId) {
    builder.reference('organizationId', organizationId);
    return { id: organizationId, user_id: builder.ownerId, personal: true };
  }

  const visited = new Set();
  let currentId = organizationId;
  let first = null;
  while (currentId) {
    assert(!visited.has(currentId), 'organization parent chain contains a cycle');
    assert(visited.size < 16, 'organization parent chain is too deep');
    visited.add(currentId);
    const row = await builder.owned('organizations', currentId, 'organization');
    if (!first) first = row;
    if (row.consilium_id)
      await builder.owned('concilium', row.consilium_id, 'organization concilium');
    currentId = textId(row.parent_id);
  }
  builder.reference('organizationId', organizationId);
  return first;
}

async function authorizeGoalLinks(builder, goal) {
  if (!goal) return;
  if (goal.org_id) {
    builder.reference('organizationId', textId(goal.org_id));
    await authorizeOrganization(builder, textId(goal.org_id));
  }
  if (goal.agent_team_id) {
    builder.reference('teamId', textId(goal.agent_team_id));
    const team = await builder.owned('agent_teams', goal.agent_team_id, 'goal agent team');
    assert(
      !team.goal_id || textId(team.goal_id) === textId(goal.id),
      'goal agent team points at another goal'
    );
  }
  if (goal.team_id) {
    builder.reference('teamId', textId(goal.team_id));
    await builder.owned('concilium_teams', goal.team_id, 'goal concilium team');
  }
  if (goal.concilium_id) {
    builder.reference('conciliumId', textId(goal.concilium_id));
    await builder.owned('concilium', goal.concilium_id, 'goal concilium');
  }
  if (goal.workflow_id) {
    builder.reference('workflowId', textId(goal.workflow_id));
    await builder.owned('workflows', goal.workflow_id, 'goal workflow');
  }
  const executorId = textId(goal.executor_id);
  if (!executorId) return;
  if (goal.executor_type === 'organization') {
    await authorizeOrganization(builder, executorId);
    assert(
      !goal.org_id || textId(goal.org_id) === executorId,
      'goal organization executor is ambiguous'
    );
  } else if (goal.executor_type === 'consilium') {
    await builder.owned('concilium', executorId, 'goal executor concilium');
    assert(
      !goal.concilium_id || textId(goal.concilium_id) === executorId,
      'goal concilium executor is ambiguous'
    );
  } else if (goal.executor_type === 'team') {
    const durableTeamIds = [textId(goal.agent_team_id), textId(goal.team_id)].filter(Boolean);
    assert(durableTeamIds.includes(executorId), 'goal team executor is not durably linked');
  } else if (goal.executor_type === 'agent') {
    builder.reference('agentId', executorId);
    builder.agentTable = 'agents';
    await builder.owned('agents', executorId, 'goal executor agent');
  } else {
    throw jobOwnerValidationError('goal executor type is missing or unsupported');
  }
}

async function authorizeToolIds(builder, ids, label) {
  const normalized = [...new Set(normalizeToolIds(ids || []))].sort();
  const catalogToolIds = normalized.filter((id) => PREDEFINED_TOOL_IDS.has(id));
  const customToolIds = normalized.filter((id) => !PREDEFINED_TOOL_IDS.has(id));
  const customRows = await builder.ownedMany('tools', customToolIds, label);
  for (const row of customRows) {
    assert(row.status === 'active', `${label} ${row.id} is not active`);
  }
  if (normalized.length) builder.references.toolIds = normalized;
  builder.mergeExecution({ toolIds: normalized, catalogToolIds, customToolIds });
  return normalized;
}

async function authorizeGoal(builder, id, label = 'goal') {
  const goalId = builder.reference('goalId', id);
  const goal = await builder.owned('goals', goalId, label);
  await authorizeGoalLinks(builder, goal);
  return goal;
}

async function authorizeDeclaredStandardReferences(builder, refs, { agentTable = 'agents' } = {}) {
  const resolved = {};
  if (refs.goalId) resolved.goal = await authorizeGoal(builder, refs.goalId);
  if (refs.taskId) {
    builder.reference('taskId', refs.taskId);
    resolved.task = await builder.owned('team_tasks', refs.taskId, 'task');
  }
  if (refs.jobId) {
    builder.reference('jobId', refs.jobId);
    resolved.job = await builder.owned('jobs', refs.jobId, 'job');
  }
  if (refs.agentId) {
    builder.reference('agentId', refs.agentId);
    resolved.agent = await builder.owned(agentTable, refs.agentId, 'agent');
  }
  if (refs.teamId) {
    builder.reference('teamId', refs.teamId);
    resolved.team = await builder.owned('agent_teams', refs.teamId, 'team');
  }
  if (refs.conciliumId) {
    builder.reference('conciliumId', refs.conciliumId);
    resolved.concilium = await builder.owned('concilium', refs.conciliumId, 'concilium');
  }
  if (refs.workflowId) {
    builder.reference('workflowId', refs.workflowId);
    resolved.workflow = await builder.owned('workflows', refs.workflowId, 'workflow');
  }
  if (refs.organizationId)
    resolved.organization = await authorizeOrganization(builder, refs.organizationId);
  if (refs.channelId) {
    builder.reference('channelId', refs.channelId);
    resolved.channel = await builder.owned('communication_channels', refs.channelId, 'channel');
  }
  return resolved;
}

function assertStandardLinks(refs, rows, { strictTaskGoal = false } = {}) {
  const taskColumnGoal = textId(rows.task?.goal_id);
  const taskDataGoal = textId(rows.task?.data?.goal_id);
  if (strictTaskGoal) {
    assert(taskColumnGoal && taskDataGoal, 'task requires both durable goal bindings');
    assert(taskColumnGoal === taskDataGoal, 'task goal bindings disagree');
  }
  const durableGoalId = refs.goalId || taskColumnGoal || taskDataGoal || textId(rows.job?.goal_id);
  if (refs.goalId) {
    assert(!taskColumnGoal || taskColumnGoal === refs.goalId, 'task belongs to another goal');
    assert(!taskDataGoal || taskDataGoal === refs.goalId, 'task data belongs to another goal');
    assert(
      !rows.job?.goal_id || textId(rows.job.goal_id) === refs.goalId,
      'job belongs to another goal'
    );
  }
  if (refs.taskId && refs.jobId) {
    assert(textId(rows.task?.job_pool_id) === refs.jobId, 'task belongs to another job');
  }
  if (refs.agentId) {
    assert(
      !rows.task?.agent_id || textId(rows.task.agent_id) === refs.agentId,
      'task belongs to another agent'
    );
    assert(
      !rows.job?.assigned_agent_id || textId(rows.job.assigned_agent_id) === refs.agentId,
      'job belongs to another agent'
    );
  }
  return durableGoalId || null;
}

function rejectAnyEntityReferences(refs, label) {
  const present = Object.entries(refs).filter(([, value]) => value);
  assert(present.length === 0, `${label} does not accept durable entity attribution`);
}

async function authorizeRunLlm(builder, refs) {
  const rows = await authorizeDeclaredStandardReferences(builder, refs);
  assertStandardLinks(refs, rows);
  const memory = builder.job.payload.memory;
  if (memory == null) return;
  assert(memory && typeof memory === 'object' && !Array.isArray(memory), 'memory scope is invalid');
  const ownerType = textId(memory.owner_type);
  const ownerId = textId(memory.owner_id);
  assert(
    Boolean(ownerType) === Boolean(ownerId),
    'memory owner_type and owner_id must be provided together'
  );
  if (!ownerType) return;
  if (ownerType === 'user') {
    assert(ownerId === builder.ownerId, 'memory user owner does not match agent_jobs.user_id');
  } else if (ownerType === 'agent') {
    await builder.owned('agents', ownerId, 'memory agent');
  } else if (ownerType === 'team') {
    await builder.owned('agent_teams', ownerId, 'memory team');
  } else if (ownerType === 'partner') {
    await builder.owned('partners', ownerId, 'memory partner');
  } else {
    throw jobOwnerValidationError('memory owner_type is unsupported');
  }
  builder.reference('memoryOwnerType', ownerType);
  builder.reference('memoryOwnerId', ownerId);
}

function agentContextId(payload) {
  const context = payload.agentContext;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  return readAliasedId(
    context,
    ['id', '_agentId', 'agentId', 'agent_id', 'blueprint_id'],
    'agentContext agent'
  );
}

async function authorizeAgentJob(builder, refs) {
  const payload = builder.job.payload;
  const blueprintId = readAliasedId(payload, ['blueprintId', 'blueprint_id'], 'blueprint');
  const contextId = agentContextId(payload);
  const agentId = refs.agentId || blueprintId || contextId;
  assert(agentId, 'agent job requires an exact durable agent or blueprint');
  for (const candidate of [refs.agentId, blueprintId, contextId].filter(Boolean)) {
    assert(candidate === agentId, 'agent job identity references disagree');
  }

  const usesBlueprint = Boolean(blueprintId || payload.agentContext?.blueprint_id);
  const agentTable = usesBlueprint ? 'agent_blueprints' : 'agents';
  const normalizedRefs = { ...refs, agentId };
  const rows = await authorizeDeclaredStandardReferences(builder, normalizedRefs, { agentTable });
  assertStandardLinks(normalizedRefs, rows);
  assert(
    !rows.agent.status || rows.agent.status === 'active',
    `agent job ${usesBlueprint ? 'blueprint' : 'agent'} is not active`
  );
  builder.reference('agentKind', usesBlueprint ? 'blueprint' : 'agent');
  builder.agentTable = agentTable;

  const queuedTools = normalizeToolIds([
    ...readArrayIds(payload.tools, 'tools'),
    ...readArrayIds(payload.toolIds, 'toolIds'),
  ]);
  const authoritativeTools = usesBlueprint
    ? normalizeToolIds(readArrayIds(rows.agent?.tools, 'blueprint.tools'))
    : [];
  if (usesBlueprint && queuedTools.length) {
    for (const toolId of queuedTools) {
      assert(
        authoritativeTools.includes(toolId),
        'queued tool is not granted by the owned blueprint'
      );
    }
  }
  const toolIds = [...new Set([...queuedTools, ...authoritativeTools])];
  await authorizeToolIds(builder, toolIds, 'agent tool');
}

async function authorizeConciliumEvaluation(builder, refs) {
  assert(refs.conciliumId, 'concilium-evaluate requires conciliumId');
  const rows = await authorizeDeclaredStandardReferences(builder, refs);
  assertStandardLinks(refs, rows);
  if (rows.job?.concilium_id) {
    assert(
      textId(rows.job.concilium_id) === refs.conciliumId,
      'evaluation job belongs to another concilium'
    );
  }

  const related = await Promise.all([
    builder.relatedRows(
      'concilium_members',
      'concilium_id',
      refs.conciliumId,
      'id, user_id, concilium_id, active, quarantined',
      'concilium members'
    ),
    builder.relatedRows(
      'concilium_criteria',
      'concilium_id',
      refs.conciliumId,
      'id, user_id, concilium_id, is_active',
      'concilium criteria'
    ),
    builder.relatedRows(
      'concilium_consensus_rules',
      'concilium_id',
      refs.conciliumId,
      'id, user_id, concilium_id',
      'concilium consensus rules'
    ),
    builder.relatedRows(
      'concilium_agents',
      'board_id',
      refs.conciliumId,
      'id, user_id, board_id, status',
      'concilium agents'
    ),
  ]);
  builder.execution = {
    conciliumMemberIds: related[0].map((row) => row.id),
    conciliumCriteriaIds: related[1].map((row) => row.id),
    conciliumRuleIds: related[2].map((row) => row.id),
    legacyConciliumAgentIds: related[3].map((row) => row.id),
  };
}

function workflowResourceIds(workflow, triggerData) {
  const blueprintIds = new Set();
  const agentIds = new Set();
  const boardIds = new Set();
  const inspect = (value, set, label) => {
    if (value == null || value === '') return;
    assert(typeof value === 'string' && value.trim(), `${label} is invalid`);
    set.add(value.trim());
  };
  inspect(triggerData?.blueprint_id, blueprintIds, 'workflow trigger blueprint_id');
  inspect(triggerData?.agent_id, agentIds, 'workflow trigger agent_id');
  inspect(triggerData?.board_id, boardIds, 'workflow trigger board_id');
  for (const node of workflow?.data?.nodes || []) {
    const config = node?.data?.config || node?.data || {};
    inspect(config.blueprint_id, blueprintIds, 'workflow node blueprint_id');
    inspect(config.agent_id, agentIds, 'workflow node agent_id');
    inspect(config.board_id, boardIds, 'workflow node board_id');
  }
  return { blueprintIds: [...blueprintIds], agentIds: [...agentIds], boardIds: [...boardIds] };
}

async function authorizeWorkflowJob(builder, refs) {
  assert(refs.workflowId, 'execute-workflow requires workflowId');
  const triggerData = builder.job.payload.triggerData;
  assert(
    triggerData == null || (typeof triggerData === 'object' && !Array.isArray(triggerData)),
    'workflow triggerData is invalid'
  );
  const triggerGoalId = readAliasedId(triggerData, ['goalId', 'goal_id'], 'workflow trigger goal');
  if (refs.goalId && triggerGoalId)
    assert(refs.goalId === triggerGoalId, 'workflow goal references disagree');
  const normalizedRefs = { ...refs, goalId: refs.goalId || triggerGoalId };
  const rows = await authorizeDeclaredStandardReferences(builder, normalizedRefs);
  assertStandardLinks(normalizedRefs, rows);
  assert(rows.workflow?.enabled !== false, 'workflow is disabled');

  const workflowRefs = workflowResourceIds(rows.workflow, triggerData || {});
  await Promise.all([
    builder.ownedMany('agent_blueprints', workflowRefs.blueprintIds, 'workflow blueprint'),
    builder.ownedMany('concilium_agents', workflowRefs.agentIds, 'workflow agent'),
    builder.ownedMany('concilium', workflowRefs.boardIds, 'workflow concilium'),
  ]);
  builder.execution = workflowRefs;
}

async function authorizeCouncilMeeting(builder, refs) {
  assert(refs.teamId, 'council-meeting requires team_id');
  const rows = await authorizeDeclaredStandardReferences(builder, refs);
  assertStandardLinks(refs, rows);
  if (refs.goalId) {
    assert(
      !rows.team?.goal_id || textId(rows.team.goal_id) === refs.goalId,
      'council team belongs to another goal'
    );
  }

  const members = await builder.relatedRows(
    'agent_team_members',
    'team_id',
    refs.teamId,
    'id, team_id, member_id, user_id, role',
    'agent team members'
  );
  assert(members.length > 0, 'council team has no owned members');
  const memberIds = [...new Set(members.map((row) => textId(row.member_id)).filter(Boolean))];
  assert(memberIds.length === members.length, 'council team membership is malformed or ambiguous');
  const leaderId = textId(rows.team?.leader_id);
  assert(leaderId, 'council team leader is missing');
  assert(memberIds.includes(leaderId), 'council team leader is not an exact member');
  await builder.ownedMany('agents', memberIds, 'council team agent');
  builder.execution = { teamId: refs.teamId, leaderId, memberIds };
}

async function authorizeOrchestrateGoal(builder, refs) {
  assert(refs.goalId, 'orchestrate-goal requires goalId');
  const rows = await authorizeDeclaredStandardReferences(builder, refs);
  assertStandardLinks(refs, rows);
}

function storedExecutionManifest(goal) {
  const data = goal?.data || {};
  const candidates = [
    data.goal_approvals?.execution?.snapshot?.authorization_manifest,
    data.execution_authorization?.manifest,
    data.execution_authorization_manifest,
  ].filter(Boolean);
  assert(candidates.length > 0, 'execute-task has no durable Gate-2 manifest');
  const signatures = [...new Set(candidates.map(canonicalJson))];
  assert(signatures.length === 1, 'execute-task Gate-2 manifests are ambiguous');
  return candidates[0];
}

async function authorizeExecuteTask(builder, refs) {
  assert(refs.taskId, 'execute-task requires taskId');
  assert(refs.jobId, 'execute-task requires jobId');

  builder.reference('taskId', refs.taskId);
  builder.reference('jobId', refs.jobId);
  const task = await builder.owned('team_tasks', refs.taskId, 'execute-task task');
  const sameQueueRetry =
    task.status === 'failed' && textId(task.data?.failed_queue_job_id) === textId(builder.job.id);
  assert(task.status === 'todo' || sameQueueRetry, 'execute-task task is not ready to start');
  const durableGoalId = textId(task.goal_id);
  const dataGoalId = textId(task.data?.goal_id);
  assert(durableGoalId && dataGoalId, 'execute-task task requires both durable goal bindings');
  assert(durableGoalId === dataGoalId, 'execute-task task goal bindings disagree');
  assert(
    !refs.goalId || refs.goalId === durableGoalId,
    'execute-task queued goal does not match task'
  );
  builder.reference('goalId', durableGoalId);
  assert(
    textId(task.job_pool_id) === refs.jobId,
    'execute-task task does not belong to queued job'
  );

  const [job, goal] = await Promise.all([
    builder.owned('jobs', refs.jobId, 'execute-task job'),
    builder.owned('goals', durableGoalId, 'execute-task goal'),
  ]);
  await authorizeGoalLinks(builder, goal);
  assert(textId(job.goal_id) === durableGoalId, 'execute-task job does not belong to task goal');
  assert(!job.status || job.status === 'active', 'execute-task job is not active');

  const manifest = storedExecutionManifest(goal);
  assert(
    manifest.valid === true && Array.isArray(manifest.tasks),
    'execute-task Gate-2 manifest is invalid'
  );
  const taskEntries = manifest.tasks.filter((entry) => textId(entry?.task_id) === refs.taskId);
  assert(taskEntries.length === 1, 'execute-task manifest task binding is missing or ambiguous');
  const taskAuthorization = taskEntries[0];
  const agentId = textId(task.agent_id);
  assert(agentId, 'execute-task task has no durable agent');
  assert(
    textId(taskAuthorization.agent_id) === agentId,
    'execute-task manifest agent does not match task'
  );
  assert(
    !refs.agentId || refs.agentId === agentId,
    'execute-task queued agent does not match manifest'
  );
  const contextId = agentContextId(builder.job.payload);
  assert(!contextId || contextId === agentId, 'execute-task agentContext does not match manifest');
  builder.reference('agentId', agentId);
  builder.agentTable = 'agents';
  const agent = await builder.owned('agents', agentId, 'execute-task agent');
  assert(!agent.status || agent.status === 'active', 'execute-task agent is not active');

  const approval = goal.data?.goal_approvals?.execution;
  const authorization = goal.data?.execution_authorization;
  const snapshotHash = textId(approval?.snapshot_hash);
  assert(
    approval?.status === 'approved' && snapshotHash,
    'execute-task Gate-2 approval is not active'
  );
  assert(
    authorization?.status === 'approved' && textId(authorization?.snapshot_hash) === snapshotHash,
    'execute-task execution authorization is stale'
  );
  assert(
    textId(builder.job.payload.authorizationSnapshotHash) === snapshotHash,
    'execute-task queue authorization hash is stale'
  );
  assert(
    textId(task.data?.axwise_execution_context?.authorization_snapshot_hash) === snapshotHash,
    'execute-task task authorization overlay is stale'
  );

  const grantedToolIds = [
    ...new Set(
      normalizeToolIds(
        readArrayIds(taskAuthorization.granted_tool_ids || [], 'manifest granted tools')
      )
    ),
  ].sort();
  const queuedToolIds = [
    ...new Set(
      normalizeToolIds(readArrayIds(builder.job.payload.toolIds || [], 'execute-task toolIds'))
    ),
  ].sort();
  assert(
    canonicalJson(queuedToolIds) === canonicalJson(grantedToolIds),
    'execute-task queued tool grants do not match the manifest'
  );
  await authorizeToolIds(builder, grantedToolIds, 'execute-task tool');

  const teamId = textId(goal.agent_team_id || goal.team_id);
  if (teamId) {
    const memberTable = goal.agent_team_id ? 'agent_team_members' : 'concilium_team_members';
    const memberships = await builder.relatedRows(
      memberTable,
      'team_id',
      teamId,
      'id, team_id, member_id, user_id',
      'execute-task team members'
    );
    assert(
      memberships.some((row) => textId(row.member_id) === agentId),
      'execute-task agent is not a current owned team member'
    );
  }

  builder.mergeExecution({
    taskId: refs.taskId,
    jobId: refs.jobId,
    goalId: durableGoalId,
    agentId,
    authorizationSnapshotHash: snapshotHash,
    grantedToolIds,
    toolGrants: cloneJson(taskAuthorization.tool_grants || []),
    requiredRole: taskAuthorization.required_role || null,
    sameQueueRetry,
  });
}

async function authorizeLibraryCalibration(builder, refs) {
  const rows = await authorizeDeclaredStandardReferences(builder, refs);
  assertStandardLinks(refs, rows);
  const sampleId = readAliasedId(
    builder.job.payload,
    ['sampleId', 'sample_id'],
    'calibration sample'
  );
  if (!sampleId) return;
  builder.reference('sampleId', sampleId);
  const sample = await builder.owned('knowledge_documents', sampleId, 'calibration sample');
  assert(sample.category === 'calibration_sample', 'calibration sample has the wrong category');
  const sampleOrgId = textId(sample.organization_id);
  assert(
    sampleOrgId === (refs.organizationId || ''),
    'calibration sample organization does not match the queued scope'
  );
}

async function authorizePulse(builder, refs, { requireGoal }) {
  assert(refs.agentId, `${builder.type} requires agentId`);
  if (requireGoal) assert(refs.goalId, 'pulse-cycle requires goalId');
  const rows = await authorizeDeclaredStandardReferences(builder, refs, {
    agentTable: 'concilium_agents',
  });
  builder.agentTable = 'concilium_agents';
  assertStandardLinks(refs, rows);
  const agentBoardId = textId(rows.agent?.board_id);
  if (agentBoardId) {
    builder.reference('conciliumId', agentBoardId);
    await builder.owned('concilium', agentBoardId, 'pulse agent concilium');
  }
  if (refs.conciliumId) {
    assert(agentBoardId === refs.conciliumId, 'pulse agent is bound to another concilium');
  }
  if (requireGoal) {
    assert(
      textId(rows.agent?.pulse_goal_id) === refs.goalId,
      'pulse agent is bound to another goal'
    );
  }
}

async function authorizeAxwiseOutcome(builder, refs) {
  const decisionId = readAliasedId(
    builder.job.payload,
    ['decisionId', 'decision_id'],
    'AxWise decision',
    { required: true }
  );
  builder.reference('decisionId', decisionId);
  assert(refs.goalId, 'axwise-outcome requires goalId');
  const rows = await authorizeDeclaredStandardReferences(builder, refs);
  assertStandardLinks(refs, rows);
  assert(rows.goal.status === 'completed', 'axwise-outcome goal is not completed');
  assert(textId(rows.goal.org_id), 'axwise-outcome goal has no organization');
  assert(
    textId(rows.goal.data?.axwise_orchestration?.decision_id) === decisionId,
    'axwise-outcome decision does not match the owned goal'
  );
}

async function authorizeAxwiseGround(builder, refs) {
  assert(refs.organizationId, 'axwise-ground requires tenant organization');
  await authorizeDeclaredStandardReferences(builder, refs);
  assert(textId(builder.job.payload.requestId), 'axwise-ground requires requestId');
}

async function authorizeCommunicator(builder, refs) {
  assert(refs.channelId, 'communicator-process requires channel_id');
  const rows = await authorizeDeclaredStandardReferences(builder, refs);
  assert(
    rows.channel.platform === builder.job.payload.platform,
    'communicator channel platform mismatch'
  );
}

async function authorizeLoopRefinement(builder, refs) {
  const payload = builder.job.payload;
  const parentGoalId = readAliasedId(payload, ['parentGoalId', 'parent_goal_id'], 'parent goal', {
    required: true,
  });
  const continuationGoalId = readAliasedId(
    payload,
    ['continuationGoalId', 'continuation_goal_id'],
    'continuation goal',
    { required: true }
  );
  assert(parentGoalId !== continuationGoalId, 'refinement goals must be distinct');
  const [parent, continuation] = await Promise.all([
    builder.owned('goals', parentGoalId, 'parent goal'),
    builder.owned('goals', continuationGoalId, 'continuation goal'),
  ]);
  await Promise.all([
    authorizeGoalLinks(builder, parent),
    authorizeGoalLinks(builder, continuation),
  ]);
  assert(
    textId(parent.continuation_goal_id) === continuationGoalId &&
      textId(continuation.parent_goal_id) === parentGoalId,
    'refinement goals are not an exact reciprocal chain'
  );
  builder.reference('parentGoalId', parentGoalId);
  builder.reference('continuationGoalId', continuationGoalId);
  if (refs.goalId) {
    assert(
      refs.goalId === parentGoalId || refs.goalId === continuationGoalId,
      'refinement goalId is outside the linked chain'
    );
  }
  const remaining = { ...refs, goalId: null };
  const rows = await authorizeDeclaredStandardReferences(builder, remaining);
  assertStandardLinks(remaining, rows);
  builder.execution = { parentGoalId, continuationGoalId };
}

async function authorizeByType(builder, refs) {
  switch (builder.type) {
    case 'run-llm':
      return authorizeRunLlm(builder, refs);
    case 'evaluate':
      rejectAnyEntityReferences(refs, 'evaluate');
      return;
    case 'agent':
      return authorizeAgentJob(builder, refs);
    case 'concilium-evaluate':
      return authorizeConciliumEvaluation(builder, refs);
    case 'execute-workflow':
      return authorizeWorkflowJob(builder, refs);
    case 'council-meeting':
      return authorizeCouncilMeeting(builder, refs);
    case 'orchestrate-goal':
      return authorizeOrchestrateGoal(builder, refs);
    case 'execute-task':
      return authorizeExecuteTask(builder, refs);
    case 'library-calibration':
      return authorizeLibraryCalibration(builder, refs);
    case 'pulse-cycle':
      return authorizePulse(builder, refs, { requireGoal: true });
    case 'prompt-refinement':
      return authorizePulse(builder, refs, { requireGoal: false });
    case 'axwise-outcome':
      return authorizeAxwiseOutcome(builder, refs);
    case 'axwise-ground':
      return authorizeAxwiseGround(builder, refs);
    case 'communicator-process':
      return authorizeCommunicator(builder, refs);
    case 'loop-refine-parent-deliverables':
      return authorizeLoopRefinement(builder, refs);
    default:
      throw jobOwnerValidationError(`unsupported queued job type: ${builder.type}`);
  }
}

/**
 * Resolve and freeze the complete tenant authority used by one claimed job.
 *
 * @returns {Promise<{canonicalJob: object, authority: object}>}
 */
export async function authorizeQueuedJob(admin, job) {
  const canonicalJob = canonicalizeJobOwner(job);
  const type = textId(canonicalJob.payload.type);
  assert(
    type && RUNTIME_JOB_TYPE_SET.has(type),
    `unsupported queued job type: ${type || 'unknown'}`
  );
  canonicalJob.payload.type = type;

  const builder = new AuthorityBuilder(admin, canonicalJob);
  const refs = collectReferences(canonicalJob.payload);
  await authorizeByType(builder, refs);
  return Object.freeze({ canonicalJob, authority: builder.snapshot() });
}
