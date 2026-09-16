import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  LinearProgress,
  Collapse,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import ThumbDownAltOutlinedIcon from '@mui/icons-material/ThumbDownAltOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import DesignReviewDialog from '../DesignReview/DesignReviewDialog';

import AppIcon from '../icons/AppIcon';

const PIPELINE_STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'processing', label: 'Processing' },
  { key: 'agent_working', label: 'Agent Working' },
  { key: 'review', label: 'Review' },
  { key: 'complete', label: 'Complete' },
];

function getStageIndex(request, job) {
  if (!request) return 0;
  // Failed
  if (request.status === 'failed') return -1;
  // Completed
  if (job?.status === 'completed' || request.status === 'completed') return 4;
  // Pending approval
  if (job?.approvalStatus === 'pending_approval') return 3;
  // Agent is working (job exists and is active)
  if (job?.status === 'active' && job?.assignedAgentId) return 2;
  // Processing (job created or request being parsed)
  if (request.status === 'processing' || request.resultJobId) return 1;
  // Just submitted
  return 0;
}

const STATUS_COLORS = {
  pending: { bg: '#FEF3C7', color: '#D97706' },
  processing: { bg: '#DBEAFE', color: '#2563EB' },
  completed: { bg: '#D1FAE5', color: '#059669' },
  rejected: { bg: '#FEE2E2', color: '#DC2626' },
  failed: { bg: '#FEE2E2', color: '#DC2626' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatCost(cost) {
  if (!cost || cost === 0) return null;
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

export default function RequestProgressCard({
  request,
  job,
  tasks = [],
  onApprove,
  onReject,
  onRetry,
  onViewReport,
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [outputDialog, setOutputDialog] = useState(null);
  const [designReviewOpen, setDesignReviewOpen] = useState(false);

  // Deployment URL surfaces from either the goal itself or one of the task
  // outputs (Frontend Developer often writes "DEPLOYMENT_URL: <url>" at the
  // end of its task output). We use the first match in priority order so the
  // Review button shows up the moment the agent finishes Phase 2.
  const goalId = request?.goalId || job?.goalId || request?.goal_id;
  const deploymentUrl = (() => {
    if (request?.deploymentUrl) return request.deploymentUrl;
    if (job?.deploymentUrl) return job.deploymentUrl;
    for (const t of tasks) {
      const out = t.data?.output || '';
      const match = out.match(/DEPLOYMENT_URL:\s*(https?:\/\/\S+)/i);
      if (match) return match[1].trim();
      const wd = out.match(/(https?:\/\/[a-z0-9-]+\.workers\.dev[^\s)]*)/i);
      if (wd) return wd[1];
    }
    return null;
  })();
  const canReview = Boolean(goalId && deploymentUrl);

  const stageIndex = getStageIndex(request, job);
  const isFailed = stageIndex === -1;
  const progress = isFailed ? 0 : (stageIndex / (PIPELINE_STAGES.length - 1)) * 100;
  const isComplete = stageIndex === 4;
  const isPendingApproval = stageIndex === 3;

  const statusKey = request.status || 'pending';
  const statusColor = STATUS_COLORS[statusKey] || STATUS_COLORS.pending;

  const title = request.parsedTitle || request.requestText?.slice(0, 60) || 'Untitled Request';
  const category = request.parsedCategory;
  const priority = request.parsedPriority;
  const agentName = job?.assignedAgentName;

  const jobTasks = tasks.filter((t) => t.jobPoolId === job?.id);
  const doneTasks = jobTasks.filter((t) => t.status === 'done');
  const totalCost = doneTasks.reduce((sum, t) => sum + (t.data?.llmCost || 0), 0);
  const totalDuration = doneTasks.reduce((sum, t) => sum + (t.data?.llmDurationMs || 0), 0);
  const costLabel = formatCost(totalCost || request.costUsd);

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: '1px solid',
          borderColor: isFailed
            ? alpha(theme.palette.error.main, 0.4)
            : isComplete
              ? alpha(theme.palette.success.main, 0.3)
              : alpha(theme.palette.divider, 0.6),
          bgcolor: isFailed
            ? alpha(theme.palette.error.main, 0.03)
            : isComplete
              ? alpha(theme.palette.success.main, 0.03)
              : 'background.paper',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: createHoverGlowShadow(theme),
          },
        }}
      >
        {/* Header row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 1.5,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.3 }}
              noWrap
            >
              {title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {category && (
                <Chip
                  label={category}
                  size="small"
                  sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                />
              )}
              {priority && (
                <Chip
                  label={priority}
                  size="small"
                  color={priority === 'urgent' || priority === 'high' ? 'error' : 'default'}
                  variant="outlined"
                  sx={{
                    height: 22,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                />
              )}
              {costLabel && (
                <Chip
                  icon={
                    <AppIcon name="AttachMoney" fallback={AttachMoneyIcon} sx={{ fontSize: 14 }} />
                  }
                  label={costLabel}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                />
              )}
            </Box>
          </Box>
          <Chip
            label={
              isFailed
                ? 'Failed'
                : isComplete
                  ? 'Complete'
                  : isPendingApproval
                    ? 'Review'
                    : statusKey
            }
            size="small"
            sx={{
              bgcolor: isFailed
                ? STATUS_COLORS.failed.bg
                : isComplete
                  ? STATUS_COLORS.completed.bg
                  : isPendingApproval
                    ? '#EDE9FE'
                    : statusColor.bg,
              color: isFailed
                ? STATUS_COLORS.failed.color
                : isComplete
                  ? STATUS_COLORS.completed.color
                  : isPendingApproval
                    ? '#7C3AED'
                    : statusColor.color,
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 24,
              textTransform: 'capitalize',
            }}
          />
        </Box>

        {/* Failed error message */}
        {isFailed && request.processingNotes && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              p: 1.5,
              mb: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.error.main, 0.06),
              border: '1px solid',
              borderColor: alpha(theme.palette.error.main, 0.2),
            }}
          >
            <AppIcon
              name="ErrorOutline"
              fallback={ErrorOutlineIcon}
              sx={{ fontSize: 18, color: 'error.main', mt: 0.1 }}
            />
            <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 500 }}>
              {request.processingNotes}
            </Typography>
          </Box>
        )}

        {/* Pipeline progress */}
        {!isFailed && (
          <Box sx={{ mb: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                '& .MuiLinearProgress-bar': {
                  borderRadius: 3,
                  bgcolor: isComplete ? 'success.main' : 'primary.main',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
              {PIPELINE_STAGES.map((stage, i) => (
                <Typography
                  key={stage.key}
                  variant="caption"
                  sx={{
                    fontSize: '0.6rem',
                    fontWeight: i <= stageIndex ? 700 : 400,
                    color:
                      i <= stageIndex
                        ? isComplete
                          ? 'success.main'
                          : 'primary.main'
                        : 'text.disabled',
                    textAlign: 'center',
                    flex: 1,
                  }}
                >
                  {stage.label}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Meta row */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {agentName && (
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <AppIcon name="SyncOutlined" fallback={SyncOutlinedIcon} sx={{ fontSize: 14 }} />{' '}
                {agentName}
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {timeAgo(request.createdAt)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {isFailed && onRetry && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<AppIcon name="Replay" fallback={ReplayIcon} sx={{ fontSize: 16 }} />}
                onClick={() => onRetry(request)}
                sx={{ fontSize: '0.7rem', py: 0.25, px: 1.5, textTransform: 'none' }}
              >
                Retry
              </Button>
            )}
            {isPendingApproval && onApprove && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disableElevation
                  startIcon={
                    <AppIcon
                      name="ThumbUpAltOutlined"
                      fallback={ThumbUpAltOutlinedIcon}
                      sx={{ fontSize: 16 }}
                    />
                  }
                  onClick={() => onApprove(job.id, 'approved')}
                  sx={{ fontSize: '0.7rem', py: 0.25, px: 1.5, textTransform: 'none' }}
                >
                  Approve
                </Button>
                {onReject && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={
                      <AppIcon
                        name="ThumbDownAltOutlined"
                        fallback={ThumbDownAltOutlinedIcon}
                        sx={{ fontSize: 16 }}
                      />
                    }
                    onClick={() => onReject(job.id, 'rejected')}
                    sx={{ fontSize: '0.7rem', py: 0.25, px: 1.5, textTransform: 'none' }}
                  >
                    Reject
                  </Button>
                )}
              </>
            )}
            {isComplete && onViewReport && job?.reportId && (
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  <AppIcon
                    name="DescriptionOutlined"
                    fallback={DescriptionOutlinedIcon}
                    sx={{ fontSize: 16 }}
                  />
                }
                onClick={() => onViewReport(job.reportId)}
                sx={{ fontSize: '0.7rem', py: 0.25, px: 1.5, textTransform: 'none' }}
              >
                View Report
              </Button>
            )}
            {canReview && (
              <Button
                size="small"
                variant="outlined"
                color="primary"
                startIcon={
                  <AppIcon
                    name="RateReviewOutlined"
                    fallback={RateReviewOutlinedIcon}
                    sx={{ fontSize: 16 }}
                  />
                }
                onClick={() => setDesignReviewOpen(true)}
                sx={{ fontSize: '0.7rem', py: 0.25, px: 1.5, textTransform: 'none' }}
              >
                Review design
              </Button>
            )}
            {jobTasks.length > 0 && (
              <IconButton size="small" onClick={() => setExpanded((p) => !p)}>
                {expanded ? (
                  <AppIcon name="ExpandLess" fallback={ExpandLessIcon} sx={{ fontSize: 18 }} />
                ) : (
                  <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            )}
          </Box>
        </Box>

        {/* Expandable task details with outputs */}
        <Collapse in={expanded}>
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, mb: 1, display: 'block', color: 'text.secondary' }}
            >
              Tasks ({doneTasks.length}/{jobTasks.length})
              {totalDuration > 0 && ` \u00B7 ${(totalDuration / 1000).toFixed(1)}s`}
            </Typography>
            {jobTasks.map((task) => {
              const taskCost = formatCost(task.data?.llmCost);
              const hasOutput = task.status === 'done' && task.data?.output;
              return (
                <Box key={task.id} sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {task.status === 'done' ? (
                      <AppIcon
                        name="CheckCircleOutline"
                        fallback={CheckCircleOutlineIcon}
                        sx={{ fontSize: 16, color: 'success.main' }}
                      />
                    ) : task.status === 'inProgress' ? (
                      <AppIcon
                        name="SyncOutlined"
                        fallback={SyncOutlinedIcon}
                        sx={{ fontSize: 16, color: 'primary.main' }}
                      />
                    ) : (
                      <AppIcon
                        name="HourglassEmptyOutlined"
                        fallback={HourglassEmptyOutlinedIcon}
                        sx={{ fontSize: 16, color: 'text.disabled' }}
                      />
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        flex: 1,
                        color: task.status === 'done' ? 'text.secondary' : 'text.primary',
                        fontWeight: 500,
                      }}
                    >
                      {task.title}
                    </Typography>
                    {taskCost && (
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                      >
                        {taskCost}
                      </Typography>
                    )}
                  </Box>
                  {/* Task output preview */}
                  {hasOutput && (
                    <Box
                      sx={{
                        ml: 3.5,
                        mt: 0.5,
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                        cursor: 'pointer',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                      }}
                      onClick={() =>
                        setOutputDialog({ title: task.title, output: task.data.output })
                      }
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.7rem',
                          whiteSpace: 'pre-line',
                          lineHeight: 1.5,
                        }}
                      >
                        {task.data.output.slice(0, 300)}
                        {task.data.output.length > 300 ? '...' : ''}
                      </Typography>
                      {task.data.output.length > 300 && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'primary.main',
                            display: 'block',
                            mt: 0.5,
                            fontWeight: 600,
                            fontSize: '0.65rem',
                          }}
                        >
                          View full output
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Collapse>
      </Paper>
      {/* Full output dialog */}
      <Dialog open={!!outputDialog} onClose={() => setOutputDialog(null)} maxWidth="md" fullWidth>
        {outputDialog && (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>{outputDialog.title}</DialogTitle>
            <DialogContent dividers>
              <Typography
                sx={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  lineHeight: 1.7,
                  fontSize: '0.9rem',
                }}
              >
                {outputDialog.output}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOutputDialog(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      {canReview && (
        <DesignReviewDialog
          open={designReviewOpen}
          onClose={() => setDesignReviewOpen(false)}
          goalId={goalId}
          deploymentUrl={deploymentUrl}
        />
      )}
    </>
  );
}
