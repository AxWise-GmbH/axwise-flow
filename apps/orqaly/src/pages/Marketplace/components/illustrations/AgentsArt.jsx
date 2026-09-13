// Agents illustration - a central friendly bot bust with a glowing core,
// surrounded by 3 smaller "agent" satellites suggesting a coordinated swarm.
// Transparent SVG, currentColor-tinted to inherit the simple-mode neon green.
//
// Designed to slot into the right-side .mkt-tile__illustration container.
// The scene is translated right via the wrapper <g> so the central bot hugs
// the tile's right edge - same pattern as Tools / Skills / Consilium / Replicators.

function Bot({ cx, cy, r, accent = false }) {
  const headW = r * 1.6;
  const headH = r * 1.4;
  const eyeY = cy - r * 0.15;
  const eyeOff = r * 0.35;
  const antennaTop = cy - headH / 2 - r * 0.45;
  return (
    <g stroke="currentColor" strokeWidth="0.7" strokeLinejoin="round" strokeLinecap="round">
      {/* antenna */}
      <line x1={cx} y1={cy - headH / 2} x2={cx} y2={antennaTop} fill="none" />
      <circle
        cx={cx}
        cy={antennaTop}
        r={r * 0.18}
        fill="currentColor"
        opacity={accent ? 1.0 : 0.7}
      />
      {/* head (rounded rect) */}
      <rect
        x={cx - headW / 2}
        y={cy - headH / 2}
        width={headW}
        height={headH}
        rx={r * 0.35}
        ry={r * 0.35}
        fill="currentColor"
        fillOpacity={accent ? 0.32 : 0.22}
      />
      {/* visor strip */}
      <rect
        x={cx - headW / 2 + r * 0.2}
        y={eyeY - r * 0.25}
        width={headW - r * 0.4}
        height={r * 0.5}
        rx={r * 0.18}
        fill="currentColor"
        fillOpacity={accent ? 0.55 : 0.4}
      />
      {/* eyes */}
      <circle
        cx={cx - eyeOff}
        cy={eyeY}
        r={r * 0.12}
        fill="currentColor"
        opacity={accent ? 1.0 : 0.9}
      />
      <circle
        cx={cx + eyeOff}
        cy={eyeY}
        r={r * 0.12}
        fill="currentColor"
        opacity={accent ? 1.0 : 0.9}
      />
      {/* chin / collar dot */}
      <circle
        cx={cx}
        cy={cy + headH / 2 + r * 0.25}
        r={r * 0.12}
        fill="currentColor"
        opacity={accent ? 0.9 : 0.6}
      />
      {/* halo around accent bot */}
      {accent && (
        <circle
          cx={cx}
          cy={cy}
          r={Math.max(headW, headH) * 0.85}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="0.8"
        />
      )}
    </g>
  );
}

export default function AgentsArt() {
  return (
    <svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Floor disc for grounding (very faint) */}
      <ellipse cx="120" cy="150" rx="78" ry="10" fill="currentColor" opacity="0.08" />

      {/* Connector lines from central bot to satellites - faint */}
      <g stroke="currentColor" strokeOpacity="0.20" strokeWidth="0.6" strokeDasharray="2 3">
        <line x1="125" y1="95" x2="62" y2="55" />
        <line x1="125" y1="95" x2="60" y2="125" />
        <line x1="125" y1="95" x2="180" y2="55" />
      </g>

      {/* Satellites (smaller bots) - drawn first so central bot sits on top */}
      <Bot cx={62} cy={55} r={14} />
      <Bot cx={60} cy={125} r={14} />
      <Bot cx={180} cy={55} r={14} />

      {/* Central bot - the "master" */}
      <Bot cx={125} cy={95} r={26} accent />
    </svg>
  );
}
