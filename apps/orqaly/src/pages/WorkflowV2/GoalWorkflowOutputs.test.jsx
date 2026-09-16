import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoalWorkflowOutputs } from './GoalWorkflowOutputs.jsx';
import { WorkflowV2Surface } from './WorkflowV2.jsx';
import { projectGoalWork } from '../../../shared/workflow-v2/workflow-view.js';
import { GOAL_WORKFLOW_VIEW_LIMITS } from '../../../shared/workflow-v2/goal-workflow-view-contract.js';
import {
  goalViewId as id,
  goalViewOwner as owner,
  goalViewResponse,
  goalViewProjection,
} from '../../../shared/workflow-v2/fixtures/goal-workflow-view.js';

vi.mock('@clerk/react', () => ({
  SignIn: () => null,
  UserButton: () => null,
  useAuth: () => ({}),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function responseFor({
  runId = id(2),
  ownerUserId = owner,
  rowVersion = 9,
  label = 'Completed',
} = {}) {
  const value = goalViewResponse();
  value.workflow.id = `goal_run:${runId}`;
  value.workflow.source.id = runId;
  value.workflow.scope.ownerUserId = ownerUserId;
  value.workflow.rowVersion = rowVersion;
  value.workflow.status.label = label;
  for (const output of value.workflow.outputs) output.reference.runId = runId;
  for (const step of value.workflow.steps) if (step.output) step.output.runId = runId;
  return value;
}
function fixture() {
  const client = {
    goalWorkflowView: vi.fn().mockResolvedValue(responseFor()),
    artifact: vi.fn(async (_runId, _artifactId, options = {}) =>
      options.markdown
        ? { markdown: 'Verified on-demand content.', etag: `"sha256-${'b'.repeat(64)}"` }
        : {
            artifact: {
              artifactId: id(4),
              artifactHash: 'b'.repeat(64),
              kind: 'final_markdown',
              contentType: 'text/markdown',
              markdown: 'Verified on-demand content.',
            },
          }
    ),
    approve: vi.fn(),
    reviseScope: vi.fn(),
    assistantResume: vi.fn(),
    assistantSend: vi.fn(),
  };
  return {
    client,
    runId: id(2),
    rowVersion: 9,
    refreshKey: 'initial-stage-metadata',
    ownerUserId: owner,
    authScopeKey: `${owner}:session1`,
    selectionEpoch: 1,
  };
}
describe('selected Goal Workflow/Outputs', () => {
  it('shows exact metadata and lineage without loading content or invoking commands', async () => {
    const props = fixture();
    render(<GoalWorkflowOutputs {...props} />);
    await screen.findByRole('button', { name: 'Open final markdown output' });
    expect(screen.getByText(/SHA-256/)).toHaveTextContent('b'.repeat(64));
    expect(screen.getByText(/Source artifact IDs:/)).toHaveTextContent(id(5));
    expect(
      screen.getByText(/Attempts, dependencies, approvals, and history are not loaded/)
    ).toBeInTheDocument();
    expect(props.client.artifact).not.toHaveBeenCalled();
    for (const method of ['approve', 'reviseScope', 'assistantResume', 'assistantSend'])
      expect(props.client[method]).not.toHaveBeenCalled();
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(1);
  });
  it('reserves scalable marker space for the full bounded 64-stage ordered list', async () => {
    const props = fixture(),
      value = responseFor();
    value.workflow.steps = Array.from({ length: GOAL_WORKFLOW_VIEW_LIMITS.stages }, (_, index) => ({
      ...value.workflow.steps[0],
      id: id(100 + index),
      ordinal: index + 1,
      kind: 'execution',
      stageKey: `Synthetic stage ${index + 1}`,
      output: null,
    }));
    value.coverage.stages.loaded = value.workflow.steps.length;
    props.client.goalWorkflowView.mockResolvedValue(value);
    render(<GoalWorkflowOutputs {...props} />);
    await screen.findByText('Synthetic stage 64');
    const details = screen.getByRole('region', { name: 'Workflow and output metadata details' });
    const ordered = within(details).getAllByRole('list')[0];
    expect(ordered.tagName).toBe('OL');
    expect(ordered).toHaveStyle({ paddingLeft: '4ch' });
    const steps = within(ordered).getAllByRole('listitem');
    expect(steps).toHaveLength(GOAL_WORKFLOW_VIEW_LIMITS.stages);
    expect(steps[9]).toHaveTextContent('Synthetic stage 10');
    expect(steps[63]).toHaveTextContent('Synthetic stage 64');
    expect(props.client.artifact).not.toHaveBeenCalled();
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(1);
  });
  it('opens only the selected exact output through the existing artifact loader', async () => {
    const props = fixture();
    render(<GoalWorkflowOutputs {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open final markdown output' }));
    await screen.findByText('Verified on-demand content.');
    expect(props.client.artifact).toHaveBeenCalledWith(id(2), id(4));
    expect(props.client.artifact).toHaveBeenCalledWith(id(2), id(4), {
      markdown: true,
      includeMetadata: true,
    });
    expect(props.client.artifact).toHaveBeenCalledTimes(2);
  });
  it.each(['etag', 'bytes'])('refuses Markdown with a changed %s proof', async (field) => {
    const props = fixture();
    props.client.artifact.mockImplementation(async (_runId, _artifactId, options = {}) =>
      options.markdown
        ? {
            markdown: field === 'bytes' ? 'PRIVATE_DIFFERENT_BYTES' : 'Verified on-demand content.',
            etag: `"sha256-${(field === 'etag' ? 'd' : 'b').repeat(64)}"`,
          }
        : {
            artifact: {
              artifactId: id(4),
              artifactHash: 'b'.repeat(64),
              kind: 'final_markdown',
              contentType: 'text/markdown',
              markdown: 'Verified on-demand content.',
            },
          }
    );
    render(<GoalWorkflowOutputs {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open final markdown output' }));
    await screen.findByText(/This exact output could not be loaded/);
    expect(screen.queryByText('Verified on-demand content.')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE_DIFFERENT_BYTES')).not.toBeInTheDocument();
  });
  it.each(['artifactId', 'artifactHash', 'kind', 'runId'])(
    'refuses on-demand content with a mismatched %s',
    async (field) => {
      const props = fixture();
      props.client.artifact.mockResolvedValue({
        artifact: {
          artifactId: id(4),
          artifactHash: 'b'.repeat(64),
          kind: 'final_markdown',
          contentType: 'text/markdown',
          markdown: 'PRIVATE_WRONG_OUTPUT',
          [field]: field === 'artifactHash' ? 'd'.repeat(64) : field === 'kind' ? 'scope' : id(99),
        },
      });
      render(<GoalWorkflowOutputs {...props} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Open final markdown output' }));
      await screen.findByText(/This exact output could not be loaded/);
      expect(screen.queryByText('PRIVATE_WRONG_OUTPUT')).not.toBeInTheDocument();
    }
  );
  it.each(['run', 'auth', 'client', 'selection', 'stage metadata'])(
    'ignores late metadata after a %s change and aborts the old GET',
    async (change) => {
      const props = fixture(),
        pending = deferred();
      props.client.goalWorkflowView.mockReturnValueOnce(pending.promise);
      const { rerender } = render(<GoalWorkflowOutputs {...props} />);
      const oldSignal = props.client.goalWorkflowView.mock.calls[0][1].signal;
      const next = { ...props };
      if (change === 'run') next.runId = id(99);
      if (change === 'auth') {
        next.ownerUserId = 'user_second';
        next.authScopeKey = 'user_second:session2';
      }
      if (change === 'client') next.client = { ...props.client, goalWorkflowView: vi.fn() };
      if (change === 'selection') next.selectionEpoch = 2;
      if (change === 'stage metadata') next.refreshKey = 'updated-stage-metadata';
      next.client.goalWorkflowView.mockResolvedValue(
        responseFor({ runId: next.runId, ownerUserId: next.ownerUserId, label: 'Current metadata' })
      );
      rerender(<GoalWorkflowOutputs {...next} />);
      await screen.findByText('Current metadata');
      expect(oldSignal.aborted).toBe(true);
      await act(async () => pending.resolve(responseFor({ label: 'STALE_METADATA' })));
      expect(screen.queryByText('STALE_METADATA')).not.toBeInTheDocument();
    }
  );
  it('hides already-rendered data synchronously when auth changes or signs out', async () => {
    const props = fixture(),
      pending = deferred();
    const { rerender } = render(<GoalWorkflowOutputs {...props} />);
    await screen.findByRole('button', { name: 'Open final markdown output' });
    props.client.goalWorkflowView.mockReturnValue(pending.promise);
    rerender(<GoalWorkflowOutputs {...props} authScopeKey={`${owner}:new-session`} />);
    expect(
      screen.queryByRole('button', { name: 'Open final markdown output' })
    ).not.toBeInTheDocument();
    rerender(<GoalWorkflowOutputs {...props} ownerUserId={null} authScopeKey={null} />);
    expect(
      screen.queryByRole('region', { name: 'Goal Workflow and Outputs' })
    ).not.toBeInTheDocument();
    await act(async () => pending.resolve(responseFor({ label: 'STALE_SIGNED_OUT' })));
    expect(screen.queryByText('STALE_SIGNED_OUT')).not.toBeInTheDocument();
  });
  it('refreshes only on selected version/epoch or explicit retry, without a timer engine', async () => {
    const props = fixture(),
      { rerender } = render(<GoalWorkflowOutputs {...props} />);
    await screen.findByText('Metadata at row version 9');
    rerender(<GoalWorkflowOutputs {...props} />);
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(1);
    props.client.goalWorkflowView.mockResolvedValue(responseFor({ rowVersion: 10 }));
    rerender(<GoalWorkflowOutputs {...props} rowVersion={10} />);
    await screen.findByText('Metadata at row version 10');
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(2);
  });
  it.each(['old version', 'other owner', 'other run'])(
    'rejects %s metadata instead of displaying it',
    async (kind) => {
      const props = fixture();
      props.client.goalWorkflowView.mockResolvedValue(
        responseFor({
          ...(kind === 'old version'
            ? { rowVersion: 8 }
            : kind === 'other owner'
              ? { ownerUserId: 'user_other' }
              : { runId: id(99) }),
          label: 'PRIVATE_MISMATCH',
        })
      );
      render(<GoalWorkflowOutputs {...props} />);
      await screen.findByRole('button', { name: 'Retry metadata' });
      expect(screen.queryByText('PRIVATE_MISMATCH')).not.toBeInTheDocument();
    }
  );
  it('provides a bounded manual retry for unavailable metadata', async () => {
    const props = fixture();
    props.client.goalWorkflowView.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAIL'));
    render(<GoalWorkflowOutputs {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry metadata' }));
    await screen.findByRole('button', { name: 'Open final markdown output' });
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('PRIVATE_DATABASE_DETAIL')).not.toBeInTheDocument();
  });
  it('labels stage, output, and lineage truncation explicitly', async () => {
    const props = fixture(),
      value = responseFor();
    value.coverage.stages.complete = false;
    value.coverage.outputs.complete = false;
    value.coverage.lineage.incompleteArtifactIds = [id(4)];
    props.client.goalWorkflowView.mockResolvedValue(value);
    render(<GoalWorkflowOutputs {...props} />);
    await screen.findByText(/Only the first 64 stages are loaded/);
    expect(screen.getByText(/Output coverage is partial/)).toBeInTheDocument();
    expect(screen.getByText(/Source artifact IDs \(partial\)/)).toBeInTheDocument();
    expect(screen.getByText(/Lineage is limited to 128 source IDs/)).toBeInTheDocument();
  });
  it('labels a complete empty output set without claiming business-value verification', async () => {
    const props = fixture(),
      value = responseFor();
    value.workflow.outputs = [];
    value.workflow.steps[0].output = null;
    value.coverage.outputs.loaded = 0;
    props.client.goalWorkflowView.mockResolvedValue(value);
    render(<GoalWorkflowOutputs {...props} />);
    await screen.findByText('No immutable outputs are recorded yet.');
    expect(
      screen.getByText(/Completion status does not verify business value/)
    ).toBeInTheDocument();
  });
  it.each(['auth', 'stage metadata'])(
    'ignores late output content after switching %s context',
    async (change) => {
      const props = fixture(),
        pending = deferred();
      props.client.artifact.mockReturnValue(pending.promise);
      const { rerender } = render(<GoalWorkflowOutputs {...props} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Open final markdown output' }));
      const next =
        change === 'auth'
          ? { ownerUserId: 'user_second', authScopeKey: 'user_second:session2' }
          : { refreshKey: 'updated-stage-metadata' };
      props.client.goalWorkflowView.mockResolvedValue(responseFor(next));
      rerender(<GoalWorkflowOutputs {...props} {...next} />);
      await screen.findByRole('button', { name: 'Open final markdown output' });
      await act(async () =>
        pending.resolve({
          artifact: {
            artifactId: id(4),
            artifactHash: 'b'.repeat(64),
            kind: 'final_markdown',
            contentType: 'text/markdown',
            markdown: 'PRIVATE_OLD_SESSION_CONTENT',
          },
        })
      );
      expect(screen.queryByText('PRIVATE_OLD_SESSION_CONTENT')).not.toBeInTheDocument();
      expect(props.client.artifact).toHaveBeenCalledTimes(1);
    }
  );
  it('uses the existing Goal poll to refresh stage-only changes while deduplicating identical snapshots', async () => {
    vi.useFakeTimers();
    const props = fixture();
    const projection = goalViewProjection();
    projection.snapshot.run.status = 'running';
    projection.snapshot.run.finalArtifact = null;
    projection.snapshot.stages[0] = {
      ...projection.snapshot.stages[0],
      kind: 'execution',
      stageKey: 'execution_deliverable',
      status: 'running',
      outputArtifact: null,
    };
    const initial = structuredClone(projection.snapshot);
    const updated = structuredClone(initial);
    updated.stages[0].rowVersion += 1;
    updated.stages[0].status = 'completed';
    updated.stages[0].outputArtifact = {
      artifactId: id(4),
      artifactHash: 'b'.repeat(64),
      kind: 'task_result',
    };
    const metadata = (snapshot) => {
      const value = responseFor();
      value.workflow = { ...projectGoalWork(snapshot), ...projection.timestamps };
      value.coverage.outputs.loaded = value.workflow.outputs.length;
      return value;
    };
    props.client.goalWorkflowView
      .mockResolvedValueOnce(metadata(initial))
      .mockResolvedValue(metadata(updated));
    props.client.list = vi.fn().mockResolvedValue({ workflows: [initial] });
    props.client.read = vi
      .fn()
      .mockResolvedValueOnce({ workflow: initial })
      .mockResolvedValueOnce({ workflow: structuredClone(initial) })
      .mockResolvedValue({ workflow: updated });
    await act(async () => {
      render(
        <WorkflowV2Surface
          client={props.client}
          ownerUserId={owner}
          authScopeKey={props.authScopeKey}
          routeSearch={`?run=${id(2)}`}
        />
      );
    });
    const panel = within(screen.getByRole('region', { name: 'Goal Workflow and Outputs' }));
    expect(panel.getByText('No immutable outputs are recorded yet.')).toBeInTheDocument();
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(props.client.read).toHaveBeenCalledTimes(2);
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(props.client.read).toHaveBeenCalledTimes(3);
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(2);
    expect(panel.getByText('Metadata at row version 9')).toBeInTheDocument();
    expect(panel.getByText('Completed')).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Open task result output' })).toBeInTheDocument();
    expect(props.client.artifact).not.toHaveBeenCalled();
    expect(props.client.approve).not.toHaveBeenCalled();
    expect(props.client.assistantResume).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(2);
  });
  it('mounts near the selected Goal status without changing command or Assistant calls', async () => {
    const props = fixture(),
      projection = goalViewProjection();
    projection.snapshot.run.finalArtifact = null;
    projection.snapshot.stages = [];
    props.client.list = vi.fn().mockResolvedValue({ workflows: [projection.snapshot] });
    props.client.read = vi.fn().mockResolvedValue({ workflow: projection.snapshot });
    render(
      <WorkflowV2Surface
        client={props.client}
        ownerUserId={owner}
        authScopeKey={props.authScopeKey}
        routeSearch={`?run=${id(2)}`}
      />
    );
    await screen.findByRole('region', { name: 'Goal Workflow and Outputs' });
    await waitFor(() => expect(props.client.goalWorkflowView).toHaveBeenCalledTimes(1));
    expect(props.client.artifact).not.toHaveBeenCalled();
    expect(props.client.approve).not.toHaveBeenCalled();
    expect(props.client.assistantResume).not.toHaveBeenCalled();
  });
});
