import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import BrandingWatermarkOutlinedIcon from '@mui/icons-material/BrandingWatermarkOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PasswordOutlinedIcon from '@mui/icons-material/PasswordOutlined';
import PinOutlinedIcon from '@mui/icons-material/PinOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import LanguageIcon from '@mui/icons-material/Language';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';

/**
 * The Settings page, declared the way the setup panels are declared in
 * `Assistant/setupSteps.js` and `NewGoal/goalSetupSections.js` - so all three
 * surfaces are the same shape in the source as well as on screen.
 *
 * A tab is what the rail shows and what the URL names; a block is one
 * `SetupSection` inside it. `done` is a predicate over a plain context object
 * rather than something the page computes inline, which is what lets "is this
 * configured?" be answered in a test without rendering Settings. Predicates
 * must tolerate a half-loaded context: the page paints before its profile,
 * prefs and roster have arrived.
 *
 * `keywords` is what the rail's search matches on beyond the title, so that
 * "telegram" finds Profile > Account even though neither word is in the title.
 */

const has = (value) => typeof value === 'string' && value.trim().length > 0;

export const SETTINGS_TABS = [
  {
    id: 'profile',
    label: 'Profile',
    icon: PersonOutlinedIcon,
    iconName: 'PersonOutlined',
    blocks: [
      {
        key: 'account',
        title: 'Account',
        icon: BadgeOutlinedIcon,
        desc: 'The name the platform calls you, and where it can reach you.',
        keywords: ['display name', 'email', 'telegram', 'contact'],
        done: (ctx) => has(ctx?.profile?.displayName),
      },
      {
        key: 'notes',
        title: 'Notes',
        icon: NoteAddOutlinedIcon,
        desc: 'Anything you want kept beside your account.',
        keywords: ['note', 'archive'],
        done: (ctx) => (ctx?.notes?.length || 0) > 0,
      },
      {
        key: 'todo',
        title: 'Todo list',
        icon: PlaylistAddCheckIcon,
        desc: 'Your own tasks - separate from the goals agents run.',
        keywords: ['todo', 'task', 'checklist'],
        done: (ctx) => (ctx?.todos?.length || 0) > 0,
      },
    ],
  },
  {
    id: 'branding',
    label: 'Branding',
    icon: BrandingWatermarkOutlinedIcon,
    iconName: 'ImageOutlined',
    blocks: [
      {
        key: 'identity',
        title: 'App identity',
        icon: BrandingWatermarkOutlinedIcon,
        desc: 'The name and subtitle at the top of the sidebar. Saved to this browser only.',
        keywords: ['app name', 'subtitle', 'sidebar', 'white label'],
        done: (ctx) => has(ctx?.branding?.appName) || has(ctx?.branding?.subtitle),
      },
      {
        key: 'logo',
        title: 'Logo',
        icon: ImageOutlinedIcon,
        desc: 'Replace the mark beside it with your own PNG, JPG, SVG or WebP.',
        keywords: ['logo', 'upload', 'image', 'icon'],
        done: (ctx) => has(ctx?.branding?.logo),
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: LockOutlinedIcon,
    iconName: 'LockOutlined',
    blocks: [
      {
        key: 'password',
        title: 'Password',
        icon: PasswordOutlinedIcon,
        desc: 'Change the password you sign in with.',
        keywords: ['password', 'change password'],
        done: () => true,
      },
      {
        key: 'pin',
        title: 'PIN',
        icon: PinOutlinedIcon,
        desc: 'A 4-8 digit code for quick unlock.',
        keywords: ['pin', 'unlock', 'code'],
        done: (ctx) => Boolean(ctx?.security?.hasPin),
      },
      {
        key: 'signin',
        title: 'Sign-in methods',
        icon: KeyOutlinedIcon,
        desc: 'Google Authenticator, YubiKey and the other ways in.',
        keywords: ['2fa', 'totp', 'yubikey', 'authenticator', 'two factor'],
        done: (ctx) => Boolean(ctx?.security?.has2FA),
      },
    ],
  },
  {
    id: 'databaseOverview',
    label: 'Data Base',
    icon: StorageOutlinedIcon,
    iconName: 'StorageOutlined',
    blocks: [
      {
        key: 'storage',
        title: 'Storage',
        icon: StorageOutlinedIcon,
        desc: 'What the workspace is holding, and where it lives.',
        keywords: ['database', 'storage', 'supabase', 'files'],
        done: () => true,
      },
    ],
  },
  {
    id: 'preferences',
    label: 'Preferences',
    icon: PaletteOutlinedIcon,
    iconName: 'Settings',
    blocks: [
      {
        key: 'interface',
        title: 'Interface',
        icon: TuneOutlinedIcon,
        desc: 'Simple or Advanced, light or dark.',
        keywords: ['simple mode', 'advanced', 'theme', 'dark', 'light', 'appearance'],
        done: () => true,
      },
      {
        key: 'icons',
        title: 'Icon set',
        icon: AutoAwesomeOutlinedIcon,
        desc: 'Which glyph style the whole app draws with.',
        keywords: ['icons', 'gem', 'glass', 'gallery'],
        done: (ctx) => has(ctx?.prefs?.iconSet),
      },
      {
        key: 'accent',
        title: 'Accent colour',
        icon: PaletteOutlinedIcon,
        desc: 'The primary colour every surface in the app tints with.',
        keywords: ['color', 'colour', 'primary', 'accent', 'gem', 'theme colour'],
        done: (ctx) => has(ctx?.prefs?.primaryColor),
      },
      {
        key: 'behaviour',
        title: 'Logo & where you land',
        icon: RocketLaunchOutlinedIcon,
        desc: 'What the logo does, and whether you land on motivation or a page you pick.',
        keywords: ['motivation', 'default page', 'start page', 'home', 'logo click'],
        done: (ctx) => Boolean(ctx?.prefs?.motivation) || has(ctx?.prefs?.defaultPage),
      },
      {
        key: 'language',
        title: 'Language',
        icon: LanguageIcon,
        desc: 'The language the interface speaks.',
        keywords: ['language', 'locale', 'translation'],
        done: (ctx) => has(ctx?.prefs?.language),
      },
    ],
  },
  {
    id: 'pages',
    label: 'Pages',
    icon: ViewSidebarOutlinedIcon,
    iconName: 'ViewSidebarOutlined',
    blocks: [
      {
        key: 'sidebar',
        title: 'Sidebar pages',
        icon: ViewSidebarOutlinedIcon,
        desc: 'Which pages appear in your sidebar.',
        keywords: ['sidebar', 'navigation', 'hide page', 'menu'],
        done: () => true,
      },
    ],
  },
  {
    id: 'axwise',
    label: 'AxWise',
    icon: VisibilityOutlinedIcon,
    iconName: 'VisibilityOutlined',
    blocks: [
      {
        key: 'overlay',
        title: 'Cognition overlay',
        icon: VisibilityOutlinedIcon,
        desc: 'The status bar, its analytics and what it writes to the Audit Log.',
        keywords: ['axwise', 'overlay', 'cognition', 'audit'],
        done: (ctx) => Boolean(ctx?.axwise?.enabled),
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: NotificationsOutlinedIcon,
    iconName: 'NotificationsOutlined',
    blocks: [
      {
        key: 'inapp',
        title: 'In-app',
        icon: NotificationsOutlinedIcon,
        desc: 'What raises a notification while you are working.',
        keywords: ['in-app', 'toast', 'alerts'],
        done: () => true,
      },
      {
        key: 'email',
        title: 'Email',
        icon: EmailOutlinedIcon,
        desc: 'Which of those actions also reach your inbox.',
        keywords: ['email', 'inbox', 'digest', 'resend'],
        done: (ctx) => Object.keys(ctx?.notifications?.emailPrefs || {}).length > 0,
      },
    ],
  },
  {
    id: 'publicpage',
    label: 'Card',
    icon: PublicOutlinedIcon,
    iconName: 'Contacts',
    blocks: [
      {
        key: 'card',
        title: 'Digital business card',
        icon: PublicOutlinedIcon,
        desc: 'A public page people can reach you through.',
        keywords: ['business card', 'public page', 'share', 'contact'],
        done: (ctx) => Boolean(ctx?.publicPage?.published),
      },
    ],
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    icon: HelpOutlineIcon,
    iconName: 'HelpOutline',
    blocks: [
      {
        key: 'guide',
        title: 'Onboarding guide',
        icon: HelpOutlineIcon,
        desc: 'Re-watch the platform introduction whenever you like.',
        keywords: ['onboarding', 'tour', 'guide', 'intro'],
        done: () => true,
      },
    ],
  },
  {
    id: 'meetings',
    label: 'Calendar',
    icon: EventAvailableOutlinedIcon,
    iconName: 'EventAvailableOutlined',
    blocks: [
      {
        key: 'calendar',
        title: 'Calendar',
        icon: CalendarMonthOutlinedIcon,
        desc: 'Plan, record and manage meetings, and how people book time with you.',
        keywords: ['calendar', 'meetings', 'schedule', 'booking', 'availability', 'scheduler'],
        done: () => true,
      },
    ],
  },
  {
    id: 'actionlog',
    label: 'Log',
    icon: HistoryOutlinedIcon,
    iconName: 'HistoryOutlined',
    partnerHidden: true,
    blocks: [
      {
        key: 'log',
        title: 'Action log',
        icon: HistoryOutlinedIcon,
        desc: 'Recent settings changes and security events.',
        keywords: ['audit', 'log', 'history', 'events'],
        done: () => true,
      },
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: CreditCardOutlinedIcon,
    iconName: 'AccountBalanceWalletOutlined',
    blocks: [
      {
        key: 'methods',
        title: 'Payment methods',
        icon: CreditCardOutlinedIcon,
        desc: 'Cards the platform charges operational spend to.',
        keywords: ['billing', 'payment', 'card', 'stripe', 'invoice'],
        done: (ctx) => (ctx?.payments?.methods?.length || 0) > 0,
      },
    ],
  },
  {
    id: 'devmode',
    label: 'Developer',
    icon: CodeOutlinedIcon,
    iconName: 'CodeOutlined',
    partnerHidden: true,
    blocks: [
      {
        key: 'devmode',
        title: 'Development mode',
        icon: CodeOutlinedIcon,
        desc: 'Developer tools and per-page task tracking.',
        keywords: ['developer', 'debug', 'dev mode', 'tasks'],
        done: (ctx) => Boolean(ctx?.dev?.enabled),
      },
    ],
  },
];

/**
 * The rail's view of the same list. Shape-identical to what
 * `useSettingsBlockLayout` (SettingsViewOptions.jsx) has always been handed, so
 * hiding, reordering and the stored layout keep working untouched.
 */
export const SETTINGS_SECTION_DEFS = SETTINGS_TABS.map(({ blocks: _blocks, ...tab }) => tab);

/** The tab a block belongs to, by block key. */
export function findTabForBlock(blockKey) {
  return SETTINGS_TABS.find((tab) => tab.blocks.some((block) => block.key === blockKey)) || null;
}

/**
 * Blocks matching a free-text query, across every tab the caller can see.
 * Matches the block title, its description and its keywords, plus the tab's own
 * label - so "log" finds the Log tab and "telegram" finds Profile > Account.
 */
export function searchSettings(query, tabs = SETTINGS_TABS) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const tab of tabs) {
    for (const block of tab.blocks || []) {
      const haystack = [tab.label, block.title, block.desc, ...(block.keywords || [])]
        .join(' ')
        .toLowerCase();
      if (haystack.includes(q)) {
        hits.push({ tabId: tab.id, tabLabel: tab.label, blockKey: block.key, title: block.title });
      }
    }
  }
  return hits;
}

/** Where the last tab you were on is remembered, for a bare /settings. */
export const SETTINGS_LAST_TAB_KEY = 'orch_settings_last_tab';

export function readLastSettingsTab() {
  try {
    return window.localStorage.getItem(SETTINGS_LAST_TAB_KEY) || null;
  } catch {
    return null;
  }
}

export function persistLastSettingsTab(tabId) {
  try {
    window.localStorage.setItem(SETTINGS_LAST_TAB_KEY, tabId);
  } catch {
    /* a browser that refuses storage still gets the tab it asked for */
  }
}

/**
 * Which tab to show: what the URL asked for, else the one you were last on,
 * else the first the rail is showing. Unknown ids fall through rather than
 * leaving the page blank - a stale link or a hidden section must not strand it.
 */
export function resolveActiveTab(requested, remembered, tabIds = []) {
  if (requested && tabIds.includes(requested)) return requested;
  if (remembered && tabIds.includes(remembered)) return remembered;
  return tabIds[0] || null;
}
