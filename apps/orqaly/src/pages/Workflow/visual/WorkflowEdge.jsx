import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { IconButton, Tooltip, alpha, useTheme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import AppIcon from '../../../components/icons/AppIcon';

function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected,
}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const hideTimerRef = useRef(null);
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onRemove = data?.onRemove;
  const showRemove = typeof onRemove === 'function' && Boolean(selected || isHovered || isClicked);

  const setHovered = useCallback((next) => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsHovered(next);
  }, []);

  const scheduleHide = useCallback(() => {
    if (selected || isClicked) return;
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setIsHovered(false), 60);
  }, [selected, isClicked]);

  // When the edge is deselected, drop the "clicked" active state.
  useEffect(() => {
    if (!selected) setIsClicked(false);
  }, [selected]);

  // Place the control close to the target handle.
  const vx = sourceX - targetX;
  const vy = sourceY - targetY;
  const len = Math.hypot(vx, vy) || 1;
  const btnX = targetX + (vx / len) * 34;
  const btnY = targetY + (vy / len) * 34;

  return (
    <>
      {/* Hover hit-area (transparent, thicker) */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="react-flow__edge-interaction"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={scheduleHide}
        onClick={() => setIsClicked(true)}
      />
      {/* Visible edge */}
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {typeof onRemove === 'function' && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan workflow-edge-remove"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${btnX}px,${btnY}px)`,
              pointerEvents: 'all',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={scheduleHide}
          >
            <Tooltip title="Remove connection">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove(id);
                }}
                sx={{
                  width: 24,
                  height: 24,
                  bgcolor: alpha(theme.palette.background.paper, 0.92),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.9),
                  color: theme.palette.text.secondary,
                  boxShadow: `0 8px 22px ${alpha(theme.palette.common.black, 0.14)}`,
                  transition: 'opacity 0.12s ease, transform 0.12s ease, color 0.12s ease',
                  opacity: showRemove ? 1 : 0,
                  transform: showRemove ? 'scale(1)' : 'scale(0.92)',
                  pointerEvents: showRemove ? 'auto' : 'none',
                  '&:hover': {
                    color: theme.palette.error.main,
                    bgcolor: alpha(
                      theme.palette.error.main,
                      theme.palette.mode === 'dark' ? 0.16 : 0.1
                    ),
                    borderColor: alpha(theme.palette.error.main, 0.55),
                  },
                }}
              >
                <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(WorkflowEdge);
