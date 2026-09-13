import { describe, expect, it } from 'vitest';
import { assistantWorkflowTimeline } from './assistant-workflow-timeline.js';

const entry = (id, createdAt, role = 'assistant') => ({
  message: { id, role, createdAt, parts: [{ type: 'text', markdown: `Original ${id}` }] },
  attemptNumber: 1,
  attemptCount: 1,
});
const conversation = (solutionId, turns) => ({
  solutionId,
  solutionName: `Workflow ${solutionId}`,
  snapshot: { solutionId, turns },
});
const turn = (id, createdAt, status = 'completed') => ({
  id,
  createdAt,
  status,
  mode: 'ask',
  message: `Workflow question ${id}`,
  reply: { markdown: `Workflow answer ${id}` },
});
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('UI-only Assistant/workflow timeline', () => {
  it('orders interleaved records chronologically and preserves original message metadata', () => {
    const original = [
      entry('first', '2026-09-06T10:00:00.000Z', 'user'),
      entry('last', '2026-09-06T10:03:00.000Z'),
    ];
    const workflow = conversation('solution-a', [turn('question', '2026-09-06T10:02:00.000Z')]);
    const result = assistantWorkflowTimeline(original, [workflow]);
    expect(result.map((item) => item.key)).toEqual([
      'assistant:first',
      'workflow:solution-a:question',
      'assistant:last',
    ]);
    expect(result[0]).toMatchObject({ kind: 'assistant', attemptNumber: 1, attemptCount: 1 });
    expect(result[0].message).toBe(original[0].message);
    expect(result[1]).toMatchObject({
      kind: 'workflow',
      solutionId: 'solution-a',
      solutionName: 'Workflow solution-a',
    });
  });

  it('deduplicates workflow records by solution AND turn without hiding a different workflow', () => {
    const first = turn('shared-id', '2026-09-06T10:00:00.000Z');
    const result = assistantWorkflowTimeline(
      [entry('shared-id', first.createdAt)],
      [
        conversation('one', [first, first]),
        conversation('one', [first]),
        conversation('two', [first]),
      ]
    );
    expect(result.map((item) => item.key)).toEqual([
      'assistant:shared-id',
      'workflow:one:shared-id',
      'workflow:two:shared-id',
    ]);
    expect(new Set(result.map((item) => item.key)).size).toBe(3);
  });

  it('retains stable equal-time ordering and the same workflow render key through completion', () => {
    const time = '2026-09-06T10:00:00.000Z';
    const original = [entry('user', time, 'user'), entry('assistant', time)];
    const queued = assistantWorkflowTimeline(original, [
      conversation('one', [turn('change', time, 'queued')]),
    ]);
    const completed = assistantWorkflowTimeline(original, [
      conversation('one', [turn('change', time)]),
    ]);
    expect(completed.map((item) => item.key)).toEqual(queued.map((item) => item.key));
    expect(completed.map((item) => item.key)).toEqual([
      'assistant:user',
      'assistant:assistant',
      'workflow:one:change',
    ]);
    expect(completed.at(-1).turn.status).toBe('completed');
  });

  it('does not mutate inputs or copy consented workflow replies into Assistant message parts', () => {
    const original = freeze([entry('idea', '2026-09-06T10:00:00.000Z')]);
    const workflow = freeze([
      conversation('one', [
        {
          ...turn('inspection', '2026-09-06T10:01:00.000Z'),
          reply: { markdown: 'The explicitly included run returned customer value 42.' },
          includedInvocation: { id: 'exact-run', workflowHash: 'a'.repeat(64) },
        },
      ]),
    ]);
    const before = JSON.stringify([original, workflow]);
    const result = assistantWorkflowTimeline(original, workflow);
    expect(JSON.stringify([original, workflow])).toBe(before);
    expect(result.filter((item) => item.kind === 'assistant').map((item) => item.message)).toEqual(
      original.map((item) => item.message)
    );
    expect(JSON.stringify(original)).not.toContain('customer value 42');
    expect(result.find((item) => item.kind === 'workflow')).not.toHaveProperty('message');
    expect(result.find((item) => item.kind === 'workflow').turn.includedInvocation.id).toBe(
      'exact-run'
    );
  });

  it('handles missing optional dates and history without manufacturing saved timestamps', () => {
    const original = [entry('no-date', undefined), entry('invalid-date', 'not-a-date')];
    const pending = turn('undated', undefined, 'queued');
    const result = assistantWorkflowTimeline(original, [
      { solutionId: 'not-loaded' },
      conversation('one', [pending]),
    ]);
    expect(result.map((item) => item.key)).toEqual([
      'assistant:no-date',
      'assistant:invalid-date',
      'workflow:one:undated',
    ]);
    expect(result.at(-1).turn.createdAt).toBeUndefined();
    expect(assistantWorkflowTimeline([], [])).toEqual([]);
  });
});
