export const EARN_HERO = {
  eyebrow: 'PRODUCT · Peer-to-peer community',
  landingEyebrow: 'Peer-to-peer community',
  title: 'Share and Earn',
  subtitle:
    'Members offer LLM power, storage, and solutions to each other - better quality, lower cost. Orqaly connects users.',
};

export const EARN_FEATURE_MOSAIC = {
  title: 'Four ways users earn from each other',
  subtitle:
    'You offer a service. Another user consumes it. Orqaly sits in the middle - routing, trust, and metering - not selling on your behalf.',
};

export const EARN_FEATURE_TILES = [
  {
    iconName: 'MemoryOutlined',
    title: 'Local LLM sharing',
    body: 'Offer inference on your hardware to other users; they bring their own API keys. You earn when your node runs their jobs.',
  },
  {
    iconName: 'StorefrontRounded',
    title: 'Second-layer marketplace',
    body: 'Build agents, tools, skills, and replicators for other members to install. You ship; they use; you keep 85%.',
  },
  {
    iconName: 'CloudUploadOutlined',
    title: 'Second Brain Storage',
    body: 'Lend spare storage to other users so they run workloads cheaper. Earn when members use your space.',
  },
  {
    iconName: 'AccountBalanceWalletOutlined',
    title: 'Blockchain points',
    body: 'Peer earnings tracked on-chain, convertible to USDT. Coming soon - credits accrue today when others use what you share.',
  },
];

export const EARN_PILLARS = [
  {
    id: 'llm',
    title: 'You serve. They bring their keys.',
    body: 'One user offers local model capacity; another user sends inference jobs. Orqaly matches supply to demand and meters the exchange - but never touches either party’s API keys (BYOK).',
    extra:
      'You earn when your hardware runs work for another member. Orqaly is the connector, not the compute provider.',
    reverse: false,
    tinted: true,
  },
  {
    id: 'marketplace',
    title: 'Build for other users, publish to earn',
    body: 'Ship second-layer solutions - agents, tools, skills, replicators - that other members install into their workspaces. User-built, user-bought; Orqaly hosts discovery and checkout.',
    extra:
      'You keep 85%. Stripe Connect pays you when another user installs. Orqaly handles listing, billing, and trust & safety - you handle the product.',
    reverse: true,
    tinted: false,
  },
  {
    id: 'storage',
    title: 'Share storage with other members',
    body: 'Offer unused storage so other users run workloads at lower cost than default cloud tiers. Your bucket, their files - Orqaly orchestrates access and credits you when space is consumed.',
    extra:
      'BYOS-aligned: you own the storage; members rent capacity peer-to-peer. The platform meters and settles, it does not resell your disk.',
    reverse: false,
    tinted: true,
  },
  {
    id: 'points',
    title: 'Peer earnings, settled on-chain',
    body: 'When other users use your LLM node, listing, or storage, credits accrue to your wallet. A community ledger tracks member-to-member value - convertible to USDT when cash-out launches.',
    extra:
      'Orqaly does not hold your earnings as a vendor float. It records what users owe each other and helps settle. USDT conversion is coming soon - join the waitlist.',
    reverse: true,
    tinted: false,
  },
];

export const EARN_TIMELINE = {
  title: 'From one user to another - with Orqaly in the middle',
  steps: [
    {
      n: '01',
      title: 'You offer a service',
      body: 'LLM node, storage space, or a listing goes live - offered by you to other members.',
    },
    {
      n: '02',
      title: 'Another user uses it',
      body: 'Demand is matched peer-to-peer. Orqaly routes the request and meters usage - installs, inference jobs, or storage hours.',
    },
    {
      n: '03',
      title: 'You earn credits',
      body: 'Value flows from the user who consumed to the user who provided. Marketplace share (85%) or usage credits land in your balance.',
    },
    {
      n: '04',
      title: 'Platform settles',
      body: 'Orqaly records the exchange on-chain. USDT conversion launches soon - join the waitlist for early access.',
    },
  ],
};

export const EARN_FAQ = [
  {
    q: 'Do I share my API keys when I contribute LLM capacity?',
    a: 'No. You offer compute to other users; they always bring their own keys (BYOK). Orqaly routes the job between you - it never holds or crosses either party’s credentials.',
  },
  {
    q: 'Who provides the service - Orqaly or other users?',
    a: 'Other users. You share capacity, storage, or a listing; community members consume it. Orqaly is the layer in the middle: discovery, routing, metering, and payouts - not the vendor.',
  },
  {
    q: 'Who can contribute?',
    a: 'Any paid workspace can offer local LLM nodes, list marketplace solutions, or join the community storage pool for other members to use. Free-tier users can browse and install; publishing and earning unlock on the paid plan.',
  },
  {
    q: 'When will USDT conversion launch?',
    a: 'The on-chain point ledger and USDT cash-out are coming soon. Earn credits today when other users use what you share - join the waitlist via signup or contact us for early access.',
  },
];

export const EARN_CLOSING_CTA = 'Users serve users. Orqaly connects the dots.';

export const EARN_HANDSHAKE_BANNER = {
  title: 'Users serve users. Orqaly connects the dots.',
  body: 'One member offers capacity or builds a solution; another member uses it. Orqaly routes, meters, and settles - it is not the vendor.',
};
