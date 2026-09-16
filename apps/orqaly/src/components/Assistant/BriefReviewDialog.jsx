import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Button,
  Chip,
  Divider,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FormatQuoteRoundedIcon from '@mui/icons-material/FormatQuoteRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { getCompanyBrief } from '../../services/companyBriefService';

import AppIcon from '../icons/AppIcon';

const STATUS_LABEL = { complete: 'Complete', in_progress: 'In progress', empty: 'Not started' };

/** Normalize one answer row (server shapes vary) to { question, answer }. */
function normalizeAnswer(a, i) {
  return {
    key: a.id || a.questionId || a.question_id || i,
    question: a.question || a.question_text || a.text || a.prompt || `Question ${i + 1}`,
    answer: a.answer || a.response || a.value || '',
  };
}

/**
 * Read-only Company Brief viewer. Opened by the "Review" action on the Assistant
 * Console's Company Brief strip. Loads the saved brief + answers; the "Change"
 * action hands off to the interview (handled by the parent). The interview UI
 * itself is untouched.
 */
export default function BriefReviewDialog({ open, onClose, onChange, fallbackBrief = null }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState(fallbackBrief);
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    setBrief(fallbackBrief);
    setAnswers([]);
    getCompanyBrief()
      .then((data) => {
        if (!active) return;
        const b = data?.brief || data || null;
        setBrief(b ? { ...fallbackBrief, ...b } : fallbackBrief);
        setAnswers(
          Array.isArray(data?.answers) ? data.answers : Array.isArray(b?.answers) ? b.answers : []
        );
      })
      .catch(() => {
        /* keep fallbackBrief; surface a gentle empty state below */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, fallbackBrief]);

  const status = brief?.status || 'empty';
  const isComplete = status === 'complete';
  const summary = brief?.summary || '';
  const rows = answers.map(normalizeAnswer).filter((r) => r.question || r.answer);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '88vh' } }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          fontWeight: 800,
          fontSize: '1.05rem',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon name="QuizRounded" fallback={QuizRoundedIcon} fontSize="small" /> Company Brief
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close brief">
          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            size="small"
            icon={
              isComplete ? (
                <AppIcon name="CheckCircleRounded" fallback={CheckCircleRoundedIcon} />
              ) : undefined
            }
            label={STATUS_LABEL[status] || status}
            color={isComplete ? 'success' : 'default'}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
          <Typography variant="caption" color="text.secondary">
            {rows.length} {rows.length === 1 ? 'answer' : 'answers'}
          </Typography>
        </Box>

        {summary && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <AppIcon
              name="FormatQuoteRounded"
              fallback={FormatQuoteRoundedIcon}
              sx={{ fontSize: 18, color: 'primary.main', opacity: 0.7 }}
            />
            <Typography variant="body2" sx={{ mt: 0.25 }}>
              {summary}
            </Typography>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : rows.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {rows.map((r, i) => (
              <Box key={r.key}>
                {i > 0 && <Divider sx={{ mb: 1.25 }} />}
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}
                >
                  {r.question}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {r.answer || (
                    <Box component="span" sx={{ color: 'text.disabled' }}>
                      No answer
                    </Box>
                  )}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : (
          !summary && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No brief yet. Run the interview to build your company brief.
            </Typography>
          )
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700 }}>
          Close
        </Button>
        <Button
          onClick={onChange}
          variant="contained"
          startIcon={<AppIcon name="EditOutlined" fallback={EditOutlinedIcon} />}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Change answers
        </Button>
      </DialogActions>
    </Dialog>
  );
}
