/**
 * ProcessGuide — the "Guides" view on the /data page. Renders the Goal / Loop /
 * Pulse process maps as an interactive left→right React Flow graph. Clicking a
 * step opens a detail panel describing what triggers it (cron), which API it
 * calls, which tool/MCP + LLM it uses, which DB tables + storage it touches,
 * which feature pages surface it, plus a code-grounded narrative and the
 * criteria/skills/KB specifics — with live metrics from /api/process-maps.
 *
 * Table/page chips deep-link into the existing live topology DetailPanel via the
 * `onOpenEntity(entityId)` callback, reusing the page's live-data drill-in.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  IconButton,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getAuthHeaders } from '../../lib/supabaseEdge';

/* ── kind → color/label ─────────────────────────────────────────── */
const KIND_META = {
  trigger: { color: '#16A34A', label: 'Trigger' },
  worker: { color: '#2563EB', label: 'Worker' },
  stage: { color: '#7C3AED', label: 'Stage' },
  review: { color: '#D97706', label: 'Review' },
  llm: { color: '#DC2626', label: 'LLM' },
  tool: { color: '#0D9488', label: 'Tool' },
  store: { color: '#475569', label: 'Store' },
  loop: { color: '#9333EA', label: 'Loop' },
};
const kindMeta = (k) => KIND_META[k] || { color: '#64748B', label: k || 'Step' };

/* ── module-level cache (mirrors Data.jsx loadTopologyPayload) ──── */
const CACHE_TTL_MS = 45_000;
let mapsCache = { payload: null, ts: 0 };
let mapsInFlight = null;

async function loadProcessMaps({ force = false } = {}) {
  const now = Date.now();
  if (!force && mapsCache.payload && now - mapsCache.ts < CACHE_TTL_MS) return mapsCache.payload;
  if (!force && mapsInFlight) return mapsInFlight;
  mapsInFlight = getAuthHeaders()
    .then((headers) => fetch('/api/process-maps', { cache: 'no-store', headers }))
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load process maps (${res.status})`);
      return res.json();
    })
    .then((payload) => {
      mapsCache = { payload, ts: Date.now() };
      return payload;
    })
    .finally(() => {
      mapsInFlight = null;
    });
  return mapsInFlight;
}

/* ── custom node ────────────────────────────────────────────────── */
function ProcessStepNode({ data }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const meta = kindMeta(data.kind);
  const selected = data.selected;
  return (
    <Box
      onClick={() => data.onSelect?.(data.step)}
      sx={{
        width: 210,
        cursor: 'pointer',
        borderRadius: 2,
        border: '1px solid',
        borderColor: selected ? meta.color : alpha(meta.color, 0.35),
        borderLeft: `4px solid ${meta.color}`,
        bgcolor: isDark ? alpha('#0F172A', 0.92) : '#fff',
        boxShadow: selected
          ? `0 0 0 2px ${alpha(meta.color, 0.5)}`
          : isDark
            ? '0 1px 3px rgba(0,0,0,0.4)'
            : '0 1px 3px rgba(15,23,42,0.12)',
        p: 1.1,
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: meta.color, border: 'none' }} />
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
        <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.3, color: meta.color, textTransform: 'uppercase' }}>
          {meta.label}
        </Typography>
        {data.cron ? (
          <Typography sx={{ fontSize: '0.55rem', color: 'text.disabled', fontFamily: 'monospace' }}>{data.cron}</Typography>
        ) : null}
      </Stack>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mt: 0.25, lineHeight: 1.2 }}>{data.label}</Typography>
      {data.metricLine ? (
        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.4 }} noWrap>
          {data.metricLine}
        </Typography>
      ) : null}
      <Handle type="source" position={Position.Right} style={{ background: meta.color, border: 'none' }} />
    </Box>
  );
}

const nodeTypes = { processStep: ProcessStepNode };

/* ── layout: left→right, one row per pulse lane ─────────────────── */
const COL_W = 260;
const ROW_H = 150;

function buildFlow(map, selectedId, onSelect) {
  const laneIndex = {};
  (map.lanes || []).forEach((l, i) => {
    laneIndex[l.id] = i;
  });
  const perLaneCount = {};
  const nodes = map.steps.map((step) => {
    const lane = step.lane || '__flat';
    const col = perLaneCount[lane] || 0;
    perLaneCount[lane] = col + 1;
    const row = step.lane ? laneIndex[step.lane] || 0 : 0;
    const firstMetric = step.metrics?.[0];
    const metricLine = firstMetric
      ? `${firstMetric.label}: ${formatMetric(firstMetric)}`
      : '';
    return {
      id: step.id,
      type: 'processStep',
      position: { x: col * COL_W, y: row * ROW_H },
      data: { step, label: step.label, kind: step.kind, cron: step.cron, metricLine, selected: selectedId === step.id, onSelect },
      draggable: false,
    };
  });
  const edges = (map.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { stroke: '#94A3B8', strokeWidth: 1.5 },
  }));
  return { nodes, edges };
}

function formatMetric(m) {
  if (m == null || m.value == null) return '—';
  if (m.format === 'currency') return `$${Number(m.value).toFixed(2)}`;
  return typeof m.value === 'number' ? m.value.toLocaleString() : String(m.value);
}

/* ── detail panel ───────────────────────────────────────────────── */
function Fact({ label, children }) {
  if (!children) return null;
  return (
    <Box>
      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'text.disabled' }}>
        {label}
      </Typography>
      <Box sx={{ mt: 0.25 }}>{children}</Box>
    </Box>
  );
}

function StepDetail({ step, onClose, onOpenEntity }) {
  const theme = useTheme();
  const meta = kindMeta(step.kind);
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        width: { xs: '100%', md: 360 },
        flexShrink: 0,
        borderLeft: { md: '1px solid' },
        borderColor: { md: 'divider' },
        bgcolor: isDark ? alpha('#0F172A', 0.4) : alpha('#F8FAFC', 0.6),
        p: 1.75,
        overflowY: 'auto',
      }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
        <Box>
          <Chip
            label={meta.label}
            size="small"
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, color: '#fff', bgcolor: meta.color, mb: 0.5 }}
          />
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.2 }}>{step.label}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>

      <Typography sx={{ fontSize: '0.8rem', color: 'text.primary', mt: 1, lineHeight: 1.45 }}>{step.narrative}</Typography>

      <Divider sx={{ my: 1.25 }} />
      <Stack spacing={1.25}>
        {step.metrics?.length ? (
          <Fact label="Live now">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {step.metrics.map((m) => (
                <Chip
                  key={m.key}
                  size="small"
                  label={`${m.label}: ${formatMetric(m)}`}
                  sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600 }}
                />
              ))}
            </Stack>
          </Fact>
        ) : null}

        <Fact label="Trigger / Cron">
          <Typography sx={{ fontSize: '0.75rem', fontFamily: step.cron ? 'monospace' : 'inherit' }}>
            {step.cron || 'Event / inline (no cron)'}
          </Typography>
        </Fact>

        {step.api ? (
          <Fact label="API">
            <Typography sx={{ fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{step.api}</Typography>
          </Fact>
        ) : null}

        {step.llms?.length ? (
          <Fact label="LLM">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {step.llms.map((l, i) => (
                <Chip key={i} size="small" label={`${l.provider} · ${l.model}`} sx={{ height: 20, fontSize: '0.62rem' }} />
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.tools?.length ? (
          <Fact label="Tools / MCP">
            <Stack spacing={0.25}>
              {step.tools.map((t, i) => (
                <Typography key={i} sx={{ fontSize: '0.72rem' }}>• {t}</Typography>
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.criteria?.length ? (
          <Fact label="Criteria">
            <Stack spacing={0.25}>
              {step.criteria.map((c, i) => (
                <Typography key={i} sx={{ fontSize: '0.72rem' }}>• {c}</Typography>
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.skills?.length ? (
          <Fact label="Skills / Agents">
            <Stack spacing={0.25}>
              {step.skills.map((s, i) => (
                <Typography key={i} sx={{ fontSize: '0.72rem' }}>• {s}</Typography>
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.kbWrites?.length ? (
          <Fact label="Knowledge base writes">
            <Stack spacing={0.25}>
              {step.kbWrites.map((k, i) => (
                <Typography key={i} sx={{ fontSize: '0.72rem' }}>
                  {k.table} · <b>{k.category}</b> · tags [{(k.tags || []).join(', ')}]
                </Typography>
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.tables?.length ? (
          <Fact label="Tables (click for live data)">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {step.tables.map((t) => (
                <Chip
                  key={t}
                  size="small"
                  label={t}
                  onClick={() => onOpenEntity?.(`table-${t}`)}
                  sx={{ height: 20, fontSize: '0.62rem', cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.storage?.length ? (
          <Fact label="Storage">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {step.storage.map((s, i) => (
                <Chip key={i} size="small" label={s} sx={{ height: 20, fontSize: '0.62rem' }} />
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.pages?.length ? (
          <Fact label="Feature pages">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {step.pages.map((p) => (
                <Chip
                  key={p}
                  size="small"
                  label={p.replace('frontend-', '')}
                  onClick={() => onOpenEntity?.(p)}
                  sx={{ height: 20, fontSize: '0.62rem', cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Fact>
        ) : null}

        {step.structure?.length ? (
          <Fact label="Structure">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {step.structure.map((s) => (
                <Chip key={s} size="small" variant="outlined" label={s} sx={{ height: 20, fontSize: '0.62rem' }} />
              ))}
            </Stack>
          </Fact>
        ) : null}

        <Fact label="Source">
          <Typography sx={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'text.secondary', wordBreak: 'break-all' }}>
            {step.file}
          </Typography>
        </Fact>
      </Stack>
    </Box>
  );
}

/* ── main component ─────────────────────────────────────────────── */
export default function ProcessGuide({ onOpenEntity }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [maps, setMaps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [active, setActive] = useState('goal');
  const [selectedStep, setSelectedStep] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadProcessMaps()
      .then((payload) => {
        if (!alive) return;
        setMaps(payload.maps || []);
        setGeneratedAt(payload.generatedAt || null);
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const activeMap = useMemo(() => (maps || []).find((m) => m.id === active) || null, [maps, active]);

  const handleSelect = useCallback((step) => setSelectedStep(step), []);

  const { nodes, edges } = useMemo(() => {
    if (!activeMap) return { nodes: [], edges: [] };
    return buildFlow(activeMap, selectedStep?.id, handleSelect);
  }, [activeMap, selectedStep, handleSelect]);

  // keep the selected panel in sync with fresh metric data after a reload
  useEffect(() => {
    if (!selectedStep || !activeMap) return;
    const fresh = activeMap.steps.find((s) => s.id === selectedStep.id);
    if (fresh && fresh !== selectedStep) setSelectedStep(fresh);
    if (!fresh) setSelectedStep(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMap]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 320, gap: 1.5 }}>
        <CircularProgress size={22} />
        <Typography color="text.secondary">Loading process maps…</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 320 }}>
      {/* selector */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={active}
          onChange={(_, v) => {
            if (v) {
              setActive(v);
              setSelectedStep(null);
            }
          }}
        >
          {(maps || []).map((m) => (
            <ToggleButton key={m.id} value={m.id} sx={{ textTransform: 'none', px: 1.5 }}>
              {m.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {activeMap ? (
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', flex: 1, minWidth: 200 }}>{activeMap.description}</Typography>
        ) : null}
        {generatedAt ? (
          <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
            live · {new Date(generatedAt).toLocaleTimeString()}
          </Typography>
        ) : null}
      </Stack>

      {/* lanes legend for pulse */}
      {activeMap?.lanes?.length ? (
        <Stack direction="row" spacing={2} sx={{ px: 1.5, py: 0.75 }}>
          {activeMap.lanes.map((l, i) => (
            <Typography key={l.id} sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
              <b>Row {i + 1}:</b> {l.label}
            </Typography>
          ))}
        </Stack>
      ) : null}

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, bgcolor: isDark ? alpha('#0B1120', 0.4) : alpha('#F8FAFC', 0.4) }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              nodesConnectable={false}
              nodesDraggable={false}
            >
              <Background gap={16} color={isDark ? '#1E293B' : '#E2E8F0'} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </Box>
        {selectedStep ? (
          <StepDetail step={selectedStep} onClose={() => setSelectedStep(null)} onOpenEntity={onOpenEntity} />
        ) : null}
      </Box>
    </Box>
  );
}
