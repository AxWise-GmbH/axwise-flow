// Brain neural-network illustration. Transparent SVG, tinted via currentColor
// so it inherits whatever color the parent passes (neon green in simple mode).
// Designed for the right-side .mkt-tile__illustration slot which already
// applies a left-fade mask + opacity 0.55.
export default function SkillsArt() {
  // Nodes laid out within a brain silhouette: rounded top lobes,
  // wider middle, narrower cerebellum, brainstem tail.
  const nodes = [
    // Top crown
    [82, 30],
    [100, 26],
    [118, 30],
    // Upper band
    [62, 48],
    [88, 44],
    [112, 44],
    [138, 48],
    // Mid-upper
    [50, 70],
    [76, 66],
    [100, 70],
    [124, 66],
    [150, 70],
    // Mid-lower
    [54, 94],
    [82, 92],
    [104, 96],
    [126, 92],
    [148, 94],
    // Lower band
    [62, 118],
    [88, 116],
    [110, 118],
    [134, 116],
    // Cerebellum
    [78, 140],
    [102, 142],
    [124, 140],
    // Brainstem
    [100, 158],
  ];

  // Adjacent-neighbor mesh, plus a few "synapse" diagonals.
  const edges = [
    // Top crown
    [0, 1],
    [1, 2],
    // Crown -> upper band
    [0, 3],
    [0, 4],
    [1, 4],
    [1, 5],
    [2, 5],
    [2, 6],
    // Upper band
    [3, 4],
    [4, 5],
    [5, 6],
    // Upper -> mid-upper
    [3, 7],
    [3, 8],
    [4, 8],
    [4, 9],
    [5, 9],
    [5, 10],
    [6, 10],
    [6, 11],
    // Mid-upper
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    // Mid-upper -> mid-lower
    [7, 12],
    [8, 12],
    [8, 13],
    [9, 13],
    [9, 14],
    [10, 14],
    [10, 15],
    [11, 15],
    [11, 16],
    // Mid-lower
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    // Mid-lower -> lower band
    [12, 17],
    [13, 17],
    [13, 18],
    [14, 18],
    [14, 19],
    [15, 19],
    [15, 20],
    [16, 20],
    // Lower band
    [17, 18],
    [18, 19],
    [19, 20],
    // Lower -> cerebellum
    [17, 21],
    [18, 21],
    [18, 22],
    [19, 22],
    [19, 23],
    [20, 23],
    // Cerebellum
    [21, 22],
    [22, 23],
    // Cerebellum -> brainstem
    [21, 24],
    [22, 24],
    [23, 24],
    // Synapse jumps (a few cross-lines for the holographic look)
    [1, 9],
    [4, 13],
    [5, 14],
    [9, 18],
    [14, 22],
  ];

  // Indices that get a brighter "hot" node + halo.
  const hotIndices = new Set([1, 5, 9, 14, 18, 22]);

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="skills-brain-glow" cx="50%" cy="48%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.20" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Shift brain content right beyond the viewBox so the brain hugs the
          right edge of the tile and partially bleeds off-screen - combined
          with preserveAspectRatio="xMaxYMid meet" + the tile's overflow:hidden
          the right portion is clipped, giving a decorative "edge bleed" look. */}
      <g transform="translate(55, 0)">
        {/* Soft inner glow inside the brain area */}
        <ellipse cx="100" cy="92" rx="76" ry="72" fill="url(#skills-brain-glow)" />

        {/* Brain silhouette - bumpy gyri on top, cerebellum + stem below */}
        <path
          d="M 60 56
           Q 48 36 70 28
           Q 78 18 92 24
           Q 100 18 108 24
           Q 122 18 130 28
           Q 152 36 140 56
           Q 158 62 156 82
           Q 168 96 152 110
           Q 160 130 138 134
           Q 132 150 112 144
           L 110 162
           Q 100 168 90 162
           L 88 144
           Q 68 150 62 134
           Q 40 130 48 110
           Q 32 96 44 82
           Q 42 62 60 56 Z"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.55"
        />

        {/* Wireframe mesh */}
        <g stroke="currentColor" strokeWidth="0.6" opacity="0.45">
          {edges.map(([a, b], i) => (
            <line
              key={i}
              x1={nodes[a][0]}
              y1={nodes[a][1]}
              x2={nodes[b][0]}
              y2={nodes[b][1]}
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* Node halos for hot points - animated via CSS (synapse blink). */}
        <g fill="currentColor">
          {(() => {
            let hotIdx = 0;
            return nodes.map(([x, y], i) =>
              hotIndices.has(i) ? (
                <circle
                  key={`halo-${i}`}
                  cx={x}
                  cy={y}
                  r="4"
                  opacity="0.18"
                  className="mkt-art-skills__hot"
                  style={{ '--i': hotIdx++ }}
                />
              ) : null
            );
          })()}
        </g>

        {/* Node dots */}
        <g fill="currentColor">
          {nodes.map(([x, y], i) => {
            const hot = hotIndices.has(i);
            return <circle key={i} cx={x} cy={y} r={hot ? 1.9 : 1.1} opacity={hot ? 1 : 0.75} />;
          })}
        </g>

        {/* Base disc - faint rings where the brain "rests" */}
        <ellipse
          cx="100"
          cy="180"
          rx="44"
          ry="3.2"
          stroke="currentColor"
          strokeWidth="0.5"
          opacity="0.30"
        />
        <ellipse
          cx="100"
          cy="183"
          rx="30"
          ry="2.0"
          stroke="currentColor"
          strokeWidth="0.4"
          opacity="0.20"
        />
        <ellipse
          cx="100"
          cy="186"
          rx="18"
          ry="1.2"
          stroke="currentColor"
          strokeWidth="0.4"
          opacity="0.12"
        />
      </g>
    </svg>
  );
}
