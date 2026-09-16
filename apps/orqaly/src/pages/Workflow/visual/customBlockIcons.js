// A workflow-focused icon library for Custom blocks.
// We keep it curated (not "every icon ever") so it stays fast and relevant.
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import AdsClickOutlinedIcon from '@mui/icons-material/AdsClickOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';

import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';

import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import PauseCircleOutlineOutlinedIcon from '@mui/icons-material/PauseCircleOutlineOutlined';

import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import LandscapeOutlinedIcon from '@mui/icons-material/LandscapeOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';

import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import FileCopyOutlinedIcon from '@mui/icons-material/FileCopyOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';

import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';

import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import IntegrationInstructionsOutlinedIcon from '@mui/icons-material/IntegrationInstructionsOutlined';
import WebhookOutlinedIcon from '@mui/icons-material/WebhookOutlined';
import HttpOutlinedIcon from '@mui/icons-material/HttpOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';

import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';

import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';

import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import CallSplitOutlinedIcon from '@mui/icons-material/CallSplitOutlined';
import MergeOutlinedIcon from '@mui/icons-material/MergeOutlined';
import AltRouteOutlinedIcon from '@mui/icons-material/AltRouteOutlined';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';

import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';

import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import GpsFixedOutlinedIcon from '@mui/icons-material/GpsFixedOutlined';

import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';

export const CUSTOM_BLOCK_ICON_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'trigger', label: 'Triggers' },
  { id: 'flow', label: 'Flow' },
  { id: 'comm', label: 'Messages' },
  { id: 'time', label: 'Time' },
  { id: 'data', label: 'Data' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'users', label: 'Users' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'misc', label: 'Misc' },
];

/**
 * Icon schema:
 * - id: stable persisted value stored in workflow.customBlocks[].iconId
 * - label: UI label
 * - category: for quick filtering
 * - keywords: search synonyms
 */
function icon(id, label, category, keywords, Icon) {
  return { id, label, category, keywords, Icon };
}

export const CUSTOM_BLOCK_ICON_LIBRARY = [
  // Triggers / start
  icon('play', 'Start', 'trigger', ['start', 'run', 'play', 'begin'], PlayArrowRoundedIcon),
  icon('flag', 'Flag', 'trigger', ['start', 'milestone', 'goal'], FlagOutlinedIcon),
  icon(
    'ads-click',
    'Click',
    'trigger',
    ['click', 'event', 'tap', 'conversion'],
    AdsClickOutlinedIcon
  ),
  icon('login', 'Login', 'trigger', ['login', 'auth', 'sign in', 'session'], LoginOutlinedIcon),
  icon('touch', 'Tap', 'trigger', ['tap', 'touch', 'interaction'], TouchAppOutlinedIcon),

  // Flow / logic
  icon(
    'flow',
    'Workflow',
    'flow',
    ['workflow', 'tree', 'pipeline', 'orchestrator'],
    AccountTreeOutlinedIcon
  ),
  icon('route', 'Route', 'flow', ['route', 'path', 'branch'], AltRouteOutlinedIcon),
  icon('split', 'Split', 'flow', ['split', 'branch', 'if', 'condition'], CallSplitOutlinedIcon),
  icon('merge', 'Merge', 'flow', ['merge', 'join', 'combine'], MergeOutlinedIcon),
  icon('compare', 'Switch', 'flow', ['switch', 'compare', 'match'], CompareArrowsOutlinedIcon),
  icon('filter', 'Filter', 'flow', ['filter', 'segment', 'criteria'], FilterAltOutlinedIcon),
  icon('rule', 'Rule', 'flow', ['rule', 'policy', 'condition', 'logic'], RuleOutlinedIcon),
  icon(
    'functions',
    'Function',
    'flow',
    ['function', 'math', 'compute', 'script'],
    FunctionsOutlinedIcon
  ),
  icon('bolt', 'Action', 'flow', ['action', 'execute', 'trigger'], BoltOutlinedIcon),

  // Messages / communication
  icon('sms', 'SMS', 'comm', ['sms', 'text', 'message', 'twilio'], SmsOutlinedIcon),
  icon('email', 'Email', 'comm', ['email', 'mail', 'sendgrid'], EmailOutlinedIcon),
  icon(
    'mark-email',
    'Email (read)',
    'comm',
    ['email', 'delivered', 'read', 'inbox'],
    MarkEmailReadOutlinedIcon
  ),
  icon('send', 'Send', 'comm', ['send', 'push', 'dispatch'], SendOutlinedIcon),
  icon('call', 'Call', 'comm', ['call', 'phone', 'dial'], CallOutlinedIcon),
  icon('chat', 'Chat', 'comm', ['chat', 'support', 'message'], ChatOutlinedIcon),
  icon(
    'notify',
    'Notification',
    'comm',
    ['notification', 'alert', 'push'],
    NotificationsOutlinedIcon
  ),

  // Time / delays
  icon('schedule', 'Schedule', 'time', ['schedule', 'calendar', 'datetime'], ScheduleOutlinedIcon),
  icon('timer', 'Timer', 'time', ['timer', 'delay', 'wait'], TimerOutlinedIcon),
  icon('event', 'Event', 'time', ['event', 'calendar'], EventOutlinedIcon),
  icon('pause', 'Pause', 'time', ['pause', 'hold', 'stop'], PauseCircleOutlineOutlinedIcon),

  // Data / storage
  icon('storage', 'Storage', 'data', ['storage', 'db', 'database'], StorageOutlinedIcon),
  icon(
    'database',
    'Database',
    'data',
    ['database', 'sql', 'postgres', 'server', 'db'],
    DnsOutlinedIcon
  ),
  icon('data-object', 'JSON', 'data', ['json', 'payload', 'data'], DataObjectOutlinedIcon),
  icon('table', 'Table', 'data', ['table', 'rows', 'sheet'], TableRowsOutlinedIcon),
  icon('file', 'File', 'data', ['file', 'document', 'export'], FileCopyOutlinedIcon),
  icon('upload', 'Upload', 'data', ['upload', 'import'], CloudUploadOutlinedIcon),
  icon('download', 'Download', 'data', ['download', 'export'], CloudDownloadOutlinedIcon),
  icon('search', 'Search', 'data', ['search', 'lookup', 'find'], SearchOutlinedIcon),

  // Integrations / APIs
  icon('api', 'API', 'integrations', ['api', 'endpoint', 'integration'], ApiOutlinedIcon),
  icon(
    'integration',
    'Integration',
    'integrations',
    ['integration', 'connect', 'plugin'],
    IntegrationInstructionsOutlinedIcon
  ),
  icon(
    'webhook',
    'Webhook',
    'integrations',
    ['webhook', 'callback', 'postback'],
    WebhookOutlinedIcon
  ),
  icon('http', 'HTTP', 'integrations', ['http', 'request', 'url'], HttpOutlinedIcon),
  icon('link', 'Link', 'integrations', ['link', 'url', 'deeplink'], LinkOutlinedIcon),
  icon('public', 'Public', 'integrations', ['public', 'internet', 'global'], PublicOutlinedIcon),
  icon('language', 'Website', 'integrations', ['website', 'domain', 'web'], LanguageOutlinedIcon),
  icon('qr', 'QR Code', 'integrations', ['qr', 'code', 'scan'], QrCode2OutlinedIcon),
  icon('key', 'Key', 'integrations', ['key', 'token', 'secret'], KeyOutlinedIcon),
  icon('vpn-key', 'API Key', 'integrations', ['api key', 'token', 'auth'], VpnKeyOutlinedIcon),
  icon(
    'security',
    'Security',
    'integrations',
    ['security', 'shield', 'secure'],
    SecurityOutlinedIcon
  ),

  // Monitoring / quality
  icon(
    'report',
    'Report',
    'monitoring',
    ['report', 'summary', 'analytics'],
    AssessmentOutlinedIcon
  ),
  icon('stats', 'Stats', 'monitoring', ['stats', 'analytics', 'chart'], QueryStatsOutlinedIcon),
  icon(
    'insights',
    'Insights',
    'monitoring',
    ['insights', 'trends', 'analysis'],
    InsightsOutlinedIcon
  ),
  icon('bug', 'Bug', 'monitoring', ['bug', 'debug', 'issue'], BugReportOutlinedIcon),
  icon('task-done', 'Done', 'monitoring', ['done', 'success', 'complete'], TaskAltOutlinedIcon),
  icon(
    'problem',
    'Warning',
    'monitoring',
    ['warning', 'error', 'problem'],
    ReportProblemOutlinedIcon
  ),

  // Marketing / acquisition
  icon('campaign', 'Campaign', 'marketing', ['campaign', 'ads', 'tracking'], CampaignOutlinedIcon),
  icon(
    'landing',
    'Landing page',
    'marketing',
    ['landing', 'page', 'funnel'],
    LandscapeOutlinedIcon
  ),
  icon(
    'offer',
    'Offer',
    'marketing',
    ['offer', 'discount', 'deal', 'promo'],
    LocalOfferOutlinedIcon
  ),
  icon(
    'inventory',
    'Inventory',
    'marketing',
    ['inventory', 'product', 'catalog'],
    Inventory2OutlinedIcon
  ),

  // Users
  icon('person', 'Person', 'users', ['person', 'user', 'lead'], PersonOutlineIcon),
  icon('group', 'Group', 'users', ['group', 'audience', 'segment'], GroupOutlinedIcon),
  icon('person-add', 'Add user', 'users', ['add', 'invite', 'signup'], PersonAddAltOutlinedIcon),
  icon('badge', 'Badge', 'users', ['badge', 'id', 'role'], BadgeOutlinedIcon),

  // Commerce
  icon('cart', 'Cart', 'commerce', ['cart', 'checkout', 'order'], ShoppingCartOutlinedIcon),
  icon('paid', 'Payment', 'commerce', ['payment', 'paid', 'money'], PaidOutlinedIcon),
  icon(
    'receipt',
    'Receipt',
    'commerce',
    ['receipt', 'invoice', 'billing'],
    ReceiptLongOutlinedIcon
  ),

  // Misc / utility
  icon('extension', 'Extension', 'misc', ['custom', 'plugin', 'block'], ExtensionOutlinedIcon),
  icon('build', 'Build', 'misc', ['build', 'tools', 'wrench'], BuildOutlinedIcon),
  icon(
    'build-circle',
    'Tools',
    'misc',
    ['tools', 'settings', 'configure'],
    BuildCircleOutlinedIcon
  ),
  icon('settings', 'Settings', 'misc', ['settings', 'config', 'gear'], SettingsOutlinedIcon),
  icon('code', 'Code', 'misc', ['code', 'script', 'dev'], CodeOutlinedIcon),
  icon('notes', 'Notes', 'misc', ['notes', 'text', 'memo'], NotesOutlinedIcon),
  icon('doc', 'Document', 'misc', ['document', 'description', 'docs'], DescriptionOutlinedIcon),
  icon('label', 'Label', 'misc', ['label', 'tag', 'category'], LabelOutlinedIcon),
  icon('star', 'Star', 'misc', ['star', 'favorite', 'important'], StarOutlineRoundedIcon),
  icon('attach', 'Attachment', 'misc', ['attachment', 'file', 'paperclip'], AttachFileOutlinedIcon),
  icon('image', 'Image', 'misc', ['image', 'picture', 'media'], ImageOutlinedIcon),
  icon('location', 'Location', 'misc', ['location', 'geo', 'address'], LocationOnOutlinedIcon),
  icon('gps', 'GPS', 'misc', ['gps', 'target', 'pin'], GpsFixedOutlinedIcon),
];

export function getCustomBlockIconById(id) {
  return CUSTOM_BLOCK_ICON_LIBRARY.find((x) => x.id === id) || CUSTOM_BLOCK_ICON_LIBRARY[0];
}
