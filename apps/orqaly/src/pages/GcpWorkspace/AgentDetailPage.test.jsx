import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentDetailPage from './AgentDetailPage.jsx';

const h = vi.hoisted(() => ({
  getToken: vi.fn(),
  createClient: vi.fn(),
  client: {
    agent: vi.fn(),
    agentRuns: vi.fn(),
    agentSolutions: vi.fn().mockResolvedValue({ solutions: [], environmentAvailable: false }),
    createSolutionBuildRequest: vi.fn(),
    agentRuntimeStatus: vi.fn(),
    updateAgentProfile: vi.fn(),
    changeAgentLifecycle: vi.fn(),
  },
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: h.getToken }),
}));
vi.mock('../../workflow-v2/api.js', () => ({
  createWorkflowV2Client: (...args) => h.createClient(...args),
}));

const AGENT_ID = '10000000-0000-4000-8000-000000000010';
const CONTROL_PLANE_RUN_ID = '20000000-0000-4000-8000-000000000020';
const WORKFLOW_RUN_ID = '30000000-0000-4000-8000-000000000030';
const LOCKED_RUNTIME = {
  version: 'orqaly_agent_runtime_status_v1',
  configured: true,
  status: 'identity_ready_execution_locked',
  controlPlane: { service: 'orqaly-agentic-control-plane', status: 'ready' },
  execution: {
    enabled: false,
    connected: false,
    status: 'release_gated',
    provider: 'n8n',
    mode: 'self_hosted',
  },
};

function agentResponse(overrides = {}) {
  return {
    agent: {
      id: AGENT_ID,
      agentKind: 'persistent',
      state: 'active',
      version: 4,
      createdFrom: 'manual',
      currentProfile: {
        versionNumber: 2,
        contentHash: 'c'.repeat(64),
        profile: {
          version: 'orqaly_agent_profile_input_v1',
          displayName: 'Mara Ops',
          roleLabel: 'Operations lead',
          description: 'Owns recurring operational work.',
          instructions: 'Keep each assignment scoped and request exact approval.',
          avatar: { kind: 'icon', value: 'bolt', color: '#3559E0' },
        },
      },
      updatedAt: '2026-09-04T09:00:00.000Z',
      ...overrides,
    },
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/agent-hub/${AGENT_ID}`]}>
      <Routes>
        <Route path="/agent-hub/:agentId" element={<AgentDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.getToken.mockReset().mockResolvedValue('verified-clerk-jwt');
  h.createClient.mockReset().mockReturnValue(h.client);
  h.client.agent.mockReset().mockResolvedValue(agentResponse());
  h.client.agentRuns.mockReset().mockResolvedValue({
    runs: [
      {
        id: CONTROL_PLANE_RUN_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        title: 'Prepare launch operations',
        state: 'running',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
    ],
  });
  h.client.agentRuntimeStatus.mockReset().mockResolvedValue(LOCKED_RUNTIME);
  h.client.createSolutionBuildRequest.mockReset();
  h.client.updateAgentProfile.mockReset();
  h.client.changeAgentLifecycle
    .mockReset()
    .mockResolvedValue(agentResponse({ state: 'paused', version: 5 }));
});

describe('Agent detail page', () => {
  it('describes native workflow capabilities without claiming unrestricted or automatic coding', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Mara Ops' })).toBeInTheDocument();
    await screen.findByText(/No workflows yet/u);
    expect(screen.queryByText(/Current executable capability: webhook field mapping/u)).toBeNull();
    expect(screen.getByRole('button', { name: 'Turn into workflow' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Turn into workflow' }));
    const instruction = screen.getByRole('form', { name: 'Prepare workflow draft' });
    expect(instruction).toHaveTextContent(
      'Your task and evidence provide context. Building a draft does not deploy it or authorize live actions.'
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.client.createSolutionBuildRequest).not.toHaveBeenCalled();
  });

  it('loads one tenant-scoped Agent and renders identity, runs, and execution architecture', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Mara Ops' })).toBeInTheDocument();
    expect(h.client.agent).toHaveBeenCalledWith(AGENT_ID);
    expect(h.client.agentRuns).toHaveBeenCalledWith(AGENT_ID, { limit: 50 });
    expect(screen.getByText('Operations lead')).toBeInTheDocument();
    expect(screen.getByText('Profile v2')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Agent execution readiness flow' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Tasks & results' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Profile, instructions & memory' }));
    expect(screen.getByText(/Keep each assignment scoped/u)).toBeInTheDocument();
    expect(screen.getByText('Prepare launch operations')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review task' })).toHaveAttribute(
      'href',
      `/goals?run=${WORKFLOW_RUN_ID}`
    );
    expect(screen.getByRole('link', { name: 'Review task' })).not.toHaveAttribute(
      'href',
      `/goals?run=${CONTROL_PLANE_RUN_ID}`
    );
    expect(h.client.agentRuntimeStatus).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole('button', { name: 'Technical details · n8n execution readiness' })
    );
    const flow = screen.getByRole('list', { name: 'Agent execution readiness flow' });
    expect(screen.getByRole('status')).toHaveTextContent(/External execution: locked/u);
    expect(screen.getByRole('region', { name: 'Private self-hosted n8n' })).toHaveTextContent(
      /release gated.*treated as locked/iu
    );
    const profileStep = screen.getByRole('button', { name: /Agent profile/u });
    expect(profileStep).toHaveTextContent('Live');
    expect(screen.getByRole('button', { name: /Orqaly Goal workflow/u })).toHaveTextContent(
      'Run recorded'
    );
    fireEvent.click(profileStep);
    expect(screen.getByRole('region', { name: 'Agent profile' })).toHaveTextContent(
      /Profile v2 for Mara Ops/u
    );
    expect(within(flow).getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByRole('link', { name: 'Give work' })).toHaveAttribute(
      'href',
      `/assistant?agent=${AGENT_ID}`
    );
  });

  it('keeps Agent data visible while retrying a failed runtime check', async () => {
    h.client.agentRuntimeStatus
      .mockRejectedValueOnce(new Error('Runtime status unavailable.'))
      .mockResolvedValueOnce(LOCKED_RUNTIME);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Mara Ops' })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Technical details · n8n execution readiness' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/Runtime status unavailable/u);
    fireEvent.click(screen.getByRole('button', { name: 'Retry runtime check' }));

    await waitFor(() => expect(h.client.agentRuntimeStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status')).toHaveTextContent(/External execution: locked/u);
    expect(h.client.agent).toHaveBeenCalledOnce();
    expect(h.client.agentRuns).toHaveBeenCalledOnce();
  });

  it('routes a lifecycle pause through the Agent version boundary', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '30000000-0000-4000-8000-000000000030' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause new assignments' }));

    await waitFor(() =>
      expect(h.client.changeAgentLifecycle).toHaveBeenCalledWith(
        AGENT_ID,
        4,
        expect.objectContaining({
          version: 'orqaly_agent_lifecycle_request_v1',
          action: 'pause',
          idempotencyKey: 'agent-pause-30000000-0000-4000-8000-000000000030',
        })
      )
    );
    expect(await screen.findByText('Paused')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
