/**
 * Duplicate agent reconciliation.
 *
 * `autoCreateAgentsForRoles()` mints an agent whenever a goal supplies a role
 * string it has not seen before. Because role strings arrive as free text from
 * the PO/AxWise contract, one job accumulates several near-identical agents:
 *
 *   Marketing/ICP Specialist
 *   Marketing ICP Specialist
 *   Bremen Local Market & ICP Specialist (Marketing)
 *
 * That costs one org conditioning generation per duplicate instead of one per
 * role, and lets the copies drift apart in style — the exact inconsistency the
 * conditioning layer exists to remove.
 *
 * This module only ever REPORTS. Merging is destructive and rewrites execution
 * history, so the caller decides, one group at a time.
 */
import { roleIdentityKey, relatedRole } from './team-assigner.js';

/**
 * Group an organization's agents by role.
 *
 * Two confidence levels, deliberately separated:
 *
 *   `exact`   identical role identity once punctuation is normalized. Safe to
 *             merge: these are the same name written differently.
 *   `related` one role is the other wearing extra qualifiers. NOT safe to merge
 *             automatically — the subset relation also holds for pairs that
 *             must stay distinct, such as "Finance Specialist" inside
 *             "Finance Pricing Specialist". A human confirms these.
 *
 * @param {Array<{id: string, name?: string, category?: string, agent_type?: string,
 *                created_at?: string, updated_at?: string}>} agents
 * @returns {{exact: Array, related: Array}}
 */
export function findDuplicateAgentGroups(agents = []) {
  const byKey = new Map();
  for (const agent of agents) {
    const label = agent?.name || agent?.category || agent?.agent_type || '';
    const key = roleIdentityKey(label);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ ...agent, _label: label, _key: key });
  }

  const exact = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    exact.push({ key, keep: pickSurvivor(members), drop: dropped(members) });
  }

  // Related groups compare surviving keys only, so an exact group is never
  // reported twice.
  const keys = [...byKey.keys()];
  const related = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      if (!relatedRole(keys[i], keys[j])) continue;
      related.push({
        a: { key: keys[i], agents: byKey.get(keys[i]).map((m) => m._label) },
        b: { key: keys[j], agents: byKey.get(keys[j]).map((m) => m._label) },
      });
    }
  }

  return { exact, related };
}

/**
 * Which row survives a merge.
 *
 * Most recently touched wins, falling back to creation time then id, so the
 * choice is deterministic and a re-run reports the same survivor.
 */
export function pickSurvivor(members = []) {
  return [...members].sort((a, b) => {
    const at = Date.parse(a.updated_at || a.created_at || '') || 0;
    const bt = Date.parse(b.updated_at || b.created_at || '') || 0;
    if (bt !== at) return bt - at;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

function dropped(members) {
  const keep = pickSurvivor(members);
  return members.filter((m) => String(m.id) !== String(keep.id));
}

/**
 * Human-readable summary of what a merge would do. Nothing is written.
 */
/**
 * How many `related` pairs to spell out before collapsing to a count.
 *
 * Organizations seeded with role families ("inventory intelligence analyst /
 * specialist / team lead") generate dozens of subset matches. Listing them all
 * buries the two or three merges that are actually actionable.
 */
export const RELATED_PREVIEW_LIMIT = 5;

export function formatReconciliationReport({ exact, related }, orgName = '') {
  const lines = [];
  const header = orgName ? `Duplicate agents in ${orgName}` : 'Duplicate agents';
  lines.push(header, '='.repeat(header.length), '');

  if (!exact.length && !related.length) {
    lines.push('None found.');
    return lines.join('\n');
  }

  if (exact.length) {
    lines.push('SAFE TO MERGE — same role, different punctuation', '');
    for (const group of exact) {
      lines.push(`  ${group.key}`);
      lines.push(`    keep  ${group.keep._label}  (${group.keep.id})`);
      for (const d of group.drop) lines.push(`    drop  ${d._label}  (${d.id})`);
      lines.push('');
    }
  }

  if (related.length) {
    lines.push('NEEDS YOUR DECISION — one may be a deliberate specialization', '');
    for (const pair of related.slice(0, RELATED_PREVIEW_LIMIT)) {
      lines.push(`  ${pair.a.key}`);
      lines.push(`  ${pair.b.key}`);
      lines.push('');
    }
    if (related.length > RELATED_PREVIEW_LIMIT) {
      lines.push(
        `  …and ${related.length - RELATED_PREVIEW_LIMIT} more pair(s). A long list usually`,
        '  means this organization uses role families rather than true duplicates.',
        ''
      );
    }
  }

  const dropCount = exact.reduce((n, g) => n + g.drop.length, 0);
  lines.push(`${dropCount} agent(s) would be deactivated, ${related.length} pair(s) to review.`);
  return lines.join('\n');
}
