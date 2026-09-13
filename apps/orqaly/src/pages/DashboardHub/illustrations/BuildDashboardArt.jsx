// Build-a-dashboard illustration - neural brain mesh in the center with 4
// floating monitor panels (line chart / bar chart / data table / donut gauge)
// orbiting it. Transparent SVG, currentColor-tinted. The brain is a compact
// reprise of the SkillsArt mesh; the panels echo the dashboard motif from
// DashboardsArt.
import './illustrations.css';

export default function BuildDashboardArt() {
  // Brain nodes - compact placement within a roughly elliptical brain
  // silhouette. Coordinates are local; whole brain is rendered inside a
  // sub-group that's translated/scaled into position.
  const nodes = [
    // Top crown
    [82, 30],
    [100, 26],
    [118, 30],
    // Upper band
    [62, 50],
    [90, 48],
    [112, 48],
    [138, 50],
    // Mid
    [50, 76],
    [78, 72],
    [100, 78],
    [122, 72],
    [150, 76],
    // Lower band
    [56, 102],
    [84, 100],
    [104, 102],
    [126, 100],
    [146, 102],
    // Bottom band + cerebellum + stem
    [66, 128],
    [90, 130],
    [110, 130],
    [134, 128],
    [80, 150],
    [104, 152],
    [124, 150],
    [102, 168],
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [0, 3],
    [0, 4],
    [1, 4],
    [1, 5],
    [2, 5],
    [2, 6],
    [3, 4],
    [4, 5],
    [5, 6],
    [3, 7],
    [3, 8],
    [4, 8],
    [4, 9],
    [5, 9],
    [5, 10],
    [6, 10],
    [6, 11],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [7, 12],
    [8, 12],
    [8, 13],
    [9, 13],
    [9, 14],
    [10, 14],
    [10, 15],
    [11, 15],
    [11, 16],
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [12, 17],
    [13, 17],
    [13, 18],
    [14, 18],
    [14, 19],
    [15, 19],
    [15, 20],
    [16, 20],
    [17, 18],
    [18, 19],
    [19, 20],
    [17, 21],
    [18, 21],
    [18, 22],
    [19, 22],
    [19, 23],
    [20, 23],
    [21, 22],
    [22, 23],
    [21, 24],
    [22, 24],
    [23, 24],
    // A couple of "synapse" jumps
    [1, 9],
    [9, 18],
    [14, 22],
  ];
  const hot = new Set([1, 5, 9, 14, 18, 22]);

  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="build-glow" cx="50%" cy="48%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="translate(40, 0)">
        {/* Soft glow */}
        <ellipse cx="100" cy="100" rx="120" ry="74" fill="url(#build-glow)" />

        {/* Brain - wrapped in a sub-group, scaled to 0.62 so the surrounding
            monitor panels have room. Positioned at the visual center. */}
        <g transform="translate(40, 38) scale(0.62)">
          <path
            d="M 60 56
               Q 48 36 70 28 Q 78 18 92 24 Q 100 18 108 24
               Q 122 18 130 28 Q 152 36 140 56 Q 158 62 156 82
               Q 168 96 152 110 Q 160 130 138 134 Q 132 150 112 144
               L 110 162 Q 100 168 90 162 L 88 144
               Q 68 150 62 134 Q 40 130 48 110 Q 32 96 44 82
               Q 42 62 60 56 Z"
            stroke="currentColor"
            strokeWidth="1.6"
            opacity="0.55"
          />
          {/* Wireframe mesh */}
          <g stroke="currentColor" strokeWidth="0.9" opacity="0.40">
            {edges.map(([a, b], i) => (
              <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />
            ))}
          </g>
          {/* Glowing nodes - hot-node halos blink in sequence via CSS */}
          <g fill="currentColor">
            {(() => {
              let hotIdx = 0;
              return nodes.map(([x, y], i) => {
                const isHot = hot.has(i);
                const halo = isHot ? (
                  <circle
                    cx={x}
                    cy={y}
                    r="5"
                    opacity="0.25"
                    className="hub-art-build__hot"
                    style={{ '--i': hotIdx++ }}
                  />
                ) : null;
                return (
                  <g key={i}>
                    {halo}
                    <circle cx={x} cy={y} r={isHot ? 2.4 : 1.4} opacity={isHot ? 1 : 0.7} />
                  </g>
                );
              });
            })()}
          </g>
        </g>

        {/* 4 floating monitor panels around the brain */}
        {/* Panel 1: top-left - line chart */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="2"
            y="32"
            width="50"
            height="36"
            rx="4"
            fill="currentColor"
            fillOpacity="0.18"
            strokeWidth="0.8"
          />
          <polyline
            points="8,58 16,50 22,54 30,44 38,46 46,38"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            opacity="0.95"
          />
          <g fill="currentColor" opacity="0.9">
            <circle cx="16" cy="50" r="1.3" />
            <circle cx="30" cy="44" r="1.3" />
            <circle cx="46" cy="38" r="1.5" />
          </g>
        </g>

        {/* Panel 2: top-right - bar chart */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="146"
            y="28"
            width="52"
            height="40"
            rx="4"
            fill="currentColor"
            fillOpacity="0.18"
            strokeWidth="0.8"
          />
          <g fill="currentColor" opacity="0.9">
            <rect x="152" y="54" width="6" height="10" rx="0.8" />
            <rect x="162" y="48" width="6" height="16" rx="0.8" />
            <rect x="172" y="42" width="6" height="22" rx="0.8" />
            <rect x="182" y="36" width="6" height="28" rx="0.8" />
          </g>
        </g>

        {/* Panel 3: bottom-left - data table */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="6"
            y="118"
            width="48"
            height="42"
            rx="4"
            fill="currentColor"
            fillOpacity="0.18"
            strokeWidth="0.8"
          />
          <line x1="6" y1="128" x2="54" y2="128" strokeWidth="0.8" opacity="0.6" />
          <line x1="30" y1="118" x2="30" y2="160" strokeWidth="0.6" opacity="0.45" />
          {/* row lines */}
          <line x1="10" y1="138" x2="26" y2="138" strokeWidth="1" opacity="0.7" />
          <line x1="34" y1="138" x2="50" y2="138" strokeWidth="1" opacity="0.55" />
          <line x1="10" y1="146" x2="24" y2="146" strokeWidth="1" opacity="0.55" />
          <line x1="34" y1="146" x2="48" y2="146" strokeWidth="1" opacity="0.4" />
          <line x1="10" y1="154" x2="26" y2="154" strokeWidth="1" opacity="0.5" />
          <line x1="34" y1="154" x2="46" y2="154" strokeWidth="1" opacity="0.35" />
        </g>

        {/* Panel 4: bottom-right - donut / gauge */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="148"
            y="120"
            width="48"
            height="40"
            rx="4"
            fill="currentColor"
            fillOpacity="0.18"
            strokeWidth="0.8"
          />
          <circle
            cx="172"
            cy="140"
            r="13"
            stroke="currentColor"
            strokeWidth="3.2"
            fill="none"
            opacity="0.40"
          />
          <path
            d="M 172 127 A 13 13 0 0 1 184 145"
            stroke="currentColor"
            strokeWidth="3.2"
            fill="none"
            opacity="0.95"
            strokeLinecap="round"
          />
          <text
            x="172"
            y="143"
            fontSize="6"
            fill="currentColor"
            textAnchor="middle"
            fontWeight="700"
            opacity="0.95"
          >
            62%
          </text>
        </g>

        {/* Dashed connection lines from a few brain hot-nodes to each panel
            - animated marching dashes (data flowing brain → panels). */}
        <g
          stroke="currentColor"
          strokeWidth="0.7"
          strokeDasharray="2 3"
          opacity="0.45"
          strokeLinecap="round"
        >
          {/* brain hot points (in unscaled brain coords): node 1 (100,26), node 5 (112,48), node 18 (90,130), node 22 (104,152) */}
          {/* After translate(40,38) scale(0.62): point at (px,py) becomes (40+px*0.62, 38+py*0.62) */}
          <line
            x1="52"
            y1="50"
            x2="102"
            y2="54"
            className="hub-art-build__wire"
            style={{ '--i': 0 }}
          />
          <line
            x1="146"
            y1="48"
            x2="109"
            y2="68"
            className="hub-art-build__wire"
            style={{ '--i': 1 }}
          />
          <line
            x1="54"
            y1="138"
            x2="96"
            y2="119"
            className="hub-art-build__wire"
            style={{ '--i': 2 }}
          />
          <line
            x1="148"
            y1="140"
            x2="104"
            y2="132"
            className="hub-art-build__wire"
            style={{ '--i': 3 }}
          />
        </g>

        {/* Concentric floor disc */}
        <g fill="none" stroke="currentColor">
          <ellipse cx="100" cy="186" rx="110" ry="9" strokeWidth="0.5" opacity="0.16" />
          <ellipse cx="100" cy="186" rx="84" ry="7" strokeWidth="0.5" opacity="0.24" />
          <ellipse cx="100" cy="186" rx="58" ry="5" strokeWidth="0.5" opacity="0.34" />
          <ellipse cx="100" cy="188" rx="32" ry="3" strokeWidth="0.5" opacity="0.48" />
        </g>

        {/* Sparkle accents */}
        <g fill="currentColor" opacity="0.7">
          <circle cx="58" cy="20" r="1.3" />
          <circle cx="140" cy="14" r="1.2" />
          <circle cx="200" cy="80" r="1.4" />
          <circle cx="6" cy="98" r="1.0" />
          <circle cx="196" cy="170" r="1.3" />
        </g>
      </g>
    </svg>
  );
}
