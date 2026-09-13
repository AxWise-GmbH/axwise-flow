import { sha256Hex } from '../../lib/workflow-v2/canonical.js';

export const ASSISTANT_CONTEXT_ENVELOPE_TYPE = 'AssistantContextEnvelopeV1';
export const ASSISTANT_CONTEXT_SOURCE = 'orqaly_assistant_thread';
export const ASSISTANT_CONTEXT_PURPOSE = 'resolve_deictic_goal_instruction';
export const ASSISTANT_CONTEXT_SELECTION_POLICY = 'recent_completed_pairs_retry_folded_utf16_v1';
export const ASSISTANT_CONTEXT_AUTHORITY_POLICY = 'current_over_prior_over_assistant_reference_v1';
export const ASSISTANT_CONTEXT_MAX_PAIRS = 6;
export const ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16 = 4_000;
export const ASSISTANT_CONTEXT_MAX_SOURCE_UTF16 = 24_000;
export const ASSISTANT_CONTEXT_TRUNCATION_MARKER = '\n[assistant context truncated]';

export function utf16Length(value) {
  return String(value).length;
}

export function utf16Prefix(value, maximum) {
  const input = String(value);
  let end = Math.max(0, Math.min(input.length, maximum));
  if (
    end > 0 &&
    end < input.length &&
    input.charCodeAt(end - 1) >= 0xd800 &&
    input.charCodeAt(end - 1) <= 0xdbff &&
    input.charCodeAt(end) >= 0xdc00 &&
    input.charCodeAt(end) <= 0xdfff
  ) {
    end -= 1;
  }
  return input.slice(0, end);
}

function span(request, start, text) {
  return {
    start,
    end: start + utf16Length(text),
    text,
    sha256: sha256Hex(text),
    offsetUnit: 'utf16_code_units',
  };
}

/**
 * Render the one normative UTF-16 source corpus used by CompileScopeV3 spans.
 * Headers are fixed authority labels; message identifiers and timestamps never
 * participate in the source text.
 */
export function renderAssistantContextSourceV1(context) {
  let request = context.instruction.content;
  const instructionSpan = span(request, 0, context.instruction.content);
  const turnSpans = [];

  for (const turn of context.turns) {
    request += '\n\nOWNER_PRIOR\n';
    const userStart = utf16Length(request);
    request += turn.user.content;
    const userSpan = span(request, userStart, turn.user.content);

    request += '\n\nASSISTANT_REFERENCE\n';
    const assistantStart = utf16Length(request);
    request += turn.assistant.content;
    const assistantSpan = span(request, assistantStart, turn.assistant.content);
    turnSpans.push({ user: userSpan, assistant: assistantSpan });
  }

  return { request, instructionSpan, turnSpans };
}
