// Task Manager hero - a 3-column kanban board with cards in different
// states. The "done" card sports a checkmark that draws on loop.
import './pageIllustrations.css';

export default function TaskManagerArt() {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="task-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="108" rx="86" ry="62" fill="url(#task-glow)" />

      {/* Board frame */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="20"
          y="36"
          width="160"
          height="124"
          rx="6"
          fill="currentColor"
          fillOpacity="0.06"
          strokeWidth="1.1"
        />
        {/* Header bar */}
        <rect
          x="20"
          y="36"
          width="160"
          height="14"
          rx="6"
          fill="currentColor"
          fillOpacity="0.14"
          strokeWidth="1.1"
        />
        <circle cx="30" cy="43" r="1.8" fill="currentColor" opacity="0.7" />
        <circle cx="36" cy="43" r="1.8" fill="currentColor" opacity="0.5" />
        <circle cx="42" cy="43" r="1.8" fill="currentColor" opacity="0.35" />
      </g>

      {/* Column dividers + headers */}
      <g stroke="currentColor" opacity="0.45">
        <line x1="74" y1="56" x2="74" y2="156" strokeWidth="0.6" strokeDasharray="2 3" />
        <line x1="128" y1="56" x2="128" y2="156" strokeWidth="0.6" strokeDasharray="2 3" />
      </g>
      <g fill="currentColor" opacity="0.75">
        <rect x="30" y="58" width="28" height="3" rx="1.5" />
        <rect x="84" y="58" width="28" height="3" rx="1.5" />
        <rect x="138" y="58" width="28" height="3" rx="1.5" />
      </g>

      {/* Column 1 - To do */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="28"
          y="68"
          width="40"
          height="22"
          rx="3"
          fill="currentColor"
          fillOpacity="0.20"
          strokeWidth="0.9"
          className="page-art-task__card"
          style={{ '--i': 0 }}
        />
        <rect
          x="32"
          y="74"
          width="24"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.85"
          stroke="none"
        />
        <rect
          x="32"
          y="80"
          width="18"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.55"
          stroke="none"
        />

        <rect
          x="28"
          y="96"
          width="40"
          height="22"
          rx="3"
          fill="currentColor"
          fillOpacity="0.14"
          strokeWidth="0.9"
          className="page-art-task__card"
          style={{ '--i': 1 }}
        />
        <rect
          x="32"
          y="102"
          width="22"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.85"
          stroke="none"
        />
        <rect
          x="32"
          y="108"
          width="16"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.55"
          stroke="none"
        />
      </g>

      {/* Column 2 - In progress (highlighted) */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="82"
          y="68"
          width="40"
          height="34"
          rx="3"
          fill="currentColor"
          fillOpacity="0.30"
          strokeWidth="1.1"
          className="page-art-task__card"
          style={{ '--i': 2 }}
        />
        <rect
          x="86"
          y="74"
          width="28"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.95"
          stroke="none"
        />
        <rect
          x="86"
          y="80"
          width="22"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.7"
          stroke="none"
        />
        {/* Progress bar inside card */}
        <rect
          x="86"
          y="90"
          width="32"
          height="3"
          rx="1.5"
          fill="currentColor"
          opacity="0.18"
          stroke="none"
        />
        <rect
          x="86"
          y="90"
          width="20"
          height="3"
          rx="1.5"
          fill="currentColor"
          opacity="0.95"
          stroke="none"
        />
      </g>

      {/* Column 3 - Done (with animated checkmark) */}
      <g stroke="currentColor" strokeLinejoin="round">
        <rect
          x="136"
          y="68"
          width="40"
          height="22"
          rx="3"
          fill="currentColor"
          fillOpacity="0.22"
          strokeWidth="0.9"
          className="page-art-task__card"
          style={{ '--i': 3 }}
        />
        <rect
          x="142"
          y="74"
          width="20"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.85"
          stroke="none"
        />
        <rect
          x="142"
          y="80"
          width="14"
          height="2.4"
          rx="1"
          fill="currentColor"
          opacity="0.55"
          stroke="none"
        />
        {/* Checkmark */}
        <circle cx="168" cy="79" r="4.2" fill="currentColor" fillOpacity="0.18" strokeWidth="0.8" />
        <polyline
          points="165.5,79 167.5,81 170.5,77"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
          className="page-art-task__check"
        />
      </g>

      {/* Floor / shelf */}
      <g fill="none" stroke="currentColor">
        <ellipse cx="100" cy="180" rx="86" ry="6" strokeWidth="0.5" opacity="0.20" />
        <ellipse cx="100" cy="180" rx="60" ry="4" strokeWidth="0.5" opacity="0.32" />
      </g>

      {/* Sparkles */}
      <g fill="currentColor" opacity="0.7">
        <circle cx="14" cy="48" r="1.0" />
        <circle cx="186" cy="58" r="1.3" />
        <circle cx="182" cy="138" r="1.1" />
      </g>
    </svg>
  );
}
