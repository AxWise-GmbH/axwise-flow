/**
 * Tests for agentRatingService.js — CRUD for agent_ratings table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockHasSupabase = true;
let mockUserId = 'user-abc-123';

function createQueryBuilder(resolvedValue = { data: [], error: null }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(resolvedValue),
    single: vi.fn().mockResolvedValue(resolvedValue),
  };
  // Chain: insert().select().single()
  builder.insert.mockReturnValue({
    select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(resolvedValue) }),
  });
  // Chain: update().eq().select().single()
  builder.update.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(resolvedValue) }),
    }),
  });
  // Chain: delete().eq()
  builder.delete.mockReturnValue({ eq: vi.fn().mockResolvedValue(resolvedValue) });
  // Chain: select().eq().order()
  builder.select.mockReturnValue({
    eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue(resolvedValue) }),
  });
  return builder;
}

let queryBuilder;

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  hasSupabase: vi.fn(),
}));

import { supabase, hasSupabase } from '../lib/supabase';
import {
  getAgentRatings,
  getAgentAverageRating,
  submitRating,
  deleteRating,
  getRatingEvents,
  getConsiliumRating,
} from './agentRatingService';

beforeEach(() => {
  vi.clearAllMocks();
  mockHasSupabase = true;
  mockUserId = 'user-abc-123';
  hasSupabase.mockImplementation(() => mockHasSupabase);
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: mockUserId } } });
  queryBuilder = createQueryBuilder({ data: [], error: null });
  supabase.from.mockReturnValue(queryBuilder);
});

describe('getAgentRatings', () => {
  it('returns empty array when supabase is unavailable', async () => {
    mockHasSupabase = false;
    const result = await getAgentRatings('agent-1');
    expect(result).toEqual([]);
  });

  it('returns empty array when no user', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await getAgentRatings('agent-1');
    expect(result).toEqual([]);
  });

  it('returns ratings for an agent', async () => {
    const mockRatings = [
      { id: 'r1', agent_id: 'agent-1', rating: 5, comment: 'Great', rating_type: 'individual' },
      { id: 'r2', agent_id: 'agent-1', rating: 4, comment: null, rating_type: 'team' },
    ];
    const builder = createQueryBuilder({ data: mockRatings, error: null });
    supabase.from.mockReturnValue(builder);

    const result = await getAgentRatings('agent-1');
    expect(result).toEqual(mockRatings);
    expect(supabase.from).toHaveBeenCalledWith('agent_ratings');
  });
});

describe('getAgentAverageRating', () => {
  it('returns 0 average for no ratings', async () => {
    const result = await getAgentAverageRating('agent-1');
    expect(result).toEqual({ average: 0, count: 0 });
  });

  it('calculates correct average', async () => {
    const mockRatings = [
      { id: 'r1', rating: 5 },
      { id: 'r2', rating: 4 },
      { id: 'r3', rating: 3 },
    ];
    const builder = createQueryBuilder({ data: mockRatings, error: null });
    supabase.from.mockReturnValue(builder);

    const result = await getAgentAverageRating('agent-1');
    expect(result.average).toBe(4);
    expect(result.count).toBe(3);
  });
});

describe('submitRating', () => {
  it('returns null when supabase is unavailable', async () => {
    mockHasSupabase = false;
    const result = await submitRating({ agentId: 'agent-1', rating: 5 });
    expect(result).toBeNull();
  });

  it('returns null when no user', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await submitRating({ agentId: 'agent-1', rating: 5 });
    expect(result).toBeNull();
  });

  it('inserts rating and returns data', async () => {
    const inserted = { id: 'r-new', agent_id: 'agent-1', rating: 5, user_id: mockUserId };
    const builder = createQueryBuilder({ data: inserted, error: null });
    supabase.from.mockReturnValue(builder);

    await submitRating({
      agentId: 'agent-1',
      rating: 5,
      comment: 'Excellent',
      ratingType: 'individual',
    });
    expect(supabase.from).toHaveBeenCalledWith('agent_ratings');
  });
});

describe('deleteRating', () => {
  it('returns false when supabase is unavailable', async () => {
    mockHasSupabase = false;
    const result = await deleteRating('r1');
    expect(result).toBe(false);
  });

  it('deletes and returns true on success', async () => {
    const builder = createQueryBuilder({ error: null });
    supabase.from.mockReturnValue(builder);

    const result = await deleteRating('r1');
    expect(supabase.from).toHaveBeenCalledWith('agent_ratings');
    expect(result).toBe(true);
  });
});

describe('getRatingEvents', () => {
  // Chain: from().select().eq().order().limit()
  function eventsBuilder(resolved) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(resolved),
          }),
        }),
      }),
    };
  }

  it('returns [] when supabase is unavailable', async () => {
    mockHasSupabase = false;
    expect(await getRatingEvents('agent-1')).toEqual([]);
  });

  it('returns [] when agentId is missing', async () => {
    expect(await getRatingEvents()).toEqual([]);
  });

  it('returns the rating events for an agent from agent_rating_events', async () => {
    const rows = [
      {
        id: 'e1',
        source: 'consilium',
        rating_value: 8.2,
        rating_scale: 10,
        created_at: '2026-06-20',
      },
      { id: 'e2', source: 'user', rating_value: 5, rating_scale: 5, created_at: '2026-06-19' },
    ];
    supabase.from.mockReturnValue(eventsBuilder({ data: rows, error: null }));
    const result = await getRatingEvents('agent-1');
    expect(supabase.from).toHaveBeenCalledWith('agent_rating_events');
    expect(result).toEqual(rows);
  });
});

describe('getConsiliumRating', () => {
  // Chain: from().select().eq().eq()
  function consiliumBuilder(resolved) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(resolved),
        }),
      }),
    };
  }

  it('returns a zeroed result when supabase is unavailable', async () => {
    mockHasSupabase = false;
    expect(await getConsiliumRating('agent-1')).toEqual({
      average: 0,
      count: 0,
      normalizedStars: 0,
    });
  });

  it('returns a zeroed result when there are no consilium events', async () => {
    supabase.from.mockReturnValue(consiliumBuilder({ data: [], error: null }));
    expect(await getConsiliumRating('agent-1')).toEqual({
      average: 0,
      count: 0,
      normalizedStars: 0,
    });
  });

  it('averages the board scores (0-10) and normalizes to a 0-5 star value', async () => {
    supabase.from.mockReturnValue(
      consiliumBuilder({
        data: [{ rating_value: 8 }, { rating_value: 6 }, { rating_value: 7 }],
        error: null,
      })
    );
    const result = await getConsiliumRating('agent-1');
    expect(supabase.from).toHaveBeenCalledWith('agent_rating_events');
    expect(result.average).toBe(7);
    expect(result.count).toBe(3);
    expect(result.normalizedStars).toBe(3.5);
  });
});
