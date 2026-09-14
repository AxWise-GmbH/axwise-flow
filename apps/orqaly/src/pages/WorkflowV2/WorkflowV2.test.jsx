import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrqalyV2Surface, WorkflowV2Surface } from './WorkflowV2.jsx';

vi.mock('@clerk/react', () => ({
  SignIn: () => <div>Sign in</div>,
  UserButton: () => <div aria-label="User menu" />,
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn() }),
}));

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const RUN_A_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const RUN_B_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SCOPE_HASH = 'a'.repeat(64);
const RESEARCH_HASH = 'b'.repeat(64);
const PLAN_HASH = 'c'.repeat(64);
const FINAL_HASH = 'e'.repeat(64);

const refs = {
  scope: {
    artifactId: '20000000-0000-4000-8000-000000000001',
    artifactHash: SCOPE_HASH,
    kind: 'scope',
  },
  research: {
    artifactId: '20000000-0000-4000-8000-000000000002',
    artifactHash: RESEARCH_HASH,
    kind: 'research',
  },
  plan: {
    artifactId: '20000000-0000-4000-8000-000000000003',
    artifactHash: PLAN_HASH,
    kind: 'plan',
  },
  final: {
    artifactId: '20000000-0000-4000-8000-000000000004',
    artifactHash: FINAL_HASH,
    kind: 'final_markdown',
  },
};

const artifacts = {
  [refs.scope.artifactId]: {
    ...refs.scope,
    payload: {
      objective: 'Launch a trustworthy cat-food product in Estonia.',
      topicAnchors: [{ value: 'cat food' }],
      geography: ['Estonia'],
      deliverables: ['Product requirements document'],
      assumptions: ['Use a bounded Preview research budget.'],
      deliverableProfile: {
        schemaVersion: 'axwise.deliverable-profile.v1',
        artifactType: 'product_prd',
        domain: 'Commercial cat-food launch in Estonia',
        problem: 'Cat owners need a clearly bounded, trustworthy product.',
        desiredOutcome: 'A decision-ready product requirements document.',
        audiences: ['Estonian cat owners', 'Product decision-makers'],
        nonGoals: ['Do not claim launch authority without verified evidence.'],
        requiredSections: ['Acceptance criteria', 'Product requirements'],
      },
      requirements: [
        {
          id: 'req-1111111111111111',
          category: 'deliverable',
          description: 'Product requirements document',
          priority: 'P0',
          authority: 'owner',
        },
        {
          id: 'req-2222222222222222',
          category: 'evidence',
          description: 'Verify pet-food safety requirements.',
          priority: 'P0',
          authority: 'axwise_derived',
        },
      ],
      acceptanceCriteria: [
        {
          id: 'acc-3333333333333333',
          given: 'The accepted scope and immutable research are available.',
          when: 'The product requirements document is evaluated.',
          then: 'Every accepted requirement is satisfied or marked as a gap.',
          supports: ['req-1111111111111111', 'req-2222222222222222'],
        },
      ],
      materialClarification: 'Should the first release cover adult cats only?',
      evidenceRequirements: [
        {
          id: 'safety',
          description: 'Verify pet-food safety requirements.',
          criticality: 'blocking',
          verificationBasis: 'grounded_claims',
          appliesWhen: 'The deliverable makes a market-entry recommendation.',
          acceptedSourceTypes: ['government guidance'],
        },
      ],
      personas: ['Estonian cat owners'],
      interviewRequirements: [],
      prdRequirements: ['Label evidence gaps'],
      limits: ['No payment data'],
      policies: ['Do not claim launch-ready without verified blocking evidence'],
    },
  },
  [refs.research.artifactId]: {
    ...refs.research,
    payload: {
      readiness: 'ready',
      findings: [
        {
          requirementId: 'safety',
          status: 'verified',
          note: 'Verified against an accepted government source.',
        },
      ],
    },
  },
  [refs.plan.artifactId]: {
    ...refs.plan,
    payload: {
      tasks: [
        {
          stageId: '30000000-0000-4000-8000-000000000006',
          stageKey: 'core-product-requirements',
          title: 'Produce the evidence-aware product requirements document',
          taskKind: 'core_draft',
          requiredRole: 'Product requirements lead',
          lens: 'Coherent full-contract product draft',
          requiredCapabilities: ['prd'],
          acceptanceRequirementIds: ['deliverable-001'],
          producesFullContract: true,
          dependsOnStageKeys: [],
          agent: {
            id: '40000000-0000-4000-8000-000000000001',
            name: 'Preview Product Researcher',
            capabilities: ['evidence_synthesis', 'prd'],
            toolIds: ['50000000-0000-4000-8000-000000000001'],
            qualityScoreMicros: 950000,
            costPerRunCents: 25,
          },
          agentId: '40000000-0000-4000-8000-000000000001',
          toolIds: ['50000000-0000-4000-8000-000000000001'],
          budgetCents: 25,
          dataBoundary: ['No payment data'],
        },
      ],
    },
  },
  [refs.final.artifactId]: {
    ...refs.final,
    payload: { schemaVersion: 'axwise.final-markdown.v1', markdown: '# Final artifact' },
    markdown: '# Final artifact',
  },
};

function stage(kind, ordinal, status = 'pending', outputArtifact = null) {
  return {
    id: `30000000-0000-4000-8000-${String(ordinal + 1).padStart(12, '0')}`,
    stageKey: kind,
    kind,
    status,
    ordinal,
    rowVersion: status === 'pending' ? 0 : 1,
    inputHash: null,
    outputArtifact,
  };
}

function workflowAtGate(kind, mode = 'simple') {
  const gate1 = kind === 'scope';
  return {
    run: {
      id: RUN_ID,
      mode,
      status: gate1 ? 'awaiting_gate_1' : 'awaiting_gate_2',
      rowVersion: gate1 ? 2 : 8,
      requestHash: 'd'.repeat(64),
      evidenceReadiness: gate1 ? null : 'ready',
      finalArtifact: null,
    },
    stages: [
      stage('compile_scope', 0, 'completed', refs.scope),
      stage('gate_1', 1, gate1 ? 'awaiting_approval' : 'completed'),
      stage('execute_research', 2, gate1 ? 'pending' : 'completed', gate1 ? null : refs.research),
      stage('planning', 3, gate1 ? 'pending' : 'completed', gate1 ? null : refs.plan),
      stage('gate_2', 4, gate1 ? 'pending' : 'awaiting_approval'),
      stage('execution', 5),
      stage('evaluation', 6),
      stage('synthesis', 7),
    ],
    attempts: [],
    dependencies: [],
    approvals: gate1
      ? []
      : [
          {
            id: '60000000-0000-4000-8000-000000000001',
            kind: 'scope',
            artifact: refs.scope,
            decision: 'approved',
          },
        ],
  };
}

function completedWorkflow() {
  const workflow = workflowAtGate('plan');
  workflow.run = {
    ...workflow.run,
    status: 'completed',
    rowVersion: 20,
    finalArtifact: refs.final,
  };
  workflow.stages = workflow.stages.map((item) => ({
    ...item,
    status: 'completed',
    ...(item.kind === 'synthesis' ? { outputArtifact: refs.final } : {}),
  }));
  return workflow;
}

function workflowForRun(runId, mode = 'simple') {
  const workflow = workflowAtGate('scope', mode);
  return {
    ...workflow,
    run: { ...workflow.run, id: runId },
    stages: workflow.stages.map((item) => ({ ...item })),
    approvals: workflow.approvals.map((item) => ({ ...item })),
  };
}

function runningWorkflow() {
  const workflow = workflowForRun(RUN_ID);
  return {
    ...workflow,
    run: { ...workflow.run, status: 'running', rowVersion: 1 },
    stages: workflow.stages.map((item) =>
      item.kind === 'compile_scope'
        ? { ...item, status: 'running', outputArtifact: null }
        : { ...item, status: 'pending' }
    ),
    approvals: [],
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function clientFor(workflow) {
  return {
    list: vi.fn().mockResolvedValue({ workflows: [] }),
    start: vi.fn().mockResolvedValue({ workflow }),
    read: vi.fn().mockResolvedValue({ workflow }),
    approve: vi.fn().mockResolvedValue({ workflow }),
    reviseScope: vi.fn().mockResolvedValue({ workflow }),
    artifact: vi.fn(async (_runId, artifactId, options) =>
      options?.markdown
        ? { markdown: '# Final artifact', etag: `"sha256-${FINAL_HASH}"` }
        : { artifact: artifacts[artifactId] }
    ),
  };
}

describe('WorkflowV2Surface', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/assistant');
    let sequence = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `70000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the most recently selected run when an older read resolves later', async () => {
    const runA = workflowForRun(RUN_A_ID, 'simple');
    const runB = workflowForRun(RUN_B_ID, 'advanced');
    const readA = deferred();
    const readB = deferred();
    const client = clientFor(runA);
    client.list.mockResolvedValue({ workflows: [runA, runB] });
    client.read.mockImplementation((runId) => (runId === RUN_A_ID ? readA.promise : readB.promise));
    render(<WorkflowV2Surface client={client} />);

    const runAButton = await screen.findByRole('button', { name: /Simple · aaaaaaaa/ });
    const runBButton = screen.getByRole('button', { name: /Advanced · bbbbbbbb/ });
    fireEvent.click(runAButton);
    fireEvent.click(runBButton);

    await act(async () => {
      readB.resolve({ workflow: runB });
      await readB.promise;
    });
    expect(window.location.search).toBe(`?run=${RUN_B_ID}`);
    expect(runBButton).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(new RegExp(`Run ${RUN_B_ID}`))).toBeTruthy();

    await act(async () => {
      readA.resolve({ workflow: runA });
      await readA.promise;
    });
    expect(window.location.search).toBe(`?run=${RUN_B_ID}`);
    expect(runBButton).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText(new RegExp(`Run ${RUN_A_ID}`))).toBeNull();
  });

  it('opens a newly selected sidebar Goal when only the route query changes', async () => {
    const runA = workflowForRun(RUN_A_ID, 'simple');
    const runB = workflowForRun(RUN_B_ID, 'advanced');
    const client = clientFor(runA);
    client.read.mockImplementation(async (runId) => ({
      workflow: runId === RUN_A_ID ? runA : runB,
    }));
    const view = render(<WorkflowV2Surface client={client} routeSearch={`?run=${RUN_A_ID}`} />);

    expect(await screen.findByText(new RegExp(`Run ${RUN_A_ID}`))).toBeTruthy();
    view.rerender(<WorkflowV2Surface client={client} routeSearch={`?run=${RUN_B_ID}`} />);

    expect(await screen.findByText(new RegExp(`Run ${RUN_B_ID}`))).toBeTruthy();
    expect(screen.queryByText(new RegExp(`Run ${RUN_A_ID}`))).toBeNull();
    expect(client.read).toHaveBeenNthCalledWith(1, RUN_A_ID);
    expect(client.read).toHaveBeenNthCalledWith(2, RUN_B_ID);

    view.rerender(<WorkflowV2Surface client={client} routeSearch="" />);
    expect(await screen.findByLabelText('New workflow composer')).toBeTruthy();
    expect(screen.queryByText(new RegExp(`Run ${RUN_B_ID}`))).toBeNull();
  });

  it('loads the initial legacy window run when routeSearch is omitted', async () => {
    const runA = workflowForRun(RUN_A_ID, 'simple');
    const client = clientFor(runA);
    client.read.mockResolvedValue({ workflow: runA });
    window.history.replaceState(null, '', `/workflows-v2?run=${RUN_A_ID}`);

    render(<WorkflowV2Surface client={client} />);

    expect(await screen.findByText(new RegExp(`Run ${RUN_A_ID}`))).toBeTruthy();
    expect(client.read).toHaveBeenCalledOnce();
    expect(client.read).toHaveBeenCalledWith(RUN_A_ID);
  });

  it('preserves an internally opened Goal while the external route search stays blank', async () => {
    const runA = workflowForRun(RUN_A_ID, 'simple');
    const client = clientFor(runA);
    client.list.mockResolvedValue({ workflows: [runA] });
    client.read.mockResolvedValue({ workflow: runA });
    render(<WorkflowV2Surface client={client} routeSearch="" />);

    fireEvent.click(await screen.findByRole('button', { name: /Simple · aaaaaaaa/ }));

    expect(await screen.findByText(new RegExp(`Run ${RUN_A_ID}`))).toBeTruthy();
    await waitFor(() => expect(client.read).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText('New workflow composer')).toBeNull();
  });

  it('preserves a newly created Goal while the external route search stays blank', async () => {
    const workflow = workflowAtGate('scope');
    const client = clientFor(workflow);
    render(<WorkflowV2Surface client={client} routeSearch="" />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

    expect(
      await screen.findByText('Launch a trustworthy cat-food product in Estonia.')
    ).toBeTruthy();
    expect(screen.queryByLabelText('New workflow composer')).toBeNull();
    expect(client.start).toHaveBeenCalledOnce();
  });

  it('prefills a one-time Goal handoff without starting it', async () => {
    const workflow = workflowAtGate('scope');
    const client = clientFor(workflow);
    const onDraftConsumed = vi.fn();
    const initialDraft = {
      mode: 'goal',
      nonce: 'draft-goal-1',
      text: '  Create a launch plan for Estonia.  ',
    };
    const view = render(
      <WorkflowV2Surface
        client={client}
        routeSearch=""
        initialDraft={initialDraft}
        onDraftConsumed={onDraftConsumed}
      />
    );

    expect(await screen.findByLabelText('Your request')).toHaveValue(
      'Create a launch plan for Estonia.'
    );
    expect(client.start).not.toHaveBeenCalled();
    expect(onDraftConsumed).toHaveBeenCalledOnce();
    expect(onDraftConsumed).toHaveBeenCalledWith('draft-goal-1');

    view.rerender(
      <WorkflowV2Surface
        client={client}
        routeSearch=""
        initialDraft={initialDraft}
        onDraftConsumed={onDraftConsumed}
      />
    );
    expect(onDraftConsumed).toHaveBeenCalledOnce();
  });

  it('consumes but does not apply a Goal handoff when a run is explicitly selected', async () => {
    const workflow = workflowForRun(RUN_A_ID);
    const client = clientFor(workflow);
    const onDraftConsumed = vi.fn();
    render(
      <WorkflowV2Surface
        client={client}
        routeSearch={`?run=${RUN_A_ID}`}
        initialDraft={{
          mode: 'goal',
          nonce: 'draft-goal-2',
          text: 'Do not overwrite this run.',
        }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    expect(await screen.findByText(new RegExp(`Run ${RUN_A_ID}`))).toBeTruthy();
    expect(screen.queryByDisplayValue('Do not overwrite this run.')).toBeNull();
    expect(client.start).not.toHaveBeenCalled();
    expect(onDraftConsumed).toHaveBeenCalledWith('draft-goal-2');
  });

  it('retries a transient polling failure with backoff and recovers the run', async () => {
    vi.useFakeTimers();
    const running = runningWorkflow();
    const recovered = workflowAtGate('scope');
    const client = clientFor(running);
    client.read
      .mockRejectedValueOnce(new Error('temporary workflow read failure'))
      .mockResolvedValueOnce({ workflow: recovered });
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(client.read).toHaveBeenCalledTimes(1);
    expect(screen.getByText('temporary workflow read failure')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3999);
    });
    expect(client.read).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(client.read).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Launch a trustworthy cat-food product in Estonia.')).toBeTruthy();
    expect(screen.queryByText('temporary workflow read failure')).toBeNull();
  });

  it('keeps successfully loaded artifacts when a sibling artifact fails', async () => {
    const workflow = workflowAtGate('plan', 'advanced');
    const client = clientFor(workflow);
    client.artifact.mockImplementation(async (_runId, artifactId) => {
      if (artifactId === refs.scope.artifactId) {
        throw new Error('scope artifact temporarily unavailable');
      }
      return { artifact: artifacts[artifactId] };
    });
    render(<WorkflowV2Surface client={client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

    expect(await screen.findByText('scope artifact temporarily unavailable')).toBeTruthy();
    expect(
      await screen.findByText('All applicable blocking requirements are verified.')
    ).toBeTruthy();
    expect(
      screen.getByText('Produce the evidence-aware product requirements document')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve exact plan artifact' })).not.toBeDisabled();
  });

  it('retries a transient approval-artifact failure without requiring a reload', async () => {
    vi.useFakeTimers();
    const workflow = workflowAtGate('scope');
    const client = clientFor(workflow);
    client.artifact.mockRejectedValueOnce(new Error('scope artifact temporarily unavailable'));
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('scope artifact temporarily unavailable')).toBeTruthy();
    expect(client.artifact).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(client.artifact).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Launch a trustworthy cat-food product in Estonia.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve exact scope artifact' })).not.toBeDisabled();
    expect(screen.queryByText('scope artifact temporarily unavailable')).toBeNull();
  });

  it('retries a transient final-Markdown failure without requiring a reload', async () => {
    vi.useFakeTimers();
    const workflow = completedWorkflow();
    const client = clientFor(workflow);
    client.artifact.mockImplementation(async (_runId, artifactId, options) => {
      if (
        options?.markdown &&
        client.artifact.mock.calls.filter((call) => call[2]?.markdown).length === 1
      ) {
        throw new Error('final Markdown temporarily unavailable');
      }
      return options?.markdown
        ? { markdown: '# Final artifact', etag: `"sha256-${FINAL_HASH}"` }
        : { artifact: artifacts[artifactId] };
    });
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('final Markdown temporarily unavailable')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByTestId('final-markdown')).toHaveTextContent('Final artifact');
    expect(screen.queryByText('final Markdown temporarily unavailable')).toBeNull();
  });

  it('rejects final Markdown whose response ETag does not match the immutable reference', async () => {
    const workflow = completedWorkflow();
    const client = clientFor(workflow);
    client.artifact.mockImplementation(async (_runId, artifactId, options) =>
      options?.markdown
        ? { markdown: '# Untrusted final artifact', etag: `"sha256-${'f'.repeat(64)}"` }
        : { artifact: artifacts[artifactId] }
    );
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

    expect(
      await screen.findByText('The Goal final Markdown hash did not match its immutable reference.')
    ).toBeTruthy();
    expect(screen.queryByTestId('final-markdown')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download .md' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy Goal link for desktop' })).toBeDisabled();
    expect(client.artifact).toHaveBeenCalledWith(RUN_ID, refs.final.artifactId, {
      markdown: true,
      includeMetadata: true,
    });
  });

  it('opens Assistant first and keeps Goals as explicit top-level navigation', async () => {
    const client = clientFor(workflowAtGate('scope'));
    client.assistantThreads = vi.fn().mockResolvedValue({ threads: [] });
    render(<OrqalyV2Surface client={client} />);

    expect(await screen.findByText('What do you want to get done?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Goals' }));
    expect(await screen.findByLabelText('New workflow composer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assistant' })).toBeTruthy();
  });

  it('tracks an externally selected Assistant or Goals route after the first render', async () => {
    const client = clientFor(workflowAtGate('scope'));
    client.assistantThreads = vi.fn().mockResolvedValue({ threads: [] });
    const view = render(
      <OrqalyV2Surface client={client} initialSection="assistant" showSectionNav={false} />
    );

    expect(await screen.findByText('What do you want to get done?')).toBeTruthy();
    view.rerender(
      <OrqalyV2Surface client={client} initialSection="goals" showSectionNav={false} />
    );

    expect(await screen.findByLabelText('New workflow composer')).toBeTruthy();
    expect(screen.queryByText('What do you want to get done?')).toBeNull();
  });

  it('does not let a late approval response reopen a reset run', async () => {
    const workflow = workflowAtGate('scope');
    const approvedWorkflow = workflowAtGate('plan');
    const approvalResponse = deferred();
    const client = clientFor(workflow);
    client.approve.mockReturnValue(approvalResponse.promise);
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve exact scope artifact' }));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    await act(async () => {
      approvalResponse.resolve({ workflow: approvedWorkflow });
      await approvalResponse.promise;
    });

    expect(screen.getByLabelText('New workflow composer')).toBeTruthy();
    expect(screen.queryByText('Evidence controls')).toBeNull();
  });

  it('does not let a late scope revision response reopen a reset run', async () => {
    const workflow = workflowAtGate('scope');
    const revisedWorkflow = workflowAtGate('scope');
    const revisionResponse = deferred();
    const client = clientFor(workflow);
    client.reviseScope.mockReturnValue(revisionResponse.promise);
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));
    fireEvent.change(await screen.findByLabelText('One material clarification'), {
      target: { value: 'Cover adult cats only.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply correction and recompile' }));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    await act(async () => {
      revisionResponse.resolve({ workflow: revisedWorkflow });
      await revisionResponse.promise;
    });

    expect(screen.getByLabelText('New workflow composer')).toBeTruthy();
    expect(screen.queryByText('Launch a trustworthy cat-food product in Estonia.')).toBeNull();
  });

  it('embeds in the full app shell without a duplicate brand or account header', async () => {
    const client = clientFor(workflowAtGate('scope'));
    client.assistantThreads = vi.fn().mockResolvedValue({ threads: [] });
    render(<OrqalyV2Surface client={client} embedded />);

    expect(await screen.findByText('What do you want to get done?')).toBeTruthy();
    expect(screen.queryByText('Orqaly')).toBeNull();
    expect(screen.queryByLabelText('Organization switcher')).toBeNull();
    expect(screen.queryByLabelText('User menu')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Assistant sections' })).toBeTruthy();
  });

  it('keeps Simple compact, binds Gate 1 to the exact scope, and offers one correction', async () => {
    const workflow = workflowAtGate('scope');
    const client = clientFor(workflow);
    render(<WorkflowV2Surface client={client} />);

    expect(screen.getByLabelText('New workflow composer')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

    expect(
      await screen.findByText('Launch a trustworthy cat-food product in Estonia.')
    ).toBeTruthy();
    expect(screen.getByText('Product PRD')).toBeTruthy();
    expect(
      screen.getByText('Cat owners need a clearly bounded, trustworthy product.')
    ).toBeTruthy();
    expect(screen.getByText('A decision-ready product requirements document.')).toBeTruthy();
    expect(
      screen.getByText('Audiences: Estonian cat owners · Product decision-makers')
    ).toBeTruthy();
    expect(
      screen.getByText('Non-goals: Do not claim launch authority without verified evidence.')
    ).toBeTruthy();
    expect(screen.queryByText('Typed requirements')).toBeNull();
    expect(screen.getByText('Should the first release cover adult cats only?')).toBeTruthy();
    expect(
      screen.getAllByTestId('artifact-hash').some((node) => node.textContent.includes(SCOPE_HASH))
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Copy scope summary' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Artifact type: Product PRD (product_prd)')
      )
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Problem: Cat owners need a clearly bounded, trustworthy product.')
    );
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(
      expect.stringContaining('Typed requirements:')
    );

    fireEvent.change(screen.getByLabelText('One material clarification'), {
      target: { value: 'Cover adult cats only.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply correction and recompile' }));
    await waitFor(() =>
      expect(client.reviseScope).toHaveBeenCalledWith(
        RUN_ID,
        expect.objectContaining({
          acceptedScope: refs.scope,
          correction: 'Cover adult cats only.',
        })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve exact scope artifact' }));
    await waitFor(() =>
      expect(client.approve).toHaveBeenCalledWith(
        RUN_ID,
        expect.objectContaining({
          approvalKind: 'scope',
          artifact: refs.scope,
          idempotencyKey: `${RUN_ID}:scope:${SCOPE_HASH}`,
        })
      )
    );
    expect(client.start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'simple' }));
  });

  it('shows Gate 2 plan, evidence, team, tools, budget, boundaries and DAG in Advanced', async () => {
    const workflow = workflowAtGate('plan', 'advanced');
    const client = clientFor(workflow);
    render(<WorkflowV2Surface client={client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

    expect(await screen.findByText('Evidence controls')).toBeTruthy();
    expect(await screen.findByText('Typed requirements')).toBeTruthy();
    expect(screen.getAllByText('Verify pet-food safety requirements.')).toHaveLength(2);
    expect(
      screen.getByText('Given The accepted scope and immutable research are available.')
    ).toBeTruthy();
    expect(screen.getByText('When The product requirements document is evaluated.')).toBeTruthy();
    expect(
      screen.getByText('Then Every accepted requirement is satisfied or marked as a gap.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy exact scope contract' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Typed requirements:')
      )
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('acc-3333333333333333')
    );
    expect(await screen.findByText('Bound Personal Catalog')).toBeTruthy();
    expect(
      screen.getByText(/Read-only receipt of the tenant-scoped agents and resources/)
    ).toBeTruthy();
    expect(screen.getByText(/Product requirements lead · Preview Product Researcher/)).toBeTruthy();
    expect(screen.getByText(/Coherent full-contract product draft/)).toBeTruthy();
    expect(screen.getByText(/95.0% quality/)).toBeTruthy();
    expect(screen.getByText('Prd')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter bound catalog'), {
      target: { value: 'Preview Product Researcher' },
    });
    expect(screen.getByText('1 of 1 bound task shown')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter bound catalog'), {
      target: { value: 'missing agent' },
    });
    expect(screen.getByText('No bound task matches this filter.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter bound catalog'), { target: { value: '' } });
    expect(screen.getByText('Task DAG, attempts and retries')).toBeTruthy();
    expect(
      screen.getByText('Produce the evidence-aware product requirements document')
    ).toBeTruthy();
    expect(screen.getByTestId('approval-plan')).toBeTruthy();
    expect(
      screen.getAllByTestId('artifact-hash').some((node) => node.textContent.includes(PLAN_HASH))
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Approve exact plan artifact' }));
    await waitFor(() =>
      expect(client.approve).toHaveBeenCalledWith(
        RUN_ID,
        expect.objectContaining({
          approvalKind: 'plan',
          artifact: refs.plan,
          idempotencyKey: `${RUN_ID}:plan:${PLAN_HASH}`,
        })
      )
    );
    expect(client.start).toHaveBeenCalledWith(expect.objectContaining({ mode: 'advanced' }));
  });

  it.each([
    {
      maximumWords: 250,
      basis: 'bounded_content_default_v1',
      basisLabel: 'inferred compact default',
    },
    {
      maximumWords: 300,
      basis: 'owner_explicit',
      basisLabel: 'owner-explicit limit',
    },
  ])(
    'summarizes the $basisLabel reader-output constraint at Gate 2',
    async ({ maximumWords, basis, basisLabel }) => {
      const wordSummary = `maximum ${maximumWords} reader words (${basisLabel})`;
      const workflow = workflowAtGate('plan');
      const client = clientFor(workflow);
      const contentScope = {
        ...artifacts[refs.scope.artifactId],
        payload: {
          ...artifacts[refs.scope.artifactId].payload,
          deliverableProfile: {
            ...artifacts[refs.scope.artifactId].payload.deliverableProfile,
            artifactType: 'content_artifact',
          },
        },
      };
      const contentPlan = {
        ...artifacts[refs.plan.artifactId],
        payload: {
          ...artifacts[refs.plan.artifactId].payload,
          outputContract: {
            schemaVersion: 'orqaly.markdown-output-contract.v2',
            artifactType: 'content_artifact',
            readerOutput: {
              schemaVersion: 'orqaly.reader-output.v1',
              readerFormat: { value: 'checklist', requirementId: 'req-1111111111111111' },
              wordLimit: {
                maximumWords,
                basis,
                requirementId: 'req-1111111111111111',
              },
              itemLimit: {
                exactItems: 5,
                itemKind: 'checklist_item',
                requirementId: 'req-1111111111111111',
              },
              measurement: {
                scope: 'reader_markdown_before_server_disclosures',
                wordCounter: 'unicode_words_v1',
                itemCounter: 'top_level_markdown_items_v1',
              },
            },
          },
        },
      };
      client.artifact.mockImplementation(async (_runId, artifactId) => ({
        artifact:
          artifactId === refs.scope.artifactId
            ? contentScope
            : artifactId === refs.plan.artifactId
              ? contentPlan
              : artifacts[artifactId],
      }));
      render(<WorkflowV2Surface client={client} />);

      fireEvent.change(screen.getByLabelText('Your request'), {
        target: { value: 'Create a concise five-item cat-food checklist.' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

      expect(await screen.findByTestId('reader-output-contract')).toHaveTextContent(
        `Checklist format · exactly 5 checklist items · ${wordSummary}`
      );
      expect(screen.getByTestId('reader-output-contract')).toHaveTextContent(
        'Measured on reader-facing Markdown before Sources and server disclosures.'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Copy plan summary' }));
      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining(
            `Reader output: Checklist format · exactly 5 checklist items · ${wordSummary}`
          )
        )
      );
      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
      expect(await screen.findByTestId('reader-output-provenance')).toHaveTextContent(
        'Format requirement req-1111111111111111'
      );
      expect(screen.getByTestId('reader-output-provenance')).toHaveTextContent(
        'Item-limit requirement req-1111111111111111'
      );
      expect(screen.getByTestId('reader-output-provenance')).toHaveTextContent(
        'Word-limit requirement req-1111111111111111'
      );
    }
  );

  it('lists and resumes a durable run, then starts a clean draft without mutating it', async () => {
    const workflow = workflowAtGate('scope');
    workflow.run.request = 'Create an Estonia cat-food launch PRD.';
    const client = clientFor(workflow);
    client.list.mockResolvedValue({ workflows: [workflow] });
    render(<WorkflowV2Surface client={client} />);

    expect(await screen.findByText(/Simple · 10000000/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Simple · 10000000/));
    await waitFor(() => expect(client.read).toHaveBeenCalledWith(RUN_ID));
    expect(
      await screen.findByText('Launch a trustworthy cat-food product in Estonia.')
    ).toBeTruthy();
    expect(screen.getByText('Create an Estonia cat-food launch PRD.')).toBeTruthy();
    expect(screen.queryByText('Original request unavailable for this legacy run.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve exact scope artifact' })).not.toBeDisabled();

    fireEvent.click(screen.getByText(/Simple · 10000000/));
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Approve exact scope artifact' })).not.toBeDisabled();

    expect(screen.getByRole('navigation', { name: 'Workflow navigation' })).toBeTruthy();
    expect(screen.getByText('Workflow history')).toBeTruthy();
    expect(screen.queryByLabelText('Organization switcher')).toBeNull();
    expect(screen.getByLabelText('User menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open workflow history' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    expect(screen.getByText('What should we make?')).toBeTruthy();
    expect(client.start).not.toHaveBeenCalled();
  });

  it('labels a legacy snapshot honestly when its original request is unavailable', async () => {
    const workflow = workflowAtGate('scope');
    const client = clientFor(workflow);
    render(<WorkflowV2Surface client={client} routeSearch={`?run=${RUN_ID}`} />);

    expect(
      await screen.findByText('Original request unavailable for this legacy run.')
    ).toBeTruthy();
    expect(screen.queryByText('Request accepted')).toBeNull();
  });

  it('recovers from an unavailable deep-linked Goal without exposing tenant details', async () => {
    const client = clientFor(workflowAtGate('scope'));
    client.read.mockRejectedValue(
      Object.assign(new Error('workflow not found for tenant 90875bc2'), { status: 404 })
    );
    render(<WorkflowV2Surface client={client} routeSearch={`?run=${RUN_ID}`} />);

    expect(
      await screen.findByText(
        'This Goal isn’t available in the signed-in workspace. It may belong to another account, or the link may be outdated.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/90875bc2/u)).toBeNull();
    expect(screen.queryByLabelText('New workflow composer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Start a new Goal' }));

    expect(await screen.findByLabelText('New workflow composer')).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('renders the immutable final Markdown and enables a .md download in both projections', async () => {
    const workflow = completedWorkflow();
    const client = clientFor(workflow);
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

    expect(await screen.findByTestId('final-markdown')).toHaveTextContent('Final artifact');
    expect(screen.getByRole('heading', { level: 2, name: 'Final artifact' })).toBeTruthy();
    expect(client.artifact).toHaveBeenCalledWith(RUN_ID, refs.final.artifactId, {
      markdown: true,
      includeMetadata: true,
    });
    expect(screen.getByRole('button', { name: 'Download .md' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy final Markdown' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Final artifact')
    );
    expect(
      screen.getAllByTestId('artifact-hash').some((node) => node.textContent.includes(FINAL_HASH))
    ).toBe(true);
  });

  it.each(['Simple', 'Advanced'])('offers an exact desktop context link in the %s projection without starting more work', async (projection) => {
    const workflow = completedWorkflow();
    const client = clientFor(workflow);
    window.history.replaceState(null, '', `/assistant?section=assistant&run=${RUN_A_ID}`);
    render(<WorkflowV2Surface client={client} routeSearch={`?run=${RUN_ID}`} />);

    expect(await screen.findByTestId('final-markdown')).toHaveTextContent('Final artifact');
    if (projection === 'Advanced') fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByText('Written deliverable')).toBeTruthy();
    expect(screen.getByText('Document ready')).toBeTruthy();
    expect(screen.getByText('Plan for this deliverable')).toBeTruthy();
    expect(screen.getByText(/paste this link into Project context in your current conversation/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Goal link for desktop' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/goals?section=goals&run=${RUN_ID}`
    ));
    expect(screen.getByText('Link copied. Paste it into Project context in Orqaly Preview.')).toBeTruthy();
    expect(client.start).not.toHaveBeenCalled();
    expect(client.approve).not.toHaveBeenCalled();
    expect(client.reviseScope).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download .md' })).not.toBeDisabled();
    expect(screen.getAllByTestId('artifact-hash').some((node) => node.textContent.includes(FINAL_HASH))).toBe(true);
  });

  it('offers a selectable link when clipboard access fails instead of claiming it was copied', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    const client = clientFor(completedWorkflow());
    render(<WorkflowV2Surface client={client} routeSearch={`?run=${RUN_ID}`} />);
    await screen.findByTestId('final-markdown');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Goal link for desktop' }));
    expect(await screen.findByLabelText('Goal link for desktop')).toHaveValue(
      `${window.location.origin}/goals?section=goals&run=${RUN_ID}`
    );
    expect(screen.getByLabelText('Goal link for desktop')).toHaveAttribute('readonly');
    expect(screen.queryByText('Link copied. Paste it into Project context in Orqaly Preview.')).toBeNull();
    expect(client.start).not.toHaveBeenCalled();
    expect(client.approve).not.toHaveBeenCalled();
  });

  it('renders long final Markdown as a collapsed semantic document with links and tables', async () => {
    const workflow = completedWorkflow();
    const client = clientFor(workflow);
    const longMarkdown = [
      '# Launch evidence',
      '| Source | Status |\n| --- | --- |\n| [Official guidance](https://example.eu/guidance) | Verified |',
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
    render(<WorkflowV2Surface client={client} />);

    fireEvent.change(screen.getByLabelText('Your request'), {
      target: { value: 'Create an Estonia cat-food launch PRD.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compile scope' }));

    const expand = await screen.findByRole('button', { name: 'Open full report' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { level: 2, name: 'Launch evidence' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Markdown table' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Official guidance' })).toHaveAttribute(
      'href',
      'https://example.eu/guidance'
    );
    expect(screen.queryByText(/TAIL_MARKER/)).toBeNull();

    fireEvent.click(expand);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(await screen.findByText(/TAIL_MARKER/)).toBeTruthy();
  });

  it('collapses each newly opened final artifact even after the previous result was expanded', async () => {
    const finalA = {
      ...refs.final,
      artifactId: '20000000-0000-4000-8000-00000000000a',
      artifactHash: '1'.repeat(64),
    };
    const finalB = {
      ...refs.final,
      artifactId: '20000000-0000-4000-8000-00000000000b',
      artifactHash: '2'.repeat(64),
    };
    const completedFor = (runId, finalArtifact) => {
      const workflow = completedWorkflow();
      workflow.run = { ...workflow.run, id: runId, finalArtifact };
      workflow.stages = workflow.stages.map((item) =>
        item.kind === 'synthesis' ? { ...item, outputArtifact: finalArtifact } : item
      );
      return workflow;
    };
    const runA = completedFor(RUN_A_ID, finalA);
    const runB = completedFor(RUN_B_ID, finalB);
    const longMarkdown = (label) =>
      [
        `# ${label}`,
        ...Array.from(
          { length: 3 },
          (_, index) => `## Section ${index + 1}\n\n${'Bounded result. '.repeat(30)}`
        ),
        '## Final notes',
        'TAIL',
      ].join('\n\n');
    const client = clientFor(runA);
    client.list.mockResolvedValue({ workflows: [runA, runB] });
    client.read.mockImplementation(async (runId) => ({
      workflow: runId === RUN_A_ID ? runA : runB,
    }));
    client.artifact.mockImplementation(async (_runId, artifactId, options) => {
      if (options?.markdown) {
        const finalArtifact = artifactId === finalA.artifactId ? finalA : finalB;
        return {
          markdown: longMarkdown(artifactId === finalA.artifactId ? 'Result A' : 'Result B'),
          etag: `"sha256-${finalArtifact.artifactHash}"`,
        };
      }
      if (artifactId === finalA.artifactId) return { artifact: { ...finalA, payload: {} } };
      if (artifactId === finalB.artifactId) return { artifact: { ...finalB, payload: {} } };
      return { artifact: artifacts[artifactId] };
    });
    render(<WorkflowV2Surface client={client} />);

    fireEvent.click(await screen.findByRole('button', { name: /Simple · aaaaaaaa/ }));
    const expandA = await screen.findByRole('button', { name: 'Open full report' });
    fireEvent.click(expandA);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: /Simple · bbbbbbbb/ }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Result B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open full report' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('button', { name: 'Show less' })).toBeNull();
  });
});
