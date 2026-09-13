export const DRAWER_WIDTH = 260;
export const SIDEBAR_RAIL_WIDTH = 56; // collapsed desktop sidebar width
export const SIDEBAR_INSET = 12; // floating sidebar margin from viewport edges
export const HEADER_HEIGHT = 64; // header bar height for layout calculations
export const HEADER_HEIGHT_XS = 56; // mobile toolbar, mirrors TopBar minHeight.xs
export const HEADER_OFFSET = {
  xs: HEADER_HEIGHT_XS + SIDEBAR_INSET,
  sm: HEADER_HEIGHT + SIDEBAR_INSET,
};

// Layout spacing — minimal padding so content sits close to edges (per design system)
export const CONTENT_PADDING = { xs: 0.75, sm: 1, md: 1.25 }; // main content area — close to viewport edges
export const PAGE_PADDING = { xs: 0.75, sm: 1, md: 1.25 }; // page-level containers
export const SECTION_PADDING = { xs: 1.25, sm: 1.5, md: 2 }; // cards, papers, section blocks

// Horizontal inset for every page-level block (BentoCard wrapped by PageLayout).
// Combined with <main>'s CONTENT_PADDING this places the block 12px from each
// viewport edge — the same gutter the floating sidebar uses (SIDEBAR_INSET),
// so sidebar and page content share one consistent rhythm.
// Formula per breakpoint: (12 / 8) - CONTENT_PADDING.
export const PAGE_BLOCK_MARGIN_X = { xs: 0.75, sm: 0.5, md: 0.25 };

export const TRAFFIC_SOURCES = [
  'SMS',
  'PPC',
  'FB',
  'Google',
  'TikTok',
  'SEO',
  'Email',
  'Native',
  'Adexium',
  'TADS',
];

export const GROUP_TYPES = ['Webmaster', 'Partner', 'Personal database'];

export const GROUP_SUBTYPES = {
  Webmaster: 'Personal Traffic',
  Partner: 'Our DB',
  'Personal database': 'Personal DB',
};

export const AGREEMENT_TYPES = ['Revshare', 'CPL', 'Hybrid'];

export const FUNNEL_STATUSES = [
  'Contacted',
  'Meeting Scheduled',
  'Proposal Sent',
  'Agreed start date',
  'Working',
];

// Light theme — readable on white/light grey
export const FUNNEL_STATUS_COLORS = {
  Contacted: { bg: '#F1F5F9', color: '#64748B' },
  'Meeting Scheduled': { bg: '#DBEAFE', color: '#2563EB' },
  'Proposal Sent': { bg: '#FEF3C7', color: '#D97706' },
  'Agreed start date': { bg: '#CCFBF1', color: '#0D9488' },
  Working: { bg: '#D1FAE5', color: '#059669' },
};

// Dark theme — readable on #131920 / dark paper
export const FUNNEL_STATUS_COLORS_DARK = {
  Contacted: { bg: 'rgba(139, 148, 158, 0.22)', color: '#8B949E' },
  'Meeting Scheduled': { bg: 'rgba(59, 130, 246, 0.22)', color: '#60A5FA' },
  'Proposal Sent': { bg: 'rgba(234, 179, 8, 0.22)', color: '#FACC15' },
  'Agreed start date': { bg: 'rgba(34, 197, 94, 0.18)', color: '#4ADE80' },
  Working: { bg: 'rgba(34, 197, 94, 0.28)', color: '#22C55E' },
};

export const AGREEMENT_COLORS = {
  Revshare: { bg: '#FFF7ED', color: '#EA580C' },
  CPL: { bg: '#EFF6FF', color: '#2563EB' },
  Hybrid: { bg: '#F5F3FF', color: '#7C3AED' },
};

export const AGREEMENT_COLORS_DARK = {
  Revshare: { bg: 'rgba(234, 88, 12, 0.18)', color: '#FB923C' },
  CPL: { bg: 'rgba(59, 130, 246, 0.18)', color: '#60A5FA' },
  Hybrid: { bg: 'rgba(124, 58, 237, 0.18)', color: '#A78BFA' },
};

export const TRAFFIC_SOURCE_ICONS = {
  SMS: '💬',
  PPC: '🎯',
  FB: '📘',
  Google: '🔍',
  TikTok: '🎵',
  SEO: '📈',
  Email: '✉️',
  Native: '📰',
  Adexium: '🅰️',
  TADS: '📢',
};

export const COUNTRY_FLAGS = {
  BR: '🇧🇷',
  US: '🇺🇸',
  GB: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  ES: '🇪🇸',
  IT: '🇮🇹',
  CA: '🇨🇦',
  AU: '🇦🇺',
  JP: '🇯🇵',
  MX: '🇲🇽',
  IN: '🇮🇳',
  PL: '🇵🇱',
  TR: '🇹🇷',
  NG: '🇳🇬',
  ZA: '🇿🇦',
  AR: '🇦🇷',
  CL: '🇨🇱',
  CO: '🇨🇴',
  PE: '🇵🇪',
  UA: '🇺🇦',
  KZ: '🇰🇿',
  RO: '🇷🇴',
  PH: '🇵🇭',
  TH: '🇹🇭',
  VN: '🇻🇳',
  ID: '🇮🇩',
  EG: '🇪🇬',
  KE: '🇰🇪',
  BD: '🇧🇩',
  NZ: '🇳🇿',
  NL: '🇳🇱',
  SE: '🇸🇪',
  NO: '🇳🇴',
  DK: '🇩🇰',
  FI: '🇫🇮',
  CH: '🇨🇭',
  AT: '🇦🇹',
  BE: '🇧🇪',
  IE: '🇮🇪',
  LU: '🇱🇺',
  SG: '🇸🇬',
};

export const TASK_STATUSES = ['todo', 'inProgress', 'done'];

export const TASK_STATUS_LABELS = {
  todo: 'Not Started',
  inProgress: 'In Progress',
  done: 'Completed',
};

export const TASK_PRIORITIES = ['high', 'medium', 'low'];

export const PRIORITY_COLORS = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#94A3B8',
};

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export const INDUSTRY_TYPES = ['Gambling', 'Ecommerce', 'Fintech'];

export const INDUSTRY_METRICS = {
  Gambling: [
    {
      key: 'ftd',
      label: 'FTD (First Time Deposit)',
      desc: 'Players who make their first deposit',
      payout: 'CPA / Hybrid',
      importance: 'Very High',
      source: 'S2S Connection',
    },
    {
      key: 'deposits',
      label: 'Deposits',
      desc: 'Total number of deposits made',
      payout: 'Revenue Share / Hybrid',
      importance: 'High',
      source: 'S2S Connection',
    },
    {
      key: 'ngr',
      label: 'NGR (Net Gaming Revenue)',
      desc: 'Revenue generated after deducting winnings',
      payout: 'Revenue Share',
      importance: 'Very High',
      source: 'API Integration',
    },
    {
      key: 'ggr',
      label: 'GGR (Gross Gaming Revenue)',
      desc: 'Total bets placed minus winnings',
      payout: 'Revenue Share',
      importance: 'High',
      source: 'API Integration',
    },
    {
      key: 'activePlayers',
      label: 'Active Players',
      desc: 'Players who deposit and play regularly',
      payout: 'Revenue Share',
      importance: 'High',
      source: 'Webhook / Pixel',
    },
    {
      key: 'ltv',
      label: 'Player LTV',
      desc: 'Lifetime Value of a referred player',
      payout: 'Revenue Share',
      importance: 'High',
      source: 'API Integration',
    },
    {
      key: 'retentionRate',
      label: 'Retention Rate',
      desc: '% of players who remain active after 30 days',
      payout: 'Revenue Share',
      importance: 'Medium',
      source: 'API Integration',
    },
    {
      key: 'cpa',
      label: 'CPA (Cost Per Acquisition)',
      desc: 'Fixed payment per qualified player',
      payout: 'CPA',
      importance: 'Very High',
      source: 'S2S Connection',
    },
    {
      key: 'betVolume',
      label: 'Bet Volume / Handle',
      desc: 'Total amount wagered by referred players',
      payout: 'Revenue Share',
      importance: 'Medium',
      source: 'S2S Connection',
    },
  ],
  Ecommerce: [
    {
      key: 'sales',
      label: 'Sales / Orders',
      desc: 'Total number of completed purchases',
      payout: 'Commission per sale',
      importance: 'Very High',
      source: 'Affiliate Link',
    },
    {
      key: 'revenue',
      label: 'Revenue',
      desc: 'Total sales value generated',
      payout: '% of revenue',
      importance: 'Very High',
      source: 'Affiliate Link',
    },
    {
      key: 'aov',
      label: 'AOV (Average Order Value)',
      desc: 'Average amount spent per order',
      payout: '% of revenue',
      importance: 'High',
      source: 'API Integration',
    },
    {
      key: 'conversionRate',
      label: 'Conversion Rate',
      desc: '% of clicks that result in a purchase',
      payout: 'All models',
      importance: 'High',
      source: 'Webhook / Pixel',
    },
    {
      key: 'epc',
      label: 'EPC (Earnings Per Click)',
      desc: 'Revenue earned per click',
      payout: 'All models',
      importance: 'High',
      source: 'Affiliate Link',
    },
    {
      key: 'itemsPerOrder',
      label: 'Items Per Order',
      desc: 'Average number of products per order',
      payout: '% of revenue',
      importance: 'Medium',
      source: 'API Integration',
    },
    {
      key: 'refundRate',
      label: 'Return / Refund Rate',
      desc: 'Percentage of orders returned or refunded',
      payout: '% of revenue',
      importance: 'Medium',
      source: 'Webhook / Pixel',
    },
    {
      key: 'repeatPurchaseRate',
      label: 'Repeat Purchase Rate',
      desc: '% of customers who buy again',
      payout: '% of revenue',
      importance: 'Medium',
      source: 'API Integration',
    },
    {
      key: 'newVsReturning',
      label: 'New vs Returning Customers',
      desc: 'Split between first-time and repeat buyers',
      payout: '% of revenue',
      importance: 'Medium',
      source: 'Webhook / Pixel',
    },
  ],
  Fintech: [
    {
      key: 'fundedAccounts',
      label: 'Funded Accounts',
      desc: 'Users who deposit money into the account',
      payout: 'CPA / Revenue Share',
      importance: 'Very High',
      source: 'S2S Connection',
    },
    {
      key: 'kycRate',
      label: 'KYC Completion Rate',
      desc: '% of users who complete identity verification',
      payout: 'CPA',
      importance: 'High',
      source: 'API Integration',
    },
    {
      key: 'depositsVolume',
      label: 'Deposits / Volume',
      desc: 'Total amount deposited or transacted',
      payout: 'Revenue Share',
      importance: 'Very High',
      source: 'S2S Connection',
    },
    {
      key: 'arpu',
      label: 'ARPU (Average Revenue Per User)',
      desc: 'Revenue generated per referred user',
      payout: 'Revenue Share',
      importance: 'High',
      source: 'API Integration',
    },
    {
      key: 'ltv',
      label: 'LTV (Lifetime Value)',
      desc: 'Long-term value of a referred user',
      payout: 'Revenue Share',
      importance: 'High',
      source: 'API Integration',
    },
    {
      key: 'cpa',
      label: 'CPA (Cost Per Acquisition)',
      desc: 'Payment for qualified funded users',
      payout: 'CPA',
      importance: 'Very High',
      source: 'S2S Connection',
    },
    {
      key: 'cpl',
      label: 'CPL (Cost Per Lead)',
      desc: 'Payment for qualified leads (less common now)',
      payout: 'CPL',
      importance: 'Medium',
      source: 'Affiliate Link',
    },
    {
      key: 'activeUsers',
      label: 'Active Users / Retention',
      desc: 'Users who remain active after 30/60/90 days',
      payout: 'Revenue Share',
      importance: 'High',
      source: 'Webhook / Pixel',
    },
    {
      key: 'transactionVolume',
      label: 'Transaction Volume',
      desc: 'Total value of transactions made',
      payout: 'Revenue Share',
      importance: 'Medium',
      source: 'S2S Connection',
    },
    {
      key: 'loanApprovals',
      label: 'Loan Origination / Approvals',
      desc: '(For lending fintechs) Number of loans issued',
      payout: 'CPA / Revenue Share',
      importance: 'High',
      source: 'API Integration',
    },
  ],
};
