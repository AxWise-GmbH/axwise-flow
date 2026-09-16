/**
 * HealingTimeline — surfaces the self-healer's interventions on this goal.
 *
 * Today the self-healer (lib/goal-handlers/self-healer.js) silently retries
 * stuck/failed goals via h00…h99 strategies and writes a `goal_log` row per
 * action. The user has no way to see what happened — only that the goal
 * eventually progressed (or didn't). This card filters the already-streamed
 * `goal.logs` for heal-related event types and renders a compact timeline.
 *
 * Returns null on healthy goals (no heal events) so the Pipeline tab stays
 * clean. No new realtime subscriptions — relies on `useGoalRealtime`
 * already keeping `goal.logs` fresh.
 */
import { Box, Paper, Typography, Chip, alpha, useTheme } from '@mui/material';
import PropTypes from 'prop-types';
import HealingIcon from '@mui/icons-material/Healing';
import { fmtRelative } from './_goalFormat';

import AppIcon from '../icons/AppIcon';

// Event types written by self-healer + healing-strategies/h*. Kept as a Set
// so the filter cost is O(1) per log row.
const HEAL_EVENT_TYPES = new Set([
  'goal_healed',
  'goal_needs_human',
  'goal_credential_dispatch',
  'goal_needs_human_credential',
  'human_action_required',
]);

/**
 * Map a strategy name (e.g. "h01-...", "h40-...", "h99-escalate") to a
 * severity bucket used for chip color. Strategies in the 00/99 band are
 * terminal/escalation (red); 01–04 are routine retries (amber); 40/45 are
 * credential-provisioning routes (info blue). Anything else falls back to
 * default grey.
 */
function strategyTone(strategy) {
  if (!strategy || typeof strategy !== 'string') return 'default';
  if (strategy.startsWith('h00') || strategy.startsWith('h99')) return 'error';
  if (/^h0[1-4]/.test(strategy)) return 'warning';
  if (strategy.startsWith('h40') || strategy.startsWith('h45')) return 'info';
  return 'default';
}

export default function HealingTimeline({ goal }) {
  const theme = useTheme();
  const events = (goal?.logs || []).filter((l) => HEAL_EVENT_TYPES.has(l?.event_type));
  if (events.length === 0) return null;

  const attempts = Number(goal?.data?.heal_attempts || 0);
  const lastStrategy = goal?.data?.last_heal_strategy;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2.5, borderColor: alpha(theme.palette.warning.main, 0.35) }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
        <AppIcon
          name="Healing"
          fallback={HealingIcon}
          sx={{ fontSize: 18, color: 'warning.main' }}
        />
        <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', flex: 1 }}>
          Self-Healer Timeline
          <Box
            component="span"
            sx={{ ml: 0.75, color: 'text.disabled', fontWeight: 500, fontSize: '0.72rem' }}
          >
            {events.length} event{events.length === 1 ? '' : 's'} · attempts {attempts}/6
            {lastStrategy ? ` · last: ${lastStrategy}` : ''}
          </Box>
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
        {events.map((ev) => {
          const strategy = ev.details?.strategy || ev.event_type;
          const tone = strategyTone(ev.details?.strategy);
          const stage = ev.details?.stage || ev.details?.action || '';
          const reason = ev.details?.reason || '';
          return (
            <Box
              key={ev.id || `${ev.event_type}-${ev.created_at}`}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                py: 0.6,
                px: 0.75,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.background.paper, 0.6),
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Chip
                size="small"
                label={strategy}
                color={tone === 'default' ? undefined : tone}
                variant="outlined"
                sx={{
                  fontSize: '0.62rem',
                  height: 20,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  flexShrink: 0,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {stage && (
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, lineHeight: 1.3 }}>
                    {stage}
                  </Typography>
                )}
                {reason && (
                  <Typography
                    sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.4, mt: 0.15 }}
                  >
                    {reason}
                  </Typography>
                )}
              </Box>
              <Typography
                sx={{ fontSize: '0.65rem', color: 'text.disabled', flexShrink: 0, mt: 0.2 }}
              >
                {fmtRelative(ev.created_at)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

HealingTimeline.propTypes = {
  goal: PropTypes.shape({
    logs: PropTypes.array,
    data: PropTypes.object,
  }),
};
