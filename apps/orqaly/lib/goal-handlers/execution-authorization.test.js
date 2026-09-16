import { describe, expect, it } from 'vitest';
import {
  buildExecutionAuthorizationManifest,
  buildSystemEnrichments,
  currentAuthorizationTasks,
  goalSkipsTools,
  loadExecutionAuthorizationManifest,
  verifySystemEnrichmentAuthorization,
  verifyTaskExecutionAuthorization,
} from './execution-authorization.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
  buildExecutionApprovalSnapshot,
} from './approval-audit.js';
import { hashResearchPersonaContext } from './research-execution-contract.js';
import { canonicalContractHash } from '../agent-handlers/compact-agent-contracts.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';
import { selectWorkShapePlaybook } from './work-shape-playbooks.js';

const goal = { id: 'goal-1', user_id: 'user-1', agent_team_id: 'team-1' };

function acceptedNativeAuthorizationGoal({
  deliverableType = 'research_report',
  action = 'prepare the accepted research report',
  workTypes = ['research_analysis'],
} = {}) {
  const admission = {
    version: 'axwise_scope_admission_v1',
    work_types: workTypes,
    geographies: [],
    channels: [],
    success_criteria: ['The accepted deliverable is complete'],
    required_capabilities: ['Research Analyst'],
    requested_actions: [
      {
        action,
        mode: 'prepare',
        side_effect: 'none',
        requires_authorization: false,
      },
    ],
  };
  const basePacket = nativeScopePacketFixture({ admission });
  const packetWithoutHash = {
    ...basePacket,
    deliverable: {
      ...basePacket.deliverable,
      type: deliverableType,
      title_prefix: `# ${deliverableType}`,
      required_sections: ['Accepted output'],
    },
  };
  delete packetWithoutHash.scope_hash;
  const packet = {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };
  const contracts = nativeDecisionContractsFixture(packet);
  const value = {
    ...goal,
    title: 'Clone https://stale-raw.example into an affiliate landing page',
    description: 'Use the stale raw URL and publish it with a new brand.',
    data: {
      axwise_customer_intelligence: {
        scope_packet: contracts.scope_packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
        generation: '1',
        updated_at: '2026-08-24T10:00:00.000Z',
      },
    },
  };
  const route = selectWorkShapePlaybook({ goal: value, scopePacket: packet });
  value.data.work_shape_route = route;
  value.data.scope_admission = {
    version: 1,
    status: 'accepted',
    state_key: 'axwise_customer_intelligence',
    scope_hash: packet.scope_hash,
    playbook_id: route.playbook_id,
    route_version: route.version,
    accepted_at: '2026-08-24T10:01:00.000Z',
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
  };
  value.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(value), 'user-1'),
  };
  return value;
}

function withCompletedNativePostFormationChain(value) {
  const scopeHash = value.data.axwise_customer_intelligence.scope_packet.scope_hash;
  const teamAttempt = {
    version: 'orqaly_team_formation_attempt_v1',
    attempt_id: 'ntf-current',
    scope_hash: scopeHash,
    status: 'completed',
    completed_at: '2026-08-24T10:02:00.000Z',
  };
  value.data.team_formation_attempt = teamAttempt;
  value.data.native_team_formation_attempt = teamAttempt;
  value.data.tool_provisioning_attempt = {
    version: 'orqaly_tool_provisioning_attempt_v1',
    attempt_id: 'ntp-current',
    scope_hash: scopeHash,
    team_formation_attempt_id: teamAttempt.attempt_id,
    status: 'completed',
    completed_at: '2026-08-24T10:03:00.000Z',
  };
  value.data.native_tool_provisioning_attempt = value.data.tool_provisioning_attempt;
  value.data.discovery_estimation_attempt = {
    version: 'orqaly_discovery_estimation_attempt_v1',
    attempt_id: 'nde-current',
    scope_hash: scopeHash,
    team_formation_attempt_id: teamAttempt.attempt_id,
    tool_provisioning_attempt_id: 'ntp-current',
    status: 'completed',
    completed_at: '2026-08-24T10:04:00.000Z',
  };
  value.data.native_discovery_estimation_attempt = value.data.discovery_estimation_attempt;
  value.proposal = { estimates: { total_estimated_cost_usd: 0.02 } };
  return value;
}

function manifest(overrides = {}) {
  return buildExecutionAuthorizationManifest({
    goal,
    teamMembers: [
      { member_id: 'agent-a', role: 'lead' },
      { member_id: 'agent-b', role: 'member' },
    ],
    agents: [
      { id: 'agent-a', metadata: { tools: ['web-search', 'mcp-github'] } },
      { id: 'agent-b', metadata: { tools: ['email'] } },
    ],
    tasks: [
      {
        id: 'task-a',
        goal_id: 'goal-1',
        agent_id: 'agent-a',
        data: { axwise_step_id: 'step-a', tool_requirements: ['web-search', 'mcp-github'] },
      },
      {
        id: 'task-b',
        goal_id: 'goal-1',
        agent_id: 'agent-b',
        data: { axwise_step_id: 'step-b', tool_requirements: [] },
      },
    ],
    libraryRows: [
      {
        agent_id: 'agent-a',
        tool_id: 'mcp-github',
        status: 'active',
        enabled_actions: ['GITHUB_GET_FILE_CONTENT'],
      },
    ],
    availableToolIds: ['tool-web-search', 'mcp-github', 'tool-email'],
    ...overrides,
  });
}

function researchExecutionContext({ context: contextOverrides = {}, contract = {} } = {}) {
  const context = {
    customer_persona: {
      persona_id: 'customer-1',
      name: 'Bremen operations buyer',
      profile: { pains: ['Manual handoffs'] },
    },
    customer_personas: [
      {
        persona_id: 'customer-1',
        name: 'Bremen operations buyer',
        profile: { pains: ['Manual handoffs'] },
      },
    ],
    execution_persona: {
      persona_id: 'executor-gdpr',
      role: 'GDPR Legal Compliance Specialist',
      profile: { mission: 'Define defensible data boundaries' },
    },
    ...contextOverrides,
  };
  return {
    ...context,
    research_contract: {
      version: 'orqaly_task_research_contract_v1',
      run_id: 'run-1',
      bundle_hash: 'bundle-1',
      research_prd_hash: 'prd-1',
      selected_customer_persona_ids: ['customer-1'],
      executor_persona_id: 'executor-gdpr',
      required_role: 'GDPR Legal Compliance Specialist',
      persona_context_hash: hashResearchPersonaContext(context),
      ...contract,
    },
  };
}

describe('execution authorization manifest', () => {
  it('treats the durable no-tools mode as an explicit skip', () => {
    expect(goalSkipsTools({ data: { tool_mode: 'no_tools' } })).toBe(true);
    expect(goalSkipsTools({ data: { skip_tools: true } })).toBe(true);
    expect(goalSkipsTools({ data: { tool_mode: 'with_tools' } })).toBe(false);
  });

  it('keeps the complete approved task set from the current AxWise planning attempt', () => {
    const currentGoal = {
      ...goal,
      data: { axwise_orchestration: { decision_id: 'decision-current' } },
    };
    const tasks = [
      {
        id: 'task-old',
        status: 'planned',
        data: { axwise_decision_id: 'decision-old' },
      },
      {
        id: 'task-current',
        status: 'todo',
        data: { axwise_decision_id: 'decision-current' },
      },
      {
        id: 'task-completed',
        status: 'completed',
        data: { axwise_decision_id: 'decision-current' },
      },
    ];

    expect(currentAuthorizationTasks(currentGoal, tasks).map((task) => task.id)).toEqual([
      'task-current',
      'task-completed',
    ]);
  });

  it('uses only runnable tasks before an AxWise planning decision exists', () => {
    const tasks = [
      { id: 'task-planned', status: 'planned', data: {} },
      { id: 'task-todo', status: 'todo', data: {} },
      { id: 'task-completed', status: 'completed', data: {} },
    ];

    expect(currentAuthorizationTasks(goal, tasks).map((task) => task.id)).toEqual([
      'task-planned',
      'task-todo',
    ]);
  });

  it('excludes retained tasks from older full retries when AxWise has no decision', () => {
    const retriedGoal = {
      ...goal,
      data: {
        retry_count: 2,
        goal_task_attempt: { version: 1, retry_count: 2 },
        axwise_orchestration: { decision_id: null, retry_count: 2 },
      },
    };
    const tasks = [
      { id: 'task-old', status: 'planned', data: { goal_retry_count: 1 } },
      { id: 'task-current', status: 'todo', data: { goal_retry_count: 2 } },
      { id: 'task-current-done', status: 'completed', data: { goal_retry_count: 2 } },
    ];

    expect(currentAuthorizationTasks(retriedGoal, tasks).map((task) => task.id)).toEqual([
      'task-current',
    ]);
  });

  it('authorizes only tasks from the current durable team materialization', () => {
    const materializedGoal = {
      ...goal,
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'ntf-current',
          status: 'completed',
        },
        team_work_materialization: {
          version: 'orqaly_team_work_materialization_v1',
          formation_attempt: 'ntf-current',
        },
      },
    };
    const tasks = [
      {
        id: 'task-current',
        status: 'planned',
        materialization_attempt: 'ntf-current',
        data: { materialization_attempt: 'ntf-current' },
      },
      {
        id: 'task-stale',
        status: 'planned',
        materialization_attempt: 'ntf-stale',
        data: { materialization_attempt: 'ntf-stale' },
      },
    ];

    expect(currentAuthorizationTasks(materializedGoal, tasks).map((task) => task.id)).toEqual([
      'task-current',
    ]);
  });

  it('freezes team members, assignments, and per-task least-privilege grants', () => {
    const value = manifest();
    expect(value.valid).toBe(true);
    expect(value.team_members).toEqual([
      { agent_id: 'agent-a', team_role: 'lead' },
      { agent_id: 'agent-b', team_role: 'member' },
    ]);
    expect(value.tasks[0]).toMatchObject({
      task_id: 'task-a',
      agent_id: 'agent-a',
      required_tool_ids: ['tool-web-search', 'mcp-github'],
      granted_tool_ids: ['tool-web-search', 'mcp-github'],
      tool_grants: [
        { tool_id: 'tool-web-search', allowed_actions: [] },
        { tool_id: 'mcp-github', allowed_actions: ['GITHUB_GET_FILE_CONTENT'] },
      ],
    });
  });

  it('blocks a task assigned to the wrong specialist role', () => {
    const value = manifest({
      teamMembers: [{ member_id: 'agent-qa', role: 'member' }],
      agents: [
        {
          id: 'agent-qa',
          name: 'QA Tester',
          category: 'quality assurance',
          capabilities: ['testing'],
          metadata: { tools: [] },
        },
      ],
      tasks: [
        {
          id: 'task-pricing',
          goal_id: 'goal-1',
          agent_id: 'agent-qa',
          data: {
            required_role: 'Finance Pricing Specialist',
            tool_requirements: [],
          },
        },
      ],
      libraryRows: [],
      availableToolIds: [],
    });

    expect(value.valid).toBe(false);
    expect(value.tasks[0].required_role).toBe('Finance Pricing Specialist');
    expect(value.issues).toContainEqual({
      code: 'task_agent_role_mismatch',
      task_id: 'task-pricing',
      agent_id: 'agent-qa',
      required_role: 'Finance Pricing Specialist',
    });
  });

  it('loads persisted capabilities before validating an equivalent specialist role', async () => {
    const selects = [];
    const filters = [];
    const rows = {
      agent_team_members: [{ member_id: 'agent-legal', role: 'member' }],
      team_tasks: [
        {
          id: 'task-gdpr',
          goal_id: 'goal-1',
          agent_id: 'agent-legal',
          status: 'planned',
          data: {
            goal_id: 'goal-1',
            required_role: 'GDPR Legal Compliance Specialist',
            tool_requirements: [],
          },
        },
      ],
      agents: [
        {
          id: 'agent-legal',
          name: 'Lawyer',
          category: 'Operations',
          capabilities: ['Ensures legal compliance'],
          metadata: { tools: [] },
        },
      ],
      agent_installed_skills: [],
      agent_connected_libraries: [],
    };
    const admin = {
      from(table) {
        const query = {
          select(columns) {
            selects.push({ table, columns });
            return query;
          },
          eq(column, value) {
            filters.push({ table, column, value });
            return query;
          },
          in() {
            return query;
          },
          then(resolve) {
            return Promise.resolve({ data: rows[table] || [], error: null }).then(resolve);
          },
        };
        return query;
      },
    };

    const value = await loadExecutionAuthorizationManifest(admin, goal);

    expect(value.valid).toBe(true);
    expect(selects.find(({ table }) => table === 'agents')?.columns).toContain('capabilities');
    expect(selects.find(({ table }) => table === 'agents')?.columns).toContain('status');
    expect(filters).toContainEqual({ table: 'agents', column: 'status', value: 'active' });
    expect(selects.find(({ table }) => table === 'team_tasks')?.columns).toContain(
      'materialization_attempt'
    );
    expect(value.issues).toEqual([]);
  });

  it('blocks coordinator-only agents from executing a task', () => {
    const value = manifest({
      teamMembers: [{ member_id: 'agent-lead', role: 'lead' }],
      agents: [{ id: 'agent-lead', name: 'Team Lead', metadata: { tools: [] } }],
      tasks: [
        {
          id: 'task-execute',
          goal_id: 'goal-1',
          agent_id: 'agent-lead',
          data: { tool_requirements: [] },
        },
      ],
      libraryRows: [],
      availableToolIds: [],
    });

    expect(value.valid).toBe(false);
    expect(value.issues).toContainEqual({
      code: 'task_assigned_to_coordinator',
      task_id: 'task-execute',
      agent_id: 'agent-lead',
    });
  });

  it('includes exact post-approval landing enrichments and declared clone URLs', () => {
    const value = manifest({
      goal: {
        ...goal,
        title: 'Clone this landing page with our new brand',
        description: 'Use https://example.com/source as the style reference.',
      },
    });

    expect(value.system_enrichments.map((item) => item.id)).toEqual([
      'brand-seed',
      'clone-reference',
      'image-pool',
    ]);
    expect(value.system_enrichments[1].source_urls).toEqual(['https://example.com/source']);
    expect(value.system_enrichments[0]).toMatchObject({
      external_services: ['Google Gemini API'],
      llm: { provider: 'gemini', model: 'gemini-3.8-flash' },
    });
  });

  it('does not add landing enrichments to a commercial conversion-funnel goal', () => {
    expect(
      buildSystemEnrichments({
        ...goal,
        title: 'Bremen commercial go-to-market plan',
        description:
          'Define the conversion funnel, KPIs, measurement methodology, and risk matrix.',
      })
    ).toEqual([]);
  });

  it('derives native enrichments and source URLs only from the accepted canonical contract', () => {
    const reportGoal = acceptedNativeAuthorizationGoal();
    reportGoal.title = 'Clone https://changed-stale.example into a new landing page';
    reportGoal.description = 'Changed raw prose says publish the clone immediately.';
    const reportManifest = manifest({ goal: reportGoal });

    expect(reportManifest.system_enrichments).toEqual([]);
    expect(reportManifest.native_scope_authority).toMatchObject({
      status: 'accepted',
      scope_hash: reportGoal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      work_types: ['research_analysis'],
      maximum_side_effect: 'none',
    });

    const landingGoal = acceptedNativeAuthorizationGoal({
      deliverableType: 'landing_page',
      workTypes: ['content_asset_creation'],
      action:
        'clone https://canonical.example/source into a landing page with the new brand identity',
    });
    landingGoal.description =
      'Raw provenance changed to https://unapproved.example after approval.';
    const enrichments = buildSystemEnrichments(landingGoal);
    expect(enrichments.map((item) => item.id)).toEqual([
      'brand-seed',
      'clone-reference',
      'image-pool',
    ]);
    expect(enrichments[1].source_urls).toEqual(['https://canonical.example/source']);
    expect(enrichments[1].source_urls).not.toContain('https://stale-raw.example');

    reportGoal.data.work_shape_route.scope_hash = 'f'.repeat(64);
    const staleManifest = manifest({ goal: reportGoal });
    expect(staleManifest.valid).toBe(false);
    expect(staleManifest.system_enrichments).toEqual([]);
    expect(staleManifest.issues).toContainEqual(
      expect.objectContaining({ code: 'native_scope_authority_invalid' })
    );
  });

  it('binds Gate 2 to the complete native post-formation attempt chain', () => {
    const incompleteGoal = acceptedNativeAuthorizationGoal();
    const incomplete = manifest({ goal: incompleteGoal });
    expect(incomplete.valid).toBe(false);
    expect(incomplete.issues).toEqual(
      expect.arrayContaining([
        { code: 'native_team_formation_attempt_incomplete' },
        { code: 'native_tool_provisioning_attempt_incomplete' },
        { code: 'native_discovery_estimation_attempt_incomplete' },
      ])
    );

    const completeGoal = withCompletedNativePostFormationChain(acceptedNativeAuthorizationGoal());
    const complete = manifest({ goal: completeGoal });
    expect(complete.native_stage_chain).toEqual({
      version: 'orqaly_native_post_formation_chain_v1',
      scope_hash: completeGoal.data.axwise_customer_intelligence.scope_packet.scope_hash,
      team_formation_attempt_id: 'ntf-current',
      tool_provisioning_attempt_id: 'ntp-current',
      discovery_estimation_attempt_id: 'nde-current',
      status: 'completed',
    });
    expect(complete.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: expect.stringMatching(/^native_.*_attempt_incomplete$/) }),
      ])
    );
  });

  it.each([{ tool_mode: 'no_tools' }, { skip_tools: true }])(
    'never adds external system enrichments to a no-tools landing page: %j',
    (policy) => {
      expect(
        buildSystemEnrichments({
          ...goal,
          title: 'Clone this landing page with our new brand',
          description: 'Use https://example.com/source as the style reference.',
          data: policy,
        })
      ).toEqual([]);
    }
  );

  it('rejects a legacy enrichment grant when the goal now has a no-tools policy', () => {
    const noToolsGoal = {
      ...goal,
      status: 'active',
      title: 'Build a landing page',
      data: {
        tool_mode: 'no_tools',
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'legacy-hash',
          manifest: {
            valid: true,
            system_enrichments: [{ id: 'brand-seed' }],
          },
        },
        goal_approvals: {
          execution: { status: 'approved', snapshot_hash: 'legacy-hash' },
        },
      },
    };

    expect(verifySystemEnrichmentAuthorization(noToolsGoal, 'brand-seed')).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(['system_enrichment_forbidden_by_no_tools_policy']),
    });
  });

  it('discloses and freezes an explicit per-goal model instead of claiming Google', () => {
    const value = manifest({
      goal: {
        ...goal,
        title: 'Build a landing page',
        data: { test_model: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
      },
    });

    expect(value.system_enrichments[0]).toMatchObject({
      external_services: ['Anthropic API'],
      llm: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
  });

  it('requires the still-current gate-2 grant before a system enrichment can run', () => {
    let landingGoal = {
      ...goal,
      status: 'active',
      title: 'Build a landing page for an animal-food shop',
      data: { goal_approvals: {} },
    };
    const contextApproval = approvedApproval(
      'context',
      buildContextApprovalSnapshot(landingGoal),
      'user-1'
    );
    landingGoal = {
      ...landingGoal,
      data: { goal_approvals: { context: contextApproval } },
    };
    const value = manifest({ goal: landingGoal });
    const approval = approvedApproval(
      'execution',
      buildExecutionApprovalSnapshot(landingGoal, value),
      'user-1'
    );
    const authorizedGoal = {
      ...landingGoal,
      data: {
        goal_approvals: { context: contextApproval, execution: approval },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: approval.snapshot_hash,
          manifest: value,
        },
      },
    };

    expect(verifySystemEnrichmentAuthorization(authorizedGoal, 'brand-seed')).toMatchObject({
      ok: true,
      reasons: [],
    });
    expect(verifySystemEnrichmentAuthorization(authorizedGoal, 'clone-reference')).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(['system_enrichment_not_approved']),
    });
    expect(
      verifySystemEnrichmentAuthorization(
        {
          ...authorizedGoal,
          budget_usd: 999,
        },
        'brand-seed'
      )
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(['execution_approval_stale']),
    });

    expect(
      verifySystemEnrichmentAuthorization({ ...authorizedGoal, status: 'paused' }, 'brand-seed')
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(['goal_not_active']),
    });
  });

  it('binds clone execution to the exact URLs approved at gate 2', () => {
    let cloneGoal = {
      ...goal,
      status: 'active',
      title: 'Clone this landing page with our new brand',
      description: 'Use https://example.com/approved as the reference.',
      data: { goal_approvals: {} },
    };
    const contextApproval = approvedApproval(
      'context',
      buildContextApprovalSnapshot(cloneGoal),
      'user-1'
    );
    cloneGoal = {
      ...cloneGoal,
      data: { goal_approvals: { context: contextApproval } },
    };
    const value = manifest({ goal: cloneGoal });
    const approval = approvedApproval(
      'execution',
      buildExecutionApprovalSnapshot(cloneGoal, value),
      'user-1'
    );
    const authorizedGoal = {
      ...cloneGoal,
      data: {
        goal_approvals: { context: contextApproval, execution: approval },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: approval.snapshot_hash,
          manifest: value,
        },
      },
    };

    expect(verifySystemEnrichmentAuthorization(authorizedGoal, 'clone-reference').ok).toBe(true);
    expect(
      verifySystemEnrichmentAuthorization(
        {
          ...authorizedGoal,
          description: 'Use https://evil.example/changed as the reference.',
        },
        'clone-reference'
      )
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(['approved_source_urls_changed']),
    });
  });

  it('fails closed when an assigned agent is not on the approved team', () => {
    const value = manifest({ teamMembers: [{ member_id: 'agent-b' }] });
    expect(value.valid).toBe(false);
    expect(value.issues).toContainEqual({
      code: 'task_agent_not_on_team',
      task_id: 'task-a',
      agent_id: 'agent-a',
    });
  });

  it('pins each researched task to the approved bundle and executor persona', () => {
    const researchedGoal = {
      ...goal,
      data: {
        axwise_customer_intelligence: {
          research_bundle: {
            run_id: 'run-1',
            bundle_hash: 'bundle-1',
            research_prd_hash: 'prd-1',
            selected_persona_ids: ['customer-1'],
          },
        },
        goal_approvals: {
          context: {
            snapshot: {
              research_bundle: {
                bundle_hash: 'bundle-1',
                research_prd_hash: 'prd-1',
                selected_persona_ids: ['customer-1'],
              },
            },
          },
        },
      },
    };
    const buildResearchedManifest = (context) =>
      buildExecutionAuthorizationManifest({
        goal: researchedGoal,
        teamMembers: [{ member_id: 'agent-b', role: 'member' }],
        agents: [
          {
            id: 'agent-b',
            name: 'Lawyer',
            capabilities: ['Ensures legal compliance'],
            metadata: { tools: [] },
          },
        ],
        tasks: [
          {
            id: 'task-gdpr',
            goal_id: 'goal-1',
            agent_id: 'agent-b',
            data: {
              required_role: 'GDPR Legal Compliance Specialist',
              tool_requirements: [],
              axwise_execution_context: context,
            },
          },
        ],
        availableToolIds: [],
      });

    const value = buildResearchedManifest(researchExecutionContext());

    expect(value).toMatchObject({ valid: true, issues: [] });
    expect(value.tasks[0].research_contract).toMatchObject({
      bundle_hash: 'bundle-1',
      executor_persona_id: 'executor-gdpr',
    });

    const drifted = buildResearchedManifest(
      researchExecutionContext({ contract: { bundle_hash: 'stale-bundle' } })
    );
    expect(drifted.valid).toBe(false);
    expect(drifted.issues).toContainEqual({
      code: 'task_research_bundle_mismatch',
      task_id: 'task-gdpr',
    });

    const driftCases = [
      [
        'task_research_run_mismatch',
        researchExecutionContext({ contract: { run_id: 'run-stale' } }),
      ],
      [
        'task_research_customer_personas_mismatch',
        researchExecutionContext({
          contract: { selected_customer_persona_ids: ['customer-other'] },
        }),
      ],
      [
        'task_research_executor_persona_mismatch',
        researchExecutionContext({
          context: {
            execution_persona: {
              persona_id: 'executor-other',
              role: 'GDPR Legal Compliance Specialist',
              profile: { mission: 'Changed identity' },
            },
          },
        }),
      ],
      [
        'task_research_persona_context_mismatch',
        researchExecutionContext({
          context: {
            customer_personas: [
              {
                persona_id: 'customer-1',
                name: 'Bremen operations buyer',
                profile: { pains: ['Changed after task materialization'] },
              },
            ],
          },
          contract: { persona_context_hash: 'f'.repeat(64) },
        }),
      ],
    ];
    for (const [code, context] of driftCases) {
      expect(buildResearchedManifest(context).issues).toContainEqual({
        code,
        task_id: 'task-gdpr',
      });
    }
  });

  it('does not treat global availability as an agent grant', () => {
    const value = manifest({
      agents: [
        { id: 'agent-a', metadata: { tools: ['web-search'] } },
        { id: 'agent-b', metadata: { tools: ['email'] } },
      ],
      libraryRows: [],
    });
    expect(value.valid).toBe(false);
    expect(value.tasks[0].granted_tool_ids).toEqual(['tool-web-search']);
    expect(value.issues).toContainEqual({
      code: 'task_tool_not_granted',
      task_id: 'task-a',
      agent_id: 'agent-a',
      tool_id: 'mcp-github',
    });
  });

  it('grants a declared document generator to each assigned agent at Gate 2', () => {
    const value = buildExecutionAuthorizationManifest({
      goal,
      teamMembers: [
        { member_id: 'agent-a', role: 'member' },
        { member_id: 'agent-b', role: 'member' },
      ],
      agents: [
        { id: 'agent-a', metadata: { tools: [] } },
        { id: 'agent-b', metadata: { tools: [] } },
      ],
      tasks: [
        {
          id: 'task-a',
          goal_id: 'goal-1',
          agent_id: 'agent-a',
          data: { tool_requirements: ['tool-doc-generator'] },
        },
        {
          id: 'task-b',
          goal_id: 'goal-1',
          agent_id: 'agent-b',
          data: { tool_requirements: ['Document editor'] },
        },
      ],
      availableToolIds: ['tool-doc-generator'],
    });

    expect(value).toMatchObject({ valid: true, issues: [] });
    expect(value.agent_grants).toEqual([
      { agent_id: 'agent-a', tool_ids: ['tool-doc-generator'], mcp_action_grants: [] },
      { agent_id: 'agent-b', tool_ids: ['tool-doc-generator'], mcp_action_grants: [] },
    ]);
    expect(value.tasks).toEqual([
      expect.objectContaining({
        task_id: 'task-a',
        granted_tool_ids: ['tool-doc-generator'],
      }),
      expect.objectContaining({
        task_id: 'task-b',
        granted_tool_ids: ['tool-doc-generator'],
      }),
    ]);
  });

  it.each(['tool-email', 'tool-brandfetch'])(
    'does not auto-grant a credentialed tool merely because %s is available',
    (toolId) => {
      const value = buildExecutionAuthorizationManifest({
        goal,
        teamMembers: [{ member_id: 'agent-a', role: 'member' }],
        agents: [{ id: 'agent-a', metadata: { tools: [] } }],
        tasks: [
          {
            id: 'task-a',
            goal_id: 'goal-1',
            agent_id: 'agent-a',
            data: { tool_requirements: [toolId] },
          },
        ],
        availableToolIds: [toolId],
      });

      expect(value.valid).toBe(false);
      expect(value.tasks[0].granted_tool_ids).toEqual([]);
      expect(value.issues).toContainEqual({
        code: 'task_tool_not_granted',
        task_id: 'task-a',
        agent_id: 'agent-a',
        tool_id: toolId,
      });
    }
  );

  it.each(['tool-cloudflare-pages', 'tool-http-client'])(
    'does not auto-grant the side-effecting internal tool %s',
    (toolId) => {
      const value = buildExecutionAuthorizationManifest({
        goal,
        teamMembers: [{ member_id: 'agent-a', role: 'member' }],
        agents: [{ id: 'agent-a', metadata: { tools: [] } }],
        tasks: [
          {
            id: 'task-a',
            goal_id: 'goal-1',
            agent_id: 'agent-a',
            data: { tool_requirements: [toolId] },
          },
        ],
        availableToolIds: [toolId],
      });

      expect(value.valid).toBe(false);
      expect(value.tasks[0].granted_tool_ids).toEqual([]);
      expect(value.issues).toContainEqual({
        code: 'task_tool_not_granted',
        task_id: 'task-a',
        agent_id: 'agent-a',
        tool_id: toolId,
      });
    }
  );

  it('keeps an explicit unconfigured tool in the approval manifest and fails closed', () => {
    const value = buildExecutionAuthorizationManifest({
      goal,
      teamMembers: [{ member_id: 'agent-a', role: 'lead' }],
      agents: [{ id: 'agent-a', metadata: { tools: ['tool-python-pandas'] } }],
      tasks: [
        {
          id: 'task-analysis',
          goal_id: 'goal-1',
          agent_id: 'agent-a',
          data: { tool_requirements: ['tool-python-pandas'] },
        },
      ],
      availableToolIds: [],
    });

    expect(value.valid).toBe(false);
    expect(value.tasks[0]).toMatchObject({
      task_id: 'task-analysis',
      required_tool_ids: ['tool-python-pandas'],
      granted_tool_ids: [],
      tool_grants: [],
    });
    expect(value.issues).toContainEqual({
      code: 'task_tool_unavailable',
      task_id: 'task-analysis',
      agent_id: 'agent-a',
      tool_id: 'tool-python-pandas',
    });
  });

  it('authorizes an explicit no-tools run while preserving waived requirements for review', () => {
    let noToolsGoal = {
      ...goal,
      status: 'active',
      data: { skip_tools: true, goal_approvals: {} },
    };
    const contextApproval = approvedApproval(
      'context',
      buildContextApprovalSnapshot(noToolsGoal),
      'user-1'
    );
    noToolsGoal = {
      ...noToolsGoal,
      data: { ...noToolsGoal.data, goal_approvals: { context: contextApproval } },
    };
    const value = buildExecutionAuthorizationManifest({
      goal: noToolsGoal,
      teamMembers: [{ member_id: 'agent-a', role: 'lead' }],
      agents: [{ id: 'agent-a', metadata: { tools: ['tool-web-search'] } }],
      tasks: [
        {
          id: 'task-analysis',
          goal_id: 'goal-1',
          agent_id: 'agent-a',
          data: { tool_requirements: ['tool-web-search'] },
        },
      ],
      availableToolIds: [],
    });

    expect(value).toMatchObject({ valid: true, tool_mode: 'skipped_by_user', issues: [] });
    expect(value.tasks[0]).toMatchObject({
      declared_tool_ids: ['tool-web-search'],
      waived_tool_ids: ['tool-web-search'],
      required_tool_ids: [],
      granted_tool_ids: [],
      tool_grants: [],
    });

    const executionApproval = approvedApproval(
      'execution',
      buildExecutionApprovalSnapshot(noToolsGoal, value),
      'user-1'
    );
    const authorizedGoal = {
      ...noToolsGoal,
      data: {
        ...noToolsGoal.data,
        goal_approvals: { context: contextApproval, execution: executionApproval },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: executionApproval.snapshot_hash,
          manifest: value,
        },
      },
    };
    const authorization = verifyTaskExecutionAuthorization({
      goal: authorizedGoal,
      task: {
        id: 'task-analysis',
        agent_id: 'agent-a',
        data: {
          goal_id: 'goal-1',
          tool_requirements: ['tool-web-search'],
          axwise_execution_context: {
            authorization_snapshot_hash: executionApproval.snapshot_hash,
          },
        },
      },
      payload: {
        authorizationSnapshotHash: executionApproval.snapshot_hash,
        toolIds: [],
        toolGrants: [],
      },
      manifest: value,
    });
    expect(authorization).toMatchObject({ ok: true, reasons: [] });
  });

  it('projects existing-only policy into Gate 2 without rewriting the task row', () => {
    const existingOnlyGoal = {
      ...goal,
      data: {
        tool_mode: 'existing_only',
        required_tools: ['tool-doc-generator'],
      },
    };
    const value = buildExecutionAuthorizationManifest({
      goal: existingOnlyGoal,
      teamMembers: [{ member_id: 'agent-a', role: 'member' }],
      agents: [{ id: 'agent-a', metadata: { tools: ['tool-web-search'] } }],
      tasks: [
        {
          id: 'task-analysis',
          goal_id: 'goal-1',
          agent_id: 'agent-a',
          data: { tool_requirements: ['tool-web-search', 'tool-doc-generator'] },
        },
      ],
      availableToolIds: ['tool-doc-generator'],
    });

    expect(value.valid).toBe(true);
    expect(value.tasks[0]).toMatchObject({
      declared_tool_ids: ['tool-web-search', 'tool-doc-generator'],
      waived_tool_ids: ['tool-web-search'],
      required_tool_ids: ['tool-doc-generator'],
      granted_tool_ids: ['tool-doc-generator'],
    });
  });

  it('authorizes the durable no-tools policy after the one-shot flag is cleared', () => {
    const noToolsGoal = {
      ...goal,
      data: { tool_mode: 'no_tools' },
    };
    const value = buildExecutionAuthorizationManifest({
      goal: noToolsGoal,
      teamMembers: [{ member_id: 'agent-a', role: 'lead' }],
      agents: [{ id: 'agent-a', metadata: { tools: ['tool-web-search'] } }],
      tasks: [
        {
          id: 'task-analysis',
          goal_id: 'goal-1',
          agent_id: 'agent-a',
          data: { tool_requirements: ['tool-web-search'] },
        },
      ],
      availableToolIds: [],
    });

    expect(value).toMatchObject({ valid: true, tool_mode: 'skipped_by_user', issues: [] });
    expect(value.tasks[0]).toMatchObject({
      declared_tool_ids: ['tool-web-search'],
      waived_tool_ids: ['tool-web-search'],
      required_tool_ids: [],
    });
  });

  it('freezes MCP action grants and rejects a connection with no enabled action', () => {
    const value = manifest({
      libraryRows: [
        { agent_id: 'agent-a', tool_id: 'mcp-github', status: 'active', enabled_actions: [] },
      ],
    });
    expect(value.valid).toBe(false);
    expect(value.tasks[0].granted_tool_ids).toEqual(['tool-web-search']);
  });

  it('lets a worker run only the exact approved task and tool grant', () => {
    const value = manifest();
    let baseGoal = {
      ...goal,
      status: 'active',
      data: { goal_approvals: {} },
    };
    const contextApproval = approvedApproval(
      'context',
      buildContextApprovalSnapshot(baseGoal),
      'user-1'
    );
    baseGoal = {
      ...baseGoal,
      data: { goal_approvals: { context: contextApproval } },
    };
    const approval = approvedApproval(
      'execution',
      buildExecutionApprovalSnapshot(baseGoal, value),
      'user-1'
    );
    const authorizedGoal = {
      ...baseGoal,
      data: {
        goal_approvals: { context: contextApproval, execution: approval },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: approval.snapshot_hash,
          manifest: value,
        },
      },
    };
    const task = {
      id: 'task-a',
      agent_id: 'agent-a',
      data: {
        goal_id: 'goal-1',
        tool_requirements: ['web-search', 'mcp-github'],
        axwise_execution_context: { authorization_snapshot_hash: approval.snapshot_hash },
      },
    };

    expect(
      verifyTaskExecutionAuthorization({
        goal: authorizedGoal,
        task,
        payload: {
          authorizationSnapshotHash: approval.snapshot_hash,
          toolIds: ['tool-web-search', 'mcp-github'],
          toolGrants: value.tasks[0].tool_grants,
        },
        manifest: value,
      })
    ).toMatchObject({ ok: true, reasons: [] });

    expect(
      verifyTaskExecutionAuthorization({
        goal: { ...authorizedGoal, status: 'cancelled' },
        task,
        payload: {
          authorizationSnapshotHash: approval.snapshot_hash,
          toolIds: ['tool-web-search', 'mcp-github'],
          toolGrants: value.tasks[0].tool_grants,
        },
        manifest: value,
      })
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(['goal_not_active']),
    });
  });

  it('rejects persona profile drift at runtime after Gate 2 approval', () => {
    let researchedGoal = {
      ...goal,
      status: 'active',
      data: {
        axwise_customer_intelligence: {
          research_bundle: {
            run_id: 'run-1',
            bundle_hash: 'bundle-1',
            research_prd_hash: 'prd-1',
            selected_persona_ids: ['customer-1'],
          },
        },
        goal_approvals: {},
      },
    };
    const contextApproval = approvedApproval(
      'context',
      buildContextApprovalSnapshot(researchedGoal),
      'user-1'
    );
    researchedGoal = {
      ...researchedGoal,
      data: { ...researchedGoal.data, goal_approvals: { context: contextApproval } },
    };
    const taskContext = researchExecutionContext();
    const task = {
      id: 'task-gdpr',
      goal_id: 'goal-1',
      agent_id: 'agent-b',
      data: {
        required_role: 'GDPR Legal Compliance Specialist',
        tool_requirements: [],
        axwise_execution_context: taskContext,
      },
    };
    const value = buildExecutionAuthorizationManifest({
      goal: researchedGoal,
      teamMembers: [{ member_id: 'agent-b', role: 'member' }],
      agents: [
        {
          id: 'agent-b',
          name: 'Lawyer',
          capabilities: ['Ensures legal compliance'],
          metadata: { tools: [] },
        },
      ],
      tasks: [task],
      availableToolIds: [],
    });
    expect(value).toMatchObject({ valid: true, issues: [] });
    const executionApproval = approvedApproval(
      'execution',
      buildExecutionApprovalSnapshot(researchedGoal, value),
      'user-1'
    );
    const authorizedGoal = {
      ...researchedGoal,
      data: {
        ...researchedGoal.data,
        goal_approvals: { context: contextApproval, execution: executionApproval },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: executionApproval.snapshot_hash,
          manifest: value,
        },
      },
    };
    const stampedTask = {
      ...task,
      data: {
        ...task.data,
        axwise_execution_context: {
          ...taskContext,
          authorization_snapshot_hash: executionApproval.snapshot_hash,
        },
      },
    };
    const payload = {
      authorizationSnapshotHash: executionApproval.snapshot_hash,
      toolIds: [],
      toolGrants: [],
    };

    expect(
      verifyTaskExecutionAuthorization({
        goal: authorizedGoal,
        task: stampedTask,
        payload,
        manifest: value,
      })
    ).toMatchObject({ ok: true, reasons: [] });

    const driftedTask = {
      ...stampedTask,
      data: {
        ...stampedTask.data,
        axwise_execution_context: {
          ...stampedTask.data.axwise_execution_context,
          execution_persona: {
            ...stampedTask.data.axwise_execution_context.execution_persona,
            profile: { mission: 'Changed after approval' },
          },
        },
      },
    };
    expect(
      verifyTaskExecutionAuthorization({
        goal: authorizedGoal,
        task: driftedTask,
        payload,
        manifest: value,
      })
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(['task_research_persona_context_mismatch']),
    });
  });

  it('blocks a queued job when its approved assignment or toolkit was changed', () => {
    const value = manifest();
    let baseGoal = { ...goal, status: 'active', data: { goal_approvals: {} } };
    const contextApproval = approvedApproval(
      'context',
      buildContextApprovalSnapshot(baseGoal),
      'user-1'
    );
    baseGoal = {
      ...baseGoal,
      data: { goal_approvals: { context: contextApproval } },
    };
    const approval = approvedApproval(
      'execution',
      buildExecutionApprovalSnapshot(baseGoal, value),
      'user-1'
    );
    const authorizedGoal = {
      ...baseGoal,
      data: {
        goal_approvals: { context: contextApproval, execution: approval },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: approval.snapshot_hash,
          manifest: value,
        },
      },
    };
    const result = verifyTaskExecutionAuthorization({
      goal: authorizedGoal,
      task: {
        id: 'task-a',
        agent_id: 'agent-b',
        data: {
          tool_requirements: ['web-search', 'mcp-github'],
          axwise_execution_context: { authorization_snapshot_hash: approval.snapshot_hash },
        },
      },
      payload: {
        authorizationSnapshotHash: approval.snapshot_hash,
        toolIds: ['tool-web-search', 'mcp-github', 'tool-email'],
        toolGrants: value.tasks[0].tool_grants,
      },
      manifest: value,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['task_agent_changed', 'runtime_tool_grants_changed'])
    );
  });
});
