import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  Button,
  LinearProgress,
  CircularProgress,
  Rating,
  useTheme,
  alpha,
  keyframes,
  Divider,
  IconButton,
  Tooltip,
  Popover,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import FormDialog from '../Common/FormDialog';
import { supabase } from '../../lib/supabase';
import AgentAvatar from '../AgentHub/AgentAvatar';
import { resolveAgentIdentity } from '../../utils/agentIdentity';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import BlockIcon from '@mui/icons-material/Block';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';

import AppIcon from '../icons/AppIcon';
import { getFeasibilityToolPresentation } from './feasibilityToolPresentation';
import GoalResearchDetailsDialog from './GoalResearchDetailsDialog';
import { getGoalResearchBundle } from './researchBundle';
import { getGoalResearchBundle as loadGoalResearchBundle } from '../../services/goalService';
import { getAgentExecutionPersonas } from '../../services/agentExecutionPersonaService';
import { cleanGeneratedPresentationText } from '../../utils/generatedPresentationText.js';

function readablePersonaValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanGeneratedPresentationText(String(value)).replaceAll('_', ' ');
  }
  if (Array.isArray(value)) return value.map(readablePersonaValue).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key, item]) => !key.startsWith('_') && item != null && item !== '')
      .map(([key, item]) => {
        const rendered = readablePersonaValue(item);
        return rendered ? `${key.replaceAll('_', ' ')}: ${rendered}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

function personaList(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map(readablePersonaValue).filter(Boolean);
}

function personaConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric)));
}

const RESEARCH_FAILURE_MESSAGES = Object.freeze({
  research_timeout: 'The required customer research exceeded its allowed run time.',
  grounding_failed: 'Required market evidence could not be verified.',
  research_service_busy: 'The research service was temporarily unavailable.',
  research_service_not_ready: 'The research service is not ready for this run.',
  research_enqueue_failed: 'Customer research could not be queued. It is safe to retry.',
  research_cancelled: 'The required customer research was cancelled before completion.',
  research_failed: 'The required customer research did not complete.',
});

function researchFailureMessage(intelligence) {
  const code = String(intelligence?.research_failure?.code || 'research_failed');
  return RESEARCH_FAILURE_MESSAGES[code] || RESEARCH_FAILURE_MESSAGES.research_failed;
}

// ── Live Countdown Component ────────────────────────────────────
function LiveCountdown({ startedAt, estimatedMinutes }) {
  const [elapsed, setElapsed] = useState(0);
  const theme = useTheme();

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return null;

  const estSec = (estimatedMinutes || 0) * 60;
  const isOver = elapsed > estSec && estSec > 0;
  const extraSec = isOver ? elapsed - estSec : 0;

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
  };

  const pct = estSec > 0 ? Math.min(100, (elapsed / estSec) * 100) : 0;
  const G = theme.palette.primary.main;

  return (
    <Box sx={{ mt: 0.75 }}>
      {/* Timer */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
        <AppIcon
          name="TimerOutlined"
          fallback={TimerOutlinedIcon}
          sx={{ fontSize: 12, color: isOver ? 'error.main' : G }}
        />
        <Typography
          sx={{
            fontSize: '0.65rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: isOver ? 'error.main' : 'text.primary',
          }}
        >
          {fmt(elapsed)}
        </Typography>
        {estSec > 0 && (
          <Typography sx={{ fontSize: '0.55rem', color: 'text.disabled' }}>
            / {fmt(estSec)}
          </Typography>
        )}
      </Box>
      {/* Progress bar */}
      {estSec > 0 && (
        <LinearProgress
          variant="determinate"
          value={pct}
          color={isOver ? 'error' : pct > 80 ? 'warning' : 'primary'}
          sx={{ height: 3, borderRadius: 2 }}
        />
      )}
      {/* Extra time warning */}
      {isOver && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, color: 'error.main' }}>
            Extra: +{fmt(extraSec)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.2); }
  50% { box-shadow: 0 0 12px 4px rgba(96, 165, 250, 0.35); }
`;

const STAGES = [
  { key: 'feasibility', label: 'Analytic : LookUp', desc: 'Feasibility & risk assessment', idx: 0 },
  {
    key: 'po-analysis',
    label: 'Problem Analyst : Brief',
    desc: 'Problem, outcomes & constraints',
    idx: 1,
  },
  {
    key: 'customer-intelligence',
    label: 'AxWise : Scope Admission',
    desc: 'Outcome, assumptions & required capabilities',
    idx: 2,
  },
  {
    key: 'pm-planning',
    label: 'Operational Planner : Decomposition',
    desc: 'Domain-appropriate phases & tasks',
    idx: 3,
  },
  { key: 'team-formation', label: 'HR : Team Forming', desc: 'Agent selection & roles', idx: 4 },
  { key: 'tool-provisioning', label: 'Tools : Attaching', desc: 'API keys & integrations', idx: 5 },
  { key: 'discovery', label: 'Estimate : Time', desc: 'Time & cost projections', idx: 6 },
  { key: 'execution', label: 'Execution : Status', desc: 'Running phases', idx: 7 },
];

// Map goal.status to the stage index that is CURRENTLY active
function statusToStageIndex(status) {
  const map = {
    feasibility: 0,
    analyzing: 1,
    researching_customer: 2,
    awaiting_context_approval: 2,
    planning: 3,
    forming_team: 4,
    provisioning_tools: 5,
    awaiting_tools: 5,
    estimating: 6,
    awaiting_approval: 6,
    authorizing_execution: 7,
    active: 7,
    completed: 8,
    paused: -2,
    failed: -2,
    cancelled: -2,
  };
  return map[status] ?? -1;
}

function getCardState(stageIdx, goalStatus, goal) {
  if (
    goalStatus === 'needs_human' &&
    goal.data?.axwise_customer_intelligence?.status === 'required_research_blocked'
  ) {
    if (stageIdx === 2) return 'blocked';
    if (stageIdx < 2) return hasStageData(stageIdx, goal) ? 'done' : 'pending';
    return 'pending';
  }
  const currentIdx = statusToStageIndex(goalStatus);

  // Completed goal = all stages done
  if (currentIdx === 8) return 'done';

  // Failed/paused/cancelled — check what data exists to determine which stages ran
  if (currentIdx === -2) {
    return hasStageData(stageIdx, goal) ? 'done' : 'pending';
  }

  if (stageIdx < currentIdx) return 'done';
  if (stageIdx === currentIdx) {
    // Special: awaiting_tools means tools stage is blocked, not actively processing
    if (goalStatus === 'awaiting_tools') return 'blocked';
    if (goalStatus === 'awaiting_context_approval' || goalStatus === 'awaiting_approval')
      return 'blocked';
    return 'active';
  }
  return 'pending';
}

// Check if a stage has real data (for paused/failed goals)
function hasStageData(stageIdx, goal) {
  switch (stageIdx) {
    case 0:
      return !!goal.feasibility_report;
    case 1:
      return !!goal.tech_doc;
    case 2:
      return Boolean(
        goal.data?.axwise_customer_intelligence?.persona_resolution ||
        goal.data?.axwise_customer_intelligence?.working_hypothesis ||
        goal.data?.axwise_customer_intelligence?.research_bundle ||
        goal.data?.axwise_customer_intelligence?.research_bundle_summary
      );
    case 3:
      return !!goal.plan?.phases?.length;
    case 4:
      return !!goal.team_id || statusToStageIndex(goal.status) > 4;
    case 5:
      return goal.status !== 'awaiting_tools' && goal.status !== 'provisioning_tools';
    case 6:
      return !!goal.proposal;
    case 7:
      return goal.status === 'active' || goal.status === 'completed';
    default:
      return false;
  }
}

// ── MetricMini — compact metric with info popover ──────────────────────────
function MetricMini({ label, value, valueColor, detail }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <Typography
          sx={{
            fontSize: '0.42rem',
            color: 'text.disabled',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </Typography>
        {detail && (
          <Box
            component="span"
            onClick={(e) => {
              e.stopPropagation();
              setAnchor(e.currentTarget);
            }}
            sx={{
              display: 'inline-flex',
              color: 'grey.500',
              cursor: 'pointer',
              '&:hover': { color: 'grey.400' },
            }}
          >
            <AppIcon
              name="InfoOutlined"
              fallback={InfoOutlinedIcon}
              size={12}
              sx={{ fontSize: 12, color: 'inherit' }}
            />
          </Box>
        )}
      </Box>
      <Typography
        sx={{
          fontSize: '0.62rem',
          fontWeight: 700,
          color: valueColor || 'text.primary',
          fontFamily: label === 'Spent' ? 'monospace' : 'inherit',
        }}
      >
        {value}
      </Typography>
      {detail && (
        <Popover
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { borderRadius: 2, p: 1.5, maxWidth: 280, boxShadow: 4 } } }}
          onClick={(e) => e.stopPropagation()}
        >
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, mb: 0.75, color: 'text.primary' }}>
            {detail.title}
          </Typography>
          {detail.lines.map((line, i) => (
            <Typography
              key={i}
              sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.5, mb: 0.25 }}
            >
              {line}
            </Typography>
          ))}
        </Popover>
      )}
    </Box>
  );
}

// ── MetricCard — top-level metric with optional info popover ──────────────
function MetricCard({ m, compact }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.55rem',
            color: 'text.disabled',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            display: 'block',
            lineHeight: 1,
          }}
        >
          {m.label}
        </Typography>
        {m.detail && (
          <Box
            component="span"
            onClick={(e) => {
              e.stopPropagation();
              setAnchor(e.currentTarget);
            }}
            sx={{
              display: 'inline-flex',
              color: 'grey.500',
              cursor: 'pointer',
              mb: 0.25,
              '&:hover': { color: 'grey.400' },
            }}
          >
            <AppIcon
              name="InfoOutlined"
              fallback={InfoOutlinedIcon}
              size={12}
              sx={{ fontSize: 12, color: 'inherit' }}
            />
          </Box>
        )}
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontSize: compact ? '0.75rem' : '0.85rem',
          fontWeight: 700,
          color: 'text.primary',
          lineHeight: 1.2,
        }}
      >
        {m.value}
      </Typography>
      {m.detail && (
        <Popover
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { borderRadius: 2, p: 1.5, maxWidth: 300, boxShadow: 4 } } }}
          onClick={(e) => e.stopPropagation()}
        >
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, mb: 0.75, color: 'text.primary' }}>
            {m.detail.title}
          </Typography>
          {m.detail.lines.map((line, i) => (
            <Typography
              key={i}
              sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.5, mb: 0.25 }}
            >
              {line}
            </Typography>
          ))}
        </Popover>
      )}
    </Box>
  );
}

function getCardContent(stageKey, goal, logs = [], profileIndex = null) {
  if (!goal) return null;
  switch (stageKey) {
    case 'feasibility': {
      const r = goal.feasibility_report;
      if (!r) return null;
      const complexity = ((r.complexity_score || 0) * 100).toFixed(0);
      const successNum = r.feasibility?.success_probability || 0;
      const success = (successNum * 100).toFixed(0);
      const riskFactors = r.feasibility?.risk_factors || [];
      const riskScore = Math.min(riskFactors.length, 5);
      const riskLabel = riskScore <= 1 ? 'Low' : riskScore <= 3 ? 'Medium' : 'High';
      const revenue = r.profitability?.revenue_potential || 'unknown';
      const tokenCost = r.profitability?.estimated_token_cost || 0;
      const budgetUsd = Number(goal.budget_usd) || 10;
      const recommendedBudget = Math.max(1, Math.ceil(tokenCost * 2 * 100) / 100);
      const budgetRatio = tokenCost > 0 ? Math.round(budgetUsd / tokenCost) : 0;
      const budgetLabel =
        budgetRatio >= 10
          ? `${budgetRatio}x buffer`
          : budgetRatio >= 2
            ? `${budgetRatio}x cover`
            : 'Tight';
      const hasHistory = r.historical && r.historical.similar_goals_count > 0;
      const historyLabel = hasHistory
        ? `${(r.historical.avg_success_rate * 100).toFixed(0)}% (${r.historical.similar_goals_count} goals)`
        : 'No data';
      const confidenceLabel = hasHistory
        ? 'High'
        : (r.complexity_score || 0) < 0.4
          ? 'Medium'
          : 'Low';
      const toolPresentation = getFeasibilityToolPresentation(goal, r);
      const phaseCount = goal.plan?.phases?.length || r.feasibility?.phase_suggestions?.length || 3;
      const execEst = `~${Math.max(1, Math.round(phaseCount * 0.5))} min`;

      // AI Recommendation (zero tokens — derived from existing fields)
      let aiRec = 'Goal is feasible within budget — ready to proceed';
      if (revenue === 'high' && successNum > 0.6)
        aiRec = 'Strong earning opportunity — high revenue potential with good success rate';
      else if (revenue === 'high' && successNum < 0.5)
        aiRec = 'High potential but risky — consider reducing scope or increasing budget';
      else if (revenue === 'none' && successNum > 0.7)
        aiRec = 'Great way to improve operations — high chance of success';
      else if ((revenue === 'low' || revenue === 'none') && (r.complexity_score || 0) < 0.4)
        aiRec = 'Quick win — simple goal with fast results';
      else if (riskFactors.length >= 4)
        aiRec = 'Proceed with caution — multiple risk factors identified';
      if (budgetRatio > 10) aiRec += '. Well-funded — budget significantly exceeds estimated cost';
      else if (budgetRatio > 0 && budgetRatio < 1.5)
        aiRec = 'Tight budget — may need to prioritize must-have features only';

      let badgeColor = 'success';
      if (r.recommendation === 'adjust') badgeColor = 'warning';
      else if (r.recommendation !== 'proceed') badgeColor = 'error';
      const roiProjection = r.profitability?.roi_projection;
      const competitiveAnalysis = r.feasibility?.competitive_analysis;
      const complexityReason = r.complexity_reason || '';
      const revenuePotentialReason = r.revenue_potential_reason || '';

      const complexityTier =
        Number(complexity) < 30
          ? 'Simple'
          : Number(complexity) < 60
            ? 'Moderate'
            : Number(complexity) < 80
              ? 'Complex'
              : 'Very Complex';
      const successSource = hasHistory
        ? `Based on ${r.historical.similar_goals_count} similar past goals (avg ${(r.historical.avg_success_rate * 100).toFixed(0)}% success rate).`
        : 'Estimated — no historical data for this category yet.';

      return {
        metrics: [
          {
            label: 'Complexity',
            value: `${complexity}%`,
            detail: {
              title: `Complexity — ${complexityTier}`,
              lines: [
                `Score: ${complexity}% (${complexityTier})`,
                complexityReason ||
                  `Derived from goal scope, number of phases, and required capabilities.`,
                `A higher score means more agent coordination, longer execution, and higher token usage.`,
              ],
            },
          },
          {
            label: 'Success Rate',
            value: `${success}%`,
            detail: {
              title: 'Success Rate',
              lines: [
                `Estimated probability of completing this goal: ${success}%`,
                successSource,
                `Confidence: ${confidenceLabel} — ${confidenceLabel === 'High' ? 'based on real historical data' : confidenceLabel === 'Medium' ? 'low complexity goal, likely achievable' : 'first goal of this type, limited data'}`,
              ],
            },
          },
          {
            label: 'Risk',
            value: `${riskScore}/5 ${riskLabel}`,
            detail: {
              title: `Risk — ${riskLabel} (${riskScore}/5)`,
              lines: [
                `${riskFactors.length} risk factor${riskFactors.length !== 1 ? 's' : ''} identified:`,
                ...riskFactors.map((rf) => `• ${rf}`),
                ...(competitiveAnalysis ? [`\nCompetitive context: ${competitiveAnalysis}`] : []),
              ],
            },
          },
          {
            label: 'Revenue',
            value: revenue,
            detail: {
              title: `Revenue Potential — ${revenue}`,
              lines: [
                revenuePotentialReason ||
                  `Assessed based on goal category, output type, and market applicability.`,
                roiProjection ? `ROI projection: ${roiProjection}` : null,
                revenue === 'high'
                  ? 'Output is directly monetizable or has strong commercial value.'
                  : revenue === 'medium'
                    ? 'Moderate revenue opportunity — depends on execution and market fit.'
                    : revenue === 'low'
                      ? 'Limited direct monetization — primarily operational or internal value.'
                      : 'No direct revenue potential identified for this goal type.',
              ].filter(Boolean),
            },
          },
        ],
        badge: r.recommendation,
        badgeColor,
        summary: r.recommendation_reason?.slice(0, 160),
        customContent: (
          <Box sx={{ mt: 0.75 }}>
            {/* Row 2: Budget metrics */}
            <Box sx={{ display: 'flex', gap: 2, mb: 0.75, flexWrap: 'wrap' }}>
              <MetricMini
                label="Budget"
                value={`$${budgetUsd}`}
                detail={{
                  title: 'Budget',
                  lines: [
                    `Your budget: $${budgetUsd}`,
                    `Estimated token cost: $${tokenCost.toFixed(4)}`,
                    `Recommended minimum: $${recommendedBudget} (2× token cost as safety margin)`,
                    budgetRatio >= 3
                      ? `Your budget covers ${budgetRatio}× the estimated cost — well funded.`
                      : budgetRatio >= 1
                        ? 'Budget is tight — monitor spending during execution.'
                        : 'Budget may be insufficient. Consider increasing before proceeding.',
                  ],
                }}
              />
              <MetricMini
                label="Recommended"
                value={`$${recommendedBudget}`}
                valueColor={recommendedBudget > budgetUsd ? '#F59E0B' : '#10B981'}
                detail={{
                  title: 'Recommended Budget',
                  lines: [
                    `Recommended: $${recommendedBudget} (= estimated token cost × 2)`,
                    `Estimated token cost: $${tokenCost.toFixed(4)} (AI API calls only — not real-world costs)`,
                    recommendedBudget > budgetUsd
                      ? `⚠️ Your budget ($${budgetUsd}) is below the recommendation. The goal may still proceed but has less margin.`
                      : `✓ Your budget covers the recommendation.`,
                  ],
                }}
              />
              <MetricMini
                label="Efficiency"
                value={budgetLabel}
                valueColor={budgetRatio >= 5 ? '#10B981' : budgetRatio >= 2 ? '#F59E0B' : '#EF4444'}
                detail={{
                  title: 'Budget Efficiency',
                  lines: [
                    budgetRatio > 0
                      ? `Your budget is ${budgetRatio}× the estimated token cost.`
                      : 'No token cost estimated.',
                    budgetRatio >= 10
                      ? 'Excellent — significant buffer above cost.'
                      : budgetRatio >= 3
                        ? 'Good — comfortable buffer for unexpected steps.'
                        : budgetRatio >= 2
                          ? 'Adequate — 2× cover is the minimum recommended.'
                          : budgetRatio >= 1
                            ? 'Tight — little room for extra steps.'
                            : 'At risk — budget may not cover execution.',
                  ],
                }}
              />
              <MetricMini
                label="Confidence"
                value={confidenceLabel}
                valueColor={
                  confidenceLabel === 'High'
                    ? '#10B981'
                    : confidenceLabel === 'Medium'
                      ? '#F59E0B'
                      : '#EF4444'
                }
                detail={{
                  title: 'Confidence Level',
                  lines: [
                    `Level: ${confidenceLabel}`,
                    hasHistory
                      ? `Based on ${r.historical.similar_goals_count} similar completed goals with avg ${(r.historical.avg_success_rate * 100).toFixed(0)}% success rate.`
                      : 'No historical data — first goal in this category.',
                    confidenceLabel === 'Low'
                      ? 'Complex goal with no prior data. Proceed carefully and monitor each phase.'
                      : confidenceLabel === 'Medium'
                        ? 'Moderate confidence — goal is simple enough to estimate reliably.'
                        : 'High confidence — strong historical basis for this estimate.',
                  ],
                }}
              />
            </Box>
            {/* Row 3: Execution metrics */}
            <Box sx={{ display: 'flex', gap: 2, mb: 0.75, flexWrap: 'wrap' }}>
              <MetricMini
                label="Execution"
                value={execEst}
                detail={{
                  title: 'Execution Time Estimate',
                  lines: [
                    `Estimated: ${execEst} of active processing time`,
                    `Based on ${phaseCount} phase${phaseCount !== 1 ? 's' : ''} × ~30 seconds each.`,
                    'Does not include wait time between phases or human approval steps.',
                  ],
                }}
              />
              <MetricMini {...toolPresentation.metric} />
              <MetricMini
                label="History"
                value={historyLabel}
                detail={{
                  title: 'Historical Performance',
                  lines: hasHistory
                    ? [
                        `${r.historical.similar_goals_count} similar goal${r.historical.similar_goals_count !== 1 ? 's' : ''} completed previously.`,
                        `Average success rate: ${(r.historical.avg_success_rate * 100).toFixed(0)}%`,
                        `This data is used to calibrate the success rate and confidence estimates above.`,
                      ]
                    : [
                        'No historical data yet for this goal category.',
                        'Success rate and confidence are estimated from complexity alone.',
                        'After completing this goal, future goals in this category will have data-backed estimates.',
                      ],
                }}
              />
              <MetricMini
                label="Spent"
                value={`$${Number(goal.spent_usd || 0).toFixed(4)}`}
                detail={{
                  title: 'Token Spend (This Stage)',
                  lines: [
                    `$${Number(goal.spent_usd || 0).toFixed(4)} spent on AI API calls so far.`,
                    'This covers the feasibility analysis LLM call only.',
                    'Subsequent stages (scope admission, planning, execution, and validation) will add to this total.',
                  ],
                }}
              />
            </Box>
            {/* AI Recommendation */}
            <Box
              sx={{
                mt: 0.5,
                p: 0.75,
                borderRadius: 1.5,
                bgcolor: alpha(revenue === 'high' ? '#10B981' : '#3B82F6', 0.06),
                border: '1px solid',
                borderColor: alpha(revenue === 'high' ? '#10B981' : '#3B82F6', 0.15),
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.5,
              }}
            >
              <AppIcon
                name="TipsAndUpdatesOutlined"
                fallback={TipsAndUpdatesOutlinedIcon}
                sx={{
                  fontSize: 13,
                  color: revenue === 'high' ? '#10B981' : '#3B82F6',
                  mt: 0.1,
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', lineHeight: 1.4 }}>
                {aiRec}
              </Typography>
            </Box>
          </Box>
        ),
        links: [{ label: 'View Analysis Report', type: 'doc', docKey: 'feasibility_report' }],
      };
    }
    case 'po-analysis': {
      const t = goal.tech_doc;
      if (!t) return null;
      const testsCount = t.acceptance_tests?.length || 0;
      const reqCount = t.functional_requirements?.length || 0;
      const storiesCount = t.user_stories?.length || 0;
      const rolesCount = t.required_capabilities?.length || 0;
      const toolsCount = t.tool_requirements?.length || 0;
      const riskCount = t.risks?.length || 0;
      const depCount = t.dependencies?.length || 0;
      const outOfScopeCount = t.out_of_scope?.length || 0;
      const exitCriteriaCount = t.exit_criteria?.length || 0;
      const hasTimeline = t.timeline?.length > 0;
      const hasMoscow = reqCount > 0 && t.functional_requirements?.[0]?.priority;
      const depthLabels = {
        quick: 'Quick',
        standard: 'Standard',
        expert: 'Expert',
        full: 'Full',
        summary: 'Summary',
      };
      const depthLabel = depthLabels[t.depth] || t.depth || 'Standard';

      // MoSCoW breakdown
      const mustCount = hasMoscow
        ? t.functional_requirements.filter((r) => (r.priority || '').toLowerCase() === 'must')
            .length
        : 0;
      const shouldCount = hasMoscow
        ? t.functional_requirements.filter((r) => (r.priority || '').toLowerCase() === 'should')
            .length
        : 0;
      const couldCount = hasMoscow
        ? t.functional_requirements.filter((r) => (r.priority || '').toLowerCase() === 'could')
            .length
        : 0;

      return {
        metrics: [
          {
            label: 'Depth',
            value: depthLabel,
            detail: {
              title: 'PRD depth',
              lines: [
                'How thoroughly the PRD was written. Set by the PO LLM based on goal complexity.',
                'Quick = lite scoping · Standard = full PRD · Expert = exhaustive analysis.',
              ],
            },
          },
          {
            label: 'Tests',
            value: `${testsCount}`,
            detail: {
              title: 'Acceptance tests',
              lines: [
                'Pass/fail conditions the deliverable must meet before the goal can complete.',
                'Generated by the PO LLM; QA Tester verifies each one.',
              ],
            },
          },
          {
            label: 'Roles',
            value: `${rolesCount}`,
            detail: {
              title: 'Required agent roles',
              lines: [
                'Agent roles the PRD says are needed (e.g. Designer, Developer, QA).',
                'Different from "agents on the team" — that\'s set later by HR : Team Forming.',
              ],
            },
          },
          {
            label: 'Rec. Tools',
            value: `${toolsCount}`,
            detail: {
              title: 'Recommended tools (from PRD)',
              lines: [
                'Tools the PRD-writing LLM recommends for the build.',
                'NOT the same as the "Tools : Attaching" card below — that one shows tools the planned tasks actually need.',
                `Mismatch is normal: PRD suggests broad options; PM only assigns tools to tasks that truly need them.`,
              ],
            },
          },
        ],
        summary: t.problem_statement?.slice(0, 160),
        customContent: (
          <Box sx={{ mt: 0.75 }}>
            {/* Row 2: PRD completeness — every label hover-tipped so the user
                knows what each count actually represents. */}
            <Box sx={{ display: 'flex', gap: 2, mb: 0.75, flexWrap: 'wrap' }}>
              {reqCount > 0 && (
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Functional requirements with MoSCoW priorities. M = Must-have, S = Should-have, C = Could-have. Source: tech_doc.functional_requirements."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Requirements
                    </Typography>
                  </Tooltip>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700 }}>
                    {reqCount}
                    {hasMoscow ? ` (M:${mustCount} S:${shouldCount} C:${couldCount})` : ''}
                  </Typography>
                </Box>
              )}
              {storiesCount > 0 && (
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title='User-story format ("As a … I want … so that …"). Only LLMs in expert/full mode produce these. Source: tech_doc.user_stories.'
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      User Stories
                    </Typography>
                  </Tooltip>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700 }}>
                    {storiesCount}
                  </Typography>
                </Box>
              )}
              {riskCount > 0 && (
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Risk register with severity + mitigation per item. Color: green <2 · amber 2–3 · red ≥4. Source: tech_doc.risks."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Risks
                    </Typography>
                  </Tooltip>
                  <Typography
                    sx={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      color: riskCount >= 4 ? '#EF4444' : riskCount >= 2 ? '#F59E0B' : '#10B981',
                    }}
                  >
                    {riskCount}
                  </Typography>
                </Box>
              )}
              {depCount > 0 && (
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="External services / data sources the build relies on. Source: tech_doc.dependencies."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Dependencies
                    </Typography>
                  </Tooltip>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700 }}>{depCount}</Typography>
                </Box>
              )}
              {outOfScopeCount > 0 && (
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Things the PRD explicitly excludes — useful for catching scope creep in agent output. Source: tech_doc.out_of_scope."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Out of Scope
                    </Typography>
                  </Tooltip>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700 }}>
                    {outOfScopeCount}
                  </Typography>
                </Box>
              )}
              {exitCriteriaCount > 0 && (
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Conditions that must all be true before the goal can be marked complete. Source: tech_doc.exit_criteria."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Exit Criteria
                    </Typography>
                  </Tooltip>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700 }}>
                    {exitCriteriaCount}
                  </Typography>
                </Box>
              )}
            </Box>
            {/* Success tiers (if available) — each tier explains where it
                sits in the deliverable ambition ladder. */}
            {t.success_tiers && (
              <Box sx={{ display: 'flex', gap: 2, mb: 0.75, flexWrap: 'wrap' }}>
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Smallest viable deliverable the goal can ship with — the success-tier floor."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Minimum
                    </Typography>
                  </Tooltip>
                  <Typography
                    sx={{ fontSize: '0.52rem', fontWeight: 600, color: 'text.secondary' }}
                    noWrap
                  >
                    {(t.success_tiers.minimum || 'N/A').slice(0, 50)}
                  </Typography>
                </Box>
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Expected delivery shape — the success-tier the team is aiming for."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Target
                    </Typography>
                  </Tooltip>
                  <Typography
                    sx={{ fontSize: '0.52rem', fontWeight: 600, color: '#10B981' }}
                    noWrap
                  >
                    {(t.success_tiers.target || 'N/A').slice(0, 50)}
                  </Typography>
                </Box>
                <Box>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Bonus deliverable if budget and time permit — the success-tier ceiling."
                  >
                    <Typography
                      sx={{
                        fontSize: '0.42rem',
                        color: 'text.disabled',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'help',
                        borderBottom: '1px dotted',
                        borderBottomColor: 'text.disabled',
                        display: 'inline-block',
                      }}
                    >
                      Stretch
                    </Typography>
                  </Tooltip>
                  <Typography
                    sx={{ fontSize: '0.52rem', fontWeight: 600, color: '#3B82F6' }}
                    noWrap
                  >
                    {(t.success_tiers.stretch || 'N/A').slice(0, 50)}
                  </Typography>
                </Box>
              </Box>
            )}
            {/* Timeline preview (expert mode) */}
            {hasTimeline && (
              <Box sx={{ mb: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: '0.42rem',
                    color: 'text.disabled',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.25,
                  }}
                >
                  Timeline
                </Typography>
                {t.timeline.slice(0, 3).map((m, i) => (
                  <Typography
                    key={i}
                    sx={{ fontSize: '0.5rem', color: 'text.secondary', lineHeight: 1.3 }}
                  >
                    {m.target_date || `Step ${i + 1}`}: {m.milestone}
                  </Typography>
                ))}
                {t.timeline.length > 3 && (
                  <Typography sx={{ fontSize: '0.45rem', color: 'text.disabled' }}>
                    +{t.timeline.length - 3} more
                  </Typography>
                )}
              </Box>
            )}
            {/* Revenue model (expert mode) */}
            {t.revenue_model && t.revenue_model !== 'N/A' && (
              <Box
                sx={{
                  mt: 0.5,
                  p: 0.75,
                  borderRadius: 1.5,
                  bgcolor: alpha('#10B981', 0.06),
                  border: '1px solid',
                  borderColor: alpha('#10B981', 0.15),
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0.5,
                }}
              >
                <AppIcon
                  name="TipsAndUpdatesOutlined"
                  fallback={TipsAndUpdatesOutlinedIcon}
                  sx={{ fontSize: 13, color: '#10B981', mt: 0.1, flexShrink: 0 }}
                />
                <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', lineHeight: 1.4 }}>
                  Revenue: {t.revenue_model.slice(0, 120)}
                </Typography>
              </Box>
            )}
          </Box>
        ),
        links: [
          { label: 'View Tech Document', type: 'doc', docKey: 'tech_doc' },
          { label: 'Goal Dashboard', type: 'page', href: `/goals/${goal.id}` },
        ],
      };
    }
    case 'customer-intelligence': {
      const intelligence = goal.data?.axwise_customer_intelligence;
      if (!intelligence) return null;
      const research = getGoalResearchBundle(goal);
      const resolution = intelligence.persona_resolution;
      if (!resolution) {
        if (intelligence.status === 'required_research_blocked') {
          const routingAccepted = Boolean(intelligence.decision_id && intelligence.routing_mode);
          const progress = Math.max(
            0,
            Math.min(100, Number(intelligence.progress_percentage || 0))
          );
          const stage =
            readablePersonaValue(
              intelligence.research_failure?.stage || intelligence.current_stage
            ) || 'customer research';
          return {
            metrics: [
              { label: 'Status', value: 'Research blocked' },
              { label: 'Stage', value: stage },
              { label: 'Progress', value: `${progress}%` },
              ...(Number(intelligence.elapsed_ms) > 0
                ? [
                    {
                      label: 'Elapsed',
                      value: `${Math.max(1, Math.round(Number(intelligence.elapsed_ms) / 60000))}m`,
                    },
                  ]
                : []),
            ],
            badge: 'Research blocked',
            badgeColor: 'error',
            summary: `Research stopped during ${stage}. No customer persona, executor persona, evidence bundle, or Research PRD was accepted.`,
            customContent: (
              <Box sx={{ mt: 0.75 }}>
                <Typography sx={{ fontSize: '0.52rem', color: 'error.main', fontWeight: 700 }}>
                  {researchFailureMessage(intelligence)}
                </Typography>
                <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', mt: 0.25 }}>
                  {routingAccepted
                    ? `Routing accepted · ${readablePersonaValue(intelligence.routing_mode)}. The research run failed separately and execution remains blocked.`
                    : 'Routing did not complete. Customer research and execution remain blocked.'}
                </Typography>
              </Box>
            ),
            action:
              intelligence.research_failure?.retryable === false ||
              Number(intelligence.retry_count || 0) >= 3
                ? null
                : 'retry-research',
          };
        }
        const hypothesis = intelligence.working_hypothesis;
        const preview = hypothesis?.persona_resolution;
        if (preview) {
          const customer = preview.customer_persona || {};
          const executor = preview.ideal_agent_persona || {};
          return {
            metrics: [
              ...(research.available
                ? [
                    {
                      label: research.stageLabel,
                      value: `${research.completedStages}/${research.stages.length || '—'}`,
                    },
                    { label: 'Sources', value: research.counts.sources || '—' },
                    { label: 'Personas', value: research.counts.personas || '—' },
                  ]
                : [
                    { label: 'Status', value: 'Needs verification' },
                    { label: 'Assignable', value: 'No' },
                    { label: 'Executable', value: 'No' },
                  ]),
            ],
            badge: 'Hypothesis',
            badgeColor: 'warning',
            summary: `${customer.name || 'Customer hypothesis'} · ${executor.role || 'Executor hypothesis'}`,
            customContent: (
              <Box sx={{ mt: 0.75 }}>
                <Typography sx={{ fontSize: '0.52rem', color: 'warning.main', fontWeight: 700 }}>
                  Synthetic research preview — awaiting human evidence
                </Typography>
                {preview.recommended_agent?.agent_name && (
                  <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', mt: 0.25 }}>
                    Suggested Agent Hub match: {preview.recommended_agent.agent_name}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', mt: 0.25 }}>
                  This preview cannot plan, assign, or execute work until the clarification is
                  verified and AxWise returns an authorized resolution.
                </Typography>
              </Box>
            ),
            links: research.available
              ? [{ label: 'Research details', type: 'research' }]
              : undefined,
          };
        }
        const progress = Math.max(0, Math.min(100, Number(intelligence.progress_percentage || 0)));
        return {
          metrics: research.available
            ? [
                {
                  label: research.stageLabel,
                  value: `${research.completedStages}/${research.stages.length || '—'}`,
                },
                { label: 'Sources', value: research.counts.sources || '—' },
                { label: 'Personas', value: research.counts.personas || '—' },
                ...(research.counts.interviews
                  ? [{ label: 'Interviews', value: research.counts.interviews }]
                  : []),
              ]
            : [
                {
                  label: 'Status',
                  value: intelligence.degraded ? 'Fallback used' : intelligence.status || 'Queued',
                },
                ...(!intelligence.degraded ? [{ label: 'Progress', value: `${progress}%` }] : []),
                ...(intelligence.current_stage
                  ? [
                      {
                        label: 'Stage',
                        value: String(intelligence.current_stage).replaceAll('_', ' '),
                      },
                    ]
                  : []),
                ...(Number(intelligence.elapsed_ms) > 0
                  ? [
                      {
                        label: 'Elapsed',
                        value: `${Math.max(1, Math.round(Number(intelligence.elapsed_ms) / 60000))}m`,
                      },
                    ]
                  : []),
              ],
          badge: intelligence.degraded
            ? 'Local fallback'
            : research.confidence != null
              ? `${research.confidence}%`
              : `${progress}%`,
          badgeColor: intelligence.degraded ? 'warning' : 'info',
          summary: intelligence.degraded
            ? intelligence.reason ||
              'AxWise scope admission was unavailable; planning continued through the safe fallback.'
            : 'AxWise is proposing the outcome, assumptions, stakeholders, and required capabilities.',
          customContent:
            !intelligence.degraded && !research.available ? (
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 4, borderRadius: 2, mt: 0.75 }}
              />
            ) : null,
          links: research.available ? [{ label: 'Research details', type: 'research' }] : undefined,
        };
      }

      const customer = resolution.customer_persona || {};
      const executor = resolution.ideal_agent_persona || {};
      const confidence = Math.round(Number(customer.confidence || 0) * 100);
      return {
        metrics: research.available
          ? [
              {
                label: research.stageLabel,
                value: `${research.completedStages}/${research.stages.length || '—'}`,
              },
              { label: 'Sources', value: research.counts.sources || '—' },
              {
                label: 'Personas',
                value: research.counts.personas || (customer.name ? 1 : '—'),
              },
              ...(research.counts.interviews
                ? [{ label: 'Interviews', value: research.counts.interviews }]
                : []),
            ]
          : [
              { label: 'Context clarity', value: `${confidence}%` },
              {
                label: 'Evidence',
                value: resolution.evidence_count || customer.evidence?.length || 0,
              },
              {
                label: 'Selection',
                value: resolution.recommended_agent ? 'Matched' : 'Persona only',
              },
            ],
        badge: `${confidence}%`,
        badgeColor: confidence >= 70 ? 'success' : confidence >= 40 ? 'warning' : 'info',
        summary: `${customer.name || 'Customer persona'} · ${executor.role || 'Ideal executor'}`,
        customContent: (
          <Box sx={{ mt: 0.75 }}>
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 700 }}>
              Customer: {customer.name || 'Primary stakeholder'}
            </Typography>
            <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', mt: 0.25 }}>
              Goal persona: {executor.role || 'Customer-aligned specialist'}
            </Typography>
            {(resolution.recommended_agent?.agent_name || resolution.recommended_agent?.name) && (
              <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', mt: 0.25 }}>
                Recommended Agent Hub match:{' '}
                {resolution.recommended_agent.agent_name || resolution.recommended_agent.name}
              </Typography>
            )}
            <Typography
              sx={{
                fontSize: '0.5rem',
                color: customer.trust?.verified ? 'success.main' : 'warning.main',
                mt: 0.25,
              }}
            >
              {customer.trust?.verified
                ? `${customer.trust.verified_evidence_count || 0} evidence integrity check(s)`
                : 'Working hypothesis — evidence integrity not checked'}
            </Typography>
          </Box>
        ),
        links: research.available ? [{ label: 'Research details', type: 'research' }] : undefined,
      };
    }
    case 'pm-planning': {
      const p = goal.plan;
      if (!p?.phases?.length) return null;
      const totalJobs = p.phases.reduce((s, ph) => s + (ph.jobs?.length || 0), 0);
      const conf = goal.confidence_score || 0;
      return {
        metrics: [
          { label: 'Phases', value: p.phases.length },
          { label: 'Tasks', value: totalJobs },
          ...(conf > 0 ? [{ label: 'Confidence', value: `${conf}%` }] : []),
        ],
        badge: conf > 0 ? `${conf}%` : null,
        badgeColor: conf >= 70 ? 'success' : conf >= 40 ? 'warning' : 'error',
        summary: p.strategy?.slice(0, 100),
        customContent: (
          <Box sx={{ mt: 0.75 }}>
            {conf > 0 && (
              <LinearProgress
                variant="determinate"
                value={conf}
                color={conf >= 70 ? 'success' : conf >= 40 ? 'warning' : 'error'}
                sx={{ height: 4, borderRadius: 2, mb: 1 }}
              />
            )}
            {p.phases.map((phase, pi) => (
              <Box key={pi} sx={{ mb: 0.75 }}>
                <Typography
                  sx={{
                    fontSize: '0.5rem',
                    fontWeight: 700,
                    color: 'text.disabled',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    mb: 0.25,
                  }}
                >
                  {phase.name}
                </Typography>
                {(phase.jobs || []).map((job, ji) => (
                  <Box
                    key={ji}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typeof window.__openPmTask === 'function')
                        window.__openPmTask({ ...job, _phase: phase.name, _phaseIndex: pi });
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      py: 0.3,
                      px: 0.5,
                      mx: -0.5,
                      borderRadius: 1,
                      cursor: 'pointer',
                      borderLeft: '2px solid',
                      borderLeftColor: alpha('#10B981', 0.3),
                      mb: 0.25,
                      transition: 'all 0.15s',
                      '&:hover': {
                        bgcolor: 'action.hover',
                        borderLeftColor: 'primary.main',
                        transform: 'translateX(2px)',
                      },
                    }}
                  >
                    <AppIcon
                      name="RadioButtonUnchecked"
                      fallback={RadioButtonUncheckedIcon}
                      sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0 }}
                    />
                    <Typography
                      sx={{ fontSize: '0.55rem', fontWeight: 600, flex: 1, lineHeight: 1.2 }}
                      noWrap
                    >
                      {job.title}
                    </Typography>
                    {job.required_role && (
                      <Typography
                        sx={{ fontSize: '0.45rem', color: 'text.disabled', flexShrink: 0 }}
                      >
                        {job.required_role}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        ),
        links: [
          { label: 'Plan Details', type: 'doc', docKey: 'plan' },
          { label: 'Full Dashboard', type: 'page', href: `/goals/${goal.id}` },
        ],
      };
    }
    case 'team-formation': {
      const caps = goal.tech_doc?.required_capabilities || [];
      const teamEvent = logs.find((l) => l.event_type === 'team_approved');
      const members = teamEvent?.details?.members || [];
      const leader = teamEvent?.details?.leader;
      const isNewTeam = !!goal.team_id;
      const hasAutoAgents = members.some(
        (m) => m.source === 'auto-generated' || m.metadata?.source === 'auto-generated'
      );
      const autoCount = teamEvent?.details?.auto_created_count || 0;
      const teamName =
        teamEvent?.details?.team_name ||
        (isNewTeam ? `Team ${(goal.team_id || '').slice(0, 8)}` : null);
      const goalTasks = goal.tasks || [];
      const requestedRoles = [
        ...new Set(goalTasks.map((task) => task.data?.required_role).filter(Boolean)),
      ];
      const executorCount = members.filter((member) => member.name !== leader).length;
      return {
        metrics: [
          { label: 'Executors', value: executorCount || '—' },
          { label: 'Agents', value: members.length || '—' },
          ...(requestedRoles.length > 0
            ? [{ label: 'Task roles', value: requestedRoles.length }]
            : []),
        ],
        badge: isNewTeam
          ? hasAutoAgents
            ? 'Auto Team'
            : 'New Team'
          : members.length > 0
            ? 'Pool'
            : null,
        badgeColor: isNewTeam ? (hasAutoAgents ? 'warning' : 'info') : 'default',
        customContent:
          members.length > 0 ? (
            <Box sx={{ mt: 0.5 }}>
              {teamName && (
                <Typography
                  sx={{
                    fontSize: '0.55rem',
                    color: 'primary.main',
                    mb: 0.25,
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                  }}
                  noWrap
                >
                  {teamName}
                </Typography>
              )}
              {leader && (
                <Typography
                  sx={{
                    fontSize: '0.5rem',
                    color: 'text.disabled',
                    mb: 0.25,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Coordinator: {leader} (does not execute tasks)
                </Typography>
              )}
              {requestedRoles.length > 0 && executorCount > 0 && (
                <Typography sx={{ fontSize: '0.48rem', color: 'text.secondary', mb: 0.4 }}>
                  {executorCount} executor{executorCount === 1 ? '' : 's'} covering{' '}
                  {requestedRoles.length} requested task role
                  {requestedRoles.length === 1 ? '' : 's'}
                </Typography>
              )}
              {members.map((m, i) => {
                const identity = resolveAgentIdentity(m, profileIndex);
                const displayName = identity.name || m.name;
                const role =
                  identity.position || m.role || m.category || m.metadata?.required_role || '';
                const isLead = m.name === leader;
                const assignedRoles = [
                  ...new Set(
                    goalTasks
                      .filter(
                        (task) =>
                          task.agent_id === (m.id || m.agent_id) || task.assigned_to === m.name
                      )
                      .map((task) => task.data?.required_role)
                      .filter(Boolean)
                  ),
                ];
                return (
                  <Box
                    key={m.id || m.agent_id || i}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typeof window.__openAgentDetail === 'function')
                        window.__openAgentDetail(m);
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      py: 0.35,
                      borderBottom: i < members.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      borderRadius: 1,
                      px: 0.5,
                      mx: -0.5,
                      '&:hover': { bgcolor: 'action.hover' },
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        bgcolor: alpha(isLead ? '#F59E0B' : '#10B981', 0.15),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.5rem',
                          fontWeight: 800,
                          color: isLead ? '#F59E0B' : 'primary.main',
                        }}
                      >
                        {isLead ? 'C' : 'E'}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{ fontSize: '0.55rem', fontWeight: 600, lineHeight: 1.2 }}
                        noWrap
                      >
                        {displayName}
                      </Typography>
                      {(role || assignedRoles.length > 0) && (
                        <Typography
                          sx={{ fontSize: '0.45rem', color: 'text.disabled', lineHeight: 1 }}
                          noWrap
                        >
                          {isLead
                            ? role || 'Coordinator'
                            : assignedRoles.length > 0
                              ? `Executes: ${assignedRoles.join(', ')}`
                              : role}
                        </Typography>
                      )}
                    </Box>
                    {/* Quality dot */}
                    {m.avg_quality != null && m.tasks_completed > 0 && (
                      <Tooltip title="Average structural execution score for completed tasks">
                        <Chip
                          size="small"
                          label={`S ${Math.round(m.avg_quality)}`}
                          variant="outlined"
                          sx={{ fontSize: '0.42rem', height: 15, flexShrink: 0 }}
                        />
                      </Tooltip>
                    )}
                    {m.tasks_completed > 0 && (
                      <Typography
                        sx={{ fontSize: '0.45rem', color: 'text.disabled', flexShrink: 0 }}
                      >
                        {m.tasks_completed}/{(m.tasks_completed || 0) + (m.tasks_failed || 0)}
                      </Typography>
                    )}
                    <AppIcon
                      name="OpenInNew"
                      fallback={OpenInNewIcon}
                      sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0 }}
                    />
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.55rem', color: 'text.disabled', mt: 0.25 }}>
              {caps.length ? `Roles: ${caps.join(', ')}` : 'Using default agent pool'}
            </Typography>
          ),
        links: [{ label: 'Agents', type: 'page', href: '/agent-hub' }],
      };
    }
    case 'tool-provisioning': {
      const req = goal.data?.required_tools || [];
      const missing = goal.data?.unconfigured_tools || [];
      // No tools used — minimal display
      if (req.length === 0) {
        return {
          metrics: [{ label: 'Tools', value: 'None needed' }],
          badge: 'Ready',
          badgeColor: 'success',
        };
      }
      return {
        metrics: [
          { label: 'Required', value: req.length },
          ...(missing.length > 0 ? [{ label: 'Missing', value: missing.length }] : []),
        ],
        badge: missing.length > 0 ? 'Needs keys' : 'Ready',
        badgeColor: missing.length > 0 ? 'warning' : 'success',
        action: missing.length > 0 ? 'setup-tools' : null,
        customContent:
          req.length > 0 ? (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
              {req.map((tool) => {
                const toolName = typeof tool === 'string' ? tool : tool.name || tool.id || 'Tool';
                const isMissing = missing.some(
                  (m) => (typeof m === 'string' ? m : m.name) === toolName
                );
                return (
                  <Chip
                    key={toolName}
                    label={toolName.replace(/_/g, ' ')}
                    size="small"
                    variant="outlined"
                    color={isMissing ? 'warning' : 'success'}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = '/tools';
                    }}
                    sx={{
                      fontSize: '0.5rem',
                      height: 18,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  />
                );
              })}
            </Box>
          ) : null,
        links: [{ label: 'Tools Page', type: 'page', href: '/tools' }],
      };
    }
    case 'discovery': {
      const pr = goal.proposal;
      const phases = goal.plan?.phases || [];
      // Estimation: use proposal if available, otherwise approximate ~25s per phase
      const estMin =
        pr?.estimates?.total_estimated_time_minutes || Math.ceil((phases.length * 25) / 60);
      const estSec = estMin * 60;
      const firstStarted = phases.find((p) => p.started_at)?.started_at;
      const allDone =
        phases.length > 0 && phases.every((p) => p.status === 'completed' || p.status === 'failed');
      const totalDurationMs = phases.reduce((s, p) => s + (p.duration_ms || 0), 0);
      const totalDurationSec = Math.round(totalDurationMs / 1000);
      const isOver = allDone && totalDurationSec > estSec;
      const extraSec = isOver ? totalDurationSec - estSec : 0;
      const fmtDur = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
      };
      const spent = Number(goal.spent_usd || 0);

      const estCost = pr?.total_cost?.total || pr?.estimates?.total_estimated_cost_usd || 0;
      const costVariance = allDone && estCost > 0 ? spent - estCost : null;
      return {
        metrics: [
          { label: 'Estimate', value: `~${estMin}m` },
          ...(allDone ? [{ label: 'Actual', value: fmtDur(totalDurationSec) }] : []),
          ...(isOver ? [{ label: 'Extra', value: `+${fmtDur(extraSec)}` }] : []),
          { label: 'Cost', value: `$${spent.toFixed(4)}` },
          ...(costVariance != null
            ? [
                {
                  label: costVariance > 0 ? 'Over' : 'Saved',
                  value: `$${Math.abs(costVariance).toFixed(4)}`,
                },
              ]
            : []),
        ],
        customContent: (
          <Box>
            {/* Live countdown while executing */}
            {firstStarted && !allDone && (
              <LiveCountdown startedAt={firstStarted} estimatedMinutes={estMin} />
            )}
            {/* Completed summary */}
            {allDone && (
              <Box sx={{ mt: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: '0.55rem',
                    fontWeight: 600,
                    color: isOver ? 'error.main' : 'success.main',
                    mb: 0.25,
                  }}
                >
                  {isOver ? `Over by ${fmtDur(extraSec)}` : 'Within estimate'}
                </Typography>
                {/* Estimate vs Total comparison */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    py: 0.1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography sx={{ fontSize: '0.5rem', color: 'text.disabled', fontWeight: 600 }}>
                    Estimate / Total
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '0.5rem',
                      fontWeight: 700,
                      color: isOver ? 'error.main' : 'success.main',
                    }}
                  >
                    {fmtDur(estSec)} / {fmtDur(totalDurationSec)}
                  </Typography>
                </Box>
                {/* Per-phase actual durations */}
                {phases.map((ph, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.1 }}>
                    <Typography sx={{ fontSize: '0.5rem', color: 'text.disabled' }} noWrap>
                      {ph.name || `Phase ${i + 1}`}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.5rem', color: 'text.secondary', fontWeight: 600 }}
                    >
                      {ph.duration_ms ? fmtDur(Math.round(ph.duration_ms / 1000)) : '—'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            {/* Per-phase estimate breakdown while running */}
            {!allDone && pr?.estimates?.per_phase_breakdown?.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                {pr.estimates.per_phase_breakdown.slice(0, 3).map((pb, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.1 }}>
                    <Typography sx={{ fontSize: '0.5rem', color: 'text.disabled' }} noWrap>
                      {pb.phase}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.5rem', color: 'text.secondary', fontWeight: 600 }}
                    >
                      {pb.time_minutes}m
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            {/* Send summary to improve consilium/team */}
            {allDone && (
              <Button
                size="small"
                startIcon={
                  <AppIcon name="SendOutlined" fallback={SendOutlinedIcon} sx={{ fontSize: 12 }} />
                }
                variant="outlined"
                color="info"
                onClick={(e) => {
                  e.stopPropagation();
                  const summary = [
                    `Performance Report: ${goal.title}`,
                    `Estimated: ${fmtDur(estSec)} | Actual: ${fmtDur(totalDurationSec)} | ${isOver ? `Over by ${fmtDur(extraSec)}` : 'Within estimate'}`,
                    `Cost: $${spent.toFixed(4)} | Phases: ${phases.length}`,
                    ...phases.map(
                      (ph, i) =>
                        `  ${ph.name || `Phase ${i + 1}`}: ${ph.duration_ms ? fmtDur(Math.round(ph.duration_ms / 1000)) : '—'} | Quality: ${ph.quality_score || '—'}/100`
                    ),
                    isOver
                      ? `\nAction: Review agent performance and optimize task allocation to reduce execution time.`
                      : `\nNote: Good performance. Consider saving this workflow pattern.`,
                  ].join('\n');
                  navigator.clipboard.writeText(summary).then(() => {
                    alert(
                      'Performance summary copied! Paste it in Consilium or Team chat to update their memory.'
                    );
                  });
                }}
                sx={{
                  mt: 0.75,
                  textTransform: 'none',
                  fontSize: '0.55rem',
                  py: 0.2,
                  borderRadius: 1.5,
                  width: '100%',
                }}
              >
                Send Summary to Improve
              </Button>
            )}
          </Box>
        ),
      };
    }
    case 'execution': {
      const phases = goal.plan?.phases || [];
      const done = phases.filter((p) => p.status === 'completed').length;
      const failed = phases.filter((p) => p.status === 'failed').length;
      const executing = phases.find((p) => p.status === 'executing');
      const spent = Number(goal.spent_usd || 0);
      const budget = Number(goal.budget_usd || 0);
      const estMin = goal.proposal?.estimates?.total_estimated_time_minutes || 0;
      const firstStarted = phases.find((p) => p.started_at)?.started_at;
      const allDone =
        phases.length > 0 && phases.every((p) => p.status === 'completed' || p.status === 'failed');
      const qualityScores = phases
        .filter((p) => p.quality_score != null)
        .map((p) => p.quality_score);
      const avgQuality =
        qualityScores.length > 0
          ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
          : null;
      return {
        metrics: [
          { label: 'Phases', value: `${done}/${phases.length}` },
          ...(avgQuality != null ? [{ label: 'Quality', value: `${avgQuality}%` }] : []),
          ...(failed > 0 ? [{ label: 'Failed', value: failed }] : []),
          { label: 'Budget', value: `$${spent.toFixed(2)}/$${budget.toFixed(0)}` },
        ],
        summary: executing
          ? `Running: ${executing.name}`
          : done === phases.length
            ? 'All phases complete'
            : 'Waiting for next phase',
        customContent:
          firstStarted && !allDone ? (
            <LiveCountdown startedAt={firstStarted} estimatedMinutes={estMin} />
          ) : null,
        links: [
          {
            label: 'Agent Room',
            type: 'page',
            href: `/communicator?tab=agent-room&goal=${goal.id}`,
          },
          ...(goal.concilium_id
            ? [{ label: 'Consilium Log', type: 'page', href: '/communicator?tab=consilium-log' }]
            : []),
          { label: 'Full Dashboard', type: 'page', href: `/goals/${goal.id}` },
        ],
      };
    }
    default:
      return null;
  }
}

function StageCard({
  stage,
  state,
  content,
  compact,
  theme,
  onAction,
  onLinkClick,
  goal,
  researchRetrying,
  researchRetryError,
}) {
  const isDone = state === 'done';
  const isActive = state === 'active';
  const isBlocked = state === 'blocked';
  const isSkipped = state === 'skipped';
  const isPending = state === 'pending';

  const borderColor = isDone
    ? theme.palette.success.main
    : isActive
      ? theme.palette.info.main
      : isBlocked
        ? theme.palette.warning.main
        : alpha(theme.palette.divider, 0.3);

  const bgColor = isDone
    ? alpha(theme.palette.success.main, 0.06)
    : isActive
      ? alpha(theme.palette.info.main, 0.06)
      : isBlocked
        ? alpha(theme.palette.warning.main, 0.04)
        : alpha(theme.palette.action.hover, 0.02);

  const StatusIcon = isDone
    ? CheckCircleIcon
    : isActive
      ? HourglassTopIcon
      : isBlocked
        ? WarningAmberIcon
        : isSkipped
          ? BlockIcon
          : RadioButtonUncheckedIcon;

  const iconColor = isDone
    ? 'success.main'
    : isActive
      ? 'info.main'
      : isBlocked
        ? 'warning.main'
        : 'text.disabled';

  return (
    <Paper
      elevation={0}
      sx={{
        p: compact ? 1.25 : 1.5,
        borderRadius: compact ? 2 : 2.5,
        border: '1.5px solid',
        borderColor: alpha(borderColor, isDone || isActive || isBlocked ? 0.5 : 0.2),
        bgcolor: bgColor,
        opacity: isSkipped ? 0.4 : isPending ? 0.6 : 1,
        ...(isActive ? { animation: `${pulse} 2.5s ease-in-out infinite` } : {}),
        transition: 'all 0.3s ease',
        position: 'relative',
        minHeight: compact ? 80 : 140,
        maxHeight: 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Pause/Failed overlay */}
      {goal &&
        (goal.status === 'paused' || goal.status === 'failed' || goal.status === 'cancelled') &&
        !isDone &&
        !isPending && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              zIndex: 1,
              bgcolor: alpha(
                goal.status === 'paused' ? theme.palette.warning.main : theme.palette.error.main,
                0.08
              ),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <Chip
              label={
                goal.status === 'paused'
                  ? 'Paused'
                  : goal.status === 'failed'
                    ? 'Failed'
                    : 'Cancelled'
              }
              size="small"
              color={goal.status === 'paused' ? 'warning' : 'error'}
              sx={{ fontSize: '0.6rem', height: 20, fontWeight: 700, opacity: 0.9 }}
            />
          </Box>
        )}
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: content ? 1 : 0 }}>
        <AppIcon fallback={StatusIcon} sx={{ fontSize: compact ? 16 : 18, color: iconColor }} />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: compact ? '0.7rem' : '0.78rem',
            color: isDone
              ? 'success.main'
              : isActive
                ? 'info.main'
                : isBlocked
                  ? 'warning.main'
                  : 'text.secondary',
            flex: 1,
            letterSpacing: 0.3,
          }}
        >
          {stage.label}
        </Typography>
        {/* Risk/Alert badges */}
        {goal &&
          (() => {
            const budgetPct =
              Number(goal.budget_usd) > 0
                ? (Number(goal.spent_usd || 0) / Number(goal.budget_usd)) * 100
                : 0;
            if (budgetPct > 80 && isActive)
              return (
                <Chip
                  label="Budget!"
                  size="small"
                  color="warning"
                  sx={{ fontSize: '0.5rem', height: 16, fontWeight: 700 }}
                />
              );
            return null;
          })()}
        {content?.badge && (
          <Chip
            label={content.badge}
            size="small"
            color={content.badgeColor || 'default'}
            sx={{ fontSize: '0.55rem', height: 18, fontWeight: 600 }}
          />
        )}
      </Box>
      {/* Stage description for pending/active/blocked without content */}
      {isPending && stage.desc && (
        <Typography
          variant="caption"
          sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic', mt: 0.25 }}
        >
          {stage.desc}
        </Typography>
      )}
      {/* Active state */}
      {isActive && !content && (
        <Typography
          variant="caption"
          sx={{ fontSize: '0.65rem', color: 'info.main', fontStyle: 'italic' }}
        >
          Processing{stage.desc ? ` — ${stage.desc.toLowerCase()}` : '...'}
        </Typography>
      )}
      {/* Blocked state */}
      {isBlocked && !content && (
        <Typography
          variant="caption"
          sx={{ fontSize: '0.65rem', color: 'warning.main', fontStyle: 'italic' }}
        >
          Waiting — action required
        </Typography>
      )}
      {/* Metrics */}
      {content?.metrics && (isDone || isActive || isBlocked) && (
        <Box
          sx={{
            display: 'flex',
            gap: compact ? 1.5 : 2,
            mb: content.summary ? 0.75 : 0,
            flexWrap: 'wrap',
          }}
        >
          {content.metrics.map((m, i) => (
            <MetricCard key={i} m={m} compact={compact} />
          ))}
        </Box>
      )}
      {/* Summary */}
      {content?.summary && (isDone || isActive || isBlocked) && !compact && (
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.62rem',
            color: 'text.disabled',
            lineHeight: 1.3,
            mt: 'auto',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {content.summary}
        </Typography>
      )}
      {/* Action button */}
      {content?.action === 'setup-tools' && isBlocked && onAction && (
        <Button
          size="small"
          startIcon={<AppIcon name="VpnKey" fallback={VpnKeyIcon} sx={{ fontSize: 14 }} />}
          onClick={(e) => {
            e.stopPropagation();
            onAction('setup-tools');
          }}
          variant="outlined"
          color="warning"
          sx={{ mt: 0.75, textTransform: 'none', fontSize: '0.65rem', py: 0.25, borderRadius: 1.5 }}
        >
          Setup Keys
        </Button>
      )}
      {content?.action === 'retry-research' && isBlocked && onAction && (
        <Box sx={{ mt: 0.75 }}>
          <Button
            size="small"
            startIcon={
              <AppIcon name="Replay" fallback={HistoryOutlinedIcon} sx={{ fontSize: 14 }} />
            }
            onClick={(e) => {
              e.stopPropagation();
              onAction('retry-research');
            }}
            disabled={researchRetrying}
            variant="outlined"
            color="error"
            sx={{ textTransform: 'none', fontSize: '0.65rem', py: 0.25, borderRadius: 1.5 }}
          >
            {researchRetrying ? 'Retrying research…' : 'Retry research'}
          </Button>
          {researchRetryError && (
            <Typography role="alert" sx={{ mt: 0.5, fontSize: '0.55rem', color: 'error.main' }}>
              {researchRetryError}
            </Typography>
          )}
        </Box>
      )}
      {/* Custom content (JSX) */}
      {content?.customContent && (isDone || isActive || isBlocked) && content.customContent}
      {/* Links to documents and pages */}
      {content?.links?.length > 0 && (isDone || isActive || isBlocked) && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
          {content.links.map((link) => (
            <Chip
              key={link.label}
              label={link.label}
              size="small"
              icon={
                link.type === 'doc' ? (
                  <AppIcon
                    name="Description"
                    fallback={DescriptionIcon}
                    sx={{ fontSize: '12px !important' }}
                  />
                ) : (
                  <AppIcon
                    name="OpenInNew"
                    fallback={OpenInNewIcon}
                    sx={{ fontSize: '12px !important' }}
                  />
                )
              }
              onClick={(e) => {
                e.stopPropagation();
                onLinkClick?.(link);
              }}
              variant="outlined"
              color={link.type === 'doc' ? 'info' : 'default'}
              sx={{
                fontSize: '0.55rem',
                height: 20,
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
              }}
            />
          ))}
        </Box>
      )}
    </Paper>
  );
}

// Format goal data as readable document
function formatDoc(docKey, goal, extraLogs) {
  if (docKey === 'tech_doc') {
    const t = goal.tech_doc;
    if (!t) return { title: 'PO Tech Doc', content: 'No tech doc generated yet.' };
    const sections = [
      `# PO Technical Document\n`,
      `## Problem Statement\n${t.problem_statement || 'N/A'}\n`,
      t.target_audience ? `## Target Audience\n${t.target_audience}\n` : '',
      `## Success Criteria\n${(t.success_criteria || []).map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`,
      `## Acceptance Tests\n${(t.acceptance_tests || []).map((a) => `- Phase ${(a.phase || 0) + 1}: ${a.test}`).join('\n')}\n`,
      t.recommended_approach ? `## Recommended Approach\n${t.recommended_approach}\n` : '',
      t.required_capabilities?.length
        ? `## Required Roles\n${t.required_capabilities.join(', ')}\n`
        : '',
      t.tool_requirements?.length ? `## Required Tools\n${t.tool_requirements.join(', ')}\n` : '',
      t.constraints?.length
        ? `## Constraints\n${t.constraints.map((c) => `- ${c}`).join('\n')}\n`
        : '',
      t.risks?.length
        ? `## Risks\n${t.risks.map((r) => `- **${r.severity}**: ${r.risk} → ${r.mitigation}`).join('\n')}\n`
        : '',
      t.dependencies?.length
        ? `## Dependencies\n${t.dependencies.map((d) => `- ${d}`).join('\n')}\n`
        : '',
      t.phase_suggestions?.length
        ? `## Suggested Phases\n${t.phase_suggestions.map((p) => `- **${p.name}**: ${(Array.isArray(p.deliverables) ? p.deliverables : typeof p.deliverables === 'string' ? p.deliverables.split(/[;,]\s*/) : []).join(', ')}`).join('\n')}\n`
        : '',
      t.estimated_complexity_per_area
        ? `## Complexity by Area\n${Object.entries(t.estimated_complexity_per_area)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')}\n`
        : '',
      // New PRD fields (Standard + Expert)
      t.out_of_scope?.length
        ? `## Out of Scope\n${t.out_of_scope.map((s) => `- ${s}`).join('\n')}\n`
        : '',
      t.functional_requirements?.length
        ? `## Functional Requirements (MoSCoW)\n${t.functional_requirements.map((r) => `- **[${(r.priority || 'MUST').toUpperCase()}]** ${r.requirement || r}`).join('\n')}\n`
        : '',
      t.success_tiers
        ? `## Success Tiers\n- **Minimum:** ${t.success_tiers.minimum || 'N/A'}\n- **Target:** ${t.success_tiers.target || 'N/A'}\n- **Stretch:** ${t.success_tiers.stretch || 'N/A'}\n`
        : '',
      t.exit_criteria?.length
        ? `## Exit Criteria\n${t.exit_criteria.map((c) => `- ${c}`).join('\n')}\n`
        : '',
      // Expert-only fields
      t.user_stories?.length
        ? `## User Stories\n${t.user_stories.map((s) => `- ${s}`).join('\n')}\n`
        : '',
      t.non_functional_requirements?.length
        ? `## Non-Functional Requirements\n${t.non_functional_requirements.map((r) => `- ${r}`).join('\n')}\n`
        : '',
      t.timeline?.length
        ? `## Timeline\n${t.timeline.map((m) => `- **${m.milestone}** (${m.target_date || 'TBD'}): ${m.description || ''}`).join('\n')}\n`
        : '',
      t.revenue_model ? `## Revenue Model\n${t.revenue_model}\n` : '',
      t.stakeholders?.length
        ? `## Stakeholders (RACI)\n${t.stakeholders.map((s) => `- **${s.role}**: ${s.responsibility}`).join('\n')}\n`
        : '',
      t.competitive_landscape ? `## Competitive Landscape\n${t.competitive_landscape}\n` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return { title: 'PO Technical Document — PRD', content: sections };
  }
  if (docKey === 'plan') {
    const p = goal.plan;
    if (!p?.phases?.length) return { title: 'PM Plan', content: 'No plan generated yet.' };
    const sections = [
      `# PM Execution Plan\n`,
      `## Strategy\n${p.strategy || 'N/A'}\n`,
      ...p.phases.map((phase, i) =>
        [
          `## Phase ${i + 1}: ${phase.name}`,
          phase.description || '',
          phase.timebox_minutes ? `Timebox: ${phase.timebox_minutes} minutes` : '',
          phase.acceptance_criteria?.length
            ? `\n**Acceptance Criteria:**\n${phase.acceptance_criteria.map((c) => `- ${c}`).join('\n')}`
            : '',
          `\n**Tasks:**`,
          ...(phase.jobs || []).map(
            (j) =>
              `- **${j.title}** (${j.required_role || j.category || 'general'}, ~${j.estimate_hours || '?'}h)\n  ${j.description || ''}\n  Tools: ${(j.tool_requirements || []).join(', ') || 'none'}\n  Criteria: ${(j.acceptance_criteria || []).join('; ') || 'none'}`
          ),
          '',
        ]
          .filter(Boolean)
          .join('\n')
      ),
    ].join('\n');
    return { title: 'PM Execution Plan', content: sections };
  }
  if (docKey === 'feasibility_report') {
    const r = goal.feasibility_report;
    if (!r) return { title: 'Feasibility Analysis Report', content: 'No report yet.' };
    const complexity = ((r.complexity_score || 0) * 100).toFixed(0);
    const complexityTier =
      Number(complexity) < 30
        ? 'Simple'
        : Number(complexity) < 60
          ? 'Moderate'
          : Number(complexity) < 80
            ? 'Complex'
            : 'Very Complex';
    const success = ((r.feasibility?.success_probability || 0) * 100).toFixed(0);
    const riskFactors = r.feasibility?.risk_factors || [];
    const riskScore = Math.min(riskFactors.length, 5);
    const riskLabel = riskScore <= 1 ? 'Low' : riskScore <= 3 ? 'Medium' : 'High';
    const riskColor = riskScore <= 1 ? '#10B981' : riskScore <= 3 ? '#F59E0B' : '#EF4444';
    const revenue = r.profitability?.revenue_potential || 'unknown';
    const roiProjection = r.profitability?.roi_projection;
    const tokenCost = r.profitability?.estimated_token_cost || 0;
    const budgetUsd = Number(goal.budget_usd) || 10;
    const budgetRatio = tokenCost > 0 ? Math.round(budgetUsd / tokenCost) : 0;
    const toolPresentation = getFeasibilityToolPresentation(goal, r);
    const { availableTools, missingTools, noToolsPolicy } = toolPresentation;
    const hasHistory = r.historical && r.historical.similar_goals_count > 0;
    const recColor =
      r.recommendation === 'proceed'
        ? '#10B981'
        : r.recommendation === 'adjust'
          ? '#F59E0B'
          : '#EF4444';
    const revenueColor =
      revenue === 'high'
        ? '#10B981'
        : revenue === 'medium'
          ? '#3B82F6'
          : revenue === 'low'
            ? '#F59E0B'
            : '#6B7280';

    const plainText = [
      `FEASIBILITY ANALYSIS REPORT`,
      `Goal: ${goal.title}`,
      ``,
      `RECOMMENDATION: ${(r.recommendation || '').toUpperCase()}`,
      r.recommendation_reason || '',
      ``,
      `SCORES`,
      `Complexity: ${complexity}% (${complexityTier})`,
      r.complexity_reason ? `  ${r.complexity_reason}` : '',
      `Success Probability: ${success}%`,
      `Risk: ${riskScore}/5 (${riskLabel})`,
      `Revenue Potential: ${revenue}`,
      r.revenue_potential_reason ? `  ${r.revenue_potential_reason}` : '',
      roiProjection ? `ROI Projection: ${roiProjection}` : '',
      ``,
      `BUDGET`,
      `Your Budget: $${budgetUsd}`,
      `Estimated Token Cost: $${tokenCost}`,
      budgetRatio > 0 ? `Coverage: ${budgetRatio}x` : '',
      ``,
      riskFactors.length ? `RISK FACTORS (${riskFactors.length})` : '',
      ...riskFactors.map((f, i) => `${i + 1}. ${f}`),
      ``,
      r.feasibility?.competitive_analysis ? `COMPETITIVE ANALYSIS` : '',
      r.feasibility?.competitive_analysis || '',
      ``,
      ...toolPresentation.reportLines,
      ``,
      hasHistory ? `HISTORICAL DATA` : '',
      hasHistory ? `Similar Goals: ${r.historical.similar_goals_count}` : '',
      hasHistory ? `Avg Success Rate: ${(r.historical.avg_success_rate * 100).toFixed(0)}%` : '',
    ]
      .filter((l) => l !== null && l !== undefined)
      .join('\n');

    return {
      title: 'Feasibility Analysis Report',
      content: plainText,
      richContent: (theme) => (
        <Box sx={{ p: { xs: 1, sm: 2 } }}>
          {/* Header banner */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              mb: 3,
              background: `linear-gradient(135deg, ${alpha(recColor, 0.12)} 0%, ${alpha(recColor, 0.04)} 100%)`,
              border: '1px solid',
              borderColor: alpha(recColor, 0.25),
              display: 'flex',
              alignItems: 'flex-start',
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                bgcolor: alpha(recColor, 0.15),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {r.recommendation === 'proceed' ? (
                <AppIcon
                  name="CheckCircleOutline"
                  fallback={CheckCircleOutlineIcon}
                  sx={{ fontSize: 24, color: recColor }}
                />
              ) : r.recommendation === 'adjust' ? (
                <AppIcon
                  name="TipsAndUpdatesOutlined"
                  fallback={TipsAndUpdatesOutlinedIcon}
                  sx={{ fontSize: 24, color: recColor }}
                />
              ) : (
                <AppIcon
                  name="ErrorOutline"
                  fallback={ErrorOutlineIcon}
                  sx={{ fontSize: 24, color: recColor }}
                />
              )}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: recColor,
                  }}
                >
                  Recommendation
                </Typography>
                <Chip
                  label={(r.recommendation || '').toUpperCase()}
                  size="small"
                  sx={{
                    bgcolor: alpha(recColor, 0.15),
                    color: recColor,
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    height: 22,
                  }}
                />
              </Box>
              <Typography sx={{ fontSize: '0.88rem', color: 'text.primary', lineHeight: 1.6 }}>
                {r.recommendation_reason || 'No recommendation reason provided.'}
              </Typography>
            </Box>
          </Box>

          {/* 4-column score grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 3 }}>
            {[
              {
                label: 'Complexity',
                value: `${complexity}%`,
                sub: complexityTier,
                color:
                  Number(complexity) < 40
                    ? '#10B981'
                    : Number(complexity) < 70
                      ? '#F59E0B'
                      : '#EF4444',
              },
              {
                label: 'Success Rate',
                value: `${success}%`,
                sub:
                  Number(success) >= 70
                    ? 'High confidence'
                    : Number(success) >= 50
                      ? 'Moderate'
                      : 'Risky',
                color:
                  Number(success) >= 70 ? '#10B981' : Number(success) >= 50 ? '#F59E0B' : '#EF4444',
              },
              { label: 'Risk Level', value: `${riskScore}/5`, sub: riskLabel, color: riskColor },
              {
                label: 'Revenue',
                value: revenue,
                sub: roiProjection ? `ROI: ${roiProjection}` : 'See analysis',
                color: revenueColor,
              },
            ].map((m) => (
              <Paper
                key={m.label}
                variant="outlined"
                sx={{
                  p: 1.75,
                  borderRadius: 2,
                  borderColor: alpha(m.color, 0.2),
                  background: `linear-gradient(135deg, ${alpha(m.color, 0.07)} 0%, transparent 100%)`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.58rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'text.disabled',
                    mb: 0.5,
                  }}
                >
                  {m.label}
                </Typography>
                <Typography
                  sx={{ fontSize: '1.35rem', fontWeight: 800, color: m.color, lineHeight: 1.1 }}
                >
                  {m.value}
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.25 }}>
                  {m.sub}
                </Typography>
              </Paper>
            ))}
          </Box>

          {/* Complexity + Revenue explanations */}
          {(r.complexity_reason || r.revenue_potential_reason) && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
                mb: 3,
              }}
            >
              {r.complexity_reason && (
                <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
                  <Typography
                    sx={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'text.disabled',
                      mb: 0.75,
                    }}
                  >
                    Why this complexity?
                  </Typography>
                  <Typography
                    sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.6 }}
                  >
                    {r.complexity_reason}
                  </Typography>
                </Paper>
              )}
              {r.revenue_potential_reason && (
                <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
                  <Typography
                    sx={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'text.disabled',
                      mb: 0.75,
                    }}
                  >
                    Why this revenue rating?
                  </Typography>
                  <Typography
                    sx={{ fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.6 }}
                  >
                    {r.revenue_potential_reason}
                  </Typography>
                </Paper>
              )}
            </Box>
          )}

          {/* Budget analysis */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <AppIcon
                name="TrendingUp"
                fallback={TrendingUpIcon}
                sx={{ fontSize: 18, color: 'primary.main' }}
              />
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>Budget Analysis</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 1.5 }}>
              {[
                { label: 'Your Budget', value: `$${budgetUsd}`, color: 'text.primary' },
                {
                  label: 'Est. Token Cost',
                  value: `$${tokenCost}`,
                  sub: 'AI API calls only',
                  color: 'text.primary',
                },
                {
                  label: 'Coverage',
                  value: budgetRatio > 0 ? `${budgetRatio}×` : 'N/A',
                  color: budgetRatio >= 3 ? '#10B981' : budgetRatio >= 1 ? '#F59E0B' : '#EF4444',
                },
              ].map((b) => (
                <Box key={b.label}>
                  <Typography
                    sx={{
                      fontSize: '0.62rem',
                      fontWeight: 600,
                      color: 'text.disabled',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      mb: 0.25,
                    }}
                  >
                    {b.label}
                  </Typography>
                  <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: b.color }}>
                    {b.value}
                  </Typography>
                  {b.sub && (
                    <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled' }}>
                      {b.sub}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
            <LinearProgress
              variant="determinate"
              value={budgetRatio > 0 ? Math.min(100, (1 / budgetRatio) * 100) : 100}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: alpha('#10B981', 0.12),
                '& .MuiLinearProgress-bar': {
                  bgcolor: budgetRatio >= 3 ? '#10B981' : budgetRatio >= 1 ? '#F59E0B' : '#EF4444',
                  borderRadius: 3,
                },
              }}
            />
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.75 }}>
              {budgetRatio >= 10
                ? 'Well funded — significant buffer above estimated cost.'
                : budgetRatio >= 3
                  ? 'Good coverage — comfortable buffer for unexpected steps.'
                  : budgetRatio >= 1
                    ? 'Adequate — budget covers cost but has little margin.'
                    : 'At risk — budget may not fully cover estimated token usage.'}
            </Typography>
          </Paper>

          {/* Risk factors */}
          {riskFactors.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <AppIcon
                  name="ErrorOutline"
                  fallback={ErrorOutlineIcon}
                  sx={{ fontSize: 18, color: riskColor }}
                />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>Risk Factors</Typography>
                <Chip
                  label={`${riskScore}/5 ${riskLabel}`}
                  size="small"
                  sx={{
                    ml: 'auto',
                    bgcolor: alpha(riskColor, 0.12),
                    color: riskColor,
                    fontWeight: 700,
                    fontSize: '0.65rem',
                    height: 22,
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {riskFactors.map((rf, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor: alpha(riskColor, 0.12),
                        color: riskColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: '0.62rem',
                        fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </Box>
                    <Typography
                      sx={{
                        fontSize: '0.82rem',
                        color: 'text.secondary',
                        lineHeight: 1.6,
                        pt: 0.25,
                      }}
                    >
                      {rf}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}

          {/* Competitive analysis */}
          {r.feasibility?.competitive_analysis && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AppIcon
                  name="AssessmentOutlined"
                  fallback={AssessmentOutlinedIcon}
                  sx={{ fontSize: 18, color: 'info.main' }}
                />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Competitive Analysis
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.84rem', color: 'text.secondary', lineHeight: 1.7 }}>
                {r.feasibility.competitive_analysis}
              </Typography>
            </Paper>
          )}

          {/* Tools */}
          {(noToolsPolicy || availableTools.length > 0 || missingTools.length > 0) && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <AppIcon
                  name="BuildOutlined"
                  fallback={BuildOutlinedIcon}
                  sx={{ fontSize: 18, color: 'text.secondary' }}
                />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  {noToolsPolicy ? 'Tool Policy' : 'Tool Availability'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {noToolsPolicy && (
                  <Typography
                    sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.6 }}
                  >
                    No Tools execution is enabled. Feasibility suggestions are informational only;
                    external tools and credentials will not be requested.
                  </Typography>
                )}
                {availableTools.length > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        color: '#10B981',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        mb: 0.5,
                      }}
                    >
                      Available ({availableTools.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {availableTools.map((t) => (
                        <Chip
                          key={t}
                          label={t}
                          size="small"
                          sx={{
                            bgcolor: alpha('#10B981', 0.1),
                            color: '#10B981',
                            fontSize: '0.68rem',
                            height: 22,
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
                {missingTools.length > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        color: '#F59E0B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        mb: 0.5,
                      }}
                    >
                      Missing ({missingTools.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {missingTools.map((t) => (
                        <Chip
                          key={t}
                          label={t}
                          size="small"
                          sx={{
                            bgcolor: alpha('#F59E0B', 0.1),
                            color: '#F59E0B',
                            fontSize: '0.68rem',
                            height: 22,
                          }}
                        />
                      ))}
                    </Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', mt: 0.75 }}>
                      Configure missing tools in Settings → Tools to unlock full agent capabilities.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          )}

          {/* Historical data */}
          {hasHistory && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <AppIcon
                  name="HistoryOutlined"
                  fallback={HistoryOutlinedIcon}
                  sx={{ fontSize: 18, color: 'text.secondary' }}
                />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Historical Performance
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                {[
                  { label: 'Similar Goals', value: r.historical.similar_goals_count },
                  {
                    label: 'Avg Success Rate',
                    value: `${(r.historical.avg_success_rate * 100).toFixed(0)}%`,
                  },
                  {
                    label: 'Est. Avg Cost',
                    value: r.historical.avg_cost_similar
                      ? `$${Number(r.historical.avg_cost_similar).toFixed(4)}`
                      : 'N/A',
                  },
                ].map((h) => (
                  <Box key={h.label}>
                    <Typography
                      sx={{
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        color: 'text.disabled',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        mb: 0.25,
                      }}
                    >
                      {h.label}
                    </Typography>
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 700 }}>{h.value}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          )}

          {/* Metadata footer */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              pt: 1,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
              Goal: <strong>{goal.title}</strong>
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
              Budget: <strong>${budgetUsd}</strong>
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
              Spent on analysis: <strong>${Number(goal.spent_usd || 0).toFixed(4)}</strong>
            </Typography>
          </Box>
        </Box>
      ),
    };
  }
  if (docKey === 'team') {
    const teamEvent = (extraLogs || []).find((l) => l.event_type === 'team_approved');
    const members = teamEvent?.details?.members || [];
    const leader = teamEvent?.details?.leader;
    const requiredRoles =
      teamEvent?.details?.required_roles || goal.tech_doc?.required_capabilities || [];
    if (!members.length) return { title: 'Team Details', content: 'No team members assigned yet.' };
    const sections = [
      `# Team: ${goal.title}\n`,
      leader ? `**Team Lead:** ${leader}\n` : '',
      `**Members:** ${members.length}`,
      requiredRoles.length ? `**Required Roles:** ${requiredRoles.join(', ')}\n` : '',
      `## Agents\n`,
      ...members.map((m, i) =>
        [
          `### ${i + 1}. ${m.name}`,
          `- **Type:** ${m.type || 'general'}`,
          m.description ? `- **Description:** ${m.description}` : '',
          m.tasks_completed > 0
            ? `- **Track Record:** ${m.tasks_completed} completed, ${m.tasks_failed || 0} failed, quality ${m.avg_quality || 0}/100`
            : '- **Track Record:** New agent (no prior tasks)',
          '',
        ]
          .filter(Boolean)
          .join('\n')
      ),
    ]
      .filter(Boolean)
      .join('\n');
    return { title: 'Team Details', content: sections };
  }
  return { title: 'Document', content: 'Not available.' };
}

// ── Agent History Tab — expandable task details ─────────────────
function AgentHistoryTab({ history, historyLoading, theme, goal }) {
  const [expanded, setExpanded] = useState(null); // task id

  if (historyLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  if (history.length === 0)
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.disabled">No task history yet.</Typography>
      </Box>
    );

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      {/* Summary stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2 }}>
        {[
          { label: 'Total', value: history.length, color: 'info.main' },
          {
            label: 'Done',
            value: history.filter((t) => t.status === 'done').length,
            color: 'success.main',
          },
          {
            label: 'Failed',
            value: history.filter((t) => t.status === 'failed').length,
            color: 'error.main',
          },
          {
            label: 'Cost',
            value: `$${history.reduce((s, t) => s + Number(t.data?.llmCost || 0), 0).toFixed(4)}`,
            color: 'warning.main',
          },
        ].map((s) => (
          <Paper
            key={s.label}
            elevation={0}
            sx={{
              p: 0.75,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: s.color }}>
              {s.value}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', fontSize: '0.55rem', textTransform: 'uppercase' }}
            >
              {s.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Task list */}
      {history.map((t) => {
        const isOpen = expanded === t.id;
        const output = t.data?.output || '';
        const quality = t.data?.quality_score;
        const cost = t.data?.llmCost;
        const model = t.data?.llmModel;
        const duration = t.data?.llmDurationMs;
        const toolLog = t.data?.toolLog || [];
        const goalId = t.data?.goal_id;
        const phaseIdx = t.data?.phase_index;

        return (
          <Paper
            key={t.id}
            variant="outlined"
            sx={{
              mb: 1,
              borderRadius: 1.5,
              overflow: 'hidden',
              transition: 'border-color 0.2s',
              '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.3) },
            }}
          >
            {/* Task header — clickable */}
            <Box
              onClick={() => setExpanded(isOpen ? null : t.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1,
                cursor: 'pointer',
              }}
            >
              <Chip
                label={t.status}
                size="small"
                color={
                  t.status === 'done' ? 'success' : t.status === 'failed' ? 'error' : 'default'
                }
                variant="outlined"
                sx={{ fontSize: '0.55rem', height: 18, width: 48 }}
              />
              <Typography
                variant="body2"
                sx={{ flex: 1, fontSize: '0.75rem', fontWeight: 600 }}
                noWrap
              >
                {t.title}
              </Typography>
              {model && (
                <Chip
                  label={model}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: '0.5rem',
                    height: 16,
                    color: 'text.secondary',
                    borderColor: 'divider',
                  }}
                />
              )}
              {quality != null && (
                <Tooltip title="Automated structural execution score; not the independent Osja quality verdict">
                  <Chip
                    label={`Structure ${quality}/100`}
                    size="small"
                    sx={{
                      fontSize: '0.5rem',
                      height: 16,
                      bgcolor: alpha(quality >= 70 ? '#059669' : '#D97706', 0.12),
                      color: quality >= 70 ? '#059669' : '#D97706',
                    }}
                  />
                </Tooltip>
              )}
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  color: 'text.disabled',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.2s',
                }}
              >
                ▾
              </Typography>
            </Box>

            {/* Expanded detail */}
            {isOpen && (
              <Box sx={{ px: 1.5, pb: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                {/* Output preview */}
                {output && (
                  <Paper
                    sx={{
                      p: 1.5,
                      mt: 1,
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.text.primary, 0.02),
                      maxHeight: 200,
                      overflow: 'auto',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        display: 'block',
                        mb: 0.5,
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        fontSize: '0.55rem',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Output
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.72rem',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                        fontFamily: 'inherit',
                      }}
                    >
                      {output.slice(0, 2000)}
                      {output.length > 2000 ? '...' : ''}
                    </Typography>
                  </Paper>
                )}

                {/* Meta info row */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                  {cost != null && (
                    <Chip
                      label={`Cost: $${Number(cost).toFixed(4)}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.55rem', height: 18 }}
                    />
                  )}
                  {model && (
                    <Chip
                      label={model}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.55rem', height: 18 }}
                    />
                  )}
                  {duration && (
                    <Chip
                      label={`${Math.round(duration / 1000)}s`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.55rem', height: 18 }}
                    />
                  )}
                  {phaseIdx != null && (
                    <Chip
                      label={`Phase ${phaseIdx + 1}`}
                      size="small"
                      variant="outlined"
                      color="info"
                      sx={{ fontSize: '0.55rem', height: 18 }}
                    />
                  )}
                </Box>

                {/* Tools used */}
                {toolLog.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: 'text.secondary',
                        fontSize: '0.55rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      Tools Used
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                      {toolLog.map((tl, i) => (
                        <Chip
                          key={i}
                          label={tl.tool || tl.name || `Tool ${i + 1}`}
                          size="small"
                          variant="outlined"
                          color="warning"
                          sx={{ fontSize: '0.5rem', height: 16 }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Navigation links */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                  {goalId && (
                    <Chip
                      label="Open Goal"
                      size="small"
                      clickable
                      variant="outlined"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/goals/${goalId}`;
                      }}
                      sx={{ fontSize: '0.55rem', height: 20 }}
                    />
                  )}
                  {goal?.workflow_id && (
                    <Chip
                      label="Workflow"
                      size="small"
                      clickable
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/workflow?id=${goal.workflow_id}`;
                      }}
                      sx={{ fontSize: '0.55rem', height: 20 }}
                    />
                  )}
                  {goal?.project_id && (
                    <Chip
                      label="Project"
                      size="small"
                      clickable
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/projects?id=${goal.project_id}`;
                      }}
                      sx={{ fontSize: '0.55rem', height: 20 }}
                    />
                  )}
                  <Chip
                    label="Knowledge Base"
                    size="small"
                    clickable
                    variant="outlined"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = '/knowledge-base';
                    }}
                    sx={{ fontSize: '0.55rem', height: 20 }}
                  />
                </Box>
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}

// ── Agent Detail Popup with Tabs ────────────────────────────────
export function AgentDetailPopup({
  agentDetail,
  agentData,
  agentLoading,
  theme,
  goal,
  onClose,
  profile = null,
  identity = null,
}) {
  const [tab, setTab] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [blueprintData, setBlueprintData] = useState(null);
  const [resumeData, setResumeData] = useState(null);

  const a = agentData || {};
  const name = identity?.name || a.name || agentDetail?.name || 'Agent';
  const agentId = a.agent_id || a.id || agentDetail?.id || agentDetail?.agent_id || '';
  const status = a.availability_status || 'active';
  const category =
    a.category || agentDetail?.category || agentDetail?.metadata?.required_role || '—';
  const position = identity?.position || (category !== '—' ? category : '');
  const connectionType = a.connection_type || null;
  const capabilities =
    agentDetail?.metadata?.capabilities || a.capabilities || a.metadata?.capabilities || [];

  // Use goal.agentBudget for real metrics (primary), fallback to DB metadata
  const budget = goal?.agentBudget?.find((b) => b.name === name) || {};
  const tasks = budget.tasks || a.metadata?.task_count || 0;
  const completed = budget.completed || a.metadata?.completed_count || 0;
  const failed = budget.failed || 0;
  const successRate = tasks > 0 ? Math.round((completed / tasks) * 100) : null;
  const spent = budget.spent || 0;
  const costPerTask = tasks > 0 ? spent / tasks : 0;
  const avgQuality = budget.avgQuality || null;
  const createdAt = a.created_at || agentDetail?.created_at;
  const addedBy = a.added_by || 'predefined';

  // Goal tasks for this agent
  const goalTasks = (goal?.tasks || []).filter(
    (t) => t.assigned_to === name || t.agent_id === agentId
  );
  const goalExecutionPersonas = getAgentExecutionPersonas(goalTasks, goal ? [goal] : [], [agentId]);
  const executionProviders = [
    ...new Set(goalTasks.map((task) => task.data?.llmProvider).filter(Boolean)),
  ];
  const executionModels = [
    ...new Set(goalTasks.map((task) => task.data?.llmModel).filter(Boolean)),
  ];

  // Load blueprint when Workflow Schema tab opened
  useEffect(() => {
    if (tab === 1 && agentId && !blueprintData) {
      supabase
        .from('agent_blueprints')
        .select('*')
        .eq('agent_id', agentId)
        .maybeSingle()
        .then(({ data }) => setBlueprintData(data || {}))
        .catch(() => setBlueprintData({}));
    }
  }, [tab, agentId, blueprintData]);

  // Load history — combine goal tasks + DB tasks
  useEffect(() => {
    if (tab === 2 && history.length === 0) {
      if (goalTasks.length > 0) {
        setHistory(goalTasks);
      } else if (agentId || name) {
        setHistoryLoading(true);
        supabase
          .from('team_tasks')
          .select('id, title, status, data, created_at')
          .or(`assigned_to.ilike.%${name}%`)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data: t }) => {
            setHistory(t || []);
            setHistoryLoading(false);
          })
          .catch(() => setHistoryLoading(false));
      }
    }
  }, [tab, agentId, name, history.length, goalTasks]);

  // Load resume
  useEffect(() => {
    if (tab === 3 && agentId && !resumeData) {
      supabase
        .from('agent_resume')
        .select('*')
        .eq('agent_id', agentId)
        .maybeSingle()
        .then(({ data }) => setResumeData(data || {}))
        .catch(() => setResumeData({}));
    }
  }, [tab, agentId, resumeData]);

  if (!agentDetail) return null;

  return (
    <FormDialog
      open={!!agentDetail}
      onClose={onClose}
      title={name.toUpperCase()}
      subtitle={agentId ? `AGENT-${String(agentId).slice(-8).toUpperCase()}` : undefined}
      icon={SmartToyOutlinedIcon}
      maxWidth="md"
      titleAdornment={
        <Chip
          size="small"
          label={status.toUpperCase()}
          color={status === 'active' ? 'success' : 'default'}
          variant="outlined"
          sx={{ fontSize: '0.6rem', height: 22, fontWeight: 700 }}
        />
      }
      contentDividers={false}
      contentSx={{ p: 0, maxHeight: 520, overflowY: 'auto' }}
      footerJustify="space-between"
      actions={
        <>
          <Button
            size="small"
            variant="outlined"
            onClick={() => (window.location.href = `/agent-hub?agent=${agentId}`)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: 2 }}
          >
            Open in Agent Hub
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onClose}
            sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: 2 }}
          >
            Close
          </Button>
        </>
      }
    >
      {/* Tabs */}
      <Box sx={{ px: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 0 }}>
          {['Overview', 'Workflow Schema', 'History', 'Resume'].map((label, i) => (
            <Button
              key={label}
              onClick={() => setTab(i)}
              sx={{
                textTransform: 'none',
                fontWeight: tab === i ? 700 : 500,
                fontSize: '0.78rem',
                color: tab === i ? 'primary.main' : 'text.secondary',
                borderBottom: '2px solid',
                borderColor: tab === i ? 'primary.main' : 'transparent',
                borderRadius: 0,
                px: 1.5,
                py: 1,
                minWidth: 'auto',
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
      </Box>

      {agentLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <>
          {/* Tab 0: Overview */}
          {tab === 0 && (
            <Box sx={{ px: 2.5, py: 2 }}>
              {/* Identity header - real name + position + avatar */}
              {(profile || position) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  {profile ? <AgentAvatar profile={profile} size="small" /> : null}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{ fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2 }}
                      noWrap
                    >
                      {name}
                    </Typography>
                    {position && (
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 600 }}
                      >
                        {position}
                      </Typography>
                    )}
                    {profile?.bio && (
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', color: 'text.disabled', mt: 0.5 }}
                      >
                        {profile.bio}
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
              {goalExecutionPersonas.map((item) => {
                const executor = item.executionPersona || {};
                const customer = item.customerPersona || {};
                const customerProfile = customer.profile || customer.persona || {};
                const boundaries = personaList(executor.boundaries || executor.limitations).filter(
                  (value) =>
                    !/\b(gemini|openai|anthropic|claude|openrouter|model routing|budget capped|no[- ]tools)\b/i.test(
                      value
                    )
                );
                return (
                  <Paper
                    key={item.overlayKey}
                    variant="outlined"
                    sx={{ p: 1.5, mb: 2, borderColor: alpha(theme.palette.primary.main, 0.35) }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          {readablePersonaValue(executor.role || item.executionRole)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {readablePersonaValue(item.goalTitle)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          color={item.authoritative ? 'success' : 'warning'}
                          variant="outlined"
                          label={
                            item.authoritative ? 'AxWise assigned · approved' : 'Review required'
                          }
                        />
                        {personaConfidencePercent(customer.confidence) != null && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${personaConfidencePercent(customer.confidence)}% context clarity`}
                          />
                        )}
                      </Box>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Customer:{' '}
                      {readablePersonaValue(customer.name) || 'Research-selected customer persona'}
                    </Typography>
                    {(customer.decision_role || customer.selection_eligibility) && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        Customer role:{' '}
                        {readablePersonaValue(customer.decision_role || 'not classified')}
                        {customer.selection_eligibility
                          ? ` · ${readablePersonaValue(customer.selection_eligibility)}`
                          : ''}
                      </Typography>
                    )}
                    {(customerProfile.problem || customer.problem) && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Problem scope:{' '}
                        {readablePersonaValue(customerProfile.problem || customer.problem)}
                      </Typography>
                    )}
                    {(customerProfile.desired_outcome || customer.desired_outcome) && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Desired outcome:{' '}
                        {readablePersonaValue(
                          customerProfile.desired_outcome || customer.desired_outcome
                        )}
                      </Typography>
                    )}
                    {executor.mission && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Mission: {readablePersonaValue(executor.mission)}
                      </Typography>
                    )}
                    {executor.relevant_experience && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Experience: {readablePersonaValue(executor.relevant_experience)}
                      </Typography>
                    )}
                    {personaList(executor.domain_knowledge).length > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Domain knowledge: {personaList(executor.domain_knowledge).join('; ')}
                      </Typography>
                    )}
                    {readablePersonaValue(
                      customerProfile.demographic_details || customerProfile.demographics
                    ) && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Customer context:{' '}
                        {readablePersonaValue(
                          customerProfile.demographic_details || customerProfile.demographics
                        )}
                      </Typography>
                    )}
                    {personaList(
                      customerProfile.pain_points || customerProfile.pains || customer.pain_points
                    ).length > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Customer pains:{' '}
                        {personaList(
                          customerProfile.pain_points ||
                            customerProfile.pains ||
                            customer.pain_points
                        ).join('; ')}
                      </Typography>
                    )}
                    {personaList(executor.capabilities).length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                        {personaList(executor.capabilities)
                          .slice(0, 8)
                          .map((capability) => (
                            <Chip
                              key={capability}
                              size="small"
                              variant="outlined"
                              label={capability}
                            />
                          ))}
                      </Box>
                    )}
                    {personaList(executor.methods).length > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        Methods: {personaList(executor.methods).slice(0, 5).join('; ')}
                      </Typography>
                    )}
                    {personaList(executor.operating_principles).length > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        Operating principles:{' '}
                        {personaList(executor.operating_principles).slice(0, 5).join('; ')}
                      </Typography>
                    )}
                    {personaList(
                      executor.output_contract?.expected_outputs || executor.scope?.success_criteria
                    ).length > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        Success:{' '}
                        {personaList(
                          executor.output_contract?.expected_outputs ||
                            executor.scope?.success_criteria
                        ).join('; ')}
                      </Typography>
                    )}
                    {boundaries.length > 0 && (
                      <Typography
                        variant="caption"
                        color="warning.main"
                        sx={{ mt: 0.75, display: 'block' }}
                      >
                        Boundaries: {boundaries.slice(0, 5).join('; ')}
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ mt: 0.75, display: 'block' }}
                    >
                      Goal-scoped execution context · permanent Agent Hub identity unchanged
                    </Typography>
                  </Paper>
                );
              })}
              {/* Metrics from goal.agentBudget */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
                  gap: 1,
                  mb: 2,
                }}
              >
                {[
                  { label: 'Tasks', value: tasks, color: theme.palette.primary.main },
                  { label: 'Completed', value: completed, color: theme.palette.success.main },
                  {
                    label: 'Success Rate',
                    value: successRate == null ? '—' : `${successRate}%`,
                    color:
                      successRate == null
                        ? theme.palette.text.disabled
                        : successRate >= 70
                          ? theme.palette.success.main
                          : theme.palette.error.main,
                  },
                  {
                    label: 'Cost',
                    value: `$${Number(spent).toFixed(4)}`,
                    color: theme.palette.info.main,
                  },
                ].map((m) => (
                  <Paper
                    key={m.label}
                    elevation={0}
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: alpha(m.color, 0.2),
                      textAlign: 'center',
                    }}
                  >
                    <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: m.color }}>
                      {m.value}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.disabled',
                        fontSize: '0.6rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      {m.label}
                    </Typography>
                  </Paper>
                ))}
              </Box>
              {/* Details */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                <Box>
                  <Typography
                    variant="overline"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.6rem',
                      color: 'text.disabled',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Agent Details
                  </Typography>
                  {[
                    ['Category', category],
                    ['Configured Connection', connectionType ? connectionType.toUpperCase() : '—'],
                    ['Connection ID', agentId ? agentId.slice(0, 12) : '—'],
                    ['Created', createdAt ? new Date(createdAt).toLocaleString() : '—'],
                    ['Last Active', a.updated_at ? new Date(a.updated_at).toLocaleString() : '—'],
                    ['Added By', addedBy],
                  ].map(([l, v]) => (
                    <Box key={l} sx={{ mt: 1 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.6rem', display: 'block' }}
                      >
                        {l}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {v}
                      </Typography>
                    </Box>
                  ))}
                  {(executionProviders.length > 0 || executionModels.length > 0) && (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.6rem', display: 'block', fontWeight: 700 }}
                      >
                        Runtime configuration — not part of persona
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {executionProviders.join(', ') || 'Provider not reported'}
                        {executionModels.length > 0 ? ` · ${executionModels.join(', ')}` : ''}
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Box>
                  <Typography
                    variant="overline"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.6rem',
                      color: 'text.disabled',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Capabilities & Projects
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: '0.6rem', display: 'block', mt: 1 }}
                  >
                    Tools / Capabilities
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                    {personaList(capabilities).length > 0 ? (
                      personaList(capabilities).map((c, i) => (
                        <Chip
                          key={i}
                          label={c}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 24 }}
                        />
                      ))
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        None
                      </Typography>
                    )}
                  </Box>
                  {avgQuality != null && (
                    <>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.6rem', display: 'block', mt: 1.5 }}
                      >
                        Avg Structure Score
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color:
                            avgQuality >= 70
                              ? 'success.main'
                              : avgQuality >= 40
                                ? 'warning.main'
                                : 'error.main',
                        }}
                      >
                        {Math.round(avgQuality)}/100
                      </Typography>
                    </>
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: '0.6rem', display: 'block', mt: 1.5 }}
                  >
                    Projects Assigned
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {goalTasks.length > 0 ? goal?.title || 'Current goal' : 'None'}
                  </Typography>
                </Box>
              </Box>
              {/* Ratings */}
              <Divider sx={{ my: 2 }} />
              <Typography
                variant="overline"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.6rem',
                  color: 'text.disabled',
                  letterSpacing: '0.1em',
                }}
              >
                Ratings & Reviews
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Rating value={a.rating_avg || 0} precision={0.5} readOnly size="small" />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {a.rating_avg ? `${a.rating_avg}/5` : 'No ratings yet'}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Tab 1: Workflow Schema */}
          {tab === 1 &&
            (() => {
              const bp = blueprintData || {};
              const sysPrompt =
                bp.system_prompt ||
                bp.systemPrompt ||
                a.system_prompt ||
                a.metadata?.system_prompt ||
                null;
              const bpTools = bp.tools || bp.permitted_tools || a.tools || a.metadata?.tools || [];
              const bpSkills = bp.skills || a.metadata?.skills || [];
              const bpConstraints = bp.constraints || a.metadata?.constraints || [];
              const hasContent =
                sysPrompt || bpTools.length > 0 || bpSkills.length > 0 || bpConstraints.length > 0;
              return (
                <Box sx={{ px: 2.5, py: 2 }}>
                  {!blueprintData && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress size={24} />
                    </Box>
                  )}
                  {blueprintData && !hasContent && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <Typography color="text.disabled">
                        No workflow schema configured for this agent.
                      </Typography>
                    </Box>
                  )}
                  {sysPrompt && (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        System Prompt
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                          bgcolor: alpha(theme.palette.text.primary, 0.03),
                          p: 1.5,
                          borderRadius: 1,
                          maxHeight: 200,
                          overflow: 'auto',
                        }}
                      >
                        {sysPrompt}
                      </Typography>
                    </Paper>
                  )}
                  {bpTools.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        Permitted Tools ({bpTools.length})
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {bpTools.map((t, i) => (
                          <Chip
                            key={i}
                            label={typeof t === 'string' ? t : t.name || t.id}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem' }}
                          />
                        ))}
                      </Box>
                    </Paper>
                  )}
                  {bpSkills.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        Skills ({bpSkills.length})
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {bpSkills.map((s, i) => (
                          <Chip
                            key={i}
                            label={typeof s === 'string' ? s : s.name || s.slug}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem' }}
                          />
                        ))}
                      </Box>
                    </Paper>
                  )}
                  {bpConstraints.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        Salary Section
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {bpConstraints.map((c, i) => (
                          <Chip
                            key={i}
                            label={typeof c === 'string' ? c : c.name}
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ fontSize: '0.65rem' }}
                          />
                        ))}
                      </Box>
                    </Paper>
                  )}
                </Box>
              );
            })()}

          {/* Tab 2: History — expandable task details */}
          {tab === 2 && (
            <AgentHistoryTab
              history={history}
              historyLoading={historyLoading}
              theme={theme}
              goal={goal}
            />
          )}

          {/* Tab 3: Resume */}
          {tab === 3 &&
            (() => {
              const r = resumeData || a.resume || a.metadata?.resume;
              const content = r
                ? typeof r === 'object' && r.content
                  ? r.content
                  : typeof r === 'string'
                    ? r
                    : JSON.stringify(r, null, 2)
                : null;
              return (
                <Box sx={{ px: 2.5, py: 2 }}>
                  {!resumeData && !r && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress size={24} />
                    </Box>
                  )}
                  {(resumeData || r) && content ? (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}
                      >
                        {content}
                      </Typography>
                    </Paper>
                  ) : resumeData && !content ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <Typography color="text.disabled">
                        No resume available for this agent.
                      </Typography>
                    </Box>
                  ) : null}
                </Box>
              );
            })()}
        </>
      )}
    </FormDialog>
  );
}

export default function GoalLiveCards({
  goal,
  logs = [],
  compact = false,
  onSetupTools,
  profileIndex = null,
  selfHostAgentDetail = true,
  researchBundleLoader = loadGoalResearchBundle,
  onRetryResearch,
  researchRetrying = false,
  researchRetryError = '',
}) {
  const theme = useTheme();
  const [docDialog, setDocDialog] = useState(null);
  const [agentDetail, setAgentDetail] = useState(null); // agent member object
  const [agentData, setAgentData] = useState(null); // full agent from DB
  const [agentLoading, setAgentLoading] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);

  // PM Task detail dialog state
  const [pmTask, setPmTask] = useState(null);

  // Register global callback for PM task clicks
  useEffect(() => {
    window.__openPmTask = (job) => setPmTask(job);
    return () => {
      delete window.__openPmTask;
    };
  }, []);

  // Register global callback for team card agent clicks. Skipped when a parent
  // (the goal dialog) hosts the popup so it stays reachable across tabs.
  useEffect(() => {
    if (!selfHostAgentDetail) return undefined;
    window.__openAgentDetail = (member) => {
      const identity = resolveAgentIdentity(member, profileIndex);
      setAgentDetail({ ...member, _identity: identity });
      setAgentData(null);
      setAgentLoading(true);
      const agentId = member.id || member.agent_id;
      if (agentId) {
        supabase
          .from('concilium_agents')
          .select('*')
          .eq('id', agentId)
          .maybeSingle()
          .then(({ data }) => {
            setAgentData(data);
            setAgentLoading(false);
          })
          .catch(() => setAgentLoading(false));
      } else {
        // Search by name
        supabase
          .from('concilium_agents')
          .select('*')
          .ilike('name', member.name)
          .maybeSingle()
          .then(({ data }) => {
            setAgentData(data);
            setAgentLoading(false);
          })
          .catch(() => setAgentLoading(false));
      }
    };
    return () => {
      delete window.__openAgentDetail;
    };
  }, [selfHostAgentDetail, profileIndex]);

  if (!goal) return null;

  const handleAction = (action) => {
    if (action === 'setup-tools' && onSetupTools) onSetupTools(goal);
    if (action === 'retry-research' && onRetryResearch) onRetryResearch(goal);
  };

  const handleLinkClick = (link) => {
    if (link.type === 'doc') {
      const doc = formatDoc(link.docKey, goal, logs);
      setDocDialog(doc);
    } else if (link.type === 'page') {
      window.location.href = link.href;
    } else if (link.type === 'research') {
      setResearchOpen(true);
    }
  };

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: compact
            ? { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }
            : { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
          gridAutoRows: '1fr',
          gap: compact ? 0.75 : 1.25,
        }}
      >
        {STAGES.map((stage) => {
          let state = getCardState(stage.idx, goal.status, goal);
          const content = getCardContent(stage.key, goal, logs, profileIndex);
          return (
            <StageCard
              key={stage.key}
              stage={stage}
              state={state}
              content={content}
              compact={compact}
              theme={theme}
              goal={goal}
              onAction={handleAction}
              onLinkClick={handleLinkClick}
              researchRetrying={researchRetrying}
              researchRetryError={researchRetryError}
            />
          );
        })}
      </Box>
      <GoalResearchDetailsDialog
        open={researchOpen}
        onClose={() => setResearchOpen(false)}
        goal={goal}
        loadBundle={researchBundleLoader}
      />
      {/* Agent detail dialog with tabs (only when self-hosting; the goal dialog
          hosts its own so the card opens from every tab). */}
      {selfHostAgentDetail && (
        <AgentDetailPopup
          agentDetail={agentDetail}
          agentData={agentData}
          agentLoading={agentLoading}
          theme={theme}
          goal={goal}
          profile={agentDetail?._identity?.profile}
          identity={agentDetail?._identity}
          onClose={() => {
            setAgentDetail(null);
            setAgentData(null);
          }}
        />
      )}
      {/* Document viewer dialog */}
      <FormDialog
        open={!!docDialog}
        onClose={() => setDocDialog(null)}
        title={docDialog?.title || 'Document'}
        icon={docDialog?.richContent ? AssessmentOutlinedIcon : DescriptionIcon}
        maxWidth={docDialog?.richContent ? 'lg' : 'md'}
        paperSx={{ maxHeight: '90vh' }}
        contentSx={{ p: docDialog?.richContent ? 2 : 3, overflowY: 'auto' }}
        titleAdornment={
          <Tooltip title="Copy plain text to clipboard">
            <IconButton
              size="small"
              onClick={() => {
                navigator.clipboard.writeText(docDialog?.content || '');
              }}
            >
              <AppIcon name="ContentCopy" fallback={ContentCopyIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        }
        primaryLabel="Close"
        onPrimary={() => setDocDialog(null)}
        hideCancel
      >
        {docDialog?.richContent ? (
          docDialog.richContent(theme)
        ) : (
          <Typography
            variant="body2"
            component="div"
            sx={{
              fontSize: '0.82rem',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
              fontFamily: 'inherit',
              '& strong, & b': { fontWeight: 700 },
            }}
          >
            {docDialog?.content}
          </Typography>
        )}
      </FormDialog>
      {/* PM Task detail dialog */}
      {pmTask && (
        <FormDialog
          open
          onClose={() => setPmTask(null)}
          title={pmTask.title}
          icon={DescriptionIcon}
          maxWidth="sm"
          contentDividers={false}
          contentSx={{ pt: 0 }}
          footerJustify="space-between"
          actions={
            <>
              <Button
                size="small"
                variant="contained"
                color="info"
                startIcon={
                  <AppIcon name="Description" fallback={DescriptionIcon} sx={{ fontSize: 14 }} />
                }
                onClick={() => {
                  setPmTask(null);
                  window.location.href = '/task-manager?scope=agents';
                }}
                sx={{ fontSize: '0.72rem', textTransform: 'none' }}
              >
                View in Task Manager
              </Button>
              <Button
                size="small"
                onClick={() => setPmTask(null)}
                variant="outlined"
                sx={{ fontSize: '0.72rem', textTransform: 'none' }}
              >
                Close
              </Button>
            </>
          }
        >
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Chip
              label="planned"
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.62rem', fontWeight: 700 }}
            />
            <Chip
              label="AI Agents"
              size="small"
              variant="outlined"
              color="info"
              sx={{ fontSize: '0.62rem' }}
            />
            {pmTask.required_role && (
              <Chip
                label={pmTask.required_role}
                size="small"
                variant="outlined"
                color="primary"
                sx={{ fontSize: '0.62rem' }}
              />
            )}
            {pmTask.estimate_hours && (
              <Chip
                label={`~${pmTask.estimate_hours}h`}
                size="small"
                variant="outlined"
                icon={
                  <AppIcon
                    name="TimerOutlined"
                    fallback={TimerOutlinedIcon}
                    sx={{ fontSize: '12px !important' }}
                  />
                }
                sx={{ fontSize: '0.62rem' }}
              />
            )}
          </Box>

          {/* Phase context */}
          <Paper
            elevation={0}
            sx={{
              p: 1,
              mb: 2,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.info.main, 0.04),
              border: '1px solid',
              borderColor: alpha(theme.palette.info.main, 0.15),
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.54rem', color: 'text.disabled', display: 'block' }}
                >
                  Goal
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700 }}>
                  {goal.title}
                </Typography>
              </Box>
              {pmTask._phase && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.54rem', color: 'text.disabled', display: 'block' }}
                  >
                    Phase
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                    {pmTask._phaseIndex != null ? `${pmTask._phaseIndex + 1}. ` : ''}
                    {pmTask._phase}
                  </Typography>
                </Box>
              )}
              {pmTask.category && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.54rem', color: 'text.disabled', display: 'block' }}
                  >
                    Category
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                    {pmTask.category}
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>

          {pmTask.description && (
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.5,
                }}
              >
                Description
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  bgcolor: alpha(theme.palette.background.default, 0.6),
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.68rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                >
                  {pmTask.description}
                </Typography>
              </Paper>
            </Box>
          )}

          {pmTask.tool_requirements?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.5,
                }}
              >
                Tool Requirements
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {pmTask.tool_requirements.map((tool, i) => (
                  <Chip
                    key={i}
                    label={tool}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.6rem', height: 20 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {pmTask.acceptance_criteria?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.5,
                }}
              >
                Acceptance Criteria
              </Typography>
              <Box sx={{ pl: 1 }}>
                {pmTask.acceptance_criteria.map((c, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 0.5, mb: 0.25 }}>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.disabled', fontSize: '0.62rem' }}
                    >
                      •
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.68rem', color: 'text.secondary' }}
                    >
                      {c}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {pmTask.requirements && (
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.5,
                }}
              >
                Requirements
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.68rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}
              >
                {pmTask.requirements}
              </Typography>
            </Box>
          )}
        </FormDialog>
      )}
    </>
  );
}
