import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  ASSISTANT_CONTEXT_AUTHORITY_POLICY,
  ASSISTANT_CONTEXT_ENVELOPE_TYPE,
  ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16,
  ASSISTANT_CONTEXT_MAX_PAIRS,
  ASSISTANT_CONTEXT_MAX_SOURCE_UTF16,
  ASSISTANT_CONTEXT_PURPOSE,
  ASSISTANT_CONTEXT_SELECTION_POLICY,
  ASSISTANT_CONTEXT_SOURCE,
  ASSISTANT_CONTEXT_TRUNCATION_MARKER,
  renderAssistantContextSourceV1,
  utf16Length,
  utf16Prefix,
} from '../../shared/workflow-v2/assistant-context-envelope.js';

export const ASSISTANT_CONTEXT_MAX_MESSAGES = 20;
export const ASSISTANT_CONTEXT_MAX_MESSAGE_CHARACTERS = 24_000;
export const ASSISTANT_CONTEXT_MAX_CHARACTERS = 120_000;

function orderedMessages(messages) {
  const roleOrder = { user: 0, assistant: 1 };
  return [...messages].sort((left, right) => {
    const createdAt = left.createdAt.localeCompare(right.createdAt);
    if (createdAt) return createdAt;
    const turnId = left.turnId.localeCompare(right.turnId);
    if (turnId) return turnId;
    const role = roleOrder[left.role] - roleOrder[right.role];
    return role || left.id.localeCompare(right.id);
  });
}

function conversationalContent(message, maxMessageCharacters) {
  return message.parts
    .filter((part) => part.type === 'text' || part.type === 'artifact')
    .map((part) => part.markdown)
    .join('\n\n')
    .trim()
    .slice(0, maxMessageCharacters);
}

function retryChain(root, retryChildren) {
  const chain = [root];
  const seen = new Set([root.turnId]);
  let current = root;
  while (retryChildren.has(current.turnId)) {
    const child = retryChildren.get(current.turnId);
    if (seen.has(child.turnId)) break;
    chain.push(child);
    seen.add(child.turnId);
    current = child;
  }
  return chain;
}

function publicMessageHash(message) {
  const { contentHash: _contentHash, ...publicMessage } = message;
  return canonicalHash(publicMessage);
}

function goalContextContent(message) {
  const parts = message.parts.filter((part) => part.type === 'text' || part.type === 'artifact');
  const fullContent = parts
    .map((part) => part.markdown)
    .join('\n\n')
    .trim();
  if (!fullContent) return null;

  const contentKinds = ['text', 'artifact'].filter((kind) =>
    parts.some((part) => part.type === kind)
  );
  const truncated = utf16Length(fullContent) > ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16;
  const content = truncated
    ? `${utf16Prefix(
        fullContent,
        ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16 - utf16Length(ASSISTANT_CONTEXT_TRUNCATION_MARKER)
      )}${ASSISTANT_CONTEXT_TRUNCATION_MARKER}`
    : fullContent;

  return {
    messageId: message.id,
    turnId: message.turnId,
    contentKinds,
    content,
    contentSha256: sha256Hex(content),
    sourceMessageHash: publicMessageHash(message),
    truncated,
  };
}

function isFailedOrCancelledAssistant(message) {
  return message.parts.some(
    (part) => part.type === 'operation_status' && ['failed', 'cancelled'].includes(part.status)
  );
}

function goalContextPair(user, assistantByTurn, retryChildren) {
  const userExcerpt = goalContextContent(user);
  if (!userExcerpt) return null;
  let completedAssistant = null;
  let assistantExcerpt = null;
  for (const attempt of retryChain(user, retryChildren).reverse()) {
    const candidate = assistantByTurn.get(attempt.turnId);
    if (!candidate || isFailedOrCancelledAssistant(candidate)) continue;
    const projection = goalContextContent(candidate);
    if (!projection) continue;
    completedAssistant = candidate;
    assistantExcerpt = projection;
    break;
  }
  if (!completedAssistant || !assistantExcerpt) return null;

  return {
    rootTurnId: user.turnId,
    route: user.route,
    user: {
      ...userExcerpt,
      authority: 'owner_prior',
      provenance: 'persisted_owner_message',
    },
    assistant: {
      ...assistantExcerpt,
      authority: 'assistant_reference',
      provenance: completedAssistant.axwiseOperationId
        ? 'axwise_operation_output'
        : 'orqaly_local_output',
    },
  };
}

function renderGoalContext(instruction, turns) {
  return renderAssistantContextSourceV1({ instruction: { content: instruction }, turns });
}

/**
 * Compile the immutable, authority-labelled source used to resolve a deictic Goal instruction.
 * The browser supplies only the current instruction; every historical excerpt and provenance
 * binding is derived from the authenticated, persisted thread on the server.
 */
export function compileAssistantGoalContext(messages, rootTurnId, instruction) {
  if (typeof instruction !== 'string' || !instruction.length) {
    throw new TypeError('assistant Goal instruction is required');
  }
  if (utf16Length(instruction) > ASSISTANT_CONTEXT_MAX_SOURCE_UTF16) {
    throw new RangeError('assistant Goal instruction exceeds the context source limit');
  }

  const ordered = orderedMessages(messages);
  const rootIndex = ordered.findIndex(
    (message) => message.turnId === rootTurnId && message.role === 'user'
  );
  if (rootIndex < 0) return null;
  const current = ordered[rootIndex];
  const prior = ordered.slice(0, rootIndex);
  const assistantByTurn = new Map(
    prior
      .filter((message) => message.role === 'assistant')
      .map((message) => [message.turnId, message])
  );
  const retryChildren = new Map(
    prior
      .filter((message) => message.role === 'user' && message.retryOfTurnId)
      .map((message) => [message.retryOfTurnId, message])
  );
  const pairs = prior
    .filter((message) => message.role === 'user' && !message.retryOfTurnId)
    .map((user) => goalContextPair(user, assistantByTurn, retryChildren))
    .filter(Boolean);

  const selected = [];
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    if (selected.length >= ASSISTANT_CONTEXT_MAX_PAIRS) break;
    const candidate = [pairs[index], ...selected];
    if (
      utf16Length(renderGoalContext(instruction, candidate).request) >
      ASSISTANT_CONTEXT_MAX_SOURCE_UTF16
    ) {
      break;
    }
    selected.unshift(pairs[index]);
  }

  const rendered = renderGoalContext(instruction, selected);
  const turns = selected.map((turn, index) => ({
    ...turn,
    user: { ...turn.user, sourceSpan: rendered.turnSpans[index].user },
    assistant: { ...turn.assistant, sourceSpan: rendered.turnSpans[index].assistant },
  }));
  const envelope = {
    type: ASSISTANT_CONTEXT_ENVELOPE_TYPE,
    source: ASSISTANT_CONTEXT_SOURCE,
    purpose: ASSISTANT_CONTEXT_PURPOSE,
    threadId: current.threadId,
    currentMessageId: current.id,
    currentTurnId: current.turnId,
    currentMessageHash: publicMessageHash(current),
    instruction: {
      content: instruction,
      authority: 'owner_current',
      provenance: 'persisted_owner_message_projection',
      sourceSpan: rendered.instructionSpan,
    },
    selectionPolicy: ASSISTANT_CONTEXT_SELECTION_POLICY,
    authorityPolicy: ASSISTANT_CONTEXT_AUTHORITY_POLICY,
    turns,
    omittedTurnCount: pairs.length - turns.length,
    truncatedMessageCount: turns.reduce(
      (total, turn) => total + Number(turn.user.truncated) + Number(turn.assistant.truncated),
      0
    ),
  };

  return {
    assistantContext: { ...envelope, envelopeHash: canonicalHash(envelope) },
    request: rendered.request,
  };
}

/**
 * Compile completed conversational turn pairs before rootTurnId. Retry attempts are folded into
 * their root turn: the original user request is paired with the latest successful assistant reply.
 */
export function compileAssistantContext(
  messages,
  rootTurnId,
  {
    maxMessages = ASSISTANT_CONTEXT_MAX_MESSAGES,
    maxMessageCharacters = ASSISTANT_CONTEXT_MAX_MESSAGE_CHARACTERS,
    maxCharacters = ASSISTANT_CONTEXT_MAX_CHARACTERS,
  } = {}
) {
  const ordered = orderedMessages(messages);
  const rootIndex = ordered.findIndex(
    (message) => message.turnId === rootTurnId && message.role === 'user'
  );
  if (rootIndex < 0) return null;

  const prior = ordered.slice(0, rootIndex);
  const assistantByTurn = new Map(
    prior
      .filter((message) => message.role === 'assistant')
      .map((message) => [message.turnId, message])
  );
  const retryChildren = new Map(
    prior
      .filter((message) => message.role === 'user' && message.retryOfTurnId)
      .map((message) => [message.retryOfTurnId, message])
  );
  const roots = prior.filter((message) => message.role === 'user' && !message.retryOfTurnId);

  const pairs = roots.flatMap((user) => {
    const userContent = conversationalContent(user, maxMessageCharacters);
    if (!userContent) return [];
    const completedAttempt = retryChain(user, retryChildren)
      .reverse()
      .map((attempt) => assistantByTurn.get(attempt.turnId))
      .find((assistant) => assistant && conversationalContent(assistant, maxMessageCharacters));
    if (!completedAttempt) return [];
    const assistantContent = conversationalContent(completedAttempt, maxMessageCharacters);
    return [
      [
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent },
      ],
    ];
  });

  const selected = [];
  let includedCharacters = 0;
  const boundedMessageCount = Math.max(0, Math.min(maxMessages, ASSISTANT_CONTEXT_MAX_MESSAGES));
  const boundedCharacterCount = Math.max(0, maxCharacters);
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const pair = pairs[index];
    const pairCharacters = pair.reduce((total, message) => total + message.content.length, 0);
    if (selected.length * 2 + pair.length > boundedMessageCount) break;
    if (includedCharacters + pairCharacters > boundedCharacterCount) break;
    selected.unshift(pair);
    includedCharacters += pairCharacters;
  }

  return {
    conversation: selected.flat(),
    includedPairs: selected.length,
    omittedPairs: pairs.length - selected.length,
    includedCharacters,
  };
}
