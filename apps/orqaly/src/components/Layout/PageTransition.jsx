import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { useLocation, Outlet } from 'react-router-dom';

/**
 * Wraps outlet with an entrance animation when the route changes.
 * Uses CSS animation for a professional, lightweight effect.
 *
 * Entering /assistant plays a richer slide-up + fade tuned to the Home page's
 * easing/duration so the console blocks (which cascade in via <Reveal>) arrive
 * on a moving stage. Every other route keeps the original subtle fade.
 *
 * Also resets scroll to the top on every navigation so pages never open
 * mid-scroll. On desktop the inner <main> element scrolls; on mobile the window
 * scrolls - reset both. Pages that restore their own scroll (e.g. Data.jsx) run
 * afterward and override this.
 */
export default function PageTransition() {
  const location = useLocation();
  const prevPath = useRef(null);

  const enteringAssistant = location.pathname === '/assistant';
  const animation = enteringAssistant
    ? 'pageSlideIn 0.42s cubic-bezier(.22,1,.36,1)'
    : 'pageFadeIn 0.28s ease-out';

  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    if (typeof document !== 'undefined') {
      document.querySelector('main')?.scrollTo?.({ top: 0, left: 0 });
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  return (
    <Box
      key={location.pathname}
      sx={{
        animation,
        '@keyframes pageFadeIn': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        '@keyframes pageSlideIn': {
          from: { opacity: 0, transform: 'translateY(16px)' },
          to: { opacity: 1, transform: 'none' },
        },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Outlet />
    </Box>
  );
}
