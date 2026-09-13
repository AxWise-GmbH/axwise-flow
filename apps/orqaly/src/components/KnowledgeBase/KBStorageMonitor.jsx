/**
 * KBStorageMonitor - real-data cloud-storage dashboard under Sources.
 * Simple by default (storage rings, status, overview + one storage-over-time
 * chart); an "Advanced" toggle reveals the technical layer (latency, exact
 * bytes, error log, activity timeline). No live-transfer/speed metrics - those
 * are unmeasurable here, and the footer says so rather than faking numbers.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Stack,
  Typography,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
  LinearProgress,
  Chip,
  CircularProgress,
  Button,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from 'recharts';

import { getMonitor, getHistory, recordSnapshot } from '../../services/storageMonitorService';
import { SOURCE_BY_TYPE } from './KBSourcesPanel';

const POLL_MS = 15000;
const STATUS_META = {
  online: { label: 'Online', color: 'success.main' },
  syncing: { label: 'Syncing', color: 'info.main' },
  needs_attention: { label: 'Needs attention', color: 'warning.main' },
  offline: { label: 'Offline', color: 'text.disabled' },
};

function formatBytes(n) {
  if (n == null) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

function whenText(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function Glyph({ type, size = 18 }) {
  const s = SOURCE_BY_TYPE[type];
  if (!s) return null;
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      role="img"
      aria-label={s.label}
      sx={{ width: size, height: size, color: s.glyphColor, display: 'block' }}
    >
      <path d={s.glyph.path} fill="currentColor" />
    </Box>
  );
}

function StatusDot({ status }) {
  const meta = STATUS_META[status] || STATUS_META.offline;
  return (
    <Tooltip title={meta.label}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: meta.color, flexShrink: 0 }} />
    </Tooltip>
  );
}

function Tile({ label, value, sub }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', minWidth: 120, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2 }}>{value}</Typography>
      {sub && (
        <Typography variant="caption" color="text.disabled">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function exportCsv(providers) {
  const cols = ['source_type', 'status', 'bytesUsed', 'bytesTotal', 'quotaPct', 'docsCount', 'latencyMs', 'lastSyncedAt', 'lastError'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [cols.join(',')].concat((providers || []).map((p) => cols.map((c) => esc(p[c])).join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'storage-monitor.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function KBStorageMonitor() {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advanced, setAdvanced] = useState(() => {
    try {
      return localStorage.getItem('kbMonitorAdvanced') === '1';
    } catch {
      return false;
    }
  });
  const mounted = useRef(false);

  const loadCurrent = useCallback(async () => {
    try {
      setData(await getMonitor());
    } catch {
      /* keep last */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await getHistory(30)).series || []);
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    let timer;
    (async () => {
      if (!mounted.current) {
        mounted.current = true;
        await recordSnapshot(); // one point on mount
      }
      await Promise.all([loadCurrent(), loadHistory()]);
      setLoading(false);
      timer = setInterval(loadCurrent, POLL_MS);
    })();
    return () => clearInterval(timer);
  }, [loadCurrent, loadHistory]);

  const toggleAdvanced = (v) => {
    setAdvanced(v);
    try {
      localStorage.setItem('kbMonitorAdvanced', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const overview = data?.overview || {};
  const providers = data?.providers || [];
  const errors = data?.errors || [];
  const activity = data?.activity || [];
  const chartData = history.map((d) => ({ date: (d.date || '').slice(5), used: Number(d.bytes_used || 0) }));

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Storage monitor
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live storage &amp; health across your connected sources.
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <FormControlLabel
            control={<Switch size="small" checked={advanced} onChange={(e) => toggleAdvanced(e.target.checked)} />}
            label={<Typography variant="body2">Advanced</Typography>}
          />
          <Tooltip title="Export CSV">
            <IconButton size="small" onClick={() => exportCsv(providers)}>
              <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadCurrent}>
              <RefreshOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Overview */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
        <Tile label="Connected" value={overview.connected ?? 0} sub={`${overview.online ?? 0} online`} />
        <Tile label="Storage used" value={formatBytes(overview.totalBytesUsed)} sub={overview.totalBytesTotal ? `of ${formatBytes(overview.totalBytesTotal)}` : 'across providers'} />
        <Tile label="Documents" value={overview.totalDocs ?? 0} />
        <Tile label="Auto-sync jobs" value={overview.activeSyncJobs ?? 0} />
        <Tile label="Needs attention" value={overview.needsAttention ?? 0} sub={`${overview.offline ?? 0} offline`} />
      </Stack>

      {/* Storage over time */}
      <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Storage used over time
        </Typography>
        <Box sx={{ height: 160, mt: 1 }}>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="usedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatBytes(v)} width={64} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v) => formatBytes(v)} />
                <Area type="monotone" dataKey="used" stroke={theme.palette.primary.main} fill="url(#usedFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="caption" color="text.disabled">
                Trend appears after the first snapshot (sync or the daily snapshot job).
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Provider cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
        {providers.map((p) => (
          <Box key={p.id} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Glyph type={p.source_type} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>{p.label}</Typography>
              <StatusDot status={p.status} />
            </Stack>

            {p.bytesTotal ? (
              <>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(p.quotaPct || 0, 100)}
                  color={p.quotaPct >= 90 ? 'warning' : 'primary'}
                  sx={{ height: 8, borderRadius: 4, mb: 0.5 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {formatBytes(p.bytesUsed)} / {formatBytes(p.bytesTotal)} ({p.quotaPct ?? 0}%)
                </Typography>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {p.bytesUsed != null ? `${formatBytes(p.bytesUsed)} used` : `${p.docsCount} documents`}
              </Typography>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
              <Chip size="small" variant="outlined" label={`${p.docsCount} docs`} />
              <Chip size="small" variant="outlined" label={`synced ${p.lastSyncedAt ? whenText(p.lastSyncedAt).split(',')[0] : '—'}`} />
            </Stack>

            {advanced && (
              <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>
                  Latency: {p.latencyMs != null ? `${p.latencyMs} ms` : '—'} · Auth: {p.authStatus} · Mode: {p.mode}
                </Typography>
                {p.lastError && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'error.main' }}>
                    {p.lastError}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        ))}
        {!providers.length && (
          <Typography variant="body2" color="text.secondary">
            No connected sources yet - connect one in the Connections tab.
          </Typography>
        )}
      </Box>

      {/* Advanced: errors + activity */}
      {advanced && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 1.5 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Error log
          </Typography>
          {errors.length ? (
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              {errors.map((e, i) => (
                <Typography key={i} variant="caption" sx={{ color: 'error.main' }}>
                  {e.label}: {e.error}
                </Typography>
              ))}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
              No errors.
            </Typography>
          )}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Activity
          </Typography>
          <Stack spacing={0.5}>
            {activity.slice(0, 15).map((a, i) => (
              <Typography key={i} variant="caption" color="text.secondary">
                {whenText(a.created_at)} · {String(a.action || '').replace(/_/g, ' ').toLowerCase()}
              </Typography>
            ))}
            {!activity.length && (
              <Typography variant="caption" color="text.disabled">
                No recent activity.
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
        Live transfer speed &amp; bandwidth need a desktop sync agent and are not tracked here - all figures above are real
        provider data.
      </Typography>
    </Box>
  );
}
