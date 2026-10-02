import { describe, it, expect, vi } from 'vitest';
import { createClerkUserLookup } from './clerk-user-lookup.js';

describe('clerk-user-lookup', () => {
  it('returns unenriched users when secretKey is absent', async () => {
    const lookup = createClerkUserLookup({ secretKey: null });
    const users = [{ userId: 'user_123' }];
    const res = await lookup.enrichUsers(users);
    expect(res).toEqual([{ userId: 'user_123' }]);
  });

  it('enriches user list from Clerk API response', async () => {
    const mockUsers = [
      {
        id: 'user_abc',
        email_addresses: [{ email_address: 'alice@example.com' }],
        first_name: 'Alice',
        last_name: 'Smith',
        image_url: 'https://example.com/alice.jpg',
      },
      {
        id: 'user_def',
        email_addresses: [{ email_address: 'bob@example.com' }],
        first_name: 'Bob',
        last_name: '',
      },
    ];

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => mockUsers,
    }));

    const lookup = createClerkUserLookup({ secretKey: 'clerk_test_key', fetchImpl });
    const input = [
      { userId: 'user_abc', spendUsd: 10.5 },
      { userId: 'user_def', spendUsd: 2.0 },
      { userId: 'user_unknown', spendUsd: 0.0 },
    ];

    const enriched = await lookup.enrichUsers(input);
    expect(enriched[0]).toMatchObject({
      userId: 'user_abc',
      email: 'alice@example.com',
      displayName: 'Alice Smith',
      imageUrl: 'https://example.com/alice.jpg',
    });
    expect(enriched[1]).toMatchObject({
      userId: 'user_def',
      email: 'bob@example.com',
      displayName: 'Bob',
    });
    expect(enriched[2]).toMatchObject({
      userId: 'user_unknown',
      email: null,
      displayName: null,
    });
  });
});
