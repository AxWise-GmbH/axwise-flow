import { describe, expect, it, vi } from 'vitest';

import { executeWorkflow, normalizeWorkflowTriggerData } from './runner.js';

function scopedLookupAdmin({ workflow = null, goal = null } = {}) {
  const filters = [];
  const from = vi.fn((table) => {
    const chain = {
      select: () => chain,
      eq: (field, value) => {
        filters.push([table, field, value]);
        return chain;
      },
      maybeSingle: async () => ({
        data: table === 'workflows' ? workflow : table === 'goals' ? goal : null,
        error: null,
      }),
    };
    return chain;
  });
  return { admin: { from }, filters, from };
}

describe('workflow runner tenant boundary', () => {
  it('requires a trusted nonempty owner before any service-role lookup', async () => {
    const { admin, from } = scopedLookupAdmin();

    await expect(executeWorkflow(admin, { workflowId: 'workflow-1', userId: '' })).rejects.toThrow(
      'Missing workflow userId'
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('scopes the workflow lookup by the trusted owner', async () => {
    const { admin, filters } = scopedLookupAdmin({ workflow: null });

    await expect(
      executeWorkflow(admin, { workflowId: 'workflow-foreign', userId: 'user-1' })
    ).rejects.toThrow('Workflow not found: workflow-foreign');
    expect(filters).toContainEqual(['workflows', 'id', 'workflow-foreign']);
    expect(filters).toContainEqual(['workflows', 'user_id', 'user-1']);
  });

  it('rejects a trigger goal that is not owned by the workflow owner', async () => {
    const { admin, filters, from } = scopedLookupAdmin({
      workflow: { id: 'workflow-1', name: 'Owned', data: { nodes: [], edges: [] } },
      goal: null,
    });

    await expect(
      executeWorkflow(admin, {
        workflowId: 'workflow-1',
        userId: 'user-1',
        triggerData: { goalId: 'goal-foreign' },
      })
    ).rejects.toThrow('Workflow goal not found');
    expect(filters).toContainEqual(['goals', 'id', 'goal-foreign']);
    expect(filters).toContainEqual(['goals', 'user_id', 'user-1']);
    expect(from).not.toHaveBeenCalledWith('workflow_executions');
  });
});

describe('normalizeWorkflowTriggerData', () => {
  it('canonicalizes a legacy owned goal reference for all consumers', () => {
    expect(normalizeWorkflowTriggerData({ goal_id: ' goal-1 ', source: 'api' })).toEqual({
      source: 'api',
      goalId: 'goal-1',
      goal_id: 'goal-1',
    });
  });

  it('rejects ambiguous goal attribution', () => {
    expect(() => normalizeWorkflowTriggerData({ goalId: 'goal-1', goal_id: 'goal-2' })).toThrow(
      'Workflow trigger goal identifiers do not match'
    );
  });
});
