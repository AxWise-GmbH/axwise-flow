import { parseLlmJson } from './llm-json.js';

export const MAX_REPAIR_SOURCE_CHARS = 20_000;

export class LlmJsonRepairSourceTooLargeError extends Error {
  constructor(sourceChars) {
    super(
      `LLM_JSON_REPAIR_SOURCE_TOO_LARGE: refusing to repair ${sourceChars} characters; ` +
        `maximum is ${MAX_REPAIR_SOURCE_CHARS}.`
    );
    this.name = 'LlmJsonRepairSourceTooLargeError';
    this.code = 'LLM_JSON_REPAIR_SOURCE_TOO_LARGE';
    this.sourceChars = sourceChars;
    this.maxSourceChars = MAX_REPAIR_SOURCE_CHARS;
  }
}

/**
 * Build a bounded, data-preserving retry prompt for a response that was meant
 * to be JSON. The retry is deliberately a repair operation, not a second
 * attempt at the underlying task, so quoted evidence and field values are not
 * re-invented.
 */
export function buildJsonRepairPrompt(content) {
  const source = String(content || '');
  if (source.length > MAX_REPAIR_SOURCE_CHARS) {
    throw new LlmJsonRepairSourceTooLargeError(source.length);
  }

  return [
    'Repair the response below into one valid JSON value.',
    'Preserve every field name, value, quote, source identifier, and numeric value exactly.',
    'Do not add facts, commentary, markdown, or code fences. Return JSON only.',
    '',
    '<invalid_json_response>',
    source,
    '</invalid_json_response>',
  ].join('\n');
}

/** True only when JSON mode produced no parseable JSON value. */
export function needsJsonRepair(content) {
  return parseLlmJson(content) === null;
}

/**
 * Aggregate provider usage from the original call and its one repair call.
 * Gemini/OpenAI may include nested token-detail objects, so merge recursively
 * and add every numeric counter instead of only the three legacy totals.
 */
export function aggregateLlmUsage(first = {}, second = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(first || {}), ...Object.keys(second || {})])) {
    const a = first?.[key];
    const b = second?.[key];
    if (typeof a === 'number' || typeof b === 'number') {
      out[key] = (typeof a === 'number' ? a : 0) + (typeof b === 'number' ? b : 0);
    } else if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      out[key] = aggregateLlmUsage(a, b);
    } else {
      out[key] = b ?? a;
    }
  }
  return out;
}
