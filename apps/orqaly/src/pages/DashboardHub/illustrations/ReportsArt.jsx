// Generate-a-report illustration - vertical document page with a donut chart
// at the top, text lines in the middle, and a small bar chart at the bottom.
// One stacked shadow document behind for depth. Transparent SVG, currentColor.
import './illustrations.css';

export default function ReportsArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="rep-glow" cx="55%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="translate(55, 0)">
        {/* Soft glow behind the page */}
        <ellipse cx="100" cy="96" rx="80" ry="76" fill="url(#rep-glow)" />

        {/* Background stacked shadow document */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="76"
            y="32"
            width="68"
            height="106"
            rx="4"
            fill="currentColor"
            fillOpacity="0.10"
            strokeWidth="0.6"
            opacity="0.55"
          />
        </g>

        {/* Foreground document page */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="64"
            y="26"
            width="72"
            height="118"
            rx="5"
            fill="currentColor"
            fillOpacity="0.20"
            strokeWidth="0.9"
          />
          {/* Donut chart at the top - animated dashes spin around the ring */}
          <circle
            cx="84"
            cy="50"
            r="9"
            stroke="currentColor"
            strokeWidth="2.4"
            fill="none"
            opacity="0.45"
            className="hub-art-rep__donut"
          />
          <path
            d="M 84 41 A 9 9 0 0 1 91 56"
            stroke="currentColor"
            strokeWidth="2.4"
            fill="none"
            opacity="0.95"
          />
          {/* Header label next to donut */}
          <line x1="100" y1="47" x2="128" y2="47" strokeWidth="1.4" opacity="0.85" />
          <line x1="100" y1="54" x2="120" y2="54" strokeWidth="1" opacity="0.55" />

          {/* Body text lines */}
          <line x1="72" y1="74" x2="128" y2="74" strokeWidth="1" opacity="0.55" />
          <line x1="72" y1="82" x2="120" y2="82" strokeWidth="1" opacity="0.55" />
          <line x1="72" y1="90" x2="124" y2="90" strokeWidth="1" opacity="0.55" />

          {/* Bottom bar chart - animated via CSS (rise/fall) */}
          <g fill="currentColor" opacity="0.9">
            <rect
              x="74"
              y="124"
              width="8"
              height="10"
              rx="1"
              className="hub-art-rep__bar"
              style={{ '--i': 0 }}
            />
            <rect
              x="86"
              y="118"
              width="8"
              height="16"
              rx="1"
              className="hub-art-rep__bar"
              style={{ '--i': 1 }}
            />
            <rect
              x="98"
              y="112"
              width="8"
              height="22"
              rx="1"
              className="hub-art-rep__bar"
              style={{ '--i': 2 }}
            />
            <rect
              x="110"
              y="106"
              width="8"
              height="28"
              rx="1"
              className="hub-art-rep__bar"
              style={{ '--i': 3 }}
            />
            <rect
              x="122"
              y="100"
              width="8"
              height="34"
              rx="1"
              className="hub-art-rep__bar"
              style={{ '--i': 4 }}
            />
          </g>
        </g>

        {/* Concentric floor disc */}
        <g fill="none" stroke="currentColor">
          <ellipse cx="100" cy="170" rx="86" ry="9" strokeWidth="0.5" opacity="0.20" />
          <ellipse cx="100" cy="170" rx="64" ry="7" strokeWidth="0.5" opacity="0.28" />
          <ellipse cx="100" cy="170" rx="42" ry="5" strokeWidth="0.5" opacity="0.38" />
          <ellipse cx="100" cy="172" rx="22" ry="2.8" strokeWidth="0.5" opacity="0.50" />
        </g>

        {/* Sparkle accents */}
        <g fill="currentColor" opacity="0.7">
          <circle cx="32" cy="46" r="1.2" />
          <circle cx="174" cy="36" r="1.4" />
          <circle cx="42" cy="148" r="1.1" />
          <circle cx="170" cy="138" r="1.3" />
        </g>
      </g>
    </svg>
  );
}
