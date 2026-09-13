import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SolutionDetailPage, { SolutionDetailWorkspace } from './SolutionDetailPage.jsx';
import { compileSolutionWorkflow } from '../../../server/workflow-v2/solution-compiler.js';

const h = vi.hoisted(() => ({
  getToken: vi.fn(),
  hostContext: null,
  client: {
    solution: vi.fn(),
    decideSolution: vi.fn(),
    invokeSolution: vi.fn(),
    solutionEndpoint: vi.fn(),
    solutionRevisions: vi.fn(),
    nativeSolutionSession: vi.fn(),
    solutionAppKeys: vi.fn(),
    createSolutionAppKey: vi.fn(),
    revokeSolutionAppKey: vi.fn(),
    appInvocationEndpoint: vi.fn(),
    solutionConversation: vi.fn(),
    solutionBuildRequest: vi.fn(),
    assistantThread: vi.fn(),
    createSolutionDraft: vi.fn(),
    reviewSolutionRevision: vi.fn(),
    decideSolutionRevision: vi.fn(),
  },
}));
vi.mock('@clerk/react', () => ({ useAuth: () => ({ getToken: h.getToken }) }));
vi.mock('../../workflow-v2/api.js', () => ({ createWorkflowV2Client: () => h.client }));
const id = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const spec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'name', target: 'customer', transform: 'trim' }],
};
const workflow = compileSolutionWorkflow({ id, spec });
function data(overrides = {}) {
  return {
    solution: {
      id,
      agentId: id,
      name: 'Contact normalization',
      purpose: 'Clean incoming data',
      agent: { name: 'Mara' },
      version: 1,
      rowVersion: 0,
      status: 'draft',
      spec,
      ...workflow,
      ...overrides,
    },
    invocations: [],
  };
}
async function renderPage(props = {}) {
  let view;
  await act(async () => {
    view = render(
      <MemoryRouter initialEntries={[`/workspace/solutions/${id}`]}>
        <Routes>
          <Route
            path="/workspace/solutions/:solutionId"
            element={
              <SolutionDetailWorkspace
                solutionId={id}
                {...props}
                onContextChange={(context) => {
                  h.hostContext = context;
                  props.onContextChange?.(context);
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );
  });
  return view;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.hostContext = null;
  h.client.solution.mockResolvedValue(data());
  h.client.solutionRevisions.mockResolvedValue({ revisions: [], activeRevisionId: null });
  h.client.solutionConversation.mockResolvedValue({
    solutionId: id,
    turns: [],
    context: { solutionVersion: 0, workflowHash: workflow.workflowHash },
  });
  h.client.solutionBuildRequest.mockRejectedValue(new Error('Source build unavailable'));
  h.client.assistantThread.mockRejectedValue(new Error('Source chat unavailable'));
  h.client.nativeSolutionSession.mockRejectedValue(new Error('Native editor not connected'));
  h.client.solutionEndpoint.mockReturnValue(`https://api.example/v2/solutions/${id}/invocations`);
  h.client.appInvocationEndpoint.mockReturnValue(`https://api.example/invoke/v1/solutions/${id}`);
  h.client.solutionAppKeys.mockResolvedValue({
    keys: [],
    policy: {
      defaultExpiryDays: 30,
      maxExpiryDays: 90,
      maxActiveKeys: 5,
      requestsPerMinute: 60,
      requestsPerDay: 1000,
      maxConcurrentInvocations: 1,
    },
  });
});

function AssistantRouteProbe() {
  const location = useLocation();
  return (
    <div data-testid="assistant-route">
      {location.pathname}
      {location.search}
    </div>
  );
}
function renderSourceRoute() {
  return render(
    <MemoryRouter initialEntries={[`/workspace/solutions/${id}`]}>
      <Routes>
        <Route path="/workspace/solutions/:solutionId" element={<SolutionDetailPage />} />
        <Route path="/assistant" element={<AssistantRouteProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('workflow side panel and source route', () => {
  it('does not expose another workflow response to the chat controller or native canvas', async () => {
    const onContextChange = vi.fn();
    h.client.solution.mockResolvedValue(data({ id: '9e966d93-e0da-490b-b9d6-b03afcf947b6' }));
    await renderPage({ embedded: true, client: h.client, onContextChange });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The selected workflow could not be verified.'
    );
    expect(onContextChange.mock.calls.every(([context]) => context === null)).toBe(true);
    expect(h.client.nativeSolutionSession).not.toHaveBeenCalled();
  });

  it('embeds existing canvas and controls without a second chat, composer or page heading', async () => {
    const onContextChange = vi.fn();
    h.client.solution.mockResolvedValue(
      data({ status: 'active', deployment: { workflowId: 'live' } })
    );
    await renderPage({ embedded: true, client: h.client, onContextChange });
    await screen.findByRole('region', { name: 'Workflow controls: Contact normalization' });
    expect(
      screen.queryByRole('heading', { name: 'Contact normalization' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Workflow conversation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'All workflows' })).not.toBeInTheDocument();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { name: 'Workflow canvas' })).toHaveLength(1);
    const context = onContextChange.mock.calls.at(-1)[0];
    expect(context).toEqual(
      expect.objectContaining({
        client: h.client,
        solution: expect.objectContaining({ id, workflowHash: workflow.workflowHash }),
        selectedDraftId: null,
        nativeEditing: false,
        panelBusy: false,
        refreshDraft: expect.any(Function),
        onSelectDraft: expect.any(Function),
        onOpenHistory: expect.any(Function),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test current v1' }));
    expect(screen.getByRole('heading', { name: 'Test current workflow v1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run test for current v1' })).toBeInTheDocument();
    expect(h.client.invokeSolution).not.toHaveBeenCalled();
    expect(h.client.decideSolution).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])(
    'reports a pending real invocation to the host until its request and refresh settle (%s)',
    async (outcome) => {
      const onContextChange = vi.fn();
      h.client.solution.mockResolvedValue(
        data({ status: 'active', deployment: { workflowId: 'live' } })
      );
      let finishInvocation, failInvocation, finishRefresh;
      h.client.invokeSolution.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishInvocation = resolve;
            failInvocation = reject;
          })
      );
      await renderPage({ embedded: true, client: h.client, onContextChange });
      expect(onContextChange.mock.calls.at(-1)[0].panelBusy).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Test current v1' }));
      fireEvent.click(screen.getByRole('button', { name: 'Run test for current v1' }));
      await waitFor(() => expect(h.client.invokeSolution).toHaveBeenCalledTimes(1));
      expect(onContextChange.mock.calls.at(-1)[0].panelBusy).toBe(true);
      expect(h.client.invokeSolution.mock.calls[0][0]).toBe(id);
      if (outcome === 'success') {
        h.client.solution.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishRefresh = resolve;
            })
        );
        await act(async () => {
          finishInvocation({
            invocation: { id: 'saved-test', status: 'succeeded', output: { customer: 'Ada' } },
          });
        });
        expect(onContextChange.mock.calls.at(-1)[0].panelBusy).toBe(true);
        await act(async () => {
          finishRefresh(data({ status: 'active', deployment: { workflowId: 'live' } }));
        });
      } else {
        await act(async () => {
          failInvocation(new Error('Outcome has not been confirmed'));
        });
        expect(await screen.findByText('Outcome has not been confirmed')).toBeInTheDocument();
      }
      expect(onContextChange.mock.calls.at(-1)[0].panelBusy).toBe(false);
      expect(h.client.invokeSolution).toHaveBeenCalledTimes(1);
      expect(h.client.decideSolution).not.toHaveBeenCalled();
    }
  );

  it('retains its host context when hidden and clears it only when the exact panel unmounts', async () => {
    const onContextChange = vi.fn();
    const tree = (hidden) => (
      <MemoryRouter>
        <div hidden={hidden}>
          <SolutionDetailWorkspace
            solutionId={id}
            embedded
            client={h.client}
            onContextChange={onContextChange}
          />
        </div>
      </MemoryRouter>
    );
    const view = render(tree(false));
    await waitFor(() => expect(onContextChange.mock.calls.at(-1)[0]?.solution.id).toBe(id));
    const initialContext = onContextChange.mock.calls.at(-1)[0];
    onContextChange.mockClear();
    view.rerender(tree(true));
    expect(onContextChange).not.toHaveBeenCalled();
    view.rerender(tree(false));
    expect(onContextChange).not.toHaveBeenCalled();
    expect(initialContext.solution.id).toBe(id);
    view.unmount();
    expect(onContextChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('exposes exact draft selection and history to the original chat without creating another entity', async () => {
    const revisionId = '9e966d93-e0da-490b-b9d6-b03afcf947b6';
    const draft = {
      id: revisionId,
      solutionId: id,
      version: 2,
      baseVersion: 1,
      rowVersion: 0,
      status: 'draft',
      spec,
      ...workflow,
    };
    const onContextChange = vi.fn();
    const onSelectedDraftChange = vi.fn();
    h.client.solution.mockResolvedValue(
      data({ status: 'active', deployment: { workflowId: 'live' } })
    );
    h.client.solutionRevisions.mockResolvedValue({ revisions: [draft] });
    await renderPage({ embedded: true, client: h.client, onContextChange, onSelectedDraftChange });
    await screen.findByRole('button', { name: 'v2 · Draft', exact: true });
    const first = onContextChange.mock.calls.at(-1)[0];
    act(() => first.onSelectDraft(revisionId));
    await waitFor(() =>
      expect(h.client.nativeSolutionSession).toHaveBeenCalledWith(id, { revisionId, mode: 'view' })
    );
    expect(onSelectedDraftChange).toHaveBeenCalledWith(revisionId);
    expect(onContextChange.mock.calls.at(-1)[0].selectedDraftId).toBe(revisionId);
    expect(screen.queryByRole('button', { name: 'Test current v1' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Next step for candidate v2' })).toBeInTheDocument();
    act(() => first.onOpenHistory());
    expect(screen.getByRole('heading', { name: 'Execution history' })).toBeInTheDocument();
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
    expect(h.client.invokeSolution).not.toHaveBeenCalled();
    expect(h.client.decideSolutionRevision).not.toHaveBeenCalled();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
  });

  it('passes conversation ownership into native controls and reports edit ownership to its host', async () => {
    const revisionId = '9e966d93-e0da-490b-b9d6-b03afcf947b6';
    const draft = {
      id: revisionId,
      solutionId: id,
      version: 2,
      baseVersion: 1,
      rowVersion: 0,
      status: 'draft',
      spec,
      ...workflow,
    };
    const onEditingChange = vi.fn();
    const onContextChange = vi.fn();
    h.client.solution.mockResolvedValue(
      data({ status: 'active', deployment: { workflowId: 'live' } })
    );
    h.client.solutionRevisions.mockResolvedValue({ revisions: [draft] });
    await renderPage({ embedded: true, client: h.client, onContextChange, onEditingChange });
    fireEvent.click(await screen.findByRole('button', { name: 'v2 · Draft', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit in n8n' }));
    await waitFor(() => expect(onEditingChange).toHaveBeenLastCalledWith(true));
    const editing = onContextChange.mock.calls.at(-1)[0];
    expect(editing.nativeEditing).toBe(true);
    act(() => editing.onSelectDraft(null));
    expect(onContextChange.mock.calls.at(-1)[0].selectedDraftId).toBe(revisionId);
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
    expect(h.client.decideSolutionRevision).not.toHaveBeenCalled();
  });

  it('blocks native edit actions while the existing Assistant owns a workflow request', async () => {
    h.client.solution.mockResolvedValue(
      data({ status: 'active', deployment: { workflowId: 'live' } })
    );
    await renderPage({ embedded: true, client: h.client, conversationWorking: true });
    const edit = await screen.findByRole('button', { name: 'Edit workflow' });
    expect(edit).toBeDisabled();
    fireEvent.click(edit);
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
  });

  it('redirects old links only after verifying the exact owned Build and original Assistant thread', async () => {
    const buildId = 'aeb248f3-09d3-488f-b1fd-6b4bd127f37e';
    const threadId = 'c2ccb4ca-d282-43c5-a429-4d718061297d';
    h.client.solution.mockResolvedValue(data({ buildRequestId: buildId }));
    h.client.solutionBuildRequest.mockResolvedValue({
      buildRequest: { id: buildId, solutionId: id, source: { threadId } },
    });
    h.client.assistantThread.mockResolvedValue({ thread: { id: threadId }, messages: [] });
    renderSourceRoute();
    expect(await screen.findByTestId('assistant-route')).toHaveTextContent(
      `/assistant?thread=${threadId}&workflow=${id}`
    );
    expect(h.client.solutionBuildRequest).toHaveBeenCalledWith(buildId);
    expect(h.client.assistantThread).toHaveBeenCalledWith(threadId);
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
  });

  it('keeps a source-less legacy workflow canvas available without guessing or creating a chat', async () => {
    renderSourceRoute();
    await screen.findByText(/No original conversation is recorded for this workflow/);
    expect(await screen.findByRole('heading', { name: 'Workflow canvas' })).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-route')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Workflow conversation' })).not.toBeInTheDocument();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
    expect(h.client.assistantThread).not.toHaveBeenCalled();
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
  });

  it.each(['wrong_build_solution', 'malformed_thread', 'unowned_thread'])(
    'does not redirect or start a chat when source verification fails: %s',
    async (failure) => {
      const buildId = 'aeb248f3-09d3-488f-b1fd-6b4bd127f37e';
      const threadId = 'c2ccb4ca-d282-43c5-a429-4d718061297d';
      h.client.solution.mockResolvedValue(data({ buildRequestId: buildId }));
      h.client.solutionBuildRequest.mockResolvedValue({
        buildRequest: {
          id: buildId,
          solutionId: failure === 'wrong_build_solution' ? buildId : id,
          source: { threadId: failure === 'malformed_thread' ? '../foreign' : threadId },
        },
      });
      renderSourceRoute();
      await screen.findByText(/The original conversation could not be verified/);
      expect(screen.queryByTestId('assistant-route')).not.toBeInTheDocument();
      expect(h.client.solutionConversation).not.toHaveBeenCalled();
      expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
      if (failure !== 'unowned_thread') expect(h.client.assistantThread).not.toHaveBeenCalled();
    }
  );
});
describe('customer solution controls', () => {
  it('shows a newly completed chat draft in the same canvas without creating or activating work', async () => {
    const revisionId = '9e966d93-e0da-490b-b9d6-b03afcf947b6';
    const draft = {
      id: revisionId,
      solutionId: id,
      version: 2,
      baseVersion: 1,
      rowVersion: 0,
      status: 'draft',
      spec,
      ...workflow,
    };
    h.client.solution.mockResolvedValue(
      data({ status: 'active', deployment: { workflowId: 'live' } })
    );
    await renderPage({ embedded: true });
    await waitFor(() =>
      expect(h.client.nativeSolutionSession).toHaveBeenCalledWith(id, {
        revisionId: null,
        mode: 'view',
      })
    );
    h.client.solutionRevisions.mockResolvedValue({ revisions: [draft], activeRevisionId: null });
    // This callback is emitted only for a newly observed saved completion, not
    // for historical turns. It changes presentation, never workflow authority.
    act(() => h.hostContext.refreshDraft(revisionId));
    await waitFor(() =>
      expect(h.client.nativeSolutionSession).toHaveBeenCalledWith(id, { revisionId, mode: 'view' })
    );
    expect(h.hostContext.selectedDraftId).toBe(revisionId);
    expect(screen.getByRole('heading', { name: 'Workflow canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Workflow conversation' })).toBeNull();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Viewing candidate v2. Your deployed workflow stays unchanged until activation.'
      )
    ).toBeInTheDocument();
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
    expect(h.client.decideSolutionRevision).not.toHaveBeenCalled();
    expect(h.client.decideSolution).not.toHaveBeenCalled();
    expect(h.client.invokeSolution).not.toHaveBeenCalled();
  });

  it('does not fetch conversation history or replace the selected current workflow without a host completion', async () => {
    const revisionId = '9e966d93-e0da-490b-b9d6-b03afcf947b6';
    h.client.solution.mockResolvedValue(
      data({ status: 'active', deployment: { workflowId: 'live' } })
    );
    h.client.solutionRevisions.mockResolvedValue({
      revisions: [
        {
          id: revisionId,
          solutionId: id,
          version: 2,
          baseVersion: 1,
          rowVersion: 0,
          status: 'draft',
          spec,
          ...workflow,
        },
      ],
    });
    h.client.solutionConversation.mockResolvedValue({
      solutionId: id,
      context: { solutionVersion: 0, workflowHash: workflow.workflowHash },
      turns: [
        {
          id: 'historical-completion',
          mode: 'change',
          status: 'completed',
          message: 'Earlier draft change',
          reply: { markdown: 'Earlier saved draft.' },
          draftRevisionId: revisionId,
        },
      ],
    });
    await renderPage({ embedded: true });
    await waitFor(() =>
      expect(h.client.nativeSolutionSession).toHaveBeenCalledWith(id, {
        revisionId: null,
        mode: 'view',
      })
    );
    expect(h.hostContext.selectedDraftId).toBeNull();
    expect(screen.queryByText('Earlier saved draft.')).toBeNull();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
    expect(
      h.client.nativeSolutionSession.mock.calls.every(([, options]) => options.revisionId === null)
    ).toBe(true);
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
    expect(h.client.decideSolution).not.toHaveBeenCalled();
  });

  it('defers a saved chat candidate while the native editor owns the current draft', async () => {
    const formSubmit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    h.client.nativeSolutionSession.mockResolvedValue({
      launchUrl: 'https://api.example/native-n8n/launch',
      token: 'synthetic-test-only',
    });
    const revisionId = '9e966d93-e0da-490b-b9d6-b03afcf947b6';
    const savedId = '54114f4e-5994-4f31-a5ef-042843cd0133';
    const draft = {
      id: revisionId,
      solutionId: id,
      version: 2,
      baseVersion: 1,
      rowVersion: 0,
      status: 'draft',
      spec,
      ...workflow,
    };
    const saved = { ...draft, id: savedId, version: 3 };
    h.client.solution.mockResolvedValue(
      data({ status: 'active', deployment: { workflowId: 'live' } })
    );
    h.client.solutionRevisions.mockResolvedValue({ revisions: [draft, saved] });
    h.client.reviewSolutionRevision.mockResolvedValue({});
    await renderPage({ embedded: true });
    fireEvent.click(await screen.findByRole('button', { name: 'v2 · Draft', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit in n8n' }));
    await waitFor(() => expect(h.hostContext.nativeEditing).toBe(true));
    await waitFor(() =>
      expect(h.client.nativeSolutionSession).toHaveBeenCalledWith(id, { revisionId, mode: 'edit' })
    );
    const editorRequests = h.client.nativeSolutionSession.mock.calls.length;
    const ownedEditor = screen.getByTitle('Native n8n draft editor');
    fireEvent.click(screen.getByRole('tab', { name: 'Run' }));
    expect(ownedEditor).toBeInTheDocument();
    expect(h.hostContext.nativeEditing).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Workflow' }));
    expect(screen.getByTitle('Native n8n draft editor')).toBe(ownedEditor);
    act(() => h.hostContext.refreshDraft(savedId));
    expect(await screen.findByRole('button', { name: 'Load saved draft' })).toBeDisabled();
    expect(h.hostContext.selectedDraftId).toBe(revisionId);
    expect(h.client.nativeSolutionSession).toHaveBeenCalledTimes(editorRequests);
    fireEvent.click(screen.getByRole('button', { name: 'Load saved draft' }));
    expect(h.hostContext.selectedDraftId).toBe(revisionId);

    const editor = screen.getByTitle('Native n8n draft editor');
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://api.example',
          source: editor.contentWindow,
          data: { command: 'n8nReady' },
        })
      )
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review saved changes' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review saved changes' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Load saved draft' })).toBeEnabled()
    );
    expect(h.hostContext.selectedDraftId).toBe(revisionId);
    fireEvent.click(screen.getByRole('button', { name: 'Load saved draft' }));
    await waitFor(() =>
      expect(h.client.nativeSolutionSession).toHaveBeenCalledWith(id, {
        revisionId: savedId,
        mode: 'view',
      })
    );
    expect(h.hostContext.selectedDraftId).toBe(savedId);
    expect(h.client.createSolutionDraft).not.toHaveBeenCalled();
    expect(h.client.decideSolutionRevision).not.toHaveBeenCalled();
    expect(h.client.decideSolution).not.toHaveBeenCalled();
    expect(h.client.invokeSolution).not.toHaveBeenCalled();
    await act(async () => {});
    formSubmit.mockRestore();
  });

  it('requires explicit service-test approval with exact version and sample data', async () => {
    const nativeSpec = {
      kind: 'n8n_workflow_v2',
      requirements: [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      connections: [{ id: 'connection' }],
      acceptanceCases: [{ id: 'send', input: { source: 'sample' } }],
    };
    h.client.solution.mockResolvedValue(
      data({
        spec: nativeSpec,
        status: 'ready',
        deployment: { workflowId: 'native' },
        workflow: {
          nodes: [
            {
              id: 'send',
              name: 'Send sample',
              type: 'CUSTOM.boundedHttp',
              parameters: { url: 'https://receiver.example/events', method: 'POST' },
            },
          ],
          connections: {},
        },
      })
    );
    h.client.invokeSolution.mockResolvedValue({
      invocation: { workflowHash: workflow.workflowHash, status: 'succeeded', executionId: '93' },
    });
    await renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test all agreed cases' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('POST https://receiver.example/events');
    expect(screen.getByLabelText('Data sent in approved service tests')).toHaveTextContent(
      'sample'
    );
    expect(h.client.invokeSolution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.client.invokeSolution).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Run test in n8n' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve & send test' }));
    await waitFor(() =>
      expect(h.client.invokeSolution).toHaveBeenCalledWith(
        id,
        { source: 'sample' },
        'test',
        expect.any(String),
        { allowExternalEffects: true, workflowHash: workflow.workflowHash }
      )
    );
  });
  it('offers explicit runtime-pause reconciliation and blocks activation while pause is uncertain', async () => {
    h.client.solution.mockResolvedValue(
      data({
        spec: {
          kind: 'n8n_workflow_v2',
          requirements: [],
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          acceptanceCases: [],
          connections: [],
        },
        status: 'paused',
        testedAt: '2026-09-05T20:00:00Z',
        deployment: { workflowId: 'native' },
        lastError: 'RUNTIME_PAUSE_REQUIRES_VERIFICATION',
      })
    );
    await renderPage();
    const verify = await screen.findByRole('button', { name: 'Verify runtime pause' });
    expect(screen.getByRole('button', { name: 'Activate production endpoint' })).toBeDisabled();
    fireEvent.click(verify);
    await waitFor(() =>
      expect(h.client.decideSolution).toHaveBeenCalledWith(expect.objectContaining({ id }), 'pause')
    );
  });

  it('runs every agreed native case sequentially and refreshes server-confirmed activation readiness', async () => {
    const nativeSpec = {
      kind: 'n8n_workflow_v2',
      requirements: [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      connections: [],
      acceptanceCases: [
        { id: 'two', input: { values: [1, 2] } },
        { id: 'empty', input: { values: [] } },
      ],
    };
    let completed = 0;
    h.client.solution.mockImplementation(async () =>
      data({
        spec: nativeSpec,
        status: 'ready',
        deployment: { workflowId: 'native' },
        testedAt: completed === 2 ? '2026-09-05T20:00:00Z' : null,
      })
    );
    h.client.invokeSolution.mockImplementation(async (_id, input) => {
      completed += 1;
      return {
        invocation: {
          workflowHash: workflow.workflowHash,
          status: 'succeeded',
          executionId: String(completed),
          output: { count: input.values.length },
        },
      };
    });
    await renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Run' }));
    expect(screen.getByRole('button', { name: 'Activate production endpoint' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Test all agreed cases' }));
    expect(await screen.findByText('2 of 2 cases passed')).toBeInTheDocument();
    expect(h.client.invokeSolution.mock.calls.map((call) => call[1])).toEqual([
      { values: [1, 2] },
      { values: [] },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Activate production endpoint' })).toBeEnabled()
    );
    expect(h.client.decideSolution).not.toHaveBeenCalled();
  });

  it('stops the agreed-case batch on an unknown result without sending later inputs', async () => {
    const nativeSpec = {
      kind: 'n8n_workflow_v2',
      requirements: [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      connections: [],
      acceptanceCases: [
        { id: 'first', input: { value: 1 } },
        { id: 'second', input: { value: 2 } },
      ],
    };
    h.client.solution.mockResolvedValue(
      data({ spec: nativeSpec, status: 'ready', deployment: { workflowId: 'native' } })
    );
    h.client.invokeSolution.mockResolvedValue({
      invocation: { workflowHash: workflow.workflowHash, status: 'outcome_unknown' },
    });
    await renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test all agreed cases' }));
    expect(await screen.findByText(/No further cases were sent/)).toBeInTheDocument();
    expect(h.client.invokeSolution).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Activate production endpoint' })).toBeDisabled();
  });
  it('keeps general native graphs central and submits nested input without fixed mapping assumptions', async () => {
    const nativeSpec = {
      kind: 'n8n_workflow_v2',
      requirements: [{ id: 'r', description: 'Validate and route order items.' }],
      inputSchema: {
        type: 'object',
        properties: {
          orders: {
            type: 'array',
            items: { type: 'object', properties: { quantity: { type: 'integer' } } },
          },
        },
      },
      outputSchema: { type: 'object' },
      acceptanceCases: [{ id: 'nested', input: { orders: [{ quantity: 3 }] } }],
    };
    h.client.solution.mockResolvedValue(
      data({ spec: nativeSpec, status: 'ready', deployment: { workflowId: 'native-graph' } })
    );
    h.client.invokeSolution.mockResolvedValue({
      invocation: {
        status: 'succeeded',
        executionId: '88',
        output: { accepted: [{ quantity: 3 }] },
      },
    });
    await renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Purpose, requirements & supporting evidence' })
    );
    expect(screen.getByText('Validate and route order items.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/no external services are contacted/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Run' }));
    expect(screen.getByRole('textbox', { name: 'Test input JSON' })).toHaveValue(
      JSON.stringify({ orders: [{ quantity: 3 }] }, null, 2)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run test in n8n' }));
    await waitFor(() =>
      expect(h.client.invokeSolution).toHaveBeenCalledWith(
        id,
        { orders: [{ quantity: 3 }] },
        'test',
        expect.any(String)
      )
    );
    expect(await screen.findByText('Test passed · n8n execution 88')).toBeInTheDocument();
  });
  it('keeps the workflow first with explicit Run, History and Settings controls and no duplicate chat', async () => {
    h.client.solution.mockResolvedValue(
      data({
        status: 'active',
        testedAt: '2026-09-05T18:00:00Z',
        deployment: { workflowId: 'real' },
      })
    );
    await renderPage();
    expect(await screen.findByRole('tab', { name: 'Workflow' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(h.client.solutionAppKeys).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Workflow conversation' })).toBeNull();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Workflow',
      'Run',
      'History',
      'Settings',
    ]);
    expect(screen.queryByRole('tab', { name: 'Test & use' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Run' }));
    expect(screen.getByRole('heading', { name: 'Run a real test' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect an application · API keys' })).toBeNull();
    expect(h.client.solutionAppKeys).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(
      screen.getByRole('button', { name: 'Connect an application · API keys' })
    ).toBeInTheDocument();
    expect(h.client.solutionAppKeys).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Connect an application · API keys' }));
    expect(
      await screen.findByRole('heading', { name: 'Connect your application' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Server-side application request')).toHaveTextContent(
      `/invoke/v1/solutions/${id}`
    );
    expect(screen.getByLabelText('Server-side application request')).toHaveTextContent(
      '$ORQALY_APP_KEY'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manual signed-in production check' }));
    expect(
      screen.getByRole('button', { name: 'Send current input to active endpoint' })
    ).toBeEnabled();
    expect(h.client.invokeSolution).not.toHaveBeenCalled();
  });
  it('shows the safe calling-app identity beside real execution evidence', async () => {
    h.client.solution.mockResolvedValue({
      ...data(),
      invocations: [
        {
          id: 'invocation-one',
          status: 'succeeded',
          mode: 'production',
          createdAt: '2026-09-05T18:00:00Z',
          executionId: '42',
          actor: { kind: 'application_key', id: 'key-one', label: 'Billing server' },
        },
      ],
    });
    await renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'History' }));
    expect(screen.getByText('Calling app: Billing server · Key ID key-one')).toBeInTheDocument();
    expect(screen.getByText('n8n execution 42')).toBeInTheDocument();
  });
  it('shows real task-build provenance instead of labeling AxWise-designed handoff as a manual form', async () => {
    h.client.solution.mockResolvedValue(
      data({ creationMethod: 'axwise_designed_native_reviewed', buildRequestId: 'source-build' })
    );
    await renderPage();
    await screen.findByText('Native editor not connected');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Purpose, requirements & supporting evidence' })
    );
    expect(screen.getByText(/Designed with AxWise from your explicit task/)).toBeInTheDocument();
    expect(screen.queryByText(/not an autonomous AI build/i)).toBeNull();
    expect(
      screen.getByRole('link', { name: 'View source build, answers & review' })
    ).toHaveAttribute('href', '/workspace/builds/source-build');
    expect(h.client.decideSolution).not.toHaveBeenCalled();
  });
  it('shows the actual workflow before approval and cannot run an undeployed document', async () => {
    await renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Contact normalization' })
    ).toBeInTheDocument();
    await screen.findByText('Native editor not connected');
    expect(screen.queryByRole('region', { name: 'Workflow conversation' })).toBeNull();
    expect(h.client.solutionConversation).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Purpose, requirements & supporting evidence' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accessible workflow summary' }));
    expect(screen.getByRole('list', { name: 'Executable n8n workflow' })).toHaveTextContent(
      'Receive input'
    );
    expect(screen.getByText(/not an autonomous AI build/i)).toBeInTheDocument();
    expect(h.client.decideSolution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Run' }));
    expect(screen.getByRole('button', { name: 'Run test in n8n' })).toBeDisabled();
  });
  it('approves the exact displayed version and keeps activation gated until a real test', async () => {
    h.client.solution.mockResolvedValue(data({ environment: { id: 'authorized-environment' } }));
    h.client.decideSolution.mockResolvedValue(
      data({ status: 'ready', rowVersion: 2, deployment: { workflowId: 'real' } })
    );
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve & deploy workflow' }));
    await waitFor(() =>
      expect(h.client.decideSolution).toHaveBeenCalledWith(
        expect.objectContaining({ id, workflowHash: workflow.workflowHash, rowVersion: 0 }),
        'deploy'
      )
    );
    expect(
      await screen.findByRole('button', { name: 'Activate production endpoint' })
    ).toBeDisabled();
  });
  it('keeps workflow inspection available but does not offer deployment without an authorized environment', async () => {
    await renderPage();
    expect(await screen.findByText(/No isolated environment is connected yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve & deploy workflow' })).toBeDisabled();
    await waitFor(() => expect(h.client.nativeSolutionSession).toHaveBeenCalled());
    expect(h.client.decideSolution).not.toHaveBeenCalled();
  });
  it('submits editable input and shows only returned execution evidence', async () => {
    h.client.solution.mockResolvedValue(
      data({ status: 'ready', deployment: { workflowId: 'real' } })
    );
    h.client.invokeSolution.mockResolvedValue({
      invocation: { status: 'succeeded', executionId: '42', output: { customer: 'Bob' } },
    });
    await renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Run' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Test input JSON' }), {
      target: { value: '{"name":" Bob "}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run test in n8n' }));
    expect(await screen.findByText('Test passed · n8n execution 42')).toBeInTheDocument();
    expect(h.client.invokeSolution).toHaveBeenCalledWith(
      id,
      { name: ' Bob ' },
      'test',
      expect.any(String)
    );
    expect(screen.getByLabelText('Test result')).toHaveTextContent('Bob');
  });
  it('does not invent output when execution is unknown', async () => {
    h.client.solution.mockResolvedValue(
      data({ status: 'ready', deployment: { workflowId: 'real' } })
    );
    h.client.invokeSolution.mockResolvedValue({
      invocation: { status: 'outcome_unknown', output: null },
    });
    await renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run test in n8n' }));
    expect(
      await screen.findByText(/Outcome unknown. Check the execution history/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Test passed/)).not.toBeInTheDocument();
  });
});
