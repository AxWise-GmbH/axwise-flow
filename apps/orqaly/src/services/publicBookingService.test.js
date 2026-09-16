import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable query-builder stub: every builder method returns the same object,
// and maybeSingle() resolves to whatever the test sets.
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  order: vi.fn(() => query),
  limit: vi.fn(() => query),
  maybeSingle: vi.fn(),
};

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
    from: vi.fn(() => query),
  },
}));

import { publicBookingService } from './publicBookingService';
import { supabase } from '../lib/supabase';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publicBookingService.hasBookingProfile', () => {
  it('returns true when a booking profile row exists', async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: 'p1' }, error: null });
    await expect(publicBookingService.hasBookingProfile()).resolves.toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('booking_profiles');
  });

  it('returns false when no profile exists (and never creates one)', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(publicBookingService.hasBookingProfile()).resolves.toBe(false);
    // read-only: it selects but never inserts
    expect(query.select).toHaveBeenCalled();
    expect(query.insert).toBeUndefined();
  });

  it('propagates query errors', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(publicBookingService.hasBookingProfile()).rejects.toThrow('boom');
  });
});
