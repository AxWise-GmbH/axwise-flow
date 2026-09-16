/**
 * SecurityEventsPanel — Security event feed with severity badges.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
} from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import EmptyState from '../Common/EmptyState';
import { supabase, hasSupabase } from '../../lib/supabase';

const SEVERITY_COLORS = {
  low: { bg: '#F1F5F9', color: '#64748B' },
  medium: { bg: '#FEF3C7', color: '#D97706' },
  high: { bg: '#FED7AA', color: '#EA580C' },
  critical: { bg: '#FEE2E2', color: '#DC2626' },
};

export default function SecurityEventsPanel({ theme, isDark }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasSupabase()) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data, error: qErr } = await supabase
          .from('concilium_security_events')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (qErr) throw qErr;
        if (!cancelled) setEvents(data || []);
      } catch (e) {
        console.error('[SecurityEventsPanel] load failed:', e);
        if (!cancelled) setError(e.message || 'Failed to load security events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Security Events
        </Typography>
        <Chip label={`${events.length} events`} size="small" sx={{ fontWeight: 600 }} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          Couldn't load security events: {error}
        </Alert>
      )}

      {error ? null : events.length === 0 ? (
        <EmptyState
          icon={ShieldOutlinedIcon}
          title="No security events"
          description="Events appear when the security scanner flags input/output on board evaluations. Run an evaluation from a goal or job to generate activity."
        />
      ) : (
        <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)', overflowX: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Action Taken</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((ev) => {
                const sc = SEVERITY_COLORS[ev.severity] || SEVERITY_COLORS.low;
                return (
                  <TableRow key={ev.id} hover>
                    <TableCell>
                      <Chip
                        label={ev.severity}
                        size="small"
                        sx={{
                          height: 22,
                          fontWeight: 700,
                          fontSize: '0.65rem',
                          textTransform: 'uppercase',
                          bgcolor: sc.bg,
                          color: sc.color,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {ev.event_type?.replace(/_/g, ' ')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {ev.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{ev.auto_action_taken || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
