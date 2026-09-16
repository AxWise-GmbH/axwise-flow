// LineOrb - four fields of fine radial strokes around a hollow core, breathing.
//
// The animated relative of RadialSpokeOrb. That one is static SVG with a CSS
// turn: cheap enough to sit in a list row and never think about it. This one is
// a canvas with a per-frame loop, and it is a SHOWPIECE - a hero, an empty
// state, a splash. Reach for RadialSpokeOrb when the mark is furniture and this
// when the mark is the point.
//
// It has a floor of about 120px. Below that the ring is too thin to hold four
// fields apart, the crescents stop resolving, and what is left is a fuzzy
// circle that RadialSpokeOrb draws better and for nothing. See /orb.
//
// Deliberately outside the shader machinery in src/lib/orb, for the reason
// RadialSpokeOrb already documents: every orb in that pool is a raymarched blob
// on an OPAQUE disc, and its accent model resolves a colour into two saturated
// liquid strands. Both fight this look, which is thin strokes and an empty
// middle. Three things follow from being plain canvas instead:
//
//   1. It has NO ground of its own. The canvas keeps its alpha, so this orb
//      composites over whatever is behind it - a gradient, a glow, a card. The
//      two rules that govern LiquidOrb (flat grounds only, never a halo behind)
//      simply do not apply. Pass `background` only if you want the disc filled.
//   2. It is not in the pool, so it costs its own rAF loop. That is a battery
//      decision on always-mounted chrome: many small LiquidOrbs are cheap
//      because they share one context, and many small LineOrbs are not.
//   3. On dark grounds the strokes composite ADDITIVELY, which is what makes
//      overlapping fields brighten into the pale crescents this shape is built
//      out of. On light grounds that would erase them, so it paints normally
//      and the same overlaps darken instead.
//
// Reduced motion, and the Settings illustration dimmer at zero, leave it on a
// single still frame. Elsewhere in the app a frozen orb is the wrong answer -
// useOrbStill says as much, because a stopped shader is indistinguishable from
// a hung page. This one is the exception on purpose: a still frame of it is a
// finished drawing rather than a stalled animation, and it is the drawing the
// whole thing was derived from.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';

import {
  FIELDS,
  driftAt,
  envelopeAt,
  holeScale,
  inkScale,
  maxReach,
  precomputeJitter,
  strokeAngle,
  strokeCount,
} from '../../lib/orb/lineOrb';
import { useOrbStill } from '../../lib/orb/useOrbDriver';

// The orb radius as a fraction of the box, sized so the furthest a field ever
// reaches still clears the edge - plus a little for the residual wander that
// survives driftAt. Derived rather than guessed, so retuning a field in
// lineOrb.js cannot silently start clipping the frame.
const FIT = 0.5 / (maxReach() + 0.04);

// The frame a still orb holds. Not zero: at zero several fields have not yet
// pulled apart and the crescents have not opened.
const STILL_TIME = 13.7;

// A tab that was in the background for a minute must not resume by fast
// forwarding the wave through every frame it missed.
const MAX_STEP_MS = 50;

// The accent is painted EXACTLY as picked. Nothing lifts it, in either mode.
//
// This used to walk a dark accent toward white (and a pale one toward black)
// until it cleared a luminance floor, on the sound observation that additive
// drawing cannot make a colour brighter than the colour is - a deep accent has
// no light in it to stack. The trouble was the instrument: lighten() mixes
// toward white in RGB and takes the saturation with it, so a deep wine accent
// arrived here as a rose-grey. The orb then matched nothing else on the page,
// while the buttons beside it - which paint primary.main raw - showed the real
// colour. That is a worse failure than being dim, because it reads as a bug
// rather than as a choice.
//
// So a deep accent now draws deep, and on a near-black ground that means faint.
// That is the accepted trade: the orb IS the accent, or it is not worth being
// accented at all. If a floor is ever wanted back, it belongs in HSL - lift
// lightness and hold saturation, the way src/lib/orb/orbAccent.js does it for
// the shader orb, and never through lighten().
//
// Monochrome is untouched by any of this. Its #F5F5F5 / #0A0A0A already sat
// past both floors and were returned unchanged, so the mono orb is byte for
// byte what it always was.

/**
 * @param {object} props
 * @param {number} [props.size=240] rendered box side in CSS px; the orb is square
 * @param {string} [props.accent] override the system accent (palette.primary.main)
 * @param {string} [props.background] fill the disc with this instead of leaving
 *   it transparent; only needed if something behind it must be hidden
 * @param {number} [props.hollow=0.6] fraction of the radius left empty in the middle
 * @param {number} [props.speed=1] multiplier on every rate at once
 * @param {boolean} [props.paused=false] hold a single still frame
 * @param {string} [props.title='Line orb'] accessible label
 */
export default function LineOrb({
  size = 240,
  accent,
  background,
  hollow = 0.6,
  speed = 1,
  paused = false,
  title = 'Line orb',
  sx,
  ...boxProps
}) {
  const theme = useTheme();
  const still = useOrbStill();

  // Additive stacking is what turns two overlapping fields into a pale crescent.
  // On a light ground it would bleach them away instead, so there the same
  // overlaps darken through ordinary alpha.
  const additive = theme.palette.mode === 'dark';
  const stroke = accent || theme.palette.primary.main;

  const canvasRef = useRef(null);
  const elapsedRef = useRef(STILL_TIME);
  const driftRef = useRef({ x: 0, y: 0 });
  const paintRef = useRef(null);
  const [onScreen, setOnScreen] = useState(true);
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');

  // Fixed grain, computed once: hashed rather than random so a re-render - a
  // theme flip, a resize - cannot reshuffle the orb's own edge under it.
  const jitters = useMemo(() => FIELDS.map((field, i) => precomputeJitter(field, i)), []);

  const parked = still || paused || hidden || !onScreen;

  const paint = useCallback(
    (time) => {
      const canvas = canvasRef.current;
      // jsdom returns null here, and so does a browser that refuses a context.
      // Both are survivable: the box keeps its space and draws nothing.
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      // The backing store is sized here rather than in an effect of its own.
      // Split across two effects the mount paints twice - once at the canvas
      // element's default 300x150, then again once the real size lands.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const side = Math.max(1, Math.round(size * dpr));
      if (canvas.width !== side || canvas.height !== side) {
        canvas.width = side;
        canvas.height = side;
      }

      const R = size * FIT;
      const innerR = R * hollow;
      const glowWidth = 1 + 1.6 * Math.min(1, R / 280);
      // A small orb packs its strokes tighter; thin them by the same factor so
      // it stays the same weight of ink and only gets finer.
      const ink = inkScale(R);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, size, size);
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);
      }

      const drift = driftAt(FIELDS, time, driftRef.current);
      const cx = size / 2 - drift.x * R;
      const cy = size / 2 - drift.y * R;
      const hole = holeScale(time);

      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      ctx.strokeStyle = stroke;

      // Washes first, combs over the top: the combs are the readable half and
      // must not sit under a grey band.
      for (let pass = 0; pass < 2; pass += 1) {
        for (let f = 0; f < FIELDS.length; f += 1) {
          const field = FIELDS[f];
          if (field.wash !== (pass === 0)) continue;

          const jitter = jitters[f];
          const n = strokeCount(field.count, R);
          const ri = innerR * field.hole * hole;

          // One path for the whole field, because the whole field is one
          // colour. Every stroke in it is drawn at the same alpha; the tonal
          // range in this shape comes from fields crossing, never from
          // stroke-to-stroke variation inside a field.
          const path = new Path2D();

          for (let i = 0; i < n; i += 1) {
            const angle = strokeAngle(field, i, n, time);
            const reach = (envelopeAt(field, angle, time) + jitter[i % field.count]) * R;
            if (reach <= ri) continue;

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            path.moveTo(cx + cos * ri, cy + sin * ri);
            path.lineTo(cx + cos * reach, cy + sin * reach);
          }

          // Flat ends on a wash: that hard outer arc is what makes a crescent a
          // shape rather than a smudge. Round ends on a comb, where they take
          // the shimmer off the tips as the wave sweeps through them.
          ctx.lineCap = field.wash ? 'butt' : 'round';

          const alpha = Math.min(1, field.alpha * ink * (additive ? 1 : 0.9));

          if (!field.wash) {
            ctx.globalAlpha = alpha * 0.05; // the smoke around a stroke
            ctx.lineWidth = glowWidth;
            ctx.stroke(path);
          }

          ctx.globalAlpha = alpha; // the stroke itself
          ctx.lineWidth = 1;
          ctx.stroke(path);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
    [additive, background, hollow, size, stroke, jitters]
  );

  // No dep array, the same reasoning as LiquidOrb's push: any render at all - a
  // new accent, a theme flip, a resize - needs a repaint, including while the
  // orb is parked and nothing else will ever paint it. It also means a running
  // orb is never blank for the frame before its loop starts.
  //
  // paint is held in a ref rather than being a dependency of the loop, the way
  // useOrbDriver does it: an accent change must repaint, not tear down and
  // restart the animation.
  useEffect(() => {
    paintRef.current = paint;
    paint(elapsedRef.current);
  });

  // An orb scrolled out of view costs exactly what one in view costs and buys
  // nothing, so it stops rather than drawing where nobody is looking.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(canvas);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (parked) return undefined;

    let raf = 0;
    let last = 0;
    const tick = (now) => {
      if (!last) last = now;
      const step = Math.min(now - last, MAX_STEP_MS);
      last = now;
      elapsedRef.current += (step / 1000) * speed;
      paintRef.current?.(elapsedRef.current);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [parked, speed]);

  return (
    <Box sx={{ width: size, height: size, flexShrink: 0, ...sx }} {...boxProps}>
      <Box
        component="canvas"
        ref={canvasRef}
        role="img"
        aria-label={title}
        sx={{ display: 'block', width: '100%', height: '100%' }}
      />
    </Box>
  );
}
