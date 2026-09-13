/**
 * Bundled organization templates — free starter structures for the Marketplace.
 * Each template provides a pre-built org hierarchy that users can clone.
 */

export const ORG_TEMPLATES = [
  {
    id: 'tpl-holding',
    name: 'Holding Company',
    description:
      'Parent entity governing multiple subsidiaries. Classic structure for diversified businesses with centralized strategy and decentralized operations.',
    type: 'holding',
    industry: 'Multi-industry',
    entityCount: 5,
    levels: 3,
    entities: [
      { name: 'Group HQ', level: 0, role: 'holding', parentId: null },
      { name: 'Tech Subsidiary', level: 1, role: 'subsidiary', parentId: 'Group HQ' },
      { name: 'Finance Subsidiary', level: 1, role: 'subsidiary', parentId: 'Group HQ' },
      { name: 'Engineering Division', level: 2, role: 'division', parentId: 'Tech Subsidiary' },
      { name: 'Product Division', level: 2, role: 'division', parentId: 'Tech Subsidiary' },
    ],
  },
  {
    id: 'tpl-supply-chain',
    name: 'Supply Chain Network',
    description:
      'End-to-end supply chain structure from raw material suppliers through manufacturing to distribution and retail endpoints.',
    type: 'holding',
    industry: 'Manufacturing',
    entityCount: 6,
    levels: 4,
    entities: [
      { name: 'Supply Chain HQ', level: 0, role: 'holding', parentId: null },
      { name: 'Procurement', level: 1, role: 'division', parentId: 'Supply Chain HQ' },
      { name: 'Manufacturing', level: 1, role: 'subsidiary', parentId: 'Supply Chain HQ' },
      { name: 'Logistics', level: 1, role: 'division', parentId: 'Supply Chain HQ' },
      { name: 'Warehouse Ops', level: 2, role: 'department', parentId: 'Logistics' },
      { name: 'Retail Distribution', level: 2, role: 'department', parentId: 'Logistics' },
    ],
  },
  {
    id: 'tpl-matrix',
    name: 'Matrix Organization',
    description:
      'Dual reporting structure combining functional departments with project/product lines. Ideal for complex organizations needing cross-functional collaboration.',
    type: 'division',
    industry: 'Technology',
    entityCount: 7,
    levels: 2,
    entities: [
      { name: 'Corporate HQ', level: 0, role: 'holding', parentId: null },
      { name: 'Engineering Dept', level: 1, role: 'division', parentId: 'Corporate HQ' },
      { name: 'Marketing Dept', level: 1, role: 'division', parentId: 'Corporate HQ' },
      { name: 'Sales Dept', level: 1, role: 'division', parentId: 'Corporate HQ' },
      { name: 'Product Line A', level: 1, role: 'division', parentId: 'Corporate HQ' },
      { name: 'Product Line B', level: 1, role: 'division', parentId: 'Corporate HQ' },
      { name: 'Product Line C', level: 1, role: 'division', parentId: 'Corporate HQ' },
    ],
  },
  {
    id: 'tpl-flat-startup',
    name: 'Flat Startup',
    description:
      'Minimal hierarchy for early-stage startups. All teams report directly to founders with maximum autonomy and speed.',
    type: 'department',
    industry: 'Technology',
    entityCount: 4,
    levels: 1,
    entities: [
      { name: 'Startup HQ', level: 0, role: 'holding', parentId: null },
      { name: 'Product & Engineering', level: 1, role: 'department', parentId: 'Startup HQ' },
      { name: 'Growth & Marketing', level: 1, role: 'department', parentId: 'Startup HQ' },
      { name: 'Operations', level: 1, role: 'department', parentId: 'Startup HQ' },
    ],
  },
  {
    id: 'tpl-division-based',
    name: 'Division-Based Group',
    description:
      'Independent profit-and-loss divisions under a group umbrella. Each division operates as a semi-autonomous business unit.',
    type: 'holding',
    industry: 'Consulting',
    entityCount: 7,
    levels: 2,
    entities: [
      { name: 'Group Holdings', level: 0, role: 'holding', parentId: null },
      { name: 'Consulting Division', level: 1, role: 'subsidiary', parentId: 'Group Holdings' },
      { name: 'Technology Division', level: 1, role: 'subsidiary', parentId: 'Group Holdings' },
      { name: 'Financial Services', level: 1, role: 'subsidiary', parentId: 'Group Holdings' },
      { name: 'Media Division', level: 1, role: 'subsidiary', parentId: 'Group Holdings' },
      { name: 'Shared Services', level: 1, role: 'division', parentId: 'Group Holdings' },
      { name: 'Corporate Office', level: 1, role: 'department', parentId: 'Group Holdings' },
    ],
  },
  {
    id: 'tpl-franchise',
    name: 'Franchise Model',
    description:
      'Franchisor headquarters with multiple franchisee branches. Centralized branding and operations with local execution.',
    type: 'holding',
    industry: 'Retail',
    entityCount: 6,
    levels: 2,
    entities: [
      { name: 'Franchise HQ', level: 0, role: 'holding', parentId: null },
      { name: 'Brand & Marketing', level: 1, role: 'department', parentId: 'Franchise HQ' },
      { name: 'Operations Standards', level: 1, role: 'department', parentId: 'Franchise HQ' },
      { name: 'Franchise Region A', level: 1, role: 'subsidiary', parentId: 'Franchise HQ' },
      { name: 'Franchise Region B', level: 1, role: 'subsidiary', parentId: 'Franchise HQ' },
      { name: 'Franchise Region C', level: 1, role: 'subsidiary', parentId: 'Franchise HQ' },
    ],
  },
  {
    id: 'tpl-business-holding',
    name: 'Business Holding Group',
    description:
      'Diversified holding with four operating subsidiaries — iGaming, Ecommerce, Fintech, and Affiliate Network. Each entity is pre-wired with sector-specific AI agents and a guided "Switch to Real" path for real-world incorporation, banking, and licensing.',
    type: 'holding',
    industry: 'Multi-sector',
    entityCount: 5,
    levels: 2,
    isBusiness: true,
    entities: [
      { name: 'Holding Group HQ', level: 0, role: 'holding', parentId: null, sectorType: null },
      {
        name: 'iGaming Co.',
        level: 1,
        role: 'subsidiary',
        parentId: 'Holding Group HQ',
        sectorType: 'gambling',
      },
      {
        name: 'Ecommerce Co.',
        level: 1,
        role: 'subsidiary',
        parentId: 'Holding Group HQ',
        sectorType: 'ecommerce',
      },
      {
        name: 'Fintech Co.',
        level: 1,
        role: 'subsidiary',
        parentId: 'Holding Group HQ',
        sectorType: 'fintech',
      },
      {
        name: 'Affiliate Co.',
        level: 1,
        role: 'subsidiary',
        parentId: 'Holding Group HQ',
        sectorType: 'affiliate',
      },
    ],
  },
];
