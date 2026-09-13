import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Popover,
  Menu,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  Tooltip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Stack,
  Card,
  CardContent,
  Collapse,
  Checkbox,
  LinearProgress,
  FormControlLabel,
  Switch,
  useTheme,
  useMediaQuery,
  alpha,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SortIcon from '@mui/icons-material/Sort';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import TimelineIcon from '@mui/icons-material/Timeline';
import GitHubIcon from '@mui/icons-material/GitHub';
import CommitIcon from '@mui/icons-material/Commit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import CategoryIcon from '@mui/icons-material/Category';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HistoryIcon from '@mui/icons-material/History';

import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import EmptyState from '../../components/Common/EmptyState';
import TaskManagerArt from '../../components/illustrations/pages/TaskManagerArt';
import PriorityBarsIcon from '../../components/Common/PriorityBarsIcon';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import FormDialog from '../../components/Common/FormDialog';
import PageLayout from '../../components/Common/PageLayout';
import OrgFilterBanner from '../../components/Common/OrgFilterBanner';
import { getOrgTeamMap } from '../../services/orgTeamService';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { usePartners } from '../../hooks/usePartners';
import { useProjects } from '../../hooks/useProjects';
import { useTeamTasks } from '../../hooks/useTeamTasks';
import { getAgents } from '../../services/agentHubService';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import EntityInfoBadge from '../../components/Common/EntityInfoBadge';
import { partnerService } from '../../services/partnerService';
import EditPopover from '../Partners/components/EditPopover';
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITIES,
  PRIORITY_COLORS,
} from '../../utils/constants';
import { maybeNotify } from '../../services/emailNotificationDispatcher';
import { useThemeMode } from '../../context/ThemeContext';
import { loadAuditLogs } from '../../services/auditLogBackend';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import { useDevTasks } from '../../context/DevTasksContext';
import {
  uploadFile as uploadTaskFile,
  deleteFile as deleteTaskFile,
  deleteAllTaskFiles,
  getFileUrl as getTaskFileUrl,
  formatFileSize,
  validateFile,
} from '../../services/taskFileService';

import AppIcon from '../../components/icons/AppIcon';

// Light theme
const statusConfigLight = {
  todo: { bg: '#FEF2F2', color: '#EF4444', border: '#FECACA', label: 'Not Started' },
  inProgress: { bg: '#FFF7ED', color: '#F59E0B', border: '#FED7AA', label: 'In Progress' },
  done: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', label: 'Completed' },
};

const priorityConfigLight = {
  high: { color: '#EF4444', bg: '#FEE2E2', label: 'High' },
  medium: { color: '#F59E0B', bg: '#FEF3C7', label: 'Medium' },
  low: { color: '#10B981', bg: '#D1FAE5', label: 'Low' },
};

// Dark theme – darker, professional
const statusConfigDark = {
  todo: { bg: null, color: '#F87171', border: 'rgba(248, 113, 113, 0.25)', label: 'Not Started' },
  inProgress: {
    bg: null,
    color: '#FBBF24',
    border: 'rgba(251, 191, 36, 0.25)',
    label: 'In Progress',
  },
  done: { bg: null, color: '#4ADE80', border: 'rgba(74, 222, 128, 0.25)', label: 'Completed' },
};

const priorityConfigDark = {
  high: { color: '#F87171', bg: 'rgba(239, 68, 68, 0.15)', label: 'High' },
  medium: { color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.15)', label: 'Medium' },
  low: { color: '#4ADE80', bg: 'rgba(34, 197, 94, 0.15)', label: 'Low' },
};

const boardColumns = ['todo', 'inProgress', 'done'];

const TASK_TYPE_OPTIONS = [
  { value: 'partner', label: 'Partner' },
  { value: 'team', label: 'Team' },
  { value: 'development', label: 'Development' },
  { value: 'projects', label: 'Projects' },
];

const DEV_TASK_PAGE_LABELS = {
  '/dashboard': 'Dashboard',
  '/partners': 'Partners',
  '/task-manager': 'Tasks',
  '/workflow': 'Workflow',
  '/projects': 'Projects',
  '/settings': 'Settings',
  '/audit-log': 'Audit Log',
  '/notification-center': 'Notifications',
  '/documentation': 'Documentation',
  '/roles': 'Roles & Permissions',
  '/data': 'Data',
  '/github-pushes': 'GitHub Pushes',
  '/reports': 'Reports',
};

const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const sortOptions = [
  { value: 'priority', label: 'Priority' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'title', label: 'Task Name' },
  { value: 'partner', label: 'Partner' },
];

const priorityRank = { high: 0, medium: 1, low: 2 };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const startOfDayTs = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const parseDateSafe = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const estimateToDays = (estimate = '') => {
  const str = String(estimate).trim().toLowerCase();
  const n = Number.parseFloat(str);
  if (Number.isNaN(n) || n <= 0) return 3;
  if (str.includes('w')) return Math.max(1, Math.round(n * 7));
  if (str.includes('d')) return Math.max(1, Math.round(n));
  if (str.includes('h')) return Math.max(1, Math.round(n / 8));
  return Math.max(1, Math.round(n));
};
const formatMonthLabel = (date) => date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
const formatDayShort = (date) => date.toLocaleString('en-US', { day: '2-digit' });
const formatMonthYear = (date = new Date()) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
const parseMonthYear = (value) => {
  const match = String(value || '')
    .trim()
    .match(/^(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { month, year };
};

// Reusable Components
function HoverEditPill({ children, onClick }) {
  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      sx={{
        cursor: 'pointer',
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        borderRadius: 1,
        transition: 'all 0.2s',
        '&:hover': {
          bgcolor: 'action.hover',
          transform: 'translateY(-1px)',
        },
        '&:hover .edit-hint': { opacity: 1, width: 'auto', ml: 0.5 },
      }}
    >
      {children}
      <AppIcon
        name="EditOutlined"
        fallback={EditOutlinedIcon}
        className="edit-hint"
        sx={{
          fontSize: 14,
          color: 'text.secondary',
          opacity: 0,
          width: 0,
          transition: 'all 0.2s',
          overflow: 'hidden',
        }}
      />
    </Box>
  );
}

const getStatusIcon = (status) => {
  if (status === 'done')
    return (
      <AppIcon
        name="CheckCircle"
        fallback={CheckCircleIcon}
        sx={{ fontSize: 16, color: '#16A34A' }}
      />
    );
  if (status === 'inProgress')
    return (
      <AppIcon
        name="AccessTimeFilled"
        fallback={AccessTimeFilledIcon}
        sx={{ fontSize: 16, color: '#F59E0B' }}
      />
    );
  return (
    <AppIcon
      name="HighlightOff"
      fallback={HighlightOffIcon}
      sx={{ fontSize: 16, color: '#EF4444' }}
    />
  );
};

export default function TaskManager({ embedded = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const statusConfig = isDark ? statusConfigDark : statusConfigLight;
  const priorityConfig = isDark ? priorityConfigDark : priorityConfigLight;

  const { partners, loading, error, updatePartnerTasks, refetch } = usePartners();
  const { projects } = useProjects();
  const {
    tasks: rawTeamTasks,
    loading: teamLoading,
    error: teamError,
    addTeamTask,
    patchTeamTask,
    removeTeamTask,
    clearTeamTasks,
  } = useTeamTasks();
  const { pushNotification } = useNotifications();
  const { user } = useAuth();
  const { devMode } = useThemeMode();
  const {
    getAllTasks,
    addTask: addDevTask,
    toggleTask: _toggleDevTask,
    removeTask: removeDevTask,
    updateTask: _updateDevTask,
    patchTask: patchDevTask,
  } = useDevTasks();

  const hubAgents = useMemo(() => getAgents(), []);

  const canCreateTeamTasks = useMemo(() => {
    // Minimal guardrail: if a user is explicitly assigned the built-in Viewer role,
    // treat them as read-only for internal team tasks.
    const uid = user?.uid;
    if (!uid) return false;
    try {
      const raw = window.localStorage.getItem('orch_user_roles_v1');
      const map = raw ? JSON.parse(raw) : {};
      const roleId = map?.[uid] || null;
      if (!roleId) return true;
      return roleId !== 'role-viewer';
    } catch {
      return true;
    }
  }, [user?.uid]);

  // State
  const [taskScope, setTaskScope] = useState(() => {
    try {
      const raw = window.localStorage.getItem('orch_task_manager_scope');
      if (raw === 'all' || raw === 'team' || raw === 'projects' || raw === 'agents') return raw;
      return 'partners';
    } catch {
      return 'partners';
    }
  });
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [jobFilter, setJobFilter] = useState('All');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [categoriesAnchorEl, setCategoriesAnchorEl] = useState(null);
  const [showMetrics, setShowMetrics] = useShowMetrics('task-manager');
  const [sortBy, setSortBy] = useState('priority');
  const [sortDir, setSortDir] = useState('asc');
  const [activeView, setActiveView] = useState('table');

  // ── Org scope (?org=) from the Home "Tasks" tile ──
  const [searchParams, setSearchParams] = useSearchParams();
  const orgId = searchParams.get('org');
  const orgName = searchParams.get('orgName');
  const [orgTeamIds, setOrgTeamIds] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setOrgTeamIds(null);
      return undefined;
    }
    getOrgTeamMap([orgId])
      .then((m) => {
        if (!cancelled) setOrgTeamIds(new Set(m[orgId] || []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId]);
  const clearOrgFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('org');
    next.delete('orgName');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // On mobile, default to Kanban view for better touch UX
  useEffect(() => {
    if (isMobile) setActiveView('kanban');
  }, [isMobile]);

  const [tableDrafts, setTableDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [controlsAnchor, setControlsAnchor] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [roadmapPeriod, setRoadmapPeriod] = useState(formatMonthYear(new Date()));
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [editState, setEditState] = useState({
    anchorEl: null,
    title: '',
    options: [],
    currentValue: '',
    onSave: null,
  });
  const [gitCommitDraft, setGitCommitDraft] = useState({
    sha: '',
    message: '',
    branch: '',
    url: '',
  });
  const [copiedGitSha, setCopiedGitSha] = useState(null);
  const [gitLiveData, setGitLiveData] = useState(null);
  const [gitStripExpanded, setGitStripExpanded] = useState(false);
  const [showRecentGitActivity, setShowRecentGitActivity] = useState(() => {
    try {
      const raw = window.localStorage.getItem('orch_task_manager_show_git_activity');
      return raw === 'true';
    } catch {
      return false;
    }
  });
  const [devNewTaskText, setDevNewTaskText] = useState('');
  const [devNewTaskPage, setDevNewTaskPage] = useState('');
  const [devNewTaskPriority, setDevNewTaskPriority] = useState('medium');
  const [devNewTaskDeadline, setDevNewTaskDeadline] = useState('');
  const [devNewTaskStatus, setDevNewTaskStatus] = useState('todo');

  useEffect(() => {
    try {
      window.localStorage.setItem('orch_task_manager_scope', taskScope);
    } catch {
      // ignore storage access issues
    }
  }, [taskScope]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'orch_task_manager_show_git_activity',
        String(showRecentGitActivity)
      );
    } catch {
      // ignore storage access issues
    }
  }, [showRecentGitActivity]);

  useEffect(() => {
    if (selectedTask) {
      setGitCommitDraft({ sha: '', message: '', branch: '', url: '' });
      setFileUploading(false);
      setFileError('');
    }
  }, [selectedTask?.dragId, selectedTask?.isNew]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/data-topology', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (cancelled || !p) return;
        const gh = (p.entities || []).find((e) => e.id === 'service-github');
        if (gh) setGitLiveData(gh);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived Data
  const partnerTasks = useMemo(
    () =>
      partners.flatMap((partner) =>
        (partner.tasks || [])
          .filter((task) => !task.userId || task.userId === partner.userId)
          .map((task) => ({
            ...task,
            partnerId: task.partnerId || partner.id,
            partnerName: partner.name,
            partnerTeam: partner.team || 'Unknown',
            userId: task.userId || partner.userId,
            taskId: task.taskId || task.id,
            taskManagerBaseId: task.taskManagerBaseId || task.taskId || task.id,
            dragId: `${partner.id}::${task.id}`,
          }))
      ),
    [partners]
  );

  const teamTasks = useMemo(() => {
    return (rawTeamTasks || []).map((t) => ({
      ...t,
      partnerId: '__team__',
      partnerName: t.assignedTo || 'Internal Team',
      partnerTeam: 'Internal',
      userId: '',
      taskId: t.taskId || t.id,
      taskManagerBaseId: t.taskManagerBaseId || t.taskId || t.id,
      dragId: `__team__::${t.id}`,
      _isTeamTask: true,
    }));
  }, [rawTeamTasks]);

  const projectTasks = useMemo(
    () => partnerTasks.filter((task) => task.projectId != null && task.projectId !== ''),
    [partnerTasks]
  );

  const agentTasks = useMemo(
    () => teamTasks.filter((task) => task.category === 'AI Agents'),
    [teamTasks]
  );

  const devVirtualTasks = useMemo(() => {
    if (!devMode) return [];
    return getAllTasks().map((dt) => ({
      id: dt.id,
      taskId: dt.id,
      title: dt.text,
      description: dt.description || '',
      priority: dt.priority || 'medium',
      status: dt.status || (dt.done ? 'done' : 'todo'),
      assignedTo: dt.assignedTo || '',
      deadline: dt.deadline || '',
      estimate: dt.estimate || '',
      createdAt: dt.createdAt,
      partnerId: '__dev__',
      partnerName: 'Developer',
      partnerTeam: 'Developer',
      userId: '',
      dragId: `__dev__::${dt.id}`,
      gitCommits: [],
      attachments: dt.attachments || [],
      _isDevTask: true,
      _devPage: dt.page,
    }));
  }, [devMode, getAllTasks]);

  const baseTasks = useMemo(() => {
    if (taskScope === 'all') return [...partnerTasks, ...teamTasks];
    if (taskScope === 'team') return teamTasks;
    if (taskScope === 'projects') return projectTasks;
    if (taskScope === 'agents') return agentTasks;
    return partnerTasks;
  }, [taskScope, teamTasks, partnerTasks, projectTasks, agentTasks]);

  const allTasks = useMemo(() => [...baseTasks, ...devVirtualTasks], [baseTasks, devVirtualTasks]);

  const counts = useMemo(() => {
    // Headline counters reflect real tasks only - exclude dev-mode virtual tasks
    // injected when devMode is on, which would otherwise inflate the total.
    const realTasks = allTasks.filter((t) => !t._isDevTask);
    const byStatus = {
      todo: realTasks.filter((t) => t.status === 'todo').length,
      inProgress: realTasks.filter((t) => t.status === 'inProgress').length,
      done: realTasks.filter((t) => t.status === 'done').length,
    };
    return { total: realTasks.length, ...byStatus };
  }, [allTasks]);

  const taskOverview = [
    {
      label: 'Total',
      value: counts.total,
      color: 'text.primary',
      bg: alpha(theme.palette.primary.main, 0.1),
    },
    {
      label: 'To Do',
      value: counts.todo,
      color: statusConfig.todo.color,
      bg: alpha(statusConfig.todo.color, 0.14),
    },
    {
      label: 'In Progress',
      value: counts.inProgress,
      color: statusConfig.inProgress.color,
      bg: alpha(statusConfig.inProgress.color, 0.14),
    },
    {
      label: 'Done',
      value: counts.done,
      color: statusConfig.done.color,
      bg: alpha(statusConfig.done.color, 0.14),
    },
  ];

  const getDevPageLabel = (path) => DEV_TASK_PAGE_LABELS[path] || path;
  const allDevTasks = useMemo(() => (devMode ? getAllTasks() : []), [devMode, getAllTasks]);
  const devTaskPages = useMemo(
    () => [...new Set(allDevTasks.map((t) => t.page))].sort(),
    [allDevTasks]
  );
  const devTotalCount = allDevTasks.length;
  const devStatusCounts = useMemo(
    () => ({
      todo: allDevTasks.filter((t) => (t.status || 'todo') === 'todo').length,
      inProgress: allDevTasks.filter((t) => t.status === 'inProgress').length,
      done: allDevTasks.filter((t) => t.done || t.status === 'done').length,
    }),
    [allDevTasks]
  );

  useEffect(() => {
    if (!allTasks.length) return;
    const today = new Date().toISOString().split('T')[0];
    const notifiedKey = `orch_overdue_notified_${today}`;
    const already = new Set(JSON.parse(window.localStorage.getItem(notifiedKey) || '[]'));
    const newlyOverdue = allTasks.filter(
      (t) =>
        t.deadline &&
        t.deadline < today &&
        t.status !== 'done' &&
        !t._isDevTask &&
        !already.has(t.id)
    );
    if (newlyOverdue.length === 0) return;
    newlyOverdue.forEach((t) => {
      maybeNotify('task_overdue', {
        title: t.title || '',
        partner: t.partnerName || '',
        deadline: t.deadline,
      });
      already.add(t.id);
    });
    window.localStorage.setItem(notifiedKey, JSON.stringify([...already]));
  }, [allTasks]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = allTasks.filter((task) => {
      if (!q) return true;
      return (
        (task.title || '').toLowerCase().includes(q) ||
        (task.description || '').toLowerCase().includes(q) ||
        (task.partnerName || '').toLowerCase().includes(q) ||
        (task.userId || '').toLowerCase().includes(q) ||
        (task.assignedTo || '').toLowerCase().includes(q)
      );
    });

    if (taskScope !== 'team') {
      if (partnerFilter !== 'All') {
        result = result.filter((task) => task.partnerId === partnerFilter);
      }
      if (teamFilter !== 'All') {
        result = result.filter((task) => task.partnerTeam === teamFilter);
      }
    }

    if (statusFilter !== 'All') {
      result = result.filter((task) => task.status === statusFilter);
    }
    if (priorityFilter !== 'All') {
      result = result.filter((task) => (task.priority || 'medium') === priorityFilter);
    }
    if (assigneeFilter !== 'All') {
      const assigneeValue = assigneeFilter === 'Unassigned' ? '' : assigneeFilter;
      result = result.filter((task) => {
        const taskAssignee =
          taskScope === 'team' ? task.assignedTo || '' : task.assignedTo || task.partnerName || '';
        return (taskAssignee || 'Unassigned') === (assigneeValue || 'Unassigned');
      });
    }
    if (categoryFilter !== 'All') {
      result = result.filter((task) => (task.category || '') === categoryFilter);
    }
    if (jobFilter !== 'All') {
      result = result.filter((task) => (task.jobPoolId || '') === jobFilter);
    }
    if (orgTeamIds) {
      result = result.filter((task) => orgTeamIds.has(task.jobPoolId));
    }

    const sorted = [...result].sort((a, b) => {
      let av = '';
      let bv = '';
      switch (sortBy) {
        case 'partner':
          av = taskScope === 'team' ? a.assignedTo || '' : a.partnerName || '';
          bv = taskScope === 'team' ? b.assignedTo || '' : b.partnerName || '';
          break;
        case 'priority':
          av = priorityRank[a.priority || 'low'];
          bv = priorityRank[b.priority || 'low'];
          break;
        case 'deadline':
          av = a.deadline || '9999-12-31';
          bv = b.deadline || '9999-12-31';
          break;
        default:
          av = a.title || '';
          bv = b.title || '';
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [
    allTasks,
    orgTeamIds,
    search,
    partnerFilter,
    teamFilter,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    categoryFilter,
    jobFilter,
    sortBy,
    sortDir,
    taskScope,
  ]);

  const scopedSortOptions = useMemo(
    () =>
      sortOptions.map((opt) =>
        opt.value === 'partner'
          ? {
              ...opt,
              label:
                taskScope === 'team'
                  ? 'Assignee'
                  : taskScope === 'all'
                    ? 'Partner / Assignee'
                    : 'Partner',
            }
          : opt
      ),
    [taskScope]
  );

  const teamOptions = useMemo(
    () =>
      Array.from(new Set(partners.map((partner) => partner.team).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [partners]
  );

  const assigneeOptions = useMemo(() => {
    const seen = new Set();
    return allTasks
      .map((t) =>
        taskScope === 'team'
          ? t.assignedTo || 'Unassigned'
          : t.assignedTo || t.partnerName || 'Unassigned'
      )
      .filter(Boolean)
      .filter((name) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [allTasks, taskScope]);

  const categoryOptions = useMemo(() => {
    const cats = new Set();
    allTasks.forEach((t) => {
      if (t.category) cats.add(t.category);
    });
    return [...cats].sort((a, b) => a.localeCompare(b));
  }, [allTasks]);

  const jobOptions = useMemo(() => {
    const jobs = new Map();
    allTasks.forEach((t) => {
      if (t.jobPoolId && !jobs.has(t.jobPoolId)) {
        jobs.set(
          t.jobPoolId,
          t.jobPoolId.length > 24 ? `${t.jobPoolId.slice(0, 24)}...` : t.jobPoolId
        );
      }
    });
    return [...jobs.entries()]; // [[id, label], ...]
  }, [allTasks]);

  // Actions
  const updateSingleTask = async (taskRow, patch) => {
    if (taskRow._isDevTask) {
      const devPatch = {};
      if (patch.title !== undefined) devPatch.text = patch.title;
      if (patch.status !== undefined) devPatch.status = patch.status;
      if (patch.priority !== undefined) devPatch.priority = patch.priority;
      if (patch.deadline !== undefined) devPatch.deadline = patch.deadline;
      if (patch.assignedTo !== undefined) devPatch.assignedTo = patch.assignedTo;
      if (patch.estimate !== undefined) devPatch.estimate = patch.estimate;
      if (patch.description !== undefined) devPatch.description = patch.description;
      if (patch.attachments !== undefined) devPatch.attachments = patch.attachments;
      if (Object.keys(devPatch).length > 0) {
        patchDevTask(taskRow._devPage, taskRow.id, devPatch);
      }
      pushNotification('Tasks', 'Dev task updated');
      return;
    }

    if (taskRow._isTeamTask) {
      const nextPatch = { ...patch, updatedAt: new Date().toISOString() };
      await patchTeamTask(taskRow.id, nextPatch);
      const [firstKey] = Object.keys(patch);
      if (firstKey) pushNotification('Tasks', `${firstKey}: changed to ${patch[firstKey]}`);
      return;
    }

    const partner = partners.find((p) => p.id === taskRow.partnerId);
    if (!partner) return;

    const fullPatch = { ...patch, updatedAt: new Date().toISOString() };
    const nextTasks = (partner.tasks || []).map((task) =>
      task.id === taskRow.id ? { ...task, ...fullPatch } : task
    );

    await updatePartnerTasks(partner.id, nextTasks);
    const [firstKey] = Object.keys(patch);
    pushNotification('Tasks', `${firstKey}: changed to ${patch[firstKey]}`);
    if (patch.status === 'done') {
      maybeNotify('task_completed', {
        title: taskRow.title || '',
        partner: partner.name || '',
      });
    }
    if (
      patch.assignedTo !== undefined &&
      patch.assignedTo &&
      patch.assignedTo !== taskRow.assignedTo
    ) {
      maybeNotify('task_assigned', {
        title: taskRow.title || '',
        partner: partner.name || '',
        assignedTo: patch.assignedTo,
      });
    }
  };

  const getDraftValue = (task, field) => {
    const draft = tableDrafts[task.dragId];
    if (draft && Object.prototype.hasOwnProperty.call(draft, field)) {
      return draft[field];
    }
    return task[field] ?? '';
  };

  const updateDraft = (task, field, value) => {
    setTableDrafts((prev) => ({
      ...prev,
      [task.dragId]: {
        ...(prev[task.dragId] || {}),
        [field]: value,
      },
    }));
  };

  const getTaskPatch = (task) => {
    const draft = tableDrafts[task.dragId];
    if (!draft) return {};
    const patch = {};
    Object.entries(draft).forEach(([key, val]) => {
      const current = task[key] ?? '';
      if (String(current) !== String(val)) patch[key] = val;
    });
    return patch;
  };

  const hasTaskChanges = (task) => Object.keys(getTaskPatch(task)).length > 0;

  const applyTaskChanges = async (task) => {
    const patch = getTaskPatch(task);
    if (Object.keys(patch).length === 0) return;
    await updateSingleTask(task, patch);
    setTableDrafts((prev) => {
      const next = { ...prev };
      delete next[task.dragId];
      return next;
    });
  };

  const applyAllTableChanges = async () => {
    setSaving(true);
    try {
      for (const task of filteredTasks) {
        if (hasTaskChanges(task)) {
          // eslint-disable-next-line no-await-in-loop
          await applyTaskChanges(task);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const sourceStatus = result.source.droppableId;
    const destStatus = result.destination.droppableId;
    if (sourceStatus === destStatus) return;

    const [partnerId, taskId] = String(result.draggableId).split('::');
    const task = filteredTasks.find((t) => t.partnerId === partnerId && t.id === taskId);
    if (!task) return;

    await updateSingleTask(task, { status: destStatus });
  };

  const handleTaskFieldChange = (field, value) => {
    setSelectedTask((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleAddGitCommit = () => {
    if (!gitCommitDraft.sha.trim() && !gitCommitDraft.message.trim()) return;
    const entry = {
      id: `gc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sha: gitCommitDraft.sha.trim(),
      message: gitCommitDraft.message.trim(),
      branch: gitCommitDraft.branch.trim() || 'main',
      url: gitCommitDraft.url.trim(),
      addedAt: new Date().toISOString(),
    };
    setSelectedTask((prev) => {
      if (!prev) return prev;
      return { ...prev, gitCommits: [...(prev.gitCommits || []), entry] };
    });
    setGitCommitDraft({ sha: '', message: '', branch: '', url: '' });
  };

  const handleRemoveGitCommit = (commitId) => {
    setSelectedTask((prev) => {
      if (!prev) return prev;
      return { ...prev, gitCommits: (prev.gitCommits || []).filter((c) => c.id !== commitId) };
    });
  };

  const handleCopyGitSha = (sha) => {
    navigator.clipboard.writeText(sha).catch(() => {});
    setCopiedGitSha(sha);
    setTimeout(() => setCopiedGitSha(null), 1500);
  };

  const [fileUploading, setFileUploading] = useState(false);
  const [fileError, setFileError] = useState('');

  /* ---- Page Activity Log Dialog ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Task');
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

  const getNewTaskDraft = () => {
    let taskType = 'partner';
    if (taskScope === 'team' || taskScope === 'agents') taskType = 'team';
    else if (taskScope === 'projects') taskType = 'projects';
    if (taskType === 'team') {
      return {
        isNew: true,
        dragId: 'new',
        taskType: 'team',
        _isTeamTask: true,
        partnerId: '__team__',
        partnerName: 'Internal Team',
        partnerTeam: 'Internal',
        title: '',
        priority: 'medium',
        status: 'todo',
        assignedTo: '',
        deadline: '',
        estimate: '',
        description: '',
        gitCommits: [],
        attachments: [],
      };
    }
    if (taskType === 'projects') {
      const proj = projects[0];
      return {
        isNew: true,
        dragId: 'new',
        taskType: 'projects',
        _projectId: proj?.id || '',
        partnerId: proj?.partnerId || '',
        partnerName: proj?.partnerName || proj?.partner?.name || '',
        title: '',
        priority: 'medium',
        status: 'todo',
        assignedTo: '',
        deadline: '',
        estimate: '',
        description: '',
        attachments: [],
      };
    }
    return {
      isNew: true,
      dragId: 'new',
      taskType: 'partner',
      partnerId: partners[0]?.id || '',
      partnerName: partners[0]?.name || '',
      title: '',
      priority: 'medium',
      status: 'todo',
      assignedTo: '',
      deadline: '',
      estimate: '',
      description: '',
      attachments: [],
    };
  };

  const handleOpenCreateTask = () => {
    if (taskScope === 'team' && !canCreateTeamTasks) {
      pushNotification(
        'Tasks',
        'You do not have permission to create internal team tasks.',
        'error'
      );
      return;
    }
    setSelectedTask(getNewTaskDraft());
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !selectedTask) return;
    setFileError('');
    setFileUploading(true);
    const taskId = selectedTask.taskId || selectedTask.id || `draft-${Date.now()}`;
    try {
      const newAttachments = [...(selectedTask.attachments || [])];
      for (const file of files) {
        const check = validateFile(file);
        if (!check.ok) {
          setFileError(check.error);
          continue;
        }
        const meta = await uploadTaskFile(taskId, file);
        newAttachments.push(meta);
      }
      setSelectedTask((prev) => (prev ? { ...prev, attachments: newAttachments } : prev));
    } catch (err) {
      setFileError(err?.message || 'Upload failed');
    } finally {
      setFileUploading(false);
      event.target.value = '';
    }
  };

  const handleFileDownload = async (attachment) => {
    try {
      const url = await getTaskFileUrl(attachment);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.name;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      pushNotification('Tasks', err?.message || 'Download failed', 'error');
    }
  };

  const handleFileRemove = async (attachment) => {
    try {
      await deleteTaskFile(attachment);
      setSelectedTask((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          attachments: (prev.attachments || []).filter((a) => a.id !== attachment.id),
        };
      });
    } catch (err) {
      pushNotification('Tasks', err?.message || 'Failed to remove file', 'error');
    }
  };

  const handleSaveTaskDialog = async () => {
    if (!selectedTask || dialogSaving) return;
    setDialogSaving(true);
    try {
      if (selectedTask.isNew) {
        if (selectedTask._isDevTask && selectedTask.taskType === 'development') {
          const page = selectedTask._devPage || Object.keys(DEV_TASK_PAGE_LABELS)[0];
          if (!page) return;
          addDevTask(page, selectedTask.title || 'New dev task', {
            priority: selectedTask.priority || 'medium',
            status: selectedTask.status || 'todo',
            deadline: selectedTask.deadline || '',
            assignedTo: selectedTask.assignedTo || '',
            estimate: selectedTask.estimate || '',
            description: selectedTask.description || '',
          });
          pushNotification('Tasks', 'Development task created', { severity: 'success' });
          setSelectedTask(null);
          return;
        }
        if (selectedTask._isTeamTask) {
          if (!canCreateTeamTasks) {
            pushNotification('Tasks', 'You do not have permission to create internal team tasks.', {
              severity: 'error',
            });
            return;
          }
          const tmBaseId = `TTMB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const id = `TT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();
          const newTask = {
            id,
            taskId: id,
            taskManagerBaseId: tmBaseId,
            title: selectedTask.title || 'New Team Task',
            priority: selectedTask.priority || 'medium',
            status: selectedTask.status || 'todo',
            assignedTo: selectedTask.assignedTo || '',
            deadline: selectedTask.deadline || '',
            estimate: selectedTask.estimate || '',
            description: selectedTask.description || '',
            gitCommits: selectedTask.gitCommits || [],
            attachments: selectedTask.attachments || [],
            agentId: selectedTask.agentId || null,
            createdAt: now,
            createdBy: user?.uid ?? null,
          };
          await addTeamTask(newTask);
          pushNotification('Tasks', `Team task "${newTask.title}" created`, {
            severity: 'success',
          });
          maybeNotify('task_created', {
            title: newTask.title,
            partner: 'Internal Team',
            priority: newTask.priority,
            deadline: newTask.deadline,
          });
          setSelectedTask(null);
          return;
        }

        const partnerId = selectedTask.partnerId;
        if (!partnerId) return;
        const partner = partners.find((p) => p.id === partnerId);
        if (!partner) {
          setSelectedTask(null);
          return;
        }
        const tmBaseId = `TMB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const taskId = `T-${partnerId}-${Date.now()}`;
        const now = new Date().toISOString();
        const newTask = {
          id: taskId,
          taskId,
          taskManagerBaseId: tmBaseId,
          partnerId,
          ...(selectedTask._projectId ? { projectId: selectedTask._projectId } : {}),
          title: selectedTask.title || 'New Task',
          priority: selectedTask.priority || 'medium',
          status: selectedTask.status || 'todo',
          assignedTo: selectedTask.assignedTo || '',
          deadline: selectedTask.deadline || '',
          estimate: selectedTask.estimate || '',
          description: selectedTask.description || '',
          gitCommits: selectedTask.gitCommits || [],
          attachments: selectedTask.attachments || [],
          agentId: selectedTask.agentId || null,
          createdAt: now,
          createdBy: user?.uid ?? null,
        };
        const currentTasks = partner.tasks || [];
        await updatePartnerTasks(partnerId, [...currentTasks, newTask]);
        pushNotification('Tasks', `Task "${newTask.title}" created for ${partner.name}`, {
          severity: 'success',
        });
        maybeNotify('task_created', {
          title: newTask.title,
          partner: partner.name,
          priority: newTask.priority,
          deadline: newTask.deadline,
        });
        setSelectedTask(null);
        return;
      }
      if (selectedTask._isDevTask) {
        const devPatch = {
          text: selectedTask.title || '',
          status: selectedTask.status || 'todo',
          priority: selectedTask.priority || 'medium',
          deadline: selectedTask.deadline || '',
          assignedTo: selectedTask.assignedTo || '',
          estimate: selectedTask.estimate || '',
          description: selectedTask.description || '',
          attachments: selectedTask.attachments || [],
        };
        patchDevTask(selectedTask._devPage, selectedTask.id, devPatch);
        pushNotification('Tasks', 'Dev task updated', { severity: 'success' });
        setSelectedTask(null);
        return;
      }

      const target = filteredTasks.find((task) => task.dragId === selectedTask.dragId);
      if (!target) {
        setSelectedTask(null);
        return;
      }
      const patch = {
        title: selectedTask.title || '',
        assignedTo: selectedTask.assignedTo || '',
        priority: selectedTask.priority || 'medium',
        deadline: selectedTask.deadline || '',
        estimate: selectedTask.estimate || '',
        description: selectedTask.description || '',
        status: selectedTask.status || 'todo',
        gitCommits: selectedTask.gitCommits || [],
        attachments: selectedTask.attachments || [],
        agentId: selectedTask.agentId || null,
      };
      await updateSingleTask(target, patch);
      pushNotification('Tasks', 'Task updated', { severity: 'success' });
      setSelectedTask(null);
    } catch (e) {
      pushNotification('Tasks', e?.message || 'Failed to save task', { severity: 'error' });
    } finally {
      setDialogSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask || selectedTask.isNew) return;

    // Clean up uploaded files
    const taskAttachments = selectedTask.attachments || [];
    if (taskAttachments.length > 0) {
      const taskId = selectedTask.taskId || selectedTask.id;
      deleteAllTaskFiles(taskId, taskAttachments).catch(() => {});
    }

    if (selectedTask._isDevTask) {
      removeDevTask(selectedTask._devPage, selectedTask.id);
      pushNotification('Tasks', 'Dev task deleted');
      setSelectedTask(null);
      return;
    }

    if (selectedTask._isTeamTask) {
      const taskIdToRemove = selectedTask.id || selectedTask.taskId;
      await removeTeamTask(taskIdToRemove);
      pushNotification('Tasks', 'Team task deleted');
      maybeNotify('task_deleted', {
        title: selectedTask.title || '',
        partner: 'Internal Team',
      });
      setSelectedTask(null);
      return;
    }

    const partnerId = selectedTask.partnerId;
    const partner = partners.find((p) => p.id === partnerId);
    if (!partner) {
      setSelectedTask(null);
      return;
    }
    const taskIdToRemove = selectedTask.id || selectedTask.taskId;
    const currentTasks = partner.tasks || [];
    const idx = currentTasks.findIndex(
      (t) => t.id === taskIdToRemove || t.taskId === taskIdToRemove
    );
    if (idx === -1) {
      setSelectedTask(null);
      return;
    }
    const nextTasks = currentTasks.slice(0, idx).concat(currentTasks.slice(idx + 1));
    await updatePartnerTasks(partnerId, nextTasks);
    pushNotification('Tasks', 'Task deleted');
    maybeNotify('task_deleted', {
      title: selectedTask.title || '',
      partner: partner.name || '',
    });
    setSelectedTask(null);
  };

  const handleClearAllTasks = async () => {
    setClearingAll(true);
    try {
      if (taskScope === 'team') {
        await clearTeamTasks();
        setClearAllConfirmOpen(false);
        pushNotification('Tasks', 'Cleared all internal team tasks.');
      } else if (taskScope === 'all') {
        await clearTeamTasks();
        const count = await partnerService.clearAllTasks();
        await refetch();
        setClearAllConfirmOpen(false);
        pushNotification('Tasks', `Cleared all tasks (team + ${count} partner(s)).`);
      } else if (taskScope === 'projects') {
        let removed = 0;
        for (const partner of partners) {
          const tasks = partner.tasks || [];
          const withoutProjectTasks = tasks.filter((t) => !t.projectId);
          if (withoutProjectTasks.length !== tasks.length) {
            await updatePartnerTasks(partner.id, withoutProjectTasks);
            removed += tasks.length - withoutProjectTasks.length;
          }
        }
        await refetch();
        setClearAllConfirmOpen(false);
        pushNotification(
          'Tasks',
          removed ? `Cleared ${removed} project task(s).` : 'No project tasks to clear.'
        );
      } else {
        const count = await partnerService.clearAllTasks();
        await refetch();
        setClearAllConfirmOpen(false);
        pushNotification('Tasks', `Cleared all tasks across ${count} partner(s).`);
      }
    } catch (err) {
      pushNotification('Tasks', err?.message || 'Failed to clear tasks', 'error');
    } finally {
      setClearingAll(false);
    }
  };

  // Popover Helpers
  const openSelectPopover = (event, config) => {
    event.stopPropagation();
    setEditState({
      anchorEl: event.currentTarget,
      title: config.title,
      options: config.options,
      currentValue: config.currentValue,
      onSave: config.onSave,
    });
  };

  const closeSelectPopover = () => {
    setEditState((prev) => ({ ...prev, anchorEl: null }));
  };

  // Roadmap Logic
  const roadmapModel = useMemo(() => {
    const selectedPeriod = parseMonthYear(roadmapPeriod);
    const items = filteredTasks
      .map((task) => {
        const endDate = parseDateSafe(task.deadline);
        if (!endDate) return null;
        const durationDays = estimateToDays(task.estimate);
        const endTs = startOfDayTs(endDate);
        const startTs = endTs - (durationDays - 1) * MS_PER_DAY;
        return {
          ...task,
          startTs,
          endTs,
          durationDays,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.startTs < b.startTs ? -1 : 1));

    if (items.length === 0) return null;

    const todayDate = new Date();
    const todayTs = startOfDayTs(todayDate);
    let minTs;
    let maxTs;
    if (selectedPeriod) {
      const periodStart = new Date(selectedPeriod.year, selectedPeriod.month - 1, 1);
      const periodEnd = new Date(selectedPeriod.year, selectedPeriod.month, 0);
      minTs = startOfDayTs(periodStart);
      maxTs = startOfDayTs(periodEnd);
    } else {
      const minTsRaw = Math.min(...items.map((i) => i.startTs), todayTs);
      const maxTsRaw = Math.max(...items.map((i) => i.endTs), todayTs);
      minTs = minTsRaw - 7 * MS_PER_DAY;
      maxTs = maxTsRaw + 14 * MS_PER_DAY;
    }

    const visibleItems = items.filter((item) => item.endTs >= minTs && item.startTs <= maxTs);
    if (visibleItems.length === 0) {
      return {
        items: [],
        minTs,
        maxTs,
        totalDays: Math.max(1, Math.round((maxTs - minTs) / MS_PER_DAY) + 1),
        months: [],
        dayTicks: [],
        todayTs,
      };
    }

    const totalDays = Math.max(1, Math.round((maxTs - minTs) / MS_PER_DAY) + 1);
    const startDate = new Date(minTs);
    const endDate = new Date(maxTs);
    const months = [];
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cursor.getTime() <= endDate.getTime()) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const fromTs = Math.max(startOfDayTs(monthStart), minTs);
      const toTs = Math.min(startOfDayTs(monthEnd), maxTs);
      const spanDays = Math.max(1, Math.round((toTs - fromTs) / MS_PER_DAY) + 1);
      months.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth() + 1}`,
        label: formatMonthLabel(cursor),
        spanDays,
        fromTs,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    const dayTicks = [];
    for (let d = 0; d < totalDays; d += 1) {
      const ts = minTs + d * MS_PER_DAY;
      dayTicks.push({
        ts,
        day: formatDayShort(new Date(ts)),
      });
    }

    return {
      items: visibleItems,
      minTs,
      maxTs,
      totalDays,
      months,
      dayTicks,
      todayTs,
    };
  }, [filteredTasks, roadmapPeriod]);

  const roadmapYears = useMemo(() => {
    const years = new Set();
    filteredTasks.forEach((task) => {
      const dt = parseDateSafe(task.deadline);
      if (dt) years.add(dt.getFullYear());
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => a - b);
  }, [filteredTasks]);
  const parsedRoadmapPeriod =
    parseMonthYear(roadmapPeriod) || parseMonthYear(formatMonthYear(new Date()));

  const statusOptions = useMemo(
    () =>
      TASK_STATUSES.map((status) => ({
        value: status,
        label: TASK_STATUS_LABELS[status],
        bg: statusConfig[status]?.color,
        color: statusConfig[status]?.color,
      })),
    [statusConfig]
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITIES.map((priority) => ({
        value: priority,
        label: priority.toUpperCase(),
        bg: priorityConfig[priority]?.bg ?? PRIORITY_COLORS[priority],
        color: priorityConfig[priority]?.color ?? PRIORITY_COLORS[priority],
      })),
    [priorityConfig]
  );

  const scopeLoading =
    taskScope === 'all'
      ? loading || teamLoading
      : taskScope === 'team' || taskScope === 'agents'
        ? teamLoading
        : loading;
  const scopeError =
    taskScope === 'all'
      ? error || teamError
      : taskScope === 'team' || taskScope === 'agents'
        ? teamError
        : error;
  const scopeLabels = {
    all: 'All',
    team: 'Team',
    projects: 'Projects',
    agents: 'AI Agents',
    partners: 'Partner',
  };
  const scopeLabel = scopeLabels[taskScope] || 'Partner';
  if (scopeLoading) return <LoadingSpinner message="Loading tasks..." />;
  if (scopeError) return <Alert severity="error">Failed to load tasks: {scopeError}</Alert>;

  const toolbarAndContent = (
    <>
      <OrgFilterBanner name={orgName} onClear={clearOrgFilter} />
      {/* Toolbar */}
      <Box
        sx={{
          p: { xs: 1, sm: 1.5 },
          mb: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 0.75, sm: 1 },
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* Toolbar (same layout as Projects): filter, view toggle, categories icon, Create */}
        <Box
          sx={{
            p: 1.5,
            mb: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
            width: '100%',
          }}
        >
          <Tooltip
            title="Filters: search, team, partner, status, priority, assignee"
            placement="bottom"
            arrow
          >
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
              aria-label="Filters"
            >
              <AppIcon
                name="Tune"
                fallback={TuneIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>
          <ToggleButtonGroup
            value={activeView}
            exclusive
            onChange={(_, v) => v != null && setActiveView(v)}
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
            <ToggleButton value="kanban" aria-label="Kanban view">
              <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
            <ToggleButton value="table" aria-label="Table view">
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
            <ToggleButton value="roadmap" aria-label="Roadmap view">
              <AppIcon name="Timeline" fallback={TimelineIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
            {devMode && (
              <ToggleButton
                value="devTasks"
                aria-label="Development tasks"
                sx={{ '&.Mui-selected': { color: '#F59E0B' } }}
              >
                <AppIcon
                  name="CodeOutlined"
                  fallback={CodeOutlinedIcon}
                  sx={{ fontSize: 20, color: 'inherit' }}
                />
              </ToggleButton>
            )}
          </ToggleButtonGroup>
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
                  maxHeight: 'calc(100vh - 120px)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                },
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2.5,
                py: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
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
                <AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 22 }} />
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  Filters
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Search, team, partner, status, priority, assignee
                </Typography>
              </Box>
            </Box>
            <Box sx={{ overflow: 'auto', flex: 1, p: 2.5 }}>
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
                Display
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showRecentGitActivity}
                    onChange={(e) => setShowRecentGitActivity(e.target.checked)}
                    color="primary"
                  />
                }
                label="Show recent Git activity"
                sx={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', mb: 2 }}
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
                Search
              </Typography>
              <TextField
                size="small"
                placeholder="Search tasks..."
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
              {taskScope !== 'team' && (
                <>
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
                    Team
                  </Typography>
                  <FormControl size="small" fullWidth sx={{ mb: 2, borderRadius: 2 }}>
                    <InputLabel>Team</InputLabel>
                    <Select
                      value={teamFilter}
                      label="Team"
                      onChange={(e) => setTeamFilter(e.target.value)}
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
                        All Teams
                      </MenuItem>
                      {teamOptions.map((team) => (
                        <MenuItem key={team} value={team}>
                          {team}
                        </MenuItem>
                      ))}
                      {devMode && (
                        <MenuItem
                          value="Developer"
                          sx={{
                            fontWeight: 600,
                            color: '#F59E0B',
                            borderTop: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <AppIcon
                              name="CodeOutlined"
                              fallback={CodeOutlinedIcon}
                              sx={{ fontSize: 16, color: '#F59E0B' }}
                            />
                            Developer
                          </Box>
                        </MenuItem>
                      )}
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
                    Partner
                  </Typography>
                  <FormControl size="small" fullWidth sx={{ mb: 2, borderRadius: 2 }}>
                    <InputLabel>Partner</InputLabel>
                    <Select
                      value={partnerFilter}
                      label="Partner"
                      onChange={(e) => setPartnerFilter(e.target.value)}
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
                        All Partners
                      </MenuItem>
                      {partners.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.name}
                        </MenuItem>
                      ))}
                      {devMode && (
                        <MenuItem
                          value="__dev__"
                          sx={{
                            fontWeight: 600,
                            color: '#F59E0B',
                            borderTop: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <AppIcon
                              name="CodeOutlined"
                              fallback={CodeOutlinedIcon}
                              sx={{ fontSize: 16, color: '#F59E0B' }}
                            />
                            Developer
                          </Box>
                        </MenuItem>
                      )}
                    </Select>
                  </FormControl>
                </>
              )}
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
              <FormControl size="small" fullWidth sx={{ mb: 2, borderRadius: 2 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
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
                  {TASK_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {TASK_STATUS_LABELS[s] || s}
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
              <FormControl size="small" fullWidth sx={{ mb: 2, borderRadius: 2 }}>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={priorityFilter}
                  label="Priority"
                  onChange={(e) => setPriorityFilter(e.target.value)}
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
                  {TASK_PRIORITIES.map((p) => (
                    <MenuItem key={p} value={p}>
                      {priorityConfig[p]?.label || p}
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
                Assignee
              </Typography>
              <FormControl size="small" fullWidth sx={{ borderRadius: 2 }}>
                <InputLabel>Assignee</InputLabel>
                <Select
                  value={assigneeFilter}
                  label="Assignee"
                  onChange={(e) => setAssigneeFilter(e.target.value)}
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
                    All Assignees
                  </MenuItem>
                  {assigneeOptions.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            {/* Category filter */}
            {categoryOptions.length > 0 && (
              <Box sx={{ px: 2.5, py: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'text.secondary',
                    mb: 1,
                  }}
                >
                  Category
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mt: 0.5 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={categoryFilter}
                    label="Category"
                    onChange={(e) => setCategoryFilter(e.target.value)}
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
                      All Categories
                    </MenuItem>
                    {categoryOptions.map((cat) => (
                      <MenuItem key={cat} value={cat}>
                        {cat}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
            {/* Job filter */}
            {jobOptions.length > 0 && (
              <Box sx={{ px: 2.5, py: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'text.secondary',
                    mb: 1,
                  }}
                >
                  Job
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mt: 0.5 }}>
                  <InputLabel>Job</InputLabel>
                  <Select
                    value={jobFilter}
                    label="Job"
                    onChange={(e) => setJobFilter(e.target.value)}
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
                      All Jobs
                    </MenuItem>
                    {jobOptions.map(([id, label]) => (
                      <MenuItem
                        key={id}
                        value={id}
                        sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                      >
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
            <Divider />
            <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
              <Button
                size="small"
                onClick={() => {
                  setSearch('');
                  setTeamFilter('All');
                  setPartnerFilter('All');
                  setStatusFilter('All');
                  setPriorityFilter('All');
                  setAssigneeFilter('All');
                  setCategoryFilter('All');
                  setJobFilter('All');
                  setFilterAnchorEl(null);
                }}
                sx={{ textTransform: 'none', fontWeight: 600, color: 'primary.main' }}
              >
                Reset filters
              </Button>
            </Box>
          </Popover>

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
          <Tooltip title="Task category" placement="bottom" arrow>
            <IconButton
              onClick={(e) => setCategoriesAnchorEl(e.currentTarget)}
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
              aria-label="Categories"
            >
              <AppIcon
                name="Category"
                fallback={CategoryIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={categoriesAnchorEl}
            open={Boolean(categoriesAnchorEl)}
            onClose={() => setCategoriesAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1.5,
                  minWidth: 200,
                  borderRadius: 2,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                },
              },
            }}
            MenuListProps={{ 'aria-label': 'Task categories' }}
          >
            <MenuItem
              selected={taskScope === 'all'}
              onClick={() => {
                setTaskScope('all');
                setCategoriesAnchorEl(null);
              }}
              sx={{ fontWeight: 600, py: 1 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <AppIcon
                  name="ViewList"
                  fallback={ViewListIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
                All
              </Box>
            </MenuItem>
            <MenuItem
              selected={taskScope === 'partners'}
              onClick={() => {
                setTaskScope('partners');
                setCategoriesAnchorEl(null);
              }}
              sx={{ fontWeight: 600, py: 1 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <AppIcon
                  name="HandshakeOutlined"
                  fallback={HandshakeOutlinedIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
                {isMobile ? 'Partner' : 'Partner Tasks'}
              </Box>
            </MenuItem>
            <MenuItem
              selected={taskScope === 'team'}
              onClick={() => {
                setTaskScope('team');
                setCategoriesAnchorEl(null);
              }}
              sx={{ fontWeight: 600, py: 1 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <AppIcon
                  name="GroupsOutlined"
                  fallback={GroupsOutlinedIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
                {isMobile ? 'Team' : 'Team Tasks'}
              </Box>
            </MenuItem>
            <MenuItem
              selected={taskScope === 'projects'}
              onClick={() => {
                setTaskScope('projects');
                setCategoriesAnchorEl(null);
              }}
              sx={{ fontWeight: 600, py: 1 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <AppIcon
                  name="FolderOutlined"
                  fallback={FolderOutlinedIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
                Projects Tasks
              </Box>
            </MenuItem>
            <MenuItem
              selected={taskScope === 'agents'}
              onClick={() => {
                setTaskScope('agents');
                setCategoriesAnchorEl(null);
              }}
              sx={{ fontWeight: 600, py: 1 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <AppIcon
                  name="SmartToyOutlined"
                  fallback={SmartToyOutlinedIcon}
                  sx={{ fontSize: 20, color: 'text.secondary' }}
                />
                {isMobile ? 'AI Agents' : 'AI Agent Tasks'}
              </Box>
            </MenuItem>
            {devMode && (
              <MenuItem
                selected={activeView === 'devTasks'}
                onClick={() => {
                  setActiveView('devTasks');
                  setCategoriesAnchorEl(null);
                }}
                sx={{ fontWeight: 600, py: 1 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <AppIcon
                    name="CodeOutlined"
                    fallback={CodeOutlinedIcon}
                    sx={{ fontSize: 20, color: '#F59E0B' }}
                  />
                  {isMobile ? 'Dev' : 'Development Tasks'}
                </Box>
              </MenuItem>
            )}
          </Menu>

          <Button
            variant="outlined"
            size="small"
            onClick={handleOpenCreateTask}
            disabled={taskScope === 'team' && !canCreateTeamTasks}
            aria-label="Create"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, minWidth: 0, px: 1 }}
          >
            <AppIcon name="Add" fallback={AddIcon} />
          </Button>
        </Box>
      </Box>

      {/* ── Recent Git Activity strip ────────────────────────── */}
      {showRecentGitActivity && gitLiveData?.history?.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            mb: 2,
            borderRadius: 2,
            overflow: 'hidden',
            borderColor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.15),
          }}
        >
          <Box
            onClick={() => setGitStripExpanded((v) => !v)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              cursor: 'pointer',
              bgcolor: alpha(isDark ? '#E6EDF3' : '#24292F', isDark ? 0.04 : 0.02),
              '&:hover': { bgcolor: alpha(isDark ? '#E6EDF3' : '#24292F', isDark ? 0.08 : 0.04) },
              transition: 'background-color 0.15s',
            }}
          >
            <AppIcon
              name="GitHub"
              fallback={GitHubIcon}
              sx={{ fontSize: 16, color: isDark ? '#E6EDF3' : '#24292F' }}
            />
            <Typography
              sx={{ fontSize: '0.76rem', fontWeight: 700, color: isDark ? '#E6EDF3' : '#24292F' }}
            >
              Recent Git Activity
            </Typography>
            <Chip
              size="small"
              label={`${gitLiveData.history.length} commits`}
              sx={{
                height: 18,
                fontSize: '0.58rem',
                fontWeight: 700,
                bgcolor: alpha('#16A34A', 0.1),
                color: '#16A34A',
              }}
            />
            {gitLiveData.details?.repo && (
              <Chip
                size="small"
                label={(gitLiveData.details.repo || '').split('/').pop()}
                variant="outlined"
                sx={{
                  height: 18,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  borderColor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.2),
                  color: 'text.secondary',
                }}
              />
            )}
            <Box sx={{ flex: 1 }} />
            {/* Inline latest commit preview when collapsed */}
            {!gitStripExpanded && gitLiveData.history[0] && (
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: 'text.secondary',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: { xs: 120, sm: 300 },
                }}
              >
                {gitLiveData.history[0].detail || gitLiveData.history[0].label || ''}
              </Typography>
            )}
            <IconButton size="small" sx={{ p: 0.25 }}>
              {gitStripExpanded ? (
                <AppIcon name="ExpandLess" fallback={ExpandLessIcon} fontSize="small" />
              ) : (
                <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} fontSize="small" />
              )}
            </IconButton>
          </Box>
          <Collapse in={gitStripExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ px: 1.5, py: 1 }}>
              <Stack spacing={0.5}>
                {gitLiveData.history.slice(0, 6).map((h, i) => {
                  const ts = h.timestamp ? new Date(h.timestamp) : null;
                  const ago = ts
                    ? (() => {
                        const diffMs = Date.now() - ts.getTime();
                        const mins = Math.floor(diffMs / 60000);
                        if (mins < 60) return `${mins}m ago`;
                        const hours = Math.floor(mins / 60);
                        if (hours < 24) return `${hours}h ago`;
                        return `${Math.floor(hours / 24)}d ago`;
                      })()
                    : '';
                  return (
                    <Stack
                      key={`${h.timestamp}-${i}`}
                      direction="row"
                      alignItems="center"
                      spacing={0.6}
                      sx={{
                        py: 0.3,
                        borderBottom: i < 5 ? '1px solid' : 'none',
                        borderColor: alpha(theme.palette.divider, 0.06),
                      }}
                    >
                      <AppIcon
                        name="Commit"
                        fallback={CommitIcon}
                        sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }}
                      />
                      <Chip
                        size="small"
                        label={h.action || 'commit'}
                        sx={{
                          height: 18,
                          fontSize: '0.58rem',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          minWidth: 48,
                          bgcolor: alpha(
                            h.status === 'success' ? '#16A34A' : isDark ? '#E6EDF3' : '#24292F',
                            0.1
                          ),
                          color:
                            h.status === 'success' ? '#16A34A' : isDark ? '#E6EDF3' : '#24292F',
                        }}
                      />
                      {h.branch && (
                        <Chip
                          size="small"
                          label={h.branch}
                          sx={{
                            height: 16,
                            fontSize: '0.52rem',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            bgcolor: alpha('#7C3AED', 0.1),
                            color: '#7C3AED',
                            maxWidth: 90,
                            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                          }}
                        />
                      )}
                      <Typography
                        sx={{
                          fontSize: '0.66rem',
                          fontWeight: 600,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                        }}
                      >
                        {h.detail || h.label || '-'}
                      </Typography>
                      {h.user && (
                        <Typography
                          sx={{ fontSize: '0.56rem', color: 'text.secondary', flexShrink: 0 }}
                        >
                          {h.user}
                        </Typography>
                      )}
                      <Typography
                        sx={{
                          fontSize: '0.58rem',
                          color: 'text.secondary',
                          fontFamily: 'monospace',
                          flexShrink: 0,
                        }}
                      >
                        {ago}
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
              <Box sx={{ textAlign: 'center', mt: 0.75 }}>
                <Button
                  size="small"
                  onClick={() => navigate('/github-pushes')}
                  sx={{
                    fontSize: '0.7rem',
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 1.5,
                  }}
                >
                  View all in Git Activity →
                </Button>
              </Box>
            </Box>
          </Collapse>
        </Paper>
      )}

      {/* Clear all tasks confirmation */}
      <FormDialog
        open={clearAllConfirmOpen}
        onClose={() => !clearingAll && setClearAllConfirmOpen(false)}
        title={
          taskScope === 'team'
            ? 'Clear all team tasks?'
            : taskScope === 'projects'
              ? 'Clear all project tasks?'
              : 'Clear all tasks?'
        }
        icon={DeleteOutlineIcon}
        iconVariant="warning"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setClearAllConfirmOpen(false)} disabled={clearingAll}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleClearAllTasks}
              disabled={clearingAll}
            >
              {clearingAll ? 'Clearing…' : 'Clear all tasks'}
            </Button>
          </>
        }
      >
        <Alert severity="warning">
          {taskScope === 'team'
            ? 'This will remove every internal team task. This cannot be undone.'
            : taskScope === 'all'
              ? 'This will remove every task (partner, team, and project tasks). This cannot be undone.'
              : taskScope === 'projects'
                ? 'This will remove every task that is linked to a project. This cannot be undone.'
                : 'This will remove every task from the Task Manager and from every partner page. This cannot be undone.'}
        </Alert>
      </FormDialog>

      {/* Sort Popover */}
      <Popover
        anchorEl={controlsAnchor}
        open={Boolean(controlsAnchor)}
        onClose={() => setControlsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 220, p: 2, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
          Sort Options
        </Typography>
        <Stack spacing={2}>
          <FormControl size="small" fullWidth>
            <InputLabel>Sort By</InputLabel>
            <Select value={sortBy} label="Sort By" onChange={(e) => setSortBy(e.target.value)}>
              {scopedSortOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Direction</InputLabel>
            <Select value={sortDir} label="Direction" onChange={(e) => setSortDir(e.target.value)}>
              <MenuItem value="asc">Ascending</MenuItem>
              <MenuItem value="desc">Descending</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Popover>

      {/* Empty State */}
      {filteredTasks.length === 0 && (
        <EmptyState
          illustration={TaskManagerArt}
          title="No tasks found"
          description="Try adjusting your filters or search query, or create a new task."
          actionLabel={
            taskScope === 'team'
              ? 'Create Team Task'
              : taskScope === 'projects'
                ? 'Create project task'
                : taskScope === 'all'
                  ? 'Create Task'
                  : 'Create Task'
          }
          onAction={handleOpenCreateTask}
        />
      )}

      {/* Kanban View */}
      {filteredTasks.length > 0 && activeView === 'kanban' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Box
            sx={{
              display: 'flex',
              gap: 3,
              overflowX: 'auto',
              pb: 2,
              px: 2,
              height: embedded ? '100%' : 'calc(100vh - 250px)',
              flex: embedded ? 1 : 'none',
              minHeight: embedded ? 0 : undefined,
            }}
          >
            {boardColumns.map((columnId) => {
              const config = statusConfig[columnId];
              const colTasks = filteredTasks.filter((task) => task.status === columnId);

              return (
                <Paper
                  key={columnId}
                  elevation={0}
                  sx={{
                    flex: '1 1 0',
                    minWidth: 280,
                    maxWidth: '100%',
                    bgcolor: config.bg ?? theme.palette.background.paper,
                    borderRadius: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    border: `1px solid ${config.border}`,
                  }}
                >
                  {/* Column Header - Not Started / In Progress / Completed + pill count */}
                  <Box
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: `1px solid ${config.border}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: config.color }}>
                        {config.label}
                      </Typography>
                      <Chip
                        label={colTasks.length}
                        size="small"
                        sx={{
                          height: 24,
                          fontWeight: 700,
                          borderRadius: 2,
                          bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'background.paper',
                          color: config.color,
                          border: isDark ? '1px solid rgba(255,255,255,0.08)' : 'none',
                        }}
                      />
                    </Box>
                  </Box>
                  {/* Column Content */}
                  <Droppable droppableId={columnId}>
                    {(provided, snapshot) => (
                      <Box
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        sx={{
                          flex: 1,
                          p: 1.5,
                          overflowY: 'auto',
                          transition: 'background-color 0.2s',
                          bgcolor: snapshot.isDraggingOver
                            ? alpha(config.color, 0.05)
                            : 'transparent',
                        }}
                      >
                        {colTasks.map((task, index) => {
                          const pConfig = priorityConfig[task.priority || 'low'];
                          return (
                            <Draggable key={task.dragId} draggableId={task.dragId} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <Card
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  onClick={() => setSelectedTask({ ...task })}
                                  elevation={dragSnapshot.isDragging ? 8 : 0}
                                  sx={{
                                    mb: 1.5,
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: dragSnapshot.isDragging
                                      ? 'primary.main'
                                      : 'divider',
                                    cursor: 'grab',
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                      borderColor: 'primary.light',
                                      transform: 'translateY(-2px)',
                                      boxShadow: createHoverGlowShadow(theme),
                                    },
                                  }}
                                >
                                  <CardContent sx={{ p: '16px !important' }}>
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        mb: 1,
                                      }}
                                    >
                                      <Chip
                                        icon={
                                          task._isDevTask ? (
                                            <AppIcon
                                              name="CodeOutlined"
                                              fallback={CodeOutlinedIcon}
                                              sx={{ fontSize: 13 }}
                                            />
                                          ) : undefined
                                        }
                                        label={task._isDevTask ? 'Developer' : task.partnerName}
                                        size="small"
                                        sx={{
                                          height: 20,
                                          fontSize: '0.7rem',
                                          maxWidth: 120,
                                          bgcolor: task._isDevTask
                                            ? alpha('#F59E0B', 0.12)
                                            : alpha(theme.palette.primary.main, 0.1),
                                          color: task._isDevTask ? '#F59E0B' : 'primary.main',
                                          fontWeight: 600,
                                        }}
                                      />
                                      <Chip
                                        icon={<PriorityBarsIcon color={pConfig.color} />}
                                        label={(task.priority || 'low').toUpperCase()}
                                        size="small"
                                        sx={{
                                          height: 28,
                                          fontSize: '0.75rem',
                                          px: 0.5,
                                          bgcolor: pConfig.bg,
                                          color: pConfig.color,
                                          fontWeight: 700,
                                          borderRadius: 2,
                                          border: '2px solid',
                                          borderColor: pConfig.color,
                                          '& .MuiChip-icon': { ml: 0.5 },
                                          '& .MuiChip-label': { px: 0.75 },
                                        }}
                                      />
                                    </Box>

                                    <Typography
                                      variant="subtitle2"
                                      sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.3 }}
                                    >
                                      {task.title}
                                    </Typography>

                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                      noWrap
                                      sx={{ mb: 1.5, fontSize: '0.8rem' }}
                                    >
                                      {task.description || 'No description'}
                                    </Typography>

                                    {/* Related: Job Pool */}
                                    {task.jobPoolId && (
                                      <Box
                                        sx={{
                                          mb: 1,
                                          p: 0.75,
                                          borderRadius: 1.5,
                                          border: '1px solid',
                                          borderColor: alpha(theme.palette.info.main, 0.2),
                                          bgcolor: alpha(theme.palette.info.main, 0.04),
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.5,
                                        }}
                                      >
                                        <AppIcon
                                          name="LinkOutlined"
                                          fallback={LinkOutlinedIcon}
                                          sx={{ fontSize: 14, color: 'info.main' }}
                                        />
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            fontWeight: 600,
                                            color: 'info.main',
                                            fontSize: '0.65rem',
                                          }}
                                        >
                                          Related:
                                        </Typography>
                                        <Chip
                                          size="small"
                                          icon={
                                            <AppIcon
                                              name="WorkOutline"
                                              fallback={WorkOutlineIcon}
                                              sx={{ fontSize: '12px !important' }}
                                            />
                                          }
                                          label={task.jobPoolId}
                                          variant="outlined"
                                          color="info"
                                          onClick={() => navigate('/job-pool')}
                                          sx={{
                                            height: 18,
                                            fontSize: '0.6rem',
                                            fontWeight: 600,
                                            maxWidth: 140,
                                            borderRadius: 1,
                                            cursor: 'pointer',
                                          }}
                                        />
                                        {task.category && (
                                          <Chip
                                            size="small"
                                            label={task.category}
                                            sx={{
                                              height: 16,
                                              fontSize: '0.55rem',
                                              fontWeight: 700,
                                              borderRadius: 1,
                                              bgcolor: alpha(theme.palette.info.main, 0.1),
                                              color: 'info.main',
                                            }}
                                          />
                                        )}
                                      </Box>
                                    )}

                                    {/* Related: Goal (for AI Agent tasks) */}
                                    {task.data?.goal_title && (
                                      <Box
                                        sx={{
                                          mb: 1,
                                          p: 0.75,
                                          borderRadius: 1.5,
                                          border: '1px solid',
                                          borderColor: alpha(theme.palette.success.main, 0.2),
                                          bgcolor: alpha(theme.palette.success.main, 0.04),
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.5,
                                          cursor: 'pointer',
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/goals/${task.data.goal_id || task.goal_id}`);
                                        }}
                                      >
                                        <AppIcon
                                          name="FlagOutlined"
                                          fallback={FlagOutlinedIcon}
                                          sx={{ fontSize: 14, color: 'success.main' }}
                                        />
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            fontWeight: 600,
                                            color: 'success.main',
                                            fontSize: '0.65rem',
                                          }}
                                        >
                                          Goal:
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          sx={{ fontSize: '0.62rem', fontWeight: 600 }}
                                          noWrap
                                        >
                                          {task.data.goal_title}
                                        </Typography>
                                      </Box>
                                    )}

                                    {/* Git commits indicator */}
                                    {(task.gitCommits || []).length > 0 && (
                                      <Box
                                        sx={{
                                          mb: 1,
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: 0.5,
                                        }}
                                      >
                                        {(task.gitCommits || []).slice(0, 2).map((gc) => (
                                          <Box
                                            key={gc.id}
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 0.5,
                                              px: 1,
                                              py: 0.4,
                                              borderRadius: 1,
                                              bgcolor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.05),
                                              border: '1px solid',
                                              borderColor: alpha(
                                                isDark ? '#E6EDF3' : '#24292F',
                                                0.1
                                              ),
                                            }}
                                          >
                                            <AppIcon
                                              name="Commit"
                                              fallback={CommitIcon}
                                              sx={{
                                                fontSize: 13,
                                                color: isDark ? '#8B949E' : '#57606A',
                                                flexShrink: 0,
                                              }}
                                            />
                                            <Typography
                                              variant="caption"
                                              sx={{
                                                fontFamily: 'monospace',
                                                fontWeight: 600,
                                                fontSize: '0.65rem',
                                                color: isDark ? '#8B949E' : '#57606A',
                                                flexShrink: 0,
                                              }}
                                            >
                                              {(gc.sha || '').slice(0, 7)}
                                            </Typography>
                                            <Typography
                                              variant="caption"
                                              noWrap
                                              sx={{
                                                fontSize: '0.65rem',
                                                color: 'text.secondary',
                                                minWidth: 0,
                                              }}
                                            >
                                              {gc.message}
                                            </Typography>
                                          </Box>
                                        ))}
                                        {(task.gitCommits || []).length > 2 && (
                                          <Typography
                                            variant="caption"
                                            color="text.disabled"
                                            sx={{ pl: 0.5, fontSize: '0.65rem' }}
                                          >
                                            +{(task.gitCommits || []).length - 2} more commit
                                            {(task.gitCommits || []).length - 2 > 1 ? 's' : ''}
                                          </Typography>
                                        )}
                                      </Box>
                                    )}

                                    <Divider sx={{ my: 1 }} />

                                    <Box
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        mt: 1,
                                        flexWrap: 'wrap',
                                        gap: 0.5,
                                      }}
                                    >
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <AppIcon
                                          name="PersonOutline"
                                          fallback={PersonOutlineIcon}
                                          sx={{ fontSize: 16, color: 'text.secondary' }}
                                        />
                                        <Typography variant="caption" color="text.secondary">
                                          {task.assignedTo || 'Unassigned'}
                                        </Typography>
                                      </Box>
                                      {task.deadline && (
                                        <Box
                                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                        >
                                          <AppIcon
                                            name="CalendarToday"
                                            fallback={CalendarTodayIcon}
                                            sx={{ fontSize: 14, color: 'text.secondary' }}
                                          />
                                          <Typography variant="caption" color="text.secondary">
                                            {task.deadline}
                                          </Typography>
                                        </Box>
                                      )}
                                      {(task.gitCommits || []).length > 0 && (
                                        <Tooltip
                                          title={`${(task.gitCommits || []).length} git commit${(task.gitCommits || []).length > 1 ? 's' : ''}`}
                                        >
                                          <Box
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 0.25,
                                            }}
                                          >
                                            <AppIcon
                                              name="GitHub"
                                              fallback={GitHubIcon}
                                              sx={{
                                                fontSize: 14,
                                                color: isDark ? '#8B949E' : '#57606A',
                                              }}
                                            />
                                            <Typography
                                              variant="caption"
                                              sx={{
                                                fontWeight: 700,
                                                fontSize: '0.7rem',
                                                color: isDark ? '#8B949E' : '#57606A',
                                              }}
                                            >
                                              {(task.gitCommits || []).length}
                                            </Typography>
                                          </Box>
                                        </Tooltip>
                                      )}
                                      {task.agentId &&
                                        (() => {
                                          const ag = hubAgents.find((a) => a.id === task.agentId);
                                          return (
                                            <Tooltip
                                              title={`Agent: ${ag?.role || ag?.agent_id || task.agentId}`}
                                            >
                                              <Chip
                                                size="small"
                                                icon={
                                                  <AppIcon
                                                    name="SmartToyOutlined"
                                                    fallback={SmartToyOutlinedIcon}
                                                    sx={{ fontSize: '12px !important' }}
                                                  />
                                                }
                                                label={ag?.role || ag?.agent_id || 'Agent'}
                                                variant="outlined"
                                                color="info"
                                                sx={{
                                                  height: 18,
                                                  fontSize: '0.6rem',
                                                  fontWeight: 600,
                                                  maxWidth: 90,
                                                  borderRadius: 1,
                                                }}
                                              />
                                            </Tooltip>
                                          );
                                        })()}
                                      <EntityInfoBadge
                                        createdAt={task.createdAt}
                                        updatedAt={task.updatedAt}
                                        createdBy={task.createdBy}
                                      />
                                    </Box>
                                  </CardContent>
                                </Card>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </Box>
                    )}
                  </Droppable>
                </Paper>
              );
            })}
          </Box>
        </DragDropContext>
      )}

      {/* Table View */}
      {filteredTasks.length > 0 && activeView === 'table' && (
        <Box
          sx={{
            flex: embedded ? 1 : 'none',
            minHeight: embedded ? 0 : undefined,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 3,
              overflow: 'hidden',
              flex: embedded ? 1 : 'none',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <Box
              sx={{
                p: 1.5,
                display: 'flex',
                justifyContent: 'flex-end',
                bgcolor: 'background.default',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Button
                variant="contained"
                size="small"
                onClick={applyAllTableChanges}
                disabled={saving || Object.keys(tableDrafts).length === 0}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                {saving ? 'Saving...' : `Apply Changes (${Object.keys(tableDrafts).length})`}
              </Button>
            </Box>
            <TableContainer
              sx={{
                maxHeight: embedded ? '100%' : 'calc(100vh - 300px)',
                flex: embedded ? 1 : 'none',
                minHeight: embedded ? 0 : undefined,
              }}
            >
              <Table stickyHeader size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Partner</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Task Details
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Git</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Priority
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Assignee
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Deadline
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTasks.map((task) => {
                    const hasChanges = hasTaskChanges(task);
                    return (
                      <TableRow key={`${task.partnerId}-${task.id}`} hover>
                        <TableCell sx={{ verticalAlign: 'top', pt: 2 }}>
                          <Chip
                            icon={
                              task._isDevTask ? (
                                <AppIcon
                                  name="CodeOutlined"
                                  fallback={CodeOutlinedIcon}
                                  sx={{ fontSize: 14 }}
                                />
                              ) : undefined
                            }
                            label={task._isDevTask ? 'Developer' : task.partnerName}
                            size="small"
                            sx={{
                              height: 24,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              bgcolor: task._isDevTask
                                ? alpha('#F59E0B', 0.12)
                                : alpha(theme.palette.primary.main, 0.1),
                              color: task._isDevTask ? '#F59E0B' : 'primary.main',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 300 }}>
                          <Box
                            sx={{ mb: 1, cursor: 'pointer' }}
                            onClick={() => setSelectedTask(task)}
                          >
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                '&:hover': { color: 'primary.main' },
                              }}
                            >
                              {getDraftValue(task, 'title') || 'Untitled Task'}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              fontSize: '0.85rem',
                              mb: 1,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              '&:hover': { color: 'text.primary' },
                            }}
                            onClick={() => setSelectedTask(task)}
                          >
                            {getDraftValue(task, 'description') || 'No description'}
                          </Typography>
                          <Box
                            sx={{
                              mt: 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography variant="caption" color="text.disabled">
                              {task.taskId}
                            </Typography>
                            <EntityInfoBadge
                              createdAt={task.createdAt}
                              updatedAt={task.updatedAt}
                              createdBy={task.createdBy}
                            />
                          </Box>
                        </TableCell>
                        {/* Git column */}
                        <TableCell sx={{ verticalAlign: 'top', pt: 2, minWidth: 150 }}>
                          {(task.gitCommits || []).length > 0 ? (
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0.5,
                                cursor: 'pointer',
                              }}
                              onClick={() => setSelectedTask(task)}
                            >
                              {(task.gitCommits || []).slice(0, 3).map((gc) => (
                                <Box
                                  key={gc.id}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    px: 0.75,
                                    py: 0.35,
                                    borderRadius: 1,
                                    bgcolor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.05),
                                    border: '1px solid',
                                    borderColor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.1),
                                  }}
                                >
                                  <AppIcon
                                    name="Commit"
                                    fallback={CommitIcon}
                                    sx={{
                                      fontSize: 13,
                                      color: isDark ? '#8B949E' : '#57606A',
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontFamily: 'monospace',
                                      fontWeight: 700,
                                      fontSize: '0.65rem',
                                      color: isDark ? '#8B949E' : '#57606A',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {(gc.sha || '').slice(0, 7)}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{
                                      fontSize: '0.65rem',
                                      color: 'text.secondary',
                                      minWidth: 0,
                                    }}
                                  >
                                    {gc.message || ''}
                                  </Typography>
                                </Box>
                              ))}
                              {(task.gitCommits || []).length > 3 && (
                                <Typography
                                  variant="caption"
                                  color="text.disabled"
                                  sx={{ fontSize: '0.65rem', pl: 0.5 }}
                                >
                                  +{(task.gitCommits || []).length - 3} more
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Typography
                              variant="caption"
                              color="text.disabled"
                              sx={{ fontSize: '0.75rem' }}
                            >
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <HoverEditPill
                            onClick={(e) =>
                              openSelectPopover(e, {
                                title: 'Status',
                                options: statusOptions,
                                currentValue: getDraftValue(task, 'status') || 'todo',
                                onSave: (value) => updateDraft(task, 'status', value),
                              })
                            }
                          >
                            <Chip
                              icon={getStatusIcon(getDraftValue(task, 'status') || 'todo')}
                              size="small"
                              label={TASK_STATUS_LABELS[getDraftValue(task, 'status') || 'todo']}
                              sx={{
                                bgcolor: 'background.paper',
                                color: 'text.primary',
                                border: `1px solid ${statusConfig[getDraftValue(task, 'status') || 'todo']?.border}`,
                                fontWeight: 600,
                                height: 26,
                                '& .MuiChip-label': { px: 1 },
                              }}
                            />
                          </HoverEditPill>
                        </TableCell>
                        <TableCell>
                          <HoverEditPill
                            onClick={(e) =>
                              openSelectPopover(e, {
                                title: 'Priority',
                                options: priorityOptions,
                                currentValue: getDraftValue(task, 'priority') || 'low',
                                onSave: (value) => updateDraft(task, 'priority', value),
                              })
                            }
                          >
                            <Chip
                              icon={
                                <PriorityBarsIcon
                                  color={
                                    priorityConfig[getDraftValue(task, 'priority') || 'low']?.color
                                  }
                                />
                              }
                              size="small"
                              label={(getDraftValue(task, 'priority') || 'low').toUpperCase()}
                              sx={{
                                bgcolor: 'transparent',
                                color: 'text.primary',
                                fontWeight: 700,
                                height: 24,
                                '& .MuiChip-label': { px: 1 },
                              }}
                            />
                          </HoverEditPill>
                        </TableCell>
                        <TableCell>
                          <TextField
                            variant="outlined"
                            size="small"
                            value={getDraftValue(task, 'assignedTo')}
                            onChange={(e) => updateDraft(task, 'assignedTo', e.target.value)}
                            placeholder="Unassigned"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: 'background.paper',
                                '& fieldset': { borderColor: 'transparent' },
                                '&:hover fieldset': { borderColor: 'divider' },
                                '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="date"
                            variant="outlined"
                            size="small"
                            value={getDraftValue(task, 'deadline')}
                            onChange={(e) => updateDraft(task, 'deadline', e.target.value)}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                bgcolor: 'background.paper',
                                '& fieldset': { borderColor: 'transparent' },
                                '&:hover fieldset': { borderColor: 'divider' },
                                '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant={hasChanges ? 'contained' : 'text'}
                            color={hasChanges ? 'primary' : 'inherit'}
                            disabled={!hasChanges}
                            onClick={() => applyTaskChanges(task)}
                            sx={{ minWidth: 80 }}
                          >
                            {hasChanges ? 'Save' : 'Saved'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {/* Roadmap View */}
      {filteredTasks.length > 0 && activeView === 'roadmap' && (
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 3,
            p: { xs: 1.25, sm: 2 },
            bgcolor: 'background.paper',
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: { xs: 1.5, sm: 2 },
              flexWrap: 'wrap',
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              Project Timeline
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: { xs: 100, sm: 140 } }}>
                <Select
                  value={parsedRoadmapPeriod.month}
                  onChange={(e) =>
                    setRoadmapPeriod(
                      `${String(e.target.value).padStart(2, '0')}/${parsedRoadmapPeriod.year}`
                    )
                  }
                >
                  {monthOptions.map((month) => (
                    <MenuItem key={month.value} value={month.value}>
                      {month.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: { xs: 72, sm: 100 } }}>
                <Select
                  value={parsedRoadmapPeriod.year}
                  onChange={(e) =>
                    setRoadmapPeriod(
                      `${String(parsedRoadmapPeriod.month).padStart(2, '0')}/${e.target.value}`
                    )
                  }
                >
                  {roadmapYears.map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setRoadmapPeriod(formatMonthYear(new Date()))}
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                Today
              </Button>
            </Box>
          </Box>

          {!roadmapModel ? (
            <Alert severity="info">No tasks with deadlines to display in roadmap.</Alert>
          ) : roadmapModel.items.length === 0 ? (
            <Alert severity="info">No tasks found in selected period.</Alert>
          ) : (
            <Box sx={{ overflowX: 'auto', pb: 2, maxWidth: '100%', mx: { xs: -1.5, sm: 0 } }}>
              <Box
                sx={{
                  minWidth: Math.max(
                    isMobile ? 600 : 900,
                    roadmapModel.totalDays * (isMobile ? 16 : 20)
                  ),
                }}
              >
                {/* Months Header */}
                <Box
                  sx={{
                    display: 'flex',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    pb: 1,
                    mb: 1,
                  }}
                >
                  {roadmapModel.months.map((month) => (
                    <Box
                      key={month.key}
                      sx={{
                        width: `${(month.spanDays / roadmapModel.totalDays) * 100}%`,
                        minWidth: { xs: 56, sm: 120 },
                        px: { xs: 0.5, sm: 1 },
                        borderLeft: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: 'inherit' } }}
                      >
                        {month.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Days Header */}
                <Box
                  sx={{
                    display: 'flex',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    pb: 1,
                    mb: 2,
                  }}
                >
                  {roadmapModel.dayTicks.map((tick) => (
                    <Box
                      key={tick.ts}
                      sx={{
                        width: `${(1 / roadmapModel.totalDays) * 100}%`,
                        minWidth: { xs: 16, sm: 22 },
                        px: 0.5,
                        textAlign: 'center',
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: { xs: '0.6rem', sm: '0.68rem' } }}
                      >
                        {tick.day}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Timeline Grid */}
                <Box
                  sx={{
                    position: 'relative',
                    height: Math.max(
                      isMobile ? 240 : 300,
                      roadmapModel.items.length * (isMobile ? 36 : 40) + 20
                    ),
                    borderRadius: 2,
                    bgcolor: 'background.default',
                    background: isDark
                      ? 'repeating-linear-gradient(to right, transparent, transparent 19px, rgba(255,255,255,0.04) 19px, rgba(255,255,255,0.04) 20px)'
                      : 'repeating-linear-gradient(to right, transparent, transparent 19px, rgba(0,0,0,0.03) 19px, rgba(0,0,0,0.03) 20px)',
                  }}
                >
                  {/* Today Marker */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${((roadmapModel.todayTs - roadmapModel.minTs) / (roadmapModel.maxTs - roadmapModel.minTs || 1)) * 100}%`,
                      width: 2,
                      bgcolor: 'error.main',
                      zIndex: 1,
                    }}
                  />

                  {/* Tasks */}
                  {roadmapModel.items.map((task, index) => {
                    const startPct =
                      ((task.startTs - roadmapModel.minTs) /
                        (roadmapModel.maxTs - roadmapModel.minTs || 1)) *
                      100;
                    const widthPct =
                      ((task.endTs - task.startTs + MS_PER_DAY) /
                        (roadmapModel.maxTs - roadmapModel.minTs || 1)) *
                      100;
                    const pConfig = priorityConfig[task.priority || 'low'];

                    return (
                      <Tooltip
                        title={`${task.title} (${task.durationDays} days)`}
                        key={task.dragId}
                      >
                        <Box
                          onClick={() => setSelectedTask(task)}
                          sx={{
                            position: 'absolute',
                            left: `${Math.max(0, startPct)}%`,
                            top: index * (isMobile ? 36 : 40) + 10,
                            width: `${Math.max(widthPct, 5)}%`,
                            minWidth: isMobile ? 56 : 100,
                            height: isMobile ? 28 : 32,
                            bgcolor: isDark ? 'background.paper' : 'white',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 4,
                            px: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            boxShadow: isDark
                              ? '0 2px 8px rgba(0,0,0,0.25)'
                              : '0 2px 4px rgba(0,0,0,0.05)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': {
                              zIndex: 2,
                              transform: 'scale(1.02)',
                              boxShadow: isDark
                                ? '0 4px 16px rgba(0,0,0,0.4)'
                                : '0 4px 12px rgba(0,0,0,0.1)',
                            },
                          }}
                        >
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              bgcolor: pConfig.color,
                              flexShrink: 0,
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              fontSize: { xs: '0.65rem', sm: 'inherit' },
                            }}
                          >
                            {task.title}
                          </Typography>
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* Development Tasks View */}
      {devMode && activeView === 'devTasks' && (
        <Box
          sx={{
            p: 2,
            flex: embedded ? 1 : 'none',
            minHeight: embedded ? 0 : undefined,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Add task form */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2.5,
              borderColor: alpha('#F59E0B', 0.25),
              bgcolor: isDark ? alpha('#F59E0B', 0.04) : alpha('#F59E0B', 0.02),
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Page</InputLabel>
                <Select
                  value={devNewTaskPage}
                  label="Page"
                  onChange={(e) => setDevNewTaskPage(e.target.value)}
                >
                  {Object.entries(DEV_TASK_PAGE_LABELS).map(([path, label]) => (
                    <MenuItem key={path} value={path}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="Task title..."
                value={devNewTaskText}
                onChange={(e) => setDevNewTaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && devNewTaskText.trim() && devNewTaskPage) {
                    addDevTask(devNewTaskPage, devNewTaskText, {
                      priority: devNewTaskPriority,
                      deadline: devNewTaskDeadline,
                      status: devNewTaskStatus,
                    });
                    setDevNewTaskText('');
                    setDevNewTaskDeadline('');
                  }
                }}
                sx={{ flex: 1, minWidth: 160 }}
              />
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={devNewTaskPriority}
                  label="Priority"
                  onChange={(e) => setDevNewTaskPriority(e.target.value)}
                >
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={devNewTaskStatus}
                  label="Status"
                  onChange={(e) => setDevNewTaskStatus(e.target.value)}
                >
                  <MenuItem value="todo">Not Started</MenuItem>
                  <MenuItem value="inProgress">In Progress</MenuItem>
                  <MenuItem value="done">Completed</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                type="date"
                label="Deadline"
                value={devNewTaskDeadline}
                onChange={(e) => setDevNewTaskDeadline(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 140 }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<AppIcon name="Add" fallback={AddIcon} />}
                disabled={!devNewTaskText.trim() || !devNewTaskPage}
                onClick={() => {
                  if (devNewTaskText.trim() && devNewTaskPage) {
                    addDevTask(devNewTaskPage, devNewTaskText, {
                      priority: devNewTaskPriority,
                      deadline: devNewTaskDeadline,
                      status: devNewTaskStatus,
                    });
                    setDevNewTaskText('');
                    setDevNewTaskDeadline('');
                  }
                }}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: '#F59E0B',
                  '&:hover': { bgcolor: '#D97706' },
                }}
              >
                Add
              </Button>
            </Box>
          </Paper>

          {/* Summary chips */}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              mb: 2,
              flexWrap: 'wrap',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <Chip
              icon={
                <AppIcon name="CodeOutlined" fallback={CodeOutlinedIcon} sx={{ fontSize: 16 }} />
              }
              label={`Total: ${devTotalCount}`}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                bgcolor: alpha('#F59E0B', 0.12),
                color: '#F59E0B',
              }}
            />
            <Chip
              label={`Not Started: ${devStatusCounts.todo}`}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                bgcolor: alpha(statusConfig.todo.color, 0.14),
                color: statusConfig.todo.color,
              }}
            />
            <Chip
              label={`In Progress: ${devStatusCounts.inProgress}`}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                bgcolor: alpha(statusConfig.inProgress.color, 0.14),
                color: statusConfig.inProgress.color,
              }}
            />
            <Chip
              label={`Completed: ${devStatusCounts.done}`}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                bgcolor: alpha(statusConfig.done.color, 0.14),
                color: statusConfig.done.color,
              }}
            />
            <Chip
              label={`Pages: ${devTaskPages.length}`}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: theme.palette.primary.main,
              }}
            />
          </Box>

          {allDevTasks.length === 0 ? (
            <EmptyState
              icon={CodeOutlinedIcon}
              title="No development tasks yet"
              description="Add dev tasks using the form above or from the dev tasks button in the header on any page."
            />
          ) : (
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: 'hidden',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <TableContainer sx={{ flex: 1, minHeight: 0 }}>
                <Table stickyHeader size="medium">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: 'text.secondary', width: 110 }}>
                        Page
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>Task</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'text.secondary', width: 120 }}>
                        Status
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'text.secondary', width: 100 }}>
                        Priority
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'text.secondary', width: 120 }}>
                        Deadline
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 700, color: 'text.secondary', width: 80 }}
                      >
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allDevTasks.map((task) => {
                      const tStatus = task.status || (task.done ? 'done' : 'todo');
                      const sConf = statusConfig[tStatus] || statusConfig.todo;
                      const pConf =
                        priorityConfig[task.priority || 'medium'] || priorityConfig.medium;
                      const isOverdue =
                        task.deadline && new Date(task.deadline) < new Date() && tStatus !== 'done';
                      return (
                        <TableRow
                          key={task.id}
                          hover
                          sx={{ '&:hover .dev-row-actions': { opacity: 1 } }}
                        >
                          <TableCell>
                            <Chip
                              icon={
                                <AppIcon
                                  name="FolderOutlined"
                                  fallback={FolderOutlinedIcon}
                                  sx={{ fontSize: 13 }}
                                />
                              }
                              label={getDevPageLabel(task.page)}
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                maxWidth: 110,
                                bgcolor: alpha('#F59E0B', 0.1),
                                color: '#F59E0B',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box
                              sx={{ cursor: 'pointer' }}
                              onClick={() => {
                                const vt = devVirtualTasks.find((v) => v.id === task.id);
                                if (vt) setSelectedTask(vt);
                              }}
                            >
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  fontWeight: 600,
                                  fontSize: '0.9rem',
                                  textDecoration: tStatus === 'done' ? 'line-through' : 'none',
                                  color: tStatus === 'done' ? 'text.disabled' : 'text.primary',
                                  '&:hover': { color: 'primary.main' },
                                }}
                              >
                                {task.text || 'Untitled'}
                              </Typography>
                              {task.description && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    fontSize: '0.8rem',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {task.description}
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <HoverEditPill
                              onClick={(e) =>
                                openSelectPopover(e, {
                                  title: 'Status',
                                  options: statusOptions,
                                  currentValue: tStatus,
                                  onSave: (value) =>
                                    patchDevTask(task.page, task.id, { status: value }),
                                })
                              }
                            >
                              <Chip
                                icon={getStatusIcon(tStatus)}
                                label={sConf.label}
                                size="small"
                                sx={{
                                  height: 24,
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  bgcolor: alpha(sConf.color, 0.12),
                                  color: sConf.color,
                                  border: '1px solid',
                                  borderColor: alpha(sConf.color, 0.25),
                                }}
                              />
                            </HoverEditPill>
                          </TableCell>
                          <TableCell>
                            <HoverEditPill
                              onClick={(e) =>
                                openSelectPopover(e, {
                                  title: 'Priority',
                                  options: priorityOptions,
                                  currentValue: task.priority || 'medium',
                                  onSave: (value) =>
                                    patchDevTask(task.page, task.id, { priority: value }),
                                })
                              }
                            >
                              <Chip
                                icon={<PriorityBarsIcon color={pConf.color} />}
                                label={pConf.label}
                                size="small"
                                sx={{
                                  height: 24,
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  bgcolor: pConf.bg,
                                  color: pConf.color,
                                }}
                              />
                            </HoverEditPill>
                          </TableCell>
                          <TableCell>
                            {task.deadline ? (
                              <Chip
                                icon={
                                  <AppIcon
                                    name="CalendarToday"
                                    fallback={CalendarTodayIcon}
                                    sx={{ fontSize: 13 }}
                                  />
                                }
                                label={new Date(task.deadline).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                                size="small"
                                sx={{
                                  height: 22,
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  bgcolor: isOverdue
                                    ? alpha('#EF4444', 0.1)
                                    : alpha(theme.palette.text.primary, 0.06),
                                  color: isOverdue ? '#EF4444' : 'text.secondary',
                                  border: isOverdue ? `1px solid ${alpha('#EF4444', 0.3)}` : 'none',
                                }}
                              />
                            ) : (
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.disabled', fontSize: '0.75rem' }}
                              >
                                -
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Box
                              className="dev-row-actions"
                              sx={{
                                display: 'flex',
                                gap: 0.5,
                                justifyContent: 'flex-end',
                                opacity: 0,
                                transition: 'opacity 0.15s',
                              }}
                            >
                              <Tooltip title="Open" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    const vt = devVirtualTasks.find((v) => v.id === task.id);
                                    if (vt) setSelectedTask(vt);
                                  }}
                                  sx={{ color: 'text.secondary' }}
                                >
                                  <AppIcon
                                    name="EditOutlined"
                                    fallback={EditOutlinedIcon}
                                    sx={{ fontSize: 16 }}
                                  />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => removeDevTask(task.page, task.id)}
                                  sx={{
                                    color: 'text.disabled',
                                    '&:hover': { color: 'error.main' },
                                  }}
                                >
                                  <AppIcon
                                    name="DeleteOutline"
                                    fallback={DeleteOutlineIcon}
                                    sx={{ fontSize: 16 }}
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
            </Paper>
          )}
        </Box>
      )}

      <EditPopover
        anchorEl={editState.anchorEl}
        open={Boolean(editState.anchorEl)}
        onClose={closeSelectPopover}
        title={editState.title}
        mode="select"
        options={editState.options}
        currentValue={editState.currentValue}
        onSave={(value) => {
          if (editState.onSave) editState.onSave(value);
        }}
      />

      {selectedTask && (
        <FormDialog
          open={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          title={selectedTask.isNew ? 'Create Task' : 'Edit Task'}
          icon={selectedTask.isNew ? AddIcon : EditOutlinedIcon}
          footerJustify="space-between"
          actions={
            <>
              {!selectedTask.isNew ? (
                <Button
                  onClick={handleDeleteTask}
                  color="error"
                  startIcon={<AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} />}
                  sx={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' }}
                >
                  Delete
                </Button>
              ) : (
                <Box />
              )}
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  onClick={() => setSelectedTask(null)}
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    textTransform: 'none',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTaskDialog}
                  variant="contained"
                  disableElevation
                  disabled={
                    dialogSaving ||
                    (selectedTask.isNew &&
                      (selectedTask.taskType || (selectedTask._isTeamTask ? 'team' : 'partner')) ===
                        'partner' &&
                      !selectedTask.partnerId) ||
                    (selectedTask.isNew &&
                      (selectedTask.taskType || (selectedTask._isTeamTask ? 'team' : '')) ===
                        'team' &&
                      !canCreateTeamTasks) ||
                    (selectedTask.isNew &&
                      (selectedTask.taskType || (selectedTask._isDevTask ? 'development' : '')) ===
                        'development' &&
                      !selectedTask._devPage) ||
                    (selectedTask.isNew &&
                      (selectedTask.taskType || (selectedTask._projectId ? 'projects' : '')) ===
                        'projects' &&
                      !selectedTask.partnerId)
                  }
                  startIcon={dialogSaving ? <CircularProgress size={16} color="inherit" /> : null}
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    borderRadius: 2,
                    textTransform: 'none',
                  }}
                >
                  {dialogSaving ? 'Saving...' : selectedTask.isNew ? 'Create' : 'Save'}
                </Button>
              </Box>
            </>
          }
        >
          <Stack spacing={3.5}>
            {selectedTask.isNew && (
              <FormControl
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                <InputLabel shrink id="edit-task-type-label">
                  Type
                </InputLabel>
                <Select
                  labelId="edit-task-type-label"
                  value={
                    selectedTask.taskType ||
                    (selectedTask._isTeamTask
                      ? 'team'
                      : selectedTask._isDevTask
                        ? 'development'
                        : selectedTask._projectId
                          ? 'projects'
                          : 'partner')
                  }
                  label="Type"
                  onChange={(e) => {
                    const type = e.target.value;
                    setSelectedTask((prev) => {
                      if (!prev) return prev;
                      const base = {
                        ...prev,
                        taskType: type,
                        _isTeamTask: type === 'team',
                        _isDevTask: type === 'development',
                        _devPage:
                          type === 'development'
                            ? prev._devPage || Object.keys(DEV_TASK_PAGE_LABELS)[0]
                            : undefined,
                        _projectId: type === 'projects' ? prev._projectId || '' : undefined,
                      };
                      if (type === 'team') {
                        return {
                          ...base,
                          partnerId: '__team__',
                          partnerName: 'Internal Team',
                          partnerTeam: 'Internal',
                        };
                      }
                      if (type === 'development') {
                        return {
                          ...base,
                          partnerId: '',
                          partnerName: '',
                          _devPage: base._devPage || Object.keys(DEV_TASK_PAGE_LABELS)[0],
                        };
                      }
                      if (type === 'projects') {
                        const proj = projects[0];
                        return {
                          ...base,
                          _projectId: proj?.id || '',
                          partnerId: proj?.partnerId || '',
                          partnerName: proj?.partnerName || proj?.partner?.name || '',
                        };
                      }
                      const p = partners[0];
                      return { ...base, partnerId: p?.id || '', partnerName: p?.name || '' };
                    });
                  }}
                  sx={{ fontSize: '0.9375rem' }}
                >
                  {TASK_TYPE_OPTIONS.filter((o) => o.value !== 'development' || devMode).map(
                    (opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    )
                  )}
                </Select>
              </FormControl>
            )}
            {selectedTask.isNew &&
              (selectedTask.taskType ||
                (selectedTask._isTeamTask
                  ? 'team'
                  : selectedTask._isDevTask
                    ? 'development'
                    : selectedTask._projectId
                      ? 'projects'
                      : 'partner')) === 'partner' && (
                <FormControl
                  fullWidth
                  size="small"
                  required
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                  <InputLabel shrink id="edit-task-partner-label">
                    Partner
                  </InputLabel>
                  <Select
                    labelId="edit-task-partner-label"
                    value={selectedTask.partnerId || ''}
                    label="Partner"
                    onChange={(e) => {
                      const p = partners.find((x) => x.id === e.target.value);
                      setSelectedTask((prev) =>
                        prev
                          ? { ...prev, partnerId: e.target.value, partnerName: p?.name || '' }
                          : prev
                      );
                    }}
                    sx={{ fontSize: '0.9375rem' }}
                  >
                    {partners.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            {selectedTask.isNew &&
              (selectedTask.taskType || (selectedTask._projectId ? 'projects' : '')) ===
                'projects' && (
                <FormControl
                  fullWidth
                  size="small"
                  required
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                  <InputLabel shrink id="edit-task-project-label">
                    Project
                  </InputLabel>
                  <Select
                    labelId="edit-task-project-label"
                    value={selectedTask._projectId || ''}
                    label="Project"
                    onChange={(e) => {
                      const proj = projects.find((x) => x.id === e.target.value);
                      setSelectedTask((prev) =>
                        prev
                          ? {
                              ...prev,
                              _projectId: e.target.value,
                              partnerId: proj?.partnerId || '',
                              partnerName: proj?.partnerName || proj?.partner?.name || '',
                            }
                          : prev
                      );
                    }}
                    sx={{ fontSize: '0.9375rem' }}
                  >
                    {projects.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            {selectedTask.isNew &&
              (selectedTask.taskType || (selectedTask._isDevTask ? 'development' : '')) ===
                'development' &&
              devMode && (
                <FormControl
                  fullWidth
                  size="small"
                  required
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                >
                  <InputLabel shrink id="edit-task-dev-page-label">
                    Page
                  </InputLabel>
                  <Select
                    labelId="edit-task-dev-page-label"
                    value={selectedTask._devPage || Object.keys(DEV_TASK_PAGE_LABELS)[0] || ''}
                    label="Page"
                    onChange={(e) =>
                      setSelectedTask((prev) =>
                        prev ? { ...prev, _devPage: e.target.value } : prev
                      )
                    }
                    sx={{ fontSize: '0.9375rem' }}
                  >
                    {Object.entries(DEV_TASK_PAGE_LABELS).map(([path, label]) => (
                      <MenuItem key={path} value={path}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            <TextField
              label="Task Title"
              fullWidth
              value={selectedTask.title || ''}
              onChange={(e) => handleTaskFieldChange('title', e.target.value)}
              variant="outlined"
              size="small"
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem' },
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                    <AppIcon name="Assignment" fallback={AssignmentIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              <FormControl
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                <InputLabel
                  shrink
                  id="edit-task-priority-label"
                  sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  Priority
                </InputLabel>
                <Select
                  labelId="edit-task-priority-label"
                  value={selectedTask.priority || 'medium'}
                  label="Priority"
                  onChange={(e) => handleTaskFieldChange('priority', e.target.value)}
                  displayEmpty
                  sx={{ fontSize: '0.9375rem' }}
                  renderValue={(value) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AppIcon
                        name="FlagOutlined"
                        fallback={FlagOutlinedIcon}
                        sx={{ fontSize: 17, color: 'text.secondary' }}
                      />
                      <span>
                        {(value || 'medium').charAt(0).toUpperCase() + (value || 'medium').slice(1)}
                      </span>
                    </Box>
                  )}
                >
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Deadline"
                type="date"
                fullWidth
                size="small"
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                value={selectedTask.deadline || ''}
                onChange={(e) => handleTaskFieldChange('deadline', e.target.value)}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon
                        name="CalendarToday"
                        fallback={CalendarTodayIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              <TextField
                label="Assigned To"
                fullWidth
                size="small"
                value={selectedTask.assignedTo || ''}
                onChange={(e) => handleTaskFieldChange('assignedTo', e.target.value)}
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon
                        name="PersonOutline"
                        fallback={PersonOutlineIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Estimate"
                fullWidth
                size="small"
                value={selectedTask.estimate || ''}
                onChange={(e) => handleTaskFieldChange('estimate', e.target.value)}
                placeholder="e.g. 2d"
                InputLabelProps={{
                  shrink: true,
                  sx: { fontSize: '0.8125rem', fontWeight: 600 },
                }}
                InputProps={{
                  sx: { fontSize: '0.9375rem' },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon name="Schedule" fallback={ScheduleIcon} sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            {/* ── Agent Assignment ────────────────────────── */}
            <Box
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: selectedTask.agentId ? alpha(theme.palette.info.main, 0.3) : 'divider',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1,
                  bgcolor: selectedTask.agentId
                    ? alpha(theme.palette.info.main, 0.04)
                    : 'transparent',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AppIcon
                    name="SmartToyOutlined"
                    fallback={SmartToyOutlinedIcon}
                    sx={{
                      fontSize: 18,
                      color: selectedTask.agentId ? 'info.main' : 'text.secondary',
                    }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                    Assign Agent
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={!!selectedTask.agentId}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const first = hubAgents[0];
                      handleTaskFieldChange('agentId', first?.id || '');
                    } else {
                      handleTaskFieldChange('agentId', null);
                    }
                  }}
                  color="info"
                />
              </Box>
              <Collapse in={!!selectedTask.agentId}>
                <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
                  {hubAgents.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      No agents available - add agents in Agent Hub first.
                    </Typography>
                  ) : (
                    <FormControl
                      fullWidth
                      size="small"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    >
                      <InputLabel
                        shrink
                        id="edit-task-agent-label"
                        sx={{ fontSize: '0.8125rem', fontWeight: 600 }}
                      >
                        Agent
                      </InputLabel>
                      <Select
                        labelId="edit-task-agent-label"
                        value={selectedTask.agentId || ''}
                        label="Agent"
                        onChange={(e) => handleTaskFieldChange('agentId', e.target.value)}
                        sx={{ fontSize: '0.9375rem' }}
                        renderValue={(val) => {
                          const ag = hubAgents.find((a) => a.id === val);
                          if (!ag) return val;
                          return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <AppIcon
                                name="SmartToyOutlined"
                                fallback={SmartToyOutlinedIcon}
                                sx={{ fontSize: 16, color: 'info.main' }}
                              />
                              <span>{ag.role || ag.agent_id}</span>
                            </Box>
                          );
                        }}
                      >
                        {hubAgents.map((ag) => (
                          <MenuItem key={ag.id} value={ag.id}>
                            <Box
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}
                            >
                              <AppIcon
                                name="SmartToyOutlined"
                                fallback={SmartToyOutlinedIcon}
                                sx={{ fontSize: 16, color: 'info.main' }}
                              />
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 600, lineHeight: 1.2 }}
                                >
                                  {ag.role || ag.agent_id}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                                >
                                  {ag.connection_type?.toUpperCase()} ·{' '}
                                  {(ag.capabilities || []).slice(0, 2).join(', ') ||
                                    'No capabilities'}
                                </Typography>
                              </Box>
                              <Chip
                                size="small"
                                label={ag.availability_status || 'available'}
                                color={
                                  ag.availability_status === 'available'
                                    ? 'success'
                                    : ag.availability_status === 'busy'
                                      ? 'warning'
                                      : 'default'
                                }
                                variant="outlined"
                                sx={{
                                  height: 18,
                                  fontSize: '0.6rem',
                                  fontWeight: 600,
                                  textTransform: 'capitalize',
                                  borderRadius: 1,
                                }}
                              />
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Box>
              </Collapse>
            </Box>

            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={4}
              size="small"
              value={selectedTask.description || ''}
              onChange={(e) => handleTaskFieldChange('description', e.target.value)}
              InputLabelProps={{ shrink: true, sx: { fontSize: '0.8125rem', fontWeight: 600 } }}
              InputProps={{
                sx: { fontSize: '0.9375rem', py: 1.25 },
                startAdornment: (
                  <InputAdornment
                    position="start"
                    sx={{ color: 'text.secondary', alignSelf: 'flex-start', mt: 1.5, mr: 0 }}
                  >
                    <AppIcon
                      name="NotesOutlined"
                      fallback={NotesOutlinedIcon}
                      sx={{ fontSize: 18 }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* ── AI Output (deliverable) ─────────────────── */}
            {selectedTask.data?.output && (
              <Box
                sx={{
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.success.main, 0.25),
                  bgcolor: alpha(theme.palette.success.main, 0.03),
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <AppIcon
                    name="AutoAwesomeOutlined"
                    fallback={AutoAwesomeOutlinedIcon}
                    sx={{ fontSize: 18, color: 'success.main' }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    AI Output
                  </Typography>
                  {selectedTask.data?.llmModel && (
                    <Chip
                      label={`${selectedTask.data.llmProvider || ''}/${selectedTask.data.llmModel}`}
                      size="small"
                      sx={{ fontSize: 11, height: 20 }}
                    />
                  )}
                  {selectedTask.data?.llmCost > 0 && (
                    <Chip
                      label={`$${selectedTask.data.llmCost.toFixed(4)}`}
                      size="small"
                      color="success"
                      variant="outlined"
                      sx={{ fontSize: 11, height: 20 }}
                    />
                  )}
                </Box>
                <Box
                  sx={{
                    maxHeight: 400,
                    overflow: 'auto',
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.background.default, 0.6),
                    whiteSpace: 'pre-wrap',
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                  }}
                >
                  {selectedTask.data.output}
                </Box>
                {selectedTask.data?.executedAt && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1, display: 'block' }}
                  >
                    Executed: {new Date(selectedTask.data.executedAt).toLocaleString()}
                    {selectedTask.data.llmDurationMs
                      ? ` (${(selectedTask.data.llmDurationMs / 1000).toFixed(1)}s)`
                      : ''}
                  </Typography>
                )}
              </Box>
            )}

            {/* ── Related: Job Pool ─────────────────────────── */}
            {selectedTask.jobPoolId && (
              <Box
                sx={{
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.info.main, 0.2),
                  bgcolor: alpha(theme.palette.info.main, 0.03),
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <AppIcon
                    name="LinkOutlined"
                    fallback={LinkOutlinedIcon}
                    sx={{ fontSize: 18, color: 'info.main' }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'info.main' }}>
                    Related
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    icon={
                      <AppIcon
                        name="WorkOutline"
                        fallback={WorkOutlineIcon}
                        sx={{ fontSize: '14px !important' }}
                      />
                    }
                    label={`Job: ${selectedTask.jobPoolId}`}
                    variant="outlined"
                    color="info"
                    size="small"
                    onClick={() => navigate('/job-pool')}
                    sx={{ fontWeight: 600, cursor: 'pointer', borderRadius: 1.5 }}
                  />
                  {selectedTask.category && (
                    <Chip
                      label={selectedTask.category}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.info.main, 0.1),
                        color: 'info.main',
                      }}
                    />
                  )}
                  {selectedTask.agentId && (
                    <Chip
                      icon={
                        <AppIcon
                          name="SmartToyOutlined"
                          fallback={SmartToyOutlinedIcon}
                          sx={{ fontSize: '14px !important' }}
                        />
                      }
                      label={`Agent: ${selectedTask.agentId}`}
                      variant="outlined"
                      size="small"
                      sx={{ fontWeight: 600, borderRadius: 1.5 }}
                    />
                  )}
                </Box>
              </Box>
            )}

            {/* ── File Attachments ────────────────────────── */}
            <Box
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.15),
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1.25,
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderBottom: '1px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.1),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AppIcon
                    name="AttachFile"
                    fallback={AttachFileIcon}
                    sx={{ fontSize: 18, color: 'primary.main' }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                    Attachments
                  </Typography>
                  {(selectedTask.attachments || []).length > 0 && (
                    <Chip
                      label={(selectedTask.attachments || []).length}
                      size="small"
                      sx={{
                        height: 20,
                        minWidth: 20,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                      }}
                    />
                  )}
                </Box>
                <Button
                  component="label"
                  size="small"
                  variant="outlined"
                  startIcon={
                    <AppIcon
                      name="CloudUploadOutlined"
                      fallback={CloudUploadOutlinedIcon}
                      sx={{ fontSize: '16px !important' }}
                    />
                  }
                  disabled={fileUploading}
                  sx={{
                    borderRadius: 1.5,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    px: 1.5,
                  }}
                >
                  {fileUploading ? 'Uploading…' : 'Upload'}
                  <input type="file" hidden multiple onChange={handleFileUpload} />
                </Button>
              </Box>

              <Box sx={{ px: 2, py: 1.5 }}>
                {fileUploading && <LinearProgress sx={{ mb: 1.5, borderRadius: 1 }} />}

                {fileError && (
                  <Alert
                    severity="error"
                    onClose={() => setFileError('')}
                    sx={{ mb: 1.5, borderRadius: 1.5, fontSize: '0.8rem' }}
                  >
                    {fileError}
                  </Alert>
                )}

                {(selectedTask.attachments || []).length > 0 ? (
                  <Stack spacing={0.75}>
                    {(selectedTask.attachments || []).map((att) => (
                      <Box
                        key={att.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1.5,
                          py: 1,
                          borderRadius: 1.5,
                          bgcolor: alpha(theme.palette.primary.main, 0.03),
                          border: '1px solid',
                          borderColor: 'divider',
                          '&:hover .att-actions': { opacity: 1 },
                        }}
                      >
                        <AppIcon
                          name="InsertDriveFileOutlined"
                          fallback={InsertDriveFileOutlinedIcon}
                          sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.4 }}
                            noWrap
                          >
                            {att.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
                          >
                            {formatFileSize(att.size)} ·{' '}
                            {new Date(att.uploadedAt).toLocaleDateString()}
                          </Typography>
                        </Box>
                        <Box
                          className="att-actions"
                          sx={{
                            display: 'flex',
                            gap: 0.25,
                            opacity: 0,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          <Tooltip title="Download">
                            <IconButton
                              size="small"
                              onClick={() => handleFileDownload(att)}
                              sx={{ p: 0.5 }}
                            >
                              <AppIcon
                                name="DownloadOutlined"
                                fallback={DownloadOutlinedIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove">
                            <IconButton
                              size="small"
                              onClick={() => handleFileRemove(att)}
                              sx={{ p: 0.5, '&:hover': { color: 'error.main' } }}
                            >
                              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Box
                    component="label"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 2.5,
                      borderRadius: 2,
                      border: '2px dashed',
                      borderColor: alpha(theme.palette.primary.main, 0.2),
                      bgcolor: alpha(theme.palette.primary.main, 0.02),
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      '&:hover': {
                        borderColor: alpha(theme.palette.primary.main, 0.4),
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                      },
                    }}
                  >
                    <AppIcon
                      name="CloudUploadOutlined"
                      fallback={CloudUploadOutlinedIcon}
                      sx={{ fontSize: 28, color: 'text.disabled', mb: 0.5 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary', fontSize: '0.8rem', fontWeight: 500 }}
                    >
                      Drop files here or click to upload
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.disabled', fontSize: '0.7rem', mt: 0.25 }}
                    >
                      Max 10 MB per file
                    </Typography>
                    <input type="file" hidden multiple onChange={handleFileUpload} />
                  </Box>
                )}
              </Box>
            </Box>

            {/* ── Git Information ────────────────────────── */}
            <Box
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.15),
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1.25,
                  bgcolor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.05),
                  borderBottom: '1px solid',
                  borderColor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.1),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AppIcon
                    name="GitHub"
                    fallback={GitHubIcon}
                    sx={{ fontSize: 18, color: isDark ? '#E6EDF3' : '#24292F' }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                    Git Commits
                  </Typography>
                  {(selectedTask.gitCommits || []).length > 0 && (
                    <Chip
                      label={(selectedTask.gitCommits || []).length}
                      size="small"
                      sx={{
                        height: 20,
                        minWidth: 20,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        bgcolor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.1),
                      }}
                    />
                  )}
                </Box>
              </Box>

              <Box sx={{ px: 2, py: 1.5 }}>
                {/* Existing commits list */}
                {(selectedTask.gitCommits || []).length > 0 && (
                  <Stack spacing={0.75} sx={{ mb: 1.5 }}>
                    {(selectedTask.gitCommits || []).map((gc) => (
                      <Box
                        key={gc.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 1,
                          px: 1.5,
                          py: 1,
                          borderRadius: 1.5,
                          bgcolor: alpha(isDark ? '#E6EDF3' : '#24292F', 0.03),
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1,
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <AppIcon
                            name="Commit"
                            fallback={CommitIcon}
                            sx={{
                              fontSize: 16,
                              color: 'text.secondary',
                              mt: 0.25,
                              flexShrink: 0,
                            }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.4 }}
                              noWrap
                            >
                              {gc.message || 'No message'}
                            </Typography>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                flexWrap: 'wrap',
                                mt: 0.25,
                              }}
                            >
                              {gc.sha && (
                                <Tooltip title={copiedGitSha === gc.sha ? 'Copied!' : 'Copy SHA'}>
                                  <Chip
                                    label={gc.sha.slice(0, 7)}
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleCopyGitSha(gc.sha)}
                                    icon={
                                      <AppIcon
                                        name="ContentCopy"
                                        fallback={ContentCopyIcon}
                                        sx={{ fontSize: '12px !important' }}
                                      />
                                    }
                                    sx={{
                                      height: 20,
                                      fontSize: '0.65rem',
                                      fontFamily: 'monospace',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  />
                                </Tooltip>
                              )}
                              {gc.branch && (
                                <Chip
                                  label={gc.branch}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    color: theme.palette.primary.main,
                                  }}
                                />
                              )}
                              {gc.url && (
                                <Tooltip title="Open on GitHub">
                                  <IconButton
                                    size="small"
                                    component="a"
                                    href={gc.url}
                                    target="_blank"
                                    rel="noopener"
                                    sx={{ p: 0.25 }}
                                  >
                                    <AppIcon
                                      name="OpenInNew"
                                      fallback={OpenInNewIcon}
                                      sx={{ fontSize: 14 }}
                                    />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </Box>
                        </Box>
                        <Tooltip title="Remove commit">
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveGitCommit(gc.id)}
                            sx={{ p: 0.25, mt: 0.25 }}
                          >
                            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </Stack>
                )}

                {/* Add new commit form */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <TextField
                    placeholder="Commit SHA"
                    size="small"
                    value={gitCommitDraft.sha}
                    onChange={(e) => setGitCommitDraft((d) => ({ ...d, sha: e.target.value }))}
                    InputProps={{
                      sx: { fontSize: '0.8125rem', fontFamily: 'monospace' },
                    }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                  />
                  <TextField
                    placeholder="Branch"
                    size="small"
                    value={gitCommitDraft.branch}
                    onChange={(e) => setGitCommitDraft((d) => ({ ...d, branch: e.target.value }))}
                    InputProps={{ sx: { fontSize: '0.8125rem' } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                  />
                </Box>
                <TextField
                  placeholder="Commit message"
                  size="small"
                  fullWidth
                  value={gitCommitDraft.message}
                  onChange={(e) => setGitCommitDraft((d) => ({ ...d, message: e.target.value }))}
                  InputProps={{ sx: { fontSize: '0.8125rem' } }}
                  sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                  <TextField
                    placeholder="Commit URL (optional)"
                    size="small"
                    fullWidth
                    value={gitCommitDraft.url}
                    onChange={(e) => setGitCommitDraft((d) => ({ ...d, url: e.target.value }))}
                    InputProps={{ sx: { fontSize: '0.8125rem' } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleAddGitCommit}
                    disabled={!gitCommitDraft.sha.trim() && !gitCommitDraft.message.trim()}
                    sx={{
                      minWidth: 36,
                      px: 1,
                      borderRadius: 1.5,
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      textTransform: 'none',
                      flexShrink: 0,
                    }}
                    startIcon={
                      <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: '16px !important' }} />
                    }
                  >
                    Add
                  </Button>
                </Box>
              </Box>
            </Box>

            {!selectedTask.isNew && (
              <Box
                sx={{
                  pt: 2,
                  px: 2,
                  pb: 2,
                  borderRadius: 2,
                  bgcolor: selectedTask._isDevTask
                    ? alpha('#F59E0B', 0.04)
                    : alpha(theme.palette.primary.main, 0.04),
                  border: '1px solid',
                  borderColor: selectedTask._isDevTask
                    ? alpha('#F59E0B', 0.2)
                    : alpha(theme.palette.primary.main, 0.12),
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}
                    >
                      <Box
                        component="span"
                        sx={{ fontWeight: 600, color: 'text.primary', mr: 0.5 }}
                      >
                        ID:
                      </Box>
                      {selectedTask.taskId || selectedTask.id}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}
                    >
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 600,
                          color: selectedTask._isDevTask ? '#F59E0B' : 'text.primary',
                          mr: 0.5,
                        }}
                      >
                        {selectedTask._isDevTask
                          ? 'Category:'
                          : selectedTask._isTeamTask
                            ? 'Assignee:'
                            : 'Partner:'}
                      </Box>
                      {selectedTask._isDevTask
                        ? 'Developer'
                        : selectedTask._isTeamTask
                          ? selectedTask.assignedTo || 'Unassigned'
                          : selectedTask.partnerName}
                    </Typography>
                    {selectedTask._isDevTask && selectedTask._devPage && (
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}
                      >
                        <Box component="span" sx={{ fontWeight: 600, color: '#F59E0B', mr: 0.5 }}>
                          Page:
                        </Box>
                        {getDevPageLabel(selectedTask._devPage)}
                      </Typography>
                    )}
                    {selectedTask.agentId &&
                      (() => {
                        const ag = hubAgents.find((a) => a.id === selectedTask.agentId);
                        return (
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8125rem',
                              color: 'text.secondary',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <AppIcon
                              name="SmartToyOutlined"
                              fallback={SmartToyOutlinedIcon}
                              sx={{ fontSize: 14, color: 'info.main' }}
                            />
                            <Box
                              component="span"
                              sx={{ fontWeight: 600, color: 'info.main', mr: 0.5 }}
                            >
                              Agent:
                            </Box>
                            {ag?.role || ag?.agent_id || selectedTask.agentId}
                          </Typography>
                        );
                      })()}
                  </Stack>
                  <EntityInfoBadge
                    createdAt={selectedTask.createdAt}
                    updatedAt={selectedTask.updatedAt}
                    createdBy={selectedTask.createdBy}
                  />
                </Box>
              </Box>
            )}
          </Stack>
        </FormDialog>
      )}
    </>
  );

  if (embedded) {
    return (
      <Box
        sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {toolbarAndContent}
      </Box>
    );
  }
  return (
    <PageLayout
      title="Tasks"
      subtitle={
        taskScope === 'team'
          ? 'Manage internal team tasks for your users.'
          : 'Manage and track all partner tasks in one place.'
      }
      showTitleBlock={false}
    >
      <BentoCard
        title="Tasks"
        pageInfoPath="/task-manager"
        titleWithAction
        subtitle={
          showMetrics ? (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {taskOverview.map((item) => (
                <Chip
                  key={item.label}
                  label={`${item.label}: ${item.value}`}
                  size="small"
                  sx={{
                    height: 24,
                    borderRadius: 1.5,
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    bgcolor: item.bg,
                    color: item.color,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.9),
                  }}
                />
              ))}
            </Stack>
          ) : undefined
        }
        icon={AssignmentIcon}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {toolbarAndContent}
      </BentoCard>
      {/* ===== Activity Log Dialog ===== */}
      <FormDialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        title="Tasks Activity"
        subtitle="Task action history"
        icon={HistoryIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '80vh' }}
        contentDividers={false}
        contentSx={{ p: 0 }}
        actions={
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ flex: 1 }}
            >{`${activityLogs.length} log entr${activityLogs.length !== 1 ? 'ies' : 'y'}`}</Typography>
            <Button
              onClick={closeActivityLog}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Close
            </Button>
          </>
        }
        footerJustify="flex-start"
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
              Actions like creating, editing, and completing tasks will appear here.
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
    </PageLayout>
  );
}
