import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNotifications } from '../../context/NotificationContext';
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  Alert,
  LinearProgress,
  Collapse,
  Divider,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import GlassIcon from '../../components/icons/GlassIcon';

import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import EmptyState from '../../components/Common/EmptyState';
import LoadingSpinner from '../../components/Common/LoadingSpinner';

import GoalCreateDialog from '../../components/Goals/GoalCreateDialog';
import GoalDetailDialog from '../../components/Goals/GoalDetailDialog';
import TeamToolDialog from '../../components/Goals/TeamToolDialog';
import GoalProposalDialog from '../../components/Goals/GoalProposalDialog';
import GoalContextApprovalDialog from '../../components/Goals/GoalContextApprovalDialog';

import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { listGoals, provideTools } from '../../services/goalService';

// ── Status config ──────────────────────────────────────────────
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

const TABS = ['all', 'active', 'completed', 'failed'];

// ── Goal Card ──────────────────────────────────────────────────
function GoalCard({ goal, onClick, onLogClick }) {
  const theme = useTheme();
  const spent = Number(goal.spent_usd || 0);
  const budget = Number(goal.budget_usd || 1);
  const budgetPct = Math.min(100, (spent / budget) * 100);
  const phases = goal.plan?.phases || [];
  const completedPhases = phases.filter((p) => p.status === 'completed').length;

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2,
        borderRadius: 2.5,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.12),
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
        transition: 'border-color 0.2s',
        '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.3) },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <GlassIcon name="TrackChanges" fallback={TrackChangesOutlinedIcon} size={20} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }} noWrap>
              {goal.title}
            </Typography>
            <Chip
              size="small"
              label={goal.status}
              color={STATUS_COLOR[goal.status] || 'default'}
              sx={{ fontSize: '0.6rem', height: 20, fontWeight: 600 }}
            />
          </Box>

          {/* Budget bar */}
          <Box sx={{ mb: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                ${spent.toFixed(2)} / ${budget.toFixed(2)}
              </Typography>
              {phases.length > 0 && (
                <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                  {completedPhases}/{phases.length} phases
                </Typography>
              )}
            </Box>
            <LinearProgress
              variant="determinate"
              value={budgetPct}
              color={budgetPct > 90 ? 'error' : budgetPct > 70 ? 'warning' : 'primary'}
              sx={{ height: 4, borderRadius: 2 }}
            />
          </Box>

          {/* Strategy chip */}
          {goal.plan?.strategy && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.65rem',
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {goal.plan.strategy}
            </Typography>
          )}

          {/* Iteration + Loop + Log */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {goal.iteration > 0 && (
              <Chip
                size="small"
                label={`Iter ${goal.iteration}/${goal.max_iterations}`}
                variant="outlined"
                sx={{ fontSize: '0.55rem', height: 16 }}
              />
            )}
            {goal.loop_enabled && (
              <Chip
                size="small"
                label={goal.loop_paused ? '🔁 Loop paused' : '🔁 Looped'}
                color={goal.loop_paused ? 'warning' : 'primary'}
                variant={goal.loop_paused ? 'outlined' : 'filled'}
                sx={{ fontSize: '0.55rem', height: 16 }}
              />
            )}
            {(goal.loop_depth > 0 || goal.continuation_goal_id) && goal.chain_spend && (
              <Chip
                size="small"
                label={`$${Number(goal.chain_spend.spent_usd || 0).toFixed(2)} · ${goal.chain_spend.goal_count || 1} goals`}
                variant="outlined"
                sx={{ fontSize: '0.55rem', height: 16 }}
              />
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Activity Log" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onLogClick?.();
                }}
                sx={{ p: 0.5, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
              >
                <GlassIcon
                  name="HistoryOutlined"
                  fallback={HistoryOutlinedIcon}
                  size={16}
                  tone="neutral"
                />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function Goals() {
  const { isSimple } = useSimpleMode();
  const theme = useTheme();
  const { pushNotification } = useNotifications();
  const [showMetrics, setShowMetrics] = useShowMetrics('goals');

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState(0);
  const [toolGoal, setToolGoal] = useState(null); // goal awaiting tools
  const [proposalGoal, setProposalGoal] = useState(null); // goal awaiting approval
  const [contextGoal, setContextGoal] = useState(null); // goal awaiting context confirmation
  const toolGoalRef = useRef(null);
  const dismissedGoalIds = useRef(new Set());

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listGoals();
      const list = Array.isArray(data) ? data : [];
      setGoals(list);

      // Notify about goals awaiting tools (don't auto-open dialog)
      if (!toolGoalRef.current) {
        const awaiting = list.find(
          (g) => g.status === 'awaiting_tools' && !dismissedGoalIds.current.has(g.id)
        );
        if (awaiting && pushNotification) {
          pushNotification(
            'Tools Required',
            `"${awaiting.title || awaiting.id}" needs API keys to proceed. Open the goal to set up tools.`
          );
        }
      }

      // Auto-detect goal awaiting approval (show proposal dialog)
      if (!contextGoal) {
        const awaitingContext = list.find(
          (g) =>
            g.status === 'awaiting_context_approval' &&
            !dismissedGoalIds.current.has(`context:${g.id}`)
        );
        if (awaitingContext) setContextGoal(awaitingContext);
      }

      if (!proposalGoal) {
        const awaitingApproval = list.find(
          (g) => g.status === 'awaiting_approval' && !dismissedGoalIds.current.has(g.id)
        );
        if (awaitingApproval) setProposalGoal(awaitingApproval);
      }
    } catch (err) {
      setError(err.message || 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Poll for status changes (planning → awaiting_tools) every 8s
  useEffect(() => {
    const needsPolling = goals.some((g) =>
      [
        'feasibility',
        'analyzing',
        'researching_customer',
        'awaiting_context_approval',
        'planning',
        'forming_team',
        'provisioning_tools',
        'estimating',
        'awaiting_approval',
        'awaiting_po_input',
        'awaiting_tools',
        'active',
        'pending_validation',
      ].includes(g.status)
    );
    if (!needsPolling) return;
    const interval = setInterval(fetchGoals, 8000);
    return () => clearInterval(interval);
  }, [goals, fetchGoals]);

  const metrics = useMemo(() => {
    const m = { total: goals.length, active: 0, completed: 0, totalSpent: 0, totalBudget: 0 };
    for (const g of goals) {
      if (['active', 'researching_customer', 'planning', 'pending_validation'].includes(g.status))
        m.active++;
      if (g.status === 'completed') m.completed++;
      m.totalSpent += Number(g.spent_usd || 0);
      m.totalBudget += Number(g.budget_usd || 0);
    }
    return m;
  }, [goals]);

  const filtered = useMemo(() => {
    if (tab === 'all') return goals;
    if (tab === 'active')
      return goals.filter((g) =>
        ['active', 'researching_customer', 'planning', 'pending_validation'].includes(g.status)
      );
    return goals.filter((g) => g.status === tab);
  }, [goals, tab]);

  if (loading) return <LoadingSpinner />;

  return (
    <PageLayout showTitleBlock={false}>
      <Box sx={{ maxWidth: isSimple ? 900 : undefined, mx: isSimple ? 'auto' : undefined }}>
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <BentoCard
          title="Goals"
          pageInfoPath="/job-pool"
          subtitle={`${metrics.active} active goal${metrics.active !== 1 ? 's' : ''}`}
          icon={TrackChangesOutlinedIcon}
          iconColor={theme.palette.primary.main}
          action={
            <MetricsToggleButton
              showMetrics={showMetrics}
              onToggle={() => setShowMetrics(!showMetrics)}
            />
          }
        >
          {/* Metrics */}
          <Collapse in={showMetrics}>
            <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', mb: 2 }}>
              {[
                { label: 'Total Goals', value: metrics.total, color: theme.palette.primary.main },
                { label: 'Active', value: metrics.active, color: theme.palette.success.main },
                { label: 'Completed', value: metrics.completed, color: theme.palette.info.main },
                {
                  label: 'Total Spent',
                  value: `$${metrics.totalSpent.toFixed(2)}`,
                  color: theme.palette.warning.main,
                },
              ].map((m) => (
                <Paper
                  key={m.label}
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2.5,
                    minWidth: 120,
                    flex: '1 1 120px',
                    background: `linear-gradient(135deg, ${alpha(m.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 100%)`,
                    border: '1px solid',
                    borderColor: alpha(m.color, 0.22),
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 2,
                      bgcolor: alpha(m.color, 0.16),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 0.5,
                    }}
                  >
                    <GlassIcon
                      name="TrackChanges"
                      fallback={TrackChangesOutlinedIcon}
                      size={18}
                      tone={m.color}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {m.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.35rem' }}>{m.value}</Typography>
                </Paper>
              ))}
            </Box>
          </Collapse>

          {/* Tab bar + Create button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                borderRadius: 2.5,
                p: 0.5,
              }}
            >
              {TABS.map((t) => (
                <Button
                  key={t}
                  size="small"
                  onClick={() => setTab(t)}
                  sx={{
                    borderRadius: 2.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    minHeight: 36,
                    minWidth: 'auto',
                    px: 1.5,
                    bgcolor: tab === t ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    color: tab === t ? 'primary.main' : 'text.secondary',
                    boxShadow:
                      tab === t ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </Box>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              size="small"
              startIcon={<GlassIcon name="AddOutlined" fallback={AddOutlinedIcon} size={18} />}
              onClick={() => setCreateOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', borderRadius: 2 }}
            >
              New Goal
            </Button>
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {/* Goal list */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={TrackChangesOutlinedIcon}
              title={tab !== 'all' ? `No ${tab} goals` : 'No goals yet'}
              description="Create your first goal and let the system work autonomously"
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {filtered.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onClick={() => {
                    setDetailInitialTab(0);
                    setDetailId(g.id);
                  }}
                  onLogClick={() => {
                    setDetailInitialTab(1);
                    setDetailId(g.id);
                  }}
                />
              ))}
            </Box>
          )}
        </BentoCard>

        <GoalCreateDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => fetchGoals()}
        />

        <GoalDetailDialog
          open={!!detailId}
          onClose={() => setDetailId(null)}
          goalId={detailId}
          initialTab={detailInitialTab}
          onUpdated={() => fetchGoals()}
          onSetupTools={(goal) => {
            dismissedGoalIds.current.delete(goal.id);
            toolGoalRef.current = goal;
            setToolGoal(goal);
          }}
          onOpenContinuation={(continuationId) => {
            // Loop chain hop: close the current goal and open its continuation.
            // setDetailId(null) is implicit because the child calls onClose() too,
            // but we also re-open the next id on the next tick to give the
            // dialog a clean unmount.
            setDetailInitialTab(0);
            setTimeout(() => setDetailId(continuationId), 0);
          }}
        />

        <TeamToolDialog
          open={!!toolGoal}
          onClose={() => {
            dismissedGoalIds.current.add(toolGoal?.id);
            toolGoalRef.current = null;
            setToolGoal(null);
          }}
          goalId={toolGoal?.id}
          goalTitle={toolGoal?.title}
          toolIds={toolGoal?.data?.unconfigured_tools || []}
          onAllConfigured={async () => {
            if (toolGoal?.id) {
              try {
                await provideTools(toolGoal.id);
              } catch (err) {
                setError(err.message || 'Failed to activate goal after tool setup');
                return;
              }
            }
            dismissedGoalIds.current.delete(toolGoal?.id);
            toolGoalRef.current = null;
            setToolGoal(null);
            fetchGoals();
          }}
          onSkip={async () => {
            if (toolGoal?.id) {
              try {
                await provideTools(toolGoal.id, { skip: true });
              } catch (err) {
                setError(err.message || 'Failed to skip tools');
              }
            }
            dismissedGoalIds.current.delete(toolGoal?.id);
            toolGoalRef.current = null;
            setToolGoal(null);
            fetchGoals();
          }}
        />

        <GoalProposalDialog
          open={!!proposalGoal}
          onClose={() => {
            dismissedGoalIds.current.add(proposalGoal?.id);
            setProposalGoal(null);
          }}
          goal={proposalGoal}
          onAction={() => {
            dismissedGoalIds.current.delete(proposalGoal?.id);
            setProposalGoal(null);
            fetchGoals();
          }}
        />
        <GoalContextApprovalDialog
          open={!!contextGoal}
          onClose={() => {
            if (contextGoal?.id) dismissedGoalIds.current.add(`context:${contextGoal.id}`);
            setContextGoal(null);
          }}
          goal={contextGoal}
          onAction={() => {
            if (contextGoal?.id) dismissedGoalIds.current.delete(`context:${contextGoal.id}`);
            setContextGoal(null);
            fetchGoals();
          }}
        />
      </Box>
    </PageLayout>
  );
}
