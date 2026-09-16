import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  Button,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Paper,
  Rating,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  Snackbar,
  TextField,
  useTheme,
  useMediaQuery,
  alpha,
  Divider,
  Tabs,
  Tab,
  Collapse,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import GlassIcon from '../icons/GlassIcon';

import {
  getGoal,
  pauseGoal,
  resumeGoal,
  cancelGoal,
  getGoalMessages,
  healGoal,
  submitGoalPoAnswers,
  toggleAutopilot,
  toggleLoop,
} from '../../services/goalService';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { submitRating } from '../../services/agentRatingService';
import GoalLiveCards from './GoalLiveCards';
import GoalDeliverables from './GoalDeliverables';
import GoalNowExecuting from './GoalNowExecuting';
import ProjectOverviewSection from './ProjectOverviewSection';
import { goalResultSummary } from './_goalFormat';
import FinalResultsSection from './FinalResultsSection';
import { DeliverableViewerProvider } from './deliverables/DeliverableViewer';
import GoalActionsMenu from './GoalActionsMenu';
import HealingTimeline from './HealingTimeline';
import VersionPicker from '../Deliverables/VersionPicker';
import AgentNowWorking from './AgentNowWorking';
import LiveTokenBurn from './LiveTokenBurn';
import TokenByPhaseChart from './TokenByPhaseChart';
import BudgetTab from './BudgetTab';
import { formatTokenSpend, formatTokens } from '../../utils/formatTokens';
import { enrichGoalReportData } from '../../utils/enrichGoalReport';
import ReportMetricCell from './ReportMetricCell';
import { getMetricInfo } from '../../utils/reportMetricMeta';
import TheoryModePanel from './TheoryModePanel';
import RoadmapCard from './RoadmapCard';
import GoalChatFeed from './GoalChatFeed';
import GoalWorkLog from './GoalWorkLog';
import { currentGoalTaskAttempt } from './currentGoalTaskAttempt';
import GoalContextApprovalDialog from './GoalContextApprovalDialog';
import GoalProposalDialog from './GoalProposalDialog';
import GoalAgentDetailHost from './GoalAgentDetailHost';
import { listProfiles } from '../../services/agentProfileService';
import { PREDEFINED_AGENT_PROFILES } from '../../config/predefinedAgentProfiles';
import { buildProfileIndex, resolveAgentIdentity } from '../../utils/agentIdentity';
import { supabase, hasSupabase } from '../../lib/supabase';
import AdoptBusinessDialog from './AdoptBusinessDialog';
import ResolveNeedsHumanDialog from './ResolveNeedsHumanDialog';
import ImplementDialog from './ImplementDialog';
import AddPulseDialog from './AddPulseDialog';
import FormDialog from '../Common/FormDialog';
import GoalLeadChatDialog from './GoalLeadChatDialog';
import GoalRunControls from '../JobPool/NewGoal/GoalRunControls';
import GoalRunActions from '../JobPool/NewGoal/GoalRunActions';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BuildIcon from '@mui/icons-material/Build';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import GroupsIcon from '@mui/icons-material/Groups';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { getAllWorkflows } from '../../services/workflowService';
import { clearAxwiseGoalScope, setAxwiseGoalScope } from '../../hooks/useAxwiseGoalScope';
import AxwiseScopeConfirmationPanel, {
  isAxwiseScopeClarification,
} from './AxwiseScopeConfirmationPanel';

import AppIcon from '../icons/AppIcon';

export function projectGoalDetailTasks(goal, tasks) {
  return currentGoalTaskAttempt(goal, tasks);
}

function timeAgo(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_COLOR = {
  feasibility: 'info',
  analyzing: 'info',
  researching_customer: 'info',
  awaiting_context_approval: 'warning',
  planning: 'info',
  forming_team: 'info',
  provisioning_tools: 'info',
  estimating: 'info',
  awaiting_approval: 'warning',
  authorizing_execution: 'info',
  pending_validation: 'info',
  awaiting_po_input: 'info',
  active: 'success',
  paused: 'warning',
  awaiting_tools: 'warning',
  completed: 'success',
  failed: 'error',
  needs_human: 'warning',
  cancelled: 'default',
};

const API_KEY_RETRY_STAGES = new Set([
  'feasibility-analysis',
  'po-analysis',
  'pm-planning',
  'team-formation',
  'tool-provisioning',
  'execute-phase',
  'evaluate-phase',
  'iterate',
]);

const PIPELINE_STAGES = [
  { key: 'feasibility', label: 'Analysis', icon: '🔎', eta: 8 },
  { key: 'analyzing', label: 'Problem Brief', icon: '📋', eta: 8 },
  { key: 'researching_customer', label: 'Scope Admission', icon: '🧭', eta: 20 },
  { key: 'planning', label: 'Operational Planning', icon: '🗺️', eta: 12 },
  { key: 'forming_team', label: 'Team Formation', icon: '👥', eta: 8 },
  { key: 'provisioning_tools', label: 'Tool Setup', icon: '🔧', eta: 5 },
  { key: 'estimating', label: 'Estimates', icon: '📊', eta: 8 },
  { key: 'active', label: 'Executing', icon: '⚡', eta: 20 },
  { key: 'pending_validation', label: 'Quality Check', icon: '✓', eta: 15 },
];

/**
 * Map goal status to 3-step index:
 * 0 = Pipeline (feasibility → approval)
 * 1 = Work Log (active/executing)
 * 2 = Report (completed/failed)
 */
function get3StepIndex(goal) {
  const s = goal?.status;
  if (!s) return 0;
  if (['pending_validation', 'completed', 'failed', 'cancelled'].includes(s)) return 2;
  if (s === 'active' || s === 'executing' || s === 'paused') return 1;
  return 0; // pipeline stages: feasibility, analyzing, planning, etc.
}

function getPipelineStep(status) {
  if (status === 'authorizing_execution') {
    return PIPELINE_STAGES.findIndex((stage) => stage.key === 'active');
  }
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === status);
  if (status === 'completed') return PIPELINE_STAGES.length;
  if (status === 'failed' || status === 'cancelled') return -1;
  return idx >= 0 ? idx : 0;
}

function getPipelineEta(goal) {
  const status = goal?.status;
  if (
    !status ||
    [
      'completed',
      'failed',
      'cancelled',
      'paused',
      'awaiting_tools',
      'awaiting_context_approval',
      'awaiting_approval',
      'authorizing_execution',
      'pending_validation',
    ].includes(status)
  )
    return null;
  const currentIdx = PIPELINE_STAGES.findIndex((s) => s.key === status);
  if (currentIdx < 0) return null;
  const phases = goal.plan?.phases || [];
  const completedPhases = phases.filter((p) => p.status === 'completed').length;
  const remainingPhases = phases.length - completedPhases;
  let totalSec = 0;
  for (let i = currentIdx; i < PIPELINE_STAGES.length; i++) {
    totalSec += PIPELINE_STAGES[i].eta || 0;
  }
  if (status === 'active' || currentIdx >= 0) totalSec += remainingPhases * 25;
  if (totalSec <= 0) return null;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `~${min}m ${sec}s` : `~${sec}s`;
}

// ── Descriptive labels and summaries per event type ───────────
const EVENT_CONFIG = {
  goal_created: { label: 'Goal Created', icon: '+', color: 'info' },
  po_validated: { label: 'PO Validated', icon: 'V', color: 'success' },
  plan_created: { label: 'Plan Completed', icon: 'P', color: 'success' },
  phase_started: { label: 'Phase Started', icon: '>', color: 'info' },
  phase_evaluated: { label: 'Phase Evaluated', icon: 'E', color: 'warning' },
  iteration_started: { label: 'Re-planning', icon: 'R', color: 'warning' },
  goal_completed: { label: 'Goal Completed', icon: 'D', color: 'success' },
  goal_failed: { label: 'Goal Failed', icon: 'X', color: 'error' },
  goal_paused: { label: 'Goal Paused', icon: '||', color: 'warning' },
  goal_active: { label: 'Goal Resumed', icon: '>', color: 'success' },
  goal_cancelled: { label: 'Goal Cancelled', icon: 'X', color: 'default' },
  budget_warning: { label: 'Budget Warning', icon: '$', color: 'warning' },
  budget_exhausted: { label: 'Budget Exhausted', icon: '$', color: 'error' },
  budget_updated: { label: 'Budget Updated', icon: '$', color: 'info' },
  feasibility_done: { label: 'Feasibility Complete', icon: 'F', color: 'success' },
  awaiting_approval: { label: 'Awaiting Approval', icon: '?', color: 'warning' },
  authorizing_execution: { label: 'Authorizing Execution', icon: 'A', color: 'info' },
  awaiting_context_approval: {
    label: 'Awaiting Context Confirmation',
    icon: '?',
    color: 'warning',
  },
  team_approved: { label: 'Team Approved', icon: 'T', color: 'success' },
  tools_provisioned: { label: 'Tools Ready', icon: 'W', color: 'success' },
  awaiting_tools: { label: 'Awaiting Tools', icon: 'W', color: 'warning' },
  proposal_ready: { label: 'Proposal Ready', icon: 'P', color: 'info' },
  revision_requested: { label: 'Revision Requested', icon: 'R', color: 'warning' },
};

function getEventDescription(entry) {
  const d = entry.details || {};
  switch (entry.event_type) {
    case 'goal_created':
      return `Created with $${Number(d.budget_usd || 0).toFixed(2)} budget`;
    case 'po_validated':
      return d.approved
        ? `Approved (risk: ${d.risk_level || 'low'})`
        : `Rejected: ${d.feedback || 'failed validation'}`;
    case 'plan_created':
      return (
        [
          d.phaseCount && `${d.phaseCount} phases`,
          d.jobCount && `${d.jobCount} jobs`,
          d.confidenceScore && `${d.confidenceScore}% confidence`,
          d.strategy,
        ]
          .filter(Boolean)
          .join(' · ') || 'Plan generated'
      );
    case 'phase_started':
      return (
        [d.phaseName && `"${d.phaseName}"`, d.jobCount && `${d.jobCount} jobs created`]
          .filter(Boolean)
          .join(' — ') || `Phase ${(d.phaseIndex ?? 0) + 1} started`
      );
    case 'phase_evaluated': {
      const verdict = d.passed ? 'Passed' : 'Failed';
      return [`${verdict} (${d.quality_score ?? '?'}/100)`, d.feedback].filter(Boolean).join(' — ');
    }
    case 'iteration_started':
      return (
        [
          d.iteration && `Iteration ${d.iteration}`,
          d.newStrategy && `New strategy: ${d.newStrategy}`,
          d.feedback && `Reason: ${d.feedback}`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Re-planning with new approach'
      );
    case 'goal_completed':
      return (
        [
          d.totalCost != null && `$${Number(d.totalCost).toFixed(2)} spent`,
          d.phases && `${d.phases} phases`,
          d.iterations && `${d.iterations} iterations`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Goal finished successfully'
      );
    case 'goal_failed':
      return d.reason || 'Goal could not be completed';
    case 'budget_warning':
    case 'budget_exhausted':
      return d.reason || 'Budget limit reached';
    case 'budget_updated':
      return `$${Number(d.old || 0).toFixed(2)} → $${Number(d.new || 0).toFixed(2)}`;
    case 'goal_paused':
    case 'goal_active':
    case 'goal_cancelled':
      return d.previousStatus ? `Was: ${d.previousStatus}` : '';
    default:
      return d.reason || d.feedback || d.strategy || '';
  }
}

// ── Single activity log entry ─────────────────────────────────
function LogEntry({ entry }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const config = EVENT_CONFIG[entry.event_type] || {
    label: entry.event_type.replaceAll('_', ' '),
    icon: '?',
    color: 'default',
  };
  const description = getEventDescription(entry);
  const hasRawDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <Box
      sx={{
        p: 1,
        mb: 0.75,
        borderRadius: 1.5,
        bgcolor: alpha(theme.palette.text.primary, 0.02),
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.5),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Chip
          size="small"
          label={config.label}
          color={config.color}
          variant="outlined"
          sx={{ fontSize: '0.62rem', height: 20, fontWeight: 600, borderRadius: 1 }}
        />
        <Typography
          variant="caption"
          sx={{ flex: 1, color: 'text.secondary', fontSize: '0.7rem' }}
          noWrap
        >
          {description}
        </Typography>
        {entry.cost_usd > 0 && (
          <Chip
            size="small"
            label={`$${Number(entry.cost_usd).toFixed(4)}`}
            sx={{ fontSize: '0.58rem', height: 16 }}
            variant="outlined"
          />
        )}
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', fontSize: '0.62rem', minWidth: 48, textAlign: 'right' }}
        >
          {timeAgo(entry.created_at)}
        </Typography>
        {hasRawDetails && (
          <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ p: 0.25 }}>
            {expanded ? (
              <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 14 }} />
            ) : (
              <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 14 }} />
            )}
          </IconButton>
        )}
      </Box>
      {hasRawDetails && (
        <Collapse in={expanded}>
          <Box
            sx={{
              mt: 0.75,
              p: 0.75,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.text.primary, 0.03),
              fontSize: '0.65rem',
            }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
            >
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

// ── PO Expert Questions Panel ─────────────────────────────────
export function ExpertPoQuestionsPanel({ goal, onAnswered }) {
  const theme = useTheme();
  const questions = useMemo(
    () => (Array.isArray(goal.data?.po_questions) ? goal.data.po_questions : []),
    [goal.data?.po_questions]
  );
  const questionSnapshot = JSON.stringify(questions);
  const questionCount = questions.length;
  const [draft, setDraft] = useState(() => ({
    goalId: goal.id,
    questionSnapshot,
    answers: questions.map(() => ''),
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const draftIsCurrent = draft.goalId === goal.id && draft.questionSnapshot === questionSnapshot;
  // Never render or submit answer text under a question snapshot it was not
  // written for. Goal details poll every five seconds, so a regenerated Expert
  // PO question set can arrive while the user is typing.
  const answers = draftIsCurrent ? draft.answers : questions.map(() => '');

  useEffect(() => {
    setDraft((current) => {
      if (current.goalId === goal.id && current.questionSnapshot === questionSnapshot) {
        return current;
      }
      return {
        goalId: goal.id,
        questionSnapshot,
        answers: Array.from({ length: questionCount }, () => ''),
      };
    });
    setSubmitError('');
  }, [goal.id, questionCount, questionSnapshot]);

  const handleSubmit = useCallback(async () => {
    if (
      !draftIsCurrent ||
      answers.length !== questions.length ||
      answers.some((answer) => !answer.trim())
    ) {
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const poAnswers = questions.map((q, i) => ({ question: q, answer: answers[i].trim() }));
      await submitGoalPoAnswers(goal.id, poAnswers);
      onAnswered?.();
    } catch (e) {
      setSubmitError(e?.message || 'Could not submit the PO answers.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, draftIsCurrent, questions, goal.id, onAnswered]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.warning.main, 0.3),
        bgcolor: alpha(theme.palette.warning.main, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AppIcon
          name="PsychologyOutlined"
          fallback={PsychologyOutlinedIcon}
          sx={{ fontSize: 20, color: 'warning.main' }}
        />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          PO needs your input
        </Typography>
      </Box>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', display: 'block', mb: 2, fontSize: '0.72rem' }}
      >
        The Product Owner has questions before creating the PRD. Your answers will make the project
        plan significantly more accurate.
      </Typography>
      {questions.map((q, i) => (
        <Box key={i} sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.72rem',
              color: 'text.primary',
              display: 'block',
              mb: 0.5,
            }}
          >
            {i + 1}. {q}
          </Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={1}
            maxRows={3}
            placeholder="Your answer..."
            value={answers[i]}
            onChange={(e) =>
              setDraft((current) => {
                const currentAnswers =
                  current.goalId === goal.id && current.questionSnapshot === questionSnapshot
                    ? current.answers
                    : questions.map(() => '');
                const nextAnswers = [...currentAnswers];
                nextAnswers[i] = e.target.value;
                return {
                  goalId: goal.id,
                  questionSnapshot,
                  answers: nextAnswers,
                };
              })
            }
            sx={{ '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
          />
        </Box>
      ))}
      {submitError && (
        <Alert severity="error" sx={{ mb: 1.5, fontSize: '0.75rem' }}>
          {submitError}
        </Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
        <Button
          variant="contained"
          size="small"
          onClick={handleSubmit}
          disabled={
            submitting ||
            !draftIsCurrent ||
            answers.length !== questions.length ||
            answers.some((answer) => !answer.trim())
          }
          sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.78rem', borderRadius: 2 }}
        >
          {submitting ? 'Submitting...' : 'Submit Answers & Generate PRD'}
        </Button>
      </Box>
    </Paper>
  );
}

function PoQuestionsPanel({ goal, onAnswered }) {
  if (isAxwiseScopeClarification(goal)) {
    return <AxwiseScopeConfirmationPanel goal={goal} onAnswered={onAnswered} />;
  }
  return <ExpertPoQuestionsPanel goal={goal} onAnswered={onAnswered} />;
}

// ── Overview tab content (upgraded with live cards + chat) ────
// ── Step 1: Pipeline (Feasibility → Approval) ──────────────────
export function PipelineTab({ goal, theme, onSetupTools, messages, onOpenWorkLog, profileIndex }) {
  const budgetPct = Math.min(
    100,
    (Number(goal.spent_usd) / Math.max(Number(goal.budget_usd), 0.01)) * 100
  );
  const budgetColor = budgetPct > 90 ? 'error' : budgetPct > 70 ? 'warning' : 'primary';
  const isFailed = goal.status === 'failed' || goal.status === 'cancelled';
  const failureReason = goal.data?.failure_reason || goal.failure_reason;
  const failedPhaseIdx = (goal.plan?.phases || []).findIndex((p) => p.status === 'failed');
  const failedPhase = failedPhaseIdx >= 0 ? goal.plan.phases[failedPhaseIdx] : null;
  // Find the last phase_evaluated event with passed=false
  const lastFailedEval = (goal.logs || [])
    .filter((l) => l.event_type === 'phase_evaluated' && l.details?.passed === false)
    .pop();

  return (
    <Box>
      {/* ── Failure banner — shown at top when goal failed ── */}
      {isFailed && (
        <Alert severity="error" sx={{ mb: 2, fontSize: '0.78rem' }}>
          <Box sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 0.5 }}>Goal Failed</Box>
          {failureReason && (
            <Box sx={{ mb: 0.75 }}>
              <strong>Reason:</strong> {failureReason}
            </Box>
          )}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1.5,
              fontSize: '0.72rem',
              mb: lastFailedEval?.details?.feedback ? 0.75 : 0,
            }}
          >
            {failedPhase && (
              <span>
                <strong>Failed at:</strong> Phase {failedPhaseIdx + 1} — {failedPhase.name}
              </span>
            )}
            <span>
              <strong>Iterations:</strong> {goal.iteration}/{goal.max_iterations}
            </span>
            {goal.data?.retry_count > 0 && (
              <span>
                <strong>Retried:</strong> {goal.data.retry_count}×
              </span>
            )}
          </Box>
          {lastFailedEval?.details?.feedback && (
            <Box
              sx={{
                p: 1,
                borderRadius: 1,
                bgcolor: 'rgba(255,255,255,0.06)',
                fontSize: '0.72rem',
                fontStyle: 'italic',
              }}
            >
              <strong>Last error:</strong> {lastFailedEval.details.feedback}
            </Box>
          )}
        </Alert>
      )}

      {/* ── Live "Now Executing" banner — only for in-progress goals ── */}
      {!isFailed && (
        <GoalNowExecuting
          goal={goal}
          messages={messages || []}
          onSetupTools={onSetupTools}
          onOpenWorkLog={onOpenWorkLog}
        />
      )}

      {goal.plan?.strategy && (
        <Alert severity="info" sx={{ mb: 2, fontSize: '0.78rem' }}>
          <strong>Strategy:</strong> {goal.plan.strategy}
        </Alert>
      )}

      {/* Theory Mode preview (compact) */}
      {goal.theory_mode && <TheoryModePanel goalId={goal.id} projectionType="preview" compact />}

      {/* Budget bar */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            Budget: ${Number(goal.spent_usd || 0).toFixed(2)} / $
            {Number(goal.budget_usd).toFixed(2)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Iteration {goal.iteration}/{goal.max_iterations}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={budgetPct}
          color={budgetColor}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>

      {/* Pipeline Live Cards — all 8 stages */}
      <GoalLiveCards
        goal={goal}
        logs={goal.logs || []}
        compact
        onSetupTools={onSetupTools}
        profileIndex={profileIndex}
        selfHostAgentDetail={false}
      />

      {/* Self-healer timeline — only renders when at least one heal event exists */}
      <HealingTimeline goal={goal} />
    </Box>
  );
}

// ── Step 2: Work Log (tasks, knowledge, workflow, project) ──────
export function WorkLogTab({ goal, messages, profileIndex }) {
  const [tasks, setTasks] = useState([]);
  const goalId = goal?.id;
  const decisionId = goal?.data?.axwise_orchestration?.decision_id;
  const executionAuthorization = goal?.data?.execution_authorization;
  const executionApproval = goal?.data?.goal_approvals?.execution;
  useEffect(() => {
    if (!goalId || !hasSupabase()) return;
    (async () => {
      try {
        // Try direct goal_id column first, fall back to JSONB contains
        let { data } = await supabase
          .from('team_tasks')
          .select(
            'id, title, description, status, assigned_to, agent_id, priority, estimate, deadline, category, data, sequence_order, created_at, updated_at'
          )
          .eq('goal_id', goalId)
          .order('sequence_order', { ascending: true });
        if (!data?.length) {
          const res = await supabase
            .from('team_tasks')
            .select(
              'id, title, description, status, assigned_to, agent_id, priority, estimate, deadline, category, data, sequence_order, created_at, updated_at'
            )
            .contains('data', { goal_id: goalId })
            .order('sequence_order', { ascending: true });
          data = res.data;
        }
        setTasks(projectGoalDetailTasks(goal, data));
      } catch (e) {
        /* ignore */
      }
    })();
  }, [goal, goalId, decisionId, executionAuthorization, executionApproval]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {/* Live agent banner — top of tab. Returns null on terminal goals. */}
      <AgentNowWorking goal={goal} tasks={tasks} messages={messages || []} />
      {/* Running tokens/cost meter. */}
      <LiveTokenBurn goal={goal} />
      <GoalWorkLog
        goal={goal}
        tasks={tasks}
        documents={[]}
        messages={messages || []}
        logs={goal.logs || []}
        compact
        profileIndex={profileIndex}
      />
    </Box>
  );
}

// ── Step 3: Report (consolidated final report + agent cards + ratings) ──
// ── ResultTab — final, polished outcome view ─────────────────────────────────
// Shows: deployment hero (live URL preview) + structured deliverables + stats footer.
// Empty state if the goal hasn't produced any deliverables yet.

export function ResultTab({ goal, theme: themeProp }) {
  const theme = themeProp || useTheme();
  const G = theme.palette.primary.main;
  const [showAllRoadmap, setShowAllRoadmap] = useState(false);

  // Inline Knowledge Base document viewer — opens on click of an Open
  // button in the Documentation list. Fetches doc content on demand from
  // knowledge_documents. Replaces the old `href="/knowledge-base?doc=..."`
  // pattern which navigated away from the goal popup (user reported the
  // link as "broken" — link worked but popup closed and KB page wasn't
  // deep-linked to the specific doc).
  const [docViewerId, setDocViewerId] = useState(null);
  const [docViewerData, setDocViewerData] = useState(null);
  const [docViewerLoading, setDocViewerLoading] = useState(false);
  useEffect(() => {
    if (!docViewerId || !hasSupabase()) return;
    setDocViewerLoading(true);
    setDocViewerData(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('knowledge_documents')
          .select('id, title, content, category, created_at')
          .eq('id', docViewerId)
          .maybeSingle();
        if (error) throw error;
        setDocViewerData(
          data || {
            title: 'Document not found',
            content: 'This document could not be loaded. It may have been deleted.',
          }
        );
      } catch (err) {
        setDocViewerData({ title: 'Error', content: `Failed to load document: ${err.message}` });
      } finally {
        setDocViewerLoading(false);
      }
    })();
  }, [docViewerId]);

  // Fetch this goal's team_tasks so the FinalResultsSection can extract
  // real deliverables (deployment URLs, PDFs, images, markdown docs).
  // Mirrors the fetch in WorkLogTab above — DRYing it out isn't worth
  // a new hook for 2 usages. Only fires when the dialog opens with a
  // completed/failed goal.
  const [resultTasks, setResultTasks] = useState([]);
  const resultGoalId = goal?.id;
  const resultDecisionId = goal?.data?.axwise_orchestration?.decision_id;
  const resultExecutionAuthorization = goal?.data?.execution_authorization;
  const resultExecutionApproval = goal?.data?.goal_approvals?.execution;
  useEffect(() => {
    if (!resultGoalId || !hasSupabase()) return;
    (async () => {
      try {
        let { data } = await supabase
          .from('team_tasks')
          .select('id, title, status, data, sequence_order')
          .eq('goal_id', resultGoalId)
          .order('sequence_order', { ascending: true });
        if (!data?.length) {
          const res = await supabase
            .from('team_tasks')
            .select('id, title, status, data, sequence_order')
            .contains('data', { goal_id: resultGoalId })
            .order('sequence_order', { ascending: true });
          data = res.data;
        }
        setResultTasks(projectGoalDetailTasks(goal, data));
      } catch {
        /* non-critical — block hides if empty */
      }
    })();
  }, [goal, resultGoalId, resultDecisionId, resultExecutionAuthorization, resultExecutionApproval]);

  const overview = goal.data?.project_overview || null;
  const phases = goal.plan?.phases || [];
  const completedPhases = phases.filter((p) => p.status === 'completed').length;
  const totalCost = Number(goal.spent_usd || 0);
  const isCompleted = goal.status === 'completed';
  const isFailed = goal.status === 'failed' || goal.status === 'cancelled';

  // Empty state for goals that haven't completed yet (or failed without producing anything)
  if (!isCompleted && !isFailed) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <AppIcon
          name="InventoryOutlined"
          fallback={InventoryOutlinedIcon}
          sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
        />
        <Typography color="text.secondary" variant="body2">
          The Project Overview will appear here once the goal completes.
        </Typography>
        <Typography color="text.disabled" variant="caption" sx={{ display: 'block', mt: 0.5 }}>
          Status: {goal.status}
        </Typography>
      </Box>
    );
  }

  // Failure state — show header + failure reason + Additional Info
  if (isFailed) {
    const failureReason = goal.data?.failure_reason || goal.failure_reason;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Header card */}
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: alpha(theme.palette.error.main, 0.25),
            background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.05)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
          }}
        >
          <Typography
            sx={{
              fontSize: { xs: '1.05rem', sm: '1.25rem' },
              fontWeight: 800,
              color: 'text.primary',
              mb: 0.25,
            }}
          >
            {goal.title}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 1 }}>
            {goal.description || 'No description'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              label="✕ Failed"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.62rem',
                fontWeight: 700,
                bgcolor: alpha(theme.palette.error.main, 0.12),
                color: 'error.main',
              }}
            />
            <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
              ${totalCost.toFixed(4)} · {goal.iteration || 0} iterations
            </Typography>
          </Box>
        </Box>

        {failureReason && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.error.main, 0.06),
              border: '1px solid',
              borderColor: alpha(theme.palette.error.main, 0.2),
            }}
          >
            <Typography
              color="error.main"
              variant="caption"
              sx={{
                display: 'block',
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                mb: 0.5,
              }}
            >
              Why it failed
            </Typography>
            <Typography
              color="error.main"
              variant="caption"
              sx={{ display: 'block', fontSize: '0.8rem', lineHeight: 1.5 }}
            >
              {failureReason}
            </Typography>
          </Box>
        )}
      </Box>
    );
  }

  // Completed goal — extract overview fields once and feed into the new
  // metrics + topic + collapsible-section layout below.
  // Not overview.summary directly: complete.js writes its own failure
  // sentence there when the summary LLM call does not come back, and that
  // sentence names an internal tab. goalResultSummary returns null instead.
  const summary = goalResultSummary(goal);
  const oneLiner = overview?.one_liner;
  const nextSteps = Array.isArray(overview?.next_steps) ? overview.next_steps : [];
  const risksOrGaps = Array.isArray(overview?.risks_or_gaps) ? overview.risks_or_gaps : [];
  const techStack = overview?.tech_stack || {};
  const designNotes = overview?.design_notes || {};
  const keyLinks = overview?.key_links || {};
  const ownership = overview?.ownership || {};
  const roadmap = Array.isArray(overview?.roadmap) ? overview.roadmap : [];
  const docsList = Array.isArray(keyLinks.docs) ? keyLinks.docs : [];

  // Section visibility flags — each collapsible only renders when there's
  // something to show inside it.
  const showTechStack = Boolean(
    techStack.frontend ||
    techStack.backend ||
    techStack.database ||
    techStack.hosting ||
    (Array.isArray(techStack.other) && techStack.other.length > 0)
  );
  const showDesignNotes = Boolean(
    (designNotes.principles?.length || 0) +
    (designNotes.target_devices?.length || 0) +
    (designNotes.ux_considerations?.length || 0)
  );
  const showOwnership = Boolean(ownership.owner_email || ownership.team_members?.length);
  const showRoadmap = roadmap.length > 0;
  const showNextSteps = nextSteps.length > 0;
  const showRisks = risksOrGaps.length > 0;
  const showPipelineActions = docsList.length > 0;

  // ── Time spent computation ─────────────────────────────────
  // Prefer explicit completed_at; otherwise updated_at; otherwise live
  // duration since created_at (for goals still active).
  const startedAt = goal.created_at ? new Date(goal.created_at) : null;
  const endedAt = goal.data?.completed_at
    ? new Date(goal.data.completed_at)
    : goal.completed_at
      ? new Date(goal.completed_at)
      : goal.updated_at
        ? new Date(goal.updated_at)
        : null;
  const elapsedMs = startedAt && endedAt ? Math.max(0, endedAt.getTime() - startedAt.getTime()) : 0;
  const formatDuration = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600)
      .toString()
      .padStart(2, '0');
    const m = Math.floor((totalSec % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };
  const formatDateShort = (d) => {
    if (!d) return '—';
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yy = d.getFullYear().toString().slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  // Best-effort token sum across phases — falls back to 0 if absent.
  const totalTokens = Array.isArray(goal.phaseBudget)
    ? goal.phaseBudget.reduce(
        (sum, p) => sum + (Number(p.tokens) || Number(p.total_tokens) || 0),
        0
      )
    : 0;

  // Metrics row config
  const metrics = [
    {
      label: 'Status',
      value: goal.status,
      sub: null,
      color:
        goal.status === 'completed'
          ? theme.palette.success.main
          : goal.status === 'failed'
            ? theme.palette.error.main
            : theme.palette.info.main,
      capitalize: true,
    },
    {
      label: 'Time Spent',
      value: elapsedMs > 0 ? formatDuration(elapsedMs) : '—',
      sub: startedAt ? `Started ${formatDateShort(startedAt)}` : null,
      color: theme.palette.primary.main,
    },
    {
      label: 'Cost',
      value: `$${totalCost.toFixed(4)}`,
      sub: totalTokens > 0 ? `${totalTokens.toLocaleString()} tokens` : null,
      color: theme.palette.warning.main,
    },
    {
      label: 'Phase',
      value: `${completedPhases}/${phases.length || '—'}`,
      sub:
        phases.length > 0
          ? `${Math.round((completedPhases / phases.length) * 100)}% complete`
          : null,
      color: theme.palette.success.main,
    },
  ];

  // Reusable label-value row used inside collapsible bodies
  const LabelValueRow = ({ label, value }) => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 0, sm: 1.5 },
        py: 0.5,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.7rem',
          color: 'text.disabled',
          fontWeight: 600,
          minWidth: { sm: 130 },
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.82rem', color: 'text.primary', flex: 1, lineHeight: 1.5 }}>
        {value || '—'}
      </Typography>
    </Box>
  );

  const metricLabelSx = {
    fontSize: '0.6rem',
    fontWeight: 600,
    color: 'text.disabled',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const metricPrimarySx = { fontSize: '0.95rem', fontWeight: 800, lineHeight: 1.2, mt: 0.4 };
  const metricSecondarySx = {
    fontSize: '0.65rem',
    color: 'text.secondary',
    fontWeight: 500,
    mt: 0.25,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ── Metrics row ──────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
        }}
      >
        {metrics.map((stat) => (
          <Paper
            key={stat.label}
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: alpha(stat.color, 0.22),
              background: `linear-gradient(135deg, ${alpha(stat.color, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
            }}
          >
            <Typography sx={metricLabelSx}>{stat.label}</Typography>
            <Typography
              sx={{ ...metricPrimarySx, textTransform: stat.capitalize ? 'capitalize' : 'none' }}
            >
              {stat.value}
            </Typography>
            {stat.sub && <Typography sx={metricSecondarySx}>{stat.sub}</Typography>}
          </Paper>
        ))}
      </Box>
      {/* ── Topic ────────────────────────────────────────── */}
      <Box
        sx={{
          p: { xs: 2, sm: 2.25 },
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: alpha(G, 0.25),
          background: `linear-gradient(135deg, ${alpha(G, 0.06)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
        }}
      >
        <Typography
          sx={{
            fontSize: '0.62rem',
            fontWeight: 700,
            color: alpha(G, 0.8),
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            mb: 0.5,
          }}
        >
          Topic
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: '1.05rem', sm: '1.25rem' },
            fontWeight: 800,
            color: 'text.primary',
            lineHeight: 1.3,
          }}
        >
          {goal.title || 'Untitled goal'}
        </Typography>
      </Box>
      {/* ── Project Summary ──────────────────────────────── */}
      {(summary || oneLiner || goal.description) && (
        <ProjectOverviewSection
          glassIconName="MenuBook"
          glassIconFallback={MenuBookIcon}
          label="Project Summary"
        >
          {oneLiner && (
            <Typography
              sx={{
                fontSize: { xs: '0.95rem', sm: '1.05rem' },
                fontWeight: 700,
                lineHeight: 1.4,
                color: 'text.primary',
                mb: summary ? 1.5 : 0,
              }}
            >
              {oneLiner}
            </Typography>
          )}
          {summary ? (
            <Typography
              sx={{
                fontSize: { xs: '0.82rem', sm: '0.88rem' },
                lineHeight: 1.65,
                color: 'text.primary',
              }}
            >
              {summary}
            </Typography>
          ) : !oneLiner && goal.description ? (
            <Typography sx={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'text.secondary' }}>
              {goal.description}
            </Typography>
          ) : null}
        </ProjectOverviewSection>
      )}
      {/* ── Final Results (live site + documents) ─────────── */}
      <FinalResultsSection tasks={resultTasks} goalId={goal?.id} goal={goal} />
      {/* ── Pipeline Actions (docs only — no live app link) ── */}
      {showPipelineActions && (
        <ProjectOverviewSection
          glassIconName="OpenInNew"
          glassIconFallback={OpenInNewIcon}
          label="Pipeline Actions"
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
            <Typography
              sx={{
                fontSize: '0.7rem',
                color: 'text.disabled',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                mb: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <GlassIcon name="MenuBook" fallback={MenuBookIcon} size={14} tone="neutral" />{' '}
              Documentation ({docsList.length})
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, pl: { xs: 0, sm: 2 } }}>
              {docsList.slice(0, 8).map((d) => (
                <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.primary', flex: 1 }} noWrap>
                    → {d.title}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setDocViewerId(d.id)}
                    sx={{
                      fontSize: '0.62rem',
                      textTransform: 'none',
                      minWidth: 0,
                      py: 0,
                      color: G,
                    }}
                  >
                    Open
                  </Button>
                </Box>
              ))}
            </Box>
            <Button
              size="small"
              href="/knowledge-base"
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 12 }} />}
              sx={{
                fontSize: '0.7rem',
                textTransform: 'none',
                mt: 0.5,
                alignSelf: 'flex-start',
                color: G,
              }}
            >
              Open all in Knowledge Base
            </Button>
          </Box>
        </ProjectOverviewSection>
      )}
      {/* ── Divider before collapsible details ──────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
        <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
        <Typography
          sx={{
            fontSize: '0.6rem',
            fontWeight: 700,
            color: 'text.disabled',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          More details
        </Typography>
        <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
      </Box>
      {/* ── Collapsible: Next Steps ──────────────────────── */}
      {showNextSteps && (
        <ProjectOverviewSection
          glassIconName="EastRounded"
          glassIconFallback={ArrowForwardIcon}
          label="Next Steps"
          collapsible
        >
          <Box
            component="ul"
            sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}
          >
            {nextSteps.map((s, i) => (
              <Typography
                key={i}
                component="li"
                sx={{
                  fontSize: { xs: '0.8rem', sm: '0.85rem' },
                  lineHeight: 1.55,
                  color: 'text.primary',
                }}
              >
                {s}
              </Typography>
            ))}
          </Box>
        </ProjectOverviewSection>
      )}
      {/* ── Collapsible: Risks & Gaps ────────────────────── */}
      {showRisks && (
        <ProjectOverviewSection
          glassIconName="PriorityHigh"
          glassIconFallback={ErrorOutlineIcon}
          label="Risks & Gaps"
          collapsible
        >
          <Box
            component="ul"
            sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}
          >
            {risksOrGaps.map((r, i) => (
              <Typography
                key={i}
                component="li"
                sx={{
                  fontSize: { xs: '0.8rem', sm: '0.85rem' },
                  lineHeight: 1.55,
                  color: 'text.secondary',
                }}
              >
                {r}
              </Typography>
            ))}
          </Box>
        </ProjectOverviewSection>
      )}
      {/* ── Collapsible: Tech Stack ──────────────────────── */}
      {showTechStack && (
        <ProjectOverviewSection
          glassIconName="Build"
          glassIconFallback={BuildIcon}
          label="Tech Stack"
          collapsible
        >
          {techStack.frontend && <LabelValueRow label="Frontend" value={techStack.frontend} />}
          {techStack.backend && <LabelValueRow label="Backend" value={techStack.backend} />}
          {techStack.database && <LabelValueRow label="Database" value={techStack.database} />}
          {techStack.hosting && <LabelValueRow label="Hosting" value={techStack.hosting} />}
          {Array.isArray(techStack.other) && techStack.other.length > 0 && (
            <LabelValueRow label="Other" value={techStack.other.join(' · ')} />
          )}
        </ProjectOverviewSection>
      )}
      {/* ── Collapsible: Design & UX ─────────────────────── */}
      {showDesignNotes && (
        <ProjectOverviewSection
          glassIconName="AutoAwesome"
          glassIconFallback={TipsAndUpdatesOutlinedIcon}
          label="Design & User Experience"
          collapsible
        >
          {designNotes.principles?.length > 0 && (
            <LabelValueRow label="Principles" value={designNotes.principles.join(', ')} />
          )}
          {designNotes.target_devices?.length > 0 && (
            <LabelValueRow label="Target devices" value={designNotes.target_devices.join(', ')} />
          )}
          {designNotes.ux_considerations?.length > 0 && (
            <LabelValueRow
              label="UX considerations"
              value={designNotes.ux_considerations.join('. ')}
            />
          )}
        </ProjectOverviewSection>
      )}
      {/* ── Collapsible: Strategic Roadmap ──────────────── */}
      {showRoadmap && (
        <ProjectOverviewSection
          glassIconName="Flag"
          glassIconFallback={OutlinedFlagIcon}
          label="Strategic Roadmap"
          collapsible
        >
          <Typography
            sx={{ fontSize: '0.68rem', color: 'text.disabled', mb: 1.25, fontStyle: 'italic' }}
          >
            Ranked by impact-to-effort
          </Typography>
          {(showAllRoadmap ? roadmap : roadmap.slice(0, 5)).map((item, idx) => (
            <RoadmapCard key={`roadmap-${idx}`} item={item} />
          ))}
          {roadmap.length > 5 && !showAllRoadmap && (
            <Button
              size="small"
              onClick={() => setShowAllRoadmap(true)}
              sx={{ textTransform: 'none', fontSize: '0.72rem', mt: 0.5, color: G }}
            >
              + {roadmap.length - 5} more roadmap items — show all
            </Button>
          )}
        </ProjectOverviewSection>
      )}
      {/* ── Collapsible: Object Ownership ────────────────── */}
      {showOwnership && (
        <ProjectOverviewSection
          glassIconName="Groups"
          glassIconFallback={GroupsIcon}
          label="Object Ownership"
          collapsible
        >
          {ownership.owner_email && <LabelValueRow label="Owner" value={ownership.owner_email} />}
          {ownership.team_members?.length > 0 && (
            <LabelValueRow label="Built by team" value={ownership.team_members.join(' · ')} />
          )}
          {ownership.team_members?.length > 0 && (
            <LabelValueRow label="Total agents" value={String(ownership.team_members.length)} />
          )}
        </ProjectOverviewSection>
      )}
      {/* ── Collapsible: Additional Info ─────────────────── */}
      <ProjectOverviewSection
        glassIconName="Info"
        glassIconFallback={InfoOutlinedIcon}
        label="Additional Info"
        collapsible
        dense
      >
        <LabelValueRow
          label="Version"
          value={`v${overview?.version || (goal.iteration || 0) + 1}`}
        />
        <LabelValueRow label="Status" value={String(goal.status || '—')} />
        <LabelValueRow label="Iterations" value={String(goal.iteration || 0)} />
        <LabelValueRow label="Total cost" value={`$${totalCost.toFixed(4)}`} />
        {totalTokens > 0 && (
          <LabelValueRow label="Total tokens" value={totalTokens.toLocaleString()} />
        )}
        <LabelValueRow label="Phases" value={`${completedPhases} / ${phases.length || '?'}`} />
        {startedAt && <LabelValueRow label="Started" value={startedAt.toLocaleString()} />}
        {endedAt && <LabelValueRow label="Completed" value={endedAt.toLocaleString()} />}
        {elapsedMs > 0 && <LabelValueRow label="Duration" value={formatDuration(elapsedMs)} />}
      </ProjectOverviewSection>
      {/* ── Team Lead Note — Rex ─────────────────────────── */}
      {overview?.team_lead_note && (
        <Box
          sx={{
            mb: 1,
            p: 2.5,
            borderLeft: 3,
            borderColor: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            borderRadius: 1,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontWeight: 700,
              letterSpacing: 0.06,
              textTransform: 'uppercase',
            }}
          >
            Team lead note - Rex
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', lineHeight: 1.6 }}>
            "{overview.team_lead_note}"
          </Typography>
        </Box>
      )}
      {/* ── 🔮 Theory Mode Projections ────────────────────── */}
      {goal.theory_mode && <TheoryModePanel goalId={goal.id} projectionType="detailed" />}
      {/* Inline Knowledge Base document viewer */}
      <FormDialog
        open={!!docViewerId}
        onClose={() => setDocViewerId(null)}
        title={docViewerLoading ? 'Loading…' : docViewerData?.title || 'Document'}
        icon={DescriptionOutlinedIcon}
        maxWidth="md"
        contentDividers={false}
        contentSx={{ p: { xs: 2, sm: 3 }, minHeight: 400 }}
        titleAdornment={
          docViewerId ? (
            <Button
              size="small"
              href={`/knowledge-base?doc=${docViewerId}`}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 12 }} />}
              sx={{ fontSize: '0.7rem', textTransform: 'none' }}
            >
              Open in Knowledge Base
            </Button>
          ) : null
        }
        hideFooter
      >
        <Box>
          {docViewerData?.category && (
            <Chip
              size="small"
              label={docViewerData.category}
              sx={{
                mb: 2,
                height: 20,
                fontSize: '0.62rem',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            />
          )}
          {/* Improve quality: per-document version toggle + refine modal. Hidden until content loads. */}
          {!docViewerLoading && docViewerData?.content && docViewerId && (
            <Box sx={{ mb: 1.5 }}>
              <VersionPicker
                kind="knowledge_document"
                parentId={docViewerId}
                originalValue={docViewerData.content}
                onSelectVersion={(content) => setDocViewerData((d) => (d ? { ...d, content } : d))}
              />
            </Box>
          )}
          <Box
            sx={{
              fontSize: '0.85rem',
              lineHeight: 1.65,
              color: 'text.primary',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '65vh',
              overflow: 'auto',
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.text.primary, 0.03),
              border: '1px solid',
              borderColor: alpha(theme.palette.text.primary, 0.08),
            }}
          >
            {docViewerLoading
              ? 'Loading document content…'
              : docViewerData?.content || 'No content.'}
          </Box>
        </Box>
      </FormDialog>
    </Box>
  );
}

export function ReportTab({ goal, theme: themeProp, messages, profileIndex }) {
  const theme = themeProp || useTheme();
  const [ratingValues, setRatingValues] = useState({});
  const [ratingComments, setRatingComments] = useState({});
  const [ratingSubmitted, setRatingSubmitted] = useState({});

  // Agent-details popup state — opens when the user clicks "View work" on
  // an agent card. Holds the agent object (name, id, etc.) until closed.
  const [agentDetailsFor, setAgentDetailsFor] = useState(null);

  // Collapsible block state. Phase Results stays open; the others default
  // closed per user request (Cost by Phase, Activity Log, Retrospective,
  // Deliverables — moved below Retrospective).
  const [openCostByPhase, setOpenCostByPhase] = useState(false);
  const [openActivityLog, setOpenActivityLog] = useState(false);
  const [openRetrospective, setOpenRetrospective] = useState(false);
  const [openDeliverables, setOpenDeliverables] = useState(false);

  const hasContent = goal.retrospective || goal.tech_doc;

  // Fetch team_tasks once so the per-agent popup can show what each agent
  // actually produced. Same pattern other tabs use.
  const [reportTasks, setReportTasks] = useState([]);
  const reportGoalId = goal?.id;
  const reportDecisionId = goal?.data?.axwise_orchestration?.decision_id;
  const reportExecutionAuthorization = goal?.data?.execution_authorization;
  const reportExecutionApproval = goal?.data?.goal_approvals?.execution;
  useEffect(() => {
    if (!reportGoalId || !hasSupabase()) return;
    (async () => {
      try {
        let { data } = await supabase
          .from('team_tasks')
          .select('id, title, status, data, agent_id, assigned_to, sequence_order')
          .eq('goal_id', reportGoalId)
          .order('sequence_order', { ascending: true });
        if (!data?.length) {
          const res = await supabase
            .from('team_tasks')
            .select('id, title, status, data, agent_id, assigned_to, sequence_order')
            .contains('data', { goal_id: reportGoalId })
            .order('sequence_order', { ascending: true });
          data = res.data;
        }
        setReportTasks(projectGoalDetailTasks(goal, data));
      } catch {
        /* non-critical */
      }
    })();
  }, [goal, reportGoalId, reportDecisionId, reportExecutionAuthorization, reportExecutionApproval]);

  const reportGoal = useMemo(() => enrichGoalReportData(goal, reportTasks), [goal, reportTasks]);

  const hasTokenData = Boolean(reportGoal.tokenSummary?.hasTokenData);
  const hasLlmInfo = Boolean(reportGoal.tokenSummary?.hasLlmInfo);
  const totalTokens = Number(
    reportGoal.tokenSummary?.totalTokens ??
      reportGoal.phaseBudget?.reduce((sum, p) => sum + Number(p.tokens || 0), 0) ??
      0
  );
  const agents = reportGoal.agentBudget || [];
  const phases = goal.plan?.phases || [];
  const completedPhases = phases.filter((p) => p.status === 'completed');
  const totalCost = Number(reportGoal.spent_usd || 0);

  if (!hasContent && !agents.length && !completedPhases.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <AppIcon
          name="DescriptionOutlined"
          fallback={DescriptionOutlinedIcon}
          sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
        />
        <Typography color="text.secondary" variant="body2">
          Report will be generated as phases complete.
        </Typography>
      </Box>
    );
  }

  const handleRateAgent = async (agentId, agentName) => {
    const rating = ratingValues[agentId];
    if (!rating) return;
    try {
      await submitRating({
        agent_id: agentId,
        rating,
        comment: ratingComments[agentId] || '',
        rating_type: 'individual',
        request_id: goal.id,
      });
      setRatingSubmitted((prev) => ({ ...prev, [agentId]: true }));
    } catch (err) {
      console.warn('Rating failed:', err.message);
    }
  };

  // Tasks attributed to a specific agent — matched by agent_id (preferred)
  // or by assigned_to name (fallback for legacy rows).
  const tasksForAgent = (agent) =>
    reportTasks.filter(
      (t) =>
        (agent.agentId && t.agent_id === agent.agentId) ||
        (agent.name && (t.assigned_to === agent.name || t.data?.assigned_to === agent.name))
    );

  // Map a phase index → phase cost from goal.phaseBudget so we can show
  // "Agent X · 3 tasks · $0.0123 (Phase 1 · Phase 2)" inside the popup.
  const phaseBudgetByName = {};
  for (const p of reportGoal.phaseBudget || []) {
    if (p.phaseName) phaseBudgetByName[p.phaseName] = Number(p.cost || 0);
  }

  const sectionSx = {
    p: { xs: 1.5, sm: 2 },
    borderRadius: 2.5,
    border: '1px solid',
    borderColor: 'divider',
  };
  const headingSx = {
    fontWeight: 700,
    fontSize: '0.82rem',
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    mb: 1.5,
  };
  const collapsibleHeadingSx = {
    ...headingSx,
    mb: 0,
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': { color: 'primary.main' },
  };
  const labelSx = {
    fontSize: '0.6rem',
    fontWeight: 600,
    color: 'text.disabled',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const valueSx = { fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2, mt: 0.25 };
  const totalAgentCost = agents.reduce((sum, a) => sum + Number(a.spent || 0), 0);

  const deliverablesCount = Array.isArray(goal.data?.deliverables)
    ? goal.data.deliverables.length
    : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, maxWidth: '100%' }}>
      {/* Agents — merged with Cost Breakdown info (total + per-agent spend) */}
      {agents.length > 0 && (
        <Paper variant="outlined" sx={sectionSx}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
          >
            <Typography sx={{ ...headingSx, mb: 0 }}>
              <GlassIcon
                name="SmartToyOutlined"
                fallback={SmartToyOutlinedIcon}
                size={18}
                tone="brand"
                sx={{ fontSize: 18, color: 'primary.main' }}
              />{' '}
              Agents ({agents.length})
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <GlassIcon
                name="AccountBalanceWalletOutlined"
                fallback={AccountBalanceWalletOutlinedIcon}
                size={16}
                tone="brand"
                sx={{ fontSize: 16, color: 'warning.main' }}
              />
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 600 }}>
                Total agent cost
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: 'warning.main' }}>
                ${totalAgentCost.toFixed(4)}
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}
          >
            {agents.map((agent) => {
              const quality = agent.avgQuality ? Math.round(agent.avgQuality) : null;
              const successRate =
                agent.tasks > 0 ? Math.round((agent.completed / agent.tasks) * 100) : 0;
              const costShare =
                totalAgentCost > 0
                  ? Math.round((Number(agent.spent || 0) / totalAgentCost) * 100)
                  : 0;
              const identity = resolveAgentIdentity(
                { id: agent.agentId, name: agent.name },
                profileIndex
              );
              const displayName = identity.name || agent.name;
              return (
                <Paper
                  key={agent.agentId || agent.name}
                  elevation={0}
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.12),
                  }}
                >
                  <Box
                    onClick={() => {
                      if (typeof window.__openAgentDetail === 'function')
                        window.__openAgentDetail({ id: agent.agentId, name: agent.name });
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 0.75,
                      cursor: 'pointer',
                      borderRadius: 1,
                      p: 0.25,
                      mx: -0.25,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <GlassIcon
                        name="SmartToyOutlined"
                        fallback={SmartToyOutlinedIcon}
                        size={16}
                        tone="brand"
                        sx={{ fontSize: 16, color: 'primary.main' }}
                      />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} fontSize="0.78rem" noWrap>
                        {displayName}
                      </Typography>
                      {identity.position && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          fontSize="0.6rem"
                          noWrap
                          sx={{ display: 'block', lineHeight: 1.1 }}
                        >
                          {identity.position}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" fontSize="0.65rem">
                        {agent.completed}/{agent.tasks} tasks · $
                        {Number(agent.spent || 0).toFixed(4)}
                        {hasTokenData && agent.tokens > 0 && (
                          <> · {formatTokenSpend(agent.tokens, agent.tokenCostUsd)}</>
                        )}
                        {!hasTokenData && agent.llmModels?.length > 0 && (
                          <> · {agent.llmModels.join(', ')}</>
                        )}
                        {costShare > 0 && ` · ${costShare}% of total`}
                      </Typography>
                    </Box>
                    {quality != null && (
                      <Chip
                        label={`${quality}`}
                        size="small"
                        color={quality >= 70 ? 'success' : quality >= 40 ? 'warning' : 'error'}
                        variant="outlined"
                        sx={{ fontSize: '0.6rem', height: 20, fontWeight: 700 }}
                      />
                    )}
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={successRate}
                    color={successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'error'}
                    sx={{ height: 3, borderRadius: 2, mb: 1 }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={
                        <AppIcon
                          name="DescriptionOutlined"
                          fallback={DescriptionOutlinedIcon}
                          sx={{ fontSize: 14 }}
                        />
                      }
                      onClick={() => setAgentDetailsFor(agent)}
                      sx={{
                        fontSize: '0.62rem',
                        py: 0.2,
                        px: 1,
                        textTransform: 'none',
                        borderRadius: 1.5,
                      }}
                    >
                      View work
                    </Button>
                    {ratingSubmitted[agent.agentId] ? (
                      <Chip
                        label="Rated"
                        size="small"
                        color="success"
                        sx={{ fontSize: '0.55rem', height: 18, ml: 'auto' }}
                      />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                        <Rating
                          size="small"
                          value={ratingValues[agent.agentId] || 0}
                          onChange={(_, v) =>
                            setRatingValues((prev) => ({ ...prev, [agent.agentId]: v }))
                          }
                        />
                        {ratingValues[agent.agentId] > 0 && (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => handleRateAgent(agent.agentId, agent.name)}
                            sx={{
                              fontSize: '0.6rem',
                              py: 0.2,
                              px: 1,
                              minWidth: 'auto',
                              textTransform: 'none',
                              borderRadius: 1.5,
                            }}
                          >
                            Rate
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Paper>
      )}
      {/* Phase Results — always visible */}
      {completedPhases.length > 0 && (
        <Paper variant="outlined" sx={sectionSx}>
          <Typography sx={headingSx}>
            <GlassIcon
              name="AssignmentOutlined"
              fallback={AssignmentOutlinedIcon}
              size={18}
              tone="brand"
              sx={{ fontSize: 18, color: 'success.main' }}
            />{' '}
            Phase Results
          </Typography>
          {phases.map((phase, i) => {
            const StatusIcon =
              phase.status === 'completed'
                ? CheckCircleOutlineIcon
                : phase.status === 'failed'
                  ? ErrorOutlineIcon
                  : HourglassEmptyIcon;
            const statusColor =
              phase.status === 'completed'
                ? 'success.main'
                : phase.status === 'failed'
                  ? 'error.main'
                  : 'text.disabled';
            return (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  py: 0.5,
                  borderBottom: i < phases.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}
              >
                <AppIcon fallback={StatusIcon} sx={{ fontSize: 16, color: statusColor }} />
                <Typography variant="body2" sx={{ flex: 1, fontSize: '0.76rem', fontWeight: 600 }}>
                  {phase.name || `Phase ${i + 1}`}
                </Typography>
                {phase.quality_score != null && (
                  <Chip
                    label={`${phase.quality_score}`}
                    size="small"
                    color={
                      phase.quality_score >= 70
                        ? 'success'
                        : phase.quality_score >= 40
                          ? 'warning'
                          : 'error'
                    }
                    variant="outlined"
                    sx={{ fontSize: '0.6rem', height: 20, fontWeight: 700 }}
                  />
                )}
              </Box>
            );
          })}
        </Paper>
      )}
      {/* Cost & Tokens by Phase — collapsible (closed by default) */}
      {reportGoal.phaseBudget?.length > 0 && (
        <Paper variant="outlined" sx={sectionSx}>
          <Box onClick={() => setOpenCostByPhase((p) => !p)} sx={collapsibleHeadingSx}>
            <GlassIcon
              name="AccountBalanceWalletOutlined"
              fallback={AccountBalanceWalletOutlinedIcon}
              size={18}
              tone="brand"
              sx={{ fontSize: 18, color: 'warning.main' }}
            />
            <Box component="span" sx={{ flex: 1 }}>
              {hasLlmInfo ? 'Cost & Tokens by Phase' : 'Cost by Phase'}
            </Box>
            <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0 }}>
              <ReportMetricCell
                costUsd={totalCost}
                tokens={totalTokens}
                costInfo={getMetricInfo(reportGoal.tokenSummary?.metricMeta?.costReason)}
                tokenInfo={getMetricInfo(reportGoal.tokenSummary?.metricMeta?.tokenReason)}
                align="right"
                compact
              />
            </Box>
            <AppIcon
              name="ExpandMore"
              fallback={ExpandMoreIcon}
              sx={{
                fontSize: 20,
                transform: openCostByPhase ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                color: 'text.secondary',
              }}
            />
          </Box>
          <Collapse in={openCostByPhase} timeout="auto" unmountOnExit>
            <Box sx={{ pt: 1.5, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
              {reportGoal.phaseBudget.map((p, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    py: 0.35,
                    gap: 1,
                    alignItems: 'flex-start',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.76rem', color: 'text.secondary', flex: 1, minWidth: 0 }}
                  >
                    {p.phaseName}
                  </Typography>
                  <ReportMetricCell
                    costUsd={p.cost}
                    tokens={p.tokens}
                    costInfo={getMetricInfo(p.metricMeta?.costReason)}
                    tokenInfo={getMetricInfo(p.metricMeta?.tokenReason)}
                    align="right"
                    compact
                  />
                </Box>
              ))}
              <Divider sx={{ my: 0.5 }} />
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  Total
                </Typography>
                <ReportMetricCell
                  costUsd={totalCost}
                  tokens={totalTokens}
                  costInfo={getMetricInfo(reportGoal.tokenSummary?.metricMeta?.costReason)}
                  tokenInfo={getMetricInfo(reportGoal.tokenSummary?.metricMeta?.tokenReason)}
                  align="right"
                  compact
                />
              </Box>
              <TokenByPhaseChart goal={reportGoal} />
              <Box sx={{ mt: 1.5, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
                <BudgetTab goal={reportGoal} />
              </Box>
            </Box>
          </Collapse>
        </Paper>
      )}
      {/* Retrospective — collapsible (closed by default) */}
      {goal.retrospective && (
        <Paper variant="outlined" sx={sectionSx}>
          <Box onClick={() => setOpenRetrospective((p) => !p)} sx={collapsibleHeadingSx}>
            <GlassIcon
              name="TipsAndUpdatesOutlined"
              fallback={TipsAndUpdatesOutlinedIcon}
              size={18}
              tone="brand"
              sx={{ fontSize: 18, color: 'secondary.main' }}
            />
            <Box component="span" sx={{ flex: 1 }}>
              Retrospective
            </Box>
            <AppIcon
              name="ExpandMore"
              fallback={ExpandMoreIcon}
              sx={{
                fontSize: 20,
                transform: openRetrospective ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                color: 'text.secondary',
              }}
            />
          </Box>
          <Collapse in={openRetrospective} timeout="auto" unmountOnExit>
            <Box sx={{ pt: 1.5 }}>
              {goal.retrospective.what_worked && (
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ ...labelSx, color: 'success.main' }}>What Worked</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.76rem', lineHeight: 1.5 }}>
                    {goal.retrospective.what_worked}
                  </Typography>
                </Box>
              )}
              {goal.retrospective.what_failed && (
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ ...labelSx, color: 'error.main' }}>What Failed</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.76rem', lineHeight: 1.5 }}>
                    {goal.retrospective.what_failed}
                  </Typography>
                </Box>
              )}
              {goal.retrospective.cost_analysis && (
                <Box>
                  <Typography sx={{ ...labelSx, color: 'warning.main' }}>Cost Analysis</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.76rem', lineHeight: 1.5 }}>
                    {goal.retrospective.cost_analysis}
                  </Typography>
                </Box>
              )}
            </Box>
          </Collapse>
        </Paper>
      )}
      {/* Deliverables — collapsible (closed by default), moved here per user request */}
      {deliverablesCount > 0 && (
        <Paper variant="outlined" sx={sectionSx}>
          <Box onClick={() => setOpenDeliverables((p) => !p)} sx={collapsibleHeadingSx}>
            <Box component="span" sx={{ fontSize: '1rem', lineHeight: 1 }}>
              📦
            </Box>
            <Box component="span" sx={{ flex: 1 }}>
              Deliverables ({deliverablesCount})
            </Box>
            <AppIcon
              name="ExpandMore"
              fallback={ExpandMoreIcon}
              sx={{
                fontSize: 20,
                transform: openDeliverables ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                color: 'text.secondary',
              }}
            />
          </Box>
          <Collapse in={openDeliverables} timeout="auto" unmountOnExit>
            <Box sx={{ pt: 1.5, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
              <GoalDeliverables
                deliverables={goal.data?.deliverables || []}
                goalId={goal.id}
                compact
                embedded
              />
            </Box>
          </Collapse>
        </Paper>
      )}
      {/* Activity Log — collapsible (closed by default) */}
      <Paper variant="outlined" sx={sectionSx}>
        <Box onClick={() => setOpenActivityLog((p) => !p)} sx={collapsibleHeadingSx}>
          <GlassIcon
            name="HistoryOutlined"
            fallback={HistoryOutlinedIcon}
            size={18}
            tone="neutral"
            sx={{ fontSize: 18, color: 'text.secondary' }}
          />
          <Box component="span" sx={{ flex: 1 }}>
            Activity Log ({(goal.logs || []).length})
          </Box>
          <AppIcon
            name="ExpandMore"
            fallback={ExpandMoreIcon}
            sx={{
              fontSize: 20,
              transform: openActivityLog ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              color: 'text.secondary',
            }}
          />
        </Box>
        <Collapse in={openActivityLog} timeout="auto" unmountOnExit>
          <Box sx={{ pt: 1.5 }}>
            <GoalChatFeed
              logs={goal.logs || []}
              messages={messages || []}
              maxHeight={400}
              compact
              goalId={goal.id}
            />
          </Box>
        </Collapse>
      </Paper>
      {/* ── Per-agent work popup ─────────────────────────── */}
      <AgentWorkDialog
        agent={agentDetailsFor}
        onClose={() => setAgentDetailsFor(null)}
        tasks={agentDetailsFor ? tasksForAgent(agentDetailsFor) : []}
        phaseBudgetByName={phaseBudgetByName}
      />
    </Box>
  );
}

// ── Agent Work Dialog ──────────────────────────────────────────
// Opens from the "View work" button on each agent card. Shows the agent's
// stats, the tasks they were assigned, and each task's output (clickable
// to expand inline). Keeps the report tab uncluttered while still letting
// the user audit what each agent actually produced.
function AgentWorkDialog({ agent, onClose, tasks, phaseBudgetByName }) {
  const theme = useTheme();
  const [expandedTask, setExpandedTask] = useState(null);
  if (!agent) return null;

  const totalSpent = Number(agent.spent || 0);
  const completed = agent.completed || 0;
  const total = agent.tasks || tasks.length || 0;
  const quality = agent.avgQuality ? Math.round(agent.avgQuality) : null;
  const phasesTouched = [...new Set(tasks.map((t) => t.data?.phase_name).filter(Boolean))];

  return (
    <FormDialog
      open={!!agent}
      onClose={onClose}
      title={agent.name}
      subtitle={`${completed}/${total} tasks · $${totalSpent.toFixed(4)}${quality != null ? ` · ${quality}/100 quality` : ''}`}
      icon={SmartToyOutlinedIcon}
      maxWidth="md"
      primaryLabel="Close"
      onPrimary={onClose}
      hideCancel
    >
      {/* Stat strip */}
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(3, 1fr)', mb: 2 }}>
        {[
          {
            label: 'Tasks done',
            value: `${completed}/${total}`,
            color: theme.palette.success.main,
          },
          { label: 'Cost', value: `$${totalSpent.toFixed(4)}`, color: theme.palette.warning.main },
          {
            label: 'Quality',
            value: quality != null ? `${quality}/100` : '—',
            color: theme.palette.info.main,
          },
        ].map((s) => (
          <Paper
            key={s.label}
            elevation={0}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: alpha(s.color, 0.22),
              background: `linear-gradient(135deg, ${alpha(s.color, 0.07)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 70%)`,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.6rem',
                fontWeight: 600,
                color: 'text.disabled',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {s.label}
            </Typography>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, mt: 0.4 }}>
              {s.value}
            </Typography>
          </Paper>
        ))}
      </Box>
      {phasesTouched.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            sx={{
              fontSize: '0.62rem',
              fontWeight: 700,
              color: 'text.disabled',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              mb: 0.75,
            }}
          >
            Phases worked in
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {phasesTouched.map((p) => (
              <Chip
                key={p}
                size="small"
                label={`${p}${phaseBudgetByName[p] != null ? ` · $${phaseBudgetByName[p].toFixed(4)}` : ''}`}
                variant="outlined"
                sx={{ fontSize: '0.65rem', fontWeight: 600 }}
              />
            ))}
          </Box>
        </Box>
      )}
      <Typography
        sx={{
          fontSize: '0.62rem',
          fontWeight: 700,
          color: 'text.disabled',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          mb: 1,
        }}
      >
        Tasks ({tasks.length})
      </Typography>
      {tasks.length === 0 ? (
        <Box
          sx={{
            p: 2,
            textAlign: 'center',
            borderRadius: 2,
            bgcolor: alpha(theme.palette.text.primary, 0.03),
          }}
        >
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
            No tasks recorded for this agent on this goal.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tasks.map((task) => {
            const output = task.data?.output || '';
            const cost = Number(task.data?.llmCost || 0);
            const duration = Number(task.data?.llmDurationMs || 0);
            const isOpen = expandedTask === task.id;
            const statusColor =
              task.status === 'done'
                ? 'success.main'
                : task.status === 'failed'
                  ? 'error.main'
                  : task.status === 'inProgress'
                    ? 'primary.main'
                    : 'text.disabled';
            const StatusIcon =
              task.status === 'done'
                ? CheckCircleOutlineIcon
                : task.status === 'failed'
                  ? ErrorOutlineIcon
                  : task.status === 'inProgress'
                    ? SyncOutlinedIcon
                    : HourglassEmptyIcon;
            return (
              <Paper key={task.id} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box
                  onClick={() => setExpandedTask(isOpen ? null : task.id)}
                  sx={{
                    p: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}
                >
                  <AppIcon fallback={StatusIcon} sx={{ fontSize: 16, color: statusColor }} />
                  <Typography sx={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }}>
                    {task.title}
                  </Typography>
                  {cost > 0 && (
                    <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
                      ${cost.toFixed(4)}
                    </Typography>
                  )}
                  {duration > 0 && (
                    <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
                      {(duration / 1000).toFixed(1)}s
                    </Typography>
                  )}
                  <AppIcon
                    name="ExpandMore"
                    fallback={ExpandMoreIcon}
                    sx={{
                      fontSize: 18,
                      color: 'text.secondary',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </Box>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <Box
                    sx={{
                      p: 1.5,
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      bgcolor: alpha(theme.palette.text.primary, 0.02),
                      maxHeight: 360,
                      overflow: 'auto',
                    }}
                  >
                    {output ? (
                      <Typography
                        sx={{
                          fontSize: '0.78rem',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: 'text.primary',
                        }}
                      >
                        {output}
                      </Typography>
                    ) : (
                      <Typography
                        sx={{ fontSize: '0.75rem', color: 'text.disabled', fontStyle: 'italic' }}
                      >
                        No output recorded for this task.
                      </Typography>
                    )}
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Box>
      )}
    </FormDialog>
  );
}

// ── Activity Log tab content ──────────────────────────────────
function ActivityLogTab({ logs }) {
  if (!logs?.length) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <AppIcon
          name="HistoryOutlined"
          fallback={HistoryOutlinedIcon}
          sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No activity recorded yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {logs.map((entry) => (
        <LogEntry key={entry.id} entry={entry} />
      ))}
    </Box>
  );
}

// ── Feasibility tab content ───────────────────────────────────
function FeasibilityTab({ report }) {
  if (!report) return null;
  const f = report.feasibility || {};
  const p = report.profitability || {};
  const h = report.historical || {};

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 2 }}>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Complexity
          </Typography>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {((report.complexity_score || 0) * 100).toFixed(0)}%
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Success Prob.
          </Typography>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {((f.success_probability || 0) * 100).toFixed(0)}%
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Est. Cost
          </Typography>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 700 }}>
            ${(p.estimated_token_cost || 0).toFixed(2)}
          </Typography>
        </Box>
      </Box>
      <Chip
        label={`Recommendation: ${report.recommendation || 'proceed'}`}
        size="small"
        color={
          report.recommendation === 'proceed'
            ? 'success'
            : report.recommendation === 'adjust'
              ? 'warning'
              : 'error'
        }
        sx={{ mb: 1.5, fontSize: '0.72rem' }}
      />
      {report.recommendation_reason && (
        <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 1.5 }}>
          {report.recommendation_reason}
        </Typography>
      )}
      {f.risk_factors?.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
            Risk Factors
          </Typography>
          {f.risk_factors.map((r, i) => (
            <Typography
              key={i}
              variant="body2"
              sx={{ fontSize: '0.72rem', color: 'text.secondary', pl: 1 }}
            >
              - {r}
            </Typography>
          ))}
        </Box>
      )}
      {h?.similar_goals_count > 0 && (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
            Historical Data
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
            {h.similar_goals_count} similar goals | Avg cost: $
            {(h.avg_cost_similar || 0).toFixed(2)} | Success rate:{' '}
            {((h.avg_success_rate_similar || 0) * 100).toFixed(0)}%
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ── Proposal tab content ─────────────────────────────────────
function ProposalTab({ proposal, techDoc }) {
  if (!proposal) return null;
  const est = proposal.estimates || {};
  const tc = proposal.total_cost || {};

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Total Estimated Cost
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
            ${(tc.total || 0).toFixed(2)}
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Estimated Time
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
            ~{est.total_estimated_time_minutes || '?'} min
          </Typography>
        </Box>
      </Box>
      {est.per_phase_breakdown?.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
            Phase Breakdown
          </Typography>
          {est.per_phase_breakdown.map((p, i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3, px: 1 }}>
              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                {p.phase}
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                ${(p.cost || 0).toFixed(2)} | ~{p.time_minutes}min
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {techDoc?.problem_statement && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
            Problem Statement
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {techDoc.problem_statement}
          </Typography>
        </Box>
      )}
      {techDoc?.acceptance_tests?.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
            Acceptance Criteria
          </Typography>
          {techDoc.acceptance_tests.map((t, i) => (
            <Typography
              key={i}
              variant="body2"
              sx={{ fontSize: '0.72rem', color: 'text.secondary', pl: 1 }}
            >
              Phase {(t.phase || 0) + 1}: {t.test}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Retrospective tab content ────────────────────────────────
function RetrospectiveTab({ retro }) {
  if (!retro) return null;

  return (
    <Box>
      {retro.what_worked && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5, color: 'success.main' }}
          >
            What Worked
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}
          >
            {retro.what_worked}
          </Typography>
        </Box>
      )}
      {retro.what_failed && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5, color: 'error.main' }}
          >
            What Failed
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}
          >
            {retro.what_failed}
          </Typography>
        </Box>
      )}
      {retro.cost_analysis && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
            Cost Analysis
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}
          >
            {retro.cost_analysis}
          </Typography>
        </Box>
      )}
      {retro.agent_performance && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontSize: '0.78rem', fontWeight: 600, mb: 0.5 }}>
            Agent Performance
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}
          >
            {retro.agent_performance}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ── Main dialog ───────────────────────────────────────────────
//
// initialTab semantics:
//   - When the caller passes a number, that value wins (caller knows best —
//     e.g. opening directly into Work Log from a notification).
//   - When omitted, we auto-pick after first goal fetch:
//       completed | failed | cancelled  →  Result (3)
//       anything else                   →  Pipeline (0)
//   Tracked via initialTabAppliedRef so subsequent polls don't keep
//   resetting the tab if the user manually navigates.
export default function GoalDetailDialog({
  open,
  onClose,
  goalId,
  initialTab,
  onUpdated,
  onSetupTools,
  onOpenContinuation,
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissedApprovalGate, setDismissedApprovalGate] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionsAnchor, setActionsAnchor] = useState(null);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [implementOpen, setImplementOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [leadChatOpen, setLeadChatOpen] = useState(false);
  const [availableWorkflows, setAvailableWorkflows] = useState([]);
  const [wfSaving, setWfSaving] = useState(false);
  const [tab, setTab] = useState(typeof initialTab === 'number' ? initialTab : 0);
  const initialTabAppliedRef = useRef(false);
  const [error, setError] = useState('');
  const [goalMessages, setGoalMessages] = useState([]);
  // Agent profiles (real names + positions) - loaded once per open, shared with
  // the tabs and the agent-detail popup host.
  const [profileIndex, setProfileIndex] = useState(null);

  // The dialog can sit on top of /job-pool, where the route itself contains no
  // goal id. Publish the visible goal so the global AxWise bar is scoped to the
  // proposal the user is actually reviewing.
  useEffect(() => {
    if (!open || !goalId) return undefined;
    setAxwiseGoalScope(goalId);
    return () => clearAxwiseGoalScope(goalId);
  }, [open, goalId]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    listProfiles()
      .then((p) => {
        if (active)
          setProfileIndex(buildProfileIndex(p && p.length ? p : PREDEFINED_AGENT_PROFILES));
      })
      .catch(() => {
        if (active) setProfileIndex(buildProfileIndex(PREDEFINED_AGENT_PROFILES));
      });
    return () => {
      active = false;
    };
  }, [open]);
  // Local short/full view toggle — scoped only to this popup, never
  // touches the global simpleMode. Short = ResultTab only (no tabs shown).
  // Full = 4-tab stepper. Defaults to short when in simple mode.
  const { simpleMode } = useSimpleMode();
  // Default view follows the app mode: Full (4 steps) in advanced, Short (1
  // step) in simple. Manual toggles persist until the mode changes.
  const [fullView, setFullView] = useState(!simpleMode);

  // Re-apply the mode default whenever simple/advanced mode changes.
  useEffect(() => {
    setFullView(!simpleMode);
  }, [simpleMode]);

  const fetchGoal = useCallback(
    async (silent = false) => {
      if (!goalId) return;
      if (!silent) setLoading(true);
      try {
        const data = await getGoal(goalId);
        setGoal(data);
        // Fetch messages for chat feed
        try {
          const msgs = await getGoalMessages(goalId);
          setGoalMessages(Array.isArray(msgs) ? msgs : []);
        } catch {
          setGoalMessages([]);
        }
      } catch (err) {
        if (!silent) setError(err.message || 'Failed to load goal');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [goalId]
  );

  useEffect(() => {
    setDismissedApprovalGate('');
    if (open && goalId) {
      // Caller-supplied initialTab wins; otherwise wait for goal status
      // and auto-pick below.
      if (typeof initialTab === 'number') {
        setTab(initialTab);
        initialTabAppliedRef.current = true;
      } else {
        initialTabAppliedRef.current = false;
      }
      fetchGoal();
    } else if (!open) {
      // Reset the flag so the next open re-applies the auto-pick.
      initialTabAppliedRef.current = false;
    }
  }, [open, goalId, fetchGoal, initialTab]);

  useEffect(() => {
    if (!['awaiting_context_approval', 'awaiting_approval'].includes(goal?.status)) {
      setDismissedApprovalGate('');
    }
  }, [goal?.status]);

  // Auto-pick the tab once the goal has loaded. Terminal goals open on
  // Result (the user wants to see the deliverables); in-progress goals
  // open on Pipeline (so they can watch the run). Only fires once per
  // dialog open so polling never yanks the tab away from the user.
  useEffect(() => {
    if (!goal || initialTabAppliedRef.current) return;
    const terminal =
      goal.status === 'completed' || goal.status === 'failed' || goal.status === 'cancelled';
    setTab(terminal ? 3 : 0);
    initialTabAppliedRef.current = true;
  }, [goal]);

  // ── Live polling: refetch every 5s while popup is open and goal is in
  // a non-terminal state. Tab visibility check skips polls in background.
  // This is the foundational fix that makes the popup actually live.
  useEffect(() => {
    if (!open || !goalId || !goal) return undefined;
    const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
    if (TERMINAL.has(goal.status)) return undefined;

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchGoal(true); // silent — no spinner flash
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [open, goalId, goal, fetchGoal]);

  const handleAction = useCallback(
    async (action) => {
      if (action === 'delete') {
        onClose();
        navigate(
          `/pin?mode=delete&goalId=${goalId}&next=${encodeURIComponent(window.location.pathname)}`
        );
        return;
      }
      setActionLoading(action);
      try {
        if (action === 'pause') await pauseGoal(goalId);
        else if (action === 'resume') await resumeGoal(goalId);
        else if (action === 'cancel') await cancelGoal(goalId);
        else if (action === 'toggle-autopilot-on') await toggleAutopilot(goalId, true);
        else if (action === 'toggle-autopilot-off') await toggleAutopilot(goalId, false);
        else if (action === 'toggle-loop-on') await toggleLoop(goalId, true);
        else if (action === 'toggle-loop-off') await toggleLoop(goalId, false);
        await fetchGoal();
        onUpdated?.();
      } catch (err) {
        setError(err.message || `Failed to ${action} goal`);
      } finally {
        setActionLoading('');
      }
    },
    [goalId, fetchGoal, onUpdated, navigate, onClose]
  );

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (!goal && !loading) return null;

  const logCount = goal?.logs?.length || 0;
  const G = theme.palette.primary.main; // emerald accent
  const stepIndex = goal ? get3StepIndex(goal) : 0;
  const approvalGateKey = goal?.id && goal?.status ? `${goal.id}:${goal.status}` : '';
  const approvalGateOpen = Boolean(
    open && goal?.id === goalId && approvalGateKey !== dismissedApprovalGate
  );
  const apiKeyRetryStage = String(goal?.data?.failure_stage || '').trim();
  const isApiKeyCheckpoint = Boolean(
    goal?.status === 'needs_human' &&
    API_KEY_RETRY_STAGES.has(apiKeyRetryStage) &&
    (goal?.data?.failure_code === 'llm_api_key_required' ||
      goal?.data?.recovery_action?.target_url === '/settings/keys')
  );
  const failurePhaseIndex = Number(goal?.data?.failure_phase_index);
  const apiKeyRetryActions = isApiKeyCheckpoint
    ? [
        {
          type: 'resolve_retry_stage',
          label: 'Retry with this key',
          params: {
            stage: apiKeyRetryStage,
            ...(apiKeyRetryStage === 'execute-phase' &&
            Number.isInteger(failurePhaseIndex) &&
            failurePhaseIndex >= 0
              ? { phaseIndex: failurePhaseIndex }
              : {}),
          },
        },
      ]
    : [];

  const STEPS = [
    { label: 'Pipeline', icon: AccountTreeOutlinedIcon },
    { label: 'Work Log', icon: AssignmentOutlinedIcon },
    { label: 'Report', icon: SummarizeOutlinedIcon },
    { label: 'Result', icon: InventoryOutlinedIcon },
  ];

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
        slotProps={{
          backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' } },
          paper: {
            sx: {
              borderRadius: isMobile ? 0 : 3,
              maxHeight: isMobile ? '100dvh' : '88vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              // The deliverable viewer rises over this paper, absolutely
              // positioned against it. Without a positioned ancestor it would
              // resolve against the page and cover the whole window.
              position: 'relative',
            },
          },
        }}
      >
        {/* Everything in the popup is wrapped so a result can be opened over
            it: the viewer is a sibling of the header, content and actions. */}
        <DeliverableViewerProvider>
          {/* ── Header ─────────────────────────────────────── */}
          <Box
            sx={{
              px: { xs: 1.5, sm: 2.5 },
              py: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.5,
                bgcolor: alpha(G, 0.12),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <GlassIcon
                name="TrackChangesOutlined"
                fallback={TrackChangesOutlinedIcon}
                size={18}
                tone="brand"
                sx={{ fontSize: 18, color: G }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '0.85rem', sm: '0.95rem' },
                  lineHeight: 1.3,
                }}
                noWrap
              >
                {goal?.title || 'Loading...'}
              </Typography>
            </Box>
            {goal && (
              <Chip
                size="small"
                label={goal.status}
                color={STATUS_COLOR[goal.status] || 'default'}
                sx={{
                  fontSize: '0.62rem',
                  height: 20,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              />
            )}
            {goal && !isMobile && (
              <IconButton
                size="small"
                onClick={() => {
                  onClose();
                  window.location.href = `/goals/${goal.id}`;
                }}
                sx={{ color: 'text.secondary' }}
              >
                <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 15 }} />
              </IconButton>
            )}
            <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
              <Box component="span" sx={{ fontSize: '1.1rem', fontWeight: 300, lineHeight: 1 }}>
                ✕
              </Box>
            </IconButton>
          </Box>

          {/* ── Pill stepper — only in full view ────────── */}
          {goal && fullView && (
            <Box
              sx={{
                px: { xs: 0.75, sm: 4 },
                pt: { xs: 2.5, sm: 3 },
                pb: { xs: 2.5, sm: 3 },
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 0,
                }}
              >
                {STEPS.map((step, i) => {
                  const StepIcon = step.icon;
                  const isDone = i < stepIndex;
                  const isActive = i === tab;
                  const isLast = i === STEPS.length - 1;
                  return (
                    <Box
                      key={step.label}
                      sx={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : 1 }}
                    >
                      <Box
                        onClick={() => setTab(i)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setTab(i);
                          }
                        }}
                        sx={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: { xs: 0.4, sm: 1.25 },
                          px: { xs: 1, sm: 3 },
                          py: { xs: 0.8, sm: 1.4 },
                          minWidth: { xs: 0, sm: 160 },
                          cursor: 'pointer',
                          userSelect: 'none',
                          borderRadius: 999,
                          bgcolor: alpha('#000', 0.45),
                          border: '1.5px solid',
                          borderColor: isActive ? G : alpha(G, 0.55),
                          // Icons stay bright at full G regardless of state.
                          // Only the label text dims on inactive pills — matches
                          // the look in the reference screenshot.
                          color: G,
                          boxShadow: isActive
                            ? `0 0 0 1px ${alpha(G, 0.4)}, 0 0 24px 2px ${alpha(G, 0.55)}, inset 0 0 10px ${alpha(G, 0.18)}`
                            : isDone
                              ? `0 0 8px ${alpha(G, 0.18)}`
                              : 'none',
                          transition:
                            'box-shadow 0.25s ease, border-color 0.25s ease, background-color 0.25s ease',
                          outline: 'none',
                          flexShrink: { xs: 1, sm: 0 },
                          zIndex: 1,
                          '& .step-label': {
                            color: isActive ? G : alpha(G, 0.55),
                            transition: 'color 0.2s ease',
                          },
                          '&:hover': {
                            borderColor: G,
                            boxShadow: isActive
                              ? `0 0 0 1px ${alpha(G, 0.4)}, 0 0 26px 3px ${alpha(G, 0.6)}, inset 0 0 10px ${alpha(G, 0.18)}`
                              : `0 0 14px ${alpha(G, 0.4)}`,
                            '& .step-label': { color: G },
                          },
                          '&:focus-visible': {
                            boxShadow: `0 0 0 3px ${alpha(G, 0.4)}, 0 0 18px ${alpha(G, 0.5)}`,
                            '& .step-label': { color: G },
                          },
                        }}
                      >
                        {/* Always show the actual step icon — done state is
                          conveyed through the pill border + glow, not by
                          replacing the icon with a checkmark. */}
                        <GlassIcon
                          name={
                            step.label === 'Pipeline'
                              ? 'AccountTreeOutlined'
                              : step.label === 'Work Log'
                                ? 'AssignmentOutlined'
                                : step.label === 'Report'
                                  ? 'SummarizeOutlined'
                                  : 'InventoryOutlined'
                          }
                          fallback={StepIcon}
                          size={isMobile ? 15 : 20}
                          tone="brand"
                          sx={{ fontSize: { xs: 15, sm: 20 }, flexShrink: 0, color: G }}
                        />
                        {isDone && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: { xs: -3, sm: -4 },
                              right: { xs: -2, sm: -4 },
                              width: { xs: 12, sm: 14 },
                              height: { xs: 12, sm: 14 },
                              borderRadius: '50%',
                              bgcolor: G,
                              color: '#0a0f0d',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.55rem',
                              fontWeight: 800,
                              border: '2px solid',
                              borderColor: alpha('#000', 0.45),
                              flexShrink: 0,
                            }}
                          >
                            ✓
                          </Box>
                        )}
                        <Typography
                          className="step-label"
                          sx={{
                            fontSize: { xs: '0.62rem', sm: '0.95rem' },
                            fontWeight: 700,
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {step.label}
                        </Typography>
                      </Box>
                      {/* Horizontal connector — touches each pill edge directly */}
                      {!isLast && (
                        <Box
                          sx={{
                            flex: 1,
                            height: 1.5,
                            bgcolor: alpha(G, 0.55),
                            ml: '-1px',
                            mr: '-1px',
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>

              {/* ETA pill */}
              {getPipelineEta(goal) && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.25 }}>
                  <Chip
                    size="small"
                    label={`ETA ${getPipelineEta(goal)}`}
                    sx={{
                      fontSize: '0.6rem',
                      height: 20,
                      fontWeight: 700,
                      bgcolor: alpha(G, 0.1),
                      color: G,
                      border: '1px solid',
                      borderColor: alpha(G, 0.2),
                    }}
                  />
                </Box>
              )}
            </Box>
          )}

          {/* ── Content ────────────────────────────────────── */}
          <DialogContent sx={{ pt: 1, px: { xs: 1.25, sm: 2.5 }, flex: 1, overflow: 'auto' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
                <CircularProgress size={32} sx={{ color: G }} />
              </Box>
            ) : goal ? (
              <>
                {/* Failure reason banner — shown whenever a real failure_reason was captured */}
                {(goal.status === 'failed' ||
                  goal.status === 'needs_human' ||
                  goal.status === 'paused') &&
                  goal.data?.failure_reason && (
                    <Alert
                      severity={
                        goal.status === 'needs_human'
                          ? 'warning'
                          : goal.status === 'paused'
                            ? 'info'
                            : 'error'
                      }
                      sx={{ mb: 2, fontSize: '0.78rem' }}
                      action={
                        isApiKeyCheckpoint ? (
                          <Button
                            component="a"
                            href="/settings/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            variant="contained"
                            color="warning"
                            sx={{
                              textTransform: 'none',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              ml: 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Open API Keys
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            onClick={() => setResolveOpen(true)}
                            sx={{
                              textTransform: 'none',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              ml: 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Resolve & resume
                          </Button>
                        )
                      }
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
                        {goal.status === 'needs_human'
                          ? 'Needs human attention'
                          : goal.status === 'paused'
                            ? 'Paused'
                            : 'Goal failed'}
                        {goal.data.failure_stage ? ` — at stage: ${goal.data.failure_stage}` : ''}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                      >
                        {goal.data.failure_reason}
                      </Typography>
                      {isApiKeyCheckpoint && (
                        <GoalRunActions
                          actions={apiKeyRetryActions}
                          goal={goal}
                          onResult={(result) => {
                            if (!result.ok) return;
                            fetchGoal();
                            onUpdated?.();
                          }}
                        />
                      )}
                    </Alert>
                  )}
                {goal.status === 'awaiting_po_input' &&
                  (isAxwiseScopeClarification(goal) || goal.data?.po_questions?.length > 0) && (
                    <PoQuestionsPanel goal={goal} onAnswered={fetchGoal} />
                  )}
                {!fullView ? (
                  // Short view: show Result content directly, no tabs (both modes).
                  <ResultTab goal={goal} theme={theme} />
                ) : (
                  <>
                    {tab === 0 && (
                      <PipelineTab
                        goal={goal}
                        theme={theme}
                        onSetupTools={(g) => {
                          onSetupTools?.(g);
                          onClose();
                        }}
                        messages={goalMessages}
                        onOpenWorkLog={() => setTab(1)}
                        profileIndex={profileIndex}
                      />
                    )}
                    {tab === 1 && (
                      <WorkLogTab goal={goal} messages={goalMessages} profileIndex={profileIndex} />
                    )}
                    {tab === 2 && (
                      <ReportTab
                        goal={goal}
                        theme={theme}
                        messages={goalMessages}
                        profileIndex={profileIndex}
                      />
                    )}
                    {tab === 3 && <ResultTab goal={goal} theme={theme} />}
                  </>
                )}
                {/* Shared agent-detail popup - reachable from every tab. */}
                <GoalAgentDetailHost goal={goal} profileIndex={profileIndex} />
              </>
            ) : null}
          </DialogContent>

          {/* ── Footer ─────────────────────────────────────── */}
          <Box
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider',
              px: { xs: 1.5, sm: 2.5 },
              py: 1.25,
              display: 'flex',
              gap: 1,
              flexShrink: 0,
              alignItems: 'center',
            }}
          >
            {goal && (
              <>
                <GoalRunControls goal={goal} onRefresh={fetchGoal} />
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<AppIcon name="ArrowDropDown" fallback={ArrowDropDownIcon} />}
                  onClick={(e) => setActionsAnchor(e.currentTarget)}
                  disabled={!!actionLoading}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: 2 }}
                >
                  {actionLoading ? 'Working...' : 'Actions'}
                </Button>
                <GoalActionsMenu
                  anchorEl={actionsAnchor}
                  open={Boolean(actionsAnchor)}
                  onClose={() => setActionsAnchor(null)}
                  goal={goal}
                  onSetupTools={onSetupTools}
                  onCloseDialog={onClose}
                  onHeal={async () => {
                    setActionLoading('heal');
                    try {
                      const result = await healGoal(goal.id);
                      if (result?.action === 'skipped') {
                        setError(
                          `Healer: no strategy matched (${result.details?.reason || 'unknown'})`
                        );
                      }
                      await fetchGoal();
                      onUpdated?.();
                    } catch (err) {
                      setError(err.message || 'Heal failed');
                    } finally {
                      setActionLoading('');
                    }
                  }}
                  onAction={handleAction}
                  onOpenDialog={(key) => {
                    if (key === 'adopt') setAdoptOpen(true);
                    else if (key === 'implement') setImplementOpen(true);
                    else if (key === 'pulse') setPulseOpen(true);
                    else if (key === 'workflow') {
                      getAllWorkflows()
                        .then(setAvailableWorkflows)
                        .catch(() => {});
                      setWorkflowDialogOpen(true);
                    } else if (key === 'leadChat') setLeadChatOpen(true);
                  }}
                  onOpenContinuation={onOpenContinuation}
                  fullView={fullView}
                  onToggleFullView={() => setFullView((v) => !v)}
                />
              </>
            )}

            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              variant="contained"
              onClick={onClose}
              sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: 2, px: 2.5 }}
            >
              Close
            </Button>
          </Box>
        </DeliverableViewerProvider>
      </Dialog>
      {/* Business unit dialogs */}
      {goal && (
        <>
          <AdoptBusinessDialog
            open={adoptOpen}
            onClose={() => setAdoptOpen(false)}
            goal={goal}
            onSuccess={() => {
              fetchGoal();
              onUpdated?.();
            }}
          />
          <ResolveNeedsHumanDialog
            open={resolveOpen}
            onClose={() => setResolveOpen(false)}
            goal={goal}
            onResolved={() => {
              fetchGoal();
              onUpdated?.();
            }}
          />
          <ImplementDialog
            open={implementOpen}
            onClose={() => setImplementOpen(false)}
            goal={goal}
            onSuccess={() => {
              fetchGoal();
              onUpdated?.();
            }}
          />
          <AddPulseDialog
            open={pulseOpen}
            onClose={() => setPulseOpen(false)}
            goal={goal}
            onSuccess={() => {
              fetchGoal();
              onUpdated?.();
            }}
            onOpenGoal={(id) => {
              onOpenContinuation?.(id);
              onClose();
            }}
          />
          <GoalLeadChatDialog
            open={leadChatOpen}
            onClose={() => setLeadChatOpen(false)}
            goal={goal}
          />

          {/* Workflow picker dialog */}
          <FormDialog
            open={workflowDialogOpen}
            onClose={() => setWorkflowDialogOpen(false)}
            title={goal.workflow_id ? 'Change Workflow' : 'Attach Workflow'}
            icon={AccountTreeOutlinedIcon}
            maxWidth="sm"
            contentDividers={false}
            primaryLabel="Close"
            onPrimary={() => setWorkflowDialogOpen(false)}
            hideCancel
          >
            {availableWorkflows.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: 'center' }}>
                No workflows found. Create one in the Workflow editor first.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
                {/* None option */}
                <Paper
                  variant="outlined"
                  onClick={async () => {
                    setWfSaving(true);
                    try {
                      const token = (
                        await (await import('../../lib/supabase')).supabase.auth.getSession()
                      ).data.session?.access_token;
                      await fetch(`/api/app?path=goals&op=update-workflow`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ goalId: goal.id, workflowId: null }),
                      });
                      fetchGoal();
                      onUpdated?.();
                      setWorkflowDialogOpen(false);
                    } catch {
                    } finally {
                      setWfSaving(false);
                    }
                  }}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    borderColor: !goal.workflow_id ? 'primary.main' : 'divider',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    None
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    No workflow — AI generates the plan
                  </Typography>
                </Paper>
                {availableWorkflows.map((wf) => (
                  <Paper
                    key={wf.id}
                    variant="outlined"
                    onClick={async () => {
                      setWfSaving(true);
                      try {
                        const token = (
                          await (await import('../../lib/supabase')).supabase.auth.getSession()
                        ).data.session?.access_token;
                        await fetch(`/api/app?path=goals&op=update-workflow`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ goalId: goal.id, workflowId: wf.id }),
                        });
                        fetchGoal();
                        onUpdated?.();
                        setWorkflowDialogOpen(false);
                      } catch {
                      } finally {
                        setWfSaving(false);
                      }
                    }}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      cursor: 'pointer',
                      borderColor: goal.workflow_id === wf.id ? 'primary.main' : 'divider',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                        {wf.name}
                      </Typography>
                      <Chip
                        label={`${wf.data?.nodes?.length || 0} nodes`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.55rem' }}
                      />
                      {goal.workflow_id === wf.id && (
                        <Chip
                          label="Current"
                          size="small"
                          color="primary"
                          sx={{ height: 18, fontSize: '0.55rem' }}
                        />
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
            {wfSaving && (
              <Box sx={{ textAlign: 'center', mt: 1 }}>
                <CircularProgress size={20} />
              </Box>
            )}
          </FormDialog>
        </>
      )}
      {/* Error snackbar */}
      {open && goal?.id === goalId && goal?.status === 'awaiting_context_approval' && (
        <GoalContextApprovalDialog
          open={approvalGateOpen}
          onClose={() => setDismissedApprovalGate(approvalGateKey)}
          goal={goal}
          onAction={() => {
            fetchGoal();
            onUpdated?.();
          }}
        />
      )}
      {open && goal?.id === goalId && goal?.status === 'awaiting_approval' && (
        <GoalProposalDialog
          open={approvalGateOpen}
          onClose={() => setDismissedApprovalGate(approvalGateKey)}
          goal={goal}
          onAction={() => {
            fetchGoal();
            onUpdated?.();
          }}
        />
      )}
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          onClose={() => setError('')}
          variant="filled"
          sx={{ fontSize: '0.78rem' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
