import { useState } from 'react';
import { Box, Collapse, Typography, alpha, useTheme } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import GlassIcon from '../../icons/GlassIcon';

/**
 * The user-visible pipeline stages, in order.
 *
 * Deliberately not reusing PIPELINE_STAGES or GoalLiveCards' STAGES: both carry
 * emoji in their `icon` fields, and this design has none. Same keys and same
 * order, so `goals.status` maps identically; only the icons differ.
 */
export const RAIL_STAGES = [
  {
    key: 'feasibility',
    label: 'Analysis',
    hint: 'Feasibility and risk',
    icon: 'SearchOutlined',
    fallback: SearchOutlinedIcon,
  },
  {
    key: 'analyzing',
    label: 'Brief',
    hint: 'Problem, outcomes, constraints',
    icon: 'DescriptionOutlined',
    fallback: DescriptionOutlinedIcon,
  },
  {
    key: 'researching_customer',
    label: 'Scope',
    hint: 'Outcome, assumptions, capabilities',
    icon: 'ExploreOutlined',
    fallback: ExploreOutlinedIcon,
  },
  {
    key: 'planning',
    label: 'Plan',
    hint: 'Phases and tasks',
    icon: 'MapOutlined',
    fallback: MapOutlinedIcon,
  },
  {
    key: 'forming_team',
    label: 'Team',
    hint: 'Agents and roles',
    icon: 'GroupsOutlined',
    fallback: GroupsOutlinedIcon,
  },
  {
    key: 'provisioning_tools',
    label: 'Tools',
    hint: 'Keys and integrations',
    icon: 'BuildOutlined',
    fallback: BuildOutlinedIcon,
  },
  {
    key: 'estimating',
    label: 'Estimate',
    hint: 'Time and cost',
    icon: 'SpeedOutlined',
    fallback: SpeedOutlinedIcon,
  },
  {
    key: 'active',
    label: 'Execution',
    hint: 'Running the phases',
    icon: 'BoltOutlined',
    fallback: BoltOutlinedIcon,
  },
  {
    key: 'pending_validation',
    label: 'Quality',
    hint: 'Scope-bound final checks',
    icon: 'CheckOutlined',
    fallback: CheckOutlinedIcon,
  },
];

// Smart Requests admit an AxWise scope before any legacy feasibility/PO
// fallback. Keep the persisted status vocabulary stable while showing the
// workflow in the order this entrypoint actually runs it.
export const SCOPE_FIRST_RAIL_STAGES = [
  {
    key: 'analyzing',
    label: 'Scope',
    hint: 'Outcome, assumptions, constraints',
    icon: 'DescriptionOutlined',
    fallback: DescriptionOutlinedIcon,
  },
  {
    key: 'researching_customer',
    label: 'Evidence',
    hint: 'Grounding and required capabilities',
    icon: 'ExploreOutlined',
    fallback: ExploreOutlinedIcon,
  },
  ...RAIL_STAGES.filter((stage) =>
    [
      'planning',
      'forming_team',
      'provisioning_tools',
      'estimating',
      'active',
      'pending_validation',
    ].includes(stage.key)
  ),
];

/** Statuses that park mid-pipeline, mapped to the stage they are waiting in. */
const WAITING_AT = {
  awaiting_context_approval: 2,
  awaiting_tools: 5,
  awaiting_approval: 6,
  authorizing_execution: 7,
  awaiting_po_input: 1,
};

const SCOPE_FIRST_WAITING_AT = {
  feasibility: 0,
  awaiting_context_approval: 0,
  awaiting_po_input: 0,
  awaiting_tools: 4,
  awaiting_approval: 5,
  authorizing_execution: 6,
};

/**
 * How far along a status is: the index of the stage currently in flight, or
 * RAIL_STAGES.length once it is done.
 */
export function railIndex(status, scopeFirst = false) {
  const stages = scopeFirst ? SCOPE_FIRST_RAIL_STAGES : RAIL_STAGES;
  const waitingAt = scopeFirst ? SCOPE_FIRST_WAITING_AT : WAITING_AT;
  if (!status) return 0;
  if (status === 'completed') return stages.length;
  if (status === 'failed' || status === 'cancelled') return -1;
  if (waitingAt[status] !== undefined) return waitingAt[status];
  const found = stages.findIndex((s) => s.key === status);
  return found >= 0 ? found : 0;
}

/**
 * A linear pipeline read as a bar rather than a stack of cards.
 *
 * Compact segments answer "which stage is this"; a run mostly needs "how far
 * along is this", which is one glance. The full list stays a click away for
 * when the answer is not enough.
 */
export default function GoalProgressRail({ status, eta = null, scopeFirst = false }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const stages = scopeFirst ? SCOPE_FIRST_RAIL_STAGES : RAIL_STAGES;
  const index = railIndex(status, scopeFirst);
  const failed = index === -1;
  const done = index >= stages.length;
  const current = !failed && !done ? stages[index] : null;

  const tone = failed ? theme.palette.error.main : theme.palette.primary.main;

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        p: 1.75,
        bgcolor: alpha(theme.palette.text.primary, 0.015),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'text.disabled',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {done ? 'All stages done' : failed ? 'Stopped' : `Stage ${index + 1} of ${stages.length}`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {eta && !done && !failed && (
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
            {eta}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 0.5 }} aria-hidden="true">
        {stages.map((stage, i) => {
          const filled = done || i < index;
          const live = !done && !failed && i === index;
          return (
            <Box
              key={stage.key}
              sx={{
                flex: 1,
                height: 4,
                borderRadius: 99,
                bgcolor: filled
                  ? tone
                  : live
                    ? alpha(tone, 0.85)
                    : alpha(theme.palette.text.primary, 0.12),
                ...(live
                  ? {
                      animation: 'railPulse 1.9s ease-in-out infinite',
                      '@keyframes railPulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.45 },
                      },
                      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                    }
                  : {}),
              }}
            />
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 1.5 }}>
        {current && (
          <>
            <GlassIcon name={current.icon} fallback={current.fallback} size={17} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 650, fontSize: '0.78rem' }}>
                {current.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.66rem' }}>
                {current.hint}
              </Typography>
            </Box>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Box
          component="button"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'transparent',
            color: 'text.secondary',
            font: 'inherit',
            fontSize: '0.66rem',
            fontWeight: 600,
            px: 1,
            py: 0.4,
            cursor: 'pointer',
            '&:hover': { color: 'text.primary' },
          }}
        >
          All stages
          <GlassIcon
            name="ExpandMore"
            fallback={ExpandMoreIcon}
            size={12}
            sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
          />
        </Box>
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          {stages.map((stage, i) => {
            const filled = done || i < index;
            const live = !done && !failed && i === index;
            return (
              <Box
                key={stage.key}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.6 }}
              >
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    border: '1.5px solid',
                    borderColor: filled ? 'transparent' : live ? tone : 'divider',
                    bgcolor: filled ? alpha(tone, 0.16) : 'transparent',
                    color: filled || live ? tone : 'text.disabled',
                  }}
                >
                  {filled ? (
                    <GlassIcon name="Check" fallback={CheckOutlinedIcon} size={11} />
                  ) : (
                    <GlassIcon name={stage.icon} fallback={stage.fallback} size={11} />
                  )}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: live ? 700 : 500,
                    color: filled || live ? 'text.primary' : 'text.disabled',
                  }}
                >
                  {stage.label}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.66rem', color: 'text.disabled' }}>
                  {stage.hint}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
