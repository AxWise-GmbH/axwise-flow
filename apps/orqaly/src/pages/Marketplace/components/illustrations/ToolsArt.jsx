// Tools illustration - isometric "node-network" of glowing cubes.
// Central cube carries a "</>" code mark; four satellite cubes are linked to
// it by glow lines, suggesting integrations/APIs orbiting a core. Transparent
// SVG, currentColor-tinted to inherit the simple-mode neon-green theme.
//
// Designed to slot into the right-side .mkt-tile__illustration container.
// The whole scene is translated right via the wrapper <g> so the rightmost
// cube hugs the tile's right edge - same pattern as SkillsArt.
const COS30 = 0.866;
const SIN30 = 0.5;

// Build the 6 outer hex vertices + center point of an isometric cube.
const cube = (cx, cy, L) => ({
  top: [cx, cy - L],
  TR: [cx + L * COS30, cy - L * SIN30],
  BR: [cx + L * COS30, cy + L * SIN30],
  bottom: [cx, cy + L],
  BL: [cx - L * COS30, cy + L * SIN30],
  TL: [cx - L * COS30, cy - L * SIN30],
  center: [cx, cy],
});

const toPts = (...pts) => pts.map((p) => p.join(',')).join(' ');

// Render a single cube's three visible faces (top brightest, sides dimmer).
function CubeFaces({ c, accent = false }) {
  return (
    <g stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" fill="currentColor">
      <polygon points={toPts(c.top, c.TR, c.center, c.TL)} fillOpacity={accent ? 0.42 : 0.32} />
      <polygon points={toPts(c.TR, c.BR, c.bottom, c.center)} fillOpacity={accent ? 0.22 : 0.16} />
      <polygon points={toPts(c.TL, c.center, c.bottom, c.BL)} fillOpacity={accent ? 0.12 : 0.08} />
    </g>
  );
}

export default function ToolsArt() {
  // Central cube + four satellites.
  const central = cube(100, 102, 28);
  const satellites = [
    cube(54, 66, 17), // upper-left
    cube(146, 66, 17), // upper-right
    cube(58, 140, 15), // lower-left
    cube(142, 140, 15), // lower-right
  ];

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="tools-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Push scene right so it hugs the tile's right edge. */}
      <g transform="translate(55, 0)">
        {/* Soft glow behind the central cube */}
        <ellipse cx="100" cy="100" rx="76" ry="60" fill="url(#tools-glow)" />

        {/* Subtle isometric grid floor - faint, low contrast */}
        <g stroke="currentColor" strokeWidth="0.35" opacity="0.18">
          {[-3, -2, -1, 0, 1, 2, 3].map((i) => {
            const off = i * 14;
            return (
              <g key={i}>
                <line
                  x1={100 + off * COS30 - 60 * COS30}
                  y1={170 + off * SIN30 - 60 * SIN30}
                  x2={100 + off * COS30 + 60 * COS30}
                  y2={170 + off * SIN30 + 60 * SIN30}
                />
                <line
                  x1={100 + off * COS30 + 60 * COS30}
                  y1={170 + off * SIN30 - 60 * SIN30}
                  x2={100 + off * COS30 - 60 * COS30}
                  y2={170 + off * SIN30 + 60 * SIN30}
                />
              </g>
            );
          })}
        </g>

        {/* Glow lines from each satellite to the central cube */}
        <g stroke="currentColor" strokeWidth="0.9" opacity="0.55" strokeLinecap="round">
          {satellites.map((s, i) => (
            <line
              key={i}
              x1={s.center[0]}
              y1={s.center[1]}
              x2={central.center[0]}
              y2={central.center[1]}
            />
          ))}
        </g>

        {/* Halo dots at every node - animated via CSS (endpoint relay). */}
        <g fill="currentColor">
          <circle
            cx={central.center[0]}
            cy={central.center[1]}
            r="5"
            opacity="0.18"
            className="mkt-art-tools__core"
          />
          {satellites.map((s, i) => (
            <circle
              key={`halo-${i}`}
              cx={s.center[0]}
              cy={s.center[1]}
              r="3.5"
              opacity="0.18"
              className="mkt-art-tools__sat"
              style={{ '--i': i }}
            />
          ))}
        </g>

        {/* Cubes - satellites first so the central one sits on top */}
        {satellites.map((s, i) => (
          <CubeFaces key={`s-${i}`} c={s} />
        ))}
        <CubeFaces c={central} accent />

        {/* "</>" code mark sitting on the central cube's top face */}
        <g
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.95"
        >
          <polyline points="95,84 88,90 95,96" />
          <polyline points="105,84 112,90 105,96" />
          <line x1="103" y1="82" x2="97" y2="98" />
        </g>

        {/* Tiny icon dots on satellite cubes' top faces - abstract API marks */}
        <g fill="currentColor" opacity="0.9">
          <circle cx="54" cy="60" r="1.4" />
          <circle cx="49" cy="65" r="1.1" />
          <circle cx="59" cy="65" r="1.1" />
          <circle cx="143" cy="60" r="1.1" />
          <circle cx="149" cy="64" r="1.1" />
          <circle cx="55" cy="138" r="1.0" />
          <circle cx="61" cy="138" r="1.0" />
          <circle cx="142" cy="138" r="1.1" />
        </g>
      </g>
    </svg>
  );
}
