import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowV2Surface } from './WorkflowV2.jsx';
const state = vi.hoisted(() => ({ childProps: null, nextWorkflow: null }));
vi.mock('@clerk/react', () => ({
  UserButton: () => null,
  SignIn: () => null,
  useAuth: () => ({}),
}));
vi.mock('./GoalWorkflowOutputs.jsx', () => ({
  GoalWorkflowOutputs: () => <div>Metadata outputs</div>,
}));
vi.mock('./CapabilityWorkPanel.jsx', () => ({
  CapabilityWorkPanel: (props) => {
    state.childProps = props;
    return <button onClick={() => props.onWorkflow(state.nextWorkflow)}>Capability child</button>;
  },
}));
const runId = '00000000-0000-4000-8000-000000000902',
  ownerUserId = 'user_capabilityfixture';
const ref = (kind) => ({
  artifactId:
    kind === 'scope'
      ? '00000000-0000-4000-8000-000000000101'
      : '00000000-0000-4000-8000-000000000102',
  artifactHash: 'a'.repeat(64),
  kind,
});
function workflow(status = 'awaiting_capability_input') {
  return {
    run: {
      id: runId,
      tenantId: '00000000-0000-4000-8000-000000000901',
      ownerUserId,
      ownerOrganizationId: null,
      mode: 'simple',
      status,
      request: 'Synthetic purpose',
      requestHash: 'a'.repeat(64),
      rowVersion: 4,
      evidenceReadiness: null,
      finalArtifact: status === 'completed' ? ref('simulation') : null,
      workProfile: {
        type: 'capability_work_v1',
        capability: 'SimulateV1',
        purpose: 'Synthetic purpose',
        allowSimulationAnalysis: true,
        compilerNoticeVersion: 'google-scope-compiler-v1',
      },
    },
    stages: [
      {
        id: 'scope',
        kind: 'compile_scope',
        stageKey: 'capability-compile-scope',
        status: 'completed',
        ordinal: 10,
        rowVersion: 2,
        inputHash: 'a'.repeat(64),
        outputArtifact: ref('scope'),
      },
      {
        id: 'gate',
        kind: 'gate_1',
        stageKey: 'capability-scope-approval',
        status: status === 'awaiting_gate_1' ? 'awaiting_approval' : 'completed',
        ordinal: 20,
        rowVersion: 2,
        inputHash: 'a'.repeat(64),
        outputArtifact: null,
      },
    ],
    attempts: [],
    dependencies: [],
    approvals: [],
  };
}
function client(configured, selected) {
  return {
    capabilityWorkConfiguration: vi.fn(async () => ({ configured })),
    session: vi.fn(),
    list: vi.fn(async () => ({ workflows: [] })),
    read: vi.fn(async () => ({ workflow: selected })),
    artifact: vi.fn(),
    approve: vi.fn(),
    start: vi.fn(),
  };
}
async function mount(api, { selected = false, scope = 'session-a' } = {}) {
  window.history.replaceState({}, '', selected ? `/?run=${runId}` : '/');
  await act(async () => {
    render(
      <WorkflowV2Surface client={api} ownerUserId={ownerUserId} authScopeKey={scope} embedded />
    );
  });
}
afterEach(() => {
  vi.useRealTimers();
  state.childProps = null;
  state.nextWorkflow = null;
  window.history.replaceState({}, '', '/');
});
describe('capability parent integration', () => {
  it('keeps capability actions absent unless authenticated configuration explicitly enables them', async () => {
    const api = client(false);
    await mount(api);
    expect(screen.queryByRole('button', { name: 'Capability child' })).toBeNull();
    expect(api.capabilityWorkConfiguration).toHaveBeenCalledOnce();
    expect(api.session).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
  });
  it('passes exact owner/session context and accepts only a capability-owned child result', async () => {
    const api = client(true);
    await mount(api);
    expect(state.childProps.ownerUserId).toBe(ownerUserId);
    expect(state.childProps.authScopeKey).toBe('session-a');
    state.nextWorkflow = workflow();
    fireEvent.click(screen.getByRole('button', { name: 'Capability child' }));
    expect(window.location.search).toContain(`run=${runId}`);
    expect(state.childProps.workflow.run.id).toBe(runId);
    expect(api.artifact).not.toHaveBeenCalled();
  });
  it.each(['awaiting_gate_1', 'awaiting_capability_input', 'completed'])(
    'does not auto-read bodies or invoke legacy approvals for %s capability work',
    async (status) => {
      vi.useFakeTimers();
      const api = client(true, workflow(status));
      await mount(api, { selected: true });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(api.read).toHaveBeenCalledOnce();
      expect(api.artifact).not.toHaveBeenCalled();
      expect(api.approve).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /^Approve scope$/i })).toBeNull();
      expect(state.childProps.workflow.run.status).toBe(status);
    }
  );
  it('preserves metadata output access when the feature is disabled', async () => {
    const api = client(false, workflow('completed'));
    await mount(api, { selected: true });
    expect(screen.getByText(/Capability work is not configured/)).toBeTruthy();
    expect(screen.getByText('Metadata outputs')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Capability child' })).toBeNull();
    expect(api.artifact).not.toHaveBeenCalled();
  });
});
