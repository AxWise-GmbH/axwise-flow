/**
 * LoopBlock — inline card for a looping goal, with an iteration progress bar.
 */
import { Box, LinearProgress, Typography, useTheme } from '@mui/material';
import LoopRoundedIcon from '@mui/icons-material/LoopRounded';
import BaseBlock, { statusColor } from './BaseBlock.jsx';
import { composerAccent, composerInkAlpha } from '../../../theme/composerSurface';

export default function LoopBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block?.compact || {};
  const iteration = Number(c.iteration || 0);
  const max = Number(c.max_iterations || 0);
  const pct = max > 0 ? Math.min(100, Math.round((iteration / max) * 100)) : 0;
  const paused = !!c.loop_paused;

  const expandedNode =
    max > 0 ? (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: composerInkAlpha(theme, 0.6) }}>
            Iteration {iteration}/{max}
          </Typography>
          <Typography variant="caption" sx={{ color: composerInkAlpha(theme, 0.6) }}>
            {pct}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: composerInkAlpha(theme, 0.1),
            '& .MuiLinearProgress-bar': {
              bgcolor: composerAccent(theme),
            },
          }}
        />
      </Box>
    ) : null;

  return (
    <BaseBlock
      icon={LoopRoundedIcon}
      iconColor={paused ? theme.palette.warning.light : theme.palette.info.light}
      title={c.title || 'Looping goal'}
      subtitle={max > 0 ? `Iteration ${iteration}/${max}` : `Iteration ${iteration}`}
      chips={[
        c.status ? { label: c.status, color: statusColor(theme, c.status) } : null,
        paused ? { label: 'PAUSED', color: theme.palette.warning.light } : null,
      ]}
      expandedNode={expandedNode}
      block={block}
      onOpen={onOpen}
    />
  );
}
