/**
 * LiveTokenBurn — running tokens/cost meter for the Work Log tab.
 *
 * Cost numbers come from the `goal` object (already realtime via
 * useGoalRealtime — the `goals` UPDATE channel pushes `spent_usd` changes).
 *
 * Token counts live in the `llm_usage` table (not on `team_tasks` — execute-
 * task.js writes cost/duration but not token counts). We poll `llm_usage`
 * with `metadata @> { goal_id }` every 5 s while the goal is non-terminal,
 * then freeze.
 *
 * Renders four mini-stats:
 *   • Tokens      — total prompt + completion tokens this goal has burned
 *   • Cost        — spent / budget
 *   • Remaining   — budget − spent (error color when <10% remaining or over)
 *   • Now         — active phase name + that phase's accumulated cost
 *
 * Edge cases: missing llm_usage RLS / empty table → token line shows "—",
 * cost path still works. Missing budget → omit Cost/Remaining.
 * Missing phaseBudget (older goals) → omit "Now".
 */
import { useEffect, useState, useMemo } from 'react';
import { Box, Paper, Typography, LinearProgress, alpha, useTheme } from '@mui/material';
import PropTypes from 'prop-types';
import { supabase, hasSupabase } from '../../lib/supabase';

const POLL_MS = 5000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function MiniStat({ label, value, sub, color, accent }) {
  const theme = useTheme();
  const tone = color || theme.palette.text.primary;
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1.5,
        bgcolor: alpha(accent || theme.palette.primary.main, 0.06),
        border: '1px solid',
        borderColor: alpha(accent || theme.palette.primary.main, 0.18),
        minWidth: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.58rem',
          fontWeight: 700,
          color: 'text.disabled',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{ fontSize: '0.85rem', fontWeight: 800, color: tone, lineHeight: 1.2, mt: 0.25 }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.2 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}
MiniStat.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  sub: PropTypes.node,
  color: PropTypes.string,
  accent: PropTypes.string,
};

export default function LiveTokenBurn({ goal }) {
  const theme = useTheme();
  const [tokens, setTokens] = useState({ prompt: 0, completion: 0, ok: false });

  const goalId = goal?.id;
  const isTerminal = TERMINAL_STATUSES.has(goal?.status);

  useEffect(() => {
    if (!hasSupabase() || !goalId) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('llm_usage')
          .select('prompt_tokens, completion_tokens')
          .contains('metadata', { goal_id: goalId });
        if (cancelled) return;
        if (error) {
          setTokens((prev) => ({ ...prev, ok: false }));
          return;
        }
        setTokens({
          prompt: (data || []).reduce((s, r) => s + (Number(r.prompt_tokens) || 0), 0),
          completion: (data || []).reduce((s, r) => s + (Number(r.completion_tokens) || 0), 0),
          ok: true,
        });
      } catch {
        if (!cancelled) setTokens((prev) => ({ ...prev, ok: false }));
      }
    };
    load();
    if (isTerminal) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [goalId, isTerminal]);

  const spent = Number(goal?.spent_usd || 0);
  const budget = Number(goal?.budget_usd || 0);
  const hasBudget = budget > 0;
  const remaining = hasBudget ? budget - spent : null;
  const overBudget = hasBudget && remaining < 0;
  const lowBudget = hasBudget && !overBudget && remaining < budget * 0.1;
  const totalTokens = tokens.prompt + tokens.completion;

  const activePhaseInfo = useMemo(() => {
    const phases = Array.isArray(goal?.plan?.phases) ? goal.plan.phases : [];
    const idx = phases.findIndex((p) => ['executing', 'in_progress', 'active'].includes(p?.status));
    if (idx < 0) return null;
    const pb = Array.isArray(goal?.phaseBudget) ? goal.phaseBudget[idx] : null;
    return {
      name: pb?.phaseName || phases[idx]?.name || `Phase ${idx + 1}`,
      cost: Number(pb?.cost || 0),
    };
  }, [goal?.plan?.phases, goal?.phaseBudget]);

  const remainingColor =
    overBudget || lowBudget ? theme.palette.error.main : theme.palette.success.main;
  const remainingLabel = !hasBudget
    ? '—'
    : overBudget
      ? `-$${Math.abs(remaining).toFixed(4)} over`
      : `$${remaining.toFixed(4)}`;

  const tokensValue = tokens.ok ? totalTokens.toLocaleString() : '—';
  const tokensSub =
    tokens.ok && totalTokens > 0
      ? `${tokens.prompt.toLocaleString()} in · ${tokens.completion.toLocaleString()} out`
      : tokens.ok
        ? null
        : 'usage table unavailable';

  const budgetPct = hasBudget ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: activePhaseInfo ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
          },
        }}
      >
        <MiniStat
          label="Tokens"
          value={tokensValue}
          sub={tokensSub}
          accent={theme.palette.primary.main}
        />
        <MiniStat
          label="Cost"
          value={`$${spent.toFixed(4)}`}
          sub={hasBudget ? `of $${budget.toFixed(2)}` : 'no budget set'}
          accent={theme.palette.warning.main}
        />
        <MiniStat
          label="Remaining"
          value={remainingLabel}
          sub={hasBudget ? `${budgetPct.toFixed(0)}% used` : null}
          color={hasBudget ? remainingColor : undefined}
          accent={overBudget || lowBudget ? theme.palette.error.main : theme.palette.success.main}
        />
        {activePhaseInfo && (
          <MiniStat
            label="Now"
            value={activePhaseInfo.name}
            sub={`$${activePhaseInfo.cost.toFixed(4)}`}
            accent={theme.palette.info.main}
          />
        )}
      </Box>
      {hasBudget && (
        <LinearProgress
          variant="determinate"
          value={Math.min(100, budgetPct)}
          color={overBudget || lowBudget ? 'error' : 'success'}
          sx={{ height: 6, borderRadius: 3, mt: 1.25 }}
        />
      )}
    </Paper>
  );
}

LiveTokenBurn.propTypes = {
  goal: PropTypes.shape({
    id: PropTypes.string,
    status: PropTypes.string,
    spent_usd: PropTypes.number,
    budget_usd: PropTypes.number,
    plan: PropTypes.object,
    phaseBudget: PropTypes.array,
  }),
};
