// Business models illustration - ascending isometric bar chart with a curving
// trend arrow rising to the upper right, faint wave lines in the background,
// and a concentric floor disc. Transparent SVG, currentColor-tinted to
// inherit the simple-mode neon green.
//
// Designed to slot into the right-side .mkt-tile__illustration container.
// The whole scene is translated right via the wrapper <g> so the tallest bar
// hugs the tile's right edge - same pattern as Skills / Tools / Consilium.

// Iso-depth offset for the top face of each bar.
const DEPTH_X = 4;
const DEPTH_Y = -3;

function Bar({ x, h, w = 14, baseY }) {
  const topY = baseY - h;
  // Top face - parallelogram giving 3D depth.
  const topPts = [
    [x, topY],
    [x + w, topY],
    [x + w + DEPTH_X, topY + DEPTH_Y],
    [x + DEPTH_X, topY + DEPTH_Y],
  ]
    .map((p) => p.join(','))
    .join(' ');
  // Right face - also a parallelogram, from front-right to back-right.
  const rightPts = [
    [x + w, topY],
    [x + w + DEPTH_X, topY + DEPTH_Y],
    [x + w + DEPTH_X, baseY + DEPTH_Y],
    [x + w, baseY],
  ]
    .map((p) => p.join(','))
    .join(' ');
  return (
    <g stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round">
      {/* Front face */}
      <rect x={x} y={topY} width={w} height={h} fill="currentColor" fillOpacity="0.30" />
      {/* Right (side) face */}
      <polygon points={rightPts} fill="currentColor" fillOpacity="0.18" />
      {/* Top face */}
      <polygon points={topPts} fill="currentColor" fillOpacity="0.45" />
    </g>
  );
}

export default function BusinessArt() {
  const baseY = 158;
  // Bars ascending left -> right.
  const bars = [
    { x: 20, h: 22 },
    { x: 40, h: 36 },
    { x: 60, h: 50 },
    { x: 80, h: 66 },
    { x: 100, h: 86 },
    { x: 120, h: 108 }, // tallest, rightmost - anchors the composition
  ];

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="biz-glow" cx="60%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Scaled 0.7 (30% smaller) and pushed further right so the chart sits
          in the right third of the tile. */}
      <g transform="translate(119, 30) scale(0.7)">
        {/* Soft glow behind the chart */}
        <ellipse cx="90" cy="110" rx="100" ry="80" fill="url(#biz-glow)" />

        {/* Faint wavy "data flow" lines behind the chart */}
        <g stroke="currentColor" strokeWidth="0.6" fill="none" strokeLinecap="round">
          <path d="M -10 80 Q 30 60 70 76 T 150 60 T 220 50" opacity="0.18" />
          <path
            d="M -10 100 Q 30 84 70 96 T 150 84 T 220 76"
            opacity="0.14"
            strokeDasharray="2 3"
          />
        </g>

        {/* Scattered data dots */}
        <g fill="currentColor">
          {[
            [10, 50, 1.0],
            [30, 36, 1.2],
            [56, 56, 0.9],
            [88, 38, 1.1],
            [122, 28, 1.0],
            [148, 18, 1.4],
            [170, 40, 1.1],
            [12, 132, 0.9],
            [44, 142, 1.0],
            [76, 150, 0.9],
            [108, 146, 1.0],
            [156, 138, 1.1],
          ].map(([cx, cy, r], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} opacity={0.55 + (i % 3) * 0.1} />
          ))}
        </g>

        {/* Bars */}
        {bars.map((b, i) => (
          <Bar key={i} x={b.x} h={b.h} baseY={baseY} />
        ))}

        {/* Trend arrow - curved path rising from lower-left to upper-right,
            animated via CSS (stroke-dashoffset draw). */}
        <g stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Glow underlay */}
          <path
            d="M 14 134 Q 60 100 100 84 T 162 30"
            strokeWidth="3"
            opacity="0.16"
            className="mkt-art-biz__trend"
          />
          {/* Main stroke */}
          <path
            d="M 14 134 Q 60 100 100 84 T 162 30"
            strokeWidth="1.8"
            opacity="0.95"
            className="mkt-art-biz__trend"
          />
          {/* Arrow head - pointing up-right */}
          <path d="M 162 30 L 154 28 M 162 30 L 160 38" strokeWidth="1.8" opacity="0.95" />
        </g>

        {/* Concentric floor disc beneath the bars */}
        <g fill="none" stroke="currentColor">
          <ellipse cx="80" cy="172" rx="92" ry="9" strokeWidth="0.5" opacity="0.20" />
          <ellipse cx="80" cy="172" rx="74" ry="7" strokeWidth="0.5" opacity="0.26" />
          <ellipse cx="80" cy="172" rx="54" ry="5" strokeWidth="0.5" opacity="0.32" />
          <ellipse cx="80" cy="172" rx="32" ry="3" strokeWidth="0.5" opacity="0.40" />
        </g>
      </g>
    </svg>
  );
}
