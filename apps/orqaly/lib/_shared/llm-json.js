/**
 * Shared JSON extraction for LLM output.
 *
 * LLMs wrap JSON in prose / markdown fences, and — the failures this module
 * exists to survive — sometimes:
 *   - get cut off mid-object when they hit the response token cap (observed with
 *     verbose / "thinking" models on the goal feasibility and re-plan calls); or
 *   - emit LITERAL control characters (raw newlines/tabs) inside string values.
 *     JSON forbids unescaped control chars in strings, so `JSON.parse` throws.
 *     Gemini / other "thinking" & local models pretty-print their JSON and put
 *     real line breaks inside a `message`/`thought` value, which used to make the
 *     copilot loop fall back to dumping the raw protocol JSON into the chat.
 *
 * A plain greedy `{...}` match plus JSON.parse returns null on either failure.
 * parseLlmJson tries the clean parse first, then (a) escapes stray control chars
 * inside strings and retries, and (b) repairs an unterminated object/array (close
 * the open string, drop the dangling key/comma, append the missing brackets) so a
 * truncated- or control-char-polluted-but-otherwise-valid response still yields
 * the fields the caller needs.
 */

/**
 * Repair a JSON string that was truncated before it finished (open string,
 * missing closing brackets, trailing comma/dangling key). Returns a
 * best-effort closed string, or null if nothing salvageable.
 */
function repairTruncatedJson(raw) {
  const start = raw.search(/[{[]/);
  if (start === -1) return null;
  const s = raw.slice(start);

  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  let out = s;
  // Close a string left open by the truncation.
  if (inString) out += '"';
  // Drop trailing whitespace, then a dangling `"key":` or trailing comma that
  // would make the appended closers invalid.
  out = out.replace(/\s+$/, '');
  out = out.replace(/,\s*"[^"]*"\s*:\s*$/, ''); // "…, "partialKey":"
  out = out.replace(/"[^"]*"\s*:\s*$/, '');     // leading "partialKey":"
  out = out.replace(/[,:]\s*$/, '');            // trailing comma or colon
  // Append the closers for every still-open bracket, innermost first.
  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === '{' ? '}' : ']';
  }
  return out;
}

/**
 * Escape raw control characters (< 0x20) that appear INSIDE string values so a
 * payload with literal newlines/tabs becomes valid JSON. Structural whitespace
 * (between tokens, outside strings) is left untouched. Uses the same
 * inString/escaped scanner as repairTruncatedJson.
 */
function escapeControlCharsInStrings(raw) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      const code = raw.charCodeAt(i);
      if (code < 0x20) {
        if (ch === '\n') out += '\\n';
        else if (ch === '\r') out += '\\r';
        else if (ch === '\t') out += '\\t';
        else if (ch === '\b') out += '\\b';
        else if (ch === '\f') out += '\\f';
        else out += '\\u' + code.toString(16).padStart(4, '0');
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

/**
 * Try to parse a JSON object/array out of arbitrary LLM text.
 * Handles markdown code fences, raw control chars inside strings, and truncated
 * (token-capped) output. Returns the parsed value, or null when nothing
 * parseable is found.
 */
export function parseLlmJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // Anchor on the FIRST bracket so a truncated object that contains an array
  // (e.g. `{ "phases": ["…` ) is repaired as an object rather than having the
  // greedy array fallback hijack it and return the inner array.
  const firstIdx = trimmed.search(/[{[]/);
  if (firstIdx === -1) return null;
  const rootIsObject = trimmed[firstIdx] === '{';

  const cleanRe = rootIsObject ? /\{[\s\S]*\}/ : /\[[\s\S]*\]/;
  const cleanMatch = trimmed.match(cleanRe);
  if (cleanMatch) {
    try {
      return JSON.parse(cleanMatch[0]);
    } catch { /* fall through to control-char escape, then repair */ }
    // Literal newline/tab inside a string value (Gemini/thinking/local models).
    try {
      return JSON.parse(escapeControlCharsInStrings(cleanMatch[0]));
    } catch { /* fall through to repair */ }
  }

  // No complete object/array parsed — the payload was likely truncated. Try to
  // close it and parse the salvageable prefix (also escaping stray control
  // chars, since a truncated payload can carry both problems at once).
  const repaired = repairTruncatedJson(trimmed);
  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch { /* try once more with control chars escaped */ }
    try {
      return JSON.parse(escapeControlCharsInStrings(repaired));
    } catch { /* give up */ }
  }
  return null;
}
