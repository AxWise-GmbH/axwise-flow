import { useEffect, useState } from 'react';
import { Box, Chip, Typography, alpha, useTheme } from '@mui/material';
import GoalRunViewSwitch from './GoalRunViewSwitch';
import { isTerminalStatus, needsUserAction } from './runStageCopy';

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const STATUS_LABEL = {
  draft: 'Getting ready',
  feasibility: 'Checking',
  analyzing: 'Understanding',
  researching_customer: 'Scoping',
  awaiting_context_approval: 'Needs you',
  planning: 'Planning',
  forming_team: 'Forming team',
  provisioning_tools: 'Setting up',
  estimating: 'Costing',
  awaiting_approval: 'Needs you',
  authorizing_execution: 'Authorizing',
  active: 'Working',
  pending_validation: 'Quality check',
  paused: 'Paused',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
  awaiting_tools: 'Needs a tool',
  awaiting_po_input: 'Needs you',
  needs_human: 'Needs you',
};

function elapsed(from, now) {
  if (!from) return null;
  const ms = now - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * The header for a goal being formed or run: what it is, where it is, what it
 * has cost, how it is shown, and what you can do to it.
 *
 * Appears as soon as the request is sent rather than waiting for the goal row.
 * The view switch gated behind a created goal meant nobody could reach it while
 * analysis was still running, which is most of the time you are looking at this
 * screen.
 */
export default function GoalRunBar({ goal }) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());

  const status = goal?.status;
  const live = Boolean(goal?.created_at) && !isTerminalStatus(status);

  // A visibly moving clock is the cheapest honest signal that something is
  // still happening; a frozen one reads as a hang.
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Nothing to head up until the goal row exists. Rendering with only a
  // spacer and the view switch produced an empty full-width row with a control
  // floating off in the corner, detached from anything it governed.
  if (!goal?.id) return null;

  const spent = Number(goal?.spent_usd || 0);
  const budget = Number(goal?.budget_usd || 0);
  const tight = budget > 0 && spent / budget > 0.7;
  const since = elapsed(goal?.created_at, now);
  const blocked = needsUserAction(status);
  const failed = status === 'failed' || status === 'cancelled';

  const tone = failed
    ? theme.palette.error.main
    : blocked
      ? theme.palette.warning.main
      : theme.palette.primary.main;

  return (
    <Box sx={{ mb: 1.5, width: '100%', textAlign: 'left' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {goal?.title && (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: '-0.014em',
              minWidth: 0,
              maxWidth: { xs: '100%', sm: 320 },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {goal.title}
          </Typography>
        )}

        {status && (
          <Chip
            size="small"
            label={STATUS_LABEL[status] || status}
            sx={{
              height: 22,
              fontSize: '0.65rem',
              fontWeight: 700,
              color: tone,
              bgcolor: alpha(tone, 0.1),
              border: '1px solid',
              borderColor: alpha(tone, 0.28),
              '& .MuiChip-label': { px: 1 },
            }}
          />
        )}

        {(since || budget > 0) && (
          <Typography
            variant="caption"
            sx={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.68rem',
              color: tight ? 'warning.main' : 'text.disabled',
              fontWeight: tight ? 700 : 500,
            }}
          >
            {[since, budget > 0 ? `${money(spent)} of ${money(budget)}` : null]
              .filter(Boolean)
              .join('  ·  ')}
          </Typography>
        )}

        <Box sx={{ flex: 1, minWidth: 8 }} />

        {/* Thread or Dashboard. Here rather than above the composer: it
            switches the run, and a switch over the input crowded the one thing
            the user is trying to type into. */}
        {goal?.id && <GoalRunViewSwitch />}

        {/* No Actions button here. It lived in this row, and this row scrolls
            with the conversation - so on any run longer than a screen the one
            control that can pause or cancel the goal scrolled out of reach
            exactly when the run was long enough to want it. It is in the fixed
            top bar now, published through RunningGoalContext. */}
      </Box>

      {/* No "your deliverables are in Result" line here. It named a tab this
          surface does not have and carried no way to get to it. The run's own
          result card says what came out, with the files on it. */}
    </Box>
  );
}
