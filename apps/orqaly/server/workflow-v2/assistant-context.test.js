import { describe, expect, it } from 'vitest';
import { canonicalHash, verifySourceSpan } from '../../lib/workflow-v2/canonical.js';
import {
  ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16,
  ASSISTANT_CONTEXT_MAX_PAIRS,
  ASSISTANT_CONTEXT_MAX_SOURCE_UTF16,
  ASSISTANT_CONTEXT_TRUNCATION_MARKER,
} from '../../shared/workflow-v2/assistant-context-envelope.js';
import {
  AssistantContextEnvelopeV1Schema,
  CompileScopeInputV3Schema,
} from '../../shared/workflow-v2/contracts.js';
import {
  ASSISTANT_CONTEXT_MAX_CHARACTERS,
  ASSISTANT_CONTEXT_MAX_MESSAGES,
  compileAssistantContext,
  compileAssistantGoalContext,
} from './assistant-context.js';

const goalThreadId = '10000000-0000-4000-8000-000000000001';

function uuid(index) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function goalMessage(turnNumber, role, parts, order, overrides = {}) {
  const route = overrides.route || 'DIRECT_ANSWER';
  return {
    id: uuid(1_000 + order),
    threadId: goalThreadId,
    turnId: uuid(100 + turnNumber),
    role,
    route,
    parts,
    axwiseOperationId: ['DIRECT_ANSWER', 'DISCOVER', 'AXWISE_ONE_SHOT'].includes(route)
      ? uuid(2_000 + turnNumber)
      : null,
    workflowRunId: null,
    retryOfTurnId: null,
    createdAt: new Date(Date.UTC(2026, 8, 2, 10, 0, order)).toISOString(),
    ...overrides,
  };
}

function publicMessage(messageValue) {
  const { contentHash: _contentHash, ...value } = messageValue;
  return value;
}

function message(turn, role, content, index, overrides = {}) {
  return {
    id: `${turn}:${role}:${index}`,
    turnId: turn,
    role,
    parts: content ? [{ type: 'text', markdown: content }] : [{ type: 'operation_status' }],
    retryOfTurnId: null,
    createdAt: `2026-09-01T10:${String(index).padStart(2, '0')}:00.000Z`,
    ...overrides,
  };
}

describe('assistant context compiler', () => {
  it('includes only completed user/assistant pairs before the current turn', () => {
    const messages = [
      message('turn-1', 'user', 'Question one', 1),
      message('turn-1', 'assistant', 'Answer one', 2),
      message('turn-2', 'user', 'Unanswered question', 3),
      message('turn-3', 'user', 'Current question', 4),
    ];

    expect(compileAssistantContext(messages, 'turn-3')).toMatchObject({
      conversation: [
        { role: 'user', content: 'Question one' },
        { role: 'assistant', content: 'Answer one' },
      ],
      includedPairs: 1,
    });
  });

  it('folds retry lineage into the original request and latest completed answer', () => {
    const messages = [
      message('root', 'user', 'Explain the plan', 1),
      message('root', 'assistant', null, 2),
      message('retry', 'user', 'Explain the plan', 3, { retryOfTurnId: 'root' }),
      message('retry', 'assistant', 'Recovered answer', 4),
      message('current', 'user', 'Tell me more', 5),
    ];

    expect(compileAssistantContext(messages, 'current').conversation).toEqual([
      { role: 'user', content: 'Explain the plan' },
      { role: 'assistant', content: 'Recovered answer' },
    ]);
  });

  it('keeps recent pairs within both contract and total character budgets', () => {
    const messages = [];
    for (let index = 0; index < 14; index += 1) {
      const turn = `turn-${String(index).padStart(2, '0')}`;
      messages.push(message(turn, 'user', `Question ${index} ${'u'.repeat(7000)}`, index * 2));
      messages.push(
        message(turn, 'assistant', `Answer ${index} ${'a'.repeat(7000)}`, index * 2 + 1)
      );
    }
    messages.push(message('current', 'user', 'Current', 29));

    const compiled = compileAssistantContext(messages, 'current');
    expect(compiled.conversation.length).toBeLessThanOrEqual(ASSISTANT_CONTEXT_MAX_MESSAGES);
    expect(compiled.includedCharacters).toBeLessThanOrEqual(ASSISTANT_CONTEXT_MAX_CHARACTERS);
    expect(compiled.conversation.at(-1).content).toContain('Answer 13');
    expect(compiled.conversation[0].role).toBe('user');
    expect(compiled.conversation.at(-1).role).toBe('assistant');
    expect(compiled.omittedPairs).toBeGreaterThan(0);
  });

  it('returns null when the immutable root turn is absent', () => {
    expect(compileAssistantContext([], 'missing')).toBeNull();
  });
});

describe('assistant Goal context compiler', () => {
  it('builds a schema-valid authority and provenance envelope without leaking other parts', () => {
    const priorUser = goalMessage(
      1,
      'user',
      [
        { type: 'text', markdown: 'Plan the Estonia launch.' },
        {
          type: 'source',
          title: 'private user source',
          url: 'https://example.com/private-user-source',
          sourceTypes: ['industry'],
        },
        {
          type: 'artifact',
          title: 'Owner notes',
          contentType: 'text/markdown',
          markdown: 'Budget limit: EUR 5,000.',
        },
      ],
      1
    );
    const priorAssistant = goalMessage(
      1,
      'assistant',
      [
        { type: 'text', markdown: 'Use a three-stage launch plan.' },
        {
          type: 'fact',
          statement: 'private fact payload',
          sourceUrls: ['https://example.com/private-fact'],
        },
        {
          type: 'artifact',
          title: 'Launch outline',
          contentType: 'text/markdown',
          markdown: 'Stage one validates demand.',
        },
        {
          type: 'recommendation',
          kind: 'consider_goal',
          summary: 'private recommendation payload',
        },
      ],
      2
    );
    const current = {
      ...goalMessage(2, 'user', [{ type: 'text', markdown: 'Do this.' }], 3, {
        route: 'START_GOAL',
      }),
      contentHash: 'f'.repeat(64),
    };
    const result = compileAssistantGoalContext(
      [current, { ...priorAssistant, contentHash: 'e'.repeat(64) }, priorUser],
      current.turnId,
      'Do this.'
    );

    expect(result.request).toBe(
      'Do this.\n\nOWNER_PRIOR\nPlan the Estonia launch.\n\nBudget limit: EUR 5,000.' +
        '\n\nASSISTANT_REFERENCE\nUse a three-stage launch plan.\n\nStage one validates demand.'
    );
    expect(AssistantContextEnvelopeV1Schema.parse(result.assistantContext)).toEqual(
      result.assistantContext
    );
    expect(
      CompileScopeInputV3Schema.parse({
        type: 'CompileScopeV3',
        request: result.request,
        assistantContext: result.assistantContext,
      }).request
    ).toBe(result.request);

    const context = result.assistantContext;
    expect(context).toMatchObject({
      type: 'AssistantContextEnvelopeV1',
      source: 'orqaly_assistant_thread',
      purpose: 'resolve_deictic_goal_instruction',
      threadId: goalThreadId,
      currentMessageId: current.id,
      currentTurnId: current.turnId,
      currentMessageHash: canonicalHash(publicMessage(current)),
      instruction: {
        content: 'Do this.',
        authority: 'owner_current',
        provenance: 'persisted_owner_message_projection',
      },
      turns: [
        {
          rootTurnId: priorUser.turnId,
          route: 'DIRECT_ANSWER',
          user: {
            authority: 'owner_prior',
            provenance: 'persisted_owner_message',
            contentKinds: ['text', 'artifact'],
            sourceMessageHash: canonicalHash(priorUser),
          },
          assistant: {
            authority: 'assistant_reference',
            provenance: 'axwise_operation_output',
            contentKinds: ['text', 'artifact'],
            sourceMessageHash: canonicalHash(priorAssistant),
          },
        },
      ],
      omittedTurnCount: 0,
      truncatedMessageCount: 0,
    });
    const { envelopeHash, ...hashInput } = context;
    expect(envelopeHash).toBe(canonicalHash(hashInput));
    expect(verifySourceSpan(result.request, context.instruction.sourceSpan)).toBe(true);
    expect(verifySourceSpan(result.request, context.turns[0].user.sourceSpan)).toBe(true);
    expect(verifySourceSpan(result.request, context.turns[0].assistant.sourceSpan)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private user source');
    expect(JSON.stringify(result)).not.toContain('private fact payload');
    expect(JSON.stringify(result)).not.toContain('private recommendation payload');
  });

  it('folds retries into the root and excludes failed, cancelled, unanswered, and empty turns', () => {
    const root = goalMessage(1, 'user', [{ type: 'text', markdown: 'Prepare the launch.' }], 1);
    const failed = goalMessage(
      1,
      'assistant',
      [
        { type: 'text', markdown: 'failed answer must stay private' },
        {
          type: 'operation_status',
          operationId: uuid(2_001),
          status: 'failed',
          retryMode: 'new_attempt',
        },
      ],
      2
    );
    const retryOne = goalMessage(
      2,
      'user',
      [{ type: 'text', markdown: 'Prepare the launch.' }],
      3,
      {
        retryOfTurnId: root.turnId,
      }
    );
    const cancelled = goalMessage(
      2,
      'assistant',
      [
        { type: 'text', markdown: 'cancelled answer must stay private' },
        {
          type: 'operation_status',
          operationId: uuid(2_002),
          status: 'cancelled',
          retryMode: 'none',
        },
      ],
      4
    );
    const retryTwo = goalMessage(
      3,
      'user',
      [{ type: 'text', markdown: 'Prepare the launch.' }],
      5,
      {
        retryOfTurnId: retryOne.turnId,
      }
    );
    const recovered = goalMessage(
      3,
      'assistant',
      [
        {
          type: 'artifact',
          title: 'Plan',
          contentType: 'text/markdown',
          markdown: 'Recovered plan.',
        },
      ],
      6
    );
    const unanswered = goalMessage(
      4,
      'user',
      [{ type: 'text', markdown: 'Unanswered private turn.' }],
      7
    );
    const emptyAssistant = goalMessage(
      4,
      'assistant',
      [
        {
          type: 'operation_status',
          operationId: uuid(2_004),
          status: 'running',
          retryAfterSeconds: 2,
        },
      ],
      8
    );
    const current = goalMessage(5, 'user', [{ type: 'text', markdown: 'Make that a Goal.' }], 9, {
      route: 'START_GOAL',
    });

    const result = compileAssistantGoalContext(
      [emptyAssistant, current, retryTwo, failed, root, unanswered, recovered, retryOne, cancelled],
      current.turnId,
      'Make that a Goal.'
    );

    expect(result.assistantContext.turns).toHaveLength(1);
    expect(result.assistantContext.turns[0]).toMatchObject({
      rootTurnId: root.turnId,
      user: { messageId: root.id, turnId: root.turnId, content: 'Prepare the launch.' },
      assistant: {
        messageId: recovered.id,
        turnId: retryTwo.turnId,
        content: 'Recovered plan.',
      },
    });
    expect(result.request).not.toContain('failed answer must stay private');
    expect(result.request).not.toContain('cancelled answer must stay private');
    expect(result.request).not.toContain('Unanswered private turn.');
    expect(result.assistantContext.omittedTurnCount).toBe(0);
  });

  it('uses local-output provenance for a completed local Goal turn', () => {
    const priorUser = goalMessage(
      1,
      'user',
      [{ type: 'text', markdown: 'Monitor competitors weekly.' }],
      1,
      { route: 'PROPOSE_GOAL', axwiseOperationId: null }
    );
    const priorAssistant = goalMessage(
      1,
      'assistant',
      [{ type: 'text', markdown: 'This work is suitable for a Goal.' }],
      2,
      { route: 'PROPOSE_GOAL', axwiseOperationId: null }
    );
    const current = goalMessage(2, 'user', [{ type: 'text', markdown: 'Do this.' }], 3, {
      route: 'START_GOAL',
      axwiseOperationId: null,
    });

    const result = compileAssistantGoalContext(
      [priorUser, priorAssistant, current],
      current.turnId,
      'Do this.'
    );

    expect(result.assistantContext.turns[0].assistant.provenance).toBe('orqaly_local_output');
    expect(() => AssistantContextEnvelopeV1Schema.parse(result.assistantContext)).not.toThrow();
  });

  it('truncates a historical excerpt at a Unicode-scalar-safe UTF-16 prefix', () => {
    const prefixLimit =
      ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16 - ASSISTANT_CONTEXT_TRUNCATION_MARKER.length;
    const longContent = `${'x'.repeat(prefixLimit - 1)}😀${'tail'.repeat(100)}`;
    const priorUser = goalMessage(1, 'user', [{ type: 'text', markdown: longContent }], 1);
    const priorAssistant = goalMessage(
      1,
      'assistant',
      [{ type: 'text', markdown: 'A compact answer.' }],
      2
    );
    const current = goalMessage(2, 'user', [{ type: 'text', markdown: 'Do this.' }], 3, {
      route: 'START_GOAL',
    });

    const result = compileAssistantGoalContext(
      [priorUser, priorAssistant, current],
      current.turnId,
      'Do this.'
    );
    const excerpt = result.assistantContext.turns[0].user;

    expect(excerpt.truncated).toBe(true);
    expect(excerpt.content).toBe(
      `${'x'.repeat(prefixLimit - 1)}${ASSISTANT_CONTEXT_TRUNCATION_MARKER}`
    );
    expect(excerpt.content.length).toBeLessThanOrEqual(ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16);
    expect(excerpt.content.charCodeAt(prefixLimit - 1)).not.toBeGreaterThanOrEqual(0xd800);
    expect(excerpt.contentSha256).toBe(excerpt.sourceSpan.sha256);
    expect(verifySourceSpan(result.request, excerpt.sourceSpan)).toBe(true);
    expect(result.assistantContext.truncatedMessageCount).toBe(1);
    expect(() => AssistantContextEnvelopeV1Schema.parse(result.assistantContext)).not.toThrow();
  });

  it('selects at most six recent complete pairs and is stable across input ordering', () => {
    const messages = [];
    for (let index = 0; index < 8; index += 1) {
      messages.push(
        goalMessage(index, 'user', [{ type: 'text', markdown: `Owner ${index}` }], index * 2 + 1),
        goalMessage(
          index,
          'assistant',
          [{ type: 'text', markdown: `Assistant ${index}` }],
          index * 2 + 2
        )
      );
    }
    const current = goalMessage(9, 'user', [{ type: 'text', markdown: 'Do this.' }], 20, {
      route: 'START_GOAL',
    });
    messages.push(current);

    const first = compileAssistantGoalContext(messages, current.turnId, 'Do this.');
    const reordered = compileAssistantGoalContext(
      [...messages].reverse(),
      current.turnId,
      'Do this.'
    );

    expect(first.assistantContext.turns).toHaveLength(ASSISTANT_CONTEXT_MAX_PAIRS);
    expect(first.assistantContext.turns.map((turn) => turn.user.content)).toEqual([
      'Owner 2',
      'Owner 3',
      'Owner 4',
      'Owner 5',
      'Owner 6',
      'Owner 7',
    ]);
    expect(first.assistantContext.omittedTurnCount).toBe(2);
    expect(reordered).toEqual(first);
    expect(reordered.assistantContext.envelopeHash).toBe(first.assistantContext.envelopeHash);
  });

  it('stops at the first whole recent pair that would exceed the 24,000-unit rendering', () => {
    const olderSmallUser = goalMessage(
      1,
      'user',
      [{ type: 'text', markdown: 'Older small owner context.' }],
      1
    );
    const olderSmallAssistant = goalMessage(
      1,
      'assistant',
      [{ type: 'text', markdown: 'Older small assistant context.' }],
      2
    );
    const blockingLargeUser = goalMessage(
      2,
      'user',
      [{ type: 'text', markdown: 'u'.repeat(5_000) }],
      3
    );
    const blockingLargeAssistant = goalMessage(
      2,
      'assistant',
      [{ type: 'text', markdown: 'a'.repeat(5_000) }],
      4
    );
    const newestUser = goalMessage(
      3,
      'user',
      [{ type: 'text', markdown: 'Newest owner context.' }],
      5
    );
    const newestAssistant = goalMessage(
      3,
      'assistant',
      [{ type: 'text', markdown: 'Newest assistant context.' }],
      6
    );
    const current = goalMessage(4, 'user', [{ type: 'text', markdown: 'i'.repeat(16_000) }], 7, {
      route: 'START_GOAL',
    });
    const messages = [
      olderSmallUser,
      olderSmallAssistant,
      blockingLargeUser,
      blockingLargeAssistant,
      newestUser,
      newestAssistant,
      current,
    ];

    const result = compileAssistantGoalContext(messages, current.turnId, 'i'.repeat(16_000));

    expect(result.assistantContext.turns.map((turn) => turn.rootTurnId)).toEqual([
      newestUser.turnId,
    ]);
    expect(result.assistantContext.omittedTurnCount).toBe(2);
    expect(result.assistantContext.truncatedMessageCount).toBe(0);
    expect(result.request.length).toBeLessThanOrEqual(ASSISTANT_CONTEXT_MAX_SOURCE_UTF16);
    expect(result.request).not.toContain('Older small owner context.');
  });

  it('preserves the raw current instruction and rejects an absent or oversized one', () => {
    const current = goalMessage(
      1,
      'user',
      [{ type: 'text', markdown: '  Keep these spaces.  ' }],
      1,
      { route: 'START_GOAL' }
    );

    const result = compileAssistantGoalContext([current], current.turnId, '  Keep these spaces.  ');

    expect(result.request).toBe('  Keep these spaces.  ');
    expect(result.assistantContext.instruction.sourceSpan).toMatchObject({
      start: 0,
      end: '  Keep these spaces.  '.length,
      text: '  Keep these spaces.  ',
      offsetUnit: 'utf16_code_units',
    });
    expect(result.assistantContext.turns).toEqual([]);
    expect(compileAssistantGoalContext([current], uuid(999), 'Do this.')).toBeNull();
    expect(() => compileAssistantGoalContext([current], current.turnId, '')).toThrow(TypeError);
    expect(() =>
      compileAssistantGoalContext(
        [current],
        current.turnId,
        'x'.repeat(ASSISTANT_CONTEXT_MAX_SOURCE_UTF16 + 1)
      )
    ).toThrow(RangeError);
  });
});
