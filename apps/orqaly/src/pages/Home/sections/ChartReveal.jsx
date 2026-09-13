import { Box } from '@mui/material';
import useInView from '../../../components/Common/useInView';

/**
 * Mounts its children only once they first scroll into view, then keeps them
 * mounted ("animate once"). Because recharts plays its enter animation on
 * mount, deferring the mount makes the chart draw in at the moment its block
 * becomes visible rather than off-screen on page load.
 *
 * A fixed-`minHeight` placeholder reserves space before mount to avoid layout
 * shift. In jsdom / reduced-motion, useInView reports in-view immediately, so
 * children render right away (tests unaffected).
 *
 * @param {{ minHeight?: number|string, children: React.ReactNode, sx?: object }} props
 */
export default function ChartReveal({ minHeight = 0, children, sx }) {
  const [ref, inView] = useInView({ once: true });
  return (
    <Box ref={ref} sx={{ minHeight, ...sx }}>
      {inView ? children : null}
    </Box>
  );
}
