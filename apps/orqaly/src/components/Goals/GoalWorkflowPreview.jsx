import { Box, Typography, useTheme, alpha } from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import AppIcon from '../icons/AppIcon';

const STATUS_COLORS = {
  pending: 'text.disabled',
  executing: 'info.main',
  completed: 'success.main',
  failed: 'error.main',
};

export default function GoalWorkflowPreview({ goal, compact = false }) {
  const theme = useTheme();
  const phases = goal?.plan?.phases || [];

  if (phases.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>
          No workflow yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, py: 0.5 }}>
      {phases.map((phase, i) => {
        const color = STATUS_COLORS[phase.status] || STATUS_COLORS.pending;
        const isDone = phase.status === 'completed';
        const isActive = phase.status === 'executing';

        return (
          <Box
            key={i}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}
          >
            <Box
              sx={{
                width: '100%',
                p: compact ? 0.75 : 1,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: alpha(
                  theme.palette[isDone ? 'success' : isActive ? 'info' : 'action']?.main ||
                    theme.palette.divider,
                  isDone || isActive ? 0.4 : 0.15
                ),
                bgcolor: isDone
                  ? alpha(theme.palette.success.main, 0.05)
                  : isActive
                    ? alpha(theme.palette.info.main, 0.05)
                    : 'transparent',
                textAlign: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  fontSize: compact ? '0.58rem' : '0.68rem',
                  color,
                }}
              >
                {phase.name}
              </Typography>
              {!compact && phase.quality_score != null && (
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.55rem', color: 'text.disabled', display: 'block' }}
                >
                  Quality: {phase.quality_score}/100
                </Typography>
              )}
            </Box>
            {i < phases.length - 1 && (
              <AppIcon
                name="ArrowDownward"
                fallback={ArrowDownwardIcon}
                sx={{ fontSize: 12, color: 'text.disabled', my: -0.25 }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
