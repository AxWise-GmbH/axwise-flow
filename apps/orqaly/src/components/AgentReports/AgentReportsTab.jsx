/**
 * AgentReportsTab — shared component for Agent Reports in AgentHub and Reports pages.
 * Shows Consilium evaluations + LLM usage with filters.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Popover,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Skeleton,
  LinearProgress,
  Stack,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import GavelIcon from '@mui/icons-material/Gavel';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import Pagination from '../Common/Pagination';
import usePagination from '../../hooks/usePagination';
import { supabase, hasSupabase } from '../../lib/supabase';
import { loadTeamTasks } from '../../services/teamTaskBackend';
import { enrichAgentReportMeta } from '../../utils/enrichAgentTokenStats';
import ReportMetricCell from '../Goals/ReportMetricCell';
import { getMetricInfo } from '../../utils/reportMetricMeta';

import AppIcon from '../icons/AppIcon';

// ── Data fetching ───────────────────────────────────────────────

async function fetchEvaluations(limit = 200) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('concilium_evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[AgentReportsTab] Failed to load evaluations:', error.message);
    return [];
  }
  return data || [];
}

async function fetchLlmUsage(limit = 200) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('llm_usage')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[AgentReportsTab] Failed to load LLM usage:', error.message);
    return [];
  }
  return data || [];
}

async function fetchPayouts(limit = 200) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('payouts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[AgentReportsTab] Failed to load payouts:', error.message);
    return [];
  }
  return data || [];
}

async function fetchAgentReports(limit = 100) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('category', 'agent-report')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[AgentReportsTab] Failed to load agent reports:', error.message);
    return [];
  }
  return data || [];
}

// ── Helpers ─────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ScoreBar({ value, max = 10 }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'error';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ flex: 1, height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 28 }}>
        {typeof value === 'number' ? value.toFixed(1) : value}
      </Typography>
    </Box>
  );
}

function ApprovalChip({ approved }) {
  if (approved === true)
    return (
      <Chip
        icon={
          <AppIcon
            name="CheckCircleOutline"
            fallback={CheckCircleOutlineIcon}
            sx={{ fontSize: 14 }}
          />
        }
        label="Approved"
        size="small"
        color="success"
        variant="outlined"
        sx={{ fontWeight: 600, fontSize: '0.7rem' }}
      />
    );
  if (approved === false)
    return (
      <Chip
        icon={<AppIcon name="CancelOutlined" fallback={CancelOutlinedIcon} sx={{ fontSize: 14 }} />}
        label="Rejected"
        size="small"
        color="error"
        variant="outlined"
        sx={{ fontWeight: 600, fontSize: '0.7rem' }}
      />
    );
  return (
    <Chip
      icon={<AppIcon name="HelpOutline" fallback={HelpOutlineIcon} sx={{ fontSize: 14 }} />}
      label="Pending"
      size="small"
      variant="outlined"
      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
    />
  );
}

const STATUS_COLORS = {
  pending: 'default',
  processing: 'info',
  paid: 'success',
  failed: 'error',
  refunded: 'warning',
};

// ── Main Component ──────────────────────────────────────────────

export default function AgentReportsTab() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // View mode: evaluations | usage | payouts
  const [view, setView] = useState('reports');

  // Data
  const [evaluations, setEvaluations] = useState([]);
  const [usage, setUsage] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [agentReports, setAgentReports] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [expandedReport, setExpandedReport] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payoutStatus, setPayoutStatus] = useState('all');
  const [filterAnchor, setFilterAnchor] = useState(null);

  // Sort
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('desc');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [evals, llm, pays, reports, tasks] = await Promise.all([
      fetchEvaluations(),
      fetchLlmUsage(),
      fetchPayouts(),
      fetchAgentReports(),
      loadTeamTasks(),
    ]);
    setEvaluations(evals);
    setUsage(llm);
    setPayouts(pays);
    setAgentReports(reports);
    setTeamTasks(tasks || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Unique models across evaluations + usage
  const models = useMemo(() => {
    const set = new Set();
    evaluations.forEach((e) => e.model && set.add(e.model));
    usage.forEach((u) => u.model && set.add(u.model));
    return [...set].sort();
  }, [evaluations, usage]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (approvalFilter !== 'all') c++;
    if (modelFilter !== 'all') c++;
    if (scoreMin) c++;
    if (scoreMax) c++;
    if (dateFrom) c++;
    if (dateTo) c++;
    if (payoutStatus !== 'all') c++;
    return c;
  }, [approvalFilter, modelFilter, scoreMin, scoreMax, dateFrom, dateTo, payoutStatus]);

  const resetFilters = useCallback(() => {
    setSearch('');
    setApprovalFilter('all');
    setModelFilter('all');
    setScoreMin('');
    setScoreMax('');
    setDateFrom('');
    setDateTo('');
    setPayoutStatus('all');
  }, []);

  // ── Filter + sort data ────────────────────────────────────────

  const filteredEvaluations = useMemo(() => {
    let rows = [...evaluations];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.concilium_id || '').toLowerCase().includes(q) ||
          (r.model || '').toLowerCase().includes(q) ||
          (r.summary || '').toLowerCase().includes(q) ||
          (r.feedback || '').toLowerCase().includes(q)
      );
    }
    if (approvalFilter === 'approved') rows = rows.filter((r) => r.approved === true);
    else if (approvalFilter === 'rejected') rows = rows.filter((r) => r.approved === false);
    else if (approvalFilter === 'pending')
      rows = rows.filter((r) => r.approved === null || r.approved === undefined);
    if (modelFilter !== 'all') rows = rows.filter((r) => r.model === modelFilter);
    if (scoreMin) rows = rows.filter((r) => (r.overall_score || 0) >= Number(scoreMin));
    if (scoreMax) rows = rows.filter((r) => (r.overall_score || 0) <= Number(scoreMax));
    if (dateFrom) rows = rows.filter((r) => r.created_at >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.created_at <= dateTo + 'T23:59:59');
    // Sort
    rows.sort((a, b) => {
      const aVal = a[orderBy] ?? '';
      const bVal = b[orderBy] ?? '';
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [
    evaluations,
    search,
    approvalFilter,
    modelFilter,
    scoreMin,
    scoreMax,
    dateFrom,
    dateTo,
    orderBy,
    order,
  ]);

  const filteredUsage = useMemo(() => {
    let rows = [...usage];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.model || '').toLowerCase().includes(q) ||
          (r.provider || '').toLowerCase().includes(q) ||
          (r.job_id || '').toLowerCase().includes(q)
      );
    }
    if (modelFilter !== 'all') rows = rows.filter((r) => r.model === modelFilter);
    if (dateFrom) rows = rows.filter((r) => r.created_at >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.created_at <= dateTo + 'T23:59:59');
    rows.sort((a, b) => {
      const aVal = a[orderBy] ?? '';
      const bVal = b[orderBy] ?? '';
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [usage, search, modelFilter, dateFrom, dateTo, orderBy, order]);

  const filteredPayouts = useMemo(() => {
    let rows = [...payouts];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.agent_id || '').toLowerCase().includes(q) ||
          (r.task_id || '').toLowerCase().includes(q) ||
          (r.status || '').toLowerCase().includes(q) ||
          (r.currency || '').toLowerCase().includes(q)
      );
    }
    if (payoutStatus !== 'all') rows = rows.filter((r) => r.status === payoutStatus);
    if (dateFrom) rows = rows.filter((r) => r.created_at >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.created_at <= dateTo + 'T23:59:59');
    rows.sort((a, b) => {
      const aVal = a[orderBy] ?? '';
      const bVal = b[orderBy] ?? '';
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [payouts, search, payoutStatus, dateFrom, dateTo, orderBy, order]);

  const currentRows =
    view === 'evaluations'
      ? filteredEvaluations
      : view === 'usage'
        ? filteredUsage
        : filteredPayouts;

  const handleSort = useCallback(
    (col) => {
      if (orderBy === col) {
        setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
      } else {
        setOrderBy(col);
        setOrder('desc');
      }
    },
    [orderBy]
  );

  // ── Pagination ────────────────────────────────────────────────
  const pagination = usePagination(currentRows, {
    surfaceId: 'agentReports.main',
    defaultRowsPerPage: 10,
    resetOn: [
      view,
      search,
      approvalFilter,
      modelFilter,
      scoreMin,
      scoreMax,
      dateFrom,
      dateTo,
      payoutStatus,
      orderBy,
      order,
    ],
  });

  // ── Summary stats ─────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalEvals = evaluations.length;
    const approved = evaluations.filter((e) => e.approved === true).length;
    const avgScore =
      totalEvals > 0 ? evaluations.reduce((s, e) => s + (e.overall_score || 0), 0) / totalEvals : 0;
    const totalCost = usage.reduce((s, u) => s + (u.estimated_cost_usd || 0), 0);
    const totalTokens = usage.reduce(
      (s, u) => s + (u.prompt_tokens || 0) + (u.completion_tokens || 0),
      0
    );
    const totalRevenue = payouts.reduce((s, p) => s + Number(p.gross_amount || 0), 0);
    return { totalEvals, approved, avgScore, totalCost, totalTokens, totalRevenue };
  }, [evaluations, usage, payouts]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 1.5 }}>
      {/* Summary Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
          gap: 1.5,
          mb: 2,
        }}
      >
        {[
          {
            label: 'Evaluations',
            value: stats.totalEvals,
            icon: GavelIcon,
            color: theme.palette.primary.main,
          },
          {
            label: 'Approved',
            value: stats.approved,
            icon: CheckCircleOutlineIcon,
            color: theme.palette.success.main,
          },
          {
            label: 'Avg Score',
            value: stats.avgScore.toFixed(1),
            icon: AssessmentOutlinedIcon,
            color: theme.palette.warning.main,
          },
          {
            label: 'LLM Cost',
            value: `$${stats.totalCost.toFixed(2)}`,
            icon: AttachMoneyIcon,
            color: theme.palette.error.main,
          },
          {
            label: 'Tokens Used',
            value: stats.totalTokens.toLocaleString(),
            icon: MemoryIcon,
            color: theme.palette.info.main,
          },
          {
            label: 'Revenue',
            value: `$${stats.totalRevenue.toFixed(2)}`,
            icon: AttachMoneyIcon,
            color: theme.palette.success.dark,
          },
        ].map((card) => (
          <Paper
            key={card.label}
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: alpha(card.color, 0.04),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
              <AppIcon fallback={card.icon} sx={{ fontSize: 16, color: card.color }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {card.label}
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.1rem' }}>
              {loading ? <Skeleton width={60} /> : card.value}
            </Typography>
          </Paper>
        ))}
      </Box>
      {/* View Toggle + Search + Filters */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => {
            if (v) {
              setView(v);
              setOrderBy('created_at');
              setOrder('desc');
            }
          }}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.78rem',
              px: 1.5,
              borderRadius: '8px !important',
            },
          }}
        >
          <ToggleButton value="reports">Agent Reports</ToggleButton>
          <ToggleButton value="evaluations">Evaluations</ToggleButton>
          <ToggleButton value="usage">LLM Usage</ToggleButton>
          <ToggleButton value="payouts">Payouts</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon name="SearchOutlined" fallback={SearchIcon} sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ flex: 1, minWidth: 160, maxWidth: 280 }}
        />

        <Tooltip title="Filters">
          <IconButton
            size="small"
            onClick={(e) => setFilterAnchor(e.currentTarget)}
            sx={{
              border: '1px solid',
              borderColor: activeFilterCount > 0 ? 'primary.main' : 'divider',
              bgcolor:
                activeFilterCount > 0 ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
            }}
          >
            <AppIcon name="TuneRounded" fallback={TuneRoundedIcon} sx={{ fontSize: 18 }} />
            {activeFilterCount > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: 'white',
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {activeFilterCount}
              </Box>
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title="Refresh">
          <IconButton size="small" onClick={loadData} disabled={loading}>
            <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {activeFilterCount > 0 && (
          <Button
            size="small"
            onClick={resetFilters}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
          >
            Clear filters
          </Button>
        )}
      </Box>
      {/* Filter Popover */}
      <Popover
        open={Boolean(filterAnchor)}
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 280, borderRadius: 2.5 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Filters
        </Typography>
        <Stack spacing={1.5}>
          {/* Date range */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="From"
              type="date"
              size="small"
              fullWidth
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              fullWidth
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>

          {/* Model filter */}
          <FormControl size="small" fullWidth>
            <InputLabel>Model</InputLabel>
            <Select
              value={modelFilter}
              label="Model"
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <MenuItem value="all">All models</MenuItem>
              {models.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Approval filter (evaluations only) */}
          {view === 'evaluations' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Approval</InputLabel>
              <Select
                value={approvalFilter}
                label="Approval"
                onChange={(e) => setApprovalFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Score range (evaluations only) */}
          {view === 'evaluations' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Min score"
                type="number"
                size="small"
                fullWidth
                value={scoreMin}
                onChange={(e) => setScoreMin(e.target.value)}
                slotProps={{ htmlInput: { min: 0, max: 10, step: 0.1 } }}
              />
              <TextField
                label="Max score"
                type="number"
                size="small"
                fullWidth
                value={scoreMax}
                onChange={(e) => setScoreMax(e.target.value)}
                slotProps={{ htmlInput: { min: 0, max: 10, step: 0.1 } }}
              />
            </Box>
          )}

          {/* Payout status (payouts only) */}
          {view === 'payouts' && (
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={payoutStatus}
                label="Status"
                onChange={(e) => setPayoutStatus(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="processing">Processing</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
                <MenuItem value="refunded">Refunded</MenuItem>
              </Select>
            </FormControl>
          )}

          <Divider />
          <Button
            size="small"
            fullWidth
            onClick={() => {
              resetFilters();
              setFilterAnchor(null);
            }}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Reset all
          </Button>
        </Stack>
      </Popover>
      {/* Loading indicator */}
      {loading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
      {/* Tables */}
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}
      >
        {view === 'evaluations' && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'created_at'}
                    direction={orderBy === 'created_at' ? order : 'desc'}
                    onClick={() => handleSort('created_at')}
                  >
                    Date
                  </TableSortLabel>
                </TableCell>
                <TableCell>Concilium</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'overall_score'}
                    direction={orderBy === 'overall_score' ? order : 'desc'}
                    onClick={() => handleSort('overall_score')}
                  >
                    Score
                  </TableSortLabel>
                </TableCell>
                <TableCell>Approval</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'duration_ms'}
                    direction={orderBy === 'duration_ms' ? order : 'desc'}
                    onClick={() => handleSort('duration_ms')}
                  >
                    Duration
                  </TableSortLabel>
                </TableCell>
                {!isMobile && <TableCell>Summary</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {pagination.paginatedData.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                    {fmtDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.concilium_id?.slice(0, 12) || '—'}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <ScoreBar value={row.overall_score || 0} />
                  </TableCell>
                  <TableCell>
                    <ApprovalChip approved={row.approved} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {row.model || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ maxWidth: 250 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {row.summary || row.feedback || '—'}
                      </Typography>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredEvaluations.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No evaluations found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {view === 'usage' && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'created_at'}
                    direction={orderBy === 'created_at' ? order : 'desc'}
                    onClick={() => handleSort('created_at')}
                  >
                    Date
                  </TableSortLabel>
                </TableCell>
                <TableCell>Job</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'prompt_tokens'}
                    direction={orderBy === 'prompt_tokens' ? order : 'desc'}
                    onClick={() => handleSort('prompt_tokens')}
                  >
                    Prompt Tokens
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'completion_tokens'}
                    direction={orderBy === 'completion_tokens' ? order : 'desc'}
                    onClick={() => handleSort('completion_tokens')}
                  >
                    Completion Tokens
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'cost'}
                    direction={orderBy === 'cost' ? order : 'desc'}
                    onClick={() => handleSort('cost')}
                  >
                    Cost
                  </TableSortLabel>
                </TableCell>
                {!isMobile && <TableCell>Duration</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {pagination.paginatedData.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                    {fmtDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.job_id?.slice(0, 12) || '—'}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {row.model || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{row.provider || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {(row.prompt_tokens || 0).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {(row.completion_tokens || 0).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      ${(row.estimated_cost_usd || 0).toFixed(4)}
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      <Typography variant="caption">
                        {row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}
                      </Typography>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredUsage.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No LLM usage data found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {view === 'payouts' && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'created_at'}
                    direction={orderBy === 'created_at' ? order : 'desc'}
                    onClick={() => handleSort('created_at')}
                  >
                    Date
                  </TableSortLabel>
                </TableCell>
                <TableCell>Agent</TableCell>
                <TableCell>Task</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'gross_amount'}
                    direction={orderBy === 'gross_amount' ? order : 'desc'}
                    onClick={() => handleSort('gross_amount')}
                  >
                    Gross
                  </TableSortLabel>
                </TableCell>
                <TableCell>Agent Share</TableCell>
                <TableCell>Platform Fee</TableCell>
                <TableCell>Status</TableCell>
                {!isMobile && <TableCell>Paid At</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {pagination.paginatedData.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                    {fmtDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.agent_id?.slice(0, 12) || '—'}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.task_id?.slice(0, 12) || '—'}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      ${Number(row.gross_amount || 0).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                      ${Number(row.agent_share || 0).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
                      ${Number(row.platform_share || 0).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={row.status}
                      size="small"
                      color={STATUS_COLORS[row.status] || 'default'}
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.7rem', textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      <Typography variant="caption">{fmtDate(row.paid_at)}</Typography>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredPayouts.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No payout records found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Agent Reports from knowledge_documents */}
        {view === 'reports' && (
          <Box sx={{ p: 2 }}>
            {agentReports.length === 0 && !loading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  No agent reports yet. Reports are generated when goals complete.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={1.5}>
                {agentReports.map((report) => {
                  const meta = enrichAgentReportMeta(report, teamTasks);
                  const isOpen = expandedReport === report.id;
                  const quality = meta.avg_quality;
                  const tasks = meta.tasks || 0;
                  const completed = meta.completed || 0;
                  const cost = meta.cost || 0;
                  const tokens = meta.tokens || 0;
                  const agentName =
                    meta.agent_name ||
                    report.title?.replace('Agent Report: ', '').split(' — ')[0] ||
                    'Agent';
                  const goalTitle = report.title?.split(' — ')[1] || '';

                  return (
                    <Paper
                      key={report.id}
                      variant="outlined"
                      sx={{
                        borderRadius: 2,
                        overflow: 'hidden',
                        transition: 'border-color 0.2s',
                        '&:hover': { borderColor: 'primary.main' },
                      }}
                    >
                      {/* Header */}
                      <Box
                        onClick={() => setExpandedReport(isOpen ? null : report.id)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 2,
                          py: 1.25,
                          cursor: 'pointer',
                        }}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1,
                            bgcolor: alpha('#10B981', 0.12),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <AppIcon
                            name="AssessmentOutlined"
                            fallback={AssessmentOutlinedIcon}
                            sx={{ fontSize: 16, color: '#10B981' }}
                          />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, fontSize: '0.82rem' }}
                            noWrap
                          >
                            {agentName}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: '0.65rem' }}
                            noWrap
                          >
                            {goalTitle}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Chip
                            label={`${completed}/${tasks}`}
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ fontSize: '0.55rem', height: 18 }}
                          />
                          {quality != null && (
                            <Chip
                              label={`Q:${Math.round(quality)}`}
                              size="small"
                              sx={{
                                fontSize: '0.55rem',
                                height: 18,
                                bgcolor: alpha(quality >= 70 ? '#059669' : '#D97706', 0.12),
                                color: quality >= 70 ? '#059669' : '#D97706',
                              }}
                            />
                          )}
                          <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0 }}>
                            <ReportMetricCell
                              costUsd={cost}
                              tokens={tokens}
                              costInfo={getMetricInfo(meta.metricMeta?.costReason)}
                              tokenInfo={getMetricInfo(meta.metricMeta?.tokenReason)}
                              align="right"
                              compact
                            />
                          </Box>
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ fontSize: '0.6rem', flexShrink: 0 }}
                        >
                          {fmtDate(report.created_at)}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.7rem',
                            color: 'text.disabled',
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                            transition: 'transform 0.2s',
                          }}
                        >
                          ▾
                        </Typography>
                      </Box>
                      {/* Expanded content */}
                      {isOpen && (
                        <Box sx={{ px: 2, pb: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                          {/* Report content */}
                          <Paper
                            sx={{
                              p: 1.5,
                              mt: 1,
                              borderRadius: 1,
                              bgcolor: alpha('#10B981', 0.03),
                              maxHeight: 250,
                              overflow: 'auto',
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.78rem', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}
                            >
                              {report.content}
                            </Typography>
                          </Paper>

                          {/* Consilium review (if exists for this goal) */}
                          {meta.goal_id &&
                            (() => {
                              const consiliumEval = evaluations.find(
                                (e) =>
                                  e.goal_id === meta.goal_id || e.metadata?.goal_id === meta.goal_id
                              );
                              if (!consiliumEval)
                                return (
                                  <Box
                                    sx={{
                                      mt: 1,
                                      p: 1,
                                      borderRadius: 1,
                                      border: '1px dashed',
                                      borderColor: 'divider',
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      color="text.disabled"
                                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                    >
                                      <AppIcon
                                        name="Gavel"
                                        fallback={GavelIcon}
                                        sx={{ fontSize: 14 }}
                                      />{' '}
                                      No Consilium review for this goal
                                    </Typography>
                                  </Box>
                                );
                              return (
                                <Paper
                                  variant="outlined"
                                  sx={{
                                    mt: 1,
                                    p: 1.5,
                                    borderRadius: 1,
                                    borderColor: alpha('#7C3AED', 0.3),
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontWeight: 700,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 0.5,
                                      color: '#7C3AED',
                                      mb: 0.5,
                                    }}
                                  >
                                    <AppIcon
                                      name="Gavel"
                                      fallback={GavelIcon}
                                      sx={{ fontSize: 14 }}
                                    />{' '}
                                    Consilium Review
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                                    <Chip
                                      label={`Score: ${consiliumEval.score || consiliumEval.avg_score || '—'}`}
                                      size="small"
                                      sx={{ fontSize: '0.55rem', height: 18 }}
                                    />
                                    <Chip
                                      label={consiliumEval.approval_status || 'pending'}
                                      size="small"
                                      color={
                                        consiliumEval.approval_status === 'approved'
                                          ? 'success'
                                          : 'warning'
                                      }
                                      variant="outlined"
                                      sx={{ fontSize: '0.55rem', height: 18 }}
                                    />
                                  </Box>
                                  {consiliumEval.summary && (
                                    <Typography
                                      variant="body2"
                                      sx={{ fontSize: '0.72rem', color: 'text.secondary' }}
                                    >
                                      {consiliumEval.summary}
                                    </Typography>
                                  )}
                                </Paper>
                              );
                            })()}

                          {/* Links */}
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                            {meta.goal_id && (
                              <Chip
                                label="Open Goal"
                                size="small"
                                clickable
                                variant="outlined"
                                color="primary"
                                onClick={() => {
                                  window.location.href = `/goals/${meta.goal_id}`;
                                }}
                                sx={{ fontSize: '0.55rem', height: 20 }}
                              />
                            )}
                            {meta.agent_id && (
                              <Chip
                                label="Open Agent"
                                size="small"
                                clickable
                                variant="outlined"
                                onClick={() => {
                                  window.location.href = `/agent-hub?agent=${meta.agent_id}`;
                                }}
                                sx={{ fontSize: '0.55rem', height: 20 }}
                              />
                            )}
                          </Box>
                        </Box>
                      )}
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
      </TableContainer>
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
        label="rows"
      />
    </Box>
  );
}
