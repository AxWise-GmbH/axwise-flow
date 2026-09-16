import { useCallback, useEffect, useMemo, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantSurface } from './AssistantSurface.jsx';

const panel = vi.hoisted(() => ({ mounts: vi.fn(), selected: vi.fn(), solutions: new Map() }));

// The actual Assistant, composer, workflow discovery, transcript projection and
// durable conversation hook run together. Only the native runtime panel is a
// deterministic fixture: no n8n deployment or execution is claimed by this test.
vi.mock('../GcpWorkspace/SolutionDetailPage.jsx', () => ({
  SolutionDetailWorkspace: function NativePanelFixture({
    solutionId,
    onContextChange,
    conversationWorking,
  }) {
    const [selectedDraftId, setSelectedDraftId] = useState(null);
    const [nativeEditing, setNativeEditing] = useState(false);
    const [panelBusy, setPanelBusy] = useState(false);
    const onSelectDraft = useCallback((id) => {
      panel.selected(id);
      setSelectedDraftId(id);
    }, []);
    const context = useMemo(
      () => ({
        solution: panel.solutions.get(solutionId),
        selectedDraftId,
        nativeEditing,
        panelBusy,
        onSelectDraft,
        refreshDraft: onSelectDraft,
        onOpenHistory: () => {},
      }),
      [solutionId, selectedDraftId, nativeEditing, panelBusy, onSelectDraft]
    );
    useEffect(() => {
      onContextChange(context);
    }, [context, onContextChange]);
    useEffect(() => {
      panel.mounts(solutionId);
    }, [solutionId]);
    return (
      <section aria-label="Native panel fixture">
        <p>Native workflow fixture {solutionId}</p>
        <output aria-label="Selected native draft">{selectedDraftId || 'current'}</output>
        <button disabled={conversationWorking} onClick={() => setNativeEditing((value) => !value)}>
          {nativeEditing ? 'Finish native editing' : 'Start native editing'}
        </button>
        <button disabled={conversationWorking} onClick={() => setPanelBusy((value) => !value)}>
          {panelBusy ? 'Confirm runtime request' : 'Start runtime request'}
        </button>
      </section>
    );
  },
}));

const threadId = '10000000-0000-4000-8000-000000000001';
const otherThreadId = '10000000-0000-4000-8000-000000000002';
const turnId = '20000000-0000-4000-8000-000000000001';
const runId = '30000000-0000-4000-8000-000000000001';
const solutionId = '40000000-0000-4000-8000-000000000001';
const buildId = '50000000-0000-4000-8000-000000000001';
const hash = 'a'.repeat(64);
const draft = {
  id: '60000000-0000-4000-8000-000000000001',
  rowVersion: 3,
  workflowHash: 'b'.repeat(64),
};
const solution = {
  id: solutionId,
  buildRequestId: buildId,
  version: 1,
  rowVersion: 1,
  name: 'Order routing',
  purpose: 'Route valid orders',
  status: 'active',
};
const build = {
  id: buildId,
  runId,
  solutionId,
  rowVersion: 4,
  source: { threadId },
  name: solution.name,
  status: 'completed',
};

function originalMessages(id = threadId, linked = true) {
  return [
    {
      id: turnId,
      threadId: id,
      turnId,
      role: 'user',
      route: 'DIRECT_ANSWER',
      parts: [
        {
          type: 'text',
          markdown:
            id === threadId ? 'Original task: route my orders' : 'Unrelated other conversation',
        },
      ],
      createdAt: '2026-09-06T10:00:00.000Z',
    },
    {
      id: '21000000-0000-4000-8000-000000000001',
      threadId: id,
      turnId,
      role: 'assistant',
      route: linked ? 'START_GOAL' : 'DIRECT_ANSWER',
      workflowRunId: linked ? runId : null,
      parts: [
        {
          type: 'text',
          markdown: linked ? 'The original task response remains here.' : 'An unrelated answer.',
        },
        ...(linked
          ? [{ type: 'goal_link', runId, label: 'Order routing task', status: 'completed' }]
          : []),
      ],
      createdAt: '2026-09-06T10:00:01.000Z',
    },
  ];
}

function setup({ availableDraft = null, turns } = {}) {
  let savedTurns = turns || [
    {
      id: '70000000-0000-4000-8000-000000000001',
      mode: 'ask',
      status: 'completed',
      message: 'Explain the saved workflow',
      reply: { markdown: 'This saved workflow checks and routes orders.' },
      baseWorkflowHash: hash,
      createdAt: '2026-09-06T11:00:00.000Z',
    },
  ];
  const snapshot = (selectedDraftId) => ({
    solutionId,
    enabled: true,
    turns: structuredClone(savedTurns),
    context: {
      solutionVersion: 1,
      workflowHash: hash,
      selectedDraft: selectedDraftId === draft.id ? draft : null,
      availableDraft,
    },
    availableInvocations: [
      {
        id: '80000000-0000-4000-8000-000000000001',
        mode: 'test',
        status: 'succeeded',
        workflowHash: hash,
      },
    ],
  });
  const client = {
    assistantThreads: vi.fn().mockResolvedValue({
      threads: [
        { id: threadId, title: 'Order task thread' },
        { id: otherThreadId, title: 'Other conversation' },
      ],
    }),
    assistantThread: vi.fn(async (id) => ({
      thread: { id },
      messages: originalMessages(id, id === threadId),
    })),
    assistantSend: vi.fn(),
    assistantResume: vi.fn(),
    assistantRetry: vi.fn(),
    assistantCancel: vi.fn(),
    agents: vi.fn().mockResolvedValue({ agents: [] }),
    read: vi.fn().mockResolvedValue({
      workflow: {
        run: {
          id: runId,
          status: 'completed',
          rowVersion: 4,
          request: 'Route my orders',
          evidenceReadiness: 'ready',
          finalArtifact: null,
        },
        stages: [],
        attempts: [],
        dependencies: [],
        approvals: [],
      },
    }),
    artifact: vi.fn(),
    approve: vi.fn(),
    reviseScope: vi.fn(),
    createSolutionBuildRequest: vi.fn(),
    solutionBuildRequests: vi.fn().mockResolvedValue({ buildRequests: [build] }),
    solution: vi.fn().mockResolvedValue({ solution }),
    solutionConversation: vi.fn(async (_id, options) => snapshot(options?.draftId)),
    sendSolutionConversationTurn: vi.fn(async (_id, command) => {
      const needsDraft = availableDraft && command.mode === 'auto' && !command.draft;
      savedTurns.push({
        id: command.turnId,
        mode: command.mode,
        message: command.message,
        status: needsDraft ? 'blocked' : 'completed',
        resolvedMode: needsDraft ? 'change' : 'ask',
        ...(needsDraft
          ? { phase: 'needs_input', draftSelectionRequired: true, availableDraft }
          : {}),
        ...(command.continuation ? { continuation: command.continuation } : {}),
        reply: {
          markdown: needsDraft
            ? 'Confirm updating the existing draft.'
            : 'Saved scoped response to the new request.',
        },
        baseWorkflowHash: hash,
        targetDraft: command.draft || null,
        createdAt: '2026-09-06T12:00:00.000Z',
      });
      return snapshot(command.draft?.id);
    }),
  };
  return {
    client,
    snapshot,
    setTurns: (next) => {
      savedTurns = next;
    },
  };
}
function tree(client, routeSearch = `?thread=${threadId}`) {
  return (
    <MemoryRouter>
      <AssistantSurface client={client} onOpenGoal={vi.fn()} routeSearch={routeSearch} />
    </MemoryRouter>
  );
}
async function chooseWorkflow() {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Working on' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Order routing' }));
  await screen.findByRole('region', { name: 'Native panel fixture' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^(Send|Answer & continue)$/ })).toBeInTheDocument()
  );
}
async function settle() {
  await act(async () => {
    for (let n = 0; n < 12; n += 1) await Promise.resolve();
  });
}
beforeEach(() => {
  window.history.replaceState(null, '', '/assistant');
  panel.mounts.mockClear();
  panel.selected.mockClear();
  panel.solutions.clear();
  panel.solutions.set(solutionId, solution);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('original Assistant chat with native workflow side panel', () => {
  it('loads original messages and saved workflow replies into one log and opens the real task card in place', async () => {
    const { client } = setup();
    const view = render(tree(client));
    const answer = await screen.findByText('This saved workflow checks and routes orders.');
    const log = screen.getByRole('log', { name: 'Assistant conversation' });
    expect(log).toContainElement(answer);
    expect(within(log).getByText('The original task response remains here.')).toBeInTheDocument();
    expect(screen.getAllByRole('log')).toHaveLength(1);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(view.container.querySelectorAll('form')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Workflow chat' })).toBeNull();
    const card = await screen.findByRole('article', { name: 'Workflow: Order routing' });
    fireEvent.click(within(card).getByRole('link', { name: 'Open workflow' }));
    await screen.findByRole('region', { name: 'Native panel fixture' });
    expect(window.location.pathname).toBe('/assistant');
    expect(new URLSearchParams(window.location.search).get('workflow')).toBe(solutionId);
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(client.createSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('retains the original input DOM and draft while opening, hiding and reopening the native panel', async () => {
    const { client } = setup();
    render(tree(client));
    await screen.findByText('The original task response remains here.');
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, { target: { value: 'Keep this unsent thought' } });
    await chooseWorkflow();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Keep this unsent thought');
    const native = screen.getByRole('region', { name: 'Native panel fixture' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide workflow' }));
    expect(screen.queryByRole('complementary', { name: 'Workflow side panel' })).toBeNull();
    expect(native).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBe(input);
    fireEvent.click(screen.getByRole('button', { name: 'Show workflow' }));
    expect(screen.getByRole('region', { name: 'Native panel fixture' })).toBe(native);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Keep this unsent thought');
    expect(panel.mounts).toHaveBeenCalledTimes(1);
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });

  it('sends a workflow question only through the scoped endpoint, with no run-data consent by default', async () => {
    const { client } = setup();
    render(tree(client));
    await chooseWorkflow();
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, { target: { value: 'Why does the invalid branch reject the order?' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Saved scoped response to the new request.');
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
    expect(client.sendSolutionConversationTurn.mock.calls[0]).toEqual([
      solutionId,
      expect.objectContaining({ mode: 'auto', workflowHash: hash, expectedSolutionVersion: 1 }),
      expect.any(String),
    ]);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).not.toHaveProperty(
      'includeInvocation'
    );
    expect(screen.getAllByText('Why does the invalid branch reject the order?')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('');
    expect(screen.getAllByRole('log')).toHaveLength(1);
  });

  it('selects the existing draft without losing text, then submits its exact version and hash', async () => {
    const { client } = setup({ availableDraft: draft });
    render(tree(client));
    await chooseWorkflow();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Raise the order threshold' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Update existing draft' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Selected native draft')).toHaveTextContent(draft.id)
    );
    expect(screen.getByRole('textbox')).toBe(input);
    await screen.findByText('Saved scoped response to the new request.');
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(2);
    expect(client.sendSolutionConversationTurn.mock.calls[1][1]).toMatchObject({
      mode: 'change',
      draft,
      workflowHash: hash,
      continuation: {
        turnId: client.sendSolutionConversationTurn.mock.calls[0][1].turnId,
        kind: 'answer',
      },
    });
    expect(client.assistantSend).not.toHaveBeenCalled();
  });

  it('prepares the exact structured choice without replacing the original composer or dispatching ordinary chat', async () => {
    const proposalTurn = {
      id: '70000000-0000-4000-8000-000000000001',
      mode: 'ask',
      status: 'completed',
      message: 'How can I improve the workflow?',
      reply: 'Use a validation branch.',
      proposals: [
        {
          id: 'validation',
          title: 'Validation branch',
          request: 'Add a validation branch for incomplete orders',
          contentHash: hash,
          capability: 'supported',
          requirements: { nodeTypes: [], newConnection: false, separateWorkflow: false },
        },
      ],
      baseWorkflowHash: hash,
      createdAt: '2026-09-06T11:00:00.000Z',
    };
    const { client } = setup({ turns: [proposalTurn] });
    render(tree(client));
    await chooseWorkflow();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Keep unsent notes' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare this change' }));
    await screen.findByText('Saved scoped response to the new request.');
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'change',
      message: proposalTurn.proposals[0].request,
      proposalRef: { turnId: proposalTurn.id, proposalId: 'validation', proposalHash: hash },
    });
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Keep unsent notes');
    expect(client.assistantSend).not.toHaveBeenCalled();
  });

  it('does not reload the thread or clear the shared input on same-thread workflow-only URL changes', async () => {
    const { client } = setup();
    const view = render(tree(client));
    await screen.findByText('This saved workflow checks and routes orders.');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Typed before opening the canvas' } });
    view.rerender(tree(client, `?thread=${threadId}&workflow=${solutionId}`));
    await screen.findByRole('region', { name: 'Native panel fixture' });
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Typed before opening the canvas');
    view.rerender(tree(client, `?thread=${threadId}`));
    await settle();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Typed before opening the canvas');
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expect(screen.getByText('This saved workflow checks and routes orders.')).toBeInTheDocument();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });

  it('denies a workflow query from another thread and never mixes or resends its history', async () => {
    const { client } = setup();
    const view = render(tree(client));
    await screen.findByText('This saved workflow checks and routes orders.');
    const priorReads = client.solutionConversation.mock.calls.length;
    view.rerender(tree(client, `?thread=${otherThreadId}&workflow=${solutionId}`));
    await screen.findByText('An unrelated answer.');
    await screen.findByText(/could not be verified as part of this conversation/);
    expect(screen.queryByText('This saved workflow checks and routes orders.')).toBeNull();
    expect(screen.queryByText('The original task response remains here.')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Native panel fixture' })).toBeNull();
    expect(client.solutionConversation).toHaveBeenCalledTimes(priorReads);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });

  it('keeps native edit ownership through hiding the panel and blocks target changes and draft writes', async () => {
    const { client } = setup();
    render(tree(client));
    await chooseWorkflow();
    fireEvent.click(screen.getByRole('button', { name: 'Start native editing' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'A proposed change while editing' } });
    expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other conversation' }));
    await screen.findByText(/save your n8n edits before changing conversations/);
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('A proposed change while editing');
    fireEvent.click(screen.getByRole('button', { name: 'Show workflow' }));
    expect(screen.getByRole('button', { name: 'Finish native editing' })).toBeInTheDocument();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(panel.mounts).toHaveBeenCalledTimes(1);
  });

  it('keeps runtime request ownership while hidden, blocks workflow sends and host switches, then releases it', async () => {
    const { client } = setup();
    const view = render(tree(client));
    await chooseWorkflow();
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, {
      target: { value: 'Explain this workflow after the runtime request' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start runtime request' }));
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(input).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    // A programmatic form submit must be guarded as well as disabled buttons.
    fireEvent.submit(input.closest('form'));
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide workflow' }));
    expect(screen.queryByRole('complementary', { name: 'Workflow side panel' })).toBeNull();
    view.rerender(
      tree(client, `?thread=${threadId}&workflow=40000000-0000-4000-8000-000000000002`)
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Other conversation' }));
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Explain this workflow after the runtime request');
    fireEvent.click(screen.getByRole('button', { name: 'Show workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm runtime request' }));
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(input).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Working on' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(panel.mounts).toHaveBeenCalledTimes(1);
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(client.assistantSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Saved scoped response to the new request.');
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Other conversation' }));
    await screen.findByText('An unrelated answer.');
    expect(client.assistantThread).toHaveBeenCalledTimes(2);
  });

  it('locks timeline proposal, retry and candidate selection during a pending runtime request', async () => {
    const base = {
      mode: 'auto',
      resolvedMode: 'change',
      baseWorkflowHash: hash,
      createdAt: '2026-09-06T11:00:00.000Z',
    };
    const { client } = setup({
      turns: [
        {
          ...base,
          id: '70000000-0000-4000-8000-000000000001',
          status: 'completed',
          message: 'Suggest a change',
          reply: 'Consider validation.',
          proposals: [
            {
              id: 'validation',
              title: 'Validate input',
              request: 'Validate incomplete orders',
              contentHash: hash,
              capability: 'supported',
              requirements: { nodeTypes: [], newConnection: false, separateWorkflow: false },
            },
          ],
        },
        {
          ...base,
          id: '70000000-0000-4000-8000-000000000002',
          status: 'failed',
          phase: 'failed',
          message: 'Change the threshold',
          reply: 'A saved request can be retried.',
        },
        {
          ...base,
          id: '70000000-0000-4000-8000-000000000003',
          status: 'completed',
          message: 'Previous draft change',
          reply: 'A draft is saved.',
          draftRevisionId: draft.id,
        },
      ],
    });
    render(tree(client));
    await chooseWorkflow();
    const prepare = screen.getByRole('button', { name: 'Prepare this change' });
    const retry = screen.getByRole('button', { name: 'Retry this request' });
    const changes = screen.getByRole('button', { name: 'Show changes' });
    expect(prepare).toBeEnabled();
    expect(retry).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start runtime request' }));
    for (const button of [prepare, retry, changes]) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(panel.selected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm runtime request' }));
    expect(prepare).toBeEnabled();
    expect(retry).toBeEnabled();
    expect(changes).toBeEnabled();
  });

  it('makes the mobile canvas focusable without replacing the original chat, then restores the same input and text', async () => {
    const matchMedia = vi.fn((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    const { client } = setup();
    const view = render(tree(client));
    await screen.findByText('This saved workflow checks and routes orders.');
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    const log = screen.getByRole('log', { name: 'Assistant conversation' });
    fireEvent.change(input, { target: { value: 'Keep this unsent mobile thought' } });
    input.focus();
    const card = await screen.findByRole('article', { name: 'Workflow: Order routing' });
    fireEvent.click(within(card).getByRole('link', { name: 'Open workflow' }));
    const close = await screen.findByRole('button', { name: 'Close workflow panel' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(matchMedia).toHaveBeenCalledWith('(min-width:900px)');
    expect(input).toBeInTheDocument();
    expect(log).toBeInTheDocument();
    expect(input.closest('[inert]')).toHaveAttribute('aria-hidden', 'true');
    expect(input.closest('[inert]')).toContainElement(log);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('log')).toBeNull();
    expect(view.container.querySelectorAll('form')).toHaveLength(1);
    const native = await screen.findByRole('region', { name: 'Native panel fixture' });
    fireEvent.click(close);
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.closest('[inert]')).toBeNull();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getByRole('log')).toBe(log);
    expect(input).toHaveValue('Keep this unsent mobile thought');
    expect(native).toBeInTheDocument();
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  });

  it('blocks thread/target changes on uncertain delivery and retries the identical frozen workflow request', async () => {
    const { client } = setup();
    client.sendSolutionConversationTurn.mockRejectedValueOnce(new Error('Lost acknowledgement'));
    render(tree(client));
    await chooseWorkflow();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Inspect this result' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/Delivery is unconfirmed/);
    const first = structuredClone(client.sendSolutionConversationTurn.mock.calls[0]);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Other conversation' }));
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }));
    await screen.findByText('Saved scoped response to the new request.');
    expect(client.sendSolutionConversationTurn.mock.calls[1]).toEqual(first);
    expect(client.assistantSend).not.toHaveBeenCalled();
  });

  it('answers a saved clarification through the original input without a second chat or automatic submission', async () => {
    const { client } = setup({
      turns: [
        {
          id: '70000000-0000-4000-8000-000000000002',
          mode: 'change',
          status: 'blocked',
          message: 'Add an order threshold',
          baseWorkflowHash: hash,
          targetDraft: null,
          errorCode: 'WORKFLOW_CONVERSATION_BLOCKED',
          questions: [
            { id: 'threshold', prompt: 'Should the threshold include orders equal to 100?' },
          ],
          reply: { markdown: 'I need your boundary preference.' },
          createdAt: '2026-09-06T11:00:00.000Z',
        },
      ],
    });
    render(tree(client));
    await screen.findByText('I need your boundary preference.');
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    await chooseWorkflow();
    await screen.findByRole('note', { name: 'Workflow clarification' });
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Include orders equal to 100.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer & continue' }));
    await screen.findByText('Saved scoped response to the new request.');
    expect(client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).toMatchObject({
      mode: 'auto',
      message: 'Include orders equal to 100.',
      continuation: { turnId: '70000000-0000-4000-8000-000000000002', kind: 'answer' },
      workflowHash: hash,
    });
    expect(client.sendSolutionConversationTurn.mock.calls[0][1]).not.toHaveProperty(
      'includeInvocation'
    );
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getAllByRole('log')).toHaveLength(1);
    expect(client.assistantSend).not.toHaveBeenCalled();
  });

  it('keeps a genuinely queued workflow request locked without claiming completion or allowing another target', async () => {
    const f = setup();
    f.client.sendSolutionConversationTurn.mockImplementation(async (_id, command) => {
      f.setTurns([
        {
          id: command.turnId,
          mode: command.mode,
          message: command.message,
          status: 'queued',
          createdAt: '2026-09-06T12:00:00.000Z',
        },
      ]);
      return f.snapshot();
    });
    render(tree(f.client));
    await chooseWorkflow();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Check this branch' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Checking this workflow and its saved evidence…');
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Start native editing' })).toBeDisabled();
    expect(screen.queryByText('Saved scoped response to the new request.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Other conversation' }));
    expect(f.client.assistantThread).toHaveBeenCalledTimes(1);
    expect(f.client.assistantSend).not.toHaveBeenCalled();
    expect(f.client.sendSolutionConversationTurn).toHaveBeenCalledTimes(1);
  });
});
