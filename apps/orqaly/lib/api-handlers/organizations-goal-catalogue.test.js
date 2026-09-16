import { describe, expect, it, vi } from 'vitest';
import { handleCreateForGoal } from './organizations.js';

describe('New Business organization catalogue boundary', () => {
  it('creates the organization and deliberate active-owned catalogue transactionally', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        organization: { id: 'org-pet-food', name: 'Pet Food Shop', is_active: true },
        agent_ids: ['agent-research', 'agent-operations'],
        agent_count: 2,
        catalogue_strategy: 'all_active_owned',
      },
      error: null,
    });

    const result = await handleCreateForGoal(
      { rpc },
      { id: 'user-1' },
      { name: 'Pet Food Shop', industry: 'E-commerce', org_type: 'holding' }
    );

    expect(result.status).toBe(201);
    expect(result.data).toMatchObject({
      organization: { id: 'org-pet-food' },
      agent_count: 2,
      catalogue_strategy: 'all_active_owned',
    });
    expect(rpc).toHaveBeenCalledWith(
      'create_goal_organization',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_name: 'Pet Food Shop',
        p_industry: 'E-commerce',
        p_agent_ids: null,
      })
    );
  });

  it('fails closed when the transaction cannot establish a catalogue', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'agent_catalogue_assignment_failed' },
    });

    const result = await handleCreateForGoal(
      { rpc },
      { id: 'user-1' },
      { name: 'Autoparts Commerce' }
    );

    expect(result).toEqual({
      status: 409,
      error: 'An authorized Agent Hub catalogue is required before a goal can start',
    });
  });

  it('rejects a client-supplied catalogue that is too large before the RPC', async () => {
    const rpc = vi.fn();
    const result = await handleCreateForGoal(
      { rpc },
      { id: 'user-1' },
      { name: 'Unsafe', agent_ids: Array.from({ length: 101 }, (_, index) => `agent-${index}`) }
    );

    expect(result.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
