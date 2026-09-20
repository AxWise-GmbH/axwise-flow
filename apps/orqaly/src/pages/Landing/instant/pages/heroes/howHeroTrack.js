/*
 * The geometry of the "How it works" opening picture: one line through five stations,
 * laid out three times. `wide` steps down beside the words, `band` rides a wave under them
 * on a tablet, `column` runs straight down a phone. The line and the links are placed from
 * the same numbers, so a station always sits exactly on its line.
 */

/** The id a step of the story carries: the opening links to it, the page puts it on the step. */
export const stepAnchor = (number) => `how-step-${number}`;

// Each layout: the drawing's size, where the line comes in, and a station as [x, y, radius].
// Stations grow along the way: a sentence is small, the finished work is not.
const LAYOUTS = {
  wide: {
    width: 600,
    height: 530,
    // It comes in from the words' side of the picture, so it starts left of the drawing.
    start: [-70, 22],
    stations: [
      [62, 62, 56],
      [180, 136, 59],
      [262, 242, 62],
      [344, 356, 65],
      [450, 456, 68],
    ],
  },
  band: {
    width: 1000,
    height: 196,
    start: [0, 112],
    stations: [
      [96, 80, 60],
      [303, 120, 63],
      [510, 80, 66],
      [717, 120, 69],
      [924, 84, 72],
    ],
  },
  column: {
    width: 68,
    height: 420,
    start: [34, 0],
    stations: [42, 126, 210, 294, 378].map((y) => [34, y, 34]),
  },
};

// The travelling light, in units of the drawing. Short enough to vanish inside a station.
const PULSE_LENGTH = 40;
const SAMPLES = 24;

const round = (value) => Math.round(value * 100) / 100;
const percent = (value) => `${round(value * 100)}%`;

// Catmull-Rom to Bezier: the curve passes through every station without a corner.
function controls(points, index) {
  const before = points[Math.max(index - 1, 0)];
  const from = points[index];
  const to = points[index + 1];
  const after = points[Math.min(index + 2, points.length - 1)];
  return [
    [from[0] + (to[0] - before[0]) / 6, from[1] + (to[1] - before[1]) / 6],
    [to[0] - (after[0] - from[0]) / 6, to[1] - (after[1] - from[1]) / 6],
  ];
}

function bezier(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function curveLength(from, c1, c2, to) {
  let length = 0;
  let last = from;
  for (let step = 1; step <= SAMPLES; step += 1) {
    const t = step / SAMPLES;
    const point = [
      bezier(from[0], c1[0], c2[0], to[0], t),
      bezier(from[1], c1[1], c2[1], to[1], t),
    ];
    length += Math.hypot(point[0] - last[0], point[1] - last[1]);
    last = point;
  }
  return length;
}

function buildTrack({ width, height, start, stations }) {
  const points = [start, ...stations.map(([x, y]) => [x, y])];
  const lengths = [];
  let d = `M${start[0]} ${start[1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [c1, c2] = controls(points, index);
    const to = points[index + 1];
    d += `C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${to[0]} ${to[1]}`;
    lengths.push(curveLength(points[index], c1, c2, to));
  }
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  return {
    width,
    height,
    d,
    start,
    // The line arrives out of the dark: it has faded in fully halfway to the first station.
    fadeEnd: [(start[0] + points[1][0]) / 2, (start[1] + points[1][1]) / 2],
    // Paths are drawn with pathLength="100", so a stop is also a dash length.
    stops: lengths.map((length) => {
      travelled += length;
      return round((travelled / total) * 100);
    }),
    pulse: round((PULSE_LENGTH / total) * 100),
  };
}

export const TRACKS = Object.fromEntries(
  Object.entries(LAYOUTS).map(([name, layout]) => [name, buildTrack(layout)])
);

/** Where station `index` sits in the two scaled layouts, as CSS custom properties. */
export function stationPlace(index) {
  const style = { '--i': index };
  for (const name of ['wide', 'band']) {
    const { width, height, stations } = LAYOUTS[name];
    const [x, y, radius] = stations[index];
    style[`--${name}-x`] = percent(x / width);
    style[`--${name}-y`] = percent(y / height);
    style[`--${name}-size`] = percent((radius * 2) / width);
  }
  return style;
}
