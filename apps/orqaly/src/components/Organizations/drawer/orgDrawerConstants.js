/** Tab indices for OrgDetailDrawer — keep in sync with tab labels. */
export const ORG_TAB = {
  OVERVIEW: 0,
  RESULTS: 1,
  TEAMS: 2,
  OPERATIONS: 3,
  FINANCES: 4,
  GOVERNANCE: 5,
};

export const ORG_TAB_LABELS = [
  'Overview',
  'Results',
  'Teams',
  'Operations',
  'Finances',
  'Governance',
];

export function buildOrgDeepLink(path, orgId, params = {}) {
  const qs = new URLSearchParams({ org_id: orgId, ...params });
  return `${path}?${qs.toString()}`;
}
