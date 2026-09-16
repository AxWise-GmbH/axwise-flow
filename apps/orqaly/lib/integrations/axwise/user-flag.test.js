import { describe, it, expect, beforeEach } from 'vitest';
import { isAxwiseUserDisabled, clearAxwiseUserFlagCache } from './user-flag.js';

// Minimal admin stub matching admin.from('users').select().eq().maybeSingle().
function makeAdmin(result) {
  const calls = { count: 0 };
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.count += 1;
            return result;
          },
        }),
      }),
    }),
  };
  return { admin, calls };
}

describe('isAxwiseUserDisabled', () => {
  beforeEach(() => clearAxwiseUserFlagCache());

  it('returns true only when axwise_enabled is explicitly false', async () => {
    const { admin } = makeAdmin({ data: { axwise_enabled: false }, error: null });
    expect(await isAxwiseUserDisabled(admin, 'u1')).toBe(true);
  });

  it('returns false when enabled is true', async () => {
    const { admin } = makeAdmin({ data: { axwise_enabled: true }, error: null });
    expect(await isAxwiseUserDisabled(admin, 'u2')).toBe(false);
  });

  it('uses the default-on behavior when the column is null or the row is missing', async () => {
    const { admin: a1 } = makeAdmin({ data: { axwise_enabled: null }, error: null });
    expect(await isAxwiseUserDisabled(a1, 'u3')).toBe(false);
    const { admin: a2 } = makeAdmin({ data: null, error: null });
    expect(await isAxwiseUserDisabled(a2, 'u4')).toBe(false);
  });

  it('fails closed on a db error and does NOT cache the error', async () => {
    const { admin, calls } = makeAdmin({ data: null, error: { message: 'boom' } });
    expect(await isAxwiseUserDisabled(admin, 'u5')).toBe(true);
    await isAxwiseUserDisabled(admin, 'u5');
    expect(calls.count).toBe(2); // errors not cached -> re-reads
  });

  it('fails closed with no admin or no userId', async () => {
    expect(await isAxwiseUserDisabled(null, 'u6')).toBe(true);
    const { admin } = makeAdmin({ data: { axwise_enabled: false }, error: null });
    expect(await isAxwiseUserDisabled(admin, null)).toBe(true);
  });

  it('fails closed when the database client throws', async () => {
    const admin = {
      from: () => {
        throw new Error('database unavailable');
      },
    };
    expect(await isAxwiseUserDisabled(admin, 'u-throw')).toBe(true);
  });

  it('caches a successful read (second call does not hit the db)', async () => {
    const { admin, calls } = makeAdmin({ data: { axwise_enabled: false }, error: null });
    expect(await isAxwiseUserDisabled(admin, 'u7')).toBe(true);
    expect(await isAxwiseUserDisabled(admin, 'u7')).toBe(true);
    expect(calls.count).toBe(1);
  });

  // The user-prefs write path evicts the toggling user so their own instance
  // honours the new value immediately instead of serving a stale flag.
  it('clearing one user re-reads only that user', async () => {
    const { admin: a1, calls: c1 } = makeAdmin({ data: { axwise_enabled: false }, error: null });
    const { admin: a2, calls: c2 } = makeAdmin({ data: { axwise_enabled: false }, error: null });
    await isAxwiseUserDisabled(a1, 'u8');
    await isAxwiseUserDisabled(a2, 'u9');

    clearAxwiseUserFlagCache('u8');

    await isAxwiseUserDisabled(a1, 'u8');
    await isAxwiseUserDisabled(a2, 'u9');
    expect(c1.count).toBe(2); // evicted -> re-read
    expect(c2.count).toBe(1); // untouched -> still cached
  });

  it('a cleared user picks up a flipped flag on the next call', async () => {
    let enabled = false;
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { axwise_enabled: enabled }, error: null }),
          }),
        }),
      }),
    };
    expect(await isAxwiseUserDisabled(admin, 'u10')).toBe(true);

    enabled = true; // user turned AxWise back on in Settings
    expect(await isAxwiseUserDisabled(admin, 'u10')).toBe(true); // still cached
    clearAxwiseUserFlagCache('u10');
    expect(await isAxwiseUserDisabled(admin, 'u10')).toBe(false);
  });
});
