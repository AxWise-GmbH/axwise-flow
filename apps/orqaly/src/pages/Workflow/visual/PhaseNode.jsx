import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Box, Typography, Chip, Tooltip, IconButton, alpha, useTheme } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';

import AppIcon from '../../../components/icons/AppIcon';

const STATUS_CONFIG = {
  pending: { color: 'text.disabled', icon: HourglassEmptyIcon, label: 'Pending' },
  executing: { color: 'primary.main', icon: PlayCircleOutlineIcon, label: 'Executing' },
  completed: { color: 'success.main', icon: CheckCircleOutlineIcon, label: 'Completed' },
  failed: { color: 'error.main', icon: ErrorOutlineIcon, label: 'Failed' },
};

function PhaseNode({ data, selected }) {
  const theme = useTheme();
  const status = data?.status || 'pending';
  const label = data?.label || 'Phase';
  const description = data?.description || '';
  const jobs = data?.jobs || [];
  const qualityScore = data?.quality_score;
  const onViewOutput = data?.onViewOutput;
  const phaseIndex = data?.phaseIndex ?? 0;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const isExecuting = status === 'executing';
  const isCompleted = status === 'completed';

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          top: -5,
          background: theme.palette.divider,
          width: 10,
          height: 10,
          border: '2px solid',
          borderColor: theme.palette.background.paper,
        }}
      />
      <Box
        sx={{
          minWidth: 280,
          maxWidth: 320,
          borderRadius: 3,
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: 'background.paper',
          boxShadow: selected
            ? `0 4px 16px ${alpha(theme.palette.primary.main, 0.2)}`
            : '0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: createHoverGlowShadow(theme),
          },
        }}
      >
        {/* Status bar */}
        <Box
          sx={{
            width: 5,
            flexShrink: 0,
            bgcolor: config.color,
            ...(isExecuting && {
              animation: 'phaseNodePulse 1.5s ease-in-out infinite',
              '@keyframes phaseNodePulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.4 },
              },
            }),
          }}
        />

        {/* Content */}
        <Box sx={{ flex: 1, p: 1.5, minWidth: 0 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AppIcon fallback={StatusIcon} sx={{ fontSize: 18, color: config.color }} />
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                fontSize: '0.85rem',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Typography>
            {qualityScore != null && (
              <Chip
                label={`${qualityScore}/100`}
                size="small"
                color={qualityScore >= 90 ? 'success' : qualityScore >= 70 ? 'warning' : 'error'}
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
              />
            )}
            {isCompleted && typeof onViewOutput === 'function' && (
              <Tooltip title="View output">
                <IconButton
                  size="small"
                  className="nodrag nopan"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOutput(phaseIndex);
                  }}
                  sx={{ p: 0.25, color: 'primary.main' }}
                >
                  <AppIcon
                    name="VisibilityOutlined"
                    fallback={VisibilityOutlinedIcon}
                    sx={{ fontSize: 16 }}
                  />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Description */}
          {description && (
            <Tooltip title={description.length > 60 ? description : ''} arrow>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  mb: 0.75,
                  fontSize: '0.7rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {description}
              </Typography>
            </Tooltip>
          )}

          {/* Job chips */}
          {jobs.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {jobs.slice(0, 4).map((job, i) => (
                <Chip
                  key={i}
                  label={job}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    maxWidth: 130,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              ))}
              {jobs.length > 4 && (
                <Chip
                  label={`+${jobs.length - 4}`}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    bgcolor: alpha(theme.palette.text.primary, 0.08),
                  }}
                />
              )}
            </Box>
          )}
        </Box>
      </Box>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          bottom: -5,
          background: theme.palette.divider,
          width: 10,
          height: 10,
          border: '2px solid',
          borderColor: theme.palette.background.paper,
        }}
      />
    </>
  );
}

export default memo(PhaseNode);
