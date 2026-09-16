// Replicators hero - a source "blueprint" node in the center radiating four
// clone copies outward along connector lines. Distinct from the marketplace
// ReplicatorsArt (different layout, animation, and emphasis).
import './pageIllustrations.css';

export default function ReplicatorsArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="rep-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.30" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.07" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="100" rx="86" ry="66" fill="url(#rep-glow)" />

      {/* Radiating rays (faint, animated) */}
      <g stroke="currentColor" strokeLinecap="round">
        <line
          x1="100"
          y1="100"
          x2="40"
          y2="60"
          strokeWidth="0.9"
          className="page-art-rep__ray"
          style={{ '--i': 0 }}
        />
        <line
          x1="100"
          y1="100"
          x2="160"
          y2="60"
          strokeWidth="0.9"
          className="page-art-rep__ray"
          style={{ '--i': 1 }}
        />
        <line
          x1="100"
          y1="100"
          x2="40"
          y2="140"
          strokeWidth="0.9"
          className="page-art-rep__ray"
          style={{ '--i': 2 }}
        />
        <line
          x1="100"
          y1="100"
          x2="160"
          y2="140"
          strokeWidth="0.9"
          className="page-art-rep__ray"
          style={{ '--i': 3 }}
        />
      </g>

      {/* Concentric pulse rings */}
      <g fill="none" stroke="currentColor" strokeWidth="0.7">
        <circle cx="100" cy="100" r="34" opacity="0.20" />
        <circle cx="100" cy="100" r="50" opacity="0.12" />
        <circle cx="100" cy="100" r="66" opacity="0.06" />
      </g>

      {/* Source blueprint node (center) */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="82"
          y="82"
          width="36"
          height="36"
          rx="5"
          fill="currentColor"
          fillOpacity="0.32"
          strokeWidth="1.2"
        />
        {/* Inner grid - blueprint lines */}
        <g strokeWidth="0.6" opacity="0.65">
          <line x1="88" y1="92" x2="112" y2="92" />
          <line x1="88" y1="100" x2="112" y2="100" />
          <line x1="88" y1="108" x2="112" y2="108" />
          <line x1="94" y1="86" x2="94" y2="114" />
          <line x1="100" y1="86" x2="100" y2="114" />
          <line x1="106" y1="86" x2="106" y2="114" />
        </g>
        {/* Center mark */}
        <circle cx="100" cy="100" r="2.2" fill="currentColor" stroke="none" />
      </g>

      {/* Cloned replicas in the four corners */}
      <g stroke="currentColor" strokeLinejoin="round">
        {/* Top-left clone */}
        <g className="page-art-rep__clone" style={{ '--i': 0 }}>
          <rect
            x="28"
            y="48"
            width="24"
            height="24"
            rx="3"
            fill="currentColor"
            fillOpacity="0.20"
            strokeWidth="0.9"
          />
          <rect
            x="32"
            y="54"
            width="12"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.85"
            stroke="none"
          />
          <rect
            x="32"
            y="60"
            width="8"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.55"
            stroke="none"
          />
        </g>

        {/* Top-right clone */}
        <g className="page-art-rep__clone" style={{ '--i': 1 }}>
          <rect
            x="148"
            y="48"
            width="24"
            height="24"
            rx="3"
            fill="currentColor"
            fillOpacity="0.20"
            strokeWidth="0.9"
          />
          <rect
            x="152"
            y="54"
            width="12"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.85"
            stroke="none"
          />
          <rect
            x="152"
            y="60"
            width="8"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.55"
            stroke="none"
          />
        </g>

        {/* Bottom-left clone */}
        <g className="page-art-rep__clone" style={{ '--i': 2 }}>
          <rect
            x="28"
            y="128"
            width="24"
            height="24"
            rx="3"
            fill="currentColor"
            fillOpacity="0.20"
            strokeWidth="0.9"
          />
          <rect
            x="32"
            y="134"
            width="12"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.85"
            stroke="none"
          />
          <rect
            x="32"
            y="140"
            width="8"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.55"
            stroke="none"
          />
        </g>

        {/* Bottom-right clone */}
        <g className="page-art-rep__clone" style={{ '--i': 3 }}>
          <rect
            x="148"
            y="128"
            width="24"
            height="24"
            rx="3"
            fill="currentColor"
            fillOpacity="0.20"
            strokeWidth="0.9"
          />
          <rect
            x="152"
            y="134"
            width="12"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.85"
            stroke="none"
          />
          <rect
            x="152"
            y="140"
            width="8"
            height="2.2"
            rx="1"
            fill="currentColor"
            opacity="0.55"
            stroke="none"
          />
        </g>
      </g>

      {/* Floor */}
      <g fill="none" stroke="currentColor">
        <ellipse cx="100" cy="180" rx="86" ry="6" strokeWidth="0.5" opacity="0.20" />
        <ellipse cx="100" cy="180" rx="58" ry="4" strokeWidth="0.5" opacity="0.32" />
      </g>

      {/* Sparkles */}
      <g fill="currentColor" opacity="0.7">
        <circle cx="100" cy="18" r="1.0" />
        <circle cx="100" cy="184" r="1.1" />
        <circle cx="14" cy="98" r="1.3" />
        <circle cx="186" cy="98" r="1.3" />
      </g>
    </svg>
  );
}
