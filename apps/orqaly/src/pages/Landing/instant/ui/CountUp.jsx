import { useEffect, useState } from 'react';
import useInView from '../../../../components/Common/useInView';

const DURATION_MS = 1600;

function prefersReducedMotion() {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

function format(value, decimals) {
  return value.toFixed(decimals);
}

/**
 * A number that counts up to its value when it scrolls into view.
 * Readers and tests get the final text at once; only the visible digits animate.
 */
export default function CountUp({ value, decimals = 0, suffix = '' }) {
  const [ref, inView] = useInView({ threshold: 0.4 });
  const finalText = `${format(value, decimals)}${suffix}`;
  const animate = typeof requestAnimationFrame === 'function' && !prefersReducedMotion();
  const [shown, setShown] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate || !inView) return undefined;
    let raf = 0;
    let start = 0;
    const tick = (now) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      // Ease-out: fast at first, settling on the real number.
      setShown(value * (1 - (1 - t) ** 4));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, inView, value]);

  return (
    <span ref={ref}>
      <span className="oi-sr-only">{finalText}</span>
      <span aria-hidden="true">
        {format(shown, decimals)}
        {suffix}
      </span>
    </span>
  );
}
