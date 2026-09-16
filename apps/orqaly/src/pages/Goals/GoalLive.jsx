import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  LinearProgress,
  Button,
  Paper,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Breadcrumbs,
  Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CancelIcon from '@mui/icons-material/Cancel';
import SignalWifiStatusbar4BarIcon from '@mui/icons-material/SignalWifiStatusbar4Bar';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import LoopIcon from '@mui/icons-material/Loop';

import PageLayout from '../../components/Common/PageLayout';
import GoalLiveCards from '../../components/Goals/GoalLiveCards';
import GoalChatFeed from '../../components/Goals/GoalChatFeed';
import GoalWorkLog from '../../components/Goals/GoalWorkLog';
import GoalProposalDialog from '../../components/Goals/GoalProposalDialog';
import GoalContextApprovalDialog from '../../components/Goals/GoalContextApprovalDialog';
import useGoalRealtime from '../../hooks/useGoalRealtime';
import { pauseGoal, resumeGoal, cancelGoal, resolveGoal } from '../../services/goalService';
import { useState, useEffect } from 'react';
import { currentGoalTaskAttempt } from '../../components/Goals/currentGoalTaskAttempt';
import {
  getGoalQualityReviewNotice,
  getOsjaReviewDisplayState,
} from '../../utils/goalTruthFormatters';

import AppIcon from '../../components/icons/AppIcon';

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
  active: 'success',
  paused: 'warning',
  awaiting_tools: 'warning',
  needs_human: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

const STATUS_LABEL = {
  feasibility: 'Analyzing',
  analyzing: 'Understanding Problem',
  researching_customer: 'Scope Admission',
  awaiting_context_approval: 'Confirm Proposed Scope',
  planning: 'Operational Planning',
  forming_team: 'Forming Team',
  provisioning_tools: 'Setting Up Tools',
  estimating: 'Estimating',
  awaiting_approval: 'Awaiting Approval',
  authorizing_execution: 'Authorizing Execution',
  pending_validation: 'Checking Final Quality',
  active: 'Active',
  paused: 'Paused',
  awaiting_tools: 'Needs Tools',
  needs_human: 'Needs Attention',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export default function GoalLive() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const { goal, logs, messages, tasks, documents, loading, isConnected, refresh } =
    useGoalRealtime(id);
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError] = useState(null);
  const [dismissedApprovalGate, setDismissedApprovalGate] = useState('');
  // Ticker so the local_only worker-heartbeat chip flips to "stalled" as
  // time passes with no new goal_log rows, even if nothing else re-renders.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setDismissedApprovalGate('');
  }, [goal?.id]);

  useEffect(() => {
    if (!['awaiting_context_approval', 'awaiting_approval'].includes(goal?.status)) {
      setDismissedApprovalGate('');
    }
  }, [goal?.status]);

  const handleAction = async (action) => {
    setActionLoading(action);
    setActionError(null);
    try {
      if (action === 'pause') await pauseGoal(id);
      else if (action === 'resume') await resumeGoal(id);
      else if (action === 'cancel') await cancelGoal(id);
      else if (action === 'retry-research') {
        await resolveGoal(id, { type: 'retry_customer_research', data: {} });
      }
      refresh();
    } catch (err) {
      console.error('Goal action failed:', err);
      setActionError({
        action,
        message:
          action === 'retry-research'
            ? 'Unable to retry customer research. Refresh the goal and try again.'
            : 'Unable to update this goal. Refresh and try again.',
      });
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <Box sx={{ maxWidth: 1400, mx: 'auto', pt: 4 }}>
          <LinearProgress sx={{ borderRadius: 2 }} />
        </Box>
      </PageLayout>
    );
  }

  if (!goal) {
    return (
      <PageLayout>
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            Goal not found
          </Typography>
          <Button onClick={() => navigate('/job-pool')} sx={{ mt: 2, textTransform: 'none' }}>
            Back to Requests
          </Button>
        </Box>
      </PageLayout>
    );
  }

  const spent = Number(goal.spent_usd || 0);
  const budget = Number(goal.budget_usd || 1);
  const budgetPct = Math.min(100, (spent / budget) * 100);
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(goal.status);
  const phases = goal.plan?.phases || [];
  const donePhases = phases.filter((p) => p.status === 'completed').length;
  const totalPhases = phases.length;
  const qualityReview = goal.data?.quality_review || null;
  const qualityReviewDisplay = qualityReview ? getOsjaReviewDisplayState(qualityReview) : null;
  const qualityReviewNotice = getGoalQualityReviewNotice(qualityReview);
  const currentTasks = currentGoalTaskAttempt(goal, tasks);

  // Worker heartbeat for compare-mode / local_only goals. Vercel's cron
  // skips these (job-processor.claimNextJob), so they only make progress
  // when `npm run dev:local` is running the localhost poller. Surface
  // that plainly instead of letting the goal sit stuck silently.
  const isLocalOnly = goal?.data?.local_only === true;
  const lastActivityMs =
    logs.length > 0
      ? new Date(logs.at(-1).created_at).getTime()
      : new Date(goal.created_at).getTime();
  const ageSec = Math.max(0, Math.floor((nowMs - lastActivityMs) / 1000));
  const workerStalled = isLocalOnly && !isTerminal && ageSec > 60;

  return (
    <PageLayout>
      <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
        {/* Breadcrumb */}
        <Breadcrumbs sx={{ mb: 1.5, '& .MuiBreadcrumbs-separator': { mx: 0.5 } }}>
          <Link
            component="button"
            variant="caption"
            underline="hover"
            color="text.secondary"
            sx={{
              fontSize: '0.72rem',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              p: 0,
            }}
            onClick={() => navigate('/job-pool')}
          >
            Requests
          </Link>
          <Typography
            variant="caption"
            sx={{ fontSize: '0.72rem', color: 'text.primary', fontWeight: 600 }}
            noWrap
          >
            {goal.title}
          </Typography>
        </Breadcrumbs>

        {/* Header Card */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, sm: 2 },
            mb: 2,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.background.paper, 1)} 60%)`,
          }}
        >
          {/* Title row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <IconButton
              onClick={() => navigate(-1)}
              size="small"
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <AppIcon name="ArrowBack" fallback={ArrowBackIcon} sx={{ fontSize: 18 }} />
            </IconButton>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '0.95rem', sm: '1.1rem' },
                flex: 1,
                minWidth: 0,
              }}
              noWrap
            >
              {goal.title}
            </Typography>
            <Chip
              size="small"
              label={STATUS_LABEL[goal.status] || goal.status}
              color={STATUS_COLOR[goal.status] || 'default'}
              sx={{ fontSize: '0.7rem', height: 24, fontWeight: 700, textTransform: 'capitalize' }}
            />
            {qualityReviewNotice && (
              <Tooltip title={qualityReviewNotice.tooltip}>
                <Chip
                  size="small"
                  label={qualityReviewNotice.label}
                  color={qualityReviewNotice.color}
                  sx={{ fontSize: '0.65rem', height: 22, fontWeight: 700 }}
                />
              </Tooltip>
            )}
            {isLocalOnly && (
              <Tooltip
                title={
                  workerStalled
                    ? `No worker activity in ${ageSec}s. Vercel's cron skips local_only goals - run \`npm run dev:local\` so the localhost poller claims this job.`
                    : `Local worker active (last activity ${ageSec}s ago)`
                }
              >
                <Chip
                  size="small"
                  label={workerStalled ? 'worker stalled' : 'worker: local'}
                  color={workerStalled ? 'error' : 'success'}
                  variant={workerStalled ? 'filled' : 'outlined'}
                  sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
                />
              </Tooltip>
            )}
            {goal.mode && (
              <Chip
                size="small"
                label={`Mode: ${goal.mode}`}
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            )}
            {goal.parsed_category && (
              <Chip
                size="small"
                label={goal.parsed_category}
                variant="outlined"
                color="info"
                sx={{ fontSize: '0.65rem', height: 20, display: { xs: 'none', sm: 'flex' } }}
              />
            )}
            <Tooltip title={isConnected ? 'Live connection' : 'Polling mode'}>
              {isConnected ? (
                <AppIcon
                  name="SignalWifiStatusbar4Bar"
                  fallback={SignalWifiStatusbar4BarIcon}
                  sx={{ fontSize: 16, color: 'success.main' }}
                />
              ) : (
                <AppIcon
                  name="SignalWifiOff"
                  fallback={SignalWifiOffIcon}
                  sx={{ fontSize: 16, color: 'text.disabled' }}
                />
              )}
            </Tooltip>
          </Box>

          {/* Stats row */}
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 1.5, sm: 3 },
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {/* Budget */}
            <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <AppIcon
                  name="AccountBalanceWalletOutlined"
                  fallback={AccountBalanceWalletOutlinedIcon}
                  sx={{ fontSize: 14, color: 'text.disabled' }}
                />
                <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600 }}>
                  ${spent.toFixed(2)} / ${budget.toFixed(2)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.6rem', color: 'text.disabled', ml: 'auto' }}
                >
                  {budgetPct.toFixed(0)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={budgetPct}
                sx={{ height: 5, borderRadius: 3, bgcolor: alpha(theme.palette.divider, 0.15) }}
                color={budgetPct > 90 ? 'error' : budgetPct > 70 ? 'warning' : 'success'}
              />
            </Box>

            {/* Phases */}
            {totalPhases > 0 && (
              <Box sx={{ textAlign: 'center', minWidth: 60 }}>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block' }}
                >
                  Phases
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, lineHeight: 1 }}>
                  {donePhases}/{totalPhases}
                </Typography>
              </Box>
            )}

            {/* Confidence */}
            {goal.confidence_score > 0 && (
              <Box sx={{ textAlign: 'center', minWidth: 60 }}>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block' }}
                >
                  Confidence
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    lineHeight: 1,
                    color:
                      goal.confidence_score >= 70
                        ? 'success.main'
                        : goal.confidence_score >= 40
                          ? 'warning.main'
                          : 'error.main',
                  }}
                >
                  {goal.confidence_score}%
                </Typography>
              </Box>
            )}

            {/* Quality */}
            {(() => {
              const qScores = phases
                .filter((p) => p.quality_score != null)
                .map((p) => p.quality_score);
              const phaseAverage =
                qScores.length > 0
                  ? Math.round(qScores.reduce((a, b) => a + b, 0) / qScores.length)
                  : null;
              const hasTrustedOsjaGrade =
                qualityReviewDisplay &&
                !qualityReviewDisplay.incomplete &&
                qualityReviewDisplay.overallGrade != null;
              const osjaReviewIncomplete = Boolean(qualityReviewDisplay?.incomplete);
              const avgQ = hasTrustedOsjaGrade
                ? qualityReviewDisplay.overallGrade
                : osjaReviewIncomplete
                  ? null
                  : phaseAverage;
              if (avgQ == null && !osjaReviewIncomplete) return null;
              return (
                <Tooltip
                  title={
                    osjaReviewIncomplete
                      ? 'The Osja artifact review is incomplete. Its aggregate grade is hidden until every review result is schema-validated.'
                      : hasTrustedOsjaGrade
                        ? 'Independent Osja artifact review. Phase execution scores are shown inside each phase.'
                        : 'Average semantic phase-evaluation score. Osja artifact review is not available yet.'
                  }
                >
                  <Box sx={{ textAlign: 'center', minWidth: 72 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block' }}
                    >
                      {hasTrustedOsjaGrade || osjaReviewIncomplete
                        ? 'Osja quality'
                        : 'Phase quality'}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        lineHeight: 1,
                        color: osjaReviewIncomplete
                          ? 'error.main'
                          : avgQ >= 70
                            ? 'success.main'
                            : avgQ >= 40
                              ? 'warning.main'
                              : 'error.main',
                      }}
                    >
                      {osjaReviewIncomplete ? '—' : `${avgQ}%`}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })()}

            {/* Iteration */}
            <Box
              sx={{
                textAlign: 'center',
                minWidth: 60,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <AppIcon
                name="Loop"
                fallback={LoopIcon}
                sx={{ fontSize: 14, color: 'text.disabled' }}
              />
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block' }}
                >
                  Iteration
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, lineHeight: 1 }}>
                  {goal.iteration || 0}/{goal.max_iterations || 5}
                </Typography>
              </Box>
            </Box>

            {/* Actions */}
            {!isTerminal && (
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                {goal.status === 'active' && (
                  <Tooltip title="Pause">
                    <IconButton
                      size="small"
                      color="warning"
                      onClick={() => handleAction('pause')}
                      disabled={!!actionLoading}
                      sx={{
                        border: '1px solid',
                        borderColor: alpha(theme.palette.warning.main, 0.3),
                        borderRadius: 2,
                      }}
                    >
                      <AppIcon name="Pause" fallback={PauseIcon} sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
                {goal.status === 'paused' && (
                  <Tooltip title="Resume">
                    <IconButton
                      size="small"
                      color="success"
                      onClick={() => handleAction('resume')}
                      disabled={!!actionLoading}
                      sx={{
                        border: '1px solid',
                        borderColor: alpha(theme.palette.success.main, 0.3),
                        borderRadius: 2,
                      }}
                    >
                      <AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Cancel">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleAction('cancel')}
                    disabled={!!actionLoading}
                    sx={{
                      border: '1px solid',
                      borderColor: alpha(theme.palette.error.main, 0.3),
                      borderRadius: 2,
                    }}
                  >
                    <AppIcon name="Cancel" fallback={CancelIcon} sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Active Tasks - in-flight output visible while goal is running.
            Previously users had to wait for goal.data.project_overview
            (populated only at complete.js) to see any deliverable. This
            panel surfaces team_tasks.data.output in real time via the
            Supabase subscription in useGoalRealtime. Hidden once the goal
            reaches a terminal state - GoalDetailDialog covers that case. */}
        {!isTerminal && currentTasks.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: { xs: 1.5, sm: 2 },
              mb: 2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 1 }}>
              Active tasks (
              {
                currentTasks.filter((t) =>
                  ['todo', 'inProgress', 'done', 'failed'].includes(t.status)
                ).length
              }
              )
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {currentTasks
                .filter((t) => ['todo', 'inProgress', 'done', 'failed'].includes(t.status))
                .slice(-8)
                .map((t) => {
                  const out = String(t.data?.output || '').trim();
                  const statusColor =
                    t.status === 'done'
                      ? 'success'
                      : t.status === 'failed'
                        ? 'error'
                        : t.status === 'inProgress'
                          ? 'info'
                          : 'default';
                  return (
                    <Box
                      key={t.id}
                      sx={{
                        p: 1,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: alpha(theme.palette.background.default, 0.4),
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 0.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography
                          sx={{ fontSize: '0.78rem', fontWeight: 700, flex: 1, minWidth: 0 }}
                          noWrap
                        >
                          {t.title || '(untitled)'}
                        </Typography>
                        <Chip
                          size="small"
                          label={t.status}
                          color={statusColor}
                          sx={{ height: 18, fontSize: '0.6rem' }}
                        />
                        {t.assigned_to && (
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.65rem', color: 'text.secondary' }}
                          >
                            {t.assigned_to}
                          </Typography>
                        )}
                      </Box>
                      {out && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.7rem',
                            color: 'text.secondary',
                            display: 'block',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {out.slice(0, 200)}
                          {out.length > 200 ? '\u2026' : ''}
                        </Typography>
                      )}
                      {t.data?.validation_reason && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.65rem',
                            color: 'error.main',
                            display: 'block',
                            mt: 0.5,
                          }}
                        >
                          rejected: {t.data.validation_reason}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
            </Box>
          </Paper>
        )}

        {/* Bento Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '7fr 5fr' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          {/* Left column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Pipeline Cards */}
            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 1.5 }}
              >
                Pipeline Progress
              </Typography>
              <GoalLiveCards
                goal={{ ...goal, tasks: currentTasks }}
                logs={logs}
                onRetryResearch={() => handleAction('retry-research')}
                researchRetrying={actionLoading === 'retry-research'}
                researchRetryError={
                  actionLoading !== 'retry-research' && actionError?.action === 'retry-research'
                    ? actionError.message
                    : ''
                }
              />
            </Paper>

            {/* Work Log */}
            <GoalWorkLog
              goal={goal}
              tasks={currentTasks}
              documents={documents}
              messages={messages}
              logs={logs}
            />
          </Box>

          {/* Right column - Activity Feed */}
          <Paper
            elevation={0}
            sx={{
              p: 0,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              height: { xs: 'auto', md: 'calc(100vh - 200px)' },
              minHeight: { xs: 320, md: 500 },
              maxHeight: { xs: 500, md: 'none' },
              position: { md: 'sticky' },
              top: { md: 16 },
            }}
          >
            <Box
              sx={{
                px: 2,
                pt: 1.5,
                pb: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                Activity Feed
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <GoalChatFeed logs={logs} messages={messages} maxHeight="100%" goalId={id} />
            </Box>
          </Paper>
        </Box>
      </Box>
      {/* Proposal dialog */}
      {goal.status === 'awaiting_context_approval' && (
        <GoalContextApprovalDialog
          open={dismissedApprovalGate !== `${goal.id}:${goal.status}`}
          onClose={() => setDismissedApprovalGate(`${goal.id}:${goal.status}`)}
          goal={goal}
          onAction={() => refresh()}
        />
      )}
      {goal.status === 'awaiting_approval' && (
        <GoalProposalDialog
          open={dismissedApprovalGate !== `${goal.id}:${goal.status}`}
          onClose={() => setDismissedApprovalGate(`${goal.id}:${goal.status}`)}
          goal={goal}
          onAction={() => refresh()}
        />
      )}
    </PageLayout>
  );
}
