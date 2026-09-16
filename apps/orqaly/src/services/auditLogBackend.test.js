import { describe, it, expect, vi } from 'vitest';

// Mock supabase with table-aware chainable builders that model each real chain:
// - knowledge_documents: terminal `.range()` (no `.in()` — so a misuse would throw).
// - audit_log: `.in('entity', ...)` then terminal `.range()`.
// - agents: terminal `.in('id', ids)` that actually FILTERS by the ids passed, so a
//   broken owner_id extraction returns no match and the assertions fail.
vi.mock('../lib/supabase', () => {
  // knowledge_documents shape (loadKnowledgeOperations). metadata.agent_name is
  // deliberately DIFFERENT from the agents row's name, so an assertion of the
  // agents name only passes if the owner_id -> agents join actually resolved
  // (and didn't silently fall back to metadata).
  const kbRows = [
    {
      id: '1',
      title: 'Spec',
      category: 'agent-report', // docToType -> 'Reports'
      content_type: 'note',
      owner_type: 'agent',
      owner_id: 'a1',
      tags: [],
      metadata: { agent_name: 'Meta Fallback Name' },
      created_at: '2026-06-26T10:00:00.000Z',
      updated_at: '2026-06-26T10:00:00.000Z', // == created -> action 'create'
    },
    {
      id: '2',
      title: 'Q3',
      category: 'goal-plan', // docToType -> 'Goals'
      content_type: 'note',
      owner_type: 'user',
      owner_id: null,
      tags: [],
      metadata: {},
      created_at: '2026-06-26T09:00:00.000Z',
      updated_at: '2026-06-26T12:00:00.000Z', // edited after create -> action 'write'
    },
  ];
  // agents lookup result for owner_id 'a1'.
  const agentRows = [{ id: 'a1', name: 'Backend Developer', category: 'Development' }];
  // audit_log shape (loadActivityOperations).
  const auditRows = [
    {
      id: '1',
      action: 'create',
      entity: 'Job', // Activity instrument -> "Jobs"
      entity_id: 'd1',
      user_email: 'owner@example.com',
      details: JSON.stringify({ type: 'Documents', agent_name: 'Growth Agent', title: 'Spec' }),
      created_at: '2026-06-26T10:00:00.000Z',
      actor_type: 'agent',
      agent_id: 'a1',
      agent_name: 'Growth Agent',
    },
    {
      id: '2',
      action: 'Knowledge updated', // legacy label -> normalized to 'write'
      entity: 'Task', // Activity instrument -> "Tasks"
      entity_id: 'd2',
      user_email: 'owner@example.com',
      details: JSON.stringify({ type: 'Reports' }),
      created_at: '2026-06-26T09:00:00.000Z',
      actor_type: 'user',
      agent_id: null,
      agent_name: null,
    },
  ];

  // Source-table rows for loadAgentOperations. team_tasks: one agent-owned (join
  // resolves real name+role), one with no agent_id (falls back to assigned_to)
  // and edited after creation -> 'write'.
  const taskRows = [
    {
      id: 't1',
      title: 'Build landing page',
      agent_id: 'a1',
      assigned_to: 'Frontend Developer',
      created_by: null,
      created_at: '2026-06-26T11:00:00.000Z',
      updated_at: '2026-06-26T11:00:00.000Z', // == created -> 'create'
    },
    {
      id: 't2',
      title: 'Write copy',
      agent_id: null,
      assigned_to: 'Copywriter',
      created_by: 'Copywriter',
      created_at: '2026-06-26T08:00:00.000Z',
      updated_at: '2026-06-26T12:30:00.000Z', // edited -> 'write'
    },
  ];
  const reportRows = [
    {
      id: 'r1',
      agent_id: 'c1',
      report_type: 'completion',
      summary: 'Phase done',
      created_at: '2026-06-26T13:00:00.000Z', // newest -> sorts first
    },
  ];
  const workflowRows = [
    {
      id: 'w1',
      name: 'Goal workflow',
      data: { goal_id: 'g1' },
      created_at: '2026-06-26T10:30:00.000Z',
      updated_at: '2026-06-26T10:30:00.000Z', // == created -> 'create'
    },
  ];
  const projectRows = [
    {
      id: 'p1',
      name: 'Goal project',
      data: { goal_id: 'g1' },
      created_at: '2026-06-26T07:00:00.000Z',
      updated_at: '2026-06-26T09:30:00.000Z', // edited -> 'write'
    },
  ];
  // concilium_agents lookup for report author 'c1'.
  const conciliumAgentRows = [{ id: 'c1', name: 'Auditor' }];

  // knowledge_documents: select -> order -> range. No `.in()` — calling it would throw.
  const kbBuilder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      range: () => Promise.resolve({ data: kbRows, error: null }),
    };
    return b;
  };
  // audit_log: select -> in('entity', ...) -> order -> range.
  const auditBuilder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      range: () => Promise.resolve({ data: auditRows, error: null }),
    };
    return b;
  };
  // agents: terminal `.in('id', ids)` that filters agentRows by the ids passed,
  // so a wrong/empty owner_id extraction resolves to no match (assertions fail).
  const agentsBuilder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      in: (_col, ids) =>
        Promise.resolve({ data: agentRows.filter((a) => ids.includes(a.id)), error: null }),
    };
    return b;
  };
  // concilium_agents: terminal `.in('id', ids)`, filtered like the agents join.
  const conciliumAgentsBuilder = () => {
    const b = {
      select: () => b,
      in: (_col, ids) =>
        Promise.resolve({
          data: conciliumAgentRows.filter((a) => ids.includes(a.id)),
          error: null,
        }),
    };
    return b;
  };
  // Source tables for loadAgentOperations. team_tasks/concilium_agent_reports:
  // select -> order -> range. workflows/projects add a `.not()` filter.
  const tableBuilder = (rows) => () => {
    const b = {
      select: () => b,
      not: () => b,
      order: () => b,
      range: () => Promise.resolve({ data: rows, error: null }),
    };
    return b;
  };
  const from = (table) => {
    if (table === 'agents') return agentsBuilder();
    if (table === 'concilium_agents') return conciliumAgentsBuilder();
    if (table === 'knowledge_documents') return kbBuilder();
    if (table === 'team_tasks') return tableBuilder(taskRows)();
    if (table === 'concilium_agent_reports') return tableBuilder(reportRows)();
    if (table === 'workflows') return tableBuilder(workflowRows)();
    if (table === 'projects') return tableBuilder(projectRows)();
    return auditBuilder(); // audit_log
  };
  return { supabase: { from }, hasSupabase: () => true };
});

import {
  loadKnowledgeOperations,
  loadActivityOperations,
  loadAgentOperations,
} from './auditLogBackend.js';

describe('loadKnowledgeOperations', () => {
  it('maps knowledge_documents rows to the Data Operations shape, resolving agent name + role', async () => {
    const ops = await loadKnowledgeOperations({ limit: 12 });
    expect(ops).toHaveLength(2);
    // Agent-authored doc: owner_id 'a1' resolves through the agents join to the
    // real name + role (NOT the differing metadata.agent_name fallback), clickable
    // via agentId. agentName 'Backend Developer' + agentPosition 'Development' both
    // come only from the agents row, so this fails if the join is dropped.
    expect(ops[0]).toMatchObject({
      type: 'Reports',
      name: 'Spec', // the document title
      action: 'create',
      agentName: 'Backend Developer',
      agentPosition: 'Development',
      agentId: 'a1',
      user: '', // account email is injected later by useHomeData
    });
    // User-authored doc: no agent, edited after creation -> action 'write'.
    expect(ops[1]).toMatchObject({
      type: 'Goals',
      name: 'Q3',
      action: 'write',
      agentName: '',
      agentPosition: '',
      agentId: '',
      user: '',
    });
  });
});

describe('loadActivityOperations', () => {
  it('maps rows to Persona/Instrument/Action/Date with agent vs user personas', async () => {
    const ops = await loadActivityOperations({ limit: 8 });
    expect(ops).toHaveLength(2);
    // Agent actor -> persona is the agent, clickable via agentId.
    expect(ops[0]).toMatchObject({
      instrument: 'Jobs',
      action: 'create',
      personaName: 'Growth Agent',
      personaKind: 'Agent',
      agentId: 'a1',
    });
    // User actor -> persona is the user email, not an agent.
    expect(ops[1]).toMatchObject({
      instrument: 'Tasks',
      action: 'write',
      personaName: 'owner@example.com',
      personaKind: 'User',
      agentId: '',
    });
  });
});

describe('loadAgentOperations', () => {
  it('reads the source tables and maps agent CRUD into the Activity shape', async () => {
    const ops = await loadAgentOperations({ limit: 50 });
    // tasks(2) + reports(1) + workflows(1) + projects(1)
    expect(ops).toHaveLength(5);
    // Every row is an agent operation.
    expect(ops.every((o) => o.personaKind === 'Agent')).toBe(true);
    // Sorted newest-first by date.
    const dates = ops.map((o) => new Date(o.date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));

    const byId = Object.fromEntries(ops.map((o) => [o.id, o]));
    // Agent-owned task: agent_id 'a1' resolves through the agents join to the
    // real name + role, clickable via agentId; created==updated -> 'create'.
    expect(byId.t1).toMatchObject({
      instrument: 'Tasks',
      action: 'create',
      personaName: 'Backend Developer',
      personaPosition: 'Development',
      agentId: 'a1',
    });
    // Task with no agent_id falls back to assigned_to; edited -> 'write'.
    expect(byId.t2).toMatchObject({
      instrument: 'Tasks',
      action: 'write',
      personaName: 'Copywriter',
      agentId: '',
    });
    // Report: always 'create', name resolved via concilium_agents.
    expect(byId.r1).toMatchObject({
      instrument: 'Reports',
      action: 'create',
      personaName: 'Auditor',
      agentId: 'c1',
    });
    // Workflow/Project from a goal run: generic planning persona, no agentId.
    expect(byId.w1).toMatchObject({
      instrument: 'Workflow',
      action: 'create',
      personaName: 'Project Manager',
      agentId: '',
    });
    expect(byId.p1).toMatchObject({
      instrument: 'Projects',
      action: 'write',
      personaName: 'Project Manager',
      agentId: '',
    });
  });
});
