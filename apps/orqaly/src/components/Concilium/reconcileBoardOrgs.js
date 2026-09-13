import { updateOrganization } from '../../services/organizationService';

/**
 * Reconcile which organizations are linked to a Consilium board. The link is
 * stored one-way on `organizations.consilium_id`, so this:
 *   - sets consilium_id = boardId for newly-selected orgs not yet linked here,
 *   - clears consilium_id (null) for orgs that were linked to THIS board but are
 *     no longer selected,
 *   - leaves orgs linked to a different board untouched.
 *
 * @param {string} boardId
 * @param {Iterable<string>} selectedIds  org ids that should be linked to the board
 * @param {Array<{id:string, consilium_id?:string|null}>} allOrgs
 * @returns {Promise<{ linked: string[], unlinked: string[] }>}
 */
export async function reconcileBoardOrgs(boardId, selectedIds, allOrgs) {
  const selected = new Set(selectedIds || []);
  const ops = [];
  const linked = [];
  const unlinked = [];
  for (const o of allOrgs || []) {
    const wasLinked = o.consilium_id === boardId;
    const nowSelected = selected.has(o.id);
    if (nowSelected && !wasLinked) {
      ops.push(updateOrganization(o.id, { consilium_id: boardId }));
      linked.push(o.id);
    } else if (!nowSelected && wasLinked) {
      ops.push(updateOrganization(o.id, { consilium_id: null }));
      unlinked.push(o.id);
    }
  }
  await Promise.all(ops);
  return { linked, unlinked };
}

export default reconcileBoardOrgs;
