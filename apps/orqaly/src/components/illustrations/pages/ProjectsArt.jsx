// Projects hero - a stack of project folders on the left, an animated
// timeline / Gantt sweeping right with milestone dots.
import './pageIllustrations.css';

export default function ProjectsArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="proj-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="108" rx="86" ry="62" fill="url(#proj-glow)" />

      {/* Stack of folders (left) */}
      <g stroke="currentColor" strokeLinejoin="round">
        {/* Back folder */}
        <path
          d="M 24 68 L 56 68 L 62 76 L 86 76 L 86 132 L 24 132 Z"
          fill="currentColor"
          fillOpacity="0.14"
          strokeWidth="0.9"
        />
        {/* Mid folder */}
        <path
          d="M 26 80 L 58 80 L 64 88 L 92 88 L 92 144 L 26 144 Z"
          fill="currentColor"
          fillOpacity="0.20"
          strokeWidth="1"
        />
        {/* Front folder */}
        <path
          d="M 28 92 L 60 92 L 66 100 L 96 100 L 96 156 L 28 156 Z"
          fill="currentColor"
          fillOpacity="0.28"
          strokeWidth="1.1"
        />
        {/* Front-folder rows */}
        <g strokeWidth="0.9" opacity="0.7">
          <line x1="36" y1="114" x2="86" y2="114" />
          <line x1="36" y1="122" x2="80" y2="122" />
          <line x1="36" y1="130" x2="84" y2="130" />
          <line x1="36" y1="138" x2="74" y2="138" />
        </g>
      </g>

      {/* Timeline / Gantt on the right */}
      <g stroke="currentColor" strokeLinejoin="round">
        {/* Lane backgrounds */}
        <rect
          x="106"
          y="74"
          width="74"
          height="10"
          rx="3"
          fill="currentColor"
          fillOpacity="0.06"
          strokeWidth="0.6"
        />
        <rect
          x="106"
          y="92"
          width="74"
          height="10"
          rx="3"
          fill="currentColor"
          fillOpacity="0.06"
          strokeWidth="0.6"
        />
        <rect
          x="106"
          y="110"
          width="74"
          height="10"
          rx="3"
          fill="currentColor"
          fillOpacity="0.06"
          strokeWidth="0.6"
        />
        <rect
          x="106"
          y="128"
          width="74"
          height="10"
          rx="3"
          fill="currentColor"
          fillOpacity="0.06"
          strokeWidth="0.6"
        />

        {/* Gantt bars (animated grow) */}
        <rect
          x="110"
          y="77"
          width="42"
          height="4"
          rx="2"
          fill="currentColor"
          fillOpacity="0.85"
          stroke="none"
          className="page-art-proj__progress"
        />
        <rect
          x="120"
          y="95"
          width="50"
          height="4"
          rx="2"
          fill="currentColor"
          fillOpacity="0.65"
          stroke="none"
          className="page-art-proj__progress"
          style={{ animationDelay: '0.4s' }}
        />
        <rect
          x="114"
          y="113"
          width="36"
          height="4"
          rx="2"
          fill="currentColor"
          fillOpacity="0.80"
          stroke="none"
          className="page-art-proj__progress"
          style={{ animationDelay: '0.8s' }}
        />
        <rect
          x="118"
          y="131"
          width="58"
          height="4"
          rx="2"
          fill="currentColor"
          fillOpacity="0.55"
          stroke="none"
          className="page-art-proj__progress"
          style={{ animationDelay: '1.2s' }}
        />
      </g>

      {/* Milestone dots */}
      <g fill="currentColor">
        <circle cx="148" cy="79" r="2.2" className="page-art-proj__dot" style={{ '--i': 0 }} />
        <circle cx="166" cy="97" r="2.2" className="page-art-proj__dot" style={{ '--i': 1 }} />
        <circle cx="142" cy="115" r="2.2" className="page-art-proj__dot" style={{ '--i': 2 }} />
        <circle cx="172" cy="133" r="2.2" className="page-art-proj__dot" style={{ '--i': 3 }} />
      </g>

      {/* Vertical "today" marker */}
      <line
        x1="138"
        y1="68"
        x2="138"
        y2="148"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeDasharray="2 3"
        opacity="0.5"
      />

      {/* Floor */}
      <g fill="none" stroke="currentColor">
        <ellipse cx="100" cy="172" rx="84" ry="7" strokeWidth="0.5" opacity="0.20" />
        <ellipse cx="100" cy="172" rx="58" ry="5" strokeWidth="0.5" opacity="0.32" />
      </g>

      {/* Sparkles */}
      <g fill="currentColor" opacity="0.7">
        <circle cx="18" cy="44" r="1.0" />
        <circle cx="184" cy="54" r="1.3" />
        <circle cx="14" cy="138" r="1.1" />
      </g>
    </svg>
  );
}
