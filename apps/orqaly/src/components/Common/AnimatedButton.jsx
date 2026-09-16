import React from 'react';
import { Box, useTheme, alpha, keyframes } from '@mui/material';
import PropTypes from 'prop-types';

/**
 * Rotating light - travels clockwise around the button edge
 */
const borderGlowRotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

/**
 * Animated button with:
 * - Idle: subtle circular light traveling clockwise around the border (primary color, reduced opacity, blur)
 * - Hover: animation stops, steady outward glow (box-shadow)
 * - Focus: clear focus ring for accessibility
 *
 * Use as wrapper inside another button (component="span") or standalone (component="button").
 */
export default function AnimatedButton({
  children,
  onClick,
  size = 28,
  disabled = false,
  component: Component = 'span',
  'aria-label': ariaLabel,
  sx = {},
  ...props
}) {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isButton = Component === 'button';

  // Glow: primary with reduced opacity - soft but visible
  const glowColor = alpha(primary, 0.6);
  const glowColorSoft = alpha(primary, 0.25);

  // Conic gradient: one bright wedge that rotates around the edge
  const conicGradient = `conic-gradient(from 0deg, transparent 0deg, transparent 250deg, ${glowColorSoft} 270deg, ${glowColor} 295deg, ${glowColorSoft} 320deg, transparent 360deg)`;

  const ringSize = 8;

  return (
    <Box
      component={Component}
      type={isButton ? 'button' : undefined}
      onClick={isButton ? onClick : undefined}
      disabled={isButton ? disabled : undefined}
      aria-label={ariaLabel}
      sx={{
        position: 'relative',
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        padding: 0,
        margin: 0,
        borderRadius: '50%',
        border: 'none',
        cursor: isButton && !disabled ? 'pointer' : 'inherit',
        outline: 'none',
        overflow: 'visible',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Reset when used as button
        background: 'transparent',
        font: 'inherit',
        color: 'inherit',
        WebkitTapHighlightColor: 'transparent',
        transition: 'box-shadow 0.25s ease, transform 0.2s ease',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: primary,
          outlineOffset: 2,
        },
        '&:hover': {
          '& .AnimatedButton-glowRing': {
            animation: 'none',
            opacity: 0,
          },
          boxShadow: `0 0 20px ${alpha(primary, 0.4)}, 0 0 40px ${alpha(primary, 0.25)}`,
        },
        '&:active': {
          transform: 'scale(0.98)',
        },
        ...(isButton &&
          disabled && {
            opacity: 0.6,
            cursor: 'default',
          }),
        ...sx,
      }}
      {...props}
    >
      {/* Rotating glow ring - soft light traveling clockwise around the border */}
      <Box
        className="AnimatedButton-glowRing"
        sx={{
          position: 'absolute',
          top: -ringSize,
          left: -ringSize,
          right: -ringSize,
          bottom: -ringSize,
          borderRadius: '50%',
          background: conicGradient,
          filter: 'blur(4px)',
          animation: `${borderGlowRotate} 2.5s linear infinite`,
          pointerEvents: 'none',
          opacity: 1,
          transition: 'opacity 0.25s ease',
          willChange: 'transform',
          // Fallback: subtle static glow so effect is always visible
          boxShadow: `0 0 12px ${alpha(primary, 0.15)}`,
        }}
      />
      {/* Inner content area - provides the solid center so glow appears only at edge */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

AnimatedButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  size: PropTypes.number,
  disabled: PropTypes.bool,
  component: PropTypes.elementType,
  'aria-label': PropTypes.string,
  sx: PropTypes.object,
};
