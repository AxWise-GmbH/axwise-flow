import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Tab, Tabs, Typography, alpha, useTheme } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import GlassIcon from '../../icons/GlassIcon';
import { PipelineTab, WorkLogTab, ReportTab, ResultTab } from '../../Goals/GoalDetailDialog';
import GoalAgentDetailHost from '../../Goals/GoalAgentDetailHost';
import GoalContextApprovalDialog from '../../Goals/GoalContextApprovalDialog';
import GoalProposalDialog from '../../Goals/GoalProposalDialog';
import useProfileIndex from '../../../hooks/useProfileIndex';
import { isTerminalStatus } from './runStageCopy';
import GoalProgressRail from './GoalProgressRail';

const TABS = [
  {
    key: 'pipeline',
    label: 'Pipeline',
    icon: 'AccountTreeOutlined',
    fallback: AccountTreeOutlinedIcon,
  },
  {
    key: 'worklog',
    label: 'Work Log',
    icon: 'AssignmentOutlined',
    fallback: AssignmentOutlinedIcon,
  },
  { key: 'report', label: 'Report', icon: 'SummarizeOutlined', fallback: SummarizeOutlinedIcon },
  { key: 'result', label: 'Result', icon: 'InventoryOutlined', fallback: InventoryOutlinedIcon },
];

/**
 * Option A: the running goal as a dashboard.
 *
 * The four tabs Simple mode used to only advertise. Each renders the component
 * the full goal view already uses, so this is the same depth as /goals/:id
 * without leaving the flow — nothing here reimplements a panel.
 *
 * The tab strip is a real tablist with arrow-key navigation. The labels used to
 * be plain Typography under aria-hidden with no role and no click handler.
 */
export default function GoalDashboard({
  goal,
  logs = [],
  messages = [],
  tasks = [],
  onRefresh,
  onSetupTools,
}) {
  const theme = useTheme();
  const profileIndex = useProfileIndex(Boolean(goal?.id));
  const [tab, setTab] = useState(0);
  const [dismissedGate, setDismissedGate] = useState('');
  const pickedRef = useRef(false);

  // PipelineTab and WorkLogTab read goal.logs, but useGoalRealtime keeps the
  // log stream separate from the goal row. Recompose rather than teach every
  // panel a second shape.
  const goalWithLogs = useMemo(
    () => (goal ? { ...goal, logs: logs.length ? logs : goal.logs || [] } : null),
    [goal, logs]
  );

  // Terminal goals open on Result, because the deliverables are the point.
  // Running goals open on Pipeline. Once only, so a live update can never yank
  // the tab out from under someone reading.
  useEffect(() => {
    if (!goal?.status || pickedRef.current) return;
    pickedRef.current = true;
    setTab(isTerminalStatus(goal.status) ? 3 : 0);
  }, [goal?.status]);

  if (!goalWithLogs) return null;

  const gateKey = `${goalWithLogs.id}:${goalWithLogs.status}`;
  const gateOpen = dismissedGate !== gateKey;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <Tabs
        value={tab}
        onChange={(_, next) => setTab(next)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Goal detail"
        sx={{
          minHeight: 0,
          flexShrink: 0,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '& .MuiTab-root': {
            minHeight: 42,
            textTransform: 'none',
            fontSize: '0.76rem',
            fontWeight: 600,
            gap: 0.75,
          },
        }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.key}
            iconPosition="start"
            icon={<GlassIcon name={t.icon} fallback={t.fallback} size={15} />}
            label={t.label}
          />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pt: 2 }}>
        {tab === 0 && (
          <Box sx={{ mb: 2 }}>
            {/* How far along, in one glance. GoalLiveCards still renders the
                nine stage cards below for which stage. */}
            <GoalProgressRail
              status={goalWithLogs.status}
              scopeFirst={Boolean(goalWithLogs.data?.scope_admission)}
            />
          </Box>
        )}
        {tab === 0 && (
          <PipelineTab
            goal={goalWithLogs}
            theme={theme}
            messages={messages}
            profileIndex={profileIndex}
            onSetupTools={onSetupTools}
            onOpenWorkLog={() => setTab(1)}
          />
        )}
        {tab === 1 && (
          <WorkLogTab goal={goalWithLogs} messages={messages} profileIndex={profileIndex} />
        )}
        {tab === 2 && (
          <ReportTab
            goal={goalWithLogs}
            theme={theme}
            messages={messages}
            profileIndex={profileIndex}
          />
        )}
        {tab === 3 && <ResultTab goal={goalWithLogs} theme={theme} />}

        {tasks.length === 0 && tab === 1 && (
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1, color: 'text.disabled', px: 0.5 }}
          >
            No tasks yet. They appear once the plan is broken into phases.
          </Typography>
        )}
      </Box>

      {/* Agent cards inside PipelineTab route clicks to window.__openAgentDetail,
          which only exists while this host is mounted. Without it they are dead. */}
      <GoalAgentDetailHost goal={goalWithLogs} profileIndex={profileIndex} />

      {/* The gates. Without these a checkpoints goal cannot be resolved from
          here, and the run simply stops with no way forward. */}
      {goalWithLogs.status === 'awaiting_context_approval' && (
        <GoalContextApprovalDialog
          open={gateOpen}
          onClose={() => setDismissedGate(gateKey)}
          goal={goalWithLogs}
          onAction={() => onRefresh?.()}
        />
      )}
      {goalWithLogs.status === 'awaiting_approval' && (
        <GoalProposalDialog
          open={gateOpen}
          onClose={() => setDismissedGate(gateKey)}
          goal={goalWithLogs}
          onAction={() => onRefresh?.()}
        />
      )}
    </Box>
  );
}

export { TABS as GOAL_DASHBOARD_TABS };
