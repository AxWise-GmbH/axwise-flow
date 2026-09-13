import { useState, useMemo } from 'react';
import { Box } from '@mui/material';
import { useEdges } from '@xyflow/react';
import { useShowConnectionNumbers } from './ShowConnectionNumbersContext';

/**
 * Returns per-handle connection numbers for a node.
 *
 * Numbers are assigned PER CONNECTION (edge), not per block:
 *   - Each edge is numbered sequentially: 1, 2, 3, 4 …
 *   - The source handle shows that number, the target handle shows the same number.
 *   - Handles with no connections show nothing (null).
 *   - If a handle has multiple connections, all numbers are shown.
 */
export function useHandleNumbers(nodeId) {
  const edges = useEdges();

  return useMemo(() => {
    if (!nodeId) {
      return { leftNumber: null, rightNumber: null, topNumber: null, bottomNumber: null };
    }
    if (!edges?.length) {
      return { leftNumber: null, rightNumber: null, topNumber: null, bottomNumber: null };
    }

    // Use edge array order (= creation order). No position-based sorting,
    // so numbers never change when blocks are moved.
    const handleNums = new Map();
    const addNum = (key, num) => {
      if (!handleNums.has(key)) handleNums.set(key, []);
      handleNums.get(key).push(num);
    };

    edges.forEach((e, i) => {
      const num = i + 1;
      const sh = e.sourceHandle ?? 'right-out';
      const th = e.targetHandle ?? 'left-out';
      addNum(`${e.source}\0${sh}`, num);
      addNum(`${e.target}\0${th}`, num);
    });

    const get = (handleId) => {
      const nums = handleNums.get(`${nodeId}\0${handleId}`);
      if (!nums || nums.length === 0) return null; // no connection = no badge
      if (nums.length === 1) return nums[0];
      return nums; // multiple connections → array
    };

    return {
      leftNumber: get('left-out'),
      rightNumber: get('right-out'),
      topNumber: get('top-out'),
      bottomNumber: get('bottom-out'),
    };
  }, [nodeId, edges]);
}

/**
 * Wraps a connection handle and shows a number badge.
 *
 * number: null → no badge | 5 → "5" | [1,3] → "1, 3"
 */
export function HandleWithNumber({ number, children, sx = {}, badgePosition = 'above' }) {
  const [hovered, setHovered] = useState(false);
  const { showAll } = useShowConnectionNumbers();
  const showBadge = hovered || showAll;

  // null = no connection on this handle → render handle without badge
  if (number == null) return children;

  const isArray = Array.isArray(number);
  const displayText = isArray ? number.join(', ') : String(number);
  const charCount = displayText.length;
  const badgeWidth = charCount <= 2 ? 22 : Math.min(12 + charCount * 7, 64);

  const badgeSx =
    badgePosition === 'below'
      ? { top: 'auto', bottom: -10, left: '50%', transform: 'translateX(-50%)' }
      : { top: -10, left: '50%', transform: 'translateX(-50%)' };

  return (
    <Box
      className="nodrag nopan"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...sx,
      }}
    >
      {children}
      {showBadge && (
        <Box
          sx={{
            position: 'absolute',
            ...badgeSx,
            minWidth: badgeWidth,
            height: 22,
            borderRadius: badgeWidth > 22 ? '11px' : '50%',
            bgcolor: '#22c55e',
            color: '#fff',
            fontWeight: 800,
            fontSize: charCount > 5 ? '0.6rem' : '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            border: '2px solid #fff',
            zIndex: 10,
            pointerEvents: 'none',
            px: charCount > 2 ? 0.5 : 0,
            whiteSpace: 'nowrap',
          }}
        >
          {displayText}
        </Box>
      )}
    </Box>
  );
}
