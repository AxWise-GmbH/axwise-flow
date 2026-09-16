/**
 * Procedurally builds the "AI head filling with data" Lottie animation used in
 * the Profile & Brain card. Generating it (rather than shipping a fixed JSON)
 * lets the illustration track the MUI theme primary color, so it matches the
 * Voice waveform's accent exactly. The motion: a translucent "brain" fills the
 * head from the bottom up while small data dots drop in, on a 3s loop.
 */

/** "#1e88e5" -> [0.118, 0.533, 0.898] (Lottie colors are normalized 0..1). */
export function hexToLottieRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || '').trim());
  if (!m) return [0.2, 0.5, 0.9];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

const fill = (rgb, opacity) => ({
  ty: 'fl',
  c: { a: 0, k: [...rgb, 1] },
  o: { a: 0, k: opacity },
  nm: 'fill',
});
const stroke = (rgb, opacity, w) => ({
  ty: 'st',
  c: { a: 0, k: [...rgb, 1] },
  o: { a: 0, k: opacity },
  w: { a: 0, k: w },
  lc: 2,
  lj: 2,
  nm: 'stroke',
});
const ellipse = (size) => ({ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: size }, nm: 'el' });
const tr = () => ({
  ty: 'tr',
  p: { a: 0, k: [0, 0] },
  a: { a: 0, k: [0, 0] },
  s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 },
  o: { a: 0, k: 100 },
});

/** Shape layer with a static transform. */
function shapeLayer(
  ind,
  nm,
  items,
  { p, a = [0, 0], s = { a: 0, k: [100, 100, 100] }, o = { a: 0, k: 100 } }
) {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: { o, r: { a: 0, k: 0 }, p, a: { a: 0, k: [...a, 0] }, s },
    ao: 0,
    shapes: [{ ty: 'gr', it: [...items, tr()], nm }],
    ip: 0,
    op: 90,
    st: 0,
    bm: 0,
  };
}

/** Build the animation object for a given theme color (hex string). */
export function buildBrainLottie(hex) {
  const rgb = hexToLottieRgb(hex);

  // Brain fill: anchored at its bottom so scaleY grows it upward (the "filling").
  const brainFill = shapeLayer(3, 'brain-fill', [ellipse([104, 118]), fill(rgb, 45)], {
    p: { a: 0, k: [120, 139, 0] },
    a: [0, 59],
    s: {
      a: 1,
      k: [
        { t: 0, s: [100, 30, 100] },
        { t: 45, s: [100, 100, 100] },
        { t: 90, s: [100, 30, 100] },
      ],
    },
  });

  const dot = (ind, x, kf, okf) =>
    shapeLayer(ind, `dot-${ind}`, [ellipse([12, 12]), fill(rgb, 95)], {
      p: { a: 1, k: kf },
      o: { a: 1, k: okf },
    });

  const dot1 = dot(
    1,
    100,
    [
      { t: 0, s: [100, 18, 0] },
      { t: 60, s: [100, 120, 0] },
      { t: 90, s: [100, 18, 0] },
    ],
    [
      { t: 0, s: [0] },
      { t: 14, s: [95] },
      { t: 50, s: [95] },
      { t: 72, s: [0] },
      { t: 90, s: [0] },
    ]
  );

  const dot2 = dot(
    2,
    142,
    [
      { t: 0, s: [142, 10, 0] },
      { t: 78, s: [142, 124, 0] },
      { t: 90, s: [142, 10, 0] },
    ],
    [
      { t: 0, s: [0] },
      { t: 22, s: [95] },
      { t: 64, s: [95] },
      { t: 84, s: [0] },
      { t: 90, s: [0] },
    ]
  );

  const headOutline = shapeLayer(4, 'head-outline', [ellipse([132, 152]), stroke(rgb, 90, 4)], {
    p: { a: 0, k: [120, 80, 0] },
  });
  const headBase = shapeLayer(5, 'head-base', [ellipse([132, 152]), fill(rgb, 10)], {
    p: { a: 0, k: [120, 80, 0] },
  });

  return {
    v: '5.9.0',
    fr: 30,
    ip: 0,
    op: 90,
    w: 240,
    h: 160,
    nm: 'brain-fill',
    ddd: 0,
    assets: [],
    layers: [dot1, dot2, headOutline, brainFill, headBase],
  };
}

export default buildBrainLottie;
