import { useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fireConfetti } from '../../utils/confettiCanvas';
import { PAGE_INFO } from '../../config/pageInfo';
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Divider,
  Modal,
  IconButton,
  Tooltip,
  Collapse,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
// Arena (/arena) is deliberately NOT in NAV_GROUPS: the page ships but stays
// off the left menu. It is reached from the Arena block on the Assistant
// console, from /arena?setup=1, or by URL. Keep this import - putting the item
// back is a one-line change when Arena is ready to be announced.
import StadiumOutlinedIcon from '@mui/icons-material/StadiumOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { DRAWER_WIDTH, SIDEBAR_INSET, HEADER_HEIGHT } from '../../utils/constants';
import { createHoverGlowShadow, buildAssistantPulseSx } from '../../theme/hoverGlow';
import { MOTIVATION_PHRASES } from '../../utils/motivationPhrases';
import Logo from '../Common/Logo';
import { useThemeMode } from '../../context/ThemeContext';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { useEnabledFeatures } from '../../hooks/useEnabledFeatures';
import { useHiddenPages } from '../../hooks/useHiddenPages';
import { MARKETPLACE_FEATURES, FEATURE_ICON_MAP } from '../../config/featureMarketplace';
import { BUSINESS_MODULES } from '../../config/businessModules';
import { useActiveBusinessModules } from '../../hooks/useActiveBusinessModules';
import { useReplicatorsOptional } from '../../context/ReplicatorContext';
import { PERSONAL_CATALOG_LABEL } from '../../config/catalogUi';

import AppIcon from '../icons/AppIcon';

const REPLICATOR_EXPAND_STORAGE_KEY = 'replicator.nav.expanded';
const INCLUDE_DEFERRED_NAV = false;
const LEAN_FEATURE_PATHS = new Set([
  '/agent-hub',
  '/notification-center',
  '/tools',
  '/marketplace',
  '/documentation',
  '/audit-log',
]);

function readExpandOverrides() {
  try {
    const raw = localStorage.getItem(REPLICATOR_EXPAND_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeExpandOverrides(map) {
  try {
    localStorage.setItem(REPLICATOR_EXPAND_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota or privacy-mode failures */
  }
}

const LEGACY_NAV_GROUPS = [
  {
    label: 'CONTROL POINT',
    items: [
      {
        label: 'Home',
        icon: <AppIcon name="HomeOutlined" fallback={HomeOutlinedIcon} />,
        path: '/home',
      },
      {
        label: 'Organizations',
        icon: <AppIcon name="CorporateFareOutlined" fallback={CorporateFareOutlinedIcon} />,
        path: '/organizations',
      },
      {
        label: 'Consilium',
        icon: <AppIcon name="GroupsOutlined" fallback={GroupsOutlinedIcon} />,
        path: '/consilium',
      },
      {
        label: 'Agents',
        icon: <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />,
        path: '/agent-hub',
      },
      {
        label: 'Requests',
        icon: <AppIcon name="WorkOutline" fallback={WorkOutlineIcon} />,
        path: '/job-pool',
      },
      {
        label: 'Tools',
        icon: <AppIcon name="BuildOutlined" fallback={BuildOutlinedIcon} />,
        path: '/tools',
      },
      {
        label: 'Communicator',
        icon: <AppIcon name="ForumOutlined" fallback={ForumOutlinedIcon} />,
        path: '/communicator',
      },
      {
        label: PERSONAL_CATALOG_LABEL,
        icon: <AppIcon name="StorefrontOutlined" fallback={StorefrontOutlinedIcon} />,
        path: '/marketplace',
      },
      {
        label: 'Assistant',
        icon: <AppIcon name="AutoAwesomeOutlined" fallback={AutoAwesomeOutlinedIcon} />,
        path: '/assistant',
        glow: true,
      },
    ],
  },
  {
    label: 'INSTRUMENTS',
    items: [
      {
        label: 'Knowledge',
        icon: <AppIcon name="MenuBookOutlined" fallback={MenuBookOutlinedIcon} />,
        path: '/knowledge-base',
      },
      {
        label: 'Workflow',
        icon: <AppIcon name="AccountTreeOutlined" fallback={AccountTreeOutlinedIcon} />,
        path: '/workflow',
      },
      {
        label: 'Tasks',
        icon: <AppIcon name="AssignmentOutlined" fallback={AssignmentOutlinedIcon} />,
        path: '/task-manager',
      },
      {
        label: 'Projects',
        icon: <AppIcon name="FolderOutlined" fallback={FolderOutlinedIcon} />,
        path: '/projects',
      },
      {
        label: 'Reports',
        icon: <AppIcon name="AssessmentOutlined" fallback={AssessmentOutlinedIcon} />,
        path: '/reports',
        beta: true,
      },
      {
        label: 'Dashboards',
        icon: (
          <AppIcon name="DashboardCustomizeOutlined" fallback={DashboardCustomizeOutlinedIcon} />
        ),
        path: '/dashboards',
        beta: true,
      },
      {
        label: 'Replicators',
        icon: (
          <AppIcon
            name="IntegrationInstructionsOutlined"
            fallback={IntegrationInstructionsOutlinedIcon}
          />
        ),
        path: '/replicators',
        beta: true,
      },
    ],
  },
  {
    label: 'PARTNERS',
    items: [
      {
        label: 'Overview',
        icon: <AppIcon name="DashboardOutlined" fallback={DashboardOutlinedIcon} />,
        path: '/partners-hub/overview',
      },
      {
        label: 'Partners',
        icon: <AppIcon name="HandshakeOutlined" fallback={HandshakeOutlinedIcon} />,
        path: '/partners-hub/partner',
      },
      {
        label: 'Suppliers',
        icon: <AppIcon name="LocalShippingOutlined" fallback={LocalShippingOutlinedIcon} />,
        path: '/partners-hub/supplier',
      },
      {
        label: 'Warehouses',
        icon: <AppIcon name="WarehouseOutlined" fallback={WarehouseOutlinedIcon} />,
        path: '/partners-hub/warehouse',
      },
      {
        label: 'CRM',
        icon: <AppIcon name="ContactsOutlined" fallback={ContactsOutlinedIcon} />,
        path: '/partners-hub/crm',
      },
      {
        label: 'Settings',
        icon: <AppIcon name="SettingsOutlined" fallback={SettingsOutlinedIcon} />,
        path: '/partners-hub/settings',
      },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      {
        label: 'Partners',
        icon: <AppIcon name="PeopleOutlined" fallback={PeopleOutlinedIcon} />,
        path: '/partners',
      },
      {
        label: 'Finances',
        icon: (
          <AppIcon
            name="AccountBalanceWalletOutlined"
            fallback={AccountBalanceWalletOutlinedIcon}
          />
        ),
        path: '/finances',
        adminOnly: true,
      },
      {
        label: 'Campaigns',
        icon: <AppIcon name="CampaignOutlined" fallback={CampaignOutlinedIcon} />,
        path: '/campaigns',
      },
      {
        label: 'Injection',
        icon: (
          <AppIcon
            name="IntegrationInstructionsOutlined"
            fallback={IntegrationInstructionsOutlinedIcon}
          />
        ),
        path: '/injection-hub',
      },
    ],
  },
  {
    label: 'MARKETING',
    items: [
      {
        label: 'Dashboard',
        icon: <AppIcon name="DashboardOutlined" fallback={DashboardOutlinedIcon} />,
        path: '/marketing/dashboard',
      },
      {
        label: 'Audiences',
        icon: <AppIcon name="GroupsOutlined" fallback={GroupsOutlinedIcon} />,
        path: '/marketing/audiences',
      },
      {
        label: 'Campaigns',
        icon: <AppIcon name="CampaignOutlined" fallback={CampaignOutlinedIcon} />,
        path: '/marketing/campaigns',
      },
      {
        label: 'Content',
        icon: <AppIcon name="FolderOutlined" fallback={FolderOutlinedIcon} />,
        path: '/marketing/content',
      },
      {
        label: 'Acquisition',
        icon: <AppIcon name="TrendingUpOutlined" fallback={TrendingUpOutlinedIcon} />,
        path: '/marketing/acquisition',
      },
      {
        label: 'Conversion',
        icon: <AppIcon name="AutoGraphOutlined" fallback={AutoGraphOutlinedIcon} />,
        path: '/marketing/conversion',
      },
      {
        label: 'Retention',
        icon: <AppIcon name="PeopleOutlined" fallback={PeopleOutlinedIcon} />,
        path: '/marketing/retention',
      },
      {
        label: 'Team & Ops',
        icon: <AppIcon name="AssignmentOutlined" fallback={AssignmentOutlinedIcon} />,
        path: '/marketing/team',
      },
    ],
  },
];

const legacyNavItem = (path) =>
  LEGACY_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.path === path);

export const NAV_GROUPS = [
  {
    label: 'CONTROL POINT',
    items: [
      legacyNavItem('/home'),
      legacyNavItem('/assistant'),
      {
        ...legacyNavItem('/job-pool'),
        label: 'Goals',
        path: '/assistant?section=goals',
      },
      legacyNavItem('/organizations'),
      legacyNavItem('/agent-hub'),
    ],
  },
  {
    label: 'CAPABILITIES',
    items: [
      legacyNavItem('/tools'),
      legacyNavItem('/marketplace'),
      legacyNavItem('/knowledge-base'),
    ],
  },
  {
    label: 'RESULTS',
    items: [legacyNavItem('/reports')],
  },
];

// Flat list for filtering (partner mode, etc.)
const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export const CONSUMER_NAV_ITEMS = [
  {
    label: 'Home',
    icon: <AppIcon name="DashboardOutlined" fallback={DashboardOutlinedIcon} />,
    path: '/home',
  },
  {
    label: 'Goals',
    icon: <AppIcon name="WorkOutline" fallback={WorkOutlineIcon} />,
    path: '/assistant?section=goals',
  },
  {
    label: 'Agents',
    icon: <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />,
    path: '/agent-hub',
  },
  {
    label: 'Assistant',
    icon: <AppIcon name="AutoAwesomeOutlined" fallback={AutoAwesomeOutlinedIcon} />,
    path: '/assistant',
  },
  {
    label: 'Organizations',
    icon: <AppIcon name="CorporateFareOutlined" fallback={CorporateFareOutlinedIcon} />,
    path: '/organizations',
  },
  {
    label: PERSONAL_CATALOG_LABEL,
    icon: <AppIcon name="StorefrontOutlined" fallback={StorefrontOutlinedIcon} />,
    path: '/marketplace',
  },
  {
    label: 'Results',
    icon: <AppIcon name="AssessmentOutlined" fallback={AssessmentOutlinedIcon} />,
    path: '/reports',
  },
];

const PARTNER_ALLOWED_PATHS = ['/dashboard', '/partners', '/reports'];

export const ALL_BOTTOM_NAV_ITEMS = [
  {
    label: 'Documentation',
    icon: <AppIcon name="MenuBookOutlined" fallback={MenuBookOutlinedIcon} />,
    path: '/docs',
  },
  {
    label: 'Notifications',
    icon: <AppIcon name="AutoGraphOutlined" fallback={AutoGraphOutlinedIcon} />,
    path: '/notification-center',
  },
  {
    label: 'Activity Log',
    icon: <AppIcon name="History" fallback={HistoryIcon} />,
    path: '/audit-log',
  },
];

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
  desktopCollapsed = false,
  onDesktopCollapseToggle,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const hoverGlowSx = useMemo(
    () => ({
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      '&:hover': { boxShadow: createHoverGlowShadow(theme) },
    }),
    [theme]
  );
  // Standout treatment for Assistant: no button chrome — the emerald icon +
  // label gently pulse with a glow breath. See buildAssistantPulseSx.
  const assistantGlowSx = useMemo(() => buildAssistantPulseSx(theme), [theme]);
  const {
    motivationEnabled,
    motivationLanguage,
    logoDefaultPage,
    brandName,
    brandSubtitle,
    brandLogo,
  } = useThemeMode();
  const partnerAccess = usePartnerAccessOptional();
  const isPartnerRole = partnerAccess?.isPartnerRole ?? false;
  const roleId = partnerAccess?.roleId ?? '';
  const roleLoaded = partnerAccess?.loaded ?? true;
  const isAdminOrSuperAdmin = roleId === 'role-super-admin' || roleId === 'role-manager';

  // Simple/Advanced mode toggle — persisted in localStorage, default true for new users
  const { simpleMode } = useSimpleMode();
  const { enabledFeatures } = useEnabledFeatures();
  const { isModuleActive } = useActiveBusinessModules();
  // User-hidden sidebar pages (Settings > Pages). Home is never hideable.
  const { hiddenPages } = useHiddenPages();
  const hiddenSet = useMemo(() => new Set(hiddenPages.filter((p) => p !== '/home')), [hiddenPages]);
  const replicatorCtx = useReplicatorsOptional();
  const replicators = useMemo(() => replicatorCtx?.replicators || [], [replicatorCtx?.replicators]);
  const [replicatorExpand, setReplicatorExpand] = useState(() => readExpandOverrides());

  const toggleReplicatorGroup = useCallback((groupKey) => {
    setReplicatorExpand((prev) => {
      const next = { ...prev, [groupKey]: !(prev[groupKey] ?? false) };
      writeExpandOverrides(next);
      return next;
    });
  }, []);

  const buildReplicatorGroups = useCallback(() => {
    if (!replicators.length) return [];
    return replicators
      .map((r, idx) => {
        const groupKey = `replicator:${r.id}`;
        const defaultExpanded = idx < 3;
        const expanded = replicatorExpand[groupKey] ?? defaultExpanded;
        return {
          label: (r.slug || r.display_name || 'replicator').toUpperCase(),
          groupKey,
          collapsible: true,
          expanded,
          items: (r.pages || []).map((p) => ({
            label: p.title,
            icon: (
              <AppIcon
                name="IntegrationInstructionsOutlined"
                fallback={IntegrationInstructionsOutlinedIcon}
              />
            ),
            path: `/replicators/${r.slug}/${p.slug}`,
          })),
        };
      })
      .filter((g) => g.items.length > 0);
  }, [replicators, replicatorExpand]);

  // App-owned role templates are deferred until the GCP API serves them.
  const effectiveSimpleMode = simpleMode;

  // Build nav items from marketplace-enabled features for simple mode
  const buildEnabledNavItems = (section) =>
    MARKETPLACE_FEATURES.filter(
      (f) =>
        enabledFeatures.includes(f.id) &&
        f.navSection === section &&
        LEAN_FEATURE_PATHS.has(f.path)
    ).map((f) => {
      const IconComp = FEATURE_ICON_MAP[f.iconName];
      return {
        label: f.navLabel,
        icon: IconComp ? <AppIcon fallback={IconComp} /> : null,
        path: f.path,
      };
    });

  // Nav items: partner role overrides everything, then simple mode, then full admin (grouped)
  const useGroupedNav = !isPartnerRole && !effectiveSimpleMode;
  const getNavItems = () => {
    if (isPartnerRole) return ALL_NAV_ITEMS.filter((i) => PARTNER_ALLOWED_PATHS.includes(i.path));
    if (effectiveSimpleMode) {
      return [...CONSUMER_NAV_ITEMS, ...buildEnabledNavItems('main')];
    }
    const businessPaths = new Set(BUSINESS_MODULES.flatMap((m) => m.navItems.map((n) => n.path)));
    const activePaths = new Set(
      BUSINESS_MODULES.filter((m) => isModuleActive(m.id)).flatMap((m) =>
        m.navItems.map((n) => n.path)
      )
    );
    return ALL_NAV_ITEMS.filter((i) => {
      if (businessPaths.has(i.path) && !activePaths.has(i.path)) return false;
      return !i.adminOnly || isAdminOrSuperAdmin || !roleLoaded;
    });
  };
  const getNavGroups = () => {
    const businessGroupLabels = new Set(BUSINESS_MODULES.map((m) => m.navGroupLabel));
    const activeGroupLabels = new Set(
      BUSINESS_MODULES.filter((m) => isModuleActive(m.id)).map((m) => m.navGroupLabel)
    );
    const staticGroups = NAV_GROUPS.filter((g) => {
      if (businessGroupLabels.has(g.label)) return activeGroupLabels.has(g.label);
      return true;
    })
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.adminOnly || isAdminOrSuperAdmin || !roleLoaded),
      }))
      .filter((g) => g.items.length > 0);
    return [
      ...staticGroups,
      ...(INCLUDE_DEFERRED_NAV ? buildReplicatorGroups() : []),
    ];
  };
  const getBottomNavItems = () => {
    if (isPartnerRole) return [];
    if (effectiveSimpleMode) return buildEnabledNavItems('bottom');
    return ALL_BOTTOM_NAV_ITEMS;
  };
  const navItems = getNavItems().filter((i) => !hiddenSet.has(i.path));
  const navGroups = getNavGroups()
    .map((g) => ({ ...g, items: g.items.filter((i) => !hiddenSet.has(i.path)) }))
    .filter((g) => g.items.length > 0);
  const bottomNavItems = getBottomNavItems().filter((i) => !hiddenSet.has(i.path));

  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const isDark = theme.palette.mode === 'dark';
  const primaryMain = theme.palette.primary.main;
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [infoOpen, setInfoOpen] = useState(null); // path of the nav item with info expanded

  const handleNav = useCallback(
    (path) => {
      navigate(path);
      if (!isDesktop && onMobileClose) onMobileClose();
    },
    [navigate, isDesktop, onMobileClose]
  );

  const isActive = (path) => {
    const [pathname, query = ''] = path.split('?');
    if (!location.pathname.startsWith(pathname)) return false;

    const targetSection = new URLSearchParams(query).get('section');
    const currentParams = new URLSearchParams(location.search);
    if (targetSection === 'goals') {
      return currentParams.get('section') === 'goals' || currentParams.has('run');
    }
    if (pathname === '/assistant') {
      return currentParams.get('section') !== 'goals' && !currentParams.has('run');
    }
    return true;
  };

  const handleLogoClick = useCallback(() => {
    if (!motivationEnabled) {
      // Motivation off — navigate to the selected default page
      navigate(logoDefaultPage || '/home');
      if (!isDesktop && onMobileClose) onMobileClose();
      return;
    }

    // Use theme colors if valid hex; otherwise fallback to party colors (canvas-confetti may fail on CSS vars)
    const raw = [
      theme.palette.primary?.main,
      theme.palette.primary?.light,
      theme.palette.primary?.dark,
    ].filter(Boolean);
    const hex = /^#[0-9A-Fa-f]{3,8}$/;
    const colors = raw.filter((c) => typeof c === 'string' && hex.test(c));
    const opts = {
      particleCount: 80,
      spread: 120,
      startVelocity: 40,
      colors: colors.length ? colors : ['#1B2A4A', '#2E4068', '#5B8DEF', '#7BA8F5'],
      disableForReducedMotion: false,
      ticks: 180,
    };

    const fire = (o) => fireConfetti(o);

    // Burst from edges and corners — stays behind the popup
    fire({ ...opts, origin: { x: 0.05, y: 0.6 } });
    fire({ ...opts, origin: { x: 0.95, y: 0.6 } });
    fire({ ...opts, origin: { x: 0.2, y: 0.8 } });
    fire({ ...opts, origin: { x: 0.8, y: 0.8 } });

    setTimeout(() => {
      fire({ ...opts, particleCount: 60, origin: { x: 0.1, y: 0.4 } });
      fire({ ...opts, particleCount: 60, origin: { x: 0.9, y: 0.4 } });
      fire({ ...opts, particleCount: 50, spread: 160, origin: { x: 0.5, y: 0.9 } });
    }, 100);

    const phrase = MOTIVATION_PHRASES[Math.floor(Math.random() * MOTIVATION_PHRASES.length)];
    setPopupMessage(phrase[motivationLanguage] || phrase.en);
    setPopupOpen(true);
    setTimeout(() => setPopupOpen(false), 3000);
  }, [
    theme.palette.primary,
    motivationEnabled,
    motivationLanguage,
    logoDefaultPage,
    navigate,
    isDesktop,
    onMobileClose,
  ]);

  const drawerWidth = isDesktop && desktopCollapsed ? 0 : DRAWER_WIDTH + SIDEBAR_INSET;

  // Logic for Drawer Styles:
  // V2 (Enterprise): Clean standard sidebar (background.paper) or Dark Slate if preferred. Let's use clean default.
  // V1 (Legacy): Green sidebar for Light, Dark Static for Dark.

  const baseShadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25)'
    : '0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)';
  const hoverGlowShadow = createHoverGlowShadow(theme);

  const floatingPaperBase = {
    top: HEADER_HEIGHT + SIDEBAR_INSET,
    left: SIDEBAR_INSET,
    bottom: SIDEBAR_INSET,
    height: `calc(100vh - ${HEADER_HEIGHT}px - ${SIDEBAR_INSET * 2}px)`,
    width: desktopCollapsed ? 0 : DRAWER_WIDTH,
    borderRadius: 3,
    boxShadow: baseShadow,
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid',
    borderColor: (t) => alpha(t.palette.divider, 0.4),
    overflowX: 'hidden',
    overflowY: 'auto',
    '&:hover': {
      boxShadow: `${baseShadow}, ${hoverGlowShadow}`,
    },
    transition: (t) =>
      t.transitions.create(['width', 'visibility', 'box-shadow'], {
        duration: t.transitions.duration.standard,
        easing: t.transitions.easing.easeInOut,
      }),
  };

  const drawerPaperSx = {
    ...floatingPaperBase,
    bgcolor: (t) => alpha(t.palette.background.paper, isDark ? 0.88 : 0.94),
    visibility: desktopCollapsed ? 'hidden' : 'visible',
  };

  const collapseButtonSx = {
    color: 'text.secondary',
    '&:hover': {
      bgcolor: 'action.hover',
      color: 'primary.main',
    },
  };

  const logoContainerSx = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    bgcolor: alpha(primaryMain, 0.1),
    border: `1px solid ${alpha(primaryMain, 0.35)}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.palette.primary.dark,
    cursor: 'pointer',
    p: 0,
    outline: 'none',
    flexShrink: 0,
    transition: 'transform 0.2s, box-shadow 0.2s',
    '&:hover': {
      transform: 'scale(1.05)',
      boxShadow: `0 0 0 2px ${alpha(primaryMain, 0.4)}`,
    },
  };

  const logoTextSx = {
    color: 'text.primary',
    fontWeight: 700,
    fontSize: '0.9rem',
    lineHeight: 1.2,
  };

  const logoSubtextSx = {
    color: 'text.secondary',
    fontSize: '0.65rem',
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Logo + collapse toggle */}
      <Box sx={{ px: 2, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box component="button" type="button" onClick={handleLogoClick} sx={logoContainerSx}>
          {brandLogo ? (
            <Box
              component="img"
              src={brandLogo}
              alt=""
              sx={{
                width: 24,
                height: 24,
                objectFit: 'contain',
                borderRadius: 1,
                display: 'block',
              }}
            />
          ) : (
            <Logo size={24} animate />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={logoTextSx}>
            {brandName || 'Orchestrator'}
          </Typography>
          <Typography variant="caption" sx={logoSubtextSx}>
            {brandSubtitle ||
              (effectiveSimpleMode && !isPartnerRole ? 'Request Hub' : 'Admin Dashboard')}
          </Typography>
        </Box>
        {isDesktop && onDesktopCollapseToggle && (
          <Tooltip title="Hide menu" placement="bottom" arrow>
            <IconButton
              onClick={onDesktopCollapseToggle}
              aria-label="Hide sidebar"
              size="small"
              sx={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: 1.5,
                ...collapseButtonSx,
              }}
            >
              <AppIcon name="ChevronLeft" fallback={ChevronLeftIcon} sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Divider sx={{ borderColor: 'divider', mx: 2 }} />

      {/* Navigation */}
      <List sx={{ px: 1.5, py: 1.5, flex: 1, overflow: 'auto' }}>
        {useGroupedNav
          ? navGroups.map((group, gi) => (
              <Box key={group.groupKey || group.label}>
                {group.collapsible ? (
                  <Box
                    component="button"
                    type="button"
                    onClick={() => toggleReplicatorGroup(group.groupKey)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      width: '100%',
                      border: 'none',
                      bgcolor: 'transparent',
                      cursor: 'pointer',
                      px: 2.5,
                      pt: gi === 0 ? 0.5 : 2,
                      pb: 0.5,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'text.disabled',
                      textAlign: 'left',
                      userSelect: 'none',
                      '&:hover': { color: 'text.secondary' },
                    }}
                    aria-expanded={group.expanded}
                  >
                    <span style={{ flex: 1 }}>{group.label}</span>
                    {group.expanded ? (
                      <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 14 }} />
                    ) : (
                      <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 14 }} />
                    )}
                  </Box>
                ) : (
                  <Typography
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'text.disabled',
                      px: 2.5,
                      pt: gi === 0 ? 0.5 : 2,
                      pb: 0.5,
                      userSelect: 'none',
                    }}
                  >
                    {group.label}
                  </Typography>
                )}
                {group.collapsible && !group.expanded
                  ? null
                  : group.items.map((item) => {
                      const active = isActive(item.path);
                      const info = PAGE_INFO[item.path];
                      return (
                        <Box key={item.path}>
                          <ListItem disablePadding sx={{ mb: 0.25 }}>
                            <ListItemButton
                              selected={active}
                              onClick={() => handleNav(item.path)}
                              sx={{
                                borderRadius: 2,
                                py: 1.2,
                                px: 2,
                                '&:hover .nav-info-btn': { opacity: 1 },
                                ...hoverGlowSx,
                                ...(item.glow ? assistantGlowSx : {}),
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      minWidth: 0,
                                    }}
                                  >
                                    <Typography
                                      component="span"
                                      sx={{ fontSize: '0.85rem', fontWeight: active ? 600 : 500 }}
                                    >
                                      {item.label}
                                    </Typography>
                                    {item.beta && (
                                      <Chip
                                        size="small"
                                        label="BETA"
                                        color="warning"
                                        variant="outlined"
                                        sx={{
                                          height: 18,
                                          fontSize: '0.65rem',
                                          fontWeight: 800,
                                          letterSpacing: '0.04em',
                                          '& .MuiChip-label': { px: 0.6 },
                                        }}
                                      />
                                    )}
                                  </Box>
                                }
                              />
                              {info && (
                                <IconButton
                                  size="small"
                                  className="nav-info-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInfoOpen(infoOpen === item.path ? null : item.path);
                                  }}
                                  sx={{
                                    p: 0.25,
                                    opacity: infoOpen === item.path ? 1 : 0,
                                    transition: 'opacity 0.2s',
                                    color: 'text.disabled',
                                    '&:hover': { color: 'info.main' },
                                  }}
                                >
                                  <AppIcon
                                    name="InfoOutlined"
                                    fallback={InfoOutlinedIcon}
                                    sx={{ fontSize: 14 }}
                                  />
                                </IconButton>
                              )}
                            </ListItemButton>
                          </ListItem>
                          {info && (
                            <Collapse in={infoOpen === item.path} unmountOnExit>
                              <Box
                                sx={{
                                  mx: 2,
                                  mb: 1,
                                  p: 1.25,
                                  borderRadius: 1.5,
                                  bgcolor: alpha(theme.palette.info.main, 0.04),
                                  border: '1px solid',
                                  borderColor: alpha(theme.palette.info.main, 0.1),
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: '0.68rem',
                                    color: 'text.secondary',
                                    lineHeight: 1.4,
                                    display: 'block',
                                    mb: 0.75,
                                  }}
                                >
                                  {info.description}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap', mb: 0.75 }}>
                                  {info.features.map((f) => (
                                    <Chip
                                      key={f}
                                      label={f}
                                      size="small"
                                      variant="outlined"
                                      sx={{
                                        height: 16,
                                        fontSize: '0.5rem',
                                        fontWeight: 600,
                                        borderRadius: 0.75,
                                      }}
                                    />
                                  ))}
                                </Box>
                                {info.schemes && (
                                  <Typography
                                    variant="caption"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNav(info.schemes);
                                      setInfoOpen(null);
                                    }}
                                    sx={{
                                      fontSize: '0.6rem',
                                      color: 'info.main',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 0.3,
                                      '&:hover': { textDecoration: 'underline' },
                                    }}
                                  >
                                    View Schemes{' '}
                                    <AppIcon
                                      name="OpenInNew"
                                      fallback={OpenInNewIcon}
                                      sx={{ fontSize: 10 }}
                                    />
                                  </Typography>
                                )}
                              </Box>
                            </Collapse>
                          )}
                        </Box>
                      );
                    })}
              </Box>
            ))
          : navItems.map((item) => {
              const active = isActive(item.path);
              const info = PAGE_INFO[item.path];
              return (
                <Box key={item.path}>
                  <ListItem disablePadding sx={{ mb: 0.25 }}>
                    <ListItemButton
                      selected={active}
                      onClick={() => handleNav(item.path)}
                      sx={{
                        borderRadius: 2,
                        py: 1.2,
                        px: 2,
                        '&:hover .nav-info-btn': { opacity: 1 },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Typography
                              component="span"
                              sx={{ fontSize: '0.85rem', fontWeight: active ? 600 : 500 }}
                            >
                              {item.label}
                            </Typography>
                            {item.beta && (
                              <Chip
                                size="small"
                                label="BETA"
                                color="warning"
                                variant="outlined"
                                sx={{
                                  height: 18,
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  letterSpacing: '0.04em',
                                  '& .MuiChip-label': { px: 0.6 },
                                }}
                              />
                            )}
                          </Box>
                        }
                      />
                      {info && (
                        <IconButton
                          size="small"
                          className="nav-info-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInfoOpen(infoOpen === item.path ? null : item.path);
                          }}
                          sx={{
                            p: 0.25,
                            opacity: infoOpen === item.path ? 1 : 0,
                            transition: 'opacity 0.2s',
                            color: 'text.disabled',
                            '&:hover': { color: 'info.main' },
                          }}
                        >
                          <AppIcon
                            name="InfoOutlined"
                            fallback={InfoOutlinedIcon}
                            sx={{ fontSize: 14 }}
                          />
                        </IconButton>
                      )}
                    </ListItemButton>
                  </ListItem>
                  {info && (
                    <Collapse in={infoOpen === item.path} unmountOnExit>
                      <Box
                        sx={{
                          mx: 2,
                          mb: 1,
                          p: 1.25,
                          borderRadius: 1.5,
                          bgcolor: alpha(theme.palette.info.main, 0.04),
                          border: '1px solid',
                          borderColor: alpha(theme.palette.info.main, 0.1),
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.68rem',
                            color: 'text.secondary',
                            lineHeight: 1.4,
                            display: 'block',
                            mb: 0.75,
                          }}
                        >
                          {info.description}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap', mb: 0.75 }}>
                          {info.features.map((f) => (
                            <Chip
                              key={f}
                              label={f}
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 16,
                                fontSize: '0.5rem',
                                fontWeight: 600,
                                borderRadius: 0.75,
                              }}
                            />
                          ))}
                        </Box>
                        {info.schemes && (
                          <Typography
                            variant="caption"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNav(info.schemes);
                              setInfoOpen(null);
                            }}
                            sx={{
                              fontSize: '0.6rem',
                              color: 'info.main',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.3,
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            View Schemes{' '}
                            <AppIcon
                              name="OpenInNew"
                              fallback={OpenInNewIcon}
                              sx={{ fontSize: 10 }}
                            />
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  )}
                </Box>
              );
            })}
      </List>

      <Divider sx={{ borderColor: 'divider', mx: 2 }} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          px: 1.5,
          py: 1.5,
        }}
      >
        {bottomNavItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Tooltip key={item.path} title={item.label} placement="top" arrow>
              <IconButton
                onClick={() => handleNav(item.path)}
                aria-label={item.label}
                size="small"
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  color: active ? 'primary.main' : 'text.secondary',
                  bgcolor: active ? (t) => alpha(t.palette.primary.main, 0.12) : 'transparent',
                  border: '1px solid',
                  borderColor: active ? (t) => alpha(t.palette.primary.main, 0.3) : 'transparent',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                    color: 'primary.main',
                    borderColor: (t) => alpha(t.palette.primary.main, 0.2),
                    transform: 'translateY(-1px)',
                  },
                  '&:active': {
                    transform: 'scale(0.92)',
                  },
                  '& .MuiSvgIcon-root': {
                    fontSize: 20,
                  },
                  ...hoverGlowSx,
                }}
              >
                {item.icon}
              </IconButton>
            </Tooltip>
          );
        })}
      </Box>

      <Modal
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        sx={{ zIndex: 1000000 }}
        slotProps={{
          backdrop: {
            sx: {
              bgcolor: 'transparent',
            },
          },
        }}
      >
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 1000001,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2.5,
              px: 5,
              py: 4,
              borderRadius: 4,
              bgcolor: isDark
                ? alpha(theme.palette.background.paper, 0.92)
                : alpha(theme.palette.background.paper, 0.96),
              border: '1px solid',
              borderColor: alpha(primaryMain, 0.3),
              boxShadow: `0 24px 64px ${alpha(theme.palette.common.black, 0.35)}, 0 0 0 1px ${alpha(primaryMain, 0.15)}`,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              pointerEvents: 'auto',
              minWidth: 320,
              maxWidth: 420,
            }}
          >
            <Box
              sx={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(primaryMain, 0.12),
                border: '2px solid',
                borderColor: alpha(primaryMain, 0.35),
                color: primaryMain,
              }}
            >
              <Logo size={48} />
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: 'text.primary',
                textAlign: 'center',
                letterSpacing: '-0.02em',
                lineHeight: 1.3,
                fontSize: { xs: '1.15rem', sm: '1.35rem' },
              }}
            >
              {popupMessage}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: '0.75rem', fontStyle: 'italic', letterSpacing: '0.02em' }}
            >
              — By Orqaly
            </Typography>
          </Box>
        </Box>
      </Modal>
    </Box>
  );

  if (isDesktop) {
    return (
      <>
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            display: { xs: 'none', md: 'block' },
            transition: (t) =>
              t.transitions.create('width', {
                duration: t.transitions.duration.standard,
                easing: t.transitions.easing.easeInOut,
              }),
            '& .MuiDrawer-paper': drawerPaperSx,
          }}
        >
          {drawerContent}
        </Drawer>
      </>
    );
  }

  const mobilePaperSx = {
    ...drawerPaperSx,
    top: 0,
    left: 0,
    bottom: 0,
    height: '100%',
    width: DRAWER_WIDTH,
    maxWidth: '85vw',
    borderRadius: 0,
    // Override translucent desktop styles — mobile needs an opaque background
    // so the menu is visible above the backdrop overlay
    bgcolor: (t) => t.palette.background.paper,
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    visibility: 'visible',
  };

  return (
    <Drawer
      variant="temporary"
      open={mobileOpen}
      onClose={onMobileClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        display: { xs: 'block', md: 'none' },
        '& .MuiDrawer-paper': mobilePaperSx,
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
