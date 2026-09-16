/**
 * Agent HUB – modular agent orchestration platform
 *
 * Architecture:
 * User → Project Creation → Agent Matching → Task Distribution → Execution → KPI Update → Report
 *
 * Layers:
 * - Presentation: Agent management, project form, KPI visualization
 * - Application: Agent registry, project orchestration, task assignment, notifications
 * - Intelligence: Decision engine, agent selection, performance analytics
 * - Data: Agent metadata, projects, task logs, KPI database
 *
 * Persistence: localStorage (synchronous) + Supabase agents table (async sync).
 * Reads are from localStorage for speed; writes go to both. syncAgentsFromSupabase()
 * hydrates localStorage from the DB on initial load.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { maybeNotify } from './emailNotificationDispatcher';
import { inferLlmProvider, KNOWN_LLM_DEFAULT_MODELS, resolveLlmPair } from '../utils/llmPair';

const STORAGE_KEY_AGENTS = 'orch_agent_hub_agents_v1';
const STORAGE_KEY_PROJECTS = 'orch_agent_hub_projects_v1';
const STORAGE_KEY_ASSIGNMENTS = 'orch_agent_hub_assignments_v1';
const STORAGE_KEY_TASKS = 'orch_agent_hub_tasks_v1';
const STORAGE_KEY_KPIS = 'orch_agent_hub_kpis_v1';

const TASK_LIFECYCLE = ['created', 'assigned', 'in_progress', 'review', 'completed', 'evaluated'];
const MATCH_WEIGHTS = {
  capabilityFit: 0.4,
  pastPerformance: 0.2,
  availability: 0.2,
  costEfficiency: 0.2,
};

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;
const loadJson = (key, fallback) => {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const saveJson = (key, value) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const nextId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const round2 = (n) => Number(Number(n || 0).toFixed(2));
const LLM_CONNECTION_TYPES = new Set(Object.keys(KNOWN_LLM_DEFAULT_MODELS));

function resolveAgentLlm(agent = {}) {
  if (agent.provider) return resolveLlmPair({ provider: agent.provider, model: agent.model });
  if (agent.model && inferLlmProvider(agent.model)) return resolveLlmPair({ model: agent.model });
  const legacyProvider = LLM_CONNECTION_TYPES.has(agent.connection_type)
    ? agent.connection_type
    : undefined;
  return resolveLlmPair({ provider: legacyProvider, model: agent.model });
}

// ── Agent connections (registry of available connection endpoints) ─────────
export const CONNECTION_TYPES = [
  { value: 'api', label: 'API', description: 'REST or GraphQL API endpoint' },
  { value: 'internal', label: 'Internal', description: 'In-platform agent' },
  { value: 'webhook', label: 'Webhook', description: 'Outbound webhook trigger' },
  { value: 'sdk', label: 'SDK', description: 'SDK or library integration' },
  { value: 'anthropic', label: 'Anthropic', description: 'Anthropic Claude models' },
  { value: 'openai', label: 'OpenAI', description: 'OpenAI GPT models' },
  { value: 'groq', label: 'Groq', description: 'Groq LPU inference' },
  { value: 'deepseek', label: 'DeepSeek', description: 'DeepSeek models' },
  { value: 'glm', label: 'GLM', description: 'GLM models' },
  { value: 'gemini', label: 'Google Gemini', description: 'Google Gemini 2.x / 3.x models' },
];

export const AGENT_CONNECTIONS = [
  { id: 'openai-gpt4', name: 'OpenAI GPT-4', type: 'api', status: 'available' },
  { id: 'openai-gpt35', name: 'OpenAI GPT-3.5', type: 'api', status: 'available' },
  { id: 'anthropic-claude', name: 'Anthropic Claude', type: 'api', status: 'available' },
  { id: 'internal-analyzer', name: 'Internal Analyzer', type: 'internal', status: 'available' },
  { id: 'internal-writer', name: 'Internal Writer', type: 'internal', status: 'available' },
  { id: 'webhook-generic', name: 'Generic Webhook', type: 'webhook', status: 'available' },
  { id: 'custom-sdk', name: 'Custom SDK', type: 'sdk', status: 'available' },
  { id: 'anthropic', name: 'Anthropic', type: 'anthropic', status: 'available' },
  { id: 'openai', name: 'OpenAI', type: 'openai', status: 'available' },
  { id: 'groq', name: 'Groq', type: 'groq', status: 'available' },
  { id: 'deepseek', name: 'DeepSeek', type: 'deepseek', status: 'available' },
  { id: 'glm', name: 'GLM', type: 'glm', status: 'available' },
  { id: 'gemini', name: 'Google Gemini', type: 'gemini', status: 'available' },
];

export function getAgentConnections(filterByType) {
  const list = AGENT_CONNECTIONS;
  if (!filterByType) return list;
  return list.filter((c) => c.type === filterByType);
}

// ── Supabase ↔ localStorage field mapping ─────────────────────────────────
// Supabase agents table (migration 026): id, user_id, name, description, category,
//   status, pricing_model, cost_per_task, capabilities (jsonb), metadata (jsonb)
// Supabase concilium_agents table (migration 047): id, user_id, name, description,
//   agent_type, status, tracking_token, metadata (jsonb), etc.
// localStorage record: id, agent_id, role, capabilities, connection_type, connection_id,
//   input_format, output_format, constraints, performance_kpis, availability_status,
//   cost_per_task, category, added_by

function localToSupabase(local) {
  const llm = resolveAgentLlm(local);
  return {
    // DB `name` column historically stores the role (e.g. "Frontend Developer")
    // because server-side code (execute-phase.js, team-assigner.js) reads
    // agent.name to identify the role. Don't change this — it would break
    // every server reader. Friendly display name lives in metadata.friendly_name.
    name: local.role || 'general',
    description: local.description || '',
    category: local.category || null,
    status:
      local.availability_status === 'available'
        ? 'active'
        : local.availability_status === 'busy'
          ? 'active'
          : 'inactive',
    cost_per_task: Number(local.cost_per_task || 0),
    capabilities: Array.isArray(local.capabilities) ? local.capabilities : [],
    metadata: {
      agent_id: local.agent_id,
      local_id: local.id,
      // Friendly display name (Luna, Atlas, etc.) — editable by user, used by UI
      friendly_name: local.name && local.name !== local.role ? local.name : null,
      connection_type: local.connection_type || 'internal',
      connection_id: local.connection_id || null,
      input_format: local.input_format || 'text',
      output_format: local.output_format || 'json',
      constraints: local.constraints || {},
      performance_kpis: local.performance_kpis || {},
      availability_status: local.availability_status || 'available',
      added_by: local.added_by || null,
      blueprint_id: local.blueprint_id || null,
      system_prompt: local.system_prompt || null,
      tools: Array.isArray(local.tools) ? local.tools : [],
      provider: llm.provider,
      model: llm.model,
      // Provenance for imported agents (e.g. { source:'github', repo, url, path }).
      imported_from: local.imported_from || null,
    },
    resume: local.resume || null,
    updated_at: new Date().toISOString(),
  };
}

export function supabaseToLocal(row) {
  const meta = row.metadata || {};
  const role = row.name || 'general';
  const llm = resolveAgentLlm(meta);
  return {
    id: meta.local_id || row.id,
    // General agent identity remains backward-compatible for assignments,
    // teams, and imported/local records. Memory consumers independently call
    // agentMemoryOwnerId() at the storage/search boundary.
    agent_id: meta.agent_id || row.id,
    _supabase_id: row.id,
    // Display name: friendly_name if set, otherwise fall back to role
    name: meta.friendly_name || role,
    role,
    description: row.description || '',
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    connection_type: meta.connection_type || 'internal',
    connection_id: meta.connection_id || null,
    input_format: meta.input_format || 'text',
    output_format: meta.output_format || 'json',
    constraints: meta.constraints || {},
    performance_kpis: meta.performance_kpis || {},
    availability_status:
      meta.availability_status || (row.status === 'active' ? 'available' : 'offline'),
    cost_per_task: Number(row.cost_per_task || 0),
    category: row.category || null,
    added_by: meta.added_by || null,
    blueprint_id: meta.blueprint_id || null,
    system_prompt: meta.system_prompt || null,
    tools: Array.isArray(meta.tools) ? meta.tools : [],
    provider: llm.provider,
    model: llm.model,
    imported_from: meta.imported_from || null,
    resume: row.resume || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Map concilium_agents (factory-created) to localStorage format
const CONCILIUM_STATUS_MAP = {
  accepted: 'available',
  active: 'available',
  pending: 'offline',
  paused: 'paused',
  terminated: 'offline',
  expired: 'offline',
};

function conciliumAgentToLocal(row) {
  const meta = row.metadata || {};
  const llm = resolveLlmPair({
    provider: meta.model?.provider,
    model: meta.model?.model,
  });
  return {
    id: row.id,
    agent_id: row.id,
    _supabase_id: row.id,
    _source: 'concilium',
    role: row.name || 'general',
    description: row.description || '',
    capabilities: meta.model ? [meta.model?.model, ...Object.keys(meta.rules || {})] : [],
    connection_type: 'internal',
    connection_id: row.tracking_token || null,
    input_format: 'text',
    output_format: 'json',
    constraints: {
      max_requests_per_hour: row.max_requests_per_hour,
      max_cost_per_day_usd: row.max_cost_per_day_usd,
    },
    performance_kpis: {
      total_requests: row.total_requests || 0,
      total_tokens_used: row.total_tokens_used || 0,
      total_cost_usd: Number(row.total_cost_usd || 0),
      avg_response_time_ms: row.avg_response_time_ms || 0,
    },
    availability_status: CONCILIUM_STATUS_MAP[row.status] || 'offline',
    cost_per_task: Number(row.max_cost_per_day_usd || 0),
    category: row.agent_type || 'internal',
    added_by: 'agent-factory',
    blueprint_id: meta.blueprint_id || null,
    provider: llm.provider,
    model: llm.model,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Hydrate localStorage from Supabase agents table.
 * Call on initial load; non-blocking — fails silently if Supabase is unavailable.
 */
/**
 * Project each agent's LLM from its blueprint (the source of truth) onto the
 * agent object, overriding the stale `agents.metadata` copy that the cards read.
 * Pure + exported so it can be unit-tested without Supabase.
 *
 * @param {Array} agents - local-shaped agents (may carry `blueprint_id`)
 * @param {Record<string, {provider?: string, model?: string}>} blueprintMap
 */
export function applyBlueprintLlm(agents, blueprintMap) {
  if (!blueprintMap) return agents;
  return agents.map((a) => {
    const bp = a.blueprint_id ? blueprintMap[a.blueprint_id] : null;
    if (!bp || (!bp.provider && !bp.model)) return a;
    return { ...a, ...resolveLlmPair({ provider: bp.provider, model: bp.model }) };
  });
}

export async function syncAgentsFromSupabase() {
  if (!hasSupabase()) return;
  try {
    // Fetch from both agents (marketplace) and concilium_agents (factory-created)
    const [agentsRes, conciliumRes] = await Promise.all([
      supabase.from('agents').select('*').order('created_at', { ascending: false }),
      supabase.from('concilium_agents').select('*').order('created_at', { ascending: false }),
    ]);

    const marketplaceAgents = (agentsRes.data || []).map(supabaseToLocal);
    const factoryAgents = (conciliumRes.data || []).map(conciliumAgentToLocal);

    // Merge: factory agents first (newest), then marketplace, dedupe by role
    // Use role-based dedup to eliminate stale localStorage ghosts with different IDs
    const seenId = new Set();
    const seenRole = new Set();
    const merged = [];
    for (const agent of [...factoryAgents, ...marketplaceAgents]) {
      if (seenId.has(agent.id) || seenRole.has(agent.role)) continue;
      seenId.add(agent.id);
      if (agent.role) seenRole.add(agent.role);
      merged.push(agent);
    }

    // The blueprint is the source of truth for an agent's LLM. Project its
    // provider/model onto the agents so every card/detail shows the real value
    // instead of the denormalized (and drift-prone) `agents.metadata` copy.
    const blueprintIds = [...new Set(merged.map((a) => a.blueprint_id).filter(Boolean))];
    let blueprintMap = {};
    if (blueprintIds.length) {
      const { data: blueprints } = await supabase
        .from('agent_blueprints')
        .select('id, provider, model')
        .in('id', blueprintIds);
      blueprintMap = Object.fromEntries(
        (blueprints || []).map((b) => [b.id, { provider: b.provider, model: b.model }])
      );
    }

    saveJson(STORAGE_KEY_AGENTS, applyBlueprintLlm(merged, blueprintMap));
  } catch {
    // Supabase unavailable — keep localStorage as-is
  }
}

// Fire-and-forget Supabase write — never blocks the caller
function supabaseUpsertAgent(record) {
  if (!hasSupabase()) return;
  // Skip upsert for concilium agents — they are managed via the API
  if (record._source === 'concilium') return;
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session?.user?.id) return; // not logged in, skip
    const row = { ...localToSupabase(record), user_id: session.user.id };
    if (record._supabase_id) row.id = record._supabase_id;

    const stableAgentId = row.metadata?.agent_id;
    if (!row.id && String(stableAgentId || '').startsWith('predefined:')) {
      const { data: existing } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('metadata->>agent_id', stableAgentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) row.id = existing.id;
    }

    let { error } = await supabase.from('agents').upsert(row, { onConflict: 'id' });
    // A concurrent first load can race the lookup. The database identity index
    // is the final authority; reload the winner and update it once.
    if (error?.code === '23505' && String(stableAgentId || '').startsWith('predefined:')) {
      const { data: winner } = await supabase
        .from('agents')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('metadata->>agent_id', stableAgentId)
        .limit(1)
        .maybeSingle();
      if (winner?.id) {
        row.id = winner.id;
        ({ error } = await supabase.from('agents').upsert(row, { onConflict: 'id' }));
      }
    }
    if (error) console.warn('[agentHubService] Supabase upsert failed:', error.message);
  });
}

function supabaseDeleteAgent(record) {
  if (!hasSupabase() || !record._supabase_id) return;
  // Route to correct table based on source
  const table = record._source === 'concilium' ? 'concilium_agents' : 'agents';
  supabase
    .from(table)
    .delete()
    .eq('id', record._supabase_id)
    .then(({ error }) => {
      if (error) console.warn('[agentHubService] Supabase delete failed:', error.message);
    });
}

// ── Agent Model ────────────────────────────────────────────────────────────
/** Agent { agent_id, role, capabilities, connection_type, connection_id, input_format, output_format, ... } */
export function getAgents() {
  return loadJson(STORAGE_KEY_AGENTS, []);
}

const PROVIDER_MIGRATION_KEY = 'orch_agent_hub_provider_migration_v4';

/**
 * One-shot repair for agents seeded before provider/model fields existed.
 * Aligns an incomplete provider/model pair on the current platform default.
 * Existing complete, explicit provider/model pairs remain untouched.
 * Runs once per browser (guarded by localStorage flag).
 */
export function repairAgentProviderFields() {
  if (!canUseStorage()) return;
  if (window.localStorage.getItem(PROVIDER_MIGRATION_KEY) === 'done') return;
  const list = getAgents();
  let changed = false;
  const repaired = list.map((a) => {
    const { provider, model } = resolveAgentLlm(a);
    const connectionType = a.connection_type || provider;
    if (a.provider === provider && a.model === model && a.connection_type === connectionType) {
      return a;
    }
    changed = true;
    return {
      ...a,
      provider,
      model,
      connection_type: connectionType,
      updated_at: new Date().toISOString(),
    };
  });
  if (changed) {
    saveJson(STORAGE_KEY_AGENTS, repaired);
    repaired.forEach((r) => {
      if (r._supabase_id) supabaseUpsertAgent(r);
    });
  }
  window.localStorage.setItem(PROVIDER_MIGRATION_KEY, 'done');
}

export function addAgent(agent) {
  const list = getAgents();
  const id = agent.agent_id || nextId('agent');
  const { provider, model } = resolveAgentLlm(agent);
  const record = {
    id: nextId('ah'),
    agent_id: id,
    name: agent.name || agent.role || 'Agent',
    role: agent.role || 'general',
    capabilities: Array.isArray(agent.capabilities)
      ? agent.capabilities
      : [agent.capabilities].filter(Boolean),
    connection_type: agent.connection_type || provider,
    connection_id: agent.connection_id || null,
    provider,
    model,
    input_format: agent.input_format || 'text',
    output_format: agent.output_format || 'json',
    constraints: agent.constraints || {},
    performance_kpis: agent.performance_kpis || {},
    availability_status: agent.availability_status || 'available',
    cost_per_task: Number(agent.cost_per_task || 0),
    category: agent.category || null,
    added_by: agent.added_by || null,
    imported_from: agent.imported_from || null,
    system_prompt: agent.system_prompt || null,
    tools: Array.isArray(agent.tools) ? agent.tools : [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  list.push(record);
  saveJson(STORAGE_KEY_AGENTS, list);
  supabaseUpsertAgent(record);
  maybeNotify('agent_created', { name: record.name, role: record.role });
  return record;
}

export function updateAgent(id, updates) {
  const list = getAgents();
  const idx = list.findIndex((a) => a.id === id || a.agent_id === id);
  if (idx < 0) return null;
  const normalizedUpdates = { ...updates };
  if (
    Object.prototype.hasOwnProperty.call(updates, 'provider') ||
    Object.prototype.hasOwnProperty.call(updates, 'model')
  ) {
    Object.assign(
      normalizedUpdates,
      resolveLlmPair({ provider: updates.provider, model: updates.model })
    );
  }
  list[idx] = { ...list[idx], ...normalizedUpdates, updated_at: new Date().toISOString() };
  saveJson(STORAGE_KEY_AGENTS, list);
  supabaseUpsertAgent(list[idx]);
  maybeNotify('agent_updated', { name: list[idx].name });
  return list[idx];
}

export function removeAgent(id) {
  const allAgents = getAgents();
  const removed = allAgents.find((a) => a.id === id || a.agent_id === id);
  const list = allAgents.filter((a) => a.id !== id && a.agent_id !== id);
  saveJson(STORAGE_KEY_AGENTS, list);
  if (removed) {
    supabaseDeleteAgent(removed);
    maybeNotify('agent_removed', { name: removed.name });
  }
  return list;
}

// ── Project Model ───────────────────────────────────────────────────────────
/** Project { project_id, title, description, linked_project_id, linked_project_name, ... } */
export function getProjects() {
  return loadJson(STORAGE_KEY_PROJECTS, []);
}

export function createProject(project) {
  const list = getProjects();
  const id = project.project_id || nextId('proj');
  const record = {
    id: nextId('ahp'),
    project_id: id,
    title: project.title || 'Untitled Project',
    description: project.description || '',
    linked_project_id: project.linked_project_id || null,
    linked_project_name: project.linked_project_name || null,
    objectives: Array.isArray(project.objectives)
      ? project.objectives
      : [project.objectives].filter(Boolean),
    budget: Number(project.budget || 0),
    deadline: project.deadline || null,
    priority_level: project.priority_level || 'medium',
    required_capabilities: Array.isArray(project.required_capabilities)
      ? project.required_capabilities
      : [],
    expected_kpis: project.expected_kpis || {},
    risk_level: project.risk_level || 'medium',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  list.push(record);
  saveJson(STORAGE_KEY_PROJECTS, list);
  return record;
}

export function updateProject(id, updates) {
  const list = getProjects();
  const idx = list.findIndex((p) => p.id === id || p.project_id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
  saveJson(STORAGE_KEY_PROJECTS, list);
  return list[idx];
}

// ── Assignment Logic ───────────────────────────────────────────────────────
/** Match Score = 0.4×CapabilityFit + 0.2×PastPerformance + 0.2×Availability + 0.2×CostEfficiency */
function computeMatchScore(agent, project, pastPerformance = {}) {
  const required = new Set(project.required_capabilities || []);
  const agentCaps = new Set(agent.capabilities || []);
  const overlap = [...required].filter((c) => agentCaps.has(c)).length;
  const capabilityFit = required.size > 0 ? overlap / required.size : 1;

  const perfScore = Number(pastPerformance[agent.id] || pastPerformance[agent.agent_id]) || 0.8;
  const pastPerformanceScore = Math.min(1, perfScore / 100);

  const availabilityFactor =
    agent.availability_status === 'available' ? 1 : agent.availability_status === 'busy' ? 0.5 : 0;

  const costPerTask = Number(agent.cost_per_task || 0);
  const budget = Number(project.budget || 1);
  const costEfficiencyScore =
    budget > 0 && costPerTask > 0 ? Math.max(0, 1 - costPerTask / (budget / 10)) : 1;

  return round2(
    MATCH_WEIGHTS.capabilityFit * capabilityFit +
      MATCH_WEIGHTS.pastPerformance * pastPerformanceScore +
      MATCH_WEIGHTS.availability * availabilityFactor +
      MATCH_WEIGHTS.costEfficiency * costEfficiencyScore
  );
}

export function getAssignments() {
  return loadJson(STORAGE_KEY_ASSIGNMENTS, []);
}

export function assignAgentToProject(projectId, agentId, responsibilities = []) {
  const projects = getProjects();
  const agents = getAgents();
  const project = projects.find((p) => p.id === projectId || p.project_id === projectId);
  const agent = agents.find((a) => a.id === agentId || a.agent_id === agentId);
  if (!project || !agent) return null;
  const kpis = getKpis();
  const perfByAgent = {};
  kpis
    .filter((k) => k.entity_type === 'agent')
    .forEach((k) => {
      perfByAgent[k.entity_id] = (perfByAgent[k.entity_id] || 0) + Number(k.kpi_value || 0);
    });
  const matchScore = computeMatchScore(agent, project, perfByAgent);
  const list = getAssignments();
  const existing = list.find((a) => a.project_id === project.id && a.agent_id === agent.id);
  if (existing) return updateAssignment(existing.id, { responsibilities, match_score: matchScore });
  const record = {
    id: nextId('aha'),
    project_id: project.id,
    agent_id: agent.id,
    responsibilities: Array.isArray(responsibilities) ? responsibilities : [responsibilities],
    match_score: matchScore,
    assigned_at: new Date().toISOString(),
  };
  list.push(record);
  saveJson(STORAGE_KEY_ASSIGNMENTS, list);
  return record;
}

export function updateAssignment(id, updates) {
  const list = getAssignments();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...updates };
  saveJson(STORAGE_KEY_ASSIGNMENTS, list);
  return list[idx];
}

export function unassignAgent(assignmentId) {
  const list = getAssignments().filter((a) => a.id !== assignmentId);
  saveJson(STORAGE_KEY_ASSIGNMENTS, list);
  return list;
}

/** Get recommended agents for a project (sorted by match score) */
export function getAgentRecommendations(projectId) {
  const project = getProjects().find((p) => p.id === projectId || p.project_id === projectId);
  if (!project) return [];
  const agents = getAgents();
  const kpis = getKpis();
  const perfByAgent = {};
  kpis
    .filter((k) => k.entity_type === 'agent')
    .forEach((k) => {
      perfByAgent[k.entity_id] = (perfByAgent[k.entity_id] || 0) + Number(k.kpi_value || 0);
    });
  return agents
    .filter((a) => a.availability_status === 'available' || a.availability_status === 'busy')
    .map((a) => ({ agent: a, match_score: computeMatchScore(a, project, perfByAgent) }))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 10);
}

// ── Task Orchestration ─────────────────────────────────────────────────────
export function getTasks() {
  return loadJson(STORAGE_KEY_TASKS, []);
}

export function createTask(projectId, agentId, task) {
  const list = getTasks();
  const record = {
    id: nextId('aht'),
    project_id: projectId,
    agent_id: agentId,
    title: task.title || 'Untitled task',
    description: task.description || '',
    status: 'created',
    input_payload: task.input_payload || {},
    output_payload: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
  };
  list.push(record);
  saveJson(STORAGE_KEY_TASKS, list);
  return record;
}

export function updateTaskStatus(taskId, status) {
  const list = getTasks();
  const idx = list.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  list[idx].status = status;
  if (status === 'in_progress' && !list[idx].started_at) list[idx].started_at = now;
  if (['completed', 'evaluated'].includes(status)) list[idx].completed_at = now;
  saveJson(STORAGE_KEY_TASKS, list);
  return list[idx];
}

// ── KPI Tracking ───────────────────────────────────────────────────────────
export function getKpis() {
  return loadJson(STORAGE_KEY_KPIS, []);
}

export function recordKpi(entityType, entityId, kpiName, kpiValue, periodKey = null) {
  const list = getKpis();
  list.push({
    id: nextId('ahk'),
    entity_type: entityType,
    entity_id: entityId,
    kpi_name: kpiName,
    kpi_value: round2(kpiValue),
    period_key:
      periodKey ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    recorded_at: new Date().toISOString(),
  });
  saveJson(STORAGE_KEY_KPIS, list);
  return list[list.length - 1];
}

// ── Dashboard Aggregates ───────────────────────────────────────────────────
export function getHubDashboard() {
  const agents = getAgents();
  const projects = getProjects();
  const tasks = getTasks();
  const assignments = getAssignments();
  const kpis = getKpis();

  const activeAgents = agents.filter((a) => a.availability_status === 'available').length;
  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const completedTasks = tasks.filter(
    (t) => t.status === 'completed' || t.status === 'evaluated'
  ).length;
  const totalTasks = tasks.length;
  const avgKpi =
    totalTasks > 0 && kpis.length > 0
      ? round2(kpis.reduce((s, k) => s + Number(k.kpi_value || 0), 0) / kpis.length)
      : 0;
  const utilization = agents.length > 0 ? round2((assignments.length / agents.length) * 100) : 0;

  return {
    totalAgents: agents.length,
    activeAgents,
    totalProjects: projects.length,
    activeProjects,
    totalTasks,
    completedTasks,
    completionRate: totalTasks > 0 ? round2((completedTasks / totalTasks) * 100) : 0,
    averageKpiScore: avgKpi,
    resourceUtilization: utilization,
  };
}

export function getProjectView(projectId) {
  const project = getProjects().find((p) => p.id === projectId || p.project_id === projectId);
  if (!project) return null;
  const assignments = getAssignments().filter((a) => a.project_id === project.id);
  const tasks = getTasks().filter((t) => t.project_id === project.id);
  const agents = getAgents();
  const assignedAgents = assignments
    .map((a) => agents.find((ag) => ag.id === a.agent_id))
    .filter(Boolean);
  const completed = tasks.filter(
    (t) => t.status === 'completed' || t.status === 'evaluated'
  ).length;
  const progress = tasks.length > 0 ? round2((completed / tasks.length) * 100) : 0;
  return {
    project,
    assignedAgents,
    assignments,
    tasks,
    progress,
    completedTasks: completed,
    totalTasks: tasks.length,
  };
}

export function getAgentView(agentId) {
  const agent = getAgents().find((a) => a.id === agentId || a.agent_id === agentId);
  if (!agent) return null;
  const assignments = getAssignments().filter((a) => a.agent_id === agent.id);
  const tasks = getTasks().filter((t) => t.agent_id === agent.id);
  const completed = tasks.filter(
    (t) => t.status === 'completed' || t.status === 'evaluated'
  ).length;
  const efficiency = tasks.length > 0 ? round2((completed / tasks.length) * 100) : 0;
  return {
    agent,
    assignments,
    tasks,
    workload: tasks.filter((t) => !['completed', 'evaluated'].includes(t.status)).length,
    completedTasks: completed,
    efficiency,
  };
}
