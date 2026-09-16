import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/organizationService', () => ({
  updateOrganization: vi.fn(async () => ({})),
}));

import { updateOrganization } from '../../services/organizationService';
import { reconcileBoardOrgs } from './reconcileBoardOrgs';

const orgs = [
  { id: 'o1', consilium_id: null }, // not linked
  { id: 'o2', consilium_id: 'b1' }, // linked to THIS board
  { id: 'o3', consilium_id: 'b2' }, // linked to a different board
];

beforeEach(() => vi.clearAllMocks());

describe('reconcileBoardOrgs', () => {
  it('links newly-selected orgs and unlinks deselected ones, leaving other-board orgs alone', async () => {
    // Select o1 (new) + keep nothing else → o2 should be unlinked.
    const res = await reconcileBoardOrgs('b1', ['o1'], orgs);
    expect(updateOrganization).toHaveBeenCalledWith('o1', { consilium_id: 'b1' });
    expect(updateOrganization).toHaveBeenCalledWith('o2', { consilium_id: null });
    expect(updateOrganization).not.toHaveBeenCalledWith('o3', expect.anything());
    expect(updateOrganization).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ linked: ['o1'], unlinked: ['o2'] });
  });

  it('does nothing when selection matches current state', async () => {
    await reconcileBoardOrgs('b1', ['o2'], orgs);
    expect(updateOrganization).not.toHaveBeenCalled();
  });

  it('accepts a Set of selected ids', async () => {
    await reconcileBoardOrgs('b1', new Set(['o2']), orgs);
    expect(updateOrganization).not.toHaveBeenCalled();
  });
});
