import { Box, Typography, useTheme } from '@mui/material';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded';
import BaseBlock, { relTime } from './BaseBlock.jsx';
import { composerInkAlpha } from '../../../theme/composerSurface';

export default function KbDocBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const e = block.expanded || null;
  const enhanced = { ...block, entityType: 'kb-doc' };

  const tagLabel = Array.isArray(c.tags) && c.tags.length ? c.tags.slice(0, 3).join(' · ') : null;

  const expandedNode = e ? (
    <Box>
      {e.excerpt && (
        <Typography
          variant="caption"
          sx={{ color: composerInkAlpha(theme, 0.7), display: 'block', whiteSpace: 'pre-wrap' }}
        >
          {e.excerpt}
        </Typography>
      )}
    </Box>
  ) : null;

  return (
    <BaseBlock
      icon={ArticleRoundedIcon}
      title={c.title || 'Document'}
      subtitle={c.content_type ? `type: ${c.content_type}` : ''}
      metaLines={[tagLabel, c.updated_at ? `Updated ${relTime(c.updated_at)}` : null]}
      expandedNode={expandedNode}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
