import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SolutionFailureProbe from './SolutionFailureProbe.jsx';

const revision = {
  id: 'revision',
  rowVersion: 3,
  version: 2,
  workflowHash: 'a'.repeat(64),
  bundleHash: 'b'.repeat(64),
};
const receipt = (extra = {}) => ({
  id: 'probe',
  revisionId: revision.id,
  sourceRowVersion: 3,
  sourceVersion: 2,
  workflowHash: revision.workflowHash,
  bundleHash: revision.bundleHash,
  coverage: 'handler_with_synthetic_failure',
  status: 'succeeded',
  cleanupState: 'removed',
  ...extra,
});
function setup({ probes = [], ...props } = {}) {
  const client = {
    solutionFailureProbes: vi.fn().mockResolvedValue({ allowed: true, probes }),
    testSolutionFailureHandler: vi.fn().mockResolvedValue({ probe: receipt() }),
    reconcileSolutionFailureProbe: vi
      .fn()
      .mockResolvedValue({ probe: receipt({ status: 'outcome_unknown' }) }),
  };
  const onBusyChange = vi.fn();
  const all = { client, solutionId: 'solution', revision, onBusyChange, ...props };
  const view = render(<SolutionFailureProbe {...all} />);
  return { ...all, ...view };
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: /Error-handler check/ }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Test error handler' })).toBeEnabled()
  );
}
async function confirm() {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Test error handler' }));
  fireEvent.click(screen.getByRole('button', { name: 'Run isolated handler test' }));
}
describe('isolated handler check', () => {
  it('keeps optional controls collapsed and runs only after exact-version consent', async () => {
    const f = setup();
    expect(screen.queryByRole('button', { name: 'Test error handler' })).not.toBeInTheDocument();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Test error handler' }));
    expect(f.client.testSolutionFailureHandler).not.toHaveBeenCalled();
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(/Your main workflow is not run or changed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run isolated handler test' }));
    await screen.findByText(/Handler ran successfully/);
    expect(f.client.testSolutionFailureHandler).toHaveBeenCalledWith(
      'solution',
      'revision',
      {
        expectedVersion: 3,
        workflowHash: revision.workflowHash,
        bundleHash: revision.bundleHash,
        confirmSyntheticFailure: true,
      },
      expect.any(String)
    );
    await waitFor(() => expect(f.onBusyChange).toHaveBeenLastCalledWith(false));
    expect(
      screen.getByText(/not your main workflow, a provider connection or delivery/)
    ).toBeInTheDocument();
  });
  it('releases ownership on cancellation without dispatching', async () => {
    const f = setup();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Test error handler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(f.client.testSolutionFailureHandler).not.toHaveBeenCalled();
  });
  it('blocks duplicate dispatch and holds the candidate while awaiting n8n', async () => {
    let resolve;
    const f = setup();
    f.client.testSolutionFailureHandler.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    await confirm();
    expect(screen.getByRole('button', { name: 'Testing handler…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Testing handler…' }));
    expect(f.client.testSolutionFailureHandler).toHaveBeenCalledTimes(1);
    expect(f.onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => resolve({ probe: receipt() }));
    expect(f.onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it('never exposes runtime errors, resends automatically, or clears ambiguity using an older passed test', async () => {
    const f = setup({ probes: [receipt({ id: 'older-pass' })] });
    f.client.testSolutionFailureHandler.mockRejectedValue(new Error('private-runtime-details'));
    await confirm();
    await screen.findByText(/result could not be confirmed/);
    expect(screen.queryByText('private-runtime-details')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test error handler' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Check test status' }));
    await waitFor(() => expect(f.client.solutionFailureProbes).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Test error handler' })).toBeDisabled();
    expect(f.client.testSolutionFailureHandler).toHaveBeenCalledTimes(1);
  });
  it('rejects a successful result from a different source without showing a pass', async () => {
    const f = setup();
    f.client.testSolutionFailureHandler.mockResolvedValue({
      probe: receipt({ bundleHash: 'f'.repeat(64) }),
    });
    await confirm();
    await screen.findByText(/result could not be confirmed/);
    expect(screen.queryByText(/Handler ran successfully/)).not.toBeInTheDocument();
  });
  it('reconciles cleanup without transforming unknown execution evidence into success', async () => {
    const unknown = receipt({
      status: 'outcome_unknown',
      cleanupState: 'unknown',
      canReconcile: true,
    });
    const f = setup({ probes: [unknown] });
    fireEvent.click(screen.getByRole('button', { name: /Error-handler check/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve temporary cleanup' }));
    await screen.findByText(/Handler result is unknown.*Temporary workflows removed/);
    expect(f.client.reconcileSolutionFailureProbe).toHaveBeenCalledWith(
      'solution',
      'revision',
      'probe'
    );
    expect(f.client.testSolutionFailureHandler).not.toHaveBeenCalled();
    expect(screen.queryByText(/Handler ran successfully/)).not.toBeInTheDocument();
  });
  it('allows cleanup of an older draft source without attributing its result to the new graph', async () => {
    const old = receipt({
      sourceRowVersion: 1,
      workflowHash: 'e'.repeat(64),
      status: 'outcome_unknown',
      cleanupState: 'unknown',
      canReconcile: true,
    });
    const f = setup({ probes: [old] });
    f.client.reconcileSolutionFailureProbe.mockResolvedValue({
      probe: { ...old, cleanupState: 'removed', canReconcile: false },
    });
    fireEvent.click(screen.getByRole('button', { name: /Error-handler check/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve temporary cleanup' }));
    await waitFor(() => expect(f.client.reconcileSolutionFailureProbe).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Handler ran successfully/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Handler result is unknown/)).not.toBeInTheDocument();
  });
  it('disables testing when the environment is not capable and exposes the reason', async () => {
    const f = setup();
    f.client.solutionFailureProbes.mockResolvedValue({
      allowed: false,
      probes: [],
      reason: 'Outgoing handlers need a separate service test.',
    });
    fireEvent.click(screen.getByRole('button', { name: /Error-handler check/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check test status' }));
    await screen.findByText('Outgoing handlers need a separate service test.');
    expect(screen.getByRole('button', { name: 'Test error handler' })).toBeDisabled();
  });
});
