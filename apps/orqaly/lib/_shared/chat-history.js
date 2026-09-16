/**
 * Chat history windowing — turn a stored/echoed assistant conversation into the
 * most recent turns that fit a budget, as real {role, content} LLM turns.
 *
 * Why this exists: the assistant used to inject only the last 6 messages as a
 * text blob in the system prompt, so the model never saw the start of a
 * conversation (e.g. it answered "what was my first message?" wrong). Passing
 * history as real turns — capped by turn-count and a char budget — lets the
 * model actually read the conversation. When older turns are dropped we flag
 * `omitted` so callers never let the model claim a false "first message".
 */

const DEFAULTS = { maxTurns: 40, maxChars: 12_000, perMessageChars: 4_000 };

/**
 * @param {Array<{role?:string, content?:string, text?:string}>} history
 * @param {{maxTurns?:number, maxChars?:number, perMessageChars?:number}} [opts]
 * @returns {{ turns: Array<{role:'user'|'assistant', content:string}>, omitted: boolean }}
 */
export function windowHistory(history, opts = {}) {
  const { maxTurns, maxChars, perMessageChars } = { ...DEFAULTS, ...opts };
  if (!Array.isArray(history) || history.length === 0) return { turns: [], omitted: false };

  const normalized = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? m.text ?? '').slice(0, perMessageChars),
    }))
    .filter((m) => m.content);

  // Keep the newest turns (the tail) within both budgets, then restore order.
  const kept = [];
  let total = 0;
  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const turn = normalized[i];
    if (kept.length >= maxTurns) break;
    if (kept.length > 0 && total + turn.content.length > maxChars) break;
    kept.push(turn);
    total += turn.content.length;
  }
  kept.reverse();

  return { turns: kept, omitted: kept.length < normalized.length };
}

/** One-line system note appended when the earliest turns were dropped. */
export const OMITTED_HISTORY_NOTE =
  '(Note: earlier messages in this conversation were omitted to fit the context window. Do not claim to know the very first message — if the user asks about content not shown above, offer to search their past conversations.)';
