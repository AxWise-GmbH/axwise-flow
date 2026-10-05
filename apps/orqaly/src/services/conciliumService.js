/**
 * Concilium service — CRUD for boards + evaluation integration.
 * V2: supports members, criteria, consensus rules alongside legacy LLM arrays.
 */
import * as conciliumBackend from './conciliumBackend';
import * as conciliumMembersBackend from './conciliumMembersBackend';
import * as conciliumCriteriaBackend from './conciliumCriteriaBackend';
import { supabase, hasSupabase } from '../lib/supabase';
import { triggerConciliumEvaluation, getConciliumEvaluations } from './agentJobService';

const CONCILIUM_STATUSES = ['active', 'paused', 'disbanded'];

const SECURITY_LEVELS = ['minimal', 'standard', 'strict', 'paranoid'];

const CONSENSUS_TYPES = ['unanimous', 'majority', 'weighted', 'custom'];
const SPLIT_STRATEGIES = ['chairman_decides', 'reject', 'escalate_to_human', 're_evaluate'];

const LLM_OPTIONS = [
  { id: 'openai-gpt4', name: 'GPT-4', provider: 'OpenAI' },
  { id: 'openai-gpt4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai-gpt35', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
  { id: 'anthropic-claude-opus', name: 'Claude Opus', provider: 'Anthropic' },
  { id: 'anthropic-claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
  { id: 'groq-llama', name: 'Llama 3', provider: 'Groq' },
  { id: 'groq-mixtral', name: 'Mixtral', provider: 'Groq' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
  { id: 'glm-5.1', name: 'GLM-5.1', provider: 'GLM' },
  { id: 'glm-4', name: 'GLM-4', provider: 'GLM' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'Gemini' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'Gemini' },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', provider: 'Gemini' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash (latest)', provider: 'Gemini' },
  { id: 'gemini-pro-latest', name: 'Gemini Pro (latest)', provider: 'Gemini' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite (latest)', provider: 'Gemini' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'Gemini' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (preview)', provider: 'Gemini' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', provider: 'Gemini' },
  {
    id: 'gemini-3.5-flash-lite-preview',
    name: 'Gemini 3.5 Flash Lite (preview)',
    provider: 'Gemini',
  },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (preview)', provider: 'Gemini' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (preview)', provider: 'Gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Gemini' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Gemini' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'Gemini' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Gemini' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'Gemini' },
];

const SEED_BOARD = {
  name: 'Orqaly Evaluation Board',
  quantity: 3,
  llms: [
    { id: 'openai-gpt4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'anthropic-claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
    { id: 'groq-llama', name: 'Llama 3.3', provider: 'Groq' },
  ],
  purpose:
    'Evaluate AI agent outputs for quality, accuracy, completeness, and business relevance in the Orqaly partner management platform.',
  status: 'active',
  createdByName: 'System',
  changeLog: [],
  workingOn: [],
  securityLevel: 'strict',
  approvalThreshold: 0.65,
  confidenceThreshold: 0.7,
  autoQuarantineOnViolation: true,
};

const SEED_MEMBERS = [
  {
    name: 'Director',
    role: 'chairman',
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 2000,
    resume:
      'Business judgment, big-picture quality, tie-breaker. Focuses on whether output serves the business goal and is client-ready.',
    skills: ['business strategy', 'quality assurance', 'partner relations', 'executive review'],
  },
  {
    name: 'Analyst',
    role: 'evaluator',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    temperature: 0.15,
    maxTokens: 1800,
    resume:
      'Data accuracy, fact-checking, hallucination detection. Verifies numbers, checks rationale, flags errors. Meticulous and skeptical.',
    skills: ['data analysis', 'fact checking', 'logical reasoning', 'error detection'],
  },
  {
    name: 'Sentinel',
    role: 'auditor',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    maxTokens: 1500,
    resume:
      'Completeness audit, requirement validation, tone review. Checks nothing was missed or skipped. Strict and thorough.',
    skills: ['compliance', 'completeness audit', 'requirement validation', 'tone review'],
  },
];

const SEED_CRITERIA = [
  {
    name: 'Accuracy',
    weight: 0.25,
    sortOrder: 1,
    rubric:
      'Are all facts, numbers, names, and references correct? Are partner scores backed by real data? Are transcriptions faithful to source? 0 = major factual errors, 5 = minor inaccuracies, 10 = fully verified and correct.',
  },
  {
    name: 'Completeness',
    weight: 0.25,
    sortOrder: 2,
    rubric:
      'Does the output address every requirement in the job description? Are all sections present? Is anything missing or skipped? 0 = major gaps, 5 = mostly complete with minor omissions, 10 = every requirement fully addressed.',
  },
  {
    name: 'Quality',
    weight: 0.2,
    sortOrder: 3,
    rubric:
      'Is the output well-written, professional, and appropriate for a business context? Is the tone right for the audience? 0 = unprofessional or incoherent, 5 = acceptable but rough, 10 = polished and client-ready.',
  },
  {
    name: 'Actionability',
    weight: 0.15,
    sortOrder: 4,
    rubric:
      'Are recommendations specific and implementable? Can the reader act on this output immediately? 0 = vague or generic, 5 = somewhat actionable, 10 = specific, prioritized, and ready to execute.',
  },
  {
    name: 'Relevance',
    weight: 0.1,
    sortOrder: 5,
    rubric:
      'Is the output relevant to the Orqaly partner management context? Does it address the right partner, project, or business need? 0 = largely irrelevant, 5 = mostly on-topic, 10 = precisely targeted.',
  },
  {
    name: 'Formatting',
    weight: 0.05,
    sortOrder: 6,
    rubric:
      'Is the output well-structured with appropriate headings, lists, and sections? Is it readable and scannable? Are there spelling or grammar issues? 0 = wall of text with errors, 5 = readable but unpolished, 10 = perfectly formatted and error-free.',
  },
];

function generateId() {
  return `conc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildConcilium(data) {
  const llms = Array.isArray(data.llms) ? data.llms : [];
  return {
    id: generateId(),
    name: data.name || 'Untitled Concilium',
    quantity: llms.length || data.quantity || 1,
    llms,
    purpose: data.purpose || '',
    status: CONCILIUM_STATUSES.includes(data.status) ? data.status : 'active',
    createdById: data.createdById || null,
    createdByName: data.createdByName || 'System',
    changeLog: Array.isArray(data.changeLog) ? data.changeLog : [],
    startedAt: data.startedAt || new Date().toISOString(),
    workingOn: Array.isArray(data.workingOn) ? data.workingOn : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // v2 fields
    description: data.description || '',
    securityLevel: SECURITY_LEVELS.includes(data.securityLevel) ? data.securityLevel : 'standard',
    approvalThreshold: data.approvalThreshold ?? 0.6,
    confidenceThreshold: data.confidenceThreshold ?? 0.7,
    autoQuarantineOnViolation: data.autoQuarantineOnViolation ?? false,
  };
}

// ── Public API ────────────────────────────────────────────────
export const CONCILIUM_STATUSES_LIST = CONCILIUM_STATUSES;
export const SECURITY_LEVELS_LIST = SECURITY_LEVELS;
export const LLM_OPTIONS_LIST = LLM_OPTIONS;
export const CONSENSUS_TYPES_LIST = CONSENSUS_TYPES;
export const SPLIT_STRATEGIES_LIST = SPLIT_STRATEGIES;

export { buildConcilium };

/**
 * Upsert the consensus rules for a board. Best-effort: failures are logged
 * but do not block board creation/update. Only runs when consensus fields
 * are provided on the board payload.
 */
export async function saveConsensusRules(conciliumId, data) {
  if (!conciliumId || !hasSupabase()) return;
  const hasConsensusFields =
    data.consensusType !== undefined ||
    data.quorum !== undefined ||
    data.splitDecisionStrategy !== undefined;
  if (!hasConsensusFields) return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('concilium_consensus_rules').upsert(
      {
        concilium_id: conciliumId,
        user_id: user.id,
        consensus_type: CONSENSUS_TYPES.includes(data.consensusType)
          ? data.consensusType
          : 'majority',
        quorum: Number.parseInt(data.quorum, 10) || 2,
        approval_threshold: data.approvalThreshold ?? 0.6,
        split_decision_strategy: SPLIT_STRATEGIES.includes(data.splitDecisionStrategy)
          ? data.splitDecisionStrategy
          : 'chairman_decides',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'concilium_id' }
    );
  } catch (e) {
    console.warn('[conciliumService] saveConsensusRules failed:', e);
  }
}

export async function createConcilium(data, agentContext = null) {
  const concilium = buildConcilium(data);
  await conciliumBackend.createConcilium(concilium, agentContext);
  await saveConsensusRules(concilium.id, data);
  return concilium;
}

export async function getAllConcilium() {
  let list = await conciliumBackend.loadConcilium();
  if (list.length === 0) {
    const board = buildConcilium(SEED_BOARD);
    await conciliumBackend.createConcilium(board);
    list.push(board);
    await seedBoardV2(board.id);
  }
  return list;
}

/** Seed members, criteria, consensus rules, and rate limits for a new v2 board. */
async function seedBoardV2(boardId) {
  try {
    // Members
    for (const m of SEED_MEMBERS) {
      await conciliumMembersBackend.createMember({ ...m, conciliumId: boardId });
    }
    // Criteria
    for (const c of SEED_CRITERIA) {
      await conciliumCriteriaBackend.createCriterion({ ...c, conciliumId: boardId });
    }
    // Consensus rules + rate limits require direct Supabase inserts (no service layer)
    if (!hasSupabase()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Consensus rules
    await supabase.from('concilium_consensus_rules').upsert(
      {
        concilium_id: boardId,
        user_id: user.id,
        consensus_type: 'weighted',
        quorum: 2,
        approval_threshold: 0.65,
        split_decision_strategy: 'chairman_decides',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'concilium_id' }
    );
    // Rate limits — board
    await supabase.from('concilium_rate_limits').upsert(
      {
        entity_type: 'board',
        entity_id: boardId,
        user_id: user.id,
        max_requests_per_hour: 60,
        max_requests_per_day: 500,
        max_tokens_per_day: 1000000,
        max_cost_per_day_usd: 15,
        max_cost_per_month_usd: 200,
      },
      { onConflict: 'entity_type,entity_id' }
    );
    // Rate limits — user
    await supabase.from('concilium_rate_limits').upsert(
      {
        entity_type: 'user',
        entity_id: user.id,
        user_id: user.id,
        max_requests_per_hour: 30,
        max_requests_per_day: 200,
        max_tokens_per_day: 500000,
        max_cost_per_day_usd: 10,
        max_cost_per_month_usd: 100,
      },
      { onConflict: 'entity_type,entity_id' }
    );
  } catch (e) {
    console.warn('[conciliumService] v2 seed partially failed:', e);
  }
}

export async function getConciliumById(id) {
  const list = await conciliumBackend.loadConcilium();
  return list.find((c) => c.id === id) || null;
}

function buildChangeLogEntry(data, existing, userName) {
  const changes = [];
  if (data.name !== undefined && data.name !== existing.name)
    changes.push(`name: "${existing.name}" → "${data.name}"`);
  if (data.purpose !== undefined && data.purpose !== existing.purpose)
    changes.push('purpose updated');
  if (data.status !== undefined && data.status !== existing.status)
    changes.push(`status: ${existing.status} → ${data.status}`);
  if (data.llms !== undefined) changes.push(`LLMs updated (${(data.llms || []).length} models)`);
  if (data.workingOn !== undefined) changes.push('assignments updated');
  if (data.securityLevel !== undefined && data.securityLevel !== existing.securityLevel)
    changes.push(`security: ${existing.securityLevel} → ${data.securityLevel}`);
  if (data.description !== undefined && data.description !== existing.description)
    changes.push('description updated');
  if (changes.length === 0) return null;
  return {
    timestamp: new Date().toISOString(),
    userName,
    action: 'Updated',
    details: changes.join(', '),
  };
}

export async function updateConcilium(id, data, userName = 'Unknown', agentContext = null) {
  const list = await conciliumBackend.loadConcilium();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const existing = list[idx];
  const changeLogEntry = buildChangeLogEntry(data, existing, userName);

  const pick = (key, fallback) => (key in data ? data[key] : (existing[key] ?? fallback));
  const newLlms = pick('llms', []);
  const newQuantity = 'llms' in data ? (data.llms || []).length : pick('quantity', 1);

  const updated = {
    ...existing,
    name: pick('name', ''),
    quantity: newQuantity,
    llms: newLlms,
    purpose: pick('purpose', ''),
    status: pick('status', 'active'),
    workingOn: pick('workingOn', []),
    description: pick('description', ''),
    securityLevel: pick('securityLevel', 'standard'),
    approvalThreshold: pick('approvalThreshold', 0.6),
    confidenceThreshold: pick('confidenceThreshold', 0.7),
    autoQuarantineOnViolation: pick('autoQuarantineOnViolation', false),
    changeLog: changeLogEntry
      ? [...(existing.changeLog || []), changeLogEntry]
      : existing.changeLog || [],
    updatedAt: new Date().toISOString(),
  };
  await conciliumBackend.updateConciliumById(id, updated, agentContext);
  await saveConsensusRules(id, data);
  return updated;
}

export async function deleteConcilium(id, agentContext = null) {
  await conciliumBackend.deleteConciliumById(id, agentContext);
  return true;
}

/**
 * Trigger a Consilium evaluation of agent output.
 */
export async function evaluateWithConcilium(conciliumId, opts) {
  return triggerConciliumEvaluation({ conciliumId, ...opts });
}

/**
 * Fetch evaluation history for a concilium.
 */
export async function getEvaluationHistory(conciliumId, limit = 20) {
  return getConciliumEvaluations(conciliumId, limit);
}
