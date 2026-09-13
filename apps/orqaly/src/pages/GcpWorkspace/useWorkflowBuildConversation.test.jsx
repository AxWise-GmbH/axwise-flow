import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkflowBuildConversation } from './useWorkflowBuildConversation.js';

const question = {
  id: 'output_name',
  kind: 'information',
  prompt: 'Which output field should receive the name?',
};
const makeContext = (overrides = {}) => ({
  build: {
    id: 'build-one',
    rowVersion: 2,
    inputVersion: 1,
    status: 'needs_input',
    questions: [question],
    ...overrides,
  },
  ready: true,
  nativeEditing: false,
  panelBusy: false,
  onAnswer: vi.fn().mockResolvedValue(true),
  onRepair: vi.fn().mockResolvedValue(true),
});

describe('original composer build controller', () => {
  it('sends only the displayed information answer and clears exact acknowledged text', async () => {
    const context = makeContext();
    const onMessageChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkflowBuildConversation({ context, message: ' customer_name ', onMessageChange })
    );
    expect(result.current.mode).toBe('answer');
    expect(result.current.targetLabel).toBe(`Answering: ${question.prompt}`);
    expect(context.onAnswer).not.toHaveBeenCalled();
    let confirmed;
    await act(async () => {
      confirmed = await result.current.send();
    });
    expect(confirmed).toBe(true);
    expect(context.onAnswer).toHaveBeenCalledWith(question.id, 'customer_name');
    expect(context.onRepair).not.toHaveBeenCalled();
    expect(onMessageChange).toHaveBeenCalledWith('');
  });
  it('requires a visible explicit selector for multiple information questions', async () => {
    const context = makeContext({
      questions: [question, { ...question, id: 'email', prompt: 'Which email output?' }],
    });
    const { result } = renderHook(() =>
      useWorkflowBuildConversation({ context, message: 'email' })
    );
    expect(result.current.questionId).toBe('');
    expect(result.current.actionDisabled).toBe(true);
    await act(async () => {
      await result.current.send();
    });
    expect(context.onAnswer).not.toHaveBeenCalled();
    act(() => result.current.setQuestionId('email'));
    await act(async () => {
      await result.current.send();
    });
    expect(context.onAnswer).toHaveBeenCalledWith('email', 'email');
  });
  it('does not interpret arbitrary text as repair or as an answer to a connection question', async () => {
    const context = makeContext({
      questions: [{ ...question, kind: 'connection' }],
      repairEligibility: { allowed: true },
    });
    const { result } = renderHook(() =>
      useWorkflowBuildConversation({ context, message: 'Change the filter' })
    );
    expect(result.current.mode).toBeNull();
    expect(result.current.questions).toEqual([]);
    await act(async () => {
      await result.current.send();
    });
    expect(context.onAnswer).not.toHaveBeenCalled();
    expect(context.onRepair).not.toHaveBeenCalled();
    act(() => result.current.setMode('repair'));
    await act(async () => {
      await result.current.send();
    });
    expect(context.onRepair).toHaveBeenCalledWith('Change the filter');
  });
  it.each(['no-eligibility', 'unknown', 'native-editor', 'panel-busy', 'unready', 'secret'])(
    'blocks %s before any mutation',
    async (reason) => {
      const context = makeContext({
        questions: [],
        repairEligibility: { allowed: reason !== 'no-eligibility' },
        ...(reason === 'unknown' ? { testEvidence: { status: 'outcome_unknown' } } : {}),
      });
      if (reason === 'native-editor') context.nativeEditing = true;
      if (reason === 'panel-busy') context.panelBusy = true;
      if (reason === 'unready') context.ready = false;
      const { result } = renderHook(() =>
        useWorkflowBuildConversation({
          context,
          message:
            reason === 'secret' ? 'api_key=synthetic_not_a_real_credential' : 'Correct this draft',
        })
      );
      act(() => result.current.setMode('repair'));
      expect(result.current.actionDisabled).toBe(true);
      await act(async () => {
        await result.current.send();
      });
      expect(context.onRepair).not.toHaveBeenCalled();
      expect(context.onAnswer).not.toHaveBeenCalled();
    }
  );
  it('preserves text on unconfirmed delivery and does not double-send before rerender', async () => {
    const context = makeContext();
    let finish;
    context.onAnswer.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const onMessageChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkflowBuildConversation({ context, message: 'customer_name', onMessageChange })
    );
    let first;
    act(() => {
      first = result.current.send();
      void result.current.send();
    });
    expect(context.onAnswer).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(false);
      await first;
    });
    expect(onMessageChange).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Your message is kept');
  });
  it('does not erase a newer message after the frozen answer is acknowledged', async () => {
    const context = makeContext();
    let finish;
    context.onAnswer.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const onMessageChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ message }) => useWorkflowBuildConversation({ context, message, onMessageChange }),
      { initialProps: { message: 'customer_name' } }
    );
    let first;
    act(() => {
      first = result.current.send();
    });
    rerender({ message: 'My next message' });
    await act(async () => {
      finish(true);
      await first;
    });
    expect(onMessageChange).not.toHaveBeenCalled();
  });
  it.each(['scope', 'unmount'])(
    'does not consume text after %s changes during delivery',
    async (change) => {
      const context = makeContext();
      let finish;
      context.onAnswer.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const onMessageChange = vi.fn();
      const { result, rerender, unmount } = renderHook(
        ({ scopeKey }) =>
          useWorkflowBuildConversation({
            context,
            scopeKey,
            message: 'customer_name',
            onMessageChange,
          }),
        { initialProps: { scopeKey: 'tenant-one' } }
      );
      let first;
      act(() => {
        first = result.current.send();
      });
      if (change === 'scope') rerender({ scopeKey: 'tenant-two' });
      else unmount();
      await act(async () => {
        finish(true);
        await first;
      });
      expect(onMessageChange).not.toHaveBeenCalled();
    }
  );
  it('drops a multiple-question selection when the authoritative input version changes', () => {
    const context = makeContext({ questions: [question, { ...question, id: 'email' }] });
    const { result, rerender } = renderHook(
      ({ context }) => useWorkflowBuildConversation({ context, message: 'customer_name' }),
      { initialProps: { context } }
    );
    act(() => result.current.setQuestionId(question.id));
    expect(result.current.actionDisabled).toBe(false);
    rerender({
      context: { ...context, build: { ...context.build, rowVersion: 3, inputVersion: 2 } },
    });
    expect(result.current.questionId).toBe('');
    expect(result.current.actionDisabled).toBe(true);
  });
});
