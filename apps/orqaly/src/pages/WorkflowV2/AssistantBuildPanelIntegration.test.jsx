import { useEffect, useMemo, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantSurface } from './AssistantSurface.jsx';

const panels = vi.hoisted(() => ({
  mounts: vi.fn(),
  completed: vi.fn(),
  solution: null,
  buildFor: null,
}));

// The real Surface, persisted-message discovery, task card, composer and URL
// handling run together. Only runtime panels are fixtures; this is not proof of
// native editing, model generation, approval or execution.
vi.mock('../GcpWorkspace/WorkflowBuildPage.jsx', () => ({
  WorkflowBuildWorkspace: function BuildPanelFixture({
    client,
    buildRequestId,
    onOpenWorkflow,
    onEditingChange,
    onBusyChange,
    onContextChange,
    embedded,
  }) {
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      panels.mounts(buildRequestId);
    }, [buildRequestId]);
    useEffect(() => {
      onEditingChange?.(editing);
      return () => onEditingChange?.(false);
    }, [editing, onEditingChange]);
    useEffect(() => {
      onBusyChange?.(busy);
      return () => onBusyChange?.(false);
    }, [busy, onBusyChange]);
    const context = useMemo(() => {
      const selected = panels.buildFor?.(buildRequestId);
      if (!selected) return null;
      return {
        build: selected,
        nativeEditing: editing,
        panelBusy: busy,
        ready: true,
        // The real panel's CAS and secret checks have separate page tests. Here
        // typed transport spies establish which endpoint the original composer
        // chooses; they do not claim backend persistence or generation.
        onAnswer: async (questionId, value) => {
          await client.answerSolutionBuildRequest(
            buildRequestId,
            { expectedVersion: selected.rowVersion, questionId, value },
            'fixture-answer-key'
          );
          return true;
        },
        onRepair: async (instruction) => {
          await client.repairSolutionBuildRequest(
            buildRequestId,
            {
              expectedVersion: selected.rowVersion,
              workflowHash: selected.workflowHash,
              instruction,
            },
            'fixture-repair-key'
          );
          return true;
        },
      };
    }, [client, buildRequestId, editing, busy]);
    useEffect(() => {
      onContextChange?.(context);
    }, [context, onContextChange]);
    useEffect(() => () => onContextChange?.(null), [onContextChange]);
    return (
      <section aria-label="Build panel fixture">
        <output aria-label="Selected build">{buildRequestId}</output>
        <output aria-label="Embedded build">{String(embedded)}</output>
        <button onClick={() => setEditing((value) => !value)}>
          {editing ? 'Finish fixture editing' : 'Start fixture editing'}
        </button>
        <button onClick={() => setBusy((value) => !value)}>
          {busy ? 'Confirm fixture request' : 'Start fixture request'}
        </button>
        <button
          onClick={() => {
            panels.completed();
            onOpenWorkflow(panels.solution.id);
          }}
        >
          Open saved workflow fixture
        </button>
      </section>
    );
  },
}));
vi.mock('../GcpWorkspace/SolutionDetailPage.jsx', () => ({
  SolutionDetailWorkspace: function SolutionPanelFixture({ solutionId, onContextChange }) {
    const context = useMemo(
      () => ({
        solution: panels.solution?.id === solutionId ? panels.solution : null,
        selectedDraftId: null,
        nativeEditing: false,
      }),
      [solutionId]
    );
    useEffect(() => {
      onContextChange(context);
    }, [context, onContextChange]);
    return <section aria-label="Solution panel fixture">Saved workflow {solutionId}</section>;
  },
}));

const threadId = '10000000-0000-4000-8000-000000000011';
const otherThreadId = '10000000-0000-4000-8000-000000000012';
const runId = '30000000-0000-4000-8000-000000000011';
const buildId = '50000000-0000-4000-8000-000000000011';
const otherBuildId = '50000000-0000-4000-8000-000000000012';
const solutionId = '40000000-0000-4000-8000-000000000011';
const hash = 'a'.repeat(64);
const solution = {
  id: solutionId,
  buildRequestId: buildId,
  rowVersion: 1,
  version: 1,
  name: 'Prepared order workflow',
  status: 'draft',
};
const build = {
  id: buildId,
  runId,
  rowVersion: 2,
  inputVersion: 1,
  workflowHash: hash,
  source: { threadId },
  name: 'Order workflow draft',
  instruction: 'Prepare the order workflow from the original task.',
  status: 'draft',
  solutionId: null,
};

function setup({ builds = [build] } = {}) {
  let savedBuilds = builds;
  panels.buildFor = (id) => savedBuilds.find((item) => item.id === id);
  const client = {
    assistantThreads: vi.fn().mockResolvedValue({
      threads: [
        { id: threadId, title: 'Original order conversation' },
        { id: otherThreadId, title: 'Unrelated conversation' },
      ],
    }),
    assistantThread: vi.fn(async (id) => ({
      thread: { id },
      messages: [
        {
          id: '20000000-0000-4000-8000-000000000011',
          turnId: '20000000-0000-4000-8000-000000000011',
          threadId: id,
          role: 'user',
          route: 'DIRECT_ANSWER',
          parts: [{ type: 'text', markdown: 'Original order task, kept in its own conversation.' }],
          createdAt: '2026-09-06T10:00:00.000Z',
        },
        {
          id: '21000000-0000-4000-8000-000000000011',
          turnId: '20000000-0000-4000-8000-000000000011',
          threadId: id,
          role: 'assistant',
          route: 'START_GOAL',
          workflowRunId: runId,
          parts: [
            { type: 'text', markdown: 'The saved task can become an executable workflow.' },
            { type: 'goal_link', runId, label: 'Order task', status: 'completed' },
          ],
          createdAt: '2026-09-06T10:00:01.000Z',
        },
      ],
    })),
    assistantSend: vi.fn(),
    assistantResume: vi.fn(),
    assistantRetry: vi.fn(),
    assistantCancel: vi.fn(),
    agents: vi.fn().mockResolvedValue({ agents: [] }),
    read: vi.fn().mockResolvedValue({
      workflow: {
        run: { id: runId, status: 'completed', rowVersion: 4, request: 'Prepare orders' },
        stages: [],
        attempts: [],
        dependencies: [],
        approvals: [],
      },
    }),
    createSolutionBuildRequest: vi.fn(),
    answerSolutionBuildRequest: vi.fn().mockResolvedValue({}),
    repairSolutionBuildRequest: vi.fn().mockResolvedValue({}),
    solutionBuildRequests: vi.fn(async () => ({ buildRequests: savedBuilds })),
    solution: vi.fn().mockResolvedValue({ solution }),
    solutionConversation: vi.fn().mockResolvedValue({
      solutionId,
      enabled: true,
      turns: [],
      context: {
        solutionVersion: 1,
        workflowHash: hash,
        selectedDraft: null,
        availableDraft: null,
      },
    }),
    sendSolutionConversationTurn: vi.fn(),
  };
  panels.completed.mockImplementation(() => {
    savedBuilds = savedBuilds.map((item) =>
      item.id === buildId ? { ...item, rowVersion: 3, status: 'completed', solutionId } : item
    );
  });
  return { client };
}
function tree(client, routeSearch = `?thread=${threadId}`) {
  return (
    <MemoryRouter>
      <AssistantSurface client={client} routeSearch={routeSearch} onOpenGoal={vi.fn()} />
    </MemoryRouter>
  );
}
async function openBuildCard(name = build.name, action = 'View draft') {
  const card = await screen.findByRole('article', { name: `Workflow: ${name}` });
  fireEvent.click(within(card).getByRole('link', { name: action }));
}
function expectNoCommands(client) {
  expect(client.assistantSend).not.toHaveBeenCalled();
  expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
  expect(client.createSolutionBuildRequest).not.toHaveBeenCalled();
  expect(client.answerSolutionBuildRequest).not.toHaveBeenCalled();
  expect(client.repairSolutionBuildRequest).not.toHaveBeenCalled();
}
beforeEach(() => {
  window.history.replaceState(null, '', '/assistant');
  panels.mounts.mockClear();
  panels.completed.mockReset();
  panels.solution = solution;
});
afterEach(() => vi.restoreAllMocks());

describe('Build workspace inside the original Assistant conversation', () => {
  it('sends an explicit answer from the original composer only to the selected Build question', async () => {
    const question = {
      id: 'output_name',
      kind: 'information',
      prompt: 'What should the output field be called?',
    };
    const needsInput = { ...build, status: 'needs_input', questions: [question] };
    const { client } = setup({ builds: [needsInput] });
    render(tree(client));
    await screen.findByText('The saved task can become an executable workflow.');
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    await openBuildCard(build.name, 'Answer & continue');
    await screen.findByRole('button', { name: 'Send answer' });
    expect(screen.getAllByText(question.prompt)).toHaveLength(2);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    fireEvent.change(input, { target: { value: 'customer_name' } });
    let acknowledge;
    client.answerSolutionBuildRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    await waitFor(() =>
      expect(client.answerSolutionBuildRequest).toHaveBeenCalledWith(
        buildId,
        { expectedVersion: 2, questionId: question.id, value: 'customer_name' },
        'fixture-answer-key'
      )
    );
    expect(input).toHaveValue('customer_name');
    expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(client.repairSolutionBuildRequest).not.toHaveBeenCalled();
    await act(async () => acknowledge({}));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(screen.getByRole('textbox')).toBe(input);
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
  });

  it('requires an explicit repair target and routes Enter to that Build without ordinary Assistant fallback', async () => {
    const { client } = setup({
      builds: [{ ...build, questions: [], repairEligibility: { allowed: true } }],
    });
    render(tree(client, `?thread=${threadId}&build=${buildId}`));
    await screen.findByRole('region', { name: 'Build panel fixture' });
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, {
      target: { value: 'Fix the invalid-item branch while retaining the agreed tests.' },
    });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expectNoCommands(client);
    fireEvent.click(screen.getByRole('button', { name: 'Describe a change' }));
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() =>
      expect(client.repairSolutionBuildRequest).toHaveBeenCalledWith(
        buildId,
        {
          expectedVersion: 2,
          workflowHash: hash,
          instruction: 'Fix the invalid-item branch while retaining the agreed tests.',
        },
        'fixture-repair-key'
      )
    );
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(client.sendSolutionConversationTurn).not.toHaveBeenCalled();
    expect(client.answerSolutionBuildRequest).not.toHaveBeenCalled();
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('keeps connection/setup instructions out of generic Build answers', async () => {
    const { client } = setup({
      builds: [
        {
          ...build,
          status: 'needs_input',
          questions: [{ id: 'connect', kind: 'connection', prompt: 'Connect your provider.' }],
        },
      ],
    });
    render(tree(client, `?thread=${threadId}&build=${buildId}`));
    await screen.findByRole('region', { name: 'Build panel fixture' });
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, { target: { value: 'Please connect my provider' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expectNoCommands(client);
    expect(input).toHaveValue('Please connect my provider');
  });
  it('opens the actual draft card in a side panel without replacing the original input or source conversation', async () => {
    const { client } = setup();
    const view = render(tree(client));
    await screen.findByText('The saved task can become an executable workflow.');
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, { target: { value: 'Keep my unsent task thought' } });
    await openBuildCard();
    const panel = await screen.findByRole('region', { name: 'Build panel fixture' });
    expect(screen.getByLabelText('Selected build')).toHaveTextContent(buildId);
    expect(screen.getByLabelText('Embedded build')).toHaveTextContent('true');
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Keep my unsent task thought');
    expect(screen.getAllByRole('log')).toHaveLength(1);
    expect(view.container.querySelectorAll('form')).toHaveLength(1);
    expect(window.location.pathname).toBe('/assistant');
    expect(new URLSearchParams(window.location.search).get('build')).toBe(buildId);

    fireEvent.click(screen.getByRole('button', { name: 'Hide workflow' }));
    expect(screen.queryByRole('complementary', { name: 'Workflow side panel' })).toBeNull();
    expect(panel).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show workflow' }));
    expect(screen.getByRole('region', { name: 'Build panel fixture' })).toBe(panel);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Keep my unsent task thought');
    expect(panels.mounts).toHaveBeenCalledTimes(1);
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expectNoCommands(client);
  });

  it('handles same-thread build query changes without fetching or clearing the original thread again', async () => {
    const { client } = setup();
    const view = render(tree(client));
    await screen.findByText('The saved task can become an executable workflow.');
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, { target: { value: 'Unsent text before a draft link' } });
    view.rerender(tree(client, `?thread=${threadId}&build=${buildId}`));
    await screen.findByRole('region', { name: 'Build panel fixture' });
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Unsent text before a draft link');
    view.rerender(tree(client));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Build panel fixture' })).toBeNull()
    );
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Unsent text before a draft link');
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expectNoCommands(client);
  });

  it('opens a verified build query on first load but denies an unlinked or cross-thread build selector', async () => {
    const { client } = setup({
      builds: [build, { ...build, id: otherBuildId, source: { threadId: otherThreadId } }],
    });
    const view = render(tree(client, `?thread=${threadId}&build=${buildId}`));
    await screen.findByRole('region', { name: 'Build panel fixture' });
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    view.rerender(tree(client, `?thread=${threadId}&build=${otherBuildId}`));
    await screen.findByText(/This workflow could not be verified as part of this conversation/);
    expect(screen.queryByRole('region', { name: 'Build panel fixture' })).toBeNull();
    expect(panels.mounts).not.toHaveBeenCalledWith(otherBuildId);
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expectNoCommands(client);
  });

  it('follows the confirmed Build-to-Solution callback in the same canvas and same composer', async () => {
    const { client } = setup();
    render(tree(client, `?thread=${threadId}&build=${buildId}`));
    await screen.findByRole('region', { name: 'Build panel fixture' });
    const input = screen.getByRole('textbox', { name: 'Message Assistant' });
    fireEvent.change(input, { target: { value: 'Question for the saved workflow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open saved workflow fixture' }));
    await screen.findByRole('region', { name: 'Solution panel fixture' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    expect(screen.queryByRole('region', { name: 'Build panel fixture' })).toBeNull();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Question for the saved workflow');
    expect(client.assistantThread).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get('workflow')).toBe(solutionId);
    expect(new URLSearchParams(window.location.search).has('build')).toBe(false);
    expectNoCommands(client);
  });

  it.each([
    ['native editing', 'Start fixture editing', 'Finish fixture editing'],
    ['unconfirmed setup', 'Start fixture request', 'Confirm fixture request'],
  ])(
    'retains exact Build ownership during %s, including while the panel is hidden',
    async (_kind, start, finish) => {
      const second = { ...build, id: otherBuildId, name: 'Second order draft' };
      const { client } = setup({ builds: [build, second] });
      const view = render(tree(client, `?thread=${threadId}&build=${buildId}`));
      await screen.findByRole('region', { name: 'Build panel fixture' });
      const input = screen.getByRole('textbox', { name: 'Message Assistant' });
      fireEvent.change(input, { target: { value: 'Retain this exact original input' } });
      fireEvent.click(screen.getByRole('button', { name: start }));
      expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      await openBuildCard(second.name);
      expect(screen.getByLabelText('Selected build')).toHaveTextContent(buildId);
      fireEvent.click(screen.getByRole('button', { name: 'Unrelated conversation' }));
      expect(client.assistantThread).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Selected build')).toHaveTextContent(buildId);
      view.rerender(tree(client, `?thread=${threadId}&build=${otherBuildId}`));
      expect(screen.getByLabelText('Selected build')).toHaveTextContent(buildId);
      fireEvent.click(screen.getByRole('button', { name: 'Hide workflow' }));
      expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      const closing = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(closing);
      expect(closing.defaultPrevented).toBe(true);
      // Reopening the same card is visibility-only: it must not clear the
      // still-mounted editor/request ownership signal.
      await openBuildCard(build.name);
      expect(screen.getByRole('region', { name: 'Build panel fixture' })).toBeVisible();
      expect(screen.getByRole('combobox', { name: 'Working on' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      expect(panels.mounts).toHaveBeenCalledTimes(1);
      await openBuildCard(second.name);
      fireEvent.click(screen.getByRole('button', { name: 'Unrelated conversation' }));
      expect(screen.getByLabelText('Selected build')).toHaveTextContent(buildId);
      expect(client.assistantThread).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: finish }));
      await openBuildCard(second.name);
      await waitFor(() =>
        expect(screen.getByLabelText('Selected build')).toHaveTextContent(otherBuildId)
      );
      expect(screen.getByRole('textbox')).toBe(input);
      expect(input).toHaveValue('Retain this exact original input');
      expect(client.assistantThread).toHaveBeenCalledTimes(1);
      expectNoCommands(client);
    }
  );
});
