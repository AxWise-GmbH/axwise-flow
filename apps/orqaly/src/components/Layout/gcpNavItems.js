/**
 * GCP launch navigation, expressed as data only.
 *
 * The labels deliberately preserve the approved PR #59 vocabulary while the
 * routes point at the smaller, retained GCP product surface. Deferred legacy
 * modules do not belong in this manifest.
 */

export const GCP_NAV_STORAGE_VERSION = 1;

export const GCP_PRIMARY_NAV_ITEMS = Object.freeze([
  Object.freeze({
    id: 'new-chat',
    kind: 'action',
    label: 'New chat',
    icon: 'new-chat',
    to: '/assistant',
    match: Object.freeze({ path: '/assistant', end: true, queryPresent: ['new'] }),
    customizable: false,
  }),
  Object.freeze({
    id: 'recents',
    kind: 'dynamic',
    label: 'Recents',
    icon: 'recents',
    customizable: true,
  }),
  Object.freeze({
    id: 'pinned',
    kind: 'dynamic',
    label: 'Pinned',
    icon: 'pinned',
    customizable: true,
  }),
  Object.freeze({
    id: 'home',
    kind: 'link',
    label: 'Home',
    icon: 'home',
    to: '/home',
    match: Object.freeze({ path: '/home', end: true }),
    customizable: true,
  }),
  Object.freeze({
    id: 'assistant',
    kind: 'link',
    label: 'Assistant',
    icon: 'assistant',
    to: '/assistant',
    match: Object.freeze({ path: '/assistant', end: true, queryAbsent: ['new'] }),
    customizable: true,
  }),
  Object.freeze({
    id: 'goals',
    kind: 'link',
    label: 'Goals',
    icon: 'goals',
    to: '/goals',
    match: Object.freeze({ path: '/goals' }),
    customizable: true,
  }),
  Object.freeze({
    id: 'workflows',
    kind: 'link',
    label: 'Workflows',
    icon: 'structure',
    to: '/workspace/workflows',
    match: Object.freeze({
      paths: Object.freeze(['/workspace/workflows', '/workspace/builds', '/workspace/solutions']),
    }),
    customizable: true,
  }),
  Object.freeze({
    id: 'structure',
    kind: 'link',
    label: 'Workspace',
    icon: 'structure',
    to: '/workspace',
    match: Object.freeze({ path: '/workspace', end: true }),
    customizable: true,
  }),
  Object.freeze({
    id: 'intelligence',
    kind: 'group',
    label: 'Intelligence',
    icon: 'intelligence',
    customizable: true,
    children: Object.freeze([
      Object.freeze({
        id: 'agents',
        kind: 'link',
        label: 'Agents',
        to: '/agent-hub',
        match: Object.freeze({ path: '/agent-hub' }),
      }),
      Object.freeze({
        id: 'capabilities',
        kind: 'link',
        label: 'Capabilities',
        to: '/tools',
        match: Object.freeze({ path: '/tools' }),
      }),
      Object.freeze({
        id: 'knowledge',
        kind: 'link',
        label: 'Knowledge',
        to: '/knowledge-base',
        match: Object.freeze({ path: '/knowledge-base' }),
      }),
      Object.freeze({
        id: 'results',
        kind: 'link',
        label: 'Results',
        to: '/reports',
        match: Object.freeze({ path: '/reports', queryAbsent: ['view'] }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'history',
    kind: 'group',
    label: 'History',
    icon: 'history',
    customizable: true,
    children: Object.freeze([
      Object.freeze({
        id: 'assistant-chats',
        kind: 'link',
        label: 'Assistant Chats',
        to: '/history/chats',
        match: Object.freeze({ path: '/history/chats' }),
      }),
      Object.freeze({
        id: 'goal-runs',
        kind: 'link',
        label: 'Goal Runs',
        to: '/history/goals',
        match: Object.freeze({ path: '/history/goals' }),
      }),
      Object.freeze({
        id: 'results-artifacts',
        kind: 'link',
        label: 'Results & Artifacts',
        to: '/history/results',
        match: Object.freeze({ path: '/history/results' }),
      }),
    ]),
  }),
]);

export const GCP_FOOTER_NAV_ITEMS = Object.freeze([
  Object.freeze({
    id: 'notifications',
    kind: 'link',
    label: 'Notifications',
    icon: 'notifications',
    to: '/notification-center',
    match: Object.freeze({ path: '/notification-center' }),
  }),
  Object.freeze({
    id: 'activity-usage',
    kind: 'link',
    label: 'Activity & Usage',
    icon: 'activity',
    to: '/audit-log',
    match: Object.freeze({ path: '/audit-log' }),
  }),
  Object.freeze({
    id: 'settings',
    kind: 'link',
    label: 'Settings',
    icon: 'settings',
    to: '/settings',
    match: Object.freeze({ path: '/settings' }),
  }),
  Object.freeze({
    id: 'edit-sidebar',
    kind: 'control',
    label: 'Edit sidebar',
    icon: 'edit-sidebar',
  }),
]);

export const GCP_CUSTOMIZABLE_NAV_ITEMS = Object.freeze(
  GCP_PRIMARY_NAV_ITEMS.filter((item) => item.customizable).map(({ id, label }) =>
    Object.freeze({ id, label })
  )
);

function asLocation(location) {
  if (typeof location === 'string') {
    const parsed = new URL(location, 'https://orqaly.invalid');
    return { pathname: parsed.pathname, search: parsed.search };
  }
  return {
    pathname: location?.pathname || '/',
    search: location?.search || '',
  };
}

function pathMatches(pathname, expected, end = false) {
  if (!expected) return false;
  if (end) return pathname === expected;
  return pathname === expected || pathname.startsWith(`${expected}/`);
}

/**
 * Query-aware active matching shared by the permanent and mobile menus.
 *
 * A target with a query string matches those exact key/value pairs. A manifest
 * item may additionally require query keys to be present or absent. Unrelated
 * query keys do not make a route inactive (for example a Goal's projection).
 */
export function isGcpNavItemActive(item, location) {
  if (!item) return false;
  const current = asLocation(location);
  const target = item.to ? new URL(item.to, 'https://orqaly.invalid') : null;
  const match = item.match || (target ? { path: target.pathname, end: true } : null);
  if (
    !match ||
    !(match.paths || [match.path]).some((path) => pathMatches(current.pathname, path, match.end))
  )
    return false;

  const params = new URLSearchParams(current.search);
  if ((match.queryPresent || []).some((key) => !params.has(key))) return false;
  if ((match.queryAbsent || []).some((key) => params.has(key))) return false;
  if (
    target?.search &&
    [...target.searchParams.entries()].some(([key, value]) => params.get(key) !== value)
  ) {
    return false;
  }
  if (
    match.queryEquals &&
    Object.entries(match.queryEquals).some(([key, value]) => params.get(key) !== String(value))
  ) {
    return false;
  }
  return true;
}

export function gcpNavStorageKey(clerkUserId) {
  if (!clerkUserId) return null;
  return `orqaly:gcp-standard-nav:v${GCP_NAV_STORAGE_VERSION}:${encodeURIComponent(clerkUserId)}`;
}
