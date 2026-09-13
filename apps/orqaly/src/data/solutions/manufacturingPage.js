export const HUB_INTRO = {
  eyebrow: 'Floor & supply chain',
  title: 'One inbox for suppliers, stock, and QC.',
  subtitle:
    'Supplier comms threaded, inventory answered from chat, QC anomalies escalated, and lead-time slips paged to the planner — without email archaeology.',
};

export const PILLARS = [
  {
    id: 'supplier',
    iconName: 'EmailOutlined',
    title: 'Supplier inbox',
    body: 'Replies, negotiates lead times, and threads PO conversations to the right buyer.',
    linkLabel: '11 handled · 2 escalated',
  },
  {
    id: 'inventory',
    iconName: 'Inventory2Outlined',
    title: 'Inventory answers',
    body: 'Stock questions from chat; reorder drafts when raw materials run low.',
    linkLabel: 'Reorder points',
  },
  {
    id: 'qc',
    iconName: 'FactCheckOutlined',
    title: 'QC summaries',
    body: 'Reads QC logs, surfaces trends, pages the floor lead on anomalies.',
    linkLabel: 'Weekly digest',
  },
  {
    id: 'leadtime',
    iconName: 'ScheduleOutlined',
    title: 'Lead-time watch',
    body: 'Watches inbound POs and pages planners when slips threaten production.',
    linkLabel: 'Planner alerts',
  },
];

export const SPOTLIGHT_SUPPLIER = {
  eyebrow: 'Suppliers',
  title: 'Supplier email stops living in personal inboxes.',
  body: 'Supplier agent handles confirmations, lead-time slips, and stock checks — escalating only what needs a human buyer.',
  bullets: [
    'Auto-reply on routine PO threads',
    'Lead-time slips paged instantly',
    'Buyer routing by category',
    'Morning inbox digest',
  ],
};

export const SPOTLIGHT_INVENTORY = {
  eyebrow: 'Inventory',
  title: 'Stock questions answered on the floor.',
  body: 'Inventory agent answers “do we have enough?” from chat and flags materials that will miss month-end without a reorder.',
  bullets: [
    'Chat answers from live stock',
    'Reorder draft to suppliers',
    'Floor-friendly responses',
    'Month-end shortage forecast',
  ],
};

export const SPOTLIGHT_QC = {
  eyebrow: 'Quality',
  title: 'QC logs someone actually reads.',
  body: 'QC agent summarizes batch trends, highlights top issues, and escalates anomalies before they become recalls.',
  bullets: [
    'Batch anomaly detection',
    'Weekly trend summary',
    'Floor lead notifications',
    'Export for audits',
  ],
};

export const SPOTLIGHT_LEADTIME = {
  eyebrow: 'Planning',
  title: 'Lead-time changes never hide in email.',
  body: 'Lead-time tracker watches inbound POs; any slip triggers a planner page with context and suggested mitigations.',
  bullets: [
    'PO status monitoring',
    'Slip detection vs promise',
    'Planner page with context',
    'Mitigation suggestions',
  ],
};

export const MOSAIC_TITLE = 'Agents on the manufacturing floor';
export const CLOSING_CTA = 'Quieter inbox. Better-informed floor.';
export const RELATED_ITEMS = [
  {
    label: 'E-commerce',
    to: '/solutions/ecommerce',
    iconName: 'StorefrontOutlined',
    blurb: 'Orders, suppliers, support on autopilot.',
  },
  {
    label: 'Legal',
    to: '/solutions/legal',
    iconName: 'GavelOutlined',
    blurb: 'Intake to first draft.',
  },
  {
    label: 'Healthcare',
    to: '/solutions/healthcare',
    iconName: 'LocalHospitalOutlined',
    blurb: 'Voice triage and intake.',
  },
];
