/**
 * GoalEstimates — compact estimates widget showing elapsed vs estimated time + cost.
 *
 * Used in:
 *   - JobPool goal cards (Requests page) — live countdown for active goals
 *   - GoalLiveCards estimates stage — same widget reused
 *
 * Renders:
 *   - "Estimate ~2m / Cost $0.0028" header
 *   - "12m 13s / 2m 00s" timer with progress bar
 *   - "Extra: +10m 13s" warning when over estimate
 */
import { useEffect, useState } from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';

import AppIcon from '../icons/AppIcon';

function fmtDur(seconds) {
  if (!seconds || seconds < 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

export default function GoalEstimates({
  startedAt,
  endedAt,
  estimatedMinutes,
  estimatedCostUsd,
  spentUsd,
  compact = false,
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return undefined;
    const start = new Date(startedAt).getTime();
    // If the goal has ended (completed/failed/cancelled), freeze the
    // elapsed time at the final duration instead of ticking forward.
    if (endedAt) {
      const end = new Date(endedAt).getTime();
      setElapsed(Math.max(0, Math.floor((end - start) / 1000)));
      return undefined;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, endedAt]);

  const estSec = (estimatedMinutes || 0) * 60;
  const isOver = estSec > 0 && elapsed > estSec;
  const extraSec = isOver ? elapsed - estSec : 0;
  const pct = estSec > 0 ? Math.min(100, (elapsed / estSec) * 100) : 0;
  const showCost = estimatedCostUsd != null || spentUsd != null;

  if (!startedAt && !estimatedMinutes && !showCost) return null;

  return (
    <Box sx={{ mt: 0.75 }}>
      {/* Header row: ESTIMATE / COST */}
      <Box sx={{ display: 'flex', gap: 2, mb: 0.5 }}>
        {estimatedMinutes != null && (
          <Box>
            <Typography
              sx={{
                fontSize: '0.55rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'text.disabled',
              }}
            >
              Estimate
            </Typography>
            <Typography sx={{ fontSize: compact ? '0.78rem' : '0.92rem', fontWeight: 700 }}>
              ~{estimatedMinutes}m
            </Typography>
          </Box>
        )}
        {showCost && (
          <Box>
            <Typography
              sx={{
                fontSize: '0.55rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'text.disabled',
              }}
            >
              Cost
            </Typography>
            <Typography sx={{ fontSize: compact ? '0.78rem' : '0.92rem', fontWeight: 700 }}>
              ${(spentUsd ?? estimatedCostUsd ?? 0).toFixed(4)}
            </Typography>
          </Box>
        )}
      </Box>
      {/* Live timer */}
      {startedAt && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
            <AppIcon
              name="TimerOutlined"
              fallback={TimerOutlinedIcon}
              sx={{ fontSize: 13, color: isOver ? 'error.main' : 'primary.main' }}
            />
            <Typography
              sx={{
                fontSize: '0.72rem',
                fontWeight: 700,
                fontFamily: 'monospace',
                color: isOver ? 'error.main' : 'text.primary',
              }}
            >
              {fmtDur(elapsed)}
            </Typography>
            {estSec > 0 && (
              <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled' }}>
                / {fmtDur(estSec)}
              </Typography>
            )}
          </Box>
          {estSec > 0 &&
            (() => {
              let barColor = 'primary';
              if (isOver) barColor = 'error';
              else if (pct > 80) barColor = 'warning';
              return (
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  color={barColor}
                  sx={{ height: 3, borderRadius: 2 }}
                />
              );
            })()}
          {isOver && (
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'error.main', mt: 0.25 }}>
              Extra: +{fmtDur(extraSec)}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
