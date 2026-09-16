import { Box, keyframes, useTheme, alpha } from '@mui/material';

/* ── Keyframe animations ── */

// Slow continuous rotation of the orb
const orbRotate = keyframes`
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

// Counter-rotation for inner swirl layer
const orbRotateReverse = keyframes`
  0%   { transform: rotate(0deg) scale(1); }
  50%  { transform: rotate(-180deg) scale(1.05); }
  100% { transform: rotate(-360deg) scale(1); }
`;

// Gentle floating up/down
const orbFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
`;

// Outer glow ring pulse
const glowPulse = keyframes`
  0%, 100% { opacity: 0.25; transform: scale(1); }
  50%      { opacity: 0.5;  transform: scale(1.08); }
`;

// Dark spot migrations — slow drifting blobs inside the orb
const spotDrift1 = keyframes`
  0%   { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(15%, -20%) scale(1.2); }
  50%  { transform: translate(-10%, -10%) scale(0.9); }
  75%  { transform: translate(20%, 15%) scale(1.1); }
  100% { transform: translate(0, 0) scale(1); }
`;

const spotDrift2 = keyframes`
  0%   { transform: translate(0, 0) scale(1.1); }
  25%  { transform: translate(-20%, 10%) scale(0.85); }
  50%  { transform: translate(15%, 20%) scale(1.15); }
  75%  { transform: translate(-5%, -15%) scale(0.95); }
  100% { transform: translate(0, 0) scale(1.1); }
`;

const spotDrift3 = keyframes`
  0%   { transform: translate(0, 0) scale(0.9); }
  30%  { transform: translate(10%, 25%) scale(1.1); }
  60%  { transform: translate(-18%, -8%) scale(1.05); }
  100% { transform: translate(0, 0) scale(0.9); }
`;

// Active / speaking state – faster, more energetic
const orbPulseActive = keyframes`
  0%, 100% { transform: scale(1);    filter: brightness(1); }
  25%      { transform: scale(1.06); filter: brightness(1.3); }
  50%      { transform: scale(0.97); filter: brightness(1.1); }
  75%      { transform: scale(1.04); filter: brightness(1.25); }
`;

// Searching state – rhythmic breathing
const orbBreathing = keyframes`
  0%, 100% { transform: scale(1);    filter: brightness(1); }
  50%      { transform: scale(1.08); filter: brightness(1.2); }
`;

/**
 * Animated AI Orb / Sphere — inspired by the Dribbble Voice AI Studio design.
 *
 * Uses layered radial/conic gradients + blur to simulate a glowing 3D orb
 * entirely in CSS. Adapts to theme primary colour and light/dark mode.
 *
 * @param {'idle'|'listening'|'searching'|'speaking'} state
 * @param {number} size - diameter in px (default 160)
 * @param {boolean} disableFloat - disable idle float animation (default false)
 */
export default function AiOrb({ state = 'idle', size = 160, disableFloat = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { main, light, dark } = theme.palette.primary;

  // Determine animation based on state
  const isActive = state === 'listening' || state === 'speaking';
  const isSearching = state === 'searching';

  const stateAnimation = isActive
    ? `${orbPulseActive} 1.6s ease-in-out infinite`
    : isSearching
      ? `${orbBreathing} 2.5s ease-in-out infinite`
      : 'none';

  const rotationSpeed = isActive ? '4s' : isSearching ? '6s' : '12s';
  const reverseSpeed = isActive ? '3s' : isSearching ? '5s' : '10s';

  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: disableFloat ? 'none' : `${orbFloat} 5s ease-in-out infinite`,
      }}
    >
      {/* Outer glow ring */}
      <Box
        sx={{
          position: 'absolute',
          inset: -size * 0.2,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(main, 0.3)} 0%, ${alpha(main, 0.08)} 50%, transparent 70%)`,
          animation: `${glowPulse} ${isActive ? '1.5s' : '4s'} ease-in-out infinite`,
          pointerEvents: 'none',
        }}
      />

      {/* Main orb container */}
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          position: 'relative',
          overflow: 'hidden',
          animation: stateAnimation,
          boxShadow: [
            `0 0 ${size * 0.25}px ${size * 0.05}px ${alpha(main, 0.4)}`,
            `0 0 ${size * 0.5}px ${size * 0.1}px ${alpha(main, 0.15)}`,
            `inset 0 0 ${size * 0.2}px ${alpha(dark, 0.5)}`,
          ].join(', '),
        }}
      >
        {/* Base layer – deep dark with primary tint */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: isDark
              ? `radial-gradient(ellipse at 40% 40%, ${alpha(main, 0.35)} 0%, ${alpha(dark, 0.6)} 40%, ${isDark ? '#080c14' : '#1a1a2e'} 100%)`
              : `radial-gradient(ellipse at 40% 40%, ${alpha(light, 0.5)} 0%, ${alpha(main, 0.4)} 40%, ${alpha(dark, 0.8)} 100%)`,
          }}
        />

        {/* Rotating swirl layer 1 – conic gradient */}
        <Box
          sx={{
            position: 'absolute',
            inset: '5%',
            borderRadius: '50%',
            background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${alpha(light, 0.5)} 60deg, transparent 120deg, ${alpha(main, 0.35)} 200deg, transparent 280deg, ${alpha(light, 0.25)} 340deg, transparent 360deg)`,
            animation: `${orbRotate} ${rotationSpeed} linear infinite`,
            filter: `blur(${size * 0.06}px)`,
          }}
        />

        {/* Rotating swirl layer 2 – counter-rotating */}
        <Box
          sx={{
            position: 'absolute',
            inset: '10%',
            borderRadius: '50%',
            background: `conic-gradient(from 180deg at 45% 55%, transparent 0deg, ${alpha(main, 0.45)} 80deg, transparent 160deg, ${alpha(light, 0.3)} 240deg, transparent 320deg)`,
            animation: `${orbRotateReverse} ${reverseSpeed} linear infinite`,
            filter: `blur(${size * 0.08}px)`,
          }}
        />

        {/* Dark migrating spots — deep interior blobs */}
        <Box
          sx={{
            position: 'absolute',
            top: '15%',
            left: '10%',
            width: '45%',
            height: '45%',
            borderRadius: '50%',
            background: `radial-gradient(ellipse at 50% 50%, ${alpha(dark, 0.7)} 0%, ${alpha(dark, 0.3)} 40%, transparent 70%)`,
            animation: `${spotDrift1} ${isActive ? '6s' : isSearching ? '8s' : '12s'} ease-in-out infinite`,
            filter: `blur(${size * 0.08}px)`,
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: '10%',
            right: '8%',
            width: '50%',
            height: '50%',
            borderRadius: '50%',
            background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.6) 0%, ${alpha(dark, 0.25)} 45%, transparent 70%)`,
            animation: `${spotDrift2} ${isActive ? '5s' : isSearching ? '7s' : '10s'} ease-in-out infinite`,
            filter: `blur(${size * 0.1}px)`,
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '30%',
            right: '15%',
            width: '35%',
            height: '35%',
            borderRadius: '50%',
            background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.5) 0%, ${alpha(dark, 0.2)} 50%, transparent 75%)`,
            animation: `${spotDrift3} ${isActive ? '7s' : isSearching ? '9s' : '14s'} ease-in-out infinite`,
            filter: `blur(${size * 0.07}px)`,
            pointerEvents: 'none',
          }}
        />

        {/* Inner glow – highlight spot (top-left) */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(ellipse at 30% 25%, ${alpha('#ffffff', isDark ? 0.15 : 0.25)} 0%, transparent 50%)`,
            pointerEvents: 'none',
          }}
        />

        {/* Rim light – bright edge at top */}
        <Box
          sx={{
            position: 'absolute',
            top: '2%',
            left: '15%',
            right: '15%',
            height: '35%',
            borderRadius: '50%',
            background: `radial-gradient(ellipse at 50% 0%, ${alpha(light, isDark ? 0.55 : 0.65)} 0%, transparent 70%)`,
            filter: `blur(${size * 0.04}px)`,
            animation: `${orbRotate} ${rotationSpeed} linear infinite`,
            pointerEvents: 'none',
          }}
        />

        {/* Glass reflection arc */}
        <Box
          sx={{
            position: 'absolute',
            top: '8%',
            left: '22%',
            width: '56%',
            height: '28%',
            borderRadius: '50%',
            background: `linear-gradient(180deg, ${alpha('#ffffff', isDark ? 0.18 : 0.3)} 0%, transparent 100%)`,
            filter: `blur(${size * 0.02}px)`,
            pointerEvents: 'none',
          }}
        />
      </Box>
    </Box>
  );
}
