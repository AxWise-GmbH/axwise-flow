import { describe, expect, it, vi } from 'vitest';

import { handleInFlightJobs, reassignAgentJobs } from './consilium-supervisor.js';

function selectChain(rows, calls) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((field, value) => {
      calls.push(['eq', field, value]);
      return chain;
    }),
    in: vi.fn((field, value) => {
      calls.push(['in', field, value]);
      return Promise.resolve({ data: rows, error: null });
    }),
    or: vi.fn((expression) => {
      calls.push(['or', expression]);
      return Promise.resolve({ data: rows, error: null });
    }),
  };
  return chain;
}

function updateChain(calls) {
  const chain = {
    update: vi.fn((patch) => {
      calls.push(['update', patch]);
      return chain;
    }),
    eq: vi.fn((field, value) => {
      calls.push(['eq', field, value]);
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({ data: { id: 'queue-1' }, error: null })),
    then(resolve) {
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  // Keep the mutation-chain select available without overwriting the read
  // chain's select when these test doubles are spread into one table client.
  Object.defineProperty(chain, 'select', {
    enumerable: false,
    value: vi.fn(() => chain),
  });
  return chain;
}

describe('Consilium supervisor tenant fences', () => {
  it('cancels only an exact running queue row owned by the paused agent tenant', async () => {
    const selectCalls = [];
    const updateCalls = [];
    const admin = {
      from: vi.fn((table) =>
        table === 'agent_jobs'
          ? {
              ...selectChain(
                [
                  {
                    id: 'queue-1',
                    user_id: 'user-1',
                    status: 'running',
                    started_at: '2026-08-24T09:00:00Z',
                    lease_token: '00000000-0000-4000-8000-000000000001',
                    heartbeat_at: '2026-08-24T09:00:30Z',
                    lease_expires_at: '2026-08-24T09:01:45Z',
                  },
                ],
                selectCalls
              ),
              ...updateChain(updateCalls),
            }
          : null
      ),
    };

    const cancelled = await handleInFlightJobs(
      admin,
      { id: 'agent-1', user_id: 'user-1', name: 'Shared name' },
      new Date('2026-08-24T09:01:00Z')
    );

    expect(cancelled).toBe(1);
    expect(selectCalls).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'user-1'],
        ['eq', 'status', 'running'],
        ['or', 'payload->>agentId.eq.agent-1,payload->>agent_id.eq.agent-1'],
      ])
    );
    expect(updateCalls).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'queue-1'],
        ['eq', 'user_id', 'user-1'],
        ['eq', 'status', 'running'],
        ['eq', 'lease_token', '00000000-0000-4000-8000-000000000001'],
        ['eq', 'lease_expires_at', '2026-08-24T09:01:45Z'],
      ])
    );
  });

  it('reassigns only public jobs owned by the paused agent tenant', async () => {
    const selectCalls = [];
    const updateCalls = [];
    const admin = {
      from: vi.fn(() => ({
        ...selectChain(
          [
            {
              id: 'work-1',
              description: 'Research market',
              requirements: '',
              category: 'research',
              assigned_agent_id: 'agent-1',
            },
          ],
          selectCalls
        ),
        ...updateChain(updateCalls),
      })),
    };

    const reassigned = await reassignAgentJobs(
      admin,
      { id: 'agent-1', user_id: 'user-1' },
      [
        { id: 'agent-1', user_id: 'user-1', status: 'paused' },
        {
          id: 'agent-2',
          user_id: 'user-1',
          status: 'active',
          name: 'Researcher',
          role: 'market research',
          capabilities: [],
          tools: [],
        },
      ],
      new Date('2026-08-24T09:01:00Z')
    );

    expect(reassigned).toBe(1);
    expect(selectCalls).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'user-1'],
        ['eq', 'assigned_agent_id', 'agent-1'],
      ])
    );
    expect(updateCalls).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'work-1'],
        ['eq', 'user_id', 'user-1'],
        ['eq', 'assigned_agent_id', 'agent-1'],
      ])
    );
  });
});
