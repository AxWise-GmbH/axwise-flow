/**
 * Free-first tool router.
 *
 * Given a deliverable category and a quality floor, returns the best tool to
 * use, preferring free → free-trial → paid in that order. The catalog lives
 * in shared/libraryMcpCatalog.js so both server (lib/) and client (src/) can
 * read it.
 *
 * Usage:
 *   import { selectBestTool } from './tool-router.js';
 *   const tool = selectBestTool('landing_page', { qualityFloor: 70, allowPaid: false });
 *   if (tool) console.log('Using', tool.name);
 *
 * Cost-preference mapping (from a goal's cost_preference field):
 *   'free_only'    → allowPaid=false, allowTrial=false
 *   'free_first'   → allowPaid=false, allowTrial=true
 *   'best_quality' → allowPaid=true,  allowTrial=true
 */
import { listToolsForCategory } from '../../shared/libraryMcpCatalog.js';

/**
 * Select the highest-quality tool in the cheapest available tier.
 *
 * @param {string} category - deliverable_type from the library
 * @param {object} opts
 * @param {number} [opts.qualityFloor=70] - minimum quality_estimate to consider
 * @param {boolean} [opts.allowPaid=false] - whether paid tools are allowed
 * @param {boolean} [opts.allowTrial=true] - whether free-trial tools are allowed
 * @returns {object|null} tool catalog entry, or null if nothing fits
 */
export function selectBestTool(category, opts = {}) {
  const {
    qualityFloor = 70,
    allowPaid = false,
    allowTrial = true,
  } = opts;

  const tools = listToolsForCategory(category);
  if (tools.length === 0) return null;

  const byQualityDesc = (a, b) => (b.quality_estimate || 0) - (a.quality_estimate || 0);

  // Tier 1: free
  const free = tools
    .filter(t => t.tier === 'free' && (t.quality_estimate || 0) >= qualityFloor)
    .sort(byQualityDesc);
  if (free.length > 0) return free[0];

  // Tier 2: free-trial
  if (allowTrial) {
    const trial = tools
      .filter(t => t.tier === 'free-trial' && (t.quality_estimate || 0) >= qualityFloor)
      .sort(byQualityDesc);
    if (trial.length > 0) return trial[0];
  }

  // Tier 3: paid
  if (allowPaid) {
    const paid = tools
      .filter(t => t.tier === 'paid')
      .sort(byQualityDesc);
    if (paid.length > 0) return paid[0];
  }

  // Last resort: drop the quality floor and return the highest-quality
  // free option even if it's below qualityFloor. Better than null.
  const anyFree = tools.filter(t => t.tier === 'free').sort(byQualityDesc);
  if (anyFree.length > 0) return anyFree[0];

  return null;
}

/**
 * Translate a goal's cost_preference field into the opts object for
 * selectBestTool. Centralized so the policy lives in one place.
 */
export function optsFromCostPreference(costPreference) {
  switch (costPreference) {
    case 'free_only':
      return { allowPaid: false, allowTrial: false };
    case 'best_quality':
      return { allowPaid: true, allowTrial: true };
    case 'free_first':
    default:
      return { allowPaid: false, allowTrial: true };
  }
}

/**
 * Convenience: select tools for multiple categories at once.
 * Returns a map { category: tool|null }.
 */
export function selectBestToolsForCategories(categories, opts = {}) {
  const result = {};
  for (const cat of categories) {
    result[cat] = selectBestTool(cat, opts);
  }
  return result;
}
