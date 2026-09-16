// Workflow hero - a small flow graph: trigger node feeds into two action
// nodes, which fan out to a single result node. Transparent SVG, currentColor
// tinted so it picks up the theme accent from MktTile.
import './pageIllustrations.css';

export default function WorkflowArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="wf-glow" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft glow */}
      <ellipse cx="100" cy="106" rx="78" ry="62" fill="url(#wf-glow)" />

      {/* Connectors — marching dashes flow from trigger out toward result */}
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <path
          d="M 60 60 C 80 60, 80 92, 100 92"
          strokeWidth="1.5"
          opacity="0.7"
          className="page-art-wf__wire"
          style={{ '--i': 0 }}
        />
        <path
          d="M 60 60 C 80 60, 80 132, 100 132"
          strokeWidth="1.5"
          opacity="0.7"
          className="page-art-wf__wire"
          style={{ '--i': 1 }}
        />
        <path
          d="M 140 92 C 158 92, 158 112, 170 112"
          strokeWidth="1.5"
          opacity="0.7"
          className="page-art-wf__wire"
          style={{ '--i': 2 }}
        />
        <path
          d="M 140 132 C 158 132, 158 112, 170 112"
          strokeWidth="1.5"
          opacity="0.7"
          className="page-art-wf__wire"
          style={{ '--i': 3 }}
        />
      </g>

      {/* Trigger node (lightning bolt in a rounded square) */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="32"
          y="42"
          width="36"
          height="36"
          rx="8"
          fill="currentColor"
          fillOpacity="0.20"
          strokeWidth="1.1"
        />
        <path
          d="M 53 50 L 46 64 L 51 64 L 47 72 L 56 60 L 51 60 Z"
          fill="currentColor"
          fillOpacity="0.85"
          strokeWidth="0.8"
        />
      </g>

      {/* Action node 1 (top) */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="100"
          y="74"
          width="40"
          height="36"
          rx="6"
          fill="currentColor"
          fillOpacity="0.18"
          strokeWidth="1.1"
          className="page-art-wf__node"
          style={{ '--i': 0 }}
        />
        <line x1="108" y1="86" x2="132" y2="86" strokeWidth="1" opacity="0.7" />
        <line x1="108" y1="94" x2="126" y2="94" strokeWidth="1" opacity="0.5" />
        <line x1="108" y1="102" x2="130" y2="102" strokeWidth="1" opacity="0.5" />
      </g>

      {/* Action node 2 (bottom) */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="100"
          y="114"
          width="40"
          height="36"
          rx="6"
          fill="currentColor"
          fillOpacity="0.14"
          strokeWidth="1.1"
          className="page-art-wf__node"
          style={{ '--i': 1 }}
        />
        <line x1="108" y1="126" x2="132" y2="126" strokeWidth="1" opacity="0.7" />
        <line x1="108" y1="134" x2="126" y2="134" strokeWidth="1" opacity="0.5" />
        <line x1="108" y1="142" x2="130" y2="142" strokeWidth="1" opacity="0.5" />
      </g>

      {/* Result node (checkmark in a circle) */}
      <g stroke="currentColor" strokeLinejoin="round">
        <circle cx="170" cy="112" r="14" fill="currentColor" fillOpacity="0.22" strokeWidth="1.1" />
        <path
          d="M 164 112 L 168 116 L 176 108"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="page-art-wf__check"
        />
      </g>

      {/* Concentric floor disc */}
      <g fill="none" stroke="currentColor">
        <ellipse cx="100" cy="174" rx="84" ry="9" strokeWidth="0.5" opacity="0.20" />
        <ellipse cx="100" cy="174" rx="62" ry="7" strokeWidth="0.5" opacity="0.28" />
        <ellipse cx="100" cy="174" rx="40" ry="4.5" strokeWidth="0.5" opacity="0.40" />
      </g>

      {/* Sparkle accents */}
      <g fill="currentColor" opacity="0.7">
        <circle cx="24" cy="46" r="1.1" />
        <circle cx="180" cy="50" r="1.3" />
        <circle cx="32" cy="148" r="1.0" />
        <circle cx="176" cy="156" r="1.2" />
      </g>
    </svg>
  );
}
