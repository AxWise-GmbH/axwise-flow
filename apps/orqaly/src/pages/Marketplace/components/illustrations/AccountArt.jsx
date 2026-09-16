// Account illustration - a large stylized key in the center surrounded by
// 4 floating service "cards" connected by dashed data lines. Sits on a
// concentric floor disc. Transparent SVG, currentColor-tinted to inherit the
// simple-mode neon green. Same right-edge bleed pattern as the other arts.
export default function AccountArt() {
  // 4 small service-card rectangles arranged around the key.
  const cards = [
    { x: 22, y: 50 }, // upper-left
    { x: 156, y: 38 }, // upper-right
    { x: 18, y: 132 }, // lower-left
    { x: 158, y: 138 }, // lower-right
  ];
  const cardW = 26;
  const cardH = 18;

  // Key center coordinates
  const keyCx = 100;
  const keyCy = 100;

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="account-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Push scene right so the rightmost service card hugs the tile's right edge. */}
      <g transform="translate(55, 0)">
        {/* Soft glow behind the key */}
        <ellipse cx={keyCx} cy={keyCy} rx="80" ry="64" fill="url(#account-glow)" />

        {/* Concentric floor disc */}
        <g fill="none" stroke="currentColor">
          <ellipse cx={keyCx} cy="174" rx="90" ry="9" strokeWidth="0.5" opacity="0.18" />
          <ellipse cx={keyCx} cy="174" rx="68" ry="7" strokeWidth="0.5" opacity="0.26" />
          <ellipse cx={keyCx} cy="174" rx="48" ry="5" strokeWidth="0.5" opacity="0.36" />
          <ellipse cx={keyCx} cy="175" rx="26" ry="3" strokeWidth="0.5" opacity="0.48" />
        </g>

        {/* Dashed data lines from each service card to the key center */}
        <g
          stroke="currentColor"
          strokeWidth="0.7"
          strokeDasharray="2 3"
          opacity="0.55"
          strokeLinecap="round"
        >
          {cards.map((c, i) => (
            <line
              key={i}
              x1={c.x + cardW / 2}
              y1={c.y + cardH / 2}
              x2={keyCx}
              y2={keyCy}
              className="mkt-art-account__wire"
              style={{ '--i': i }}
            />
          ))}
        </g>

        {/* Stylized key - head (rounded ring) + shaft + 2 teeth */}
        <g stroke="currentColor" strokeLinejoin="round">
          {/* Key head - outer ring */}
          <circle
            cx={keyCx}
            cy={keyCy - 18}
            r="18"
            fill="currentColor"
            fillOpacity="0.20"
            strokeWidth="1.4"
          />
          {/* Key head - inner cutout */}
          <circle cx={keyCx} cy={keyCy - 18} r="8.5" fill="none" strokeWidth="1.4" opacity="0.85" />
          {/* Key head - small detail dot */}
          <circle cx={keyCx} cy={keyCy - 18} r="2.2" fill="currentColor" opacity="0.9" />

          {/* Key shaft - vertical bar */}
          <rect
            x={keyCx - 4}
            y={keyCy - 2}
            width="8"
            height="36"
            rx="1.5"
            fill="currentColor"
            fillOpacity="0.30"
            strokeWidth="1.2"
          />

          {/* Key teeth - 2 notches on the right side of the shaft */}
          <rect
            x={keyCx + 4}
            y={keyCy + 14}
            width="7"
            height="5"
            rx="1"
            fill="currentColor"
            fillOpacity="0.35"
            strokeWidth="1"
          />
          <rect
            x={keyCx + 4}
            y={keyCy + 24}
            width="5"
            height="5"
            rx="1"
            fill="currentColor"
            fillOpacity="0.35"
            strokeWidth="1"
          />
        </g>

        {/* Glowing core dot on the key head */}
        <circle
          cx={keyCx}
          cy={keyCy - 18}
          r="6"
          fill="currentColor"
          opacity="0.18"
          className="mkt-art-account__core"
        />

        {/* Service cards floating around the key */}
        <g stroke="currentColor" strokeLinejoin="round">
          {cards.map((c, i) => (
            <rect
              key={i}
              x={c.x}
              y={c.y}
              width={cardW}
              height={cardH}
              rx="3"
              fill="currentColor"
              fillOpacity="0.22"
              strokeWidth="0.9"
            />
          ))}
        </g>

        {/* Abstract glyphs inside service cards - small dots + lines */}
        <g fill="currentColor" opacity="0.9">
          {/* Card 1: 3 dots */}
          <circle cx={cards[0].x + 7} cy={cards[0].y + 9} r="1.4" />
          <circle cx={cards[0].x + 13} cy={cards[0].y + 9} r="1.2" />
          <circle cx={cards[0].x + 19} cy={cards[0].y + 9} r="1.4" />
          {/* Card 2: short line */}
          <rect x={cards[1].x + 6} y={cards[1].y + 7} width="14" height="2" rx="1" />
          <rect x={cards[1].x + 6} y={cards[1].y + 11} width="10" height="2" rx="1" />
          {/* Card 3: ring */}
          <circle
            cx={cards[2].x + 13}
            cy={cards[2].y + 9}
            r="3.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          {/* Card 4: cross / plus */}
          <rect x={cards[3].x + 12} y={cards[3].y + 5} width="2" height="9" rx="1" />
          <rect x={cards[3].x + 8.5} y={cards[3].y + 8.5} width="9" height="2" rx="1" />
        </g>

        {/* Sparkle accents */}
        <g fill="currentColor" opacity="0.7">
          <circle cx="52" cy="22" r="1.2" />
          <circle cx="180" cy="80" r="1.4" />
          <circle cx="14" cy="100" r="1.1" />
          <circle cx="100" cy="14" r="1.3" />
        </g>
      </g>
    </svg>
  );
}
