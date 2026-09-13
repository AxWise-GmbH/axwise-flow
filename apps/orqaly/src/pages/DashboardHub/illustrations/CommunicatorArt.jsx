// Communicator illustration - two overlapping chat bubbles with rolling
// dots and a small live indicator. Transparent SVG, currentColor so
// MktTile's accent tint flows through.
import './illustrations.css';

export default function CommunicatorArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="comm-glow" cx="55%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="translate(55, 0)">
        {/* Soft glow behind */}
        <ellipse cx="100" cy="96" rx="80" ry="76" fill="url(#comm-glow)" />

        {/* Back bubble - outgoing message */}
        <g stroke="currentColor" strokeLinejoin="round">
          <path
            d="M 50 50
               Q 50 40 60 40
               L 132 40
               Q 142 40 142 50
               L 142 80
               Q 142 90 132 90
               L 78 90
               L 68 100
               L 68 90
               L 60 90
               Q 50 90 50 80
               Z"
            fill="currentColor"
            fillOpacity="0.14"
            strokeWidth="1.1"
            opacity="0.85"
          />
          {/* dot row */}
          <g fill="currentColor" opacity="0.9">
            <circle cx="74" cy="65" r="2.4" className="hub-art-comm__dot" style={{ '--i': 0 }} />
            <circle cx="86" cy="65" r="2.4" className="hub-art-comm__dot" style={{ '--i': 1 }} />
            <circle cx="98" cy="65" r="2.4" className="hub-art-comm__dot" style={{ '--i': 2 }} />
          </g>
        </g>

        {/* Front bubble - incoming message, mirrored tail */}
        <g stroke="currentColor" strokeLinejoin="round" transform="translate(8, 56)">
          <path
            d="M 56 58
               Q 56 48 66 48
               L 138 48
               Q 148 48 148 58
               L 148 92
               Q 148 102 138 102
               L 74 102
               L 64 112
               L 64 102
               L 66 102
               Q 56 102 56 92
               Z"
            fill="currentColor"
            fillOpacity="0.22"
            strokeWidth="1.2"
          />
          {/* text lines */}
          <line x1="72" y1="68" x2="132" y2="68" strokeWidth="1.3" opacity="0.85" />
          <line x1="72" y1="78" x2="120" y2="78" strokeWidth="1" opacity="0.55" />
          <line x1="72" y1="88" x2="126" y2="88" strokeWidth="1" opacity="0.55" />
        </g>

        {/* Live pulse - a single emphasized dot top-right of the front bubble */}
        <g>
          <circle
            cx="156"
            cy="106"
            r="6.4"
            fill="currentColor"
            opacity="0.18"
            className="hub-art-comm__pulse"
          />
          <circle cx="156" cy="106" r="3.2" fill="currentColor" opacity="0.95" />
        </g>

        {/* Concentric floor disc */}
        <g fill="none" stroke="currentColor">
          <ellipse cx="100" cy="178" rx="86" ry="9" strokeWidth="0.5" opacity="0.20" />
          <ellipse cx="100" cy="178" rx="64" ry="7" strokeWidth="0.5" opacity="0.28" />
          <ellipse cx="100" cy="178" rx="42" ry="5" strokeWidth="0.5" opacity="0.38" />
          <ellipse cx="100" cy="180" rx="22" ry="2.8" strokeWidth="0.5" opacity="0.50" />
        </g>

        {/* Sparkle accents */}
        <g fill="currentColor" opacity="0.7">
          <circle cx="28" cy="46" r="1.2" />
          <circle cx="178" cy="38" r="1.4" />
          <circle cx="38" cy="156" r="1.1" />
          <circle cx="174" cy="148" r="1.3" />
        </g>
      </g>
    </svg>
  );
}
