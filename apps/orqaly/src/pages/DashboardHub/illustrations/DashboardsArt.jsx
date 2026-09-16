// Custom Dashboards illustration - 3 isometric monitor "screens" floating
// in depth, each showing a mini chart. Transparent SVG, currentColor-tinted.
// Matches the right-side hero slot pattern of the marketplace illustrations.
import './illustrations.css';

export default function DashboardsArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <radialGradient id="dash-glow" cx="55%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="translate(55, 0)">
        {/* Soft glow */}
        <ellipse cx="100" cy="100" rx="90" ry="68" fill="url(#dash-glow)" />

        {/* Faint isometric grid floor */}
        <g stroke="currentColor" strokeWidth="0.35" opacity="0.18">
          {[-3, -2, -1, 0, 1, 2, 3].map((i) => {
            const off = i * 12;
            return (
              <g key={i}>
                <line
                  x1={100 + off * 0.866 - 70 * 0.866}
                  y1={172 + off * 0.5 - 70 * 0.5}
                  x2={100 + off * 0.866 + 70 * 0.866}
                  y2={172 + off * 0.5 + 70 * 0.5}
                />
                <line
                  x1={100 + off * 0.866 + 70 * 0.866}
                  y1={172 + off * 0.5 - 70 * 0.5}
                  x2={100 + off * 0.866 - 70 * 0.866}
                  y2={172 + off * 0.5 + 70 * 0.5}
                />
              </g>
            );
          })}
        </g>

        {/* Back-left screen - donut/pie inside */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="32"
            y="40"
            width="60"
            height="44"
            rx="4"
            fill="currentColor"
            fillOpacity="0.18"
            strokeWidth="0.8"
          />
          {/* Donut arc */}
          <circle cx="62" cy="62" r="11" fill="none" strokeWidth="3" opacity="0.85" />
          <path
            d="M 62 51 A 11 11 0 0 1 73 62"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            opacity="0.4"
          />
        </g>

        {/* Center large screen - bar chart inside (the hero) */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="70"
            y="64"
            width="84"
            height="60"
            rx="5"
            fill="currentColor"
            fillOpacity="0.26"
            strokeWidth="0.9"
          />
          {/* Screen header bar */}
          <line x1="78" y1="74" x2="120" y2="74" strokeWidth="1.2" opacity="0.75" />
          {/* Bars inside the screen - animated via CSS (equalizer pulse) */}
          <g fill="currentColor" opacity="0.9">
            <rect
              x="80"
              y="106"
              width="8"
              height="10"
              rx="1"
              className="hub-art-dash__bar"
              style={{ '--i': 0 }}
            />
            <rect
              x="92"
              y="98"
              width="8"
              height="18"
              rx="1"
              className="hub-art-dash__bar"
              style={{ '--i': 1 }}
            />
            <rect
              x="104"
              y="92"
              width="8"
              height="24"
              rx="1"
              className="hub-art-dash__bar"
              style={{ '--i': 2 }}
            />
            <rect
              x="116"
              y="86"
              width="8"
              height="30"
              rx="1"
              className="hub-art-dash__bar"
              style={{ '--i': 3 }}
            />
            <rect
              x="128"
              y="82"
              width="8"
              height="34"
              rx="1"
              className="hub-art-dash__bar"
              style={{ '--i': 4 }}
            />
          </g>
        </g>

        {/* Front-right small screen - sparkline + dots */}
        <g stroke="currentColor" strokeLinejoin="round">
          <rect
            x="124"
            y="118"
            width="46"
            height="34"
            rx="4"
            fill="currentColor"
            fillOpacity="0.18"
            strokeWidth="0.8"
          />
          {/* Sparkline */}
          <polyline
            points="130,140 138,132 146,136 154,128 162,124"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            opacity="0.95"
          />
          {/* Dots */}
          <g fill="currentColor" opacity="0.9">
            <circle cx="130" cy="140" r="1.4" />
            <circle cx="146" cy="136" r="1.4" />
            <circle cx="162" cy="124" r="1.6" />
          </g>
        </g>

        {/* Concentric floor disc */}
        <g fill="none" stroke="currentColor">
          <ellipse cx="100" cy="170" rx="88" ry="9" strokeWidth="0.5" opacity="0.20" />
          <ellipse cx="100" cy="170" rx="66" ry="7" strokeWidth="0.5" opacity="0.28" />
          <ellipse cx="100" cy="170" rx="44" ry="5" strokeWidth="0.5" opacity="0.38" />
        </g>

        {/* Sparkle accents */}
        <g fill="currentColor" opacity="0.7">
          <circle cx="22" cy="34" r="1.1" />
          <circle cx="180" cy="46" r="1.3" />
          <circle cx="178" cy="118" r="1.1" />
        </g>
      </g>
    </svg>
  );
}
