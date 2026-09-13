/**
 * ProgressBlock — one or more labeled progress bars.
 *   compact: { title?, items: [{ label, value (0-100), caption? }] }
 */
import { Box, LinearProgress, Typography, useTheme } from '@mui/material';
import {
  composerAccent,
  composerBlockSx,
  composerInk,
  composerInkAlpha,
} from '../../../theme/composerSurface';

export default function ProgressBlock({ block }) {
  const theme = useTheme();
  const c = block?.compact || {};
  const items = Array.isArray(c.items) ? c.items : [];
  if (!items.length) return null;

  return (
    <Box sx={{ borderRadius: 2, ...composerBlockSx(theme), p: 1.5 }}>
      {c.title && (
        <Typography variant="body2" sx={{ color: composerInk(theme), fontWeight: 600, mb: 1 }}>
          {c.title}
        </Typography>
      )}
      {items.map((it, i) => {
        const value = Math.max(0, Math.min(100, Number(it.value) || 0));
        return (
          <Box key={`p-${i}`} sx={{ mb: i === items.length - 1 ? 0 : 1.25 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
              <Typography variant="caption" sx={{ color: composerInkAlpha(theme, 0.7) }}>
                {it.label}
              </Typography>
              <Typography variant="caption" sx={{ color: composerInkAlpha(theme, 0.5) }}>
                {it.caption || `${value}%`}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={value}
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
        );
      })}
    </Box>
  );
}
