import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';

// Rounded "pill strip" for filter/type tabs - always a single row.
// The rounded background + horizontal scroll live on the SAME box, capped to
// the container width (width: fit-content + maxWidth: 100%). So it hugs the
// tabs when they fit (desktop) and scrolls horizontally inside the rounded
// bounds when they overflow (mobile/tablet) - both rounded ends stay visible,
// never clipped.
export default function PillTabStrip({ children, sx, radius = 3, gap = 0, ...rest }) {
  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 0, ...sx }} {...rest}>
      <Box
        sx={(theme) => ({
          display: 'flex',
          columnGap: gap,
          bgcolor: alpha(theme.palette.text.primary, 0.04),
          p: 0.5,
          borderRadius: radius,
          width: 'fit-content',
          maxWidth: '100%',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        })}
      >
        {children}
      </Box>
    </Box>
  );
}
