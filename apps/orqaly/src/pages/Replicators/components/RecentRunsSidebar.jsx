import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  IconButton,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import { supabase, hasSupabase } from '../../../lib/supabase';

import AppIcon from '../../../components/icons/AppIcon';

const STATUS_COLORS = {
  success: 'success',
  error: 'error',
  timeout: 'warning',
  cancelled: 'default',
  pending: 'info',
};

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function RecentRunsSidebar({ phases, onRehydrate, onClose, refreshKey = 0 }) {
  const theme = useTheme();
  const [runs, setRuns] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const phaseIds = useMemo(() => phases.map((p) => p.id), [phases]);
  const phaseMap = useMemo(() => {
    const map = new Map();
    for (const p of phases) map.set(p.id, p);
    return map;
  }, [phases]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!phaseIds.length || !hasSupabase()) {
        setRuns([]);
        setLoaded(true);
        return;
      }
      setLoaded(false);
      setError(null);
      const { data, error: queryError } = await supabase
        .from('replicator_runs')
        .select(
          'id, phase_id, status, error_class, error_message, http_status, latency_ms, input_json, created_at'
        )
        .in('phase_id', phaseIds)
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (queryError) {
        setError(queryError);
        setRuns([]);
      } else {
        setRuns(data || []);
      }
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [phaseIds, refreshKey]);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        borderColor: alpha(theme.palette.divider, 0.6),
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <AppIcon name="History" fallback={HistoryIcon} fontSize="small" />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          Recent runs
        </Typography>
        <IconButton size="small" onClick={() => setLoaded(false) || null}>
          <AppIcon name="Refresh" fallback={RefreshIcon} fontSize="small" />
        </IconButton>
        {onClose ? (
          <IconButton size="small" onClick={onClose}>
            <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
          </IconButton>
        ) : null}
      </Stack>
      {error ? (
        <Typography variant="caption" color="error.main">
          {error.message}
        </Typography>
      ) : null}
      {!loaded ? (
        <Typography variant="caption" color="text.secondary">
          Loading…
        </Typography>
      ) : runs.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No runs yet. Execute a phase to see history here.
        </Typography>
      ) : (
        <Stack spacing={0.75} sx={{ overflow: 'auto', flex: 1 }}>
          {runs.map((r) => {
            const phase = phaseMap.get(r.phase_id);
            const color = STATUS_COLORS[r.status] || 'default';
            return (
              <Button
                key={r.id}
                variant="text"
                size="small"
                color="inherit"
                onClick={() => onRehydrate?.({ phaseId: r.phase_id, input: r.input_json || {} })}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  alignItems: 'flex-start',
                  p: 0.75,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.5),
                  borderRadius: 1,
                  display: 'block',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ width: '100%' }}>
                  <Chip
                    size="small"
                    label={r.status}
                    color={color === 'default' ? undefined : color}
                    variant={color === 'default' ? 'outlined' : 'filled'}
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                  <Typography variant="caption" sx={{ flex: 1 }} noWrap>
                    {phase?.name || 'Unknown phase'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.latency_ms != null ? `${r.latency_ms}ms` : '-'}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {formatRelative(r.created_at)}
                  {r.http_status ? ` · ${r.http_status}` : ''}
                  {r.error_class ? ` · ${r.error_class}` : ''}
                </Typography>
              </Button>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
