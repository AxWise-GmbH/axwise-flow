import { describe, expect, it } from 'vitest';
import {
  agentMatchesRequiredRole,
  pickBestAgent,
  planTaskExecutionRoles,
} from './team-assigner.js';
import { buildExecutionAuthorizationManifest } from './execution-authorization.js';

/**
 * Regression cover for production goal 1934706d-f1ac-4428-8096-f7488895a255.
 *
 * That goal reached Gate 2 with three task_agent_role_mismatch issues and could
 * never be approved, attended or not. The plan demanded three roles, the team
 * had none of them, and pickBestAgent bound the tasks anyway rather than
 * refusing. These are the exact strings from that goal.
 */
const PLAN_ROLES = [
  'Brand & UX Designer',
  'Business & Operations Developer',
  'QA Analyst & Business Auditor',
];

/** The six agents actually formed for that goal. */
const ROSTER = [
  { id: 'a-fin', name: 'Financial Modeler', category: 'Financial Modeler', capabilities: [] },
  { id: 'a-lead', name: 'Team Lead', category: 'Development', capabilities: [] },
  {
    id: 'a-supply',
    name: 'Supply Chain & Distribution Specialist',
    category: 'Supply Chain & Distribution Specialist',
    capabilities: [],
  },
  {
    id: 'a-market',
    name: 'Market Research Analyst',
    category: 'Market Research Analyst',
    capabilities: [],
  },
  {
    id: 'a-icp',
    name: 'Marketing/ICP Specialist',
    category: 'Marketing/ICP Specialist',
    capabilities: [],
  },
  {
    id: 'a-reg',
    name: 'Regulatory Compliance Advisor',
    category: 'Regulatory Compliance Advisor',
    capabilities: [],
  },
];

function goalWithPlan(roles = PLAN_ROLES) {
  return {
    id: 'goal-noodles',
    user_id: 'user-1',
    plan: {
      phases: roles.map((role, index) => ({
        name: `Phase ${index + 1}: ${['Designer', 'Developer', 'QA'][index] || 'Work'}`,
        jobs: [{ title: `Job ${index + 1}`, description: 'x', required_role: role }],
      })),
    },
  };
}

describe('the production failure this fix targets', () => {
  it('confirms no agent on that team can satisfy any of the three planned roles', () => {
    for (const role of PLAN_ROLES) {
      const satisfied = ROSTER.some((agent) => agentMatchesRequiredRole(agent, role));
      expect(satisfied, `expected no agent to satisfy "${role}"`).toBe(false);
    }
  });

  it('still binds an unrelated agent in permissive mode, which is what produced the mismatch', () => {
    // Documents the old behaviour so the strict-mode contract below is meaningful.
    const picked = pickBestAgent(ROSTER, 'Job 1 role: Brand & UX Designer', 'Brand & UX Designer');
    expect(picked).not.toBeNull();
    expect(agentMatchesRequiredRole(picked, 'Brand & UX Designer')).toBe(false);
  });

  it('refuses rather than mis-assigning when strict', () => {
    for (const role of PLAN_ROLES) {
      expect(pickBestAgent(ROSTER, `role: ${role}`, role, { strict: true })).toBeNull();
    }
  });

  it('keeps the permissive fallback for callers that have no required role', () => {
    const picked = pickBestAgent(ROSTER, 'some work', null, { strict: true });
    expect(picked).not.toBeNull();
  });
});

describe('planTaskExecutionRoles', () => {
  it('returns every distinct role the plan actually demands, in plan order', () => {
    const { roles } = planTaskExecutionRoles(goalWithPlan());
    expect(roles).toEqual(PLAN_ROLES);
  });

  it('collapses punctuation variants of one role rather than minting two agents', () => {
    // The f24a9cda case: these are the same role and must not become two.
    const { roles } = planTaskExecutionRoles(
      goalWithPlan(['Marketing/ICP Specialist', 'Marketing ICP Specialist'])
    );
    expect(roles).toHaveLength(1);
  });

  it('separates coordinator roles so they never own a task', () => {
    const { roles, leadershipRoles } = planTaskExecutionRoles(
      goalWithPlan(['Team Lead', 'Brand & UX Designer'])
    );
    expect(leadershipRoles).toEqual(['Team Lead']);
    expect(roles).toEqual(['Brand & UX Designer']);
  });

  it('tolerates a goal with no plan yet', () => {
    expect(planTaskExecutionRoles({}).roles).toEqual([]);
    expect(planTaskExecutionRoles(null).roles).toEqual([]);
  });
});

describe('the authorization gate, unchanged', () => {
  it('rejects the exact task rows that goal persisted', () => {
    // Proves the gate was right to refuse: this is the failure we fix upstream,
    // not by relaxing the check.
    const tasks = PLAN_ROLES.map((role, index) => ({
      id: `task-${index}`,
      goal_id: 'goal-noodles',
      status: 'planned',
      agent_id: 'a-market',
      data: { goal_id: 'goal-noodles', required_role: role },
    }));
    const manifest = buildExecutionAuthorizationManifest({
      goal: { id: 'goal-noodles', agent_team_id: 'team-1', data: { tool_mode: 'no_tools' } },
      teamMembers: ROSTER.map((a) => ({ member_id: a.id, role: 'member' })),
      tasks,
      agents: ROSTER,
    });

    expect(manifest.valid).toBe(false);
    expect(manifest.issues.filter((i) => i.code === 'task_agent_role_mismatch')).toHaveLength(3);
  });

  it('accepts the same tasks once each is bound to an agent that can do the role', () => {
    const staffed = PLAN_ROLES.map((role, index) => ({
      id: `agent-${index}`,
      name: role,
      category: role,
      capabilities: [role],
    }));
    const tasks = PLAN_ROLES.map((role, index) => ({
      id: `task-${index}`,
      goal_id: 'goal-noodles',
      status: 'planned',
      agent_id: `agent-${index}`,
      data: { goal_id: 'goal-noodles', required_role: role },
    }));
    const manifest = buildExecutionAuthorizationManifest({
      goal: { id: 'goal-noodles', agent_team_id: 'team-1', data: { tool_mode: 'no_tools' } },
      teamMembers: staffed.map((a) => ({ member_id: a.id, role: 'member' })),
      tasks,
      agents: staffed,
    });

    expect(manifest.issues).toEqual([]);
    expect(manifest.valid).toBe(true);
  });
});
