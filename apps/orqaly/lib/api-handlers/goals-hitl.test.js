import { describe, expect, it, vi } from 'vitest';
import { handleCreateSmartRequestDraft } from './goals.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Minimal admin stub for the Smart Request draft path: the org ownership
 * check, the agent catalogue check, the goals insert, and the goal_log write.
 */
function draftAdmin() {
  const insertedGoals = [];
  return {
    insertedGoals,
    from: vi.fn((table) => {
      if (table === 'organizations') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { id: ORG_ID }, error: null })),
        };
        return query;
      }
      if (table === 'org_agents') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          then(resolve) {
            return Promise.resolve({ data: [{ agent_id: 'agent-1' }], error: null }).then(resolve);
          },
        };
        return query;
      }
      if (table === 'agents') {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(async () => ({ data: [{ id: 'agent-1' }], error: null })),
        };
        return query;
      }
      if (table === 'goals') {
        return {
          insert: vi.fn((payload) => {
            insertedGoals.push(payload);
            const query = {
              select: vi.fn(() => query),
              single: vi.fn(async () => ({
                data: {
                  id: 'goal-1',
                  ...payload,
                  loop_chain_root_id: 'goal-1',
                  created_at: '2026-08-20T00:00:00.000Z',
                },
                error: null,
              })),
            };
            return query;
          }),
        };
      }
      if (table === 'goal_log') {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      throw new Error(`Unexpected table access: ${table}`);
    }),
  };
}

function createDraft(body) {
  const admin = draftAdmin();
  return handleCreateSmartRequestDraft(
    admin,
    { id: 'user-1' },
    {
      title: 'Human approve draft',
      org_id: ORG_ID,
      ...body,
    }
  ).then((result) => ({ admin, result }));
}

describe('handleCreateSmartRequestDraft, hitl_mode', () => {
  it('persists an explicit unattended request', async () => {
    const { admin, result } = await createDraft({ hitl_mode: 'unattended' });

    expect(result.status).toBe(201);
    expect(admin.insertedGoals[0].hitl_mode).toBe('unattended');
  });

  it('defaults to checkpoints when the caller says nothing', async () => {
    // Every pre-dialog caller (assistant bridge, pulses, older bundles) lands
    // here. They must keep waiting for a human.
    const { admin } = await createDraft({});

    expect(admin.insertedGoals[0].hitl_mode).toBe('checkpoints');
  });

  it.each([['nonsense'], [true], [null], ['UNATTENDED'], [1]])(
    'normalizes the unrecognized value %s to checkpoints',
    async (value) => {
      const { admin } = await createDraft({ hitl_mode: value });

      expect(admin.insertedGoals[0].hitl_mode).toBe('checkpoints');
    }
  );

  it('is independent of goal mode', async () => {
    const simple = await createDraft({ hitl_mode: 'unattended', mode: 'simple' });
    const advanced = await createDraft({ hitl_mode: 'unattended', mode: 'advanced' });

    expect(simple.admin.insertedGoals[0].mode).toBe('simple');
    expect(advanced.admin.insertedGoals[0].mode).toBe('advanced');
    expect(simple.admin.insertedGoals[0].hitl_mode).toBe('unattended');
    expect(advanced.admin.insertedGoals[0].hitl_mode).toBe('unattended');
  });

  it('does not disturb execution_mode', async () => {
    // execution_mode drives a different decision in feasibility-analysis and
    // must not be repurposed by the Human Approve switch.
    const { admin } = await createDraft({ hitl_mode: 'unattended' });

    expect(admin.insertedGoals[0].execution_mode).toBe('auto');
  });
});
