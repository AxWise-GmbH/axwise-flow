/**
 * Team Assigner — forms teams and distributes jobs among agents.
 * Sources workers from `agents` table (My Agents page).
 * Consilium agents are for governance/oversight — NOT workers.
 * Auto-creates agents in `agents` table when user has none.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { systemAlert } from './goal-messaging.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';
import { goalSkipsTools } from '../_shared/goal-tool-policy.js';
import { resolveAcceptedNativeGoalAuthority } from '../_shared/native-goal-authority.js';
import {
  COMMERCIAL_MARKET_LAUNCH_INTENT,
  goalResearchContextGate,
  isCanonicalCommercialExecutionRoleSet,
} from '../integrations/axwise/research-contract.js';

const log = createLogger('team-assigner');

// Role synonym map — handles variations like "frontend" vs "Frontend Developer"
const ROLE_SYNONYMS = {
  'frontend developer': [
    'frontend',
    'front-end',
    'fe developer',
    'fe dev',
    'ui developer',
    'ui dev',
  ],
  'backend developer': [
    'backend',
    'back-end',
    'be developer',
    'be dev',
    'api developer',
    'server developer',
  ],
  'devops engineer': [
    'devops',
    'sre',
    'infra engineer',
    'deployment engineer',
    'platform engineer',
  ],
  designer: ['ux designer', 'ui designer', 'visual designer', 'graphic designer'],
  'qa tester': ['qa', 'quality assurance', 'tester', 'test engineer'],
  'software architect': ['architect', 'solution architect', 'technical architect'],
  'product manager': ['pm', 'product owner'],
  'team lead': ['tech lead', 'engineering lead', 'lead developer'],
};

function normalizeRole(s) {
  return (s || '').toLowerCase().trim().replace(/[_-]/g, ' ');
}

// Generic seniority/function words that appear in almost every role title and
// therefore carry no identity. Excluded before comparing distinctive tokens.
const GENERIC_ROLE_TOKENS = new Set([
  'specialist',
  'manager',
  'lead',
  'consultant',
  'expert',
  'officer',
  'agent',
  'assistant',
  'associate',
  'senior',
  'junior',
  'head',
  'director',
  'and',
  'of',
  'the',
  'for',
]);

/**
 * Identity key used to decide whether two role strings name the same job.
 *
 * Deliberately separate from normalizeRole(). That function feeds the Gate 1
 * executor-role contract comparison in goalRequiredExecutionRoles() and the
 * ROLE_PROFILES lookup; changing its output would invalidate already-approved
 * goal snapshots and fail those goals closed. This key is only ever used for
 * de-duplication and matching, never for contract or hash comparison.
 *
 * Collapses every non-alphanumeric separator, so "Marketing/ICP Specialist" and
 * "Marketing ICP Specialist" resolve to one key instead of minting two agents
 * for one role.
 *
 * Bracketed text is unwrapped rather than discarded: in "Bremen Local Market &
 * ICP Specialist (Marketing)" the parenthetical is the token that identifies
 * the role, so dropping it would hide the relationship entirely.
 */
export function roleIdentityKey(s) {
  return normalizeRole(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distinctive (non-generic) tokens of a role, order-independent. */
export function roleTokens(s) {
  return new Set(
    roleIdentityKey(s)
      .split(' ')
      .filter((token) => token && !GENERIC_ROLE_TOKENS.has(token))
  );
}

/**
 * True when one role is the other wearing extra qualifiers — for example
 * "Bremen Local Market & ICP Specialist (Marketing)" against
 * "Marketing/ICP Specialist".
 *
 * This is a SUGGESTION signal only. It never drives automatic merging, because
 * the subset relation also holds for pairs that must stay distinct
 * ("Finance Specialist" is a subset of "Finance Pricing Specialist"). Callers
 * surface these for a human to confirm.
 */
export function relatedRole(a, b) {
  const tokensA = roleTokens(a);
  const tokensB = roleTokens(b);
  if (!tokensA.size || !tokensB.size) return false;
  if (roleIdentityKey(a) === roleIdentityKey(b)) return false;
  const [smaller, larger] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  for (const token of smaller) if (!larger.has(token)) return false;
  return true;
}

function roleName(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value || '');
  return value.role || value.name || value.title || value.capability || value.description || '';
}

const ROLE_ACRONYMS = new Map(
  ['ai', 'b2b', 'ceo', 'cfo', 'eu', 'gdpr', 'hr', 'icp', 'kpi', 'qa', 'smb', 'ui', 'ux'].map(
    (value) => [value, value.toUpperCase()]
  )
);

const RESEARCH_EXECUTOR_ROLE_VOCABULARY = new Set([
  'Marketing ICP Specialist',
  'Finance Pricing Specialist',
  'GDPR Legal Compliance Specialist',
  'Business Development Sales Specialist',
  'Commercial Risk Analyst',
]);

function humanizeExecutionRole(value) {
  const raw = String(roleName(value) || '').trim();
  if (!raw || !/[_-]/.test(raw) || /\s/.test(raw)) return raw;
  return raw
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map(
      (word) => ROLE_ACRONYMS.get(word.toLowerCase()) || `${word[0].toUpperCase()}${word.slice(1)}`
    )
    .join(' ');
}

/**
 * Preserve a small, explicit role vocabulary across old PO prompts, AxWise
 * capability identifiers, and the persistent Agent Hub. The aliases below
 * are semantic equivalents observed in production, not broad fuzzy guesses.
 */
export function formatExecutionRole(value) {
  const role = humanizeExecutionRole(value);
  const normalized = normalizeRole(role).replace(/\s+/g, ' ');
  if (/\bb2b\b.*\bgo to market\b|\bbusiness development\b|\bsales specialist\b/.test(normalized)) {
    return 'Business Development Sales Specialist';
  }
  if (
    /\bgerman market localization\b|\bmarketing icp\b|\bideal customer profile\b/.test(normalized)
  ) {
    return 'Marketing ICP Specialist';
  }
  if (/\bgdpr\b|\bdsgvo\b|\beu regulatory\b|\blegal compliance\b/.test(normalized)) {
    return 'GDPR Legal Compliance Specialist';
  }
  if (/\bcommercial pricing\b|\bfinance pricing\b|\bpricing specialist\b/.test(normalized)) {
    return 'Finance Pricing Specialist';
  }
  if (/\bcommercial risk\b|\brisk manager\b|\brisk specialist\b/.test(normalized)) {
    return 'Commercial Risk Analyst';
  }
  return role;
}

/**
 * Collapse historical Agent Hub seed duplicates into one execution candidate
 * per role. The UI already presents this logical view; applying the same rule
 * server-side prevents old duplicate rows from making team IDs drift between
 * otherwise identical goal attempts.
 */
export function dedupeExecutionAgents(agents = []) {
  const byRole = new Map();
  for (const agent of agents) {
    const key = roleIdentityKey(agent?.name || agent?.agent_type || agent?.category || agent?.id);
    if (!key) continue;
    const current = byRole.get(key);
    if (!current) {
      byRole.set(key, agent);
      continue;
    }
    const currentTime = Date.parse(current.updated_at || current.created_at || '') || 0;
    const candidateTime = Date.parse(agent.updated_at || agent.created_at || '') || 0;
    if (candidateTime > currentTime) byRole.set(key, agent);
  }
  return [...byRole.values()];
}

export function matchesRole(agentRoleName, targetRole) {
  const a = normalizeRole(agentRoleName);
  const t = normalizeRole(targetRole);
  if (!a || !t) return false;
  if (a === t) return true;
  // Punctuation-insensitive identity: "Marketing/ICP Specialist" is the same
  // job as "Marketing ICP Specialist" and must not mint a second agent.
  const keyA = roleIdentityKey(agentRoleName);
  const keyT = roleIdentityKey(targetRole);
  if (keyA && keyA === keyT) return true;
  const aWordCount = a.split(/\s+/).filter(Boolean).length;
  const tWordCount = t.split(/\s+/).filter(Boolean).length;
  if ((a.includes(t) || t.includes(a)) && Math.min(aWordCount, tWordCount) >= 2) return true;
  for (const [canonical, aliases] of Object.entries(ROLE_SYNONYMS)) {
    if ((a === canonical || aliases.includes(a)) && (t === canonical || aliases.includes(t)))
      return true;
  }
  return false;
}

// Deterministic team display order
const SENIORITY_ORDER = [
  'Team Lead',
  'Project Manager',
  'Product Manager',
  'Software Architect',
  'Backend Developer',
  'Frontend Developer',
  'DevOps Engineer',
  'Designer',
  'QA Tester',
  'Researcher',
  'Analyst',
];
function seniorityRank(name) {
  const i = SENIORITY_ORDER.indexOf(name);
  return i === -1 ? 999 : i;
}

const LEADERSHIP_ROLE_NAMES = new Set(['Team Lead', 'Project Manager']);

export function isLeadershipRole(value) {
  const name = roleName(value);
  return [...LEADERSHIP_ROLE_NAMES].some((leadershipRole) => matchesRole(name, leadershipRole));
}

// Detect when a goal needs upstream Brand & Site Research before downstream
// design/build tasks run. Match on explicit URLs, bare domains in common
// TLDs, or explicit affiliate/landing-page language. When true, the planner injects
// a phase-0 research task and team-assigner ensures Browser Automation Lead
// is on the team. Bare "funnel" is deliberately not a trigger because a
// conversion/sales/marketing funnel is normally a strategy artifact rather
// than a website. False negatives for explicit web surfaces reintroduce the
// hallucinated-brand-data failure mode from goal f505dbeb.
const URL_OR_BRAND_RE =
  /\b(https?:\/\/\S+|[a-z0-9][\w-]{1,}\.(?:com|net|io|org|co|app|gg|bet|casino|xyz|ai|dev))\b/i;
const RESEARCH_KEYWORDS_RE =
  /\b(?:landing page|affiliate|pre-?lander|scrape|crawl|brand intel|site analysis|competitor (?:research|analysis))\b/i;
export function goalNeedsBrandResearch(goal) {
  if (!goal) return false;
  if (goalSkipsTools(goal)) return false;
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (nativeAuthority.native && !nativeAuthority.ready) return false;
  const text = nativeAuthority.native
    ? [
        nativeAuthority.deliverable?.type,
        nativeAuthority.deliverable?.title_prefix,
        ...(nativeAuthority.deliverable?.required_sections || []),
        ...(nativeAuthority.admission?.work_types || []),
        ...(nativeAuthority.admission?.requested_actions || []).map((item) => item?.action),
        goal?.plan?.strategy,
        ...(goal?.plan?.phases || []).flatMap((phase) => [
          phase?.name,
          phase?.description,
          ...(phase?.jobs || []).flatMap((job) => [job?.title, job?.description]),
        ]),
      ]
        .filter(Boolean)
        .join(' ')
    : `${goal.title || ''} ${goal.description || ''}`;
  if (URL_OR_BRAND_RE.test(text)) return true;
  if (RESEARCH_KEYWORDS_RE.test(text)) return true;
  return false;
}

// Role profiles for auto-creating agents when user has none
const ROLE_PROFILES = {
  'team lead': {
    name: 'Team Lead',
    desc: 'Coordinates execution, monitors dependencies, and keeps specialist work aligned with the approved plan.',
    prompt:
      'You coordinate specialist execution. Keep ownership, dependencies, acceptance criteria, and escalation paths explicit. Do not impersonate a specialist executor.',
  },
  researcher: {
    name: 'ResearchBot',
    desc: 'Specializes in web research, data gathering, and synthesis of information from multiple sources.',
    prompt:
      'Your expertise is in finding, evaluating, and synthesizing information from diverse sources. Produce thorough, well-cited research deliverables with clear structure and actionable insights.',
  },
  developer: {
    name: 'DevAgent',
    desc: 'Skilled in software development, code generation, API integration, and technical implementation.',
    prompt:
      'You are an experienced software engineer. Write clean, maintainable code. Follow best practices, provide documentation, and structure your technical deliverables clearly.',
  },
  designer: {
    name: 'DesignBot',
    desc: 'Focused on visual design, branding, UI/UX layouts, and creative asset specifications.',
    prompt:
      'You specialize in visual communication and user experience. Produce design specifications, layout descriptions, color palettes, typography guides, and brand-consistent asset plans.',
  },
  'content-creator': {
    name: 'ContentAgent',
    desc: 'Expert in writing, editing, and producing high-quality content, reports, and documentation.',
    prompt:
      'You excel at creating clear, engaging, and well-structured written content. Adapt your tone and style to the target audience. Produce polished, publication-ready deliverables.',
  },
  'outreach-specialist': {
    name: 'OutreachAgent',
    desc: 'Handles email campaigns, partner communication, and external stakeholder engagement.',
    prompt:
      'You manage external communications professionally. Draft compelling outreach messages, follow-ups, proposals, and relationship-building content with clear calls to action.',
  },
  analyst: {
    name: 'AnalystBot',
    desc: 'Performs data analysis, market research, competitive analysis, and strategic insights.',
    prompt:
      'You turn raw data into actionable insights. Provide clear analysis with supporting evidence, comparisons, metrics, and strategic recommendations.',
  },
  'marketing icp specialist': {
    name: 'Marketing ICP Specialist',
    desc: 'Defines evidence-labeled SMB customer profiles, pains, buying triggers, decision roles, and qualification criteria.',
    prompt:
      'You own ideal-customer-profile and positioning work. Separate facts from assumptions, make segments operationally testable, and produce complete task-scoped artifacts.',
  },
  'finance pricing specialist': {
    name: 'Finance Pricing Specialist',
    desc: 'Designs fixed-price EUR service packages with scope, exclusions, unit economics, and commercially defensible pricing logic.',
    prompt:
      'You own pricing and packaging. Make every package measurable, explicitly scoped, commercially viable, and transparent about assumptions and exclusions.',
  },
  'gdpr legal compliance specialist': {
    name: 'GDPR Legal Compliance Specialist',
    desc: 'Defines EU/German data-protection boundaries, lawful delivery practices, data flows, and compliance mitigations.',
    prompt:
      'You own GDPR and EU compliance analysis. Give practical operational safeguards, label legal assumptions, and never claim formal legal advice or unverified compliance.',
  },
  'business development sales specialist': {
    name: 'Business Development Sales Specialist',
    desc: 'Builds localized B2B outreach cadences, channel targets, German-language templates, qualification, and objection handling.',
    prompt:
      'You own business development and sales execution design. Produce localized, usable outreach assets with weekly targets, qualification rules, and objection responses.',
  },
  'commercial risk analyst': {
    name: 'Commercial Risk Analyst',
    desc: 'Creates conversion-funnel controls, KPI definitions, measurement methods, commercial risk matrices, and mitigations.',
    prompt:
      'You own commercial measurement and risk. Define formulas, owners, data requirements, decision thresholds, and specific mitigations rather than vague recommendations.',
  },
};

export function agentMatchesRequiredRole(agent, targetRole) {
  const target = formatExecutionRole(targetRole);
  return executionCapabilityAliases(agent).some((candidate) => matchesRole(candidate, target));
}

/**
 * Return the declared Agent Hub role evidence plus only the conservative,
 * named execution-role aliases recognized by formatExecutionRole.
 *
 * AxWise consumes exact capability strings for hard requirements, while the
 * Agent Hub intentionally permits human-facing role names such as "Lawyer"
 * or "Risk Manager". Advertising the same canonical aliases used by local
 * team formation keeps both trust boundaries equivalent without turning the
 * hard-role check into fuzzy matching.
 */
export function executionCapabilityAliases(agent = {}) {
  const declared = [
    agent?.name,
    agent?.agent_type,
    agent?.type,
    agent?.category,
    ...(Array.isArray(agent?.capabilities) ? agent.capabilities : []),
  ];
  const aliases = [];
  const seen = new Set();
  for (const candidate of declared) {
    const raw = String(roleName(candidate) || '').trim();
    if (!raw) continue;
    for (const value of [raw, formatExecutionRole(raw)]) {
      const key = normalizeRole(value).replace(/\s+/g, ' ');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      aliases.push(value);
    }
  }
  return aliases;
}

export function missingRequiredRoles(agents = [], roles = [], limit = 5) {
  const unique = [];
  const seen = new Set();
  for (const role of roles) {
    const clean = String(roleName(role) || '')
      .trim()
      .slice(0, 120);
    const key = normalizeRole(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!(agents || []).some((agent) => agentMatchesRequiredRole(agent, clean))) unique.push(clean);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Return the bounded executor roles that the current approved planning inputs
 * require. PO-declared roles and concrete plan assignments come first so an
 * already-wrong fallback plan cannot crowd the requested specialists out of
 * the next pass.
 *
 * Free-form `persona_resolution.ideal_agent_persona.required_capabilities`
 * values describe what one recommended agent can do (for example "Writes
 * Product Requirements Documents") and are not an authoritative team-role
 * vocabulary. Only exact members of the bounded research executor catalogue
 * survive from that field; everything else remains capability context.
 * Leadership is deliberately excluded and attached separately as a
 * non-executing coordinator.
 */
export function goalRequiredExecutionRoles(goal, limit = 5) {
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (nativeAuthority.native && !nativeAuthority.ready) return [];
  const nativeContractRoles = Array.isArray(nativeAuthority.researchContract?.executor_role_slots)
    ? nativeAuthority.researchContract.executor_role_slots.map((slot) => slot.role)
    : [];
  const contractedRoles = nativeContractRoles.length
    ? nativeContractRoles
    : Array.isArray(goal?.data?.research_policy?.requested_execution_roles)
      ? goal.data.research_policy.requested_execution_roles
      : [];
  if (contractedRoles.length) {
    if (
      !nativeContractRoles.length &&
      goal?.data?.research_policy?.intent === COMMERCIAL_MARKET_LAUNCH_INTENT &&
      !isCanonicalCommercialExecutionRoleSet(contractedRoles)
    ) {
      return [];
    }
    const unique = [];
    const seen = new Set();
    for (const value of contractedRoles) {
      const role = (
        nativeContractRoles.length
          ? String(roleName(value) || '').trim()
          : formatExecutionRole(value)
      ).slice(0, nativeContractRoles.length ? 255 : 120);
      const key = roleIdentityKey(role);
      if (!key || seen.has(key) || (!nativeContractRoles.length && isLeadershipRole(role)))
        continue;
      seen.add(key);
      unique.push(role);
      if (!nativeContractRoles.length && unique.length >= limit) break;
    }
    const pointer = goal?.data?.axwise_customer_intelligence?.research_bundle;
    // Before research starts this is the authoritative request roster. Once a
    // bundle exists, downstream planning/team formation may consume it only
    // after the exact bundle and role contract passed Gate 1. Returning an
    // empty roster deliberately prevents fallback inference from hiding a
    // stale or tampered commercial contract.
    if (pointer?.bundle_hash) {
      const gate = goalResearchContextGate(goal);
      const approval = goal?.data?.goal_approvals?.context || {};
      const approvedBundle = approval.snapshot?.research_bundle || {};
      const gateRoles = Array.isArray(gate.executor_roles?.expected)
        ? gate.executor_roles.expected.map((role) => normalizeRole(role)).sort()
        : [];
      const contractKeys = unique.map((role) => normalizeRole(role)).sort();
      const rolesCurrent =
        gateRoles.length === contractKeys.length &&
        gateRoles.every((role, index) => role === contractKeys[index]);
      const contractCurrent =
        gate.status === 'ready' &&
        gate.required === true &&
        approval.status === 'approved' &&
        approvedBundle.bundle_hash === pointer.bundle_hash &&
        approvedBundle.context_gate_hash === pointer.context_gate_hash &&
        rolesCurrent;
      if (!contractCurrent) return [];
    }
    return unique;
  }
  if (nativeAuthority.native) return [];
  const declaredScopeText = [
    goal?.title,
    goal?.description,
    goal?.parsed_requirements,
    goal?.tech_doc?.problem_statement,
    goal?.tech_doc?.recommended_approach,
    ...(Array.isArray(goal?.tech_doc?.functional_requirements)
      ? goal.tech_doc.functional_requirements.map((item) =>
          typeof item === 'string' ? item : item?.requirement
        )
      : []),
    ...(Array.isArray(goal?.tech_doc?.success_criteria) ? goal.tech_doc.success_criteria : []),
  ]
    .filter(Boolean)
    .join(' ');
  const planText = (goal?.plan?.phases || [])
    .flatMap((phase) => [
      phase?.name,
      phase?.description,
      ...(phase?.jobs || []).flatMap((job) => [
        job?.title,
        job?.description,
        job?.requirements,
        ...(Array.isArray(job?.acceptance_criteria) ? job.acceptance_criteria : []),
      ]),
    ])
    .filter(Boolean)
    .join(' ');
  const scopeText = `${declaredScopeText} ${planText}`;
  const inferredRoles = [
    /\b(icps?|ideal customer profiles?|customer personas?|buyer profiles?)\b/i.test(scopeText)
      ? 'Marketing ICP Specialist'
      : null,
    /\b(fixed[- ]price|pricing|prices?|eur packages?|service packages?)\b/i.test(scopeText)
      ? 'Finance Pricing Specialist'
      : null,
    /\b(gdpr|dsgvo|data protection|data processing agreement|avv)\b/i.test(scopeText)
      ? 'GDPR Legal Compliance Specialist'
      : null,
    /\b(outreach|cadence|objection handling|lead generation|cold email|linkedin messages?)\b/i.test(
      scopeText
    )
      ? 'Business Development Sales Specialist'
      : null,
    /\b(commercial risk|risk matrix|mitigation|conversion funnel|kpis?|measurement methodology)\b/i.test(
      scopeText
    )
      ? 'Commercial Risk Analyst'
      : null,
  ].filter(Boolean);
  const declaredRoles = goal?.tech_doc?.required_capabilities || [];
  const idealAgentRoles = (
    goal?.data?.axwise_customer_intelligence?.persona_resolution?.ideal_agent_persona
      ?.required_capabilities || []
  )
    .map(formatExecutionRole)
    .filter((role) => RESEARCH_EXECUTOR_ROLE_VOCABULARY.has(role));
  const inferredRosterIsComplete = inferredRoles.length === RESEARCH_EXECUTOR_ROLE_VOCABULARY.size;
  const roles = [
    ...(inferredRosterIsComplete ? inferredRoles : declaredRoles),
    ...(inferredRosterIsComplete ? declaredRoles : inferredRoles),
    ...idealAgentRoles,
    ...(goal?.plan?.phases || []).flatMap((phase) =>
      (phase.jobs || []).map((job) => job.required_role).filter(Boolean)
    ),
  ];
  const unique = [];
  const seen = new Set();
  for (const value of roles) {
    const role = formatExecutionRole(value).slice(0, 120);
    const key = normalizeRole(role);
    if (!key || seen.has(key) || isLeadershipRole(role)) continue;
    seen.add(key);
    unique.push(role);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Upper bound on how many roles one goal may staff: seven specialists plus a
 * coordinator. Prevents a runaway plan from minting an unbounded roster.
 */
export const MAX_ROSTER_ROLES = 8;

/**
 * The distinct executor roles the CURRENT plan actually demands, in plan order.
 *
 * Deliberately separate from goalRequiredExecutionRoles(): that answers "what
 * did the approved contract request?" and is capped at five with plan roles
 * last, so a plan's own roles get truncated away. This answers "what must exist
 * for these exact task rows to be authorizable?" and is the only list allowed
 * to drive roster materialization and task assignment.
 *
 * Dedupes on roleIdentityKey, not normalizeRole. normalizeRole strips only _
 * and -, so "Marketing/ICP Specialist" and "Marketing ICP Specialist" would
 * mint two agents for one role. normalizeRole must stay as it is because it
 * feeds the Gate 1 contract comparison in goalRequiredExecutionRoles (see the
 * note on roleIdentityKey above).
 *
 * Coordinator roles are returned separately: a plan job asking for a Team Lead
 * can never be authorized (execution-authorization emits
 * task_assigned_to_coordinator), so the caller must reject it upstream rather
 * than write a task row that is dead on arrival.
 */
export function planTaskExecutionRoles(goal) {
  const roles = [];
  const leadershipRoles = [];
  const seen = new Set();
  for (const phase of goal?.plan?.phases || []) {
    for (const job of Array.isArray(phase?.jobs) ? phase.jobs : []) {
      if (!job?.required_role) continue;
      const role = formatExecutionRole(job.required_role).slice(0, 120);
      const key = roleIdentityKey(role);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (isLeadershipRole(role)) leadershipRoles.push(role);
      else roles.push(role);
    }
  }
  return { roles, leadershipRoles };
}

/**
 * Union of the plan's per-task roles and the contract roster, plan first,
 * deduped on role identity. The plan is what must be executable; the contract
 * roster is kept so a goal that has not planned yet still provisions its
 * declared specialists.
 */
export function dedupeExecutionRoles(values = []) {
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const role = formatExecutionRole(value).slice(0, 120);
    const key = roleIdentityKey(role);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(role);
    if (unique.length >= MAX_ROSTER_ROLES) break;
  }
  return unique;
}

/**
 * Match one distinct active agent to each role. A broad multi-capability agent
 * may still cover one role, but cannot hide the absence of every other
 * persistent specialist in the requested roster.
 */
export function matchDistinctAgentsToRoles(agents = [], roles = [], limit = 6) {
  const assignments = [];
  const missing = [];
  const usedAgentIds = new Set();
  const boundedRoles = roles.slice(0, limit);
  for (const role of boundedRoles) {
    const agent = agents.find(
      (candidate) =>
        candidate?.id &&
        !usedAgentIds.has(String(candidate.id)) &&
        agentMatchesRequiredRole(candidate, role)
    );
    if (!agent) {
      missing.push(role);
      continue;
    }
    usedAgentIds.add(String(agent.id));
    assignments.push({ role, agent });
  }
  return { assignments, missing };
}

/**
 * Auto-create agents for required roles when user has none.
 * Checks existing agents in `agents` table first — only creates what's missing.
 * Created agents appear in My Agents page automatically.
 */
async function autoCreateAgentsForRoles(admin, userId, roles, goalTitle) {
  // Room for every role dedupeExecutionRoles can produce, plus the coordinator
  // team-formation appends. This used to be a flat 6, which was an exact no-op
  // back when the roster was capped at 5 + Team Lead. Once the cap rose to
  // MAX_ROSTER_ROLES the slice started silently dropping roles instead — and
  // because 'Team Lead' is appended last it was the first casualty, so any goal
  // needing six or more roles lost its coordinator, failed coverage, and
  // stopped dead on team_coverage_incomplete.
  const uniqueRoles = [...new Set(roles.map(roleName).filter(Boolean))].slice(
    0,
    MAX_ROSTER_ROLES + 1
  );
  if (!uniqueRoles.length) return [];

  // Check which agents already exist in agents table (My Agents)
  const { data: existingAgents } = await admin
    .from('agents')
    .select('id, name, description, category, status, capabilities, cost_per_task, metadata')
    .eq('user_id', userId)
    .eq('status', 'active');

  const existingNames = new Set((existingAgents || []).map((a) => a.name.toLowerCase()));
  const { missing: missingRoles } = matchDistinctAgentsToRoles(
    existingAgents || [],
    uniqueRoles,
    uniqueRoles.length
  );

  // No existing agents — create new ones in agents table for each required role
  const toCreate = [];
  for (const role of missingRoles) {
    const profile = ROLE_PROFILES[normalizeRole(role)] || {
      name: role,
      desc: `Executes ${role} work with explicit acceptance-criteria coverage, evidence, and complete production artifacts.`,
      prompt: `You are a professional ${role}. Produce high-quality, structured, and actionable deliverables.`,
    };

    if (existingNames.has(profile.name.toLowerCase())) continue;

    toCreate.push({
      user_id: userId,
      name: profile.name,
      description: profile.desc,
      category: role,
      status: 'active',
      capabilities: [role],
      cost_per_task: 0,
      pricing_model: 'per_task',
      metadata: {
        source: 'auto-generated',
        role,
        created_for_goal_title: goalTitle,
        system_prompt: `You are ${profile.name}, a professional ${role} agent on the Orqaly platform.\n\n${profile.prompt}\n\nAlways be thorough, structured, and actionable in your output. Use the current task context supplied at execution time; do not carry assumptions between goals.`,
        model: {
          provider: defaultProvider(),
          model: defaultModel(),
          temperature: 0.3,
          max_tokens: 3000,
        },
      },
    });
  }

  const mapAgent = (a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    agent_type: a.category || 'general',
    status: a.status,
    capabilities: a.capabilities || [],
    cost_per_task: a.cost_per_task || 0,
    metadata: a.metadata || {},
  });

  if (!toCreate.length) return (existingAgents || []).map(mapAgent);

  try {
    const { data: created, error } = await admin
      .from('agents')
      .insert(toCreate)
      .select('id, name, description, category, status, capabilities, cost_per_task, metadata');
    if (error) {
      log.warn(null, 'team-assigner.auto-create.insert-failed', { error: error.message });
      return (existingAgents || []).map(mapAgent);
    }
    log.info(null, 'team-assigner.auto-created-agents', {
      count: (created || []).length,
      roles: uniqueRoles,
      names: (created || []).map((a) => a.name),
    });
    return [...(existingAgents || []), ...(created || [])].map(mapAgent);
  } catch (err) {
    log.warn(null, 'team-assigner.auto-create.failed', { error: err.message });
    return (existingAgents || []).map(mapAgent);
  }
}

/**
 * Ensure user-owned, persistent Agent Hub rows exist for a bounded role set.
 * Organization mapping is intentionally handled by team-formation only after
 * it independently verifies the tenant boundary.
 */
export async function ensurePersistentAgentsForRoles(admin, userId, roles, goalTitle) {
  return autoCreateAgentsForRoles(admin, userId, roles, goalTitle);
}

/**
 * Score how well an agent's capabilities match job requirements.
 * @param {object} agent
 * @param {string} jobDescription
 * @param {string} [skillText] — concatenated installed-skill names/content; skill-only
 *   matches get a 1.5× bonus to reward curated specialization. Optional; 2-arg calls
 *   remain valid for backward compatibility.
 */
export function capabilityOverlap(agent, jobDescription, skillText = '') {
  const agentText = [
    agent.name || '',
    agent.description || '',
    agent.agent_type || '',
    ...(Array.isArray(agent.capabilities) ? agent.capabilities : []),
    ...(Array.isArray(agent.metadata?.tools) ? agent.metadata.tools : []),
    ...(Array.isArray(agent.metadata?.skills) ? agent.metadata.skills : []),
    ...(agent.metadata?.model ? [agent.metadata.model.model] : []),
    ...(agent.metadata?.rules ? Object.keys(agent.metadata.rules) : []),
  ]
    .join(' ')
    .toLowerCase();
  const skills = (skillText || '').toLowerCase();

  const words = (jobDescription || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (!words.length) return 0;

  let matches = 0;
  for (const word of words) {
    if (agentText.includes(word)) matches += 1;
    else if (skills && skills.includes(word)) matches += 1.5;
  }
  return matches / words.length;
}

/**
 * Return the active execution team already created for this exact goal.
 *
 * Teams are goal-scoped audit records. Reusing an arbitrary active team would
 * replace its membership and silently change another goal's execution history.
 */
/**
 * Map a team to an organization so it appears under that organization.
 *
 * Nothing in the goal path wrote `org_teams` before this. Only the manual
 * assign dialog (`src/services/orgTeamService.js`) did, which is why an
 * organization could show Agents (7) and Teams (0) after several goals had
 * already formed teams for it.
 *
 * Idempotent: the table carries UNIQUE(org_id, team_id).
 */
export async function registerOrgTeam(admin, userId, orgId, teamId) {
  if (!userId || !orgId || !teamId) return false;
  const { error } = await admin
    .from('org_teams')
    .upsert(
      { user_id: userId, org_id: orgId, team_id: String(teamId) },
      { onConflict: 'org_id,team_id', ignoreDuplicates: true }
    );
  if (error) throw error;
  return true;
}

/**
 * Resolve the organization's standing team, if it has one.
 *
 * A standing team is an `agent_teams` row with `goal_id = NULL`, mapped to the
 * organization through `org_teams`. Migration 192's uniqueness guard is
 * `ON agent_teams (goal_id) WHERE goal_id IS NOT NULL`, so a NULL-goal team
 * sits outside that constraint and may legitimately be shared across goals.
 *
 * Callers must treat the result as read-only membership. Replacing the members
 * of a shared team would silently rewrite the execution history of every other
 * goal that used it — see the warning on findReusableGoalTeam().
 */
export async function findOrgStandingTeam(admin, userId, orgId) {
  if (!userId || !orgId) return null;
  const { data: links, error: linkError } = await admin
    .from('org_teams')
    .select('team_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);
  if (linkError) throw linkError;

  const teamIds = (links || []).map((link) => String(link.team_id)).filter(Boolean);
  if (!teamIds.length) return null;

  const { data, error } = await admin
    .from('agent_teams')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', teamIds)
    .is('goal_id', null)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function findReusableGoalTeam(admin, userId, goalId) {
  const { data, error } = await admin
    .from('agent_teams')
    .select('id, name')
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .eq('is_active', true)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

/**
 * Return the one active team for a goal, creating it when needed.
 *
 * The migration-level partial unique index is the concurrency authority. Two
 * workers can both miss the initial read; the insert loser re-reads the exact
 * goal-scoped winner instead of continuing without a team or borrowing one
 * from another goal.
 */
export async function ensureGoalTeam(admin, goal, userId, leaderId) {
  const desired = {
    name: `Goal: ${goal.title.slice(0, 50)}`,
    description: `Team for goal: ${goal.title}`,
    leader_id: leaderId,
  };
  let team = await findReusableGoalTeam(admin, userId, goal.id);
  let reused = Boolean(team);
  let recoveredFromConflict = false;

  if (!team) {
    const insertResult = await admin
      .from('agent_teams')
      .insert({
        user_id: userId,
        ...desired,
        goal_id: goal.id,
      })
      .select('id, name')
      .single();

    if (insertResult.error) {
      if (insertResult.error.code !== '23505') throw insertResult.error;
      team = await findReusableGoalTeam(admin, userId, goal.id);
      if (!team) {
        const conflictError = new Error(
          `Active team insert conflicted for goal ${goal.id}, but the winning team could not be loaded`
        );
        conflictError.code = '23505';
        throw conflictError;
      }
      reused = true;
      recoveredFromConflict = true;
    } else {
      team = insertResult.data;
    }
  }

  if (reused) {
    const updateResult = await admin
      .from('agent_teams')
      .update({ ...desired, updated_at: new Date().toISOString() })
      .eq('id', team.id)
      .eq('user_id', userId)
      .eq('goal_id', goal.id)
      .eq('is_active', true);
    if (updateResult?.error) throw updateResult.error;
  }

  return {
    teamId: team.id,
    teamName: team.name || desired.name,
    reused,
    recoveredFromConflict,
  };
}

/**
 * Replace memberships only after proving the team belongs to this exact goal.
 * The guard makes a stale/cross-goal team ID fail closed before any delete or
 * insert can mutate another project's execution roster.
 */
export async function replaceGoalTeamMembers(admin, { teamId, goalId, userId, memberIds }) {
  const activeGoalTeam = await findReusableGoalTeam(admin, userId, goalId);
  if (!activeGoalTeam || String(activeGoalTeam.id) !== String(teamId)) {
    throw new Error(`Refusing to mutate team ${teamId}: it is not active for goal ${goalId}`);
  }

  const deleteResult = await admin
    .from('agent_team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (deleteResult?.error) throw deleteResult.error;

  const uniqueMemberIds = [...new Set((memberIds || []).filter(Boolean).map(String))];
  if (!uniqueMemberIds.length) return { memberCount: 0 };

  const memberRows = uniqueMemberIds.map((memberId) => ({
    team_id: teamId,
    member_id: memberId,
    user_id: userId,
  }));
  const upsertResult = await admin
    .from('agent_team_members')
    .upsert(memberRows, { onConflict: 'team_id,member_id', ignoreDuplicates: true });
  if (upsertResult?.error) throw upsertResult.error;
  return { memberCount: memberRows.length };
}

/**
 * Form a team for a goal by selecting complementary agents.
 * @param {object} admin — Supabase admin client
 * @param {object} goal — Goal row
 * @param {string} userId — User ID
 * @param {string[]|null} scopeAgentIds — Optional: restrict to these agent IDs (org-scoped)
 * @param {{persistTeam?: boolean}} options — Set persistTeam=false to return a
 *   goal-owned team proposal without provisioning agents or writing
 *   goal/team/member state. The atomic team-work RPC can then commit that
 *   roster with its formation token.
 * @returns {{ teamId, members }}
 */
export async function formTeam(
  admin,
  goal,
  userId,
  scopeAgentIds = null,
  { persistTeam = true } = {}
) {
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (nativeAuthority.native && !nativeAuthority.ready) {
    log.warn(null, 'team-assigner.native-scope-authority-invalid', {
      goalId: goal?.id,
      reasons: nativeAuthority.reasons,
    });
    return { teamId: null, members: [], authorityIssues: nativeAuthority.reasons };
  }
  const authoritativeGoalTitle = nativeAuthority.native
    ? nativeAuthority.packet.intent.objective
    : goal.title;
  const specialistLimit = nativeAuthority.native ? MAX_ROSTER_ROLES : 5;
  const requestedRoles = goalRequiredExecutionRoles(goal, specialistLimit);
  if (nativeAuthority.native && requestedRoles.length > MAX_ROSTER_ROLES) {
    const authorityIssues = ['native_required_role_roster_exceeds_limit'];
    log.warn(null, 'team-assigner.native-roster-capacity-exceeded', {
      goalId: goal?.id,
      requiredRoleCount: requestedRoles.length,
      maximum: MAX_ROSTER_ROLES,
    });
    return { teamId: null, members: [], authorityIssues };
  }

  // Load available agents from agents table (My Agents page — the workforce)
  const { data: userAgents } = await admin
    .from('agents')
    .select('id, name, description, category, status, capabilities, cost_per_task, metadata')
    .eq('user_id', userId)
    .eq('status', 'active');

  let allAgents = (userAgents || []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    agent_type: a.category || 'general',
    status: a.status,
    capabilities: a.capabilities || [],
    cost_per_task: a.cost_per_task || 0,
    metadata: a.metadata || {},
  }));

  // An array means the caller established an explicit organization boundary.
  // Preserve it even when empty or stale: falling back to the user-wide pool,
  // or auto-creating an unmapped agent, would bypass tenant authorization.
  const hasExplicitScope = Array.isArray(scopeAgentIds);
  if (hasExplicitScope) {
    const scopeSet = new Set(scopeAgentIds.map(String));
    allAgents = allAgents.filter((agent) => scopeSet.has(String(agent.id)));
  }
  allAgents = dedupeExecutionAgents(allAgents);

  if (!hasExplicitScope && persistTeam) {
    // Persistent Agent Hub teams should grow to cover missing specialist roles,
    // even when one generic agent already exists. Reserve one of five slots for
    // an explicit coordinator.
    const rolesToEnsure = [...requestedRoles, 'Team Lead'];
    const foundOrCreated = await autoCreateAgentsForRoles(
      admin,
      userId,
      rolesToEnsure,
      authoritativeGoalTitle
    );
    if (foundOrCreated.length > 0) allAgents = dedupeExecutionAgents(foundOrCreated);
  }

  if (!allAgents.length) {
    if (hasExplicitScope) {
      log.warn(null, 'team-assigner.org-scope-empty', {
        userId,
        goalId: goal.id,
        requestedScopeCount: scopeAgentIds.length,
      });
      return { teamId: null, members: [] };
    }
    // Selection-only formation is deliberately read-only. Missing Agent Hub
    // capacity must surface to the owning stage instead of leaking persistent
    // agent rows from a worker that may later lose its formation CAS.
    if (!persistTeam) {
      log.warn(null, 'team-assigner.selection-only-no-agents', {
        userId,
        goalId: goal.id,
      });
      return { teamId: null, members: [] };
    }
    // No existing agents — check existing teams/agents or auto-create from required roles
    log.info(null, 'team-assigner.no-agents-checking-existing', { userId });
    const foundOrCreated = await autoCreateAgentsForRoles(
      admin,
      userId,
      [...requestedRoles, 'Team Lead'],
      authoritativeGoalTitle
    );
    if (foundOrCreated.length) {
      allAgents.push(...foundOrCreated);
    } else {
      log.warn(null, 'team-assigner.no-agents-after-auto-create', { userId });
      return { teamId: null, members: [] };
    }
  }

  // Load performance data for scoring
  const agentIds = allAgents.map((a) => a.id).filter(Boolean);
  let perfMap = {};
  const skillTextMap = {};
  if (agentIds.length) {
    const [perfResult, skillResult] = await Promise.all([
      admin
        .from('agent_performance')
        .select('agent_id, avg_quality_score, tasks_completed, tasks_failed')
        .in('agent_id', agentIds),
      admin
        .from('agent_installed_skills')
        .select('agent_id, custom_content, agent_skill_packs(name, content)')
        .in('agent_id', agentIds)
        .eq('is_active', true),
    ]);
    for (const p of perfResult.data || []) {
      if (!perfMap[p.agent_id] || p.tasks_completed > (perfMap[p.agent_id].tasks_completed || 0)) {
        perfMap[p.agent_id] = p;
      }
    }
    for (const row of skillResult.data || []) {
      const text = [
        row.agent_skill_packs?.name || '',
        row.custom_content || row.agent_skill_packs?.content || '',
      ].join(' ');
      skillTextMap[row.agent_id] = (skillTextMap[row.agent_id] || '') + ' ' + text;
    }
  }
  const skillsFor = (a) => skillTextMap[a.id] || '';

  // Score against both the local goal plan and AxWise's evidence-backed
  // customer/executor profile. The recommendation remains a bounded signal:
  // Orqaly still chooses only from the current authenticated live catalogue.
  const personaResolution = goal.data?.axwise_customer_intelligence?.persona_resolution;
  const idealPersona = personaResolution?.ideal_agent_persona || {};
  const customerPersona = personaResolution?.customer_persona || {};
  const goalText = (
    nativeAuthority.native
      ? [
          nativeAuthority.packet?.intent?.objective,
          nativeAuthority.packet?.intent?.desired_outcome,
          nativeAuthority.deliverable?.type,
          ...(nativeAuthority.admission?.work_types || []),
          ...(nativeAuthority.admission?.required_capabilities || []),
          ...(nativeAuthority.admission?.requested_actions || []).map((item) => item?.action),
          goal.plan?.strategy,
        ]
      : [
          authoritativeGoalTitle,
          goal.description,
          goal.plan?.strategy,
          customerPersona.name,
          JSON.stringify(customerPersona.profile || {}).slice(0, 2000),
          idealPersona.role,
          ...(idealPersona.required_capabilities || []),
          ...(idealPersona.operating_principles || []),
        ]
  )
    .filter(Boolean)
    .join(' ');
  const axwiseScoreByAgent = new Map(
    (personaResolution?.ranked_agents || []).map((item) => [
      String(item.agent_id),
      Math.max(0, Math.min(1, Number(item.score || 0))),
    ])
  );
  const scoreCandidate = (agent) =>
    capabilityOverlap(agent, goalText, skillsFor(agent)) * 0.8 +
    (axwiseScoreByAgent.get(String(agent.id)) || 0) * 0.2;

  // 1. Keep the approved PO/AxWise specialist contract authoritative. The PM
  // can reference those roles before their persistent rows exist; roster
  // materialization above makes them available by this stage.
  const requiredRoles = new Set(requestedRoles);

  // 2. Track selection decisions for observability
  const decisionLog = {
    requiredRoles: [...requiredRoles],
    axwisePersonaRole: idealPersona.role || null,
    axwiseRecommendedAgentId: personaResolution?.recommended_agent?.agent_id || null,
    matchedRoles: [],
    matchedBySkill: [],
    unmatchedRoles: [],
    fallbackPicks: [],
    leader: null,
  };

  // 3. Match one agent per required role (exact -> fuzzy -> synonym).
  // When multiple agents share a role, skill-overlap breaks the tie so a
  // skilled agent beats an unskilled peer with the same role.
  const selected = [];
  const selectedIds = new Set();
  for (const role of requiredRoles) {
    if (selected.length >= specialistLimit) {
      decisionLog.unmatchedRoles.push(role);
      continue;
    }
    const candidates = allAgents.filter(
      (a) =>
        !selectedIds.has(a.id) &&
        agentMatchesRequiredRole(a, role) &&
        !LEADERSHIP_ROLE_NAMES.has(a.name)
    );
    if (!candidates.length) {
      decisionLog.unmatchedRoles.push(role);
      continue;
    }
    let match = candidates[0];
    let matchedVia = 'role';
    if (candidates.length > 1) {
      // Tie-break by skill overlap against goalText; skills weighted 1.5×
      const ranked = candidates
        .map((a) => ({ agent: a, score: scoreCandidate(a) }))
        .sort((x, y) => y.score - x.score);
      match = ranked[0].agent;
      if (ranked[0].score > 0 && skillsFor(match)) matchedVia = 'role+skill';
    }
    selected.push({ agent: match, score: 1.0 });
    selectedIds.add(match.id);
    decisionLog.matchedRoles.push({ role, agent: match.name, via: matchedVia });
    if (matchedVia === 'role+skill') {
      decisionLog.matchedBySkill.push({ role, agent: match.name });
    }
  }

  // 3b. If the goal needs Brand & Site Research, ensure Browser Automation Lead
  // is on the team — even if the plan didn't list it as a required_role. The
  // planner will inject a phase-0 research task that assumes this agent
  // exists; without it the task would fall back to whichever agent matches
  // by keyword and the research deliverable would be unreliable.
  //
  // Skip this auto-add when goal.data.clone_reference is already populated —
  // the clone-reference stage has done the URL prefetch server-side, so a
  // Browser Automation Lead has nothing left to research. Saves one agent
  // slot and avoids the async browser-task detour that's incompatible with
  // the lightweight ReAct loop.
  const cloneRefPopulated =
    Array.isArray(goal?.data?.clone_reference?.sources) &&
    goal.data.clone_reference.sources.length > 0 &&
    (!nativeAuthority.native ||
      goal.data.clone_reference.scope_hash === nativeAuthority.packet?.scope_hash);
  if (goalNeedsBrandResearch(goal) && !cloneRefPopulated) {
    const balCandidate = allAgents.find(
      (a) =>
        !selectedIds.has(a.id) &&
        (a.name === 'Browser Automation Lead' || matchesRole(a.name, 'Browser Automation Lead'))
    );
    if (balCandidate) {
      selected.push({ agent: balCandidate, score: 1.0 });
      selectedIds.add(balCandidate.id);
      decisionLog.matchedRoles.push({
        role: 'Browser Automation Lead',
        agent: balCandidate.name,
        via: 'auto-research',
      });
    } else {
      decisionLog.unmatchedRoles.push('Browser Automation Lead');
    }
  }

  // 4. Guarantee a Team Lead — prefer Team Lead, fallback Project Manager
  const leaderAgent =
    allAgents.find((a) => a.name === 'Team Lead' && !selectedIds.has(a.id)) ||
    allAgents.find((a) => a.name === 'Project Manager' && !selectedIds.has(a.id));
  if (leaderAgent) {
    selected.push({ agent: leaderAgent, score: 1.0, isLeader: true });
    selectedIds.add(leaderAgent.id);
    decisionLog.leader = leaderAgent.name;
  }

  // 5. Top up with keyword-matched agents if under 2 (ensures minimum viable team)
  if (selected.length < 2) {
    const remaining = allAgents
      .filter((a) => !selectedIds.has(a.id))
      .map((a) => {
        let score = scoreCandidate(a);
        const perf = perfMap[a.id];
        if (perf) {
          if (perf.avg_quality_score >= 70) score *= 1.3;
          else if (perf.avg_quality_score < 50 && perf.tasks_completed >= 2) score *= 0.5;
          if (perf.tasks_completed >= 5) score *= 1.1;
        }
        return { agent: a, score };
      })
      .sort((a, b) => b.score - a.score);
    while (selected.length < 2 && remaining.length) {
      const pick = remaining.shift();
      selected.push(pick);
      selectedIds.add(pick.agent.id);
      decisionLog.fallbackPicks.push(pick.agent.name);
    }
  }

  // 6. Legacy goals retain five specialists plus a coordinator. A current,
  // accepted native contract may use the full bounded canonical roster.
  const sortedSelected = selected
    .sort((a, b) => seniorityRank(a.agent.name) - seniorityRank(b.agent.name))
    .slice(0, specialistLimit + 1);

  const leaderId =
    sortedSelected.find((s) => s.isLeader)?.agent.id || sortedSelected[0]?.agent.id || null;

  // 7. Save decision log to goal.data for observability in the legacy/default
  // persistence mode. Selection-only callers bind the same decision log in
  // their attempt-owned goal update instead.
  if (persistTeam) {
    try {
      await admin
        .from('goals')
        .update({ data: { ...(goal.data || {}), team_formation_log: decisionLog } })
        .eq('id', goal.id);
    } catch (err) {
      log.warn(null, 'team-assigner.decision-log-save-failed', { error: err.message });
    }
  }

  // 8. Coverage warning — surface unmatched roles to the user
  if (decisionLog.unmatchedRoles.length) {
    log.warn(null, 'team-assigner.roles-uncovered', {
      goalId: goal.id,
      unmatched: decisionLog.unmatchedRoles,
    });
    if (persistTeam) {
      await systemAlert(
        admin,
        goal.id,
        `No agent found for roles: ${decisionLog.unmatchedRoles.join(', ')}. Tasks for these roles will fall back to best-available matching.`,
        'warning'
      );
    }
  }

  const proposedTeamBase = {
    user_id: userId,
    goal_id: goal.id,
    name: `Goal: ${String(authoritativeGoalTitle || 'Untitled goal').slice(0, 50)}`,
    description: `Team for goal: ${String(authoritativeGoalTitle || 'Untitled goal')}`,
    leader_id: leaderId,
  };

  // Default behavior creates/reuses the team immediately. Selection-only mode
  // performs only the exact goal-team lookup and returns its ID (when present)
  // as part of the proposal; it never updates goal.data, creates a team, or
  // replaces memberships before the caller's database-owned formation CAS.
  let teamId = null;
  if (persistTeam) {
    try {
      const ensuredTeam = await ensureGoalTeam(admin, goal, userId, leaderId);
      await replaceGoalTeamMembers(admin, {
        teamId: ensuredTeam.teamId,
        goalId: goal.id,
        userId,
        memberIds: sortedSelected.map((selection) => selection.agent.id),
      });
      teamId = ensuredTeam.teamId;
      log.info(
        null,
        ensuredTeam.reused ? 'team-assigner.reusing-goal-team' : 'team-assigner.created',
        {
          teamId,
          name: ensuredTeam.teamName,
          recoveredFromConflict: ensuredTeam.recoveredFromConflict,
        }
      );
    } catch (err) {
      log.warn(null, 'team-assigner.team-ops-failed', { error: err.message });
      // Team creation failed but we still have agents — proceed without team
    }
  } else {
    try {
      teamId = (await findReusableGoalTeam(admin, userId, goal.id))?.id || null;
    } catch (err) {
      log.warn(null, 'team-assigner.goal-team-proposal-lookup-failed', {
        goalId: goal.id,
        error: err.message,
      });
    }
  }

  const proposedTeam = {
    ...(teamId ? { id: teamId } : {}),
    ...proposedTeamBase,
  };

  log.info(null, 'team-assigner.formed', {
    teamId,
    leader: decisionLog.leader,
    members: sortedSelected.map((s) => s.agent.name),
    unmatchedRoles: decisionLog.unmatchedRoles,
    goalId: goal.id,
  });

  return {
    teamId,
    members: sortedSelected.map((s) => s.agent),
    leaderId,
    decisionLog,
    proposedTeam,
  };
}

/**
 * Assign a job to the best matching team member.
 */
export function pickBestAgent(
  members,
  jobDescription,
  requiredRole = null,
  { strict = false } = {}
) {
  if (!members.length) {
    if (strict) return null;
    // Return synthetic agent so tasks are never unassigned
    const roleMatch = (jobDescription || '').match(/role:\s*(\w[\w-]*)/i);
    return { id: null, name: roleMatch?.[1] || 'AI Agent', agent_type: 'general' };
  }

  // Team Lead / Project Manager coordinate — they never execute jobs
  const executors = members.filter((a) => !LEADERSHIP_ROLE_NAMES.has(a.name));
  const pool = executors.length ? executors : members;

  // 1. Exact / fuzzy / synonym role match first
  if (requiredRole) {
    const match = pool.find((a) => agentMatchesRequiredRole(a, requiredRole));
    if (match) return match;
    // A declared role that no in-scope agent can satisfy is an authorization
    // failure, not a scoring problem. Returning the least-bad keyword match
    // here is what produced task_agent_role_mismatch at gate 2: the task row
    // was written with an agent that provably could not do the work.
    if (strict) return null;
  }

  // 2. Fall back to keyword-overlap scoring
  let best = pool[0];
  let bestScore = -1;
  for (const agent of pool) {
    const score = capabilityOverlap(agent, jobDescription);
    if (score > bestScore) {
      bestScore = score;
      best = agent;
    }
  }

  return best;
}
