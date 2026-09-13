// Hero visuals for the TechTrust section.
// Each visual is a pure inline SVG using currentColor so the parent card can
// tint the whole illustration with a single `color` prop / sx value.

const baseSvgProps = {
  width: '100%',
  height: '100%',
  preserveAspectRatio: 'xMidYMid meet',
  style: { display: 'block' },
};

// Pillar 1 · Personal BYOS - vault with combination dial paired with a single
// prominent key in the foreground. The visual sits in the bottom-right of its
// card with overflow hidden, so the composition is anchored to the top-left
// safe area (roughly x:0-250, y:0-195 of the viewBox).
// Signals: "your locked storage, your key, on your side".
export function ByosVaultVisual() {
  return (
    <svg viewBox="0 0 280 220" {...baseSvgProps}>
      {/* faint orbit rings anchored on the vault */}
      <circle
        cx="90"
        cy="115"
        r="98"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 6"
        opacity="0.18"
      />
      <circle
        cx="90"
        cy="115"
        r="78"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 6"
        opacity="0.13"
      />

      {/* vault body */}
      <rect x="30" y="55" width="120" height="120" rx="12" fill="currentColor" opacity="0.85" />
      {/* top edge highlight */}
      <rect x="30" y="55" width="120" height="24" rx="12" fill="white" opacity="0.08" />
      {/* base shadow band */}
      <rect x="30" y="168" width="120" height="7" fill="black" opacity="0.14" />

      {/* combination dial */}
      <circle cx="90" cy="115" r="30" fill="none" stroke="white" strokeWidth="3" opacity="0.92" />
      <circle cx="90" cy="115" r="4" fill="white" opacity="0.92" />
      <line
        x1="90"
        y1="115"
        x2="111"
        y2="98"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        opacity="0.92"
      />

      {/* dial tick marks */}
      <g stroke="white" strokeWidth="1.6" opacity="0.55" strokeLinecap="round">
        <line x1="90" y1="82" x2="90" y2="88" />
        <line x1="123" y1="115" x2="117" y2="115" />
        <line x1="90" y1="148" x2="90" y2="142" />
        <line x1="57" y1="115" x2="63" y2="115" />
      </g>

      {/* vault hinges */}
      <circle cx="40" cy="74" r="2.6" fill="white" opacity="0.4" />
      <circle cx="40" cy="156" r="2.6" fill="white" opacity="0.4" />

      {/* prominent key, upright, in the foreground */}
      <g>
        {/* bow (head) */}
        <circle cx="210" cy="68" r="22" fill="none" stroke="currentColor" strokeWidth="7" />
        {/* shaft */}
        <rect x="204" y="88" width="12" height="80" rx="3" fill="currentColor" />
        {/* teeth */}
        <rect x="216" y="138" width="14" height="7" rx="1.5" fill="currentColor" />
        <rect x="216" y="152" width="10" height="7" rx="1.5" fill="currentColor" />
      </g>
    </svg>
  );
}

// Pillar 2 · Add anything, from anywhere - package passing through a scanner
// beam, with a shield-check confirming the safe-import outcome.
// Signals: "imports come in from outside, get scanned + sandboxed, then admitted".
export function AnywhereScanVisual() {
  return (
    <svg viewBox="0 0 280 220" {...baseSvgProps}>
      {/* incoming arrows from outer edges (sources) */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 18 40 L 78 70" />
        <path d="M 72 64 L 78 70 L 70 72" />
        <path d="M 18 180 L 78 150" />
        <path d="M 70 148 L 78 150 L 72 156" />
        <path d="M 260 45 L 200 75" />
        <path d="M 206 70 L 200 75 L 208 78" />
      </g>

      {/* scanner frame corners */}
      <g fill="none" stroke="currentColor" strokeWidth="3" opacity="0.85" strokeLinecap="round">
        <path d="M 96 70 L 96 84 M 96 70 L 110 70" />
        <path d="M 184 70 L 184 84 M 184 70 L 170 70" />
        <path d="M 96 170 L 96 156 M 96 170 L 110 170" />
        <path d="M 184 170 L 184 156 M 184 170 L 170 170" />
      </g>

      {/* package being scanned */}
      <rect x="115" y="92" width="50" height="56" rx="4" fill="currentColor" opacity="0.9" />
      {/* tape lines */}
      <line x1="140" y1="92" x2="140" y2="148" stroke="white" strokeWidth="1.5" opacity="0.45" />
      <line x1="115" y1="120" x2="165" y2="120" stroke="white" strokeWidth="1.5" opacity="0.45" />

      {/* scanning beam */}
      <rect x="92" y="118" width="96" height="3" fill="currentColor" opacity="0.95" />
      <rect x="92" y="121" width="96" height="7" fill="currentColor" opacity="0.25" />

      {/* shield/check confirmation (bottom right) */}
      <g transform="translate(220, 158)">
        <path
          d="M 0 -22 L 24 -12 L 24 8 Q 24 24 0 32 Q -24 24 -24 8 L -24 -12 Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M -11 4 L -3 12 L 12 -5"
          fill="none"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
