/**
 * Tests for team-assigner capabilityOverlap skill-aware scoring.
 *
 * Motivation: installed skills were defined but never consulted by the scorer
 * — two agents with the same role tied on score even when one had an obviously
 * relevant skill installed. We extend capabilityOverlap with a third argument
 * (skillText) and weight skill-matches 1.5× role/description matches.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  capabilityOverlap,
  dedupeExecutionAgents,
  findReusableGoalTeam,
  formTeam,
  agentMatchesRequiredRole,
  goalRequiredExecutionRoles,
  matchDistinctAgentsToRoles,
  missingRequiredRoles,
  ensurePersistentAgentsForRoles,
  MAX_ROSTER_ROLES,
} from './team-assigner.js';
import { researchContextGateHash } from '../integrations/axwise/research-contract.js';
import { canonicalContractHash } from '../agent-handlers/compact-agent-contracts.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../agent-handlers/native-axwise-contract.test-fixture.js';
import { approvedApproval, buildContextApprovalSnapshot } from './approval-audit.js';
import { selectWorkShapePlaybook } from './work-shape-playbooks.js';

const agent = {
  name: 'Frontend Developer',
  description: 'Builds user interfaces',
  agent_type: 'developer',
  metadata: {},
};

function acceptedNativeGoal({ roles, deliverableType = 'research_report' }) {
  const admission = {
    version: 'axwise_scope_admission_v1',
    work_types: ['research_analysis'],
    geographies: [],
    channels: [],
    success_criteria: ['The accepted research report is complete'],
    required_capabilities: roles,
    requested_actions: [
      {
        action: 'prepare the accepted research report',
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
      title_prefix: '# Accepted research report',
      required_sections: ['Findings', 'Recommendations'],
    },
  };
  delete packetWithoutHash.scope_hash;
  const packet = {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };
  const contracts = nativeDecisionContractsFixture(packet);
  const goalValue = {
    id: 'goal-native-team',
    user_id: 'user-1',
    title: 'Clone https://stale.example into an affiliate landing page',
    description: 'Stale raw copy asks for pricing, GDPR, outreach, ICPs, and a risk matrix.',
    parsed_requirements: 'Stale raw landing-page requirements',
    tech_doc: {
      required_capabilities: ['Frontend Developer', 'Marketing ICP Specialist'],
    },
    plan: {
      strategy: 'Prepare the accepted canonical research report.',
      phases: [
        {
          name: 'Canonical report work',
          jobs: roles.map((role, index) => ({
            title: `Canonical task ${index + 1}`,
            description: `Complete the accepted ${role} work.`,
            required_role: role,
          })),
        },
      ],
    },
    data: {
      axwise_customer_intelligence: {
        scope_packet: contracts.scope_packet,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        scope_contract_binding: contracts.scope_contract_binding,
        generation: '1',
        updated_at: '2026-08-24T10:00:00.000Z',
      },
    },
  };
  const route = selectWorkShapePlaybook({ goal: goalValue, scopePacket: packet });
  goalValue.data.work_shape_route = route;
  goalValue.data.scope_admission = {
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
  goalValue.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(goalValue), 'user-1'),
  };
  return goalValue;
}

describe('capabilityOverlap — skill-aware scoring', () => {
  it('returns zero when job description has no meaningful words', () => {
    expect(capabilityOverlap(agent, '')).toBe(0);
    expect(capabilityOverlap(agent, 'a of the')).toBe(0); // all words <= 3 chars
  });

  it('scores description-only matches without skill text (baseline unchanged)', () => {
    // "interfaces" (>3 chars) appears in agent.description → 1 match / 1 word
    const score = capabilityOverlap(agent, 'interfaces');
    expect(score).toBe(1);
  });

  it('accepts an optional skillText argument without breaking old callers', () => {
    // Old 2-arg calls still work — this is the backward-compat guarantee
    const legacy = capabilityOverlap(agent, 'interfaces');
    const withEmpty = capabilityOverlap(agent, 'interfaces', '');
    expect(legacy).toBe(withEmpty);
  });

  it('gives skill-only matches a 1.5× bonus over no-skill baseline', () => {
    // Job words (after >3-char filter): ["optimize", "keyword", "rankings"]
    // None appear in base agent text → baseline = 0
    const baseline = capabilityOverlap(agent, 'optimize keyword rankings');
    expect(baseline).toBe(0);

    // All three match skillText → 3 × 1.5 / 3 = 1.5
    const skillText = 'keyword optimize rankings strategy';
    const withSkills = capabilityOverlap(agent, 'optimize keyword rankings', skillText);
    expect(withSkills).toBeGreaterThan(baseline);
    expect(withSkills).toBeCloseTo(1.5, 5);
  });

  it('combines description + skill matches without double-counting', () => {
    // Job words: ["interfaces", "rankings"]
    // "interfaces" → description match (+1)
    // "rankings"   → skill-only match (+1.5)
    // Total: 2.5 / 2 words = 1.25
    const score = capabilityOverlap(agent, 'interfaces rankings', 'rankings optimization tools');
    expect(score).toBeCloseTo(1.25, 5);
  });

  it('ranks a skilled agent above an unskilled agent with the same role', () => {
    const unskilled = capabilityOverlap(agent, 'write SEO landing copy', '');
    const skilled = capabilityOverlap(
      agent,
      'write SEO landing copy',
      'SEO Copywriter produces landing page copy'
    );
    expect(skilled).toBeGreaterThan(unskilled);
  });

  it('uses Agent Hub capabilities as first-class assignment evidence', () => {
    const capableAgent = { ...agent, capabilities: ['healthcare operations', 'clinic workflow'] };
    expect(capabilityOverlap(capableAgent, 'improve clinic workflow')).toBeGreaterThan(
      capabilityOverlap(agent, 'improve clinic workflow')
    );
  });
});

describe('dedupeExecutionAgents', () => {
  it('keeps the newest persistent row for each logical role', () => {
    expect(
      dedupeExecutionAgents([
        { id: 'old-backend', name: 'Backend Developer', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'analyst', name: 'Analyst', updated_at: '2026-01-02T00:00:00Z' },
        { id: 'new-backend', name: 'backend-developer', updated_at: '2026-02-01T00:00:00Z' },
      ])
    ).toEqual([
      expect.objectContaining({ id: 'new-backend' }),
      expect.objectContaining({ id: 'analyst' }),
    ]);
  });
});

describe('persistent specialist coverage', () => {
  it('uses category and capabilities as role evidence, not only the display name', () => {
    const existing = {
      name: 'Marta',
      category: 'Commercial Pricing Analyst',
      capabilities: ['fixed-price package design'],
    };
    expect(agentMatchesRequiredRole(existing, 'Commercial Pricing Analyst')).toBe(true);
  });

  it('matches formatted planner roles to underscore capability identifiers', () => {
    expect(
      agentMatchesRequiredRole(
        {
          name: 'Marta',
          category: 'commercial',
          capabilities: ['gdpr_legal_compliance_specialist'],
        },
        'GDPR Legal Compliance Specialist'
      )
    ).toBe(true);
  });

  it('identifies missing specialists even when a generic agent already exists', () => {
    const existing = [
      { name: 'Team Lead', category: 'team lead' },
      { name: 'Marketing Strategist', category: 'marketing' },
    ];
    expect(
      missingRequiredRoles(existing, [
        'B2B Go-To-Market Strategist',
        'German Market Localization Specialist',
        'EU Regulatory & GDPR Compliance Lead',
        'Commercial Pricing Analyst',
        'Team Lead',
      ])
    ).toEqual([
      'B2B Go-To-Market Strategist',
      'German Market Localization Specialist',
      'EU Regulatory & GDPR Compliance Lead',
      'Commercial Pricing Analyst',
    ]);
  });

  it('prioritizes and humanizes the five PO/AxWise specialists over wrong fallback plan roles', () => {
    const goal = {
      tech_doc: {
        required_capabilities: [
          'marketing_icp_specialist',
          'finance_pricing_specialist',
          'gdpr_legal_compliance_specialist',
          'business_development_sales_specialist',
          'commercial_risk_analyst',
          'non_executing_coordinator_team_lead',
        ],
      },
      data: {
        axwise_customer_intelligence: {
          persona_resolution: {
            ideal_agent_persona: {
              required_capabilities: ['eu_regulatory_specialist'],
            },
          },
        },
      },
      plan: {
        phases: [{ jobs: [{ required_role: 'QA Tester' }] }],
      },
    };

    expect(goalRequiredExecutionRoles(goal, 5)).toEqual([
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ]);
  });

  it('does not promote ideal-agent capability descriptions into execution roles', () => {
    const goal = {
      tech_doc: {
        required_capabilities: ['gdpr_legal_compliance_specialist'],
      },
      data: {
        axwise_customer_intelligence: {
          persona_resolution: {
            ideal_agent_persona: {
              required_capabilities: [
                'Writes Product Requirements Documents (PRDs)',
                'Defines acceptance criteria and tests',
                'Development',
              ],
            },
          },
        },
      },
      plan: {
        phases: [
          {
            jobs: [{ required_role: 'Commercial Risk Analyst' }],
          },
        ],
      },
    };

    expect(goalRequiredExecutionRoles(goal, 20)).toEqual([
      'GDPR Legal Compliance Specialist',
      'Commercial Risk Analyst',
    ]);
  });

  it('infers the canonical five-person commercial roster before a plan exists', () => {
    const goal = {
      title: 'Grounded Bremen AI consulting commercial plan',
      description:
        'Define 3 Bremen SMB ICPs; design three fixed-price EUR service packages with a GDPR-safe delivery framework; create a four-week German outreach cadence with objection handling; define the conversion funnel, KPI measurement methodology and commercial risk matrix.',
      tech_doc: {
        required_capabilities: [
          'B2B Commercial Strategist',
          'German Market Lead Generator',
          'AI Management Consultant',
          'GDPR / Compliance Specialist',
        ],
      },
    };

    expect(goalRequiredExecutionRoles(goal, 5)).toEqual([
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ]);
  });

  it('uses the exact research-contract roster before research and fails closed after a stale Gate 1', () => {
    const requestedRoles = [
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ];
    const goal = {
      data: {
        research_policy: {
          research_fail_closed: true,
          intent: 'commercial_market_launch',
          requested_execution_roles: requestedRoles,
        },
      },
      tech_doc: { required_capabilities: ['Backend Developer'] },
    };

    expect(goalRequiredExecutionRoles(goal, 5)).toEqual(requestedRoles);

    goal.data.axwise_customer_intelligence = {
      research_bundle: {
        bundle_hash: 'b'.repeat(64),
        context_gate: {
          status: 'ready',
          executor_roles: { expected: requestedRoles },
        },
      },
    };
    goal.data.goal_approvals = {
      context: {
        status: 'approved',
        snapshot: { research_bundle: { bundle_hash: 'c'.repeat(64) } },
      },
    };

    expect(goalRequiredExecutionRoles(goal, 5)).toEqual([]);
  });

  it('fails closed before research when a persisted commercial roster was tampered', () => {
    const goal = {
      data: {
        research_policy: {
          research_fail_closed: true,
          intent: 'commercial_market_launch',
          requested_execution_roles: [
            'Marketing ICP Specialist',
            'Finance Pricing Specialist',
            'GDPR Legal Compliance Specialist',
            'Backend Developer',
            'Commercial Risk Analyst',
          ],
        },
      },
      tech_doc: { required_capabilities: ['Backend Developer'] },
    };

    expect(goalRequiredExecutionRoles(goal, 5)).toEqual([]);
  });

  it('rejects a legacy roster even when its untyped bundle and Gate 1 hash look current', () => {
    const requestedRoles = [
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ];
    const gate = {
      version: 1,
      status: 'ready',
      required: true,
      executor_roles: { expected: requestedRoles },
      issues: [],
    };
    const goal = {
      data: {
        research_policy: {
          research_fail_closed: true,
          intent: 'commercial_market_launch',
          requested_execution_roles: requestedRoles,
        },
        axwise_customer_intelligence: {
          research_bundle: {
            bundle_hash: 'b'.repeat(64),
            context_gate: gate,
            context_gate_hash: researchContextGateHash(gate),
          },
        },
        goal_approvals: {
          context: {
            status: 'approved',
            snapshot: {
              research_bundle: {
                bundle_hash: 'b'.repeat(64),
                context_gate_hash: researchContextGateHash(gate),
              },
            },
          },
        },
      },
    };

    expect(goalRequiredExecutionRoles(goal, 5)).toEqual([]);

    goal.data.axwise_customer_intelligence.research_bundle.context_gate = {
      ...gate,
      selected_customer_role: 'decision_authority',
    };
    goal.data.axwise_customer_intelligence.research_bundle.context_gate_hash =
      researchContextGateHash(goal.data.axwise_customer_intelligence.research_bundle.context_gate);
    expect(goalRequiredExecutionRoles(goal, 5)).toEqual([]);
  });

  it('canonicalizes the legacy Bremen PO roles and infers the fifth risk specialist from scope', () => {
    const goal = {
      tech_doc: {
        required_capabilities: [
          'B2B Go-To-Market Strategist',
          'German Market Localization Specialist',
          'EU Regulatory & GDPR Compliance Lead',
          'Commercial Pricing Analyst',
        ],
      },
      plan: {
        phases: [
          {
            name: 'Funnel, Metrics & Risk Matrix',
            jobs: [
              {
                title: 'Define conversion funnel KPIs and commercial risk mitigations',
                description: 'Include a measurement methodology and risk matrix.',
                required_role: 'QA Tester',
              },
            ],
          },
        ],
      },
    };

    expect(goalRequiredExecutionRoles(goal, 5)).toEqual([
      'Business Development Sales Specialist',
      'Marketing ICP Specialist',
      'GDPR Legal Compliance Specialist',
      'Finance Pricing Specialist',
      'Commercial Risk Analyst',
    ]);
  });

  it('uses every accepted native plan role and ignores stale raw role and brand keywords', () => {
    const roles = [
      'Research Analyst',
      'Content Strategist',
      'Data Analyst',
      'Compliance Reviewer',
      'QA Tester',
      'Copywriter',
    ];
    const nativeGoal = acceptedNativeGoal({ roles });
    nativeGoal.title = 'Publish a different stale affiliate site at https://changed.example';
    nativeGoal.description = 'Changed raw prose asks for GDPR pricing and outreach specialists.';
    nativeGoal.tech_doc.required_capabilities = ['Backend Developer'];

    expect(goalRequiredExecutionRoles(nativeGoal, 5)).toEqual(
      nativeGoal.data.axwise_customer_intelligence.scope_packet.research_contract.executor_role_slots.map(
        (slot) => slot.role
      )
    );
    expect(goalNeedsBrandResearch(nativeGoal)).toBe(false);

    nativeGoal.data.work_shape_route.scope_hash = 'f'.repeat(64);
    expect(goalRequiredExecutionRoles(nativeGoal, 5)).toEqual([]);
    expect(goalNeedsBrandResearch(nativeGoal)).toBe(false);
  });

  it('requires distinct persistent specialists instead of one broad agent masking every role', () => {
    const broad = {
      id: 'agent-broad',
      name: 'Commercial Generalist',
      capabilities: ['Finance Pricing Specialist', 'Commercial Risk Analyst'],
    };
    const result = matchDistinctAgentsToRoles(
      [broad],
      ['Finance Pricing Specialist', 'Commercial Risk Analyst'],
      2
    );

    expect(result.assignments).toEqual([
      expect.objectContaining({ role: 'Finance Pricing Specialist', agent: broad }),
    ]);
    expect(result.missing).toEqual(['Commercial Risk Analyst']);
  });
});

describe('findReusableGoalTeam — project isolation', () => {
  it('queries by both owner and exact goal before reusing a team', async () => {
    const filters = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column, value) => {
        filters.push([column, value]);
        return query;
      }),
      limit: vi.fn(async () => ({ data: [{ id: 'team-goal-2', name: 'Goal 2' }], error: null })),
    };
    const admin = { from: vi.fn(() => query) };

    const team = await findReusableGoalTeam(admin, 'user-1', 'goal-2');

    expect(admin.from).toHaveBeenCalledWith('agent_teams');
    expect(filters).toEqual([
      ['user_id', 'user-1'],
      ['goal_id', 'goal-2'],
      ['is_active', true],
    ]);
    expect(team).toEqual({ id: 'team-goal-2', name: 'Goal 2' });
  });

  it('returns null when this goal has no reusable team', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: [], error: null })),
    };
    await expect(
      findReusableGoalTeam({ from: () => query }, 'user-1', 'goal-30')
    ).resolves.toBeNull();
  });
});

describe('formTeam — explicit organization scope', () => {
  function agentAdmin(agents) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      then(resolve) {
        return Promise.resolve({ data: agents, error: null }).then(resolve);
      },
    };
    return { from: vi.fn(() => query) };
  }

  it('fails closed when the explicit org catalogue is empty', async () => {
    const admin = agentAdmin([{ id: 'user-wide-agent', name: 'Analyst', status: 'active' }]);

    const result = await formTeam(
      admin,
      {
        id: 'goal-1',
        title: 'Autoparts returns',
        tech_doc: { required_capabilities: ['analyst'] },
      },
      'user-1',
      []
    );

    expect(result).toEqual({ teamId: null, members: [] });
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('does not retain the user-wide pool or auto-create when the org intersection is empty', async () => {
    const admin = agentAdmin([{ id: 'agent-other-org', name: 'Researcher', status: 'active' }]);

    const result = await formTeam(
      admin,
      {
        id: 'goal-2',
        title: 'Animal food subscription retention',
        tech_doc: { required_capabilities: ['researcher'] },
      },
      'user-1',
      ['agent-this-org']
    );

    expect(result).toEqual({ teamId: null, members: [] });
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('selects five distinct specialists plus the non-executing coordinator', async () => {
    const agents = [
      { id: 'marketing', name: 'Marketing ICP Specialist', status: 'active' },
      { id: 'finance', name: 'Finance Pricing Specialist', status: 'active' },
      { id: 'legal', name: 'GDPR Legal Compliance Specialist', status: 'active' },
      { id: 'sales', name: 'Business Development Sales Specialist', status: 'active' },
      { id: 'risk', name: 'Commercial Risk Analyst', status: 'active' },
      { id: 'lead', name: 'Team Lead', status: 'active' },
    ];
    const resolved = (value) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        limit: vi.fn(async () => value),
        update: vi.fn(() => query),
        delete: vi.fn(() => query),
        upsert: vi.fn(async () => ({ error: null })),
        then(resolve) {
          return Promise.resolve(value).then(resolve);
        },
      };
      return query;
    };
    const admin = {
      from: vi.fn((table) => {
        if (table === 'agents') return resolved({ data: agents, error: null });
        if (table === 'agent_performance' || table === 'agent_installed_skills') {
          return resolved({ data: [], error: null });
        }
        if (table === 'goals') return resolved({ data: null, error: null });
        if (table === 'agent_teams') {
          const query = resolved({ data: [{ id: 'team-1', name: 'Bremen Team' }], error: null });
          query.update = vi.fn(() => resolved({ error: null }));
          return query;
        }
        if (table === 'agent_team_members') return resolved({ error: null });
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const requiredCapabilities = [
      'marketing_icp_specialist',
      'finance_pricing_specialist',
      'gdpr_legal_compliance_specialist',
      'business_development_sales_specialist',
      'commercial_risk_analyst',
    ];

    const result = await formTeam(
      admin,
      {
        id: 'goal-bremen',
        user_id: 'user-1',
        title: 'Bremen commercial GTM',
        tech_doc: { required_capabilities: requiredCapabilities },
        plan: { phases: [] },
        data: {},
      },
      'user-1',
      agents.map((item) => item.id)
    );

    expect(result.members).toHaveLength(6);
    expect(result.members[0].name).toBe('Team Lead');
    expect(result.members.map((item) => item.id)).toEqual(
      expect.arrayContaining(['marketing', 'finance', 'legal', 'sales', 'risk', 'lead'])
    );
  });

  it('does not truncate a six-role accepted native roster to the legacy five-role cap', async () => {
    const roles = [
      'Research Analyst',
      'Content Strategist',
      'Data Analyst',
      'Compliance Reviewer',
      'QA Tester',
      'Copywriter',
    ];
    const agents = [
      ...roles.map((name, index) => ({ id: `specialist-${index + 1}`, name, status: 'active' })),
      { id: 'lead', name: 'Team Lead', status: 'active' },
    ];
    const resolved = (value) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        limit: vi.fn(async () => value),
        update: vi.fn(() => query),
        delete: vi.fn(() => query),
        upsert: vi.fn(async () => ({ error: null })),
        then(resolve) {
          return Promise.resolve(value).then(resolve);
        },
      };
      return query;
    };
    const admin = {
      from: vi.fn((table) => {
        if (table === 'agents') return resolved({ data: agents, error: null });
        if (table === 'agent_performance' || table === 'agent_installed_skills') {
          return resolved({ data: [], error: null });
        }
        if (table === 'goals') return resolved({ data: null, error: null });
        if (table === 'agent_teams') {
          const query = resolved({
            data: [{ id: 'team-native', name: 'Native Team' }],
            error: null,
          });
          query.update = vi.fn(() => resolved({ error: null }));
          return query;
        }
        if (table === 'agent_team_members') return resolved({ error: null });
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const result = await formTeam(
      admin,
      acceptedNativeGoal({ roles }),
      'user-1',
      agents.map((item) => item.id)
    );

    expect(result.members).toHaveLength(roles.length + 1);
    expect(result.members.map((item) => item.name)).toEqual(
      expect.arrayContaining([...roles, 'Team Lead'])
    );
  });

  it.each([
    ['reuses an existing goal-team identity', [{ id: 'team-existing', name: 'Old name' }]],
    ['proposes a new goal team without manufacturing an ID', []],
  ])('selects a roster without persistent side effects and %s', async (_label, existingTeams) => {
    const agents = [
      { id: 'analyst', name: 'Analyst', status: 'active' },
      { id: 'lead', name: 'Team Lead', status: 'active' },
    ];
    const touchedTables = [];
    const resolved = (value) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        limit: vi.fn(async () => value),
        then(resolve) {
          return Promise.resolve(value).then(resolve);
        },
      };
      return query;
    };
    const admin = {
      from: vi.fn((table) => {
        touchedTables.push(table);
        if (table === 'agents') return resolved({ data: agents, error: null });
        if (table === 'agent_performance' || table === 'agent_installed_skills') {
          return resolved({ data: [], error: null });
        }
        if (table === 'agent_teams') {
          return resolved({ data: existingTeams, error: null });
        }
        throw new Error(`Selection-only formTeam attempted a write-side table: ${table}`);
      }),
    };
    const goal = {
      id: 'goal-selection-only',
      title: 'Estonia cat-food distribution plan',
      tech_doc: { required_capabilities: ['Analyst'] },
      plan: { phases: [] },
      data: {},
    };

    const result = await formTeam(
      admin,
      goal,
      'user-1',
      agents.map((item) => item.id),
      { persistTeam: false }
    );

    expect(result.members.map((item) => item.id)).toEqual(['lead', 'analyst']);
    expect(result.leaderId).toBe('lead');
    expect(result.decisionLog).toMatchObject({
      requiredRoles: ['Analyst'],
      leader: 'Team Lead',
      unmatchedRoles: [],
    });
    expect(result.proposedTeam).toEqual({
      ...(existingTeams.length ? { id: 'team-existing' } : {}),
      user_id: 'user-1',
      goal_id: goal.id,
      name: 'Goal: Estonia cat-food distribution plan',
      description: 'Team for goal: Estonia cat-food distribution plan',
      leader_id: 'lead',
    });
    expect(result.teamId).toBe(existingTeams.length ? 'team-existing' : null);
    expect(touchedTables).toEqual([
      'agents',
      'agent_performance',
      'agent_installed_skills',
      'agent_teams',
    ]);
  });

  it('keeps unscoped selection-only formation read-only when specialist roles are missing', async () => {
    const agents = [
      { id: 'analyst', name: 'Analyst', status: 'active' },
      { id: 'lead', name: 'Team Lead', status: 'active' },
    ];
    const touchedTables = [];
    const agentInsert = vi.fn();
    const resolved = (value) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        limit: vi.fn(async () => value),
        then(resolve) {
          return Promise.resolve(value).then(resolve);
        },
      };
      return query;
    };
    const admin = {
      from: vi.fn((table) => {
        touchedTables.push(table);
        if (table === 'agents') {
          const query = resolved({ data: agents, error: null });
          query.insert = agentInsert;
          return query;
        }
        if (table === 'agent_performance' || table === 'agent_installed_skills') {
          return resolved({ data: [], error: null });
        }
        if (table === 'agent_teams') return resolved({ data: [], error: null });
        throw new Error(`Selection-only formTeam attempted a write-side table: ${table}`);
      }),
    };

    const result = await formTeam(
      admin,
      {
        id: 'goal-unscoped-selection-only',
        title: 'Estonia cat-food launch',
        tech_doc: { required_capabilities: ['Copywriter'] },
        plan: { phases: [] },
        data: {},
      },
      'user-1',
      null,
      { persistTeam: false }
    );

    expect(result.members.map((item) => item.id)).toEqual(['lead', 'analyst']);
    expect(result.decisionLog.unmatchedRoles).toContain('Copywriter');
    expect(agentInsert).not.toHaveBeenCalled();
    expect(touchedTables.filter((table) => table === 'agents')).toHaveLength(1);
    expect(touchedTables).toEqual([
      'agents',
      'agent_performance',
      'agent_installed_skills',
      'agent_teams',
    ]);
  });
});

// goalNeedsBrandResearch — heuristic that decides whether to auto-inject a
// phase-0 Brand & Site Research task. Must be conservative enough that
// internal refactor / docs / test goals don't pay for a research task, AND
// aggressive enough that any goal referencing an external brand triggers it
// (the failure mode we're guarding against — see goal f505dbeb post-mortem).
import { goalNeedsBrandResearch } from './team-assigner.js';

describe('goalNeedsBrandResearch', () => {
  it('matches an explicit https URL in the title', () => {
    expect(
      goalNeedsBrandResearch({
        title: 'Build a landing page at https://novajackpot30.com',
        description: '',
      })
    ).toBe(true);
  });

  it('matches a bare domain in common TLDs', () => {
    expect(
      goalNeedsBrandResearch({ title: 'Affiliate funnel for novajackpot30.com', description: '' })
    ).toBe(true);
    expect(
      goalNeedsBrandResearch({ title: 'Replicate stripe.com hero section', description: '' })
    ).toBe(true);
    expect(
      goalNeedsBrandResearch({ title: 'Casino lander pointing to example.bet', description: '' })
    ).toBe(true);
  });

  it('matches explicit affiliate / landing-page language without a URL', () => {
    expect(
      goalNeedsBrandResearch({ title: 'Build affiliate funnel for iGaming offer', description: '' })
    ).toBe(true);
    expect(
      goalNeedsBrandResearch({ title: 'Design a pre-lander for the launch', description: '' })
    ).toBe(true);
    expect(
      goalNeedsBrandResearch({ title: 'Site analysis for top competitor', description: '' })
    ).toBe(true);
  });

  it('does not treat a commercial conversion funnel as site research', () => {
    expect(
      goalNeedsBrandResearch({
        title: 'Bremen commercial AI consulting GTM',
        description:
          'Define a conversion funnel, KPIs, measurement methodology, and commercial risk matrix.',
      })
    ).toBe(false);
  });

  it.each([{ tool_mode: 'no_tools' }, { skip_tools: true }])(
    'does not add a browser-research specialist to a no-tools web goal: %j',
    (policy) => {
      expect(
        goalNeedsBrandResearch({
          title: 'Clone the landing page at https://example.com',
          description: 'Use the declared site as the visual reference.',
          data: policy,
        })
      ).toBe(false);
    }
  );

  it('matches when the trigger lives in the description, not the title', () => {
    expect(
      goalNeedsBrandResearch({
        title: 'New marketing experiment',
        description: "Build a landing page that mirrors novajackpot30.com's offer.",
      })
    ).toBe(true);
  });

  it('does NOT trigger on internal refactor / docs / test goals', () => {
    expect(goalNeedsBrandResearch({ title: 'Refactor execute-task tests', description: '' })).toBe(
      false
    );
    expect(goalNeedsBrandResearch({ title: 'Rename function getCwd', description: '' })).toBe(
      false
    );
    expect(goalNeedsBrandResearch({ title: 'Fix bug in self-healer', description: '' })).toBe(
      false
    );
  });

  it('returns false for nullish or empty input rather than throwing', () => {
    expect(goalNeedsBrandResearch(null)).toBe(false);
    expect(goalNeedsBrandResearch(undefined)).toBe(false);
    expect(goalNeedsBrandResearch({})).toBe(false);
    expect(goalNeedsBrandResearch({ title: '', description: '' })).toBe(false);
  });
});

describe('ensurePersistentAgentsForRoles roster capacity', () => {
  /**
   * Capture which roles reach the create path.
   *
   * Only the `agents` select matters here: whatever comes back as "existing" is
   * skipped, so returning none means every surviving role is one the roster
   * tried to create.
   */
  function adminSeeingNoExistingAgents(created) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [] }),
            in: () => Promise.resolve({ data: [] }),
          }),
        }),
        insert: (rows) => {
          (Array.isArray(rows) ? rows : [rows]).forEach((r) => created.push(r.name));
          return { select: () => Promise.resolve({ data: [] }) };
        },
      }),
    };
  }

  // Regression: the cap here was a flat 6, which was an exact no-op while the
  // roster was 5 roles plus a coordinator. Once dedupeExecutionRoles rose to
  // MAX_ROSTER_ROLES the slice began silently dropping roles, and because the
  // coordinator was appended last it went first — so any goal needing six or
  // more roles lost its Team Lead and stopped on team_coverage_incomplete.
  it('has room for a full roster plus the coordinator', async () => {
    const created = [];
    const roles = [
      'Team Lead',
      'Researcher',
      'Designer',
      'Frontend Developer',
      'Backend Developer',
      'QA Tester',
      'Copywriter',
      'Data Analyst',
      'Product Owner',
    ];
    await ensurePersistentAgentsForRoles(
      adminSeeingNoExistingAgents(created),
      'user-1',
      roles,
      'Goal'
    );
    expect(created.length).toBe(MAX_ROSTER_ROLES + 1);
  });

  it('never drops the coordinator, whatever else is competing for room', async () => {
    const created = [];
    const roles = ['Team Lead', ...Array.from({ length: 12 }, (_, i) => `Specialist ${i + 1}`)];
    await ensurePersistentAgentsForRoles(
      adminSeeingNoExistingAgents(created),
      'user-1',
      roles,
      'Goal'
    );
    expect(created).toContain('Team Lead');
  });
});
