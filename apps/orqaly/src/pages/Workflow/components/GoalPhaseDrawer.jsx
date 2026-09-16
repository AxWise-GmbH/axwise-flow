import { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Divider,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getPhaseOutputs } from '../../../services/goalService';

import AppIcon from '../../../components/icons/AppIcon';

const STATUS_COLORS = {
  pending: 'text.disabled',
  executing: 'primary.main',
  completed: 'success.main',
  failed: 'error.main',
};

export default function GoalPhaseDrawer({ open, onClose, goalId, goalData, phaseIndex }) {
  const theme = useTheme();
  const [outputs, setOutputs] = useState([]);
  const [loading, setLoading] = useState(false);

  const phases = goalData?.plan?.phases || [];
  const phase = phaseIndex != null ? phases[phaseIndex] : null;
  const phaseCosts = goalData?.data?.phase_costs?.[phaseIndex] || {};

  useEffect(() => {
    if (!open || !goalId || phaseIndex == null) return;
    setLoading(true);
    getPhaseOutputs(goalId, phaseIndex)
      .then((data) => setOutputs(Array.isArray(data) ? data : []))
      .catch(() => setOutputs([]))
      .finally(() => setLoading(false));
  }, [open, goalId, phaseIndex]);

  if (!phase) return null;

  const duration =
    phase.started_at && phase.completed_at
      ? Math.round((new Date(phase.completed_at) - new Date(phase.started_at)) / 60000)
      : null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 420, maxWidth: '90vw', p: 0 } } }}
    >
      {/* Header */}
      <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Phase {phaseIndex + 1}: {phase.name}
          </Typography>
          <Chip
            label={phase.status}
            size="small"
            sx={{
              mt: 0.5,
              height: 20,
              fontSize: '0.7rem',
              fontWeight: 700,
              color: STATUS_COLORS[phase.status] || 'text.secondary',
              bgcolor: alpha(
                theme.palette[
                  phase.status === 'completed'
                    ? 'success'
                    : phase.status === 'failed'
                      ? 'error'
                      : 'primary'
                ].main,
                0.1
              ),
            }}
          />
        </Box>
        <IconButton onClick={onClose} size="small">
          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
        </IconButton>
      </Box>
      <Divider />
      {/* Metrics */}
      <Box sx={{ px: 2.5, py: 1.5, display: 'flex', gap: 3 }}>
        {phase.quality_score != null && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Quality
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {phase.quality_score}/100
            </Typography>
          </Box>
        )}
        {phaseCosts.total != null && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Cost
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              ${Number(phaseCosts.total).toFixed(4)}
            </Typography>
          </Box>
        )}
        {duration != null && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Duration
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {duration}min
            </Typography>
          </Box>
        )}
        {phaseCosts.tasks_completed != null && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Tasks
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {phaseCosts.tasks_completed}/{phaseCosts.tasks_total}
            </Typography>
          </Box>
        )}
      </Box>
      {phase.description && (
        <>
          <Divider />
          <Box sx={{ px: 2.5, py: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Description
            </Typography>
            <Typography variant="body2">{phase.description}</Typography>
          </Box>
        </>
      )}
      <Divider />
      {/* Outputs */}
      <Box sx={{ px: 2.5, py: 1.5, flex: 1, overflow: 'auto' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Outputs
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : outputs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {phase.status === 'pending' ? 'Phase has not started yet.' : 'No outputs available.'}
          </Typography>
        ) : (
          outputs.map((doc) => (
            <Box
              key={doc.id}
              sx={{
                mb: 1.5,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.background.default, 0.5),
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                {doc.title}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {doc.content?.slice(0, 3000) || '(empty)'}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Drawer>
  );
}
