// Maps MUI icon module names (e.g. "HomeRounded", "Add") to vendored
// Liquid Glass icon components from ./glass.
//
// Keep entries terse: { Foo: LgX } means <GlassIcon name="Foo" /> renders LgX.
// Unmapped names fall back to the MUI icon, still wrapped in the glass tile
// so the surface stays visually consistent across simple-mode pages.
//
// Only icons referenced here are bundled (the ./glass/index.js re-exports are
// individually imported, so Vite/Rollup tree-shakes the rest).

import {
  LgHome,
  LgDomain,
  LgComboChart,
  LgMenu,
  LgSearch,
  LgUser,
  LgGroups,
  LgConferenceCall,
  LgSettings,
  LgSliders,
  LgPlus,
  LgEdit,
  LgDelete,
  LgCancel,
  LgForward,
  LgAppointmentReminders,
  LgCheckmark,
  LgChecked,
  LgChecked2,
  LgInfo,
  LgDocument,
  LgOpenedFolder,
  LgFolderInvoices,
  LgClock,
  LgRestart,
  LgCalendar,
  LgGeminiAi,
  LgIdea,
  LgExit,
  LgKey,
  LgSun,
  LgSpeechBubble,
  LgToolbox,
  LgScroll,
  LgService,
  LgExternalLink,
  LgExpandArrow,
  LgBack,
  LgBriefcase,
  LgRefresh,
  LgEmail,
  LgLock,
  LgVisible,
  LgPhone,
  LgFile,
  LgPicture,
  LgStar,
  LgSave,
  LgDownload,
  LgShare,
  LgMarker,
  LgPuzzle,
  LgMaintenance,
  LgShutdown,
  LgUpload2,
  LgCancel2,
  LgBox,
  LgBookmarkRibbon,
  LgMailboxClosedFlagDown,
  LgSupport,
  LgBinoculars,
  LgShare2,
  LgNews,
  LgUncheckAll,
  LgContacts,
  LgSynchronize,
  LgYoutubePlay,
} from './glass';

export const GLASS_ICON_MAP = {
  // Navigation
  Home: LgHome,
  HomeRounded: LgHome,
  Menu: LgMenu,
  Search: LgSearch,
  SearchOutlined: LgSearch,
  ExpandLess: LgExpandArrow,
  ExpandMore: LgExpandArrow,
  KeyboardArrowDown: LgExpandArrow,
  ArrowBack: LgBack,
  ArrowBackRounded: LgBack,
  ChevronLeft: LgBack,
  OpenInNew: LgExternalLink,
  EastRounded: LgForward,
  ArrowForward: LgForward,
  ArrowForwardRounded: LgForward,
  CompareArrows: LgSynchronize,
  Sync: LgSynchronize,
  SyncOutlined: LgSynchronize,

  // People
  Person: LgUser,
  PersonOutline: LgUser,
  PersonOutlined: LgUser,
  Groups: LgGroups,
  GroupsOutlined: LgGroups,
  Diversity3: LgGroups,
  Diversity3Rounded: LgGroups,
  PeopleOutlined: LgGroups,

  // Settings & controls
  Settings: LgSettings,
  SettingsOutlined: LgSettings,
  Tune: LgSliders,
  TuneOutlined: LgSliders,
  TuneRounded: LgSliders,
  FilterList: LgSliders,
  FilterListOutlined: LgSliders,
  FilterAlt: LgSliders,
  FilterAltOutlined: LgSliders,
  VpnKey: LgKey,
  VpnKeyOutlined: LgKey,
  AdminPanelSettings: LgKey,
  AdminPanelSettingsOutlined: LgKey,
  Lock: LgLock,
  LockOutlined: LgLock,
  Security: LgLock,
  Visibility: LgVisible,
  VisibilityOutlined: LgVisible,
  VisibilityOff: LgVisible,
  VisibilityOffOutlined: LgVisible,

  // Visual actions
  Add: LgPlus,
  AddOutlined: LgPlus,
  AddRounded: LgPlus,
  Edit: LgEdit,
  EditOutlined: LgEdit,
  Delete: LgDelete,
  DeleteOutline: LgDelete,
  Close: LgCancel,
  Cancel: LgCancel,
  Send: LgForward,
  Refresh: LgRefresh,
  Save: LgSave,
  Download: LgDownload,
  Share: LgShare,

  // Status & feedback
  Notifications: LgAppointmentReminders,
  NotificationsOutlined: LgAppointmentReminders,
  Check: LgCheckmark,
  CheckCircleOutline: LgChecked,
  Info: LgInfo,
  InfoOutlined: LgInfo,
  HelpOutline: LgInfo,
  PriorityHigh: LgInfo,
  PriorityHighOutlined: LgInfo,

  // Files / docs
  Description: LgDocument,
  DescriptionOutlined: LgDocument,
  Assignment: LgDocument,
  AssignmentOutlined: LgDocument,
  SummarizeOutlined: LgComboChart,
  InventoryOutlined: LgBox,
  AssignmentLate: LgDocument,
  AssignmentLateOutlined: LgDocument,
  AttachFile: LgFile,
  Image: LgPicture,
  FolderOpen: LgOpenedFolder,
  FolderOutlined: LgFolderInvoices,
  ContentCopy: LgDocument,
  ContentCopyOutlined: LgDocument,

  // Dashboards / charts
  Dashboard: LgComboChart,
  DashboardOutlined: LgComboChart,
  DashboardCustomize: LgComboChart,
  DashboardCustomizeOutlined: LgComboChart,
  BarChart: LgComboChart,
  BarChartOutlined: LgComboChart,
  BarChartRounded: LgComboChart,
  Assessment: LgComboChart,
  AssessmentOutlined: LgComboChart,
  AutoGraph: LgComboChart,
  AutoGraphOutlined: LgComboChart,
  Insights: LgComboChart,
  InsightsOutlined: LgComboChart,

  // Business / org
  CorporateFare: LgDomain,
  CorporateFareOutlined: LgDomain,
  CorporateFareRounded: LgDomain,
  Work: LgBriefcase,
  WorkOutline: LgBriefcase,
  AccountBalanceWallet: LgBriefcase,
  AccountBalanceWalletOutlined: LgBriefcase,
  AccountBalanceWalletRounded: LgBriefcase,
  AttachMoney: LgBriefcase,
  AttachMoneyOutlined: LgBriefcase,
  BusinessCenter: LgBriefcase,
  BusinessCenterOutlined: LgBriefcase,
  RequestQuote: LgFolderInvoices,
  RequestQuoteOutlined: LgFolderInvoices,

  // Time
  History: LgClock,
  HistoryOutlined: LgClock,
  HourglassTop: LgClock,
  Restore: LgRestart,
  CalendarMonth: LgCalendar,
  CalendarMonthOutlined: LgCalendar,
  EventAvailableOutlined: LgCalendar,

  // Media controls
  PlayCircle: LgYoutubePlay,
  PlayCircleOutlined: LgYoutubePlay,
  PlayCircleFilled: LgYoutubePlay,
  PlayArrow: LgYoutubePlay,
  PauseCircle: LgShutdown,
  PauseCircleOutlined: LgShutdown,
  PauseCircleFilled: LgShutdown,
  Pause: LgShutdown,

  // Healing / support
  Healing: LgSupport,
  HealingOutlined: LgSupport,
  LocalHospital: LgSupport,

  // Magic / AI / spark
  AutoAwesome: LgGeminiAi,
  AutoAwesomeOutlined: LgGeminiAi,
  Psychology: LgIdea,
  PsychologyOutlined: LgIdea,
  TipsAndUpdates: LgIdea,
  TipsAndUpdatesOutlined: LgIdea,
  Bolt: LgIdea,
  BoltOutlined: LgIdea,
  Lightbulb: LgIdea,
  LightbulbOutlined: LgIdea,

  // Auth / session
  Logout: LgExit,
  LogoutOutlined: LgExit,

  // Theme
  LightMode: LgSun,
  LightModeOutlined: LgSun,
  DarkMode: LgShutdown,
  DarkModeOutlined: LgShutdown,

  // Communication
  Forum: LgSpeechBubble,
  ForumOutlined: LgSpeechBubble,
  ChatBubbleOutline: LgSpeechBubble,
  ChatBubbleOutlineOutlined: LgSpeechBubble,
  Email: LgEmail,
  EmailOutlined: LgEmail,
  Phone: LgPhone,
  Mic: LgSpeechBubble,
  MicOutlined: LgSpeechBubble,
  MicNone: LgSpeechBubble,
  MicNoneOutlined: LgSpeechBubble,
  RecordVoiceOver: LgSupport,
  RecordVoiceOverOutlined: LgSupport,
  ConnectWithoutContact: LgConferenceCall,
  ConnectWithoutContactOutlined: LgConferenceCall,
  AllInbox: LgMailboxClosedFlagDown,
  AllInboxOutlined: LgMailboxClosedFlagDown,
  Inbox: LgMailboxClosedFlagDown,
  InboxOutlined: LgMailboxClosedFlagDown,

  // Tools / build
  Build: LgToolbox,
  BuildOutlined: LgToolbox,
  MenuBook: LgScroll,
  MenuBookOutlined: LgScroll,
  Code: LgMaintenance,
  CodeOutlined: LgMaintenance,

  // Hardware / devices
  DevicesOutlined: LgToolbox,

  // Bot / service
  SmartToy: LgService,
  SmartToyOutlined: LgService,
  Dns: LgGeminiAi,
  DnsOutlined: LgGeminiAi,

  // Location / targeting
  LocationOn: LgMarker,
  LocationOnOutlined: LgMarker,
  TrackChanges: LgMarker,
  TrackChangesOutlined: LgMarker,

  // Structure / widgets / hierarchy
  AccountTree: LgPuzzle,
  AccountTreeOutlined: LgPuzzle,
  Widgets: LgPuzzle,
  WidgetsOutlined: LgPuzzle,
  Hub: LgPuzzle,
  HubOutlined: LgPuzzle,
  ConferenceCallOutlined: LgConferenceCall,
  Extension: LgPuzzle,
  ExtensionOutlined: LgPuzzle,
  IntegrationInstructions: LgPuzzle,
  IntegrationInstructionsOutlined: LgPuzzle,
  Inventory2: LgToolbox,
  Inventory2Outlined: LgToolbox,

  // Motion / launch
  RocketLaunch: LgUpload2,
  RocketLaunchOutlined: LgUpload2,
  RocketLaunchRounded: LgUpload2,
  Speed: LgForward,
  Stop: LgCancel2,
  StopOutlined: LgCancel2,

  // Storage — folder-of-data reads as database storage.
  Storage: LgFolderInvoices,
  StorageOutlined: LgFolderInvoices,
  StorageRounded: LgFolderInvoices,

  // Marketplace / storefront — no native shop glyph in the glass pack;
  // a 3D parcel reads as "product / marketplace item".
  Storefront: LgBox,
  StorefrontOutlined: LgBox,
  StorefrontRounded: LgBox,

  // Flags — finish-line / deliverable.
  Flag: LgBookmarkRibbon,
  FlagOutlined: LgBookmarkRibbon,
  OutlinedFlag: LgBookmarkRibbon,
  Bookmark: LgBookmarkRibbon,
  BookmarkOutlined: LgBookmarkRibbon,

  // Industry icons (WhoItsFor) intentionally NOT mapped to glass substitutes:
  // the glass pack lacks hospital/restaurant/gavel/school glyphs, and forcing
  // a generic glass icon (e.g. "support" for hospital) would be less
  // informative than the MUI line icon inside the green tile. Keep falling
  // through to the MUI fallback so industries stay recognisable.

  // People-call
  ConferenceCall: LgConferenceCall,

  // Star / favorites
  Star: LgStar,
  StarBorder: LgStar,

  // Rate review
  RateReview: LgEdit,
  RateReviewOutlined: LgEdit,

  // Custom
  Binoculars: LgBinoculars,
  Briefcase: LgBriefcase,
  ComboChart: LgComboChart,
  Contacts: LgContacts,
  // Setup page
  SwapHorizOutlined: LgRefresh,
  SavingsOutlined: LgBriefcase,
  CloudOutlined: LgUpload2,
  RadioButtonUnchecked: LgUncheckAll,
  BusinessOutlined: LgDomain,
  Share2: LgShare2,
  News: LgNews,
  UncheckAll: LgUncheckAll,
};

export function lookupGlassIcon(name) {
  return GLASS_ICON_MAP[name] || null;
}
