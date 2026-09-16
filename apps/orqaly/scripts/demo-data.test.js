import { describe, expect, it } from 'vitest';
import { buildDemoModel, stableUuid, demoSubOrgId } from './demo-data.js';

const USER = '11111111-1111-5111-8111-111111111111';
// Stand-in for the cloned goals the runner passes in (shape used by page records).
const CLONED = [
  { id: 'cg-1', title: 'Casino Landing Page', org_id: demoSubOrgId(USER, 'ecom'), status: 'completed', budget_usd: 100, spent_usd: 80 },
  { id: 'cg-2', title: 'Dog Bottle Landing Page', org_id: demoSubOrgId(USER, 'media'), status: 'needs_human', budget_usd: 60, spent_usd: 20 },
  { id: 'cg-3', title: 'Crypto Wallet Page', org_id: demoSubOrgId(USER, 'logi'), status: 'completed', budget_usd: 90, spent_usd: 70 },
];
const model = buildDemoModel({ userId: USER, baseEpochMs: 1_700_000_000_000, clonedGoals: CLONED });

describe('stableUuid', () => {
  it('is deterministic and valid-format', () => {
    expect(stableUuid('a')).toBe(stableUuid('a'));
    expect(stableUuid('a')).not.toBe(stableUuid('b'));
    expect(stableUuid('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('buildDemoModel structure', () => {
  it('requires a userId', () => {
    expect(() => buildDemoModel({})).toThrow();
  });

  it('builds 1 holding and 4 subsidiaries under it', () => {
    expect(model.organizations).toHaveLength(5);
    const holding = model.organizations.find((o) => o.org_type === 'holding');
    const subs = model.organizations.filter((o) => o.org_type === 'subsidiary');
    expect(subs).toHaveLength(4);
    subs.forEach((s) => expect(s.parent_id).toBe(holding.id));
  });

  it('builds 11 teams and 55 agents, each team led by a real agent', () => {
    expect(model.teams).toHaveLength(11);
    expect(model.agents).toHaveLength(55);
    const agentIds = new Set(model.agents.map((a) => a.id));
    model.teams.forEach((t) => expect(agentIds.has(t.leader_id)).toBe(true));
  });

  it('builds 5 boards with 25 members, LLMs, criteria and evaluations', () => {
    expect(model.boards).toHaveLength(5);
    expect(model.members).toHaveLength(25);
    model.boards.forEach((b) => expect(b.llms.length).toBeGreaterThan(0)); // fixes "0 LLMs"
    expect(model.criteria).toHaveLength(20); // 4 per board → Criteria tab
    expect(model.evaluations).toHaveLength(30); // 6 per board → Analytics/Consilium tabs
    const roles = new Set(['chairman', 'evaluator', 'auditor', 'specialist', 'observer']);
    model.members.forEach((m) => {
      expect(roles.has(m.role)).toBe(true);
      expect(m.skills.length).toBeGreaterThan(0); // Core tab
      expect(m.resume).toBeTruthy();
    });
  });

  it('links every agent to an org via org_agents (fixes "0 agents")', () => {
    const agentIds = new Set(model.agents.map((a) => a.id));
    expect(model.orgAgents.length).toBe(55);
    model.orgAgents.forEach((oa) => expect(agentIds.has(oa.agent_id)).toBe(true));
  });

  it('fills communicator, assistant and every side page', () => {
    expect(model.channels.length).toBeGreaterThan(0);
    expect(model.notificationLog.length).toBeGreaterThan(0);
    expect(model.assistantSetup).toHaveLength(1); // Assistant page reads assistant_setup
    expect(model.comms.length).toBeGreaterThan(0);
    expect(model.partners.length).toBeGreaterThan(0);
    expect(model.businesses.length).toBeGreaterThan(0);
    expect(model.investors.length).toBeGreaterThan(0);
    expect(model.deals.length).toBeGreaterThan(0);
    expect(model.contacts.length).toBeGreaterThan(0);
    expect(model.blueprints.length).toBeGreaterThan(0);
    expect(model.savedDashboards.length).toBeGreaterThan(0);
    expect(model.humanTasks.every((t) => t.status === 'completed')).toBe(true);
  });

  it('references the cloned goals from page records', () => {
    const goalIds = new Set(CLONED.map((g) => g.id));
    // revenue + spend per cloned goal
    expect(model.financialEvents).toHaveLength(CLONED.length * 2);
    model.financialEvents.forEach((f) => expect(goalIds.has(f.goal_id)).toBe(true));
    model.leads.forEach((l) => expect(goalIds.has(l.goal_id)).toBe(true));
    // marketplace listings only for completed cloned goals
    const completed = CLONED.filter((g) => g.status === 'completed');
    expect(model.marketplaceListings).toHaveLength(completed.length);
  });

  it('scopes user-owned rows to the demo user', () => {
    ['organizations', 'boards', 'teams', 'agents', 'criteria', 'evaluations', 'assistantSetup'].forEach((key) => {
      model[key].forEach((row) => expect(row.user_id).toBe(USER));
    });
    model.savedDashboards.forEach((d) => expect(d.owner_user_id).toBe(USER));
    model.partners.forEach((p) => expect(p.id.startsWith('demo-partner-')).toBe(true));
  });

  it('is deterministic across builds', () => {
    const again = buildDemoModel({ userId: USER, baseEpochMs: 1_700_000_000_000, clonedGoals: CLONED });
    expect(again.agents.map((a) => a.id)).toEqual(model.agents.map((a) => a.id));
    expect(again.organizations.map((o) => o.id)).toEqual(model.organizations.map((o) => o.id));
  });

  it('tolerates an empty clonedGoals list', () => {
    const empty = buildDemoModel({ userId: USER, baseEpochMs: 1_700_000_000_000 });
    expect(empty.organizations).toHaveLength(5);
    expect(empty.financialEvents).toHaveLength(0);
    expect(empty.marketplaceListings).toHaveLength(0);
  });
});
