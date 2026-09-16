import { hasNativeAxwiseScopeMarkers } from './native-scope-approval.js';

const SCOPE_PROCEED_RE =
  /^(?:(?:yes|yeah|yep|yup|sure|ok(?:ay)?|correct|confirmed?|sounds good|looks good|all good|that(?:'s| is) right)(?:\s*[,;:-]?\s*(?:proceed(?:\s+with\s+(?:(?:the|our|these|those)\s+assumptions|the\s+proposed\s+scope))?|continue|go ahead|do it|move on))?|proceed(?:\s+with\s+(?:(?:the|our|these|those)\s+assumptions|the\s+proposed\s+scope))?|continue|go ahead|do it|move on)(?:\s+(?:please|thanks|thank you))?[.!]*$/i;
const SCOPE_CORRECTION_RE =
  /\b(?:actually|although|but|change|correct|except|however|instead|not\s+quite|wrong)\b/i;
const SCOPE_QUESTION_RE =
  /^(?:what|why|how|when|where|who|which|can|could|would|should|will|do|does|did|is|are|am)\b/i;
const SCOPE_DIRECTIVE_QUESTION_RE =
  /^(?:(?:actually|but|however)\s*,?\s*)?(?:can|could|would|will)\s+(?:you|we)\s+(?:change|focus|limit|exclude|include|replace|remove|add|revise|update|switch|set|make|treat|avoid|ensure|rename)\b/i;
const MATERIAL_QUESTION_META_RE =
  /^(?:but\s+)?(?:why\s+(?:do|does|did|is|are|would|should)\b[^?]*(?:need|ask|matter|important)|what\s+(?:do\s+you\s+mean|does\s+this\s+mean)|(?:can|could|would)\s+you\s+(?:explain|clarify))\b/i;

export function isCanonicalAxwiseScopeGoal(goal) {
  return hasNativeAxwiseScopeMarkers(goal);
}

/** Classify a scope-review chat turn without spending a model call. */
export function axwiseScopeChatIntent(value, { materialQuestionActive = false } = {}) {
  const message = String(value || '').trim();
  if (!message) return 'question';
  // A directive phrased as a question still revises scope. Other genuine
  // interrogatives must be classified before broad words such as "correct",
  // "wrong" or "but" so "Is this correct?" remains a question.
  if (SCOPE_DIRECTIVE_QUESTION_RE.test(message)) return 'details';
  // At AxWise's one material-question gate, a proposed choice may naturally
  // be phrased as an interrogative ("Would Germany work?"). Treat it as the
  // answer that rebuilds scope. Only an explicit request to explain/clarify
  // the question remains advisory chat.
  if (materialQuestionActive && !MATERIAL_QUESTION_META_RE.test(message)) return 'details';
  if (message.endsWith('?') || SCOPE_QUESTION_RE.test(message)) return 'question';
  if (SCOPE_PROCEED_RE.test(message)) return 'proceed';
  if (SCOPE_CORRECTION_RE.test(message)) return 'details';
  return 'details';
}
