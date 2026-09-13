import { normalizeToolIds } from './tool-ids.js';

const NO_TOOLS_MODES = new Set(['no-tools', 'no_tools', 'none', 'tool-free', 'tool_free']);
const WITH_TOOLS_MODES = new Set(['with-tools', 'with_tools', 'tools']);

const TOOL_DEPENDENT_TEXT =
  /\b(?:web[- ]?search(?:es|ing)?|search quer(?:y|ies)|browse(?:r| the (?:web|internet))?|online search|external (?:tool|api|connector|source)|api calls?|connectors?|scrap(?:e|ing)|fetch (?:a )?(?:url|live|online)|tool_[a-z0-9_]+|source citations?)\b/i;

export const NO_TOOLS_EXECUTION_CONTRACT = [
  'NO-TOOLS EXECUTION CONTRACT (binding):',
  'Return the deliverable as plain text using only the supplied context and built-in model knowledge.',
  'Never emit, request, describe, or simulate a function call, browser action, web search, API call, connector, or external tool.',
  'Do not claim live research or verified citations. Label externally unverified facts as assumptions and state what would need later verification.',
].join('\n');

const TOOL_FREE_ACCEPTANCE_CRITERION =
  'Uses only supplied context and built-in model knowledge, with externally unverified claims labeled as assumptions.';

/** A user-selected no-tools policy is durable; skip_tools is kept for legacy retries. */
export function goalSkipsTools(goal) {
  return goal?.data?.skip_tools === true || goal?.data?.tool_mode === 'no_tools';
}

/** Project durable task requirements through the goal-level tool policy. */
export function effectiveGoalTaskToolIds(goal, values) {
  const declared = normalizeToolIds(values || []);
  if (goalSkipsTools(goal)) return [];
  if (goal?.data?.tool_mode !== 'existing_only') return declared;
  const allowed = new Set(normalizeToolIds(goal?.data?.required_tools || []));
  return declared.filter((toolId) => allowed.has(toolId));
}

/**
 * Normalize the assistant's goal-creation arguments into the durable goal policy.
 * Explicit structured arguments win; the text fallback protects the boundary when
 * a model omits the optional tool_mode field despite an unambiguous user request.
 */
export function goalCreationRequestsNoTools(args = {}) {
  const mode = String(args.tool_mode || '')
    .trim()
    .toLowerCase();
  if (NO_TOOLS_MODES.has(mode) || args.use_tools === false) return true;
  if (WITH_TOOLS_MODES.has(mode) || args.use_tools === true) return false;

  const text = `${args.title || ''}\n${args.description || ''}`.toLowerCase();
  return [
    /\bno\s+(?:external\s+)?tools?\b/,
    /\bwithout\s+(?:any\s+)?(?:external\s+)?tools?\b/,
    /\b(?:do\s+not|don't|must\s+not)\s+use\s+(?:any\s+)?(?:external\s+)?tools?\b/,
    /\bllm\s+knowledge\s+only\b/,
  ].some((pattern) => pattern.test(text));
}

function scrubToolDependentText(value) {
  if (typeof value !== 'string' || !TOOL_DEPENDENT_TEXT.test(value)) {
    return { value, changed: false };
  }

  const retained = value
    .split(/(?:\r?\n)+|(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !TOOL_DEPENDENT_TEXT.test(part))
    .join(' ')
    .trim();
  const replacement = retained
    ? `${retained} ${TOOL_FREE_ACCEPTANCE_CRITERION}`
    : TOOL_FREE_ACCEPTANCE_CRITERION;
  return { value: replacement, changed: true };
}

function scrubCriteria(criteria, diagnostics) {
  const values = Array.isArray(criteria) ? criteria : [];
  const scrubbed = [
    ...new Set(
      values.map((criterion) => {
        const result = scrubToolDependentText(criterion);
        if (result.changed) diagnostics.scrubbedFields += 1;
        return result.value;
      })
    ),
  ];
  if (!scrubbed.includes(TOOL_FREE_ACCEPTANCE_CRITERION)) {
    scrubbed.push(TOOL_FREE_ACCEPTANCE_CRITERION);
  }
  return scrubbed;
}

/**
 * Treat planner output as untrusted at the durable no-tools boundary.
 *
 * Clearing `tool_requirements` alone is insufficient: a planner can still put
 * "run five web searches" in a description or acceptance criterion, which
 * prompts tool-capable models to emit a function call even when no schema was
 * provided. Remove those instructions and replace them with an explicit,
 * testable tool-free contract before the plan is persisted.
 */
export function enforceNoToolsPlanPolicy(plan) {
  const diagnostics = { clearedToolRequirements: 0, scrubbedFields: 0 };
  if (!plan || !Array.isArray(plan.phases)) return { plan, diagnostics };

  for (const phase of plan.phases) {
    if (!phase || typeof phase !== 'object') continue;
    if (Array.isArray(phase.tool_requirements) && phase.tool_requirements.length > 0) {
      diagnostics.clearedToolRequirements += phase.tool_requirements.length;
    }
    phase.tool_requirements = [];

    const phaseDescription = scrubToolDependentText(phase.description);
    if (phaseDescription.changed) diagnostics.scrubbedFields += 1;
    phase.description = phaseDescription.value;
    phase.acceptance_criteria = scrubCriteria(phase.acceptance_criteria, diagnostics);

    for (const job of Array.isArray(phase.jobs) ? phase.jobs : []) {
      if (!job || typeof job !== 'object') continue;
      if (Array.isArray(job.tool_requirements) && job.tool_requirements.length > 0) {
        diagnostics.clearedToolRequirements += job.tool_requirements.length;
      }
      job.tool_requirements = [];

      for (const field of ['description', 'requirements']) {
        const result = scrubToolDependentText(job[field]);
        if (result.changed) diagnostics.scrubbedFields += 1;
        job[field] = result.value;
      }
      job.acceptance_criteria = scrubCriteria(job.acceptance_criteria, diagnostics);
    }
  }

  return { plan, diagnostics };
}
