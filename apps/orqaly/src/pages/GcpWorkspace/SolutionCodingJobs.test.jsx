import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SolutionCodingJobs from './SolutionCodingJobs.jsx';

const solution = { id: 'solution-one' }, runId = 'run-one';
const source = [{ path: 'src/add.mjs', content: 'export const add=(a,b)=>a-b;' }];
const prepared = [{ path: 'src/add.mjs', content: 'export const add=(a,b)=>a+b;' }];
const initial = { id: 'job-one', title: 'Fix addition', status: 'proposed', rowVersion: 0, specHash: 'a'.repeat(64),
  spec: { source, changes: prepared, tests: [{ path: 'add.test.mjs', content: 'assert.equal(add(2,3),5)' }], limits: { timeoutMs: 30000 } } };
function setup(value = initial) {
  let job = structuredClone(value);
  const client = {
    listSolutionCodingJobs: vi.fn(async () => ({ jobs: [structuredClone(job)] })),
    readSolutionCodingJob: vi.fn(async () => ({ job: structuredClone(job) })),
    approveSolutionCodingJob: vi.fn(async () => { job = { ...job, status: 'approved', rowVersion: 1 }; return { job }; }),
    runSolutionCodingJob: vi.fn(async () => { job = { ...job, status: 'queued', rowVersion: 2 }; return { job }; }),
    cancelSolutionCodingJob: vi.fn(), reconcileSolutionCodingJob: vi.fn(),
  };
  return client;
}
describe('Solution coding jobs: actual approval and artifact controls', () => {
  it('requires exact file/test review and separate approve then native n8n launch', async () => {
    const client = setup(); render(<SolutionCodingJobs client={client} solution={solution} runId={runId} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review files for Fix addition' }));
    const approve = await screen.findByRole('button', { name: 'Approve this coding job' });
    expect(approve).toBeDisabled(); expect(client.runSolutionCodingJob).not.toHaveBeenCalled();
    const checkbox = screen.getByRole('checkbox', { name: 'I reviewed these exact changes, tests and limits.' });
    act(() => checkbox.focus()); expect(checkbox).toHaveFocus(); fireEvent.click(checkbox);
    fireEvent.click(approve);
    const run = await screen.findByRole('button', { name: 'Run via n8n' });
    expect(client.approveSolutionCodingJob).toHaveBeenCalledWith(solution.id, 'job-one', { runId, expectedVersion: 0, specHash: 'a'.repeat(64) }, expect.any(String));
    expect(client.runSolutionCodingJob).not.toHaveBeenCalled(); fireEvent.click(run);
    await waitFor(() => expect(client.runSolutionCodingJob).toHaveBeenCalledWith(solution.id, 'job-one', { runId, expectedVersion: 1, specHash: 'a'.repeat(64) }, expect.any(String)));
    expect(await screen.findByText(/This continues with the browser closed/)).toBeInTheDocument();
  });
  it('keeps unknown outcomes blocked and offers cleanup, never a fabricated success', async () => {
    const client = setup({ ...initial, status: 'outcome_unknown', evidence: { cleanup: { status: 'pending' }, command: { exitCode: null } } });
    render(<SolutionCodingJobs client={client} solution={solution} runId={runId} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review files for Fix addition' }));
    expect(await screen.findByRole('button', { name: 'Check & clean up sandbox' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run via n8n' })).not.toBeInTheDocument();
    expect(screen.getByText(/Exit code: not reported/)).toBeInTheDocument();
  });
  it('shows real files and command evidence after reload, not simulation output', async () => {
    const client = setup({ ...initial, status: 'succeeded', evidence: { cleanup: { status: 'removed' }, command: { exitCode: 0 }, log: 'actual TAP output' },
      artifacts: [{ path: 'src/add.mjs', content: prepared[0].content, hash: 'b'.repeat(64), bytes: 30 }] });
    render(<SolutionCodingJobs client={client} solution={solution} runId={runId} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review files for Fix addition' }));
    expect(await screen.findByRole('button', { name: 'Download src/add.mjs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Actual test output')).toHaveTextContent('actual TAP output');
    expect(screen.getByText(/Automatic Agent preparation and GitHub publishing are not connected/)).toBeInTheDocument();
  });
  it('does not offer automatic retry after uncertain launch, and renders safe errors', async () => {
    const client = setup({ ...initial, status: 'approved' });
    client.runSolutionCodingJob.mockRejectedValue(new Error('secret internal error'));
    render(<SolutionCodingJobs client={client} solution={solution} runId={runId} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review files for Fix addition' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run via n8n' }));
    expect(await screen.findByText(/The result could not be confirmed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run via n8n' })).toBeDisabled();
    expect(screen.queryByText('secret internal error')).not.toBeInTheDocument();
  });
  it('clears source and approval on Solution changes and ignores stale responses', async () => {
    const client = setup(); let finish;
    client.readSolutionCodingJob.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<SolutionCodingJobs client={client} solution={solution} runId={runId} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review files for Fix addition' }));
    client.listSolutionCodingJobs.mockResolvedValue({ jobs: [] });
    view.rerender(<SolutionCodingJobs client={client} solution={{ id: 'solution-two' }} runId="run-two" />);
    finish({ job: initial });
    expect(await screen.findByText('No coding proposal has been prepared for this task yet.')).toBeInTheDocument();
    expect(screen.queryByText('Original source')).not.toBeInTheDocument();
  });
});
