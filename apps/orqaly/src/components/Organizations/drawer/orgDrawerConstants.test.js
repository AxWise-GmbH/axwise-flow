import { describe, it, expect } from 'vitest';
import { buildOrgDeepLink } from './orgDrawerConstants';

describe('buildOrgDeepLink', () => {
  it('builds job-pool goals link with org_id', () => {
    const url = buildOrgDeepLink('/job-pool', 'org-abc', { tab: 'goals', status: 'completed' });
    expect(url).toContain('org_id=org-abc');
    expect(url).toContain('tab=goals');
    expect(url).toContain('status=completed');
  });

  it('builds dashboards link with org_id', () => {
    const url = buildOrgDeepLink('/dashboards', 'org-xyz');
    expect(url).toBe('/dashboards?org_id=org-xyz');
  });
});
