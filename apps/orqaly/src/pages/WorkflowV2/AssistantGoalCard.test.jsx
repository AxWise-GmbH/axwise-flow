import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantGoalCard } from './AssistantGoalCard.jsx';

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const SECOND_RUN_ID = '10000000-0000-4000-8000-000000000002';
const SCOPE_HASH = 'a'.repeat(64);
const PLAN_HASH = 'b'.repeat(64);
const FINAL_HASH = 'c'.repeat(64);

const refs = {
  scope: {
    artifactId: '20000000-0000-4000-8000-000000000001',
    artifactHash: SCOPE_HASH,
    kind: 'scope',
  },
  plan: {
    artifactId: '20000000-0000-4000-8000-000000000002',
    artifactHash: PLAN_HASH,
    kind: 'plan',
  },
  final: {
    artifactId: '20000000-0000-4000-8000-000000000003',
    artifactHash: FINAL_HASH,
    kind: 'final_markdown',
  },
};

const artifacts = {
  [refs.scope.artifactId]: {
    ...refs.scope,
    payload: {
      objective: 'Prepare the Orqaly launch.',
      deliverables: ['Launch brief'],
      topicAnchors: [{ value: 'Orqaly' }],
      geography: ['Germany'],
      materialClarification: null,
    },
  },
  [refs.plan.artifactId]: {
    ...refs.plan,
    payload: {
      tasks: [
        {
          stageId: '30000000-0000-4000-8000-000000000001',
          stageKey: 'launch-brief',
          title: 'Write the launch brief',
        },
      ],
    },
  },
};

function stage(kind, ordinal, status = 'pending', outputArtifact = null) {
  return { kind, stageKey: kind, ordinal, status, outputArtifact };
}

function scopeGateWorkflow() {
  return {
    run: {
      id: RUN_ID,
      status: 'awaiting_gate_1',
      rowVersion: 2,
      evidenceReadiness: null,
      finalArtifact: null,
    },
    stages: [
      stage('compile_scope', 0, 'completed', refs.scope),
      stage('gate_1', 1, 'awaiting_approval'),
      stage('execute_research', 2),
      stage('planning', 3),
      stage('gate_2', 4),
      stage('execution', 5),
      stage('evaluation', 6),
      stage('synthesis', 7),
    ],
    attempts: [],
    dependencies: [],
    approvals: [],
  };
}

function runningWorkflow() {
  const workflow = scopeGateWorkflow();
  return {
    ...workflow,
    run: { ...workflow.run, status: 'running', rowVersion: 1 },
    stages: workflow.stages.map((item) =>
      item.kind === 'compile_scope'
        ? { ...item, status: 'running', outputArtifact: null }
        : { ...item, status: 'pending' }
    ),
  };
}

function completedWorkflow() {
  const workflow = scopeGateWorkflow();
  return {
    ...workflow,
    run: {
      ...workflow.run,
      status: 'completed_with_evidence_gaps',
      rowVersion: 20,
      evidenceReadiness: 'ready_with_gaps',
      finalArtifact: refs.final,
    },
    stages: workflow.stages.map((item) => ({
      ...item,
      status: 'completed',
      ...(item.kind === 'planning' ? { outputArtifact: refs.plan } : {}),
      ...(item.kind === 'synthesis' ? { outputArtifact: refs.final } : {}),
    })),
  };
}

function clientFor(workflow) {
  return {
    read: vi.fn().mockResolvedValue({ workflow }),
    artifact: vi.fn(async (_runId, artifactId, options) =>
      options?.markdown
        ? { markdown: '# Final artifact', etag: `"sha256-${FINAL_HASH}"` }
        : { artifact: artifacts[artifactId] }
    ),
    approve: vi.fn().mockResolvedValue({ workflow }),
    reviseScope: vi.fn().mockResolvedValue({ workflow }),
    readExecutableAction: vi.fn().mockResolvedValue({
      version: 'orqaly_executable_action_aggregate_v1',
      action: null,
    }),
    proposeExecutableAction: vi.fn(),
    decideExecutableAction: vi.fn(),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('AssistantGoalCard', () => {
  beforeEach(() => {
    let sequence = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `70000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads and polls a live run while exposing advanced details through the host callback', async () => {
    vi.useFakeTimers();
    const client = clientFor(runningWorkflow());
    const onOpenAdvanced = vi.fn();
    render(
      <AssistantGoalCard
        client={client}
        runId={RUN_ID}
        onOpenAdvanced={onOpenAdvanced}
        pollIntervalMs={250}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Compile scope · Running')).toBeTruthy();
    expect(screen.getByText('0/8 stages settled')).toBeTruthy();
    expect(screen.queryByTestId('assistant-executable-action')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(client.read).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Plan & activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open advanced details' }));
    expect(onOpenAdvanced).toHaveBeenCalledWith(RUN_ID);
  });

  it('publishes only adopted live statuses to sibling Agent UI', async () => {
    vi.useFakeTimers();
    const running = runningWorkflow();
    const completed = completedWorkflow();
    const client = clientFor(running);
    client.read.mockResolvedValueOnce({ workflow: running }).mockResolvedValueOnce({
      workflow: completed,
    });
    const onStatusChange = vi.fn();
    render(
      <AssistantGoalCard
        client={client}
        runId={RUN_ID}
        initialStatus="requested"
        onStatusChange={onStatusChange}
        pollIntervalMs={250}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onStatusChange).toHaveBeenLastCalledWith(RUN_ID, 'running');
    expect(onStatusChange).not.toHaveBeenCalledWith(RUN_ID, 'requested');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(onStatusChange).toHaveBeenLastCalledWith(RUN_ID, 'completed_with_evidence_gaps');
  });

  it('keeps checking an approval gate at a slower cross-tab refresh interval', async () => {
    vi.useFakeTimers();
    const client = clientFor(scopeGateWorkflow());
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={250} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(client.read).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(client.read).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(client.read).toHaveBeenCalledTimes(2);
  });

  it('does not let an older poll restore a gate after approval advances the row version', async () => {
    vi.useFakeTimers();
    const gate = scopeGateWorkflow();
    const advanced = {
      ...runningWorkflow(),
      run: { ...runningWorkflow().run, rowVersion: gate.run.rowVersion + 1 },
    };
    const stalePoll = deferred();
    const client = clientFor(gate);
    client.read.mockResolvedValueOnce({ workflow: gate }).mockReturnValueOnce(stalePoll.promise);
    client.approve.mockResolvedValue({ workflow: advanced });
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={250} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const approve = screen.getByRole('button', { name: 'Approve exact scope' });
    expect(approve).toBeEnabled();

    act(() => vi.advanceTimersByTime(10_000));
    expect(client.read).toHaveBeenCalledTimes(2);
    fireEvent.click(approve);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Compile scope · Running')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve exact scope' })).toBeNull();

    await act(async () => {
      stalePoll.resolve({ workflow: gate });
      await stalePoll.promise;
    });
    expect(screen.getByText('Compile scope · Running')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve exact scope' })).toBeNull();
  });

  it('never renders or fetches artifacts from a stale run after its prop changes', async () => {
    const firstRead = deferred();
    const secondWorkflow = {
      ...runningWorkflow(),
      run: { ...runningWorkflow().run, id: SECOND_RUN_ID },
    };
    const client = clientFor(secondWorkflow);
    client.read.mockImplementation((requestedRunId) =>
      requestedRunId === RUN_ID ? firstRead.promise : Promise.resolve({ workflow: secondWorkflow })
    );
    const view = render(
      <AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={60_000} />
    );
    await waitFor(() => expect(client.read).toHaveBeenCalledWith(RUN_ID));

    view.rerender(
      <AssistantGoalCard client={client} runId={SECOND_RUN_ID} pollIntervalMs={60_000} />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Technical execution details' }));
    expect(await screen.findByText(`Run ${SECOND_RUN_ID}`)).toBeTruthy();

    await act(async () => {
      firstRead.resolve({ workflow: scopeGateWorkflow() });
      await firstRead.promise;
    });

    expect(screen.getByText(`Run ${SECOND_RUN_ID}`)).toBeTruthy();
    expect(screen.queryByText(`Run ${RUN_ID}`)).toBeNull();
    expect(client.artifact).not.toHaveBeenCalled();
  });

  it('approves the exact immutable scope reference with the established idempotency key', async () => {
    const workflow = scopeGateWorkflow();
    const nextWorkflow = runningWorkflow();
    const client = clientFor(workflow);
    client.approve.mockResolvedValue({ workflow: nextWorkflow });
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={60_000} />);

    expect(await screen.findByText('Prepare the Orqaly launch.')).toBeTruthy();
    const approve = screen.getByRole('button', { name: 'Approve exact scope' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() =>
      expect(client.approve).toHaveBeenCalledWith(
        RUN_ID,
        expect.objectContaining({
          approvalKind: 'scope',
          artifact: refs.scope,
          idempotencyKey: `${RUN_ID}:scope:${SCOPE_HASH}`,
          commandId: expect.any(String),
          issuedAt: expect.any(String),
        })
      )
    );
  });

  it('revises scope against the exact accepted hash and keeps the generated command retry-safe', async () => {
    const workflow = scopeGateWorkflow();
    const client = clientFor(workflow);
    client.reviseScope.mockRejectedValue(new Error('Temporary command failure'));
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={60_000} />);

    expect(await screen.findByText('Prepare the Orqaly launch.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change scope' }));
    fireEvent.change(screen.getByLabelText('Scope correction'), {
      target: { value: 'Include Austria.' },
    });
    const apply = screen.getByRole('button', { name: 'Apply correction and recompile' });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    expect(await screen.findByText('Temporary command failure')).toBeTruthy();

    fireEvent.click(apply);
    await waitFor(() => expect(client.reviseScope).toHaveBeenCalledTimes(2));
    const firstCommand = client.reviseScope.mock.calls[0][1];
    const secondCommand = client.reviseScope.mock.calls[1][1];
    expect(firstCommand).toBe(secondCommand);
    expect(firstCommand).toMatchObject({
      acceptedScope: refs.scope,
      correction: 'Include Austria.',
      idempotencyKey: expect.stringMatching(new RegExp(`^${RUN_ID}:scope-revision:`)),
    });
  });

  it('renders evidence gaps and the final artifact with a download and fallback details link', async () => {
    const client = clientFor(completedWorkflow());
    const createObjectURL = vi.fn(() => 'blob:goal-artifact');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={60_000} />);

    const finalArtifact = await screen.findByText('Final artifact');
    expect(screen.queryByTestId('assistant-executable-action')).toBeNull();
    expect(client.readExecutableAction).not.toHaveBeenCalled();
    expect(screen.queryByText('Write the launch brief')).toBeNull();
    expect(screen.getByText('Draft ready · verification needed')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Goal progress' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Technical execution details' }));
    const executableAction = await screen.findByTestId('assistant-executable-action');
    expect(
      finalArtifact.compareDocumentPosition(executableAction) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(client.readExecutableAction).toHaveBeenCalledWith(RUN_ID);
    expect(screen.getByText(/Some claims still need verification/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Plan & activity' }));
    expect(screen.getByText('Write the launch brief')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open advanced details' })).toHaveAttribute(
      'href',
      `/goals?section=goals&run=${RUN_ID}`
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:goal-artifact');
    click.mockRestore();
  });

  it('keeps long final Markdown out of the collapsed accessibility tree until expanded', async () => {
    const client = clientFor(completedWorkflow());
    const longMarkdown = [
      '# Final artifact',
      ...Array.from(
        { length: 3 },
        (_, index) => `## Section ${index + 1}\n\n${'Bounded result. '.repeat(30)}`
      ),
      '## Final notes',
      'TAIL_MARKER',
    ].join('\n\n');
    client.artifact.mockImplementation(async (_runId, artifactId, options) =>
      options?.markdown
        ? { markdown: longMarkdown, etag: `"sha256-${FINAL_HASH}"` }
        : { artifact: artifacts[artifactId] }
    );
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={60_000} />);

    const expand = await screen.findByRole('button', { name: 'Open deliverable' });
    await waitFor(() => expect(expand).toBeEnabled());
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/TAIL_MARKER/)).toBeNull();

    fireEvent.click(expand);
    expect(screen.getByRole('button', { name: 'Close deliverable' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(await screen.findByText(/TAIL_MARKER/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close deliverable' }));
    expect(screen.queryByText(/TAIL_MARKER/)).toBeNull();
  });

  it('refuses final Markdown whose response ETag does not match the immutable reference', async () => {
    const client = clientFor(completedWorkflow());
    client.artifact.mockImplementation(async (_runId, artifactId, options) =>
      options?.markdown
        ? { markdown: '# Tampered result', etag: `"sha256-${'d'.repeat(64)}"` }
        : { artifact: artifacts[artifactId] }
    );
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={60_000} />);

    expect(
      await screen.findByText(/final Markdown hash did not match its immutable reference/)
    ).toBeTruthy();
    expect(screen.queryByText('Tampered result')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download .md' })).toBeDisabled();
  });

  it('recovers from an initial read failure without losing the advanced escape hatch', async () => {
    const workflow = scopeGateWorkflow();
    const client = clientFor(workflow);
    client.read.mockRejectedValueOnce(new Error('Goal temporarily unavailable'));
    render(<AssistantGoalCard client={client} runId={RUN_ID} pollIntervalMs={60_000} />);

    expect(await screen.findByText('Goal temporarily unavailable')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open advanced details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Goal' }));

    expect(await screen.findByText('Prepare the Orqaly launch.')).toBeTruthy();
    expect(client.read).toHaveBeenCalledTimes(2);
  });
});
