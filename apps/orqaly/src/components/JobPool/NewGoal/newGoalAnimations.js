/**
 * Shared keyframes for the New Goal dialog.
 *
 * Every consumer must pair these with a prefers-reduced-motion guard; the
 * keyframes themselves carry no media query.
 */
import { keyframes } from '@mui/material';

// ── Animations ───────────────────────────────────────────────
export const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.05); }
`;

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const spinSlow = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

export const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
