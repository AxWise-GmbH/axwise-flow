function tryParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

function isMarkdownTable(text) {
  const lines = String(text || '')
    .trim()
    .split('\n')
    .map((l) => l.trim());
  if (lines.length < 2) return false;
  const hasPipes = lines.every((l) => l.includes('|'));
  const hasDivider = lines.some((l) => /^\|?[\s:-]+\|[\s|:-]*$/.test(l));
  return hasPipes && hasDivider;
}

export function classifyAssistantOutput(content) {
  const text = String(content || '').trim();
  if (!text) return { type: 'text', value: '' };

  const fence = text.match(/^```([a-z0-9_-]+)?\n([\s\S]*?)\n```$/i);
  if (fence) {
    return {
      type: 'code',
      language: fence[1] || 'text',
      value: fence[2],
    };
  }

  const jsonPretty = tryParseJson(text);
  if (jsonPretty) {
    return { type: 'json', value: jsonPretty };
  }

  if (isMarkdownTable(text)) {
    return { type: 'table', value: text };
  }

  return { type: 'text', value: text };
}

/** Shown instead of a leaked internal protocol object. */
export const PROTOCOL_FALLBACK_MESSAGE = "I couldn't format that answer. Please try asking again.";

/**
 * True when text is the copilot's INTERNAL read/answer protocol JSON leaked as a
 * chat reply (e.g. `{ "action": "answer", "message": …, "proposedActions": … }`).
 * Regex-based so it also catches malformed JSON (raw newlines) that JSON.parse
 * rejects. Deliberately narrow — only the protocol shape — so JSON a user
 * actually asked for is never hidden.
 */
export function isLeakedProtocolJson(content) {
  const t = String(content || '').trim();
  const body = t.replace(/^```[a-z0-9_-]*\s*/i, '').replace(/\s*```$/, '').trim();
  if (!body.startsWith('{')) return false;
  const hasProtocolAction = /"action"\s*:\s*"(read|answer)"/.test(body);
  const hasProtocolField = /"(calls|proposedActions|thought)"\s*:/.test(body);
  return hasProtocolAction && (hasProtocolField || /"message"\s*:/.test(body));
}

/** Return a user-safe reply: the original text, unless it's a leaked protocol blob. */
export function safeAssistantReply(content) {
  return isLeakedProtocolJson(content) ? PROTOCOL_FALLBACK_MESSAGE : String(content ?? '');
}
