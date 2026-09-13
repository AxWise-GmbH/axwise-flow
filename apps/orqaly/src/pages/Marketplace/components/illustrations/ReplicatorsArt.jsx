// Replicators illustration - a cluster of 7 isometric cubes (1 central
// "master" + 6 satellites) levitating over a strong concentric floor disc.
// Each cube has a bright core mark on its top face suggesting "essence /
// replicable unit". Transparent SVG, currentColor-tinted to inherit the
// simple-mode neon green.
//
// Designed to slot into the right-side .mkt-tile__illustration container.
// The scene is translated right via the wrapper <g> so the rightmost cube
// hugs the tile's right edge - same pattern as Tools / Skills / Consilium.

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

// Render a single cube's three visible faces + optional bright core dot on
// the top face. `coreClassName` / `coreStyle` are applied to the core dot
// and halo so the call site can hook them into CSS animations.
function CubeFaces({ c, accent = false, core = true, coreClassName, coreStyle }) {
  return (
    <g stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" fill="currentColor">
      <polygon points={toPts(c.top, c.TR, c.center, c.TL)} fillOpacity={accent ? 0.48 : 0.34} />
      <polygon points={toPts(c.TR, c.BR, c.bottom, c.center)} fillOpacity={accent ? 0.24 : 0.18} />
      <polygon points={toPts(c.TL, c.center, c.bottom, c.BL)} fillOpacity={accent ? 0.14 : 0.09} />
      {core && (
        <>
          {/* Bright core on the top face */}
          <circle
            cx={c.center[0]}
            cy={(c.top[1] + c.center[1]) / 2}
            r={accent ? 3.4 : 2.0}
            fill="currentColor"
            opacity={accent ? 1.0 : 0.85}
            className={coreClassName}
            style={coreStyle}
          />
          {/* Halo around the core */}
          {accent && (
            <circle
              cx={c.center[0]}
              cy={(c.top[1] + c.center[1]) / 2}
              r="6.5"
              fill="currentColor"
              opacity="0.25"
              className={coreClassName}
              style={coreStyle}
            />
          )}
        </>
      )}
    </g>
  );
}

export default function ReplicatorsArt() {
  // One central master + six satellites at varying positions and sizes.
  // Sorted back-to-front (smaller y = further back) for proper draw order.
  const central = cube(100, 110, 24);
  const satellites = [
    cube(58, 68, 16), // back-left, high
    cube(150, 60, 16), // back-right, high
    cube(38, 118, 14), // middle-far-left
    cube(166, 110, 15), // middle-far-right
    cube(70, 150, 14), // front-left
    cube(140, 156, 14), // front-right
  ];

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="replicators-glow" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Push scene right so the rightmost cube hugs the tile's right edge. */}
      <g transform="translate(55, 0)">
        {/* Soft glow behind the central cube */}
        <ellipse cx="100" cy="110" rx="88" ry="68" fill="url(#replicators-glow)" />

        {/* Strong concentric floor disc (the cubes "stand" on it) */}
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <ellipse cx="100" cy="172" rx="94" ry="14" strokeWidth="0.5" opacity="0.16" />
          <ellipse cx="100" cy="172" rx="78" ry="12" strokeWidth="0.5" opacity="0.22" />
          <ellipse cx="100" cy="172" rx="60" ry="9" strokeWidth="0.5" opacity="0.30" />
          <ellipse cx="100" cy="172" rx="42" ry="6" strokeWidth="0.5" opacity="0.40" />
          <ellipse cx="100" cy="172" rx="24" ry="3.5" strokeWidth="0.5" opacity="0.55" />
          {/* Radial tick marks on the floor */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i / 8) * Math.PI;
            const x1 = 100 + Math.cos(a) * 94;
            const y1 = 172 + Math.sin(a) * 14 * 0.4;
            const x2 = 100 + Math.cos(a) * 24;
            const y2 = 172 + Math.sin(a) * 3.5 * 0.4;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth="0.3"
                opacity="0.22"
                strokeDasharray="2 4"
              />
            );
          })}
        </g>

        {/* Subtle "drop lines" from each cube to the floor - suggesting they
            float above the disc. */}
        <g stroke="currentColor" strokeWidth="0.4" opacity="0.30" strokeDasharray="1.5 2.5">
          {[central, ...satellites].map((c, i) => (
            <line key={i} x1={c.center[0]} y1={c.center[1] + 18} x2={c.center[0]} y2="170" />
          ))}
        </g>

        {/* Cubes - back-to-front order, central last so it sits on top.
            Cores are tagged for CSS animation (replicator pulse). */}
        {satellites.map((s, i) => (
          <CubeFaces
            key={`s-${i}`}
            c={s}
            coreClassName="mkt-art-rep__sat"
            coreStyle={{ '--i': i }}
          />
        ))}
        <CubeFaces c={central} accent coreClassName="mkt-art-rep__core" />
      </g>
    </svg>
  );
}
