import { Box, Typography, useTheme } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import BaseBlock, { relTime } from './BaseBlock.jsx';
import { composerInkAlpha } from '../../../theme/composerSurface';

export default function WorkflowBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const e = block.expanded || null;
  const enhanced = { ...block, entityType: 'workflow' };

  const enabledChip = {
    label: c.enabled ? 'enabled' : 'paused',
    color: c.enabled ? '#7bd88f' : '#ffb74d',
  };

  const expandedNode = e ? (
    <Box>
      {e.description && (
        <Typography
          variant="caption"
          sx={{ color: composerInkAlpha(theme, 0.7), display: 'block', mb: 0.75 }}
        >
          {e.description}
        </Typography>
      )}
      {e.trigger && (
        <Typography
          variant="caption"
          sx={{ color: composerInkAlpha(theme, 0.55), display: 'block' }}
        >
          Trigger: {e.trigger}
        </Typography>
      )}
      {typeof e.step_count === 'number' && (
        <Typography
          variant="caption"
          sx={{ color: composerInkAlpha(theme, 0.55), display: 'block' }}
        >
          {e.step_count} step{e.step_count === 1 ? '' : 's'}
        </Typography>
      )}
    </Box>
  ) : null;

  return (
    <BaseBlock
      icon={AccountTreeOutlinedIcon}
      title={c.name || 'Workflow'}
      chips={[enabledChip]}
      metaLines={[c.updated_at ? `Updated ${relTime(c.updated_at)}` : null]}
      expandedNode={expandedNode}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
