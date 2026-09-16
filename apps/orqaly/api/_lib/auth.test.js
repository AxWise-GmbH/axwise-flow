import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBearerToken, verifySupabaseToken } from './auth.js';

describe('api auth helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  it('extracts bearer token from header', () => {
    const token = getBearerToken({ headers: { authorization: 'Bearer abc123' } });
    expect(token).toBe('abc123');
  });

  it('returns null for missing bearer token', () => {
    const token = getBearerToken({ headers: { authorization: 'Basic xyz' } });
    expect(token).toBeNull();
  });

  it('verifies supabase token when auth endpoint returns user', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'user-1', email: 'u@test.com' }),
      }))
    );
    const user = await verifySupabaseToken('token');
    expect(user?.id).toBe('user-1');
  });

  it('returns null when verification fails', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }))
    );
    const user = await verifySupabaseToken('token');
    expect(user).toBeNull();
  });
});
