/**
 * Row-stagger sx helper for dashboard entrance motion.
 *
 * Spread onto each repeated child of an in-view container (a `<Box>` tile or an
 * MUI `<TableRow>`) to cascade them in via the `homeRowIn` keyframe (Home.css).
 * Pair with `useInView` on the container: pass its `inView` flag here.
 *
 *   const [ref, inView] = useInView();
 *   <Box ref={ref}>{rows.map((r, i) => <Row key={r.id} sx={staggerSx(i, inView)} />)}</Box>
 *
 * Before the container is in view, children are held at opacity 0; once in view
 * each animates with a `base + index*step` ms delay (capped via `max` so long
 * lists don't cascade forever). Respects reduced motion.
 *
 * @param {number} index  zero-based position of the child
 * @param {boolean} inView whether the container has scrolled into view
 * @param {{ step?: number, base?: number, duration?: number, max?: number }} [opts]
 *        `max` caps the effective index so long lists don't cascade forever.
 */
export function staggerSx(index, inView, { step = 50, base = 0, duration = 400, max = 16 } = {}) {
  const effectiveIndex = Math.min(index, max);
  return {
    ...(inView
      ? {
          animation: `homeRowIn ${duration}ms cubic-bezier(.22,1,.36,1) both`,
          animationDelay: `${base + effectiveIndex * step}ms`,
        }
      : { opacity: 0 }),
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
      opacity: 1,
      transform: 'none',
    },
  };
}

export default staggerSx;
