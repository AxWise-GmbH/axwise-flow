/**
 * VisuaCore - Cognitive topology visualization page
 * Two switchable views: Cognitive (zone clusters) and Radial (concentric rings)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import CloseIcon from '@mui/icons-material/Close';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import ApiOutlinedIcon from '@mui/icons-material/ApiOutlined';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import WebOutlinedIcon from '@mui/icons-material/WebOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import CellTowerOutlinedIcon from '@mui/icons-material/CellTowerOutlined';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PageLayout from '../components/Common/PageLayout';
import BentoCard from '../components/Common/BentoCard';
import { getAuthHeaders } from '../lib/supabaseEdge';
import { createHoverGlowShadow } from '../theme/hoverGlow';

import AppIcon from '../components/icons/AppIcon';

/* ─── Topology data loader (module-level, shared cache) ─── */

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
      if (!res.ok) throw new Error(`Failed to load topology (${res.status})`);
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

/* ─── Constants ─── */

const COGNITIVE_ZONES = {
  perceive: {
    label: 'Input',
    color: '#06B6D4',
    icon: VisibilityOutlinedIcon,
    categories: ['frontend', 'communication'],
    description: 'Where things come in - pages, webhooks, messages',
  },
  reason: {
    label: 'Brain',
    color: '#9333EA',
    icon: PsychologyOutlinedIcon,
    categories: ['agents', 'teams', 'llm'],
    description: 'Where thinking happens - agents, AI models, teams',
  },
  act: {
    label: 'Hands',
    color: '#F59E0B',
    icon: BoltOutlinedIcon,
    categories: ['api', 'infrastructure', 'crons'],
    description: 'Where work gets done - APIs, tools, services, jobs',
  },
  govern: {
    label: 'Rules',
    color: '#EC4899',
    icon: SecurityOutlinedIcon,
    categories: ['consilium', 'security'],
    description: 'What checks quality - scoring, security, approval',
  },
  store: {
    label: 'Memory',
    color: '#2563EB',
    icon: StorageOutlinedIcon,
    categories: ['database'],
    description: 'Where data lives - tables, storage',
  },
};

const CATEGORY_TO_ZONE = {};
Object.entries(COGNITIVE_ZONES).forEach(([zone, cfg]) => {
  cfg.categories.forEach((cat) => {
    CATEGORY_TO_ZONE[cat] = zone;
  });
});

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

const HEALTH_COLORS = { healthy: '#16A34A', warning: '#F59E0B', critical: '#DC2626' };

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

/* ─── Positioning helpers ─── */

function positionCognitiveView(
  entities,
  entitiesByZone,
  expandedZone,
  selectedId,
  connectedIds,
  onExpand,
  onSelect
) {
  const nodes = [];
  const zoneKeys = Object.keys(COGNITIVE_ZONES);

  if (!expandedZone) {
    // Collapsed: 5 cluster nodes in a clean layout
    const positions = {
      perceive: { x: 50, y: 150 },
      reason: { x: 400, y: 150 },
      act: { x: 750, y: 150 },
      govern: { x: 225, y: 420 },
      store: { x: 575, y: 420 },
    };
    zoneKeys.forEach((zone) => {
      const pos = positions[zone];
      nodes.push({
        id: `zone-${zone}`,
        type: 'cognitiveCluster',
        position: pos,
        data: {
          zone,
          zoneConfig: COGNITIVE_ZONES[zone],
          entities: entitiesByZone[zone] || [],
          collapsed: false,
          onExpand,
        },
        draggable: false,
      });
    });
  } else {
    // Expanded: show entities of expanded zone, others as pills
    const expandedEntities = entitiesByZone[expandedZone] || [];
    const COLS = 3;
    const NODE_W = 180;
    const NODE_H = 48;
    const GAP_X = 16;
    const GAP_Y = 12;

    expandedEntities.forEach((entity, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const zoneColor = COGNITIVE_ZONES[expandedZone].color;
      nodes.push({
        id: entity.id,
        type: 'entityNode',
        position: { x: 30 + col * (NODE_W + GAP_X), y: 60 + row * (NODE_H + GAP_Y) },
        data: {
          entity,
          isSelected: selectedId === entity.id,
          zoneColor,
          onSelect,
          dimmed: connectedIds ? !connectedIds.has(entity.id) : false,
        },
        draggable: false,
      });
    });

    // Other zones as collapsed pills on the right
    let pillY = 60;
    zoneKeys
      .filter((z) => z !== expandedZone)
      .forEach((zone) => {
        nodes.push({
          id: `zone-${zone}`,
          type: 'cognitiveCluster',
          position: { x: 30 + COLS * (NODE_W + GAP_X) + 40, y: pillY },
          data: {
            zone,
            zoneConfig: COGNITIVE_ZONES[zone],
            entities: entitiesByZone[zone] || [],
            collapsed: true,
            onExpand,
          },
          draggable: false,
        });
        pillY += 70;
      });
  }

  return nodes;
}

const CATEGORY_META = {
  frontend: { icon: WebOutlinedIcon, label: 'Frontend', color: '#7C3AED' },
  api: { icon: ApiOutlinedIcon, label: 'API Routes', color: '#1D4ED8' },
  communication: { icon: CellTowerOutlinedIcon, label: 'Communication', color: '#06B6D4' },
  agents: { icon: SmartToyOutlinedIcon, label: 'Agents', color: '#9333EA' },
  teams: { icon: PsychologyOutlinedIcon, label: 'Teams', color: '#F97316' },
  llm: { icon: PsychologyOutlinedIcon, label: 'LLM Providers', color: '#9333EA' },
  infrastructure: { icon: CloudOutlinedIcon, label: 'Services & Infra', color: '#0284C7' },
  crons: { icon: ScheduleOutlinedIcon, label: 'Crons & Jobs', color: '#F59E0B' },
  consilium: { icon: SecurityOutlinedIcon, label: 'Consilium', color: '#D946EF' },
  security: { icon: LockOutlinedIcon, label: 'Security', color: '#B91C1C' },
  database: { icon: StorageOutlinedIcon, label: 'Database', color: '#2563EB' },
};

function positionRadialView(
  entitiesByZone,
  entitiesByCategory,
  selectedCategory,
  onSelectCategory
) {
  const nodes = [];
  const cx = 700;
  const cy = 700;
  const R = 400;
  const GAP_DEG = 5;
  const zoneKeys = Object.keys(COGNITIVE_ZONES);

  // Count total categories (not entities) for angle distribution
  const allCategories = [];
  zoneKeys.forEach((zone) => {
    COGNITIVE_ZONES[zone].categories.forEach((cat) => {
      if ((entitiesByCategory[cat]?.length || 0) > 0) allCategories.push({ zone, cat });
    });
  });
  const totalCats = allCategories.length;
  if (totalCats === 0) return nodes;

  const totalEntityCount = allCategories.reduce(
    (s, ac) => s + (entitiesByCategory[ac.cat]?.length || 0),
    0
  );
  const totalGap = GAP_DEG * zoneKeys.length;
  const availableDeg = 360 - totalGap;

  let startAngle = -90;

  zoneKeys.forEach((zone) => {
    const zoneCats = COGNITIVE_ZONES[zone].categories.filter(
      (c) => (entitiesByCategory[c]?.length || 0) > 0
    );
    if (zoneCats.length === 0) {
      startAngle += GAP_DEG;
      return;
    }

    const zoneEntityCount = zoneCats.reduce((s, c) => s + (entitiesByCategory[c]?.length || 0), 0);
    const sweepDeg = (zoneEntityCount / totalEntityCount) * availableDeg;
    const zoneColor = COGNITIVE_ZONES[zone].color;

    zoneCats.forEach((cat, catIdx) => {
      const catCount = entitiesByCategory[cat]?.length || 0;
      const catSweepFraction = catCount / zoneEntityCount;
      const catAngleStart =
        startAngle +
        zoneCats
          .slice(0, catIdx)
          .reduce(
            (s, c) => s + ((entitiesByCategory[c]?.length || 0) / zoneEntityCount) * sweepDeg,
            0
          );
      const catAngleMid = catAngleStart + (catSweepFraction * sweepDeg) / 2;
      const rad = (catAngleMid * Math.PI) / 180;

      const isSelected = selectedCategory === cat;
      const meta = CATEGORY_META[cat] || TYPE_META[cat] || TYPE_META.service;

      nodes.push({
        id: `cat-${cat}`,
        type: 'radialGroupNode',
        position: { x: cx + R * Math.cos(rad) - 70, y: cy + R * Math.sin(rad) - 30 },
        data: {
          category: cat,
          label: meta.label || cat,
          count: catCount,
          zoneColor,
          zone,
          icon: meta.icon,
          isSelected,
          onSelect: () => onSelectCategory(cat),
        },
        draggable: false,
      });
    });

    startAngle += sweepDeg + GAP_DEG;
  });

  return nodes;
}

/* ─── Sub-components ─── */

function CognitiveClusterNode({ data }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { zone, zoneConfig, entities, collapsed, onExpand } = data;
  const healthy = entities.filter((e) => e.health === 'healthy').length;
  const healthPercent = entities.length > 0 ? Math.round((healthy / entities.length) * 100) : 100;
  const Icon = zoneConfig.icon;

  // Collapsed pill mode (when another zone is expanded)
  if (collapsed) {
    return (
      <>
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        <Box
          onClick={() => onExpand(zone)}
          sx={{
            width: 180,
            py: 0.8,
            px: 1.2,
            borderRadius: 2,
            cursor: 'pointer',
            bgcolor: alpha(zoneConfig.color, isDark ? 0.12 : 0.06),
            border: `1px solid ${alpha(zoneConfig.color, 0.3)}`,
            '&:hover': { bgcolor: alpha(zoneConfig.color, 0.2), transform: 'scale(1.02)' },
            transition: 'all 0.2s ease',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <AppIcon fallback={Icon} sx={{ fontSize: 14, color: zoneConfig.color }} />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: zoneConfig.color }}>
              {zoneConfig.label}
            </Typography>
            <Chip
              size="small"
              label={entities.length}
              sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, ml: 'auto' }}
            />
          </Stack>
        </Box>
      </>
    );
  }

  // Full cluster node
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Box
        onClick={() => onExpand(zone)}
        sx={{
          width: 260,
          minHeight: 140,
          p: 2,
          borderRadius: 4,
          cursor: 'pointer',
          background: isDark
            ? `linear-gradient(135deg, ${alpha(zoneConfig.color, 0.2)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
            : `linear-gradient(135deg, ${alpha(zoneConfig.color, 0.1)} 0%, ${alpha('#fff', 0.98)} 100%)`,
          border: `2px solid ${alpha(zoneConfig.color, 0.4)}`,
          boxShadow: `0 4px 24px ${alpha(zoneConfig.color, 0.15)}`,
          '&:hover': {
            transform: 'translateY(-4px) scale(1.02)',
            boxShadow: `0 8px 32px ${alpha(zoneConfig.color, 0.25)}`,
            borderColor: zoneConfig.color,
          },
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(zoneConfig.color, 0.15),
                color: zoneConfig.color,
              }}
            >
              <AppIcon fallback={Icon} sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1.2 }}>
                {zoneConfig.label}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
                {zoneConfig.description}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Chip
              size="small"
              label={`${entities.length} entities`}
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: alpha(zoneConfig.color, 0.1),
                color: zoneConfig.color,
              }}
            />
            <Chip
              size="small"
              label={`${healthPercent}% healthy`}
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: alpha(
                  healthPercent > 80 ? '#16A34A' : healthPercent > 50 ? '#F59E0B' : '#DC2626',
                  0.1
                ),
                color: healthPercent > 80 ? '#16A34A' : healthPercent > 50 ? '#F59E0B' : '#DC2626',
              }}
            />
          </Stack>
          {/* Mini health bar */}
          <Box
            sx={{
              height: 4,
              borderRadius: 2,
              bgcolor: alpha(zoneConfig.color, 0.1),
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                height: '100%',
                width: `${healthPercent}%`,
                borderRadius: 2,
                bgcolor:
                  healthPercent > 80 ? '#16A34A' : healthPercent > 50 ? '#F59E0B' : '#DC2626',
                transition: 'width 0.5s ease',
              }}
            />
          </Box>
        </Stack>
      </Box>
    </>
  );
}

function EntityNode({ data }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { entity, isSelected, zoneColor, onSelect } = data;
  const meta = TYPE_META[entity.type] || TYPE_META.service;
  const healthColor = HEALTH_COLORS[entity.health] || '#94A3B8';
  const Icon = meta.icon;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: zoneColor,
          width: 6,
          height: 6,
          border: `1.5px solid ${isDark ? '#1E293B' : '#fff'}`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: zoneColor,
          width: 6,
          height: 6,
          border: `1.5px solid ${isDark ? '#1E293B' : '#fff'}`,
        }}
      />
      <Tooltip title={entity.description || entity.label} placement="top" arrow>
        <Box
          onClick={() => onSelect(entity.id)}
          sx={{
            width: 160,
            py: 0.6,
            px: 1,
            borderRadius: 2,
            cursor: 'pointer',
            bgcolor: isDark ? alpha(theme.palette.background.paper, 0.9) : alpha('#fff', 0.95),
            border: `1.5px solid ${isSelected ? zoneColor : alpha(zoneColor, 0.3)}`,
            boxShadow: isSelected
              ? `0 0 0 2px ${alpha(zoneColor, 0.3)}, 0 4px 16px ${alpha(zoneColor, 0.15)}`
              : `0 2px 8px ${alpha(theme.palette.common.black, 0.06)}`,
            opacity: data.dimmed ? 0.15 : 1,
            '&:hover': { borderColor: zoneColor, transform: 'translateY(-1px)' },
            transition: 'all 0.2s ease',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={0.6}>
            <AppIcon fallback={Icon} sx={{ fontSize: 14, color: meta.color }} />
            <Typography
              sx={{
                fontSize: '0.68rem',
                fontWeight: 700,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entity.label}
            </Typography>
            <Box
              sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: healthColor, flexShrink: 0 }}
            />
          </Stack>
        </Box>
      </Tooltip>
    </>
  );
}

function RadialGroupNode({ data }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { label, count, zoneColor, icon: IconComp, isSelected, onSelect } = data;

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Box
        onClick={onSelect}
        sx={{
          width: 140,
          py: 1,
          px: 1.2,
          borderRadius: 3,
          cursor: 'pointer',
          bgcolor: isDark
            ? alpha(theme.palette.background.paper, isSelected ? 1 : 0.85)
            : alpha('#fff', isSelected ? 1 : 0.9),
          border: `2px solid ${isSelected ? zoneColor : alpha(zoneColor, 0.35)}`,
          boxShadow: isSelected
            ? `0 0 0 3px ${alpha(zoneColor, 0.25)}, 0 6px 20px ${alpha(zoneColor, 0.2)}`
            : `0 2px 10px ${alpha(theme.palette.common.black, 0.08)}`,
          '&:hover': {
            borderColor: 'primary.main',
            transform: 'scale(1.05)',
            boxShadow: createHoverGlowShadow(theme),
          },
          transition: 'all 0.2s ease',
        }}
      >
        <Stack alignItems="center" spacing={0.3}>
          <IconComp sx={{ fontSize: 20, color: zoneColor }} />
          <Typography
            sx={{ fontSize: '0.72rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}
          >
            {label}
          </Typography>
          <Chip
            size="small"
            label={count}
            sx={{
              height: 18,
              fontSize: '0.6rem',
              fontWeight: 700,
              bgcolor: alpha(zoneColor, 0.1),
              color: zoneColor,
            }}
          />
        </Stack>
      </Box>
    </>
  );
}

function RadialArcBackground({ zones, entityCounts, cx, cy, radius }) {
  const total = Object.values(entityCounts).reduce((s, n) => s + n, 0);
  if (total === 0) return null;

  const GAP_DEG = 4;
  const totalGap = GAP_DEG * Object.keys(zones).length;
  const availableDeg = 360 - totalGap;

  let startAngle = -90; // start from top
  const arcs = [];

  Object.entries(zones).forEach(([key, zone]) => {
    const count = entityCounts[key] || 0;
    if (count === 0) {
      startAngle += GAP_DEG;
      return;
    }

    const sweepDeg = (count / total) * availableDeg;
    const endAngle = startAngle + sweepDeg;

    // SVG arc path
    const r1 = radius - 30;
    const r2 = radius + 30;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1Outer = cx + r2 * Math.cos(startRad);
    const y1Outer = cy + r2 * Math.sin(startRad);
    const x2Outer = cx + r2 * Math.cos(endRad);
    const y2Outer = cy + r2 * Math.sin(endRad);
    const x1Inner = cx + r1 * Math.cos(endRad);
    const y1Inner = cy + r1 * Math.sin(endRad);
    const x2Inner = cx + r1 * Math.cos(startRad);
    const y2Inner = cy + r1 * Math.sin(startRad);

    const largeArc = sweepDeg > 180 ? 1 : 0;

    const path = `M ${x1Outer} ${y1Outer} A ${r2} ${r2} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x1Inner} ${y1Inner} A ${r1} ${r1} 0 ${largeArc} 0 ${x2Inner} ${y2Inner} Z`;

    // Label position at midpoint of arc
    const midAngle = (((startAngle + endAngle) / 2) * Math.PI) / 180;
    const labelR = r2 + 40;
    const labelX = cx + labelR * Math.cos(midAngle);
    const labelY = cy + labelR * Math.sin(midAngle);
    const labelRotation = (startAngle + endAngle) / 2 + 90;

    arcs.push({ key, zone, path, labelX, labelY, labelRotation, count });

    startAngle = endAngle + GAP_DEG;
  });

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {arcs.map((a) => (
        <g key={a.key}>
          <path
            d={a.path}
            fill={a.zone.color}
            fillOpacity={0.12}
            stroke={a.zone.color}
            strokeOpacity={0.25}
            strokeWidth={1}
          />
          <text
            x={a.labelX}
            y={a.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={a.zone.color}
            fontSize="12"
            fontWeight="800"
            opacity={0.8}
            transform={`rotate(${a.labelRotation}, ${a.labelX}, ${a.labelY})`}
          >
            {a.zone.label.toUpperCase()} ({a.count})
          </text>
        </g>
      ))}
    </svg>
  );
}

function SidePanel({
  selectedCategory,
  categoryEntities,
  selectedId,
  entityMap,
  edgesRaw,
  onSelectEntity,
  onClose,
  onNavigateToData,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const selectedEntity = selectedId ? entityMap[selectedId] : null;
  const zone = selectedCategory ? CATEGORY_TO_ZONE[selectedCategory] : null;
  const zoneConfig = zone ? COGNITIVE_ZONES[zone] : null;
  const catMeta = selectedCategory
    ? CATEGORY_META[selectedCategory] || TYPE_META[selectedCategory] || TYPE_META.service
    : null;

  // Get connections for selected entity
  const connections = useMemo(() => {
    if (!selectedId) return { outgoing: [], incoming: [] };
    const outgoing = [];
    const incoming = [];
    edgesRaw.forEach((e) => {
      if (e.source === selectedId && entityMap[e.target]) {
        outgoing.push({ entity: entityMap[e.target], relationship: e.relationship });
      }
      if (e.target === selectedId && entityMap[e.source]) {
        incoming.push({ entity: entityMap[e.source], relationship: e.relationship });
      }
    });
    return { outgoing, incoming };
  }, [selectedId, edgesRaw, entityMap]);

  if (!selectedCategory && !selectedEntity) return null;

  const CatIcon = catMeta?.icon || CloudOutlinedIcon;

  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 50,
        width: 300,
        maxHeight: 'calc(100% - 24px)',
        overflow: 'auto',
        p: 1.5,
        borderRadius: 2,
        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.95) : alpha('#fff', 0.95),
        backdropFilter: 'blur(8px)',
        borderColor: alpha(zoneConfig?.color || '#94A3B8', 0.3),
        boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.15)}`,
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <AppIcon fallback={CatIcon} sx={{ fontSize: 16, color: zoneConfig?.color }} />
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>
            {selectedEntity ? selectedEntity.label : catMeta?.label || selectedCategory}
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} sx={{ p: 0.3 }}>
          <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 14 }} />
        </IconButton>
      </Stack>
      {/* Selected entity details */}
      {selectedEntity &&
        (() => {
          const entMeta = TYPE_META[selectedEntity.type] || TYPE_META.service;
          return (
            <>
              <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                <Chip
                  size="small"
                  label={entMeta.label}
                  sx={{
                    height: 16,
                    fontSize: '0.5rem',
                    fontWeight: 700,
                    bgcolor: alpha(entMeta.color || '#94A3B8', 0.1),
                    color: entMeta.color,
                  }}
                />
                {zoneConfig && (
                  <Chip
                    size="small"
                    label={zoneConfig.label}
                    sx={{
                      height: 16,
                      fontSize: '0.5rem',
                      fontWeight: 700,
                      bgcolor: alpha(zoneConfig.color || '#94A3B8', 0.1),
                      color: zoneConfig.color,
                    }}
                  />
                )}
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: HEALTH_COLORS[selectedEntity.health] || '#94A3B8',
                    alignSelf: 'center',
                  }}
                />
              </Stack>
              {selectedEntity.description && (
                <Typography
                  sx={{ fontSize: '0.68rem', color: 'text.secondary', mb: 1, lineHeight: 1.5 }}
                >
                  {selectedEntity.description}
                </Typography>
              )}
              {/* Database table details */}
              {selectedEntity.type === 'table' && selectedEntity.details && (
                <Box sx={{ mb: 1 }}>
                  {/* Row count + RLS */}
                  <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                    {selectedEntity.details.rowCount != null && (
                      <Chip
                        size="small"
                        label={`${selectedEntity.details.rowCount} rows`}
                        sx={{
                          height: 16,
                          fontSize: '0.5rem',
                          fontWeight: 700,
                          bgcolor: alpha('#2563EB', 0.1),
                          color: '#2563EB',
                        }}
                      />
                    )}
                    {selectedEntity.details.rls && (
                      <Chip
                        size="small"
                        label={`RLS ${selectedEntity.details.rls}`}
                        sx={{
                          height: 16,
                          fontSize: '0.5rem',
                          fontWeight: 700,
                          bgcolor: alpha(
                            selectedEntity.details.rls === 'enabled' ? '#16A34A' : '#DC2626',
                            0.1
                          ),
                          color: selectedEntity.details.rls === 'enabled' ? '#16A34A' : '#DC2626',
                        }}
                      />
                    )}
                  </Stack>
                  {/* Columns */}
                  {selectedEntity.details.columns?.length > 0 && (
                    <Box sx={{ mb: 0.5 }}>
                      <Typography
                        sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#2563EB', mb: 0.2 }}
                      >
                        Columns ({selectedEntity.details.columns.length})
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" sx={{ gap: 0.3 }}>
                        {selectedEntity.details.columns.map((col) => (
                          <Chip
                            key={col}
                            size="small"
                            label={col}
                            sx={{
                              height: 16,
                              fontSize: '0.48rem',
                              fontWeight: 600,
                              bgcolor: alpha('#2563EB', 0.06),
                              color: 'text.secondary',
                            }}
                          />
                        ))}
                      </Stack>
                    </Box>
                  )}
                  {/* Foreign keys */}
                  {selectedEntity.details.foreignKeys?.length > 0 && (
                    <Box sx={{ mb: 0.5 }}>
                      <Typography
                        sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#7C3AED', mb: 0.2 }}
                      >
                        Foreign Keys ({selectedEntity.details.foreignKeys.length})
                      </Typography>
                      <Stack spacing={0.15}>
                        {selectedEntity.details.foreignKeys.map((fk, i) => (
                          <Typography
                            key={i}
                            sx={{
                              fontSize: '0.55rem',
                              color: 'text.secondary',
                              fontFamily: 'monospace',
                            }}
                          >
                            {fk}
                          </Typography>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  {/* RLS Policies */}
                  {selectedEntity.details.policies?.length > 0 && (
                    <Box sx={{ mb: 0.5 }}>
                      <Typography
                        sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#16A34A', mb: 0.2 }}
                      >
                        Policies ({selectedEntity.details.policies.length})
                      </Typography>
                      <Stack spacing={0.15}>
                        {selectedEntity.details.policies.map((p, i) => (
                          <Typography key={i} sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>
                            {p}
                          </Typography>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  <Divider sx={{ my: 0.5 }} />
                </Box>
              )}
              {/* Outgoing connections */}
              {connections.outgoing.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography
                    sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#2563EB', mb: 0.3 }}
                  >
                    Sends to ({connections.outgoing.length})
                  </Typography>
                  <Stack spacing={0.2}>
                    {connections.outgoing.map((c, i) => {
                      const relMeta =
                        RELATIONSHIP_META[c.relationship] || RELATIONSHIP_META.default;
                      const cMeta = TYPE_META[c.entity.type] || TYPE_META.service;
                      const CIcon = cMeta.icon;
                      return (
                        <Stack
                          key={i}
                          direction="row"
                          alignItems="center"
                          spacing={0.4}
                          onClick={() => onSelectEntity(c.entity.id)}
                          sx={{
                            py: 0.2,
                            px: 0.5,
                            borderRadius: 1,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: alpha(relMeta.color, 0.06) },
                          }}
                        >
                          <AppIcon fallback={CIcon} sx={{ fontSize: 11, color: cMeta.color }} />
                          <Typography
                            sx={{
                              fontSize: '0.62rem',
                              fontWeight: 600,
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.entity.label}
                          </Typography>
                          <Chip
                            size="small"
                            label={relMeta.label}
                            sx={{
                              height: 14,
                              fontSize: '0.45rem',
                              fontWeight: 700,
                              bgcolor: alpha(relMeta.color, 0.08),
                              color: relMeta.color,
                            }}
                          />
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>
              )}
              {/* Incoming connections */}
              {connections.incoming.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography
                    sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#16A34A', mb: 0.3 }}
                  >
                    Receives from ({connections.incoming.length})
                  </Typography>
                  <Stack spacing={0.2}>
                    {connections.incoming.map((c, i) => {
                      const relMeta =
                        RELATIONSHIP_META[c.relationship] || RELATIONSHIP_META.default;
                      const cMeta = TYPE_META[c.entity.type] || TYPE_META.service;
                      const CIcon = cMeta.icon;
                      return (
                        <Stack
                          key={i}
                          direction="row"
                          alignItems="center"
                          spacing={0.4}
                          onClick={() => onSelectEntity(c.entity.id)}
                          sx={{
                            py: 0.2,
                            px: 0.5,
                            borderRadius: 1,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: alpha(relMeta.color, 0.06) },
                          }}
                        >
                          <AppIcon fallback={CIcon} sx={{ fontSize: 11, color: cMeta.color }} />
                          <Typography
                            sx={{
                              fontSize: '0.62rem',
                              fontWeight: 600,
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.entity.label}
                          </Typography>
                          <Chip
                            size="small"
                            label={relMeta.label}
                            sx={{
                              height: 14,
                              fontSize: '0.45rem',
                              fontWeight: 700,
                              bgcolor: alpha(relMeta.color, 0.08),
                              color: relMeta.color,
                            }}
                          />
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>
              )}
              <Divider sx={{ mb: 0.8 }} />
              <Button
                size="small"
                variant="outlined"
                fullWidth
                onClick={() => onNavigateToData(selectedEntity.id)}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  borderColor: alpha(catMeta?.color || '#94A3B8', 0.3),
                  color: catMeta?.color,
                }}
              >
                Open in Data page
              </Button>
              {/* Back to category list */}
              <Button
                size="small"
                variant="text"
                fullWidth
                onClick={() => onSelectEntity(null)}
                sx={{ mt: 0.3, textTransform: 'none', fontSize: '0.6rem', color: 'text.disabled' }}
              >
                Back to {catMeta?.label} list
              </Button>
            </>
          );
        })()}
      {/* Category entity list (when no specific entity selected) */}
      {!selectedEntity && categoryEntities && (
        <>
          <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', mb: 0.8 }}>
            {categoryEntities.length} entities - click to trace connections
          </Typography>
          <Stack spacing={0.2}>
            {categoryEntities.map((entity) => {
              const meta = TYPE_META[entity.type] || TYPE_META.service;
              const healthColor = HEALTH_COLORS[entity.health] || '#94A3B8';
              const EIcon = meta.icon;
              return (
                <Stack
                  key={entity.id}
                  direction="row"
                  alignItems="center"
                  spacing={0.5}
                  onClick={() => onSelectEntity(entity.id)}
                  sx={{
                    py: 0.4,
                    px: 0.6,
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: alpha(zoneConfig?.color || '#94A3B8', 0.06) },
                    transition: 'all 0.15s ease',
                  }}
                >
                  <AppIcon fallback={EIcon} sx={{ fontSize: 13, color: meta.color }} />
                  <Typography
                    sx={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entity.label}
                  </Typography>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: healthColor }} />
                </Stack>
              );
            })}
          </Stack>
        </>
      )}
    </Paper>
  );
}

/* ─── Main component ─── */

export default function VisuaCore() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entities, setEntities] = useState([]);
  const [edgesRaw, setEdgesRaw] = useState([]);
  const [viewMode, setViewMode] = useState('cognitive');
  const [selectedId, setSelectedId] = useState(null);
  const [expandedZone, setExpandedZone] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Load topology data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTopologyPayload()
      .then((payload) => {
        if (cancelled) return;
        setEntities(payload.entities || []);
        setEdgesRaw(payload.edges || []);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Group entities by zone
  const entitiesByZone = useMemo(() => {
    const groups = {};
    Object.keys(COGNITIVE_ZONES).forEach((z) => {
      groups[z] = [];
    });
    entities
      .filter((e) => !e.__isGroup)
      .forEach((e) => {
        const zone = CATEGORY_TO_ZONE[e.category] || 'act';
        groups[zone].push(e);
      });
    return groups;
  }, [entities]);

  // Group entities by category
  const entitiesByCategory = useMemo(() => {
    const groups = {};
    entities
      .filter((e) => !e.__isGroup)
      .forEach((e) => {
        if (!groups[e.category]) groups[e.category] = [];
        groups[e.category].push(e);
      });
    return groups;
  }, [entities]);

  const entityMap = useMemo(
    () => Object.fromEntries(entities.filter((e) => !e.__isGroup).map((e) => [e.id, e])),
    [entities]
  );

  // Handle zone expand/collapse
  const handleExpandZone = useCallback((zone) => {
    setExpandedZone((prev) => (prev === zone ? null : zone));
    setSelectedId(null);
  }, []);

  const handleSelectEntity = useCallback(
    (id) => {
      setSelectedId(id);
      if (id && entityMap[id]) {
        setSelectedCategory(entityMap[id].category);
      }
    },
    [entityMap]
  );

  const handleSelectCategory = useCallback((cat) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
    setSelectedId(null);
  }, []);

  // Connected IDs for dimming
  const connectedIds = useMemo(() => {
    if (!selectedId) return null;
    const ids = new Set();
    ids.add(selectedId);
    edgesRaw.forEach((e) => {
      if (e.source === selectedId) ids.add(e.target);
      if (e.target === selectedId) ids.add(e.source);
    });
    return ids;
  }, [selectedId, edgesRaw]);

  // Compute nodes based on view mode
  const nodes = useMemo(() => {
    if (viewMode === 'cognitive') {
      return positionCognitiveView(
        entities,
        entitiesByZone,
        expandedZone,
        selectedId,
        connectedIds,
        handleExpandZone,
        handleSelectEntity
      );
    }
    return positionRadialView(
      entitiesByZone,
      entitiesByCategory,
      selectedCategory,
      handleSelectCategory
    );
  }, [
    viewMode,
    entities,
    entitiesByZone,
    entitiesByCategory,
    expandedZone,
    selectedId,
    selectedCategory,
    connectedIds,
    handleExpandZone,
    handleSelectEntity,
    handleSelectCategory,
  ]);

  // Compute edges
  const edges = useMemo(() => {
    if (viewMode === 'cognitive' && !expandedZone) {
      // Aggregate edges between zones
      const zoneCounts = {};
      edgesRaw.forEach((e) => {
        const srcZone = CATEGORY_TO_ZONE[entityMap[e.source]?.category];
        const tgtZone = CATEGORY_TO_ZONE[entityMap[e.target]?.category];
        if (!srcZone || !tgtZone || srcZone === tgtZone) return;
        const key = `${srcZone}->${tgtZone}`;
        zoneCounts[key] = (zoneCounts[key] || 0) + 1;
      });
      return Object.entries(zoneCounts).map(([key, count]) => {
        const [src, tgt] = key.split('->');
        return {
          id: `zone-${key}`,
          source: `zone-${src}`,
          target: `zone-${tgt}`,
          type: 'default',
          label: `${count}`,
          style: { stroke: alpha('#94A3B8', 0.4), strokeWidth: Math.min(1 + count / 10, 5) },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: alpha('#94A3B8', 0.4),
            width: 14,
            height: 10,
          },
        };
      });
    }

    // Radial view edges - aggregate between category groups
    if (viewMode === 'radial') {
      if (!selectedId) {
        // Show aggregate edges between category groups
        const catCounts = {};
        edgesRaw.forEach((e) => {
          const srcCat = entityMap[e.source]?.category;
          const tgtCat = entityMap[e.target]?.category;
          if (!srcCat || !tgtCat || srcCat === tgtCat) return;
          const key = `${srcCat}->${tgtCat}`;
          catCounts[key] = (catCounts[key] || 0) + 1;
        });
        return Object.entries(catCounts)
          .map(([key, count]) => {
            const [src, tgt] = key.split('->');
            if (
              !nodes.find((n) => n.id === `cat-${src}`) ||
              !nodes.find((n) => n.id === `cat-${tgt}`)
            )
              return null;
            return {
              id: `cat-edge-${key}`,
              source: `cat-${src}`,
              target: `cat-${tgt}`,
              type: 'default',
              style: { stroke: alpha('#94A3B8', 0.25), strokeWidth: Math.min(1 + count / 15, 4) },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: alpha('#94A3B8', 0.25),
                width: 10,
                height: 7,
              },
            };
          })
          .filter(Boolean);
      } else {
        // Highlight edges from selected entity's category to connected categories
        const selectedCat = entityMap[selectedId]?.category;
        const connectedCats = new Set();
        edgesRaw.forEach((e) => {
          if (e.source === selectedId) connectedCats.add(entityMap[e.target]?.category);
          if (e.target === selectedId) connectedCats.add(entityMap[e.source]?.category);
        });
        connectedCats.delete(undefined);
        connectedCats.delete(selectedCat);

        return [...connectedCats]
          .map((tgtCat) => {
            const relEdges = edgesRaw.filter(
              (e) =>
                (e.source === selectedId && entityMap[e.target]?.category === tgtCat) ||
                (e.target === selectedId && entityMap[e.source]?.category === tgtCat)
            );
            const count = relEdges.length;
            const primaryRel = relEdges[0]?.relationship || 'default';
            const relMeta = RELATIONSHIP_META[primaryRel] || RELATIONSHIP_META.default;

            const srcNode = `cat-${selectedCat}`;
            const tgtNode = `cat-${tgtCat}`;
            if (!nodes.find((n) => n.id === srcNode) || !nodes.find((n) => n.id === tgtNode))
              return null;

            return {
              id: `trace-${selectedCat}-${tgtCat}`,
              source: srcNode,
              target: tgtNode,
              type: 'default',
              label: `${count}`,
              style: {
                stroke: relMeta.color,
                strokeWidth: 2.5,
                filter: `drop-shadow(0 0 4px ${alpha(relMeta.color, 0.4)})`,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: relMeta.color,
                width: 14,
                height: 10,
              },
            };
          })
          .filter(Boolean);
      }
    }

    // Full edges for expanded cognitive view
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    return edgesRaw
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((e) => {
        const isConnected = selectedId && (e.source === selectedId || e.target === selectedId);
        const relMeta = RELATIONSHIP_META[e.relationship] || RELATIONSHIP_META.default;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'default',
          style: {
            stroke: isConnected ? relMeta.color : alpha(relMeta.color, selectedId ? 0.08 : 0.2),
            strokeWidth: isConnected ? 2.5 : 1,
            ...(isConnected ? { filter: `drop-shadow(0 0 4px ${alpha(relMeta.color, 0.4)})` } : {}),
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isConnected ? relMeta.color : alpha(relMeta.color, 0.2),
            width: 12,
            height: 8,
          },
        };
      });
  }, [viewMode, expandedZone, edgesRaw, entityMap, nodes, selectedId]);

  // Stable nodeTypes ref to prevent React Flow re-creating node components
  const nodeTypes = useMemo(
    () => ({
      cognitiveCluster: CognitiveClusterNode,
      entityNode: EntityNode,
      radialGroupNode: RadialGroupNode,
    }),
    []
  );

  // Entity count per zone for radial arcs
  const entityCounts = useMemo(() => {
    const counts = {};
    Object.entries(entitiesByZone).forEach(([z, ents]) => {
      counts[z] = ents.length;
    });
    return counts;
  }, [entitiesByZone]);

  return (
    <PageLayout
      title="VisuaCore"
      subtitle="Cognitive topology - how the system thinks"
      maxWidth={1800}
    >
      <BentoCard
        title="System Brain"
        icon={PsychologyOutlinedIcon}
        iconColor="#9333EA"
        noPadding
        action={
          <Stack direction="row" spacing={0.5} alignItems="center">
            {/* View mode toggle */}
            <Chip
              size="small"
              label="Cognitive"
              onClick={() => {
                setViewMode('cognitive');
                setExpandedZone(null);
              }}
              sx={{
                height: 24,
                fontSize: '0.65rem',
                fontWeight: 700,
                cursor: 'pointer',
                bgcolor: viewMode === 'cognitive' ? alpha('#9333EA', 0.15) : 'transparent',
                color: viewMode === 'cognitive' ? '#9333EA' : 'text.disabled',
                border:
                  viewMode === 'cognitive'
                    ? `1px solid ${alpha('#9333EA', 0.3)}`
                    : '1px solid transparent',
              }}
            />
            <Chip
              size="small"
              label="Radial"
              onClick={() => {
                setViewMode('radial');
                setExpandedZone(null);
              }}
              sx={{
                height: 24,
                fontSize: '0.65rem',
                fontWeight: 700,
                cursor: 'pointer',
                bgcolor: viewMode === 'radial' ? alpha('#06B6D4', 0.15) : 'transparent',
                color: viewMode === 'radial' ? '#06B6D4' : 'text.disabled',
                border:
                  viewMode === 'radial'
                    ? `1px solid ${alpha('#06B6D4', 0.3)}`
                    : '1px solid transparent',
              }}
            />
            <Chip
              size="small"
              label={`${entities.filter((e) => !e.__isGroup).length} entities`}
              sx={{ height: 22, fontSize: '0.6rem', fontWeight: 600, color: 'text.disabled' }}
            />
          </Stack>
        }
      >
        <Box sx={{ position: 'relative', height: 'calc(100vh - 280px)', minHeight: 500 }}>
          {loading && (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <CircularProgress size={32} />
              <Typography sx={{ mt: 1, fontSize: '0.75rem', color: 'text.disabled' }}>
                Loading topology...
              </Typography>
            </Stack>
          )}

          {error && (
            <Alert severity="error" sx={{ m: 2 }}>
              {error}
            </Alert>
          )}

          {!loading && !error && (
            <>
              {/* Radial arc background - only in radial mode */}
              {viewMode === 'radial' && (
                <RadialArcBackground
                  zones={COGNITIVE_ZONES}
                  entityCounts={entityCounts}
                  cx={700}
                  cy={700}
                  radius={400}
                />
              )}

              <ReactFlowProvider>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
                  onPaneClick={() => {
                    setSelectedId(null);
                    setSelectedCategory(null);
                  }}
                  proOptions={{ hideAttribution: true }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  minZoom={0.2}
                  maxZoom={2}
                >
                  <Controls showInteractive={false} />
                  <Background
                    gap={40}
                    size={1}
                    color={isDark ? alpha('#fff', 0.03) : alpha('#000', 0.03)}
                  />
                </ReactFlow>
              </ReactFlowProvider>

              {/* Side panel - LEFT side */}
              <SidePanel
                selectedCategory={selectedCategory}
                categoryEntities={
                  selectedCategory ? entitiesByCategory[selectedCategory] || [] : null
                }
                selectedId={selectedId}
                entityMap={entityMap}
                edgesRaw={edgesRaw}
                onSelectEntity={handleSelectEntity}
                onClose={() => {
                  setSelectedCategory(null);
                  setSelectedId(null);
                }}
                onNavigateToData={(id) => navigate(`/data?entity=${id}`)}
              />

              {/* Zone legend at bottom */}
              <Stack
                direction="row"
                spacing={1.5}
                sx={{
                  position: 'absolute',
                  bottom: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  bgcolor: isDark ? alpha(theme.palette.background.paper, 0.9) : alpha('#fff', 0.9),
                  backdropFilter: 'blur(8px)',
                  px: 2,
                  py: 0.8,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {Object.entries(COGNITIVE_ZONES).map(([key, zone]) => (
                  <Stack key={key} direction="row" alignItems="center" spacing={0.4}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: zone.color }} />
                    <Typography
                      sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'text.secondary' }}
                    >
                      {zone.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.55rem', color: 'text.disabled' }}>
                      ({entityCounts[key] || 0})
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </>
          )}
        </Box>
      </BentoCard>
    </PageLayout>
  );
}
