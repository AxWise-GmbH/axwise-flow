import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrow';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import WebOutlinedIcon from '@mui/icons-material/WebOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LinkIcon from '@mui/icons-material/Link';
import DataObjectIcon from '@mui/icons-material/DataObject';
import KeyIcon from '@mui/icons-material/Key';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import CellTowerOutlinedIcon from '@mui/icons-material/CellTowerOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import StopIcon from '@mui/icons-material/Stop';
import InputAdornment from '@mui/material/InputAdornment';
import {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PageLayout from '../components/Common/PageLayout';
import FormDialog from '../components/Common/FormDialog';
import BentoCard from '../components/Common/BentoCard';
import MetricsToggleButton from '../components/Common/MetricsToggleButton';
import { createHoverGlowShadow } from '../theme/hoverGlow';
import { useShowMetrics } from '../hooks/useShowMetrics';
import AiOrb from '../components/VoiceControl/AiOrb';
import CategoryMenu from '../components/DataPage/CategoryMenu';
import SectionMenu from '../components/DataPage/SectionMenu';
import ProcessGuide from '../components/DataGuides/ProcessGuide';
import { getAuthHeaders } from '../lib/supabaseEdge';

import AppIcon from '../components/icons/AppIcon';

/* ──────────── CONSTANTS ──────────── */

const TYPE_META = {
  table: { color: '#2563EB', icon: TableChartOutlinedIcon, label: 'Table' },
  view: { color: '#7C3AED', icon: ViewListOutlinedIcon, label: 'View' },
  function: { color: '#0EA5E9', icon: FunctionsOutlinedIcon, label: 'Function' },
  trigger: { color: '#0891B2', icon: BoltOutlinedIcon, label: 'Trigger' },
  api: { color: '#1D4ED8', icon: ApiOutlinedIcon, label: 'API Route' },
  realtime: { color: '#0D9488', icon: SyncAltIcon, label: 'Realtime' },
  'edge-function': { color: '#0284C7', icon: CloudOutlinedIcon, label: 'Edge Function' },
  storage: { color: '#059669', icon: StorageOutlinedIcon, label: 'Storage' },
  auth: { color: '#9333EA', icon: LockOutlinedIcon, label: 'Auth' },
  service: { color: '#334155', icon: CloudOutlinedIcon, label: 'Service' },
  frontend: { color: '#7C3AED', icon: WebOutlinedIcon, label: 'Page' },
  security: { color: '#B91C1C', icon: SecurityOutlinedIcon, label: 'Security' },
  cron: { color: '#F59E0B', icon: ScheduleOutlinedIcon, label: 'Cron Job' },
  llm: { color: '#9333EA', icon: PsychologyOutlinedIcon, label: 'LLM Provider' },
  agent: { color: '#EC4899', icon: SmartToyOutlinedIcon, label: 'Agent Handler' },
  webhook: { color: '#06B6D4', icon: CellTowerOutlinedIcon, label: 'Webhook' },
};

const HEALTH_COLORS = {
  healthy: '#16A34A',
  warning: '#F59E0B',
  critical: '#DC2626',
};

const RELATIONSHIP_META = {
  'foreign-key': {
    color: '#64748B',
    label: 'REFERENCES',
    channel: 'Relational integrity',
    dasharray: '6 4',
    width: 2,
    pulseSpeed: '3.4s',
  },
  'api-call': {
    color: '#2563EB',
    label: 'CALLS',
    channel: 'Frontend to API',
    dasharray: null,
    width: 2.2,
    pulseSpeed: '2.1s',
  },
  'service-call': {
    color: '#0284C7',
    label: 'PROCESSES',
    channel: 'API to service',
    dasharray: null,
    width: 2.1,
    pulseSpeed: '2.2s',
  },
  security: {
    color: '#DC2626',
    label: 'PROTECTED_BY',
    channel: 'Policy enforcement',
    dasharray: '2 3',
    width: 2.2,
    pulseSpeed: '1.9s',
  },
  'assistant-flow': {
    color: '#9333EA',
    label: 'REASONS_WITH',
    channel: 'LLM reasoning',
    dasharray: '4 4',
    width: 2.4,
    pulseSpeed: '1.8s',
  },
  'workflow-flow': {
    color: '#7C3AED',
    label: 'ORCHESTRATES',
    channel: 'Automation pipeline',
    dasharray: '3 4',
    width: 2.2,
    pulseSpeed: '2.0s',
  },
  usage: {
    color: '#10B981',
    label: 'READS_FROM',
    channel: 'Read consumption',
    dasharray: '8 4',
    width: 1.8,
    pulseSpeed: '2.8s',
  },
  'data-flow': {
    color: '#059669',
    label: 'STORES_IN',
    channel: 'Transactional data path',
    dasharray: null,
    width: 2.0,
    pulseSpeed: '2.4s',
  },
  'cron-trigger': {
    color: '#F59E0B',
    label: 'TRIGGERS',
    channel: 'Scheduled execution',
    dasharray: '4 2',
    width: 2.0,
    pulseSpeed: '2.1s',
  },
  'backup-read': {
    color: '#7C3AED',
    label: 'BACKS_UP',
    channel: 'Recovery path',
    dasharray: '3 3',
    width: 1.6,
    pulseSpeed: '2.9s',
  },
  'deploy-trigger': {
    color: '#F97316',
    label: 'DEPLOYS_VIA',
    channel: 'CI/CD pipeline',
    dasharray: '5 3',
    width: 2.2,
    pulseSpeed: '1.8s',
  },
  default: {
    color: '#94A3B8',
    label: 'CONNECTS',
    channel: 'General link',
    dasharray: null,
    width: 1.8,
    pulseSpeed: '2.6s',
  },
};

const CATEGORY_LANES = {
  frontend: { x: 80, label: 'Frontend', color: '#7C3AED' },
  api: { x: 460, label: 'API Routes', color: '#1D4ED8' },
  communication: { x: 840, label: 'Communication', color: '#06B6D4' },
  agents: { x: 1220, label: 'Agents', color: '#9333EA' },
  teams: { x: 1600, label: 'Teams', color: '#F97316' },
  consilium: { x: 1980, label: 'Consilium', color: '#D946EF' },
  llm: { x: 2360, label: 'LLM Providers', color: '#9333EA' },
  crons: { x: 2740, label: 'Crons & Jobs', color: '#F59E0B' },
  infrastructure: { x: 3120, label: 'Services & Infra', color: '#0284C7' },
  database: { x: 3500, label: 'Database', color: '#2563EB' },
  security: { x: 3880, label: 'Security', color: '#B91C1C' },
};

const CATEGORY_ICONS = {
  frontend: WebOutlinedIcon,
  api: ApiOutlinedIcon,
  communication: CellTowerOutlinedIcon,
  agents: SmartToyOutlinedIcon,
  teams: PersonOutlineIcon,
  consilium: AccountTreeOutlinedIcon,
  llm: PsychologyOutlinedIcon,
  crons: ScheduleOutlinedIcon,
  infrastructure: CloudOutlinedIcon,
  database: StorageOutlinedIcon,
  security: SecurityOutlinedIcon,
};

const OP_COLORS = {
  select: '#16A34A',
  insert: '#2563EB',
  update: '#F59E0B',
  delete: '#DC2626',
  upsert: '#7C3AED',
};

const DATA_PAGE_STORAGE_KEY = 'orch_data_page_prefs';
const TOPOLOGY_CACHE_TTL_MS = 45_000;
let topologyCache = { payload: null, ts: 0 };
let topologyInFlight = null;

async function loadTopologyPayload({ force = false } = {}) {
  const now = Date.now();
  if (!force && topologyCache.payload && now - topologyCache.ts < TOPOLOGY_CACHE_TTL_MS) {
    return topologyCache.payload;
  }
  if (!force && topologyInFlight) return topologyInFlight;

  topologyInFlight = getAuthHeaders()
    .then((headers) => fetch('/api/data-topology', { cache: 'no-store', headers }))
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load live topology (${res.status})`);
      return res.json();
    })
    .then((payload) => {
      topologyCache = { payload, ts: Date.now() };
      return payload;
    })
    .finally(() => {
      topologyInFlight = null;
    });

  return topologyInFlight;
}

/* ──────────── ANIMATED FLOW PARTICLES ──────────── */

const EMPTY_AUDIT_COUNTS = Object.freeze({ out: 0, in: 0 });

const PARTICLE_CSS = `
@keyframes flowPulse {
  0% { opacity: 0; offset-distance: 0%; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { opacity: 0; offset-distance: 100%; }
}
@keyframes dataFlowDash {
  to { stroke-dashoffset: -24; }
}
@keyframes glowPulse {
  0%, 100% { filter: drop-shadow(0 0 2px currentColor); }
  50% { filter: drop-shadow(0 0 8px currentColor); }
}
@keyframes nodeFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes healthPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes traceGlow {
  0%, 100% { box-shadow: 0 0 8px 2px var(--trace-color, #22D3EE), 0 0 20px 4px var(--trace-color, #22D3EE); }
  50% { box-shadow: 0 0 16px 6px var(--trace-color, #22D3EE), 0 0 40px 10px var(--trace-color, #22D3EE); }
}
@keyframes traceEdgePulse {
  0%, 100% { stroke-opacity: 0.3; }
  50% { stroke-opacity: 1; }
}
`;

/* ──────────── HELPERS ──────────── */

function scoreHealth(items) {
  if (!items.length) return 0;
  const value = items.reduce((acc, item) => {
    if (item.health === 'healthy') return acc + 1;
    if (item.health === 'warning') return acc + 0.6;
    return acc + 0.2;
  }, 0);
  return Math.round((value / items.length) * 100);
}

function positionEntities(entities) {
  const laneY = {};
  return entities.map((entity) => {
    const lane = CATEGORY_LANES[entity.category] || CATEGORY_LANES.infrastructure;
    const y = laneY[entity.category] ?? 0;
    laneY[entity.category] = y + 1;
    return {
      ...entity,
      position: { x: lane.x, y: 80 + y * 160 },
    };
  });
}

/** Enhanced positioning that creates group container nodes per category */
function positionEntitiesGrouped(entities) {
  const NODE_WIDTH = 300;
  const NODE_HEIGHT = 140;
  const NODE_SPACING_X = 20;
  const NODE_SPACING_Y = 24;
  const GROUP_PADDING_TOP = 52;
  const GROUP_PADDING_X = 20;
  const GROUP_PADDING_BOTTOM = 20;
  const COLS_PER_GROUP = 1;
  const GROUP_GAP = 80;

  // Group entities by category
  const groups = {};
  const orderedCats = Object.keys(CATEGORY_LANES);
  orderedCats.forEach((cat) => {
    groups[cat] = [];
  });
  entities.forEach((e) => {
    const cat = orderedCats.includes(e.category) ? e.category : 'infrastructure';
    groups[cat].push(e);
  });

  const result = [];
  let groupX = 0;

  orderedCats.forEach((cat) => {
    const items = groups[cat];
    if (items.length === 0) return;

    const lane = CATEGORY_LANES[cat];
    const Icon = CATEGORY_ICONS[cat];
    const rows = Math.ceil(items.length / COLS_PER_GROUP);
    const groupWidth =
      COLS_PER_GROUP * NODE_WIDTH + (COLS_PER_GROUP - 1) * NODE_SPACING_X + GROUP_PADDING_X * 2;
    const groupHeight =
      GROUP_PADDING_TOP + rows * NODE_HEIGHT + (rows - 1) * NODE_SPACING_Y + GROUP_PADDING_BOTTOM;

    const healthyCount = items.filter((e) => e.health === 'healthy').length;
    const healthySummary = items.length > 0 ? Math.round((healthyCount / items.length) * 100) : 100;

    // Create group node
    const groupId = `group-${cat}`;
    result.push({
      id: groupId,
      type: 'categoryGroup',
      position: { x: groupX, y: 0 },
      data: {
        label: lane.label,
        color: lane.color,
        icon: Icon,
        childCount: items.length,
        healthySummary,
      },
      style: {
        width: groupWidth,
        height: groupHeight,
      },
      __isGroup: true,
    });

    // Position child nodes inside the group
    items.forEach((entity, idx) => {
      const col = idx % COLS_PER_GROUP;
      const row = Math.floor(idx / COLS_PER_GROUP);
      result.push({
        ...entity,
        position: {
          x: GROUP_PADDING_X + col * (NODE_WIDTH + NODE_SPACING_X),
          y: GROUP_PADDING_TOP + row * (NODE_HEIGHT + NODE_SPACING_Y),
        },
        parentId: groupId,
        extent: 'parent',
      });
    });

    groupX += groupWidth + GROUP_GAP;
  });

  return result;
}

function loadDataPagePreferences() {
  try {
    const raw = localStorage.getItem(DATA_PAGE_STORAGE_KEY);
    if (!raw) return { scrollPosition: 0 };
    const parsed = JSON.parse(raw);
    return { scrollPosition: parsed.scrollPosition ?? 0 };
  } catch {
    return { scrollPosition: 0 };
  }
}

function saveDataPagePreferences(prefs) {
  try {
    localStorage.setItem(DATA_PAGE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* noop */
  }
}

/* ──────────── CUSTOM NODE COMPONENT ──────────── */

function SystemNode({ data }) {
  const theme = useTheme();
  const nodeIsMobile = useMediaQuery(theme.breakpoints.down('md'));
  const {
    entity,
    isSelected,
    isHighlighted,
    isConnected,
    isCrossCategory,
    isAuditMode: nodeAudit,
    auditCounts,
    onSelect,
    flowTraceMode: nodeFlowTrace,
    flowTraceActive,
    flowTraceCompleted,
    flowTraceInvolved,
  } = data;
  const meta = TYPE_META[entity.type] || TYPE_META.service;
  const IconComponent = meta.icon;
  const healthColor = HEALTH_COLORS[entity.health] || '#94A3B8';
  const isDark = theme.palette.mode === 'dark';

  const dimmed = isHighlighted !== null && !isHighlighted && !isConnected && !isSelected;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: meta.color,
          width: 8,
          height: 8,
          border: `2px solid ${isDark ? '#1E293B' : '#fff'}`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: meta.color,
          width: 8,
          height: 8,
          border: `2px solid ${isDark ? '#1E293B' : '#fff'}`,
        }}
      />
      <Box
        onClick={() => onSelect(entity.id)}
        sx={{
          position: 'relative',
          minWidth: 240,
          maxWidth: 300,
          borderRadius: 3,
          '--trace-color': meta.color,
          border: `2px ${isCrossCategory ? 'dashed' : 'solid'} ${
            nodeAudit
              ? auditCounts?.in === 0 && entity.type !== 'frontend'
                ? '#DC2626'
                : auditCounts?.out + auditCounts?.in <= 2
                  ? '#F59E0B'
                  : '#16A34A'
              : isSelected
                ? meta.color
                : alpha(healthColor, 0.6)
          }`,
          background: isDark
            ? `linear-gradient(135deg, ${alpha(meta.color, 0.18)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
            : `linear-gradient(135deg, ${alpha(meta.color, 0.08)} 0%, ${alpha('#fff', 0.98)} 100%)`,
          boxShadow:
            nodeFlowTrace && flowTraceActive
              ? `0 0 12px 4px ${alpha(meta.color, 0.5)}, 0 0 30px 8px ${alpha(meta.color, 0.25)}`
              : nodeFlowTrace && flowTraceCompleted
                ? `0 0 6px 2px ${alpha('#16A34A', 0.3)}`
                : isSelected
                  ? `0 0 0 3px ${alpha(meta.color, 0.3)}, 0 8px 32px ${alpha(meta.color, 0.15)}`
                  : isConnected
                    ? `0 4px 20px ${alpha(meta.color, 0.12)}`
                    : `0 4px 16px ${alpha(theme.palette.common.black, 0.06)}`,
          p: 1.5,
          cursor: 'pointer',
          opacity: nodeFlowTrace
            ? flowTraceActive
              ? 1
              : flowTraceCompleted
                ? 0.7
                : flowTraceInvolved
                  ? 0.4
                  : 0.08
            : dimmed
              ? 0.3
              : isCrossCategory
                ? 0.65
                : 1,
          ...(nodeIsMobile ? {} : { transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }),
          animation:
            nodeFlowTrace && flowTraceActive && !nodeIsMobile
              ? 'traceGlow 1.2s ease-in-out infinite'
              : isSelected && !nodeIsMobile
                ? 'nodeFloat 3s ease-in-out infinite'
                : 'none',
          ...(nodeIsMobile
            ? {}
            : {
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: createHoverGlowShadow(theme),
                  borderColor: 'primary.main',
                },
              }),
        }}
      >
        {/* Header row */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.8 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(meta.color, 0.15),
              color: meta.color,
            }}
          >
            <AppIcon fallback={IconComponent} sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.8rem',
                fontWeight: 800,
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entity.label}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.62rem',
                fontWeight: 600,
                color: meta.color,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {meta.label}
            </Typography>
          </Box>
          {/* Health dot */}
          <Tooltip title={`Health: ${entity.health}`}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: healthColor,
                animation:
                  entity.health === 'critical' && !nodeIsMobile
                    ? 'healthPulse 1.5s ease-in-out infinite'
                    : 'none',
                boxShadow: `0 0 6px ${alpha(healthColor, 0.5)}`,
              }}
            />
          </Tooltip>
        </Stack>

        {/* Cross-category badge */}
        {isCrossCategory && (
          <Chip
            label={CATEGORY_LANES[entity.category]?.label || entity.category}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.58rem',
              fontWeight: 700,
              bgcolor: alpha(CATEGORY_LANES[entity.category]?.color || '#94A3B8', 0.15),
              color: CATEGORY_LANES[entity.category]?.color || '#94A3B8',
              mb: 0.5,
            }}
          />
        )}

        {/* Description */}
        <Typography
          sx={{
            fontSize: '0.65rem',
            color: 'text.secondary',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {entity.description}
        </Typography>

        {/* Table details preview */}
        {entity.type === 'table' && entity.details?.columns?.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.8, flexWrap: 'wrap', gap: 0.3 }}>
            <Chip
              size="small"
              icon={
                <AppIcon
                  name="DataObject"
                  fallback={DataObjectIcon}
                  sx={{ fontSize: '11px !important' }}
                />
              }
              label={`${entity.details.columns.length} cols`}
              sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
            />
            {entity.details.rowCount != null && (
              <Chip
                size="small"
                label={`${entity.details.rowCount} rows`}
                sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
              />
            )}
            {entity.details.rls === 'enabled' && (
              <Chip
                size="small"
                icon={
                  <AppIcon
                    name="LockOutlined"
                    fallback={LockOutlinedIcon}
                    sx={{ fontSize: '10px !important' }}
                  />
                }
                label="RLS"
                color="success"
                sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
              />
            )}
          </Stack>
        )}

        {/* Storage preview badges */}
        {entity.type === 'storage' && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.8, flexWrap: 'wrap', gap: 0.3 }}>
            {entity.details?.totalBuckets != null && (
              <Chip
                size="small"
                icon={
                  <AppIcon
                    name="StorageOutlined"
                    fallback={StorageOutlinedIcon}
                    sx={{ fontSize: '11px !important' }}
                  />
                }
                label={`${entity.details.totalBuckets} bucket${entity.details.totalBuckets !== 1 ? 's' : ''}`}
                sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
              />
            )}
            {entity.details?.retention && (
              <Chip
                size="small"
                label={entity.details.retention}
                sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
              />
            )}
            {entity.details?.access?.includes('Private') && (
              <Chip
                size="small"
                icon={
                  <AppIcon
                    name="LockOutlined"
                    fallback={LockOutlinedIcon}
                    sx={{ fontSize: '10px !important' }}
                  />
                }
                label="Private"
                color="success"
                sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
              />
            )}
          </Stack>
        )}

        {/* API method badge */}
        {entity.type === 'api' && entity.details?.method && (
          <Chip
            size="small"
            label={entity.details.method}
            sx={{
              mt: 0.6,
              height: 18,
              fontSize: '0.6rem',
              fontWeight: 800,
              bgcolor:
                entity.details.method === 'POST' ? alpha('#DC2626', 0.12) : alpha('#16A34A', 0.12),
              color: entity.details.method === 'POST' ? '#DC2626' : '#16A34A',
            }}
          />
        )}

        {/* Tags / warnings */}
        {entity.tags?.length > 0 && (
          <Stack direction="row" spacing={0.3} sx={{ mt: 0.6, flexWrap: 'wrap', gap: 0.3 }}>
            {entity.tags.slice(0, 2).map((tag) => (
              <Chip
                key={tag}
                size="small"
                label={tag}
                color="warning"
                variant="outlined"
                sx={{ height: 16, fontSize: '0.55rem' }}
              />
            ))}
          </Stack>
        )}

        {/* Metric badge - key number per entity type */}
        {entity.metrics && (
          <Chip
            size="small"
            label={
              entity.metrics.costToday
                ? `$${entity.metrics.costToday}`
                : entity.metrics.total != null
                  ? `${entity.metrics.total} jobs`
                  : entity.metrics.avgScore
                    ? `${entity.metrics.avgScore} avg`
                    : entity.metrics.created != null
                      ? `${entity.metrics.completed || 0}/${entity.metrics.created} goals`
                      : entity.metrics.callsToday
                        ? `${entity.metrics.callsToday} calls`
                        : null
            }
            sx={{
              height: 16,
              fontSize: '0.55rem',
              fontWeight: 800,
              bgcolor: alpha('#10B981', 0.15),
              color: '#10B981',
              mt: 0.3,
            }}
          />
        )}
        {!entity.metrics && entity.details?.rowCount != null && (
          <Chip
            size="small"
            label={`${entity.details.rowCount} rows`}
            sx={{
              height: 16,
              fontSize: '0.55rem',
              fontWeight: 700,
              bgcolor: alpha(meta.color, 0.1),
              color: meta.color,
              mt: 0.3,
            }}
          />
        )}
        {!entity.metrics && entity.details?.frequency && (
          <Chip
            size="small"
            label={entity.details.frequency}
            sx={{
              height: 16,
              fontSize: '0.55rem',
              fontWeight: 700,
              bgcolor: alpha(meta.color, 0.1),
              color: meta.color,
              mt: 0.3,
            }}
          />
        )}

        {/* Audit connection counts */}
        {nodeAudit && auditCounts && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
            <Chip
              size="small"
              label={`↙ ${auditCounts.in} in`}
              sx={{
                height: 16,
                fontSize: '0.55rem',
                fontWeight: 700,
                bgcolor: alpha(
                  auditCounts.in === 0 && entity.type !== 'frontend' ? '#DC2626' : '#64748B',
                  0.12
                ),
                color: auditCounts.in === 0 && entity.type !== 'frontend' ? '#DC2626' : '#64748B',
              }}
            />
            <Chip
              size="small"
              label={`↗ ${auditCounts.out} out`}
              sx={{
                height: 16,
                fontSize: '0.55rem',
                fontWeight: 700,
                bgcolor: alpha('#64748B', 0.12),
                color: '#64748B',
              }}
            />
          </Stack>
        )}

        {/* Activity counts */}
        {(entity.history?.length > 0 ||
          entity.rules?.length > 0 ||
          entity.pipelines?.length > 0) && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.6, flexWrap: 'wrap', gap: 0.3 }}>
            {entity.history?.length > 0 && (
              <Chip
                size="small"
                label={`${entity.history.length} events`}
                sx={{
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha('#10B981', 0.12),
                  color: '#10B981',
                }}
              />
            )}
            {entity.pipelines?.length > 0 && (
              <Chip
                size="small"
                label={`${entity.pipelines.length} pipeline${entity.pipelines.length > 1 ? 's' : ''}`}
                sx={{
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha('#9333EA', 0.12),
                  color: '#9333EA',
                }}
              />
            )}
            {entity.rules?.length > 0 && (
              <Chip
                size="small"
                label={`${entity.rules.length} rule${entity.rules.length > 1 ? 's' : ''}`}
                sx={{
                  height: 16,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha('#F59E0B', 0.12),
                  color: '#F59E0B',
                }}
              />
            )}
          </Stack>
        )}

        {/* Data flow shimmer bar (skip on mobile for performance) */}
        {isConnected && !nodeIsMobile && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              borderRadius: '0 0 12px 12px',
              background: `linear-gradient(90deg, transparent, ${alpha(meta.color, 0.5)}, transparent)`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
            }}
          />
        )}
      </Box>
    </>
  );
}

function DataFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style = {},
  data,
}) {
  const theme = useTheme();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 20,
    offset: 24,
  });
  const lineColor = data?.baseColor || '#94A3B8';
  const lineWidth = Number(style.strokeWidth) || 2;
  const isConnected = Boolean(data?.isConnected);
  const showLabel = Boolean(data?.showLabel);
  const animateParticle = Boolean(data?.animateParticle);
  const edgeIsMobile = Boolean(data?.isMobile);

  return (
    <>
      {/* Skip halo on mobile to reduce SVG path count & GPU compositing */}
      {!edgeIsMobile && (
        <BaseEdge
          id={`${id}-halo`}
          path={edgePath}
          style={{
            stroke: alpha(lineColor, isConnected ? 0.3 : 0.14),
            strokeWidth: lineWidth + (isConnected ? 4.5 : 3.2),
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />

      {animateParticle && (
        <circle r={isConnected ? 3.2 : 2.6} fill={lineColor} opacity={0.92}>
          <animateMotion
            dur={data?.pulseSpeed || '2.4s'}
            repeatCount="indefinite"
            rotate="auto"
            path={edgePath}
          />
        </circle>
      )}

      {showLabel && data?.label && (
        <EdgeLabelRenderer>
          <Box
            sx={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            <Box
              sx={{
                px: 0.8,
                py: 0.25,
                borderRadius: 999,
                border: '1px solid',
                borderColor: alpha(lineColor, 0.45),
                bgcolor: alpha(
                  theme.palette.background.paper,
                  theme.palette.mode === 'dark' ? 0.9 : 0.94
                ),
                backdropFilter: 'blur(6px)',
                boxShadow: `0 2px 10px ${alpha(lineColor, 0.2)}`,
              }}
            >
              <Stack direction="row" spacing={0.55} alignItems="center">
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: lineColor,
                    boxShadow: `0 0 0 3px ${alpha(lineColor, 0.18)}`,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '0.58rem',
                    fontWeight: 700,
                    color: lineColor,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {data.label}
                  {data.metric ? ` · ${data.metric}` : ''}
                </Typography>
              </Stack>
            </Box>
          </Box>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/* ──────────── CATEGORY GROUP NODE (Enhanced View) ──────────── */

function CategoryGroupNode({ data }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { label, color, icon: IconComp, childCount, healthySummary } = data;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        borderRadius: 4,
        border: `2px solid ${alpha(color, isDark ? 0.35 : 0.25)}`,
        bgcolor: alpha(color, isDark ? 0.04 : 0.02),
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      {/* Group header */}
      <Box
        sx={{
          position: 'absolute',
          top: -1,
          left: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 0.6,
          borderRadius: '0 0 12px 12px',
          bgcolor: isDark ? alpha(color, 0.15) : alpha(color, 0.08),
          border: `1px solid ${alpha(color, isDark ? 0.3 : 0.18)}`,
          borderTop: 'none',
          boxShadow: `0 4px 12px ${alpha(color, 0.08)}`,
          pointerEvents: 'auto',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.8}>
          {IconComp && <AppIcon fallback={IconComp} sx={{ fontSize: 16, color }} />}
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.8}>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary' }}>
            {childCount} {childCount === 1 ? 'entity' : 'entities'}
          </Typography>
          {healthySummary !== undefined && (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor:
                  healthySummary === 100 ? '#16A34A' : healthySummary >= 70 ? '#F59E0B' : '#DC2626',
                boxShadow: `0 0 4px ${alpha(
                  healthySummary === 100 ? '#16A34A' : healthySummary >= 70 ? '#F59E0B' : '#DC2626',
                  0.5
                )}`,
              }}
            />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

const nodeTypes = { systemNode: SystemNode, categoryGroup: CategoryGroupNode };
const edgeTypes = { dataFlowEdge: DataFlowEdge };

/* ──────────── TABLE SCHEMA CARD ──────────── */

function TableSchemaCard({ tableEntity, onSelect, compact = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [expanded, setExpanded] = useState(!compact);

  if (!tableEntity) return null;
  const d = tableEntity.details || {};
  const columns =
    d.columnDetails?.length > 0
      ? d.columnDetails
      : (d.columns || []).map((c) => ({ name: c, type: '-' }));
  const meta = TYPE_META.table;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        borderColor: alpha(meta.color, 0.3),
        transition: 'all 0.2s ease',
        '&:hover': { borderColor: meta.color },
      }}
    >
      <Box
        onClick={() => (compact ? setExpanded(!expanded) : onSelect?.(tableEntity.id))}
        sx={{
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          bgcolor: alpha(meta.color, isDark ? 0.1 : 0.04),
          borderBottom: expanded ? `1px solid ${alpha(meta.color, 0.15)}` : 'none',
          '&:hover': { bgcolor: alpha(meta.color, isDark ? 0.15 : 0.07) },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <AppIcon
              name="TableChartOutlined"
              fallback={TableChartOutlinedIcon}
              sx={{ fontSize: 16, color: meta.color }}
            />
            <Typography
              sx={{
                fontSize: '0.82rem',
                fontWeight: 800,
                fontFamily: 'monospace',
                color: meta.color,
              }}
            >
              {tableEntity.label}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {d.rowCount != null && (
              <Chip
                size="small"
                label={`${d.rowCount} rows`}
                sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
              />
            )}
            {d.rls === 'enabled' && (
              <Chip
                size="small"
                icon={
                  <AppIcon
                    name="LockOutlined"
                    fallback={LockOutlinedIcon}
                    sx={{ fontSize: '10px !important' }}
                  />
                }
                label="RLS"
                color="success"
                sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700 }}
              />
            )}
            {d.storagePattern === 'jsonb' && (
              <Chip
                size="small"
                label="JSONB"
                sx={{
                  height: 18,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: alpha('#7C3AED', 0.12),
                  color: '#7C3AED',
                }}
              />
            )}
            {compact &&
              (expanded ? (
                <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 16 }} />
              ) : (
                <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 16 }} />
              ))}
          </Stack>
        </Stack>
        {tableEntity.description && (
          <Typography
            sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.3, lineHeight: 1.35 }}
          >
            {tableEntity.description}
          </Typography>
        )}
      </Box>
      <Collapse in={expanded}>
        {d.operations?.length > 0 && (
          <Box
            sx={{
              px: 1.5,
              py: 0.6,
              borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
            }}
          >
            <Stack direction="row" spacing={0.4} alignItems="center">
              <Typography
                sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary', mr: 0.5 }}
              >
                OPS:
              </Typography>
              {d.operations.map((op) => (
                <Chip
                  key={op}
                  size="small"
                  label={op.toUpperCase()}
                  sx={{
                    height: 16,
                    fontSize: '0.52rem',
                    fontWeight: 800,
                    bgcolor: alpha(OP_COLORS[op] || '#94A3B8', 0.12),
                    color: OP_COLORS[op] || '#94A3B8',
                  }}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Box sx={{ maxHeight: compact ? 280 : 400, overflow: 'auto' }}>
          {columns.map((col, i) => {
            const colObj = typeof col === 'string' ? { name: col, type: '-' } : col;
            const isFk =
              colObj.isForeignKey ||
              d.foreignKeys?.some((fk) => fk.startsWith(colObj.name + ' ->'));
            const isPk = colObj.isPrimary || colObj.name === 'id';
            return (
              <Stack
                key={colObj.name}
                direction="row"
                alignItems="center"
                spacing={0.8}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  bgcolor: i % 2 === 0 ? 'transparent' : alpha(theme.palette.divider, 0.03),
                  borderBottom:
                    i < columns.length - 1
                      ? `1px solid ${alpha(theme.palette.divider, 0.06)}`
                      : 'none',
                  '&:hover': { bgcolor: alpha(meta.color, 0.04) },
                }}
              >
                {isPk && (
                  <AppIcon name="Key" fallback={KeyIcon} sx={{ fontSize: 12, color: '#F59E0B' }} />
                )}
                {isFk && !isPk && (
                  <AppIcon
                    name="Link"
                    fallback={LinkIcon}
                    sx={{ fontSize: 12, color: '#2563EB' }}
                  />
                )}
                {!isPk && !isFk && <Box sx={{ width: 12 }} />}
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: isPk ? 700 : 500,
                    fontFamily: 'monospace',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {colObj.name}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    color: alpha(theme.palette.text.primary, 0.5),
                    minWidth: 60,
                    textAlign: 'right',
                  }}
                >
                  {colObj.type}
                </Typography>
                {isPk && (
                  <Chip
                    size="small"
                    label="PK"
                    sx={{
                      height: 14,
                      fontSize: '0.48rem',
                      fontWeight: 700,
                      bgcolor: alpha('#F59E0B', 0.12),
                      color: '#F59E0B',
                    }}
                  />
                )}
                {isFk && (
                  <Chip
                    size="small"
                    label="FK"
                    sx={{
                      height: 14,
                      fontSize: '0.48rem',
                      fontWeight: 700,
                      bgcolor: alpha('#2563EB', 0.12),
                      color: '#2563EB',
                    }}
                  />
                )}
                {colObj.isNotNull && !isPk && (
                  <Chip
                    size="small"
                    label="NN"
                    sx={{
                      height: 14,
                      fontSize: '0.48rem',
                      fontWeight: 700,
                      bgcolor: alpha('#DC2626', 0.1),
                      color: '#DC2626',
                    }}
                  />
                )}
              </Stack>
            );
          })}
        </Box>

        {d.foreignKeys?.length > 0 && (
          <Box
            sx={{
              px: 1.5,
              py: 0.6,
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
              bgcolor: alpha('#2563EB', isDark ? 0.04 : 0.02),
            }}
          >
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#2563EB', mb: 0.3 }}>
              Foreign Keys
            </Typography>
            {d.foreignKeys.map((fk, i) => {
              const parts = fk.split(' -> ');
              const targetTable = parts[1]?.split('.')[0];
              return (
                <Stack
                  key={i}
                  direction="row"
                  alignItems="center"
                  spacing={0.5}
                  sx={{ py: 0.2, cursor: 'pointer' }}
                  onClick={() => targetTable && onSelect?.(`table-${targetTable}`)}
                >
                  <Typography
                    sx={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 600 }}
                  >
                    {parts[0]}
                  </Typography>
                  <AppIcon
                    name="ArrowForward"
                    fallback={ArrowForwardIcon}
                    sx={{ fontSize: 10, color: 'text.secondary' }}
                  />
                  <Typography
                    sx={{
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: '#2563EB',
                    }}
                  >
                    {parts[1]}
                  </Typography>
                </Stack>
              );
            })}
          </Box>
        )}

        {d.policies?.length > 0 && (
          <Box
            sx={{
              px: 1.5,
              py: 0.6,
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
              bgcolor: alpha('#16A34A', isDark ? 0.04 : 0.02),
            }}
          >
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#16A34A', mb: 0.3 }}>
              RLS Policies
            </Typography>
            {d.policies.map((p) => (
              <Stack key={p} direction="row" alignItems="center" spacing={0.5} sx={{ py: 0.15 }}>
                <AppIcon
                  name="LockOutlined"
                  fallback={LockOutlinedIcon}
                  sx={{ fontSize: 10, color: '#16A34A' }}
                />
                <Typography sx={{ fontSize: '0.6rem', fontFamily: 'monospace' }}>{p}</Typography>
              </Stack>
            ))}
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}

/* ──────────── DETAIL PANEL COMPONENT ──────────── */

function DetailPanel({
  entity,
  connections,
  entityMap,
  allEntities,
  edgesRaw,
  onSelect,
  onClose,
  pipelinesMap = {},
  isAuditMode: panelAudit = false,
  connectionCounts = {},
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeTab, setActiveTab] = useState(0);
  // All useState hooks must be before the early return to avoid hooks order violation
  const [codeContent, setCodeContent] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [tableData, setTableData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [toggleLoading, setToggleLoading] = useState(false);

  // ALL useMemo hooks must be before the early return
  const relatedTables = useMemo(() => {
    if (!entity || entity.type !== 'frontend') return [];
    const tableNames = new Set(entity.details?.relatedTables || []);
    edgesRaw.forEach((e) => {
      if (e.source === entity.id && e.target.startsWith('table-')) {
        tableNames.add(e.target.replace('table-', ''));
      }
    });
    return [...tableNames]
      .map((name) => allEntities.find((ent) => ent.id === `table-${name}`))
      .filter(Boolean);
  }, [entity, allEntities, edgesRaw]);

  const usedByPages = useMemo(() => {
    if (!entity || entity.type !== 'table') return [];
    const pageIds = new Set();
    edgesRaw.forEach((e) => {
      if (e.target === entity.id && e.source.startsWith('frontend-')) {
        pageIds.add(e.source);
      }
    });
    return [...pageIds].map((id) => allEntities.find((ent) => ent.id === id)).filter(Boolean);
  }, [entity, allEntities, edgesRaw]);

  const connectedTables = useMemo(() => {
    if (!entity || entity.type === 'frontend' || entity.type === 'table') return [];
    const tableIds = new Set();
    edgesRaw.forEach((e) => {
      if (
        (e.source === entity.id || e.target === entity.id) &&
        (e.source.startsWith('table-') || e.target.startsWith('table-'))
      ) {
        const tId = e.source.startsWith('table-') ? e.source : e.target;
        tableIds.add(tId);
      }
    });
    return [...tableIds].map((id) => allEntities.find((ent) => ent.id === id)).filter(Boolean);
  }, [entity, allEntities, edgesRaw]);

  const usesGrouped = useMemo(() => {
    if (!entity) return {};
    const groups = {};
    edgesRaw
      .filter((e) => e.source === entity.id)
      .forEach((e) => {
        const target = entityMap[e.target];
        if (!target) return;
        const key = target.type;
        if (!groups[key]) groups[key] = [];
        if (!groups[key].some((g) => g.entity.id === target.id)) {
          groups[key].push({ entity: target, relationship: e.relationship });
        }
      });
    return groups;
  }, [entity, edgesRaw, entityMap]);

  const usedByGrouped = useMemo(() => {
    if (!entity) return {};
    const groups = {};
    edgesRaw
      .filter((e) => e.target === entity.id)
      .forEach((e) => {
        const source = entityMap[e.source];
        if (!source) return;
        const key = source.type;
        if (!groups[key]) groups[key] = [];
        if (!groups[key].some((g) => g.entity.id === source.id)) {
          groups[key].push({ entity: source, relationship: e.relationship });
        }
      });
    return groups;
  }, [entity, edgesRaw, entityMap]);

  const flowMap = useMemo(() => {
    if (!entity) return {};
    const groups = {};
    const visited = new Set();
    const walk = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      edgesRaw
        .filter((e) => e.source === id)
        .forEach((e) => {
          const target = entityMap[e.target];
          if (!target) return;
          const type = target.type;
          if (!groups[type]) groups[type] = [];
          if (!groups[type].some((g) => g.entity.id === target.id)) {
            groups[type].push({
              entity: target,
              relationship: e.relationship,
              metric: e.metric || '',
            });
          }
          walk(e.target);
        });
    };
    walk(entity.id);
    return groups;
  }, [entity, edgesRaw, entityMap]);

  const impactList = useMemo(() => {
    if (!entity) return [];
    const items = [];
    const visited = new Set();
    const walk = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      edgesRaw
        .filter((e) => e.target === id)
        .forEach((e) => {
          const source = entityMap[e.source];
          if (!source) return;
          if (!items.some((i) => i.entity.id === source.id)) {
            items.push({ entity: source, relationship: e.relationship });
          }
          walk(e.source);
        });
    };
    walk(entity.id);
    return items;
  }, [entity, edgesRaw, entityMap]);

  const flowMapCount = Object.values(flowMap).reduce((s, arr) => s + arr.length, 0);

  const sourceFile = useMemo(() => {
    if (!entity) return null;
    if (entity.details?.file) return entity.details.file;
    if (entity.type === 'frontend') {
      const name = entity.id
        .replace('frontend-', '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      return `src/pages/${name}.jsx`;
    }
    if (entity.type === 'api' && entity.id.startsWith('api-')) {
      const name = entity.id.replace('api-', '');
      if (name.includes('agent-')) return 'api/agent.js';
      if (name.includes('concilium-')) return 'api/concilium.js';
      if (name.includes('communicator-')) return 'api/communicator.js';
      if (name.includes('app-')) return 'api/app.js';
      return `api/${name}.js`;
    }
    if (entity.type === 'table') return `supabase/migrations/`;
    return null;
  }, [entity]);

  const hasDataChain = entity?.type === 'frontend' && entity.details?.dataChain?.length > 0;
  const historyCount = entity?.history?.length || 0;
  const rulesCount = entity?.rules?.length || 0;
  const pipelinesCount = entity?.pipelines?.length || 0;
  const hasRulesOrPipelines = rulesCount > 0 || pipelinesCount > 0;
  const insightsCount = entity?.insights?.length || 0;
  const hasMetrics = entity?.metrics && Object.keys(entity.metrics).length > 0;
  const hasSourceFile = Boolean(sourceFile);
  const hasTableData = entity?.type === 'table';

  const tabs = useMemo(() => {
    if (!entity) return [{ key: 'overview', label: 'Overview' }];
    const t = [{ key: 'overview', label: 'Overview' }];
    if (flowMapCount > 0 || impactList.length > 0)
      t.push({ key: 'flowmap', label: `Flow Map (${flowMapCount + impactList.length})` });
    if (hasDataChain) t.push({ key: 'dataflow', label: 'Data Flow' });
    if (hasSourceFile) t.push({ key: 'code', label: 'Code' });
    if (hasTableData) t.push({ key: 'data', label: 'Data' });
    if (hasRulesOrPipelines)
      t.push({ key: 'rules', label: `Rules (${rulesCount + pipelinesCount})` });
    if (insightsCount > 0) t.push({ key: 'insights', label: `Insights (${insightsCount})` });
    const linkCount = (connections?.incoming?.length || 0) + (connections?.outgoing?.length || 0);
    t.push({ key: 'connections', label: `Links (${linkCount})` });
    t.push({ key: 'history', label: `History (${historyCount})` });
    return t;
  }, [
    entity,
    hasDataChain,
    hasSourceFile,
    hasTableData,
    hasRulesOrPipelines,
    rulesCount,
    pipelinesCount,
    insightsCount,
    connections,
    historyCount,
    flowMapCount,
    impactList,
  ]);

  const currentTab = tabs[activeTab]?.key || 'overview';

  if (!entity) return null;

  const meta = TYPE_META[entity.type] || TYPE_META.service;
  const healthColor = HEALTH_COLORS[entity.health] || '#94A3B8';

  return (
    <Stack spacing={0} sx={{ animation: 'fadeSlideIn 0.3s ease-out', height: '100%' }}>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(135deg, ${alpha(meta.color, 0.2)} 0%, ${alpha(meta.color, 0.08)} 100%)`,
              color: meta.color,
            }}
          >
            <AppIcon fallback={meta.icon} sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              {entity.label}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.4 }}>
              <Chip
                size="small"
                label={meta.label}
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: alpha(meta.color, 0.12),
                  color: meta.color,
                }}
              />
              <Chip
                size="small"
                label={entity.health}
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: alpha(healthColor, 0.12),
                  color: healthColor,
                  '& .MuiChip-label': { px: 1 },
                }}
                icon={
                  <Box
                    sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: healthColor, ml: 0.5 }}
                  />
                }
              />
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Tooltip
            title={
              entity.disabled ? 'Feature disabled - click to re-enable' : 'Toggle feature on/off'
            }
          >
            <Switch
              size="small"
              checked={!entity.disabled}
              onChange={() => setPinDialogOpen(true)}
              sx={{
                '& .MuiSwitch-switchBase': { p: 0.4 },
                '& .MuiSwitch-thumb': { width: 12, height: 12 },
                '& .MuiSwitch-track': { borderRadius: 8 },
              }}
            />
          </Tooltip>
          <IconButton size="small" onClick={onClose}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Stack>
      {entity.disabled && (
        <Alert severity="warning" sx={{ fontSize: '0.68rem', py: 0.2, mb: 0.5 }}>
          Feature disabled{entity.disabledReason ? `: ${entity.disabledReason}` : ''}
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, mb: 1.5 }}>
        {entity.description}
      </Typography>
      {/* PIN Dialog */}
      <FormDialog
        open={pinDialogOpen}
        onClose={() => {
          setPinDialogOpen(false);
          setPinValue('');
        }}
        title={`${entity.disabled ? 'Re-enable' : 'Disable'} ${entity.label}?`}
        subtitle={`Enter admin PIN to ${entity.disabled ? 're-enable' : 'disable'} this entity. This action will be logged.`}
        icon={LockOutlinedIcon}
        iconVariant={entity.disabled ? 'success' : 'warning'}
        maxWidth="xs"
        actions={
          <>
            <Button
              onClick={() => {
                setPinDialogOpen(false);
                setPinValue('');
              }}
              size="small"
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              size="small"
              disabled={!pinValue || toggleLoading}
              color={entity.disabled ? 'success' : 'warning'}
              onClick={async () => {
                setToggleLoading(true);
                try {
                  const headers = await (await import('../lib/supabaseEdge')).getAuthHeaders();
                  const res = await fetch('/api/ops?path=toggle-feature', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      entityId: entity.id,
                      disabled: !entity.disabled,
                      pin: pinValue,
                    }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    entity.disabled = !entity.disabled;
                    setPinDialogOpen(false);
                    setPinValue('');
                  } else {
                    alert(data.error || 'Invalid PIN');
                  }
                } catch (err) {
                  alert(err.message);
                } finally {
                  setToggleLoading(false);
                }
              }}
            >
              {toggleLoading ? (
                <CircularProgress size={14} />
              ) : entity.disabled ? (
                'Re-enable'
              ) : (
                'Disable'
              )}
            </Button>
          </>
        }
      >
        <TextField
          fullWidth
          type="password"
          label="Admin PIN"
          value={pinValue}
          onChange={(e) => setPinValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pinValue) {
              (async () => {
                setToggleLoading(true);
                try {
                  const headers = await (await import('../lib/supabaseEdge')).getAuthHeaders();
                  const res = await fetch('/api/ops?path=toggle-feature', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      entityId: entity.id,
                      disabled: !entity.disabled,
                      pin: pinValue,
                    }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    entity.disabled = !entity.disabled;
                    setPinDialogOpen(false);
                    setPinValue('');
                  } else {
                    alert(data.error || 'Invalid PIN');
                  }
                } catch (err) {
                  alert(err.message);
                } finally {
                  setToggleLoading(false);
                }
              })();
            }
          }}
          autoFocus
          size="small"
          disabled={toggleLoading}
        />
      </FormDialog>
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 32,
          mb: 1.5,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.75rem',
            minHeight: 32,
            py: 0.3,
            px: 1.5,
          },
          '& .MuiTabs-indicator': { bgcolor: meta.color },
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
        }}
      >
        {tabs.map((t) => (
          <Tab key={t.key} label={t.label} />
        ))}
      </Tabs>
      {/* Tab content */}
      <Box sx={{ flex: 1, overflow: 'auto', pb: 2 }}>
        {/* ═══ OVERVIEW TAB ═══ */}
        {currentTab === 'overview' && (
          <Stack spacing={1.5}>
            {/* Information */}
            {entity.info && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha(meta.color, isDark ? 0.05 : 0.02),
                  borderColor: alpha(meta.color, 0.18),
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 0.8 }}>
                  <AppIcon
                    name="InfoOutlined"
                    fallback={InfoOutlinedIcon}
                    sx={{ fontSize: 16, color: meta.color }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: meta.color }}>
                    Information
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.6 }}>
                  {entity.info}
                </Typography>
              </Paper>
            )}

            {/* ── Audit Assessment ── */}
            {panelAudit &&
              (() => {
                const c = connectionCounts[entity.id] || { out: 0, in: 0 };
                const total = c.out + c.in;
                const isDead = c.in === 0 && entity.type !== 'frontend';
                const isLow = total > 0 && total <= 2;
                return (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.2,
                      borderRadius: 2,
                      borderColor: alpha(isDead ? '#DC2626' : isLow ? '#F59E0B' : '#16A34A', 0.3),
                      bgcolor: alpha(
                        isDead ? '#DC2626' : isLow ? '#F59E0B' : '#16A34A',
                        isDark ? 0.06 : 0.03
                      ),
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Stack direction="row" alignItems="center" spacing={0.8}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: isDead ? '#DC2626' : isLow ? '#F59E0B' : '#16A34A',
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            color: isDead ? '#DC2626' : isLow ? '#F59E0B' : '#16A34A',
                          }}
                        >
                          {isDead ? 'Dead Node' : isLow ? 'Low Usage' : 'Well Connected'}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                        {c.in} inbound · {c.out} outbound connections
                      </Typography>
                      {isDead && (
                        <Typography sx={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 600 }}>
                          Nothing calls this entity. Consider removing or connecting it.
                        </Typography>
                      )}
                      {isLow && (
                        <Typography sx={{ fontSize: '0.68rem', color: '#F59E0B', fontWeight: 600 }}>
                          Very few connections. May be underutilized or missing integrations.
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                );
              })()}

            {/* ── Uses section (outgoing connections grouped by type) ── */}
            {Object.keys(usesGrouped).length > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, borderColor: alpha('#2563EB', 0.2) }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 0.8 }}>
                  <AppIcon
                    name="ArrowForward"
                    fallback={ArrowForwardIcon}
                    sx={{ fontSize: 14, color: '#2563EB' }}
                  />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#2563EB' }}>
                    Uses
                  </Typography>
                </Stack>
                <Stack spacing={0.6}>
                  {Object.entries(usesGrouped).map(([type, items]) => {
                    const tmeta = TYPE_META[type] || TYPE_META.service;
                    const TIcon = tmeta.icon;
                    return (
                      <Stack key={type} spacing={0.3}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <AppIcon fallback={TIcon} sx={{ fontSize: 13, color: tmeta.color }} />
                          <Typography
                            sx={{ fontSize: '0.68rem', fontWeight: 700, color: tmeta.color }}
                          >
                            {tmeta.label}
                          </Typography>
                        </Stack>
                        <Stack
                          direction="row"
                          spacing={0.4}
                          flexWrap="wrap"
                          useFlexGap
                          sx={{ pl: 2.2 }}
                        >
                          {items.map(({ entity: e, relationship }) => (
                            <Chip
                              key={e.id}
                              size="small"
                              label={e.label}
                              onClick={() => onSelect(e.id)}
                              sx={{
                                height: 20,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                bgcolor: alpha(tmeta.color, 0.08),
                                color: tmeta.color,
                                '&:hover': { bgcolor: alpha(tmeta.color, 0.18) },
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            )}

            {/* ── Used By section (incoming connections grouped by type) ── */}
            {Object.keys(usedByGrouped).length > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, borderColor: alpha('#16A34A', 0.2) }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 0.8 }}>
                  <AppIcon
                    name="ArrowBack"
                    fallback={ArrowBackIcon}
                    sx={{ fontSize: 14, color: '#16A34A' }}
                  />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#16A34A' }}>
                    Used By
                  </Typography>
                </Stack>
                <Stack spacing={0.6}>
                  {Object.entries(usedByGrouped).map(([type, items]) => {
                    const tmeta = TYPE_META[type] || TYPE_META.service;
                    const TIcon = tmeta.icon;
                    return (
                      <Stack key={type} spacing={0.3}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <AppIcon fallback={TIcon} sx={{ fontSize: 13, color: tmeta.color }} />
                          <Typography
                            sx={{ fontSize: '0.68rem', fontWeight: 700, color: tmeta.color }}
                          >
                            {tmeta.label}
                          </Typography>
                        </Stack>
                        <Stack
                          direction="row"
                          spacing={0.4}
                          flexWrap="wrap"
                          useFlexGap
                          sx={{ pl: 2.2 }}
                        >
                          {items.map(({ entity: e, relationship }) => (
                            <Chip
                              key={e.id}
                              size="small"
                              label={e.label}
                              onClick={() => onSelect(e.id)}
                              sx={{
                                height: 20,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                bgcolor: alpha(tmeta.color, 0.08),
                                color: tmeta.color,
                                '&:hover': { bgcolor: alpha(tmeta.color, 0.18) },
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            )}

            {/* Table stats bar */}
            {entity.type === 'table' && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack direction="row" spacing={2} justifyContent="space-around">
                  {[
                    { label: 'Rows', value: entity.details?.rowCount ?? '-', color: meta.color },
                    {
                      label: 'Columns',
                      value: entity.details?.columns?.length ?? 0,
                      color: meta.color,
                    },
                    {
                      label: 'RLS',
                      value: entity.details?.rls === 'enabled' ? 'ON' : 'OFF',
                      color: entity.details?.rls === 'enabled' ? '#16A34A' : '#DC2626',
                    },
                    {
                      label: 'Policies',
                      value: entity.details?.policies?.length ?? 0,
                      color: meta.color,
                    },
                    {
                      label: 'Connections',
                      value:
                        (connections?.incoming?.length || 0) + (connections?.outgoing?.length || 0),
                      color: meta.color,
                    },
                  ].map((s) => (
                    <Box key={s.label} sx={{ textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: s.color }}>
                        {s.value}
                      </Typography>
                      <Typography
                        sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 600 }}
                      >
                        {s.label}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            )}

            {/* Frontend page: quick summary */}
            {entity.type === 'frontend' && relatedTables.length > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack direction="row" spacing={2} justifyContent="space-around">
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: meta.color }}>
                      {relatedTables.length}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 600 }}
                    >
                      Tables
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563EB' }}>
                      {entity.details?.dataChain?.length ?? 0}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 600 }}
                    >
                      Services
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: '#16A34A' }}>
                      {(connections?.incoming?.length || 0) + (connections?.outgoing?.length || 0)}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 600 }}
                    >
                      Connections
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            )}

            {/* Table: inline schema preview */}
            {entity.type === 'table' && (
              <TableSchemaCard tableEntity={entity} onSelect={onSelect} compact={false} />
            )}

            {/* Frontend: show related tables */}
            {entity.type === 'frontend' && relatedTables.length > 0 && (
              <>
                <Stack direction="row" alignItems="center" spacing={0.8}>
                  <AppIcon
                    name="StorageOutlined"
                    fallback={StorageOutlinedIcon}
                    sx={{ fontSize: 16, color: '#2563EB' }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    Supabase Tables Used
                  </Typography>
                  <Chip
                    size="small"
                    label={relatedTables.length}
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      bgcolor: alpha('#2563EB', 0.12),
                      color: '#2563EB',
                    }}
                  />
                </Stack>
                <Stack spacing={1}>
                  {relatedTables.map((t) => (
                    <TableSchemaCard key={t.id} tableEntity={t} onSelect={onSelect} compact />
                  ))}
                </Stack>
              </>
            )}

            {/* Table: used by pages */}
            {entity.type === 'table' && usedByPages.length > 0 && (
              <>
                <Divider />
                <Stack direction="row" alignItems="center" spacing={0.8}>
                  <AppIcon
                    name="WebOutlined"
                    fallback={WebOutlinedIcon}
                    sx={{ fontSize: 16, color: '#7C3AED' }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    Used by Pages
                  </Typography>
                </Stack>
                <Stack spacing={0.4}>
                  {usedByPages.map((p) => (
                    <Paper
                      key={p.id}
                      variant="outlined"
                      sx={{
                        p: 0.8,
                        borderRadius: 1.5,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: alpha('#7C3AED', 0.06) },
                      }}
                      onClick={() => onSelect(p.id)}
                    >
                      <Stack direction="row" alignItems="center" spacing={0.8}>
                        <AppIcon
                          name="WebOutlined"
                          fallback={WebOutlinedIcon}
                          sx={{ fontSize: 14, color: '#7C3AED' }}
                        />
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, flex: 1 }}>
                          {p.label}
                        </Typography>
                        <AppIcon
                          name="ArrowForward"
                          fallback={ArrowForwardIcon}
                          sx={{ fontSize: 12, color: 'text.secondary' }}
                        />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </>
            )}

            {/* Usage pages (from entity.usage) - shown if not already displayed above */}
            {entity.usage?.pages?.length > 0 && entity.type !== 'table' && (
              <>
                <Divider />
                <Stack direction="row" alignItems="center" spacing={0.8}>
                  <AppIcon
                    name="WebOutlined"
                    fallback={WebOutlinedIcon}
                    sx={{ fontSize: 16, color: '#7C3AED' }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    Used by Pages
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {entity.usage.pages.map((page) => (
                    <Chip
                      key={page}
                      size="small"
                      label={page}
                      sx={{
                        height: 22,
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        bgcolor: alpha('#7C3AED', 0.1),
                        color: '#7C3AED',
                      }}
                    />
                  ))}
                </Stack>
              </>
            )}

            {/* API details */}
            {entity.type === 'api' && (
              <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
                <Stack spacing={0.8}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip
                      size="small"
                      label={entity.details?.method || 'GET'}
                      sx={{
                        fontWeight: 800,
                        fontSize: '0.65rem',
                        bgcolor:
                          entity.details?.method === 'POST'
                            ? alpha('#DC2626', 0.12)
                            : alpha('#16A34A', 0.12),
                        color: entity.details?.method === 'POST' ? '#DC2626' : '#16A34A',
                      }}
                    />
                    <Typography
                      sx={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 600 }}
                    >
                      {entity.links?.endpoint || entity.label}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <AppIcon
                      name="LockOutlined"
                      fallback={LockOutlinedIcon}
                      sx={{
                        fontSize: 13,
                        color: entity.details?.authRequired ? '#16A34A' : '#F59E0B',
                      }}
                    />
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                      Auth: {entity.details?.authRequired ? 'Required (Supabase Token)' : 'Public'}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            )}

            {/* Cron Job details */}
            {entity.type === 'cron' && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack spacing={0.8}>
                  {[
                    { label: 'Schedule', value: entity.details?.schedule },
                    { label: 'Frequency', value: entity.details?.frequency },
                    { label: 'Target', value: entity.details?.target },
                  ]
                    .filter((r) => r.value)
                    .map((r) => (
                      <Stack key={r.label} direction="row" alignItems="center" spacing={1}>
                        <Typography
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'text.secondary',
                            minWidth: 70,
                          }}
                        >
                          {r.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            fontFamily: r.label === 'Schedule' ? 'monospace' : 'inherit',
                          }}
                        >
                          {r.value}
                        </Typography>
                      </Stack>
                    ))}
                </Stack>
              </Paper>
            )}

            {/* LLM Provider details */}
            {entity.type === 'llm' && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack spacing={0.8}>
                  {[
                    { label: 'Model', value: entity.details?.model },
                    { label: 'Role', value: entity.details?.role },
                    { label: 'Cost', value: entity.details?.cost },
                    { label: 'API Key', value: entity.details?.envKey },
                    {
                      label: 'Status',
                      value: entity.details?.enabled ? 'Active' : 'Not configured',
                    },
                  ]
                    .filter((r) => r.value)
                    .map((r) => (
                      <Stack key={r.label} direction="row" alignItems="center" spacing={1}>
                        <Typography
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'text.secondary',
                            minWidth: 70,
                          }}
                        >
                          {r.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            fontFamily:
                              r.label === 'Model' || r.label === 'API Key'
                                ? 'monospace'
                                : 'inherit',
                            color:
                              r.label === 'Status'
                                ? entity.details?.enabled
                                  ? '#16A34A'
                                  : '#F59E0B'
                                : 'text.primary',
                          }}
                        >
                          {r.value}
                        </Typography>
                      </Stack>
                    ))}
                </Stack>
              </Paper>
            )}

            {/* Agent Handler details */}
            {entity.type === 'agent' && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack spacing={0.8}>
                  {entity.details?.file && (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography
                        sx={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: 'text.secondary',
                          minWidth: 70,
                        }}
                      >
                        File
                      </Typography>
                      <Typography
                        sx={{ fontSize: '0.72rem', fontWeight: 600, fontFamily: 'monospace' }}
                      >
                        {entity.details.file}
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            )}

            {/* Webhook details */}
            {entity.type === 'webhook' && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack spacing={0.8}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <AppIcon
                      name="CellTowerOutlined"
                      fallback={CellTowerOutlinedIcon}
                      sx={{ fontSize: 14, color: meta.color }}
                    />
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                      Inbound Webhook
                    </Typography>
                  </Stack>
                  <Typography
                    sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.5 }}
                  >
                    {entity.description}
                  </Typography>
                </Stack>
              </Paper>
            )}

            {/* Rules inline preview (all types) */}
            {entity.rules?.length > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, borderColor: alpha(meta.color, 0.18) }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 0.5 }}>
                  <AppIcon
                    name="SecurityOutlined"
                    fallback={SecurityOutlinedIcon}
                    sx={{ fontSize: 14, color: meta.color }}
                  />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: meta.color }}>
                    Rules
                  </Typography>
                </Stack>
                <Stack spacing={0.4}>
                  {entity.rules.slice(0, 3).map((rule, i) => (
                    <Typography key={i} sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                      <strong>{rule.label}:</strong> {rule.detail}
                    </Typography>
                  ))}
                </Stack>
              </Paper>
            )}

            {/* Pipeline membership inline preview (all types) */}
            {entity.pipelines?.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {entity.pipelines.map((pk, i) => (
                  <Chip
                    key={i}
                    size="small"
                    label={typeof pk === 'string' ? pk.replace(/-/g, ' ') : pk?.label || 'pipeline'}
                    sx={{
                      height: 20,
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      bgcolor: alpha('#9333EA', 0.1),
                      color: '#9333EA',
                      textTransform: 'capitalize',
                    }}
                  />
                ))}
              </Stack>
            )}

            {/* Live Metrics (from backend) */}
            {hasMetrics && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, borderColor: alpha('#10B981', 0.2) }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 0.8 }}>
                  <AppIcon
                    name="CheckCircleOutline"
                    fallback={CheckCircleOutlineIcon}
                    sx={{ fontSize: 14, color: '#10B981' }}
                  />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#10B981' }}>
                    Live Activity (24h)
                  </Typography>
                </Stack>
                <Stack spacing={0.4}>
                  {Object.entries(entity.metrics).map(([key, val]) => (
                    <Stack
                      key={key}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography
                        sx={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: 'text.secondary',
                          textTransform: 'capitalize',
                        }}
                      >
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Typography>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            )}

            {/* Storage details */}
            {entity.type === 'storage' && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack spacing={1}>
                  {entity.details?.retention && (
                    <Stack direction="row" spacing={2} justifyContent="space-around">
                      {[
                        {
                          label: 'Format',
                          value: entity.details.format?.split(' ')[0] || '.json.gz',
                          color: meta.color,
                        },
                        {
                          label: 'Retention',
                          value: entity.details.retention || '-',
                          color: meta.color,
                        },
                        {
                          label: 'Access',
                          value: entity.details.access?.includes('Private') ? 'Private' : 'Public',
                          color: entity.details.access?.includes('Private') ? '#16A34A' : '#F59E0B',
                        },
                        {
                          label: 'Status',
                          value: entity.details.exists ? 'Active' : 'Missing',
                          color: entity.details.exists ? '#16A34A' : '#DC2626',
                        },
                      ].map((s) => (
                        <Box key={s.label} sx={{ textAlign: 'center' }}>
                          <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: s.color }}>
                            {s.value}
                          </Typography>
                          <Typography
                            sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 600 }}
                          >
                            {s.label}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  )}
                  {entity.details?.bucketDetails?.length > 0 && (
                    <Stack spacing={0.5}>
                      <Stack direction="row" alignItems="center" spacing={0.8}>
                        <AppIcon
                          name="StorageOutlined"
                          fallback={StorageOutlinedIcon}
                          sx={{ fontSize: 14, color: meta.color }}
                        />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                          Buckets (
                          {entity.details.totalBuckets || entity.details.bucketDetails.length})
                        </Typography>
                      </Stack>
                      {entity.details.bucketDetails.map((b) => (
                        <Paper key={b.name} variant="outlined" sx={{ p: 0.8, borderRadius: 1.5 }}>
                          <Stack direction="row" alignItems="center" spacing={0.8}>
                            <AppIcon
                              name="StorageOutlined"
                              fallback={StorageOutlinedIcon}
                              sx={{ fontSize: 13, color: meta.color }}
                            />
                            <Box sx={{ flex: 1 }}>
                              <Typography
                                sx={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                }}
                              >
                                {b.name}
                              </Typography>
                              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                                {b.description}
                              </Typography>
                            </Box>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                  {!entity.details?.bucketDetails && entity.details?.buckets?.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {entity.details.buckets.map((name) => (
                        <Chip
                          key={name}
                          size="small"
                          label={name}
                          sx={{
                            height: 20,
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            bgcolor: alpha(meta.color, 0.1),
                            color: meta.color,
                          }}
                        />
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            )}

            {/* Service details - schedule-based (cron, backup, etc.) */}
            {entity.type === 'service' && entity.details?.schedule && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03) }}
              >
                <Stack spacing={0.8}>
                  {[
                    { label: 'Schedule', value: entity.details.schedule },
                    { label: 'Frequency', value: entity.details.frequency },
                    { label: 'Target', value: entity.details.target },
                  ]
                    .filter((r) => r.value)
                    .map((r) => (
                      <Stack key={r.label} direction="row" alignItems="center" spacing={1}>
                        <Typography
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'text.secondary',
                            minWidth: 72,
                          }}
                        >
                          {r.label}:
                        </Typography>
                        <Typography
                          sx={{ fontSize: '0.72rem', fontWeight: 600, fontFamily: 'monospace' }}
                        >
                          {r.value}
                        </Typography>
                      </Stack>
                    ))}
                </Stack>
              </Paper>
            )}

            {/* Service details - adaptive rendering based on service type */}
            {entity.type === 'service' &&
              !entity.details?.schedule &&
              (() => {
                const d = entity.details || {};
                const isDevOps = Boolean(
                  d.repo || d.branches?.length || d.productionUrl || d.latestDeployTime
                );
                const isSimple = !isDevOps && (d.envKey || d.enabled !== undefined);
                const envKeys = d.envKeys || (d.envKey ? [d.envKey] : []);
                const isEnabled =
                  d.configured ?? d.enabled ?? (envKeys.length === 0 ? true : undefined);

                return (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: alpha(meta.color, isDark ? 0.06 : 0.03),
                      borderColor: alpha(meta.color, 0.18),
                    }}
                  >
                    <Stack spacing={1.2}>
                      {/* Stats bar - DevOps services (GitHub, Vercel) */}
                      {isDevOps && (
                        <Stack
                          direction="row"
                          spacing={2}
                          justifyContent="space-around"
                          flexWrap="wrap"
                          useFlexGap
                        >
                          {[
                            d.repo && {
                              label: 'Repo',
                              value: d.repo.split('/').pop() || d.repo,
                              color: meta.color,
                            },
                            d.branches?.length > 0 && {
                              label: 'Branches',
                              value: d.branches.length,
                              color: '#7C3AED',
                            },
                            entity.history?.length > 0 && {
                              label: d.latestDeployTime ? 'Deploys' : 'Commits',
                              value: entity.history.length,
                              color: '#16A34A',
                            },
                            isEnabled !== undefined && {
                              label: 'Status',
                              value: isEnabled ? 'Active' : 'Not Set',
                              color: isEnabled ? '#16A34A' : '#F59E0B',
                            },
                          ]
                            .filter(Boolean)
                            .map((s) => (
                              <Box key={s.label} sx={{ textAlign: 'center' }}>
                                <Typography
                                  sx={{ fontSize: '1rem', fontWeight: 800, color: s.color }}
                                >
                                  {s.value}
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: '0.6rem',
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                  }}
                                >
                                  {s.label}
                                </Typography>
                              </Box>
                            ))}
                        </Stack>
                      )}

                      {/* Stats bar - Simple services (Groq, Resend, AssemblyAI, etc.) */}
                      {isSimple && (
                        <Stack
                          direction="row"
                          spacing={2}
                          justifyContent="space-around"
                          flexWrap="wrap"
                          useFlexGap
                        >
                          {[
                            isEnabled !== undefined && {
                              label: 'Status',
                              value: isEnabled ? 'Active' : 'Not Set',
                              color: isEnabled ? '#16A34A' : '#F59E0B',
                            },
                            d.region && { label: 'Region', value: d.region, color: meta.color },
                            d.timeout && { label: 'Timeout', value: d.timeout, color: meta.color },
                            d.sdk && { label: 'SDK', value: d.sdk, color: '#7C3AED' },
                            entity.history?.length > 0 && {
                              label: 'Events',
                              value: entity.history.length,
                              color: '#16A34A',
                            },
                          ]
                            .filter(Boolean)
                            .map((s) => (
                              <Box key={s.label} sx={{ textAlign: 'center' }}>
                                <Typography
                                  sx={{ fontSize: '1rem', fontWeight: 800, color: s.color }}
                                >
                                  {s.value}
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: '0.6rem',
                                    color: 'text.secondary',
                                    fontWeight: 600,
                                  }}
                                >
                                  {s.label}
                                </Typography>
                              </Box>
                            ))}
                        </Stack>
                      )}

                      {/* Static service (no env, always healthy - like Google Fonts) */}
                      {!isDevOps && !isSimple && entity.history?.length > 0 && (
                        <Stack direction="row" spacing={2} justifyContent="space-around">
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography
                              sx={{ fontSize: '1rem', fontWeight: 800, color: '#16A34A' }}
                            >
                              Active
                            </Typography>
                            <Typography
                              sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 600 }}
                            >
                              Status
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography
                              sx={{ fontSize: '1rem', fontWeight: 800, color: meta.color }}
                            >
                              {entity.history.length}
                            </Typography>
                            <Typography
                              sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 600 }}
                            >
                              Events
                            </Typography>
                          </Box>
                        </Stack>
                      )}

                      {/* Branches list (GitHub) */}
                      {d.branches?.length > 0 && (
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              mb: 0.5,
                            }}
                          >
                            Branches:
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {d.branches.map((b) => (
                              <Chip
                                key={b}
                                size="small"
                                label={b}
                                sx={{
                                  height: 20,
                                  fontSize: '0.6rem',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                  bgcolor:
                                    b === d.defaultBranch
                                      ? alpha('#7C3AED', 0.12)
                                      : alpha(meta.color, 0.08),
                                  color: b === d.defaultBranch ? '#7C3AED' : 'text.primary',
                                  border: b === d.defaultBranch ? '1px solid' : 'none',
                                  borderColor: alpha('#7C3AED', 0.3),
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Key-value detail rows - DevOps */}
                      {isDevOps &&
                        [
                          d.repo && { label: 'Repository', value: d.repo },
                          d.latestCommitMessage && {
                            label: 'Latest',
                            value: `${d.latestCommit || ''}${d.latestCommitBranch ? ` (${d.latestCommitBranch})` : ''} - ${d.latestCommitMessage}`,
                          },
                          d.latestCommitAuthor && { label: 'Author', value: d.latestCommitAuthor },
                          d.latestCommitTime && {
                            label: 'Time',
                            value: new Date(d.latestCommitTime).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          },
                          d.latestDeployTime && {
                            label: 'Last Deploy',
                            value: new Date(d.latestDeployTime).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          },
                          d.latestBuildDuration && {
                            label: 'Build Time',
                            value: d.latestBuildDuration,
                          },
                          d.latestStatus && { label: 'Deploy Status', value: d.latestStatus },
                          d.productionUrl && { label: 'Production', value: d.productionUrl },
                          d.framework && { label: 'Framework', value: d.framework },
                        ]
                          .filter(Boolean)
                          .map((r) => (
                            <Stack key={r.label} direction="row" alignItems="center" spacing={1}>
                              <Typography
                                sx={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  color: 'text.secondary',
                                  minWidth: 80,
                                  flexShrink: 0,
                                }}
                              >
                                {r.label}:
                              </Typography>
                              <Typography
                                sx={{
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  fontFamily: 'monospace',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {r.value}
                              </Typography>
                            </Stack>
                          ))}

                      {/* Key-value detail rows - Simple services */}
                      {isSimple &&
                        [
                          d.endpoint && { label: 'Endpoint', value: d.endpoint },
                          d.purpose && { label: 'Purpose', value: d.purpose },
                          d.region &&
                            d.regionEnvKey && { label: 'Region Key', value: d.regionEnvKey },
                          d.authRequired !== undefined && {
                            label: 'Auth',
                            value: d.authRequired ? 'Required' : 'Public',
                          },
                          d.failBehavior && { label: 'Fail Mode', value: d.failBehavior },
                          d.loadMethod && { label: 'Load Method', value: d.loadMethod },
                          d.fallback && { label: 'Fallback', value: d.fallback },
                          d.projectRef && { label: 'Project', value: d.projectRef },
                        ]
                          .filter(Boolean)
                          .map((r) => (
                            <Stack key={r.label} direction="row" alignItems="center" spacing={1}>
                              <Typography
                                sx={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  color: 'text.secondary',
                                  minWidth: 80,
                                  flexShrink: 0,
                                }}
                              >
                                {r.label}:
                              </Typography>
                              <Typography
                                sx={{
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  fontFamily: 'monospace',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {r.value}
                              </Typography>
                            </Stack>
                          ))}

                      {/* Used By section */}
                      {d.usedBy?.length > 0 && (
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              mb: 0.5,
                            }}
                          >
                            Used By:
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {d.usedBy.map((u) => (
                              <Chip
                                key={u}
                                size="small"
                                label={u}
                                sx={{
                                  height: 22,
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  bgcolor: alpha(meta.color, 0.1),
                                  color: meta.color,
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Data Provided (ipwhois) */}
                      {d.dataProvided?.length > 0 && (
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              mb: 0.5,
                            }}
                          >
                            Data Provided:
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {d.dataProvided.map((item) => (
                              <Chip
                                key={item}
                                size="small"
                                label={item}
                                sx={{
                                  height: 20,
                                  fontSize: '0.58rem',
                                  fontWeight: 600,
                                  bgcolor: alpha(meta.color, 0.08),
                                  color: 'text.primary',
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Fonts (Google Fonts) */}
                      {d.fonts?.length > 0 && (
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              mb: 0.5,
                            }}
                          >
                            Fonts:
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {d.fonts.map((f) => (
                              <Chip
                                key={f}
                                size="small"
                                label={f}
                                sx={{
                                  height: 22,
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                  bgcolor: alpha(meta.color, 0.1),
                                  color: meta.color,
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Endpoints (Google Fonts, etc.) */}
                      {d.endpoints?.length > 0 && (
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              mb: 0.5,
                            }}
                          >
                            Endpoints:
                          </Typography>
                          {d.endpoints.map((ep) => (
                            <Typography
                              key={ep}
                              sx={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                fontFamily: 'monospace',
                                color: 'text.primary',
                              }}
                            >
                              {ep}
                            </Typography>
                          ))}
                        </Box>
                      )}

                      {/* Cron Jobs (vercel-cron) */}
                      {d.jobs?.length > 0 && (
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              mb: 0.5,
                            }}
                          >
                            Scheduled Jobs:
                          </Typography>
                          <Stack spacing={0.5}>
                            {d.jobs.map((job, idx) => (
                              <Paper
                                key={idx}
                                variant="outlined"
                                sx={{ p: 0.8, borderRadius: 1.5 }}
                              >
                                <Stack direction="row" alignItems="center" spacing={1}>
                                  <Chip
                                    size="small"
                                    label={job.schedule}
                                    sx={{
                                      height: 20,
                                      fontSize: '0.58rem',
                                      fontWeight: 700,
                                      fontFamily: 'monospace',
                                      bgcolor: alpha('#F59E0B', 0.1),
                                      color: '#F59E0B',
                                    }}
                                  />
                                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                                    {job.target}
                                  </Typography>
                                  <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                                    {job.frequency}
                                  </Typography>
                                </Stack>
                              </Paper>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Environment Variables */}
                      {envKeys.length > 0 && (
                        <Box>
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              mb: 0.5,
                            }}
                          >
                            Environment Variables:
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {envKeys.map((k) => (
                              <Chip
                                key={k}
                                size="small"
                                icon={
                                  isEnabled ? (
                                    <AppIcon
                                      name="CheckCircleOutline"
                                      fallback={CheckCircleOutlineIcon}
                                      sx={{ fontSize: '12px !important' }}
                                    />
                                  ) : (
                                    <AppIcon
                                      name="WarningAmberOutlined"
                                      fallback={WarningAmberOutlinedIcon}
                                      sx={{ fontSize: '12px !important' }}
                                    />
                                  )
                                }
                                label={k}
                                sx={{
                                  height: 22,
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                  bgcolor: isEnabled
                                    ? alpha('#16A34A', 0.1)
                                    : alpha('#F59E0B', 0.1),
                                  color: isEnabled ? '#16A34A' : '#F59E0B',
                                  '& .MuiChip-icon': { color: 'inherit' },
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      )}
                    </Stack>
                  </Paper>
                );
              })()}

            {/* Service: recent activity preview (last 20 events) */}
            {entity.type === 'service' && entity.history?.length > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 1.2, borderRadius: 2, borderColor: alpha(meta.color, 0.15) }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                  <AppIcon
                    name="ScheduleOutlined"
                    fallback={ScheduleOutlinedIcon}
                    sx={{ fontSize: 14, color: meta.color }}
                  />
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, color: meta.color }}>
                    Recent Activity
                  </Typography>
                  <Chip
                    size="small"
                    label={`${entity.history.length} total`}
                    sx={{
                      height: 16,
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      bgcolor: alpha(meta.color, 0.1),
                      color: meta.color,
                      ml: 'auto',
                    }}
                  />
                </Stack>
                <Stack spacing={0.5} sx={{ maxHeight: 340, overflowY: 'auto' }}>
                  {entity.history.slice(0, 20).map((h, i) => {
                    const ts = h.timestamp ? new Date(h.timestamp) : null;
                    const ago = ts
                      ? (() => {
                          const diffMs = Date.now() - ts.getTime();
                          const mins = Math.floor(diffMs / 60000);
                          if (mins < 60) return `${mins}m ago`;
                          const hours = Math.floor(mins / 60);
                          if (hours < 24) return `${hours}h ago`;
                          const days = Math.floor(hours / 24);
                          return `${days}d ago`;
                        })()
                      : '';
                    return (
                      <Stack
                        key={`${h.timestamp}-${i}`}
                        direction="row"
                        alignItems="center"
                        spacing={0.6}
                        sx={{
                          py: 0.3,
                          borderBottom: i < 19 ? '1px solid' : 'none',
                          borderColor: alpha(theme.palette.divider, 0.06),
                        }}
                      >
                        <Chip
                          size="small"
                          label={h.action || 'event'}
                          sx={{
                            height: 18,
                            fontSize: '0.58rem',
                            fontWeight: 700,
                            textTransform: 'capitalize',
                            minWidth: 48,
                            bgcolor: alpha(h.status === 'success' ? '#16A34A' : meta.color, 0.1),
                            color: h.status === 'success' ? '#16A34A' : meta.color,
                          }}
                        />
                        {h.branch && (
                          <Chip
                            size="small"
                            label={h.branch}
                            sx={{
                              height: 16,
                              fontSize: '0.52rem',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              bgcolor: alpha('#7C3AED', 0.1),
                              color: '#7C3AED',
                              maxWidth: 90,
                              '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                            }}
                          />
                        )}
                        <Typography
                          sx={{
                            fontSize: '0.63rem',
                            fontWeight: 600,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'monospace',
                          }}
                        >
                          {h.detail || h.label || '-'}
                        </Typography>
                        {h.user && (
                          <Typography
                            sx={{ fontSize: '0.56rem', color: 'text.secondary', flexShrink: 0 }}
                          >
                            {h.user}
                          </Typography>
                        )}
                        <Typography
                          sx={{
                            fontSize: '0.58rem',
                            color: 'text.secondary',
                            fontFamily: 'monospace',
                            flexShrink: 0,
                          }}
                        >
                          {ago}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            )}

            {/* Connected tables for API / service entities */}
            {connectedTables.length > 0 && (
              <>
                <Stack direction="row" alignItems="center" spacing={0.8}>
                  <AppIcon
                    name="StorageOutlined"
                    fallback={StorageOutlinedIcon}
                    sx={{ fontSize: 16, color: '#2563EB' }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    Connected Tables
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {connectedTables.map((t) => (
                    <TableSchemaCard key={t.id} tableEntity={t} onSelect={onSelect} compact />
                  ))}
                </Stack>
              </>
            )}

            {/* Warnings */}
            {entity.tags?.length > 0 && (
              <>
                <Divider />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#F59E0B' }}>
                  Warnings
                </Typography>
                <Stack spacing={0.4}>
                  {entity.tags.map((tag) => (
                    <Stack key={tag} direction="row" alignItems="center" spacing={0.8}>
                      <AppIcon
                        name="WarningAmberOutlined"
                        fallback={WarningAmberOutlinedIcon}
                        sx={{ fontSize: 14, color: '#F59E0B' }}
                      />
                      <Typography
                        sx={{ fontSize: '0.7rem', fontWeight: 500, fontFamily: 'monospace' }}
                      >
                        {tag}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </>
            )}

            {/* Quick links (supabase, app path, etc.) */}
            {(entity.links?.supabasePath || entity.links?.appPath) && (
              <>
                <Divider />
                <Box>
                  <Typography
                    sx={{ fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}
                  >
                    Quick Links:
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {entity.links.supabasePath && (
                      <Chip
                        size="small"
                        label="Supabase Editor"
                        icon={
                          <AppIcon
                            name="OpenInNewOutlined"
                            fallback={OpenInNewOutlinedIcon}
                            sx={{ fontSize: '12px !important' }}
                          />
                        }
                        onClick={() => {
                          const ref = entity.links.supabasePath;
                          const base = `https://supabase.com/dashboard/project`;
                          window.open(`${base}${ref}`, '_blank', 'noopener,noreferrer');
                        }}
                        sx={{
                          height: 24,
                          fontSize: '0.64rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          bgcolor: alpha('#16A34A', 0.08),
                          color: '#16A34A',
                          '& .MuiChip-icon': { color: 'inherit' },
                        }}
                      />
                    )}
                    {entity.links.appPath && (
                      <Chip
                        size="small"
                        label="Open in App"
                        icon={
                          <AppIcon
                            name="OpenInNewOutlined"
                            fallback={OpenInNewOutlinedIcon}
                            sx={{ fontSize: '12px !important' }}
                          />
                        }
                        onClick={() => window.open(entity.links.appPath, '_blank')}
                        sx={{
                          height: 24,
                          fontSize: '0.64rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          bgcolor: alpha('#2563EB', 0.08),
                          color: '#2563EB',
                          '& .MuiChip-icon': { color: 'inherit' },
                        }}
                      />
                    )}
                  </Stack>
                </Box>
              </>
            )}

            {/* Action buttons */}
            <Divider />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {entity.links?.endpoint && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AppIcon name="OpenInNewOutlined" fallback={OpenInNewOutlinedIcon} />}
                  onClick={() =>
                    window.open(entity.links.endpoint, '_blank', 'noopener,noreferrer')
                  }
                  sx={{ textTransform: 'none', fontSize: '0.72rem' }}
                >
                  Test API
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  <AppIcon name="ContentCopyOutlined" fallback={ContentCopyOutlinedIcon} />
                }
                onClick={() =>
                  navigator.clipboard
                    .writeText(entity.links?.endpoint || entity.label)
                    .catch(() => {})
                }
                sx={{ textTransform: 'none', fontSize: '0.72rem' }}
              >
                Copy
              </Button>
            </Stack>
          </Stack>
        )}

        {/* ═══ DATA FLOW TAB ═══ */}
        {currentTab === 'dataflow' && (
          <Stack spacing={1.5}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: meta.color }}>
              Data Flow: {entity.label}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mb: 0.5 }}>
              How data flows from this page through services to Supabase tables.
            </Typography>
            {entity.details?.dataChain?.map((svc, i) => (
              <Paper key={i} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.8,
                    bgcolor: alpha('#0284C7', isDark ? 0.08 : 0.04),
                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: alpha('#0284C7', 0.15),
                        color: '#0284C7',
                      }}
                    >
                      <AppIcon
                        name="AccountTreeOutlined"
                        fallback={AccountTreeOutlinedIcon}
                        sx={{ fontSize: 14 }}
                      />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {svc.name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>
                        via {svc.backend}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
                <Box sx={{ px: 1.5, py: 0.8 }}>
                  {svc.tables.length > 0 ? (
                    <Stack spacing={0.5}>
                      {svc.tables.map((tableName) => {
                        const tableEntity = allEntities.find((e) => e.id === `table-${tableName}`);
                        return (
                          <Stack key={tableName} direction="row" alignItems="center" spacing={0.8}>
                            <AppIcon
                              name="KeyboardDoubleArrowRight"
                              fallback={KeyboardDoubleArrowRightIcon}
                              sx={{ fontSize: 14, color: '#2563EB' }}
                            />
                            <Paper
                              variant="outlined"
                              sx={{
                                flex: 1,
                                px: 1,
                                py: 0.5,
                                borderRadius: 1.5,
                                cursor: 'pointer',
                                '&:hover': {
                                  bgcolor: alpha('#2563EB', 0.06),
                                  borderColor: '#2563EB',
                                },
                              }}
                              onClick={() => tableEntity && onSelect(tableEntity.id)}
                            >
                              <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                              >
                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                  <AppIcon
                                    name="TableChartOutlined"
                                    fallback={TableChartOutlinedIcon}
                                    sx={{ fontSize: 13, color: '#2563EB' }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      fontFamily: 'monospace',
                                      color: '#2563EB',
                                    }}
                                  >
                                    {tableName}
                                  </Typography>
                                </Stack>
                                <Stack direction="row" spacing={0.3}>
                                  {svc.operations.map((op) => (
                                    <Chip
                                      key={op}
                                      size="small"
                                      label={op.toUpperCase()}
                                      sx={{
                                        height: 14,
                                        fontSize: '0.48rem',
                                        fontWeight: 800,
                                        bgcolor: alpha(OP_COLORS[op] || '#94A3B8', 0.12),
                                        color: OP_COLORS[op] || '#94A3B8',
                                      }}
                                    />
                                  ))}
                                </Stack>
                              </Stack>
                              {tableEntity && (
                                <Typography
                                  sx={{ fontSize: '0.58rem', color: 'text.secondary', mt: 0.2 }}
                                >
                                  {tableEntity.details?.columns?.length || 0} columns
                                  {tableEntity.details?.rowCount != null
                                    ? ` · ${tableEntity.details.rowCount} rows`
                                    : ''}
                                </Typography>
                              )}
                            </Paper>
                          </Stack>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Typography
                      sx={{ fontSize: '0.65rem', color: 'text.secondary', fontStyle: 'italic' }}
                    >
                      {svc.backend === 'localStorage'
                        ? 'Uses browser localStorage (no Supabase)'
                        : 'No direct table access'}
                    </Typography>
                  )}
                </Box>
              </Paper>
            ))}
          </Stack>
        )}

        {/* ═══ CONNECTIONS TAB ═══ */}
        {currentTab === 'connections' && (
          <Stack spacing={1.5}>
            {connections.incoming.length > 0 && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
                  <AppIcon
                    name="ArrowBack"
                    fallback={ArrowBackIcon}
                    sx={{ fontSize: 14, color: '#16A34A' }}
                  />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#16A34A' }}>
                    Incoming ({connections.incoming.length})
                  </Typography>
                </Stack>
                <Stack spacing={0.4}>
                  {connections.incoming.map((c) => {
                    const relMeta = RELATIONSHIP_META[c.relationship] || RELATIONSHIP_META.default;
                    const srcMeta = TYPE_META[c.sourceEntity.type] || TYPE_META.service;
                    return (
                      <Paper
                        key={c.id}
                        variant="outlined"
                        sx={{
                          p: 0.8,
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: alpha(relMeta.color, 0.06) },
                        }}
                        onClick={() => onSelect(c.sourceEntity.id)}
                      >
                        <Stack direction="row" alignItems="center" spacing={0.8}>
                          <AppIcon
                            fallback={srcMeta.icon}
                            sx={{ fontSize: 14, color: srcMeta.color }}
                          />
                          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, flex: 1 }}>
                            {c.sourceEntity.label}
                          </Typography>
                          <Chip
                            size="small"
                            label={relMeta.label}
                            sx={{
                              height: 16,
                              fontSize: '0.55rem',
                              fontWeight: 700,
                              bgcolor: alpha(relMeta.color, 0.12),
                              color: relMeta.color,
                            }}
                          />
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            )}
            {connections.outgoing.length > 0 && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
                  <AppIcon
                    name="ArrowForward"
                    fallback={ArrowForwardIcon}
                    sx={{ fontSize: 14, color: '#2563EB' }}
                  />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563EB' }}>
                    Outgoing ({connections.outgoing.length})
                  </Typography>
                </Stack>
                <Stack spacing={0.4}>
                  {connections.outgoing.map((c) => {
                    const relMeta = RELATIONSHIP_META[c.relationship] || RELATIONSHIP_META.default;
                    const tgtMeta = TYPE_META[c.targetEntity.type] || TYPE_META.service;
                    return (
                      <Paper
                        key={c.id}
                        variant="outlined"
                        sx={{
                          p: 0.8,
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: alpha(relMeta.color, 0.06) },
                        }}
                        onClick={() => onSelect(c.targetEntity.id)}
                      >
                        <Stack direction="row" alignItems="center" spacing={0.8}>
                          <AppIcon
                            fallback={tgtMeta.icon}
                            sx={{ fontSize: 14, color: tgtMeta.color }}
                          />
                          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, flex: 1 }}>
                            {c.targetEntity.label}
                          </Typography>
                          <Chip
                            size="small"
                            label={relMeta.label}
                            sx={{
                              height: 16,
                              fontSize: '0.55rem',
                              fontWeight: 700,
                              bgcolor: alpha(relMeta.color, 0.12),
                              color: relMeta.color,
                            }}
                          />
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            )}
            {connections.incoming.length === 0 && connections.outgoing.length === 0 && (
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  color: 'text.secondary',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  py: 2,
                }}
              >
                No connections found
              </Typography>
            )}
          </Stack>
        )}

        {/* ═══ FLOW MAP TAB ═══ */}
        {currentTab === 'flowmap' && (
          <Stack spacing={1.5}>
            {/* Downstream dependencies */}
            {Object.keys(flowMap).length > 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 2, borderColor: alpha('#2563EB', 0.2) }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                  <AppIcon
                    name="ArrowForward"
                    fallback={ArrowForwardIcon}
                    sx={{ fontSize: 14, color: '#2563EB' }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563EB' }}>
                    Full Dependency Chain
                  </Typography>
                  <Chip
                    size="small"
                    label={`${flowMapCount} entities`}
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      bgcolor: alpha('#2563EB', 0.1),
                      color: '#2563EB',
                    }}
                  />
                </Stack>
                <Stack spacing={1}>
                  {Object.entries(flowMap).map(([type, items]) => {
                    const tmeta = TYPE_META[type] || TYPE_META.service;
                    const TIcon = tmeta.icon;
                    return (
                      <Stack key={type} spacing={0.4}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <AppIcon fallback={TIcon} sx={{ fontSize: 14, color: tmeta.color }} />
                          <Typography
                            sx={{ fontSize: '0.72rem', fontWeight: 800, color: tmeta.color }}
                          >
                            {tmeta.label} ({items.length})
                          </Typography>
                        </Stack>
                        {items.map(({ entity: e, relationship, metric }) => (
                          <Stack
                            key={e.id}
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ pl: 2.5 }}
                          >
                            <Chip
                              size="small"
                              label={e.label}
                              onClick={() => onSelect(e.id)}
                              sx={{
                                height: 20,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                bgcolor: alpha(tmeta.color, 0.08),
                                color: tmeta.color,
                                '&:hover': { bgcolor: alpha(tmeta.color, 0.18) },
                              }}
                            />
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              {metric && (
                                <Typography
                                  sx={{
                                    fontSize: '0.58rem',
                                    color: 'text.disabled',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {metric}
                                </Typography>
                              )}
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  bgcolor:
                                    e.health === 'healthy'
                                      ? '#16A34A'
                                      : e.health === 'warning'
                                        ? '#F59E0B'
                                        : '#DC2626',
                                }}
                              />
                            </Stack>
                          </Stack>
                        ))}
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            )}

            {/* Impact analysis */}
            {impactList.length > 0 && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  borderColor: alpha('#DC2626', 0.2),
                  bgcolor: alpha('#DC2626', isDark ? 0.03 : 0.01),
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                  <AppIcon
                    name="ErrorOutline"
                    fallback={ErrorOutlineIcon}
                    sx={{ fontSize: 14, color: '#DC2626' }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#DC2626' }}>
                    Impact - if this breaks
                  </Typography>
                  <Chip
                    size="small"
                    label={`${impactList.length} affected`}
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      bgcolor: alpha('#DC2626', 0.1),
                      color: '#DC2626',
                    }}
                  />
                </Stack>
                <Stack spacing={0.3}>
                  {(() => {
                    const byType = {};
                    impactList.forEach(({ entity: e }) => {
                      if (!byType[e.type]) byType[e.type] = [];
                      byType[e.type].push(e);
                    });
                    return Object.entries(byType).map(([type, items]) => {
                      const tmeta = TYPE_META[type] || TYPE_META.service;
                      return (
                        <Typography
                          key={type}
                          sx={{ fontSize: '0.68rem', color: 'text.secondary' }}
                        >
                          <strong style={{ color: tmeta.color }}>
                            {items.length} {tmeta.label}
                            {items.length > 1 ? 's' : ''}
                          </strong>
                          : {items.map((e) => e.label).join(', ')}
                        </Typography>
                      );
                    });
                  })()}
                </Stack>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', mt: 1 }}>
                  Total blast radius: {impactList.length} entities
                </Typography>
              </Paper>
            )}

            {flowMapCount === 0 && impactList.length === 0 && (
              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
                No dependencies or impact data for this entity.
              </Typography>
            )}
          </Stack>
        )}

        {/* ═══ CODE TAB ═══ */}
        {currentTab === 'code' && sourceFile && (
          <Stack spacing={1}>
            {!codeContent && !codeLoading && (
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  setCodeLoading(true);
                  try {
                    const headers = await (await import('../lib/supabaseEdge')).getAuthHeaders();
                    const res = await fetch(
                      `/api/ops?path=read-source&file=${encodeURIComponent(sourceFile)}`,
                      { headers }
                    );
                    const data = await res.json();
                    setCodeContent(data.error ? { error: data.error } : data);
                  } catch (err) {
                    setCodeContent({ error: err.message });
                  } finally {
                    setCodeLoading(false);
                  }
                }}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Load {sourceFile}
              </Button>
            )}
            {codeLoading && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={14} />
                <Typography sx={{ fontSize: '0.72rem' }}>Loading source...</Typography>
              </Stack>
            )}
            {codeContent?.error && (
              <Alert severity="error" sx={{ fontSize: '0.72rem' }}>
                {codeContent.error}
              </Alert>
            )}
            {codeContent?.content && (
              <Paper
                variant="outlined"
                sx={{ p: 1, borderRadius: 2, maxHeight: 400, overflow: 'auto' }}
              >
                <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', mb: 0.5 }}>
                  {codeContent.file} · {codeContent.lines} lines
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontSize: '0.62rem',
                    fontFamily: 'monospace',
                    m: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                    color: 'text.secondary',
                  }}
                >
                  {codeContent.content}
                </Box>
              </Paper>
            )}
          </Stack>
        )}

        {/* ═══ DATA TAB ═══ */}
        {currentTab === 'data' && entity.type === 'table' && (
          <Stack spacing={1}>
            {!tableData && !tableLoading && (
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  setTableLoading(true);
                  try {
                    const headers = await (await import('../lib/supabaseEdge')).getAuthHeaders();
                    const tableName = entity.id.replace('table-', '');
                    const res = await fetch(
                      `/api/ops?path=table-preview&table=${encodeURIComponent(tableName)}`,
                      { headers }
                    );
                    const data = await res.json();
                    setTableData(data.error ? { error: data.error } : data);
                  } catch (err) {
                    setTableData({ error: err.message });
                  } finally {
                    setTableLoading(false);
                  }
                }}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Load {entity.id.replace('table-', '')} data
              </Button>
            )}
            {tableLoading && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={14} />
                <Typography sx={{ fontSize: '0.72rem' }}>Loading rows...</Typography>
              </Stack>
            )}
            {tableData?.error && (
              <Alert severity="error" sx={{ fontSize: '0.72rem' }}>
                {tableData.error}
              </Alert>
            )}
            {tableData?.rows && (
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', px: 1, pt: 0.5 }}>
                  {tableData.totalRows} total rows · showing {tableData.returnedRows}
                </Typography>
                <TableContainer sx={{ maxHeight: 350 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {tableData.columns?.map((col) => (
                          <TableCell
                            key={col.name}
                            sx={{
                              fontSize: '0.6rem',
                              fontWeight: 800,
                              py: 0.5,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col.name}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableData.rows.map((row, i) => (
                        <TableRow key={i} hover>
                          {tableData.columns?.map((col) => (
                            <TableCell
                              key={col.name}
                              sx={{
                                fontSize: '0.58rem',
                                py: 0.3,
                                maxWidth: 180,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {typeof row[col.name] === 'object'
                                ? JSON.stringify(row[col.name])?.slice(0, 80)
                                : String(row[col.name] ?? '')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </Stack>
        )}

        {/* ═══ INSIGHTS TAB ═══ */}
        {currentTab === 'insights' && (
          <Stack spacing={1.5}>
            {entity.insights?.map((insight, i) => (
              <Paper
                key={i}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  borderColor: alpha(insight.severity === 'critical' ? '#DC2626' : '#F59E0B', 0.3),
                  bgcolor: alpha(
                    insight.severity === 'critical' ? '#DC2626' : '#F59E0B',
                    isDark ? 0.05 : 0.02
                  ),
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <AppIcon
                    name="WarningAmberOutlined"
                    fallback={WarningAmberOutlinedIcon}
                    sx={{
                      fontSize: 16,
                      color: insight.severity === 'critical' ? '#DC2626' : '#F59E0B',
                      mt: 0.2,
                    }}
                  />
                  <Box>
                    <Chip
                      size="small"
                      label={insight.severity}
                      sx={{
                        height: 16,
                        fontSize: '0.55rem',
                        fontWeight: 800,
                        mb: 0.5,
                        bgcolor: alpha(
                          insight.severity === 'critical' ? '#DC2626' : '#F59E0B',
                          0.15
                        ),
                        color: insight.severity === 'critical' ? '#DC2626' : '#F59E0B',
                      }}
                    />
                    <Typography
                      sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.6 }}
                    >
                      {insight.text}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
            {!entity.insights?.length && (
              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
                No optimization insights for this entity.
              </Typography>
            )}
          </Stack>
        )}

        {/* ═══ RULES & PIPELINES TAB ═══ */}
        {currentTab === 'rules' && (
          <Stack spacing={1.5}>
            {/* Rules */}
            {entity.rules?.length > 0 && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha(meta.color, isDark ? 0.05 : 0.02),
                  borderColor: alpha(meta.color, 0.18),
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                  <AppIcon
                    name="SecurityOutlined"
                    fallback={SecurityOutlinedIcon}
                    sx={{ fontSize: 16, color: meta.color }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: meta.color }}>
                    Rules & Constraints
                  </Typography>
                </Stack>
                <Stack spacing={0.8}>
                  {entity.rules.map((rule, i) => (
                    <Paper
                      key={i}
                      variant="outlined"
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.background.default, 0.5),
                      }}
                    >
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                        {rule.label}
                      </Typography>
                      <Typography
                        sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.5 }}
                      >
                        {rule.detail}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            )}

            {/* Pipelines */}
            {entity.pipelines?.length > 0 && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha('#9333EA', isDark ? 0.05 : 0.02),
                  borderColor: alpha('#9333EA', 0.18),
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                  <AppIcon
                    name="AccountTreeOutlined"
                    fallback={AccountTreeOutlinedIcon}
                    sx={{ fontSize: 16, color: '#9333EA' }}
                  />
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: '#9333EA' }}>
                    Pipeline Membership
                  </Typography>
                </Stack>
                <Stack spacing={0.8}>
                  {entity.pipelines.map((pipelineKey, i) => {
                    const pipeline =
                      typeof pipelineKey === 'object'
                        ? pipelineKey
                        : pipelinesMap[pipelineKey] || null;
                    const label =
                      pipeline?.label ||
                      String(pipelineKey)
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                    const description = pipeline?.description || '';
                    return (
                      <Paper
                        key={i}
                        variant="outlined"
                        sx={{
                          p: 1,
                          borderRadius: 1.5,
                          bgcolor: alpha(theme.palette.background.default, 0.5),
                        }}
                      >
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                          {label}
                        </Typography>
                        {description && (
                          <Typography
                            sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.5 }}
                          >
                            {description}
                          </Typography>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            )}

            {!entity.rules?.length && !entity.pipelines?.length && (
              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
                No rules or pipeline data available for this entity.
              </Typography>
            )}
          </Stack>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {currentTab === 'history' && (
          <Stack spacing={1.5}>
            <Paper
              variant="outlined"
              sx={{
                p: 1.2,
                borderRadius: 2,
                bgcolor: alpha(meta.color, isDark ? 0.05 : 0.02),
                borderColor: alpha(meta.color, 0.18),
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.8}>
                <AppIcon
                  name="ScheduleOutlined"
                  fallback={ScheduleOutlinedIcon}
                  sx={{ fontSize: 16, color: meta.color }}
                />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: meta.color }}>
                  Activity History
                </Typography>
                <Chip
                  size="small"
                  label={`${entity.history?.length || 0} events`}
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    bgcolor: alpha(meta.color, 0.1),
                    color: meta.color,
                    ml: 'auto',
                  }}
                />
              </Stack>
            </Paper>

            {entity.history?.length > 0 ? (
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  overflow: 'hidden',
                  '& .MuiTableCell-root': {
                    fontSize: '0.68rem',
                    py: 0.8,
                    px: 1,
                    borderColor: alpha(theme.palette.divider, 0.08),
                  },
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Timestamp', 'Action', 'Details', 'Status'].map((h) => (
                        <TableCell
                          key={h}
                          sx={{
                            fontWeight: 800,
                            fontSize: '0.65rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            bgcolor: isDark
                              ? alpha(theme.palette.background.default, 0.95)
                              : alpha(theme.palette.action.hover, 0.5),
                            borderBottom: '2px solid',
                            borderColor: alpha(meta.color, 0.25),
                            color: 'text.secondary',
                          }}
                        >
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entity.history.map((h, i) => {
                      const actionColor =
                        h.status === 'success'
                          ? '#16A34A'
                          : h.action?.includes('delete') || h.action?.includes('remove')
                            ? '#DC2626'
                            : h.action?.includes('create') ||
                                h.action?.includes('insert') ||
                                h.action?.includes('add')
                              ? '#16A34A'
                              : h.action?.includes('update') ||
                                  h.action?.includes('edit') ||
                                  h.action?.includes('change')
                                ? '#2563EB'
                                : meta.color;
                      const statusColor =
                        h.status === 'success'
                          ? '#16A34A'
                          : h.status === 'error'
                            ? '#DC2626'
                            : '#64748B';
                      const ts = h.timestamp ? new Date(h.timestamp) : null;
                      const dateStr = ts
                        ? ts.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '-';
                      const timeStr = ts
                        ? ts.toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '';
                      return (
                        <TableRow
                          key={`${h.timestamp}-${i}`}
                          hover
                          sx={{
                            '&:hover': { bgcolor: alpha(meta.color, 0.04) },
                            '&:last-child td': { borderBottom: 0 },
                          }}
                        >
                          <TableCell>
                            <Stack spacing={0}>
                              <Typography
                                sx={{
                                  fontSize: '0.66rem',
                                  fontWeight: 600,
                                  fontFamily: 'monospace',
                                  color: 'text.primary',
                                  lineHeight: 1.3,
                                }}
                              >
                                {dateStr}
                              </Typography>
                              <Typography
                                sx={{
                                  fontSize: '0.6rem',
                                  color: 'text.secondary',
                                  fontFamily: 'monospace',
                                  lineHeight: 1.3,
                                }}
                              >
                                {timeStr}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Stack spacing={0.3}>
                              <Typography
                                sx={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textTransform: 'capitalize',
                                  color: actionColor,
                                }}
                              >
                                {(h.label || h.action || '').replace(/_/g, ' ')}
                              </Typography>
                              {h.user && h.user !== '-' && (
                                <Stack direction="row" alignItems="center" spacing={0.3}>
                                  <AppIcon
                                    name="PersonOutline"
                                    fallback={PersonOutlineIcon}
                                    sx={{ fontSize: 10, color: 'text.secondary' }}
                                  />
                                  <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>
                                    {h.user}
                                  </Typography>
                                </Stack>
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography
                              sx={{
                                fontSize: '0.65rem',
                                color: 'text.secondary',
                                fontFamily: 'monospace',
                                maxWidth: 160,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {h.size ? `${h.detail} (${h.size})` : h.detail || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={h.status || 'logged'}
                              sx={{
                                height: 18,
                                fontSize: '0.55rem',
                                fontWeight: 700,
                                bgcolor: alpha(statusColor, 0.12),
                                color: statusColor,
                                '& .MuiChip-label': { px: 0.6 },
                              }}
                              icon={
                                <Box
                                  sx={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: '50%',
                                    bgcolor: statusColor,
                                    ml: 0.5,
                                    flexShrink: 0,
                                  }}
                                />
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
                <AppIcon
                  name="ScheduleOutlined"
                  fallback={ScheduleOutlinedIcon}
                  sx={{ fontSize: 32, color: alpha(theme.palette.text.secondary, 0.3), mb: 1 }}
                />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.secondary' }}>
                  No history recorded yet
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 0.5 }}>
                  Activity events will appear here as actions occur in the system.
                </Typography>
              </Paper>
            )}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

/* ──────────── DATA FLOW LEGEND ──────────── */

function FlowLegend({ theme }) {
  const isDark = theme.palette.mode === 'dark';
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.2,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.background.paper, isDark ? 0.9 : 0.95),
      }}
    >
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, mb: 0.8 }}>
        Data Flow Legend
      </Typography>
      <Stack spacing={0.65}>
        {Object.entries(RELATIONSHIP_META)
          .filter(([k]) => k !== 'default')
          .map(([key, m]) => (
            <Stack key={key} direction="row" alignItems="center" spacing={0.9}>
              <Box
                sx={{
                  width: 44,
                  height: 14,
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 9,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    borderTop: `${Math.max(2, m.width)}px ${m.dasharray ? 'dashed' : 'solid'} ${m.color}`,
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 0,
                    height: 0,
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                    borderLeft: `7px solid ${m.color}`,
                  }}
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, lineHeight: 1.15 }}>
                  {m.label}
                </Typography>
                <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', lineHeight: 1.1 }}>
                  {m.channel}
                </Typography>
              </Box>
            </Stack>
          ))}
      </Stack>
      <Divider sx={{ my: 0.8 }} />
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, mb: 0.5 }}>Health Status</Typography>
      <Stack spacing={0.4}>
        {Object.entries(HEALTH_COLORS).map(([key, color]) => (
          <Stack key={key} direction="row" alignItems="center" spacing={0.8}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
            <Typography sx={{ fontSize: '0.63rem', fontWeight: 600, textTransform: 'capitalize' }}>
              {key}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Divider sx={{ my: 0.8 }} />
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, mb: 0.5 }}>Categories</Typography>
      <Stack spacing={0.4}>
        {Object.entries(CATEGORY_LANES).map(([key, lane]) => (
          <Stack key={key} direction="row" alignItems="center" spacing={0.8}>
            <Box sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: lane.color }} />
            <Typography sx={{ fontSize: '0.63rem', fontWeight: 600 }}>{lane.label}</Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

/* ──────────── STAT CARDS (always visible) ──────────── */

function DataStatCards({ entities, theme }) {
  const categoryStats = useMemo(() => {
    const stats = {};
    Object.keys(CATEGORY_LANES).forEach((cat) => {
      const items = entities.filter((e) => e.category === cat);
      const total = items.length;
      const working = items.filter((e) => e.health === 'healthy').length;
      stats[cat] = { total, working, notWorking: total - working };
    });
    return stats;
  }, [entities]);

  const statCards = Object.entries(CATEGORY_LANES).map(([cat, lane]) => {
    const s = categoryStats[cat] || { total: 0, working: 0, notWorking: 0 };
    const Icon = CATEGORY_ICONS[cat] || CloudOutlinedIcon;
    return {
      label: lane.label,
      value: s.total,
      helper: `${s.working} healthy · ${s.notWorking} issues`,
      color: lane.color,
      icon: Icon,
    };
  });

  return (
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
            lg: 'repeat(6, minmax(0, 1fr))',
          },
        }}
      >
        {statCards.map((card) => {
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
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
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
  );
}

/* ──────────── MAIN DATA COMPONENT ──────────── */

export default function Data() {
  const theme = useTheme();
  const graphRef = useRef(null);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entities, setEntities] = useState([]);
  const [edgesRaw, setEdgesRaw] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [viewMode, setViewMode] = useState('platform');
  const [showAll, setShowAll] = useState(false);
  const [pipelinesMap, setPipelinesMap] = useState({});
  const [liveMetrics, setLiveMetrics] = useState({});
  const [globalInsights, setGlobalInsights] = useState([]);
  const [chatQuery, setChatQuery] = useState('');
  const [chatResponse, setChatResponse] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHighlightIds, setChatHighlightIds] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(!isMobile);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLegend, setShowLegend] = useState(!isMobile);
  const [showMetrics, setShowMetrics] = useShowMetrics('data');
  const [enhancedView, setEnhancedView] = useState(() => {
    try {
      const v = localStorage.getItem('orch_data_enhanced_view');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });

  // ── Process Guides (Goal / Loop / Pulse workflow maps) ──
  const [guideMode, setGuideMode] = useState(false);

  // ── Flow Trace (animated goal execution) ──
  const [flowTraceMode, setFlowTraceMode] = useState(false);
  const [flowTraceGoals, setFlowTraceGoals] = useState([]);
  const [flowTraceGoalId, setFlowTraceGoalId] = useState(null);
  const [flowTraceData, setFlowTraceData] = useState(null);
  const [flowTraceStep, setFlowTraceStep] = useState(0);
  const [flowTracePlaying, setFlowTracePlaying] = useState(false);
  const [flowTraceLoading, setFlowTraceLoading] = useState(false);

  const isDark = theme.palette.mode === 'dark';
  // Render a lighter graph model on mobile to prevent browser refresh/crash loops.
  const useSimpleMobileGraph = isMobile;

  // Restore scroll position on mount, save on unmount (desktop only - causes reload loops on mobile)
  useEffect(() => {
    if (isMobile) return;
    const prefs = loadDataPagePreferences();
    if (prefs.scrollPosition && typeof window !== 'undefined') {
      const t = setTimeout(() => window.scrollTo(0, prefs.scrollPosition), 100);
      return () => clearTimeout(t);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    return () => {
      if (typeof window !== 'undefined') {
        saveDataPagePreferences({ scrollPosition: window.scrollY });
      }
    };
  }, [isMobile]);

  // Prevent pull-to-refresh while panning the graph on mobile browsers.
  useEffect(() => {
    if (!isMobile || typeof document === 'undefined') return;
    const prevBody = document.body.style.overscrollBehaviorY;
    const prevHtml = document.documentElement.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = 'contain';
    document.documentElement.style.overscrollBehaviorY = 'contain';
    return () => {
      document.body.style.overscrollBehaviorY = prevBody;
      document.documentElement.style.overscrollBehaviorY = prevHtml;
    };
  }, [isMobile]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await loadTopologyPayload();
        if (!active) return;
        setEntities(Array.isArray(payload?.entities) ? payload.entities : []);
        setEdgesRaw(Array.isArray(payload?.edges) ? payload.edges : []);
        setPipelinesMap(payload?.pipelines || {});
        setLiveMetrics(payload?.liveMetrics || {});
        setGlobalInsights(payload?.insights || []);
        setMeta(payload?.meta || null);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load live topology.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const positioned = useMemo(
    () =>
      enhancedView && !useSimpleMobileGraph
        ? positionEntitiesGrouped(entities)
        : positionEntities(entities),
    [entities, enhancedView, useSimpleMobileGraph]
  );
  const entityMap = useMemo(
    () => Object.fromEntries(positioned.filter((e) => !e.__isGroup).map((e) => [e.id, e])),
    [positioned]
  );

  const isAuditMode = viewMode === 'audit';

  const connectionCounts = useMemo(() => {
    const counts = {};
    edgesRaw.forEach((e) => {
      if (!counts[e.source]) counts[e.source] = { out: 0, in: 0 };
      counts[e.source].out++;
      if (!counts[e.target]) counts[e.target] = { out: 0, in: 0 };
      counts[e.target].in++;
    });
    return counts;
  }, [edgesRaw]);

  const auditSummary = useMemo(() => {
    if (!isAuditMode) return null;
    const dead = [];
    const low = [];
    const hotspots = [];
    positioned
      .filter((e) => !e.__isGroup)
      .forEach((e) => {
        const c = connectionCounts[e.id] || { out: 0, in: 0 };
        const total = c.out + c.in;
        // Frontend pages are entry points - 0 inbound is normal for them
        if (c.in === 0 && e.type !== 'frontend') dead.push({ ...e, connections: c });
        else if (total > 0 && total <= 2) low.push({ ...e, connections: c });
        hotspots.push({ ...e, connections: c, total });
      });
    hotspots.sort((a, b) => b.total - a.total);
    return { dead, low, hotspots: hotspots.slice(0, 8) };
  }, [isAuditMode, positioned, connectionCounts]);

  const allowedCategories = useMemo(() => {
    if (showAll) return null;
    if (viewMode === 'all') return null;
    if (viewMode === 'audit') return null;
    if (viewMode === 'platform')
      return new Set([
        'frontend',
        'api',
        'communication',
        'agents',
        'teams',
        'consilium',
        'llm',
        'crons',
        'infrastructure',
      ]);
    if (viewMode === 'database') return new Set(['database']);
    if (viewMode === 'apis') return new Set(['api']);
    if (viewMode === 'services') return new Set(['infrastructure']);
    if (viewMode === 'security') return new Set(['security', 'database', 'api']);
    if (viewMode === 'storage')
      return { categories: new Set(['infrastructure', 'database']), types: new Set(['storage']) };
    if (viewMode === 'agents') return new Set(['agents', 'teams', 'llm', 'api']);
    if (viewMode === 'communication') return new Set(['communication', 'api']);
    if (viewMode === 'teams') return new Set(['teams', 'agents']);
    if (viewMode === 'consilium') return new Set(['consilium']);
    if (viewMode === 'llm') return new Set(['llm', 'agents']);
    if (viewMode === 'crons') return new Set(['crons', 'api']);
    return new Set(['frontend']);
  }, [viewMode, showAll]);

  const categoryEntities = useMemo(() => {
    return positioned.filter((e) => {
      if (e.__isGroup) return false;
      if (allowedCategories) {
        if (allowedCategories instanceof Set) {
          if (!allowedCategories.has(e.category)) return false;
        } else if (allowedCategories.categories && allowedCategories.types) {
          if (!allowedCategories.categories.has(e.category) || !allowedCategories.types.has(e.type))
            return false;
        }
      }
      return true;
    });
  }, [positioned, allowedCategories]);

  const seedEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categoryEntities.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (healthFilter !== 'all' && e.health !== healthFilter) return false;
      if (!q) return true;
      return (
        (e.label || '').toLowerCase().includes(q) ||
        (e.id || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.type || '').toLowerCase().includes(q) ||
        (e.info || '').toLowerCase().includes(q)
      );
    });
  }, [categoryEntities, search, typeFilter, healthFilter]);

  const visibleIds = useMemo(() => {
    const seedIds = new Set(seedEntities.map((e) => e.id));
    const map = new Map();
    seedIds.forEach((id) => map.set(id, 'seed'));
    edgesRaw.forEach((edge) => {
      if (seedIds.has(edge.source) && !map.has(edge.target)) {
        map.set(edge.target, 'connected');
      }
      if (seedIds.has(edge.target) && !map.has(edge.source)) {
        map.set(edge.source, 'connected');
      }
    });
    return map;
  }, [seedEntities, edgesRaw]);

  const filteredEntities = useMemo(
    () => positioned.filter((e) => e.__isGroup || visibleIds.has(e.id)),
    [positioned, visibleIds]
  );

  const filteredEdges = useMemo(
    () => edgesRaw.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edgesRaw, visibleIds]
  );

  const connectedIds = useMemo(() => {
    if (!selectedId) return new Set();
    const ids = new Set();
    edgesRaw.forEach((e) => {
      if (e.source === selectedId) ids.add(e.target);
      if (e.target === selectedId) ids.add(e.source);
    });
    return ids;
  }, [selectedId, edgesRaw]);

  const handleNodeSelect = useCallback((id) => {
    setSelectedId(id);
  }, []);

  // ── Flow Trace: fetch recent goals for dropdown ──
  const handleFlowTraceOpen = useCallback(async () => {
    setFlowTraceMode(true);
    setFlowTraceGoals([]);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/app?path=goals&op=list', { headers });
      if (res.ok) {
        const data = await res.json();
        setFlowTraceGoals(data.data || data || []);
      }
    } catch (err) {
      console.error('Failed to fetch goals for trace:', err);
    }
  }, []);

  const handleFlowTraceClose = useCallback(() => {
    setFlowTraceMode(false);
    setFlowTraceGoalId(null);
    setFlowTraceData(null);
    setFlowTraceStep(0);
    setFlowTracePlaying(false);
    setFlowTraceLoading(false);
  }, []);

  const handleFlowTraceSelect = useCallback(async (goalId) => {
    setFlowTraceGoalId(goalId);
    setFlowTraceStep(0);
    setFlowTracePlaying(false);
    setFlowTraceLoading(true);
    setFlowTraceData(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/ops?path=goal-trace&goalId=${goalId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFlowTraceData(data);
        setTimeout(() => setFlowTracePlaying(true), 500);
      }
    } catch (err) {
      console.error('Failed to fetch goal trace:', err);
    } finally {
      setFlowTraceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!flowTracePlaying || !flowTraceData?.steps?.length) return;
    const totalSteps = flowTraceData.steps.length;
    if (flowTraceStep >= totalSteps - 1) {
      setFlowTracePlaying(false);
      return;
    }
    const timer = setInterval(() => {
      setFlowTraceStep((prev) => {
        if (prev >= totalSteps - 1) {
          setFlowTracePlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [flowTracePlaying, flowTraceData, flowTraceStep]);

  const flowTraceActiveIds = useMemo(() => {
    if (!flowTraceMode || !flowTraceData?.steps?.length) return null;
    const currentStep = flowTraceData.steps[flowTraceStep];
    if (!currentStep) return null;
    const active = new Set();
    active.add(currentStep.entityId);
    if (currentStep.entityPath) currentStep.entityPath.forEach((id) => active.add(id));
    return active;
  }, [flowTraceMode, flowTraceData, flowTraceStep]);

  const flowTraceAllIds = useMemo(() => {
    if (!flowTraceMode || !flowTraceData?.steps?.length) return null;
    const all = new Set();
    flowTraceData.steps.forEach((s) => {
      all.add(s.entityId);
      if (s.entityPath) s.entityPath.forEach((id) => all.add(id));
    });
    return all;
  }, [flowTraceMode, flowTraceData]);

  const flowTraceCompletedIds = useMemo(() => {
    if (!flowTraceMode || !flowTraceData?.steps?.length) return null;
    const done = new Set();
    for (let i = 0; i < flowTraceStep; i++) {
      const s = flowTraceData.steps[i];
      done.add(s.entityId);
      if (s.entityPath) s.entityPath.forEach((id) => done.add(id));
    }
    return done;
  }, [flowTraceMode, flowTraceData, flowTraceStep]);

  const nodes = useMemo(() => {
    if (useSimpleMobileGraph) {
      return [];
    }

    // Group nodes must come first, then child nodes
    const groupNodes = [];
    const entityNodes = [];

    filteredEntities.forEach((e) => {
      if (e.__isGroup) {
        groupNodes.push({
          id: e.id,
          type: 'categoryGroup',
          position: e.position,
          data: e.data,
          style: e.style,
          draggable: false,
          selectable: false,
          connectable: false,
        });
      } else {
        const node = {
          id: e.id,
          position: e.position,
          type: 'systemNode',
          data: {
            entity: e,
            isSelected: selectedId === e.id,
            isHighlighted: selectedId ? (selectedId === e.id ? true : null) : null,
            isConnected: connectedIds.has(e.id),
            isCrossCategory: visibleIds.get(e.id) === 'connected',
            isAuditMode,
            auditCounts: connectionCounts[e.id] || EMPTY_AUDIT_COUNTS,
            onSelect: handleNodeSelect,
            flowTraceMode,
            flowTraceActive: flowTraceActiveIds?.has(e.id) || false,
            flowTraceCompleted: flowTraceCompletedIds?.has(e.id) || false,
            flowTraceInvolved: flowTraceAllIds?.has(e.id) || false,
          },
        };
        if (e.parentId) {
          node.parentId = e.parentId;
          node.extent = 'parent';
        }
        entityNodes.push(node);
      }
    });

    return [...groupNodes, ...entityNodes];
  }, [
    filteredEntities,
    selectedId,
    connectedIds,
    visibleIds,
    handleNodeSelect,
    useSimpleMobileGraph,
    isAuditMode,
    connectionCounts,
    flowTraceMode,
    flowTraceActiveIds,
    flowTraceCompletedIds,
    flowTraceAllIds,
  ]);

  const edges = useMemo(() => {
    if (useSimpleMobileGraph) {
      return [];
    }

    return filteredEdges.map((e) => {
      const relMeta = RELATIONSHIP_META[e.relationship] || RELATIONSHIP_META.default;
      const isConnectedEdge = Boolean(
        selectedId && (e.source === selectedId || e.target === selectedId)
      );
      const animateParticle =
        animationsEnabled &&
        (isConnectedEdge ||
          [
            'api-call',
            'security',
            'assistant-flow',
            'service-call',
            'workflow-flow',
            'cron-trigger',
          ].includes(e.relationship));
      const showLabel = true;
      const lineOpacity = selectedId ? 0.16 : 0.82;
      const isFlowTraceEdge =
        flowTraceMode &&
        flowTraceActiveIds &&
        flowTraceActiveIds.has(e.source) &&
        flowTraceActiveIds.has(e.target);
      const isFlowTraceCompleted =
        flowTraceMode &&
        flowTraceCompletedIds &&
        (flowTraceCompletedIds.has(e.source) || flowTraceCompletedIds.has(e.target));
      const flowTraceOpacity = flowTraceMode
        ? isFlowTraceEdge
          ? 1
          : isFlowTraceCompleted
            ? 0.3
            : 0.05
        : null;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'dataFlowEdge',
        style: {
          stroke: isFlowTraceEdge
            ? relMeta.color
            : flowTraceMode
              ? alpha(relMeta.color, flowTraceOpacity)
              : isConnectedEdge
                ? relMeta.color
                : alpha(relMeta.color, lineOpacity),
          strokeWidth: isFlowTraceEdge
            ? relMeta.width + 2
            : isConnectedEdge
              ? relMeta.width + 1
              : relMeta.width + 0.2,
          ...(relMeta.dasharray ? { strokeDasharray: relMeta.dasharray } : {}),
          ...(isMobile ? {} : { transition: 'all 0.3s ease' }),
          ...(isFlowTraceEdge && animationsEnabled && !isMobile
            ? { filter: `drop-shadow(0 0 8px ${alpha(relMeta.color, 0.6)})` }
            : isConnectedEdge && animationsEnabled && !isMobile
              ? { filter: `drop-shadow(0 0 6px ${alpha(relMeta.color, 0.45)})` }
              : {}),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnectedEdge ? relMeta.color : alpha(relMeta.color, selectedId ? 0.2 : 0.75),
          width: 18,
          height: 14,
        },
        data: {
          label: relMeta.label,
          metric: e.metric || '',
          baseColor: relMeta.color,
          channel: relMeta.channel,
          isConnected: isConnectedEdge,
          animateParticle,
          showLabel: isMobile ? isConnectedEdge && showLabel : showLabel,
          pulseSpeed: relMeta.pulseSpeed,
          isMobile,
        },
      };
    });
  }, [
    filteredEdges,
    selectedId,
    animationsEnabled,
    useSimpleMobileGraph,
    isMobile,
    flowTraceMode,
    flowTraceActiveIds,
    flowTraceCompletedIds,
  ]);

  const selected = selectedId ? entityMap[selectedId] : null;

  const selectedConnections = useMemo(() => {
    if (!selected) return { incoming: [], outgoing: [] };
    const incoming = edgesRaw
      .filter((e) => e.target === selected.id)
      .map((e) => ({ ...e, sourceEntity: entityMap[e.source] }))
      .filter((x) => x.sourceEntity);
    const outgoing = edgesRaw
      .filter((e) => e.source === selected.id)
      .map((e) => ({ ...e, targetEntity: entityMap[e.target] }))
      .filter((x) => x.targetEntity);
    return { incoming, outgoing };
  }, [selected, edgesRaw, entityMap]);

  const stats = useMemo(() => {
    const total = filteredEntities.length;
    const healthy = filteredEntities.filter((e) => e.health === 'healthy').length;
    const warning = filteredEntities.filter((e) => e.health === 'warning').length;
    const critical = filteredEntities.filter((e) => e.health === 'critical').length;
    return { total, healthy, warning, critical, score: scoreHealth(filteredEntities) };
  }, [filteredEntities]);

  const types = useMemo(
    () => Array.from(new Set(categoryEntities.map((e) => e.type))).sort(),
    [categoryEntities]
  );

  const sectionCounts = useMemo(() => {
    const acc = {};
    for (const e of categoryEntities) {
      if (!e.type) continue;
      acc[e.type] = (acc[e.type] || 0) + 1;
    }
    return acc;
  }, [categoryEntities]);

  const handleReload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await loadTopologyPayload({ force: true });
      setEntities(Array.isArray(payload?.entities) ? payload.entities : []);
      setEdgesRaw(Array.isArray(payload?.edges) ? payload.edges : []);
      setPipelinesMap(payload?.pipelines || {});
      setMeta(payload?.meta || null);
    } catch (err) {
      setError(err?.message || 'Unable to reload.');
    } finally {
      setLoading(false);
    }
  }, []);

  const supportsNativeFullscreen =
    typeof document.documentElement?.requestFullscreen === 'function';

  const toggleFullscreen = useCallback(() => {
    if (supportsNativeFullscreen) {
      // Desktop browsers with native fullscreen API
      if (!document.fullscreenElement) {
        graphRef.current?.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    } else {
      // Mobile fallback - use CSS-based fullscreen
      setIsFullscreen((prev) => !prev);
    }
  }, [supportsNativeFullscreen]);

  useEffect(() => {
    if (!supportsNativeFullscreen) return;
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [supportsNativeFullscreen]);

  // Lock body scroll when using CSS-based fullscreen on mobile
  useEffect(() => {
    if (!supportsNativeFullscreen && isFullscreen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isFullscreen, supportsNativeFullscreen]);

  const warnings = Array.isArray(meta?.warnings) ? meta.warnings : [];

  const liveModeTooltip = error
    ? `Critical: ${error}`
    : warnings.length
      ? `Problem: ${warnings.join(' ')}`
      : meta?.supabaseConnected
        ? `OK: Connected to project ${meta.supabaseProjectRef || ''}`
        : loading
          ? 'Loading...'
          : 'Status unknown';

  return (
    <PageLayout
      title="Data"
      subtitle="Interactive system architecture map showing all connections between databases, APIs, services, and frontend pages with animated data flows."
      sx={{ maxWidth: '100%', width: '100%' }}
      showTitleBlock={false}
    >
      {/* Inject keyframe animations (skip heavy animations on mobile) */}
      <style>{isMobile ? '' : PARTICLE_CSS}</style>
      <BentoCard
        title="Data"
        pageInfoPath="/data"
        subtitle={`${Object.keys(entityMap).length} entities · System architecture map${enhancedView && !isMobile ? ' · Enhanced' : ''}`}
        icon={() => <AiOrb size={22} state="idle" />}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {!isMobile && (
              <Tooltip
                title={enhancedView ? 'Switch to Classic View' : 'Switch to Enhanced View'}
                placement="bottom"
                arrow
              >
                <Button
                  variant={enhancedView ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => {
                    const next = !enhancedView;
                    setEnhancedView(next);
                    try {
                      localStorage.setItem('orch_data_enhanced_view', String(next));
                    } catch {}
                  }}
                  startIcon={
                    <AppIcon
                      name="AutoAwesomeOutlined"
                      fallback={AutoAwesomeOutlinedIcon}
                      sx={{ fontSize: 16 }}
                    />
                  }
                  sx={{
                    minWidth: 'auto',
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    px: 1.5,
                    ...(enhancedView
                      ? {
                          bgcolor: alpha(theme.palette.primary.main, 0.12),
                          color: 'primary.main',
                          boxShadow: 'none',
                          '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.2),
                            boxShadow: 'none',
                          },
                        }
                      : { borderColor: 'divider', color: 'text.secondary' }),
                  }}
                >
                  {enhancedView ? 'Enhanced' : 'Classic'}
                </Button>
              </Tooltip>
            )}
            <MetricsToggleButton
              showMetrics={showMetrics}
              onToggle={() => setShowMetrics((v) => !v)}
            />
            <Tooltip title={liveModeTooltip} placement="bottom" arrow describeContent>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={loading}
                  aria-label="Live mode"
                  sx={{
                    minWidth: 40,
                    borderRadius: 2,
                    borderColor: 'divider',
                    color: error
                      ? '#DC2626'
                      : warnings.length
                        ? '#F59E0B'
                        : meta?.supabaseConnected
                          ? '#16A34A'
                          : 'text.disabled',
                  }}
                >
                  {error ? (
                    <AppIcon
                      name="ErrorOutline"
                      fallback={ErrorOutlineIcon}
                      sx={{ fontSize: 18 }}
                    />
                  ) : warnings.length ? (
                    <AppIcon
                      name="WarningAmberOutlined"
                      fallback={WarningAmberOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />
                  ) : meta?.supabaseConnected ? (
                    <AppIcon
                      name="CheckCircleOutline"
                      fallback={CheckCircleOutlineIcon}
                      sx={{ fontSize: 18 }}
                    />
                  ) : (
                    <AppIcon
                      name="ErrorOutline"
                      fallback={ErrorOutlineIcon}
                      sx={{ fontSize: 18, opacity: 0.5 }}
                    />
                  )}
                </Button>
              </span>
            </Tooltip>
          </Stack>
        }
      >
        {/* Stat cards */}
        <Collapse in={showMetrics}>
          <DataStatCards entities={filteredEntities} theme={theme} />
        </Collapse>

        <Stack spacing={2} sx={{ p: 1.5 }}>
          {/* Alerts */}
          {loading && (
            <Alert icon={<CircularProgress size={16} />} severity="info">
              Loading live topology from Supabase and platform APIs...
            </Alert>
          )}
          {error && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={handleReload}>
                  Retry
                </Button>
              }
            >
              {error.includes('504')
                ? 'The topology request timed out. The server may be busy - try again in a moment or click Retry.'
                : error}
            </Alert>
          )}
          {warnings.length > 0 && <Alert severity="warning">{warnings.join(' ')}</Alert>}

          {/* Main graph card - defer ReactFlow mount until data is ready on mobile */}
          {loading && isMobile ? (
            <Card variant="outlined" sx={{ borderRadius: 3, overflow: 'visible' }}>
              <CardContent
                sx={{
                  p: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 280,
                  gap: 2,
                }}
              >
                <CircularProgress size={32} />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Building architecture map...
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Card variant="outlined" sx={{ borderRadius: 3, overflow: 'visible' }}>
              <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                <Stack spacing={0}>
                  {/* ── Unified toolbar: Category + Section dropdowns, search, AI chat, health, result count, actions ── */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                      px: 1.5,
                      py: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: isDark ? alpha('#0F172A', 0.28) : alpha('#F8FAFC', 0.5),
                    }}
                  >
                    {/* Categories dropdown */}
                    <CategoryMenu
                      value={viewMode}
                      onChange={(v) => {
                        setViewMode(v);
                        setTypeFilter('all');
                        setHealthFilter('all');
                        setSearch('');
                      }}
                      onReset={() => {
                        setTypeFilter('all');
                        setHealthFilter('all');
                        setSearch('');
                      }}
                    />
                    {/* Search */}
                    <TextField
                      size="small"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search..."
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <AppIcon
                                name="Search"
                                fallback={SearchIcon}
                                sx={{ fontSize: 17, color: 'text.disabled' }}
                              />
                            </InputAdornment>
                          ),
                          ...(search
                            ? {
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <IconButton
                                      size="small"
                                      onClick={() => setSearch('')}
                                      sx={{ p: 0.25 }}
                                    >
                                      <AppIcon
                                        name="Close"
                                        fallback={CloseIcon}
                                        sx={{ fontSize: 14 }}
                                      />
                                    </IconButton>
                                  </InputAdornment>
                                ),
                              }
                            : {}),
                        },
                      }}
                      sx={{
                        width: { xs: '100%', sm: 220 },
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                          height: 34,
                          fontSize: '0.8rem',
                          bgcolor: isDark ? alpha('#fff', 0.04) : alpha('#fff', 0.7),
                        },
                      }}
                    />

                    {/* AI Chat Input */}
                    <TextField
                      size="small"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && chatQuery.trim() && !chatLoading) {
                          (async () => {
                            setChatLoading(true);
                            setChatResponse(null);
                            try {
                              const headers = await getAuthHeaders();
                              const entityList = entities
                                .map((e) => `${e.id} (${e.type}: ${e.label})`)
                                .join(', ');
                              const edgeList = edgesRaw
                                .map((e) => `${e.source} → ${e.target} [${e.relationship}]`)
                                .join(', ');
                              const res = await fetch('/api/app?path=assistant-chat', {
                                method: 'POST',
                                headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  message: chatQuery,
                                  context: 'topology',
                                  systemPrompt: `You are an architecture assistant for Orqaly. The system topology has these entities: ${entityList}. Edges: ${edgeList}. Answer the user's question concisely. Return JSON: { "answer": "your explanation", "highlightEntityIds": ["entity-id-1", ...], "highlightEdgeIds": ["edge-id-1", ...] }. Only return valid JSON.`,
                                }),
                              });
                              const data = await res.json();
                              let parsed = data;
                              if (typeof data?.response === 'string') {
                                try {
                                  parsed = JSON.parse(data.response.replace(/```json\n?|```/g, ''));
                                } catch {
                                  parsed = {
                                    answer: data.response,
                                    highlightEntityIds: [],
                                    highlightEdgeIds: [],
                                  };
                                }
                              }
                              setChatResponse(parsed);
                              if (parsed.highlightEntityIds?.length)
                                setChatHighlightIds(new Set(parsed.highlightEntityIds));
                            } catch (err) {
                              setChatResponse({
                                answer: err.message || 'Failed to get response',
                                highlightEntityIds: [],
                                highlightEdgeIds: [],
                              });
                            } finally {
                              setChatLoading(false);
                            }
                          })();
                        }
                      }}
                      placeholder="Ask about architecture..."
                      disabled={chatLoading}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <AppIcon
                                name="PsychologyOutlined"
                                fallback={PsychologyOutlinedIcon}
                                sx={{
                                  fontSize: 17,
                                  color: chatHighlightIds ? '#9333EA' : 'text.disabled',
                                }}
                              />
                            </InputAdornment>
                          ),
                          ...(chatHighlightIds || chatResponse
                            ? {
                                endAdornment: (
                                  <InputAdornment position="end">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        setChatQuery('');
                                        setChatResponse(null);
                                        setChatHighlightIds(null);
                                      }}
                                      sx={{ p: 0.25 }}
                                    >
                                      <AppIcon
                                        name="Close"
                                        fallback={CloseIcon}
                                        sx={{ fontSize: 14 }}
                                      />
                                    </IconButton>
                                  </InputAdornment>
                                ),
                              }
                            : {}),
                        },
                      }}
                      sx={{
                        width: { xs: '100%', sm: 260 },
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                          height: 34,
                          fontSize: '0.8rem',
                          bgcolor: isDark ? alpha('#fff', 0.04) : alpha('#fff', 0.7),
                          ...(chatHighlightIds
                            ? {
                                borderColor: '#9333EA',
                                boxShadow: `0 0 0 1px ${alpha('#9333EA', 0.3)}`,
                              }
                            : {}),
                        },
                      }}
                    />

                    {/* Divider */}
                    <Divider
                      orientation="vertical"
                      flexItem
                      sx={{ mx: 0.25, display: { xs: 'none', sm: 'block' } }}
                    />

                    {/* Sections dropdown (replaces type filter chips) */}
                    <SectionMenu
                      value={typeFilter}
                      onChange={setTypeFilter}
                      types={types}
                      typeMeta={TYPE_META}
                      counts={sectionCounts}
                    />

                    {/* Divider */}
                    <Divider
                      orientation="vertical"
                      flexItem
                      sx={{ mx: 0.25, display: { xs: 'none', sm: 'block' } }}
                    />

                    {/* Health pills */}
                    <Stack direction="row" spacing={0.4}>
                      {Object.entries(HEALTH_COLORS).map(([key, color]) => {
                        const active = healthFilter === key;
                        const count = categoryEntities.filter((e) => e.health === key).length;
                        return (
                          <Tooltip
                            key={key}
                            title={`${key.charAt(0).toUpperCase() + key.slice(1)}: ${count} entities`}
                          >
                            <Chip
                              label={count}
                              size="small"
                              icon={
                                <Box
                                  sx={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    bgcolor: color,
                                    boxShadow: active ? `0 0 6px ${alpha(color, 0.6)}` : 'none',
                                    ml: '4px !important',
                                  }}
                                />
                              }
                              onClick={() => setHealthFilter(active ? 'all' : key)}
                              sx={{
                                height: 26,
                                fontSize: '0.72rem',
                                fontWeight: active ? 700 : 500,
                                borderRadius: '13px',
                                border: '1px solid',
                                borderColor: active ? color : 'divider',
                                bgcolor: active ? alpha(color, isDark ? 0.2 : 0.1) : 'transparent',
                                color: active ? color : 'text.secondary',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                minWidth: 46,
                                '&:hover': {
                                  bgcolor: alpha(color, isDark ? 0.15 : 0.08),
                                  borderColor: alpha(color, 0.5),
                                },
                                '& .MuiChip-icon': { mr: -0.25 },
                              }}
                            />
                          </Tooltip>
                        );
                      })}
                    </Stack>

                    {/* Spacer */}
                    <Box sx={{ flex: 1 }} />

                    {/* Result count + clear */}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0.75}
                      sx={{ flexShrink: 0 }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: 'text.disabled',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {filteredEntities.length} of {positioned.length}
                      </Typography>
                      {(typeFilter !== 'all' || healthFilter !== 'all' || search) && (
                        <Chip
                          label="Clear"
                          size="small"
                          onClick={() => {
                            setTypeFilter('all');
                            setHealthFilter('all');
                            setSearch('');
                          }}
                          onDelete={() => {
                            setTypeFilter('all');
                            setHealthFilter('all');
                            setSearch('');
                          }}
                          deleteIcon={
                            <AppIcon
                              name="Close"
                              fallback={CloseIcon}
                              sx={{ fontSize: '14px !important' }}
                            />
                          }
                          sx={{
                            height: 24,
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            borderRadius: '12px',
                            bgcolor: isDark ? alpha('#fff', 0.06) : alpha('#000', 0.04),
                            color: 'text.secondary',
                            '&:hover': {
                              bgcolor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.08),
                            },
                          }}
                        />
                      )}
                    </Stack>

                    {/* Action icons */}
                    <Divider
                      orientation="vertical"
                      flexItem
                      sx={{ mx: 0.25, display: { xs: 'none', sm: 'block' } }}
                    />
                    <Stack direction="row" spacing={0.3} sx={{ flexShrink: 0 }} alignItems="center">
                      <Tooltip
                        title={
                          guideMode
                            ? 'Exit process guides'
                            : 'Process guides — Goal / Loop / Pulse workflow maps'
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={() => setGuideMode((v) => !v)}
                          sx={{
                            color: guideMode ? '#9333EA' : 'text.secondary',
                            '&:hover': { color: guideMode ? '#7E22CE' : 'text.primary' },
                            ...(guideMode
                              ? { bgcolor: alpha('#9333EA', 0.1), borderRadius: 1 }
                              : {}),
                          }}
                        >
                          <AppIcon
                            name="AccountTreeOutlined"
                            fallback={AccountTreeOutlinedIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                      {!useSimpleMobileGraph && (
                        <Tooltip title={flowTraceMode ? 'Exit flow trace' : 'Trace goal execution'}>
                          <IconButton
                            size="small"
                            onClick={flowTraceMode ? handleFlowTraceClose : handleFlowTraceOpen}
                            sx={{
                              color: flowTraceMode ? '#22D3EE' : 'text.secondary',
                              '&:hover': { color: flowTraceMode ? '#06B6D4' : 'text.primary' },
                              ...(flowTraceMode
                                ? { bgcolor: alpha('#22D3EE', 0.1), borderRadius: 1 }
                                : {}),
                            }}
                          >
                            <AppIcon
                              name="RouteOutlined"
                              fallback={RouteOutlinedIcon}
                              sx={{ fontSize: 16 }}
                            />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip
                        title={showAll ? 'Showing all entities' : 'Show every entity and edge'}
                      >
                        <Stack direction="row" alignItems="center" spacing={0.3} sx={{ mr: 0.5 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: showAll ? 'primary.main' : 'text.disabled',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Show All
                          </Typography>
                          <Switch
                            size="small"
                            checked={showAll}
                            onChange={(_, v) => setShowAll(v)}
                            sx={{
                              '& .MuiSwitch-switchBase': { p: 0.4 },
                              '& .MuiSwitch-thumb': { width: 12, height: 12 },
                              '& .MuiSwitch-track': { borderRadius: 8 },
                            }}
                          />
                        </Stack>
                      </Tooltip>
                      {!useSimpleMobileGraph && (
                        <Tooltip
                          title={animationsEnabled ? 'Pause animations' : 'Resume animations'}
                        >
                          <IconButton
                            size="small"
                            onClick={() => setAnimationsEnabled(!animationsEnabled)}
                            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                          >
                            {animationsEnabled ? (
                              <AppIcon name="Pause" fallback={PauseIcon} sx={{ fontSize: 16 }} />
                            ) : (
                              <AppIcon
                                name="PlayArrow"
                                fallback={PlayArrowIcon}
                                sx={{ fontSize: 16 }}
                              />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Reload data">
                        <IconButton
                          size="small"
                          onClick={handleReload}
                          disabled={loading}
                          sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                        >
                          <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      {!useSimpleMobileGraph && (
                        <Tooltip title={showLegend ? 'Hide legend' : 'Show legend'}>
                          <IconButton
                            size="small"
                            onClick={() => setShowLegend(!showLegend)}
                            sx={{
                              color: showLegend ? 'primary.main' : 'text.secondary',
                              '&:hover': { color: 'text.primary' },
                            }}
                          >
                            <AppIcon
                              name="VisibilityOutlined"
                              fallback={VisibilityOutlinedIcon}
                              sx={{ fontSize: 16 }}
                            />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!useSimpleMobileGraph && (
                        <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                          <IconButton
                            size="small"
                            onClick={toggleFullscreen}
                            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                          >
                            {isFullscreen ? (
                              <AppIcon
                                name="FullscreenExit"
                                fallback={FullscreenExitIcon}
                                sx={{ fontSize: 16 }}
                              />
                            ) : (
                              <AppIcon
                                name="Fullscreen"
                                fallback={FullscreenIcon}
                                sx={{ fontSize: 16 }}
                              />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="What is this page?">
                        <IconButton
                          size="small"
                          onClick={() => setInfoOpen(true)}
                          sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                        >
                          <AppIcon
                            name="InfoOutlined"
                            fallback={InfoOutlinedIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>

                  {/* ── Content area with padding ── */}
                  <Box sx={{ p: 1.5 }}>
                    <Stack spacing={1.3}>
                      {/* ── Flow Trace Panel ── */}
                      {flowTraceMode && (
                        <Paper
                          variant="outlined"
                          sx={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            zIndex: 65,
                            width: 320,
                            maxHeight: 500,
                            overflow: 'auto',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: isDark
                              ? alpha(theme.palette.background.paper, 0.95)
                              : alpha('#fff', 0.95),
                            backdropFilter: 'blur(8px)',
                            borderColor: alpha('#22D3EE', 0.3),
                            boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.15)}`,
                          }}
                        >
                          {/* Header */}
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ mb: 1 }}
                          >
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                              <AppIcon
                                name="RouteOutlined"
                                fallback={RouteOutlinedIcon}
                                sx={{ fontSize: 16, color: '#22D3EE' }}
                              />
                              <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>
                                Flow Trace
                              </Typography>
                            </Stack>
                            <IconButton size="small" onClick={handleFlowTraceClose} sx={{ p: 0.3 }}>
                              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Stack>

                          {/* Goal selector dropdown */}
                          {!flowTraceData && (
                            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                              <InputLabel sx={{ fontSize: '0.75rem' }}>Select a goal</InputLabel>
                              <Select
                                value={flowTraceGoalId || ''}
                                label="Select a goal"
                                onChange={(e) => handleFlowTraceSelect(e.target.value)}
                                disabled={flowTraceLoading}
                                sx={{ fontSize: '0.75rem', height: 34 }}
                              >
                                {flowTraceGoals.map((g) => (
                                  <MenuItem key={g.id} value={g.id} sx={{ fontSize: '0.75rem' }}>
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      sx={{ width: '100%' }}
                                    >
                                      <Chip
                                        size="small"
                                        label={g.status}
                                        sx={{
                                          height: 16,
                                          fontSize: '0.55rem',
                                          fontWeight: 700,
                                          bgcolor:
                                            g.status === 'completed'
                                              ? alpha('#16A34A', 0.1)
                                              : g.status === 'failed'
                                                ? alpha('#DC2626', 0.1)
                                                : alpha('#F59E0B', 0.1),
                                          color:
                                            g.status === 'completed'
                                              ? '#16A34A'
                                              : g.status === 'failed'
                                                ? '#DC2626'
                                                : '#F59E0B',
                                        }}
                                      />
                                      <Typography
                                        sx={{
                                          fontSize: '0.75rem',
                                          flex: 1,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {g.title}
                                      </Typography>
                                    </Stack>
                                  </MenuItem>
                                ))}
                                {flowTraceGoals.length === 0 && (
                                  <MenuItem disabled sx={{ fontSize: '0.75rem' }}>
                                    No goals found
                                  </MenuItem>
                                )}
                              </Select>
                            </FormControl>
                          )}

                          {flowTraceLoading && (
                            <Stack alignItems="center" sx={{ py: 2 }}>
                              <CircularProgress size={24} sx={{ color: '#22D3EE' }} />
                              <Typography
                                sx={{ fontSize: '0.7rem', color: 'text.disabled', mt: 0.5 }}
                              >
                                Loading trace...
                              </Typography>
                            </Stack>
                          )}

                          {/* Active trace display */}
                          {flowTraceData && (
                            <>
                              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 0.5 }}>
                                {flowTraceData.goal.name}
                              </Typography>

                              {/* Play controls */}
                              <Stack
                                direction="row"
                                alignItems="center"
                                spacing={0.5}
                                sx={{ mb: 1 }}
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => setFlowTraceStep((prev) => Math.max(0, prev - 1))}
                                  disabled={flowTraceStep === 0}
                                  sx={{ p: 0.3 }}
                                >
                                  <AppIcon
                                    name="SkipPrevious"
                                    fallback={SkipPreviousIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => setFlowTracePlaying(!flowTracePlaying)}
                                  sx={{
                                    p: 0.3,
                                    color: flowTracePlaying ? '#22D3EE' : 'text.secondary',
                                  }}
                                >
                                  {flowTracePlaying ? (
                                    <AppIcon
                                      name="Pause"
                                      fallback={PauseIcon}
                                      sx={{ fontSize: 16 }}
                                    />
                                  ) : (
                                    <AppIcon
                                      name="PlayArrow"
                                      fallback={PlayArrowIcon}
                                      sx={{ fontSize: 16 }}
                                    />
                                  )}
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setFlowTraceStep((prev) =>
                                      Math.min((flowTraceData.steps.length || 1) - 1, prev + 1)
                                    )
                                  }
                                  disabled={flowTraceStep >= (flowTraceData.steps.length || 1) - 1}
                                  sx={{ p: 0.3 }}
                                >
                                  <AppIcon
                                    name="SkipNext"
                                    fallback={SkipNextIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={handleFlowTraceClose}
                                  sx={{ p: 0.3, ml: 'auto' }}
                                >
                                  <AppIcon name="Stop" fallback={StopIcon} sx={{ fontSize: 14 }} />
                                </IconButton>
                                <Typography
                                  sx={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    color: '#22D3EE',
                                    ml: 'auto !important',
                                  }}
                                >
                                  Step {flowTraceStep + 1} of {flowTraceData.steps.length}
                                </Typography>
                              </Stack>

                              {/* Progress bar */}
                              <LinearProgress
                                variant="determinate"
                                value={
                                  flowTraceData.steps.length > 1
                                    ? (flowTraceStep / (flowTraceData.steps.length - 1)) * 100
                                    : 100
                                }
                                sx={{
                                  mb: 1,
                                  height: 3,
                                  borderRadius: 2,
                                  bgcolor: alpha('#22D3EE', 0.1),
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: '#22D3EE',
                                    borderRadius: 2,
                                  },
                                }}
                              />

                              {/* Step list */}
                              <Stack spacing={0.3} sx={{ maxHeight: 240, overflow: 'auto', mb: 1 }}>
                                {flowTraceData.steps.map((s, i) => {
                                  const isCurrent = i === flowTraceStep;
                                  const isPast = i < flowTraceStep;
                                  const isFuture = i > flowTraceStep;
                                  return (
                                    <Stack
                                      key={s.step}
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      onClick={() => {
                                        setFlowTraceStep(i);
                                        setFlowTracePlaying(false);
                                      }}
                                      sx={{
                                        py: 0.3,
                                        px: 0.8,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: isCurrent ? alpha('#22D3EE', 0.12) : 'transparent',
                                        border: isCurrent
                                          ? `1px solid ${alpha('#22D3EE', 0.3)}`
                                          : '1px solid transparent',
                                        opacity: isFuture ? 0.4 : 1,
                                        '&:hover': { bgcolor: alpha('#22D3EE', 0.06) },
                                        transition: 'all 0.2s ease',
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontSize: '0.6rem',
                                          fontWeight: 700,
                                          color: 'text.disabled',
                                          minWidth: 16,
                                        }}
                                      >
                                        {s.step}
                                      </Typography>
                                      <Box
                                        sx={{
                                          minWidth: 14,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                        }}
                                      >
                                        {isPast ? (
                                          s.status === 'failed' ? (
                                            <AppIcon
                                              name="CancelOutlined"
                                              fallback={CancelOutlinedIcon}
                                              sx={{ fontSize: 13, color: '#DC2626' }}
                                            />
                                          ) : (
                                            <AppIcon
                                              name="CheckCircleOutline"
                                              fallback={CheckCircleOutlineIcon}
                                              sx={{ fontSize: 13, color: '#22c55e' }}
                                            />
                                          )
                                        ) : isCurrent ? (
                                          <AppIcon
                                            name="PlayArrow"
                                            fallback={PlayArrowOutlinedIcon}
                                            sx={{ fontSize: 13, color: '#22D3EE' }}
                                          />
                                        ) : (
                                          <AppIcon
                                            name="RadioButtonUnchecked"
                                            fallback={RadioButtonUncheckedOutlinedIcon}
                                            sx={{ fontSize: 12, color: 'text.disabled' }}
                                          />
                                        )}
                                      </Box>
                                      <Typography
                                        sx={{
                                          fontSize: '0.68rem',
                                          fontWeight: isCurrent ? 700 : 500,
                                          flex: 1,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          color: isCurrent
                                            ? '#22D3EE'
                                            : s.status === 'failed'
                                              ? '#DC2626'
                                              : 'text.primary',
                                        }}
                                      >
                                        {s.description}
                                      </Typography>
                                      {s.cost > 0 && (
                                        <Typography
                                          sx={{
                                            fontSize: '0.55rem',
                                            color: 'text.disabled',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          ${s.cost.toFixed(4)}
                                        </Typography>
                                      )}
                                    </Stack>
                                  );
                                })}
                              </Stack>

                              {/* Summary footer */}
                              <Divider sx={{ mb: 0.8 }} />
                              <Stack direction="row" flexWrap="wrap" spacing={1} sx={{ gap: 0.5 }}>
                                <Chip
                                  size="small"
                                  label={`$${flowTraceData.goal.totalCost?.toFixed(4) || '0'}`}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                    bgcolor: alpha('#22D3EE', 0.1),
                                    color: '#22D3EE',
                                  }}
                                />
                                <Chip
                                  size="small"
                                  label={`${flowTraceData.goal.totalDuration?.toFixed(1) || '0'}s`}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                    bgcolor: alpha('#8B5CF6', 0.1),
                                    color: '#8B5CF6',
                                  }}
                                />
                                <Chip
                                  size="small"
                                  label={`${flowTraceData.goal.llmCalls || 0} LLM`}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                    bgcolor: alpha('#F59E0B', 0.1),
                                    color: '#F59E0B',
                                  }}
                                />
                                <Chip
                                  size="small"
                                  label={`${flowTraceData.goal.toolCalls || 0} tools`}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                    bgcolor: alpha('#16A34A', 0.1),
                                    color: '#16A34A',
                                  }}
                                />
                                {flowTraceData.goal.avgScore && (
                                  <Chip
                                    size="small"
                                    label={`score ${flowTraceData.goal.avgScore}`}
                                    sx={{
                                      height: 18,
                                      fontSize: '0.58rem',
                                      fontWeight: 700,
                                      bgcolor: alpha('#EC4899', 0.1),
                                      color: '#EC4899',
                                    }}
                                  />
                                )}
                              </Stack>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => {
                                  setFlowTraceData(null);
                                  setFlowTraceGoalId(null);
                                  setFlowTraceStep(0);
                                  setFlowTracePlaying(false);
                                }}
                                sx={{
                                  mt: 0.8,
                                  textTransform: 'none',
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  color: 'text.disabled',
                                }}
                              >
                                Change goal
                              </Button>
                            </>
                          )}
                        </Paper>
                      )}

                      {/* Audit Summary Panel */}
                      {isAuditMode && auditSummary && (
                        <Paper
                          variant="outlined"
                          sx={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            zIndex: 60,
                            width: 260,
                            maxHeight: 350,
                            overflow: 'auto',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: isDark
                              ? alpha(theme.palette.background.paper, 0.95)
                              : alpha('#fff', 0.95),
                            backdropFilter: 'blur(8px)',
                            borderColor: alpha('#F59E0B', 0.3),
                            boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.15)}`,
                          }}
                        >
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ mb: 1 }}
                          >
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>
                              Audit Summary
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={async () => {
                                const { default: jsPDF } = await import('jspdf');
                                await import('jspdf-autotable');
                                const doc = new jsPDF();
                                doc.setFontSize(16);
                                doc.text('Platform Audit Report', 14, 20);
                                doc.setFontSize(10);
                                doc.text(
                                  `Generated: ${new Date().toISOString().split('T')[0]}`,
                                  14,
                                  28
                                );
                                doc.text(
                                  `Total entities: ${Object.keys(entityMap).length}`,
                                  14,
                                  34
                                );
                                let y = 44;
                                doc.setFontSize(12);
                                doc.text(`Dead Nodes (${auditSummary.dead.length})`, 14, y);
                                y += 6;
                                doc.setFontSize(9);
                                auditSummary.dead.forEach((e) => {
                                  doc.text(`- ${e.label} (${e.type}) - 0 inbound`, 18, y);
                                  y += 5;
                                });
                                y += 4;
                                doc.setFontSize(12);
                                doc.text(`Low Usage (${auditSummary.low.length})`, 14, y);
                                y += 6;
                                doc.setFontSize(9);
                                auditSummary.low.slice(0, 15).forEach((e) => {
                                  doc.text(
                                    `- ${e.label} (${e.connections.in + e.connections.out} connections)`,
                                    18,
                                    y
                                  );
                                  y += 5;
                                });
                                y += 4;
                                doc.setFontSize(12);
                                doc.text('Top Hotspots', 14, y);
                                y += 6;
                                doc.setFontSize(9);
                                auditSummary.hotspots.forEach((e) => {
                                  doc.text(`- ${e.label} (${e.total} connections)`, 18, y);
                                  y += 5;
                                });
                                doc.save(
                                  `audit-report-${new Date().toISOString().split('T')[0]}.pdf`
                                );
                              }}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                minWidth: 'auto',
                                px: 1,
                                py: 0.2,
                              }}
                            >
                              Export PDF
                            </Button>
                          </Stack>

                          {/* Dead nodes */}
                          <Stack spacing={0.3} sx={{ mb: 1 }}>
                            <Typography
                              sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#DC2626' }}
                            >
                              Dead Nodes ({auditSummary.dead.length})
                            </Typography>
                            {auditSummary.dead.slice(0, 5).map((e) => (
                              <Chip
                                key={e.id}
                                size="small"
                                label={e.label}
                                onClick={() => handleNodeSelect(e.id)}
                                sx={{
                                  height: 18,
                                  fontSize: '0.58rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  bgcolor: alpha('#DC2626', 0.1),
                                  color: '#DC2626',
                                  justifyContent: 'flex-start',
                                }}
                              />
                            ))}
                            {auditSummary.dead.length > 5 && (
                              <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                                +{auditSummary.dead.length - 5} more
                              </Typography>
                            )}
                          </Stack>

                          {/* Low usage */}
                          <Stack spacing={0.3} sx={{ mb: 1 }}>
                            <Typography
                              sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#F59E0B' }}
                            >
                              Low Usage ({auditSummary.low.length})
                            </Typography>
                            {auditSummary.low.slice(0, 5).map((e) => (
                              <Chip
                                key={e.id}
                                size="small"
                                label={`${e.label} (${e.connections.in + e.connections.out})`}
                                onClick={() => handleNodeSelect(e.id)}
                                sx={{
                                  height: 18,
                                  fontSize: '0.58rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  bgcolor: alpha('#F59E0B', 0.1),
                                  color: '#F59E0B',
                                  justifyContent: 'flex-start',
                                }}
                              />
                            ))}
                          </Stack>

                          {/* Hotspots */}
                          <Stack spacing={0.3}>
                            <Typography
                              sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#16A34A' }}
                            >
                              Hotspots (most connected)
                            </Typography>
                            {auditSummary.hotspots.slice(0, 5).map((e) => (
                              <Chip
                                key={e.id}
                                size="small"
                                label={`${e.label} (${e.total})`}
                                onClick={() => handleNodeSelect(e.id)}
                                sx={{
                                  height: 18,
                                  fontSize: '0.58rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  bgcolor: alpha('#16A34A', 0.1),
                                  color: '#16A34A',
                                  justifyContent: 'flex-start',
                                }}
                              />
                            ))}
                          </Stack>
                        </Paper>
                      )}

                      {/* AI Chat Response */}
                      {(chatResponse || chatLoading) && (
                        <Paper
                          variant="outlined"
                          sx={{
                            mx: 1.5,
                            mb: 1,
                            p: 1.5,
                            borderRadius: 2,
                            borderColor: alpha('#9333EA', 0.3),
                            bgcolor: alpha('#9333EA', isDark ? 0.05 : 0.02),
                            maxHeight: 200,
                            overflow: 'auto',
                          }}
                        >
                          {chatLoading ? (
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <CircularProgress size={14} sx={{ color: '#9333EA' }} />
                              <Typography
                                sx={{ fontSize: '0.75rem', color: '#9333EA', fontWeight: 600 }}
                              >
                                Analyzing architecture...
                              </Typography>
                            </Stack>
                          ) : (
                            <Stack spacing={1}>
                              <Stack direction="row" alignItems="center" spacing={0.8}>
                                <AppIcon
                                  name="PsychologyOutlined"
                                  fallback={PsychologyOutlinedIcon}
                                  sx={{ fontSize: 16, color: '#9333EA' }}
                                />
                                <Typography
                                  sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#9333EA' }}
                                >
                                  Architecture Assistant
                                </Typography>
                                {chatHighlightIds && (
                                  <Chip
                                    size="small"
                                    label={`${chatHighlightIds.size} nodes highlighted`}
                                    sx={{
                                      height: 18,
                                      fontSize: '0.6rem',
                                      fontWeight: 700,
                                      bgcolor: alpha('#9333EA', 0.12),
                                      color: '#9333EA',
                                    }}
                                  />
                                )}
                              </Stack>
                              <Typography
                                sx={{
                                  fontSize: '0.72rem',
                                  color: 'text.secondary',
                                  lineHeight: 1.6,
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {chatResponse?.answer || 'No response'}
                              </Typography>
                            </Stack>
                          )}
                        </Paper>
                      )}

                      {/* Graph area */}
                      {useSimpleMobileGraph ? (
                        <Box
                          sx={{
                            borderRadius: 2,
                            bgcolor: isDark ? alpha('#0F172A', 0.3) : alpha('#F8FAFC', 0.4),
                            maxHeight: '62vh',
                            overflowY: 'auto',
                            overscrollBehaviorY: 'contain',
                          }}
                        >
                          <Stack spacing={0.75} sx={{ p: 0.75 }}>
                            {filteredEntities.length === 0 ? (
                              <Box sx={{ p: 3, textAlign: 'center' }}>
                                <Typography
                                  sx={{
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    color: 'text.secondary',
                                  }}
                                >
                                  No entities match current filters
                                </Typography>
                                <Typography
                                  sx={{ fontSize: '0.72rem', color: 'text.disabled', mt: 0.5 }}
                                >
                                  Try adjusting the type or health filters above
                                </Typography>
                              </Box>
                            ) : (
                              filteredEntities.map((entity) => {
                                const metaType = TYPE_META[entity.type] || TYPE_META.service;
                                const IconComp = metaType.icon;
                                const healthColor = HEALTH_COLORS[entity.health] || '#94A3B8';
                                const selectedEntity = selectedId === entity.id;
                                const isCross = visibleIds.get(entity.id) === 'connected';
                                const crossCatColor =
                                  CATEGORY_LANES[entity.category]?.color || '#94A3B8';
                                return (
                                  <Paper
                                    key={entity.id}
                                    elevation={0}
                                    onClick={() => setSelectedId(entity.id)}
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'stretch',
                                      borderRadius: 2,
                                      cursor: 'pointer',
                                      overflow: 'hidden',
                                      border: '1px solid',
                                      borderColor: selectedEntity ? metaType.color : 'divider',
                                      bgcolor: selectedEntity
                                        ? alpha(metaType.color, isDark ? 0.12 : 0.05)
                                        : isDark
                                          ? alpha(theme.palette.background.paper, 0.6)
                                          : '#fff',
                                      opacity: isCross ? 0.72 : 1,
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    {/* Left accent bar */}
                                    <Box
                                      sx={{
                                        width: 4,
                                        flexShrink: 0,
                                        bgcolor: isCross ? crossCatColor : metaType.color,
                                        borderRadius: '4px 0 0 4px',
                                        ...(isCross
                                          ? {
                                              backgroundImage: `repeating-linear-gradient(0deg, ${crossCatColor}, ${crossCatColor} 4px, transparent 4px, transparent 8px)`,
                                              bgcolor: 'transparent',
                                            }
                                          : {}),
                                      }}
                                    />
                                    {/* Content */}
                                    <Box sx={{ flex: 1, p: 1.1, minWidth: 0 }}>
                                      <Stack
                                        direction="row"
                                        alignItems="center"
                                        justifyContent="space-between"
                                        spacing={0.75}
                                      >
                                        <Stack
                                          direction="row"
                                          alignItems="center"
                                          spacing={0.75}
                                          sx={{ minWidth: 0, flex: 1 }}
                                        >
                                          <Box
                                            sx={{
                                              width: 26,
                                              height: 26,
                                              borderRadius: 1.5,
                                              flexShrink: 0,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              bgcolor: alpha(metaType.color, 0.12),
                                              color: metaType.color,
                                            }}
                                          >
                                            <AppIcon fallback={IconComp} sx={{ fontSize: 14 }} />
                                          </Box>
                                          <Box sx={{ minWidth: 0 }}>
                                            <Typography
                                              sx={{
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                lineHeight: 1.2,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              {entity.label}
                                            </Typography>
                                            <Typography
                                              sx={{
                                                fontSize: '0.6rem',
                                                fontWeight: 600,
                                                color: metaType.color,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                              }}
                                            >
                                              {metaType.label}
                                            </Typography>
                                          </Box>
                                        </Stack>
                                        <Stack
                                          direction="row"
                                          spacing={0.4}
                                          alignItems="center"
                                          sx={{ flexShrink: 0 }}
                                        >
                                          {isCross && (
                                            <Chip
                                              size="small"
                                              label={
                                                CATEGORY_LANES[entity.category]?.label ||
                                                entity.category
                                              }
                                              sx={{
                                                height: 18,
                                                fontSize: '0.55rem',
                                                fontWeight: 700,
                                                borderRadius: '9px',
                                                color: crossCatColor,
                                                bgcolor: alpha(crossCatColor, 0.12),
                                              }}
                                            />
                                          )}
                                          <Tooltip title={`Health: ${entity.health}`}>
                                            <Box
                                              sx={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: '50%',
                                                bgcolor: healthColor,
                                                boxShadow: `0 0 4px ${alpha(healthColor, 0.5)}`,
                                                flexShrink: 0,
                                              }}
                                            />
                                          </Tooltip>
                                        </Stack>
                                      </Stack>
                                      {(entity.description || entity.info) && (
                                        <Typography
                                          sx={{
                                            mt: 0.5,
                                            fontSize: '0.66rem',
                                            color: 'text.secondary',
                                            lineHeight: 1.35,
                                            display: '-webkit-box',
                                            WebkitLineClamp: 1,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                          }}
                                        >
                                          {entity.description || entity.info}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Paper>
                                );
                              })
                            )}
                          </Stack>
                        </Box>
                      ) : (
                        <Box
                          ref={graphRef}
                          sx={{
                            position:
                              isFullscreen && !supportsNativeFullscreen ? 'fixed' : 'relative',
                            ...(isFullscreen && !supportsNativeFullscreen
                              ? {
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  zIndex: 1300,
                                  borderRadius: 0,
                                  height: '100dvh',
                                  width: '100vw',
                                  minHeight: 0,
                                }
                              : {
                                  height: isFullscreen
                                    ? '100vh'
                                    : isMobile
                                      ? 'calc(100dvh - 280px)'
                                      : 'calc(100vh - 380px)',
                                  minHeight: isMobile ? 320 : 560,
                                  borderRadius: 2.5,
                                }),
                            border: '1px solid',
                            borderColor:
                              isFullscreen && !supportsNativeFullscreen ? 'transparent' : 'divider',
                            overflow: 'hidden',
                            overscrollBehaviorY: isMobile ? 'contain' : 'auto',
                            touchAction: isMobile ? 'none' : 'auto',
                            bgcolor: isDark ? alpha('#0F172A', 0.5) : alpha('#F8FAFC', 0.6),
                            '& .react-flow__controls': {
                              boxShadow: 'none',
                              border: '1px solid',
                              borderColor: isDark
                                ? alpha(theme.palette.common.white, 0.14)
                                : theme.palette.divider,
                              borderRadius: 2,
                              overflow: 'hidden',
                            },
                            '& .react-flow__controls-button': {
                              width: 32,
                              height: 32,
                              borderBottom: '1px solid',
                              borderBottomColor: isDark
                                ? alpha(theme.palette.common.white, 0.12)
                                : alpha(theme.palette.common.black, 0.08),
                              backgroundColor: isDark
                                ? alpha(theme.palette.background.paper, 0.94)
                                : theme.palette.background.paper,
                              color: isDark
                                ? alpha(theme.palette.common.white, 0.9)
                                : theme.palette.text.primary,
                            },
                            '& .react-flow__controls-button:hover': {
                              backgroundColor: isDark
                                ? alpha(theme.palette.primary.main, 0.2)
                                : alpha(theme.palette.primary.main, 0.08),
                            },
                            '& .react-flow__controls-button svg': { fill: 'currentColor' },
                            '& .react-flow__minimap': {
                              border: '1px solid',
                              borderColor: isDark
                                ? alpha(theme.palette.common.white, 0.2)
                                : alpha(theme.palette.common.black, 0.2),
                              borderRadius: 2,
                              overflow: 'hidden',
                              backgroundColor: isDark
                                ? alpha(theme.palette.background.paper, 0.96)
                                : alpha(theme.palette.background.paper, 0.98),
                            },
                          }}
                        >
                          {guideMode && (
                            <Box
                              sx={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 6,
                                bgcolor: isDark ? '#0B1120' : '#FFFFFF',
                                display: 'flex',
                                flexDirection: 'column',
                              }}
                            >
                              <ProcessGuide
                                onOpenEntity={(id) => {
                                  setGuideMode(false);
                                  setSelectedId(id);
                                }}
                              />
                            </Box>
                          )}
                          <ReactFlowProvider>
                            <ReactFlow
                              nodes={nodes}
                              edges={edges}
                              nodeTypes={useSimpleMobileGraph ? undefined : nodeTypes}
                              edgeTypes={useSimpleMobileGraph ? undefined : edgeTypes}
                              fitView
                              fitViewOptions={{
                                padding: useSimpleMobileGraph ? 0.06 : isMobile ? 0.1 : 0.15,
                                maxZoom: 0.8,
                              }}
                              onNodeClick={(_, node) => setSelectedId(node.id)}
                              onPaneClick={() => setSelectedId(null)}
                              proOptions={{ hideAttribution: true }}
                              defaultEdgeOptions={{
                                type: 'smoothstep',
                                style: { strokeWidth: 2 },
                              }}
                              nodesDraggable={!isMobile}
                              nodesConnectable={false}
                              elementsSelectable={!isMobile}
                              panOnDrag={useSimpleMobileGraph ? true : !isMobile ? true : [0]}
                              zoomOnPinch={true}
                              zoomOnScroll={!isMobile && !useSimpleMobileGraph}
                              preventScrolling={!isMobile && !useSimpleMobileGraph}
                            >
                              <Background
                                gap={20}
                                size={1}
                                color={isDark ? alpha('#334155', 0.4) : alpha('#CBD5E1', 0.5)}
                              />
                              {!isMobile && (
                                <MiniMap
                                  pannable
                                  zoomable
                                  nodeStrokeWidth={2}
                                  nodeBorderRadius={8}
                                  bgColor={isDark ? '#0F172A' : '#F8FAFC'}
                                  maskColor={
                                    isDark ? 'rgba(15,23,42,0.65)' : 'rgba(226,232,240,0.7)'
                                  }
                                  nodeColor={(n) => {
                                    const e = entityMap[n.id];
                                    return e ? TYPE_META[e.type]?.color || '#64748B' : '#64748B';
                                  }}
                                  nodeStrokeColor={(n) => {
                                    const e = entityMap[n.id];
                                    return e ? HEALTH_COLORS[e.health] || '#334155' : '#334155';
                                  }}
                                  style={{ width: 200, height: 130 }}
                                />
                              )}
                              {!useSimpleMobileGraph && <Controls />}
                            </ReactFlow>
                          </ReactFlowProvider>

                          {/* Mobile fullscreen exit button (CSS-based fullscreen) */}
                          {isFullscreen && !supportsNativeFullscreen && (
                            <Box sx={{ position: 'absolute', top: 12, right: 12, zIndex: 60 }}>
                              <IconButton
                                onClick={toggleFullscreen}
                                size="small"
                                sx={{
                                  bgcolor: isDark
                                    ? alpha(theme.palette.background.paper, 0.9)
                                    : 'background.paper',
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  borderRadius: 2,
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                  '&:hover': {
                                    bgcolor: isDark
                                      ? alpha(theme.palette.background.paper, 1)
                                      : 'background.paper',
                                  },
                                }}
                              >
                                <AppIcon
                                  name="FullscreenExit"
                                  fallback={FullscreenExitIcon}
                                  sx={{ fontSize: 20 }}
                                />
                              </IconButton>
                            </Box>
                          )}

                          {/* Lane labels overlay (classic view only - enhanced uses group nodes) */}
                          {!useSimpleMobileGraph && !enhancedView && viewMode === 'full' && (
                            <Box
                              sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                pointerEvents: 'none',
                                zIndex: 5,
                              }}
                            >
                              {Object.entries(CATEGORY_LANES).map(([key, lane]) => (
                                <Box
                                  key={key}
                                  sx={{
                                    position: 'absolute',
                                    top: 8,
                                    left: lane.x,
                                    transform: 'translateX(-50%)',
                                    px: 1.5,
                                    py: 0.3,
                                    borderRadius: 1.5,
                                    bgcolor: alpha(lane.color, isDark ? 0.2 : 0.1),
                                    border: `1px solid ${alpha(lane.color, 0.3)}`,
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      fontSize: '0.6rem',
                                      fontWeight: 800,
                                      color: lane.color,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.06em',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {lane.label}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          )}

                          {/* Legend overlay */}
                          {showLegend && (
                            <Box
                              sx={{
                                position: 'absolute',
                                bottom: 12,
                                left: 12,
                                zIndex: 10,
                                maxWidth: 200,
                              }}
                            >
                              <FlowLegend theme={theme} />
                            </Box>
                          )}

                          {/* Inline detail panel for fullscreen mode (Drawer portals to body, which is hidden behind fullscreen element) */}
                          {isFullscreen && selected && (
                            <Box
                              sx={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                width: { xs: '100%', sm: 500 },
                                zIndex: 50,
                                bgcolor: isDark
                                  ? alpha(theme.palette.background.paper, 0.98)
                                  : theme.palette.background.paper,
                                borderLeft: `3px solid ${TYPE_META[selected?.type]?.color || '#94A3B8'}`,
                                boxShadow: `-8px 0 32px ${alpha(theme.palette.common.black, 0.25)}`,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'auto',
                                p: 2.5,
                                animation: 'fadeSlideIn 0.25s ease-out',
                              }}
                            >
                              <DetailPanel
                                entity={selected}
                                connections={selectedConnections}
                                entityMap={entityMap}
                                allEntities={positioned}
                                edgesRaw={edgesRaw}
                                onSelect={handleNodeSelect}
                                onClose={() => setSelectedId(null)}
                                pipelinesMap={pipelinesMap}
                                isAuditMode={isAuditMode}
                                connectionCounts={connectionCounts}
                              />
                            </Box>
                          )}
                        </Box>
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Stack>
      </BentoCard>
      {/* Detail Drawer (only in normal mode; fullscreen uses inline panel inside graphRef) */}
      {!isFullscreen && (
        <Drawer
          anchor="right"
          open={!!selected}
          onClose={() => setSelectedId(null)}
          PaperProps={{
            sx: {
              width: { xs: '100%', sm: 500 },
              p: 2.5,
              borderLeft: `3px solid ${TYPE_META[selected?.type]?.color || '#94A3B8'}`,
              bgcolor: isDark
                ? alpha(theme.palette.background.paper, 0.98)
                : theme.palette.background.paper,
              display: 'flex',
              flexDirection: 'column',
            },
          }}
        >
          <DetailPanel
            entity={selected}
            connections={selectedConnections}
            entityMap={entityMap}
            allEntities={positioned}
            edgesRaw={edgesRaw}
            onSelect={handleNodeSelect}
            onClose={() => setSelectedId(null)}
            pipelinesMap={pipelinesMap}
          />
        </Drawer>
      )}
      {/* Info Dialog */}
      <FormDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="About Data Architecture Map"
        subtitle="Live interactive map of your platform"
        icon={AccountTreeOutlinedIcon}
        maxWidth="sm"
        hideCancel
        actions={
          <Button onClick={() => setInfoOpen(false)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        }
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            This is a live, interactive architecture map of your entire platform. It visualizes all
            connections between frontend pages, API routes, Supabase database tables, security
            controls, and external services.
          </Typography>
          <Divider />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            How to use:
          </Typography>
          <List dense disablePadding>
            <ListItem disableGutters>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AppIcon
                  name="AccountTreeOutlined"
                  fallback={AccountTreeOutlinedIcon}
                  sx={{ fontSize: 18 }}
                />
              </ListItemIcon>
              <ListItemText
                primary="Click any node to see detailed information, columns, connections, and data flow paths"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItem>
            <ListItem disableGutters>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AppIcon name="SyncAlt" fallback={SyncAltIcon} sx={{ fontSize: 18 }} />
              </ListItemIcon>
              <ListItemText
                primary="Animated edges show active data flows between components"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItem>
            <ListItem disableGutters>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AppIcon
                  name="SecurityOutlined"
                  fallback={SecurityOutlinedIcon}
                  sx={{ fontSize: 18 }}
                />
              </ListItemIcon>
              <ListItemText
                primary="Health indicators show RLS status, missing indexes, and security warnings"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItem>
            <ListItem disableGutters>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 18 }} />
              </ListItemIcon>
              <ListItemText
                primary="Use search and filters to explore specific layers of the architecture"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItem>
            <ListItem disableGutters>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AppIcon name="HubOutlined" fallback={HubOutlinedIcon} sx={{ fontSize: 18 }} />
              </ListItemIcon>
              <ListItemText
                primary="Navigate connections: click related entities in the detail panel to trace data paths"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItem>
          </List>
          <Divider />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Data Sources:
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Topology is built from Supabase migration SQL files, API route analysis, live database
            queries (row counts, table existence), and environment configuration checks.
          </Typography>
        </Stack>
      </FormDialog>
    </PageLayout>
  );
}
