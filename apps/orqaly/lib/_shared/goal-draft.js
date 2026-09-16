/**
 * [module: shared]
 * The one place goal.create arguments are completed.
 *
 * The copilot proposes goal.create long before it knows the title or the budget
 * - it may ask for them and offer the action in the same turn. The defaults used
 * to live inside the executor, so the confirmation card showed nothing and the
 * user only met "New Project Goal, $10" after the row existed and the pipeline
 * was already running. Both the proposal builder (lib/agent-handlers/copilot.js)
 * and executeToolCall (lib/communicator-handlers/assistant-bridge.js) call this,
 * so what the card shows is exactly what gets inserted.
 */
import { normalizeGoalComplexity } from './goal-complexity.js';

export const DEFAULT_GOAL_BUDGET_USD = 10;
export const DEFAULT_GOAL_TITLE = 'New goal';
const TITLE_FROM_DESCRIPTION_CHARS = 60;

/** First sentence-ish slice of a description, usable as a title. */
function titleFromDescription(description) {
  const text = String(description || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= TITLE_FROM_DESCRIPTION_CHARS) return text;
  const cut = text.slice(0, TITLE_FROM_DESCRIPTION_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Complete a goal.create argument bag.
 *
 * @param {object} args Raw arguments as proposed by the model.
 * @returns {{ args: object, draftFields: string[] }} The completed arguments and
 *   the names of the fields this filled in rather than the model stating them -
 *   the UI marks those as a draft so a placeholder never looks like a decision.
 */
export function draftGoalCreateArgs(args = {}) {
  const source = args && typeof args === 'object' ? args : {};
  const draftFields = [];

  const statedTitle = String(source.title || '').trim();
  let title = statedTitle;
  if (!title) {
    title = titleFromDescription(source.description);
    draftFields.push('title');
  }
  if (!title) title = DEFAULT_GOAL_TITLE;

  const statedBudget = source.budget_usd ?? source.budget;
  const parsedBudget = Number(statedBudget);
  let budget_usd = parsedBudget;
  if (statedBudget === undefined || statedBudget === null || !Number.isFinite(parsedBudget)) {
    budget_usd = DEFAULT_GOAL_BUDGET_USD;
    draftFields.push('budget_usd');
  }

  if (!String(source.complexity || '').trim()) draftFields.push('complexity');
  const complexity = normalizeGoalComplexity(source.complexity);

  return {
    args: { ...source, title, description: source.description || '', budget_usd, complexity },
    draftFields,
  };
}

export default draftGoalCreateArgs;
