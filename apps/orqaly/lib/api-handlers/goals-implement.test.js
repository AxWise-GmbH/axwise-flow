/**
 * Tests for handleImplementExisting orgId linking path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../agent-handlers/job-processor.js', () => ({ processNextJob: vi.fn() }));
vi.mock('../goal-handlers/_helpers.js', () => ({ triggerProcessNext: vi.fn() }));

import { handleImplementExisting } from './goals.js';

const user = { id: 'user-1' };

function makeAdmin(mocks = {}) {
  const tables = {
    goals: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mocks.goal || { id: 'g1', title: 'T', description: '' }, error: null }),
      update: vi.fn().mockReturnThis(),
    },
    organizations: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mocks.org || { id: 'org-1', name: 'Acme' }, error: null }),
    },
    goal_units: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mocks.unit || { id: 'u1', name: 'Ops', org_id: 'org-1' }, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    },
    goal_unit_members: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    },
  };

  return {
    from: (table) => tables[table] || { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() },
    _tables: tables,
  };
}

describe('handleImplementExisting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when organization not found', async () => {
    const admin = makeAdmin();
    admin._tables.organizations.single.mockResolvedValue({ data: null, error: null });
    const result = await handleImplementExisting(admin, user, { goalId: 'g1', orgId: 'org-1' });
    expect(result.status).toBe(404);
    expect(result.error).toMatch(/Organization not found/i);
  });

  it('links goal to existing org and unit', async () => {
    const admin = makeAdmin();
    const result = await handleImplementExisting(admin, user, { goalId: 'g1', orgId: 'org-1', unitId: 'u1' });
    expect(result.status).toBe(201);
    expect(result.data.org.name).toBe('Acme');
    expect(result.data.unit.id).toBe('u1');
    expect(admin._tables.goals.update).toHaveBeenCalled();
    expect(admin._tables.goal_unit_members.insert).toHaveBeenCalled();
  });

  it('creates a unit when unitId is omitted', async () => {
    const admin = makeAdmin();
    admin._tables.goal_units.insert.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'u-new', name: 'Acme — Operations' }, error: null }),
    });
    const result = await handleImplementExisting(admin, user, { goalId: 'g1', orgId: 'org-1' });
    expect(result.status).toBe(201);
    expect(admin._tables.goal_units.insert).toHaveBeenCalled();
    expect(result.data.unit.id).toBe('u-new');
  });
});
