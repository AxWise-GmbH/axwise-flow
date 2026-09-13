/**
 * Thin dispatcher that runs every extractor in the DELIVERABLE_REGISTRY
 * against a goal's task list and returns a flat result object keyed by
 * registry id. Also exposes backwards-compatible aliases
 * (liveUrls, pdfUrls, imageUrls, markdownDocs) so existing call sites
 * don't need to change — they'll work until the last consumer is
 * migrated to the registry-based shape.
 *
 * Adding a new deliverable shape → edit src/utils/deliverables/registry.js,
 * not this file.
 */
import { DELIVERABLE_REGISTRY, getRelevantTasks, filterByType } from './deliverables/registry.js';

/**
 * Run every registered extractor against `tasks` and return a result
 * object containing both the registry-id keys (`liveSite`, `downloads`,
 * `visualAssets`, `dataExports`, `codeRepos`, `documents`) AND the
 * legacy aliases (`liveUrls`, `pdfUrls`, `imageUrls`, `markdownDocs`).
 *
 * @param {Array<object>} tasks — team_tasks rows with { status, data: { output, deliverable_type }, title, sequence_order }
 * @returns {object} groups keyed by registry id + legacy aliases + isEmpty boolean
 */
export function extractDeliverables(tasks) {
  const relevantTasks = getRelevantTasks(tasks);

  const byId = {};
  let totalItems = 0;
  for (const entry of DELIVERABLE_REGISTRY) {
    const typeFiltered = filterByType(relevantTasks, entry.matchDeliverableType);
    const items = entry.extract(typeFiltered, relevantTasks) || [];
    byId[entry.id] = items;
    totalItems += items.length;
  }

  // Backwards-compatible aliases (used by existing tests + any
  // non-migrated call sites). Maps registry ids to the names used by
  // Phase 3's original shape.
  const LEGACY_ALIAS_MAP = {
    liveSite: 'liveUrls',
    downloads: 'pdfUrls',
    visualAssets: 'imageUrls',
    documents: 'markdownDocs',
  };

  const legacy = {};
  for (const [regId, aliasKey] of Object.entries(LEGACY_ALIAS_MAP)) {
    legacy[aliasKey] = byId[regId] || [];
  }

  return {
    ...byId,
    ...legacy,
    isEmpty: totalItems === 0,
  };
}

export default extractDeliverables;
