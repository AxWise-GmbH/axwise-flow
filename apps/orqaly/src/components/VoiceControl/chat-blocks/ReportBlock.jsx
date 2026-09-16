import { Box, Typography, useTheme } from '@mui/material';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import BaseBlock from './BaseBlock.jsx';
import { composerInkAlpha } from '../../../theme/composerSurface';

export default function ReportBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const e = block.expanded || null;
  const enhanced = { ...block, entityType: 'report' };

  const metrics = Array.isArray(c.top_metrics) ? c.top_metrics : [];

  const expandedNode = e ? (
    <Box>
      {e.snippet && (
        <Typography
          variant="caption"
          sx={{ color: composerInkAlpha(theme, 0.7), whiteSpace: 'pre-wrap', display: 'block' }}
        >
          {e.snippet}
        </Typography>
      )}
    </Box>
  ) : null;

  return (
    <BaseBlock
      icon={AssessmentRoundedIcon}
      title={`${c.type || 'report'} · ${c.period || 'current'}`}
      metaLines={metrics.slice(0, 4).map((m) => `${m.label}: ${m.value}`)}
      expandedNode={expandedNode}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
