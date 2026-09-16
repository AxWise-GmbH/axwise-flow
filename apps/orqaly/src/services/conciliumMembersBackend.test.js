import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ inserted: null, updated: null }));

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => ({
      insert(row) {
        state.inserted = row;
        return {
          select() {
            return {
              single: async () => ({ data: { id: 'member-1', ...row }, error: null }),
            };
          },
        };
      },
      update(row) {
        state.updated = row;
        const chain = {
          eq: () => chain,
          select: () => chain,
          single: async () => ({ data: { id: 'member-1', ...row }, error: null }),
        };
        return chain;
      },
    })),
  },
}));

vi.mock('./auditLogBackend', () => ({
  logAction: vi.fn(async () => {}),
  buildAgentMeta: vi.fn(() => ({})),
}));

import { createMember, updateMemberById } from './conciliumMembersBackend';

beforeEach(() => {
  state.inserted = null;
  state.updated = null;
});

describe('concilium member LLM persistence', () => {
  it('writes a provider-only create as one compatible pair', async () => {
    const member = await createMember({
      conciliumId: 'board-1',
      name: 'Reviewer',
      provider: 'openai',
    });

    expect(state.inserted).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
    expect(member).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('writes a model-only update with its inferred provider', async () => {
    const member = await updateMemberById('member-1', { model: 'deepseek-reasoner' });

    expect(state.updated).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    });
    expect(member).toMatchObject({ provider: 'deepseek', model: 'deepseek-reasoner' });
  });
});
