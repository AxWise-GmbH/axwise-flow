/**
 * Pulse - Autonomous agent scheduling dashboard.
 * Matches the AgentHub page design: metrics, pill tabs, filter/view toolbar, categories.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  useTheme,
  alpha,
  Button,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Popover,
  Stack,
  Select,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import LoopIcon from '@mui/icons-material/Loop';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Switch from '@mui/material/Switch';
import PageLayout from '../../components/Common/PageLayout';
import FormDialog from '../../components/Common/FormDialog';
import CreatePulseDialog from '../../components/Pulse/CreatePulseDialog';
import {
  listPulseSchedules,
  togglePulseSchedule,
  deletePulseSchedule,
  summarizeEntries,
} from '../../services/pulseScheduleService';
import { describeSchedule } from '../../utils/pulseSchedule';
import MetricsStrip from '../../components/Common/MetricsStrip';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import PulseTimeline from '../../components/Pulse/PulseTimeline';
import { supabase, hasSupabase } from '../../lib/supabase';
import { loadAuditLogs } from '../../services/auditLogBackend';

import AppIcon from '../../components/icons/AppIcon';

const REFRESH_INTERVAL = 30_000;

// ── Helpers ────────────────────────────────────────────────
function intervalLabel(ms) {
  if (!ms) return '--';
  const h = ms / 3600000;
  return h >= 1 ? `${h}h` : `${Math.round(ms / 60000)}m`;
}

function formatTimestamp(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ──────────────────────────────────────────────
export default function Pulse({ embedded = false, showMetrics }) {
  const theme = useTheme();
  const [agents, setAgents] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Tab
  const [tab, setTab] = useState('timeline');

  // View mode
  const [viewMode, setViewMode] = useState('list');

  // Filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('All');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [categoryAnchor, setCategoryAnchor] = useState(null);

  // Scheduled pulses (user-created via + New Pulse)
  const [schedules, setSchedules] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Activity log
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => {
        const e = (log.entity || '').toLowerCase();
        const a = (log.action || '').toLowerCase();
        return e === 'pulse' || e === 'pulsecycle' || a.includes('pulse');
      });
      setActivityLogs(filtered);
    } catch (_) {
      setActivityLogs([]);
    } finally {
      setActivityLogsLoading(false);
    }
  }, []);

  const closeActivityLog = useCallback(() => {
    setActivityLogOpen(false);
    setActivityLogs([]);
  }, []);

  const formatLogDateTime = (ts) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const getLogActionColor = (action) => {
    const a = (action || '').toLowerCase();
    if (
      a.includes('started') ||
      a.includes('enabled') ||
      a.includes('created') ||
      a.includes('added')
    )
      return 'success';
    if (
      a.includes('stopped') ||
      a.includes('disabled') ||
      a.includes('deleted') ||
      a.includes('crashed')
    )
      return 'error';
    if (
      a.includes('updated') ||
      a.includes('paused') ||
      a.includes('resumed') ||
      a.includes('kept')
    )
      return 'info';
    if (a.includes('discarded')) return 'warning';
    return 'default';
  };

  const getUserFromLog = (log) => (log.user && log.user !== '-' ? log.user : '-');
  const getIpFromLog = (log) => log.detailsStructured?.network?.ip || '-';
  const isDark = theme.palette.mode === 'dark';

  /* ── Fetch data ───────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    if (!hasSupabase()) {
      setLoading(false);
      return;
    }
    try {
      const { data: pulseAgents } = await supabase
        .from('concilium_agents')
        .select('*')
        .eq('pulse_enabled', true);

      const agentIds = (pulseAgents || []).map((a) => a.id);
      let pulseData = [];
      if (agentIds.length > 0) {
        const { data: cycleRows } = await supabase
          .from('pulse_cycles')
          .select('*')
          .in('agent_id', agentIds)
          .order('created_at', { ascending: false })
          .limit(200);
        pulseData = cycleRows || [];
      }
      setAgents(pulseAgents || []);
      setCycles(pulseData);
    } catch (err) {
      console.error('[Pulse] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      setSchedules(await listPulseSchedules());
    } catch (err) {
      console.error('[Pulse] schedules fetch error:', err);
    }
  }, []);

  const handleToggleSchedule = useCallback(
    async (id, enabled) => {
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
      try {
        await togglePulseSchedule(id, enabled);
      } catch {
        fetchSchedules();
      }
    },
    [fetchSchedules]
  );

  const handleDeleteSchedule = useCallback(
    async (id) => {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      try {
        await deletePulseSchedule(id);
      } catch {
        fetchSchedules();
      }
    },
    [fetchSchedules]
  );

  useEffect(() => {
    fetchData();
    fetchSchedules();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, fetchSchedules]);

  /* ── Computed stats ───────────────────────────────────────── */
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const totalActive = agents.length;
    const cyclesToday = cycles.filter((c) => c.created_at >= todayStart).length;
    const kept = cycles.filter((c) => c.status === 'keep').length;
    const discarded = cycles.filter((c) => c.status === 'discard').length;
    const crashed = cycles.filter((c) => c.status === 'crash').length;
    const keepRate = cycles.length > 0 ? Math.round((kept / cycles.length) * 100) : 0;
    const autonomousCount = agents.filter((a) => a.autonomous_enabled).length;
    const totalCost = cycles.reduce((sum, c) => sum + (parseFloat(c.cost_usd) || 0), 0);

    let nextDue = null;
    for (const a of agents) {
      const nr = a.next_pulse_at;
      if (nr && (!nextDue || nr < nextDue)) nextDue = nr;
    }
    const nextDueLabel = nextDue
      ? new Date(nextDue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '--';

    return {
      totalActive,
      cyclesToday,
      keepRate,
      nextDueLabel,
      kept,
      discarded,
      crashed,
      autonomousCount,
      totalCost,
    };
  }, [agents, cycles]);

  /* ── Stat cards (gradient style matching AgentHub) ────────── */
  const statCards = [
    {
      label: 'Active Pulses',
      value: stats.totalActive,
      helper: `${stats.autonomousCount} autonomous`,
      color: theme.palette.primary.main,
      icon: FiberManualRecordIcon,
    },
    {
      label: 'Cycles Today',
      value: stats.cyclesToday,
      helper: `${cycles.length} total`,
      color: theme.palette.info.main,
      icon: LoopIcon,
    },
    {
      label: 'Keep Rate',
      value: `${stats.keepRate}%`,
      helper: `${stats.kept} kept / ${stats.discarded} discarded`,
      color: theme.palette.success.main,
      icon: TrendingUpIcon,
    },
    {
      label: 'Next Due',
      value: stats.nextDueLabel,
      helper: `$${stats.totalCost.toFixed(4)} total cost`,
      color: theme.palette.warning.main,
      icon: TimerOutlinedIcon,
    },
  ];

  /* ── Filtered agents ──────────────────────────────────────── */
  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      if (modeFilter !== 'All' && a.pulse_mode !== modeFilter) return false;
      return true;
    });
  }, [agents, modeFilter]);

  /* ── Filtered cycles ──────────────────────────────────────── */
  const filteredCycles = useMemo(() => {
    return cycles.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      return true;
    });
  }, [cycles, statusFilter]);

  /* ── Pagination (cycle history tab) ───────────────────────── */
  const cyclesPagination = usePagination(filteredCycles, {
    surfaceId: 'pulse.cycles',
    defaultRowsPerPage: 25,
    resetOn: [statusFilter, tab],
  });

  const hasActiveFilters = statusFilter !== 'All' || modeFilter !== 'All';

  /* ── Status chip ──────────────────────────────────────────── */
  const statusChip = (status) => {
    const map = {
      keep: { color: 'success', label: 'Keep' },
      discard: { color: 'error', label: 'Discard' },
      crash: { color: 'warning', label: 'Crash' },
    };
    const cfg = map[status] || { color: 'default', label: status || 'Unknown' };
    return (
      <Chip
        size="small"
        label={cfg.label}
        color={cfg.color}
        sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
      />
    );
  };

  /* ── Loading ──────────────────────────────────────────────── */
  if (loading) {
    return (
      <PageLayout title="Pulse" showTitleBlock={false}>
        <Box sx={{ pt: 4 }}>
          <LinearProgress sx={{ borderRadius: 2 }} />
        </Box>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Pulse" subtitle="Autonomous agent scheduling" showTitleBlock={false}>
      <Box>
        <MetricsStrip
          pageKey="pulse"
          cards={statCards}
          showToggle={!embedded}
          showMetrics={embedded ? showMetrics : undefined}
        />

        {/* ── Toolbar ────────────────────────────────────────────── */}
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
          {/* Category button */}
          {(() => {
            const categories = [
              { id: 'timeline', label: 'Timeline', icon: ScheduleOutlinedIcon },
              { id: 'cycles', label: 'Cycle History', icon: LoopIcon },
              { id: 'agents', label: 'Agents', icon: SmartToyOutlinedIcon },
              { id: 'schedules', label: 'Scheduled', icon: EventRepeatOutlinedIcon },
            ];
            const active = categories.find((c) => c.id === tab) || categories[0];
            return (
              <>
                <Tooltip title="Category" placement="bottom" arrow>
                  <Button
                    onClick={(e) => setCategoryAnchor(e.currentTarget)}
                    startIcon={
                      <AppIcon
                        name="CategoryOutlined"
                        fallback={CategoryOutlinedIcon}
                        sx={{ fontSize: 18 }}
                      />
                    }
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: { xs: '0.72rem', sm: '0.85rem' },
                      px: { xs: 1.25, sm: 2 },
                      minHeight: 40,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      color: 'primary.main',
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    {active.label}
                  </Button>
                </Tooltip>
                <Menu
                  anchorEl={categoryAnchor}
                  open={Boolean(categoryAnchor)}
                  onClose={() => setCategoryAnchor(null)}
                  slotProps={{ paper: { sx: { mt: 1, minWidth: 220, borderRadius: 2 } } }}
                >
                  {categories.map((c) => {
                    const Icon = c.icon;
                    const selected = c.id === tab;
                    return (
                      <MenuItem
                        key={c.id}
                        selected={selected}
                        onClick={() => {
                          setTab(c.id);
                          setCategoryAnchor(null);
                        }}
                        sx={{
                          gap: 1,
                          '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                          '&.Mui-selected:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.14),
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{ minWidth: 28, color: selected ? 'primary.main' : 'text.secondary' }}
                        >
                          <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={c.label}
                          primaryTypographyProps={{
                            fontWeight: selected ? 700 : 500,
                            color: selected ? 'primary.main' : 'text.primary',
                            fontSize: '0.85rem',
                          }}
                        />
                      </MenuItem>
                    );
                  })}
                </Menu>
              </>
            );
          })()}

          <Tooltip title="Filters" placement="bottom" arrow>
            <IconButton
              onClick={(e) => setFilterAnchorEl(e.currentTarget)}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: hasActiveFilters ? 'primary.main' : 'divider',
                borderRadius: 2,
                position: 'relative',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              <AppIcon
                name="Tune"
                fallback={TuneIcon}
                sx={{ fontSize: 20, color: hasActiveFilters ? 'primary.main' : 'text.secondary' }}
              />
              {hasActiveFilters && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'error.main',
                  }}
                />
              )}
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
            <ToggleButton value="card">
              <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
            <ToggleButton value="list">
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title="Activity Log" placement="bottom" arrow>
            <IconButton
              onClick={openActivityLog}
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
              aria-label="Activity Log"
            >
              <AppIcon
                name="History"
                fallback={HistoryIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>

          <Box sx={{ flex: 1 }} />

          <Button
            onClick={() => setCreateOpen(true)}
            variant="outlined"
            size="small"
            startIcon={<AppIcon name="Add" fallback={AddIcon} />}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            New Pulse
          </Button>
        </Box>

        {/* ── Filter Popover ─────────────────────────────────────── */}
        <Popover
          open={Boolean(filterAnchorEl)}
          anchorEl={filterAnchorEl}
          onClose={() => setFilterAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { p: 2, borderRadius: 2.5, minWidth: 260 } } }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.82rem' }}>
            Filters
          </Typography>
          <Stack spacing={1.5}>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.78rem' }}>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ fontSize: '0.78rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="keep">Keep</MenuItem>
                <MenuItem value="discard">Discard</MenuItem>
                <MenuItem value="crash">Crash</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.78rem' }}>Mode</InputLabel>
              <Select
                value={modeFilter}
                label="Mode"
                onChange={(e) => setModeFilter(e.target.value)}
                sx={{ fontSize: '0.78rem' }}
              >
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="lite">Lite</MenuItem>
                <MenuItem value="full">Full</MenuItem>
              </Select>
            </FormControl>
            {hasActiveFilters && (
              <Button
                size="small"
                onClick={() => {
                  setStatusFilter('All');
                  setModeFilter('All');
                }}
                sx={{ fontSize: '0.72rem', textTransform: 'none' }}
              >
                Clear filters
              </Button>
            )}
          </Stack>
        </Popover>

        {/* ── Timeline Tab ───────────────────────────────────────── */}
        {tab === 'timeline' && (
          <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            <PulseTimeline agents={filteredAgents} cycles={cycles} />
          </Box>
        )}

        {/* ── Cycle History Tab ───────────────────────────────────── */}
        {tab === 'cycles' && (
          <Box sx={{ p: { xs: 1, sm: 1.5 } }}>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {[
                      'Cycle #',
                      'Agent',
                      'Score',
                      'Status',
                      'Mode',
                      'Description',
                      'Cost',
                      'Time',
                    ].map((h) => (
                      <TableCell
                        key={h}
                        sx={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: 'text.secondary',
                          bgcolor: alpha(theme.palette.background.default, 0.95),
                          py: 0.75,
                        }}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredCycles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.72rem', color: 'text.disabled' }}
                        >
                          No pulse cycles recorded yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    cyclesPagination.paginatedData.map((c, idx) => {
                      const agent = agents.find((a) => a.id === c.agent_id);
                      return (
                        <TableRow
                          key={c.id || idx}
                          hover
                          sx={{ '&:last-child td': { borderBottom: 0 } }}
                        >
                          <TableCell sx={{ fontSize: '0.72rem', fontWeight: 600, py: 0.75 }}>
                            {c.cycle_number ?? '--'}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.75 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AppIcon
                                name="SmartToyOutlined"
                                fallback={SmartToyOutlinedIcon}
                                sx={{ fontSize: 14, color: 'text.secondary' }}
                              />
                              {agent?.name || c.agent_id?.slice(0, 8)}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, py: 0.75 }}>
                            {c.quality_score ?? '--'}
                          </TableCell>
                          <TableCell sx={{ py: 0.75 }}>{statusChip(c.status)}</TableCell>
                          <TableCell sx={{ py: 0.75 }}>
                            <Chip
                              size="small"
                              label={agent?.pulse_mode === 'full' ? 'Full' : 'Lite'}
                              variant="outlined"
                              sx={{ fontSize: '0.58rem', height: 18, fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.68rem',
                              color: 'text.secondary',
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              py: 0.75,
                            }}
                          >
                            {c.description || c.result_summary?.slice(0, 60) || '--'}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.65rem',
                              color: 'text.disabled',
                              py: 0.75,
                              fontFamily: 'monospace',
                            }}
                          >
                            ${(parseFloat(c.cost_usd) || 0).toFixed(4)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.65rem', color: 'text.disabled', py: 0.75 }}>
                            {formatTimestamp(c.created_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Pagination
              count={cyclesPagination.totalCount}
              page={cyclesPagination.page}
              rowsPerPage={cyclesPagination.rowsPerPage}
              rowsPerPageOptions={cyclesPagination.rowsPerPageOptions}
              onPageChange={cyclesPagination.setPage}
              onRowsPerPageChange={cyclesPagination.setRowsPerPage}
              onLoadAll={cyclesPagination.loadAll}
              onCollapseAll={cyclesPagination.collapseAll}
              allMode={cyclesPagination.allMode}
              label="cycles"
            />
          </Box>
        )}

        {/* ── Agents Tab (card / list view) ───────────────────────── */}
        {tab === 'agents' && (
          <Box sx={{ p: { xs: 1, sm: 1.5 } }}>
            {filteredAgents.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography variant="caption" sx={{ fontSize: '0.78rem', color: 'text.disabled' }}>
                  No pulse-enabled agents yet. Enable Pulse on an agent to get started.
                </Typography>
              </Box>
            ) : viewMode === 'card' ? (
              /* ── Card View ──────────────────────────────────────── */
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.25,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                }}
              >
                {filteredAgents.map((a) => {
                  const agentCycles = cycles.filter((c) => c.agent_id === a.id);
                  const keptCount = agentCycles.filter((c) => c.status === 'keep').length;
                  const rate =
                    agentCycles.length > 0 ? Math.round((keptCount / agentCycles.length) * 100) : 0;
                  return (
                    <Paper
                      key={a.id}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: 2.5,
                        border: '1px solid',
                        borderColor: alpha(theme.palette.primary.main, 0.15),
                        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        '&:hover': {
                          borderColor: alpha(theme.palette.primary.main, 0.35),
                          transform: 'translateY(-1px)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Box
                          sx={{
                            width: 30,
                            height: 30,
                            borderRadius: 1.5,
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <AppIcon
                            name="SmartToyOutlined"
                            fallback={SmartToyOutlinedIcon}
                            sx={{ fontSize: 16, color: theme.palette.primary.main }}
                          />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.2 }}
                            noWrap
                          >
                            {a.name || 'Agent'}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.62rem' }}
                          >
                            Every {intervalLabel(a.check_in_interval_ms)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <Chip
                            size="small"
                            label={a.pulse_mode === 'full' ? 'Full' : 'Lite'}
                            variant="outlined"
                            color={a.pulse_mode === 'full' ? 'primary' : 'default'}
                            sx={{ fontSize: '0.55rem', height: 18, fontWeight: 700 }}
                          />
                          {a.autonomous_enabled && (
                            <Chip
                              size="small"
                              label="Auto"
                              variant="outlined"
                              color="info"
                              sx={{ fontSize: '0.55rem', height: 18, fontWeight: 700 }}
                            />
                          )}
                        </Stack>
                      </Box>
                      {a.pulse_task_focus && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.66rem',
                            color: 'text.secondary',
                            display: 'block',
                            mb: 0.75,
                          }}
                          noWrap
                        >
                          {a.pulse_task_focus}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.54rem', color: 'text.disabled', fontWeight: 600 }}
                          >
                            Cycles
                          </Typography>
                          <Typography sx={{ fontSize: '0.88rem', fontWeight: 800 }}>
                            {a.pulse_cycle_count || 0}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.54rem', color: 'text.disabled', fontWeight: 600 }}
                          >
                            Keep Rate
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '0.88rem',
                              fontWeight: 800,
                              color:
                                rate >= 70
                                  ? 'success.main'
                                  : rate >= 40
                                    ? 'warning.main'
                                    : 'error.main',
                            }}
                          >
                            {rate}%
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.54rem', color: 'text.disabled', fontWeight: 600 }}
                          >
                            Best Score
                          </Typography>
                          <Typography sx={{ fontSize: '0.88rem', fontWeight: 800 }}>
                            {a.pulse_best_score ?? '--'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.54rem', color: 'text.disabled', fontWeight: 600 }}
                          >
                            Next
                          </Typography>
                          <Typography
                            sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.secondary' }}
                          >
                            {a.next_pulse_at
                              ? new Date(a.next_pulse_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '--'}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            ) : (
              /* ── List View ──────────────────────────────────────── */
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        'Agent',
                        'Interval',
                        'Mode',
                        'Task Focus',
                        'Cycles',
                        'Keep Rate',
                        'Best Score',
                        'Next Pulse',
                      ].map((h) => (
                        <TableCell
                          key={h}
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'text.secondary',
                            py: 0.75,
                          }}
                        >
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredAgents.map((a) => {
                      const agentCycles = cycles.filter((c) => c.agent_id === a.id);
                      const keptCount = agentCycles.filter((c) => c.status === 'keep').length;
                      const rate =
                        agentCycles.length > 0
                          ? Math.round((keptCount / agentCycles.length) * 100)
                          : 0;
                      return (
                        <TableRow key={a.id} hover>
                          <TableCell sx={{ fontSize: '0.72rem', fontWeight: 600, py: 0.75 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <AppIcon
                                name="SmartToyOutlined"
                                fallback={SmartToyOutlinedIcon}
                                sx={{ fontSize: 14, color: 'text.secondary' }}
                              />
                              {a.name || 'Agent'}
                              {a.autonomous_enabled && (
                                <Chip
                                  size="small"
                                  label="Auto"
                                  variant="outlined"
                                  color="info"
                                  sx={{ fontSize: '0.5rem', height: 16, ml: 0.5 }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.75 }}>
                            {intervalLabel(a.check_in_interval_ms)}
                          </TableCell>
                          <TableCell sx={{ py: 0.75 }}>
                            <Chip
                              size="small"
                              label={a.pulse_mode === 'full' ? 'Full' : 'Lite'}
                              variant="outlined"
                              color={a.pulse_mode === 'full' ? 'primary' : 'default'}
                              sx={{ fontSize: '0.58rem', height: 18 }}
                            />
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.68rem',
                              color: 'text.secondary',
                              maxWidth: 180,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              py: 0.75,
                            }}
                          >
                            {a.pulse_task_focus || '--'}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, py: 0.75 }}>
                            {a.pulse_cycle_count || 0}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              py: 0.75,
                              color:
                                rate >= 70
                                  ? 'success.main'
                                  : rate >= 40
                                    ? 'warning.main'
                                    : 'text.primary',
                            }}
                          >
                            {rate}%
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', fontWeight: 700, py: 0.75 }}>
                            {a.pulse_best_score ?? '--'}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.65rem', color: 'text.disabled', py: 0.75 }}>
                            {a.next_pulse_at
                              ? new Date(a.next_pulse_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '--'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* ── Scheduled Tab (user-created pulses) ─────────────────── */}
        {tab === 'schedules' && (
          <Box sx={{ p: { xs: 1, sm: 1.5 } }}>
            {schedules.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <AppIcon
                  name="EventRepeatOutlined"
                  fallback={EventRepeatOutlinedIcon}
                  sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }}
                />
                <Typography
                  variant="body2"
                  sx={{ color: 'text.disabled', fontSize: '0.82rem', mb: 2 }}
                >
                  No scheduled pulses yet. Create one to run an instruction on a schedule.
                </Typography>
                <Button
                  onClick={() => setCreateOpen(true)}
                  variant="outlined"
                  startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 18 }} />}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  New Pulse
                </Button>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {[
                        'Owner',
                        'Instruction',
                        'Instrument',
                        'Schedule',
                        'Next Due',
                        'Enabled',
                        '',
                      ].map((h) => (
                        <TableCell
                          key={h}
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'text.secondary',
                            py: 0.75,
                          }}
                        >
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schedules.map((s) => {
                      const m = s.metadata || {};
                      const summary = summarizeEntries(m);
                      return (
                        <TableRow key={s.id} hover>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.75 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }} noWrap>
                                {m.owner_name || '--'}
                              </Typography>
                              <Typography
                                sx={{
                                  fontSize: '0.6rem',
                                  color: 'text.disabled',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {[m.owner_type, m.created_by_name].filter(Boolean).join(' · ') ||
                                  ''}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.7rem',
                              color: 'text.secondary',
                              maxWidth: 240,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              py: 0.75,
                            }}
                          >
                            {summary.firstPrompt || '--'}
                            {summary.count > 1 ? ` (+${summary.count - 1} more)` : ''}
                          </TableCell>
                          <TableCell sx={{ py: 0.75 }}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {(summary.instrumentSlugs.length
                                ? summary.instrumentSlugs
                                : ['--']
                              ).map((slug, i) => (
                                <Chip
                                  key={i}
                                  size="small"
                                  label={slug}
                                  variant="outlined"
                                  sx={{ fontSize: '0.58rem', height: 18, fontWeight: 600 }}
                                />
                              ))}
                            </Box>
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.68rem',
                              color: 'text.secondary',
                              py: 0.75,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {describeSchedule(m)}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontSize: '0.65rem',
                              color: 'text.disabled',
                              py: 0.75,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatTimestamp(s.next_due_at)}
                          </TableCell>
                          <TableCell sx={{ py: 0.75 }}>
                            <Switch
                              size="small"
                              checked={!!s.enabled}
                              onChange={(e) => handleToggleSchedule(s.id, e.target.checked)}
                            />
                          </TableCell>
                          <TableCell sx={{ py: 0.75 }}>
                            <Tooltip title="Delete" arrow>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteSchedule(s.id)}
                                sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                              >
                                <AppIcon
                                  name="DeleteOutline"
                                  fallback={DeleteOutlineIcon}
                                  sx={{ fontSize: 17 }}
                                />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Box>
      <CreatePulseDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchSchedules}
      />
      {/* ===== Activity Log Dialog ===== */}
      <FormDialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        title="Pulse Activity"
        subtitle="Autonomous scheduling history"
        icon={HistoryIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '80vh' }}
        contentDividers={false}
        contentSx={{ p: 0 }}
        actions={
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ flex: 1 }}
            >{`${activityLogs.length} log entr${activityLogs.length !== 1 ? 'ies' : 'y'}`}</Typography>
            <Button
              onClick={closeActivityLog}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Close
            </Button>
          </>
        }
        footerJustify="flex-start"
      >
        <Tabs
          value={0}
          sx={{
            px: 3,
            minHeight: 40,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
            },
          }}
        >
          <Tab
            icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Action Log (${activityLogs.length})`}
          />
        </Tabs>
        {activityLogsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading...
            </Typography>
          </Box>
        ) : activityLogs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
            <AppIcon
              name="History"
              fallback={HistoryIcon}
              sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
              No pulse actions recorded yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Starting, stopping, and running pulses will appear here.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Action', 'User', 'IP Address', 'Date & Time', 'Details'].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.95) : 'grey.50',
                        borderBottom: '2px solid',
                        borderColor: 'divider',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {activityLogs.map((log) => (
                  <TableRow key={log.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ py: 1.25 }}>
                      <Chip
                        label={log.action}
                        size="small"
                        color={getLogActionColor(log.action)}
                        sx={{ fontWeight: 700, fontSize: '0.68rem', borderRadius: 1.5, height: 24 }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                        {getUserFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          fontFamily: 'monospace',
                          color: 'text.secondary',
                        }}
                      >
                        {getIpFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                      >
                        {formatLogDateTime(log.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          color: 'text.primary',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {log.details || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </FormDialog>
    </PageLayout>
  );
}
