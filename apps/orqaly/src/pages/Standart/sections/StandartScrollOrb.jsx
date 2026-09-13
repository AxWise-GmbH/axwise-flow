/**
 * [module: design-system]
 *
 * The orb that follows the page.
 *
 * Modelled on `pages/Landing/ScrollingOrb.jsx`, whose machinery is generic and
 * worth copying rather than reinventing. Four things carry over, and each one is
 * load-bearing:
 *
 *  1. RECTS, NOT OBSERVERS. Zone positions are measured once into a ref. An
 *     IntersectionObserver tells you when something crosses a line; this needs a
 *     continuous position, which is arithmetic on a rect.
 *  2. RE-MEASURED TWICE AFTER MOUNT (600ms, 1600ms) and on a debounced resize.
 *     Sections below the fold hold mockups that mount behind their own
 *     observers, so a rect read at mount is short by however tall those are.
 *  3. THE LOOP WRITES TO THE DOM, NOT TO STATE. A single rAF lerps toward the
 *     target and assigns `style.transform` and `style.opacity` on a ref. Nothing
 *     here re-renders React, which is the difference between a page that scrolls
 *     smoothly and one that does not.
 *  4. REDUCED MOTION IS A DIFFERENT BRANCH, not a disabled loop. One still orb,
 *     parked. A stopped animation and a hung page look identical, and the answer
 *     to "reduce motion" is a finished picture rather than a frozen one.
 *
 * WHY THIS PAGE HAS AN ORB AT ALL, given that Standart's own rule is that
 * decorative canvases are not rendered in mono - the marketplace does exactly
 * that, dropping its particles, its scan line and its orb the moment the mode
 * turns on. The rule is about working surfaces, where decoration competes with
 * the job. This is a marketing page, and the orb is Standart's own mark: the
 * same one on the sign-in screen and in the top bar. It stays greyscale, because
 * the accent already resolves to grey here, and it stays faint enough to read
 * text over. That is a deliberate exception, not an oversight.
 */
import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import LineOrb from '../../../components/Common/LineOrb';
import { useOrbStill } from '../../../lib/orb/useOrbDriver';
import { INK } from '../standartTokens';
import {
  DEFAULT_ZONE,
  ORB_LERP,
  ORB_REMEASURE_MS,
  ORB_RESIZE_DEBOUNCE_MS,
  ORB_ZONES,
} from '../standartMotion';

/**
 * The canvas is drawn once at the largest pose and scaled down for the rest.
 *
 * The hero pose is 5.2x. A canvas sized for the smallest pose and scaled up
 * there would be a blurred disc; sizing for the largest and scaling down costs
 * nothing, since every other pose is a downsample.
 */
const BASE_SIZE = 150;
const RENDER_SCALE = 2;

export default function StandartScrollOrb() {
  const still = useOrbStill();
  const orbRef = useRef(null);
  const zonesRef = useRef([]);
  const targetRef = useRef(null);
  const currentRef = useRef(null);

  useEffect(() => {
    if (still) return undefined;

    const orb = orbRef.current;
    if (!orb) return undefined;

    const size = BASE_SIZE * RENDER_SCALE;

    const measure = () => {
      zonesRef.current = Array.from(document.querySelectorAll('[data-standart-zone]')).map(
        (node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.getAttribute('data-standart-zone'),
            top: rect.top + window.scrollY,
            height: rect.height,
          };
        }
      );
    };

    const poseFor = (zoneId) => ORB_ZONES[zoneId] ?? DEFAULT_ZONE;

    const readTarget = () => {
      const zones = zonesRef.current;
      if (!zones.length) return;

      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const midpoint = window.scrollY + vh * 0.5;

      // The zone the reader is in: the last one whose top is above the middle of
      // the viewport. Same rule the nav's scroll-spy uses, so the orb and the
      // underline never disagree about where the reader is.
      let active = zones[0];
      zones.forEach((zone) => {
        if (zone.top <= midpoint) active = zone;
      });

      const pose = poseFor(active.id);
      const progress = Math.max(
        0,
        Math.min(1, (midpoint - active.top) / Math.max(1, active.height))
      );

      const x = pose.side === 'left' ? vw * 0.22 : pose.side === 'right' ? vw * 0.78 : vw * 0.5;
      const y = pose.lock ? vh * pose.y : vh * pose.y + pose.yDrift * vh * progress;
      // Narrow screens get a smaller orb: at 5.2x on a phone the hero pose fills
      // the viewport and the headline is unreadable over it.
      const scale = pose.scale * (vw < 700 ? 0.7 : 1);

      targetRef.current = { x, y, s: scale, a: pose.alpha };
    };

    let frame = 0;
    const tick = () => {
      const target = targetRef.current;
      if (target) {
        if (!currentRef.current) currentRef.current = { ...target, a: 0 };
        const c = currentRef.current;
        // A critically-damped chase. The lag is the effect: raise the constant
        // and the orb is welded to the scrollbar, which reads as a background
        // image rather than something moving.
        c.x += (target.x - c.x) * ORB_LERP;
        c.y += (target.y - c.y) * ORB_LERP;
        c.s += (target.s - c.s) * ORB_LERP;
        c.a += (target.a - c.a) * ORB_LERP;

        orb.style.transform = `translate3d(${c.x - size / 2}px, ${c.y - size / 2}px, 0) scale(${c.s / RENDER_SCALE})`;
        orb.style.opacity = String(c.a);
      }
      frame = requestAnimationFrame(tick);
    };

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measure();
        readTarget();
      }, ORB_RESIZE_DEBOUNCE_MS);
    };

    measure();
    readTarget();
    const remeasures = ORB_REMEASURE_MS.map((delay) =>
      setTimeout(() => {
        measure();
        readTarget();
      }, delay)
    );

    window.addEventListener('scroll', readTarget, { passive: true });
    window.addEventListener('resize', onResize);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      remeasures.forEach(clearTimeout);
      window.removeEventListener('scroll', readTarget);
      window.removeEventListener('resize', onResize);
    };
  }, [still]);

  if (still) {
    // The static branch. One orb, parked top-right, out of the way of the text.
    return (
      <Box
        aria-hidden="true"
        data-standart-orb="still"
        sx={{
          position: 'fixed',
          top: { xs: 96, md: 140 },
          right: { xs: 8, md: 56 },
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0.18,
        }}
      >
        <LineOrb size={BASE_SIZE} accent={INK.bright} paused title="" />
      </Box>
    );
  }

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        // The page scrolls vertically under this layer; without it a touch that
        // starts on the orb does nothing.
        touchAction: 'pan-y',
        overflow: 'hidden',
      }}
    >
      <Box
        ref={orbRef}
        data-standart-orb="live"
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: 0,
          willChange: 'transform, opacity',
        }}
      >
        <LineOrb size={BASE_SIZE * RENDER_SCALE} accent={INK.bright} title="" />
      </Box>
    </Box>
  );
}
