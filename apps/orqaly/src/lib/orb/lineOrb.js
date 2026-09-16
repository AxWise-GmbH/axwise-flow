// The geometry behind LineOrb: four fields of fine radial strokes around a
// hollow core, breathing.
//
// Pure maths, no DOM and no shader. It sits beside dropCharge.js rather than
// inside the WebGL machinery for the same reason RadialSpokeOrb does: every
// orb in orbPool/orbShader is a raymarched blob composited onto an OPAQUE
// disc, and its accent model resolves a colour into two saturated liquid
// strands. Both fight this look, which is thin strokes and an empty middle.
//
// Everything here returns radii as a FRACTION of the orb radius R, so the
// caller owns the pixel scale and this module can be tested without a canvas.
//
// Three motions per field, and keeping them separate is the load-bearing idea:
//
//   grid  - the strokes themselves turning, slowly, each field its own direction
//   lobe  - the wave travelling around the ring, one lap every 12 to 23 seconds
//   pulse - the whole field swelling and shrinking, a 5 to 7 second breath
//
// `lobe` is what makes it read as liquid rather than as a spinning wheel, and
// it is deliberately NOT `grid`. Turning a stroke grid that is ~2px apart at
// wave speed would strobe - the strokes step backwards, the wagon-wheel effect.
// A travelling wave moves no stroke at all; it only changes their lengths, so
// it can run fast and stay smooth. Raising `grid` to wave speeds undoes this.
//
// Every rate is incommensurate with every other, so the orb never returns to a
// state it has already been in - there is no loop to spot.

export const TAU = Math.PI * 2;

/**
 * The smallest box this orb is worth drawing in, in CSS px.
 *
 * Below it the ring is too thin to hold four fields apart: the crescents stop
 * resolving and what is left is a fuzzy circle that RadialSpokeOrb draws better
 * and for nothing. Exported rather than left in a comment so a surface that
 * shrinks its hero can be caught by a test instead of by eye.
 */
export const MIN_USEFUL_SIZE = 120;

// The angular order k sets how many lobes a field has. k = 1 is special: it
// does not deform a field, it DISPLACES it, and that displacement is what opens
// the crescents where two fields cross. See driftAt for the other half of it.
//
// A wash is over a thousand strokes packed tighter than a pixel, which reads as
// a soft grey band with a hard outer arc. A comb is a few hundred separable
// strokes. The source image is both at once, and either alone looks thin.
export const FIELDS = [
  {
    key: 'wash-a',
    count: 1300,
    alpha: 0.175,
    wash: true,
    scale: 0.975,
    hole: 1.012,
    jit: 0.0022,
    grid: -0.052,
    lobe: -0.34,
    pulse: 0.042,
    pw: 0.95,
    pph: 0.6,
    h: [
      { k: 1, amp: 0.112, w: 0.34, ph: 2.74 },
      { k: 2, amp: 0.062, w: 0.55, ph: 0.93 },
      { k: 5, amp: 0.012, w: 0.72, ph: 5.21 },
    ],
  },
  {
    key: 'wash-b',
    count: 1150,
    alpha: 0.115,
    wash: true,
    scale: 0.93,
    hole: 1.006,
    jit: 0.0022,
    grid: -0.07,
    lobe: 0.27,
    pulse: 0.036,
    pw: 1.22,
    pph: 3.1,
    h: [
      { k: 1, amp: 0.128, w: 0.29, ph: 1.63 },
      { k: 3, amp: 0.05, w: 0.61, ph: 4.61 },
      { k: 5, amp: 0.015, w: 0.45, ph: 2.44 },
    ],
  },
  {
    key: 'comb-a',
    count: 340,
    alpha: 0.4,
    wash: false,
    scale: 1.0,
    hole: 1.0,
    jit: 0.009,
    grid: 0.098,
    lobe: 0.44,
    pulse: 0.055,
    pw: 0.84,
    pph: 1.9,
    h: [
      { k: 1, amp: 0.074, w: 0.4, ph: 0.41 },
      { k: 3, amp: 0.078, w: 0.51, ph: 2.13 },
      { k: 6, amp: 0.02, w: 0.68, ph: 4.02 },
    ],
  },
  {
    key: 'comb-b',
    count: 300,
    alpha: 0.3,
    wash: false,
    scale: 1.075,
    hole: 0.99,
    jit: 0.009,
    grid: 0.06,
    lobe: -0.52,
    pulse: 0.048,
    pw: 1.38,
    pph: 4.4,
    h: [
      { k: 1, amp: 0.086, w: 0.46, ph: 5.02 },
      { k: 4, amp: 0.062, w: 0.33, ph: 3.31 },
      { k: 7, amp: 0.015, w: 0.79, ph: 1.24 },
    ],
  },
];

// The core breath is SHARED by every field. Given each field its own phase the
// inner edge becomes four circles pumping out of step, and the crisp hole -
// which is most of what makes this shape read - turns to mush.
const HOLE_DEPTH = 0.02;
const HOLE_RATE = 0.95;

/** Multiplier on the inner radius at `time` seconds. */
export function holeScale(time) {
  return 1 + HOLE_DEPTH * Math.sin(HOLE_RATE * time);
}

/** Absolute screen angle of stroke `i` of `n` in `field`, in radians. */
export function strokeAngle(field, i, n, time) {
  return (i / n) * TAU + field.grid * time;
}

/**
 * Where a field's outer edge sits at `angle`, as a fraction of R.
 *
 * Self-contained on purpose: the per-field pulse could be hoisted out of the
 * stroke loop to save one sine per stroke, but then the component and the tests
 * would be running different code, which is how a shape drifts from its spec.
 */
export function envelopeAt(field, angle, time) {
  const lobe = field.lobe * time;
  let r = field.scale + field.pulse * Math.sin(field.pw * time + field.pph);
  for (let i = 0; i < field.h.length; i += 1) {
    const term = field.h[i];
    r += term.amp * Math.sin(term.k * (angle - lobe) + term.w * time + term.ph);
  }
  return r;
}

/**
 * The average displacement of all fields at `time`, as a fraction of R.
 *
 * A k = 1 harmonic displaces a field rather than deforming it, and those
 * offsets are exactly what open the crescents - so they cannot be removed. Left
 * alone, though, their AVERAGE lets the whole orb wander around its frame,
 * which at small sizes reads as a bug rather than as motion. Drawing about the
 * opposite point cancels the shared part and leaves every field its own offset:
 * the insides slosh, the ensemble holds still.
 *
 * `r = 1 + e*sin(a + p)` is a circle displaced by `e` along `p/2 - p`, which is
 * where the quarter turn below comes from.
 */
export function driftAt(fields, time, out = { x: 0, y: 0 }) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    for (let j = 0; j < field.h.length; j += 1) {
      const term = field.h[j];
      if (term.k !== 1) continue;
      const dir = Math.PI / 2 - ((term.w - field.lobe) * time + term.ph);
      x += term.amp * Math.cos(dir);
      y += term.amp * Math.sin(dir);
    }
  }
  out.x = x / fields.length;
  out.y = y / fields.length;
  return out;
}

// Stroke counts are quoted for R = 280. Scaling them linearly with R would hold
// strokes-per-pixel constant, which leaves a small orb looking sparse: the
// strokes stay 1px wide however small the orb gets, so a 90px orb needs
// relatively MORE of them to read as fine rather than as thin. The square root
// is the middle course.
//
// It needs a ceiling, though, and the ceiling is on DENSITY rather than on
// count. Unbounded, the square root asks a 64px orb for seven strokes per pixel
// of its inner circumference and the whole thing fills in as a solid disc.
const COUNT_ANCHOR = 280;
const COUNT_MAX = 1.4;
const DENSITY_CAP = 1.6; // at most this many times the strokes per pixel of the anchor

/** The stroke-count multiplier at orb radius `R`. */
export function densityScale(R) {
  const t = Math.max(0, R) / COUNT_ANCHOR;
  return Math.min(COUNT_MAX, Math.sqrt(t), DENSITY_CAP * t);
}

/** How many strokes a field of `base` strokes gets at orb radius `R`. */
export function strokeCount(base, R) {
  return Math.max(48, Math.round(base * densityScale(R)));
}

/**
 * How much to thin each stroke to keep total ink constant as density changes.
 *
 * Packing twice as many strokes into a pixel lays down twice the ink, and under
 * additive blending on a saturated accent that is the difference between a fine
 * drawing and a glowing lump. Thinning by the same factor the density rose by
 * holds the orb's WEIGHT steady at every size, so only its fineness changes.
 */
export function inkScale(R) {
  const k = densityScale(R);
  if (k <= 0) return 1;
  return Math.min(1, Math.max(0, R) / COUNT_ANCHOR / k);
}

/**
 * How lit a stroke at `angle` is, given a sweep head at `head` radians.
 *
 * 1 at the head, falling away behind it and reaching 0 once `tail` of the way
 * round the ring. This is what turns the orb into a LOADING mark: LineOrb
 * itself is ambient - it breathes, but nothing about it travels, so nothing
 * about it says work is in progress. A head running round a ring does.
 *
 * The falloff is a power rather than linear so the lit part stays short and
 * bright instead of smearing into an evenly-lit circle, which reads as a
 * decoration again rather than as motion. Below about 1.6 it smears; much above
 * 2 and the tail goes so dark the ring looks sparse rather than fading.
 */
export function sweepAt(angle, head, tail = 0.72) {
  let behind = (head - angle) % TAU;
  if (behind < 0) behind += TAU;
  const span = TAU * Math.max(1e-6, tail);
  if (behind >= span) return 0;
  const t = behind / span;
  return (1 - t) ** 1.8;
}

// A hash rather than Math.random: the texture has to be identical every mount,
// or an orb re-rendering (a theme flip, a resize) would reshuffle its own grain.
function hash(n) {
  let x = n | 0;
  x = x ^ 61 ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return (x >>> 0) / 4294967296;
}

/**
 * A hair of length variation per stroke, so no edge looks machined.
 *
 * Length only. Every stroke in a field is drawn at ONE brightness: in the
 * source image a layer is a single flat white, and all the tonal range comes
 * from layers crossing each other. Varying brightness stroke to stroke inside a
 * layer reads as speckle and hides the crossings that are the whole subject.
 */
export function precomputeJitter(field, seed) {
  const jitter = new Float32Array(field.count);
  for (let i = 0; i < field.count; i += 1) {
    jitter[i] = (hash(i * 31 + seed * 613) - 0.5) * field.jit;
  }
  return jitter;
}

/** The furthest any field reaches, as a fraction of R. Sets the safe framing. */
export function maxReach(fields = FIELDS) {
  return fields.reduce((worst, f) => {
    const swing = f.h.reduce((sum, t) => sum + Math.abs(t.amp), 0);
    return Math.max(worst, f.scale + f.pulse + swing);
  }, 0);
}
