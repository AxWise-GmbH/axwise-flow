import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SolutionConversation from './SolutionConversation.jsx';

const id = '10000000-0000-4000-8000-000000000001';
const hash = 'a'.repeat(64);
const draft = {
  id: '10000000-0000-4000-8000-000000000002',
  rowVersion: 3,
  workflowHash: 'b'.repeat(64),
};
const solution = { id, version: 1, name: 'Normalize contacts' };
const snapshot = (values = {}) => ({
  solutionId: id,
  context: { solutionVersion: 1, workflowHash: hash, selectedDraft: null, availableDraft: null },
  turns: [],
  ...values,
});
let client;
beforeEach(() => {
  client = {
    solutionConversation: vi.fn().mockResolvedValue(snapshot()),
    sendSolutionConversationTurn: vi.fn(),
  };
  client.sendSolutionConversationTurn.mockImplementation(async (_, command) =>
    snapshot({
      turns: [
        { id: command.turnId, message: command.message, mode: command.mode, status: 'queued' },
      ],
    })
  );
});
function show(props = {}) {
  return render(<SolutionConversation client={client} solution={solution} {...props} />);
}

describe('workflow-scoped conversation', () => {
  it('answers a mid-proposal clarification in the same chat with a scoped change command', async () => {
    const turn = {
      id: 'clarify',
      mode: 'change',
      status: 'blocked',
      errorCode: 'WORKFLOW_CONVERSATION_BLOCKED',
      message: 'Add validation',
      baseWorkflowHash: hash,
      targetDraft: null,
      reply: 'I need one preference.',
      questions: [
        { id: 'missing', prompt: 'Should a missing email be rejected or accepted with a warning?' },
      ],
    };
    client.solutionConversation.mockResolvedValue(snapshot({ turns: [turn] }));
    show();
    expect(await screen.findByRole('note', { name: 'Workflow clarification' })).toHaveTextContent(
      'Should a missing email'
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByText('Orqanix · Waiting for your answer')).toBeInTheDocument();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'Reject it with a clear validation error.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Answer & continue' }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    expect(client.sendSolutionConversationTurn.mock.calls[0]).toEqual([
      id,
      expect.objectContaining({
        mode: 'auto',
        message: 'Reject it with a clear validation error.',
        continuation: { turnId: 'clarify', kind: 'answer' },
        workflowHash: hash,
      }),
      expect.any(String),
    ]);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).not.toHaveProperty(
      'includeInvocation'
    );
  });
  it('requires fresh per-message opt-in before continuing a clarification that used run data', async () => {
    client.solutionConversation.mockResolvedValue(
      snapshot({
        turns: [
          {
            id: 'clarify',
            mode: 'change',
            status: 'blocked',
            errorCode: 'WORKFLOW_CONVERSATION_BLOCKED',
            baseWorkflowHash: hash,
            targetDraft: null,
            questions: [{ id: 'keep', prompt: 'Should that value be kept?' }],
            includedInvocation: { id: draft.id },
          },
        ],
        availableInvocations: [
          { id: draft.id, status: 'succeeded', mode: 'test', workflowHash: hash },
        ],
      })
    );
    show();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'Keep it' },
    });
    expect(screen.getByRole('button', { name: 'Answer & continue' })).toBeDisabled();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Troubleshooting data (optional)' }));
    expect(screen.getByRole('checkbox', { name: /Include one run/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Include one run/ }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Run to include' }));
    fireEvent.click(await screen.findByRole('option'));
    fireEvent.click(screen.getByRole('button', { name: 'Answer & continue' }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    expect(client.sendSolutionConversationTurn.mock.calls[0][1].includeInvocation).toEqual({
      id: draft.id,
      inputOutput: true,
    });
  });
  it('does not offer to resume a clarification from another revision', async () => {
    client.solutionConversation.mockResolvedValue(
      snapshot({
        turns: [
          {
            id: 'other-draft',
            mode: 'change',
            status: 'blocked',
            errorCode: 'WORKFLOW_CONVERSATION_BLOCKED',
            baseWorkflowHash: hash,
            targetDraft: draft,
            questions: [{ id: 'q', prompt: 'Choose a threshold for the other revision.' }],
          },
        ],
      })
    );
    show();
    await screen.findByText('Context: workflow v1');
    expect(screen.queryByRole('note', { name: 'Workflow clarification' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Answer & continue' })).toBeNull();
  });
  it.each([
    ['hash', { ...draft, workflowHash: 'c'.repeat(64) }],
    ['row version', { ...draft, rowVersion: draft.rowVersion + 1 }],
  ])(
    'does not continue a question after the same draft changes its %s',
    async (_, selectedDraft) => {
      client.solutionConversation.mockResolvedValue(
        snapshot({
          context: {
            solutionVersion: 1,
            workflowHash: hash,
            selectedDraft,
            availableDraft: selectedDraft,
          },
          turns: [
            {
              id: 'stale-question',
              mode: 'change',
              status: 'blocked',
              errorCode: 'WORKFLOW_CONVERSATION_BLOCKED',
              baseWorkflowHash: hash,
              targetDraft: draft,
              questions: [{ id: 'q', prompt: 'Which threshold should I use?' }],
            },
          ],
        })
      );
      show({ draftId: draft.id });
      await screen.findByText('Which threshold should I use?');
      expect(screen.queryByRole('note', { name: 'Workflow clarification' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Answer & continue' })).toBeNull();
      expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    }
  );
  it.each([7, 8])(
    'limits clarification continuation to the model history after %i Ask turns',
    async (count) => {
      client.solutionConversation.mockResolvedValue(
        snapshot({
          turns: [
            {
              id: 'question',
              mode: 'change',
              status: 'blocked',
              errorCode: 'WORKFLOW_CONVERSATION_BLOCKED',
              baseWorkflowHash: hash,
              targetDraft: null,
              questions: [{ id: 'q', prompt: 'Which threshold should I use?' }],
            },
            ...Array.from({ length: count }, (_, index) => ({
              id: `ask-${index}`,
              mode: 'ask',
              status: 'completed',
              message: `Explain option ${index}`,
            })),
          ],
        })
      );
      show();
      await screen.findByText('Context: workflow v1');
      const continuation = screen.queryByRole('button', { name: 'Answer & continue' });
      if (count === 7) expect(continuation).toBeInTheDocument();
      else expect(continuation).toBeNull();
      expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    }
  );
  it('keeps one composer through draft selection, waits for fresh context and sends one exact proposal', async () => {
    const planned = {
      id: 'planned',
      mode: 'auto',
      resolvedMode: 'change',
      status: 'blocked',
      phase: 'needs_input',
      draftSelectionRequired: true,
      availableDraft: draft,
      message: 'Normalize email as well',
      baseWorkflowHash: hash,
    };
    const base = snapshot({
      context: {
        solutionVersion: 1,
        workflowHash: hash,
        selectedDraft: null,
        availableDraft: draft,
      },
      turns: [planned],
    });
    let resolveDraft;
    client.solutionConversation.mockImplementation(async (_, { draftId }) =>
      draftId
        ? new Promise((resolve) => {
            resolveDraft = resolve;
          })
        : base
    );
    const onSelectDraft = vi.fn();
    const view = show({ onSelectDraft });
    await screen.findByText('Context: workflow v1');
    const input = screen.getByRole('textbox', { name: 'Message this workflow' });
    fireEvent.change(input, { target: { value: 'Keep these unsent notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update existing draft' }));
    expect(onSelectDraft).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    await waitFor(() => expect(resolveDraft).toBeTypeOf('function'));
    await act(async () =>
      resolveDraft(
        snapshot({ context: { ...base.context, selectedDraft: draft }, turns: [planned] })
      )
    );
    expect(onSelectDraft).toHaveBeenCalledExactlyOnceWith(draft.id);
    view.rerender(
      <SolutionConversation
        client={client}
        solution={solution}
        draftId={draft.id}
        onSelectDraft={onSelectDraft}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Message this workflow' })).toBe(input);
    expect(input).toHaveValue('Keep these unsent notes');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await waitFor(() =>
      expect(client.solutionConversation).toHaveBeenCalledWith(id, { draftId: draft.id })
    );
    await act(async () =>
      resolveDraft(snapshot({ context: { ...base.context, selectedDraft: draft } }))
    );
    await screen.findByText('Selected draft · live v1 unchanged');
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    expect(client.sendSolutionConversationTurn.mock.calls[0][0]).toBe(id);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'change',
      continuation: { turnId: planned.id, kind: 'answer' },
      draft,
    });
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).not.toHaveProperty(
      'includeInvocation'
    );
  });
  it('prepares a structured proposal with its immutable reference and preserves unsent notes', async () => {
    client.solutionConversation.mockResolvedValue(
      snapshot({
        turns: [
          {
            id: 'question',
            mode: 'ask',
            status: 'completed',
            message: 'Add an alert when validation fails',
            reply: 'This was only an answer.',
            proposals: [
              {
                id: 'option-2',
                title: 'Validation alert',
                request: 'Add an alert when validation fails',
                contentHash: hash,
                capability: 'supported',
                requirements: { nodeTypes: [], newConnection: false, separateWorkflow: false },
              },
            ],
          },
        ],
      })
    );
    show();
    const prepare = await screen.findByRole('button', { name: 'Prepare this change' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsent notes' } });
    fireEvent.click(prepare);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Message this workflow' })).toHaveValue(
      'Unsent notes'
    );
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    expect(client.sendSolutionConversationTurn.mock.calls[0][1].mode).toBe('change');
    expect(client.sendSolutionConversationTurn.mock.calls[0][1].proposalRef).toEqual({
      turnId: 'question',
      proposalId: 'option-2',
      proposalHash: hash,
    });
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).not.toHaveProperty(
      'includeInvocation'
    );
  });
  it('blocks submission when a selected revision response does not match the requested draft', async () => {
    show({ draftId: draft.id });
    await screen.findByText(
      'The selected draft context could not be verified. Refresh before sending.'
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Change mapping' },
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });
  it('never includes run payloads by default and requires a run selection after explicit opt-in', async () => {
    client.solutionConversation.mockResolvedValue(
      snapshot({
        availableInvocations: [
          { id: draft.id, status: 'succeeded', mode: 'test', workflowHash: hash },
        ],
      })
    );
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Troubleshooting data (optional)' }));
    const consent = await screen.findByRole('checkbox', { name: /Include one run/ });
    expect(consent).not.toBeChecked();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Explain the result' },
    });
    fireEvent.click(consent);
    expect(screen.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Run to include' }));
    fireEvent.click(await screen.findByRole('option'));
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    expect(client.sendSolutionConversationTurn.mock.calls[0][1].includeInvocation).toEqual({
      id: draft.id,
      inputOutput: true,
    });
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Run to include' })).not.toBeInTheDocument()
    );
  });
  it('does not carry run consent into a subsequent message', async () => {
    const history = [];
    const read = () =>
      snapshot({
        turns: [...history],
        availableInvocations: [
          { id: draft.id, status: 'succeeded', mode: 'test', workflowHash: hash },
        ],
      });
    client.solutionConversation.mockImplementation(async () => read());
    client.sendSolutionConversationTurn.mockImplementation(async (_, command) => {
      history.push({
        id: command.turnId,
        mode: command.mode,
        message: command.message,
        status: 'completed',
        reply: { markdown: 'Saved answer' },
      });
      return read();
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Troubleshooting data (optional)' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Include one run/ }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Run to include' }));
    fireEvent.click(await screen.findByRole('option'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Inspect selected run' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    await screen.findByText('Saved answer');
    fireEvent.click(screen.getByRole('button', { name: 'Troubleshooting data (optional)' }));
    expect(screen.getByRole('checkbox', { name: /Include one run/ })).not.toBeChecked();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Explain the graph instead' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(2));
    expect(client.sendSolutionConversationTurn.mock.calls[1][1]).not.toHaveProperty(
      'includeInvocation'
    );
  });
  it('loads its actual saved history and sends an exact-version read-only question', async () => {
    show();
    await waitFor(() =>
      expect(client.solutionConversation).toHaveBeenCalledWith(id, { draftId: undefined })
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Why did the latest run fail?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        mode: 'auto',
        message: 'Why did the latest run fail?',
        expectedSolutionVersion: 1,
        workflowHash: hash,
      }),
      expect.any(String)
    );
    expect(screen.getByText('Checking this workflow and its saved evidence…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
  it('does not silently overwrite an existing draft', async () => {
    const turns = [];
    const read = () =>
      snapshot({
        turns: [...turns],
        context: {
          solutionVersion: 1,
          workflowHash: hash,
          selectedDraft: null,
          availableDraft: draft,
        },
      });
    client.sendSolutionConversationTurn.mockImplementation(async (_, command) => {
      turns.push({
        id: command.turnId,
        mode: 'auto',
        resolvedMode: 'change',
        status: 'blocked',
        phase: 'needs_input',
        draftSelectionRequired: true,
        availableDraft: draft,
        baseWorkflowHash: hash,
        message: command.message,
      });
      return read();
    });
    client.solutionConversation.mockResolvedValue(
      snapshot({
        context: {
          solutionVersion: 1,
          workflowHash: hash,
          selectedDraft: null,
          availableDraft: draft,
        },
      })
    );
    const onSelectDraft = vi.fn();
    client.solutionConversation.mockImplementation(async () => read());
    show({ onSelectDraft });
    await screen.findByText('This conversation stays with this workflow and its recorded results.');
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Normalize email as well' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('button', { name: 'Update existing draft' });
    expect(onSelectDraft).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).not.toHaveProperty('draft');
  });
  it('pins a selected draft snapshot and does not grant activation or test authority', async () => {
    client.solutionConversation.mockResolvedValue(
      snapshot({
        context: {
          solutionVersion: 1,
          workflowHash: hash,
          selectedDraft: draft,
          availableDraft: draft,
        },
      })
    );
    show({ draftId: draft.id });
    await screen.findByText('Selected draft · live v1 unchanged');
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Normalize email as well' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1));
    const body = client.sendSolutionConversationTurn.mock.calls[0][1];
    expect(body.draft).toEqual(draft);
    expect(Object.keys(body).sort()).toEqual([
      'draft',
      'expectedSolutionVersion',
      'message',
      'mode',
      'turnId',
      'workflowHash',
    ]);
  });
  it('retries an unconfirmed delivery with identical body and key, never a second request', async () => {
    client.sendSolutionConversationTurn.mockRejectedValueOnce(new Error('Network interrupted'));
    show();
    await screen.findByText('This conversation stays with this workflow and its recorded results.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Explain the saved graph' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry same request' }));
    await waitFor(() => expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(2));
    expect(client.sendSolutionConversationTurn.mock.calls[1]).toEqual(
      client.sendSolutionConversationTurn.mock.calls[0]
    );
  });
  it('rejects a response from a different workflow and retains uncertainty', async () => {
    client.sendSolutionConversationTurn.mockResolvedValue(
      snapshot({ solutionId: 'another-workflow' })
    );
    show();
    await screen.findByText('This conversation stays with this workflow and its recorded results.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Explain' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    expect(await screen.findByRole('button', { name: 'Retry same request' })).toBeInTheDocument();
    expect(
      screen.getByText('The saved workflow conversation could not be verified.')
    ).toBeInTheDocument();
  });
  it('renders persisted replies as safe markdown and only links a completed real draft', async () => {
    const onSelectDraft = vi.fn();
    client.solutionConversation.mockResolvedValue(
      snapshot({
        turns: [
          {
            id: 'saved-turn',
            mode: 'change',
            message: 'Trim email',
            status: 'completed',
            reply: '**Email normalization** is prepared for review.',
            draftRevisionId: draft.id,
            baseWorkflowHash: hash,
            model: 'recorded-model',
          },
        ],
      })
    );
    show({ onSelectDraft });
    expect(
      await screen.findByText('Email normalization', { selector: 'strong' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));
    expect(onSelectDraft).toHaveBeenCalledWith(draft.id);
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });
  it('shows blocked questions honestly, without a fake completed draft', async () => {
    client.solutionConversation.mockResolvedValue(
      snapshot({
        turns: [
          {
            id: 'blocked-turn',
            mode: 'change',
            message: 'Send to CRM',
            status: 'blocked',
            reply: 'Which CRM?',
            questions: [{ id: 'crm', prompt: 'Which CRM account should receive the contact?' }],
            errorCode: 'CONNECTION_SETUP_REQUIRED',
          },
        ],
      })
    );
    show();
    expect(
      await screen.findByText('Which CRM account should receive the contact?')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show changes' })).toBeNull();
    expect(screen.getByText(/The live workflow was not changed/)).toBeInTheDocument();
  });
  it('explains a failed change plainly and keeps technical status under Evidence', async () => {
    client.solutionConversation.mockResolvedValue(
      snapshot({
        turns: [
          {
            id: 'failed-turn',
            mode: 'change',
            message: 'Add an alert',
            status: 'failed',
            errorCode: 'WORKFLOW_CONVERSATION_FAILED',
          },
        ],
      })
    );
    show();
    expect(await screen.findByText(/I couldn’t prepare this change/)).toBeInTheDocument();
    expect(screen.queryByText(/Request status: WORKFLOW_CONVERSATION_FAILED/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    expect(await screen.findByText(/Request status: WORKFLOW_CONVERSATION_FAILED/)).toBeVisible();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });
  it('clears cross-workflow input and stale response state when the selected entity changes', async () => {
    const view = show();
    await screen.findByText('This conversation stays with this workflow and its recorded results.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'A private question about the first workflow' },
    });
    client.solutionConversation.mockResolvedValue({ ...snapshot(), solutionId: 'new-workflow' });
    view.rerender(
      <SolutionConversation client={client} solution={{ id: 'new-workflow', version: 1 }} />
    );
    await waitFor(() =>
      expect(client.solutionConversation).toHaveBeenCalledWith('new-workflow', {
        draftId: undefined,
      })
    );
    expect(screen.getByRole('textbox', { name: 'Message this workflow' })).toHaveValue('');
    expect(
      within(screen.getByRole('log')).queryByText('A private question about the first workflow')
    ).toBeNull();
  });
  it('does not reload the native editor for a historical completed draft', async () => {
    const onDraftReady = vi.fn();
    const prior = {
      id: 'old-completed',
      status: 'completed',
      mode: 'change',
      message: 'Old request',
      reply: 'Old draft saved',
      draftRevisionId: draft.id,
    };
    client.solutionConversation.mockResolvedValue(snapshot({ turns: [prior] }));
    show({ onDraftReady });
    await screen.findByText('Old draft saved');
    expect(onDraftReady).not.toHaveBeenCalled();
    client.sendSolutionConversationTurn.mockImplementation(async (_, command) =>
      snapshot({
        turns: [
          prior,
          {
            ...command,
            id: command.turnId,
            status: 'completed',
            reply: 'New draft saved',
            draftRevisionId: 'new-draft',
          },
        ],
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Normalize a new field' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onDraftReady).toHaveBeenCalledExactlyOnceWith('new-draft'));
  });
  it('keeps native edits safe by disabling draft changes while that editor is open', async () => {
    show({ nativeEditing: true });
    await screen.findByText('This conversation stays with this workflow and its recorded results.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Message this workflow' }), {
      target: { value: 'Explain the workflow' },
    });
    expect(screen.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });
});
