// Inline SVG only: the landing tests forbid img, and glyph characters read badly aloud.

export function ChevronGlyph({ className }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path
        d="M3.5 6 8 10.5 12.5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckGlyph({ className }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path
        d="M3 8.5 6.5 12 13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The same 24-stroke line-orb mark the product demo draws, sized by CSS.
export function OrqanixMark({ className }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} aria-hidden="true" focusable="false">
      {Array.from({ length: 24 }, (_, i) => (
        <line
          key={i}
          x1="25"
          y1="0"
          x2={41 + 4 * Math.sin((i * Math.PI) / 4)}
          y2="9"
          transform={`rotate(${i * 15})`}
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
