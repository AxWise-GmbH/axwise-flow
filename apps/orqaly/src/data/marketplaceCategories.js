/**
 * Public marketplace category list - aligned with in-app Marketplace tabs.
 * Used by /marketplace-preview marketing page.
 */
export const MARKETPLACE_PUBLIC_CATEGORIES = [
  {
    id: 'agents',
    label: 'Agents',
    description: 'Voice and chat agents ready to deploy.',
    iconName: 'SmartToyOutlined',
  },
  {
    id: 'skills',
    label: 'Skills',
    description: 'Add capabilities to any agent.',
    iconName: 'PsychologyOutlined',
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Platform connectors plus libraries you upload yourself.',
    iconName: 'BuildOutlined',
  },
  {
    id: 'teams',
    label: 'Consilium',
    description: 'Board templates for your virtual directors.',
    iconName: 'GroupsOutlined',
  },
  {
    id: 'orgs',
    label: 'Organizations',
    description: 'Org structures for teams and agents.',
    iconName: 'CorporateFareOutlined',
  },
  {
    id: 'businesses',
    label: 'Businesses',
    description: 'Verified business model kits.',
    iconName: 'BusinessCenterOutlined',
  },
  {
    id: 'replicators',
    label: 'Replicators',
    description: 'Turn an API into an agent-ready workflow.',
    iconName: 'IntegrationInstructionsOutlined',
  },
];

export function marketplaceTabPath(categoryId) {
  return `/marketplace?tab=${encodeURIComponent(categoryId)}`;
}
