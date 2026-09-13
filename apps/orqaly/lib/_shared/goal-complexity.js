// The production goals_complexity_check constraint is intentionally binary.
// Treat mid-tier aliases conservatively as complex so assistant/UI vocabulary
// can never leak an unsupported value into the database or under-plan a goal.
const GOAL_COMPLEXITY_ALIASES = Object.freeze({
  simple: 'simple',
  low: 'simple',
  moderate: 'complex',
  medium: 'complex',
  standard: 'complex',
  complex: 'complex',
  high: 'complex',
  advanced: 'complex',
});

export function normalizeGoalComplexity(value) {
  return (
    GOAL_COMPLEXITY_ALIASES[
      String(value || 'simple')
        .trim()
        .toLowerCase()
    ] || 'simple'
  );
}
