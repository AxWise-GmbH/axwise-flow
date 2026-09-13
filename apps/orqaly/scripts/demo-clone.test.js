import { describe, expect, it } from 'vitest';
import {
  reparentGoal,
  reparentGoalLog,
  reparentTask,
  reparentLlm,
  reparentGoalMsg,
  reparentKb,
  clonedGoalId,
  isRichGoal,
} from './demo-clone.js';
import { SAFE_GOAL_STATUSES } from './demo-data.js';

const USER = '22222222-2222-5222-8222-222222222222';

describe('isRichGoal', () => {
  it('is true only for goals carrying real detail', () => {
    expect(isRichGoal({ plan: { phases: [{ name: 'P1' }] } })).toBe(true);
    expect(isRichGoal({ tech_doc: { a: 1 } })).toBe(true);
    expect(isRichGoal({ proposal: { a: 1 } })).toBe(true);
    expect(isRichGoal({ plan: {}, tech_doc: null, proposal: null })).toBe(false);
  });
});

describe('reparentGoal', () => {
  const src = {
    id: 'src-goal-1',
    user_id: 'someone-else',
    title: 'Casino Landing Page',
    status: 'active', // NOT inert — must be forced
    plan: { phases: [{ name: 'P1' }] },
    tech_doc: { spec: 'x' },
    proposal: { p: 1 },
    retrospective: { r: 1 },
    team_id: 'src-team',
    parent_goal_id: 'src-parent',
    workflow_id: 'src-wf',
    project_id: 'src-proj',
    data: { foo: 'bar' },
  };
  const out = reparentGoal(src, { demoUserId: USER, index: 0 });

  it('re-owns to the demo user with a deterministic new id', () => {
    expect(out.id).toBe(clonedGoalId(USER, 'src-goal-1'));
    expect(out.user_id).toBe(USER);
    expect(out.id).not.toBe(src.id);
  });

  it('forces an inert status (never active/planning/paused)', () => {
    expect(out.status).toBe('completed');
    expect(SAFE_GOAL_STATUSES.has(out.status)).toBe(true);
  });

  it('keeps an already-inert status as-is', () => {
    expect(
      reparentGoal({ ...src, status: 'needs_human' }, { demoUserId: USER, index: 1 }).status
    ).toBe('needs_human');
    expect(
      reparentGoal({ ...src, status: 'cancelled' }, { demoUserId: USER, index: 1 }).status
    ).toBe('cancelled');
  });

  it('reparents to a demo subsidiary and nulls source-scoped FKs', () => {
    expect(out.org_id).toBeTruthy();
    expect(out.agent_team_id).toBeTruthy();
    expect(out.concilium_id).toBeTruthy();
    expect(out.team_id).toBeNull();
    expect(out.parent_goal_id).toBeNull();
    expect(out.workflow_id).toBeNull();
    expect(out.project_id).toBeNull();
  });

  it('preserves the rich detail and tags the row', () => {
    expect(out.tech_doc).toEqual({ spec: 'x' });
    expect(out.proposal).toEqual({ p: 1 });
    expect(out.retrospective).toEqual({ r: 1 });
    expect(out.plan.phases).toHaveLength(1);
    expect(out.data.demo_seed).toBe(true);
    expect(out.data.cloned_from).toBe('src-goal-1');
    expect(out.data.foo).toBe('bar');
  });
});

describe('child reparenting', () => {
  const goalIdMap = { 'src-goal-1': clonedGoalId(USER, 'src-goal-1') };
  const newId = goalIdMap['src-goal-1'];

  it('remaps goal_log to the new goal id with a fresh id', () => {
    const r = reparentGoalLog(
      { id: 'l1', goal_id: 'src-goal-1', event_type: 'planning', details: {} },
      { goalIdMap }
    );
    expect(r.goal_id).toBe(newId);
    expect(r.id).not.toBe('l1');
    expect(r.event_type).toBe('planning');
  });

  it('gives tasks a demo-task- id, remaps goal, nulls source refs', () => {
    const r = reparentTask(
      {
        id: 't1',
        user_id: 'source-user',
        goal_id: 'src-goal-1',
        title: 'Build',
        prompt_version_id: 'pv',
        job_pool_id: 'jp',
        data: { goal_id: 'src-goal-1', output: 'Preserved artifact' },
      },
      { goalIdMap, demoUserId: USER }
    );
    expect(r.id.startsWith('demo-task-')).toBe(true);
    expect(r.user_id).toBe(USER);
    expect(r.goal_id).toBe(newId);
    expect(r.data).toEqual({ goal_id: newId, output: 'Preserved artifact' });
    expect(r.prompt_version_id).toBeNull();
    expect(r.job_pool_id).toBeNull();
  });

  it('re-owns llm_usage to the demo user and drops job_id', () => {
    const r = reparentLlm(
      { id: 'u1', goal_id: 'src-goal-1', job_id: 'j', provider: 'groq' },
      { goalIdMap, demoUserId: USER }
    );
    expect(r.user_id).toBe(USER);
    expect(r.goal_id).toBe(newId);
    expect(r.job_id).toBeNull();
    expect(r.provider).toBe('groq');
  });

  it('remaps goal_messages', () => {
    const r = reparentGoalMsg({ id: 'm1', goal_id: 'src-goal-1', message: 'hi' }, { goalIdMap });
    expect(r.goal_id).toBe(newId);
    expect(r.message).toBe('hi');
  });

  it('re-owns KB, remaps metadata.goal_id, and drops the source embedding', () => {
    const r = reparentKb(
      {
        id: 'k1',
        user_id: 'other',
        content: 'x'.repeat(4000),
        embedding: [0.1, 0.2],
        metadata: { goal_id: 'src-goal-1', k: 1 },
      },
      { goalIdMap, demoUserId: USER }
    );
    expect(r.user_id).toBe(USER);
    expect(r.metadata.goal_id).toBe(newId);
    expect(r.metadata.demo_seed).toBe(true);
    expect(r.embedding).toBeNull();
    expect(r.content.length).toBe(4000);
  });
});
