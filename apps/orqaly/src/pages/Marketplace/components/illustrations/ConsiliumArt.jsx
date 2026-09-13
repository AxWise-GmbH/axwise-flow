// Consilium illustration - a council of 6 member avatars orbiting a central
// shield-and-checkmark, sitting on top of a faint radar/target pattern.
// Transparent SVG, currentColor-tinted to inherit the simple-mode neon green.
//
// Designed to slot into the right-side .mkt-tile__illustration container.
// The scene is translated right via the wrapper <g> so the rightmost member
// hugs the tile's right edge - same pattern as SkillsArt / ToolsArt.

// A single member badge: outer ring + head + shoulders silhouette.
function Member({ x, y, r = 9 }) {
  return (
    <g>
      {/* Outer badge ring */}
      <circle cx={x} cy={y} r={r + 3.2} fill="currentColor" fillOpacity="0.10" />
      <circle
        cx={x}
        cy={y}
        r={r + 3.2}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.7"
        opacity="0.55"
      />
      {/* Head */}
      <circle cx={x} cy={y - r * 0.45} r={r * 0.42} fill="currentColor" opacity="0.95" />
      {/* Shoulders / torso arc */}
      <path
        d={`M ${x - r * 0.78} ${y + r * 0.62}
            Q ${x} ${y - r * 0.05} ${x + r * 0.78} ${y + r * 0.62}
            L ${x + r * 0.78} ${y + r * 0.95}
            Q ${x} ${y + r * 0.45} ${x - r * 0.78} ${y + r * 0.95} Z`}
        fill="currentColor"
        opacity="0.85"
      />
    </g>
  );
}

export default function ConsiliumArt() {
  const cx = 100,
    cy = 104;

  // 6 members evenly spaced around the center at radius 62.
  // Angles in degrees, starting from top (0°) going clockwise.
  const radius = 62;
  const members = [0, 60, 120, 180, 240, 300].map((deg) => {
    const rad = (deg - 90) * (Math.PI / 180); // -90° so 0° is at the top
    return {
      x: cx + Math.cos(rad) * radius,
      y: cy + Math.sin(rad) * radius,
      r: 9,
    };
  });

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="consilium-glow" cx="50%" cy="52%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Push scene right so it hugs the tile's right edge. */}
      <g transform="translate(55, 0)">
        {/* Soft central glow */}
        <ellipse cx={cx} cy={cy} rx="78" ry="74" fill="url(#consilium-glow)" />

        {/* Faint radar / concentric rings beneath the council - animated
            via CSS (radar sweep). Innermost ring uses --i=0 so it fires first. */}
        <g fill="none" stroke="currentColor">
          <ellipse
            cx={cx}
            cy={cy + 8}
            rx="86"
            ry="22"
            strokeWidth="0.5"
            opacity="0.18"
            className="mkt-art-consilium__ring"
            style={{ '--i': 3 }}
          />
          <ellipse
            cx={cx}
            cy={cy + 8}
            rx="68"
            ry="17"
            strokeWidth="0.5"
            opacity="0.22"
            className="mkt-art-consilium__ring"
            style={{ '--i': 2 }}
          />
          <ellipse
            cx={cx}
            cy={cy + 8}
            rx="50"
            ry="12"
            strokeWidth="0.5"
            opacity="0.28"
            className="mkt-art-consilium__ring"
            style={{ '--i': 1 }}
          />
          <ellipse
            cx={cx}
            cy={cy + 8}
            rx="32"
            ry="7"
            strokeWidth="0.5"
            opacity="0.35"
            className="mkt-art-consilium__ring"
            style={{ '--i': 0 }}
          />
        </g>

        {/* Spoke connection lines from center to each member */}
        <g stroke="currentColor" strokeWidth="0.8" opacity="0.50" strokeLinecap="round">
          {members.map((m, i) => (
            <line key={i} x1={cx} y1={cy} x2={m.x} y2={m.y} />
          ))}
        </g>

        {/* Outer dashed ring connecting members visually (council circle) */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.55"
          strokeDasharray="2 4"
          opacity="0.40"
        />

        {/* Central shield + checkmark */}
        <g>
          {/* Halo behind shield */}
          <circle cx={cx} cy={cy} r="18" fill="currentColor" opacity="0.10" />
          {/* Shield silhouette */}
          <path
            d="M 100 84
               L 116 90
               L 115 110
               Q 100 126 85 110
               L 84 90 Z"
            fill="currentColor"
            fillOpacity="0.30"
            stroke="currentColor"
            strokeWidth="1"
          />
          {/* Checkmark inside shield */}
          <path
            d="M 92 102 L 98 109 L 110 95"
            stroke="currentColor"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Members on top so they don't get covered by spokes */}
        {members.map((m, i) => (
          <Member key={i} {...m} />
        ))}
      </g>
    </svg>
  );
}
