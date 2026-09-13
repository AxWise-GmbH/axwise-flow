/**
 * Token-conservation gate. Decides LOCALLY whether a context is worth a network
 * round-trip to AxWise. Chitchat / billing questions never leave Orqaly
 * (Token Conservation Rule). Only copilot.chat is filtered - create/generate/
 * ground always evaluate.
 *
 * Note: read-vs-write tool gating (isReadTool) happens at the copilot loop
 * against a concrete tool name; there is no tool name at message-classification
 * time, so it is intentionally NOT used here.
 */
import { matchSmalltalk } from '../../communicator-handlers/smalltalk.js';

const BILLING_RE = /\b(billing|invoice|receipt|refund|subscription|payment)\b/i;

/**
 * @param {import('./types.js').EvaluationContext} context
 * @returns {boolean} true if AxWise should be called
 */
export function shouldEvaluate(context) {
  if (!context || !context.integrationPoint) return false;
  if (context.integrationPoint !== 'copilot.chat') return true;

  const message = context.payload?.message || '';
  if (!message.trim()) return false;

  // Smalltalk / chitchat → handled locally, never sent.
  if (matchSmalltalk(message)) return false;

  // Pure billing/transactional questions → local, no cognition needed.
  if (BILLING_RE.test(message)) return false;

  return true;
}
