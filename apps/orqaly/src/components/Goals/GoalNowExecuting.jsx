/**
 * GoalNowExecuting — live "what's happening right now" banner for the
 * goal detail dialog Pipeline tab.
 *
 * Renders 3 blocks (Timer / Active Agent / Latest Activity) in a
 * responsive grid: 3 cols on desktop, 2 cols + stacked activity on
 * tablet, vertical stack on mobile.
 *
 * Hidden when goal is in a terminal state (completed/failed/cancelled).
 * Switches to a single-line "awaiting" message when goal is paused
 * waiting for human input (awaiting_approval / awaiting_tools / etc).
 *
 * All data is derived client-side from the existing goal + messages
 * payload — no extra API calls.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  LinearProgress,
  Button,
  alpha,
  useTheme,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PulsingDot from './PulsingDot';

import AppIcon from '../icons/AppIcon';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const AWAITING_STATUSES = new Set([
  'awaiting_context_approval',
  'awaiting_approval',
  'awaiting_tools',
  'awaiting_po_input',
]);

const STATUS_LABELS = {
  feasibility: 'Analyzing feasibility',
  analyzing: 'Understanding the problem',
  researching_customer: 'AxWise is proposing scope and capabilities',
  awaiting_context_approval: 'Awaiting proposed-scope confirmation',
  planning: 'Planning the work',
  forming_team: 'Forming team',
  provisioning_tools: 'Provisioning tools',
  estimating: 'Estimating cost & time',
  authorizing_execution: 'Binding approved execution',
  pending_validation: 'Checking final quality',
  active: 'Executing',
  paused: 'Paused',
  awaiting_approval: 'Awaiting your approval',
  awaiting_tools: 'Awaiting tool setup',
  awaiting_po_input: 'Awaiting your input',
};

function fmtDuration(seconds) {
  if (!seconds || seconds < 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function fmtRelative(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Timer Block ──────────────────────────────────────────────────────────────

function TimerBlock({ goal, theme, isMobile }) {
  const [elapsed, setElapsed] = useState(0);
  const phases = goal.plan?.phases || [];
  const firstStarted = phases.find((p) => p.started_at)?.started_at || goal.created_at;
  const estMin =
    goal.proposal?.estimates?.total_estimated_time_minutes ||
    goal.data?.estimates?.total_estimated_time_minutes ||
    null;
  const estCost =
    goal.proposal?.estimates?.total_estimated_cost_usd ||
    goal.data?.estimates?.total_estimated_cost_usd ||
    null;
  const spent = Number(goal.spent_usd || 0);
  const budget = Number(goal.budget_usd || 0);

  useEffect(() => {
    if (!firstStarted) return undefined;
    const start = new Date(firstStarted).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [firstStarted]);

  const estSec = (estMin || 0) * 60;
  const isOver = estSec > 0 && elapsed > estSec;
  const extraSec = isOver ? elapsed - estSec : 0;
  const pct = estSec > 0 ? Math.min(100, (elapsed / estSec) * 100) : 0;

  let barColor = 'primary';
  if (isOver) barColor = 'error';
  else if (pct > 80) barColor = 'warning';

  return (
    <Box>
      <Typography
        sx={{
          fontSize: '0.55rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'text.disabled',
          mb: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <AppIcon name="TimerOutlined" fallback={TimerOutlinedIcon} sx={{ fontSize: 11 }} />
        Timer
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography
          sx={{
            fontSize: { xs: '1rem', sm: '1.05rem' },
            fontWeight: 800,
            fontFamily: 'monospace',
            color: isOver ? 'error.main' : 'text.primary',
            lineHeight: 1,
          }}
        >
          {fmtDuration(elapsed)}
        </Typography>
        {estSec > 0 && (
          <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', fontFamily: 'monospace' }}>
            / ~{estMin}m
          </Typography>
        )}
      </Box>
      {estSec > 0 && (
        <LinearProgress
          variant="determinate"
          value={pct}
          color={barColor}
          sx={{ height: 4, borderRadius: 2, mb: 0.5 }}
        />
      )}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 0.5,
          flexWrap: 'wrap',
        }}
      >
        {isOver && (
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'error.main' }}>
            +{fmtDuration(extraSec)}
          </Typography>
        )}
        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', ml: 'auto' }}>
          ${spent.toFixed(4)}
          {budget > 0 ? ` / $${budget.toFixed(2)}` : ''}
          {estCost != null && !budget && ` (est $${Number(estCost).toFixed(4)})`}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Active Agent Block ───────────────────────────────────────────────────────

function AgentBlock({ goal, theme }) {
  const tasks = goal.tasks || [];
  const inProgress = tasks
    .filter((t) => t.status === 'inProgress')
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  const currentTask = inProgress[0];
  const moreCount = Math.max(0, inProgress.length - 1);

  // Fallback when no in-progress task: show the most recently completed
  // task instead of cryptic "No tasks running yet". This handles the gap
  // between task completion and the next task being picked up by cron.
  const lastDone = !currentTask
    ? tasks
        .filter((t) => t.status === 'done')
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0]
    : null;

  if (!currentTask && !lastDone) {
    const stageLabel = STATUS_LABELS[goal.status] || goal.status;
    return (
      <Box>
        <Typography
          sx={{
            fontSize: '0.55rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'text.disabled',
            mb: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} sx={{ fontSize: 11 }} />
          Active Agent
        </Typography>
        <Typography
          sx={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: 'text.secondary',
            fontStyle: 'italic',
          }}
        >
          {stageLabel}
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', mt: 0.25 }}>
          No tasks running yet
        </Typography>
      </Box>
    );
  }

  // Idle state — show last completed task with "waiting for next" label
  if (!currentTask && lastDone) {
    const idleSec = lastDone.updated_at
      ? Math.floor((Date.now() - new Date(lastDone.updated_at).getTime()) / 1000)
      : 0;
    return (
      <Box>
        <Typography
          sx={{
            fontSize: '0.55rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'text.disabled',
            mb: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} sx={{ fontSize: 11 }} />
          Last Completed
        </Typography>
        <Typography
          sx={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'text.primary',
            lineHeight: 1.2,
            mb: 0.25,
          }}
          noWrap
        >
          {lastDone.assigned_to || 'Agent'}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.7rem',
            color: 'text.secondary',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: { xs: 1, sm: 2 },
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            mb: 0.5,
          }}
        >
          ✓ {lastDone.title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <PulsingDot status="warning" size={7} />
          <Typography sx={{ fontSize: '0.62rem', color: 'warning.main', fontWeight: 600 }}>
            Waiting for next task · {fmtDuration(idleSec)}
          </Typography>
        </Box>
      </Box>
    );
  }

  // Task elapsed since updated_at
  const taskAge = currentTask.updated_at
    ? Math.floor((Date.now() - new Date(currentTask.updated_at).getTime()) / 1000)
    : 0;
  const isStuck = taskAge > 5 * 60; // > 5 min

  return (
    <Box>
      <Typography
        sx={{
          fontSize: '0.55rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'text.disabled',
          mb: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} sx={{ fontSize: 11 }} />
        Active Agent
        {moreCount > 0 && (
          <Chip
            label={`+${moreCount} more`}
            size="small"
            sx={{
              height: 14,
              fontSize: '0.55rem',
              fontWeight: 700,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main',
              '& .MuiChip-label': { px: 0.5 },
            }}
          />
        )}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.85rem',
          fontWeight: 700,
          color: 'text.primary',
          lineHeight: 1.2,
          mb: 0.25,
        }}
        noWrap
      >
        {currentTask.assigned_to || 'Agent'}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.7rem',
          color: 'text.secondary',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: { xs: 1, sm: 2 },
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          mb: 0.5,
        }}
      >
        {currentTask.title}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <PulsingDot status={isStuck ? 'warning' : 'running'} size={7} />
        <Typography
          sx={{
            fontSize: '0.62rem',
            color: isStuck ? 'warning.main' : 'success.main',
            fontWeight: 600,
          }}
        >
          {isStuck ? 'Slow' : 'Running'} · {fmtDuration(taskAge)}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Latest Activity Block ────────────────────────────────────────────────────

function ActivityBlock({ messages, theme, isMobile, onTapToExpand }) {
  const [expanded, setExpanded] = useState(false);
  // Filter out system noise — keep agent + team-room messages
  const visible = (messages || []).filter((m) => {
    const t = m.message_type || m.channel || '';
    return t !== 'system' && t !== 'system_alert';
  });
  const latest = visible[visible.length - 1] || visible[0];

  if (!latest) {
    return (
      <Box>
        <Typography
          sx={{
            fontSize: '0.55rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'text.disabled',
            mb: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <AppIcon
            name="ChatBubbleOutline"
            fallback={ChatBubbleOutlineIcon}
            sx={{ fontSize: 11 }}
          />
          Latest Activity
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', fontStyle: 'italic' }}>
          Waiting for first agent message…
        </Typography>
      </Box>
    );
  }

  const sender = latest.sender_name || latest.sender || 'Agent';
  const body = (latest.message || latest.body || latest.content || '').toString();
  const ts = latest.created_at || latest.timestamp;

  return (
    <Box
      onClick={() => {
        if (isMobile && body.length > 100) setExpanded(!expanded);
        else if (onTapToExpand) onTapToExpand();
      }}
      sx={{
        cursor: (isMobile && body.length > 100) || onTapToExpand ? 'pointer' : 'default',
        minHeight: { xs: 44, sm: 'auto' },
        transition: 'opacity 0.15s',
        '&:hover': onTapToExpand ? { opacity: 0.85 } : {},
      }}
    >
      <Typography
        sx={{
          fontSize: '0.55rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'text.disabled',
          mb: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <AppIcon name="ChatBubbleOutline" fallback={ChatBubbleOutlineIcon} sx={{ fontSize: 11 }} />
        Latest Activity
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap', mb: 0.25 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.primary' }} noWrap>
          {sender}
        </Typography>
        <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>
          · {fmtRelative(ts)}
        </Typography>
      </Box>
      <Typography
        sx={{
          fontSize: '0.7rem',
          color: 'text.secondary',
          lineHeight: 1.4,
          display: expanded ? 'block' : '-webkit-box',
          WebkitLineClamp: { xs: 2, sm: 3 },
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
          fontStyle: 'italic',
        }}
      >
        "{body}"
      </Typography>
      {isMobile && body.length > 100 && !expanded && (
        <Typography sx={{ fontSize: '0.55rem', color: 'primary.main', mt: 0.25, fontWeight: 600 }}>
          tap to expand
        </Typography>
      )}
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function GoalNowExecuting({ goal, messages = [], onOpenWorkLog, onSetupTools }) {
  const theme = useTheme();
  // Reuse MUI breakpoint for "is mobile" — sub-600px
  const isMobile =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(`(max-width: ${theme.breakpoints.values.sm - 1}px)`).matches
      : false;

  if (!goal || TERMINAL_STATUSES.has(goal.status)) return null;

  const phases = goal.plan?.phases || [];
  const activePhaseIdx = phases.findIndex(
    (p) => p.status === 'executing' || p.status === 'in_progress' || p.status === 'active'
  );
  const totalPhases = phases.length;
  const isAwaiting = AWAITING_STATUSES.has(goal.status);
  const isPaused = goal.status === 'paused';

  const G = theme.palette.primary.main;
  let dotStatus = 'running';
  if (isPaused) dotStatus = 'paused';
  else if (isAwaiting) dotStatus = 'warning';

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(G, 0.22),
        background: `linear-gradient(135deg, ${alpha(G, 0.05)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
        overflow: 'hidden',
      }}
    >
      {/* ── Header row ─────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: { xs: 1.5, sm: 2 },
          py: { xs: 1, sm: 1.25 },
          borderBottom: '1px solid',
          borderColor: alpha(G, 0.12),
        }}
      >
        <AppIcon name="Bolt" fallback={BoltIcon} sx={{ fontSize: 16, color: G }} />
        <Typography
          sx={{
            fontSize: { xs: '0.65rem', sm: '0.7rem' },
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: G,
          }}
        >
          {STATUS_LABELS[goal.status] || 'Now Executing'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <PulsingDot status={dotStatus} paused={isPaused} size={8} />
        {totalPhases > 0 && (
          <Chip
            label={`Phase ${Math.max(activePhaseIdx, 0) + 1}/${totalPhases}`}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.62rem',
              fontWeight: 700,
              bgcolor: alpha(G, 0.12),
              color: G,
            }}
          />
        )}
      </Box>
      {/* ── Awaiting state — single-line CTA instead of 3 blocks ── */}
      {isAwaiting ? (
        <Box
          sx={{
            px: { xs: 1.5, sm: 2 },
            py: { xs: 1.25, sm: 1.5 },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 1.5,
          }}
        >
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', flex: 1 }}>
            {goal.status === 'awaiting_approval' &&
              'Review the proposal below and click Approve to start execution.'}
            {goal.status === 'awaiting_tools' &&
              `${goal.data?.unconfigured_tools?.length || 0} tool(s) need API keys before execution can begin.`}
            {goal.status === 'awaiting_po_input' &&
              (goal.data?.axwise_customer_intelligence?.status === 'human_clarification'
                ? 'Review the inferred customer scope below, correct it if needed, then continue.'
                : 'The PO has questions for you. Answer them in the panel below.')}
          </Typography>
          {goal.status === 'awaiting_tools' && onSetupTools && (
            <Button
              size="small"
              variant="contained"
              onClick={() => onSetupTools(goal)}
              sx={{
                textTransform: 'none',
                fontSize: '0.72rem',
                borderRadius: 1.5,
                fontWeight: 700,
              }}
            >
              Setup Tools
            </Button>
          )}
        </Box>
      ) : (
        /* ── 3-block grid: Timer / Agent / Activity ── */
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1.2fr 1fr 1.5fr' },
            gap: { xs: 1.25, sm: 1.5, md: 2 },
            p: { xs: 1.5, sm: 2 },
            // Divider lines between blocks: horizontal on mobile, vertical on tablet+
            '& > *:not(:last-child)': {
              borderBottom: { xs: '1px solid', sm: 'none' },
              borderRight: { xs: 'none', sm: '1px solid' },
              borderColor: { xs: 'divider', sm: 'divider' },
              paddingBottom: { xs: 1.25, sm: 0 },
              paddingRight: { xs: 0, sm: 1.5, md: 2 },
            },
            // Tablet: Activity spans full width on row 2
            '& > *:nth-of-type(3)': {
              gridColumn: { xs: 'auto', sm: '1 / -1', md: 'auto' },
              borderRight: { sm: 'none', md: 'none' },
              borderTop: { sm: '1px solid', md: 'none' },
              borderColor: { sm: 'divider' },
              paddingTop: { sm: 1.25, md: 0 },
            },
          }}
        >
          <TimerBlock goal={goal} theme={theme} isMobile={isMobile} />
          <AgentBlock goal={goal} theme={theme} />
          <ActivityBlock
            messages={messages}
            theme={theme}
            isMobile={isMobile}
            onTapToExpand={onOpenWorkLog}
          />
        </Box>
      )}
    </Paper>
  );
}
