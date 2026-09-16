import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  InputAdornment,
  TextField,
  InputBase,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Popover,
  Portal,
  Divider,
  Badge,
  Button,
  Collapse,
  Switch,
  Snackbar,
  Alert,
  Skeleton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  alpha,
  useTheme,
  useMediaQuery,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TuneIcon from '@mui/icons-material/Tune';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MouseOutlinedIcon from '@mui/icons-material/MouseOutlined';
import PercentIcon from '@mui/icons-material/Percent';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { usePartners } from '../../hooks/usePartners';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import BentoCard from '../../components/Common/BentoCard';
import PageLayout from '../../components/Common/PageLayout';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import {
  getHeroInputFontSize,
  scrollAppShellToTop,
  shouldAutofocusTextInput,
} from '../../utils/mobileTouchScroll';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { useRequests } from '../../hooks/useRequests';
import { useJobs } from '../../hooks/useJobs';
import { openVoiceCommand } from '../../hooks/useVoiceCommand';
import AiOrb from '../../components/VoiceControl/AiOrb';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import MktTile from '../../components/Common/MktTile';
import { HomeMetricTile, HomeCategoriesShowcase } from '../../components/Common/SimpleHomeTiles';
import { useLlmUsage } from '../../hooks/useLlmUsage';
import { formatTokensOrZero } from '../../utils/formatTokens';
import { DEFAULT_ASSISTANT_MODEL, DEFAULT_ASSISTANT_PROVIDER } from '../../config/assistantBrain';
import '../Marketplace/MarketplaceLanding.css';
import SmartRequestDialog from '../../components/JobPool/SmartRequestDialog';
import GoalSetupDrawer from '../../components/JobPool/NewGoal/GoalSetupDrawer';
import { assistantEntityTarget } from './assistantEntityTarget';
import { isScopedExecutorTarget } from '../../components/JobPool/NewGoal/goalExecutorTarget';
import { useGoalSetup } from '../../hooks/useGoalSetup';
import { clearOpenGoalId, getOpenGoalId, setOpenGoalId } from '../../hooks/useOpenGoal';
import { SLASH_COMMANDS } from '../../components/VoiceControl/capabilities';
import RequestProgressCard from '../../components/JobPool/RequestProgressCard';
import GoalDetailDialog from '../../components/Goals/GoalDetailDialog';
import { listGoals } from '../../services/goalService';
import { useAuth } from '../../context/AuthContext';
import { usePublishAssistantConversation } from '../../context/AssistantConversationContext';
import AssistantSetupChatDialog from '../../components/Assistant/AssistantSetupChatDialog';
import { useConcilium } from '../../hooks/useConcilium';
import { useConciliumTeams } from '../../hooks/useConciliumTeams';
import { assistantChatApi } from '../../services/assistantChatApiService';
import AssistantSurface from '../../components/Assistant/AssistantSurface.jsx';
import { HERO_COMPOSER_MAX_WIDTH } from '../../theme/measures';
import { composerCardSx, composerToolIconSx, composerSendSx } from '../../theme/composerSurface';
import { supabase } from '../../lib/supabase';
import {
  logAssistantMessages,
  getAssistantHistory,
  getConversationMessages,
} from '../../services/assistantHistoryService';
import EmptyState from '../../components/Common/EmptyState';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import {
  MODE_LABEL,
  formatDateTime,
  groupConversations,
} from '../Assistant/assistantConversations';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { validateFile, formatFileSize } from '../../services/goalFileService';
import Menu from '@mui/material/Menu';
import AddIcon from '@mui/icons-material/Add';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import CheckCircleOutlineIcon2 from '@mui/icons-material/CheckCircleOutline';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import PriorityHighOutlinedIcon from '@mui/icons-material/PriorityHighOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import TelegramIcon from '@mui/icons-material/Telegram';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded';
import SearchIcon from '@mui/icons-material/Search';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import GlassIcon from '../../components/icons/GlassIcon';
import {
  formatMonthYear,
  parseMonthYear,
  getCampaignMetricsForPeriod,
  getFinanceSummary,
  getFinanceForPeriod,
} from '../Partners/utils/periodMetrics';
import { TRAFFIC_SOURCES, GROUP_TYPES, INDUSTRY_METRICS } from '../../utils/constants';
import { goalSurfaceHeight, heroMinHeight, TYPING_CLEARANCE_PX } from './goalSurfaceLayout';
import { shouldRenderAssistantSurface, shouldShowOverviewChevron } from './dashboardSurfaceState';
import useTextEntryFocused from '../../hooks/useTextEntryFocused';

import AppIcon from '../../components/icons/AppIcon';

const DEFAULT_FILTERS = {
  group: 'All',
  team: 'All',
  trafficSource: 'All',
  geo: 'All',
  funnelStatus: 'All',
  agreement: 'All',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CHART_COLORS = [
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#0EA5E9',
  '#EC4899',
  '#14B8A6',
];

const FUNNEL_COLORS = {
  Working: '#10B981',
  'Agreed start date': '#3B82F6',
  'Meeting Scheduled': '#8B5CF6',
  'Proposal Sent': '#F59E0B',
  Contacted: '#94A3B8',
};

const shiftPeriod = (period, diffMonths) => {
  const dt = new Date(period.year, period.month - 1 + diffMonths, 1);
  return {
    month: dt.getMonth() + 1,
    year: dt.getFullYear(),
    key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
    label: `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`,
  };
};

// ── Delta indicator (theme-aware) ───────────────────────────────
function DeltaChip({ value, suffix = '%', inverse = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  if (value == null || !Number.isFinite(value)) return null;
  const positive = inverse ? value < 0 : value > 0;
  const negative = inverse ? value > 0 : value < 0;
  const color = positive
    ? theme.palette.success.dark
    : negative
      ? theme.palette.error.dark
      : theme.palette.text.secondary;
  const bg = positive
    ? isDark
      ? alpha(theme.palette.success.main, 0.15)
      : '#D1FAE5'
    : negative
      ? isDark
        ? alpha(theme.palette.error.main, 0.15)
        : '#FEE2E2'
      : theme.palette.background.default;
  const Icon = positive ? TrendingUpIcon : negative ? TrendingDownIcon : TrendingFlatIcon;
  return (
    <Chip
      size="small"
      icon={<AppIcon fallback={Icon} sx={{ fontSize: 14, color }} />}
      label={`${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`}
      sx={{
        height: 22,
        fontSize: '0.68rem',
        fontWeight: 700,
        bgcolor: bg,
        color,
        borderRadius: 1,
        '& .MuiChip-icon': { ml: 0.5 },
      }}
    />
  );
}

// ── Hero KPI card (theme-aware accent) ──────────────────────────
function HeroCard({
  label,
  value,
  delta,
  deltaSuffix = '%',
  deltaInverse = false,
  accent,
  caption,
}) {
  const theme = useTheme();
  const accentColor = accent || theme.palette.primary.main;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 4,
          height: '100%',
          bgcolor: accentColor,
          borderRadius: '3px 0 0 3px',
        },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 700,
          fontSize: '0.66rem',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.75 }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 800, fontSize: '1.6rem', lineHeight: 1.15, color: 'text.primary' }}
        >
          {value}
        </Typography>
        <DeltaChip value={delta} suffix={deltaSuffix} inverse={deltaInverse} />
      </Box>
      {caption && (
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontSize: '0.72rem', mt: 0.5, display: 'block' }}
        >
          {caption}
        </Typography>
      )}
    </Paper>
  );
}

// ── Alert card (theme-aware) ────────────────────────────────────
function AlertCard({ icon, label, value, severity = 'info' }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const palette = {
    success: {
      bg: isDark ? alpha(theme.palette.success.main, 0.12) : '#F0FDF4',
      border: isDark ? alpha(theme.palette.success.main, 0.35) : '#BBF7D0',
      color: theme.palette.success.dark,
      iconColor: theme.palette.success.main,
    },
    warning: {
      bg: isDark ? alpha(theme.palette.warning.main, 0.12) : '#FFFBEB',
      border: isDark ? alpha(theme.palette.warning.main, 0.35) : '#FDE68A',
      color: theme.palette.warning.dark,
      iconColor: theme.palette.warning.main,
    },
    error: {
      bg: isDark ? alpha(theme.palette.error.main, 0.12) : '#FEF2F2',
      border: isDark ? alpha(theme.palette.error.main, 0.35) : '#FECACA',
      color: theme.palette.error.dark,
      iconColor: theme.palette.error.main,
    },
    info: {
      bg: theme.palette.background.default,
      border: theme.palette.divider,
      color: theme.palette.text.secondary,
      iconColor: theme.palette.text.secondary,
    },
  };
  const s = palette[severity] || palette.info;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 2,
        py: 1.5,
        borderRadius: 2.5,
        bgcolor: s.bg,
        border: '1px solid',
        borderColor: s.border,
      }}
    >
      <Box sx={{ color: s.iconColor, display: 'flex' }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: s.color,
            fontWeight: 700,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{ fontWeight: 800, color: s.color, fontSize: '1.05rem', lineHeight: 1.2 }}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Secondary stat ─────────────────────────────────────────────
function StatBlock({ label, value, caption, color = 'text.primary' }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 700,
          fontSize: '0.62rem',
          display: 'block',
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ fontWeight: 800, fontSize: '1.15rem', color, lineHeight: 1.25, mt: 0.25 }}
      >
        {value}
      </Typography>
      {caption && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.66rem' }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
}

// ── Section wrapper ────────────────────────────────────────────
function Section({ title, children, sx = {} }) {
  return (
    <Box sx={{ mb: 2.5, ...sx }}>
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontSize: '0.72rem',
          mb: 1.25,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

// ════════════════════════════════════════════════════════════════
// ── Simple Mode Dashboard ─────────────────────────────────────
// Informative home: gives a Simple Mode user at-a-glance answers to:
//   1. What's running right now? (live pipeline count + stages)
//   2. What needs my attention? (needs_human / awaiting_* / paused / failed)
//   3. What finished recently? (completed goals with deliverables)
//   4. How am I spending? (budget, success rate, recent activity)
// Plus the prominent "New Request" CTA.
// Data source: listGoals() from goalService - same hook pattern as Goals.jsx.

const IN_FLIGHT_STATUSES = [
  'feasibility',
  'analyzing',
  'researching_customer',
  'planning',
  'forming_team',
  'provisioning_tools',
  'estimating',
  'authorizing_execution',
  'active',
  'pending_validation',
];
const ATTENTION_STATUSES = [
  'needs_human',
  'awaiting_tools',
  'awaiting_context_approval',
  'awaiting_approval',
  'awaiting_po_input',
  'paused',
  'failed',
];

const STATUS_LABEL = {
  feasibility: 'Analyzing feasibility',
  analyzing: 'Understanding the problem',
  researching_customer: 'AxWise is proposing scope and capabilities',
  awaiting_context_approval: 'Confirm proposed scope',
  planning: 'Planning the work',
  forming_team: 'Forming team',
  provisioning_tools: 'Setting up tools',
  estimating: 'Estimating',
  authorizing_execution: 'Binding approved execution',
  awaiting_approval: 'Awaiting your approval',
  awaiting_tools: 'Missing tools / API keys',
  awaiting_po_input: 'Needs your input',
  active: 'Executing',
  pending_validation: 'Checking final quality',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  needs_human: 'Needs human attention',
  cancelled: 'Cancelled',
};

const ATTENTION_COPY = {
  needs_human: 'Auto-recovery exhausted - needs your review',
  awaiting_tools: 'Missing an API key - set it up to continue',
  awaiting_context_approval: 'Review who the work is for, the problem, and the ideal executor',
  awaiting_approval: 'Review proposal and approve to start execution',
  awaiting_po_input: 'Answer a few clarifying questions',
  paused: 'Paused - click to resume',
  failed: 'Failed - the healer may recover it next cycle',
};

function StatusDot({ color }) {
  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: color,
        boxShadow: `0 0 0 3px ${alpha(color, 0.2)}`,
        flexShrink: 0,
      }}
    />
  );
}

function MetricTile({ icon, label, value, sublabel, color, onClick }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(color, 0.25),
        background: `linear-gradient(135deg, ${alpha(color, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, transform 0.15s',
        '&:hover': onClick ? { borderColor: alpha(color, 0.5), transform: 'translateY(-1px)' } : {},
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.75 }}>
        <Box sx={{ color, display: 'flex', alignItems: 'center' }}>{icon}</Box>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: '0.68rem',
          }}
        >
          {label}
        </Typography>
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1, mb: 0.5 }}>
        {value}
      </Typography>
      {sublabel && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
          {sublabel}
        </Typography>
      )}
    </Paper>
  );
}

function GoalRow({ goal, onClick, theme, accentColor, trailing }) {
  const phases = goal.plan?.phases || [];
  const completed = phases.filter((p) => p.status === 'completed').length;
  const total = phases.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleClick = (e) => {
    e.stopPropagation();
    onClick?.(e);
  };

  return (
    <Paper
      elevation={0}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick?.(e);
        }
      }}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(accentColor || theme.palette.primary.main, 0.18),
        cursor: 'pointer',
        // Re-enable pointer events inside MktTile, which sets
        // `pointer-events: none` on its direct children to keep the
        // whole tile clickable. We want goal rows to receive their
        // own clicks so they can open the goal-detail dialog.
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': {
          borderColor: alpha(accentColor || theme.palette.primary.main, 0.4),
          bgcolor: alpha(accentColor || theme.palette.primary.main, 0.04),
        },
        '&:focus-visible': {
          outline: `2px solid ${alpha(accentColor || theme.palette.primary.main, 0.6)}`,
          outlineOffset: 2,
        },
      }}
    >
      <Tooltip title={STATUS_LABEL[goal.status] || goal.status} arrow placement="left">
        <Box sx={{ display: 'flex' }}>
          <StatusDot color={accentColor || theme.palette.primary.main} />
        </Box>
      </Tooltip>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
          {goal.title || '(untitled)'}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', lineHeight: 1.3 }}
        >
          {STATUS_LABEL[goal.status] || goal.status}
          {total > 0 ? ` · phase ${completed}/${total} (${pct}%)` : ''}
          {goal.spent_usd > 0 ? ` · $${Number(goal.spent_usd).toFixed(4)}` : ''}
        </Typography>
      </Box>
      {trailing}
    </Paper>
  );
}

// Two-pill toggle ("Assistant" / "Goals") shown in the History header.
// Mirrors the green outlined mode chips used by the home composer: the
// active pill gets a primary-tinted fill + glowing border, the inactive
// one stays a subdued outline.
export function HistoryKindTabs({ value, onChange }) {
  const theme = useTheme();
  const items = [
    { key: 'assistant', label: 'Conversations' },
    { key: 'goals', label: 'Goals' },
  ];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {items.map((it) => {
        const active = value === it.key;
        return (
          <Chip
            key={it.key}
            label={it.label}
            onClick={() => onChange(it.key)}
            variant="outlined"
            clickable
            sx={{
              fontWeight: 700,
              borderRadius: 999,
              height: 30,
              px: 0.5,
              color: active ? theme.palette.primary.main : 'text.secondary',
              borderColor: active
                ? alpha(theme.palette.primary.main, 0.6)
                : alpha(theme.palette.divider, 0.8),
              bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              boxShadow: active ? `0 0 0 1px ${alpha(theme.palette.primary.main, 0.35)}` : 'none',
              transition: 'border-color 0.15s, background-color 0.15s, color 0.15s',
              '&:hover': {
                bgcolor: active
                  ? alpha(theme.palette.primary.main, 0.16)
                  : alpha(theme.palette.primary.main, 0.06),
                borderColor: alpha(theme.palette.primary.main, 0.5),
              },
            }}
          />
        );
      })}
    </Box>
  );
}

const ASSISTANT_MODE_ACCENT = {
  assistant: 'primary',
  talk: 'success',
  consilium: 'secondary',
  team: 'warning',
};

// Assistant chat history shown on the History tab when the "Assistant"
// pill is active. Reuses the GoalRow visual language (StatusDot + title +
// caption) and the same staggered enter animation, but each row is a
// grouped conversation (assistant_chat_messages). Clicking a row expands
// it inline into chat bubbles (mirrors AssistantHistoryPanel).
export function HistoryAssistantList({
  theme,
  historyKind,
  onHistoryKindChange,
  // Reopen this conversation as a live chat. Without it the row keeps the old
  // read-only behaviour and expands in place.
  onOpenConversation = null,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getAssistantHistory();
        if (!cancelled) setMessages(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load history');
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const conversations = useMemo(() => groupConversations(messages), [messages]);

  const pagination = usePagination(conversations, {
    surfaceId: 'dashboard.history.conversations',
    defaultRowsPerPage: 10,
    rowsPerPageOptions: [10, 25],
  });

  const accentFor = (mode) => {
    const tone = ASSISTANT_MODE_ACCENT[mode] || 'primary';
    return theme.palette[tone]?.main || theme.palette.primary.main;
  };

  const titleFor = (c) => {
    const firstUser = c.messages.find((m) => m.role === 'user');
    const text = (firstUser?.content || '').trim();
    if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    return MODE_LABEL[c.mode] || 'Conversation';
  };

  const rowAnimSx = (i) => ({
    opacity: 0,
    animation: `historyRowIn 520ms ${120 + Math.min(i, 12) * 60}ms cubic-bezier(.22,1,.36,1) both`,
    '@keyframes historyRowIn': {
      from: { opacity: 0, transform: 'translateY(10px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1 },
  });

  return (
    <Box sx={{ mt: { xs: 2, sm: 3 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          mb: 1.5,
          opacity: 0,
          animation: 'historyHeaderIn 460ms 0ms cubic-bezier(.22,1,.36,1) both',
          '@keyframes historyHeaderIn': {
            from: { opacity: 0, transform: 'translateY(-4px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <SectionLabel sx={{ mt: 0, mb: 0 }}>History</SectionLabel>
          <HistoryKindTabs value={historyKind} onChange={onHistoryKindChange} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {conversations.length} chat{conversations.length === 1 ? '' : 's'}
        </Typography>
      </Box>

      {loading && !messages.length ? (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner />
        </Box>
      ) : error ? (
        <Typography variant="caption" sx={{ color: 'error.main', display: 'block' }}>
          {error}
        </Typography>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={ChatBubbleOutlineIcon}
          title="No conversations yet"
          description="Chats with your assistant will show up here."
        />
      ) : (
        <>
          <Stack spacing={1.25}>
            {pagination.paginatedData.map((c, i) => {
              const accent = accentFor(c.mode);
              const open = expandedId === c.id;
              return (
                <Box key={c.id} sx={rowAnimSx(i)}>
                  <GoalRow
                    goal={{
                      title: titleFor(c),
                      status: MODE_LABEL[c.mode] || 'Conversation',
                    }}
                    onClick={() =>
                      onOpenConversation ? onOpenConversation(c) : setExpandedId(open ? null : c.id)
                    }
                    theme={theme}
                    accentColor={accent}
                    trailing={
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: 'nowrap', pl: 1 }}
                      >
                        {c.messages.length} msg · {formatDateTime(c.lastAt)}
                      </Typography>
                    }
                  />
                  <Collapse in={open} unmountOnExit>
                    <Box
                      sx={{
                        mt: 0.75,
                        p: 1.5,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: alpha(accent, 0.18),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      {c.messages.map((m) => (
                        <Box
                          key={m.id}
                          sx={{
                            display: 'flex',
                            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <Box
                            sx={{
                              maxWidth: '80%',
                              px: 1.25,
                              py: 0.85,
                              borderRadius: 2,
                              bgcolor:
                                m.role === 'user'
                                  ? alpha(theme.palette.primary.main, 0.12)
                                  : alpha(theme.palette.text.primary, 0.05),
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}
                            >
                              {m.content}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                display: 'block',
                                color: 'text.secondary',
                                mt: 0.25,
                                fontSize: '0.62rem',
                                textAlign: m.role === 'user' ? 'right' : 'left',
                              }}
                            >
                              {m.role === 'user' ? 'You' : 'Assistant'} ·{' '}
                              {formatDateTime(m.created_at)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Stack>
          <Pagination
            count={pagination.totalCount}
            page={pagination.page}
            rowsPerPage={pagination.rowsPerPage}
            rowsPerPageOptions={pagination.rowsPerPageOptions}
            onPageChange={(next) => {
              setExpandedId(null);
              pagination.setPage(next);
            }}
            onRowsPerPageChange={(next) => {
              setExpandedId(null);
              pagination.setRowsPerPage(next);
            }}
            onLoadAll={pagination.loadAll}
            onCollapseAll={pagination.collapseAll}
            allMode={pagination.allMode}
            label="chats"
          />
        </>
      )}
    </Box>
  );
}

// ── Reveal-on-scroll: respects prefers-reduced-motion ────────────
// ── HistoryGoalsList - full goals list shown on the History tab.
//    Filterable by created-at date range, status buckets, cost range
//    and free-text title search. Each row uses the same GoalRow used
//    by Attention / Recent so the list format stays consistent.
//    Clicking a row opens the goal detail dialog (via `onOpenGoal`).
// Glassmorphic bento tile used inside the History-tab filter panel.
// Renders a translucent 28px icon shell at the top-left, an optional
// label, and the actual control(s) below.
function FilterTile({ theme, iconName, iconFallback, label, spanAll, children }) {
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        gridColumn: spanAll ? { xs: '1', sm: '1 / -1' } : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        p: { xs: 1, sm: 1.25 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: isDark
          ? alpha(theme.palette.background.paper, 0.5)
          : alpha(theme.palette.background.paper, 0.7),
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          aria-hidden
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDark
              ? alpha(theme.palette.background.paper, 0.55)
              : alpha('#ffffff', 0.7),
            border: '1px solid',
            borderColor: isDark ? alpha('#ffffff', 0.1) : alpha(theme.palette.divider, 0.6),
            backdropFilter: 'saturate(180%) blur(12px)',
            WebkitBackdropFilter: 'saturate(180%) blur(12px)',
            boxShadow: isDark
              ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
              : 'inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <GlassIcon name={iconName} fallback={iconFallback} size={16} tone="brand" />
        </Box>
        {label && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </Typography>
        )}
      </Box>
      <Box>{children}</Box>
    </Box>
  );
}

const STATUS_BUCKETS = [
  {
    key: 'in_flight',
    label: 'In flight',
    statuses: [
      'feasibility',
      'analyzing',
      'researching_customer',
      'planning',
      'forming_team',
      'provisioning_tools',
      'estimating',
      'authorizing_execution',
      'active',
      'pending_validation',
    ],
  },
  {
    key: 'needs_attention',
    label: 'Needs attention',
    statuses: [
      'needs_human',
      'awaiting_tools',
      'awaiting_context_approval',
      'awaiting_approval',
      'awaiting_po_input',
      'paused',
    ],
  },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'failed', label: 'Failed', statuses: ['failed'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

export function HistoryGoalsList({
  goals,
  theme,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  statuses,
  onStatusesChange,
  costMin,
  costMax,
  onCostMinChange,
  onCostMaxChange,
  search,
  onSearchChange,
  onOpenGoal,
  // Opens the read-only detail dialog. Kept off the row itself: the row is now
  // how a goal is picked back up, and the two would fight over the same tap.
  onOpenDetails = null,
  historyKind,
  onHistoryKindChange,
}) {
  // Build a set of raw status strings active right now (any selected bucket).
  const activeStatusSet = useMemo(() => {
    if (!statuses?.length) return null; // null = no status filter applied
    const set = new Set();
    STATUS_BUCKETS.forEach((b) => {
      if (statuses.includes(b.key)) b.statuses.forEach((s) => set.add(s));
    });
    return set;
  }, [statuses]);

  const filtered = useMemo(() => {
    const toEpoch = (s) => (s ? new Date(s).getTime() : null);
    const fromTs = toEpoch(dateFrom);
    const toEndTs = dateTo ? toEpoch(dateTo) + 24 * 60 * 60 * 1000 - 1 : null;
    const minCost = costMin === '' ? null : Number(costMin);
    const maxCost = costMax === '' ? null : Number(costMax);
    const q = (search || '').trim().toLowerCase();
    return [...goals]
      .filter((g) => {
        // Date range (on created_at, falling back to updated_at).
        const tsRaw = g.created_at || g.updated_at;
        if (fromTs || toEndTs) {
          if (!tsRaw) return false;
          const ts = new Date(tsRaw).getTime();
          if (fromTs && ts < fromTs) return false;
          if (toEndTs && ts > toEndTs) return false;
        }
        // Status bucket.
        if (activeStatusSet && !activeStatusSet.has(g.status)) return false;
        // Cost range (matches spent_usd).
        const spent = Number(g.spent_usd || 0);
        if (minCost != null && !Number.isNaN(minCost) && spent < minCost) return false;
        if (maxCost != null && !Number.isNaN(maxCost) && spent > maxCost) return false;
        // Title search.
        if (q) {
          const title = (g.title || g.data?.title || '').toLowerCase();
          if (!title.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTs = new Date(a.created_at || a.updated_at || 0).getTime();
        const bTs = new Date(b.created_at || b.updated_at || 0).getTime();
        return bTs - aTs;
      });
  }, [goals, dateFrom, dateTo, activeStatusSet, costMin, costMax, search]);

  const accentFor = (g) => {
    if (g.status === 'completed') return theme.palette.success.main;
    if (g.status === 'failed' || g.status === 'cancelled') return theme.palette.error.main;
    if (g.status === 'needs_human') return theme.palette.warning.main;
    return theme.palette.primary.main;
  };

  const hasFilter = Boolean(
    dateFrom ||
    dateTo ||
    statuses?.length ||
    costMin !== '' ||
    costMax !== '' ||
    (search || '').trim()
  );

  const toggleStatus = (key) => {
    const next = statuses.includes(key) ? statuses.filter((k) => k !== key) : [...statuses, key];
    onStatusesChange(next);
  };

  const resetAll = () => {
    onDateFromChange('');
    onDateToChange('');
    onStatusesChange([]);
    onCostMinChange('');
    onCostMaxChange('');
    onSearchChange('');
  };

  // Collapsed by default. The header shows a single Filter icon; tapping
  // opens the bento-style filter panel below.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (statuses?.length || 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (costMin !== '' ? 1 : 0) +
    (costMax !== '' ? 1 : 0) +
    ((search || '').trim() ? 1 : 0);

  const pagination = usePagination(filtered, {
    surfaceId: 'dashboard.history.goals',
    defaultRowsPerPage: 10,
    rowsPerPageOptions: [10, 25],
    resetOn: [dateFrom, dateTo, activeStatusSet, costMin, costMax, search],
  });

  // Staggered enter animation. We key the animation on filter inputs +
  // goal count so re-applying a filter replays the cascade. A small
  // per-row delay (60ms) capped at 12 items keeps the effect snappy
  // even for long lists. Respects prefers-reduced-motion.
  const animKey = `${dateFrom}|${dateTo}|${(statuses || []).join(',')}|${costMin}|${costMax}|${search}|${filtered.length}`;
  const baseRowDelay = 120; // ms - header + filter card play first
  const stepDelay = 60;
  const maxStepIndex = 12;
  const rowAnimSx = (i) => ({
    opacity: 0,
    animation: `historyRowIn 520ms ${baseRowDelay + Math.min(i, maxStepIndex) * stepDelay}ms cubic-bezier(.22,1,.36,1) both`,
    '@keyframes historyRowIn': {
      from: { opacity: 0, transform: 'translateY(10px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1 },
  });

  return (
    <Box sx={{ mt: { xs: 2, sm: 3 } }} key={animKey}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          mb: 1.5,
          opacity: 0,
          animation: 'historyHeaderIn 460ms 0ms cubic-bezier(.22,1,.36,1) both',
          '@keyframes historyHeaderIn': {
            from: { opacity: 0, transform: 'translateY(-4px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <SectionLabel sx={{ mt: 0, mb: 0 }}>History</SectionLabel>
          <HistoryKindTabs value={historyKind} onChange={onHistoryKindChange} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {filtered.length} of {goals.length} goal{goals.length === 1 ? '' : 's'}
            {hasFilter ? ' (filtered)' : ''}
          </Typography>
          <Tooltip title={filtersOpen ? 'Hide filters' : 'Show filters'} arrow>
            <Badge color="primary" badgeContent={activeFilterCount} max={9} overlap="circular">
              <IconButton
                size="small"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-label="Toggle filters"
                aria-expanded={filtersOpen}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background:
                    theme.palette.mode === 'dark'
                      ? alpha(theme.palette.background.paper, 0.55)
                      : alpha('#ffffff', 0.7),
                  border: '1px solid',
                  borderColor: filtersOpen
                    ? alpha(theme.palette.primary.main, 0.55)
                    : alpha(theme.palette.divider, 0.6),
                  backdropFilter: 'saturate(180%) blur(12px)',
                  WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                  color: filtersOpen ? 'primary.main' : 'text.secondary',
                  transition: 'transform .15s, border-color .15s, background .15s, color .15s',
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    borderColor: alpha(theme.palette.primary.main, 0.5),
                    color: 'primary.main',
                  },
                }}
              >
                <GlassIcon
                  name="Tune"
                  fallback={TuneRoundedIcon}
                  size={18}
                  tone={filtersOpen ? theme.palette.primary.main : 'neutral'}
                />
              </IconButton>
            </Badge>
          </Tooltip>
        </Box>
      </Box>

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: '85vh',
            bgcolor:
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.background.paper, 0.92)
                : theme.palette.background.paper,
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            pb: 1,
            fontWeight: 800,
            fontSize: '1.05rem',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GlassIcon name="Tune" fallback={TuneRoundedIcon} size={20} tone="neutral" />
            Filters & Layout
          </Box>
          <IconButton size="small" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
            <GlassIcon name="Close" fallback={CloseIcon} size={20} tone="neutral" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              gap: { xs: 1, sm: 1.25 },
            }}
          >
            {/* Search tile - full width */}
            <FilterTile
              theme={theme}
              iconName="Search"
              iconFallback={SearchIcon}
              label="Search"
              spanAll
            >
              <TextField
                size="small"
                placeholder="Search goal title…"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                variant="standard"
                fullWidth
                InputProps={{ disableUnderline: true }}
              />
            </FilterTile>

            {/* Status tile - full width */}
            <FilterTile
              theme={theme}
              iconName="Tune"
              iconFallback={TuneIcon}
              label="Status"
              spanAll
            >
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {STATUS_BUCKETS.map((b) => {
                  const selected = statuses.includes(b.key);
                  return (
                    <Chip
                      key={b.key}
                      label={b.label}
                      size="small"
                      clickable
                      onClick={() => toggleStatus(b.key)}
                      variant={selected ? 'filled' : 'outlined'}
                      color={selected ? 'primary' : 'default'}
                      sx={{ fontWeight: 600 }}
                    />
                  );
                })}
              </Box>
            </FilterTile>

            {/* Date range tile */}
            <FilterTile
              theme={theme}
              iconName="CalendarMonth"
              iconFallback={CalendarMonthIcon}
              label="Date range"
            >
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  type="date"
                  size="small"
                  label="From"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: dateTo || undefined }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  type="date"
                  size="small"
                  label="To"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: dateFrom || undefined }}
                  sx={{ flex: 1 }}
                />
              </Box>
            </FilterTile>

            {/* Cost range tile */}
            <FilterTile
              theme={theme}
              iconName="AttachMoneyOutlined"
              iconFallback={AttachMoneyOutlinedIcon}
              label="Cost (USD)"
            >
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  type="number"
                  size="small"
                  label="≥"
                  value={costMin}
                  onChange={(e) => onCostMinChange(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  inputProps={{ min: 0, step: '0.01' }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  type="number"
                  size="small"
                  label="≤"
                  value={costMax}
                  onChange={(e) => onCostMaxChange(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  inputProps={{ min: 0, step: '0.01' }}
                  sx={{ flex: 1 }}
                />
              </Box>
            </FilterTile>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
          <Button
            size="small"
            variant="text"
            onClick={resetAll}
            disabled={!hasFilter}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Reset filters
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => setFiltersOpen(false)}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {filtered.length === 0 ? (
        <Box
          sx={{
            py: { xs: 4, sm: 5 },
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            ...rowAnimSx(0),
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {goals.length === 0
              ? 'No goals yet. Create your first request from the home prompt.'
              : 'No goals match this date range. Try widening the filter.'}
          </Typography>
        </Box>
      ) : (
        <>
          <Stack spacing={1.25}>
            {pagination.paginatedData.map((g, i) => {
              const deployUrl = g.data?.deployment_url;
              return (
                <Box key={g.id} sx={rowAnimSx(i)}>
                  <GoalRow
                    goal={g}
                    onClick={() => onOpenGoal(g.id)}
                    theme={theme}
                    accentColor={accentFor(g)}
                    trailing={
                      <>
                        {deployUrl ? (
                          <Tooltip title="Open deployed URL">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(deployUrl, '_blank', 'noopener');
                              }}
                              sx={{ color: 'success.main', pointerEvents: 'auto' }}
                            >
                              <GlassIcon
                                name="OpenInNew"
                                fallback={OpenInNewIcon}
                                size={18}
                                tone="neutral"
                              />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {onOpenDetails ? (
                          <Tooltip title="Goal details">
                            <IconButton
                              size="small"
                              aria-label={`Details for ${g.title || 'goal'}`}
                              onClick={(e) => {
                                // The row itself reopens the conversation, so
                                // this must not also trigger it.
                                e.stopPropagation();
                                onOpenDetails(g.id);
                              }}
                              sx={{ color: 'text.secondary', pointerEvents: 'auto' }}
                            >
                              <GlassIcon
                                name="Info"
                                fallback={InfoOutlinedIcon}
                                size={18}
                                tone="neutral"
                              />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </>
                    }
                  />
                </Box>
              );
            })}
          </Stack>

          <Pagination
            count={pagination.totalCount}
            page={pagination.page}
            rowsPerPage={pagination.rowsPerPage}
            rowsPerPageOptions={pagination.rowsPerPageOptions}
            onPageChange={pagination.setPage}
            onRowsPerPageChange={pagination.setRowsPerPage}
            onLoadAll={pagination.loadAll}
            onCollapseAll={pagination.collapseAll}
            allMode={pagination.allMode}
            label="goals"
          />
        </>
      )}
    </Box>
  );
}

function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setShown(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setShown(true);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 600ms cubic-bezier(.22,1,.36,1) ${delay}ms, transform 600ms cubic-bezier(.22,1,.36,1) ${delay}ms`,
        '@media (prefers-reduced-motion: reduce)': {
          opacity: 1,
          transform: 'none',
          transition: 'none',
        },
      }}
    >
      {children}
    </Box>
  );
}

// ── Section header (consistent rhythm above each block) ─────────
function SectionLabel({ children, sx }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: 'block',
        fontWeight: 800,
        letterSpacing: '0.18em',
        color: 'text.secondary',
        mt: { xs: 3, sm: 4 },
        mb: 1.25,
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

// ── Catalogue of every block on the simple-mode home.
//    `pinned: true` means the block cannot be reordered (Hero has a
//    full-screen layout that makes mid-page placement nonsensical).
//    All other blocks are sortable via the View-options popover.
const SIMPLE_HOME_HERO = { key: 'hero', label: 'Hero (orb + prompt)', pinned: true };

const HERO_ORB_SIZE = { mobile: 170, desktop: 210 };
const SIMPLE_HOME_SORTABLE_DEFAULT = [
  { key: 'getStarted', label: 'Get started' },
  { key: 'guide', label: 'Guide' },
  { key: 'goalMonitoring', label: 'Goal monitoring' },
  { key: 'categories', label: 'Categories' },
  { key: 'inFlight', label: 'In flight' },
  { key: 'recent', label: 'Recent' },
];
const SIMPLE_HOME_SORTABLE_KEYS = SIMPLE_HOME_SORTABLE_DEFAULT.map((b) => b.key);
const SIMPLE_HOME_BLOCK_LABELS = Object.fromEntries(
  [SIMPLE_HOME_HERO, ...SIMPLE_HOME_SORTABLE_DEFAULT].map((b) => [b.key, b.label])
);

// ── HideableBlock - when `hidden` is true, renders nothing (heading
//    and content alike). Visibility + order are controlled by the
//    parent through the View-options popover. The `order` prop maps
//    to CSS `order` on a flex item, so the parent container only
//    needs to be `display: flex; flex-direction: column` for drag
//    reordering to take effect with zero JSX restructuring.
function HideableBlock({ hidden, order, children, sx }) {
  if (hidden) return null;
  return <Box sx={{ order, minWidth: 0, ...sx }}>{children}</Box>;
}

// ── BlockOptionRow - single row inside the View-options popover.
//    `sortable={true}` wires drag handles via @dnd-kit. The hero row
//    is rendered with `sortable={false}` and shows a lock icon
//    instead of a drag handle.
function BlockOptionRow({ id, label, hidden, sortable, onToggle }) {
  const theme = useTheme();
  const sortableApi = useSortable({ id, disabled: !sortable });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortableApi;
  const rowRef = sortable ? setNodeRef : undefined;
  const style = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : undefined,
      }
    : undefined;
  return (
    <Box
      ref={rowRef}
      role="listitem"
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 1.25,
        bgcolor: isDragging ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
        boxShadow: isDragging ? `0 4px 16px ${alpha(theme.palette.common.black, 0.18)}` : 'none',
        borderRadius: isDragging ? 1.5 : 0,
        transition: 'background-color .15s, box-shadow .15s',
        '&:not(:last-of-type)': { borderBottom: '1px solid', borderColor: 'divider' },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box
        {...(sortable ? { ...attributes, ...listeners } : {})}
        aria-label={sortable ? `Drag to reorder ${label}` : `${label} is fixed at top`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          flexShrink: 0,
          color: sortable ? 'text.secondary' : 'text.disabled',
          cursor: sortable ? (isDragging ? 'grabbing' : 'grab') : 'not-allowed',
          borderRadius: 1,
          touchAction: 'none',
          '&:hover': sortable
            ? { bgcolor: alpha(theme.palette.text.primary, 0.06), color: 'text.primary' }
            : undefined,
        }}
      >
        {sortable ? (
          <AppIcon name="DragIndicator" fallback={DragIndicatorIcon} fontSize="small" />
        ) : (
          <AppIcon name="LockOutlined" fallback={LockOutlinedIcon} fontSize="small" />
        )}
      </Box>
      <Typography
        sx={{
          flex: 1,
          fontSize: '0.92rem',
          fontWeight: 600,
          color: hidden ? 'text.disabled' : 'text.primary',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Button
        size="small"
        onClick={() => onToggle(id)}
        startIcon={
          hidden ? (
            <AppIcon name="VisibilityOff" fallback={VisibilityOffIcon} fontSize="small" />
          ) : (
            <AppIcon name="Visibility" fallback={VisibilityIcon} fontSize="small" />
          )
        }
        aria-label={`${hidden ? 'Show' : 'Hide'} ${label}`}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          minWidth: 76,
          color: hidden ? 'primary.main' : 'text.secondary',
          '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.05) },
        }}
      >
        {hidden ? 'Show' : 'Hide'}
      </Button>
    </Box>
  );
}

// ── ViewOptionsButton - opens a popover listing every block on the
//    simple-mode home with per-row "Hide" / "Show" actions and drag
//    reordering for non-pinned blocks. Mobile-friendly: popover
//    width clamps to viewport, drag uses pointer + touch sensors
//    with a small activation distance so taps still scroll lists.
function ViewOptionsButton({
  hiddenBlocks,
  order,
  onToggle,
  onReorder,
  onShowAll,
  onHideAll,
  onReset,
}) {
  const theme = useTheme();
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const allKeys = [SIMPLE_HOME_HERO.key, ...order];
  const hiddenCount = allKeys.reduce((n, k) => n + (hiddenBlocks.has(k) ? 1 : 0), 0);
  const totalCount = allKeys.length;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(order, oldIndex, newIndex));
  };
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<AppIcon name="Visibility" fallback={VisibilityIcon} fontSize="small" />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={open}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 999,
          borderColor: alpha(theme.palette.text.primary, 0.15),
          color: 'text.primary',
          px: 1.5,
          minHeight: 36,
          '&:hover': {
            borderColor: alpha(theme.palette.text.primary, 0.32),
            bgcolor: alpha(theme.palette.text.primary, 0.04),
          },
        }}
      >
        View options{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
      </Button>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: { xs: 'calc(100% - 32px)', sm: 380 },
              maxWidth: 'calc(100% - 32px)',
              borderRadius: 2,
              boxShadow: 6,
              overflow: 'hidden',
            },
          },
        }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mb: 0.25,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              Home blocks
            </Typography>
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                onClick={onShowAll}
                disabled={hiddenCount === 0}
                sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
              >
                Show all
              </Button>
              <Button
                size="small"
                onClick={onHideAll}
                disabled={hiddenCount === totalCount}
                sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
              >
                Hide all
              </Button>
              <Button
                size="small"
                onClick={onReset}
                sx={{ textTransform: 'none', fontWeight: 700, minWidth: 0 }}
              >
                Reset
              </Button>
            </Stack>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Drag{' '}
            <AppIcon
              name="DragIndicator"
              fallback={DragIndicatorIcon}
              sx={{ fontSize: 14, verticalAlign: -2 }}
            />{' '}
            to reorder. Hero stays at top.
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ maxHeight: { xs: '60vh', sm: 480 }, overflowY: 'auto', px: 1 }} role="list">
          <BlockOptionRow
            id={SIMPLE_HOME_HERO.key}
            label={SIMPLE_HOME_HERO.label}
            hidden={hiddenBlocks.has(SIMPLE_HOME_HERO.key)}
            sortable={false}
            onToggle={onToggle}
          />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {order.map((key) => (
                <BlockOptionRow
                  key={key}
                  id={key}
                  label={SIMPLE_HOME_BLOCK_LABELS[key] || key}
                  hidden={hiddenBlocks.has(key)}
                  sortable
                  onToggle={onToggle}
                />
              ))}
            </SortableContext>
          </DndContext>
        </Box>
      </Popover>
    </>
  );
}

function SimpleDashboard({ metricsOverride = null }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isHeroMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const heroOrbSize = isHeroMobile ? HERO_ORB_SIZE.mobile : HERO_ORB_SIZE.desktop;
  const isCompactShell = useMediaQuery(theme.breakpoints.down('md'));
  const typing = useTextEntryFocused();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addRequest } = useRequests();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metricsSettingsOpen, setMetricsSettingsOpen] = useState(false);

  // ── Mode selection & Assistant activation states ──
  const { concilium } = useConcilium();
  const { teams } = useConciliumTeams();

  // Reads the assistant brain config + active flag the unified setup dialog
  // persists (mirrored to localStorage by useAssistantSetup). `activated`
  // bridges the new orch_assistant_active flag into the existing config shape.
  const readAssistantConfig = () => {
    try {
      const stored = localStorage.getItem('orch_assistant_config');
      const cfg = stored ? JSON.parse(stored) : null;
      const activated = localStorage.getItem('orch_assistant_active') === 'true';
      if (!cfg && !activated) return null;
      return { ...(cfg || {}), activated: activated || cfg?.activated || false };
    } catch {
      return null;
    }
  };
  const [assistantConfig, setAssistantConfig] = useState(readAssistantConfig);
  const [assistantDialogOpen, setAssistantDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('goal'); // 'goal', 'assistant', 'consilium', 'team'
  // Whether the embedded assistant actually has turns. An activated assistant
  // with an empty thread is still a landing page and must lay out exactly like
  // the Goal landing; only a started conversation earns the full-height, wide
  // surface. Reported up by AssistantChat because only it knows.
  const [assistantHasChat, setAssistantHasChat] = useState(false);
  // Goal setup (workspace, board, team/agent, AxWise). The drawer here serves the
  // landing composer only - once a thread exists SmartRequestDialog owns the
  // surface and mounts its own - but both read the same useGoalSetup store, so
  // the destination chosen before sending is the one the goal is created with.
  const [goalSetupOpen, setGoalSetupOpen] = useState(false);
  const goalSetup = useGoalSetup();
  // A goal being formed inline in the hero: { prompt, files }. Null until one
  // is started, so the orb and greeting own the surface first.
  // Either a goal being formed ({ prompt, files }) or one being picked back up
  // from History ({ goalId }). Both mount the same surface.
  // Seeded from the open goal, so leaving for another page and coming back
  // puts you back in the run rather than in front of an empty composer.
  const [goalThread, setGoalThread] = useState(() => {
    const openGoalId = getOpenGoalId();
    return openGoalId ? { goalId: openGoalId } : null;
  });
  // A past assistant conversation reopened from History:
  // { id, messages } - seeded from the row the list already holds, then topped
  // up from the server in case the flat history window truncated it.
  const [resumeConversation, setResumeConversation] = useState(null);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [boardMenuAnchor, setBoardMenuAnchor] = useState(null);
  const [teamMenuAnchor, setTeamMenuAnchor] = useState(null);

  const [dashboardChats, setDashboardChats] = useState({ assistant: [], consilium: [], team: [] });
  const [dashboardChatLoading, setDashboardChatLoading] = useState(false);
  // One persistent conversation id per chat category (assistant/consilium/team),
  // so the assistant <-> user history is grouped per session in the DB.
  const convoIdsRef = useRef({});

  useEffect(() => {
    if (concilium?.length > 0 && !selectedBoard) {
      setSelectedBoard(concilium[0]);
    }
  }, [concilium, selectedBoard]);

  useEffect(() => {
    if (teams?.length > 0 && !selectedTeam) {
      setSelectedTeam(teams[0]);
    }
  }, [teams, selectedTeam]);

  const handleSendDashboardChat = async (text, files = []) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      files: files.length > 0 ? files.map(({ _file, ...rest }) => rest) : undefined,
    };

    // Stable conversation id for this category's session (persisted history).
    let conversationId = convoIdsRef.current[activeCategory];
    if (!conversationId) {
      conversationId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `c_${Date.now()}_${activeCategory}`;
      convoIdsRef.current[activeCategory] = conversationId;
    }

    // Set chat history state
    setDashboardChats((prev) => ({
      ...prev,
      [activeCategory]: [...prev[activeCategory], userMsg],
    }));
    setDashboardChatLoading(true);

    // Fast search in goals
    const searchWords = trimmed
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    const matchedGoals = [];
    if (searchWords.length > 0) {
      for (const g of goals) {
        const title = (g.title || g.data?.title || '').toLowerCase();
        const desc = (g.description || g.data?.description || '').toLowerCase();
        const isMatch = searchWords.some((w) => title.includes(w) || desc.includes(w));
        if (isMatch) {
          matchedGoals.push({
            id: g.id,
            title: g.title || g.data?.title || 'Goal',
            status: g.status,
            spent_usd: g.spent_usd,
            budget_usd: g.budget_usd,
            description: g.description || g.data?.description || 'No description provided.',
          });
          if (matchedGoals.length >= 3) break;
        }
      }
    }

    try {
      let body = {
        message: trimmed,
        history: dashboardChats[activeCategory],
        execute: false,
      };

      if (activeCategory === 'assistant') {
        body.action = 'natural-reply';
        body.provider = assistantConfig?.provider || DEFAULT_ASSISTANT_PROVIDER;
        body.model = assistantConfig?.model || DEFAULT_ASSISTANT_MODEL;
        body.temperature = assistantConfig?.temperature || 0.6;
        body.context = `You are a friendly, encouraging, and positive personal AI assistant. Communicate with warmth and positive energy.`;
      } else if (activeCategory === 'consilium') {
        body.action = 'natural-reply';
        body.provider = DEFAULT_ASSISTANT_PROVIDER;
        body.model = DEFAULT_ASSISTANT_MODEL;
        body.context = `You are the Consilium Board Committee for "${selectedBoard?.name || 'Consilium Board'}". Speak as a collective advisory committee offering governance, strategy, and risk analysis.`;
      } else {
        body.action = 'natural-reply';
        body.provider = DEFAULT_ASSISTANT_PROVIDER;
        body.model = DEFAULT_ASSISTANT_MODEL;
        body.context = `You are the Team Lead for team "${selectedTeam?.name || 'Workspace Team'}". Speak in a supportive, execution-focused, and operational tone.`;
      }

      if (matchedGoals.length > 0) {
        body.context +=
          `\nRelevant goals/requests the user is asking about:\n` +
          matchedGoals
            .map(
              (g) =>
                `- [${g.title}] (Status: ${g.status}, Spent: $${g.spent_usd}, Budget: $${g.budget_usd})`
            )
            .join('\n') +
          `\nReference these goals when answering. Provide insights regarding them.`;
      }

      // Include file metadata in context if files are attached
      if (files.length > 0) {
        body.context +=
          `\n\nUser has attached ${files.length} file(s):\n` +
          files
            .map(
              (f) => `- ${f.name} (${(f.ext || 'file').toUpperCase()}, ${formatFileSize(f.size)})`
            )
            .join('\n') +
          `\nAcknowledge the attached files. Ask the user what they'd like to do with them if no specific instruction was given. Be friendly and helpful.`;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || null;
      const res = await assistantChatApi({ ...body, token });
      const replyText = res.message || res.reply || 'I processed your request.';

      const assistantMsg = {
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toISOString(),
        matchedGoals: matchedGoals.length > 0 ? matchedGoals : null,
      };

      setDashboardChats((prev) => ({
        ...prev,
        [activeCategory]: [...prev[activeCategory], assistantMsg],
      }));

      // Persist the exchange (best-effort; never blocks the chat UX).
      logAssistantMessages(
        conversationId,
        [
          { role: 'user', content: trimmed },
          { role: 'assistant', content: replyText },
        ],
        activeCategory
      ).catch(() => {});
    } catch (err) {
      const errMsg = {
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to get response.'}`,
        timestamp: new Date().toISOString(),
      };
      setDashboardChats((prev) => ({
        ...prev,
        [activeCategory]: [...prev[activeCategory], errMsg],
      }));
    } finally {
      setDashboardChatLoading(false);
    }
  };
  // Home page is split into two tabs:
  //   'metrics' - KPI strip, categories, attention/recent tiles, marketing widgets
  //   'history' - full goals list filterable by date range
  // Stored under a v2 key so legacy values from the old Home/History
  // layout are ignored (the new 'history' value collides with the old
  // 'history' value but meant something different).
  const [homeTab, setHomeTab] = useState(() => {
    try {
      const stored = localStorage.getItem('orch_home_tab_v2');
      return stored === 'history' ? 'history' : 'metrics';
    } catch {
      return 'metrics';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('orch_home_tab_v2', homeTab);
    } catch {
      /* private mode */
    }
  }, [homeTab]);
  // History sub-tab: 'goals' (goal list) or 'assistant' (chat history). Persisted.
  const [historyKind, setHistoryKind] = useState(() => {
    try {
      return localStorage.getItem('orch_home_history_kind') === 'assistant' ? 'assistant' : 'goals';
    } catch {
      return 'goals';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('orch_home_history_kind', historyKind);
    } catch {
      /* private mode */
    }
  }, [historyKind]);
  // History-tab filter state. Empty strings = unbounded.
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyStatuses, setHistoryStatuses] = useState([]); // bucket keys, e.g. ['completed','in_flight']
  const [historyCostMin, setHistoryCostMin] = useState(''); // numeric string, USD
  const [historyCostMax, setHistoryCostMax] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  const handleOpenHistoryWithFilter = useCallback((statusBucketKey) => {
    setHistoryStatuses([statusBucketKey]);
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryCostMin('');
    setHistoryCostMax('');
    setHistorySearch('');
    setHomeTab('history');
  }, []);

  // Persona pill - localStorage only, reorders Explore + chip pool.
  const [persona, setPersona] = useState(() => {
    try {
      return localStorage.getItem('orch_home_persona') || '';
    } catch {
      return '';
    }
  });
  const updatePersona = useCallback((next) => {
    setPersona(next);
    try {
      localStorage.setItem('orch_home_persona', next);
    } catch {
      /* private */
    }
  }, []);
  // Get Started guide dialog (lazy-mounted).
  const [guideOpen, setGuideOpen] = useState(false);
  // Per-block visibility + order, controlled from the "View options"
  // popover. Stored as JSON in localStorage so choices survive
  // page reloads.
  const [hiddenBlocks, setHiddenBlocks] = useState(() => {
    try {
      const raw = localStorage.getItem('orch_simple_home_hidden_blocks');
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  const [blockOrder, setBlockOrder] = useState(() => {
    try {
      const raw = localStorage.getItem('orch_simple_home_block_order');
      if (!raw) return SIMPLE_HOME_SORTABLE_KEYS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return SIMPLE_HOME_SORTABLE_KEYS;
      // Drop unknown keys (renamed/removed blocks) and append any
      // newly-added keys at the end so the catalogue stays in sync.
      const known = new Set(SIMPLE_HOME_SORTABLE_KEYS);
      const filtered = parsed.filter((k) => known.has(k));
      const missing = SIMPLE_HOME_SORTABLE_KEYS.filter((k) => !filtered.includes(k));
      return [...filtered, ...missing];
    } catch {
      return SIMPLE_HOME_SORTABLE_KEYS;
    }
  });
  const persistHiddenBlocks = useCallback((next) => {
    try {
      localStorage.setItem('orch_simple_home_hidden_blocks', JSON.stringify([...next]));
    } catch {
      /* private mode */
    }
  }, []);
  const persistBlockOrder = useCallback((next) => {
    try {
      localStorage.setItem('orch_simple_home_block_order', JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }, []);
  const toggleBlock = useCallback(
    (key) => {
      setHiddenBlocks((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        persistHiddenBlocks(next);
        return next;
      });
    },
    [persistHiddenBlocks]
  );
  const showAllBlocks = useCallback(() => {
    setHiddenBlocks(() => {
      const next = new Set();
      persistHiddenBlocks(next);
      return next;
    });
  }, [persistHiddenBlocks]);
  const hideAllBlocks = useCallback(() => {
    setHiddenBlocks(() => {
      const next = new Set([SIMPLE_HOME_HERO.key, ...SIMPLE_HOME_SORTABLE_KEYS]);
      persistHiddenBlocks(next);
      return next;
    });
  }, [persistHiddenBlocks]);
  const reorderBlocks = useCallback(
    (nextOrder) => {
      setBlockOrder(nextOrder);
      persistBlockOrder(nextOrder);
    },
    [persistBlockOrder]
  );
  const resetLayout = useCallback(() => {
    setBlockOrder(SIMPLE_HOME_SORTABLE_KEYS);
    setHiddenBlocks(new Set());
    persistBlockOrder(SIMPLE_HOME_SORTABLE_KEYS);
    persistHiddenBlocks(new Set());
  }, [persistBlockOrder, persistHiddenBlocks]);
  const heroHidden = hiddenBlocks.has(SIMPLE_HOME_HERO.key);
  const blockOrderIndex = useMemo(() => {
    const map = {};
    blockOrder.forEach((key, i) => {
      map[key] = i;
    });
    return map;
  }, [blockOrder]);

  const allBlockKeys = [SIMPLE_HOME_HERO.key, ...blockOrder];
  const hiddenCount = allBlockKeys.reduce((n, k) => n + (hiddenBlocks.has(k) ? 1 : 0), 0);
  const totalBlockCount = allBlockKeys.length;

  const metricsSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleMetricsDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !blockOrder) return;
    const oldIndex = blockOrder.indexOf(active.id);
    const newIndex = blockOrder.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderBlocks(arrayMove(blockOrder, oldIndex, newIndex));
  };
  // Auto-hide the onboarding blocks (Get started + Guide) after the
  // user creates their first goal. Runs once per browser, gated by a
  // localStorage flag so users can still manually re-show them via
  // the View options popover without the auto-hide firing again.
  const onboardingAutohideRef = useRef(false);
  useEffect(() => {
    if (onboardingAutohideRef.current) return;
    if (!goals || goals.length === 0) return;
    let alreadyDone = false;
    try {
      alreadyDone = localStorage.getItem('orch_simple_home_onboarding_autohidden') === 'true';
    } catch {
      /* private mode */
    }
    if (alreadyDone) {
      onboardingAutohideRef.current = true;
      return;
    }
    onboardingAutohideRef.current = true;
    setHiddenBlocks((prev) => {
      const next = new Set(prev);
      next.add('getStarted');
      next.add('guide');
      try {
        localStorage.setItem('orch_simple_home_hidden_blocks', JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });
    try {
      localStorage.setItem('orch_simple_home_onboarding_autohidden', 'true');
    } catch {
      /* private mode */
    }
  }, [goals]);
  // Toast for toggle flips + future feedback surfaces.
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const showToast = useCallback((message, severity = 'info') => {
    setToast({ open: true, message, severity });
  }, []);
  const fetchGoals = useCallback(async () => {
    try {
      const data = await listGoals();
      const next = Array.isArray(data) ? data : [];
      // Skip the state update (and the whole re-render cascade) when the
      // fetched data is structurally identical to what we already have.
      // Without this, every 10s poll causes a full dashboard re-render
      // even when nothing actually changed.
      setGoals((prev) => {
        if (prev.length !== next.length) return next;
        const same = prev.every((p, i) => {
          const n = next[i];
          return (
            n &&
            p.id === n.id &&
            p.status === n.status &&
            p.spent_usd === n.spent_usd &&
            p.updated_at === n.updated_at
          );
        });
        return same ? prev : next;
      });
    } catch {
      // Keep previous data if refresh fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Mirror goals into a ref so the polling interval can read the latest
  // state without being torn down + recreated every fetch.
  const goalsRef = useRef(goals);
  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  // Single interval (set once on mount). Fires every 10s and only triggers
  // a fetch when there's an in-flight goal - checked via the ref so the
  // effect itself doesn't need `goals` in its deps.
  useEffect(() => {
    const id = setInterval(() => {
      const hasLive = goalsRef.current.some((g) => IN_FLIGHT_STATUSES.includes(g.status));
      if (hasLive) fetchGoals();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchGoals]);

  // ── Derived metrics ────────────────────────────────────────
  const metrics = useMemo(() => {
    const inFlight = goals.filter((g) => IN_FLIGHT_STATUSES.includes(g.status));
    const attention = goals.filter((g) => ATTENTION_STATUSES.includes(g.status));
    const completed = goals.filter((g) => g.status === 'completed');
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const completedThisWeek = completed.filter((g) => {
      const t = g.data?.completed_at || g.updated_at;
      return t && new Date(t).getTime() >= weekAgo;
    }).length;
    const totalSpent = goals.reduce((s, g) => s + Number(g.spent_usd || 0), 0);
    const totalBudget = goals.reduce((s, g) => s + Number(g.budget_usd || 0), 0);
    const totalGoals = goals.length;
    const successRate = totalGoals > 0 ? Math.round((completed.length / totalGoals) * 100) : null;

    // Activity in last 24h - count goals whose state changed recently
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const activity24h = goals.filter((g) => {
      const t = g.updated_at || g.created_at;
      return t && new Date(t).getTime() >= dayAgo;
    }).length;

    // Stage breakdown for the "in flight" sublabel
    const stageBreakdown = inFlight.reduce((acc, g) => {
      acc[g.status] = (acc[g.status] || 0) + 1;
      return acc;
    }, {});
    const stageSummary = Object.entries(stageBreakdown)
      .map(([s, n]) => `${n} ${STATUS_LABEL[s]?.toLowerCase() || s}`)
      .slice(0, 2)
      .join(', ');

    return {
      inFlight,
      attention,
      completed,
      completedThisWeek,
      totalSpent,
      totalBudget,
      totalGoals,
      successRate,
      stageSummary,
      activity24h,
    };
  }, [goals]);

  const recentCompleted = useMemo(
    () =>
      metrics.completed
        .slice()
        .sort((a, b) => {
          const ta = new Date(a.data?.completed_at || a.updated_at || 0).getTime();
          const tb = new Date(b.data?.completed_at || b.updated_at || 0).getTime();
          return tb - ta;
        })
        .slice(0, 4),
    [metrics.completed]
  );

  const firstName = (user?.displayName || user?.email || '').split(/[\s@]/)[0] || 'there';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const heroSubtitle = (() => {
    const parts = [];
    if (metrics.inFlight.length > 0) parts.push(`${metrics.inFlight.length} in flight`);
    if (metrics.attention.length > 0)
      parts.push(
        `${metrics.attention.length} need${metrics.attention.length === 1 ? 's' : ''} attention`
      );
    if (metrics.completedThisWeek > 0)
      parts.push(`${metrics.completedThisWeek} completed this week`);
    if (parts.length === 0) return 'No active goals. Create your first request below.';
    return parts.join(' · ');
  })();

  const budgetPct =
    metrics.totalBudget > 0 ? Math.round((metrics.totalSpent / metrics.totalBudget) * 100) : 0;

  // LLM usage for the Spent tile: total tokens spent + a per-model $ breakdown.
  const { data: llmUsage } = useLlmUsage('all');
  const fmtUsd = (v) => {
    const n = Number(v || 0);
    return n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
  };
  const spentTokens = formatTokensOrZero(llmUsage?.totals?.tokens);
  const spentCost = Number(llmUsage?.totals?.cost || 0);
  const spentBreakdown = (llmUsage?.byModel || [])
    .slice()
    .sort((a, b) => Number(b.cost || 0) - Number(a.cost || 0))
    .filter((m) => Number(m.cost || 0) > 0)
    .slice(0, 3)
    .map((m) => ({ label: m.model || m.provider || 'model', value: fmtUsd(m.cost) }));

  // Goal detail dialog - clicking a goal row in In-flight, Attention,
  // or Recently-completed opens the full goal detail inline instead of
  // redirecting to /job-pool.
  const [detailGoalId, setDetailGoalId] = useState(null);
  const goToGoal = (id) => setDetailGoalId(id);

  const [assistantSession, setAssistantSession] = useState(0);
  const startNewAssistantChat = useCallback(() => {
    setResumeConversation(null);
    setAssistantHasChat(false);
    setAssistantSession((n) => n + 1);
  }, []);

  const assistantSurfaceActive =
    activeCategory === 'assistant' && (!!assistantConfig?.activated || !!resumeConversation);
  const [assistantMounted, setAssistantMounted] = useState(false);
  useEffect(() => {
    if (assistantSurfaceActive) setAssistantMounted(true);
  }, [assistantSurfaceActive]);

  usePublishAssistantConversation(
    assistantSurfaceActive && assistantHasChat,
    startNewAssistantChat
  );

  // The hero sits above the tabs, so a row opened down in History would
  // otherwise change a surface the user cannot see. This used to scroll the
  // window only, which is the scroller on a phone and not on a desktop - so the
  // same tap worked on one and looked dead on the other.
  const scrollHeroIntoView = scrollAppShellToTop;

  // Reopen a past goal as the thread it was created in, so it can be picked up
  // and carried on rather than only read. The details dialog is still one tap
  // away from the row it came from.
  const resumeGoal = (id) => {
    if (!id) return;
    setResumeConversation(null);
    setActiveCategory('goal');
    setGoalThread({ goalId: id });
    setOpenGoalId(id);
    scrollHeroIntoView();
  };

  // Reopen a past assistant conversation. The row already carries the messages
  // the history list grouped, so the thread paints immediately; the fetch behind
  // it fills in anything the flat 300-message window cut off.
  const resumeConversationFromHistory = (conversation) => {
    if (!conversation?.id) return;
    setGoalThread(null);
    clearOpenGoalId();
    setActiveCategory('assistant');
    setResumeConversation({
      id: conversation.id,
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    });
    scrollHeroIntoView();
    getConversationMessages(conversation.id)
      .then((rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        setResumeConversation((prev) => {
          // Only top up the conversation still on screen, and only when the
          // server actually knows more than the row did.
          if (prev?.id !== conversation.id) return prev;
          if (rows.length <= (prev.messages?.length || 0)) return prev;
          return { id: conversation.id, messages: rows };
        });
      })
      .catch(() => {
        /* the seeded rows are already on screen */
      });
  };

  const [composerWriting, setComposerWriting] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);

  // Leaving Writing (blur + empty) must also collapse the expanded canvas,
  // otherwise the chrome returns but the composer stays at the tall size.
  useEffect(() => {
    if (!composerWriting && composerExpanded) {
      setComposerExpanded(false);
    }
  }, [composerWriting, composerExpanded]);

  const heroTagline = 'Unify your goals into one organisation.';
  // While the composer is focused the caption above becomes the active
  // typewriter (cycling the same suggestion pool). When the composer is
  // idle this hook is paused and the caption shows the static tagline.
  const { text: captionTypedText, fade: captionFade } = useTypewriterLoop(HERO_PROMPT_SUGGESTIONS, {
    paused: !composerWriting,
  });

  if (loading && goals.length === 0) return <LoadingSpinner message="Loading your home..." />;

  const scrollToOverview = () => {
    document
      .getElementById('simple-home-overview')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Time-of-day slot drives the starter chip pool.
  const hour = new Date().getHours();
  const slot = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  const submitPrompt = (text, files = []) => {
    const trimmed = (text || '').trim();
    if (!trimmed && files.length === 0) return;
    if (activeCategory === 'goal') {
      // Grow the goal where it was typed. Dropping a modal over the hero the
      // user is already looking at was the jarring part; the Assistant pill
      // has always rendered inline, and Goal now does the same.
      clearOpenGoalId();
      setGoalThread({ prompt: trimmed, files });
    } else {
      handleSendDashboardChat(trimmed, files);
    }
  };

  // Open an entity from an assistant chat block, or one an approved action just
  // created (see assistantEntityTarget for why a goal is a dialog, not a route).
  function handleAssistantOpenEntity(payload) {
    const target = assistantEntityTarget(payload);
    if (!target) return;
    if (target.kind === 'goal') {
      goToGoal(target.id);
      fetchGoals();
      return;
    }
    navigate(target.route);
  }

  // True whenever the hero is showing a conversation rather than a landing
  // composer: the assistant chat, or a goal being formed and run.
  const heroSurfaceWide = (assistantSurfaceActive && assistantHasChat) || Boolean(goalThread);
  const composerDocked = isCompactShell && typing;
  // Exactly the space the shell leaves, so the thread scrolls inside it rather
  // than growing the page and taking the composer below the fold.
  const goalSurfaceHeightSx = goalSurfaceHeight(
    composerDocked ? { bottomClearance: TYPING_CLEARANCE_PX } : undefined
  );

  // A running goal is the whole screen, not a card floating in the middle of
  // one. The empty hero stays centred - an orb and a composer want air around
  // them - but once the thread is live the centring is what pushed it away
  // from the header and left a band of nothing above the dock.
  const goalSurfaceActive = Boolean(goalThread) && activeCategory === 'goal';
  const chatSurfaceActive = goalSurfaceActive || (assistantSurfaceActive && assistantHasChat);
  const surfaceFills = chatSurfaceActive || composerDocked;
  const auxiliaryChatActive =
    activeCategory !== 'goal' &&
    activeCategory !== 'assistant' &&
    (dashboardChatLoading || dashboardChats[activeCategory]?.length > 0);
  const overviewChevronVisible = shouldShowOverviewChevron({
    // A goal keeps running while another category is selected, so do not put a
    // landing-page cue over that in-progress session either.
    hasRunningGoal: Boolean(goalThread),
    hasActiveChat: (assistantSurfaceActive && assistantHasChat) || auxiliaryChatActive,
    hasDraft: composerWriting,
    textEntryFocused: typing,
  });

  // The four category pills (Assistant/Goal/Consilium/Team). Rendered as the
  // composer's top slot normally, and as the chat input's top slot (like the
  // Goal card) when the Assistant surface is embedded.
  // The orb, its halo and its size in one node so the Goal tab and the
  // Assistant tab cannot render subtly different orbs in the same slot.
  const heroOrb = (
    <Box
      sx={{
        position: 'relative',
        overflow: 'visible',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: heroOrbSize * 1.65,
          height: heroOrbSize * 1.65,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.12)} 0%, transparent 72%)`,
          pointerEvents: 'none',
          zIndex: -1,
        },
      }}
    >
      <AiOrb state="idle" size={heroOrbSize} />
    </Box>
  );

  const categoryPills = (
    <>
      {/* Assistant Pill */}
      <Button
        size="small"
        onClick={() => {
          if (!assistantConfig?.activated) {
            setAssistantDialogOpen(true);
          } else {
            setActiveCategory('assistant');
          }
        }}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 999,
          px: { xs: 1, sm: 1.25 },
          py: 0,
          minHeight: { xs: 30, sm: 28 },
          lineHeight: 1.2,
          fontSize: { xs: '0.74rem', sm: '0.78rem' },
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          border: '1.5px solid',
          ...(activeCategory === 'assistant'
            ? {
                borderColor: theme.palette.primary.main,
                background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.18)}, ${alpha(theme.palette.primary.main, 0.04)})`,
                color: theme.palette.primary.main,
                boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.3)}`,
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.25)}, ${alpha(theme.palette.primary.main, 0.08)})`,
                  boxShadow: `0 0 16px ${alpha(theme.palette.primary.main, 0.4)}`,
                },
              }
            : assistantConfig?.activated
              ? {
                  borderColor: alpha(theme.palette.text.primary, 0.18),
                  background: `linear-gradient(180deg, ${alpha('#ffffff', isDark ? 0.05 : 0.45)}, ${alpha('#ffffff', isDark ? 0.01 : 0.15)})`,
                  color: theme.palette.text.primary,
                  boxShadow: 'none',
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.08)}, ${alpha(theme.palette.primary.main, 0.02)})`,
                    color: theme.palette.primary.main,
                  },
                }
              : {
                  borderColor: alpha(theme.palette.text.primary, 0.1),
                  borderStyle: 'dashed',
                  background: 'transparent',
                  color: theme.palette.text.disabled,
                  boxShadow: 'none',
                  '&:hover': {
                    borderColor: alpha(theme.palette.text.primary, 0.25),
                    background: alpha(theme.palette.text.primary, 0.03),
                    color: theme.palette.text.secondary,
                  },
                }),
        }}
      >
        Assistant
      </Button>

      {/* Goal Pill */}
      <Button
        size="small"
        onClick={() => setActiveCategory('goal')}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 999,
          px: { xs: 1, sm: 1.25 },
          py: 0,
          minHeight: { xs: 30, sm: 28 },
          lineHeight: 1.2,
          fontSize: { xs: '0.74rem', sm: '0.78rem' },
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          border: '1.5px solid',
          ...(activeCategory === 'goal'
            ? {
                borderColor: theme.palette.primary.main,
                background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.18)}, ${alpha(theme.palette.primary.main, 0.04)})`,
                color: theme.palette.primary.main,
                boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.3)}`,
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.25)}, ${alpha(theme.palette.primary.main, 0.08)})`,
                  boxShadow: `0 0 16px ${alpha(theme.palette.primary.main, 0.4)}`,
                },
              }
            : {
                borderColor: alpha(theme.palette.text.primary, 0.18),
                background: `linear-gradient(180deg, ${alpha('#ffffff', isDark ? 0.05 : 0.45)}, ${alpha('#ffffff', isDark ? 0.01 : 0.15)})`,
                color: theme.palette.text.primary,
                boxShadow: 'none',
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.08)}, ${alpha(theme.palette.primary.main, 0.02)})`,
                  color: theme.palette.primary.main,
                },
              }),
        }}
      >
        Goal
      </Button>
    </>
  );

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', overflowX: 'clip', boxSizing: 'border-box' }}>
      {/* ── FULL-SCREEN ORB HERO ── */}
      {!heroHidden && (
        <Box
          data-tour-block="dashboard-hero"
          data-tour-label="Command bar"
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            // A live conversation is bounded to the shell and scrolls internally.
            ...(chatSurfaceActive
              ? { height: goalSurfaceHeightSx, minHeight: 0 }
              : composerDocked
                ? { height: heroMinHeight(), minHeight: 0 }
                : { minHeight: heroMinHeight() }),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: surfaceFills ? 'flex-start' : 'center',
            textAlign: 'center',
            px: { xs: 2, sm: 3 },
            pt: chatSurfaceActive ? { xs: 0.5, sm: 0.5 } : { xs: 2, sm: 3 },
            // The dock is fixed 18px off the bottom and stands 84px tall, so
            // 13/14 spacing units clear it with a hair to spare. The hero's
            // 18/20 was sized for a composer that had to look deliberately
            // suspended; a thread only has to stop above the dock.
            // No bottom padding for a live thread: <main> already reserves
            // the dock's height, and padding it twice was the gap under the
            // composer.
            pb: chatSurfaceActive ? 0 : composerDocked ? { xs: 1.5, sm: 2 } : { xs: 18, sm: 20 },
            overflowX: 'clip',
            touchAction: 'pan-y',
            transition:
              'padding-top 320ms cubic-bezier(.22,1,.36,1), padding-bottom 320ms cubic-bezier(.22,1,.36,1), justify-content 320ms cubic-bezier(.22,1,.36,1)',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            // Shared entrance keyframe used by the hero greeting/subtitle and by
            // both the Goal and Assistant surfaces. Defined here (always rendered)
            // so it survives regardless of which surface is mounted.
            '@keyframes simpleHomeFadeUp': {
              from: { opacity: 0, transform: 'translateY(14px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {/* Hero content (orb, greeting, subtitle) is rendered inside the
              surface below - the Goal surface, or the AssistantSurface for the
              Assistant tab - so both tabs share one layout. */}

          {/* Prompt input + below-input meta. */}
          <Box
            sx={{
              width: '100%',
              // The empty hero is a composer under an orb, and 480px keeps that
              // deliberate. The moment it holds a conversation it is a chat
              // app, and a chat app on a 27in monitor should not be a 480px
              // ribbon down the middle. Both the assistant and a running goal
              // take the full reading width.
              maxWidth: composerExpanded
                ? { xs: '100%', sm: 'min(900px, calc(100% - 32px))' }
                : heroSurfaceWide
                  ? { xs: '100%', sm: 'min(1180px, calc(100% - 48px))' }
                  : { xs: '100%', sm: HERO_COMPOSER_MAX_WIDTH },
              px: { xs: 0, sm: 0 },
              boxSizing: 'border-box',
              // Height has to pass through this wrapper, or the surface inside
              // it has nothing to fill and falls back to its own fixed box.
              ...(surfaceFills
                ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
                : {}),
              transition: 'max-width 320ms cubic-bezier(.22,1,.36,1)',
              position: 'relative',
              zIndex: 1,
              animation: 'simpleHomeFadeUp 700ms 400ms both cubic-bezier(.22,1,.36,1)',
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
                transition: 'none',
              },
            }}
          >
            {shouldRenderAssistantSurface({ assistantMounted, assistantSurfaceActive }) && (
              <HeroPromptInput
                hidden={!assistantSurfaceActive}
                onSubmit={submitPrompt}
                onOpenVoice={() => openVoiceCommand()}
                onActiveChange={setComposerWriting}
                expanded={composerExpanded}
                onToggleExpand={() => setComposerExpanded((v) => !v)}
                bodyOverride={
                  <Box
                    sx={{
                      // Empty: identical to the Goal surface's box below. A live
                      // conversation fills the bounded shell instead.
                      ...(surfaceFills
                        ? { flex: 1, minHeight: 0 }
                        : { height: { xs: '70dvh', md: '72dvh' }, minHeight: 420 }),
                      width: '100%',
                      mt: 1,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <AssistantSurface
                      key={resumeConversation?.id || `new-${assistantSession}`}
                      conversationId={resumeConversation?.id || null}
                      initialMessages={resumeConversation?.messages || null}
                      variant="full"
                      greetingName={firstName}
                      onOpenEntity={handleAssistantOpenEntity}
                      pageContext={{ route: '/' }}
                      inputTopSlot={categoryPills}
                      onHasChatChange={setAssistantHasChat}
                      suggestions={[]}
                      emptyOrb={heroOrb}
                      emptyTitle={
                        <Typography
                          variant="h4"
                          sx={{
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                            mb: 0.5,
                            fontSize: { xs: '1.35rem', sm: '1.85rem', md: '2.15rem' },
                            // Line 1 of the staggered intro (see emptySubtitle).
                            animation:
                              'simpleHomeFadeUp 700ms 150ms both cubic-bezier(.22,1,.36,1)',
                            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                          }}
                        >
                          {greeting}, {firstName}
                        </Typography>
                      }
                      emptySubtitle={
                        // The greeting reveals line by line: title (150ms),
                        // then each caption staggered 200ms apart, reusing the
                        // shared simpleHomeFadeUp fade-and-rise keyframe.
                        <Box sx={{ mb: 2 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              color: 'text.secondary',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              lineHeight: 1.4,
                              animation:
                                'simpleHomeFadeUp 700ms 350ms both cubic-bezier(.22,1,.36,1)',
                              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                            }}
                          >
                            Let's get to know each other.
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              color: 'primary.main',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              lineHeight: 1.4,
                              animation:
                                'simpleHomeFadeUp 700ms 550ms both cubic-bezier(.22,1,.36,1)',
                              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                            }}
                          >
                            I'll guide you through the platform.
                          </Typography>
                        </Box>
                      }
                    />
                  </Box>
                }
                topSlot={null}
              />
            )}
            {assistantSurfaceActive ? null : goalThread && activeCategory === 'goal' ? (
              // A goal in progress takes the same box the orb had. Same height,
              // same width, same pills: the surface does not jump, the thread
              // simply grows where the greeting was.
              <Box
                data-testid="goal-surface"
                sx={{
                  // Fills what the surface leaves between the header and the
                  // dock. It used to be a fixed 72vh box centred in the page,
                  // which on a tall monitor meant a gap above the first message
                  // and a wider one under the composer. The thread scrolls
                  // internally, so there is nothing to gain from reserving less
                  // than the screen actually has.
                  flex: 1,
                  // Deliberately 0, not a floor. A minimum taller than the
                  // space available would overflow the surface again and put
                  // the composer back below the fold.
                  minHeight: 0,
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* No orb here. It was kept as a shrunken presence to tie the
                    running goal back to the screen it was typed on, but the
                    thread already does that - the greeting and the request are
                    both still in it - and the orb only pushed the conversation
                    down for a second identity badge nobody needed. */}
                <SmartRequestDialog
                  variant="inline"
                  open
                  goalId={goalThread.goalId || null}
                  initialPrompt={goalThread.prompt}
                  initialFiles={goalThread.files}
                  composerTopSlot={categoryPills}
                  onOpenEntity={handleAssistantOpenEntity}
                  onClose={() => {
                    clearOpenGoalId();
                    setGoalThread(null);
                  }}
                  // The detail popup, over the thread - not the routed page.
                  // Navigating away unmounted the conversation the user was
                  // reading, and coming back meant finding the goal in History
                  // again. goToGoal mounts GoalDetailDialog on top instead.
                  onOpenGoal={goToGoal}
                  // The id only exists once the goal row does. Catching it here
                  // is what makes a run typed on this screen survive a trip to
                  // another page.
                  onSubmit={(payload) => {
                    if (payload?.goal?.id) setOpenGoalId(payload.goal.id);
                    fetchGoals();
                  }}
                />
              </Box>
            ) : (
              // Non-Assistant modes (Goal/Consilium/Team) render through a surface
              // that MIRRORS the Assistant surface above (same box, floating orb,
              // greeting/subtitle, composer at the bottom) so switching tabs does
              // not move the orb or the input block.
              <Box
                sx={{
                  ...(surfaceFills
                    ? { flex: 1, minHeight: 0 }
                    : { height: { xs: '70dvh', md: '72dvh' }, minHeight: 420 }),
                  width: '100%',
                  mt: 1,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Floating orb - the same node the Assistant tab gets. */}
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 0,
                  }}
                >
                  {heroOrb}
                </Box>
                {/* Greeting + subtitle - same position as the Assistant empty state. */}
                <Box sx={{ textAlign: 'center', pt: 1, px: 2 }}>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      mb: 0.5,
                      fontSize: { xs: '1.35rem', sm: '1.85rem', md: '2.15rem' },
                      animation: 'simpleHomeFadeUp 700ms 150ms both cubic-bezier(.22,1,.36,1)',
                      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                    }}
                  >
                    {greeting}, {firstName}
                  </Typography>
                  <Box
                    sx={{ mb: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      Type what you want. Agents build it.
                    </Typography>
                    <Typography
                      variant="caption"
                      aria-live={composerWriting ? 'polite' : undefined}
                      sx={{
                        color: 'primary.main',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        lineHeight: 1.4,
                        opacity: composerWriting ? captionFade : 1,
                        transition: 'opacity 360ms ease',
                        textAlign: 'center',
                        overflowWrap: 'anywhere',
                        maxWidth: '100%',
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    >
                      {composerWriting ? captionTypedText || ' ' : heroTagline}
                    </Typography>
                  </Box>
                </Box>
                {/* Compact composer at the bottom - same slot as the Assistant composer. */}
                <HeroPromptInput
                  onSubmit={submitPrompt}
                  onOpenVoice={() => openVoiceCommand()}
                  onActiveChange={setComposerWriting}
                  expanded={composerExpanded}
                  onToggleExpand={() => setComposerExpanded((v) => !v)}
                  topSlot={categoryPills}
                  // Only Goal: the other categories in this branch do not create
                  // a goal, so a goal's setup would have nothing to apply to.
                  onOpenSetup={activeCategory === 'goal' ? () => setGoalSetupOpen(true) : null}
                  setupScoped={isScopedExecutorTarget(goalSetup.target)}
                />
                <GoalSetupDrawer
                  open={goalSetupOpen}
                  onClose={() => setGoalSetupOpen(false)}
                  onOpenEntity={handleAssistantOpenEntity}
                />
              </Box>
            )}

            {/* Sub-selectors (Dropdown actions / configuration gear) */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                mt: 1.5,
                flexWrap: 'wrap',
              }}
            >
              {/* Assistant model/config lives in the embedded AssistantSurface's own
                  context drawer now, so no separate Configure chip is needed here. */}

              {activeCategory === 'consilium' && selectedBoard && (
                <Chip
                  label={`Board: ${selectedBoard.name}`}
                  size="small"
                  onClick={(e) => setBoardMenuAnchor(e.currentTarget)}
                  onDelete={() => setSelectedBoard(null)}
                  variant="outlined"
                  sx={{
                    borderRadius: 999,
                    borderColor: alpha(theme.palette.primary.main, 0.35),
                    color: theme.palette.primary.main,
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    transition: 'all 0.2s',
                    bgcolor: alpha(theme.palette.primary.main, 0.03),
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      borderColor: theme.palette.primary.main,
                    },
                    '& .MuiChip-deleteIcon': {
                      color: alpha(theme.palette.primary.main, 0.6),
                      transition: 'color 0.2s',
                      '&:hover': { color: theme.palette.primary.main },
                    },
                  }}
                />
              )}

              {activeCategory === 'team' && selectedTeam && (
                <Chip
                  label={`Team: ${selectedTeam.name}`}
                  size="small"
                  onClick={(e) => setTeamMenuAnchor(e.currentTarget)}
                  onDelete={() => setSelectedTeam(null)}
                  variant="outlined"
                  sx={{
                    borderRadius: 999,
                    borderColor: alpha(theme.palette.primary.main, 0.35),
                    color: theme.palette.primary.main,
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    transition: 'all 0.2s',
                    bgcolor: alpha(theme.palette.primary.main, 0.03),
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      borderColor: theme.palette.primary.main,
                    },
                    '& .MuiChip-deleteIcon': {
                      color: alpha(theme.palette.primary.main, 0.6),
                      transition: 'color 0.2s',
                      '&:hover': { color: theme.palette.primary.main },
                    },
                  }}
                />
              )}
            </Box>

            {/* Boards dropdown menu */}
            <Menu
              anchorEl={boardMenuAnchor}
              open={Boolean(boardMenuAnchor)}
              onClose={() => setBoardMenuAnchor(null)}
              slotProps={{
                paper: {
                  sx: { minWidth: 180, bgcolor: 'background.paper', backgroundImage: 'none' },
                },
              }}
            >
              {concilium?.map((b) => (
                <MenuItem
                  key={b.id}
                  selected={selectedBoard?.id === b.id}
                  onClick={() => {
                    setSelectedBoard(b);
                    setActiveCategory('consilium');
                    setBoardMenuAnchor(null);
                  }}
                >
                  {b.name}
                </MenuItem>
              ))}
            </Menu>

            {/* Teams dropdown menu */}
            <Menu
              anchorEl={teamMenuAnchor}
              open={Boolean(teamMenuAnchor)}
              onClose={() => setTeamMenuAnchor(null)}
              slotProps={{
                paper: {
                  sx: { minWidth: 180, bgcolor: 'background.paper', backgroundImage: 'none' },
                },
              }}
            >
              {teams?.map((t) => (
                <MenuItem
                  key={t.id}
                  selected={selectedTeam?.id === t.id}
                  onClick={() => {
                    setSelectedTeam(t);
                    setActiveCategory('team');
                    setTeamMenuAnchor(null);
                  }}
                >
                  {t.name}
                </MenuItem>
              ))}
            </Menu>

            {/* Chat history stream for Consilium and Team. Assistant now uses the
                embedded AssistantSurface (its own thread), so it is excluded here. */}
            {activeCategory !== 'goal' &&
              activeCategory !== 'assistant' &&
              dashboardChats[activeCategory]?.length > 0 && (
                <Paper
                  elevation={0}
                  sx={{
                    mt: 3,
                    p: 2,
                    borderRadius: 4,
                    bgcolor: isDark
                      ? alpha(theme.palette.background.paper, 0.4)
                      : alpha(theme.palette.background.paper, 0.7),
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.5),
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    textAlign: 'left',
                  }}
                >
                  {dashboardChats[activeCategory].map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    return (
                      <Box
                        key={idx}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isUser ? 'flex-end' : 'flex-start',
                          width: '100%',
                        }}
                      >
                        <Box
                          sx={{
                            maxWidth: '85%',
                            p: 1.5,
                            borderRadius: 3,
                            bgcolor: isUser
                              ? alpha(theme.palette.primary.main, 0.15)
                              : alpha(theme.palette.text.primary, 0.04),
                            border: '1px solid',
                            borderColor: isUser
                              ? alpha(theme.palette.primary.main, 0.3)
                              : alpha(theme.palette.divider, 0.6),
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'text.primary' }}
                          >
                            {msg.content}
                          </Typography>
                          {msg.files && msg.files.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                              {msg.files.map((f) => (
                                <Chip
                                  key={f.id}
                                  icon={<AttachFileRoundedIcon sx={{ fontSize: 14 }} />}
                                  label={`${f.name} (${formatFileSize(f.size)})`}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    height: 22,
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    borderColor: alpha(theme.palette.primary.main, 0.25),
                                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                                    '& .MuiChip-icon': { ml: 0.5 },
                                  }}
                                />
                              ))}
                            </Box>
                          )}
                        </Box>

                        {/* Matched goals list */}
                        {!isUser && msg.matchedGoals && msg.matchedGoals.length > 0 && (
                          <Box
                            sx={{
                              mt: 1,
                              width: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 1,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ color: '#00e676', fontWeight: 700, ml: 1 }}
                            >
                              Matched Requests:
                            </Typography>
                            {msg.matchedGoals.map((g) => (
                              <Paper
                                key={g.id}
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  borderRadius: 2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 2,
                                  bgcolor: isDark
                                    ? alpha(theme.palette.background.paper, 0.2)
                                    : '#fff',
                                  borderColor: alpha(theme.palette.divider, 0.8),
                                }}
                              >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="subtitle2"
                                    sx={{
                                      fontWeight: 700,
                                      noWrap: true,
                                      textOverflow: 'ellipsis',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {g.title}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                      display: 'block',
                                      noWrap: true,
                                      textOverflow: 'ellipsis',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {g.description}
                                  </Typography>
                                </Box>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    flexShrink: 0,
                                  }}
                                >
                                  <Chip
                                    size="small"
                                    label={g.status}
                                    color={
                                      g.status === 'completed'
                                        ? 'success'
                                        : g.status === 'failed'
                                          ? 'error'
                                          : 'primary'
                                    }
                                    variant="outlined"
                                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                                  />
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => goToGoal(g.id)}
                                    sx={{
                                      textTransform: 'none',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      borderRadius: 1.5,
                                      minWidth: 70,
                                      height: 26,
                                    }}
                                  >
                                    Preview
                                  </Button>
                                </Box>
                              </Paper>
                            ))}
                          </Box>
                        )}

                        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, px: 1 }}>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                      </Box>
                    );
                  })}

                  {dashboardChatLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="caption" color="text.secondary">
                        {activeCategory === 'assistant'
                          ? 'Assistant is thinking...'
                          : activeCategory === 'consilium'
                            ? 'Consilium is compiling perspectives...'
                            : 'Team lead is generating insights...'}
                      </Typography>
                    </Box>
                  )}
                </Paper>
              )}
          </Box>

          {/* The cue lives in the empty hero's dock-clearance lane. Removing it
              for every live/draft surface keeps it from overlaying a composer
              while still making the overview below the fold discoverable. */}
          {overviewChevronVisible && (
            <IconButton
              aria-label="Scroll for overview"
              onClick={scrollToOverview}
              size="small"
              sx={{
                position: 'absolute',
                bottom: { xs: 108, sm: 120 },
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'text.secondary',
                opacity: 0.7,
                animation: 'simpleHomeFadeUp 900ms 900ms both ease-out',
                '&:hover': { opacity: 1, bgcolor: 'transparent' },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              <Box
                sx={{
                  display: 'inline-flex',
                  animation: 'simpleHomeBob 1.8s ease-in-out infinite',
                  '@keyframes simpleHomeBob': {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(4px)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              >
                <GlassIcon
                  name="KeyboardArrowDown"
                  fallback={KeyboardArrowDownIcon}
                  size={24}
                  tone="neutral"
                />
              </Box>
            </IconButton>
          )}
        </Box>
      )}
      {/* ── BELOW THE FOLD ── */}
      <Box id="simple-home-overview" className="mkt-landing mkt-landing--home" data-compact="1">
        <div className="mkt-landing__inner" style={{ paddingBottom: 'max(80px, 4rem)' }}>
          {/* Home / History tabs. Home tab = clean hero-only screen. History tab
          reveals recent goals, KPI dashboard, and the onboarding widgets. */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              justifyContent: 'center',
              gap: { xs: 1, sm: 0 },
              mt: { xs: 1, sm: 1.5 },
              mb: { xs: 2, sm: 2.5 },
              position: 'relative',
            }}
          >
            <Tabs
              value={homeTab}
              onChange={(_, v) => setHomeTab(v)}
              aria-label="Home view tabs"
              sx={{
                minHeight: 40,
                '& .MuiTab-root': {
                  minHeight: 40,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  px: 3,
                },
                '& .MuiTabs-indicator': { height: 3, borderRadius: 1.5 },
              }}
            >
              <Tab value="metrics" label="Metrics" />
              <Tab value="history" label="History" />
            </Tabs>
          </Box>

          {homeTab === 'metrics' &&
            (metricsOverride || (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
                  <Tooltip title="Block Visibility Management" arrow>
                    <IconButton
                      size="small"
                      onClick={() => setMetricsSettingsOpen(true)}
                      aria-label="Manage block visibility"
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background:
                          theme.palette.mode === 'dark'
                            ? alpha(theme.palette.background.paper, 0.55)
                            : alpha('#ffffff', 0.7),
                        border: '1px solid',
                        borderColor: theme.palette.divider,
                        backdropFilter: 'saturate(180%) blur(12px)',
                        WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                        color: 'text.secondary',
                        transition:
                          'transform .15s, border-color .15s, background .15s, color .15s',
                        '&:hover': {
                          transform: 'translateY(-1px)',
                          borderColor: alpha(theme.palette.primary.main, 0.5),
                          color: 'primary.main',
                        },
                      }}
                    >
                      <GlassIcon
                        name="Tune"
                        fallback={TuneRoundedIcon}
                        size={18}
                        tone={metricsSettingsOpen ? theme.palette.primary.main : 'neutral'}
                      />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Dialog
                  open={metricsSettingsOpen}
                  onClose={() => setMetricsSettingsOpen(false)}
                  fullWidth
                  maxWidth="sm"
                  PaperProps={{
                    sx: {
                      borderRadius: 3,
                      maxHeight: '85vh',
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.background.paper, 0.92)
                          : theme.palette.background.paper,
                      backdropFilter: 'saturate(180%) blur(20px)',
                      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                    },
                  }}
                >
                  <DialogTitle
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      pb: 1,
                      fontWeight: 800,
                      fontSize: '1.05rem',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <GlassIcon name="Tune" fallback={TuneRoundedIcon} size={20} tone="neutral" />
                      Block Visibility Management
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => setMetricsSettingsOpen(false)}
                      aria-label="Close settings"
                    >
                      <GlassIcon name="Close" fallback={CloseIcon} size={20} tone="neutral" />
                    </IconButton>
                  </DialogTitle>

                  <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 0.5,
                        mb: 1.5,
                        flexWrap: 'nowrap',
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 800,
                          fontSize: { xs: '0.78rem', sm: '0.875rem' },
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                          flexShrink: 1,
                        }}
                      >
                        Home blocks{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
                      </Typography>
                      <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
                        <Button
                          size="small"
                          onClick={showAllBlocks}
                          disabled={hiddenCount === 0}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            minWidth: 0,
                            fontSize: '0.72rem',
                            px: 0.75,
                          }}
                        >
                          Show all
                        </Button>
                        <Button
                          size="small"
                          onClick={hideAllBlocks}
                          disabled={hiddenCount === totalBlockCount}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            minWidth: 0,
                            fontSize: '0.72rem',
                            px: 0.75,
                          }}
                        >
                          Hide all
                        </Button>
                        <Button
                          size="small"
                          onClick={resetLayout}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            minWidth: 0,
                            fontSize: '0.72rem',
                            px: 0.75,
                          }}
                        >
                          Reset
                        </Button>
                      </Stack>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
                    >
                      Drag{' '}
                      <AppIcon
                        name="DragIndicator"
                        fallback={DragIndicatorIcon}
                        sx={{ fontSize: 14, verticalAlign: -2 }}
                      />{' '}
                      to reorder. Hero stays at top.
                    </Typography>
                    <Box role="list">
                      <BlockOptionRow
                        id={SIMPLE_HOME_HERO.key}
                        label={SIMPLE_HOME_HERO.label}
                        hidden={hiddenBlocks.has(SIMPLE_HOME_HERO.key)}
                        sortable={false}
                        onToggle={toggleBlock}
                      />
                      <DndContext
                        sensors={metricsSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleMetricsDragEnd}
                      >
                        <SortableContext items={blockOrder} strategy={verticalListSortingStrategy}>
                          {blockOrder.map((key) => (
                            <BlockOptionRow
                              key={key}
                              id={key}
                              label={SIMPLE_HOME_BLOCK_LABELS[key] || key}
                              hidden={hiddenBlocks.has(key)}
                              sortable
                              onToggle={toggleBlock}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </Box>
                  </DialogContent>

                  <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setMetricsSettingsOpen(false)}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}
                    >
                      Done
                    </Button>
                  </DialogActions>
                </Dialog>

                {/* Get Started tile → opens 5-section guide dialog. */}
                <HideableBlock
                  hidden={hiddenBlocks.has('getStarted')}
                  order={blockOrderIndex.getStarted}
                >
                  <Reveal>
                    <SectionLabel>Get started</SectionLabel>
                    <MktTile
                      icon={
                        <GlassIcon
                          name="RocketLaunchRounded"
                          fallback={RocketLaunchRoundedIcon}
                          size={24}
                        />
                      }
                      accent={theme.palette.primary.main}
                      kicker="2-min read"
                      title="New here? Read the quick guide"
                      subtitle="Describe → plan → approve → execute → review."
                      ctaLabel="Open the guide"
                      onClick={() => setGuideOpen(true)}
                      minHeight={130}
                      delay={0}
                    />
                  </Reveal>
                </HideableBlock>

                {/* Guide - merged Persona pills + Explore accordion. Persona
          drives the Explore ordering, so they read naturally together. */}
                <HideableBlock hidden={hiddenBlocks.has('guide')} order={blockOrderIndex.guide}>
                  <Reveal delay={80}>
                    <SectionLabel>Guide</SectionLabel>
                  </Reveal>
                  <Reveal delay={80}>
                    <Box sx={{ mb: { xs: 1.5, sm: 2 } }}>
                      <PersonaPills value={persona} onChange={updatePersona} />
                    </Box>
                  </Reveal>
                  <Reveal delay={120}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      Tap any topic to expand and try it.
                    </Typography>
                    <ExploreAccordion
                      persona={persona}
                      onNavigate={navigate}
                      onNewRequest={() => submitPrompt('')}
                    />
                  </Reveal>
                </HideableBlock>

                {/* ── Dashboard region: KPI + categories + bento (always shown on History tab) ──
          Uses display:contents so its children participate in the parent
          flex layout (needed for drag-reordering via CSS `order`). The
          per-block Reveal animations preserve the fade-in feel. */}
                <Box sx={{ display: 'contents' }}>
                  <HideableBlock
                    hidden={hiddenBlocks.has('goalMonitoring')}
                    order={blockOrderIndex.goalMonitoring}
                  >
                    <Reveal>
                      <SectionLabel>Goal Monitoring</SectionLabel>
                    </Reveal>
                    {/* ── KPI strip - org-action tiles (square icons, compact spacing) ── */}
                    <Reveal>
                      <div
                        className="mkt-grid mkt-grid--home-metrics"
                        data-tour-block="dashboard-kpi"
                        data-tour-label="Goal monitoring"
                      >
                        <HomeMetricTile
                          iconName="BoltOutlined"
                          fallback={BoltOutlinedIcon}
                          kicker="Working on"
                          value={metrics.inFlight.length}
                          subtitle={metrics.stageSummary || 'nothing running'}
                          onClick={() => handleOpenHistoryWithFilter('in_flight')}
                          delay={0}
                          ariaLabel={`Working on - ${metrics.inFlight.length} goals`}
                        />
                        <HomeMetricTile
                          iconName="PriorityHighOutlined"
                          fallback={PriorityHighOutlinedIcon}
                          kicker="Attention"
                          value={metrics.attention.length}
                          subtitle={metrics.attention.length > 0 ? 'tap to review' : 'all clear'}
                          onClick={() => handleOpenHistoryWithFilter('needs_attention')}
                          delay={60}
                          ariaLabel={`Attention - ${metrics.attention.length} goals`}
                        />
                        <HomeMetricTile
                          iconName="CheckCircleOutline"
                          fallback={CheckCircleOutlineIcon2}
                          kicker="Completed"
                          value={metrics.completed.length}
                          subtitle={
                            metrics.successRate != null
                              ? `${metrics.successRate}% success · ${metrics.completedThisWeek} this week`
                              : 'no history yet'
                          }
                          onClick={() => handleOpenHistoryWithFilter('completed')}
                          delay={120}
                          ariaLabel={`Completed - ${metrics.completed.length} goals`}
                        />
                        <HomeMetricTile
                          iconName="AttachMoneyOutlined"
                          fallback={AttachMoneyOutlinedIcon}
                          kicker="Tokens Spent"
                          value={spentTokens}
                          subtitle={
                            spentCost > 0 ? `${fmtUsd(spentCost)} total` : 'no LLM spend yet'
                          }
                          breakdown={spentBreakdown}
                          onClick={() => navigate('/reports?tab=agent-reports')}
                          delay={180}
                          ariaLabel={`Tokens spent ${spentTokens}`}
                        />
                      </div>
                    </Reveal>
                  </HideableBlock>

                  {/* ── Categories - showcase carousel (Reports hub pattern) ── */}
                  <HideableBlock
                    hidden={hiddenBlocks.has('categories')}
                    order={blockOrderIndex.categories}
                  >
                    <Reveal delay={80}>
                      <Box data-tour-block="dashboard-categories" data-tour-label="Quick hubs">
                        <HomeCategoriesShowcase
                          delay={80}
                          cards={[
                            {
                              key: 'requests',
                              title: 'Requests',
                              subtitle: "Track everything you've asked the platform to do.",
                              metrics: [
                                { value: metrics.inFlight.length, label: 'in flight' },
                                { value: metrics.attention.length, label: 'need review' },
                                { value: metrics.completed.length, label: 'completed' },
                              ],
                              onClick: () => navigate('/job-pool'),
                              ariaLabel: 'Requests - open job pool',
                            },
                            {
                              key: 'communicator',
                              title: 'Communicator',
                              subtitle: 'Live agent rooms, task board and activity feed.',
                              metrics: [
                                { value: metrics.inFlight.length, label: 'live conversations' },
                                { value: metrics.attention.length, label: 'need response' },
                                { value: metrics.activity24h, label: 'events · 24h' },
                              ],
                              onClick: () => navigate('/communicator'),
                              ariaLabel: 'Communicator - open messages',
                            },
                            {
                              key: 'dashboard',
                              title: 'Dashboard',
                              subtitle: 'Dashboards, reports and goal deliverables in one place.',
                              metrics: [
                                { value: metrics.completed.length, label: 'deliverables' },
                                {
                                  value:
                                    metrics.successRate != null ? `${metrics.successRate}%` : '-',
                                  label: 'success rate',
                                },
                                {
                                  value: `$${metrics.totalSpent.toFixed(0)}`,
                                  label: 'spent total',
                                },
                              ],
                              onClick: () => navigate('/hub'),
                              ariaLabel: 'Dashboard - open reports hub',
                            },
                          ]}
                        />
                      </Box>
                    </Reveal>
                  </HideableBlock>

                  {/* ── In-flight row list - shows freshly created goals immediately. ──
          Hidden when there are no in-flight goals so empty users see
          the existing Recent section without padding. */}
                  {metrics.inFlight.length > 0 && (
                    <HideableBlock
                      hidden={hiddenBlocks.has('inFlight')}
                      order={blockOrderIndex.inFlight}
                    >
                      <Reveal delay={100}>
                        <SectionLabel>In flight</SectionLabel>
                      </Reveal>
                      <Reveal delay={100}>
                        <MktTile
                          icon={
                            <GlassIcon name="BoltOutlined" fallback={BoltOutlinedIcon} size={28} />
                          }
                          accent={theme.palette.primary.main}
                          kicker="Working on"
                          title={`${metrics.inFlight.length} goal${metrics.inFlight.length === 1 ? '' : 's'} running`}
                          subtitle={metrics.stageSummary || 'in progress'}
                          ctaLabel={
                            metrics.inFlight.length > 5
                              ? `See all ${metrics.inFlight.length}`
                              : 'Open queue'
                          }
                          onClick={() => navigate('/job-pool')}
                          liveDot
                          minHeight={200}
                          delay={0}
                          sx={{ mb: 2 }}
                        >
                          <Stack spacing={1.25}>
                            {metrics.inFlight
                              .slice()
                              .sort(
                                (a, b) =>
                                  new Date(b.updated_at || b.created_at || 0) -
                                  new Date(a.updated_at || a.created_at || 0)
                              )
                              .slice(0, 5)
                              .map((g) => (
                                <GoalRow
                                  key={g.id}
                                  goal={g}
                                  onClick={(e) => {
                                    e?.stopPropagation?.();
                                    goToGoal(g.id);
                                  }}
                                  theme={theme}
                                  accentColor={theme.palette.primary.main}
                                />
                              ))}
                          </Stack>
                        </MktTile>
                      </Reveal>
                    </HideableBlock>
                  )}

                  <HideableBlock hidden={hiddenBlocks.has('recent')} order={blockOrderIndex.recent}>
                    <Reveal delay={120}>
                      <SectionLabel>Recent</SectionLabel>
                    </Reveal>
                    {/* ── Two marketplace-style tiles: Attention + Recently completed ── */}
                    <Reveal delay={120}>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                          gap: '16px',
                          mb: 2,
                        }}
                      >
                        {metrics.attention.length > 0 ? (
                          <MktTile
                            icon={
                              <GlassIcon
                                name="PriorityHighOutlined"
                                fallback={PriorityHighOutlinedIcon}
                                size={28}
                              />
                            }
                            accent={theme.palette.warning.main}
                            kicker="Attention"
                            title="Needs your attention"
                            subtitle={`${metrics.attention.length} goal${metrics.attention.length === 1 ? '' : 's'} waiting on you`}
                            ctaLabel="View"
                            onClick={() => handleOpenHistoryWithFilter('needs_attention')}
                            minHeight={280}
                            delay={0}
                          >
                            <Stack spacing={1.25}>
                              {metrics.attention.slice(0, 5).map((g) => (
                                <GoalRow
                                  key={g.id}
                                  goal={g}
                                  onClick={(e) => {
                                    e?.stopPropagation?.();
                                    goToGoal(g.id);
                                  }}
                                  theme={theme}
                                  accentColor={
                                    g.status === 'failed' || g.status === 'needs_human'
                                      ? theme.palette.error.main
                                      : theme.palette.warning.main
                                  }
                                />
                              ))}
                            </Stack>
                          </MktTile>
                        ) : (
                          <MktTile
                            icon={
                              <GlassIcon
                                name="CheckCircleOutline"
                                fallback={CheckCircleOutlineIcon2}
                                size={28}
                              />
                            }
                            accent={theme.palette.success.main}
                            kicker="All clear"
                            title="Nothing needs your attention"
                            subtitle="The self-healer is watching. You'll see things here only when human action is needed."
                            ctaLabel="View pipeline"
                            onClick={() => navigate('/job-pool')}
                            minHeight={280}
                            delay={0}
                          >
                            <Box sx={{ py: 1.5, textAlign: 'center' }}>
                              <GlassIcon
                                name="AutoAwesomeOutlined"
                                fallback={AutoAwesomeOutlinedIcon}
                                size={40}
                                tone={alpha(theme.palette.success.main, 0.55)}
                              />
                            </Box>
                          </MktTile>
                        )}

                        <MktTile
                          icon={
                            <GlassIcon
                              name="RocketLaunchOutlined"
                              fallback={RocketLaunchOutlinedIcon}
                              size={28}
                            />
                          }
                          accent={theme.palette.success.main}
                          kicker="Recent"
                          title="Recently completed"
                          subtitle={
                            recentCompleted.length > 0
                              ? 'Click a goal to view deliverables'
                              : 'Your finished work will appear here'
                          }
                          ctaLabel="View"
                          onClick={() => handleOpenHistoryWithFilter('completed')}
                          minHeight={280}
                          delay={80}
                        >
                          {recentCompleted.length === 0 ? (
                            <Box sx={{ py: 1.5, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">
                                No completed goals yet.
                              </Typography>
                            </Box>
                          ) : (
                            <Stack spacing={1.25}>
                              {recentCompleted.map((g) => {
                                const url = g.data?.deployment_url;
                                return (
                                  <GoalRow
                                    key={g.id}
                                    goal={g}
                                    onClick={(e) => {
                                      e?.stopPropagation?.();
                                      goToGoal(g.id);
                                    }}
                                    theme={theme}
                                    accentColor={theme.palette.success.main}
                                    trailing={
                                      url ? (
                                        <Tooltip title="Open deployed URL">
                                          <IconButton
                                            size="small"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              window.open(url, '_blank', 'noopener');
                                            }}
                                            sx={{ color: 'success.main' }}
                                          >
                                            <GlassIcon
                                              name="OpenInNew"
                                              fallback={OpenInNewIcon}
                                              size={18}
                                              tone="neutral"
                                            />
                                          </IconButton>
                                        </Tooltip>
                                      ) : null
                                    }
                                  />
                                );
                              })}
                            </Stack>
                          )}
                        </MktTile>
                      </Box>
                    </Reveal>
                  </HideableBlock>
                </Box>
                {/* end of dashboard region */}
              </Box>
            ))}
          {/* end of {homeTab === 'metrics' && …} */}

          {homeTab === 'history' &&
            (historyKind === 'assistant' ? (
              <HistoryAssistantList
                theme={theme}
                historyKind={historyKind}
                onHistoryKindChange={setHistoryKind}
                onOpenConversation={resumeConversationFromHistory}
              />
            ) : (
              <Box data-tour-block="dashboard-history" data-tour-label="Goals history">
                <HistoryGoalsList
                  goals={goals}
                  theme={theme}
                  dateFrom={historyDateFrom}
                  dateTo={historyDateTo}
                  onDateFromChange={setHistoryDateFrom}
                  onDateToChange={setHistoryDateTo}
                  statuses={historyStatuses}
                  onStatusesChange={setHistoryStatuses}
                  costMin={historyCostMin}
                  costMax={historyCostMax}
                  onCostMinChange={setHistoryCostMin}
                  onCostMaxChange={setHistoryCostMax}
                  search={historySearch}
                  onSearchChange={setHistorySearch}
                  onOpenGoal={resumeGoal}
                  onOpenDetails={goToGoal}
                  historyKind={historyKind}
                  onHistoryKindChange={setHistoryKind}
                />
              </Box>
            ))}
        </div>
      </Box>
      <AssistantSetupChatDialog
        open={assistantDialogOpen}
        onClose={() => {
          setAssistantDialogOpen(false);
          // The unified dialog persists config + active flag to localStorage;
          // re-read so the dashboard reflects the new assistant brain/state.
          const next = readAssistantConfig();
          setAssistantConfig(next);
          if (next?.activated) setActiveCategory('assistant');
        }}
      />
      {/* Get Started guide dialog (lazy-mounted) */}
      {guideOpen && <GetStartedGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />}
      {/* Goal detail dialog - opened by clicking a goal row in the
          In-flight, Attention, or Recently-completed tiles. Lazy-
          mounted so it doesn't ship its heavy subcomponents until
          first use. */}
      {detailGoalId && (
        <GoalDetailDialog
          open={!!detailGoalId}
          onClose={() => setDetailGoalId(null)}
          goalId={detailGoalId}
          onUpdated={() => fetchGoals()}
        />
      )}
      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 11, sm: 13 } }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ minWidth: 280 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// HeroPromptInput - autofocused (first visit only), submit on Enter,
// Shift+Enter inserts newline.
// States: Resting (2 rows, no expand arrow) → Writing (3 rows, arrow
// appears top-right) → Writing+Expanded (24-32 rows, ~800 px wide;
// orb/greeting/captions all hidden by parent). Arrow keeps focus on
// the textarea via mousedown-preventDefault + explicit inputRef.focus.
// Mic icon → opens voice dialog.
// Kept short (≤ ~34 chars) so the typewriter line never wraps onto a
// second row in the caption above the focused composer.
const HERO_PROMPT_SUGGESTIONS = [
  'Design a sunglasses landing page',
  'Analyse Baltic e-commerce trends',
  'Unify goals into one organisation',
  'Review the latest report',
  'Build a social-media banner kit',
  'Plan a marketing campaign timeline',
  'Send a campaign via SMS and email',
];

// Shared typewriter loop: types each phrase one letter at a time (~28ms),
// holds for 2.5s, fades out, then advances to the next phrase. Pauses
// when `paused` is true; resets cleanly on unmount or when paused flips on.
function useTypewriterLoop(phrases, { paused = false } = {}) {
  const [text, setText] = useState('');
  const [fade, setFade] = useState(1);

  useEffect(() => {
    if (paused || !phrases?.length) return undefined;
    const TYPE_MS = 28;
    const HOLD_MS = 2500;
    const VANISH_MS = 380;
    const timers = [];
    let cancelled = false;
    let phraseIdx = Math.floor(Math.random() * phrases.length);

    const runOne = () => {
      if (cancelled) return;
      const phrase = phrases[phraseIdx];
      setFade(1);
      setText('');

      for (let i = 1; i <= phrase.length; i += 1) {
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setText(phrase.slice(0, i));
          }, i * TYPE_MS)
        );
      }

      const typedEnd = phrase.length * TYPE_MS;

      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setFade(0);
        }, typedEnd + HOLD_MS)
      );

      timers.push(
        setTimeout(
          () => {
            if (cancelled) return;
            phraseIdx = (phraseIdx + 1) % phrases.length;
            runOne();
          },
          typedEnd + HOLD_MS + VANISH_MS
        )
      );
    };

    runOne();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setFade(1);
      setText('');
    };
  }, [phrases, paused]);

  return { text, fade };
}

export function HeroPromptInput({
  onSubmit,
  onOpenVoice,
  onActiveChange,
  hidden = false,
  expanded = false,
  onToggleExpand,
  topSlot,
  bodyOverride,
  // Opens the goal setup drawer, mirroring the sliders icon in the Assistant
  // composer. Passed only for the Goal category, where a drawer is mounted.
  onOpenSetup = null,
  setupScoped = false,
  // Changing this replays the card's settle animation. Switching Assistant to
  // Goal swaps what the box is for, and without a beat of movement the change
  // is easy to miss - the pills light up and nothing else acknowledges it.
}) {
  const theme = useTheme();
  const isMobileTouch = useMediaQuery('(pointer: coarse)');
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [value, setValue] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [fileSnack, setFileSnack] = useState({ open: false, message: '' });
  const [focused, setFocused] = useState(false);

  // Autofocus only once per session on desktop - skip on touch to prevent iOS Safari zoom.
  useEffect(() => {
    if (!shouldAutofocusTextInput()) return undefined;
    try {
      if (sessionStorage.getItem('orch_home_autofocused') === '1') return undefined;
      sessionStorage.setItem('orch_home_autofocused', '1');
    } catch {
      /* private */
    }
    const t = setTimeout(() => inputRef.current?.focus(), 600);
    return () => clearTimeout(t);
  }, []);

  const active = focused || value.length > 0;

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  // Placeholder typewriter only runs while the input is idle. When the
  // user focuses to type, the placeholder clears so the field is clean
  // and the animation moves to the caption above (handled by the parent).
  const STATIC_PLACEHOLDER = 'What do you want to build?';
  const { text: typedPlaceholder, fade: placeholderFade } = useTypewriterLoop(
    HERO_PROMPT_SUGGESTIONS,
    { paused: focused }
  );
  const placeholderText = focused ? '' : typedPlaceholder || STATIC_PLACEHOLDER;

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      const err = validateFile(file);
      if (err) {
        setFileSnack({ open: true, message: `${file.name}: ${err}` });
        continue;
      }
      const att = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        ext: file.name.split('.').pop()?.toLowerCase() || '',
        _file: file,
      };
      setAttachedFiles((prev) => [...prev, att]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (id) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    const hasFiles = attachedFiles.length > 0;
    if (!trimmed && !hasFiles) return;
    // Auto-generate friendly prompt when files attached with no text
    const textToSend =
      trimmed ||
      (hasFiles
        ? `I've attached ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}: ${attachedFiles.map((f) => f.name).join(', ')}. What should we do with them?`
        : '');
    onSubmit?.(textToSend, attachedFiles);
    setValue('');
    setAttachedFiles([]);
  };

  return (
    <Box
      data-testid="hero-prompt-input"
      data-composer-text-entry=""
      aria-hidden={hidden || undefined}
      sx={{
        position: 'relative',
        display: hidden ? 'none' : 'flex',
        flexDirection: 'column',
        gap: 0.5,
        // When an embedded surface (assistant chat) fills the body, drop the
        // rounded card chrome so the chat sits flush with no frame around it.
        ...(bodyOverride
          ? {
              p: 0,
              bgcolor: 'transparent',
              border: 'none',
              boxShadow: 'none',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              flex: 1,
              minHeight: 0,
            }
          : {
              // Geometry stays here (switching tabs must not reshape the box);
              // the colours come from the helper AssistantChat also uses.
              px: 1,
              pt: 0.75,
              pb: 0.75,
              borderRadius: 3,
              ...composerCardSx(theme),
            }),
      }}
    >
      {/* Category pills, anchored at the top of the card. */}
      {topSlot && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: { xs: 0.75, sm: 1 },
            px: 0.5,
            pb: 0.25,
          }}
        >
          {topSlot}
        </Box>
      )}
      {bodyOverride}
      {!bodyOverride && (
        <>
          {/* Expand / collapse - bare arrow icon, only visible while Writing. */}
          {active && (
            <IconButton
              aria-label={expanded ? 'Collapse input' : 'Expand input to edge'}
              aria-pressed={expanded}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onToggleExpand?.();
                inputRef.current?.focus();
              }}
              size="small"
              disableRipple
              sx={{
                position: 'absolute',
                top: 6,
                right: 9,
                p: 0.5,
                background: 'none',
                border: 'none',
                color: expanded ? theme.palette.primary.main : theme.palette.text.secondary,
                transition: 'color .2s, transform .15s',
                zIndex: 2,
                '&:hover': {
                  background: 'none',
                  color: theme.palette.primary.main,
                  transform: 'translateY(-1px)',
                },
              }}
            >
              {expanded ? (
                <AppIcon
                  name="CloseFullscreenRounded"
                  fallback={CloseFullscreenRoundedIcon}
                  sx={{ fontSize: 18 }}
                />
              ) : (
                <AppIcon
                  name="OpenInFullRounded"
                  fallback={OpenInFullRoundedIcon}
                  sx={{ fontSize: 18 }}
                />
              )}
            </IconButton>
          )}
          <InputBase
            inputRef={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholderText}
            multiline
            minRows={expanded ? 24 : active ? 3 : 2}
            maxRows={expanded ? 32 : 8}
            inputProps={{
              'aria-label': 'What do you want to build?',
              inputMode: 'text',
              enterKeyHint: 'send',
            }}
            sx={{
              width: '100%',
              fontSize: getHeroInputFontSize(isMobileTouch),
              px: 0.5,
              pr: active ? 3.5 : 0.5,
              '& textarea': {
                overflow: 'auto !important',
                resize: 'none',
                lineHeight: 1.45,
              },
              '& input::placeholder, & textarea::placeholder': {
                opacity: focused ? 1 : placeholderFade,
                transition: 'opacity 360ms ease',
              },
              '@media (prefers-reduced-motion: reduce)': {
                '& input::placeholder, & textarea::placeholder': { transition: 'none' },
              },
            }}
          />
          {/* Attached files preview strip */}
          {attachedFiles.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                px: 0.5,
                pt: 0.5,
              }}
            >
              {attachedFiles.map((f) => (
                <Chip
                  key={f.id}
                  icon={<AttachFileRoundedIcon sx={{ fontSize: 14 }} />}
                  label={`${f.name} (${formatFileSize(f.size)})`}
                  onDelete={() => handleRemoveFile(f.id)}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 24,
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    borderRadius: '12px',
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    transition: 'all 0.2s ease',
                    '& .MuiChip-icon': { ml: 0.5 },
                    '& .MuiChip-deleteIcon': {
                      fontSize: 16,
                      color: alpha(theme.palette.text.secondary, 0.6),
                      '&:hover': { color: theme.palette.error.main },
                    },
                    '&:hover': {
                      borderColor: alpha(theme.palette.primary.main, 0.5),
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                />
              ))}
            </Box>
          )}
          {/* Compact toolbar mirrors AssistantChat: attach on the left, send on
          the right. No mic / model / context icons (see plan). */}
          <Box
            data-testid="hero-prompt-actions"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              flexShrink: 0,
              pt: 0.5,
              px: 0.5,
            }}
          >
            <Badge
              badgeContent={attachedFiles.length}
              color="primary"
              invisible={attachedFiles.length === 0}
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.6rem',
                  height: 16,
                  minWidth: 16,
                  borderRadius: '8px',
                },
              }}
            >
              <IconButton
                aria-label="Attach files"
                onClick={() => fileInputRef.current?.click()}
                size="small"
                sx={composerToolIconSx(theme, { active: attachedFiles.length > 0 })}
              >
                <AttachFileRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Badge>

            {onOpenSetup && (
              <Tooltip title="Goal setup - organization, consilium, teams, AxWise">
                <IconButton
                  aria-label="Goal setup"
                  onClick={onOpenSetup}
                  size="small"
                  sx={composerToolIconSx(theme, { active: setupScoped })}
                >
                  <TuneRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}

            <Box sx={{ flex: 1 }} />

            <IconButton
              aria-label="Submit"
              onClick={handleSubmit}
              disabled={!value.trim() && attachedFiles.length === 0}
              size="small"
              sx={composerSendSx(theme)}
            >
              <SendRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </>
      )}
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.svg"
      />
      <Portal>
        <Snackbar
          open={fileSnack.open}
          autoHideDuration={4000}
          onClose={() => setFileSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            severity="warning"
            variant="filled"
            onClose={() => setFileSnack((s) => ({ ...s, open: false }))}
          >
            {fileSnack.message}
          </Alert>
        </Snackbar>
      </Portal>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// Time-of-day-aware chip pools, drawn from SLASH_COMMANDS labels.
const CHIP_POOLS = {
  morning: [
    "Generate today's briefing",
    'Plan the week',
    'Show me my open tasks',
    'Run a finance report',
    'Draft a partner update',
    'Find me a marketing agent',
  ],
  afternoon: [
    'Run a finance report',
    'Show bottlenecks',
    'Find me an agent for my project',
    'Draft a partner update',
    'Generate weekly KPIs',
    "Plan tomorrow's work",
  ],
  evening: [
    "Plan tomorrow's work",
    'Show me what shipped today',
    'Generate end-of-day summary',
    'Set deadlines for next week',
    'Review attention queue',
    'Generate weekly KPIs',
  ],
};

function StarterChips({ slot, onPick }) {
  const theme = useTheme();
  const pool = CHIP_POOLS[slot] || CHIP_POOLS.afternoon;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return undefined;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      setOffset((o) => (o + 3) % pool.length);
    }, 8000);
    return () => clearInterval(id);
  }, [pool.length]);

  const visible = [0, 1, 2].map((i) => pool[(offset + i) % pool.length]);

  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          mb: 1,
          color: 'text.disabled',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontSize: '0.7rem',
          fontWeight: 700,
        }}
      >
        Try
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          justifyContent: 'center',
        }}
      >
        {visible.map((label) => (
          <Box
            key={label}
            component="button"
            type="button"
            onClick={() => onPick?.(label)}
            sx={{
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.25),
              background: alpha(theme.palette.primary.main, 0.08),
              color: 'text.primary',
              borderRadius: 999,
              px: 2,
              py: 1,
              minHeight: 40,
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              fontFamily: 'inherit',
              transition: 'border-color .15s, background .15s, transform .15s',
              '&:hover, &:focus-visible': {
                borderColor: theme.palette.primary.main,
                background: alpha(theme.palette.primary.main, 0.14),
                transform: 'translateY(-1px)',
                outline: 'none',
              },
              '@media (prefers-reduced-motion: reduce)': {
                '&:hover, &:focus-visible': { transform: 'none' },
              },
            }}
          >
            <GlassIcon name="LightbulbOutlined" fallback={LightbulbOutlinedIcon} size={16} />
            {label}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// PersonaPills - localStorage-only personalization.
const PERSONAS = [
  { value: 'founder', label: 'Founder' },
  { value: 'operator', label: 'Operator' },
  { value: 'marketer', label: 'Marketer' },
  { value: 'investor', label: 'Investor' },
];

function PersonaPills({ value, onChange }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        flexWrap: 'wrap',
        mt: { xs: 1, sm: 2 },
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5, fontWeight: 600 }}>
        I'm a:
      </Typography>
      {PERSONAS.map((p) => {
        const active = value === p.value;
        return (
          <Box
            key={p.value}
            component="button"
            type="button"
            onClick={() => onChange?.(active ? '' : p.value)}
            aria-pressed={active}
            sx={{
              border: '1px solid',
              borderColor: active
                ? theme.palette.primary.main
                : alpha(theme.palette.primary.main, 0.2),
              background: active ? alpha(theme.palette.primary.main, 0.14) : 'transparent',
              color: active ? 'primary.main' : 'text.primary',
              borderRadius: 999,
              px: 1.75,
              py: 0.625,
              minHeight: 32,
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color .15s, background .15s, color .15s',
              '&:hover, &:focus-visible': {
                borderColor: theme.palette.primary.main,
                background: alpha(theme.palette.primary.main, 0.1),
                outline: 'none',
              },
            }}
          >
            {p.label}
          </Box>
        );
      })}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// ExploreAccordion - reorders by persona.
const EXPLORE_TOPICS = {
  'make-request': {
    title: 'Make a request',
    body: 'Type a goal in plain English. Agents form a team, draft a plan, and ask you to approve before they run.',
    cta: 'Open Job Pool',
    onClick: (nav) => nav('/job-pool'),
  },
  track: {
    title: 'Track active work',
    body: "Every running goal shows phase progress, current step, and where it's stuck - if anywhere.",
    cta: 'View live work',
    onClick: (nav) => nav('/job-pool?tab=goals'),
  },
  review: {
    title: 'Review deliverables',
    body: "Every completed goal's outputs - landing pages, code, files, reports - live in the Results hub.",
    cta: 'Open Results',
    onClick: (nav) => nav('/hub?tab=results'),
  },
  talk: {
    title: 'Talk to your agents',
    body: 'Join a live Agent Room to message your agents while work is in flight. Tone, mood, decisions - all in one place.',
    cta: 'Open Communicator',
    onClick: (nav) => nav('/communicator'),
  },
  customize: {
    title: 'Customize dashboards',
    body: 'Build your own bento dashboards from live data - drag widgets, set filters, or fork a template.',
    cta: 'Browse dashboards',
    onClick: (nav) => nav('/hub?tab=dashboards'),
  },
};

const EXPLORE_ORDER = {
  founder: ['make-request', 'review', 'customize', 'talk', 'track'],
  operator: ['track', 'talk', 'make-request', 'review', 'customize'],
  marketer: ['make-request', 'review', 'talk', 'customize', 'track'],
  investor: ['customize', 'review', 'track', 'make-request', 'talk'],
  '': ['make-request', 'track', 'review', 'talk', 'customize'],
};

function ExploreAccordion({ persona, onNavigate }) {
  const theme = useTheme();
  const order = EXPLORE_ORDER[persona] || EXPLORE_ORDER[''];

  return (
    <Box>
      {order.map((key) => {
        const topic = EXPLORE_TOPICS[key];
        return (
          <Accordion
            key={key}
            disableGutters
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '12px !important',
              mb: 1,
              overflow: 'hidden',
              '&::before': { display: 'none' },
              '&.Mui-expanded': {
                borderColor: alpha(theme.palette.primary.main, 0.35),
              },
            }}
          >
            <AccordionSummary
              expandIcon={
                <GlassIcon
                  name="ExpandMore"
                  fallback={ExpandMoreRoundedIcon}
                  size={20}
                  tone="neutral"
                />
              }
              sx={{
                minHeight: 56,
                px: 2,
                '& .MuiAccordionSummary-content': { my: 1.25 },
                '&:hover': { background: alpha(theme.palette.primary.main, 0.04) },
              }}
            >
              <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{topic.title}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.5 }}>
                {topic.body}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                endIcon={
                  <GlassIcon
                    name="ArrowForwardRounded"
                    fallback={ArrowForwardRoundedIcon}
                    size={16}
                  />
                }
                onClick={() => topic.onClick(onNavigate)}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 999 }}
              >
                {topic.cta}
              </Button>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// GetStartedGuideDialog - 5 sections + roles, polished for simple mode
// with glass-morphism icons, gradient surface, and primary-tinted accents.
const GUIDE_SECTIONS = [
  {
    iconName: 'AutoAwesome',
    FallbackIcon: AutoAwesomeOutlinedIcon,
    title: 'Describe what you need',
    body: 'Tap the prompt input on Home, the Job Pool dock icon, or speak via "Let\'s Talk". Use plain English: "Build me a landing page for Acme" or "Pull a weekly partner report."',
  },
  {
    iconName: 'Groups',
    FallbackIcon: GroupsOutlinedIcon,
    title: 'Agents plan the work',
    body: 'Within seconds, a team of agents reads your goal, drafts a phased plan, picks the right tools, and shows you a proposal with a budget estimate.',
  },
  {
    iconName: 'CheckCircleOutline',
    FallbackIcon: CheckCircleOutlineIcon,
    title: 'You approve, they execute',
    body: 'Review the plan. Approve, and the work runs end-to-end. The self-healer fixes most issues automatically. You only step in when needed.',
  },
  {
    iconName: 'BarChartOutlined',
    FallbackIcon: BarChartOutlinedIcon,
    title: 'Review what was built',
    body: 'Open the Dashboard -> Results tab to see every deliverable: live sites, code, files, reports. One click to open or share.',
  },
  {
    iconName: 'Refresh',
    FallbackIcon: RefreshOutlinedIcon,
    title: 'Iterate',
    body: 'Tap any deliverable\'s "Improve quality" to refine. Or start a new request. Every cycle the agents learn what you like.',
  },
];

const ROLES_AGENTS = [
  'Plan the work',
  'Build the deliverables',
  'Run integrations',
  'Learn from feedback',
  'Send live updates',
];
const ROLES_USER = [
  'Approve the proposal',
  'Make business decisions',
  'Set direction',
  'Review the results',
  'Pay for usage',
];

function GetStartedGuideDialog({ open, onClose }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="guide-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
            background: `linear-gradient(160deg, ${alpha(tint, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 65%)`,
            border: '1px solid',
            borderColor: alpha(tint, 0.22),
            boxShadow: `0 20px 60px ${alpha('#000', theme.palette.mode === 'dark' ? 0.5 : 0.14)}, 0 0 0 1px ${alpha(tint, 0.1)} inset`,
          },
        },
        backdrop: {
          sx: { backdropFilter: 'blur(6px)', bgcolor: alpha('#000', 0.6) },
        },
      }}
    >
      <DialogTitle
        id="guide-title"
        sx={{
          fontWeight: 800,
          letterSpacing: '-0.01em',
          pr: 6,
          fontSize: '1.15rem',
          pt: 2.5,
        }}
      >
        How Orqaly works
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 700,
            color: 'text.secondary',
            mt: 0.25,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            fontSize: '0.66rem',
          }}
        >
          5 steps - from idea to live deliverable
        </Typography>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          size="small"
          sx={{
            position: 'absolute',
            right: 12,
            top: 12,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary', bgcolor: alpha(tint, 0.08) },
          }}
        >
          <GlassIcon name="Close" fallback={CloseRoundedIcon} size={18} tone="neutral" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: alpha(tint, 0.1), py: 2.5 }}>
        <Stack spacing={2.25}>
          {GUIDE_SECTIONS.map((s, i) => (
            <Box
              key={s.title}
              sx={{
                display: 'flex',
                gap: 1.75,
                alignItems: 'flex-start',
                position: 'relative',
              }}
            >
              {/* Glass-morphism icon disk with step-number chip */}
              <Box sx={{ position: 'relative', flexShrink: 0 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2.2,
                    bgcolor: alpha(tint, 0.15),
                    color: tint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'rotate(-2deg)',
                    transition: 'transform .35s cubic-bezier(.22,1,.36,1)',
                    border: '1px solid',
                    borderColor: alpha(tint, 0.18),
                  }}
                >
                  <GlassIcon name={s.iconName} fallback={s.FallbackIcon} size={22} tone={tint} />
                </Box>
                {/* Small step-number chip overlay */}
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    minWidth: 18,
                    height: 18,
                    borderRadius: '50%',
                    px: 0.5,
                    bgcolor: 'background.paper',
                    color: tint,
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid',
                    borderColor: alpha(tint, 0.45),
                  }}
                >
                  {i + 1}
                </Box>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 700, mb: 0.25, lineHeight: 1.25 }}
                >
                  {s.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                  {s.body}
                </Typography>
              </Box>
            </Box>
          ))}

          {/* Roles section - polished panel */}
          <Box
            sx={{
              mt: 1,
              p: 2.25,
              borderRadius: 3,
              bgcolor: alpha(tint, 0.04),
              border: '1px solid',
              borderColor: alpha(tint, 0.15),
            }}
          >
            <Typography
              variant="overline"
              sx={{
                display: 'block',
                fontWeight: 800,
                letterSpacing: '0.18em',
                color: 'text.secondary',
                mb: 1.5,
                fontSize: '0.66rem',
              }}
            >
              Who does what
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2.25,
              }}
            >
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: alpha(tint, 0.15),
                      color: tint,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <GlassIcon
                      name="SmartToy"
                      fallback={SmartToyOutlinedIcon}
                      size={18}
                      tone={tint}
                    />
                  </Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Your agents
                  </Typography>
                </Box>
                <Stack spacing={0.5}>
                  {ROLES_AGENTS.map((r) => (
                    <Typography
                      key={r}
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        position: 'relative',
                        pl: 1.5,
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: 8,
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          bgcolor: alpha(tint, 0.65),
                        },
                      }}
                    >
                      {r}
                    </Typography>
                  ))}
                </Stack>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', mt: 1, color: 'text.disabled', fontStyle: 'italic' }}
                >
                  So you don't have to.
                </Typography>
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: alpha(tint, 0.15),
                      color: tint,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <GlassIcon
                      name="TrackChanges"
                      fallback={TrackChangesOutlinedIcon}
                      size={18}
                      tone={tint}
                    />
                  </Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    You as orchestrator
                  </Typography>
                </Box>
                <Stack spacing={0.5}>
                  {ROLES_USER.map((r) => (
                    <Typography
                      key={r}
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        position: 'relative',
                        pl: 1.5,
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: 8,
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          bgcolor: alpha(tint, 0.65),
                        },
                      }}
                    >
                      {r}
                    </Typography>
                  ))}
                </Stack>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', mt: 1, color: 'text.disabled', fontStyle: 'italic' }}
                >
                  The strategic 5%.
                </Typography>
              </Box>
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          variant="contained"
          endIcon={<GlassIcon name="Check" fallback={CheckCircleOutlineIcon} size={16} />}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            px: 3,
            boxShadow: `0 6px 18px ${alpha(tint, 0.3)}`,
          }}
        >
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════
export default function Dashboard({ metricsOverride = null }) {
  const { simpleMode } = useSimpleMode();
  if (simpleMode) return <SimpleDashboard metricsOverride={metricsOverride} />;
  return <AdvancedDashboard />;
}

function AdvancedDashboard() {
  const theme = useTheme();
  const { partners, loading, error } = usePartners();
  const [showMetrics, setShowMetrics] = useShowMetrics('dashboard');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [period, setPeriod] = useState(formatMonthYear(new Date()));
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // Industry & integration connection states
  const [selectedIndustry, setSelectedIndustry] = useState('All');
  const [industryAnchorEl, setIndustryAnchorEl] = useState(null);
  const [connectionType, setConnectionType] = useState('S2S Connection'); // S2S Connection | API Integration | Affiliate Link | Webhook Integration
  const [connectionStatus, setConnectionStatus] = useState('connected'); // connected | disconnected | connecting
  const [logs, setLogs] = useState([]);

  // Auto-generate stream logs
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const interval = setInterval(() => {
      const id = Math.floor(1000 + Math.random() * 9000);
      const user = `usr_${Math.floor(100 + Math.random() * 900)}`;
      const amount = (Math.random() * 500 + 5).toFixed(2);
      const country = ['US', 'BR', 'DE', 'FR', 'JP', 'CA', 'VN'][Math.floor(Math.random() * 7)];
      let message = '';
      if (selectedIndustry === 'Gambling') {
        const events = [
          `S2S Postback: FTD registered for ${user} - Deposit $${amount} [ID: ${id}]`,
          `API Sync: GGR update - $${amount} from user_${id}`,
          `S2S Postback: Bet Volume registered - $${(amount * 10).toFixed(2)} from player ${user}`,
          `API Sync: Active player count synchronized (total: ${120 + (id % 50)})`,
        ];
        message = events[Math.floor(Math.random() * events.length)];
      } else if (selectedIndustry === 'Ecommerce') {
        const events = [
          `Affiliate Link: Click redirect logged from ${country} - Device: Mobile`,
          `Webhook: Sale completed - Order ID: E-${id} - Value: $${amount}`,
          `API Sync: AOV recalculated - Current: $${(50 + Math.random() * 30).toFixed(2)}`,
          `Webhook: Refund request received for Order E-${id - 100}`,
        ];
        message = events[Math.floor(Math.random() * events.length)];
      } else if (selectedIndustry === 'Fintech') {
        const events = [
          `S2S Postback: Account Funded for ${user} - Volume: $${(amount * 5).toFixed(2)}`,
          `API Sync: KYC status updated for ${user} - VERIFIED`,
          `S2S Postback: Transaction volume logged - $${(amount * 20).toFixed(2)}`,
          `API Sync: ARPU updated - Current: $${(15 + Math.random() * 10).toFixed(2)}`,
        ];
        message = events[Math.floor(Math.random() * events.length)];
      } else {
        const events = [
          `Affiliate Link Click: Redirect logged from ${country} [Geo checked]`,
          `S2S Postback: Conversion ID ${id} registered successfully`,
          `API Sync: Syncing partner portfolio data...`,
          `Webhook: User conversion pixel fired for user_${user}`,
        ];
        message = events[Math.floor(Math.random() * events.length)];
      }
      setLogs((prev) => [{ time: new Date().toLocaleTimeString(), message }, ...prev.slice(0, 19)]);
    }, 3000);
    return () => clearInterval(interval);
  }, [connectionStatus, selectedIndustry]);

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem('orch-onboarding-dismissed') === '1';
    } catch {
      return false;
    }
  });

  const selectedPeriod = useMemo(() => parseMonthYear(period), [period]);
  const now = new Date();
  const currentPeriod = formatMonthYear(now);
  const effectivePeriod = selectedPeriod || parseMonthYear(currentPeriod);
  const previousPeriod = useMemo(() => shiftPeriod(effectivePeriod, -1), [effectivePeriod]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    Object.entries(filters).forEach(([, value], idx) => {
      if (value !== Object.values(DEFAULT_FILTERS)[idx]) count += 1;
    });
    if (period !== currentPeriod) count += 1;
    return count;
  }, [filters, period, currentPeriod]);

  const existingTeams = useMemo(
    () => [...new Set(partners.map((p) => p.team).filter(Boolean))].sort(),
    [partners]
  );
  const existingGeos = useMemo(
    () => [...new Set(partners.map((p) => p.geo).filter(Boolean))].sort(),
    [partners]
  );

  const filteredPartners = useMemo(() => {
    let result = partners;
    if (selectedIndustry !== 'All') {
      result = result.filter((p) => (p.category || 'Gambling') === selectedIndustry);
    }
    if (filters.group !== 'All') result = result.filter((p) => p.group === filters.group);
    if (filters.team !== 'All') result = result.filter((p) => p.team === filters.team);
    if (filters.trafficSource !== 'All')
      result = result.filter((p) => p.trafficSource === filters.trafficSource);
    if (filters.geo !== 'All') result = result.filter((p) => p.geo === filters.geo);
    if (filters.funnelStatus !== 'All')
      result = result.filter((p) => p.funnelStatus === filters.funnelStatus);
    if (filters.agreement !== 'All')
      result = result.filter((p) => p.agreement === filters.agreement);
    return result;
  }, [partners, filters, selectedIndustry]);

  // Compute period metrics for a set of partners
  const computeMetrics = (partnerList, periodObj) => {
    const base = {
      totalPartners: partnerList.length,
      activePartners: partnerList.filter((p) => p.funnelStatus === 'Working').length,
      totalFtd: 0,
      totalClicks: 0,
      totalSpend: 0,
      totalRevenue: 0,
      totalCampaignsActive: 0,
      totalCampaigns: 0,
      totalFinance: 0,
      totalPaid: 0,
      totalDebt: 0,
      weightedRoiNum: 0,
      weightedRoiDen: 0,
      negativeRoiCount: 0,
      noCampaignPartners: 0,
      funnelCounts: {},
      topByFtd: null,
      topByRoi: null,
      newPartnersInPeriod: 0,
    };
    partnerList.forEach((partner) => {
      const campaigns = partner.campaigns || [];
      const pm = campaigns.reduce(
        (acc, c) => {
          const m = getCampaignMetricsForPeriod(c, periodObj);
          acc.ftd += Number(m.ftd || 0);
          acc.clicks += Number(m.clicks || 0);
          acc.spend += Number(c.spend || 0);
          acc.revenue += Number(c.revenue || 0);
          return acc;
        },
        { ftd: 0, clicks: 0, spend: 0, revenue: 0 }
      );
      const finance = getFinanceForPeriod(partner, getFinanceSummary(partner), periodObj);
      const partnerRoi = Number(partner.roi || 0);
      const partnerWeight = Math.max(1, pm.ftd || 0);
      base.totalFtd += pm.ftd;
      base.totalClicks += pm.clicks;
      base.totalSpend += pm.spend;
      base.totalRevenue += pm.revenue;
      base.totalCampaignsActive += Number(partner.campaignsActive || 0);
      base.totalCampaigns += Number(partner.campaignsTotal || campaigns.length || 0);
      base.totalFinance += Number(finance.total || 0);
      base.totalPaid += Number(finance.paid || 0);
      base.totalDebt += Number(finance.debt || 0);
      base.weightedRoiNum += partnerRoi * partnerWeight;
      base.weightedRoiDen += partnerWeight;
      if (partnerRoi < 0) base.negativeRoiCount += 1;
      if ((partner.campaignsActive || 0) === 0) base.noCampaignPartners += 1;
      const funnel = partner.funnelStatus || 'Unknown';
      base.funnelCounts[funnel] = (base.funnelCounts[funnel] || 0) + 1;
      if (!base.topByFtd || pm.ftd > base.topByFtd.value)
        base.topByFtd = { name: partner.name, value: pm.ftd };
      if (!base.topByRoi || partnerRoi > base.topByRoi.value)
        base.topByRoi = { name: partner.name, value: partnerRoi };
      if (partner.registrationDate) {
        const dt = new Date(partner.registrationDate);
        if (
          !Number.isNaN(dt.getTime()) &&
          dt.getFullYear() === periodObj.year &&
          dt.getMonth() + 1 === periodObj.month
        )
          base.newPartnersInPeriod += 1;
      }
    });
    const weightedCr = base.totalClicks > 0 ? (base.totalFtd / base.totalClicks) * 100 : 0;
    const avgRoi = base.weightedRoiDen > 0 ? base.weightedRoiNum / base.weightedRoiDen : 0;
    const avgCac = base.totalFtd > 0 ? base.totalSpend / base.totalFtd : 0;
    const avgFtdPerPartner = base.activePartners > 0 ? base.totalFtd / base.activePartners : 0;
    const profitability =
      base.totalSpend > 0
        ? ((base.totalRevenue - base.totalSpend) / base.totalSpend) * 100
        : avgRoi;
    return { ...base, weightedCr, avgRoi, avgCac, avgFtdPerPartner, profitability };
  };

  const current = useMemo(
    () => computeMetrics(filteredPartners, effectivePeriod),
    [filteredPartners, effectivePeriod]
  );
  const previous = useMemo(
    () => computeMetrics(filteredPartners, previousPeriod),
    [filteredPartners, previousPeriod]
  );

  const industryParams = useMemo(() => {
    const ftd = current.totalFtd;
    const clicks = current.totalClicks;
    const spend = current.totalSpend;
    const revenue = current.totalRevenue;
    const active = current.activePartners;

    // Simulate industry metrics from core metrics to make them mathematically coherent
    return {
      // Gambling
      ftd: ftd,
      deposits: Math.round(ftd * 2.8),
      ngr: Math.round(revenue * 0.72),
      ggr: Math.round(revenue * 0.95),
      activePlayers: Math.round(active * 18.5 + ftd * 0.45),
      ltv: active > 0 ? (revenue * 1.4) / active : 0,
      retentionRate: 35.5 + (ftd > 0 ? (active / ftd) * 15 : 0),
      cpa: ftd > 0 ? spend / ftd : 0,
      betVolume: Math.round(revenue * 12.5),

      // Ecommerce
      sales: Math.round(ftd * 1.5 + clicks * 0.02),
      rev: revenue,
      aov: ftd > 0 ? revenue / (ftd * 1.5) : 0,
      conversionRate: clicks > 0 ? (ftd / clicks) * 100 : 0,
      epc: clicks > 0 ? revenue / clicks : 0,
      itemsPerOrder: 2.3 + (clicks % 3) * 0.4,
      refundRate: 4.2 + (ftd % 5) * 1.1,
      repeatPurchaseRate: 22.4 + (active % 10) * 1.5,
      newVsReturning: 65.5, // 65% new, 35% returning

      // Fintech
      fundedAccounts: Math.round(ftd * 0.85),
      kycRate: 88.4 - (ftd % 10) * 0.8,
      depositsVolume: Math.round(revenue * 0.9),
      arpu: active > 0 ? revenue / active : 0,
      fintechLtv: active > 0 ? (revenue * 1.8) / active : 0,
      fintechCpa: ftd > 0 ? (spend * 0.9) / ftd : 0,
      cpl: clicks > 0 ? spend / clicks : 0,
      activeUsers: Math.round(active * 12.4),
      transactionVolume: Math.round(revenue * 8.4),
      loanApprovals: Math.round(ftd * 0.42),
    };
  }, [current, selectedIndustry]);

  const delta = (cur, prev) => (prev && prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null);

  // Agreement mix (counts by type)
  const agreementMix = useMemo(() => {
    const counts = { Revshare: 0, CPL: 0, Hybrid: 0 };
    filteredPartners.forEach((p) => {
      const ag = p.agreement || 'Revshare';
      if (counts[ag] !== undefined) counts[ag] += 1;
    });
    return counts;
  }, [filteredPartners]);

  // Task stats: open, overdue, high-priority open
  const taskStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let open = 0;
    let overdue = 0;
    let highPriority = 0;
    filteredPartners.forEach((partner) => {
      const items = Array.isArray(partner.tasks) ? partner.tasks : [];
      items.forEach((t) => {
        if (t.status === 'done') return;
        open += 1;
        if (t.priority === 'high') highPriority += 1;
        const d = t.deadline ? new Date(t.deadline) : null;
        if (d && !Number.isNaN(d.getTime()) && d < today) overdue += 1;
      });
    });
    return { open, overdue, highPriority };
  }, [filteredPartners]);

  // Geo breakdown (FTD by region)
  const geoBreakdown = useMemo(() => {
    const map = new Map();
    filteredPartners.forEach((partner) => {
      const geo = partner.geo || 'Unknown';
      const campaigns = partner.campaigns || [];
      const ftd = campaigns.reduce(
        (acc, c) => acc + Number(getCampaignMetricsForPeriod(c, effectivePeriod).ftd || 0),
        0
      );
      const entry = map.get(geo) || { name: geo, ftd: 0, count: 0 };
      map.set(geo, { name: geo, ftd: entry.ftd + ftd, count: entry.count + 1 });
    });
    return [...map.values()].sort((a, b) => b.ftd - a.ftd).slice(0, 8);
  }, [filteredPartners, effectivePeriod]);

  // Partners needing attention (declining ROI, no campaigns, high debt, overdue tasks)
  const partnersNeedingAttention = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    filteredPartners.forEach((partner) => {
      const roi = Number(partner.roi || 0);
      const campaignsActive = Number(partner.campaignsActive || 0);
      const debt = Number(getFinanceSummary(partner).debt || 0);
      const hasOverdue = (partner.tasks || []).some(
        (t) => t.status !== 'done' && t.deadline && new Date(t.deadline) < today
      );
      if (roi < 0 || campaignsActive === 0 || debt > 5000 || hasOverdue) count += 1;
    });
    return count;
  }, [filteredPartners]);

  // Pipeline conversion: Contacted -> Working rate
  const pipelineConversion = useMemo(() => {
    const contacted =
      (current.funnelCounts.Contacted || 0) +
      (current.funnelCounts['Proposal Sent'] || 0) +
      (current.funnelCounts['Meeting Scheduled'] || 0) +
      (current.funnelCounts['Agreed start date'] || 0);
    const working = current.funnelCounts.Working || 0;
    const total = current.totalPartners || 1;
    const rate = total > 0 ? (working / total) * 100 : 0;
    return { rate, working, total };
  }, [current.funnelCounts, current.totalPartners]);

  // ── Graph data ──────────────────────────────────────────────
  const graphData = useMemo(() => {
    const teamMap = new Map();
    const trafficMap = new Map();
    const partnerList = [];
    const trend = [];
    const funnel = Object.entries(current.funnelCounts).map(([name, value]) => ({ name, value }));

    filteredPartners.forEach((partner) => {
      const team = partner.team || 'Unknown';
      const traffic = partner.trafficSource || 'Unknown';
      const campaigns = partner.campaigns || [];
      const aggr = campaigns.reduce(
        (acc, c) => {
          const m = getCampaignMetricsForPeriod(c, effectivePeriod);
          const baseFtd = Number(c.ftd || 0);
          const ratio = baseFtd > 0 ? m.ftd / baseFtd : m.ftd > 0 ? 1 : 0;
          acc.ftd += Number(m.ftd || 0);
          acc.clicks += Number(m.clicks || 0);
          acc.spend += Number((Number(c.spend || 0) * ratio).toFixed(2));
          acc.revenue += Number((Number(c.revenue || 0) * ratio).toFixed(2));
          return acc;
        },
        { ftd: 0, clicks: 0, spend: 0, revenue: 0 }
      );

      const tp = teamMap.get(team) || { name: team, ftd: 0, clicks: 0, spend: 0, revenue: 0 };
      teamMap.set(team, {
        ...tp,
        ftd: tp.ftd + aggr.ftd,
        clicks: tp.clicks + aggr.clicks,
        spend: tp.spend + aggr.spend,
        revenue: tp.revenue + aggr.revenue,
      });

      const trp = trafficMap.get(traffic) || { name: traffic, ftd: 0, clicks: 0, crSum: 0, crN: 0 };
      trafficMap.set(traffic, {
        ...trp,
        ftd: trp.ftd + aggr.ftd,
        clicks: trp.clicks + aggr.clicks,
        crSum: trp.crSum + (aggr.clicks > 0 ? (aggr.ftd / aggr.clicks) * 100 : 0),
        crN: trp.crN + (aggr.clicks > 0 ? 1 : 0),
      });

      const roi =
        aggr.spend > 0
          ? ((aggr.revenue - aggr.spend) / aggr.spend) * 100
          : Number(partner.roi || 0);
      const cac = aggr.ftd > 0 ? aggr.spend / aggr.ftd : Number(partner.cac || 0);
      partnerList.push({
        name: partner.name,
        ftd: aggr.ftd,
        roi: Number(roi.toFixed(2)),
        cac: Number(cac.toFixed(2)),
      });
    });

    const teamPerformance = [...teamMap.values()].map((t) => ({
      name: t.name,
      ftd: t.ftd,
      clicks: t.clicks,
      roi: t.spend > 0 ? Number((((t.revenue - t.spend) / t.spend) * 100).toFixed(1)) : 0,
    }));
    const trafficPerformance = [...trafficMap.values()].map((t) => ({
      name: t.name,
      ftd: t.ftd,
      clicks: t.clicks,
      cr: t.crN > 0 ? Number((t.crSum / t.crN).toFixed(2)) : 0,
    }));
    const topPartners = partnerList.sort((a, b) => b.ftd - a.ftd).slice(0, 8);

    for (let i = -5; i <= 0; i += 1) {
      const p = shiftPeriod(effectivePeriod, i);
      let ftd = 0;
      let clicks = 0;
      let fin = 0;
      filteredPartners.forEach((partner) => {
        (partner.campaigns || []).forEach((c) => {
          const m = getCampaignMetricsForPeriod(c, p);
          ftd += Number(m.ftd || 0);
          clicks += Number(m.clicks || 0);
        });
        fin += Number(getFinanceForPeriod(partner, getFinanceSummary(partner), p).total || 0);
      });
      trend.push({ period: p.label, ftd, clicks, finance: Number(fin.toFixed(2)) });
    }

    return { teamPerformance, trafficPerformance, topPartners, trend, funnel };
  }, [filteredPartners, effectivePeriod, current.funnelCounts]);

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;
  if (error)
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error.main">Failed to load: {error}</Typography>
      </Box>
    );

  const periodName = `${MONTH_NAMES[effectivePeriod.month - 1]} ${effectivePeriod.year}`;
  const prevPeriodName = `${MONTH_NAMES[previousPeriod.month - 1]} ${previousPeriod.year}`;

  const dismissOnboarding = () => {
    setOnboardingDismissed(true);
    try {
      localStorage.setItem('orch-onboarding-dismissed', '1');
    } catch {}
  };

  const subtitle = `${periodName} · ${current.totalPartners} partners · ${current.activePartners} active`;

  return (
    <PageLayout title="Dashboard" subtitle={subtitle} maxWidth={1600} showTitleBlock={false}>
      <BentoCard
        title="Dashboard"
        explain
        noTour
        subtitle={
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: showMetrics ? 0.75 : 0 }}
            >
              KPIs, health, and analytics
            </Typography>
            <Collapse in={showMetrics}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    mr: 0.5,
                  }}
                >
                  Agreement mix
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    size="small"
                    label={`Revshare ${agreementMix.Revshare}`}
                    sx={{
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      color: 'primary.main',
                      fontWeight: 600,
                    }}
                  />
                  <Chip
                    size="small"
                    label={`CPL ${agreementMix.CPL}`}
                    sx={{
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      color: 'primary.main',
                      fontWeight: 600,
                    }}
                  />
                  <Chip
                    size="small"
                    label={`Hybrid ${agreementMix.Hybrid}`}
                    sx={{
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.success.main, 0.1),
                      color: 'success.main',
                      fontWeight: 600,
                    }}
                  />
                </Stack>
                <Divider orientation="vertical" flexItem sx={{ borderColor: 'divider', mx: 0.5 }} />
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Tasks
                </Typography>
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <Chip
                    size="small"
                    label={`Open ${taskStats.open}`}
                    sx={{ borderRadius: 1.5, fontWeight: 600 }}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    label={`Overdue ${taskStats.overdue}`}
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
                      bgcolor:
                        taskStats.overdue > 0 ? alpha(theme.palette.error.main, 0.1) : undefined,
                      color: taskStats.overdue > 0 ? 'error.main' : undefined,
                    }}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    label={`High priority ${taskStats.highPriority}`}
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
                      bgcolor:
                        taskStats.highPriority > 0
                          ? alpha(theme.palette.warning.main, 0.1)
                          : undefined,
                      color: taskStats.highPriority > 0 ? 'warning.dark' : undefined,
                    }}
                    variant="outlined"
                  />
                </Stack>
              </Box>
            </Collapse>
          </>
        }
        icon={DashboardCustomizeIcon}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* Stat cards - same style as Permissions/Projects */}
        <Collapse in={showMetrics}>
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(3, minmax(0, 1fr))',
                  lg: 'repeat(5, minmax(0, 1fr))',
                },
              }}
            >
              {[
                {
                  label: 'Total FTD',
                  value: current.totalFtd.toLocaleString(),
                  helper: `Prev: ${previous.totalFtd.toLocaleString()}${delta(current.totalFtd, previous.totalFtd) != null ? ` (${delta(current.totalFtd, previous.totalFtd) > 0 ? '+' : ''}${delta(current.totalFtd, previous.totalFtd).toFixed(1)}%)` : ''}`,
                  color: theme.palette.success.main,
                  icon: TrendingUpIcon,
                },
                {
                  label: 'Total Clicks',
                  value: current.totalClicks.toLocaleString(),
                  helper: `Prev: ${previous.totalClicks.toLocaleString()}${delta(current.totalClicks, previous.totalClicks) != null ? ` (${delta(current.totalClicks, previous.totalClicks) > 0 ? '+' : ''}${delta(current.totalClicks, previous.totalClicks).toFixed(1)}%)` : ''}`,
                  color: theme.palette.primary.main,
                  icon: MouseOutlinedIcon,
                },
                {
                  label: 'Avg ROI',
                  value: `${current.avgRoi > 0 ? '+' : ''}${formatPercent(current.avgRoi)}`,
                  helper: `Prev: ${formatPercent(previous.avgRoi)}${delta(current.avgRoi, previous.avgRoi) != null ? ` (${delta(current.avgRoi, previous.avgRoi) > 0 ? '+' : ''}${delta(current.avgRoi, previous.avgRoi).toFixed(1)} pp)` : ''}`,
                  color:
                    current.avgRoi >= 0 ? theme.palette.success.main : theme.palette.error.main,
                  icon: PercentIcon,
                },
                {
                  label: 'Total Revenue',
                  value: formatCurrency(current.totalRevenue),
                  helper: `Prev: ${formatCurrency(previous.totalRevenue)}${delta(current.totalRevenue, previous.totalRevenue) != null ? ` (${delta(current.totalRevenue, previous.totalRevenue) > 0 ? '+' : ''}${delta(current.totalRevenue, previous.totalRevenue).toFixed(1)}%)` : ''}`,
                  color: theme.palette.primary.main,
                  icon: AttachMoneyOutlinedIcon,
                },
                {
                  label: 'Partners',
                  value: current.totalPartners,
                  helper: `${current.activePartners} active`,
                  color: theme.palette.primary.main,
                  icon: GroupsOutlinedIcon,
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <Paper
                    key={card.label}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(card.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontWeight: 600 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'text.primary',
                            lineHeight: 1.15,
                            mt: 0.45,
                          }}
                        >
                          {card.value}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                        >
                          {card.helper}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          bgcolor: alpha(card.color, 0.16),
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        </Collapse>

        {/* ── TOOLBAR: Period + Filters ──────────────────────── */}
        <Box
          sx={{
            p: 1.25,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AppIcon
              name="CalendarMonth"
              fallback={CalendarMonthIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {periodName}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => setIndustryAnchorEl(e.currentTarget)}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: 'divider',
                color: 'text.secondary',
              }}
            >
              Select Industry: {selectedIndustry === 'All' ? 'All' : selectedIndustry}
            </Button>

            <Popover
              open={Boolean(industryAnchorEl)}
              anchorEl={industryAnchorEl}
              onClose={() => setIndustryAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    p: 1,
                    borderRadius: 2.5,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    minWidth: 160,
                  },
                },
              }}
            >
              <Stack spacing={0.5}>
                {['Gambling', 'Ecommerce', 'Fintech'].map((ind) => (
                  <Button
                    key={ind}
                    size="small"
                    onClick={() => {
                      setSelectedIndustry(ind);
                      setIndustryAnchorEl(null);
                    }}
                    sx={{
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      fontWeight: selectedIndustry === ind ? 700 : 500,
                      bgcolor:
                        selectedIndustry === ind
                          ? alpha(theme.palette.primary.main, 0.1)
                          : 'transparent',
                      color: selectedIndustry === ind ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {ind}
                  </Button>
                ))}
                <Divider sx={{ my: 0.5 }} />
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedIndustry('All');
                    setIndustryAnchorEl(null);
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontWeight: selectedIndustry === 'All' ? 700 : 500,
                    color: 'text.secondary',
                  }}
                >
                  Show All
                </Button>
              </Stack>
            </Popover>

            <Badge
              color="secondary"
              overlap="circular"
              badgeContent={activeFiltersCount}
              invisible={activeFiltersCount === 0}
            >
              <Button
                startIcon={<AppIcon name="Tune" fallback={TuneIcon} />}
                variant="outlined"
                size="small"
                onClick={(e) => setFilterAnchorEl(e.currentTarget)}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: 'divider',
                  color: 'text.secondary',
                }}
              >
                Filters
              </Button>
            </Badge>
          </Box>
        </Box>

        <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.5, pb: 1.5 }}>
          {/* ── INDUSTRY PARAMETERS & LIVE DATA STREAM ─────────────── */}
          <Section
            title={`Industry Integration Console - ${selectedIndustry === 'All' ? 'All Verticals' : selectedIndustry}`}
          >
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 3,
                bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : '#F8FAFC'),
                border: '1px solid',
                borderColor: 'divider',
                backdropFilter: 'blur(10px)',
                mb: 2.5,
              }}
            >
              {/* Header and Connection Type toggle */}
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                  mb: 3,
                }}
              >
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor:
                          connectionStatus === 'connected'
                            ? 'success.main'
                            : connectionStatus === 'connecting'
                              ? 'warning.main'
                              : 'text.disabled',
                        animation:
                          connectionStatus === 'connected' ? 'pulse 1.5s infinite' : 'none',
                        '@keyframes pulse': {
                          '0%': { transform: 'scale(1)', opacity: 1 },
                          '50%': { transform: 'scale(1.4)', opacity: 0.4 },
                          '100%': { transform: 'scale(1)', opacity: 1 },
                        },
                      }}
                    />
                    Integration Connection: {connectionType}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Review and verify parameters received from S2S, APIs, redirects and webhooks.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {[
                    'S2S Connection',
                    'API Integration',
                    'Affiliate Link',
                    'Webhook Integration',
                  ].map((conn) => (
                    <Chip
                      key={conn}
                      label={conn}
                      size="small"
                      onClick={() => setConnectionType(conn)}
                      variant={connectionType === conn ? 'filled' : 'outlined'}
                      color={connectionType === conn ? 'primary' : 'default'}
                      sx={{ fontWeight: 600, fontSize: '0.72rem' }}
                    />
                  ))}
                  <Button
                    size="small"
                    variant="contained"
                    disabled={connectionStatus === 'connecting'}
                    onClick={() => {
                      setConnectionStatus('connecting');
                      setTimeout(() => {
                        setConnectionStatus('connected');
                      }, 1200);
                    }}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      ml: 1,
                      height: 26,
                      fontSize: '0.75rem',
                      borderRadius: 1.5,
                    }}
                  >
                    {connectionStatus === 'connected' ? 'Reconnect' : 'Connect'}
                  </Button>
                </Stack>
              </Box>

              {/* Parameters Grid */}
              <Typography
                variant="overline"
                sx={{
                  fontWeight: 700,
                  color: 'text.secondary',
                  letterSpacing: '0.08em',
                  fontSize: '0.7rem',
                  display: 'block',
                  mb: 1.5,
                }}
              >
                Industry Parameters & Resolved Results
              </Typography>

              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(0, 1fr))',
                    md: 'repeat(3, minmax(0, 1fr))',
                    lg: 'repeat(4, minmax(0, 1fr))',
                  },
                  mb: 3,
                }}
              >
                {/* We map the selected industry's parameters, or all if 'All' */}
                {(() => {
                  const industriesToRender =
                    selectedIndustry === 'All'
                      ? ['Gambling', 'Ecommerce', 'Fintech']
                      : [selectedIndustry];

                  return industriesToRender.flatMap((ind) => {
                    const metrics = INDUSTRY_METRICS[ind];
                    return metrics.map((m) => {
                      let valDisplay = '-';
                      const v = industryParams[m.key];

                      // Formatting based on type
                      if (
                        m.key.toLowerCase().includes('rate') ||
                        m.key.toLowerCase().includes('cvr') ||
                        m.key.toLowerCase().includes('kyc')
                      ) {
                        valDisplay = formatPercent(v);
                      } else if (
                        m.key.toLowerCase().includes('volume') ||
                        m.key === 'ngr' ||
                        m.key === 'ggr' ||
                        m.key === 'ltv' ||
                        m.key === 'arpu' ||
                        m.key === 'cpa' ||
                        m.key === 'cpl' ||
                        m.key === 'revenue' ||
                        m.key === 'rev' ||
                        m.key === 'aov'
                      ) {
                        valDisplay = formatCurrency(v);
                      } else {
                        valDisplay = Number(v || 0).toLocaleString();
                      }

                      const isMatchingConn = m.source === connectionType;

                      return (
                        <Paper
                          key={`${ind}-${m.key}`}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 2.5,
                            border: '1px solid',
                            borderColor: isMatchingConn ? 'primary.main' : 'divider',
                            bgcolor: isMatchingConn
                              ? alpha(theme.palette.primary.main, 0.03)
                              : 'background.paper',
                            boxShadow: isMatchingConn
                              ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.08)}`
                              : 'none',
                            position: 'relative',
                            transition: 'all 0.2s',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              mb: 1,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                fontSize: '0.66rem',
                                textTransform: 'uppercase',
                              }}
                            >
                              {ind} Vertical
                            </Typography>
                            <Chip
                              label={m.source}
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.55rem',
                                fontWeight: 700,
                                bgcolor: isMatchingConn
                                  ? 'primary.main'
                                  : alpha(theme.palette.text.secondary, 0.1),
                                color: isMatchingConn ? '#fff' : 'text.secondary',
                              }}
                            />
                          </Box>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              color: 'text.primary',
                              mb: 0.5,
                            }}
                            noWrap
                          >
                            {m.label}
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
                            {valDisplay}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              minHeight: 32,
                              fontSize: '0.72rem',
                              lineHeight: 1.25,
                            }}
                          >
                            {m.desc}
                          </Typography>
                        </Paper>
                      );
                    });
                  });
                })()}
              </Box>

              {/* Real-time Stream Terminal */}
              <Box
                sx={{
                  bgcolor: (t) => (t.palette.mode === 'dark' ? '#0F172A' : '#1E293B'),
                  borderRadius: 2.5,
                  p: 2,
                  fontFamily: 'monospace',
                  color: '#38BDF8',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                    borderBottom: '1px solid #334155',
                    pb: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#94A3B8' }}
                  >
                    LIVE DATA VERIFIER & STREAM LOGS (Sync Frequency: 3.0s)
                  </Typography>
                  <Chip
                    label={connectionStatus === 'connected' ? 'RECEIVING LIVE' : 'STREAM OFFLINE'}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      bgcolor:
                        connectionStatus === 'connected'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color: connectionStatus === 'connected' ? '#34D399' : '#F87171',
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    minHeight: 120,
                    maxHeight: 180,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                  }}
                >
                  {connectionStatus === 'connecting' && (
                    <Typography variant="body2" sx={{ color: '#FACC15', fontStyle: 'italic' }}>
                      Establishing secure SSL channel... verifying handshake keys...
                    </Typography>
                  )}
                  {connectionStatus === 'connected' && logs.length === 0 && (
                    <Typography variant="body2" sx={{ color: '#64748B', fontStyle: 'italic' }}>
                      Awaiting connection payload packets...
                    </Typography>
                  )}
                  {connectionStatus === 'connected' &&
                    logs.map((log, idx) => (
                      <Typography
                        key={idx}
                        variant="caption"
                        sx={{
                          display: 'block',
                          fontSize: '0.75rem',
                          color: idx === 0 ? '#38BDF8' : '#64748B',
                        }}
                      >
                        <span style={{ color: '#34D399' }}>[{log.time}]</span> {log.message}
                      </Typography>
                    ))}
                  {connectionStatus === 'disconnected' && (
                    <Typography variant="body2" sx={{ color: '#EF4444', fontStyle: 'italic' }}>
                      Offline. Click "Connect" to start receiving.
                    </Typography>
                  )}
                </Box>
              </Box>
            </Paper>
          </Section>

          {/* ── ONBOARDING HINT ─────────────────────────────────── */}
          {!onboardingDismissed && (
            <Paper
              variant="outlined"
              sx={{
                mb: 2,
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                borderRadius: 2.5,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                borderColor: alpha(theme.palette.primary.main, 0.2),
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>
                  Getting started
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Use global search (⌘K) to find partners, tasks, and meetings. Visit Settings to
                  manage your profile.
                </Typography>
              </Box>
              <Button
                size="small"
                onClick={dismissOnboarding}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Dismiss
              </Button>
            </Paper>
          )}

          {/* ── FILTER POPOVER ──────────────────────────────────── */}
          <Popover
            open={Boolean(filterAnchorEl)}
            anchorEl={filterAnchorEl}
            onClose={() => setFilterAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1,
                  p: 0,
                  width: 430,
                  maxWidth: 'calc(100% - 24px)',
                  borderRadius: 3,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                  overflow: 'hidden',
                },
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                }}
              >
                <AppIcon name="TuneRounded" fallback={TuneRoundedIcon} sx={{ fontSize: 22 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Filters
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.25 }}
                >
                  Period, group, team, funnel & more
                </Typography>
              </Box>
              <Button
                size="small"
                onClick={() => {
                  setFilters({ ...DEFAULT_FILTERS });
                  setPeriod(currentPeriod);
                }}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  color: '#fff',
                  bgcolor: 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' },
                  borderRadius: 2,
                }}
              >
                Reset all
              </Button>
            </Box>
            <Box sx={{ p: 2 }}>
              <TextField
                label="Period (MM/YYYY)"
                size="small"
                fullWidth
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                error={Boolean(period) && !selectedPeriod}
                helperText={Boolean(period) && !selectedPeriod ? 'Use MM/YYYY format' : ''}
                sx={{ mb: 1.5 }}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Group</InputLabel>
                  <Select
                    value={filters.group}
                    label="Group"
                    onChange={(e) => setFilters((p) => ({ ...p, group: e.target.value }))}
                  >
                    <MenuItem value="All">All</MenuItem>
                    {GROUP_TYPES.map((g) => (
                      <MenuItem key={g} value={g}>
                        {g}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Team</InputLabel>
                  <Select
                    value={filters.team}
                    label="Team"
                    onChange={(e) => setFilters((p) => ({ ...p, team: e.target.value }))}
                  >
                    <MenuItem value="All">All</MenuItem>
                    {existingTeams.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Traffic</InputLabel>
                  <Select
                    value={filters.trafficSource}
                    label="Traffic"
                    onChange={(e) => setFilters((p) => ({ ...p, trafficSource: e.target.value }))}
                  >
                    <MenuItem value="All">All</MenuItem>
                    {TRAFFIC_SOURCES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Geo</InputLabel>
                  <Select
                    value={filters.geo}
                    label="Geo"
                    onChange={(e) => setFilters((p) => ({ ...p, geo: e.target.value }))}
                  >
                    <MenuItem value="All">All</MenuItem>
                    {existingGeos.map((g) => (
                      <MenuItem key={g} value={g}>
                        {g}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Funnel</InputLabel>
                  <Select
                    value={filters.funnelStatus}
                    label="Funnel"
                    onChange={(e) => setFilters((p) => ({ ...p, funnelStatus: e.target.value }))}
                  >
                    <MenuItem value="All">All</MenuItem>
                    {[
                      'Contacted',
                      'Proposal Sent',
                      'Meeting Scheduled',
                      'Agreed start date',
                      'Working',
                    ].map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Agreement</InputLabel>
                  <Select
                    value={filters.agreement}
                    label="Agreement"
                    onChange={(e) => setFilters((p) => ({ ...p, agreement: e.target.value }))}
                  >
                    <MenuItem value="All">All</MenuItem>
                    {['Revshare', 'CPL', 'Hybrid'].map((a) => (
                      <MenuItem key={a} value={a}>
                        {a}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Month</InputLabel>
                  <Select
                    value={effectivePeriod.month}
                    label="Month"
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setPeriod(`${String(m).padStart(2, '0')}/${effectivePeriod.year}`);
                    }}
                  >
                    {MONTH_NAMES.map((n, i) => (
                      <MenuItem key={n} value={i + 1}>
                        {n}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={effectivePeriod.year}
                    label="Year"
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setPeriod(`${String(effectivePeriod.month).padStart(2, '0')}/${y}`);
                    }}
                  >
                    {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                      <MenuItem key={y} value={y}>
                        {y}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </Popover>

          {/* ── HEALTH & RISK ────────────────────────────────────── */}
          <Collapse in={showMetrics}>
            <Section title="Health & Risk Snapshot">
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.25,
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(0, 1fr))',
                    md: 'repeat(3, minmax(0, 1fr))',
                    lg: 'repeat(5, minmax(0, 1fr))',
                  },
                }}
              >
                {[
                  {
                    label: 'Needs Attention',
                    value: partnersNeedingAttention,
                    helper: 'Declining ROI, no campaigns, debt, overdue',
                    color:
                      partnersNeedingAttention > 5
                        ? theme.palette.error.main
                        : partnersNeedingAttention > 0
                          ? theme.palette.warning.main
                          : theme.palette.success.main,
                    icon: partnersNeedingAttention > 0 ? WarningAmberIcon : CheckCircleOutlineIcon,
                  },
                  {
                    label: 'Negative ROI',
                    value: current.negativeRoiCount,
                    helper: 'Partners with ROI below zero',
                    color:
                      current.negativeRoiCount > 2
                        ? theme.palette.error.main
                        : current.negativeRoiCount > 0
                          ? theme.palette.warning.main
                          : theme.palette.success.main,
                    icon: current.negativeRoiCount > 0 ? ErrorOutlineIcon : CheckCircleOutlineIcon,
                  },
                  {
                    label: 'Total Debt',
                    value: formatCurrency(current.totalDebt),
                    helper: 'Outstanding partner debt',
                    color:
                      current.totalDebt > 10000
                        ? theme.palette.error.main
                        : current.totalDebt > 0
                          ? theme.palette.warning.main
                          : theme.palette.success.main,
                    icon: WarningAmberIcon,
                  },
                  {
                    label: 'No Active Campaigns',
                    value: `${current.noCampaignPartners} partners`,
                    helper: 'Partners without running campaigns',
                    color:
                      current.noCampaignPartners > 3
                        ? theme.palette.warning.main
                        : current.noCampaignPartners > 0
                          ? theme.palette.info.main
                          : theme.palette.success.main,
                    icon:
                      current.noCampaignPartners > 0 ? WarningAmberIcon : CheckCircleOutlineIcon,
                  },
                  {
                    label: 'New Partners',
                    value: current.newPartnersInPeriod,
                    helper: 'Joined this period',
                    color:
                      current.newPartnersInPeriod > 0
                        ? theme.palette.success.main
                        : theme.palette.text.secondary,
                    icon: CheckCircleOutlineIcon,
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <Paper
                      key={card.label}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: 2.5,
                        border: '1px solid',
                        borderColor: alpha(card.color, 0.22),
                        background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontWeight: 600 }}
                          >
                            {card.label}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '1.35rem',
                              fontWeight: 800,
                              color: 'text.primary',
                              lineHeight: 1.15,
                              mt: 0.45,
                            }}
                          >
                            {card.value}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                          >
                            {card.helper}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 2,
                            bgcolor: alpha(card.color, 0.16),
                            color: card.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                        </Box>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
              <Box
                sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}
              >
                <Chip
                  size="small"
                  label={`Paid ${formatCurrency(current.totalPaid)}`}
                  sx={{
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.success.main, 0.12),
                    color: 'success.main',
                    fontWeight: 600,
                  }}
                />
                <Chip
                  size="small"
                  label={`Debt ${formatCurrency(current.totalDebt)}`}
                  sx={{
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.error.main, 0.12),
                    color: 'error.main',
                    fontWeight: 600,
                  }}
                />
                <Chip
                  size="small"
                  label={`Pipeline: ${pipelineConversion.working} Working of ${pipelineConversion.total} (${pipelineConversion.rate.toFixed(1)}%)`}
                  sx={{ borderRadius: 1.5, fontWeight: 600 }}
                  variant="outlined"
                />
              </Box>
            </Section>
          </Collapse>

          {/* ── GEO BREAKDOWN ────────────────────────────────────── */}
          {geoBreakdown.length > 0 && (
            <Section title="Geo / Region Performance">
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
                    alignItems: 'start',
                  }}
                >
                  <Box sx={{ height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart
                        data={geoBreakdown}
                        layout="vertical"
                        margin={{ left: 40, right: 40 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke={theme.palette.divider}
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={60}
                          tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <RechartsTooltip
                          formatter={(v) => [v, 'FTD']}
                          contentStyle={{
                            borderRadius: 8,
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          }}
                        />
                        <Bar dataKey="ftd" name="FTD" fill="#10B981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                  <Stack spacing={0.75}>
                    {geoBreakdown.slice(0, 5).map((g) => (
                      <Box
                        key={g.name}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                          {g.name}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${g.ftd} FTD · ${g.count} partners`}
                          sx={{ fontSize: '0.7rem', height: 22 }}
                          variant="outlined"
                        />
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Paper>
            </Section>
          )}

          {/* ── SECONDARY METRICS ───────────────────────────────── */}
          <Section title="Portfolio Breakdown">
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(3, 1fr)',
                    md: 'repeat(6, 1fr)',
                    xl: 'repeat(9, 1fr)',
                  },
                  gap: 2,
                }}
              >
                <StatBlock
                  label="Active Campaigns"
                  value={`${current.totalCampaignsActive}`}
                  caption={`of ${current.totalCampaigns} total`}
                />
                <StatBlock label="Weighted CR%" value={formatPercent(current.weightedCr)} />
                <StatBlock
                  label="Avg CAC"
                  value={current.avgCac > 0 ? formatCurrency(current.avgCac) : '-'}
                />
                <StatBlock label="Total Spend" value={formatCurrency(current.totalSpend)} />
                <StatBlock
                  label="Total Finance"
                  value={formatCurrency(current.totalFinance)}
                  caption={`Paid ${formatCurrency(current.totalPaid)}`}
                />
                <StatBlock
                  label="Profitability"
                  value={`${current.profitability > 0 ? '+' : ''}${formatPercent(current.profitability)}`}
                  color={current.profitability >= 0 ? 'success.main' : 'error.main'}
                />
                <StatBlock
                  label="Avg FTD / Active Partner"
                  value={current.avgFtdPerPartner.toFixed(1)}
                />
                <StatBlock
                  label="Top by FTD"
                  value={current.topByFtd?.name || '-'}
                  caption={current.topByFtd ? `${current.topByFtd.value} FTD` : ''}
                />
                <StatBlock
                  label="Top by ROI"
                  value={current.topByRoi?.name || '-'}
                  caption={current.topByRoi ? `${current.topByRoi.value.toFixed(1)}%` : ''}
                />
              </Box>
            </Paper>
          </Section>

          {/* ── CHARTS ──────────────────────────────────────────── */}
          <Section title="Trends & Analysis">
            <Box
              sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' } }}
            >
              {/* 6-month trend */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  6-Month Trend
                </Typography>
                <Box sx={{ height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={graphData.trend}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={theme.palette.divider}
                      />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="ftd"
                        name="FTD"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="clicks"
                        name="Clicks"
                        stroke="#3B82F6"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="finance"
                        name="Finance"
                        stroke="#8B5CF6"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              {/* Team performance */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Team Performance
                </Typography>
                <Box sx={{ height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={graphData.teamPerformance}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={theme.palette.divider}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="roi"
                        orientation="right"
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="ftd"
                        name="FTD"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="clicks"
                        name="Clicks"
                        fill="#3B82F6"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="roi"
                        type="monotone"
                        dataKey="roi"
                        name="ROI%"
                        stroke="#EF4444"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              {/* Traffic source quality */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Traffic Source Quality
                </Typography>
                <Box sx={{ height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={graphData.trafficPerformance}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={theme.palette.divider}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="cr"
                        orientation="right"
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="ftd"
                        name="FTD"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="cr"
                        type="monotone"
                        dataKey="cr"
                        name="CR%"
                        stroke="#8B5CF6"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              {/* Top partners ROI vs CAC */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Top Partners - ROI vs CAC
                </Typography>
                <Box sx={{ height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={graphData.topPartners}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={theme.palette.divider}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={55}
                      />
                      <YAxis
                        yAxisId="cac"
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="roi"
                        orientation="right"
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        formatter={(v, n) =>
                          n === 'CAC' ? formatCurrency(v) : `${Number(v).toFixed(1)}%`
                        }
                        contentStyle={{
                          borderRadius: 8,
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="cac"
                        dataKey="cac"
                        name="CAC"
                        fill="#0EA5E9"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="roi"
                        type="monotone"
                        dataKey="roi"
                        name="ROI"
                        stroke="#8B5CF6"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Box>
          </Section>

          {/* ── FUNNEL ──────────────────────────────────────────── */}
          <Section title="Funnel Distribution">
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                  alignItems: 'center',
                }}
              >
                <Stack spacing={1}>
                  {Object.entries(current.funnelCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => {
                      const pct =
                        current.totalPartners > 0
                          ? ((count / current.totalPartners) * 100).toFixed(1)
                          : 0;
                      const barColor = FUNNEL_COLORS[status] || '#94A3B8';
                      return (
                        <Box key={status}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                            >
                              {status}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.72rem' }}
                            >
                              {count} ({pct}%)
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              width: '100%',
                              height: 8,
                              bgcolor:
                                theme.palette.background.neutral || theme.palette.action.hover,
                              borderRadius: 4,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              sx={{
                                width: `${pct}%`,
                                height: '100%',
                                bgcolor: barColor,
                                borderRadius: 4,
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </Box>
                        </Box>
                      );
                    })}
                </Stack>
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={graphData.funnel}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {graphData.funnel.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={
                              FUNNEL_COLORS[entry.name] ||
                              CHART_COLORS[graphData.funnel.indexOf(entry) % CHART_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </Paper>
          </Section>
        </Box>
      </BentoCard>
    </PageLayout>
  );
}
