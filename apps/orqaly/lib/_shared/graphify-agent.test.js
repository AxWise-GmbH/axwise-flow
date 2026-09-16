import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ buildSupabaseAdminClient: vi.fn() }));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));

import { buildAgentGraph, queryAgentGraph } from './graphify-agent.js';

function graphDocument(userId, label) {
  return {
    user_id: userId,
    owner_id: 'agent-shared',
    owner_type: 'agent',
    tags: ['_graph'],
    content: JSON.stringify({
      nodes: [{ id: label.toLowerCase(), label, source_file: `${label}.md` }],
      edges: [],
    }),
  };
}

function queryAdmin(rows) {
  const filters = [];
  const admin = {
    filters,
    from: vi.fn(() => {
      const eq = {};
      let tag = null;
      const chain = {
        select: () => chain,
        eq: (field, value) => {
          eq[field] = value;
          filters.push(['eq', field, value]);
          return chain;
        },
        contains: (field, value) => {
          tag = { field, value };
          filters.push(['contains', field, value]);
          return chain;
        },
        maybeSingle: async () => {
          const data = rows.find((row) => {
            if (Object.entries(eq).some(([field, value]) => row[field] !== value)) return false;
            return !tag || tag.value.every((value) => row[tag.field]?.includes(value));
          });
          return { data: data || null, error: null };
        },
      };
      return chain;
    }),
  };
  return admin;
}

describe('agent graph tenant isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects only the authenticated user graph for a shared owner id', async () => {
    const admin = queryAdmin([
      graphDocument('user-2', 'VictimSecret'),
      graphDocument('user-1', 'OwnedFact'),
    ]);

    const result = await queryAgentGraph('agent-shared', 'OwnedFact', admin, {
      userId: 'user-1',
    });

    expect(result).toContain('OwnedFact');
    expect(result).not.toContain('VictimSecret');
    expect(admin.filters).toContainEqual(['eq', 'user_id', 'user-1']);
  });

  it('fails closed without a trusted user id', async () => {
    const admin = queryAdmin([graphDocument('user-2', 'VictimSecret')]);

    expect(await queryAgentGraph('agent-shared', 'VictimSecret', admin)).toBe('');
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('scopes replacement graph deletes to the graph owner user', async () => {
    const deleteFilters = [];
    const inserts = [];
    const admin = {
      from: vi.fn(() => {
        const chain = {
          delete: () => chain,
          eq: (field, value) => {
            deleteFilters.push([field, value]);
            return chain;
          },
          contains: (field, value) => {
            deleteFilters.push([field, value]);
            return chain;
          },
          insert: async (row) => {
            inserts.push(row);
            return { data: row, error: null };
          },
          then: (resolve, reject) =>
            Promise.resolve({ data: null, error: null }).then(resolve, reject),
        };
        return chain;
      }),
    };
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);

    await buildAgentGraph('agent-shared', 'user-1', [
      { title: 'Notes', content: 'Owned Alpha works with Owned Beta.' },
    ]);

    expect(deleteFilters).toContainEqual(['user_id', 'user-1']);
    expect(deleteFilters).toContainEqual(['owner_id', 'agent-shared']);
    expect(inserts[0]).toMatchObject({ user_id: 'user-1', owner_id: 'agent-shared' });
  });
});
