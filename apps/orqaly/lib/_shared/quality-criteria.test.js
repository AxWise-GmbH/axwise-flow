import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCriteriaCache, loadAllCriteria } from './quality-criteria.js';

function criteriaAdmin(rowsByScope) {
  const reads = [];
  const admin = {
    from: vi.fn((table) => {
      expect(table).toBe('knowledge_documents');
      const filters = {};
      const query = {
        select() {
          return query;
        },
        eq(field, value) {
          filters[field] = value;
          return query;
        },
        is(field, value) {
          filters[field] = value;
          return query;
        },
        then(resolve) {
          reads.push({ ...filters });
          const key = `${filters.user_id}:${filters.organization_id || 'personal'}`;
          return Promise.resolve({ data: rowsByScope[key] || [], error: null }).then(resolve);
        },
      };
      return query;
    }),
    reads,
  };
  return admin;
}

describe('quality criteria tenant scope', () => {
  beforeEach(() => clearCriteriaCache());

  it('uses exact owner and null-organization filters for personal criteria', async () => {
    const admin = criteriaAdmin({
      'user-a:personal': [
        { content: 'Use one CTA.', metadata: { deliverable_type: 'landing_page' } },
      ],
      'user-b:personal': [
        { content: 'Use another tenant rule.', metadata: { deliverable_type: 'landing_page' } },
      ],
    });

    const userA = await loadAllCriteria(admin, { userId: 'user-a' });
    const userB = await loadAllCriteria(admin, { userId: 'user-b' });

    expect(userA.landing_page).toBe('Use one CTA.');
    expect(userB.landing_page).toBe('Use another tenant rule.');
    expect(admin.reads).toEqual([
      {
        category: 'quality_criteria',
        user_id: 'user-a',
        organization_id: null,
      },
      {
        category: 'quality_criteria',
        user_id: 'user-b',
        organization_id: null,
      },
    ]);
  });

  it('keys the warm cache by owner and organization', async () => {
    const admin = criteriaAdmin({
      'user-a:org-a': [
        { content: 'Organization A standard.', metadata: { deliverable_type: 'code' } },
      ],
      'user-a:org-b': [
        { content: 'Organization B standard.', metadata: { deliverable_type: 'code' } },
      ],
    });

    const orgA = await loadAllCriteria(admin, { userId: 'user-a', organizationId: 'org-a' });
    const cachedOrgA = await loadAllCriteria(admin, {
      userId: 'user-a',
      organizationId: 'org-a',
    });
    const orgB = await loadAllCriteria(admin, { userId: 'user-a', organizationId: 'org-b' });

    expect(orgA.code).toBe('Organization A standard.');
    expect(cachedOrgA).toBe(orgA);
    expect(orgB.code).toBe('Organization B standard.');
    expect(admin.reads).toHaveLength(2);
    expect(admin.reads[0]).toMatchObject({ user_id: 'user-a', organization_id: 'org-a' });
    expect(admin.reads[1]).toMatchObject({ user_id: 'user-a', organization_id: 'org-b' });
  });

  it('fails closed without a tenant owner instead of performing a global read', async () => {
    const admin = criteriaAdmin({});
    const criteria = await loadAllCriteria(admin);

    expect(Object.values(criteria).every((value) => value === null)).toBe(true);
    expect(admin.from).not.toHaveBeenCalled();
  });
});
