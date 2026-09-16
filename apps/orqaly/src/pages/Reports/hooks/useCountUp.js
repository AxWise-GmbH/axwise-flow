import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION = 600;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** True when the user has asked the OS to minimize non-essential motion. */
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

export default function useCountUp(target, { duration = DEFAULT_DURATION, enabled = true } = {}) {
  const numeric = Number(target);
  const safeTarget = Number.isFinite(numeric) ? numeric : 0;
  // Skip the animation entirely (land on the final value) when motion is reduced.
  const animate = enabled && !prefersReducedMotion();
  const [value, setValue] = useState(animate ? 0 : safeTarget);
  const fromRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!animate) {
      setValue(safeTarget);
      return undefined;
    }
    const startValue = fromRef.current;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const next = startValue + (safeTarget - startValue) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = safeTarget;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = safeTarget;
    };
  }, [safeTarget, duration, animate]);

  return value;
}
