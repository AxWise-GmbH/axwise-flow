import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';

export const BUSINESS_MODULES = [
  {
    id: 'partners',
    name: 'Partners',
    description:
      'Universal relationship management - partners, suppliers, warehouses, and CRM contacts with personalized parameters, filters, and metrics.',
    status: 'available',
    iconName: 'HandshakeOutlined',
    color: '#0EA5E9',
    category: 'operations',
    navGroupLabel: 'PARTNERS',
    navItems: [
      { label: 'Overview', path: '/partners-hub/overview' },
      { label: 'Partners', path: '/partners-hub/partner' },
      { label: 'Suppliers', path: '/partners-hub/supplier' },
      { label: 'Warehouses', path: '/partners-hub/warehouse' },
      { label: 'CRM', path: '/partners-hub/crm' },
      { label: 'Settings', path: '/partners-hub/settings' },
    ],
  },
  {
    id: 'gambling',
    name: 'Gambling',
    description:
      'Full-stack iGaming operations — manage partners, campaigns, finances, and content injection for gambling verticals.',
    status: 'available',
    iconName: 'CasinoOutlined',
    color: '#E53935',
    category: 'gaming',
    navGroupLabel: 'BUSINESS',
    navItems: [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'Partners', path: '/partners' },
      { label: 'Finances', path: '/finances' },
      { label: 'Campaigns', path: '/campaigns' },
      { label: 'Injection', path: '/injection-hub' },
    ],
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    description:
      'Online store management — product catalogs, orders, inventory, and fulfillment workflows powered by AI agents.',
    status: 'coming_soon',
    iconName: 'ShoppingCartOutlined',
    color: '#2563EB',
    category: 'commerce',
    navGroupLabel: 'E-COMMERCE',
    navItems: [],
  },
  {
    id: 'crypto',
    name: 'Crypto (Gateway & Wallet)',
    description:
      'Crypto payment gateway and wallet management — accept, send, and track digital assets with automated compliance.',
    status: 'coming_soon',
    iconName: 'CurrencyBitcoin',
    color: '#F59E0B',
    category: 'crypto',
    navGroupLabel: 'CRYPTO',
    navItems: [],
  },
  {
    id: 'affiliate',
    name: 'Affiliate Network',
    description:
      'Build and manage your affiliate network — track referrals, commissions, payouts, and performance across partners.',
    status: 'available',
    iconName: 'ShareOutlined',
    color: '#7C3AED',
    category: 'marketing',
    navGroupLabel: 'MARKETING',
    navItems: [
      { label: 'Dashboard', path: '/marketing/dashboard' },
      { label: 'Audiences', path: '/marketing/audiences' },
      { label: 'Campaigns', path: '/marketing/campaigns' },
      { label: 'Content', path: '/marketing/content' },
      { label: 'Acquisition', path: '/marketing/acquisition' },
      { label: 'Conversion', path: '/marketing/conversion' },
      { label: 'Retention', path: '/marketing/retention' },
      { label: 'Team & Ops', path: '/marketing/team' },
    ],
  },
];

export const BUSINESS_MODULE_ICON_MAP = {
  CasinoOutlined: CasinoOutlinedIcon,
  ShoppingCartOutlined: ShoppingCartOutlinedIcon,
  CurrencyBitcoin: CurrencyBitcoinIcon,
  ShareOutlined: ShareOutlinedIcon,
  HandshakeOutlined: HandshakeOutlinedIcon,
};
