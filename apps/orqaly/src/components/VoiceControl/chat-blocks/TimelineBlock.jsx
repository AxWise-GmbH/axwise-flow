/**
 * TimelineBlock — vertical activity timeline from block.compact.events.
 *   compact: { range?, events: [{ title, detail?, at, source? }] }
 */
import { Box, Typography, useTheme } from '@mui/material';
import { relTime } from './BaseBlock.jsx';
import {
  composerAccent,
  composerBlockSx,
  composerInk,
  composerInkAlpha,
} from '../../../theme/composerSurface';

const SOURCE_COLOR = {
  goal: 'primary',
  notification: 'info',
  pulse: 'success',
};

export default function TimelineBlock({ block }) {
  const theme = useTheme();
  const c = block?.compact || {};
  const events = Array.isArray(c.events) ? c.events : [];
  if (!events.length) return null;

  return (
    <Box sx={{ borderRadius: 2, ...composerBlockSx(theme), p: 1.5 }}>
      <Typography
        variant="caption"
        sx={{
          color: composerInkAlpha(theme, 0.5),
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        {c.range ? `ACTIVITY · ${String(c.range).toUpperCase()}` : 'ACTIVITY'}
      </Typography>
      <Box sx={{ mt: 1 }}>
        {events.map((e, i) => {
          const paletteKey = SOURCE_COLOR[e.source] || 'primary';
          const dotColor = theme.palette[paletteKey]?.light || composerAccent(theme);
          return (
            <Box
              key={`ev-${i}`}
              sx={{ display: 'flex', gap: 1.25, pb: i === events.length - 1 ? 0 : 1.25 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: dotColor,
                    mt: 0.5,
                    flexShrink: 0,
                  }}
                />
                {i !== events.length - 1 && (
                  <Box
                    sx={{
                      width: '1px',
                      flex: 1,
                      bgcolor: composerInkAlpha(theme, 0.12),
                      mt: 0.5,
                    }}
                  />
                )}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: composerInk(theme),
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {e.title}
                </Typography>
                {e.detail && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: composerInkAlpha(theme, 0.5),
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {String(e.detail).slice(0, 120)}
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  sx={{
                    color: composerInkAlpha(theme, 0.35),
                    fontSize: '0.66rem',
                  }}
                >
                  {relTime(e.at)}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
