import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  DialogContentText,
  Tabs,
  Tab,
  Button,
  Collapse,
  CircularProgress,
  useTheme,
  alpha,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Popover,
  Autocomplete,
  useMediaQuery,
  ToggleButtonGroup,
  ToggleButton,
  Snackbar,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import TuneIcon from '@mui/icons-material/Tune';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import TroubleshootOutlinedIcon from '@mui/icons-material/TroubleshootOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import DoNotDisturbAltOutlinedIcon from '@mui/icons-material/DoNotDisturbAltOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import FormDialog from '../../components/Common/FormDialog';
import PageLayout from '../../components/Common/PageLayout';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import EmptyState from '../../components/Common/EmptyState';
import { useJobs } from '../../hooks/useJobs';
import { useRequests } from '../../hooks/useRequests';
import { useConcilium } from '../../hooks/useConcilium';
import { useTeams } from '../../hooks/useTeams';
import { useAuth } from '../../context/AuthContext';
import { logAction, loadAuditLogs } from '../../services/auditLogBackend';
import { JOB_STATUSES_LIST, getJobById } from '../../services/jobService';
import { REQUEST_STATUSES_LIST, REQUEST_PRIORITIES_LIST } from '../../services/requestService';
import SmartRequestDialog from '../../components/JobPool/SmartRequestDialog';
import RequestProgressCard from '../../components/JobPool/RequestProgressCard';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { getAllAgents } from '../../services/conciliumAgentsService';
import { getAgents as getHubAgents } from '../../services/agentHubService';
import {
  runPipeline,
  checkJobTaskCompletion,
  approveJob as approvePipelineJob,
  executeJobTasks,
} from '../../services/pipelineService';
import { loadTeamTasks } from '../../services/teamTaskBackend';
import { useToolRequirements } from '../../context/ToolRequirementContext';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import ThumbDownAltOutlinedIcon from '@mui/icons-material/ThumbDownAltOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import LinearProgress from '@mui/material/LinearProgress';
import {
  listGoals,
  pauseGoal,
  resumeGoal,
  cancelGoal,
  provideTools,
  retryGoal,
} from '../../services/goalService';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import GoalDetailDialog from '../../components/Goals/GoalDetailDialog';
import LoopsTab from './LoopsTab';
import TeamToolDialog from '../../components/Goals/TeamToolDialog';
import GoalEstimates from '../../components/Goals/GoalEstimates';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';

import AppIcon from '../../components/icons/AppIcon';
import { hasPollableGoal } from './goalPolling';

// ── Job status colors ────────────────────────────────────────
const JOB_STATUS_COLORS = {
  active: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  paused: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  completed: { bg: '#DBEAFE', color: '#2563EB', border: '#BFDBFE' },
  cancelled: { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
};

const JOB_STATUS_COLORS_DARK = {
  active: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  paused: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  completed: { bg: 'rgba(59,130,246,0.1)', color: '#60A5FA', border: 'rgba(59,130,246,0.2)' },
  cancelled: { bg: 'rgba(220,38,38,0.1)', color: '#F87171', border: 'rgba(220,38,38,0.2)' },
};

// ── Request status colors ────────────────────────────────────
const REQUEST_STATUS_COLORS = {
  pending: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  processing: { bg: '#DBEAFE', color: '#2563EB', border: '#BFDBFE' },
  completed: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  rejected: { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
};

const REQUEST_STATUS_COLORS_DARK = {
  pending: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  processing: { bg: 'rgba(59,130,246,0.1)', color: '#60A5FA', border: 'rgba(59,130,246,0.2)' },
  completed: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  rejected: { bg: 'rgba(220,38,38,0.1)', color: '#F87171', border: 'rgba(220,38,38,0.2)' },
};

const PRIORITY_COLORS = {
  low: { bg: '#E5E7EB', color: '#6B7280', border: '#D1D5DB' },
  medium: { bg: '#DBEAFE', color: '#2563EB', border: '#BFDBFE' },
  high: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  urgent: { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
};

const PRIORITY_COLORS_DARK = {
  low: { bg: 'rgba(107,114,128,0.1)', color: '#9CA3AF', border: 'rgba(107,114,128,0.2)' },
  medium: { bg: 'rgba(59,130,246,0.1)', color: '#60A5FA', border: 'rgba(59,130,246,0.2)' },
  high: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  urgent: { bg: 'rgba(220,38,38,0.1)', color: '#F87171', border: 'rgba(220,38,38,0.2)' },
};

// ── Request table columns ────────────────────────────────────
const REQUEST_COLUMNS = [
  { id: 'id', label: 'Request ID', sortKey: 'id', minWidth: 160 },
  { id: 'title', label: 'Title', sortKey: 'parsedTitle', minWidth: 180 },
  { id: 'requestText', label: 'Request', minWidth: 220 },
  { id: 'status', label: 'Status', sortKey: 'status', minWidth: 100, align: 'center' },
  { id: 'priority', label: 'Priority', sortKey: 'parsedPriority', minWidth: 100, align: 'center' },
  { id: 'category', label: 'Category', sortKey: 'parsedCategory', minWidth: 120 },
  { id: 'concilium', label: 'Concilium', sortKey: 'assignedConciliumName', minWidth: 140 },
  { id: 'resultJob', label: 'Result Job', sortKey: 'resultJobId', minWidth: 130 },
  { id: 'cost', label: 'Cost', sortKey: 'costUsd', minWidth: 80, align: 'right' },
  { id: 'created', label: 'Created', sortKey: 'createdAt', minWidth: 110, align: 'center' },
  { id: 'actions', label: '', minWidth: 80, align: 'right' },
];

// ── Table columns ────────────────────────────────────────────
const JOB_COLUMNS = [
  { id: 'id', label: 'Job ID', sortKey: 'id', minWidth: 160 },
  { id: 'description', label: 'Description', sortKey: 'description', minWidth: 200 },
  { id: 'addedBy', label: 'Added By', sortKey: 'addedBy', minWidth: 130 },
  { id: 'team', label: 'Team', sortKey: 'teamName', minWidth: 130 },
  { id: 'assignedAgent', label: 'Assigned Agent', sortKey: 'assignedAgentName', minWidth: 160 },
  { id: 'requirements', label: 'Requirements', minWidth: 200 },
  { id: 'related', label: 'Related', minWidth: 120, align: 'center' },
  { id: 'concilium', label: 'Concilium', sortKey: 'conciliumName', minWidth: 140 },
  { id: 'status', label: 'Status', sortKey: 'status', minWidth: 100, align: 'center' },
  { id: 'cost', label: 'Cost', sortKey: 'costUsd', minWidth: 80, align: 'center' },
  { id: 'approval', label: 'Approval', minWidth: 110, align: 'center' },
  { id: 'report', label: 'Report', minWidth: 70, align: 'center' },
  { id: 'updated', label: 'Updated', sortKey: 'updatedAt', minWidth: 110, align: 'center' },
  { id: 'actions', label: '', minWidth: 100, align: 'right' },
];

// ── Empty forms ──────────────────────────────────────────────
const EMPTY_JOB_FORM = {
  description: '',
  status: 'active',
  category: '',
  assignedAgentId: null,
  assignedAgentName: '',
  requirements: '',
  conciliumId: null,
  conciliumName: '',
  teamId: null,
  teamName: '',
  relatedProjects: [],
  relatedWorkflows: [],
  relatedTasks: [],
  relatedPartners: [],
};

// ── Helpers ──────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(dateStr);
}

const formatLogDateTime = (ts) => {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
};

const getActionChipColor = (action) => {
  const a = (action || '').toLowerCase();
  if (a.includes('created') || a.includes('create')) return 'success';
  if (a.includes('deleted') || a.includes('delete')) return 'error';
  if (a.includes('updated') || a.includes('edited') || a.includes('changed')) return 'info';
  return 'default';
};

function SectionLabel({ icon, label }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      {icon && (
        <Box sx={{ color: 'text.secondary', display: 'flex', '& > *': { fontSize: 18 } }}>
          {icon}
        </Box>
      )}
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          fontSize: '0.8rem',
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          color: 'text.secondary',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function SimpleJobPool() {
  const theme = useTheme();
  const { requests, loading: reqLoading, addRequest, editRequest } = useRequests();
  const { jobs, loading: jobsLoading } = useJobs();
  const [smartDialogOpen, setSmartDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [requestTasks, setRequestTasks] = useState([]);

  // Load tasks for request progress cards
  useEffect(() => {
    loadTeamTasks()
      .then((tasks) => setRequestTasks(tasks))
      .catch(() => {});
  }, [requests]);

  const handleRetryRequest = useCallback(
    async (request) => {
      await editRequest(request.id, { status: 'processing', processingNotes: 'Retrying...' });
      runPipeline(request, [], []).catch(() => {});
    },
    [editRequest]
  );

  const handleApproveRequest = useCallback(async (jobId, decision) => {
    await approvePipelineJob(jobId, decision);
  }, []);

  if (reqLoading && jobsLoading) return <LoadingSpinner fullScreen />;

  const filtered = requests.filter((r) => {
    const title = r.parsedTitle || r.requestText || '';
    if (search && !title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'active') return r.status === 'pending' || r.status === 'processing';
    if (statusFilter === 'completed') return r.status === 'completed';
    if (statusFilter === 'failed') return r.status === 'failed';
    if (statusFilter === 'review') {
      const linkedJob = jobs.find((j) => j.id === r.resultJobId || j.sourceRequestId === r.id);
      return linkedJob?.approvalStatus === 'pending_approval';
    }
    return true;
  });

  return (
    <PageLayout showTitleBlock={false}>
      <BentoCard
        title="My Requests"
        explain
        noTour
        subtitle={`${requests.length} total requests`}
        icon={WorkOutlineIcon}
        iconColor={theme.palette.primary.main}
        noPadding={false}
      >
        {/* Toolbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, sm: 1.5 },
            flexWrap: 'wrap',
            mb: 2,
          }}
        >
          <TextField
            size="small"
            placeholder="Search requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon name="SearchOutlined" fallback={SearchIcon} sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              minWidth: { xs: 0 },
              flex: { xs: 1, sm: 'none' },
              width: { sm: 200 },
              '& .MuiOutlinedInput-root': { borderRadius: 2 },
            }}
          />
          <Box
            sx={{
              display: 'flex',
              gap: 0.5,
              bgcolor: (t) => alpha(t.palette.text.primary, 0.04),
              borderRadius: 2.5,
              p: 0.5,
              overflowX: 'auto',
              maxWidth: '100%',
            }}
          >
            {[
              { key: 'all', label: 'All' },
              { key: 'active', label: 'Active' },
              { key: 'review', label: 'Review' },
              { key: 'completed', label: 'Done' },
              { key: 'failed', label: 'Failed' },
            ].map((f) => (
              <Button
                key={f.key}
                size="small"
                onClick={() => setStatusFilter(f.key)}
                sx={{
                  bgcolor:
                    statusFilter === f.key
                      ? (t) => alpha(t.palette.primary.main, 0.1)
                      : 'transparent',
                  color: statusFilter === f.key ? 'primary.main' : 'text.secondary',
                  fontWeight: 700,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  px: 1.5,
                  minWidth: 0,
                  flexShrink: 0,
                }}
              >
                {f.label}
              </Button>
            ))}
          </Box>
          <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
          <Button
            variant="contained"
            disableElevation
            startIcon={<AppIcon name="Add" fallback={AddIcon} />}
            onClick={() => setSmartDialogOpen(true)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 700,
              px: 2.5,
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            New Request
          </Button>
        </Box>

        {/* Request cards */}
        {filtered.length === 0 ? (
          <EmptyState
            title={search || statusFilter !== 'all' ? 'No matching requests' : 'No requests yet'}
            description={
              search || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Click "New Request" to create your first request'
            }
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {filtered.map((req) => {
              const linkedJob = jobs.find(
                (j) => j.id === req.resultJobId || j.sourceRequestId === req.id
              );
              return (
                <RequestProgressCard
                  key={req.id}
                  request={req}
                  job={linkedJob}
                  tasks={requestTasks}
                  onApprove={handleApproveRequest}
                  onReject={handleApproveRequest}
                  onRetry={handleRetryRequest}
                />
              );
            })}
          </Box>
        )}
      </BentoCard>
      <SmartRequestDialog
        open={smartDialogOpen}
        onClose={() => setSmartDialogOpen(false)}
        onSubmit={async (data) => {
          await addRequest(data);
          setSmartDialogOpen(false);
        }}
      />
    </PageLayout>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT - Simple Mode parity: both modes now render the
// full-featured view. The old SimpleJobPool (cards layout) above
// is retained as dead code for now and will be deleted in a
// follow-up pass; removing a 140-line function inline here would
// make this diff noisy and risk breaking shared imports.
// ══════════════════════════════════════════════════════════════
export default function JobPool() {
  return <AdvancedJobPool />;
}

function AdvancedJobPool() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { user } = useAuth();

  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // ── Tab state (URL-synced) ────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return ['goals', 'loops'].includes(t) ? t : 'goals';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (['goals', 'loops'].includes(t)) setTab(t);
  }, [searchParams]);

  const handleTabChange = useCallback(
    (value) => {
      setTab(value);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  /* ---- Page Activity Log Dialog ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Job' || log.entity === 'Request');
      setActivityLogs(filtered);
    } catch (_) {
      setActivityLogs([]);
    } finally {
      setActivityLogsLoading(false);
    }
  }, []);

  const closeActivityLog = useCallback(() => {
    setActivityLogOpen(false);
    setActivityLogs([]);
  }, []);

  const getActionColor = (action) => {
    const a = (action || '').toLowerCase();
    if (a.includes('created') || a.includes('create') || a.includes('added') || a.includes('add'))
      return 'success';
    if (a.includes('deleted') || a.includes('delete')) return 'error';
    if (a.includes('updated') || a.includes('saved') || a.includes('save')) return 'info';
    if (a.includes('paused') || a.includes('disabled')) return 'warning';
    return 'default';
  };

  const getUserFromLog = (log) => {
    if (log.user && log.user !== '-') return log.user;
    return '-';
  };

  const getIpFromLog = (log) => {
    const s = log.detailsStructured;
    if (s?.network?.ip) return s.network.ip;
    return '-';
  };

  // ── Metrics toggle ────────────────────────────────────────
  const [showMetrics, setShowMetrics] = useShowMetrics('jobpool');

  // ── Shared hooks ──────────────────────────────────────────
  const { jobs, loading: jobsLoading, addJob, editJob, removeJob } = useJobs();
  const {
    requests,
    loading: requestsLoading,
    addRequest,
    editRequest,
    removeRequest,
  } = useRequests();
  const { concilium } = useConcilium();
  const { teams } = useTeams();

  // ── Pipeline: load agents for auto-assignment ──────────
  const [pipelineAgents, setPipelineAgents] = useState([]);
  const [pipelineMsg, setPipelineMsg] = useState(null);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  // Deep link: /job-pool?action=create selects the Goals tab and opens the
  // create-goal dialog on mount (used by the Home "Explain?" tour CTA).
  const actionHandled = useRef(false);
  useEffect(() => {
    if (actionHandled.current) return;
    if (searchParams.get('action') === 'create') {
      actionHandled.current = true;
      setTab('goals');
      setGoalDialogOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('action');
          return next;
        },
        { replace: true }
      );
    }
  }, [searchParams, setSearchParams]);

  const [goalStatCards, setGoalStatCards] = useState([]);
  const [loopStatCards, setLoopStatCards] = useState([]);
  const [goalRefreshKey, setGoalRefreshKey] = useState(0);
  useEffect(() => {
    getAllAgents()
      .then((a) => setPipelineAgents(a || []))
      .catch(() => {});
  }, []);

  // ── Stat cards (Jobs) ─────────────────────────────────────
  const jobStats = useMemo(
    () => ({
      total: jobs.length,
      active: jobs.filter((j) => j.status === 'active').length,
      paused: jobs.filter((j) => j.status === 'paused').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
    }),
    [jobs]
  );

  const statCards = useMemo(
    () => [
      {
        label: 'Total Jobs',
        value: jobStats.total,
        helper: 'All jobs in the pool',
        color: theme.palette.primary.main,
        icon: WorkOutlineIcon,
      },
      {
        label: 'Active',
        value: jobStats.active,
        helper: 'Currently running',
        color: theme.palette.success.main,
        icon: PlayCircleOutlineIcon,
      },
      {
        label: 'Paused',
        value: jobStats.paused,
        helper: 'Temporarily on hold',
        color: theme.palette.warning.main,
        icon: PauseCircleOutlineIcon,
      },
      {
        label: 'Completed',
        value: jobStats.completed,
        helper: 'Finished jobs',
        color: theme.palette.info.main,
        icon: CheckCircleOutlineIcon,
      },
    ],
    [jobStats, theme]
  );

  if (jobsLoading && requestsLoading) return <LoadingSpinner fullScreen />;

  return (
    <PageLayout showTitleBlock={false}>
      <BentoCard
        title="Requests"
        explain
        noTour
        subtitle={showMetrics ? `${jobStats.total} requests` : undefined}
        icon={WorkOutlineIcon}
        iconColor={theme.palette.primary.main}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* ── Tab bar (Goals | Loops) ──────────────────────── */}
        <Box
          data-tour-block="jobpool-tabs"
          data-tour-label="Goals & Loops"
          sx={{ display: 'flex', alignItems: 'center', px: { xs: 1.25, sm: 1.5 }, pt: 1.5, pb: 0 }}
        >
          <Box
            sx={{
              display: 'flex',
              bgcolor: alpha(theme.palette.text.primary, 0.04),
              p: 0.5,
              borderRadius: 3,
              width: { xs: '100%', md: 'auto' },
            }}
          >
            {[
              { id: 'goals', label: 'Goals', icon: TrackChangesOutlinedIcon },
              { id: 'loops', label: 'Loops', icon: SyncOutlinedIcon },
            ].map((t) => (
              <Button
                key={t.id}
                startIcon={<AppIcon fallback={t.icon} sx={{ fontSize: 18 }} />}
                onClick={() => handleTabChange(t.id)}
                fullWidth={isMobile}
                sx={{
                  borderRadius: 2.5,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  px: 2,
                  minHeight: 36,
                  transition: 'all 0.2s',
                  bgcolor: tab === t.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  color: tab === t.id ? 'primary.main' : 'text.secondary',
                  boxShadow:
                    tab === t.id ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}` : 'none',
                  '&:hover': {
                    bgcolor:
                      tab === t.id
                        ? alpha(theme.palette.primary.main, 0.15)
                        : alpha(theme.palette.text.primary, 0.05),
                    color: tab === t.id ? 'primary.main' : 'text.primary',
                  },
                }}
              >
                {t.label}
              </Button>
            ))}
          </Box>
        </Box>

        {/* ── Metrics (above tabs, like InjectionHub) ──────── */}
        <Collapse in={showMetrics}>
          <Box
            data-tour-block="jobpool-metrics"
            data-tour-label="Request stats"
            sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}
          >
            <Box
              sx={{
                mb: 0,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(3, minmax(0, 1fr))',
                  md: `repeat(${tab === 'goals' ? 5 : 4}, minmax(0, 1fr))`,
                },
              }}
            >
              {(tab === 'goals' ? goalStatCards : loopStatCards).map((card) => {
                const Icon = card.icon;
                return (
                  <Paper
                    key={card.label}
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: alpha(card.color, 0.22),
                      background: `linear-gradient(135deg, ${alpha(card.color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontWeight: 600 }}
                        >
                          {card.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '1.35rem',
                            fontWeight: 800,
                            color: 'text.primary',
                            lineHeight: 1.15,
                            mt: 0.45,
                          }}
                        >
                          {card.value}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
                        >
                          {card.helper}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          bgcolor: alpha(card.color, 0.16),
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <AppIcon fallback={Icon} sx={{ fontSize: 18 }} />
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        </Collapse>

        {/* ── Tab content ───────────────────────────────── */}
        {tab === 'goals' ? (
          <GoalsTab
            theme={theme}
            isDark={isDark}
            onNewGoal={() => setGoalDialogOpen(true)}
            onStatsChange={setGoalStatCards}
            refreshKey={goalRefreshKey}
            paused={goalDialogOpen}
          />
        ) : (
          <LoopsTab
            theme={theme}
            isDark={isDark}
            onStatsChange={setLoopStatCards}
            refreshKey={goalRefreshKey}
          />
        )}
      </BentoCard>
      {/* ===== Activity Log Dialog ===== */}
      <FormDialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        title="Requests Activity"
        subtitle="Job, team & concilium action history"
        icon={HistoryIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '80vh' }}
        contentDividers={false}
        contentSx={{ p: 0 }}
        footerJustify="flex-start"
        actions={
          <>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {`${activityLogs.length} log entr${activityLogs.length !== 1 ? 'ies' : 'y'}`}
            </Typography>
            <Button
              onClick={closeActivityLog}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Close
            </Button>
          </>
        }
      >
        <Tabs
          value={0}
          sx={{
            px: 3,
            minHeight: 40,
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
            },
          }}
        >
          <Tab
            icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Action Log (${activityLogs.length})`}
          />
        </Tabs>
        {activityLogsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading...
            </Typography>
          </Box>
        ) : activityLogs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
            <AppIcon
              name="History"
              fallback={HistoryIcon}
              sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
              No actions recorded yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Actions like creating, editing, and deleting jobs and teams will appear here.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Action', 'User', 'IP Address', 'Date & Time', 'Details'].map((h) => (
                    <TableCell
                      key={h}
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.95) : 'grey.50',
                        borderBottom: '2px solid',
                        borderColor: 'divider',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {activityLogs.map((log) => (
                  <TableRow key={log.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ py: 1.25 }}>
                      <Chip
                        label={log.action}
                        size="small"
                        color={getActionColor(log.action)}
                        sx={{ fontWeight: 700, fontSize: '0.68rem', borderRadius: 1.5, height: 24 }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 500 }}>
                        {getUserFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          fontFamily: 'monospace',
                          color: 'text.secondary',
                        }}
                      >
                        {getIpFromLog(log)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                      >
                        {formatLogDateTime(log.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.78rem',
                          color: 'text.primary',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {log.details || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </FormDialog>
      {/* Goals SmartRequestDialog */}
      <SmartRequestDialog
        open={goalDialogOpen}
        onClose={() => setGoalDialogOpen(false)}
        onSubmit={(data) => {
          if (data?.type === 'goal') {
            setPipelineMsg(
              `Goal created - ${data.goal?.execution_mode === 'manual' ? 'awaiting approval' : 'planning started'}`
            );
          }
          setGoalDialogOpen(false);
          setGoalRefreshKey((k) => k + 1);
        }}
      />
    </PageLayout>
  );
}

// ══════════════════════════════════════════════════════════════
// JOBS TAB
// ══════════════════════════════════════════════════════════════
function JobsTab({
  jobs,
  addJob,
  editJob,
  removeJob,
  concilium,
  teams,
  user,
  theme,
  isDark,
  openActivityLog,
}) {
  // ── Filter state ──────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // ── Sort & pagination ─────────────────────────────────────
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('updatedAt');

  // ── View mode ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('orch_jobpool_view') || 'list';
    } catch {
      return 'list';
    }
  });
  const handleViewMode = (_, v) => {
    if (v) {
      setViewMode(v);
      try {
        localStorage.setItem('orch_jobpool_view', v);
      } catch {}
    }
  };

  // ── Dialog state ──────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_JOB_FORM });
  const [saving, setSaving] = useState(false);

  // ── Delete state ──────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Related popover ───────────────────────────────────────
  const [relatedAnchorEl, setRelatedAnchorEl] = useState(null);
  const [relatedTarget, setRelatedTarget] = useState(null);

  // ── Change log ────────────────────────────────────────────
  const [changeLogDialog, setChangeLogDialog] = useState({ open: false, job: null });
  const [changeLogs, setChangeLogs] = useState([]);
  const [changeLogsLoading, setChangeLogsLoading] = useState(false);
  const [executingJobId, setExecutingJobId] = useState(null);

  const handleApproveJob = useCallback(async (jobId, decision) => {
    await approvePipelineJob(jobId, decision);
  }, []);

  // ── Handlers ──────────────────────────────────────────────
  const openCreateDialog = () => {
    setEditingJob(null);
    setForm({ ...EMPTY_JOB_FORM });
    setDialogOpen(true);
  };

  const openEditDialog = (job) => {
    setEditingJob(job);
    setForm({
      description: job.description || '',
      status: job.status || 'active',
      category: job.category || '',
      assignedAgentId: job.assignedAgentId || null,
      assignedAgentName: job.assignedAgentName || '',
      requirements: job.requirements || '',
      conciliumId: job.conciliumId || null,
      conciliumName: job.conciliumName || '',
      teamId: job.teamId || null,
      teamName: job.teamName || '',
      relatedProjects: job.relatedProjects || [],
      relatedWorkflows: job.relatedWorkflows || [],
      relatedTasks: job.relatedTasks || [],
      relatedPartners: job.relatedPartners || [],
    });
    setDialogOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.description.trim() || saving) return;
    setSaving(true);
    try {
      if (editingJob) {
        await editJob(editingJob.id, form);
        logAction({
          action: 'Job updated',
          entity: 'Job',
          entityId: editingJob.id,
          details: `Updated job "${form.description.slice(0, 50)}"`,
          meta: { source: 'jobPoolPage', importance: 'medium', tags: ['update', 'job'] },
        }).catch(() => {});
      } else {
        const created = await addJob({ ...form, addedBy: user?.email || 'Unknown' });
        if (created) {
          logAction({
            action: 'Job created',
            entity: 'Job',
            entityId: created.id,
            details: `Created job "${form.description.slice(0, 50)}"`,
            meta: { source: 'jobPoolPage', importance: 'medium', tags: ['create', 'job'] },
          }).catch(() => {});
        }
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save job:', err);
    } finally {
      setSaving(false);
    }
  }, [form, editingJob, saving, editJob, addJob]);

  const handleSort = (sortKey) => {
    if (!sortKey) return;
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    await removeJob(deleteConfirm.id);
    logAction({
      action: 'Job deleted',
      entity: 'Job',
      entityId: deleteConfirm.id,
      details: `Deleted job "${deleteConfirm.description?.slice(0, 50)}"`,
      meta: { source: 'jobPoolPage', importance: 'high', tags: ['delete', 'job'] },
    }).catch(() => {});
    setDeleteConfirm(null);
  }, [deleteConfirm, removeJob]);

  const handleOpenRelated = useCallback((e, job) => {
    e.stopPropagation();
    setRelatedAnchorEl(e.currentTarget);
    setRelatedTarget(job);
  }, []);

  const openChangeLog = useCallback(async (job) => {
    setChangeLogDialog({ open: true, job });
    setChangeLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      setChangeLogs(allLogs.filter((l) => l.entity === 'Job' && l.entityId === job.id));
    } catch {
      setChangeLogs([]);
    } finally {
      setChangeLogsLoading(false);
    }
  }, []);

  const handleRunTasks = useCallback(
    async (job) => {
      if (executingJobId) return;
      setExecutingJobId(job.id);
      try {
        const allTasks = await loadTeamTasks();
        const jobTasks = allTasks.filter((t) => t.jobPoolId === job.id && t.status === 'todo');
        if (jobTasks.length === 0) return;
        const matchedAgent = getHubAgents().find((a) => a.role === job.assignedAgentName);
        const agentContext = {
          role: job.assignedAgentName || '',
          name: job.assignedAgentName || '',
          capabilities: matchedAgent?.capabilities || [],
          system_prompt: matchedAgent?.system_prompt || null,
        };
        await executeJobTasks(job.id, jobTasks, agentContext, job.description, job.requirements);
      } catch (err) {
        console.error('[JobPool] Run tasks failed:', err);
      } finally {
        setExecutingJobId(null);
      }
    },
    [executingJobId]
  );

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('All');
  };

  // ── Derived data ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...jobs];
    if (statusFilter !== 'All') list = list.filter((j) => j.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (j) =>
          (j.id || '').toLowerCase().includes(q) ||
          (j.description || '').toLowerCase().includes(q) ||
          (j.assignedAgentName || '').toLowerCase().includes(q) ||
          (j.requirements || '').toLowerCase().includes(q) ||
          (j.conciliumName || '').toLowerCase().includes(q) ||
          (j.teamName || '').toLowerCase().includes(q) ||
          (j.addedBy || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[orderBy] || '';
      const valB = b[orderBy] || '';
      if (valB < valA) return order === 'desc' ? -1 : 1;
      if (valB > valA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [filtered, order, orderBy]);

  const jobsPagination = usePagination(sorted, {
    surfaceId: 'jobPool.active',
    defaultRowsPerPage: 10,
    resetOn: [search, statusFilter, viewMode],
  });
  const paginated = jobsPagination.paginatedData;

  const getRelatedCount = (job) => {
    return (
      (job.relatedProjects?.length || 0) +
      (job.relatedWorkflows?.length || 0) +
      (job.relatedTasks?.length || 0) +
      (job.relatedPartners?.length || 0)
    );
  };

  return (
    <>
      {/* ── Toolbar ──────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          borderBottom: '1px solid',
          borderColor: 'divider',
          p: 1.5,
        }}
      >
        <Tooltip title="Filter jobs" placement="bottom" arrow>
          <IconButton
            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderColor: 'primary.main',
              },
            }}
          >
            <AppIcon
              name="Tune"
              fallback={TuneIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewMode}
          size="small"
          sx={{
            bgcolor: alpha(theme.palette.background.default, 0.8),
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '& .MuiToggleButton-root': {
              px: 1.25,
              py: 0.75,
              border: 'none',
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
              },
            },
          }}
        >
          <ToggleButton value="card" aria-label="Card view">
            <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
          <ToggleButton value="list" aria-label="List view">
            <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Activity Log" placement="bottom" arrow>
          <IconButton
            onClick={openActivityLog}
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderColor: 'primary.main',
              },
            }}
            aria-label="Activity Log"
          >
            <AppIcon
              name="History"
              fallback={HistoryIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={openCreateDialog}
          sx={{
            borderRadius: 99,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.82rem',
            px: 2.5,
            borderWidth: 2,
            '&:hover': { borderWidth: 2 },
          }}
        >
          New
        </Button>
      </Box>
      {/* ── Filter Popover ───────────────────────────────── */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              p: 0,
              borderRadius: 3,
              minWidth: 340,
              maxWidth: 400,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            },
          },
        }}
      >
        <Box sx={{ px: 2.5, pt: 2.5, pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AppIcon name="Tune" fallback={TuneIcon} sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Filter Jobs
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Narrow down jobs by description, status, or agent.
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
              display: 'block',
              mb: 1,
            }}
          >
            Search
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="SearchOutlined"
                    fallback={SearchIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
              display: 'block',
              mb: 1,
            }}
          >
            Status
          </Typography>
          <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => {
                setStatusFilter(e.target.value);
              }}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              <MenuItem
                value="All"
                sx={{
                  fontWeight: 700,
                  color: 'primary.main',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                All Statuses
              </MenuItem>
              {JOB_STATUSES_LIST.map((s) => (
                <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            fullWidth
            variant="outlined"
            size="small"
            onClick={resetFilters}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: 'divider',
            }}
          >
            Reset filters
          </Button>
        </Box>
      </Popover>
      {/* ── Content ──────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <Box sx={{ p: 4 }}>
          <EmptyState
            icon={WorkOutlineIcon}
            title="No jobs found"
            description={
              search || statusFilter !== 'All'
                ? 'Try adjusting your filters.'
                : 'Create your first job to get started.'
            }
            actionLabel="New"
            onAction={openCreateDialog}
          />
        </Box>
      ) : viewMode === 'card' ? (
        /* ── Card View ─────────────────────────────────── */
        <Box sx={{ p: 1.5, overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              width: '100%',
            }}
          >
            {paginated.map((job) => {
              const sc =
                (isDark ? JOB_STATUS_COLORS_DARK : JOB_STATUS_COLORS)[job.status] ||
                (isDark ? JOB_STATUS_COLORS_DARK : JOB_STATUS_COLORS).active;
              return (
                <Paper
                  key={job.id}
                  elevation={0}
                  onClick={() => openEditDialog(job)}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    minWidth: 0,
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: createHoverGlowShadow(theme),
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Chip
                      label={job.status}
                      size="small"
                      sx={{
                        height: 24,
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        bgcolor: sc.bg,
                        color: sc.color,
                        border: `1px solid ${sc.border}`,
                      }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      {formatRelative(job.updatedAt)}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      mb: 0.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {job.description || 'Untitled Job'}
                  </Typography>
                  {job.assignedAgentName && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <AppIcon
                        name="SmartToyOutlined"
                        fallback={SmartToyOutlinedIcon}
                        sx={{ fontSize: 14, color: 'primary.main' }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {job.assignedAgentName}
                      </Typography>
                    </Box>
                  )}
                  {job.teamName && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <AppIcon
                        name="Diversity3Outlined"
                        fallback={Diversity3OutlinedIcon}
                        sx={{ fontSize: 14, color: 'success.main' }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {job.teamName}
                      </Typography>
                    </Box>
                  )}
                  {job.conciliumName && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <AppIcon
                        name="GroupsOutlined"
                        fallback={GroupsOutlinedIcon}
                        sx={{ fontSize: 14, color: 'text.secondary' }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {job.conciliumName}
                      </Typography>
                    </Box>
                  )}
                  {job.addedBy && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AppIcon
                        name="PersonOutline"
                        fallback={PersonOutlineIcon}
                        sx={{ fontSize: 14, color: 'text.disabled' }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                      >
                        {job.addedBy}
                      </Typography>
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>
      ) : (
        /* ── Table View ────────────────────────────────── */
        <>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', flex: 1, overflowX: 'auto' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {JOB_COLUMNS.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align || 'left'}
                      sx={{ minWidth: col.minWidth, whiteSpace: 'nowrap', fontWeight: 600 }}
                    >
                      {col.sortKey ? (
                        <TableSortLabel
                          active={orderBy === col.sortKey}
                          direction={orderBy === col.sortKey ? order : 'asc'}
                          onClick={() => handleSort(col.sortKey)}
                        >
                          {col.label}
                        </TableSortLabel>
                      ) : (
                        col.label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((job) => {
                  const sc =
                    (isDark ? JOB_STATUS_COLORS_DARK : JOB_STATUS_COLORS)[job.status] ||
                    (isDark ? JOB_STATUS_COLORS_DARK : JOB_STATUS_COLORS).active;
                  const relCount = getRelatedCount(job);
                  return (
                    <TableRow
                      key={job.id}
                      hover
                      sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                      onClick={() => openEditDialog(job)}
                    >
                      {/* Job ID */}
                      <TableCell>
                        <Tooltip title={job.id}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              color: 'text.secondary',
                            }}
                          >
                            {job.id.length > 20 ? `${job.id.slice(0, 20)}...` : job.id}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Description */}
                      <TableCell>
                        <Tooltip title={job.description}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              maxWidth: 260,
                            }}
                          >
                            {job.description || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Added By */}
                      <TableCell>
                        {job.addedBy ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AppIcon
                              name="PersonOutline"
                              fallback={PersonOutlineIcon}
                              sx={{ fontSize: 16, color: 'text.secondary' }}
                            />
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 500, fontSize: '0.8rem' }}
                            >
                              {job.addedBy}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Team */}
                      <TableCell>
                        {job.teamName ? (
                          <Chip
                            size="small"
                            icon={
                              <AppIcon
                                name="Diversity3Outlined"
                                fallback={Diversity3OutlinedIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            label={job.teamName}
                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Assigned Agent */}
                      <TableCell>
                        {job.assignedAgentName ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <AppIcon
                              name="SmartToyOutlined"
                              fallback={SmartToyOutlinedIcon}
                              sx={{ fontSize: 16, color: 'primary.main' }}
                            />
                            <Box>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, fontSize: '0.8rem' }}
                              >
                                {job.assignedAgentName}
                              </Typography>
                              {job.assignedAgentId && (
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'text.disabled', fontSize: '0.65rem' }}
                                >
                                  {job.assignedAgentId}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                            Unassigned
                          </Typography>
                        )}
                      </TableCell>
                      {/* Requirements */}
                      <TableCell>
                        <Tooltip title={job.requirements}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              maxWidth: 240,
                            }}
                          >
                            {job.requirements || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Related */}
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        {relCount > 0 ? (
                          <Chip
                            size="small"
                            label={`${relCount} linked`}
                            clickable
                            onClick={(e) => handleOpenRelated(e, job)}
                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Concilium */}
                      <TableCell>
                        {job.conciliumName ? (
                          <Chip
                            size="small"
                            icon={
                              <AppIcon
                                name="GroupsOutlined"
                                fallback={GroupsOutlinedIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            label={job.conciliumName}
                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Status */}
                      <TableCell align="center">
                        <Chip
                          label={job.status}
                          size="small"
                          sx={{
                            height: 26,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            textTransform: 'capitalize',
                            bgcolor: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}
                        />
                      </TableCell>
                      {/* Cost */}
                      <TableCell align="center">
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            fontFamily: 'monospace',
                            color: job.costUsd > 0 ? 'warning.main' : 'text.disabled',
                          }}
                        >
                          {job.costUsd > 0 ? `$${Number(job.costUsd).toFixed(4)}` : '-'}
                        </Typography>
                      </TableCell>
                      {/* Approval */}
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        {job.approvalStatus === 'pending_approval' ? (
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Tooltip title="Approve">
                              <IconButton
                                size="small"
                                sx={{ color: 'success.main' }}
                                onClick={() => handleApproveJob(job.id, 'approved')}
                              >
                                <AppIcon
                                  name="ThumbUpAltOutlined"
                                  fallback={ThumbUpAltOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject">
                              <IconButton
                                size="small"
                                sx={{ color: 'error.main' }}
                                onClick={() => handleApproveJob(job.id, 'rejected')}
                              >
                                <AppIcon
                                  name="ThumbDownAltOutlined"
                                  fallback={ThumbDownAltOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        ) : job.approvalStatus ? (
                          <Chip
                            label={job.approvalStatus === 'approved' ? 'Approved' : 'Rejected'}
                            size="small"
                            sx={{
                              height: 22,
                              fontWeight: 600,
                              fontSize: '0.65rem',
                              bgcolor:
                                job.approvalStatus === 'approved' ? 'success.soft' : 'error.soft',
                              color:
                                job.approvalStatus === 'approved' ? 'success.main' : 'error.main',
                            }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Report */}
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        {job.reportId ? (
                          <Tooltip title="View Report">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => window.open(`/reports?id=${job.reportId}`, '_blank')}
                            >
                              <AppIcon
                                name="DescriptionOutlined"
                                fallback={DescriptionOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Updated */}
                      <TableCell align="center">
                        <Tooltip title={formatDate(job.updatedAt)}>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 500, color: 'text.secondary' }}
                          >
                            {formatRelative(job.updatedAt)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Actions */}
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          {job.status === 'active' && (
                            <Tooltip title={executingJobId === job.id ? 'Running...' : 'Run Tasks'}>
                              <IconButton
                                size="small"
                                onClick={() => handleRunTasks(job)}
                                disabled={!!executingJobId}
                                sx={{ color: 'success.main' }}
                              >
                                {executingJobId === job.id ? (
                                  <CircularProgress size={16} color="success" />
                                ) : (
                                  <AppIcon
                                    name="PlayCircleOutline"
                                    fallback={PlayCircleOutlineIcon}
                                    sx={{ fontSize: 18 }}
                                  />
                                )}
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEditDialog(job)}>
                              <AppIcon
                                name="EditOutlined"
                                fallback={EditOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Change Log">
                            <IconButton size="small" onClick={() => openChangeLog(job)}>
                              <AppIcon
                                name="History"
                                fallback={HistoryIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirm(job)}
                              sx={{ color: 'error.main' }}
                            >
                              <AppIcon
                                name="DeleteOutline"
                                fallback={DeleteOutlineIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination
            count={jobsPagination.totalCount}
            page={jobsPagination.page}
            rowsPerPage={jobsPagination.rowsPerPage}
            rowsPerPageOptions={jobsPagination.rowsPerPageOptions}
            onPageChange={jobsPagination.setPage}
            onRowsPerPageChange={jobsPagination.setRowsPerPage}
            onLoadAll={jobsPagination.loadAll}
            onCollapseAll={jobsPagination.collapseAll}
            allMode={jobsPagination.allMode}
            label="jobs"
          />
        </>
      )}
      {/* ── Related Popover ──────────────────────────────── */}
      <Popover
        open={!!relatedAnchorEl}
        anchorEl={relatedAnchorEl}
        onClose={() => {
          setRelatedAnchorEl(null);
          setRelatedTarget(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              borderRadius: 3,
              minWidth: 260,
              maxWidth: 380,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            },
          },
        }}
      >
        {relatedTarget && (
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Related Entities
            </Typography>
            {[
              {
                label: 'Projects',
                items: relatedTarget.relatedProjects,
                icon: (
                  <AppIcon
                    name="FolderOutlined"
                    fallback={FolderOutlinedIcon}
                    sx={{ fontSize: 16, color: 'primary.main' }}
                  />
                ),
              },
              {
                label: 'Workflows',
                items: relatedTarget.relatedWorkflows,
                icon: (
                  <AppIcon
                    name="AccountTreeOutlined"
                    fallback={AccountTreeOutlinedIcon}
                    sx={{ fontSize: 16, color: 'info.main' }}
                  />
                ),
              },
              {
                label: 'Tasks',
                items: relatedTarget.relatedTasks,
                icon: (
                  <AppIcon
                    name="AssignmentOutlined"
                    fallback={AssignmentOutlinedIcon}
                    sx={{ fontSize: 16, color: 'warning.main' }}
                  />
                ),
              },
              {
                label: 'Partners',
                items: relatedTarget.relatedPartners,
                icon: (
                  <AppIcon
                    name="PeopleOutlined"
                    fallback={PeopleOutlinedIcon}
                    sx={{ fontSize: 16, color: 'success.main' }}
                  />
                ),
              },
            ].map(({ label, items, icon }) =>
              items?.length > 0 ? (
                <Box key={label} sx={{ mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    {label}
                  </Typography>
                  {items.map((item, idx) => (
                    <Box
                      key={item.id || idx}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.4 }}
                    >
                      {icon}
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {item.name || item.id}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : null
            )}
            {getRelatedCount(relatedTarget) === 0 && (
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                No related entities
              </Typography>
            )}
          </Box>
        )}
      </Popover>
      {/* ── Create/Edit Dialog ───────────────────────────── */}
      <FormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingJob ? 'Edit Job' : 'New Job'}
        subtitle={editingJob ? `ID: ${editingJob.id}` : 'Create a new job in the pool'}
        icon={WorkOutlineIcon}
        maxWidth="sm"
        contentDividers={false}
        contentSx={{ pt: 3, pb: 1 }}
        actions={
          <>
            <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            {editingJob && (
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  openChangeLog(editingJob);
                }}
                startIcon={<AppIcon name="History" fallback={HistoryIcon} />}
                sx={{ textTransform: 'none', color: 'text.secondary' }}
              >
                Log
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!form.description.trim() || saving}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              {saving ? <CircularProgress size={20} /> : 'Save'}
            </Button>
          </>
        }
      >
        <Box sx={{ mt: 1 }}>
          <SectionLabel
            icon={<AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} />}
            label="Job Details"
          />
          <TextField
            fullWidth
            size="small"
            label="Description"
            multiline
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={form.status}
                label="Status"
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                sx={{ borderRadius: 2 }}
              >
                {JOB_STATUSES_LIST.map((s) => (
                  <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
          <TextField
            fullWidth
            size="small"
            label="Requirements"
            multiline
            rows={3}
            value={form.requirements}
            onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
            sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          <SectionLabel
            icon={<AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />}
            label="Assignment"
          />
          <TextField
            fullWidth
            size="small"
            label="Assigned Agent Name"
            value={form.assignedAgentName}
            onChange={(e) => setForm((f) => ({ ...f, assignedAgentName: e.target.value }))}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Concilium</InputLabel>
            <Select
              value={form.conciliumId || ''}
              label="Concilium"
              onChange={(e) => {
                const sel = concilium.find((c) => c.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  conciliumId: sel?.id || null,
                  conciliumName: sel?.name || '',
                }));
              }}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="">None</MenuItem>
              {concilium.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth sx={{ mb: 3 }}>
            <InputLabel>Team</InputLabel>
            <Select
              value={form.teamId || ''}
              label="Team"
              onChange={(e) => {
                const sel = (teams || []).find((t) => t.id === e.target.value);
                setForm((f) => ({ ...f, teamId: sel?.id || null, teamName: sel?.name || '' }));
              }}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="">None</MenuItem>
              {(teams || []).map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <SectionLabel
            icon={<AppIcon name="LinkOutlined" fallback={LinkOutlinedIcon} />}
            label="Related Entities"
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Link projects, workflows, tasks, or partners to this job.
          </Typography>
        </Box>
      </FormDialog>
      {/* ── Delete Confirmation ──────────────────────────── */}
      <FormDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Job?"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        contentDividers={false}
        actions={
          <>
            <Button onClick={() => setDeleteConfirm(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteConfirm}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Delete
            </Button>
          </>
        }
      >
        <DialogContentText>
          Are you sure you want to delete &quot;{deleteConfirm?.description?.slice(0, 60)}&quot;?
          This action cannot be undone.
        </DialogContentText>
      </FormDialog>
      {/* ── Change Log Dialog ────────────────────────────── */}
      <FormDialog
        open={changeLogDialog.open}
        onClose={() => setChangeLogDialog({ open: false, job: null })}
        title="Change Log"
        subtitle={changeLogDialog.job?.description?.slice(0, 50)}
        icon={HistoryIcon}
        maxWidth="md"
        hideFooter
      >
        {changeLogsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : changeLogs.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
            No changes recorded yet.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date & Time</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {changeLogs.map((log, idx) => (
                <TableRow key={log.id || idx}>
                  <TableCell>
                    <Chip
                      label={log.action}
                      size="small"
                      color={getActionChipColor(log.action)}
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AppIcon
                        name="PersonOutline"
                        fallback={PersonOutlineIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {log.user || user?.email || '-'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{formatLogDateTime(log.timestamp)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </FormDialog>
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// GOALS TAB
// ══════════════════════════════════════════════════════════════
const GOAL_STATUS_COLORS = {
  researching_customer: 'info',
  planning: 'info',
  authorizing_execution: 'info',
  active: 'primary',
  pending_validation: 'info',
  paused: 'warning',
  awaiting_tools: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

// Pipeline stage metadata - icons (MUI components), labels, estimated seconds per stage
const STAGE_META = {
  feasibility: { Icon: TroubleshootOutlinedIcon, label: 'Analyzing feasibility', eta: 8 },
  analyzing: { Icon: AssignmentOutlinedIcon, label: 'Understanding the problem', eta: 8 },
  researching_customer: {
    Icon: TroubleshootOutlinedIcon,
    label: 'AxWise is proposing scope and capabilities',
    eta: 20,
  },
  planning: { Icon: MapOutlinedIcon, label: 'Operational planning', eta: 12 },
  forming_team: { Icon: GroupsOutlinedIcon, label: 'Forming agent team', eta: 8 },
  provisioning_tools: { Icon: BuildOutlinedIcon, label: 'Setting up tools', eta: 5 },
  awaiting_tools: { Icon: HourglassEmptyOutlinedIcon, label: 'Waiting for API keys', eta: null },
  estimating: { Icon: BarChartOutlinedIcon, label: 'Estimating effort', eta: 8 },
  awaiting_context_approval: {
    Icon: PanToolOutlinedIcon,
    label: 'Confirm proposed scope',
    eta: null,
  },
  awaiting_approval: { Icon: PanToolOutlinedIcon, label: 'Awaiting your approval', eta: null },
  authorizing_execution: {
    Icon: HourglassEmptyOutlinedIcon,
    label: 'Binding approved execution',
    eta: 3,
  },
  active: { Icon: BoltOutlinedIcon, label: 'Executing phases', eta: 20 },
  pending_validation: {
    Icon: TroubleshootOutlinedIcon,
    label: 'Checking final quality',
    eta: 15,
  },
  paused: { Icon: PauseCircleOutlineIcon, label: 'Paused', eta: null },
  completed: { Icon: CheckCircleOutlineIcon, label: 'Completed', eta: 0 },
  failed: { Icon: CancelOutlinedIcon, label: 'Failed', eta: 0 },
  cancelled: { Icon: DoNotDisturbAltOutlinedIcon, label: 'Cancelled', eta: 0 },
};

function getGoalEta(goal) {
  const status = goal.status;
  const phases = goal.plan?.phases || [];
  const completedPhases = phases.filter((p) => p.status === 'completed').length;
  const remainingPhases = phases.length - completedPhases;

  // Pipeline stages in order
  const pipeline = [
    'feasibility',
    'analyzing',
    'researching_customer',
    'planning',
    'forming_team',
    'provisioning_tools',
    'active',
  ];
  const currentIdx = pipeline.indexOf(status);

  if (status === 'completed' || status === 'failed' || status === 'cancelled') return null;
  if (
    status === 'awaiting_tools' ||
    status === 'awaiting_context_approval' ||
    status === 'awaiting_approval' ||
    status === 'paused'
  )
    return null;

  let totalSec = 0;

  // Add remaining pipeline stages before execution
  if (currentIdx >= 0) {
    for (let i = currentIdx; i < pipeline.length - 1; i++) {
      totalSec += STAGE_META[pipeline[i]]?.eta || 5;
    }
  }

  // Add execution time per remaining phase (~25s each: execute + evaluate)
  if (status === 'active' || currentIdx >= 0) {
    totalSec += remainingPhases * 25;
  }

  if (totalSec <= 0) return null;

  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `~${min}m ${sec}s` : `~${sec}s`;
}

const GOAL_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'researching_customer', label: 'Scope Admission' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'pending_validation', label: 'Quality Check' },
  { value: 'awaiting_tools', label: 'Awaiting Tools' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function GoalsTab({ theme, isDark, onNewGoal, onStatsChange, refreshKey, paused = false }) {
  const { pushNotification } = useNotifications();
  const [searchParams] = useSearchParams();
  const orgFilter = searchParams.get('org_id') || '';
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    const s = searchParams.get('status');
    return GOAL_STATUS_OPTIONS.some((o) => o.value === s) ? s : 'all';
  });
  const [search, setSearch] = useState('');
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [detailId, setDetailId] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState(0);
  const [toolGoal, setToolGoal] = useState(null);
  const toolGoalRef = useRef(null);
  const dismissedGoalIds = useRef(new Set());

  // Compact, comparable signature of "what would visually change in a card".
  // If two polls produce the same signature, we skip setGoals entirely so the
  // grid doesn't re-render and the user's scroll position / hover state survives.
  const goalsSignature = (list) =>
    list
      .map((g) => `${g.id}:${g.status}:${g.updated_at}:${g.iteration || 0}:${g.spent_usd || 0}`)
      .join('|');
  const lastSignatureRef = useRef('');

  useEffect(() => {
    const s = searchParams.get('status');
    if (s && GOAL_STATUS_OPTIONS.some((o) => o.value === s)) setStatusFilter(s);
  }, [searchParams]);

  const fetchGoals = useCallback(
    async ({ silent = false } = {}) => {
      // Only show the full-page spinner for the initial load and explicit
      // user-driven refetches. Background polling at 20s used to setLoading(true)
      // on every tick, which unmounted the entire goal grid and replaced it with
      // a CircularProgress - making the page feel like it was refreshing every
      // 20 seconds and stealing the user's scroll position mid-click.
      if (!silent) setLoading(true);
      try {
        const data = await listGoals(statusFilter === 'all' ? null : statusFilter);
        const list = data || [];

        // Skip the state update when nothing actually changed. setGoals(list)
        // always produces a new array reference, which forces every card to
        // re-render even if no goal moved. Compare a compact signature first.
        const sig = goalsSignature(list);
        if (sig !== lastSignatureRef.current) {
          lastSignatureRef.current = sig;
          setGoals(list);
        }

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
      } catch (err) {
        console.error('[GoalsTab] Failed to load goals:', err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);
  // Re-fetch when parent signals a new goal was created
  useEffect(() => {
    if (refreshKey) fetchGoals();
  }, [refreshKey]);

  // Poll to refresh UI while goals are in-progress. Four guards:
  //  1. Skip when no goals are in active states
  //  2. Skip when `paused` (parent signals create dialog is open)
  //  3. Skip when user is inspecting a goal (detail/tool dialog open)
  //  4. Skip when the tab is hidden (browser visibility API)
  // Bumped from 8s to 20s - 8s was thrashing the UI (scroll/hover/selection
  // reset every refresh) and the backend's self-triggering processing means
  // sub-second freshness isn't required.
  useEffect(() => {
    if (paused || detailId || toolGoal) return;
    const needsPolling = hasPollableGoal(goals);
    if (!needsPolling) return;

    let timer = null;
    // Silent background poll - no loading spinner, no re-render when the data
    // is unchanged. Avoids the "page keeps refreshing while I scroll" UX.
    const tick = () => {
      if (document.visibilityState === 'visible') fetchGoals({ silent: true });
    };
    timer = setInterval(tick, 20000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [goals, fetchGoals, paused, detailId, toolGoal]);

  const handlePause = async (id) => {
    try {
      await pauseGoal(id);
      fetchGoals();
    } catch {}
  };
  const handleResume = async (id) => {
    try {
      await resumeGoal(id);
      fetchGoals();
    } catch {}
  };
  const handleCancel = async (id) => {
    try {
      await cancelGoal(id);
      fetchGoals();
    } catch {}
  };
  const handleRetry = async (id) => {
    try {
      await retryGoal(id);
      fetchGoals();
    } catch (err) {
      // eslint-disable-next-line no-alert -- simple feedback for now
      alert(`Retry failed: ${err.message}`);
    }
  };

  // Metrics
  const goalStats = useMemo(() => {
    const m = { total: goals.length, planning: 0, active: 0, awaiting: 0, completed: 0 };
    for (const g of goals) {
      if (g.status === 'researching_customer' || g.status === 'planning') m.planning++;
      else if (g.status === 'active' || g.status === 'pending_validation') m.active++;
      else if (g.status === 'awaiting_tools') m.awaiting++;
      else if (g.status === 'completed') m.completed++;
    }
    return m;
  }, [goals]);

  const goalStatCards = useMemo(
    () => [
      {
        label: 'Total Goals',
        value: goalStats.total,
        helper: 'All goals',
        color: theme.palette.primary.main,
        icon: TrackChangesOutlinedIcon,
      },
      {
        label: 'Planning',
        value: goalStats.planning,
        helper: 'AI planning phase',
        color: theme.palette.info.main,
        icon: HourglassEmptyOutlinedIcon,
      },
      {
        label: 'Active',
        value: goalStats.active,
        helper: 'Executing tasks',
        color: theme.palette.success.main,
        icon: PlayCircleOutlineIcon,
      },
      {
        label: 'Awaiting Tools',
        value: goalStats.awaiting,
        helper: 'Needs API keys',
        color: theme.palette.warning.main,
        icon: SyncOutlinedIcon,
      },
      {
        label: 'Completed',
        value: goalStats.completed,
        helper: 'Finished',
        color: theme.palette.secondary.main,
        icon: CheckCircleOutlineIcon,
      },
    ],
    [goalStats, theme]
  );

  // Expose stats to parent for metrics rendering
  useEffect(() => {
    onStatsChange?.(goalStatCards);
  }, [goalStatCards, onStatsChange]);

  // Filtered display
  const filtered = useMemo(() => {
    let list = goals;
    if (orgFilter) list = list.filter((g) => g.org_id === orgFilter);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (g) =>
        (g.title || '').toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q) ||
        (g.parsed_category || '').toLowerCase().includes(q)
    );
  }, [goals, search, orgFilter]);

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (search ? 1 : 0) + (orgFilter ? 1 : 0);

  return (
    <>
      {/* ── Toolbar ── */}
      <Box
        data-tour-block="jobpool-toolbar"
        data-tour-label="Controls"
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {orgFilter && (
          <Chip
            label={`Org filter active`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 700, fontSize: '0.68rem' }}
          />
        )}
        {/* Filter button */}
        <Tooltip title="Filters: search, status" placement="bottom" arrow>
          <IconButton
            onClick={(e) => setFilterAnchor(e.currentTarget)}
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: activeFilterCount > 0 ? 'primary.main' : 'divider',
              borderRadius: 2,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderColor: 'primary.main',
              },
            }}
          >
            <AppIcon
              name="Tune"
              fallback={TuneIcon}
              sx={{
                fontSize: 20,
                color: activeFilterCount > 0 ? 'primary.main' : 'text.secondary',
              }}
            />
            {activeFilterCount > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: '#fff',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {activeFilterCount}
              </Box>
            )}
          </IconButton>
        </Tooltip>

        {/* Filter popover */}
        <Popover
          open={Boolean(filterAnchor)}
          anchorEl={filterAnchor}
          onClose={() => setFilterAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              sx: {
                mt: 1.5,
                p: 0,
                borderRadius: 3,
                minWidth: 340,
                maxWidth: 400,
                boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
              },
            },
          }}
        >
          <Box
            sx={{
              px: 2.5,
              py: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                }}
              >
                <AppIcon name="Tune" fallback={TuneIcon} sx={{ fontSize: 22 }} />
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  Filters
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Search and filter goals
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ p: 2.5, maxHeight: 420, overflowY: 'auto' }}>
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                letterSpacing: '0.08em',
                fontSize: '0.7rem',
                display: 'block',
                mb: 1,
              }}
            >
              Search
            </Typography>
            <TextField
              size="small"
              placeholder="Search goals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
              sx={{ mb: 2, '& .MuiInputBase-root': { borderRadius: 2 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon
                      name="SearchOutlined"
                      fallback={SearchIcon}
                      sx={{ fontSize: 18, color: 'text.secondary' }}
                    />
                  </InputAdornment>
                ),
              }}
            />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                letterSpacing: '0.08em',
                fontSize: '0.7rem',
                display: 'block',
                mb: 1,
              }}
            >
              Status
            </Typography>
            <FormControl size="small" fullWidth sx={{ mb: 2 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ borderRadius: 2, fontWeight: 600 }}
              >
                {GOAL_STATUS_OPTIONS.map((opt) => (
                  <MenuItem
                    key={opt.value}
                    value={opt.value}
                    sx={
                      opt.value === 'all'
                        ? {
                            fontWeight: 700,
                            color: 'primary.main',
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                          }
                        : undefined
                    }
                  >
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              onClick={() => {
                setStatusFilter('all');
                setSearch('');
                setFilterAnchor(null);
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Reset filters
            </Button>
          </Box>
        </Popover>

        {/* View toggle */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v != null && setViewMode(v)}
          size="small"
          sx={{
            bgcolor: alpha(theme.palette.background.default, 0.8),
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '& .MuiToggleButton-root': {
              px: 1.25,
              py: 0.75,
              border: 'none',
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
              },
            },
          }}
        >
          <ToggleButton value="cards" aria-label="Card view">
            <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
          <ToggleButton value="table" aria-label="Table view">
            <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={onNewGoal}
          sx={{
            borderRadius: 99,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.82rem',
            px: 2.5,
            borderWidth: 2,
            '&:hover': { borderWidth: 2 },
          }}
        >
          New Goal
        </Button>
      </Box>
      {/* ── Content ── */}
      <Box sx={{ p: { xs: 1.25, sm: 1.5 }, overflow: 'hidden' }}>
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={TrackChangesOutlinedIcon}
            title="No goals yet"
            description="Create your first goal - it will be planned and executed by AI agents automatically."
            actionLabel="Create Goal"
            onAction={onNewGoal}
          />
        ) : viewMode === 'cards' ? (
          <>
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                letterSpacing: '0.08em',
                fontSize: '0.68rem',
                display: 'block',
                mb: 1.5,
              }}
            >
              {filtered.length} goal{filtered.length !== 1 ? 's' : ''}
            </Typography>
            <Box
              data-tour-block="jobpool-content"
              data-tour-label="Your requests"
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                width: '100%',
              }}
            >
              {filtered.map((goal) => {
                const phases = goal.plan?.phases || [];
                const completedPhases = phases.filter((p) => p.status === 'completed').length;
                const progress = phases.length > 0 ? (completedPhases / phases.length) * 100 : 0;
                const budgetUsed = goal.spent_usd || 0;
                const stageMeta = STAGE_META[goal.status] || STAGE_META.active;
                const eta = getGoalEta(goal);
                const budgetPct =
                  goal.budget_usd > 0 ? Math.min(100, (budgetUsed / goal.budget_usd) * 100) : 0;
                const statusColor =
                  theme.palette[GOAL_STATUS_COLORS[goal.status]]?.main ||
                  theme.palette.primary.main;

                return (
                  <Paper
                    key={goal.id}
                    elevation={0}
                    onClick={() => {
                      setDetailInitialTab(0);
                      setDetailId(goal.id);
                    }}
                    sx={{
                      p: 2,
                      borderRadius: 2.5,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: alpha(statusColor, 0.22),
                      background: `linear-gradient(135deg, ${alpha(statusColor, 0.04)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
                      '&:hover': {
                        borderColor: 'primary.main',
                        boxShadow: createHoverGlowShadow(theme),
                      },
                      transition: 'all 0.2s',
                      overflow: 'hidden',
                      minWidth: 0,
                    }}
                  >
                    {/* Header */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={goal.status}
                          size="small"
                          color={GOAL_STATUS_COLORS[goal.status] || 'default'}
                          sx={{ fontSize: '0.65rem', height: 20, fontWeight: 600 }}
                        />
                        {goal.complexity === 'complex' && (
                          <Chip
                            label="Complex"
                            size="small"
                            variant="outlined"
                            color="secondary"
                            sx={{ fontSize: '0.6rem', height: 18 }}
                          />
                        )}
                        {goal.parsed_category && (
                          <Chip
                            label={goal.parsed_category}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.6rem', height: 18 }}
                          />
                        )}
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.disabled', flexShrink: 0 }}>
                        {formatRelative(goal.created_at)}
                      </Typography>
                    </Box>
                    {/* Title + Description */}
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        mb: 0.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {goal.title}
                    </Typography>
                    {(goal.data?.project_overview?.tagline || goal.description) && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mb: 1,
                        }}
                      >
                        {goal.data?.project_overview?.tagline || goal.description}
                      </Typography>
                    )}
                    {/* Show failure reason inline when the goal is failed or
                        parked in needs_human. Saves the user from having to
                        open the detail dialog just to read the error. */}
                    {(goal.status === 'failed' || goal.status === 'needs_human') &&
                      goal.data?.failure_reason && (
                        <Box
                          sx={{
                            mb: 1,
                            p: 0.75,
                            borderRadius: 1,
                            bgcolor: alpha(theme.palette.warning.main, 0.08),
                            border: '1px solid',
                            borderColor: alpha(theme.palette.warning.main, 0.25),
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'warning.main',
                              fontWeight: 600,
                              fontSize: '0.65rem',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: 1.35,
                            }}
                          >
                            {goal.data.failure_reason.slice(0, 220)}
                          </Typography>
                        </Box>
                      )}
                    {/* Stage + Phase progress */}
                    <Box
                      sx={{
                        mb: 0.75,
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: alpha(statusColor, 0.06),
                        border: '1px solid',
                        borderColor: alpha(statusColor, 0.1),
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mb: 0.5,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {stageMeta.Icon && (
                            <AppIcon
                              fallback={stageMeta.Icon}
                              sx={{ fontSize: 16, color: statusColor }}
                            />
                          )}
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.65rem', fontWeight: 600, color: statusColor }}
                          >
                            {stageMeta.label}
                          </Typography>
                        </Box>
                        {eta && (
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                              bgcolor: alpha(theme.palette.text.primary, 0.06),
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 1,
                            }}
                          >
                            ETA {eta}
                          </Typography>
                        )}
                      </Box>
                      {phases.length > 0 && (
                        <>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontSize: '0.6rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Phase {completedPhases}/{phases.length}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={progress}
                            sx={{ height: 4, borderRadius: 3, mt: 0.25 }}
                          />
                        </>
                      )}
                    </Box>
                    {/* Budget */}
                    <Box sx={{ mb: 0.75 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Budget ${budgetUsed.toFixed(2)} / ${goal.budget_usd}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={budgetPct}
                        color={budgetPct > 80 ? 'warning' : 'info'}
                        sx={{ height: 4, borderRadius: 3, mt: 0.5 }}
                      />
                    </Box>
                    {/* Estimates - live elapsed vs estimated time + cost */}
                    {(() => {
                      const TERMINAL = ['completed', 'failed', 'cancelled'];
                      const isTerminal = TERMINAL.includes(goal.status);
                      const startedAt =
                        phases.find((p) => p.started_at)?.started_at ||
                        (!isTerminal ? goal.created_at : phases[0]?.started_at || goal.created_at);
                      // Freeze the timer when the goal is in a terminal state
                      const endedAt = isTerminal
                        ? goal.data?.completed_at || goal.data?.failed_at || goal.updated_at
                        : null;
                      const estMin =
                        goal.proposal?.estimates?.total_estimated_time_minutes ||
                        goal.data?.estimates?.total_estimated_time_minutes ||
                        null;
                      const estCost =
                        goal.proposal?.estimates?.total_estimated_cost_usd ||
                        goal.data?.estimates?.total_estimated_cost_usd ||
                        null;
                      if (!startedAt && !estMin && estCost == null) return null;
                      return (
                        <Box
                          sx={{
                            mb: 0.75,
                            p: 1,
                            borderRadius: 1.5,
                            bgcolor: alpha(theme.palette.background.default, 0.4),
                            border: '1px solid',
                            borderColor: 'divider',
                            opacity: isTerminal ? 0.7 : 1,
                          }}
                        >
                          <GoalEstimates
                            startedAt={startedAt}
                            endedAt={endedAt}
                            estimatedMinutes={estMin}
                            estimatedCostUsd={estCost}
                            spentUsd={budgetUsed}
                            compact
                          />
                        </Box>
                      );
                    })()}
                    {/* Actions */}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        mt: 1,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        pt: 1,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {goal.status === 'awaiting_tools' && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="info"
                          onClick={() => {
                            setDetailId(null);
                            dismissedGoalIds.current.delete(goal.id);
                            toolGoalRef.current = goal;
                            setToolGoal(goal);
                          }}
                          sx={{
                            textTransform: 'none',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            borderRadius: 1.5,
                            minWidth: 0,
                            px: 1,
                          }}
                        >
                          Setup Tools
                        </Button>
                      )}
                      {goal.status === 'active' && (
                        <Tooltip title="Pause">
                          <IconButton size="small" onClick={() => handlePause(goal.id)}>
                            <AppIcon
                              name="PauseCircleOutline"
                              fallback={PauseCircleOutlineIcon}
                              sx={{ fontSize: 18 }}
                            />
                          </IconButton>
                        </Tooltip>
                      )}
                      {goal.status === 'paused' && (
                        <Tooltip title="Resume">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleResume(goal.id)}
                          >
                            <AppIcon
                              name="PlayCircleOutline"
                              fallback={PlayCircleOutlineIcon}
                              sx={{ fontSize: 18 }}
                            />
                          </IconButton>
                        </Tooltip>
                      )}
                      {[
                        'researching_customer',
                        'planning',
                        'active',
                        'pending_validation',
                        'paused',
                      ].includes(goal.status) && (
                        <Tooltip title="Cancel">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleCancel(goal.id)}
                          >
                            <AppIcon
                              name="BlockOutlined"
                              fallback={BlockOutlinedIcon}
                              sx={{ fontSize: 18 }}
                            />
                          </IconButton>
                        </Tooltip>
                      )}
                      {(goal.status === 'failed' || goal.status === 'cancelled') && (
                        <Tooltip title="Retry - reset and run from start">
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            startIcon={
                              <AppIcon
                                name="RestartAltOutlined"
                                fallback={RestartAltOutlinedIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            onClick={() => handleRetry(goal.id)}
                            sx={{
                              textTransform: 'none',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              borderRadius: 1.5,
                              minWidth: 0,
                              px: 1,
                              py: 0.25,
                            }}
                          >
                            Retry
                          </Button>
                        </Tooltip>
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Tooltip title="Details">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setDetailInitialTab(0);
                            setDetailId(goal.id);
                          }}
                        >
                          <AppIcon
                            name="VisibilityOutlined"
                            fallback={VisibilityOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Activity Log">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setDetailInitialTab(1);
                            setDetailId(goal.id);
                          }}
                        >
                          <AppIcon
                            name="HistoryOutlined"
                            fallback={HistoryOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    {/* Confidence */}
                    {goal.confidence_score > 0 && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.disabled',
                          fontSize: '0.6rem',
                          display: 'block',
                          mt: 0.5,
                        }}
                      >
                        Confidence: {goal.confidence_score}%
                      </Typography>
                    )}
                    {/* Failure reason - visible only for failed/cancelled goals */}
                    {(goal.status === 'failed' || goal.status === 'cancelled') &&
                      (goal.data?.failure_reason || goal.failure_reason) && (
                        <Box
                          sx={{
                            mt: 0.75,
                            p: 0.75,
                            borderRadius: 1,
                            bgcolor: alpha(theme.palette.error.main, 0.06),
                            border: '1px solid',
                            borderColor: alpha(theme.palette.error.main, 0.2),
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'error.main',
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              display: 'block',
                            }}
                          >
                            Why it failed
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'error.main',
                              fontSize: '0.65rem',
                              display: 'block',
                              mt: 0.25,
                              lineHeight: 1.35,
                            }}
                          >
                            {goal.data?.failure_reason || goal.failure_reason}
                          </Typography>
                        </Box>
                      )}
                  </Paper>
                );
              })}
            </Box>
          </>
        ) : (
          /* Table view */
          <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', overflowX: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Goal</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">
                    Status
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">
                    Progress
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">
                    Budget
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="center">
                    Created
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((goal) => {
                  const phases = goal.plan?.phases || [];
                  const completedPhases = phases.filter((p) => p.status === 'completed').length;
                  const budgetUsed = goal.spent_usd || 0;
                  return (
                    <TableRow
                      key={goal.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => {
                        setDetailInitialTab(0);
                        setDetailId(goal.id);
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, maxWidth: 260 }} noWrap>
                          {goal.title}
                        </Typography>
                        {goal.description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            sx={{ maxWidth: 260, display: 'block' }}
                          >
                            {goal.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={goal.status}
                          size="small"
                          color={GOAL_STATUS_COLORS[goal.status] || 'default'}
                          sx={{ fontSize: '0.65rem', height: 20, fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {goal.parsed_category || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="caption" color="text.secondary">
                          {phases.length > 0 ? `${completedPhases}/${phases.length}` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                        >
                          ${budgetUsed.toFixed(2)} / ${goal.budget_usd}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="caption" color="text.secondary">
                          {formatRelative(goal.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }}>
                          {goal.status === 'awaiting_tools' && (
                            <Tooltip title="Setup Tools">
                              <IconButton
                                size="small"
                                color="info"
                                onClick={() => {
                                  setDetailId(null);
                                  dismissedGoalIds.current.delete(goal.id);
                                  toolGoalRef.current = goal;
                                  setToolGoal(goal);
                                }}
                              >
                                <AppIcon
                                  name="SyncOutlined"
                                  fallback={SyncOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Details">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setDetailInitialTab(0);
                                setDetailId(goal.id);
                              }}
                            >
                              <AppIcon
                                name="VisibilityOutlined"
                                fallback={VisibilityOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
      <GoalDetailDialog
        open={!!detailId}
        onClose={() => setDetailId(null)}
        goalId={detailId}
        initialTab={detailInitialTab}
        onUpdated={() => fetchGoals()}
        onSetupTools={(goal) => {
          setDetailId(null);
          dismissedGoalIds.current.delete(goal.id);
          toolGoalRef.current = goal;
          setToolGoal(goal);
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
    </>
  );
}

// RequestsTab removed - Goals replaces Requests
/* eslint-disable no-undef -- Legacy RequestsTab is retained temporarily but is not rendered. */
function _UNUSED_RequestsTab() {
  const { showToolRequirements } = useToolRequirements();

  // ── Filter state ──────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // ── Sort & pagination ─────────────────────────────────────
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('createdAt');

  // ── View mode ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('orch_requests_view') || 'list';
    } catch {
      return 'list';
    }
  });
  const handleViewMode = (_, v) => {
    if (v) {
      setViewMode(v);
      try {
        localStorage.setItem('orch_requests_view', v);
      } catch {}
    }
  };

  // ── Dialog state ──────────────────────────────────────────
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Detail dialog ─────────────────────────────────────────
  const [detailDialog, setDetailDialog] = useState({ open: false, request: null });
  const [detailJob, setDetailJob] = useState(null);
  const [detailTasks, setDetailTasks] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPipelineRunning, setDetailPipelineRunning] = useState(false);
  const [taskOutputDialog, setTaskOutputDialog] = useState(null);

  // Load linked job + tasks when detail dialog opens
  useEffect(() => {
    if (!detailDialog.open || !detailDialog.request) {
      setDetailJob(null);
      setDetailTasks([]);
      return;
    }
    const r = detailDialog.request;
    setDetailLoading(true);
    (async () => {
      try {
        let job = null;
        if (r.resultJobId) {
          job = await getJobById(r.resultJobId);
        }
        setDetailJob(job);
        if (job) {
          const allTasks = await loadTeamTasks();
          setDetailTasks(allTasks.filter((t) => t.jobPoolId === job.id));
        }
      } catch {
        /* ignore */
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailDialog.open, detailDialog.request]);

  // Detail dialog actions
  const handleDetailRunPipeline = useCallback(async () => {
    const r = detailDialog.request;
    if (!r) return;
    setDetailPipelineRunning(true);
    try {
      await editRequest(r.id, { status: 'processing', processingNotes: 'Running pipeline...' });
      await runPipeline(r, pipelineAgents, [], (msg) => setPipelineMsg(msg));
      setPipelineMsg('Pipeline complete');
      setDetailDialog({ open: false, request: null });
    } catch (err) {
      setPipelineMsg(`Pipeline failed: ${err.message}`);
    } finally {
      setDetailPipelineRunning(false);
    }
  }, [detailDialog.request, editRequest, pipelineAgents, setPipelineMsg]);

  const handleDetailViewJob = useCallback(() => {
    const r = detailDialog.request;
    if (!r?.resultJobId) return;
    setDetailDialog({ open: false, request: null });
    onSwitchToJobs?.();
  }, [detailDialog.request, onSwitchToJobs]);

  // ── Delete state ──────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Handlers ──────────────────────────────────────────────
  const handleSmartCreate = useCallback(
    async (data) => {
      // Goal-based flow - SmartRequestDialog creates the goal directly
      if (data?.type === 'goal' && data.goal) {
        logAction({
          action: 'Goal created',
          entity: 'Goal',
          entityId: data.goal.id,
          details: `Created goal "${(data.goal.title || '').slice(0, 60)}"`,
          meta: { source: 'jobPoolPage', importance: 'medium', tags: ['create', 'goal'] },
        }).catch(() => {});
        setPipelineMsg(
          `Goal created - ${data.goal.execution_mode === 'manual' ? 'awaiting approval' : 'planning started'}`
        );
        setNewDialogOpen(false);
        return;
      }

      // Legacy request flow (backward compat)
      if (!data.requestText?.trim() || saving) return;
      setSaving(true);
      try {
        const created = await addRequest({
          requestText: data.requestText.trim(),
          parsedTitle: data.parsedTitle || null,
          parsedCategory: data.parsedCategory || null,
          parsedRequirements: data.parsedRequirements || null,
          parsedPriority: data.parsedPriority || 'medium',
        });
        if (created) {
          logAction({
            action: 'Request created',
            entity: 'Request',
            entityId: created.id,
            details: `Submitted request "${(data.parsedTitle || data.requestText).slice(0, 60)}"`,
            meta: { source: 'jobPoolPage', importance: 'medium', tags: ['create', 'request'] },
          }).catch(() => {});

          runPipeline(created, pipelineAgents, [], (msg) => setPipelineMsg(msg))
            .then((result) => {
              setPipelineMsg(
                result?.assignment
                  ? `Pipeline complete - assigned to ${result.assignment.agent.role || result.assignment.agent.name || 'agent'}`
                  : 'Pipeline complete - job & tasks created'
              );
              if (result?.assignment?.agent) {
                showToolRequirements({
                  agent: result.assignment.agent,
                  teamName: result.assignment.agent.category || '',
                  jobId: result.job?.id,
                });
              }
            })
            .catch((err) => {
              console.error('[pipeline] Error:', err);
              setPipelineMsg('Pipeline encountered an error');
            });
        }
        setNewDialogOpen(false);
      } catch (err) {
        console.error('Failed to create request:', err);
      } finally {
        setSaving(false);
      }
    },
    [saving, addRequest, pipelineAgents, setPipelineMsg]
  );

  const handleApproveJob = useCallback(async (jobId, decision) => {
    const result = await approvePipelineJob(jobId, decision);
    if (result) {
      setPipelineMsg(
        decision === 'approved'
          ? 'Job approved - report generated'
          : 'Job rejected - tasks reopened for rework'
      );
    }
  }, []);

  const handleSort = (sortKey) => {
    if (!sortKey) return;
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    await removeRequest(deleteConfirm.id);
    logAction({
      action: 'Request deleted',
      entity: 'Request',
      entityId: deleteConfirm.id,
      details: `Deleted request "${deleteConfirm.parsedTitle || deleteConfirm.requestText?.slice(0, 50) || 'Untitled'}"`,
      meta: { source: 'jobPoolPage', importance: 'high', tags: ['delete', 'request'] },
    }).catch(() => {});
    setDeleteConfirm(null);
  }, [deleteConfirm, removeRequest]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setPriorityFilter('All');
  };

  // ── Derived data ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...requests];
    if (statusFilter !== 'All') list = list.filter((r) => r.status === statusFilter);
    if (priorityFilter !== 'All') list = list.filter((r) => r.parsedPriority === priorityFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.id || '').toLowerCase().includes(q) ||
          (r.requestText || '').toLowerCase().includes(q) ||
          (r.parsedTitle || '').toLowerCase().includes(q) ||
          (r.parsedCategory || '').toLowerCase().includes(q) ||
          (r.assignedConciliumName || '').toLowerCase().includes(q) ||
          (r.processingNotes || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, search, statusFilter, priorityFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[orderBy] ?? '';
      const valB = b[orderBy] ?? '';
      if (valB < valA) return order === 'desc' ? -1 : 1;
      if (valB > valA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [filtered, order, orderBy]);

  const requestsPagination = usePagination(sorted, {
    surfaceId: 'jobPool.historical',
    defaultRowsPerPage: 10,
    resetOn: [search, statusFilter, priorityFilter, viewMode],
  });
  const paginated = requestsPagination.paginatedData;

  return (
    <>
      {/* ── Toolbar ──────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          borderBottom: '1px solid',
          borderColor: 'divider',
          p: 1.5,
        }}
      >
        <Tooltip title="Filter requests" placement="bottom" arrow>
          <IconButton
            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderColor: 'primary.main',
              },
            }}
          >
            <AppIcon
              name="Tune"
              fallback={TuneIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewMode}
          size="small"
          sx={{
            bgcolor: alpha(theme.palette.background.default, 0.8),
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '& .MuiToggleButton-root': {
              px: 1.25,
              py: 0.75,
              border: 'none',
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.22) },
              },
            },
          }}
        >
          <ToggleButton value="card" aria-label="Card view">
            <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
          <ToggleButton value="list" aria-label="List view">
            <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title="Activity Log" placement="bottom" arrow>
          <IconButton
            onClick={openActivityLog}
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderColor: 'primary.main',
              },
            }}
            aria-label="Activity Log"
          >
            <AppIcon
              name="History"
              fallback={HistoryIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={() => setNewDialogOpen(true)}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
        >
          New Request
        </Button>
      </Box>
      {/* ── Filter Popover ───────────────────────────────── */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              p: 0,
              borderRadius: 3,
              minWidth: 340,
              maxWidth: 400,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            },
          },
        }}
      >
        <Box sx={{ px: 2.5, pt: 2.5, pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AppIcon name="Tune" fallback={TuneIcon} sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Filter Requests
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Narrow down requests by text, status, or priority.
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
              display: 'block',
              mb: 1,
            }}
          >
            Search
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Search requests..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon
                    name="SearchOutlined"
                    fallback={SearchIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
              display: 'block',
              mb: 1,
            }}
          >
            Status
          </Typography>
          <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => {
                setStatusFilter(e.target.value);
              }}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              <MenuItem
                value="All"
                sx={{
                  fontWeight: 700,
                  color: 'primary.main',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                All Statuses
              </MenuItem>
              {REQUEST_STATUSES_LIST.map((s) => (
                <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
              display: 'block',
              mb: 1,
            }}
          >
            Priority
          </Typography>
          <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
            <InputLabel>Priority</InputLabel>
            <Select
              value={priorityFilter}
              label="Priority"
              onChange={(e) => {
                setPriorityFilter(e.target.value);
              }}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              <MenuItem
                value="All"
                sx={{
                  fontWeight: 700,
                  color: 'primary.main',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                All Priorities
              </MenuItem>
              {REQUEST_PRIORITIES_LIST.map((p) => (
                <MenuItem key={p} value={p} sx={{ textTransform: 'capitalize' }}>
                  {p}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            fullWidth
            variant="outlined"
            size="small"
            onClick={resetFilters}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: 'divider',
            }}
          >
            Reset filters
          </Button>
        </Box>
      </Popover>
      {/* ── Content ──────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <Box sx={{ p: 4 }}>
          <EmptyState
            icon={InboxOutlinedIcon}
            title="No requests found"
            description={
              search || statusFilter !== 'All' || priorityFilter !== 'All'
                ? 'Try adjusting your filters.'
                : 'Submit your first request to get started.'
            }
            actionLabel="New Request"
            onAction={() => setNewDialogOpen(true)}
          />
        </Box>
      ) : viewMode === 'card' ? (
        /* ── Card View ─────────────────────────────────── */
        <Box sx={{ p: 1.5, overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              width: '100%',
            }}
          >
            {paginated.map((req) => {
              const sc =
                (isDark ? REQUEST_STATUS_COLORS_DARK : REQUEST_STATUS_COLORS)[req.status] ||
                (isDark ? REQUEST_STATUS_COLORS_DARK : REQUEST_STATUS_COLORS).pending;
              const pc =
                (isDark ? PRIORITY_COLORS_DARK : PRIORITY_COLORS)[req.parsedPriority] ||
                (isDark ? PRIORITY_COLORS_DARK : PRIORITY_COLORS).medium;
              return (
                <Paper
                  key={req.id}
                  elevation={0}
                  onClick={() => setDetailDialog({ open: true, request: req })}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    minWidth: 0,
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: createHoverGlowShadow(theme),
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Chip
                        label={req.status}
                        size="small"
                        sx={{
                          height: 24,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          bgcolor: sc.bg,
                          color: sc.color,
                          border: `1px solid ${sc.border}`,
                          textTransform: 'capitalize',
                        }}
                      />
                      <Chip
                        label={req.parsedPriority}
                        size="small"
                        sx={{
                          height: 24,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          bgcolor: pc.bg,
                          color: pc.color,
                          border: `1px solid ${pc.border}`,
                          textTransform: 'capitalize',
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      {formatRelative(req.createdAt)}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      mb: 0.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {req.parsedTitle || 'Untitled Request'}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      mb: 0.5,
                    }}
                  >
                    {req.requestText || '-'}
                  </Typography>
                  {req.parsedCategory && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <AppIcon
                        name="FolderOutlined"
                        fallback={FolderOutlinedIcon}
                        sx={{ fontSize: 14, color: 'text.secondary' }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {req.parsedCategory}
                      </Typography>
                    </Box>
                  )}
                  {req.assignedConciliumName && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <AppIcon
                        name="GroupsOutlined"
                        fallback={GroupsOutlinedIcon}
                        sx={{ fontSize: 14, color: 'text.secondary' }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {req.assignedConciliumName}
                      </Typography>
                    </Box>
                  )}
                  {req.resultJobId && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AppIcon
                        name="WorkOutline"
                        fallback={WorkOutlineIcon}
                        sx={{ fontSize: 14, color: 'primary.main' }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                      >
                        {req.resultJobId}
                      </Typography>
                    </Box>
                  )}
                  {req.costUsd > 0 && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.disabled',
                        fontSize: '0.65rem',
                        display: 'block',
                        mt: 0.25,
                      }}
                    >
                      ${Number(req.costUsd).toFixed(2)}
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Box>
          <Pagination
            count={requestsPagination.totalCount}
            page={requestsPagination.page}
            rowsPerPage={requestsPagination.rowsPerPage}
            rowsPerPageOptions={requestsPagination.rowsPerPageOptions}
            onPageChange={requestsPagination.setPage}
            onRowsPerPageChange={requestsPagination.setRowsPerPage}
            onLoadAll={requestsPagination.loadAll}
            onCollapseAll={requestsPagination.collapseAll}
            allMode={requestsPagination.allMode}
            label="requests"
          />
        </Box>
      ) : (
        /* ── Table View ────────────────────────────────── */
        <>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', flex: 1, overflowX: 'auto' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {REQUEST_COLUMNS.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align || 'left'}
                      sx={{ minWidth: col.minWidth, whiteSpace: 'nowrap', fontWeight: 600 }}
                    >
                      {col.sortKey ? (
                        <TableSortLabel
                          active={orderBy === col.sortKey}
                          direction={orderBy === col.sortKey ? order : 'asc'}
                          onClick={() => handleSort(col.sortKey)}
                        >
                          {col.label}
                        </TableSortLabel>
                      ) : (
                        col.label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((req) => {
                  const sc =
                    (isDark ? REQUEST_STATUS_COLORS_DARK : REQUEST_STATUS_COLORS)[req.status] ||
                    (isDark ? REQUEST_STATUS_COLORS_DARK : REQUEST_STATUS_COLORS).pending;
                  const pc =
                    (isDark ? PRIORITY_COLORS_DARK : PRIORITY_COLORS)[req.parsedPriority] ||
                    (isDark ? PRIORITY_COLORS_DARK : PRIORITY_COLORS).medium;
                  return (
                    <TableRow
                      key={req.id}
                      hover
                      sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                      onClick={() => setDetailDialog({ open: true, request: req })}
                    >
                      {/* Request ID */}
                      <TableCell>
                        <Tooltip title={req.id}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              color: 'text.secondary',
                            }}
                          >
                            {req.id.length > 20 ? `${req.id.slice(0, 20)}...` : req.id}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Title */}
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 200,
                          }}
                        >
                          {req.parsedTitle || 'Untitled'}
                        </Typography>
                      </TableCell>
                      {/* Request Text */}
                      <TableCell>
                        <Tooltip title={req.requestText}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              maxWidth: 260,
                            }}
                          >
                            {req.requestText || '-'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Status */}
                      <TableCell align="center">
                        <Chip
                          label={req.status}
                          size="small"
                          sx={{
                            height: 24,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            bgcolor: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                            textTransform: 'capitalize',
                          }}
                        />
                      </TableCell>
                      {/* Priority */}
                      <TableCell align="center">
                        <Chip
                          label={req.parsedPriority}
                          size="small"
                          sx={{
                            height: 24,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            bgcolor: pc.bg,
                            color: pc.color,
                            border: `1px solid ${pc.border}`,
                            textTransform: 'capitalize',
                          }}
                        />
                      </TableCell>
                      {/* Category */}
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {req.parsedCategory || '-'}
                        </Typography>
                      </TableCell>
                      {/* Concilium */}
                      <TableCell>
                        {req.assignedConciliumName ? (
                          <Chip
                            size="small"
                            icon={
                              <AppIcon
                                name="GroupsOutlined"
                                fallback={GroupsOutlinedIcon}
                                sx={{ fontSize: 14 }}
                              />
                            }
                            label={req.assignedConciliumName}
                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Result Job */}
                      <TableCell>
                        {req.resultJobId ? (
                          <Tooltip title={req.resultJobId}>
                            <Chip
                              size="small"
                              icon={
                                <AppIcon
                                  name="WorkOutline"
                                  fallback={WorkOutlineIcon}
                                  sx={{ fontSize: 14 }}
                                />
                              }
                              label={
                                req.resultJobId.length > 16
                                  ? `${req.resultJobId.slice(0, 16)}...`
                                  : req.resultJobId
                              }
                              sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      {/* Cost */}
                      <TableCell align="right">
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontFamily: 'monospace' }}
                        >
                          {req.costUsd ? `$${Number(req.costUsd).toFixed(2)}` : '-'}
                        </Typography>
                      </TableCell>
                      {/* Created */}
                      <TableCell align="center">
                        <Tooltip title={formatDate(req.createdAt)}>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {formatRelative(req.createdAt)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      {/* Actions */}
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="View details">
                            <IconButton
                              size="small"
                              onClick={() => setDetailDialog({ open: true, request: req })}
                            >
                              <AppIcon
                                name="VisibilityOutlined"
                                fallback={VisibilityOutlinedIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirm(req)}
                              sx={{ color: 'error.main' }}
                            >
                              <AppIcon
                                name="DeleteOutline"
                                fallback={DeleteOutlineIcon}
                                sx={{ fontSize: 18 }}
                              />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination
            count={requestsPagination.totalCount}
            page={requestsPagination.page}
            rowsPerPage={requestsPagination.rowsPerPage}
            rowsPerPageOptions={requestsPagination.rowsPerPageOptions}
            onPageChange={requestsPagination.setPage}
            onRowsPerPageChange={requestsPagination.setRowsPerPage}
            onLoadAll={requestsPagination.loadAll}
            onCollapseAll={requestsPagination.collapseAll}
            allMode={requestsPagination.allMode}
            label="requests"
          />
        </>
      )}
      {/* ── New Request Dialog ────────────────────────────── */}
      <SmartRequestDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        onSubmit={handleSmartCreate}
      />
      {/* ── Detail Dialog ─────────────────────────────────── */}
      {detailDialog.request && (
        <FormDialog
          open={detailDialog.open}
          onClose={() => setDetailDialog({ open: false, request: null })}
          title={detailDialog.request.parsedTitle || 'Untitled Request'}
          subtitle={detailDialog.request.id}
          icon={InboxOutlinedIcon}
          maxWidth="md"
          footerJustify="space-between"
          actions={
            <>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {(detailDialog.request.status === 'pending' ||
                  detailDialog.request.status === 'failed') && (
                  <Button
                    variant="contained"
                    disableElevation
                    startIcon={
                      detailPipelineRunning ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <AppIcon name="PlayCircleOutline" fallback={PlayCircleOutlineIcon} />
                      )
                    }
                    disabled={detailPipelineRunning}
                    onClick={handleDetailRunPipeline}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                  >
                    {detailDialog.request.status === 'failed' ? 'Retry Pipeline' : 'Run Pipeline'}
                  </Button>
                )}
                {detailDialog.request.resultJobId && (
                  <Button
                    variant="outlined"
                    startIcon={<AppIcon name="WorkOutline" fallback={WorkOutlineIcon} />}
                    onClick={handleDetailViewJob}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                  >
                    View Job
                  </Button>
                )}
              </Box>
              <Button
                onClick={() => setDetailDialog({ open: false, request: null })}
                sx={{ textTransform: 'none' }}
              >
                Close
              </Button>
            </>
          }
        >
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {(() => {
              const r = detailDialog.request;
              const sc =
                (isDark ? REQUEST_STATUS_COLORS_DARK : REQUEST_STATUS_COLORS)[r.status] ||
                (isDark ? REQUEST_STATUS_COLORS_DARK : REQUEST_STATUS_COLORS).pending;
              const pc =
                (isDark ? PRIORITY_COLORS_DARK : PRIORITY_COLORS)[r.parsedPriority] ||
                (isDark ? PRIORITY_COLORS_DARK : PRIORITY_COLORS).medium;
              return (
                <>
                  <Chip
                    label={r.status}
                    size="small"
                    sx={{
                      fontWeight: 600,
                      bgcolor: sc.bg,
                      color: sc.color,
                      border: `1px solid ${sc.border}`,
                      textTransform: 'capitalize',
                    }}
                  />
                  <Chip
                    label={r.parsedPriority}
                    size="small"
                    sx={{
                      fontWeight: 600,
                      bgcolor: pc.bg,
                      color: pc.color,
                      border: `1px solid ${pc.border}`,
                      textTransform: 'capitalize',
                    }}
                  />
                  {r.parsedCategory && (
                    <Chip label={r.parsedCategory} size="small" variant="outlined" />
                  )}
                </>
              );
            })()}
          </Box>

          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              mb: 0.5,
              color: 'text.secondary',
              textTransform: 'uppercase',
              fontSize: '0.7rem',
              letterSpacing: '0.05em',
            }}
          >
            Request Text
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.background.default, 0.5),
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {detailDialog.request.requestText || '-'}
            </Typography>
          </Paper>

          {detailDialog.request.parsedRequirements && (
            <>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 0.5,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.05em',
                }}
              >
                Parsed Requirements
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {detailDialog.request.parsedRequirements}
                </Typography>
              </Paper>
            </>
          )}

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              mt: 1,
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Concilium
              </Typography>
              <Typography variant="body2">
                {detailDialog.request.assignedConciliumName || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Result Job
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {detailDialog.request.resultJobId || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Result Agent
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {detailDialog.request.resultAgentId || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Cost
              </Typography>
              <Typography variant="body2">
                {detailDialog.request.costUsd
                  ? `$${Number(detailDialog.request.costUsd).toFixed(4)}`
                  : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Created
              </Typography>
              <Typography variant="body2">{formatDate(detailDialog.request.createdAt)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Updated
              </Typography>
              <Typography variant="body2">{formatDate(detailDialog.request.updatedAt)}</Typography>
            </Box>
          </Box>

          {/* ── Activity Log ─────────────────────────── */}
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              mt: 2.5,
              mb: 1,
              color: 'text.secondary',
              textTransform: 'uppercase',
              fontSize: '0.7rem',
              letterSpacing: '0.05em',
            }}
          >
            Activity Log
          </Typography>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : (
            <Box sx={{ position: 'relative', pl: 3 }}>
              {/* Timeline line */}
              <Box
                sx={{
                  position: 'absolute',
                  left: 8,
                  top: 4,
                  bottom: 4,
                  width: 2,
                  bgcolor: alpha(theme.palette.divider, 0.5),
                  borderRadius: 1,
                }}
              />

              {/* 1. Request submitted */}
              {(() => {
                const r = detailDialog.request;
                const entries = [];

                entries.push({
                  key: 'submitted',
                  color: 'success.main',
                  label: 'Request submitted',
                  time: r.createdAt,
                });

                if (detailJob) {
                  entries.push({
                    key: 'job-created',
                    color: 'success.main',
                    label: `Job created`,
                    sub: detailJob.id,
                    time: detailJob.createdAt,
                  });

                  if (detailJob.assignedAgentName) {
                    entries.push({
                      key: 'agent',
                      color: 'info.main',
                      label: `Agent assigned: ${detailJob.assignedAgentName}`,
                      time: detailJob.updatedAt,
                    });
                  }

                  if (detailTasks.length > 0) {
                    const doneTasks = detailTasks.filter((t) => t.status === 'done');
                    entries.push({
                      key: 'tasks-gen',
                      color: 'info.main',
                      label: `${detailTasks.length} tasks generated (${doneTasks.length} done)`,
                      time: detailTasks[0]?.createdAt,
                    });
                  }
                }

                // Per-task entries
                for (const task of detailTasks) {
                  const taskColor =
                    task.status === 'done'
                      ? 'success.main'
                      : task.status === 'inProgress'
                        ? 'primary.main'
                        : 'text.disabled';
                  entries.push({
                    key: `task-${task.id}`,
                    color: taskColor,
                    label: task.title,
                    sub:
                      task.status === 'done' && task.data?.output
                        ? task.data.output.slice(0, 120) +
                          (task.data.output.length > 120 ? '...' : '')
                        : null,
                    time: task.updatedAt || task.createdAt,
                    clickable: task.status === 'done' && task.data?.output,
                    onClick: () =>
                      setTaskOutputDialog({ title: task.title, output: task.data?.output }),
                  });
                }

                // Final status
                if (r.status === 'completed') {
                  entries.push({
                    key: 'complete',
                    color: 'success.main',
                    label: 'Request completed',
                    time: r.updatedAt,
                  });
                } else if (r.status === 'failed') {
                  entries.push({
                    key: 'failed',
                    color: 'error.main',
                    label: `Pipeline failed${r.processingNotes ? ': ' + r.processingNotes : ''}`,
                    time: r.updatedAt,
                  });
                } else if (r.status === 'processing') {
                  entries.push({
                    key: 'processing',
                    color: 'warning.main',
                    label: 'Processing...',
                    time: r.updatedAt,
                  });
                }

                if (entries.length <= 1 && !detailJob) {
                  entries.push({
                    key: 'no-activity',
                    color: 'text.disabled',
                    label: 'No pipeline activity yet - click "Run Pipeline" to start',
                    time: null,
                  });
                }

                return entries.map((e) => (
                  <Box
                    key={e.key}
                    sx={{
                      position: 'relative',
                      mb: 1.5,
                      cursor: e.clickable ? 'pointer' : 'default',
                      '&:hover': e.clickable
                        ? {
                            bgcolor: alpha(theme.palette.primary.main, 0.04),
                            borderRadius: 1.5,
                            mx: -1,
                            px: 1,
                          }
                        : {},
                    }}
                    onClick={e.clickable ? e.onClick : undefined}
                  >
                    {/* Dot */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: -23,
                        top: 5,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: e.color,
                        border: '2px solid',
                        borderColor: 'background.paper',
                        zIndex: 1,
                      }}
                    />
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {e.label}
                      </Typography>
                      {e.time && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.disabled',
                            fontSize: '0.65rem',
                            whiteSpace: 'nowrap',
                            ml: 1,
                          }}
                        >
                          {formatRelative(e.time)}
                        </Typography>
                      )}
                    </Box>
                    {e.sub && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.7rem',
                          display: 'block',
                          mt: 0.25,
                        }}
                      >
                        {e.sub}
                      </Typography>
                    )}
                  </Box>
                ));
              })()}
            </Box>
          )}
        </FormDialog>
      )}
      {/* ── Task Output Dialog ────────────────────────────── */}
      {taskOutputDialog && (
        <FormDialog
          open
          onClose={() => setTaskOutputDialog(null)}
          title={taskOutputDialog.title}
          icon={AssignmentOutlinedIcon}
          maxWidth="md"
          primaryLabel="Close"
          onPrimary={() => setTaskOutputDialog(null)}
          hideCancel
        >
          <Typography
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              lineHeight: 1.7,
              fontSize: '0.9rem',
            }}
          >
            {taskOutputDialog.output}
          </Typography>
        </FormDialog>
      )}
      {/* ── Delete Confirmation ──────────────────────────── */}
      <FormDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Request?"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        contentDividers={false}
        actions={
          <>
            <Button onClick={() => setDeleteConfirm(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteConfirm}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Delete
            </Button>
          </>
        }
      >
        <DialogContentText>
          Are you sure you want to delete this request? This action cannot be undone.
        </DialogContentText>
      </FormDialog>
      {/* ── Pipeline Progress Snackbar ────────────────── */}
      <Snackbar
        open={!!pipelineMsg}
        autoHideDuration={5000}
        onClose={() => setPipelineMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setPipelineMsg(null)}
          severity="info"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {pipelineMsg}
        </Alert>
      </Snackbar>
    </>
  );
}
/* eslint-enable no-undef */
