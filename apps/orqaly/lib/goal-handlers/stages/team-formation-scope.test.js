import { describe, expect, it, vi } from 'vitest';
import {
  evaluateOrganizationTeamCoverage,
  loadDirectFallbackAgents,
  loadOrganizationAgentIds,
  materializeOrganizationAgentScope,
  requiresOrganizationAgentScope,
  teamFormationReviewState,
} from './team-formation.js';

function scopedGoal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    org_id: 'org-1',
    executor_type: 'organization',
    ...overrides,
  };
}

function queryResult(result) {
  const filters = [];
  const query = {
    filters,
    select: vi.fn(() => query),
    eq: vi.fn((column, value) => {
      filters.push(['eq', column, value]);
      return query;
    }),
    in: vi.fn((column, value) => {
      filters.push(['in', column, value]);
      return query;
    }),
    limit: vi.fn(async () => result),
    then: (resolve) => resolve(result),
  };
  return query;
}

describe('team formation organization scope', () => {
  it('does not claim a Consilium review before phase evaluation runs', () => {
    expect(teamFormationReviewState(scopedGoal({ mode: 'advanced', concilium_id: null }))).toEqual({
      consilium_reviewed: false,
      consilium_review_pending: false,
    });
    expect(
      teamFormationReviewState(scopedGoal({ mode: 'advanced', concilium_id: 'board-1' }))
    ).toEqual({
      consilium_reviewed: false,
      consilium_review_pending: true,
    });
  });

  it('requires strict scope for every executor inside an organization workspace', () => {
    expect(requiresOrganizationAgentScope(scopedGoal())).toBe(true);
    expect(requiresOrganizationAgentScope(scopedGoal({ executor_type: 'consilium' }))).toBe(true);
    expect(requiresOrganizationAgentScope(scopedGoal({ executor_type: null }))).toBe(true);
    expect(requiresOrganizationAgentScope(scopedGoal({ executor_type: 'agent' }))).toBe(true);
    expect(requiresOrganizationAgentScope(scopedGoal({ executor_type: 'team' }))).toBe(true);
    expect(requiresOrganizationAgentScope(scopedGoal({ org_id: null }))).toBe(false);
  });

  it('loads organization membership with both organization and owner filters', async () => {
    const query = queryResult({
      data: [{ agent_id: 'agent-2' }, { agent_id: 'agent-1' }, { agent_id: 'agent-2' }],
      error: null,
    });
    const admin = { from: vi.fn(() => query) };

    await expect(loadOrganizationAgentIds(admin, scopedGoal())).resolves.toEqual([
      'agent-2',
      'agent-1',
    ]);
    expect(admin.from).toHaveBeenCalledWith('org_agents');
    expect(query.filters).toEqual([
      ['eq', 'org_id', 'org-1'],
      ['eq', 'user_id', 'user-1'],
    ]);
  });

  it('surfaces membership lookup errors instead of treating scope as optional', async () => {
    const query = queryResult({ data: null, error: { message: 'mapping unavailable' } });

    await expect(loadOrganizationAgentIds({ from: () => query }, scopedGoal())).rejects.toThrow(
      'Unable to verify organization agent membership: mapping unavailable'
    );
  });

  it('does not query or return user-wide fallback agents for an empty organization', async () => {
    const admin = { from: vi.fn() };

    await expect(loadDirectFallbackAgents(admin, scopedGoal(), [])).resolves.toEqual([]);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('loads fallback agents only from the mapped organization IDs', async () => {
    const query = queryResult({
      data: [
        {
          id: 'agent-2',
          name: 'Scoped Analyst',
          category: 'analyst',
          capabilities: [],
          metadata: {},
        },
      ],
      error: null,
    });
    const admin = { from: vi.fn(() => query) };

    const agents = await loadDirectFallbackAgents(admin, scopedGoal(), ['agent-1', 'agent-2'], 500);

    expect(agents).toEqual([expect.objectContaining({ id: 'agent-2', agent_type: 'analyst' })]);
    expect(query.filters).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['eq', 'status', 'active'],
      ['in', 'id', ['agent-1', 'agent-2']],
    ]);
    expect(query.limit).toHaveBeenCalledWith(500);
  });

  it('re-verifies ownership and maps five persistent specialists plus a coordinator', async () => {
    const agents = [
      { id: 'marketing', name: 'Marketing ICP Specialist', status: 'active' },
      { id: 'finance', name: 'Finance Pricing Specialist', status: 'active' },
      { id: 'legal', name: 'GDPR Legal Compliance Specialist', status: 'active' },
      { id: 'sales', name: 'Business Development Sales Specialist', status: 'active' },
      { id: 'risk', name: 'Commercial Risk Analyst', status: 'active' },
      { id: 'lead', name: 'Team Lead', status: 'active' },
    ];
    const organizationFilters = [];
    const mappedRows = [];
    const admin = {
      from: vi.fn((table) => {
        if (table === 'organizations') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn((column, value) => {
              organizationFilters.push([column, value]);
              return query;
            }),
            maybeSingle: vi.fn(async () => ({ data: { id: 'org-1' }, error: null })),
          };
          return query;
        }
        if (table === 'agents') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            then(resolve) {
              return Promise.resolve({ data: agents, error: null }).then(resolve);
            },
          };
          return query;
        }
        if (table === 'org_agents') {
          return {
            upsert: vi.fn(async (rows) => {
              mappedRows.push(...rows);
              return { error: null };
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const goal = scopedGoal({
      title: 'Bremen commercial GTM',
      tech_doc: {
        required_capabilities: [
          'marketing_icp_specialist',
          'finance_pricing_specialist',
          'gdpr_legal_compliance_specialist',
          'business_development_sales_specialist',
          'commercial_risk_analyst',
        ],
      },
    });

    const result = await materializeOrganizationAgentScope(admin, goal);

    expect(organizationFilters).toEqual([
      ['id', 'org-1'],
      ['user_id', 'user-1'],
      ['is_active', true],
    ]);
    // The coordinator leads the roster: 'Team Lead' is requested first so a
    // capacity cap can never truncate it away.
    expect(result.mappedAgentIds).toEqual([
      'lead',
      'marketing',
      'finance',
      'legal',
      'sales',
      'risk',
    ]);
    expect(result.missingRoles).toEqual([]);
    expect(mappedRows).toHaveLength(6);
    expect(mappedRows).toEqual(
      expect.arrayContaining([
        { user_id: 'user-1', org_id: 'org-1', agent_id: 'lead' },
        { user_id: 'user-1', org_id: 'org-1', agent_id: 'legal' },
      ])
    );
  });

  it('creates missing persistent specialists before mapping them into the verified org', async () => {
    const createdRows = [];
    const mappedRows = [];
    const admin = {
      from: vi.fn((table) => {
        if (table === 'organizations') {
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({ data: { id: 'org-1' }, error: null })),
          };
          return query;
        }
        if (table === 'agents') {
          const readQuery = {
            select: vi.fn(() => readQuery),
            eq: vi.fn(() => readQuery),
            insert: vi.fn((rows) => {
              createdRows.push(...rows);
              return {
                select: vi.fn(async () => ({
                  data: rows.map((row, index) => ({ ...row, id: `created-${index + 1}` })),
                  error: null,
                })),
              };
            }),
            then(resolve) {
              return Promise.resolve({ data: [], error: null }).then(resolve);
            },
          };
          return readQuery;
        }
        if (table === 'org_agents') {
          return {
            upsert: vi.fn(async (rows) => {
              mappedRows.push(...rows);
              return { error: null };
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const goal = scopedGoal({
      title: 'Bremen pricing package',
      tech_doc: { required_capabilities: ['finance_pricing_specialist'] },
    });

    const result = await materializeOrganizationAgentScope(admin, goal);

    expect(createdRows).toHaveLength(2);
    expect(createdRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Finance Pricing Specialist',
          user_id: 'user-1',
          description: expect.stringMatching(/fixed-price EUR service packages/i),
        }),
        expect.objectContaining({ name: 'Team Lead', user_id: 'user-1' }),
      ])
    );
    expect(result).toMatchObject({
      mappedAgentIds: ['created-1', 'created-2'],
      missingRoles: [],
    });
    expect(mappedRows).toHaveLength(2);
  });

  it('fails closed before reading or mapping agents for a foreign organization', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const admin = { from: vi.fn(() => query) };

    await expect(
      materializeOrganizationAgentScope(admin, scopedGoal({ org_id: 'org-foreign' }))
    ).rejects.toThrow(/inactive or is not owned/i);
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('reports actionable missing specialists instead of allowing fallback assignment', () => {
    const goal = scopedGoal({
      tech_doc: {
        required_capabilities: [
          'marketing_icp_specialist',
          'finance_pricing_specialist',
          'gdpr_legal_compliance_specialist',
          'business_development_sales_specialist',
          'commercial_risk_analyst',
        ],
      },
    });
    const coverage = evaluateOrganizationTeamCoverage(goal, [
      { id: 'marketing', name: 'Marketing ICP Specialist' },
      { id: 'qa', name: 'QA Tester' },
      { id: 'lead', name: 'Team Lead' },
    ]);

    expect(coverage.complete).toBe(false);
    expect(coverage.coordinatorPresent).toBe(true);
    expect(coverage.missingRoles).toEqual([
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ]);
  });
});
