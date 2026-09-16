import {
  GCP_CUSTOMIZABLE_NAV_ITEMS,
  GCP_NAV_STORAGE_VERSION,
  gcpNavStorageKey,
} from './gcpNavItems.js';

export const MAX_GCP_NAV_PINS = 50;
const MAX_RECENTS = 14;
const CUSTOMIZABLE_IDS = new Set(GCP_CUSTOMIZABLE_NAV_ITEMS.map((item) => item.id));

export const DEFAULT_GCP_SECTION_ORDER = Object.freeze(
  GCP_CUSTOMIZABLE_NAV_ITEMS.map((item) => item.id)
);

export const EMPTY_GCP_NAV_PREFERENCES = Object.freeze({
  version: GCP_NAV_STORAGE_VERSION,
  hiddenSectionIds: Object.freeze([]),
  sectionOrder: DEFAULT_GCP_SECTION_ORDER,
  // PR #59 separates the personal work block from the organization/product
  // block with a pronounced break before Structure. A stored empty array is
  // still respected as an intentional customization.
  sectionGapIds: Object.freeze(['structure']),
  pins: Object.freeze([]),
});

function compactLabel(value, fallback, max = 72) {
  const text = String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!text) return fallback;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function readable(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/^./u, (character) => character.toUpperCase());
}

function relativeDate(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

function epoch(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Merge Clerk-owned Assistant threads with the flat `/v2/overview` workflow
 * projection. Both DTOs expose real timestamps, so the shared list is strictly
 * newest-first rather than relying on endpoint order.
 */
export function buildGcpRecentItems(threadResponse, overviewResponse) {
  const threads = (threadResponse?.threads || []).map((thread) => ({
    id: `chat:${thread.id}`,
    entityId: thread.id,
    kind: 'chat',
    badge: 'Chat',
    label: compactLabel(thread.title, 'Untitled chat'),
    meta: relativeDate(thread.updatedAt || thread.createdAt),
    to: `/assistant?${new URLSearchParams({ thread: thread.id })}`,
    sortAt: epoch(thread.updatedAt || thread.createdAt),
  }));
  const workflows = (overviewResponse?.workflows || overviewResponse?.overview?.workflows || [])
    .filter((workflow) => workflow?.id)
    .map((workflow) => ({
      id: `goal:${workflow.id}`,
      entityId: workflow.id,
      kind: 'goal',
      badge: 'Goal',
      label: compactLabel(workflow.title, `Goal ${workflow.id.slice(0, 8)}`),
      meta: readable(workflow.status),
      to: `/goals?${new URLSearchParams({ run: workflow.id })}`,
      sortAt: epoch(workflow.updatedAt || workflow.createdAt),
    }));

  return [...threads, ...workflows]
    .sort((left, right) => right.sortAt - left.sortAt || left.id.localeCompare(right.id))
    .slice(0, MAX_RECENTS)
    .map(({ sortAt: _sortAt, ...item }) => item);
}

function validPin(value) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.label === 'string' &&
    typeof value.to === 'string' &&
    value.to.startsWith('/')
  );
}

export function normalizeGcpSectionOrder(value) {
  const requested = Array.isArray(value) ? value : [];
  const valid = [...new Set(requested)].filter((id) => CUSTOMIZABLE_IDS.has(id));
  return [...valid, ...DEFAULT_GCP_SECTION_ORDER.filter((id) => !valid.includes(id))];
}

export function readGcpNavPreferences(clerkUserId) {
  const key = gcpNavStorageKey(clerkUserId);
  if (!key || typeof window === 'undefined') return EMPTY_GCP_NAV_PREFERENCES;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!parsed || parsed.version !== GCP_NAV_STORAGE_VERSION) {
      return EMPTY_GCP_NAV_PREFERENCES;
    }
    return {
      version: GCP_NAV_STORAGE_VERSION,
      hiddenSectionIds: [...new Set(parsed.hiddenSectionIds || [])].filter((id) =>
        CUSTOMIZABLE_IDS.has(id)
      ),
      sectionOrder: normalizeGcpSectionOrder(parsed.sectionOrder),
      sectionGapIds: [...new Set(parsed.sectionGapIds || [])].filter((id) =>
        CUSTOMIZABLE_IDS.has(id)
      ),
      pins: (Array.isArray(parsed.pins) ? parsed.pins : [])
        .filter(validPin)
        .slice(0, MAX_GCP_NAV_PINS)
        .map((pin) => ({
          id: pin.id,
          entityId: typeof pin.entityId === 'string' ? pin.entityId : pin.id,
          kind: pin.kind,
          label: compactLabel(pin.label, 'Pinned item', 120),
          meta: typeof pin.meta === 'string' ? pin.meta : '',
          to: pin.to,
          pinnedAt: typeof pin.pinnedAt === 'string' ? pin.pinnedAt : '',
        })),
    };
  } catch {
    return EMPTY_GCP_NAV_PREFERENCES;
  }
}

export function persistGcpNavPreferences(clerkUserId, preferences) {
  const key = gcpNavStorageKey(clerkUserId);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: GCP_NAV_STORAGE_VERSION,
        hiddenSectionIds: preferences.hiddenSectionIds,
        sectionOrder: preferences.sectionOrder,
        sectionGapIds: preferences.sectionGapIds,
        // Pins intentionally keep a label snapshot in this browser. Server data
        // remains authoritative in Recents; this is not cross-device storage.
        pins: preferences.pins,
      })
    );
  } catch {
    // Storage may be disabled or full. Navigation remains usable in memory.
  }
}
