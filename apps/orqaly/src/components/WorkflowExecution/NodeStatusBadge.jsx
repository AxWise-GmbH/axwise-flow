import { Box, alpha, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CircularProgress from '@mui/material/CircularProgress';

import AppIcon from '../icons/AppIcon';

const STATUS_MAP = {
  completed: { color: 'success', Icon: CheckCircleIcon },
  done: { color: 'success', Icon: CheckCircleIcon },
  running: { color: 'info', Icon: null },
  failed: { color: 'error', Icon: ErrorIcon },
};

/**
 * Small status badge overlay for workflow nodes during execution.
 * @param {{ status: 'completed'|'running'|'failed'|null }} props
 */
export default function NodeStatusBadge({ status }) {
  const theme = useTheme();
  if (!status) return null;

  const cfg = STATUS_MAP[status];
  if (!cfg) return null;

  const color = theme.palette[cfg.color]?.main || theme.palette.grey[500];

  return (
    <Box
      sx={{
        position: 'absolute',
        top: -6,
        right: -6,
        width: 18,
        height: 18,
        borderRadius: '50%',
        bgcolor: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 0 0 2px ${alpha(color, 0.3)}`,
        zIndex: 5,
      }}
    >
      {cfg.Icon ? (
        <AppIcon fallback={cfg.Icon} sx={{ fontSize: 16, color }} />
      ) : (
        <CircularProgress size={12} thickness={5} sx={{ color }} />
      )}
    </Box>
  );
}
