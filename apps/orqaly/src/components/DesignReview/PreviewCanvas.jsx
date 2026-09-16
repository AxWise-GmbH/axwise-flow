/**
 * PreviewCanvas — renders the deployed landing page in an iframe with a
 * click-to-pin overlay. The overlay captures clicks WITHOUT propagating them
 * to the iframe, so the user can drop pin comments on specific elements.
 *
 * Cross-origin caveat: the deployed page is served from *.workers.dev,
 * different origin from this app, so we cannot reach into the iframe's DOM
 * to compute a selector for the clicked node. As a workaround we capture the
 * click position in iframe-coordinate space, and ask the user to describe
 * the element themselves in the comment composer. For same-origin previews
 * (future: when we render the AI's HTML directly via srcdoc) we can upgrade
 * to true DOM-anchored pins.
 *
 * Props:
 *   - deploymentUrl: string                 — the deployed page
 *   - viewport: 'desktop' | 'tablet' | 'mobile'
 *   - pins: Array<{ id, x, y, status }>     — saved pins to render
 *   - onPlacePin: ({x, y}) => void          — called when user clicks empty space
 *   - onSelectPin: (id) => void             — called when user clicks an existing pin
 */
import { useRef } from 'react';
import { Box, alpha, useTheme } from '@mui/material';
import PropTypes from 'prop-types';

const VIEWPORT_SIZES = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

export default function PreviewCanvas({
  deploymentUrl,
  viewport = 'desktop',
  pins = [],
  onPlacePin,
  onSelectPin,
}) {
  const theme = useTheme();
  const overlayRef = useRef(null);
  const { width, height } = VIEWPORT_SIZES[viewport] || VIEWPORT_SIZES.desktop;

  const handleOverlayClick = (e) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onPlacePin?.({ x, y });
  };

  if (!deploymentUrl) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
        No deployment URL yet — the preview will appear once the Frontend Developer ships Phase 2.
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width,
        maxWidth: '100%',
        height,
        margin: '0 auto',
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        component="iframe"
        src={deploymentUrl}
        title="Deployment preview"
        sandbox="allow-scripts allow-same-origin"
        sx={{
          width: '100%',
          height: '100%',
          border: 0,
          display: 'block',
        }}
      />
      <Box
        ref={overlayRef}
        onClick={handleOverlayClick}
        sx={{
          position: 'absolute',
          inset: 0,
          cursor: 'crosshair',
          // Visible when hovered so the user remembers they can click to pin
          '&:hover': {
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          },
        }}
      >
        {pins.map((pin) => (
          <PinMarker
            key={pin.id}
            x={pin.x}
            y={pin.y}
            status={pin.status}
            index={pin.index}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelectPin?.(pin.id);
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

PreviewCanvas.propTypes = {
  deploymentUrl: PropTypes.string,
  viewport: PropTypes.oneOf(['desktop', 'tablet', 'mobile']),
  pins: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      x: PropTypes.number.isRequired,
      y: PropTypes.number.isRequired,
      status: PropTypes.string,
      index: PropTypes.number,
    })
  ),
  onPlacePin: PropTypes.func,
  onSelectPin: PropTypes.func,
};

function PinMarker({ x, y, status, index, onClick }) {
  const theme = useTheme();
  const color =
    status === 'applied'
      ? theme.palette.success.main
      : status === 'dismissed'
        ? theme.palette.grey[500]
        : theme.palette.primary.main;
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      sx={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -100%)',
        width: 28,
        height: 28,
        borderRadius: '50% 50% 50% 0',
        bgcolor: color,
        color: 'common.white',
        boxShadow: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        rotate: '-45deg',
        cursor: 'pointer',
        '& > span': { rotate: '45deg' },
        '&:hover': { transform: 'translate(-50%, -100%) scale(1.1)' },
      }}
    >
      <span>{index ?? '•'}</span>
    </Box>
  );
}

PinMarker.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  status: PropTypes.string,
  index: PropTypes.number,
  onClick: PropTypes.func,
};
