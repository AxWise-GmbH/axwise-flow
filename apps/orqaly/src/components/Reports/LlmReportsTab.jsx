/**
 * LlmReportsTab - the LLM Usage view re-styled to match the Projects page chrome.
 *
 * Composes the already-built LLM usage data layer (useLlmUsage) and child
 * components (LlmUsagePanel, EntityDirectory) inside a single BentoCard. It owns
 * the metrics strip, the toolbar (filter popover + card/list toggle + demo
 * switch) and the date/category/sort/provider/model/source filters, mirroring
 * the Projects page layout. Renders inside the Reports page (which already
 * provides PageLayout + the tab bar), so it renders its own card chrome only.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Collapse,
  IconButton,
  Tooltip,
  Button,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Popover,
  Divider,
  Switch,
  FormControlLabel,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
  useTheme,
} from '@mui/material';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import MemoryIcon from '@mui/icons-material/Memory';
import BoltIcon from '@mui/icons-material/Bolt';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CachedIcon from '@mui/icons-material/Cached';
import SpeedIcon from '@mui/icons-material/Speed';
import GavelIcon from '@mui/icons-material/Gavel';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import BentoCard from '../Common/BentoCard';
import MetricsToggleButton from '../Common/MetricsToggleButton';
import StatCard from '../Common/StatCard';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useLlmUsage } from '../../hooks/useLlmUsage';
import LlmUsagePanel from '../LlmUsage/LlmUsagePanel';
import EntityDirectory from '../LlmUsage/EntityDirectory';
import { DEMO_AGGREGATE, DEMO_ITEMS, demoSnapshotFor } from '../../pages/LlmUsage/demoData';
import { formatCurrency } from '../../utils/formatters';
import { formatTokens } from '../../utils/formatTokens';

import AppIcon from '../icons/AppIcon';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All', icon: AppsRoundedIcon },
  { value: 'goal', label: 'Goal', icon: FlagRoundedIcon },
  { value: 'agent', label: 'Agent', icon: SmartToyRoundedIcon },
  { value: 'team', label: 'Team', icon: GroupsRoundedIcon },
  { value: 'consilium', label: 'Consilium', icon: AccountBalanceRoundedIcon },
  { value: 'organization', label: 'Organization', icon: ApartmentRoundedIcon },
];

const RANGE_PRESETS = [
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '60d', label: '60d', days: 60 },
  { id: '90d', label: '90d', days: 90 },
  { id: 'all', label: 'All', days: null },
];

const SORT_OPTIONS = [
  { id: 'cost', label: 'Cost' },
  { id: 'name', label: 'Name' },
  { id: 'calls', label: 'Calls' },
];

// Entities that carry a meaningful status worth filtering on. Agents report a
// null status (and All spans every type), so the status field is hidden there.
const STATUS_FILTERS = {
  goal: ['active', 'running', 'completed', 'failed', 'pending'],
  organization: ['active', 'inactive'],
  consilium: ['active', 'completed', 'pending'],
  team: ['active', 'inactive'],
};

// Fixed source options used when demo data is on (the demo aggregate has no
// facet list of its own).
const DEMO_SOURCES = ['agent', 'consilium', 'evaluation', 'manual'];

// "All" looks back this far. An empty `from` is read by the API as "last 30
// days", which hides older history, so All sends a concrete wide lower bound.
const ALL_RANGE_DAYS = 365;

/** YYYY-MM-DD for an offset of `days` from now (negative = past). */
function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Thousands-separated integer (e.g. 12400 -> "12,400"). */
function fmtInt(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Compact token label (e.g. "12.4k"); "0" when empty. */
function fmtTokens(value) {
  return formatTokens(value) || '0';
}

/** Cost with table-friendly precision: small amounts keep 4 decimals. */
function fmtCost(value) {
  const v = Number(value || 0);
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return formatCurrency(v);
}

/** Overline-styled field label inside the filter popover. */
function FieldLabel({ children }) {
  return (
    <Typography
      variant="overline"
      sx={{
        fontWeight: 700,
        color: 'text.secondary',
        letterSpacing: '0.08em',
        fontSize: '0.7rem',
        display: 'block',
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

export default function LlmReportsTab() {
  const theme = useTheme();

  const [category, setCategory] = useState('all');
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState(() => isoDay(-30));
  const [to, setTo] = useState(() => isoDay(0));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [orderBy, setOrderBy] = useState('cost');
  const [orderDir, setOrderDir] = useState('desc');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [source, setSource] = useState('');
  const [viewMode, setViewMode] = useState('card');
  const [demo, setDemo] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState(null);

  const [showMetrics, setShowMetrics] = useShowMetrics('llm');

  const { totals, facets } = useLlmUsage('all', {
    from,
    to,
    provider: provider || undefined,
    model: model || undefined,
    source: source || undefined,
    enabled: !demo,
  });

  // Aggregate totals for the metrics strip. Demo mode swaps in the fixed
  // aggregate snapshot.
  const t = (demo ? DEMO_AGGREGATE.totals : totals) || {};

  // Facet options for the provider/model/source selects. Live mode reads the
  // server-computed facet lists; demo mode derives them from the demo aggregate.
  const providerOptions = useMemo(
    () => (demo ? DEMO_AGGREGATE.byProvider.map((r) => r.provider) : facets?.providers || []),
    [demo, facets]
  );
  const modelOptions = useMemo(
    () => (demo ? DEMO_AGGREGATE.byModel.map((r) => r.model) : facets?.models || []),
    [demo, facets]
  );
  const sourceOptions = useMemo(
    () => (demo ? DEMO_SOURCES : facets?.sources || []),
    [demo, facets]
  );

  const statusOptions = STATUS_FILTERS[category];
  const cachePct = t.promptTokens > 0 ? (t.cachedTokens / t.promptTokens) * 100 : 0;

  const statCards = [
    {
      label: 'Total Cost',
      value: fmtCost(t.cost),
      icon: AttachMoneyIcon,
      color: theme.palette.success.main,
    },
    {
      label: 'Total Tokens',
      value: fmtTokens(t.tokens),
      helper: `${fmtTokens(t.promptTokens)} in · ${fmtTokens(t.completionTokens)} out`,
      icon: MemoryIcon,
      color: theme.palette.primary.main,
    },
    {
      label: 'Calls',
      value: fmtInt(t.calls),
      helper: t.errorCalls > 0 ? `${fmtInt(t.errorCalls)} errored` : 'no errors',
      icon: BoltIcon,
      color: theme.palette.info.main,
    },
    {
      label: 'Error Rate',
      value: `${Number(t.errorRate || 0).toFixed(1)}%`,
      icon: ErrorOutlineIcon,
      color: theme.palette.error.main,
    },
    {
      label: 'Cached Tokens',
      value: fmtTokens(t.cachedTokens),
      helper: `${cachePct.toFixed(1)}% of prompt`,
      icon: CachedIcon,
      color: theme.palette.secondary.main,
    },
    {
      label: 'Latency',
      value: `${Math.round(Number(t.avgDurationMs || 0))} ms`,
      helper: `p95 ${Math.round(Number(t.p95DurationMs || 0))} ms`,
      icon: SpeedIcon,
      color: theme.palette.warning.main,
    },
    {
      label: 'Evaluations',
      value: fmtInt(t.evaluations),
      helper: `${fmtInt(t.approved)} approved / avg ${Number(t.avgScore || 0).toFixed(1)}`,
      icon: GavelIcon,
      color: theme.palette.primary.main,
    },
  ];

  // A quick-range preset rewrites the from/to inputs. "All" uses a wide lower
  // bound so historical usage shows rather than only the last month.
  const applyPreset = (id) => {
    setPreset(id);
    const found = RANGE_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setTo(isoDay(0));
    setFrom(isoDay(-(found.days == null ? ALL_RANGE_DAYS : found.days)));
  };

  const resetFilters = () => {
    setCategory('all');
    applyPreset('30d');
    setSearch('');
    setStatus('');
    setOrderBy('cost');
    setOrderDir('desc');
    setProvider('');
    setModel('');
    setSource('');
    setFilterAnchor(null);
  };

  return (
    <BentoCard
      title="LLM Usage"
      icon={MemoryRoundedIcon}
      noPadding
      action={
        <MetricsToggleButton showMetrics={showMetrics} onToggle={() => setShowMetrics((v) => !v)} />
      }
    >
      {/* ── Metrics strip ── */}
      <Collapse in={showMetrics}>
        <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '10px',
            }}
          >
            {statCards.map((card) => (
              <Box key={card.label} data-testid={`stat-${card.label}`} sx={{ minWidth: 0 }}>
                <StatCard
                  label={card.label}
                  value={card.value}
                  helper={card.helper}
                  icon={card.icon}
                  color={card.color}
                />
              </Box>
            ))}
          </Box>
        </Box>
      </Collapse>
      {/* ── Category tabs ── */}
      <Box
        sx={{
          px: { xs: 1.25, sm: 1.5 },
          pt: showMetrics ? 0 : 1.25,
          pb: 1.25,
        }}
      >
        <Box
          role="tablist"
          aria-label="Usage category"
          sx={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 0.5,
            p: 0.5,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.text.primary, 0.04),
            overflowX: 'auto',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORY_OPTIONS.map((opt) => {
            const selected = category === opt.value;
            return (
              <Button
                key={opt.value}
                role="tab"
                aria-selected={selected}
                aria-label={opt.label}
                startIcon={<AppIcon fallback={opt.icon} sx={{ fontSize: 18 }} />}
                onClick={() => {
                  setCategory(opt.value);
                  setStatus('');
                }}
                sx={{
                  flexShrink: 0,
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  px: 2,
                  minHeight: 36,
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  color: selected ? 'primary.main' : 'text.secondary',
                  boxShadow: selected
                    ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                    : 'none',
                  '&:hover': {
                    bgcolor: selected
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.text.primary, 0.05),
                    color: selected ? 'primary.main' : 'text.primary',
                  },
                }}
              >
                {opt.label}
              </Button>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* ── Toolbar ── */}
        <Box
          sx={{
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Tooltip
            title="Filters: date range, search, status, sort, provider, model, source"
            placement="bottom"
            arrow
          >
            <IconButton
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
              aria-label="Filters"
            >
              <AppIcon
                name="TuneRounded"
                fallback={TuneRoundedIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v != null && setViewMode(v)}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.background.default, 0.8),
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              '& .MuiToggleButton-root': {
                px: 1.25,
                py: 0.75,
                border: 'none',
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.15),
                  color: 'primary.main',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
                },
              },
            }}
          >
            <ToggleButton value="card" aria-label="Card view">
              <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view">
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flex: 1 }} />

          <FormControlLabel
            control={
              <Switch checked={demo} onChange={(e) => setDemo(e.target.checked)} size="small" />
            }
            label="Show demo data"
            sx={{
              m: 0,
              '& .MuiFormControlLabel-label': {
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'text.secondary',
              },
            }}
          />

          {/* ── Filter popover ── */}
          <Popover
            open={Boolean(filterAnchor)}
            anchorEl={filterAnchor}
            onClose={() => setFilterAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1.5,
                  p: 0,
                  borderRadius: 3,
                  minWidth: 340,
                  maxWidth: 400,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                },
              },
            }}
          >
            <Box
              sx={{
                px: 2.5,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Filters
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    Date range, search, status, sort, provider, model, source
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ p: 2.5, maxHeight: 460, overflowY: 'auto' }}>
              <FieldLabel>Date range</FieldLabel>
              <ToggleButtonGroup
                value={preset}
                exclusive
                size="small"
                onChange={(_, v) => v && applyPreset(v)}
                aria-label="Quick range"
                sx={{
                  mb: 2,
                  flexWrap: 'wrap',
                  '& .MuiToggleButton-root': {
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    px: 1.25,
                    py: 0.4,
                    borderRadius: '8px !important',
                  },
                }}
              >
                {RANGE_PRESETS.map((p) => (
                  <ToggleButton key={p.id} value={p.id} aria-label={`Last ${p.label}`}>
                    {p.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  size="small"
                  type="date"
                  label="From"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreset('');
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1, '& .MuiInputBase-root': { borderRadius: 2 } }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="To"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreset('');
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1, '& .MuiInputBase-root': { borderRadius: 2 } }}
                />
              </Box>

              <FieldLabel>Search</FieldLabel>
              <TextField
                size="small"
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
                sx={{ mb: 2, '& .MuiInputBase-root': { borderRadius: 2 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="SearchOutlined"
                        fallback={SearchIcon}
                        sx={{ fontSize: 18, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
              />

              {statusOptions && (
                <>
                  <FieldLabel>Status</FieldLabel>
                  <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                    <InputLabel id="llm-reports-status-label">Status</InputLabel>
                    <Select
                      labelId="llm-reports-status-label"
                      value={status}
                      label="Status"
                      onChange={(e) => setStatus(e.target.value)}
                      sx={{ borderRadius: 2, fontWeight: 600 }}
                    >
                      <MenuItem value="">All statuses</MenuItem>
                      {statusOptions.map((s) => (
                        <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                          {s}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </>
              )}

              <FieldLabel>Sort</FieldLabel>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel id="llm-reports-sort-label">Sort</InputLabel>
                  <Select
                    labelId="llm-reports-sort-label"
                    value={orderBy}
                    label="Sort"
                    onChange={(e) => setOrderBy(e.target.value)}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <IconButton
                  size="small"
                  onClick={() => setOrderDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                  aria-label="Toggle sort direction"
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 0.75 }}
                >
                  {orderDir === 'desc' ? (
                    <AppIcon
                      name="ArrowDownward"
                      fallback={ArrowDownwardIcon}
                      sx={{ fontSize: 18 }}
                    />
                  ) : (
                    <AppIcon name="ArrowUpward" fallback={ArrowUpwardIcon} sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </Box>

              <FieldLabel>Provider</FieldLabel>
              <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                <InputLabel id="llm-reports-provider-label">Provider</InputLabel>
                <Select
                  labelId="llm-reports-provider-label"
                  value={provider}
                  label="Provider"
                  onChange={(e) => setProvider(e.target.value)}
                  sx={{ borderRadius: 2, fontWeight: 600 }}
                >
                  <MenuItem value="">All providers</MenuItem>
                  {providerOptions.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FieldLabel>Model</FieldLabel>
              <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                <InputLabel id="llm-reports-model-label">Model</InputLabel>
                <Select
                  labelId="llm-reports-model-label"
                  value={model}
                  label="Model"
                  onChange={(e) => setModel(e.target.value)}
                  sx={{ borderRadius: 2, fontWeight: 600 }}
                >
                  <MenuItem value="">All models</MenuItem>
                  {modelOptions.map((m) => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FieldLabel>Source</FieldLabel>
              <FormControl size="small" fullWidth>
                <InputLabel id="llm-reports-source-label">Source</InputLabel>
                <Select
                  labelId="llm-reports-source-label"
                  value={source}
                  label="Source"
                  onChange={(e) => setSource(e.target.value)}
                  sx={{ borderRadius: 2, fontWeight: 600 }}
                >
                  <MenuItem value="">All sources</MenuItem>
                  {sourceOptions.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Divider />
            <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
              <Button
                size="small"
                onClick={resetFilters}
                sx={{ textTransform: 'none', fontWeight: 600, color: 'primary.main' }}
              >
                Reset filters
              </Button>
            </Box>
          </Popover>
        </Box>

        {/* ── Content ── */}
        <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
          {category === 'all' ? (
            <LlmUsagePanel
              key={`all:${from}:${to}:${demo}`}
              entity="all"
              hideStats
              from={from}
              to={to}
              provider={provider || undefined}
              model={model || undefined}
              source={source || undefined}
              demo={demo ? DEMO_AGGREGATE : undefined}
            />
          ) : (
            <EntityDirectory
              key={`${category}:${from}:${to}:${demo}`}
              entity={category}
              embedded
              from={from}
              to={to}
              provider={provider || undefined}
              model={model || undefined}
              source={source || undefined}
              search={search}
              status={status}
              sortBy={orderBy}
              sortDir={orderDir}
              viewMode={viewMode}
              demoItems={demo ? DEMO_ITEMS[category] || [] : undefined}
              demoSnapshot={demo ? (item) => demoSnapshotFor(category, item) : undefined}
            />
          )}
        </Box>
      </Box>
    </BentoCard>
  );
}
