// Tabs that render their own content and ignore the cards/table view mode, so
// the view toggle only appears when browsing a document category.
const NON_DOCUMENT_TABS = [
  'sources',
  'monitor',
  'github-offers',
  'phone-contacts',
  'mail-contacts',
];

export function showsViewToggle(tab) {
  return !NON_DOCUMENT_TABS.includes(tab);
}
