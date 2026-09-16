import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantWorkflowRunIds, useAssistantWorkflows } from './useAssistantWorkflows.js';

const threadId = '10000000-0000-4000-8000-000000000001';
const runId = '10000000-0000-4000-8000-000000000002';
const buildId = '10000000-0000-4000-8000-000000000003';
const solutionId = '10000000-0000-4000-8000-000000000004';
const messageId = '10000000-0000-4000-8000-000000000005';
const otherThread = '20000000-0000-4000-8000-000000000001';
const otherRun = '20000000-0000-4000-8000-000000000002';
const messages = [{ id: messageId, threadId, workflowRunId: runId, parts: [] }];
const build = {
  id: buildId,
  runId,
  solutionId,
  source: { threadId },
  rowVersion: 2,
  name: 'Saved workflow',
  status: 'completed',
};
const turn = (id, status = 'completed') => ({
  id,
  status,
  mode: 'ask',
  message: 'Explain',
  reply: status === 'completed' ? { markdown: `Saved answer ${id}` } : null,
  createdAt: `2026-09-06T10:00:0${id}.000Z`,
});
const snapshot = (turns = [], extra = {}) => ({
  solutionId,
  turns,
  context: { solutionVersion: 1, workflowHash: 'a'.repeat(64), selectedDraft: null },
  ...extra,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
};
const clientFixture = () => ({
  solutionBuildRequests: vi.fn().mockResolvedValue({ buildRequests: [build] }),
  solutionConversation: vi.fn().mockResolvedValue(snapshot([turn('1')])),
});
async function settle() {
  await act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Assistant thread workflow discovery and retained history', () => {
  it('derives deduplicated runs only from persisted records for the current thread', () => {
    const input = [
      ...messages,
      { ...messages[0], workflowRunId: null, parts: [{ type: 'goal_link', runId }] },
      { ...messages[0], threadId: otherThread, workflowRunId: otherRun },
      { ...messages[0], workflowRunId: otherRun, persisted: false },
      { ...messages[0], workflowRunId: otherRun, optimistic: true },
      { threadId, workflowRunId: otherRun },
      { ...messages[0], workflowRunId: null, parts: [{ type: 'text', markdown: otherRun }] },
    ];
    expect(assistantWorkflowRunIds(input, threadId)).toEqual([runId]);
    expect(input).toHaveLength(7);
  });

  it('excludes absent, cross-thread and wrong-run build sources before reading conversations', async () => {
    const client = clientFixture();
    client.solutionBuildRequests.mockResolvedValue({
      buildRequests: [
        { ...build, source: {} },
        { ...build, source: { threadId: otherThread } },
        { ...build, runId: otherRun },
      ],
    });
    const { result } = renderHook(() => useAssistantWorkflows({ client, threadId, messages }));
    await settle();
    expect(result.current.workflows).toEqual([]);
    expect(result.current.conversations).toEqual([]);
    expect(client.solutionConversation).not.toHaveBeenCalled();
  });

  it('loads linked history and preparation cards without creating messages or mutating input', async () => {
    const client = clientFixture();
    const preparing = { ...build, id: messageId, solutionId: null, status: 'needs_input' };
    client.solutionBuildRequests.mockResolvedValue({ buildRequests: [build, preparing] });
    const before = structuredClone(messages);
    const { result } = renderHook(() => useAssistantWorkflows({ client, threadId, messages }));
    await settle();
    expect(result.current.workflows).toHaveLength(2);
    expect(
      result.current.workflows.find((item) => item.build.id === messageId).solutionId
    ).toBeNull();
    expect(result.current.conversations[0]).toMatchObject({
      solutionId,
      solutionName: 'Saved workflow',
      snapshot: { turns: [turn('1')] },
    });
    expect(messages).toEqual(before);
    expect(result.current.loading).toBe(false);
  });

  it('hides old thread state immediately and ignores its delayed response', async () => {
    const client = clientFixture();
    const old = deferred();
    client.solutionConversation.mockReturnValue(old.promise);
    const view = renderHook((props) => useAssistantWorkflows(props), {
      initialProps: { client, threadId, messages },
    });
    await settle();
    client.solutionBuildRequests.mockResolvedValue({ buildRequests: [] });
    view.rerender({
      client,
      threadId: otherThread,
      messages: [{ ...messages[0], threadId: otherThread, workflowRunId: otherRun }],
    });
    expect(view.result.current.conversations).toEqual([]);
    expect(view.result.current.workflows).toEqual([]);
    await act(async () => old.resolve(snapshot([turn('1')])));
    await settle();
    expect(view.result.current.conversations).toEqual([]);
    expect(view.result.current.loading).toBe(false);
  });

  it('clears the render boundary immediately when the authenticated client changes', async () => {
    const first = clientFixture();
    const view = renderHook((props) => useAssistantWorkflows(props), {
      initialProps: { client: first, threadId, messages },
    });
    await settle();
    expect(view.result.current.conversations).toHaveLength(1);
    const next = clientFixture();
    const read = deferred();
    next.solutionBuildRequests.mockReturnValue(read.promise);
    view.rerender({ client: next, threadId, messages });
    expect(view.result.current.conversations).toEqual([]);
    expect(view.result.current.workflows).toEqual([]);
    await act(async () => read.resolve({ buildRequests: [] }));
    expect(view.result.current.conversations).toEqual([]);
  });

  it('continues fast polling saved running turns with no active canvas', async () => {
    vi.useFakeTimers();
    const client = clientFixture();
    client.solutionConversation.mockResolvedValue(snapshot([turn('1', 'running')]));
    const { result } = renderHook(() =>
      useAssistantWorkflows({ client, threadId, messages, activeSolutionId: null })
    );
    await settle();
    const calls = client.solutionConversation.mock.calls.length;
    client.solutionConversation.mockResolvedValue(snapshot([turn('1')]));
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(client.solutionConversation.mock.calls.length).toBeGreaterThan(calls);
    expect(result.current.conversations[0].snapshot.turns[0].status).toBe('completed');
  });

  it('retains older loaded turns when the latest page shrinks and canvas closes', async () => {
    vi.useFakeTimers();
    const client = clientFixture();
    client.solutionConversation.mockResolvedValue(
      snapshot([turn('1'), turn('2')], { hasMore: true })
    );
    const view = renderHook((props) => useAssistantWorkflows(props), {
      initialProps: { client, threadId, messages, activeSolutionId: solutionId },
    });
    await settle();
    view.rerender({ client, threadId, messages, activeSolutionId: null });
    client.solutionConversation.mockResolvedValue(snapshot([turn('3')]));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(view.result.current.conversations[0].snapshot.turns.map((item) => item.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(view.result.current.hasMore).toBe(true);
  });

  it('merges a controller acknowledgement and does not roll it back with an older poll', async () => {
    vi.useFakeTimers();
    const client = clientFixture();
    const view = renderHook((props) => useAssistantWorkflows(props), {
      initialProps: {
        client,
        threadId,
        messages,
        activeSolutionId: solutionId,
        activeSnapshot: null,
      },
    });
    await settle();
    const pending = deferred();
    client.solutionConversation.mockReturnValue(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    view.rerender({
      client,
      threadId,
      messages,
      activeSolutionId: solutionId,
      activeSnapshot: snapshot([turn('1'), turn('2')]),
    });
    await settle();
    await act(async () => pending.resolve(snapshot([turn('1'), turn('2', 'queued')])));
    await settle();
    expect(view.result.current.conversations[0].snapshot.turns).toEqual([turn('1'), turn('2')]);
  });

  it('will not use an active panel snapshot as discovery authority', async () => {
    const client = clientFixture();
    client.solutionBuildRequests.mockResolvedValue({ buildRequests: [] });
    const { result } = renderHook(() =>
      useAssistantWorkflows({
        client,
        threadId,
        messages,
        activeSolutionId: solutionId,
        activeSnapshot: snapshot([turn('1')]),
      })
    );
    await settle();
    expect(result.current.conversations).toEqual([]);
  });

  it('rejects a mismatched conversation response without displaying its turns', async () => {
    const client = clientFixture();
    client.solutionConversation.mockResolvedValue({
      ...snapshot([turn('1')]),
      solutionId: otherRun,
    });
    const { result } = renderHook(() => useAssistantWorkflows({ client, threadId, messages }));
    await settle();
    expect(result.current.conversations).toEqual([]);
    expect(result.current.error.message).toBe('Saved workflow history could not be verified.');
  });

  it('does not start remaining read batches after its thread scope is cancelled', async () => {
    const client = clientFixture();
    const pending = deferred();
    client.solutionBuildRequests.mockReturnValue(pending.promise);
    const linked = Array.from({ length: 5 }, (_, index) => ({
      ...messages[0],
      workflowRunId: `30000000-0000-4000-8000-00000000000${index}`,
    }));
    const view = renderHook((props) => useAssistantWorkflows(props), {
      initialProps: { client, threadId, messages: linked },
    });
    expect(client.solutionBuildRequests).toHaveBeenCalledTimes(4);
    view.rerender({ client, threadId: otherThread, messages: [] });
    await act(async () => pending.resolve({ buildRequests: [build] }));
    await settle();
    expect(client.solutionBuildRequests).toHaveBeenCalledTimes(4);
    expect(client.solutionConversation).not.toHaveBeenCalled();
  });

  it('keeps saved history after read failures and bounds automatic retries until Refresh', async () => {
    vi.useFakeTimers();
    const client = clientFixture();
    const { result } = renderHook(() => useAssistantWorkflows({ client, threadId, messages }));
    await settle();
    client.solutionBuildRequests.mockRejectedValue(new Error('Read unavailable'));
    await act(async () => vi.advanceTimersByTimeAsync(180_000));
    const calls = client.solutionBuildRequests.mock.calls.length;
    expect(calls).toBe(5); // successful initial read + four failed reads
    expect(result.current.conversations[0].snapshot.turns).toEqual([turn('1')]);
    expect(result.current.error.message).toBe('Read unavailable');
    await act(async () => vi.advanceTimersByTimeAsync(180_000));
    expect(client.solutionBuildRequests).toHaveBeenCalledTimes(calls);
    client.solutionBuildRequests.mockResolvedValue({ buildRequests: [build] });
    act(() => result.current.refresh());
    await settle();
    expect(result.current.error).toBeNull();
  });

  it('stops authentication-error polling and removes cached history', async () => {
    vi.useFakeTimers();
    const client = clientFixture();
    const { result } = renderHook(() => useAssistantWorkflows({ client, threadId, messages }));
    await settle();
    client.solutionBuildRequests.mockRejectedValue(
      Object.assign(new Error('Sign in'), { status: 401 })
    );
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(result.current.conversations).toEqual([]);
    const calls = client.solutionBuildRequests.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(180_000));
    expect(client.solutionBuildRequests).toHaveBeenCalledTimes(calls);
  });
});
