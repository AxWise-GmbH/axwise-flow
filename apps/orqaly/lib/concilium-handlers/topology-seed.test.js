import {
  buildSeedGraph,
  layoutForest,
  buildSeededTopology,
  NODE_W,
  TREE_GUTTER,
} from './topology-seed.js';

const baseData = {
  orgs: [{ id: 'o1', name: 'Traktor', org_type: 'division', consilium_id: 'b1', is_active: true }],
  boards: [{ id: 'b1', name: 'Eval Board', status: 'active', llms: [{}, {}, {}] }],
  orgTeamMap: { o1: ['t1'] },
  teams: [{ id: 't1', name: 'Process', is_active: true }],
  teamMembersMap: { t1: ['m1', 'm2'] },
  members: [
    { id: 'm1', name: 'Chair', role: 'chairman', active: true, quarantined: false, concilium_id: 'b1' },
    { id: 'm2', name: 'Aud', role: 'auditor', active: true, quarantined: false, concilium_id: 'b1' },
  ],
};

describe('buildSeedGraph', () => {
  it('builds org -> consilium -> team -> agent nodes and edges', () => {
    const { nodes, edges } = buildSeedGraph(baseData);
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('org-o1');
    expect(ids).toContain('consilium-o1-b1');
    expect(ids).toContain('team-o1-t1');
    expect(ids).toContain('agent-o1-t1-m1');
    expect(ids).toContain('agent-o1-t1-m2');

    // edges connect the chain
    const pairs = edges.map((e) => `${e.source}->${e.target}`);
    expect(pairs).toContain('org-o1->consilium-o1-b1');
    expect(pairs).toContain('consilium-o1-b1->team-o1-t1');
    expect(pairs).toContain('team-o1-t1->agent-o1-t1-m1');
    expect(edges.every((e) => e.type === 'smoothstep')).toBe(true);
  });

  it('carries counts and status in node data', () => {
    const { nodes } = buildSeedGraph(baseData);
    const org = nodes.find((n) => n.id === 'org-o1');
    const cons = nodes.find((n) => n.id === 'consilium-o1-b1');
    const team = nodes.find((n) => n.id === 'team-o1-t1');
    expect(org.data.count).toBe(2); // 2 agents under the org
    expect(org.data.orgType).toBe('division');
    expect(cons.data.count).toBe(1); // 1 team
    expect(cons.data.subtitle).toContain('3 LLMs');
    expect(team.data.count).toBe(2);
    expect(team.data.statusKey).toBe('active');
  });

  it('omits the consilium node when the org is not linked to a board', () => {
    const data = { ...baseData, orgs: [{ id: 'o1', name: 'Solo', consilium_id: null }] };
    const { nodes, edges } = buildSeedGraph(data);
    expect(nodes.find((n) => n.type === 'consilium')).toBeUndefined();
    // team attaches directly to the org when there is no consilium
    expect(edges.map((e) => `${e.source}->${e.target}`)).toContain('org-o1->team-o1-t1');
  });

  it('renders a board with no orgs-... as a lone org node (empty org)', () => {
    const data = { ...baseData, orgTeamMap: { o1: [] } };
    const { nodes, edges } = buildSeedGraph(data);
    expect(nodes.find((n) => n.type === 'team')).toBeUndefined();
    expect(nodes.find((n) => n.type === 'agent')).toBeUndefined();
    expect(edges.map((e) => `${e.source}->${e.target}`)).toContain('org-o1->consilium-o1-b1');
  });

  it('drops unresolved members so counts stay consistent', () => {
    const data = { ...baseData, teamMembersMap: { t1: ['m1', 'ghost'] } };
    const { nodes } = buildSeedGraph(data);
    expect(nodes.find((n) => n.id === 'agent-o1-t1-ghost')).toBeUndefined();
    expect(nodes.filter((n) => n.type === 'agent')).toHaveLength(1);
  });

  it('gives the same member on two teams two distinct leaf nodes (stays a tree)', () => {
    const data = {
      ...baseData,
      orgTeamMap: { o1: ['t1', 't2'] },
      teams: [
        { id: 't1', name: 'A', is_active: true },
        { id: 't2', name: 'B', is_active: true },
      ],
      teamMembersMap: { t1: ['m1'], t2: ['m1'] },
      members: [{ id: 'm1', name: 'Shared', role: 'evaluator', active: true }],
    };
    const { nodes } = buildSeedGraph(data);
    expect(nodes.find((n) => n.id === 'agent-o1-t1-m1')).toBeDefined();
    expect(nodes.find((n) => n.id === 'agent-o1-t2-m1')).toBeDefined();
  });

  it('carries entityId on every node and conciliumId on agents (for click-to-edit)', () => {
    const { nodes } = buildSeedGraph(baseData);
    expect(nodes.find((n) => n.id === 'org-o1').data.entityId).toBe('o1');
    expect(nodes.find((n) => n.id === 'consilium-o1-b1').data.entityId).toBe('b1');
    expect(nodes.find((n) => n.id === 'team-o1-t1').data.entityId).toBe('t1');
    const agent = nodes.find((n) => n.id === 'agent-o1-t1-m1');
    expect(agent.data.entityId).toBe('m1');
    expect(agent.data.conciliumId).toBe('b1');
  });

  it('is deterministic', () => {
    expect(buildSeedGraph(baseData)).toEqual(buildSeedGraph(baseData));
  });
});

describe('layoutForest', () => {
  it('places a single node at the origin', () => {
    const out = layoutForest([{ id: 'org-o1', type: 'organization', data: {} }], []);
    expect(out[0].position).toEqual({ x: 0, y: 0 });
  });

  it('centers a parent over its two children and stacks depth on y', () => {
    const nodes = [
      { id: 'p', data: {} },
      { id: 'a', data: {} },
      { id: 'b', data: {} },
    ];
    const edges = [
      { source: 'p', target: 'a' },
      { source: 'p', target: 'b' },
    ];
    const out = layoutForest(nodes, edges);
    const pos = Object.fromEntries(out.map((n) => [n.id, n.position]));
    expect(pos.p.x).toBeCloseTo((pos.a.x + pos.b.x) / 2);
    expect(pos.a.y).toBeGreaterThan(pos.p.y);
  });

  it('lays out two org trees side by side without overlap', () => {
    const { nodes, edges } = buildSeedGraph({
      ...baseData,
      orgs: [
        { id: 'o1', name: 'A', consilium_id: 'b1', is_active: true },
        { id: 'o2', name: 'B', consilium_id: 'b1', is_active: true },
      ],
      orgTeamMap: { o1: ['t1'], o2: ['t1'] },
    });
    const out = layoutForest(nodes, edges);
    const pos = Object.fromEntries(out.map((n) => [n.id, n.position]));
    const tree1Max = Math.max(pos['org-o1'].x, pos['team-o1-t1'].x);
    const tree2Min = Math.min(pos['org-o2'].x, pos['team-o2-t1'].x);
    expect(tree2Min).toBeGreaterThanOrEqual(tree1Max + NODE_W + TREE_GUTTER - 1);
  });

  it('buildSeededTopology returns positioned nodes', () => {
    const { nodes } = buildSeededTopology(baseData);
    expect(nodes.every((n) => n.position && typeof n.position.x === 'number')).toBe(true);
  });
});
