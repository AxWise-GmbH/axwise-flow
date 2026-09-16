import {
  assertCompletedWorkflow,
  assertContextGate,
  assertExecutionGate,
  assertExecutionReapproval,
  buildClarificationAnswers,
  clarificationContinuationPayload,
  buildWorkflowArtifact,
  hasDurableOutcomeReceipt,
  loadConfiguration,
  sanitizeArtifact,
  validateTopology,
  writeRedactedArtifact,
  WORKFLOWS,
  MAX_EXECUTION_REAPPROVALS,
} from './axwise-live-e2e.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function configurationEnv(overrides = {}) {
  return {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-role',
    SUPABASE_ANON_KEY: 'local-anon',
    AXWISE_API_URL: 'https://api.axwise.de/api/orqaly-axwise/v1',
    AXWISE_API_KEY: 'local-axwise-key',
    WORKER_SECRET: 'local-worker-secret',
    ORQALY_E2E_PASSWORD: 'local-test-password',
    ...overrides,
  };
}

function contextGoal(overrides = {}) {
  const workflow = WORKFLOWS[0];
  return {
    id: 'goal-1',
    user_id: 'user-1',
    org_id: 'org-1',
    executor_type: 'organization',
    mode: workflow.mode,
    po_depth: workflow.poDepth,
    status: 'awaiting_context_approval',
    data: {
      axwise_customer_intelligence: {
        status: 'completed',
        degraded: false,
        decision_id: 'decision-context',
        routing_mode: 'evidence_assisted',
        persona_resolution: {
          requires_orqaly_authorization: true,
          source_type: 'declared_context',
          customer_persona: {
            name: 'German DIY car owner',
            confidence: 0.84,
            profile: { problem: 'Incorrect fitment', desired_outcome: 'Fewer returns' },
            trust: {
              status: 'declared_unverified',
              verified: false,
              limitations: ['Confirm with real return data'],
            },
            evidence: [],
          },
          ideal_agent_persona: {
            role: 'Ecommerce Operations Specialist',
            communication_style: 'Concise, operational, and evidence-labelled',
            required_capabilities: ['returns analysis', 'catalog operations'],
            operating_principles: ['preserve evidence labels'],
          },
          recommended_agent: { agent_id: 'agent-1', score: 0.91 },
          ranked_agents: [{ agent_id: 'agent-1', score: 0.91 }],
        },
      },
      goal_approvals: {
        context: { status: 'pending', snapshot_hash: 'context-hash' },
      },
    },
    ...overrides,
  };
}

function executionFixture({ applied = true } = {}) {
  const goal = contextGoal({
    status: 'awaiting_approval',
    agent_team_id: 'team-1',
    plan: { phases: [{ name: 'Analysis', jobs: [{ title: 'Analyze returns' }] }] },
    proposal: { total_cost: { total: 2 } },
  });
  goal.data.goal_approvals = {
    context: { status: 'approved', snapshot_hash: 'context-hash', approved_by: 'user-1' },
    execution: { status: 'pending', snapshot_hash: 'execution-hash' },
  };
  goal.data.axwise_orchestration = {
    decision_id: 'decision-assignment',
    status: 'recommended',
    feasible: true,
    applied,
    enforcement: applied ? 'authoritative' : 'shadow',
    rejections: [],
  };
  const task = {
    id: 'task-1',
    goal_id: 'goal-1',
    title: 'Analyze returns',
    status: 'planned',
    agent_id: 'agent-1',
    assigned_to: 'Ecommerce Operations Manager',
    data: {
      goal_id: 'goal-1',
      axwise_execution_context: {
        decision_id: 'decision-assignment',
        step_id: 'phase-1-job-1',
        customer_persona: { name: 'German DIY car owner' },
        execution_persona: { role: 'Ecommerce Operations Specialist' },
        authorization_status: 'pending_execution_approval',
        authoritative: false,
        executable: false,
      },
    },
  };
  return {
    goal,
    team: { id: 'team-1', goal_id: 'goal-1', is_active: true, name: 'Goal team' },
    teamMemberIds: ['agent-1'],
    tasks: [task],
    orgAgentIds: ['agent-1'],
  };
}

describe('AxWise live E2E harness topology', () => {
  it('permits only a local Orqaly/Supabase plane and the production AxWise host', () => {
    expect(
      validateTopology({
        apiUrl: 'http://127.0.0.1:3001',
        supabaseUrl: 'http://localhost:54321',
        axwiseUrl: 'https://api.axwise.de/api/orqaly-axwise/v1',
      })
    ).toMatchObject({
      apiUrl: 'http://127.0.0.1:3001',
      supabaseUrl: 'http://localhost:54321',
      axwiseUrl: 'https://api.axwise.de/api/orqaly-axwise/v1',
      axwiseTarget: 'api.axwise.de',
    });
  });

  it('permits loopback AxWise only when the local-code comparison flag is explicit', () => {
    const topology = {
      apiUrl: 'http://127.0.0.1:3001',
      supabaseUrl: 'http://localhost:54321',
      axwiseUrl: 'http://127.0.0.1:8001/api/orqaly-axwise/v1',
    };
    expect(() => validateTopology(topology)).toThrow(/explicit loopback AxWise/);
    expect(validateTopology({ ...topology, allowLoopbackAxwise: true })).toMatchObject({
      axwiseUrl: 'http://127.0.0.1:8001/api/orqaly-axwise/v1',
      axwiseTarget: 'loopback-local-current-worktree',
    });
  });

  it('propagates the explicit loopback AxWise option through configuration', () => {
    expect(
      loadConfiguration(
        { seed: true, 'allow-loopback-axwise': true },
        configurationEnv({
          AXWISE_API_URL: 'http://127.0.0.1:8001/api/orqaly-axwise/v1',
          ORQALY_E2E_EXPECTED_USER_ID: 'mapped-user',
          ORQALY_E2E_ORG_ID: 'mapped-organization',
        })
      )
    ).toMatchObject({ axwiseUrl: 'http://127.0.0.1:8001/api/orqaly-axwise/v1' });
  });

  it.each([
    {
      apiUrl: 'https://orqaly.example',
      supabaseUrl: 'http://localhost:54321',
      axwiseUrl: 'https://api.axwise.de/api/orqaly-axwise/v1',
    },
    {
      apiUrl: 'http://localhost:3001',
      supabaseUrl: 'https://project.supabase.co',
      axwiseUrl: 'https://api.axwise.de/api/orqaly-axwise/v1',
    },
    {
      apiUrl: 'http://localhost:3001',
      supabaseUrl: 'http://localhost:54321',
      axwiseUrl: 'https://axwise.example/api/orqaly-axwise/v1',
    },
  ])('rejects unsafe topology %#', (topology) => {
    expect(() => validateTopology(topology)).toThrow();
  });
});

describe('AxWise live E2E harness authoritative identity', () => {
  it('fails before setup when the mapped user and organization are absent', () => {
    expect(() => loadConfiguration({ seed: true }, configurationEnv())).toThrow(
      /ORQALY_E2E_EXPECTED_USER_ID/
    );
  });

  it('requires the mapped organization when only the mapped user is provided', () => {
    expect(() =>
      loadConfiguration(
        { seed: true },
        configurationEnv({ ORQALY_E2E_EXPECTED_USER_ID: 'mapped-user' })
      )
    ).toThrow(/ORQALY_E2E_ORG_ID/);
  });

  it('requires the mapped user when only the mapped organization is provided', () => {
    expect(() =>
      loadConfiguration(
        { seed: true },
        configurationEnv({ ORQALY_E2E_ORG_ID: 'mapped-organization' })
      )
    ).toThrow(/ORQALY_E2E_EXPECTED_USER_ID/);
  });

  it('uses both explicit mapped identifiers in authoritative mode', () => {
    expect(
      loadConfiguration(
        { seed: true },
        configurationEnv({
          ORQALY_E2E_EXPECTED_USER_ID: 'mapped-user',
          ORQALY_E2E_ORG_ID: 'mapped-organization',
        })
      )
    ).toMatchObject({
      expectedUserId: 'mapped-user',
      requestedOrgId: 'mapped-organization',
      requireApplied: true,
    });
  });

  it('allows missing mapped identifiers only in explicit shadow mode', () => {
    expect(
      loadConfiguration({ seed: true, 'allow-shadow': true }, configurationEnv())
    ).toMatchObject({
      expectedUserId: null,
      requestedOrgId: null,
      requireApplied: false,
    });
  });

  it('treats the documented applied=false environment setting as shadow mode', () => {
    expect(
      loadConfiguration(
        { seed: true },
        configurationEnv({ ORQALY_E2E_REQUIRE_AXWISE_APPLIED: 'false' })
      )
    ).toMatchObject({
      expectedUserId: null,
      requestedOrgId: null,
      requireApplied: false,
    });
  });
});

describe('AxWise live E2E harness approval boundaries', () => {
  it('queues clarification continuation using the public enqueue contract', () => {
    expect(clarificationContinuationPayload('goal-1')).toEqual({
      type: 'orchestrate-goal',
      action: 'po-analysis-continue',
      goalId: 'goal-1',
      mode: 'queued',
    });
  });

  it.each(WORKFLOWS)('builds domain-specific answers for $key clarification', (workflow) => {
    const answers = buildClarificationAnswers(
      {
        data: {
          po_questions: [
            'Who experiences the problem?',
            'What outcome counts as success?',
            'What evidence should be used?',
          ],
        },
      },
      workflow
    );
    expect(answers).toHaveLength(3);
    expect(answers.every((entry) => entry.question && entry.answer.length >= 20)).toBe(true);
    expect(answers[0].answer).toMatch(
      workflow.key === 'advanced' ? /dog and cat owners/i : /DIY car owners/i
    );
  });

  it('accepts a detailed, scoped customer/executor context at gate one', () => {
    expect(
      assertContextGate({
        goal: contextGoal(),
        workflow: WORKFLOWS[0],
        userId: 'user-1',
        orgId: 'org-1',
        orgAgentIds: ['agent-1'],
      })
    ).toBe(true);
  });

  it.each([
    [
      'degraded context',
      {
        data: {
          ...contextGoal().data,
          axwise_customer_intelligence: {
            ...contextGoal().data.axwise_customer_intelligence,
            degraded: true,
          },
        },
      },
    ],
    ['wrong org', { org_id: 'org-2' }],
    [
      'out-of-scope recommendation',
      {
        data: {
          ...contextGoal().data,
          axwise_customer_intelligence: {
            ...contextGoal().data.axwise_customer_intelligence,
            persona_resolution: {
              ...contextGoal().data.axwise_customer_intelligence.persona_resolution,
              recommended_agent: { agent_id: 'agent-outside', score: 0.99 },
            },
          },
        },
      },
    ],
  ])('refuses %s before context approval', (_label, override) => {
    expect(() =>
      assertContextGate({
        goal: contextGoal(override),
        workflow: WORKFLOWS[0],
        userId: 'user-1',
        orgId: 'org-1',
        orgAgentIds: ['agent-1'],
      })
    ).toThrow();
  });

  it('accepts a goal-scoped, authoritative team proposal while tasks remain non-executable', () => {
    expect(assertExecutionGate({ ...executionFixture(), requireApplied: true })).toBe(true);
  });

  it('rejects shadow routing by default', () => {
    expect(() =>
      assertExecutionGate({ ...executionFixture({ applied: false }), requireApplied: true })
    ).toThrow(/shadow mode/i);
  });

  it('rejects a task that becomes executable before human confirmation two', () => {
    const fixture = executionFixture();
    fixture.tasks[0].data.axwise_execution_context.executable = true;
    expect(() => assertExecutionGate({ ...fixture, requireApplied: true })).toThrow(
      /before approval/i
    );
  });

  it('rejects a cross-organization team member', () => {
    const fixture = executionFixture();
    fixture.teamMemberIds.push('agent-outside');
    expect(() => assertExecutionGate({ ...fixture, requireApplied: true })).toThrow(
      /outside the organization/i
    );
  });

  it('requires a fully validated changed snapshot before execution reapproval', () => {
    const fixture = executionFixture();
    fixture.goal.iteration = 1;
    fixture.goal.data.goal_approvals.execution = {
      status: 'pending',
      snapshot_hash: 'execution-hash-v2',
      invalidated_at: '2026-08-03T12:00:00.000Z',
    };

    expect(
      assertExecutionReapproval({
        ...fixture,
        requireApplied: true,
        previousApprovalHash: 'execution-hash',
        reapprovalNumber: 1,
      })
    ).toMatchObject({
      checkpoint: 'execution_reapproval',
      sequence: 1,
      iteration: 1,
      task_count: 1,
    });
  });

  it('refuses to reapprove an unchanged or unmarked execution snapshot', () => {
    const unchanged = executionFixture();
    unchanged.goal.data.goal_approvals.execution.invalidated_at = '2026-08-03T12:00:00.000Z';
    expect(() =>
      assertExecutionReapproval({
        ...unchanged,
        requireApplied: true,
        previousApprovalHash: 'execution-hash',
        reapprovalNumber: 1,
      })
    ).toThrow(/materially changed snapshot/i);

    const unmarked = executionFixture();
    unmarked.goal.data.goal_approvals.execution.snapshot_hash = 'execution-hash-v2';
    expect(() =>
      assertExecutionReapproval({
        ...unmarked,
        requireApplied: true,
        previousApprovalHash: 'execution-hash',
        reapprovalNumber: 1,
      })
    ).toThrow(/mark the prior execution approval stale/i);
  });

  it('fails closed when re-planning exceeds the bounded reapproval count', () => {
    const fixture = executionFixture();
    fixture.goal.data.goal_approvals.execution = {
      status: 'pending',
      snapshot_hash: 'execution-hash-v3',
      invalidated_at: '2026-08-03T12:00:00.000Z',
    };
    expect(() =>
      assertExecutionReapproval({
        ...fixture,
        requireApplied: true,
        previousApprovalHash: 'execution-hash-v2',
        reapprovalNumber: MAX_EXECUTION_REAPPROVALS + 1,
      })
    ).toThrow(/more than 2 human reapprovals/i);
  });
});

describe('AxWise live E2E harness completion proof', () => {
  it('requires successful tasks, both approvals, a non-degraded call and an outcome receipt', () => {
    const fixture = executionFixture();
    fixture.goal.status = 'completed';
    fixture.goal.data.goal_approvals.execution = {
      status: 'approved',
      snapshot_hash: 'execution-hash',
      approved_by: 'user-1',
    };
    fixture.goal.data.axwise_outcome = {
      outcome_id: 'outcome-1',
      decision_id: 'decision-assignment',
      reported_at: '2026-08-03T12:00:00.000Z',
    };
    fixture.goal.data.axwise_outcome_delivery = { status: 'reported' };
    fixture.tasks[0].status = 'done';
    const axwiseCalls = [
      { integration_point: 'goal.orchestrate', status: 'ok', degraded: false },
      { integration_point: 'goal.outcome', status: 'ok', degraded: false },
    ];
    expect(hasDurableOutcomeReceipt(fixture.goal, { axwiseCalls })).toBe(true);
    expect(
      assertCompletedWorkflow({
        goal: fixture.goal,
        tasks: fixture.tasks,
        axwiseCalls,
        logs: [
          { event_type: 'context_approved' },
          { event_type: 'goal_active' },
          { event_type: 'goal_completed' },
        ],
      })
    ).toBe(true);
  });

  it('does not accept a receipt until durable delivery and the outcome call agree', () => {
    const fixture = executionFixture();
    fixture.goal.status = 'completed';
    fixture.goal.data.axwise_outcome = {
      outcome_id: 'outcome-1',
      decision_id: 'decision-assignment',
      reported_at: '2026-08-03T12:00:00.000Z',
    };
    fixture.goal.data.axwise_outcome_delivery = { status: 'pending' };
    expect(
      hasDurableOutcomeReceipt(fixture.goal, {
        axwiseCalls: [{ integration_point: 'goal.outcome', status: 'ok', degraded: false }],
      })
    ).toBe(false);

    fixture.goal.data.axwise_outcome_delivery.status = 'reported';
    expect(hasDurableOutcomeReceipt(fixture.goal, { axwiseCalls: [] })).toBe(false);
  });
});

describe('AxWise live E2E harness artifact redaction', () => {
  it('pseudonymizes identifiers and never copies secrets', async () => {
    const fixture = executionFixture();
    fixture.goal.status = 'completed';
    fixture.goal.data.goal_approvals.execution = {
      status: 'approved',
      snapshot_hash: 'execution-hash',
      approved_by: 'user-1',
    };
    fixture.goal.data.axwise_outcome = {
      outcome_id: 'outcome-1',
      decision_id: 'decision-assignment',
      normalized_success: 1,
    };
    fixture.tasks[0].status = 'done';
    const artifact = buildWorkflowArtifact({
      workflow: WORKFLOWS[0],
      goal: fixture.goal,
      team: fixture.team,
      memberships: [{ member_id: 'agent-1', role: 'lead' }],
      tasks: fixture.tasks,
      agents: [{ id: 'agent-1', name: 'Ecommerce Operations Manager' }],
      axwiseCalls: [
        {
          integration_point: 'goal.orchestrate',
          status: 'ok',
          degraded: false,
          processed_outputs: { decision_id: 'decision-assignment' },
        },
      ],
      logs: [],
      statusTimeline: [],
      durations: { total: 10 },
    });
    const secret = 'super-secret-value';
    const safe = sanitizeArtifact({ artifact, api_key: secret, note: `value=${secret}` }, [secret]);
    expect(JSON.stringify(safe)).not.toContain(secret);
    expect(safe.api_key).toBe('[REDACTED]');
    expect(artifact.goal_ref).toMatch(/^goal:/);
    expect(JSON.stringify(artifact)).not.toContain('decision-assignment');

    const dir = await mkdtemp(join(tmpdir(), 'axwise-e2e-'));
    const path = join(dir, 'proof.json');
    await writeRedactedArtifact(path, safe, [secret]);
    const written = await readFile(path, 'utf8');
    expect(written).not.toContain(secret);
    await expect(writeRedactedArtifact(path, safe, [secret])).rejects.toMatchObject({
      code: 'EEXIST',
    });
  });
});
