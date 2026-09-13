import { Box, Typography } from '@mui/material';
import BlockShell from '../BlockShell';

/**
 * Markdown / rich-text block. Phase 2 ships a very small renderer:
 * - lines starting with '# ' → h6
 * - lines starting with '## ' → subtitle1
 * - blank line → paragraph break
 * - everything else → body2
 *
 * Phase 7 may replace this with a real markdown renderer.
 */
export default function MarkdownBlock({ block, ...shellProps }) {
  const body = block?.body || '';
  const lines = body.split(/\r?\n/);

  return (
    <BlockShell title={block?.title || 'Note'} {...shellProps}>
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {lines.map((line, i) => {
          if (line.startsWith('# ')) {
            return (
              <Typography key={i} variant="h6" sx={{ fontWeight: 700 }}>
                {line.slice(2)}
              </Typography>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <Typography key={i} variant="subtitle1" sx={{ fontWeight: 700 }}>
                {line.slice(3)}
              </Typography>
            );
          }
          if (line.trim() === '') return <Box key={i} sx={{ height: 4 }} />;
          return (
            <Typography key={i} variant="body2" color="text.primary">
              {line}
            </Typography>
          );
        })}
        {!body && (
          <Typography variant="caption" color="text.secondary">
            Empty note — click ⋯ → Configure to add text.
          </Typography>
        )}
      </Box>
    </BlockShell>
  );
}
