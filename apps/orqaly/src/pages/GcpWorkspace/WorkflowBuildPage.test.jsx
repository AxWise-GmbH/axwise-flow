import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import WorkflowBuildPage, { WorkflowBuildWorkspace } from './WorkflowBuildPage.jsx';

const route = vi.hoisted(() => ({ client: null, getToken: vi.fn() }));
vi.mock('@clerk/react', () => ({ useAuth: () => ({ getToken: route.getToken }) }));
vi.mock('../../workflow-v2/api.js', () => ({ createWorkflowV2Client: () => route.client }));

vi.mock('./NativeN8nCanvas.jsx', () => ({
  default: ({ buildRequestId, mode, compact }) => (
    <div aria-label="Native authoring canvas" data-compact={String(Boolean(compact))}>
      {buildRequestId} · {mode}
    </div>
  ),
}));
const id = '3031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const runId = '4031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const hash = 'a'.repeat(64);
const spec = {
  kind: 'webhook_transform_v1',
  fields: [
    { source: 'name', target: 'customer_name', transform: 'trim' },
    { source: 'email', target: 'email', transform: 'lowercase' },
  ],
};
const nativeSpec = {
  kind: 'n8n_workflow_v2',
  requirements: [
    { id: 'orders', description: 'Route valid orders and return rejected items separately.' },
  ],
  inputSchema: {
    type: 'object',
    properties: {
      orders: {
        type: 'array',
        items: { type: 'object', properties: { quantity: { type: 'integer' } } },
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: { accepted: { type: 'array' }, rejected: { type: 'array' } },
  },
  acceptanceCases: [
    {
      id: 'mixed-orders',
      description: 'Some items invalid',
      requirementIds: ['orders'],
      input: { orders: [{ quantity: 2 }] },
      assertions: [],
    },
  ],
};
const base = {
  id,
  runId,
  agentId: 'agent',
  instruction: 'Trim name and lowercase email in a webhook.',
  status: 'needs_input',
  rowVersion: 2,
  inputVersion: 1,
  agent: { id: 'agent', name: 'Mara', profileVersion: 3 },
  source: { runId, request: 'Prepare a webhook design.', taskHash: hash },
  questions: [
    {
      id: 'name_output',
      kind: 'information',
      prompt: 'Which output field should receive the name?',
      reason: 'This decides the field returned by your webhook.',
    },
  ],
  answers: [],
  workflow: { nodes: [{ name: 'Receive input' }] },
  workflowHash: hash,
  spec: null,
  review: null,
  solutionId: null,
};
function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="build-location">
      {location.pathname}
      {location.search}
    </span>
  );
}
function harness(snapshot = base) {
  let current = structuredClone(snapshot);
  const client = {
    solutionBuildRequest: vi.fn(async () => ({ buildRequest: structuredClone(current) })),
    answerSolutionBuildRequest: vi.fn(async (_id, body) => {
      current = {
        ...current,
        status: 'preparing',
        rowVersion: current.rowVersion + 1,
        inputVersion: 2,
        questions: [],
        answers: [{ questionId: body.questionId, value: body.value }],
      };
      return { buildRequest: structuredClone(current) };
    }),
    reviewSolutionBuildRequest: vi.fn(async () => {
      current = {
        ...current,
        status: 'reviewed',
        rowVersion: current.rowVersion + 1,
        review: {
          valid: true,
          summary: 'Supported mapping; no external provider calls.',
          issues: [],
          changes: [{ kind: 'mapping', message: 'Return normalized name and email.' }],
        },
      };
      return { buildRequest: structuredClone(current) };
    }),
    confirmSolutionBuildRequest: vi.fn(async () => {
      current = {
        ...current,
        status: 'completed',
        rowVersion: current.rowVersion + 1,
        solutionId: 'solution-created',
      };
      return { buildRequest: structuredClone(current) };
    }),
  };
  const view = (props = {}) =>
    render(
      <MemoryRouter initialEntries={['/assistant?thread=original-chat']}>
        <WorkflowBuildWorkspace client={client} buildRequestId={id} {...props} />
        <LocationProbe />
      </MemoryRouter>
    );
  return {
    client,
    view,
    set: (next) => {
      current = next;
    },
    read: () => current,
  };
}

function renderBuildSourceRoute(client) {
  route.client = client;
  return render(
    <MemoryRouter initialEntries={[`/workspace/builds/${id}`]}>
      <Routes>
        <Route path="/workspace/builds/:buildRequestId" element={<WorkflowBuildPage />} />
        <Route path="/assistant" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('build source-chat redirect', () => {
  it.each([null, '8b606adc-91ba-46e5-86da-ece609df9c7d'])(
    'opens the exact original thread with the proper build/workflow target (%s)',
    async (solutionId) => {
      const threadId = 'c2ccb4ca-d282-43c5-a429-4d718061297d';
      const h = harness({ ...base, solutionId, source: { ...base.source, threadId } });
      h.client.assistantThread = vi.fn(async () => ({ thread: { id: threadId }, messages: [] }));
      renderBuildSourceRoute(h.client);
      expect(await screen.findByTestId('build-location')).toHaveTextContent(
        `/assistant?thread=${threadId}&${solutionId ? `workflow=${solutionId}` : `build=${id}`}`
      );
      expect(h.client.assistantThread).toHaveBeenCalledExactlyOnceWith(threadId);
      expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
      expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
    }
  );

  it('does not invent a source thread when a legacy build lacks one', async () => {
    const h = harness();
    h.client.assistantThread = vi.fn();
    renderBuildSourceRoute(h.client);
    await screen.findByText(/No original conversation is recorded for this build/);
    expect(
      await screen.findByRole('region', { name: 'Workflow preparation controls' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Preparing your workflow' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(h.client.assistantThread).not.toHaveBeenCalled();
    expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it.each(['malformed_thread', 'unowned_thread', 'wrong_build'])(
    'refuses an unverified recorded source (%s)',
    async (failure) => {
      const h = harness({
        ...base,
        id: failure === 'wrong_build' ? runId : id,
        source: { ...base.source, threadId: failure === 'malformed_thread' ? '../other' : runId },
      });
      h.client.assistantThread = vi.fn(async () => {
        throw new Error('Not owned');
      });
      renderBuildSourceRoute(h.client);
      await screen.findByText(
        failure === 'wrong_build'
          ? /The owned build could not be verified/
          : /The original conversation could not be verified/
      );
      expect(screen.queryByTestId('build-location')).not.toBeInTheDocument();
      if (failure !== 'unowned_thread') expect(h.client.assistantThread).not.toHaveBeenCalled();
      expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
    }
  );
});

describe('source-bound workflow build workspace', () => {
  it('gives the original composer a build-bound answer that confirms success only after persistence', async () => {
    const h = harness();
    const onContextChange = vi.fn();
    const view = h.view({ embedded: true, onContextChange });
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ build: expect.objectContaining({ id }) })
      )
    );
    const context = onContextChange.mock.lastCall[0];
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull();
    expect(screen.getByText(/Answer in the original chat/)).toBeInTheDocument();
    expect(context.build.questions[0].id).toBe('name_output');
    let confirmed;
    await act(async () => {
      confirmed = await context.onAnswer('name_output', 'customer_name');
    });
    expect(confirmed).toBe(true);
    expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledWith(
      id,
      { expectedVersion: 2, questionId: 'name_output', value: 'customer_name' },
      expect.any(String)
    );
    expect(onContextChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        build: expect.objectContaining({
          rowVersion: 3,
          answers: [{ questionId: 'name_output', value: 'customer_name' }],
        }),
        panelBusy: false,
      })
    );
    view.unmount();
    expect(onContextChange).toHaveBeenLastCalledWith(null);
    expect(await context.onAnswer('name_output', 'late answer')).toBe(false);
    expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps stale composer answers unsubmitted after a fresh version check', async () => {
    const h = harness();
    const onContextChange = vi.fn();
    h.view({ embedded: true, onContextChange });
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ build: expect.objectContaining({ id }) })
      )
    );
    const frozen = onContextChange.mock.lastCall[0];
    h.set({ ...h.read(), rowVersion: 3, inputVersion: 2 });
    let confirmed;
    await act(async () => {
      confirmed = await frozen.onAnswer('name_output', 'customer_name');
    });
    expect(confirmed).toBe(false);
    expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
    expect(await frozen.onAnswer('name_output', 'customer_name')).toBe(false);
  });

  it('does not answer another question or accept secret/setup text through the host callback', async () => {
    const h = harness();
    const onContextChange = vi.fn();
    h.view({ onContextChange });
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ build: expect.objectContaining({ id }) })
      )
    );
    for (const [questionId, value] of [
      ['not-the-question', 'answer'],
      ['name_output', 'api_key=synthetic_not_a_real_credential'],
    ]) {
      let confirmed;
      await act(async () => {
        confirmed = await onContextChange.mock.lastCall[0].onAnswer(questionId, value);
      });
      expect(confirmed).toBe(false);
    }
    expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('prevents same-action double dispatch through the original composer', async () => {
    const h = harness();
    const onContextChange = vi.fn();
    h.view({ onContextChange });
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ build: expect.objectContaining({ id }) })
      )
    );
    const frozen = onContextChange.mock.lastCall[0];
    let finish;
    h.client.solutionBuildRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let first;
    act(() => {
      first = frozen.onAnswer('name_output', 'customer_name');
    });
    expect(await frozen.onAnswer('name_output', 'another answer')).toBe(false);
    await act(async () => {
      finish({ buildRequest: h.read() });
      await first;
    });
    expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledTimes(1);
  });

  it('blocks even an older host callback while the same native draft is being edited', async () => {
    const h = harness();
    const onContextChange = vi.fn();
    h.view({ onContextChange });
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ build: expect.objectContaining({ id }) })
      )
    );
    const frozen = onContextChange.mock.lastCall[0];
    fireEvent.click(screen.getByRole('button', { name: 'Edit native draft' }));
    expect(onContextChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ nativeEditing: true })
    );
    expect(await frozen.onAnswer('name_output', 'customer_name')).toBe(false);
    expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('binds an explicitly requested eligible repair to the exact saved workflow without running it', async () => {
    const h = harness({
      ...base,
      status: 'draft',
      questions: [],
      preparationVersion: 2,
      spec: nativeSpec,
      repairEligibility: { allowed: true },
    });
    h.client.repairSolutionBuildRequest = vi
      .fn()
      .mockResolvedValue({ buildRequest: { ...h.read(), rowVersion: 3, status: 'repairing' } });
    const onContextChange = vi.fn();
    h.view({ onContextChange });
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ build: expect.objectContaining({ id }) })
      )
    );
    let confirmed;
    await act(async () => {
      confirmed = await onContextChange.mock.lastCall[0].onRepair(
        'Fix the rejected-item branch without changing the agreed cases.'
      );
    });
    expect(confirmed).toBe(true);
    expect(h.client.repairSolutionBuildRequest).toHaveBeenCalledWith(
      id,
      {
        expectedVersion: 2,
        workflowHash: hash,
        instruction: 'Fix the rejected-item branch without changing the agreed cases.',
      },
      expect.any(String)
    );
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
  });
  it('reports native editing ownership initially, while open, and on exact panel cleanup', async () => {
    const h = harness();
    const onEditingChange = vi.fn();
    const onBusyChange = vi.fn();
    const mounted = h.view({ embedded: true, onEditingChange, onBusyChange });
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit native draft' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Native authoring canvas')).toHaveTextContent('edit');
    fireEvent.click(screen.getByRole('button', { name: 'Leave editor (saved changes only)' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit native draft' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    mounted.unmount();
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(h.client.reviewSolutionBuildRequest).not.toHaveBeenCalled();
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'guards a pending answer and ignores its late completion after unmount (%s)',
    async (unmountPending) => {
      const h = harness();
      const onBusyChange = vi.fn();
      let finishAnswer;
      h.client.answerSolutionBuildRequest.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishAnswer = resolve;
          })
      );
      const mounted = h.view({ embedded: true, onBusyChange });
      fireEvent.change(await screen.findByRole('textbox', { name: /Your answer/ }), {
        target: { value: 'customer_name' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save answer & continue' }));
      expect(onBusyChange).toHaveBeenLastCalledWith(true);
      await waitFor(() => expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledTimes(1));
      expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledWith(
        id,
        { expectedVersion: 2, questionId: 'name_output', value: 'customer_name' },
        expect.any(String)
      );
      if (unmountPending) mounted.unmount();
      const callsBeforeLateCompletion = onBusyChange.mock.calls.length;
      await act(async () => {
        finishAnswer({ buildRequest: { ...h.read(), status: 'preparing', rowVersion: 3 } });
      });
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
      if (unmountPending) expect(onBusyChange).toHaveBeenCalledTimes(callsBeforeLateCompletion);
      expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
    }
  );

  it('guards an explicitly confirmed stop but not an unopened or cancelled confirmation', async () => {
    const h = harness({ ...base, preparationVersion: 2, status: 'preparing', questions: [] });
    const onBusyChange = vi.fn();
    let finishStop;
    h.client.cancelSolutionBuildRequest = vi.fn(
      () =>
        new Promise((resolve) => {
          finishStop = resolve;
        })
    );
    h.view({ embedded: true, onBusyChange });
    fireEvent.click(await screen.findByRole('button', { name: 'Stop build' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Keep working' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(h.client.cancelSolutionBuildRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop build' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stop' }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(h.client.cancelSolutionBuildRequest).toHaveBeenCalledTimes(1));
    await act(async () => {
      finishStop({ buildRequest: { ...h.read(), status: 'cancelled', rowVersion: 3 } });
    });
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(await screen.findByText('Build stopped')).toBeInTheDocument();
  });

  it('includes the secure connection request in the host busy guard without exposing credentials', async () => {
    const h = harness({
      ...base,
      status: 'dependencies',
      questions: [],
      connectionRequirements: [
        {
          id: 'receiver',
          service: 'Customer receiver',
          credentialType: 'httpHeaderAuth',
          status: 'missing',
          reason: 'Authenticate to the selected receiver.',
          canConnect: true,
          fields: [
            { name: 'name', label: 'Header name', type: 'text', required: true },
            { name: 'value', label: 'API key', type: 'secret', required: true },
          ],
        },
      ],
    });
    const onBusyChange = vi.fn();
    let finishConnection;
    h.client.createSolutionBuildConnection = vi.fn(
      () =>
        new Promise((resolve) => {
          finishConnection = resolve;
        })
    );
    h.view({ embedded: true, onBusyChange });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Connect Customer receiver securely' })
    );
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText(/Header name/), { target: { value: 'X-Api-Key' } });
    fireEvent.change(screen.getByLabelText(/API key/), {
      target: { value: 'synthetic-test-credential' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save secure connection' }).closest('form')
    );
    await waitFor(() => expect(h.client.createSolutionBuildConnection).toHaveBeenCalledTimes(1));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(onBusyChange.mock.calls.flat().every((value) => typeof value === 'boolean')).toBe(true);
    await act(async () => {
      finishConnection({ buildRequest: { ...h.read(), rowVersion: 3 } });
    });
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(document.body.textContent).not.toContain('synthetic-test-credential');
  });

  it('embeds one authoring canvas and existing question forms without page navigation or another chat', async () => {
    const h = harness({ ...base, source: { ...base.source, threadId: 'original-chat' } });
    const onOpenWorkflow = vi.fn();
    h.view({ embedded: true, onOpenWorkflow });
    await screen.findByRole('region', { name: 'Workflow preparation controls' });
    expect(
      screen.queryByRole('heading', { name: 'Preparing your workflow' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to source task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mara' })).not.toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Native authoring canvas')).toHaveLength(1);
    expect(screen.getByLabelText('Native authoring canvas')).toHaveAttribute(
      'data-compact',
      'true'
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'customer_name' },
    });
    expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save answer & continue' }));
    await waitFor(() =>
      expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledWith(
        id,
        {
          expectedVersion: 2,
          questionId: 'name_output',
          value: 'customer_name',
        },
        expect.any(String)
      )
    );
    expect(screen.getByTestId('build-location')).toHaveTextContent(
      '/assistant?thread=original-chat'
    );
    expect(onOpenWorkflow).not.toHaveBeenCalled();
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('opens a completed Solution in the existing host panel only on the user click', async () => {
    const solutionId = '8b606adc-91ba-46e5-86da-ece609df9c7d';
    const h = harness({ ...base, status: 'completed', solutionId, questions: [] });
    const onOpenWorkflow = vi.fn();
    h.view({ embedded: true, onOpenWorkflow });
    const open = await screen.findByRole('link', { name: 'Open workflow' });
    expect(onOpenWorkflow).not.toHaveBeenCalled();
    expect(open).toHaveAttribute('href', `/workspace/solutions/${solutionId}`);
    fireEvent.click(open);
    expect(onOpenWorkflow).toHaveBeenCalledExactlyOnceWith(solutionId);
    expect(screen.getByTestId('build-location')).toHaveTextContent(
      '/assistant?thread=original-chat'
    );
    fireEvent.click(screen.getByRole('link', { name: 'Continue to workflow controls' }));
    expect(onOpenWorkflow).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('build-location')).toHaveTextContent(
      '/assistant?thread=original-chat'
    );
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
    expect(h.client.reviewSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('keeps the completed standalone link functional when no panel callback was supplied', async () => {
    const solutionId = '8b606adc-91ba-46e5-86da-ece609df9c7d';
    const h = harness({ ...base, status: 'completed', solutionId, questions: [] });
    h.view();
    fireEvent.click(await screen.findByRole('link', { name: 'Open Solution' }));
    expect(screen.getByTestId('build-location')).toHaveTextContent(
      `/workspace/solutions/${solutionId}`
    );
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('retains explicit Stop build confirmation in the compact embedded status toolbar', async () => {
    const h = harness({ ...base, preparationVersion: 2, status: 'preparing', questions: [] });
    h.client.cancelSolutionBuildRequest = vi.fn(async () => ({
      buildRequest: {
        ...h.read(),
        status: 'cancelled',
        rowVersion: 3,
      },
    }));
    h.view({ embedded: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Stop build' }));
    expect(h.client.cancelSolutionBuildRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Stop this build?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stop' }));
    await waitFor(() =>
      expect(h.client.cancelSolutionBuildRequest).toHaveBeenCalledWith(
        id,
        { expectedVersion: 2 },
        expect.any(String)
      )
    );
    expect(screen.getByLabelText('Native authoring canvas')).toBeInTheDocument();
  });

  it('keeps test and review available after an idle native validation report', async () => {
    const h = harness({
      ...base,
      preparationVersion: 2,
      spec: nativeSpec,
      status: 'draft',
      questions: [],
      progress: { stage: 'validating' },
      testEligibility: { allowed: true },
      repairEligibility: { allowed: true },
    });
    h.client.testSolutionBuildRequest = vi.fn();
    h.view();
    expect(await screen.findByRole('button', { name: 'Test draft in n8n' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Review saved workflow' })).toBeEnabled();
  });
  it('stops a native build explicitly, preserves its draft and removes further controls', async () => {
    const h = harness({
      ...base,
      preparationVersion: 2,
      spec: nativeSpec,
      status: 'preparing',
      questions: [],
    });
    h.client.cancelSolutionBuildRequest = vi.fn(async () => {
      const current = h.read();
      h.set({ ...current, status: 'cancelled', rowVersion: current.rowVersion + 1 });
      return { buildRequest: structuredClone(h.read()) };
    });
    h.view();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop build' }));
    expect(screen.getByRole('dialog', { name: 'Stop this build?' })).toBeInTheDocument();
    expect(screen.getByText(/stopping does not undo it/i)).toBeInTheDocument();
    expect(h.client.cancelSolutionBuildRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stop' }));
    await screen.findByText('Build stopped');
    expect(h.client.cancelSolutionBuildRequest).toHaveBeenCalledWith(
      id,
      { expectedVersion: 2 },
      expect.any(String)
    );
    expect(screen.queryByRole('button', { name: 'Stop build' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Native authoring canvas')).toBeInTheDocument();
  });
  it('renders general native requirements and typed setup blockers without contact-default or credential-answer substitution', async () => {
    const h = harness({
      ...base,
      spec: nativeSpec,
      questions: [
        {
          id: 'connection',
          kind: 'connection',
          prompt: 'Connect the order receiver',
          reason: 'Authenticate the outbound order request.',
          nodeId: 'Send order',
          action: 'https://untrusted.example',
        },
      ],
      dependencies: [
        { id: 'http-node', kind: 'runtime', description: 'A bounded HTTP runtime is required.' },
      ],
    });
    h.view();
    expect(await screen.findByText('Connect the order receiver')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agreed behavior & acceptance cases' }));
    expect(
      screen.getByText('Route valid orders and return rejected items separately.')
    ).toBeInTheDocument();
    expect(screen.getByText('orders[].quantity')).toBeInTheDocument();
    expect(screen.getByText('A bounded HTTP runtime is required.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull();
    expect(screen.queryByRole('link', { name: /untrusted/ })).toBeNull();
    expect(screen.queryByText(/customer_name|Alice|Preview mapped output/)).toBeNull();
    expect(screen.getByLabelText('Native authoring canvas')).toBeInTheDocument();
  });

  it('requires a real current-candidate test before V2 handoff and submits only controlled test authority', async () => {
    const h = harness({
      ...base,
      spec: nativeSpec,
      status: 'reviewed',
      questions: [],
      review: { valid: true, summary: 'Static graph checks passed' },
      testEligibility: { allowed: true },
      progress: { stage: 'ready', maxAttempts: 3 },
    });
    h.client.testSolutionBuildRequest = vi.fn(async () => {
      h.set({
        ...h.read(),
        rowVersion: 3,
        testEvidence: {
          status: 'succeeded',
          kind: 'controlled_runtime',
          workflowHash: hash,
          caseResults: [
            {
              id: 'mixed-orders',
              passed: true,
              executionId: '51',
              input: { orders: [] },
              output: { accepted: [], rejected: [] },
            },
          ],
        },
      });
      return { buildRequest: h.read() };
    });
    h.view();
    expect(await screen.findByRole('button', { name: 'Create reviewed Solution' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Test draft in n8n' }));
    await waitFor(() =>
      expect(h.client.testSolutionBuildRequest).toHaveBeenCalledWith(
        id,
        {
          expectedVersion: 2,
          workflowHash: hash,
          allowExternalEffects: false,
          repairOnFailure: true,
        },
        expect.any(String)
      )
    );
    expect(await screen.findByText('Tests passed · n8n execution 51')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create reviewed Solution' })).toBeEnabled();
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('repairs only the exact eligible saved draft, with optional non-secret instruction', async () => {
    const h = harness({
      ...base,
      spec: nativeSpec,
      status: 'draft',
      questions: [],
      repairEligibility: { allowed: true, reason: 'The saved test found a missing field.' },
      testEvidence: {
        status: 'failed',
        kind: 'controlled_runtime',
        workflowHash: hash,
        caseResults: [{ id: 'case', passed: false, issues: ['Quantity is missing.'] }],
      },
    });
    h.client.repairSolutionBuildRequest = vi.fn(async () => {
      h.set({
        ...h.read(),
        rowVersion: 3,
        progress: { stage: 'repairing', attempt: 1, maxAttempts: 3 },
      });
      return { buildRequest: h.read() };
    });
    h.view();
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Guidance for fixing this draft' }),
      { target: { value: 'Keep both accepted and rejected outputs.' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Repair draft' }));
    await waitFor(() =>
      expect(h.client.repairSolutionBuildRequest).toHaveBeenCalledWith(
        id,
        {
          expectedVersion: 2,
          workflowHash: hash,
          instruction: 'Keep both accepted and rejected outputs.',
        },
        expect.any(String)
      )
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Build technical details' }));
    expect(
      await screen.findByText('Recorded stage: repairing · Attempt 1 · Limit 3')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repair draft' })).toBeDisabled();
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('never offers test or repair on unknown outcomes even when an obsolete eligibility flag says allowed', async () => {
    const h = harness({
      ...base,
      spec: nativeSpec,
      status: 'draft',
      questions: [],
      repairEligibility: { allowed: true },
      testEligibility: { allowed: true },
      testEvidence: {
        status: 'outcome_unknown',
        kind: 'live_connection',
        workflowHash: hash,
        caseResults: [],
      },
    });
    h.client.repairSolutionBuildRequest = vi.fn();
    h.client.testSolutionBuildRequest = vi.fn();
    h.view();
    expect(await screen.findByRole('button', { name: 'Repair draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test draft in n8n' })).toBeDisabled();
    expect(screen.getByText(/Reconcile the unknown outcome/)).toBeInTheDocument();
  });

  it('rechecks repair eligibility before sending a mutation', async () => {
    const h = harness({
      ...base,
      spec: nativeSpec,
      status: 'draft',
      questions: [],
      repairEligibility: { allowed: true },
    });
    h.client.repairSolutionBuildRequest = vi.fn();
    h.view();
    await screen.findByRole('button', { name: 'Repair draft' });
    h.set({
      ...h.read(),
      repairEligibility: { allowed: false, reason: 'The execution must be reconciled.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Repair draft' }));
    expect(await screen.findByText(/Repair is not authorized/)).toBeInTheDocument();
    expect(h.client.repairSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('shows persisted test progress without making a new request or unlocking activation', async () => {
    const h = harness({
      ...base,
      spec: nativeSpec,
      status: 'draft',
      questions: [],
      testEligibility: { allowed: true },
      progress: { stage: 'testing', attempt: 2, maxAttempts: 3 },
    });
    h.client.testSolutionBuildRequest = vi.fn();
    h.view();
    fireEvent.click(await screen.findByRole('button', { name: 'Build technical details' }));
    expect(
      await screen.findByText('Recorded stage: testing · Attempt 2 · Limit 3')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test draft in n8n' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Activate/ })).toBeNull();
    expect(h.client.testSolutionBuildRequest).not.toHaveBeenCalled();
  });
  it('shows an early native draft and a specific durable question without run or deployment controls', async () => {
    const h = harness();
    h.view();
    expect(
      await screen.findByText('Which output field should receive the name?')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Native authoring canvas')).toHaveTextContent(`${id} · view`);
    expect(screen.getByText(/waiting for this information, not running/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Deploy|Activate|Run workflow|Create reviewed/ })
    ).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Go to your question' }));
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Edit native draft' }));
    expect(screen.getByLabelText('Native authoring canvas')).toHaveTextContent('edit');
    expect(screen.getByText(/wait for native n8n to show Saved/)).toBeInTheDocument();
  });

  it('saves an answer to this question/version and resumes the same persisted build across reload', async () => {
    const h = harness();
    const first = h.view();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'customer_name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer & continue' }));
    await waitFor(() => expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledTimes(1));
    expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledWith(
      id,
      { expectedVersion: 2, questionId: 'name_output', value: 'customer_name' },
      expect.any(String)
    );
    expect(await screen.findByText('Preparing workflow')).toBeInTheDocument();
    first.unmount();
    h.view();
    expect(await screen.findByText('Preparing workflow')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Source, saved answers & boundaries' }));
    expect(screen.getByText('Saved answer: customer_name')).toBeInTheDocument();
    expect(h.client.answerSolutionBuildRequest).toHaveBeenCalledTimes(1);
  });

  it('does not submit a stale answer after another session changes the record', async () => {
    const h = harness();
    h.view();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'customer_name' },
    });
    h.set({ ...h.read(), rowVersion: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer & continue' }));
    expect(await screen.findByText(/changed in another session/)).toBeInTheDocument();
    expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('customer_name');
  });

  it('reviews the latest saved native version and freezes only the exact displayed reviewed hash', async () => {
    const h = harness({ ...base, status: 'draft', questions: [], spec });
    h.view();
    await screen.findByRole('button', { name: 'Review saved workflow' });
    h.set({ ...h.read(), rowVersion: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Review saved workflow' }));
    await waitFor(() =>
      expect(h.client.reviewSolutionBuildRequest).toHaveBeenCalledWith(id, { expectedVersion: 4 })
    );
    expect(await screen.findByText('Return normalized name and email.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create reviewed Solution' }));
    await waitFor(() =>
      expect(h.client.confirmSolutionBuildRequest).toHaveBeenCalledWith(
        id,
        { expectedVersion: 5, workflowHash: hash },
        expect.any(String)
      )
    );
    expect(
      await screen.findByRole('link', { name: 'Continue to Solution controls' })
    ).toHaveAttribute('href', '/workspace/solutions/solution-created');
    expect(screen.getByText(/This page retains the original build evidence/)).toBeInTheDocument();
  });

  it('shows unsupported work honestly without a contact-default graph or executable controls', async () => {
    const h = harness({
      ...base,
      status: 'unsupported',
      workflow: null,
      questions: [],
      explanation: 'SMS sending requires a provider capability that is not available.',
      lastError: { code: 'UNSUPPORTED_CAPABILITY' },
    });
    h.view();
    expect(await screen.findByText(/SMS sending requires a provider/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Native authoring canvas')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review saved workflow' })).toBeNull();
    expect(screen.getByText('No supported draft available')).toBeInTheDocument();
  });

  it('distinguishes a local input/output illustration from a real n8n execution', async () => {
    const h = harness({ ...base, status: 'draft', questions: [], spec });
    h.view();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Try an input/output illustration' })
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Example input JSON' }), {
      target: { value: '{"name":" Ada ","email":"ADA@EXAMPLE.COM"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview mapped output' }));
    expect(screen.getByLabelText('Illustrated output, not an execution result')).toHaveTextContent(
      '"customer_name": "Ada"'
    );
    expect(screen.getByLabelText('Illustrated output, not an execution result')).toHaveTextContent(
      'ada@example.com'
    );
    expect(
      screen.getByText(/does not run n8n, call a provider or prove deployment/)
    ).toBeInTheDocument();
    expect(h.client.confirmSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('preserves the last confirmed draft and disables action when updates cannot reconnect', async () => {
    const h = harness();
    h.view();
    await screen.findByRole('textbox', { name: 'Your answer' });
    h.client.solutionBuildRequest.mockRejectedValue(new Error('Network unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved state' }));
    expect(await screen.findByText(/Live updates paused/)).toBeInTheDocument();
    expect(screen.getByLabelText('Native authoring canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save answer & continue' })).toBeDisabled();
    h.client.solutionBuildRequest.mockResolvedValue({ buildRequest: h.read() });
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(screen.queryByText(/Live updates paused/)).toBeNull());
  });

  it('rejects recognizable secrets in general answer fields before sending them', async () => {
    const h = harness();
    h.view();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'api_key=synthetic_not_a_real_credential' },
    });
    expect(screen.getByRole('button', { name: 'Save answer & continue' })).toBeDisabled();
    expect(h.client.answerSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('never replaces a newer confirmed record with a late older read', async () => {
    const h = harness();
    h.view();
    await screen.findByRole('textbox', { name: 'Your answer' });
    h.client.solutionBuildRequest.mockResolvedValueOnce({
      buildRequest: { ...base, rowVersion: 1, instruction: 'obsolete request' },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Refresh saved state' }))
    );
    expect(screen.queryByText('obsolete request')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Build technical details' }));
    expect(screen.getByText('Saved version 2 · Input version 1')).toBeInTheDocument();
  });
});
