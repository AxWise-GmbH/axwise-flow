import { Box } from '@mui/material';
import useInView from './useInView';

/**
 * Fade + slide-up entrance, triggered when the element scrolls into view.
 * Honors prefers-reduced-motion and falls back to "shown" immediately when
 * IntersectionObserver is unavailable. `delay` (ms) staggers sequential reveals.
 */
export default function Reveal({ children, delay = 0, sx }) {
  const [ref, shown] = useInView();

  return (
    <Box
      ref={ref}
      sx={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 600ms cubic-bezier(.22,1,.36,1) ${delay}ms, transform 600ms cubic-bezier(.22,1,.36,1) ${delay}ms`,
        '@media (prefers-reduced-motion: reduce)': {
          opacity: 1,
          transform: 'none',
          transition: 'none',
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
