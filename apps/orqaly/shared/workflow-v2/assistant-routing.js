const EXPLICIT_CONTINUE = new RegExp(
  String.raw`\b(?:continue|resume|reopen|pick\s+up)\b[\s\S]{0,30}\b(?:goal|project|workflow)\b|^(?:resume\s+where\s+we\s+left\s+off|keep\s+going|go\s+on|pick\s+up\s+where\s+we\s+left\s+off)[.!?\s]*$`,
  'i'
);
const GOAL_NOUN = /\b(?:goal|project|workflow)\b/i;
const EXPLICIT_START = new RegExp(
  String.raw`\b(?:start|create|launch|open|run|make|turn\s+(?:this|it)\s+into)\b[\s\S]{0,40}\b(?:goal|project|workflow)\b`,
  'i'
);
const DURABLE_WORK = new RegExp(
  String.raw`\b(?:background|long[- ]running|ongoing|monitor|watch|track|keep\s+checking|every\s+(?:day|week|month)|daily|weekly|monthly|until\b|over\s+the\s+next|multi[- ](?:step|stage)|multiple\s+(?:steps|stages)|dependent\s+(?:steps|stages)|after\s+that|once\s+.+\s+then|approval\s+(?:gate|step|required)|approve\s+each|use\s+(?:multiple\s+)?agents?\b|use\s+(?:multiple\s+)?tools?\b|material\s+budget|spend\s+(?:up\s+to\s+)?[$€£]?\d+)\b`,
  'i'
);
const BOUNDED_WORK =
  /\b(?:research|compare|comparison|investigate|investigation|analy[sz]e|analysis|memo|brief|report|prd|requirements?|strategy|draft|write|summari[sz]e|evaluate|review|recommend|plan|outline)\b/i;
const VERIFICATION_REQUEST = new RegExp(
  String.raw`\b(?:check|verify|confirm)\b[\s\S]{0,80}\b(?:actually|really|current|latest|online|sources?|in\s+production)\b`,
  'i'
);
const AUTHORITATIVE_SOURCE_OBJECT = new RegExp(
  String.raw`\b(?:official|authoritative|primary|grounded|verified)\b[^.!?;\n]{0,60}\b(?:documentation|docs?|citations?|sources?)\b(?![\s-]+(?:code|files?|maps?)\b)`,
  'gi'
);
const AUTHORITATIVE_SOURCE_ACTION =
  /\b(?:using|use|from|according\s+to|based\s+on|cite|include|provide)\b/i;
const CITATION_REQUEST = new RegExp(
  String.raw`\b(?:cite|provide)\b[^.!?;\n]{0,50}\b(?:citations?|sources?\b(?![\s-]+(?:code|files?|maps?)\b)|source\s+links?)\b|\binclude\b[^.!?;\n]{0,50}\b(?:citations?|source\s+links?)\b`,
  'gi'
);
const NEGATED_SOURCE_ACTION_PREFIX =
  /\b(?:do\s+not|don't|never|avoid|omit|exclude|no\s+need\s+to)\s+(?:(?:again|ever)\s+){0,2}(?:cite|include|provide|use|using)\b[^,–—.!?;\n]{0,45}$/i;
const NEGATED_OBJECT_PREFIX =
  /\b(?:no|not|without|avoid|exclude|omit|except|other\s+than)(?:\s+(?:any|only|the))?\s*$/i;
const NEGATED_CITATION_ACTION_PREFIX =
  /\b(?:do\s+not|don't|never|avoid|omit|exclude|no\s+need\s+to)\s+(?:(?:again|ever)\s+){0,2}$/i;
const NEGATION_WITHIN_SOURCE_REQUEST = /\b(?:no|not|without|except|other\s+than)\b/i;

function affirmativeSourceRequestInClause(clause) {
  for (const match of clause.matchAll(AUTHORITATIVE_SOURCE_OBJECT)) {
    const clausePrefix = clause.slice(0, match.index);
    if (
      NEGATED_SOURCE_ACTION_PREFIX.test(clausePrefix) ||
      NEGATED_OBJECT_PREFIX.test(clausePrefix)
    ) {
      continue;
    }
    if (
      AUTHORITATIVE_SOURCE_ACTION.test(clausePrefix) ||
      /^\s*(?:only\s+)?$/iu.test(clausePrefix)
    ) {
      return true;
    }
  }
  for (const match of clause.matchAll(CITATION_REQUEST)) {
    if (
      !NEGATED_CITATION_ACTION_PREFIX.test(clause.slice(0, match.index)) &&
      !NEGATION_WITHIN_SOURCE_REQUEST.test(match[0])
    ) {
      return true;
    }
  }
  return false;
}

function requestsGroundedSources(message) {
  return message
    .split(/[.!?;\n]|\b(?:but|however|instead)\b/iu)
    .some((clause) => affirmativeSourceRequestInClause(clause));
}
const VAGUE_REQUEST =
  /^(?:help(?:\s+me)?|do\s+it|do\s+this|make\s+it|something|i\s+need\s+help|can\s+you\s+help)[.!?\s]*$/i;

// These phrases refer to an answer already in the transcript. They must be checked before
// bounded-work nouns such as "plan" so a conversational follow-up does not start new research.
const CONTEXTUAL_FOLLOW_UP = new RegExp(
  String.raw`\b(?:tell\s+me\s+more|say\s+more|expand\s+on|elaborate\s+on|go\s+deeper|more\s+details?|(?:that|this)\s+(?:answer|idea|plan|proposal|result|recommendation|strategy))\b|\b(?:expand|elaborate|explain\s+(?:that|this|it)|walk\s+me\s+through\s+(?:that|this|it))[.!?\s]*$`,
  'i'
);

export const ASSISTANT_ROUTE_POLICY_VERSIONS = Object.freeze([
  'orqaly.assistant-route-policy.v1',
  'orqaly.assistant-route-policy.v2',
]);
export const ASSISTANT_ROUTE_POLICY_VERSION = ASSISTANT_ROUTE_POLICY_VERSIONS.at(-1);

export const ASSISTANT_ROUTE_REASON_CODES = Object.freeze([
  'requested_goal',
  'requested_research',
  'active_goal_continue',
  'explicit_goal_start',
  'contextual_follow_up',
  'context_required',
  'grounded_sources_requested',
  'verification_requested',
  'durable_work',
  'bounded_research',
  'assistant_direct',
  'auto_direct',
]);

function routeDecision(route, reasonCode) {
  return {
    route,
    policyVersion: ASSISTANT_ROUTE_POLICY_VERSION,
    reasonCode,
  };
}

/**
 * Deterministic ownership boundary: Orqaly chooses the route; the cognition service only
 * executes conversational/research turns. Existing Goal and conversation state are inputs.
 */
export function resolveAssistantTurnRoute(
  message,
  { activeGoalRunId = null, hasPriorAssistantReply = false, intent = 'auto' } = {}
) {
  const normalized = String(message || '').trim();
  if (!normalized) throw new Error('assistant message is required');

  if (intent === 'goal') return routeDecision('START_GOAL', 'requested_goal');
  if (intent === 'research') return routeDecision('AXWISE_ONE_SHOT', 'requested_research');

  if (intent === 'assistant') {
    if (activeGoalRunId && EXPLICIT_CONTINUE.test(normalized)) {
      return routeDecision('CONTINUE_GOAL', 'active_goal_continue');
    }
    if (
      EXPLICIT_START.test(normalized) ||
      (/\bgoal\b/i.test(normalized) && /\blet'?s\s+do\s+it\b/i.test(normalized))
    ) {
      return routeDecision('START_GOAL', 'explicit_goal_start');
    }
    if (CONTEXTUAL_FOLLOW_UP.test(normalized)) {
      return hasPriorAssistantReply
        ? routeDecision('DIRECT_ANSWER', 'contextual_follow_up')
        : routeDecision('DISCOVER', 'context_required');
    }
    if (
      VAGUE_REQUEST.test(normalized) ||
      (GOAL_NOUN.test(normalized) && normalized.split(/\s+/u).length < 4)
    ) {
      return routeDecision('DISCOVER', 'context_required');
    }
    return routeDecision('DIRECT_ANSWER', 'assistant_direct');
  }

  if (activeGoalRunId && EXPLICIT_CONTINUE.test(normalized)) {
    return routeDecision('CONTINUE_GOAL', 'active_goal_continue');
  }
  if (
    EXPLICIT_START.test(normalized) ||
    (/\bgoal\b/i.test(normalized) && /\blet'?s\s+do\s+it\b/i.test(normalized))
  ) {
    return routeDecision('START_GOAL', 'explicit_goal_start');
  }
  const contextualFollowUp = CONTEXTUAL_FOLLOW_UP.test(normalized);
  if (DURABLE_WORK.test(normalized) && !contextualFollowUp) {
    return routeDecision('PROPOSE_GOAL', 'durable_work');
  }
  if (requestsGroundedSources(normalized)) {
    return routeDecision('AXWISE_ONE_SHOT', 'grounded_sources_requested');
  }
  if (contextualFollowUp) {
    return hasPriorAssistantReply
      ? routeDecision('DIRECT_ANSWER', 'contextual_follow_up')
      : routeDecision('DISCOVER', 'context_required');
  }
  if (VERIFICATION_REQUEST.test(normalized)) {
    return routeDecision('AXWISE_ONE_SHOT', 'verification_requested');
  }
  if (
    VAGUE_REQUEST.test(normalized) ||
    (GOAL_NOUN.test(normalized) && normalized.split(/\s+/u).length < 4)
  ) {
    return routeDecision('DISCOVER', 'context_required');
  }
  if (BOUNDED_WORK.test(normalized)) {
    return routeDecision('AXWISE_ONE_SHOT', 'bounded_research');
  }
  return routeDecision('DIRECT_ANSWER', 'auto_direct');
}

export function routeAssistantTurn(message, context) {
  return resolveAssistantTurnRoute(message, context).route;
}
