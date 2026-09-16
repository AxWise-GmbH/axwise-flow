const GCP_NAV_COLLAPSED_STORAGE_VERSION = 1;

// PR #59's authenticated Standart shell dimensions. Keeping these together
// prevents the drawer, rail, brand header, and tests from drifting apart.
export const GCP_STANDARD_NAV_WIDTH = 260;
export const GCP_STANDARD_NAV_RAIL_WIDTH = 56;
export const GCP_STANDARD_NAV_BRAND_SIZE = 38;
export const GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE = 28;

export function gcpNavCollapsedStorageKey(clerkUserId) {
  if (!clerkUserId) return null;
  return `orqaly:gcp-standard-nav-collapsed:v${GCP_NAV_COLLAPSED_STORAGE_VERSION}:${encodeURIComponent(clerkUserId)}`;
}

export function readGcpNavCollapsed(clerkUserId) {
  const key = gcpNavCollapsedStorageKey(clerkUserId);
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function persistGcpNavCollapsed(clerkUserId, collapsed) {
  const key = gcpNavCollapsedStorageKey(clerkUserId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, collapsed ? '1' : '0');
  } catch {
    /* Browser privacy mode and storage quotas must not make the menu unusable. */
  }
}
