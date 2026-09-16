/**
 * LlmUsagePanel - reusable, per-entity LLM usage panel.
 *
 * Renders a reconciled usage snapshot (from useLlmUsage) as summary stat
 * cards, By Model / By Provider / By Agent breakdown tables, and a daily
 * cost/tokens timeseries. Designed to drop into the unified LLM Usage page
 * or any entity detail view. Never crashes: the hook returns an empty-shaped
 * snapshot when the API is unreachable, so an empty state renders instead.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Skeleton,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
  useTheme,
} from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import MemoryIcon from '@mui/icons-material/Memory';
import BoltIcon from '@mui/icons-material/Bolt';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CachedIcon from '@mui/icons-material/Cached';
import SpeedIcon from '@mui/icons-material/Speed';
import GavelIcon from '@mui/icons-material/Gavel';
import SavingsIcon from '@mui/icons-material/Savings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useLlmUsage } from '../../hooks/useLlmUsage';
import StatCard from '../Common/StatCard';
import { formatCurrency } from '../../utils/formatters';
import { formatTokens } from '../../utils/formatTokens';

import AppIcon from '../icons/AppIcon';

// ── Local formatters ─────────────────────────────────────────────

/** Thousands-separated integer (e.g. 12400 -> "12,400"). */
function fmtInt(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Compact token label for stat cards (e.g. "12.4k"); "0" when empty. */
function fmtTokensCompact(value) {
  return formatTokens(value) || '0';
}

/** Cost with table-friendly precision: small amounts keep 4 decimals. */
function fmtCost(value) {
  const v = Number(value || 0);
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return formatCurrency(v);
}

/** Percent with one decimal (input already a 0-100 number). */
function fmtPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

/** Milliseconds rounded to a whole number with unit. */
function fmtMs(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('en-US')} ms`;
}

// ── Stat card wrapper ────────────────────────────────────────────
// Reuses the canonical Common/StatCard; adds a loading skeleton and a
// test-friendly wrapper so each metric can be located by its label.

function UsageStat({ label, value, sub, icon, color, loading }) {
  return (
    <Box data-testid={`stat-${label}`} sx={{ minWidth: 0, height: '100%' }}>
      <StatCard
        label={label}
        value={loading ? <Skeleton width={64} /> : value}
        helper={loading ? null : sub}
        icon={icon}
        color={color}
      />
    </Box>
  );
}

// ── Breakdown table ──────────────────────────────────────────────

function BreakdownTable({ title, rows, nameKey, nameLabel, emptyLabel }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
        {title}
      </Typography>
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>{nameLabel}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Calls
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Tokens
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Cost
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row[nameKey] || `row-${i}`} hover>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>
                  {row[nameKey] || 'Unknown'}
                  {nameKey === 'model' && row.provider && (
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.75 }}
                    >
                      {row.provider}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.78rem' }}>
                  {fmtInt(row.calls)}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.78rem' }}>
                  {fmtInt(row.tokens)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem' }}>
                  {fmtCost(row.cost)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} sx={{ textAlign: 'center', py: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    {emptyLabel}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ── Timeseries chart ─────────────────────────────────────────────

function UsageTimeseries({ data, metric, theme }) {
  const accent = metric === 'cost' ? theme.palette.success.main : theme.palette.primary.main;
  const chartData = useMemo(
    () =>
      (data || []).map((d) => ({
        date: d.date,
        value: metric === 'cost' ? Number(d.cost || 0) : Number(d.tokens || 0),
      })),
    [data, metric]
  );

  if (chartData.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No usage recorded in this date range yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: 240 }} data-testid="usage-timeseries">
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            tickLine={false}
            axisLine={{ stroke: theme.palette.divider }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              metric === 'cost'
                ? `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                : v >= 1000
                  ? `${(v / 1000).toFixed(0)}k`
                  : v
            }
          />
          <RechartsTooltip
            cursor={{ fill: alpha(accent, 0.08) }}
            formatter={(value) => [
              metric === 'cost' ? fmtCost(value) : fmtInt(value),
              metric === 'cost' ? 'Cost' : 'Tokens',
            ]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} fill={accent}>
            {chartData.map((entry) => (
              <Cell key={entry.date} fill={alpha(accent, 0.85)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ── Main panel ───────────────────────────────────────────────────

export default function LlmUsagePanel({
  entity = 'all',
  entityId = null,
  from,
  to,
  title,
  demo = null,
  hideStats = false,
}) {
  const theme = useTheme();
  // A scoped entity (goal/agent/organization/...) needs an id before we can
  // query - without one the API correctly returns 400. Hold off fetching and
  // prompt for an id instead of surfacing an error. `demo` injects a fixed
  // snapshot (preview page) and bypasses the fetch entirely.
  const needsId = !demo && entity !== 'all' && !entityId;
  const hook = useLlmUsage(entity, {
    id: entityId,
    from,
    to,
    enabled: !needsId && !demo,
  });
  const data = demo || hook.data;
  const totals = demo ? demo.totals : hook.totals;
  const loading = demo ? false : hook.loading;
  const error = demo ? null : hook.error;
  const refresh = hook.refresh;
  const [metric, setMetric] = useState('cost');

  if (needsId) {
    return (
      <Box
        sx={{
          p: 4,
          textAlign: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2.5,
        }}
        data-testid="usage-needs-id"
      >
        <Typography variant="body2" color="text.secondary">
          Enter a {entity} ID above to view its usage, or switch Entity to &quot;All&quot;.
        </Typography>
      </Box>
    );
  }

  const t = totals || {};
  const cachePct = t.promptTokens > 0 ? (t.cachedTokens / t.promptTokens) * 100 : 0;

  const primaryStats = [
    {
      label: 'Total Cost',
      value: fmtCost(t.cost),
      icon: AttachMoneyIcon,
      color: theme.palette.success.main,
    },
    {
      label: 'Total Tokens',
      value: fmtTokensCompact(t.tokens),
      sub: `${fmtTokensCompact(t.promptTokens)} in · ${fmtTokensCompact(t.completionTokens)} out`,
      icon: MemoryIcon,
      color: theme.palette.primary.main,
    },
    {
      label: 'Calls',
      value: fmtInt(t.calls),
      sub: t.errorCalls > 0 ? `${fmtInt(t.errorCalls)} errored` : 'no errors',
      icon: BoltIcon,
      color: theme.palette.info.main,
    },
    {
      label: 'Error Rate',
      value: fmtPct(t.errorRate),
      icon: ErrorOutlineIcon,
      color: theme.palette.error.main,
    },
    {
      label: 'Cached Tokens',
      value: fmtTokensCompact(t.cachedTokens),
      sub: `${fmtPct(cachePct)} of prompt`,
      icon: CachedIcon,
      color: theme.palette.secondary.main,
    },
    {
      label: 'Latency',
      value: fmtMs(t.avgDurationMs),
      sub: `p95 ${fmtMs(t.p95DurationMs)}`,
      icon: SpeedIcon,
      color: theme.palette.warning.main,
    },
  ];

  const secondaryStats = [
    {
      label: 'Evaluations',
      value: fmtInt(t.evaluations),
      sub: `${fmtInt(t.approved)} approved / avg ${Number(t.avgScore || 0).toFixed(1)}`,
      icon: GavelIcon,
      color: theme.palette.primary.main,
    },
    {
      label: 'Revenue',
      value: fmtCost(t.revenue),
      icon: SavingsIcon,
      color: theme.palette.success.dark,
    },
    {
      label: 'Budget vs Spend',
      value: fmtCost(t.spentUsd),
      sub: t.budgetUsd > 0 ? `of ${fmtCost(t.budgetUsd)} budget` : 'no budget set',
      icon: AccountBalanceWalletIcon,
      color: theme.palette.warning.dark,
    },
  ];

  const isUnreachable = data?.source === 'client';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Header row */}
      {!hideStats && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {title && (
            <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
              {title}
            </Typography>
          )}
          <Box sx={{ flex: title ? 0 : 1 }} />
          <Tooltip title="Refresh usage data">
            <span>
              <IconButton size="small" onClick={refresh} disabled={loading} aria-label="Refresh">
                <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}
      {/* Error / unreachable notice */}
      {(error || isUnreachable) && (
        <Box
          sx={{
            p: 1.25,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.warning.main, 0.08),
            border: '1px solid',
            borderColor: alpha(theme.palette.warning.main, 0.3),
          }}
        >
          <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
            {error
              ? error.message || 'Usage data could not be loaded. Showing an empty snapshot.'
              : 'Usage API unreachable - showing an empty snapshot. Try refreshing.'}
          </Typography>
        </Box>
      )}
      {/* Primary + secondary stat cards (hidden when the page owns the metrics) */}
      {!hideStats && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '10px',
          }}
        >
          {primaryStats.map((s) => (
            <UsageStat key={s.label} {...s} loading={loading} />
          ))}
        </Box>
      )}
      {!hideStats && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '10px',
          }}
        >
          {secondaryStats.map((s) => (
            <UsageStat key={s.label} {...s} loading={loading} />
          ))}
        </Box>
      )}
      {/* Timeseries */}
      <Paper
        elevation={0}
        sx={{ p: 1.5, borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            Daily usage
          </Typography>
          <ToggleButtonGroup
            value={metric}
            exclusive
            size="small"
            onChange={(_, v) => v && setMetric(v)}
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                px: 1.25,
                py: 0.25,
                borderRadius: '8px !important',
              },
            }}
          >
            <ToggleButton value="cost">Cost</ToggleButton>
            <ToggleButton value="tokens">Tokens</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {loading ? (
          <Skeleton variant="rounded" height={240} sx={{ borderRadius: 2 }} />
        ) : (
          <UsageTimeseries data={data?.timeseries} metric={metric} theme={theme} />
        )}
      </Paper>
      {/* Breakdown tables */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '10px',
        }}
      >
        <BreakdownTable
          title="By Model"
          rows={data?.byModel || []}
          nameKey="model"
          nameLabel="Model"
          emptyLabel="No model usage in range"
        />
        <BreakdownTable
          title="By Provider"
          rows={data?.byProvider || []}
          nameKey="provider"
          nameLabel="Provider"
          emptyLabel="No provider usage in range"
        />
      </Box>
      <BreakdownTable
        title="By Agent"
        rows={(data?.byAgent || []).map((r) => ({ ...r, agent: r.agentName || r.agentId }))}
        nameKey="agent"
        nameLabel="Agent"
        emptyLabel="No agent usage in range"
      />
    </Box>
  );
}
