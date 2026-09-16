/**
 * EvaluationDetail — Detailed evaluation view with member responses and consensus breakdown.
 */
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  alpha,
} from '@mui/material';
import EmptyState from '../Common/EmptyState';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import { supabase, hasSupabase } from '../../lib/supabase';

const DECISION_COLORS = {
  LOW: { bg: '#D1FAE5', color: '#059669' },
  MEDIUM: { bg: '#DBEAFE', color: '#2563EB' },
  HIGH: { bg: '#FEF3C7', color: '#D97706' },
  CRITICAL: { bg: '#FEE2E2', color: '#DC2626' },
};

export default function EvaluationDetail({ theme, isDark }) {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!hasSupabase()) {
        setLoading(false);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data } = await supabase
          .from('concilium_evaluations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setEvaluations(data || []);
      } catch (e) {
        console.warn('[EvaluationDetail] load failed:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
        Recent Evaluations
      </Typography>

      {evaluations.length === 0 ? (
        <EmptyState
          icon={AssessmentOutlinedIcon}
          title="No evaluations yet"
          description="Evaluations will appear here once boards process agent output."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {evaluations.map((ev) => {
            const dc = DECISION_COLORS[ev.decision_level] || DECISION_COLORS.LOW;
            const memberResponses = ev.member_responses || [];
            return (
              <Paper key={ev.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Score: {ev.overall_score}
                  </Typography>
                  <Chip
                    label={ev.approved ? 'Approved' : 'Rejected'}
                    size="small"
                    color={ev.approved ? 'success' : 'error'}
                    sx={{ height: 22, fontWeight: 600, fontSize: '0.65rem' }}
                  />
                  {ev.decision_level && (
                    <Chip
                      label={ev.decision_level}
                      size="small"
                      sx={{
                        height: 22,
                        fontWeight: 600,
                        fontSize: '0.65rem',
                        bgcolor: dc.bg,
                        color: dc.color,
                      }}
                    />
                  )}
                  {ev.consensus_type && (
                    <Chip
                      label={ev.consensus_type}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.65rem' }}
                    />
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                  >
                    {ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}
                  </Typography>
                </Box>
                {ev.summary && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
                  >
                    {ev.summary}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Provider: {ev.provider || '—'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Model: {ev.model || '—'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Cost: $
                    {Number.parseFloat(ev.estimated_cost_usd || ev.total_cost_usd || 0).toFixed(4)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Duration: {ev.duration_ms || '—'}ms
                  </Typography>
                </Box>
                {memberResponses.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}
                    >
                      Member Responses ({memberResponses.length})
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem' }}>Member</TableCell>
                          <TableCell
                            sx={{ fontWeight: 600, fontSize: '0.7rem', textAlign: 'center' }}
                          >
                            Score
                          </TableCell>
                          <TableCell
                            sx={{ fontWeight: 600, fontSize: '0.7rem', textAlign: 'center' }}
                          >
                            Approved
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
                            Summary
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {memberResponses.map((mr, idx) => (
                          <TableRow key={mr.memberId || idx}>
                            <TableCell>
                              <Typography variant="caption">
                                {mr.memberName || mr.memberId?.slice(0, 8)}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                {mr.overallScore ?? '—'}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={mr.approved ? 'Y' : 'N'}
                                size="small"
                                color={mr.approved ? 'success' : 'error'}
                                sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {(mr.summary || '').slice(0, 80)}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
