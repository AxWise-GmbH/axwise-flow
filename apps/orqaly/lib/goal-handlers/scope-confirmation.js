import { createHash } from 'node:crypto';

export const OWNER_SCOPE_CONFIRMATION_PROVENANCE = 'user_confirmed_assumption';
export const LEGACY_AXWISE_CLARIFICATION_QUESTIONS = Object.freeze([
  'Who specifically experiences the problem, who decides, and who benefits?',
  'What observable or measurable outcome would count as success?',
  'Which existing evidence, constraints, or facts should the team rely on?',
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => key !== 'scope_hash')
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

export function customerScopeHash(decisionId, scope) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        decision_id: String(decisionId || ''),
        scope: stableValue(scope || {}),
      })
    )
    .digest('hex');
}

function answerText(answer) {
  return String(answer && typeof answer === 'object' ? answer.answer : answer || '').trim();
}

export function hasCompleteLegacyClarification(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  if (
    intelligence.status !== 'human_clarification' ||
    !String(intelligence.decision_id || '').trim() ||
    intelligence.clarification_scope
  ) {
    return false;
  }
  const intelligenceQuestions = Array.isArray(intelligence.clarification_questions)
    ? intelligence.clarification_questions
    : [];
  const questions = intelligenceQuestions.length
    ? intelligenceQuestions
    : Array.isArray(goal?.data?.po_questions)
      ? goal.data.po_questions
      : [];
  const exactLegacyQuestions =
    questions.length === LEGACY_AXWISE_CLARIFICATION_QUESTIONS.length &&
    questions.every(
      (question, index) =>
        String(question || '').trim() === LEGACY_AXWISE_CLARIFICATION_QUESTIONS[index]
    );
  if (!exactLegacyQuestions) return false;
  const answers = Array.isArray(goal?.data?.po_answers) ? goal.data.po_answers : [];
  return (
    questions.length > 0 &&
    answers.length >= questions.length &&
    questions.every((question, index) => {
      const persistedQuestion = String(
        (answers[index] && typeof answers[index] === 'object' ? answers[index].question : '') ||
          goal?.data?.po_questions?.[index] ||
          ''
      ).trim();
      return (
        answerText(answers[index]).length >= 2 &&
        persistedQuestion === String(question || '').trim()
      );
    })
  );
}
