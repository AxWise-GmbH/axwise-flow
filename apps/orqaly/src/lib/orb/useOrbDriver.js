// The per-frame driver every animated orb shares.
//
// LiquidOrb's `handleRef` is the documented seam for animating an orb without
// re-rendering it, and driving it correctly means getting four things right
// every time: mutate one value object rather than allocating per frame, derive
// state from elapsed clock time rather than from frame count, stop requesting
// frames the moment there is nothing left to animate, and stand down entirely
// when the user has asked for less motion. DropChargeOrb worked all of that out
// and then owned a private copy of it. This is that loop, lifted, so the next
// twenty animated orbs do not each re-derive it.
//
// The step function is held in a ref rather than being an effect dependency.
// A caller writing `step={(t) => ...}` inline creates a new closure every
// render, and a step in the dep array would tear down and restart the rAF loop
// on every parent render - which is exactly the moment (a page loading, a
// composer typing) when the main thread can least afford it. The loop restarts
// only when `runKey` changes.

import { useEffect, useMemo, useRef } from 'react';

/**
 * Whether this orb should be holding still.
 *
 * The isolated landing respects the operating-system reduced-motion setting.
 * It deliberately does not read the legacy Settings context, because that
 * context imports persisted Supabase preferences into an otherwise static page.
 */
export function useOrbStill() {
  const prefersReduced = useMemo(
    () => globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
    []
  );
  return prefersReduced;
}

/**
 * Drive one orb's value set every frame.
 *
 * @param {object} opts
 * @param {number} opts.size the orb's CSS size, passed through to the pool
 * @param {object} opts.values the value set to push; MUTATE THIS in `step`,
 *   never replace it - the pool holds the reference and reads it at draw time
 * @param {(elapsedMs: number, dtMs: number) => boolean|void} opts.step called
 *   once a frame. Return false to end the loop; anything else continues it
 * @param {boolean} [opts.active=true] false parks the loop without unmounting
 * @param {string} [opts.blend='Auto']
 * @param {number|string} [opts.runKey=0] change to restart from elapsed 0
 * @param {boolean} [opts.still] override the reduced-motion answer; a caller
 *   that already computed it should pass it rather than reading it twice
 * @returns {{current: object|null}} the ref to hand to LiquidOrb's handleRef
 */
export function useOrbDriver({
  size,
  values,
  step,
  active = true,
  blend = 'Auto',
  runKey = 0,
  still: stillOverride,
}) {
  const handleRef = useRef(null);
  const stepRef = useRef(step);
  // Synced in an effect rather than written during render: a ref write during
  // render is a lint error and, more to the point, is wrong under concurrent
  // rendering, where a render can be thrown away. Declared BEFORE the loop
  // effect so it is already current by the time a restarted loop first ticks.
  useEffect(() => {
    stepRef.current = step;
  });

  const detectedStill = useOrbStill();
  const still = stillOverride ?? detectedStill;

  useEffect(() => {
    const push = (animate) =>
      handleRef.current?.update({ cssSize: size, values, blend, animate, visible: true });

    // One push whatever happens. A parked or still orb still has to show the
    // values it was handed - a driven orb whose loop never starts must not be
    // left on whatever LiquidOrb pushed at mount.
    push(active && !still);

    if (!active || still) return undefined;

    // Seeded from the FIRST FRAME's timestamp, not from performance.now() here.
    // A rAF callback is handed the time the frame began, which can predate the
    // moment this effect ran - so seeding from the clock makes the first tick's
    // elapsed negative, and every timeline spends its opening frame clamped at
    // zero. Seeding from the frame guarantees elapsed starts at exactly 0 and
    // only ever rises.
    let startedAt = 0;
    let last = 0;
    let raf = 0;

    const tick = (now) => {
      if (!startedAt) {
        startedAt = now;
        last = now;
      }
      const elapsed = now - startedAt;
      const dt = now - last;
      last = now;

      const carryOn = stepRef.current?.(elapsed, dt);
      push(true);
      if (carryOn !== false) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size, values, blend, active, still, runKey]);

  return handleRef;
}
