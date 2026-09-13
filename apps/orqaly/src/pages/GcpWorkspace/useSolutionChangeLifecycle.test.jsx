import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSolutionConversation } from './useSolutionConversation.js';

const hash = 'a'.repeat(64);
const draftHash = 'b'.repeat(64);
const solution = { id: 'solution', version: 1, name: 'Webhook' };
const draft = { id: 'draft', rowVersion: 3, workflowHash: draftHash };
const context = { solutionVersion: 2, workflowHash: hash, selectedDraft: null, availableDraft: null };
const snapshot = (values = {}) => ({ solutionId: solution.id, enabled: true, turns: [], context, ...values });
function fixture(initial = snapshot()) {
  const client = {
    solutionConversation: vi.fn().mockResolvedValue(initial),
    sendSolutionConversationTurn: vi.fn(async (_id, command) => snapshot({
      ...initial,
      context: { ...initial.context, selectedDraft: command.draft || null },
      turns: [...initial.turns, { id: command.turnId, mode: command.mode, status: 'queued', message: command.message }],
    })),
  };
  return client;
}

describe('one conversational change lifecycle', () => {
  it('sends a natural change request once using server intent resolution, not Ask', async () => {
    const client = fixture();
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: 'Add email alerts and test the change' }));
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    await act(async () => result.current.send());
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({ mode: 'auto', message: 'Add email alerts and test the change', workflowHash: hash });
  });

  it('ordinary questions do not require selecting an existing draft first', async () => {
    const client = fixture(snapshot({ context: { ...context, availableDraft: draft } }));
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: 'What does this do?' }));
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    await act(async () => result.current.send());
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({ mode: 'auto' });
    expect(client.sendSolutionConversationTurn.mock.calls[0][1].draft).toBeUndefined();
  });

  it('chooses a complete stored proposal by immutable reference without consuming unrelated typed text', async () => {
    const onMessageChange = vi.fn();
    const client = fixture();
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: 'My unsent notes', onMessageChange }));
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    const proposal = { id: 'option2', request: 'Add the owned failure handler.', contentHash: draftHash };
    await act(async () => result.current.chooseProposal({ id: 'proposal-turn' }, proposal));
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'change', message: proposal.request,
      proposalRef: { turnId: 'proposal-turn', proposalId: 'option2', proposalHash: draftHash },
    });
    expect(onMessageChange).not.toHaveBeenCalled();
  });

  it('selects and continues a saved request in one confirmation with a fresh exact draft check', async () => {
    const turn = { id: 'change', mode: 'auto', resolvedMode: 'change', status: 'blocked', draftSelectionRequired: true, availableDraft: draft, baseWorkflowHash: hash };
    const initial = snapshot({ context: { ...context, availableDraft: draft }, turns: [turn] });
    const client = fixture(initial);
    client.solutionConversation.mockImplementation(async (_id, options) => snapshot({
      ...initial, context: { ...initial.context, selectedDraft: options?.draftId ? draft : null },
    }));
    const onSelectDraft = vi.fn();
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: '', onSelectDraft }));
    await waitFor(() => expect(result.current.needsDraftSelection).toBeTruthy());
    await act(async () => result.current.useExistingDraft());
    expect(onSelectDraft).toHaveBeenCalledWith(draft.id);
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'change', draft, expectedSolutionVersion: context.solutionVersion,
      continuation: { turnId: 'change', kind: 'answer' },
    });
  });

  it('does not continue a saved change if the draft changed while selection was loading', async () => {
    const initial = snapshot({ context: { ...context, availableDraft: draft } });
    const client = fixture(initial);
    client.solutionConversation.mockImplementation(async (_id, options) => options?.draftId
      ? snapshot({ context: { ...initial.context, selectedDraft: { ...draft, rowVersion: 4 } } }) : initial);
    const onSelectDraft = vi.fn();
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: 'Change it', onSelectDraft }));
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    await act(async () => result.current.useExistingDraft());
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(onSelectDraft).not.toHaveBeenCalled();
    expect(result.current.error.message).toMatch(/draft changed/);
  });

  it('requires a second explicit confirmation after a draft conflict, using refreshed CAS and the same saved request', async () => {
    const turn = { id: 'change', mode: 'auto', resolvedMode: 'change', status: 'blocked',
      draftSelectionRequired: true, availableDraft: draft, baseWorkflowHash: hash };
    const initial = snapshot({ context: { ...context, availableDraft: draft }, turns: [turn] });
    const changedDraft = { ...draft, rowVersion: 4, workflowHash: 'c'.repeat(64) };
    const client = fixture(initial);
    let observedConflict = false;
    client.solutionConversation.mockImplementation(async (_id, options) => {
      if (options?.draftId) observedConflict = true;
      return snapshot({ ...initial, context: { ...initial.context,
        availableDraft: observedConflict ? changedDraft : draft,
        selectedDraft: options?.draftId ? changedDraft : null,
      } });
    });
    const onSelectDraft = vi.fn();
    const { result } = renderHook(() => useSolutionConversation({ client, solution,
      message: 'Retain these unsent notes', onSelectDraft }));
    await waitFor(() => expect(result.current.needsDraftSelection).toBeTruthy());
    await act(async () => result.current.useExistingDraft());
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(onSelectDraft).not.toHaveBeenCalled();
    expect(result.current.error.message).toMatch(/draft changed/);
    await waitFor(() => expect(result.current.availableDraft).toEqual(changedDraft));
    expect(result.current.message).toBe('Retain these unsent notes');
    expect(turn.availableDraft).toEqual(draft);

    await act(async () => result.current.useExistingDraft());
    expect(onSelectDraft).toHaveBeenCalledExactlyOnceWith(draft.id);
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'change', draft: changedDraft, workflowHash: hash,
      continuation: { turnId: turn.id, kind: 'answer' },
    });
  });

  it('never redirects a saved change to a different available draft', async () => {
    const turn = { id: 'change', mode: 'auto', resolvedMode: 'change', status: 'blocked',
      draftSelectionRequired: true, availableDraft: draft, baseWorkflowHash: hash };
    const differentDraft = { ...draft, id: 'different-draft' };
    const client = fixture(snapshot({ context: { ...context, availableDraft: differentDraft }, turns: [turn] }));
    const onSelectDraft = vi.fn();
    const { result } = renderHook(() => useSolutionConversation({ client, solution, onSelectDraft }));
    await waitFor(() => expect(result.current.needsDraftSelection).toBeTruthy());
    await act(async () => result.current.useExistingDraft());
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(onSelectDraft).not.toHaveBeenCalled();
    expect(client.solutionConversation.mock.calls.every(([, options]) => !options?.draftId)).toBe(true);
    expect(result.current.error.message).toMatch(/original draft is no longer available/);
  });

  it.each(['opt out', 'select another run'])(
    'aborts a pending draft confirmation if the customer chooses to %s',
    async (change) => {
      const turn = { id: 'change', mode: 'auto', resolvedMode: 'change', status: 'blocked',
        draftSelectionRequired: true, availableDraft: draft, baseWorkflowHash: hash,
        includedInvocation: { id: 'run-one' } };
      const initial = snapshot({ context: { ...context, availableDraft: draft }, turns: [turn],
        availableInvocations: [{ id: 'run-one' }, { id: 'run-two' }] });
      const client = fixture(initial);
      let resolveRead;
      client.solutionConversation.mockImplementation(async (_id, options) => options?.draftId
        ? new Promise((resolve) => { resolveRead = resolve; }) : initial);
      const onSelectDraft = vi.fn();
      const { result } = renderHook(() => useSolutionConversation({ client, solution,
        message: 'My retained notes', onSelectDraft }));
      await waitFor(() => expect(result.current.contextReady).toBe(true));
      act(() => {
        result.current.setIncludeRun(true);
        result.current.setInvocationId('run-one');
      });
      let confirmation;
      act(() => { confirmation = result.current.useExistingDraft(); });
      expect(result.current.busy).toBe(true);
      expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
      act(() => {
        if (change === 'opt out') result.current.setIncludeRun(false);
        else result.current.setInvocationId('run-two');
      });
      await act(async () => {
        resolveRead(snapshot({ ...initial, context: { ...initial.context, selectedDraft: draft } }));
        await confirmation;
      });
      expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
      expect(onSelectDraft).not.toHaveBeenCalled();
      expect(result.current.message).toBe('My retained notes');
      expect(result.current.busy).toBe(false);
      expect(result.current.error.message).toMatch(/Run-data sharing changed/);
      expect(result.current.draftSelectionTurn.id).toBe(turn.id);
    }
  );

  it('retries a failed saved request with lineage and no inherited run consent', async () => {
    const turn = { id: 'failed', mode: 'change', status: 'failed', message: 'Add alerts' };
    const client = fixture(snapshot({ turns: [turn] }));
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: '' }));
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    await act(async () => result.current.continueTurn(turn));
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'auto', continuation: { turnId: 'failed', kind: 'retry' }, message: 'Add alerts',
    });
    expect(client.sendSolutionConversationTurn.mock.calls[0][1].includeInvocation).toBeUndefined();
  });

  it('requires a fresh per-message opt-in before retrying a request that used a run payload', async () => {
    const turn = { id: 'failed', mode: 'change', status: 'failed', message: 'Repair this', includedInvocation: { id: 'private-run' } };
    const client = fixture(snapshot({ turns: [turn] }));
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: '' }));
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    act(() => result.current.continueTurn(turn));
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(result.current.sharingOpen).toBe(true);
    expect(result.current.error.message).toMatch(/Include that run again/);
  });

  it('does not submit an auto change while native editing is open', async () => {
    const client = fixture();
    const { result } = renderHook(() => useSolutionConversation({ client, solution, message: 'Change workflow', nativeEditing: true }));
    await waitFor(() => expect(result.current.contextReady).toBe(true));
    act(() => result.current.send());
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });
});
