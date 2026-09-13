// Knowledge Base hero - an open book on a pedestal with three floating
// "page" cards above and a soft beam of light. Transparent SVG, currentColor
// tinted so it picks up the theme primary in the EmptyState.
import './pageIllustrations.css';

export default function KnowledgeBaseArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="kb-glow" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="kb-beam"
          x1="100"
          y1="20"
          x2="100"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.30" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Soft glow */}
      <ellipse cx="100" cy="120" rx="78" ry="55" fill="url(#kb-glow)" />

      {/* Beam of light from above the book */}
      <path
        d="M 78 22 L 122 22 L 138 130 L 62 130 Z"
        fill="url(#kb-beam)"
        className="page-art-kb__beam"
      />

      {/* Floating pages above the book */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="78"
          y="36"
          width="22"
          height="14"
          rx="2"
          fill="currentColor"
          fillOpacity="0.18"
          strokeWidth="0.9"
          className="page-art-kb__page"
          style={{ '--i': 0 }}
        />
        <line x1="82" y1="42" x2="96" y2="42" strokeWidth="0.8" opacity="0.7" />
        <line x1="82" y1="46" x2="92" y2="46" strokeWidth="0.8" opacity="0.5" />

        <rect
          x="104"
          y="32"
          width="22"
          height="14"
          rx="2"
          fill="currentColor"
          fillOpacity="0.24"
          strokeWidth="0.9"
          className="page-art-kb__page"
          style={{ '--i': 1 }}
        />
        <line x1="108" y1="38" x2="122" y2="38" strokeWidth="0.8" opacity="0.7" />
        <line x1="108" y1="42" x2="118" y2="42" strokeWidth="0.8" opacity="0.5" />

        <rect
          x="90"
          y="56"
          width="22"
          height="14"
          rx="2"
          fill="currentColor"
          fillOpacity="0.16"
          strokeWidth="0.9"
          className="page-art-kb__page"
          style={{ '--i': 2 }}
        />
        <line x1="94" y1="62" x2="108" y2="62" strokeWidth="0.8" opacity="0.7" />
        <line x1="94" y1="66" x2="104" y2="66" strokeWidth="0.8" opacity="0.5" />
      </g>

      {/* Open book - spine + two pages */}
      <g stroke="currentColor" strokeLinejoin="round">
        {/* Left page */}
        <path
          d="M 38 96 L 100 88 L 100 140 L 38 144 Z"
          fill="currentColor"
          fillOpacity="0.22"
          strokeWidth="1.1"
        />
        {/* Right page */}
        <path
          d="M 100 88 L 162 96 L 162 144 L 100 140 Z"
          fill="currentColor"
          fillOpacity="0.18"
          strokeWidth="1.1"
        />
        {/* Spine */}
        <line x1="100" y1="88" x2="100" y2="140" strokeWidth="1.4" opacity="0.85" />
        {/* Text lines */}
        <g strokeWidth="0.9" opacity="0.7">
          <line x1="50" y1="104" x2="92" y2="100" />
          <line x1="50" y1="112" x2="86" y2="108" />
          <line x1="50" y1="120" x2="92" y2="116" />
          <line x1="50" y1="128" x2="80" y2="124" />
          <line x1="108" y1="100" x2="150" y2="104" />
          <line x1="108" y1="108" x2="146" y2="112" />
          <line x1="108" y1="116" x2="150" y2="120" />
          <line x1="108" y1="124" x2="140" y2="128" />
        </g>
      </g>

      {/* Pedestal */}
      <g stroke="currentColor" strokeLinejoin="round">
        <path
          d="M 32 144 L 168 144 L 158 158 L 42 158 Z"
          fill="currentColor"
          fillOpacity="0.14"
          strokeWidth="1"
        />
      </g>

      {/* Concentric floor */}
      <g fill="none" stroke="currentColor">
        <ellipse cx="100" cy="170" rx="80" ry="8" strokeWidth="0.5" opacity="0.20" />
        <ellipse cx="100" cy="170" rx="58" ry="6" strokeWidth="0.5" opacity="0.28" />
        <ellipse cx="100" cy="170" rx="36" ry="4" strokeWidth="0.5" opacity="0.38" />
      </g>

      {/* Sparkle accents */}
      <g fill="currentColor" opacity="0.7">
        <circle cx="24" cy="50" r="1.1" />
        <circle cx="176" cy="58" r="1.3" />
        <circle cx="172" cy="120" r="1.1" />
        <circle cx="28" cy="118" r="1.0" />
      </g>
    </svg>
  );
}
