import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ActivityPage from './ActivityPage.jsx';
import AgentsPage from './AgentsPage.jsx';
import CapabilitiesPage from './CapabilitiesPage.jsx';
import HistoryPage from './HistoryPage.jsx';
import HomePage from './HomePage.jsx';
import KnowledgePage from './KnowledgePage.jsx';
import NotificationsPage from './NotificationsPage.jsx';
import ResultsPage from './ResultsPage.jsx';
import StructurePage from './StructurePage.jsx';
import {
  normalizeDelegatedAgents,
  normalizeOverview,
  normalizeWorkspace,
} from './workspaceViewModel.js';

const hookState = vi.hoisted(() => ({ current: null }));
const clerkState = vi.hoisted(() => ({
  current: { isLoaded: true, user: { firstName: 'Mara' } },
  auth: { getToken: vi.fn().mockResolvedValue('verified-clerk-jwt') },
}));
const agentApi = vi.hoisted(() => ({
  client: {
    agentRuntimeStatus: vi.fn(),
    createAgent: vi.fn(),
    changeAgentLifecycle: vi.fn(),
  },
  createClient: vi.fn(),
}));
vi.mock('./useWorkspaceData.js', () => ({
  useWorkspaceData: () => hookState.current,
}));
vi.mock('@clerk/react', () => ({
  useUser: () => clerkState.current,
  useAuth: () => clerkState.auth,
}));
vi.mock('../../workflow-v2/api.js', () => ({
  createWorkflowV2Client: (...args) => agentApi.createClient(...args),
}));
vi.mock('../../components/Common/LineOrb.jsx', () => ({
  default: () => <div role="img" aria-label="Orqanix assistant" />,
}));

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const RESULT_ID = '20000000-0000-4000-8000-000000000002';
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

function fixtureState() {
  return {
    loading: false,
    error: null,
    refresh: vi.fn(),
    workspace: normalizeWorkspace({
      workspace: {
        displayName: 'Personal workspace',
        status: 'ready',
        agentCount: 1,
        activeAgentCount: 1,
        capabilityCount: 2,
        toolCount: 1,
      },
      agents: [
        {
          id: 'agent-1',
          name: 'Research lead',
          status: 'active',
          capabilities: ['research', 'evidence_synthesis'],
          toolIds: ['search'],
        },
      ],
      capabilities: [
        { name: 'research', agentCount: 1 },
        { name: 'evidence_synthesis', agentCount: 1 },
      ],
    }),
    delegatedAgents: normalizeDelegatedAgents({
      agents: [
        {
          id: 'delegated-agent-1',
          runId: RUN_ID,
          threadId: 'thread-1',
          name: 'Launch readiness Agent',
          task: 'Prepare the launch evidence and stop at approval gates.',
          lifetime: 'persistent',
          status: 'active',
          executorPersona: {
            role: 'task_executor',
            version: 'axwise_executor_persona_v1',
            provider: 'axwise',
            status: 'contract_bound',
          },
          memoryScope: { kind: 'thread_and_goal', label: 'This chat and Goal only' },
          runtime: {
            provider: 'orqaly_workflow_v2',
            label: 'Orqaly GCP + AxWise',
            isolation: 'tenant_user',
          },
          capabilities: {
            research: true,
            planning: true,
            artifactProduction: true,
            approvalGates: true,
            externalActions: false,
          },
          toolExecution: { status: 'not_configured', provider: null },
          updatedAt: '2026-09-01T09:00:00.000Z',
        },
      ],
    }),
    overview: normalizeOverview({
      counts: { total: 2, active: 1, awaitingApproval: 1, completed: 1, attention: 1 },
      threads: [
        {
          id: 'thread-1',
          title: 'Launch discussion',
          status: 'active',
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      ],
      workflows: [
        {
          id: RUN_ID,
          title: 'Prepare launch evidence',
          mode: 'advanced',
          status: 'awaiting_gate_1',
          updatedAt: '2026-09-01T09:00:00.000Z',
          finalArtifact: null,
        },
        {
          id: RESULT_ID,
          title: 'Completed market brief',
          mode: 'simple',
          status: 'completed',
          updatedAt: '2026-09-01T08:00:00.000Z',
          evidenceReadiness: 'ready',
          finalArtifact: {
            artifactId: 'artifact-1',
            artifactHash: 'a'.repeat(64),
            kind: 'final_markdown',
          },
        },
      ],
      results: [
        {
          runId: RESULT_ID,
          title: 'Completed market brief',
          status: 'completed',
          completedAt: '2026-09-01T08:00:00.000Z',
          evidenceReadiness: 'ready',
          artifact: {
            artifactId: 'artifact-1',
            artifactHash: 'a'.repeat(64),
            kind: 'final_markdown',
          },
        },
      ],
      notifications: [
        {
          id: `${RUN_ID}:awaiting_gate_1`,
          kind: 'approval_required',
          severity: 'action',
          title: 'Scope approval required',
          message: 'Prepare launch evidence is waiting for scope approval.',
          runId: RUN_ID,
          occurredAt: '2026-09-01T09:00:00.000Z',
        },
      ],
      activity: [
        {
          id: 'event-1',
          runId: RUN_ID,
          workflowTitle: 'Prepare launch evidence',
          kind: 'stage_completed',
          label: 'Research completed',
          occurredAt: '2026-09-01T08:30:00.000Z',
        },
      ],
    }),
  };
}

function renderPage(element, path = '/') {
  return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
}

beforeEach(() => {
  hookState.current = fixtureState();
  agentApi.createClient.mockReset().mockReturnValue(agentApi.client);
  agentApi.client.agentRuntimeStatus.mockReset().mockReturnValue(new Promise(() => {}));
  agentApi.client.createAgent.mockReset().mockResolvedValue({});
  agentApi.client.changeAgentLifecycle.mockReset().mockResolvedValue({});
});

describe('GCP workspace pages', () => {
  it('renders a useful Home projection with live workspace metrics and recent work', () => {
    renderPage(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Personal workspace')).toBeInTheDocument();
    expect(screen.getByText('Launch discussion')).toBeInTheDocument();
    expect(screen.getByText('Prepare launch evidence')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New chat' })).toHaveAttribute('href', '/assistant');
    expect(screen.getByRole('link', { name: 'View workspace' })).toHaveAttribute(
      'href',
      '/workspace'
    );
  });

  it.each([
    ['Workspace', StructurePage, 'Workspace', 'Research lead'],
    ['Agents', AgentsPage, 'Agents', 'Launch readiness Agent'],
    ['Capabilities', CapabilitiesPage, 'Capabilities', 'Research'],
  ])('renders the %s page from the GCP workspace projection', (_label, Page, heading, evidence) => {
    renderPage(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByText(evidence)).toBeInTheDocument();
  });

  it.each([
    [
      'Workspace',
      StructurePage,
      /Your sign-in is linked to your personal Orqanix workspace/u,
      /App-owned units, memberships, groups, and role controls/u,
    ],
    [
      'Agents',
      AgentsPage,
      /Create a named persistent Agent independently of a Goal/u,
      /Enable each external connector only after its exact permission/u,
    ],
    ['Results', ResultsPage, /Review completed Goal outcomes/u, /Add a dedicated artifact viewer/u],
    [
      'History',
      HistoryPage,
      /Browse persisted Assistant chats/u,
      /Add pagination beyond the current recent 50-record projection/u,
    ],
    [
      'Notifications',
      NotificationsPage,
      /See the live in-app queue/u,
      /Add read and unread state, dismissal, and persistent delivery history/u,
    ],
    [
      'Capabilities',
      CapabilitiesPage,
      /Published capability catalogue/u,
      /Personal Catalog installs/u,
    ],
    [
      'Knowledge Storage',
      KnowledgePage,
      /Immutable final Goal artifacts/u,
      /Tenant document upload/u,
    ],
    [
      'Activity & Usage',
      ActivityPage,
      /Tenant-scoped workflow events/u,
      /Aggregate token and tool totals/u,
    ],
  ])(
    'marks %s as in progress and distinguishes live from remaining work',
    (name, Page, live, remaining) => {
      renderPage(<Page />);
      expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument();
      if (name === 'Agents')
        fireEvent.click(
          screen.getByRole('button', { name: 'Technical details · n8n & planning specialists' })
        );
      const notice = screen.getByRole('complementary', {
        name: 'Feature implementation status',
      });
      expect(within(notice).getByText('In progress')).toBeVisible();
      expect(within(notice).getByRole('region', { name: 'Available now' })).toHaveTextContent(live);
      expect(within(notice).getByRole('region', { name: 'Still to implement' })).toHaveTextContent(
        remaining
      );
    }
  );

  it('shows task-spawned Agents before the AxWise planning specialist catalogue', async () => {
    agentApi.client.agentRuntimeStatus.mockResolvedValueOnce(LOCKED_RUNTIME);
    renderPage(<AgentsPage />);

    const sections = screen.getAllByRole('heading', { level: 2 });
    expect(sections.map((heading) => heading.textContent)).toEqual(['Your Agents']);
    expect(screen.queryByRole('list', { name: 'Agent execution readiness flow' })).toBeNull();
    expect(screen.queryByText(/dispatch-locked/u)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Profile & permissions' }));
    const delegatedAgentCard = screen.getByText('Launch readiness Agent').closest('li');
    expect(delegatedAgentCard).not.toBeNull();
    expect(screen.getAllByText('Persistent')).toHaveLength(1);
    expect(within(delegatedAgentCard).getByText('Active')).toBeInTheDocument();
    expect(
      screen.getByText(/Task executor · Reasoning service · axwise_executor_persona_v1 · Contract bound/u)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Tenant + user')).toHaveLength(1);
    expect(screen.getByText('Gated until a reviewed connector is enabled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Give work' })).toHaveAttribute(
      'href',
      '/assistant?agent=delegated-agent-1'
    );
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/agent-hub/delegated-agent-1'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Technical details · n8n & planning specialists' })
    );
    const flow = screen.getByRole('list', { name: 'Agent execution readiness flow' });
    expect(within(flow).getAllByRole('listitem')).toHaveLength(8);
    await waitFor(() =>
      expect(
        within(flow).getByRole('button', { name: /Private self-hosted n8n/u })
      ).toHaveTextContent('Locked')
    );
    expect(screen.getByText('Research lead')).toBeInTheDocument();
  });

  it('retries only the Agent runtime readiness check after a fail-closed error', async () => {
    agentApi.client.agentRuntimeStatus
      .mockRejectedValueOnce(new Error('Runtime status unavailable.'))
      .mockResolvedValueOnce(LOCKED_RUNTIME);
    renderPage(<AgentsPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Technical details · n8n & planning specialists' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/Runtime status unavailable/u);
    fireEvent.click(screen.getByRole('button', { name: 'Retry runtime check' }));

    await waitFor(() => expect(agentApi.client.agentRuntimeStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status')).toHaveTextContent(/External execution: locked/u);
    expect(hookState.current.refresh).not.toHaveBeenCalled();
  });

  it('keeps Knowledge honest while exposing real immutable Goal artifacts', () => {
    renderPage(<KnowledgePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Knowledge Storage' })
    ).toBeInTheDocument();
    expect(screen.getByText('Completed market brief')).toBeInTheDocument();
  });

  it('renders completed results with evidence and immutable artifact identity', () => {
    renderPage(<ResultsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Results' })).toBeInTheDocument();
    expect(screen.getByText('Completed market brief')).toBeInTheDocument();
    expect(screen.getByText(/sha256:a{8}…a{4}/u)).toBeInTheDocument();
  });

  it('shows each server notification once and links it to the exact Goal', () => {
    renderPage(<NotificationsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getAllByText('Scope approval required')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      `/goals?run=${RUN_ID}`
    );
  });

  it('renders the real activity projection and labels missing aggregate usage honestly', () => {
    renderPage(<ActivityPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Activity & Usage' })).toBeInTheDocument();
    expect(screen.getByText('Research completed')).toBeInTheDocument();
  });

  it('switches History projections by canonical retained route', () => {
    render(
      <MemoryRouter initialEntries={['/history/results']}>
        <Routes>
          <Route path="/history/:kind" element={<HistoryPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Results & Artifacts' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Open result' })).toHaveAttribute(
      'href',
      `/goals?run=${RESULT_ID}`
    );
  });

  it('renders actionable empty states rather than invented records', () => {
    hookState.current = {
      ...fixtureState(),
      overview: normalizeOverview(),
      workspace: normalizeWorkspace({
        workspace: { displayName: 'Personal workspace', status: 'ready' },
      }),
    };
    renderPage(<NotificationsPage />);
    expect(screen.getByText("You're caught up")).toBeInTheDocument();
  });
});
