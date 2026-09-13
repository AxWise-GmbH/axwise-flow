/**
 * FeedbackPanel — Evaluation feedback (correct/incorrect, false positive/negative).
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
  Rating,
} from '@mui/material';
import EmptyState from '../Common/EmptyState';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import { supabase, hasSupabase } from '../../lib/supabase';

export default function FeedbackPanel({ theme, isDark }) {
  const [feedback, setFeedback] = useState([]);
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
          .from('concilium_feedback')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        setFeedback(data || []);
      } catch (e) {
        console.warn('[FeedbackPanel] load failed:', e);
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
        Evaluation Feedback
      </Typography>

      {feedback.length === 0 ? (
        <EmptyState
          icon={AssessmentOutlinedIcon}
          title="No feedback yet"
          description="Submit feedback on evaluations to improve board accuracy."
        />
      ) : (
        <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)', overflowX: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Evaluation</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Correct?</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>False+</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>False-</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Rating</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {feedback.map((f) => (
                <TableRow key={f.id} hover>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {f.evaluation_id?.slice(0, 12)}...
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={f.was_board_correct ? 'Yes' : 'No'}
                      size="small"
                      color={f.was_board_correct ? 'success' : 'error'}
                      sx={{ height: 20, fontWeight: 600, fontSize: '0.6rem' }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {f.false_positive ? (
                      <Chip
                        label="FP"
                        size="small"
                        color="warning"
                        sx={{ height: 18, fontSize: '0.6rem' }}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {f.false_negative ? (
                      <Chip
                        label="FN"
                        size="small"
                        color="error"
                        sx={{ height: 18, fontSize: '0.6rem' }}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Rating value={f.quality_rating || 0} readOnly size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {f.user_notes || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
