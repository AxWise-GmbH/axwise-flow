// Results hub illustration - a cloud with a checkmark badge, raining 4
// deliverable cards (code, document, video, file) on a concentric floor disc.
// Matches the user's reference image. Transparent SVG, currentColor-tinted.
import './illustrations.css';

export default function ResultsArt() {
  // 4 deliverable cards in a row beneath the cloud.
  const cards = [
    { x: 38, y: 122 }, // code </>
    { x: 78, y: 130 }, // document
    { x: 118, y: 130 }, // video play
    { x: 158, y: 122 }, // file
  ];
  const cardW = 22;
  const cardH = 22;

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="res-glow" cx="55%" cy="42%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="translate(55, 0)">
        {/* Soft glow behind the cloud */}
        <ellipse cx="100" cy="58" rx="80" ry="50" fill="url(#res-glow)" />

        {/* Cloud silhouette - composite of overlapping circles + base */}
        <g stroke="currentColor" strokeLinejoin="round" strokeWidth="0.9">
          <path
            d="M 64 76
               C 56 76 50 70 50 62
               C 50 54 56 48 64 49
               C 65 39 75 32 86 34
               C 91 26 102 24 110 30
               C 117 26 128 30 130 40
               C 142 40 150 48 150 58
               C 150 68 142 76 132 76
               Z"
            fill="currentColor"
            fillOpacity="0.28"
          />
        </g>

        {/* Checkmark badge on the cloud - animated subtle pulse */}
        <g className="hub-art-res__check">
          <circle cx="100" cy="58" r="11" fill="currentColor" fillOpacity="0.60" />
          <circle cx="100" cy="58" r="11" fill="none" stroke="currentColor" strokeWidth="0.9" />
          <path
            d="M 94 58 L 99 63 L 107 53"
            stroke="#000"
            strokeOpacity="0.55"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 94 58 L 99 63 L 107 53"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Raining dashed lines from cloud bottom to each card top -
            animated marching dashes flow downward. */}
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
              x1={100}
              y1={80}
              x2={c.x + cardW / 2}
              y2={c.y}
              className="hub-art-res__rain"
              style={{ '--i': i }}
            />
          ))}
        </g>

        {/* Deliverable cards - animated subtle bob (vertical drift) */}
        <g stroke="currentColor" strokeLinejoin="round">
          {cards.map((c, i) => (
            <rect
              key={i}
              x={c.x}
              y={c.y}
              width={cardW}
              height={cardH}
              rx="3.5"
              fill="currentColor"
              fillOpacity="0.22"
              strokeWidth="0.9"
              className="hub-art-res__card"
              style={{ '--i': i }}
            />
          ))}
        </g>

        {/* Glyphs inside each card */}
        <g
          stroke="currentColor"
          fill="none"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        >
          {/* 1: code </> */}
          <polyline
            points={`${cards[0].x + 7},${cards[0].y + 8}
                              ${cards[0].x + 4},${cards[0].y + 11}
                              ${cards[0].x + 7},${cards[0].y + 14}`}
          />
          <polyline
            points={`${cards[0].x + 15},${cards[0].y + 8}
                              ${cards[0].x + 18},${cards[0].y + 11}
                              ${cards[0].x + 15},${cards[0].y + 14}`}
          />
          <line x1={cards[0].x + 13} y1={cards[0].y + 7} x2={cards[0].x + 9} y2={cards[0].y + 15} />

          {/* 2: document - 3 horizontal lines */}
          <line x1={cards[1].x + 6} y1={cards[1].y + 8} x2={cards[1].x + 16} y2={cards[1].y + 8} />
          <line
            x1={cards[1].x + 6}
            y1={cards[1].y + 12}
            x2={cards[1].x + 16}
            y2={cards[1].y + 12}
          />
          <line
            x1={cards[1].x + 6}
            y1={cards[1].y + 16}
            x2={cards[1].x + 13}
            y2={cards[1].y + 16}
          />

          {/* 3: video play triangle */}
          <polygon
            points={`${cards[2].x + 8},${cards[2].y + 7}
                     ${cards[2].x + 16},${cards[2].y + 11}
                     ${cards[2].x + 8},${cards[2].y + 15}`}
            fill="currentColor"
            fillOpacity="0.9"
            stroke="none"
          />

          {/* 4: file - rectangle + folded corner */}
          <path
            d={`M ${cards[3].x + 6} ${cards[3].y + 6}
                    L ${cards[3].x + 13} ${cards[3].y + 6}
                    L ${cards[3].x + 16} ${cards[3].y + 9}
                    L ${cards[3].x + 16} ${cards[3].y + 16}
                    L ${cards[3].x + 6} ${cards[3].y + 16} Z`}
          />
          <path
            d={`M ${cards[3].x + 13} ${cards[3].y + 6}
                    L ${cards[3].x + 13} ${cards[3].y + 9}
                    L ${cards[3].x + 16} ${cards[3].y + 9}`}
          />
        </g>

        {/* Concentric floor disc */}
        <g fill="none" stroke="currentColor">
          <ellipse cx="100" cy="172" rx="92" ry="9" strokeWidth="0.5" opacity="0.18" />
          <ellipse cx="100" cy="172" rx="72" ry="7.5" strokeWidth="0.5" opacity="0.26" />
          <ellipse cx="100" cy="172" rx="52" ry="5.5" strokeWidth="0.5" opacity="0.36" />
          <ellipse cx="100" cy="173" rx="30" ry="3.5" strokeWidth="0.5" opacity="0.48" />
        </g>

        {/* Sparkle accents */}
        <g fill="currentColor" opacity="0.7">
          <circle cx="32" cy="42" r="1.2" />
          <circle cx="172" cy="36" r="1.4" />
          <circle cx="180" cy="116" r="1.1" />
          <circle cx="20" cy="148" r="1.0" />
        </g>
      </g>
    </svg>
  );
}
