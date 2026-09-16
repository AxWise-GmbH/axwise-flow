import { Box, keyframes } from '@mui/material';

/* ── Keyframe animations ── */

// The scan line sweeps vertically across the face
const scanLine = keyframes`
  0%   { top: 15%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 80%; opacity: 0; }
`;

// Subtle pulse on the whole icon container
const iconPulse = keyframes`
  0%, 100% { opacity: 0.92; }
  50%      { opacity: 1; }
`;

// Corner brackets glow
const cornerGlow = keyframes`
  0%, 100% { opacity: 0.6; filter: drop-shadow(0 0 1px currentColor); }
  50%      { opacity: 1;   filter: drop-shadow(0 0 3px currentColor); }
`;

/**
 * Animated face-scanning / face-recognition icon.
 * Always animates when rendered (designed to run while "Let's Talk" dialog is open).
 *
 * @param {number}  size      – icon bounding box in px (default 22)
 * @param {string}  color     – stroke / fill colour (default inherits via currentColor)
 * @param {object}  sx        – extra MUI sx overrides
 */
export default function FaceScanIcon({ size = 22, color = 'currentColor', sx = {} }) {
  return (
    <Box
      component="span"
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        animation: `${iconPulse} 3s ease-in-out infinite`,
        ...sx,
      }}
    >
      {/* SVG: face outline + scanning frame corners */}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {/* ── Corner brackets (scanning frame) ── */}
        <g
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animation: `${cornerGlow} 2.5s ease-in-out infinite` }}
        >
          {/* Top-left */}
          <path d="M3 8V5a2 2 0 0 1 2-2h3" />
          {/* Top-right */}
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          {/* Bottom-left */}
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          {/* Bottom-right */}
          <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
        </g>

        {/* ── Simplified face ── */}
        <g stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.7">
          {/* Head outline (oval) */}
          <ellipse cx="12" cy="12.5" rx="5" ry="6" />
          {/* Left eye */}
          <circle cx="10" cy="11" r="0.8" fill={color} stroke="none" />
          {/* Right eye */}
          <circle cx="14" cy="11" r="0.8" fill={color} stroke="none" />
          {/* Mouth */}
          <path d="M10 14.5c.8.7 2.4.7 3.2 0" />
        </g>
      </svg>

      {/* ── Animated scan line ── */}
      <Box
        component="span"
        sx={{
          position: 'absolute',
          left: '15%',
          right: '15%',
          height: '2px',
          borderRadius: '1px',
          background: (t) =>
            `linear-gradient(90deg, transparent 0%, ${color === 'currentColor' ? t.palette.primary.main : color} 40%, ${color === 'currentColor' ? t.palette.primary.light : color} 60%, transparent 100%)`,
          boxShadow: (t) =>
            `0 0 6px 1px ${color === 'currentColor' ? t.palette.primary.main : color}`,
          opacity: 0,
          top: '15%',
          animation: `${scanLine} 2s ease-in-out infinite`,
        }}
      />
    </Box>
  );
}
