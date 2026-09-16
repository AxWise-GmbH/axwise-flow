/**
 * AssistantLottie - thin wrapper around lottie-react used by the Assistant
 * Console illustrations. Loops by default and honors prefers-reduced-motion by
 * holding a static first frame (matching the Voice waveform's reduced-motion
 * behavior).
 */
import { useMemo } from 'react';
import { Box } from '@mui/material';
import Lottie from 'lottie-react';

/** True when the user asked the OS to minimize motion. */
function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function AssistantLottie({ animationData, height = 110, ariaLabel }) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  return (
    <Box
      role="img"
      aria-label={ariaLabel}
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}
      data-testid="assistant-lottie"
    >
      <Lottie
        animationData={animationData}
        loop={!reduced}
        autoplay={!reduced}
        style={{ height: '100%', width: '100%' }}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
    </Box>
  );
}
