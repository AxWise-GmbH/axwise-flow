// Organizations illustration - a central shield with checkmark surrounded by
// 5 member figures, each standing on a small isometric pedestal. Hierarchy
// lines link the figures, evoking an org chart / team structure. The whole
// scene sits on a concentric floor disc. Transparent SVG, currentColor-tinted.
//
// Designed to slot into the right-side .mkt-tile__illustration container.
// The scene is translated right via the wrapper <g> so the rightmost figure
// hugs the tile's right edge - same pattern as the other marketplace arts.

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

// Small isometric pedestal that each member stands on.
function Pedestal({ cx, cy, L = 11 }) {
  const c = cube(cx, cy, L);
  return (
    <g stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round" fill="currentColor">
      <polygon points={toPts(c.top, c.TR, c.center, c.TL)} fillOpacity="0.34" />
      <polygon points={toPts(c.TR, c.BR, c.bottom, c.center)} fillOpacity="0.18" />
      <polygon points={toPts(c.TL, c.center, c.bottom, c.BL)} fillOpacity="0.10" />
    </g>
  );
}

// Person silhouette - head + shoulders + outer badge ring.
function Member({ x, y, r = 8.5 }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 3} fill="currentColor" fillOpacity="0.10" />
      <circle
        cx={x}
        cy={y}
        r={r + 3}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.55"
      />
      <circle cx={x} cy={y - r * 0.5} r={r * 0.42} fill="currentColor" opacity="0.95" />
      <path
        d={`M ${x - r * 0.78} ${y + r * 0.58}
            Q ${x} ${y - r * 0.08} ${x + r * 0.78} ${y + r * 0.58}
            L ${x + r * 0.78} ${y + r * 0.95}
            Q ${x} ${y + r * 0.45} ${x - r * 0.78} ${y + r * 0.95} Z`}
        fill="currentColor"
        opacity="0.85"
      />
    </g>
  );
}

export default function OrganizationsArt() {
  const cx = 100,
    cy = 110; // shield center

  // 5 members: one top, two mid, two bottom.
  const top = { x: 100, y: 42, pedY: 60 };
  const midL = { x: 38, y: 96, pedY: 114 };
  const midR = { x: 162, y: 96, pedY: 114 };
  const botL = { x: 60, y: 144, pedY: 162 };
  const botR = { x: 140, y: 144, pedY: 162 };
  const members = [top, midL, midR, botL, botR];

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="orgs-glow" cx="50%" cy="52%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Push scene right so it hugs the tile's right edge. */}
      <g transform="translate(55, 0)">
        {/* Soft central glow */}
        <ellipse cx={cx} cy={cy} rx="86" ry="76" fill="url(#orgs-glow)" />

        {/* Concentric floor disc beneath everything */}
        <g fill="none" stroke="currentColor">
          <ellipse cx={cx} cy="184" rx="92" ry="10" strokeWidth="0.5" opacity="0.16" />
          <ellipse cx={cx} cy="184" rx="74" ry="8" strokeWidth="0.5" opacity="0.22" />
          <ellipse cx={cx} cy="184" rx="56" ry="6" strokeWidth="0.5" opacity="0.30" />
          <ellipse cx={cx} cy="184" rx="38" ry="4" strokeWidth="0.5" opacity="0.42" />
        </g>

        {/* Hierarchy / connection lines:
            top -> midL, top -> midR
            midL -> botL,  midR -> botR
            midL -> shield, midR -> shield   (governance link)
            shield -> botL, shield -> botR    (dashed support lines) */}
        <g stroke="currentColor" strokeWidth="0.7" opacity="0.50" strokeLinecap="round">
          {/* 4 main hierarchy lines - animated via CSS (marching dashes). */}
          <line
            x1={top.x}
            y1={top.y}
            x2={midL.x}
            y2={midL.y}
            className="mkt-art-orgs__flow"
            style={{ '--i': 0 }}
          />
          <line
            x1={top.x}
            y1={top.y}
            x2={midR.x}
            y2={midR.y}
            className="mkt-art-orgs__flow"
            style={{ '--i': 1 }}
          />
          <line
            x1={midL.x}
            y1={midL.y}
            x2={botL.x}
            y2={botL.y}
            className="mkt-art-orgs__flow"
            style={{ '--i': 2 }}
          />
          <line
            x1={midR.x}
            y1={midR.y}
            x2={botR.x}
            y2={botR.y}
            className="mkt-art-orgs__flow"
            style={{ '--i': 3 }}
          />
          {/* Governance links + dashed support lines - static. */}
          <line x1={midL.x} y1={midL.y} x2={cx} y2={cy} />
          <line x1={midR.x} y1={midR.y} x2={cx} y2={cy} />
          <line x1={botL.x} y1={botL.y} x2={cx} y2={cy} strokeDasharray="2 3" opacity="0.40" />
          <line x1={botR.x} y1={botR.y} x2={cx} y2={cy} strokeDasharray="2 3" opacity="0.40" />
        </g>

        {/* Pedestals (drawn before members so members appear standing on them) */}
        {members.map((m, i) => (
          <Pedestal key={`p-${i}`} cx={m.x} cy={m.pedY} L={10} />
        ))}

        {/* Central shield + checkmark */}
        <g>
          <circle cx={cx} cy={cy} r="22" fill="currentColor" opacity="0.12" />
          <path
            d="M 100 88
               L 120 96
               L 119 118
               Q 100 138 81 118
               L 80 96 Z"
            fill="currentColor"
            fillOpacity="0.32"
            stroke="currentColor"
            strokeWidth="1.1"
          />
          <path
            d="M 90 110 L 97 118 L 112 100"
            stroke="currentColor"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Members on top */}
        {members.map((m, i) => (
          <Member key={`m-${i}`} x={m.x} y={m.y} r={i === 0 ? 9.5 : 8.5} />
        ))}
      </g>
    </svg>
  );
}
