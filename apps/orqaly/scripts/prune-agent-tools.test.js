import { describe, expect, it, vi } from 'vitest';

vi.mock('./_lib/admin-client.mjs', () => ({
  admin: { from: vi.fn(), auth: { admin: { listUsers: vi.fn() } } },
  SUPABASE_URL: 'https://example.supabase.co',
}));

import { pruneTools, isImported } from './prune-agent-tools.mjs';

const REMOVE = new Set(['tool-github', 'tool-email', 'tool-vercel']);

describe('pruneTools', () => {
  it('removes only the named ids and keeps the order of the rest', () => {
    const agent = { metadata: { tools: ['tool-web-search', 'tool-github', 'tool-figma', 'tool-email'] } };
    expect(pruneTools(agent, REMOVE)).toEqual({
      next: ['tool-web-search', 'tool-figma'],
      removed: ['tool-github', 'tool-email'],
    });
  });

  it('returns null when nothing matches, so the caller can skip the write', () => {
    expect(pruneTools({ metadata: { tools: ['tool-web-search'] } }, REMOVE)).toBeNull();
    expect(pruneTools({ metadata: { tools: [] } }, REMOVE)).toBeNull();
    expect(pruneTools({ metadata: {} }, REMOVE)).toBeNull();
    expect(pruneTools({}, REMOVE)).toBeNull();
  });

  it('can empty the list entirely', () => {
    expect(pruneTools({ metadata: { tools: ['tool-github'] } }, REMOVE)).toEqual({
      next: [],
      removed: ['tool-github'],
    });
  });
});

describe('isImported', () => {
  it('keys off imported_from, so first-party agents are never in scope', () => {
    expect(isImported({ metadata: { imported_from: { source: 'github' } } })).toBe(true);
    expect(isImported({ metadata: { imported_from: null } })).toBe(false);
    expect(isImported({ metadata: { tools: [] } })).toBe(false);
    expect(isImported({})).toBe(false);
    expect(isImported(undefined)).toBe(false);
  });
});
