import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  IconButton,
  Collapse,
  Paper,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { getExecution, getStepResults } from '../../services/workflowExecutionService';

import AppIcon from '../icons/AppIcon';

const STATUS_CONFIG = {
  completed: { color: 'success', icon: CheckCircleOutlineIcon, label: 'Completed' },
  done: { color: 'success', icon: CheckCircleOutlineIcon, label: 'Completed' },
  running: { color: 'info', icon: PlayCircleOutlineIcon, label: 'Running' },
  failed: { color: 'error', icon: ErrorOutlineIcon, label: 'Failed' },
  pending: { color: 'default', icon: HourglassEmptyIcon, label: 'Pending' },
  skipped: { color: 'default', icon: HourglassEmptyIcon, label: 'Skipped' },
};

function StepRow({ step }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  return (
    <Box sx={{ mb: 1 }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          borderRadius: 2,
          cursor: 'pointer',
          bgcolor: alpha(theme.palette[cfg.color]?.main || theme.palette.grey[400], 0.06),
          '&:hover': {
            bgcolor: alpha(theme.palette[cfg.color]?.main || theme.palette.grey[400], 0.12),
          },
        }}
      >
        <AppIcon fallback={Icon} fontSize="small" color={cfg.color} />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
          {step.node_id}
        </Typography>
        <Chip label={step.node_type} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        {step.duration_ms > 0 && (
          <Typography variant="caption" color="text.secondary">
            {step.duration_ms}ms
          </Typography>
        )}
        <IconButton size="small">
          {expanded ? (
            <AppIcon name="ExpandLess" fallback={ExpandLessIcon} fontSize="small" />
          ) : (
            <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} fontSize="small" />
          )}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ pl: 4, pr: 1, py: 1 }}>
          {step.error && (
            <Typography variant="body2" color="error.main" sx={{ mb: 1 }}>
              Error: {step.error}
            </Typography>
          )}
          {step.input_data && Object.keys(step.input_data).length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Input
              </Typography>
              <Box
                sx={{
                  bgcolor: 'grey.50',
                  borderRadius: 1,
                  p: 1,
                  mt: 0.5,
                  fontFamily: 'monospace',
                  fontSize: 11,
                  maxHeight: 120,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(step.input_data, null, 2)}
              </Box>
            </Box>
          )}
          {step.output_data && Object.keys(step.output_data).length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Output
              </Typography>
              <Box
                sx={{
                  bgcolor: 'grey.50',
                  borderRadius: 1,
                  p: 1,
                  mt: 0.5,
                  fontFamily: 'monospace',
                  fontSize: 11,
                  maxHeight: 120,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(step.output_data, null, 2)}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function ExecutionTracePanel({ executionId, onClose }) {
  const theme = useTheme();
  const [execution, setExecution] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!executionId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [exec, stepData] = await Promise.all([
          getExecution(executionId),
          getStepResults(executionId),
        ]);
        if (!cancelled) {
          setExecution(exec);
          setSteps(stepData);
          setLoading(false);
        }

        // If still running, poll
        if (exec?.status === 'running' || exec?.status === 'pending') {
          setTimeout(load, 2000);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [executionId]);

  if (!executionId) return null;

  const cfg = STATUS_CONFIG[execution?.status] || STATUS_CONFIG.pending;

  return (
    <Paper
      elevation={2}
      sx={{
        position: 'absolute',
        right: 16,
        top: 16,
        width: 380,
        maxHeight: 'calc(100vh - 200px)',
        overflow: 'auto',
        borderRadius: 3,
        zIndex: 10,
        p: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          Execution Trace
        </Typography>
        <Chip label={cfg.label} color={cfg.color} size="small" />
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <AppIcon name="ExpandLess" fallback={ExpandLessIcon} fontSize="small" />
          </IconButton>
        )}
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {execution?.error && (
            <Typography variant="body2" color="error.main" sx={{ mb: 2 }}>
              {execution.error}
            </Typography>
          )}

          {execution?.started_at && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Started: {new Date(execution.started_at).toLocaleString()}
              {execution.completed_at &&
                ` • Duration: ${Math.round((new Date(execution.completed_at) - new Date(execution.started_at)) / 1000)}s`}
            </Typography>
          )}

          <Divider sx={{ my: 1.5 }} />

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, mb: 1, display: 'block' }}
          >
            Steps ({steps.length})
          </Typography>

          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}

          {steps.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No steps recorded yet
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
}
