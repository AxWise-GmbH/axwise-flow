/**
 * [module: design-system + connection-hub + agent-core]
 * ScheduledReportsTab - manage Pulse rows where action='scheduled-report'.
 * Browse, create (preset cron + report type), pause/resume, run-now, delete.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Snackbar,
  useTheme,
  alpha,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  getScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow,
  scheduleCronPresets,
} from '../../../services/communicatorService';
import PaneStatusStrip from '../components/PaneStatusStrip';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import FormDialog from '../../../components/Common/FormDialog';

import AppIcon from '../../../components/icons/AppIcon';

const REPORT_TYPES = [
  { value: 'executive', label: 'Executive summary' },
  { value: 'finance', label: 'Finance & growth' },
  { value: 'partner_perf', label: 'Partner performance' },
  { value: 'operations', label: 'Operations & tasks' },
];

export default function ScheduledReportsTab() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');

  async function reload() {
    setErr('');
    setRows(null);
    try {
      setRows(await getScheduledReports());
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(payload) {
    try {
      const row = await createScheduledReport(payload);
      setRows((cur) => [row, ...(cur || [])]);
      setToast('✓ Scheduled');
      setCreating(false);
    } catch (e) {
      setToast(`✕ ${e.message}`);
    }
  }

  async function togglePause(row) {
    try {
      await updateScheduledReport(row.id, { enabled: !row.enabled });
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)));
      setToast(row.enabled ? '⏸ Paused' : '▶ Resumed');
    } catch (e) {
      setToast(`✕ ${e.message}`);
    }
  }

  async function runNow(row) {
    try {
      await runScheduledReportNow(row.id);
      setToast('▶ Queued to run within ~30s');
    } catch (e) {
      setToast(`✕ ${e.message}`);
    }
  }

  async function remove(row) {
    if (!confirm(`Delete this scheduled report?`)) return;
    try {
      await deleteScheduledReport(row.id);
      setRows((cur) => cur.filter((r) => r.id !== row.id));
      setToast('✓ Deleted');
    } catch (e) {
      setToast(`✕ ${e.message}`);
    }
  }

  // Status strip stats
  const active = (rows || []).filter((r) => r.enabled).length;
  const paused = (rows || []).filter((r) => !r.enabled).length;
  const nextRun = (rows || [])
    .filter((r) => r.enabled && r.next_due_at)
    .sort((a, b) => new Date(a.next_due_at) - new Date(b.next_due_at))[0];
  const nextLabel = nextRun
    ? new Date(nextRun.next_due_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  return (
    <Box>
      <PaneStatusStrip
        stats={[
          { value: active, label: 'Active schedules', color: 'success', icon: PlayArrowIcon },
          {
            value: paused,
            label: 'Paused',
            color: paused > 0 ? 'warning' : 'neutral',
            icon: PauseIcon,
          },
          { value: nextLabel, label: 'Next run', color: 'primary', icon: EventOutlinedIcon },
        ]}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.92rem', flex: 1 }}>
          Scheduled reports
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={reload}>
            <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
          onClick={() => setCreating(true)}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          New schedule
        </Button>
      </Box>
      {err && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 1.5 }}>
          {err}
        </Alert>
      )}
      {rows === null && (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {rows?.length === 0 && <EmptyState onCreate={() => setCreating(true)} />}
      {rows?.length > 0 &&
        (isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((r) => (
              <ScheduleCard
                key={r.id}
                row={r}
                onToggle={() => togglePause(r)}
                onRun={() => runNow(r)}
                onDelete={() => remove(r)}
              />
            ))}
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Label</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Cron</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Next run</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Last run</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      {r.metadata?.label || '(unlabeled)'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={r.metadata?.report_type || 'executive'}
                        sx={{ height: 20, fontSize: '0.66rem' }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'text.secondary' }}
                    >
                      {r.cron_expr}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {fmtDate(r.next_due_at)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {fmtDate(r.last_fired_at)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.enabled ? 'Active' : 'Paused'}
                        color={r.enabled ? 'success' : 'default'}
                        variant={r.enabled ? 'filled' : 'outlined'}
                        sx={{ height: 20, fontSize: '0.66rem' }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Run now">
                        <IconButton size="small" onClick={() => runNow(r)}>
                          <AppIcon
                            name="PlayArrow"
                            fallback={PlayArrowIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={r.enabled ? 'Pause' : 'Resume'}>
                        <IconButton size="small" onClick={() => togglePause(r)}>
                          {r.enabled ? (
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
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => remove(r)}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ))}
      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreate={handleCreate} />
      <Snackbar
        open={!!toast}
        autoHideDuration={1800}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

function ScheduleCard({ row, onToggle, onRun, onDelete }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.84rem' }}>
            {row.metadata?.label || '(unlabeled)'}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: 'block',
              fontSize: '0.7rem',
              fontFamily: 'monospace',
            }}
          >
            {row.cron_expr} · {row.metadata?.report_type || 'executive'}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={row.enabled ? 'Active' : 'Paused'}
          color={row.enabled ? 'success' : 'default'}
          variant="outlined"
          sx={{ height: 20, fontSize: '0.66rem' }}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
        <IconButton size="small" onClick={onRun}>
          <AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={onToggle}>
          {row.enabled ? (
            <AppIcon name="Pause" fallback={PauseIcon} sx={{ fontSize: 16 }} />
          ) : (
            <AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 16 }} />
          )}
        </IconButton>
        <IconButton
          size="small"
          onClick={onDelete}
          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
        >
          <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Paper>
  );
}

function CreateDialog({ open, onClose, onCreate }) {
  const [reportType, setReportType] = useState('executive');
  const [cron, setCron] = useState('0 8 * * *');
  const [label, setLabel] = useState('Morning briefing');
  const presets = scheduleCronPresets();

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="New scheduled report"
      subtitle="Schedule automated report delivery"
      icon={EventRepeatOutlinedIcon}
      maxWidth="sm"
      primaryLabel="Schedule"
      onPrimary={() => onCreate({ reportType, cron, label })}
      primaryDisabled={!label || !cron}
      contentSx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      <TextField
        size="small"
        fullWidth
        label="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      <FormControl size="small" fullWidth>
        <InputLabel>Report type</InputLabel>
        <Select
          label="Report type"
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          sx={{ borderRadius: 2 }}
        >
          {REPORT_TYPES.map((t) => (
            <MenuItem key={t.value} value={t.value}>
              {t.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" fullWidth>
        <InputLabel>Schedule (preset)</InputLabel>
        <Select
          label="Schedule (preset)"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          sx={{ borderRadius: 2 }}
        >
          {presets.map((p) => (
            <MenuItem key={p.cron} value={p.cron}>
              {p.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        size="small"
        fullWidth
        label="Cron (advanced)"
        value={cron}
        onChange={(e) => setCron(e.target.value)}
        helperText="Standard 5-field cron. e.g. 0 8 * * * = daily at 08:00 UTC"
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace' } }}
      />
    </FormDialog>
  );
}

function EmptyState({ onCreate }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        py: 5,
        px: 2,
        textAlign: 'center',
        borderRadius: 3,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        border: '1px dashed',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          mx: 'auto',
          mb: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon
          name="EventRepeatOutlined"
          fallback={EventRepeatOutlinedIcon}
          sx={{ fontSize: 26 }}
        />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.92rem' }}>
        No scheduled reports yet
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          display: 'block',
          maxWidth: 380,
          mx: 'auto',
          mb: 2,
          fontSize: '0.78rem',
        }}
      >
        Schedule a daily, weekly, or monthly report. The bot will DM you a branded PDF on time, on
        schedule.
      </Typography>
      <Button
        variant="contained"
        size="small"
        startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
        onClick={onCreate}
        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
      >
        Create your first
      </Button>
    </Box>
  );
}

function fmtDate(s) {
  if (!s) return '-';
  return new Date(s).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
