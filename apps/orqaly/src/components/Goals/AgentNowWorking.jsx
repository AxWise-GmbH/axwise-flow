/**
 * AgentNowWorking — top-of-Work-Log banner showing who is doing what right now.
 *
 * Picks the most-recently-updated `team_tasks` row with status `'inProgress'`
 * (note: camelCase, verified in execute-task.js). Joins to the latest
 * `goal_messages` row for that agent so we can show what they last said.
 * Ticks every second so the "~Xm Ys ago" duration stays live without a
 * fresh fetch.
 *
 * Returns null on terminal goals — the Work Log tab is still visible
 * after completion, but a live banner makes no sense.
 *
 * Reuses already-streamed `tasks` and `messages` props (no new realtime
 * subscriptions). `tasks` come from WorkLogTab's local fetch; `messages`
 * come from useGoalRealtime via the dialog root.
 */
import { useEffect, useState, useMemo } from 'react';
import { Box, Paper, Typography, Chip, alpha, useTheme } from '@mui/material';
import PropTypes from 'prop-types';
import PulsingDot from './PulsingDot';
import { fmtDuration } from './_goalFormat';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const STUCK_AFTER_SEC = 5 * 60; // mirrors isStuck logic in GoalNowExecuting

function ageInSeconds(ts) {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
}

function findLatestMessageFor(agentName, messages) {
  if (!agentName || !Array.isArray(messages) || messages.length === 0) return null;
  // Walk backwards — messages prop is generally chronological.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const sender = m.sender_name || m.sender || m.metadata?.agent_name;
    if (sender === agentName) return m;
  }
  return null;
}

export default function AgentNowWorking({ goal, tasks, messages }) {
  const theme = useTheme();
  // Per-second tick so the duration stays live. Cheap setState that
  // re-renders only this component.
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const isTerminal = TERMINAL_STATUSES.has(goal?.status);

  const { active, extraCount, lastDone } = useMemo(() => {
    const all = Array.isArray(tasks) ? tasks : [];
    const inProgress = all
      .filter((t) => t?.status === 'inProgress')
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    const done = all
      .filter((t) => t?.status === 'done')
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    return {
      active: inProgress[0] || null,
      extraCount: Math.max(0, inProgress.length - 1),
      lastDone: done[0] || null,
    };
  }, [tasks]);

  if (isTerminal) return null;

  // No active task — show an idle line so the spot doesn't look empty.
  if (!active) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 1.25,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderColor: alpha(theme.palette.text.primary, 0.12),
        }}
      >
        <PulsingDot status="idle" size={7} />
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          {lastDone ? (
            <>
              Last completed: <b>{lastDone.assigned_to || 'Agent'}</b> · {lastDone.title}
            </>
          ) : (
            'No active task right now.'
          )}
        </Typography>
      </Paper>
    );
  }

  const ageSec = ageInSeconds(active.updated_at);
  const stuck = ageSec > STUCK_AFTER_SEC;
  const dotStatus = stuck ? 'warning' : 'running';
  const accent = stuck ? theme.palette.warning.main : theme.palette.info.main;
  const latestMsg = findLatestMessageFor(active.assigned_to, messages);
  const msgPreview = latestMsg
    ? (latestMsg.message || latestMsg.body || latestMsg.content || '').toString().slice(0, 160)
    : '';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        borderLeft: '3px solid',
        borderLeftColor: accent,
      }}
    >
      <Box sx={{ pt: 0.4, flexShrink: 0 }}>
        <PulsingDot status={dotStatus} size={8} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
            {active.assigned_to || 'Agent'}
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
            is working on
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.primary' }} noWrap>
            "{active.title}"
          </Typography>
          {extraCount > 0 && (
            <Chip
              size="small"
              label={`+${extraCount} more`}
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
            />
          )}
        </Box>
        {msgPreview && (
          <Typography
            sx={{
              fontSize: '0.72rem',
              color: 'text.secondary',
              fontStyle: 'italic',
              mt: 0.4,
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            "{msgPreview}"
          </Typography>
        )}
        <Typography
          sx={{
            fontSize: '0.65rem',
            color: stuck ? 'warning.main' : 'text.disabled',
            mt: 0.4,
            fontWeight: stuck ? 700 : 500,
          }}
        >
          {stuck ? 'Slow · ' : '~'}
          {fmtDuration(ageSec)}
        </Typography>
      </Box>
    </Paper>
  );
}

AgentNowWorking.propTypes = {
  goal: PropTypes.shape({ status: PropTypes.string }),
  tasks: PropTypes.array,
  messages: PropTypes.array,
};
