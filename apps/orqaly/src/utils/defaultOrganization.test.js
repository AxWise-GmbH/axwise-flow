import { describe, it, expect } from 'vitest';
import { pickDefaultOrgId, pickTraktorOrgId } from './defaultOrganization';

describe('pickTraktorOrgId', () => {
  it('matches Traktor case-insensitively', () => {
    expect(
      pickTraktorOrgId([
        { id: 'a', name: 'Other' },
        { id: 'b', name: 'traktor' },
      ])
    ).toBe('b');
  });

  it('returns null when Traktor is missing', () => {
    expect(pickTraktorOrgId([{ id: 'a', name: 'Acme' }])).toBeNull();
  });
});

describe('pickDefaultOrgId', () => {
  it('prefers an active Traktor workspace', () => {
    expect(
      pickDefaultOrgId([
        { id: 'older', name: 'Acme', is_active: true, created_at: '2025-01-01' },
        { id: 'traktor', name: 'Traktor', is_active: true, created_at: '2026-01-01' },
      ])
    ).toBe('traktor');
  });

  it('falls back to the oldest active workspace deterministically', () => {
    expect(
      pickDefaultOrgId([
        { id: 'newer', name: 'Newer', is_active: true, created_at: '2026-01-01' },
        { id: 'inactive', name: 'Inactive', is_active: false, created_at: '2020-01-01' },
        { id: 'older', name: 'Older', is_active: true, created_at: '2025-01-01' },
      ])
    ).toBe('older');
  });

  it('returns null when no active workspace exists', () => {
    expect(pickDefaultOrgId([{ id: 'inactive', is_active: false }])).toBeNull();
  });
});
