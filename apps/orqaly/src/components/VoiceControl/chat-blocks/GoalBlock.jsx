import { Box, Typography, LinearProgress, useTheme } from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import BaseBlock, { relTime, statusColor } from './BaseBlock.jsx';
import { composerInk, composerInkAlpha } from '../../../theme/composerSurface';

export default function GoalBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const e = block.expanded || null;

  const status = c.status || 'unknown';
  const sc = statusColor(theme, status);
  const progress = typeof c.progress_pct === 'number' ? c.progress_pct : null;

  const enhanced = { ...block, entityType: 'goal' };

  const expandedNode = e ? (
    <Box>
      {e.summary && (
        <Typography
          variant="caption"
          sx={{ color: composerInkAlpha(theme, 0.7), display: 'block', mb: 1 }}
        >
          {e.summary}
        </Typography>
      )}
      {Array.isArray(e.deliverables) && e.deliverables.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: composerInkAlpha(theme, 0.55), display: 'block', mb: 0.5 }}
          >
            Deliverables
          </Typography>
          {e.deliverables.slice(0, 5).map((d, i) => (
            <Typography
              key={`d-${i}`}
              variant="caption"
              sx={{
                color: composerInk(theme),
                display: 'block',
                pl: 1,
              }}
            >
              • {d.name} {d.status ? `— ${d.status}` : ''}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  ) : null;

  return (
    <BaseBlock
      icon={AutoAwesomeRoundedIcon}
      iconColor={sc}
      title={c.title || 'Goal'}
      subtitle={c.budget_usd != null ? `budget $${c.budget_usd}` : ''}
      chips={[{ label: status, color: sc }]}
      metaLines={[c.updated_at ? `Updated ${relTime(c.updated_at)}` : null]}
      expandedNode={expandedNode}
      block={enhanced}
      onOpen={onOpen}
    >
      {progress != null && (
        <Box sx={{ px: 1.25, pb: 0.75 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, progress))}
            sx={{
              height: 4,
              borderRadius: 2,
              bgcolor: composerInkAlpha(theme, 0.08),
              '& .MuiLinearProgress-bar': { bgcolor: sc },
            }}
          />
        </Box>
      )}
    </BaseBlock>
  );
}
