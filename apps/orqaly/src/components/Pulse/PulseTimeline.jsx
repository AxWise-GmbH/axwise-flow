/**
 * PulseTimeline — 24-hour timeline visualization for pulse-enabled agents.
 * Each row shows an agent with scheduled fire-time dots along a 0h–24h bar.
 *
 * Dot colors:
 *   gray     = scheduled (future)
 *   green    = completed & kept
 *   red      = discarded
 *   pulsing  = currently running
 */
import { useMemo } from 'react';
import { Box, Typography, Paper, Chip, Tooltip, useTheme, alpha } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { keyframes } from '@mui/system';

import AppIcon from '../icons/AppIcon';

/* ── Pulsing animation for active dots ──────────────────────── */
const pulseRing = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.5); }
  70%  { box-shadow: 0 0 0 6px rgba(76, 175, 80, 0); }
  100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
`;

/* ── Hour labels along the top ──────────────────────────────── */
const HOUR_LABELS = [0, 4, 8, 12, 16, 20, 24];

/**
 * Compute scheduled fire times for a 24-hour window based on interval.
 * Returns an array of hour floats (e.g. [0, 4, 8, 12, 16, 20]).
 */
function getScheduledHours(intervalHours) {
  if (!intervalHours || intervalHours <= 0) return [];
  const hours = [];
  let t = 0;
  while (t < 24) {
    hours.push(t);
    t += intervalHours;
  }
  return hours;
}

/**
 * Map a Date object to a position in 0–100 within the current day.
 */
function timeToPercent(date) {
  const d = new Date(date);
  return ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
}

export default function PulseTimeline({ agents = [], cycles = [] }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  /* ── Build dot data per agent ─────────────────────────────── */
  const rows = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    return agents.map((agent) => {
      const intervalH = agent.pulse_interval_hours || agent.interval_hours || 4;
      const mode = agent.pulse_mode || agent.mode || 'Lite';
      const isAutonomous = agent.autonomous === true || agent.pulse_autonomous === true;
      const scheduledHours = getScheduledHours(intervalH);

      // Cycles for this agent today
      const agentCycles = cycles.filter(
        (c) =>
          c.agent_id === agent.id &&
          c.created_at &&
          c.created_at >= todayStart.toISOString() &&
          c.created_at < todayEnd.toISOString()
      );

      // Map scheduled hours to dots
      const dots = scheduledHours.map((hour) => {
        const scheduledTime = new Date(todayStart.getTime() + hour * 60 * 60 * 1000);
        const pct = (hour / 24) * 100;

        // Check if a cycle matches this scheduled slot (within 30 min window)
        const matchedCycle = agentCycles.find((c) => {
          const cTime = new Date(c.created_at);
          return Math.abs(cTime.getTime() - scheduledTime.getTime()) < 30 * 60 * 1000;
        });

        let dotStatus = 'scheduled'; // gray
        let taskFocus = null;

        if (matchedCycle) {
          if (matchedCycle.status === 'keep') dotStatus = 'kept';
          else if (matchedCycle.status === 'discard') dotStatus = 'discarded';
          else if (matchedCycle.status === 'crash') dotStatus = 'discarded';
          else if (matchedCycle.status === 'running') dotStatus = 'running';
          taskFocus = matchedCycle.task_focus || matchedCycle.description || null;
        } else if (scheduledTime <= now) {
          // Past but no cycle recorded — might be running now
          const diffMin = (now.getTime() - scheduledTime.getTime()) / 60000;
          if (diffMin < 15) dotStatus = 'running';
        }

        return { hour, pct, dotStatus, taskFocus, matchedCycle };
      });

      return { agent, intervalH, mode, isAutonomous, dots };
    });
  }, [agents, cycles]);

  /* ── Dot color mapping ────────────────────────────────────── */
  const getDotStyles = (status) => {
    switch (status) {
      case 'kept':
        return {
          bgcolor: theme.palette.success.main,
          border: `2px solid ${theme.palette.success.main}`,
        };
      case 'discarded':
        return {
          bgcolor: theme.palette.error.main,
          border: `2px solid ${theme.palette.error.main}`,
        };
      case 'running':
        return {
          bgcolor: theme.palette.success.main,
          border: `2px solid ${theme.palette.success.light}`,
          animation: `${pulseRing} 1.5s infinite`,
        };
      default: // scheduled
        return {
          bgcolor: isDark
            ? alpha(theme.palette.text.disabled, 0.35)
            : alpha(theme.palette.text.disabled, 0.25),
          border: `2px solid ${alpha(theme.palette.text.disabled, 0.4)}`,
        };
    }
  };

  const handleRowClick = (agent) => {
    console.log('[PulseTimeline] Row clicked:', agent.name || agent.id);
  };

  if (agents.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 4,
          borderRadius: 2,
          textAlign: 'center',
        }}
      >
        <AppIcon
          name="SmartToyOutlined"
          fallback={SmartToyOutlinedIcon}
          sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }}
        />
        <Typography
          variant="caption"
          sx={{ fontSize: '0.72rem', color: 'text.disabled', display: 'block' }}
        >
          No pulse-enabled agents found
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* ── Hour labels ──────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          pl: '180px',
          pr: 2,
          pt: 1,
          pb: 0.5,
        }}
      >
        <Box sx={{ position: 'relative', flex: 1, height: 16 }}>
          {HOUR_LABELS.map((h) => (
            <Typography
              key={h}
              variant="caption"
              sx={{
                position: 'absolute',
                left: `${(h / 24) * 100}%`,
                transform: 'translateX(-50%)',
                fontSize: '0.62rem',
                color: 'text.disabled',
                fontWeight: 600,
                userSelect: 'none',
              }}
            >
              {h}h
            </Typography>
          ))}
        </Box>
      </Box>

      {/* ── Agent rows ───────────────────────────────────────── */}
      {rows.map(({ agent, intervalH, mode, isAutonomous, dots }) => (
        <Box
          key={agent.id}
          onClick={() => handleRowClick(agent)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 2,
            py: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            cursor: 'pointer',
            transition: 'background 0.15s',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          {/* Agent info column */}
          <Box sx={{ width: 164, flexShrink: 0, mr: 1 }}>
            <Typography
              sx={{
                fontSize: '0.74rem',
                fontWeight: 700,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {agent.name || 'Unnamed Agent'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label={`${intervalH}h`}
                sx={{
                  fontSize: '0.6rem',
                  height: 18,
                  fontWeight: 700,
                  bgcolor: alpha(theme.palette.info.main, 0.12),
                  color: theme.palette.info.main,
                }}
              />
              <Chip
                size="small"
                label={mode}
                variant="outlined"
                sx={{
                  fontSize: '0.6rem',
                  height: 18,
                  fontWeight: 600,
                }}
              />
              {isAutonomous && (
                <Chip
                  size="small"
                  label="Auto"
                  sx={{
                    fontSize: '0.58rem',
                    height: 18,
                    fontWeight: 700,
                    bgcolor: alpha(theme.palette.warning.main, 0.12),
                    color: theme.palette.warning.main,
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Timeline bar */}
          <Box
            sx={{
              flex: 1,
              position: 'relative',
              height: 28,
              bgcolor: alpha(theme.palette.divider, 0.08),
              borderRadius: 1,
              overflow: 'visible',
            }}
          >
            {/* Background grid lines at hour marks */}
            {HOUR_LABELS.slice(1, -1).map((h) => (
              <Box
                key={h}
                sx={{
                  position: 'absolute',
                  left: `${(h / 24) * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  bgcolor: alpha(theme.palette.divider, 0.15),
                }}
              />
            ))}

            {/* Current-time marker */}
            <Box
              sx={{
                position: 'absolute',
                left: `${timeToPercent(new Date())}%`,
                top: 0,
                bottom: 0,
                width: '1px',
                bgcolor: alpha(theme.palette.warning.main, 0.5),
                zIndex: 1,
              }}
            />

            {/* Dots */}
            {dots.map((dot, i) => {
              const styles = getDotStyles(dot.dotStatus);
              return (
                <Tooltip
                  key={i}
                  title={
                    <Box>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700 }}>
                        {dot.hour}:00 - {dot.dotStatus}
                      </Typography>
                      {dot.taskFocus && (
                        <Typography sx={{ fontSize: '0.62rem', mt: 0.25 }}>
                          {dot.taskFocus}
                        </Typography>
                      )}
                    </Box>
                  }
                  arrow
                  placement="top"
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      left: `${dot.pct}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      zIndex: 2,
                      cursor: 'pointer',
                      transition: 'transform 0.15s',
                      '&:hover': { transform: 'translate(-50%, -50%) scale(1.4)' },
                      ...styles,
                    }}
                  >
                    {/* Task focus badge on running dots */}
                    {dot.dotStatus === 'running' && dot.taskFocus && (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: -20,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          whiteSpace: 'nowrap',
                          bgcolor: alpha(theme.palette.success.main, 0.15),
                          color: theme.palette.success.main,
                          fontSize: '0.55rem',
                          fontWeight: 700,
                          px: 0.75,
                          py: 0.15,
                          borderRadius: 1,
                          lineHeight: 1.2,
                          pointerEvents: 'none',
                        }}
                      >
                        {dot.taskFocus.length > 24
                          ? `${dot.taskFocus.slice(0, 24)}...`
                          : dot.taskFocus}
                      </Box>
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      ))}
    </Paper>
  );
}
