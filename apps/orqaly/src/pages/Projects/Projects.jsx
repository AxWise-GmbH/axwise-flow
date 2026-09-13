import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Button,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Alert,
  Collapse,
  CircularProgress,
  useTheme,
  alpha,
  Autocomplete,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Stack,
  Divider,
  Popover,
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SortIcon from '@mui/icons-material/Sort';
import TuneIcon from '@mui/icons-material/Tune';
import HistoryIcon from '@mui/icons-material/History';
import CasinoIcon from '@mui/icons-material/Casino';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import CategoryIcon from '@mui/icons-material/Category';
import CheckIcon from '@mui/icons-material/Check';
import PageLayout from '../../components/Common/PageLayout';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import CloseIcon from '@mui/icons-material/Close';
import TimelineIcon from '@mui/icons-material/Timeline';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import EmptyState from '../../components/Common/EmptyState';
import ProjectsArt from '../../components/illustrations/pages/ProjectsArt';
import { useProjects } from '../../hooks/useProjects';
import { usePartners } from '../../hooks/usePartners';
import { useAuth } from '../../context/AuthContext';
import { getAllWorkflows, getWorkflowById } from '../../services/workflowService';
import { logAction, loadAuditLogs, buildAgentMeta } from '../../services/auditLogBackend';
import { PROJECT_STATUSES_LIST } from '../../services/projectService';
import { getAgents } from '../../services/agentHubService';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import WorkflowNode from '../Workflow/visual/WorkflowNode';

import AppIcon from '../../components/icons/AppIcon';

const workflowNodeTypes = { workflow: WorkflowNode };

const STATUS_COLORS = {
  Active: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  Paused: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  Completed: { bg: '#DBEAFE', color: '#2563EB', border: '#BFDBFE' },
  Archived: { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' },
};

const STATUS_COLORS_DARK = {
  Active: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  Paused: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  Completed: { bg: 'rgba(59,130,246,0.1)', color: '#60A5FA', border: 'rgba(59,130,246,0.2)' },
  Archived: { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
};

const CATEGORY_ICONS = {
  Gambling: CasinoIcon,
  'E-Commerce': ShoppingCartOutlinedIcon,
  Travel: FlightTakeoffIcon,
};
function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || LabelOutlinedIcon;
}

const COLUMNS = [
  { id: 'name', label: 'Project', sortKey: 'name', minWidth: 200 },
  { id: 'categories', label: 'Categories', sortKey: 'category', minWidth: 130, align: 'center' },
  { id: 'status', label: 'Status', sortKey: 'status', minWidth: 100, align: 'center' },
  { id: 'partner', label: 'Partner', sortKey: 'partnerName', minWidth: 150 },
  { id: 'team', label: 'Team', sortKey: 'teamName', minWidth: 120 },
  { id: 'workflow', label: 'Workflow', sortKey: 'workflowName', minWidth: 170 },
  { id: 'campaign', label: 'Campaign', sortKey: 'campaignName', minWidth: 150 },
  { id: 'agents', label: 'Agents', minWidth: 160 },
  { id: 'updated', label: 'Last Updated', sortKey: 'updatedAt', minWidth: 130, align: 'center' },
  { id: 'actions', label: '', minWidth: 90, align: 'right' },
];

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

// ── Empty initial form ────────────────────────────────────────
const EMPTY_FORM = {
  name: '',
  description: '',
  status: 'Active',
  category: null,
  partnerId: null,
  partnerName: '',
  workflowId: null,
  workflowName: '',
  campaignId: null,
  campaignName: '',
  teamId: null,
  teamName: '',
  agentIds: [],
  notes: '',
};

/** Styled section header inside the dialog */
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

export default function Projects() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDark = theme.palette.mode === 'dark';
  const {
    projects,
    loading,
    error,
    addProject,
    editProject,
    removeProject,
    refetch: refetchProjects,
  } = useProjects();
  const { partners: allPartners } = usePartners();
  const { user } = useAuth();

  // Only show active (non-archived) partners with a valid name in dropdowns
  const partners = useMemo(
    () => allPartners.filter((p) => !p.isArchived && (p.name || p.information?.name)),
    [allPartners]
  );

  // Workflows loaded separately
  const [workflows, setWorkflows] = useState([]);
  useEffect(() => {
    getAllWorkflows()
      .then(setWorkflows)
      .catch(() => {});
  }, []);

  // Hub agents for agent assignment
  const hubAgents = useMemo(() => getAgents(), [projects]);

  // Table state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [partnerFilter, setPartnerFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [workflowFilter, setWorkflowFilter] = useState('All');
  const [campaignFilter, setCampaignFilter] = useState('All');
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('updatedAt');

  const VIEW_MODE_KEY = 'orch_projects_view';
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_MODE_KEY);
      return v === 'list' ? 'list' : 'card';
    } catch {
      return 'card';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null); // null = create mode
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [projectSaving, setProjectSaving] = useState(false);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Workflow preview state
  const [wfPreview, setWfPreview] = useState({
    open: false,
    workflow: null,
    nodes: [],
    edges: [],
    loading: false,
  });

  // Change Log state
  const [changeLogDialog, setChangeLogDialog] = useState({ open: false, project: null });
  const [changeLogs, setChangeLogs] = useState([]);
  const [changeLogsLoading, setChangeLogsLoading] = useState(false);

  /* ---- Page Activity Log Dialog ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const [showMetrics, setShowMetrics] = useShowMetrics('projects');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [categoriesAnchorEl, setCategoriesAnchorEl] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const CATEGORIES_EXTRA_KEY = 'orch_project_categories_extra';
  const [extraCategories, setExtraCategories] = useState(() => {
    try {
      const raw = localStorage.getItem(CATEGORIES_EXTRA_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const openWorkflowPreview = useCallback(async (workflowId, workflowName) => {
    setWfPreview({
      open: true,
      workflow: { id: workflowId, name: workflowName },
      nodes: [],
      edges: [],
      loading: true,
    });
    try {
      const wf = await getWorkflowById(workflowId);
      if (wf) {
        const nodes = (Array.isArray(wf.nodes) ? wf.nodes : []).map((n, i) => ({
          ...n,
          position: n.position || { x: (i * 220) % 400, y: Math.floor(i / 2) * 120 },
          draggable: false,
        }));
        const edges = Array.isArray(wf.edges) ? wf.edges : [];
        setWfPreview((prev) => ({ ...prev, workflow: wf, nodes, edges, loading: false }));
      } else {
        setWfPreview((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setWfPreview((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  /* ── Change Log helpers ─────────────────────────────────────── */
  const logProjectAction = useCallback(async (action, projectId, details, agentContext = null) => {
    try {
      await logAction({
        action,
        entity: 'Project',
        entityId: projectId,
        details,
        meta: {
          source: 'projectsPage',
          importance: 'medium',
          tags: ['project', action.toLowerCase().replace(/\s+/g, '-')],
          ...buildAgentMeta(agentContext),
        },
      });
    } catch (_) {
      // Don't fail the main operation
    }
  }, []);

  const openChangeLog = useCallback(async (project) => {
    setChangeLogDialog({ open: true, project });
    setChangeLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter(
        (log) => log.entity === 'Project' && log.entityId === project.id
      );
      setChangeLogs(filtered);
    } catch (_) {
      setChangeLogs([]);
    } finally {
      setChangeLogsLoading(false);
    }
  }, []);

  const closeChangeLog = useCallback(() => {
    setChangeLogDialog({ open: false, project: null });
    setChangeLogs([]);
  }, []);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Project');
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

  const getActionChipColor = (action) => {
    const a = (action || '').toLowerCase();
    if (a.includes('created') || a.includes('create')) return 'success';
    if (a.includes('deleted') || a.includes('delete')) return 'error';
    if (a.includes('status') && (a.includes('active') || a.includes('enabled'))) return 'success';
    if (a.includes('status') && (a.includes('paused') || a.includes('archived'))) return 'warning';
    if (a.includes('updated') || a.includes('edited') || a.includes('changed')) return 'info';
    return 'default';
  };

  const getIpFromLog = (log) => {
    const s = log.detailsStructured;
    return s?.network?.ip || '-';
  };

  const getUserFromLog = (log) => {
    if (log.user && log.user !== '-') return log.user;
    return user?.email || '-';
  };

  // Unique options for filter dropdowns (from current projects + partners/workflows)
  const partnerFilterOptions = useMemo(() => partners, [partners]);
  const teamFilterOptions = useMemo(() => {
    const seen = new Set();
    return projects
      .filter((p) => p.teamId && p.teamName)
      .filter((p) => {
        if (seen.has(p.teamId)) return false;
        seen.add(p.teamId);
        return true;
      })
      .map((p) => ({ id: p.teamId, name: p.teamName }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [projects]);
  const workflowFilterOptions = useMemo(() => workflows || [], [workflows]);
  const campaignFilterOptions = useMemo(() => {
    const seen = new Set();
    return projects
      .filter((p) => p.campaignId || p.campaignName)
      .filter((p) => {
        const key = p.campaignId || p.campaignName || '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((p) => ({
        id: p.campaignId || p.campaignName,
        name: p.campaignName || p.campaignId || '-',
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [projects]);

  const existingCategories = useMemo(() => {
    const set = new Set();
    projects.forEach((p) => {
      const c = (p.category && String(p.category).trim()) || null;
      if (c) set.add(c);
    });
    extraCategories.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects, extraCategories]);

  // ── Derived data ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...projects];
    if (statusFilter !== 'All') {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (categoryFilter !== 'All') {
      list = list.filter((p) => (p.category || '') === categoryFilter);
    }
    if (partnerFilter !== 'All') {
      list = list.filter((p) => p.partnerId === partnerFilter);
    }
    if (teamFilter !== 'All') {
      list = list.filter((p) => p.teamId === teamFilter);
    }
    if (workflowFilter !== 'All') {
      list = list.filter((p) => p.workflowId === workflowFilter);
    }
    if (campaignFilter !== 'All') {
      list = list.filter((p) => (p.campaignId || p.campaignName) === campaignFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.partnerName || '').toLowerCase().includes(q) ||
          (p.workflowName || '').toLowerCase().includes(q) ||
          (p.campaignName || '').toLowerCase().includes(q) ||
          (p.teamName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [
    projects,
    search,
    statusFilter,
    categoryFilter,
    partnerFilter,
    teamFilter,
    workflowFilter,
    campaignFilter,
  ]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[orderBy] || '';
      const valB = b[orderBy] || '';
      if (valB < valA) return order === 'desc' ? -1 : 1;
      if (valB > valA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [filtered, order, orderBy]);

  const projectsPagination = usePagination(sorted, {
    surfaceId: `projects.${viewMode}`,
    defaultRowsPerPage: 10,
    resetOn: [
      search,
      statusFilter,
      categoryFilter,
      partnerFilter,
      teamFilter,
      workflowFilter,
      campaignFilter,
      viewMode,
    ],
  });
  const paginated = projectsPagination.paginatedData;

  // ── Partner's campaigns for the selected partner ────────────
  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === form.partnerId) || null,
    [partners, form.partnerId]
  );

  const partnerCampaigns = useMemo(() => {
    if (!selectedPartner) return [];
    // Gather campaigns from all teams
    const teams = selectedPartner.teams || [];
    const allCamps = teams.flatMap((t) =>
      (t.campaigns?.items || []).map((c) => ({ ...c, teamId: t.id, teamName: t.name }))
    );
    // Also partner-level campaigns
    const partnerCamps = (selectedPartner.campaigns?.items || selectedPartner.campaigns || []).map(
      (c) => ({
        ...c,
        teamId: null,
        teamName: '',
      })
    );
    // Deduplicate by id
    const map = new Map();
    [...allCamps, ...partnerCamps].forEach((c) => {
      if (c.id && !map.has(c.id)) map.set(c.id, c);
    });
    return Array.from(map.values());
  }, [selectedPartner]);

  const partnerTeams = useMemo(() => {
    if (!selectedPartner) return [];
    return selectedPartner.teams || [];
  }, [selectedPartner]);

  // ── Handlers ────────────────────────────────────────────────
  const handleSort = (sortKey) => {
    if (!sortKey) return;
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const openCreateDialog = () => {
    setEditingProject(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const handleDeleteCategory = useCallback(
    async (categoryName) => {
      const toUpdate = projects.filter((p) => (p.category || '').trim() === categoryName);
      setDeletingCategory(categoryName);
      try {
        for (const p of toUpdate) {
          await editProject(p.id, { category: null });
        }
        setExtraCategories((prev) => {
          const next = prev.filter((c) => c !== categoryName);
          try {
            localStorage.setItem(CATEGORIES_EXTRA_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
        setCategoriesAnchorEl(null);
        await refetchProjects();
      } finally {
        setDeletingCategory(null);
      }
    },
    [projects, editProject, refetchProjects]
  );

  const handleAddCategory = useCallback(() => {
    const name = (newCategoryName && String(newCategoryName).trim()) || '';
    if (!name) return;
    const exists = existingCategories.some((c) => c.toLowerCase() === name.toLowerCase());
    if (exists) return;
    setExtraCategories((prev) => {
      const next = [...prev, name].sort((a, b) => a.localeCompare(b));
      try {
        localStorage.setItem(CATEGORIES_EXTRA_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setNewCategoryName('');
  }, [newCategoryName, existingCategories]);

  const handleEditCategory = useCallback(
    async (oldName, newName) => {
      const name = (newName && String(newName).trim()) || '';
      if (!name || name === oldName) {
        setEditingCategory(null);
        return;
      }
      const toUpdate = projects.filter((p) => (p.category || '').trim() === oldName);
      try {
        for (const p of toUpdate) {
          await editProject(p.id, { category: name });
        }
        setExtraCategories((prev) => {
          const next = prev
            .map((c) => (c === oldName ? name : c))
            .filter((c, i, a) => a.indexOf(c) === i)
            .sort((a, b) => a.localeCompare(b));
          try {
            localStorage.setItem(CATEGORIES_EXTRA_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
        setEditingCategory(null);
        await refetchProjects();
      } catch (err) {
        console.error('Failed to rename category:', err);
      }
    },
    [projects, editProject, refetchProjects]
  );

  const openEditDialog = (project) => {
    setEditingProject(project);
    setForm({
      name: project.name || '',
      description: project.description || '',
      status: project.status || 'Active',
      category: project.category || null,
      partnerId: project.partnerId || null,
      partnerName: project.partnerName || '',
      workflowId: project.workflowId || null,
      workflowName: project.workflowName || '',
      campaignId: project.campaignId || null,
      campaignName: project.campaignName || '',
      teamId: project.teamId || null,
      teamName: project.teamName || '',
      agentIds: Array.isArray(project.agentIds) ? project.agentIds : [],
      notes: project.notes || '',
    });
    setDialogOpen(true);
  };

  // Pre-fill search from ?search=<name> (e.g. clicking project chip from Partners page)
  const appliedSearchRef = useRef(false);
  useEffect(() => {
    const term = searchParams.get('search');
    if (!term || appliedSearchRef.current) return;
    appliedSearchRef.current = true;
    setSearch(term);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleSave = async () => {
    if (!form.name.trim() || projectSaving) return;
    setProjectSaving(true);
    try {
      if (editingProject) {
        // Build a diff of what changed
        const changes = [];
        if (form.name !== editingProject.name)
          changes.push(`name: "${editingProject.name}" → "${form.name}"`);
        if (form.status !== editingProject.status)
          changes.push(`status: ${editingProject.status} → ${form.status}`);
        if (form.partnerName !== (editingProject.partnerName || ''))
          changes.push(
            `partner: "${editingProject.partnerName || '-'}" → "${form.partnerName || '-'}"`
          );
        if (form.workflowName !== (editingProject.workflowName || ''))
          changes.push(
            `workflow: "${editingProject.workflowName || '-'}" → "${form.workflowName || '-'}"`
          );
        if (form.campaignName !== (editingProject.campaignName || ''))
          changes.push(
            `campaign: "${editingProject.campaignName || '-'}" → "${form.campaignName || '-'}"`
          );
        if (form.teamName !== (editingProject.teamName || ''))
          changes.push(`team: "${editingProject.teamName || '-'}" → "${form.teamName || '-'}"`);
        if (form.description !== (editingProject.description || ''))
          changes.push('description updated');
        if (form.notes !== (editingProject.notes || '')) changes.push('notes updated');
        if ((form.category || null) !== (editingProject.category || null))
          changes.push(`category: "${editingProject.category || '-'}" → "${form.category || '-'}"`);

        await editProject(editingProject.id, form);
        const detail =
          changes.length > 0
            ? `Updated "${form.name}": ${changes.join('; ')}`
            : `Opened and saved "${form.name}" (no changes)`;
        logProjectAction('Project updated', editingProject.id, detail);
      } else {
        const result = await addProject(form);
        const newId = result?.id || form.name;
        logProjectAction(
          'Project created',
          newId,
          `Created project "${form.name}" - status: ${form.status}, partner: ${form.partnerName || '-'}, workflow: ${form.workflowName || '-'}`
        );
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save project:', err);
    } finally {
      setProjectSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      await removeProject(deleteConfirm.id);
      logProjectAction(
        'Project deleted',
        deleteConfirm.id,
        `Deleted project "${deleteConfirm.name || 'Untitled'}"`
      );
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
    setDeleteConfirm(null);
  };

  // ── Stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === 'Active').length;
    const paused = projects.filter((p) => p.status === 'Paused').length;
    const completed = projects.filter((p) => p.status === 'Completed').length;
    const archived = projects.filter((p) => p.status === 'Archived').length;
    return { total, active, paused, completed, archived };
  }, [projects]);

  // Stat cards (Permissions/Notifications style)
  const statCards = [
    {
      label: 'Total Projects',
      value: stats.total,
      helper: 'All automation campaigns',
      color: theme.palette.primary.main,
      icon: FolderOutlinedIcon,
    },
    {
      label: 'Active',
      value: stats.active,
      helper: 'Currently running',
      color: theme.palette.success.main,
      icon: PlayCircleOutlineIcon,
    },
    {
      label: 'Paused',
      value: stats.paused,
      helper: 'Temporarily stopped',
      color: theme.palette.warning.main,
      icon: PauseCircleOutlineIcon,
    },
    {
      label: 'Completed',
      value: stats.completed,
      helper: 'Finished campaigns',
      color: theme.palette.primary.main,
      icon: CheckCircleOutlineIcon,
    },
    {
      label: 'Archived',
      value: stats.archived,
      helper: 'Archived projects',
      color: theme.palette.grey[500],
      icon: ArchiveOutlinedIcon,
    },
  ];

  // ── Loading / Error ─────────────────────────────────────────
  if (loading) return <LoadingSpinner message="Loading projects..." />;
  if (error) return <Alert severity="error">Failed to load projects: {error}</Alert>;

  const statusColors = isDark ? STATUS_COLORS_DARK : STATUS_COLORS;

  return (
    <PageLayout
      title="Projects"
      subtitle="Track and manage all your automation campaigns across different workflows."
      showTitleBlock={false}
    >
      <BentoCard
        title="Projects"
        subtitle={showMetrics ? `${stats.total} projects across workflows` : undefined}
        icon={FolderOutlinedIcon}
        noPadding
        plainHeader
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* Stat cards - same style as Permissions/Notifications */}
        <Collapse in={showMetrics}>
          <Box sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}>
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(3, minmax(0, 1fr))',
                  lg: 'repeat(5, minmax(0, 1fr))',
                },
              }}
            >
              {statCards.map((card) => {
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

        <Box sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* ── Toolbar: filter icon (opens popover with search + status) + New Project ── */}
          <Box
            sx={{
              p: 1.5,
              mb: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Tooltip
              title="Filters: search, category, status, partner, team, workflow, campaign"
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
                    <AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 22 }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      Filters
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block' }}
                    >
                      Search, category, status, partner, team, workflow, campaign
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
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
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
                  Category
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={categoryFilter}
                    label="Category"
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
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
                      All Categories
                    </MenuItem>
                    {existingCategories.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
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
                    {PROJECT_STATUSES_LIST.map((s) => (
                      <MenuItem key={s} value={s}>
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
                  Partner
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Partner</InputLabel>
                  <Select
                    value={partnerFilter}
                    label="Partner"
                    onChange={(e) => {
                      setPartnerFilter(e.target.value);
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
                      All Partners
                    </MenuItem>
                    {partnerFilterOptions.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name || p.information?.name || p.id}
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
                  Team
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Team</InputLabel>
                  <Select
                    value={teamFilter}
                    label="Team"
                    onChange={(e) => {
                      setTeamFilter(e.target.value);
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
                      All Teams
                    </MenuItem>
                    {teamFilterOptions.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name}
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
                  Workflow
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
                  <InputLabel>Workflow</InputLabel>
                  <Select
                    value={workflowFilter}
                    label="Workflow"
                    onChange={(e) => {
                      setWorkflowFilter(e.target.value);
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
                      All Workflows
                    </MenuItem>
                    {workflowFilterOptions.map((w) => (
                      <MenuItem key={w.id} value={w.id}>
                        {w.name || w.id}
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
                  Campaign
                </Typography>
                <FormControl size="small" fullWidth sx={{ borderRadius: 2 }}>
                  <InputLabel>Campaign</InputLabel>
                  <Select
                    value={campaignFilter}
                    label="Campaign"
                    onChange={(e) => {
                      setCampaignFilter(e.target.value);
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
                      All Campaigns
                    </MenuItem>
                    {campaignFilterOptions.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Divider />
              <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
                <Button
                  size="small"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('All');
                    setCategoryFilter('All');
                    setPartnerFilter('All');
                    setTeamFilter('All');
                    setWorkflowFilter('All');
                    setCampaignFilter('All');
                    setFilterAnchorEl(null);
                  }}
                  sx={{ textTransform: 'none', fontWeight: 600, color: 'primary.main' }}
                >
                  Reset filters
                </Button>
              </Box>
            </Popover>

            <Box sx={{ flex: 1 }} />

            <Tooltip title="Manage categories - delete from here only" placement="bottom" arrow>
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
            <Button
              variant="outlined"
              size="small"
              onClick={openCreateDialog}
              aria-label="New"
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, minWidth: 0, px: 1 }}
            >
              <AppIcon name="Add" fallback={AddIcon} />
            </Button>
            <Popover
              open={Boolean(categoriesAnchorEl)}
              anchorEl={categoriesAnchorEl}
              onClose={() => {
                setCategoriesAnchorEl(null);
                setEditingCategory(null);
                setNewCategoryName('');
              }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1.5,
                    p: 0,
                    borderRadius: 3,
                    minWidth: 280,
                    maxWidth: 360,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                  },
                },
              }}
            >
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  Categories
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Add here or when creating a project. Edit or delete from this list.
                </Typography>
              </Box>
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <TextField
                    size="small"
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                    sx={{ flex: 1, '& .MuiInputBase-root': { borderRadius: 2 } }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, minWidth: 56 }}
                  >
                    Add
                  </Button>
                </Box>
              </Box>
              <Box sx={{ py: 1, maxHeight: 320, overflowY: 'auto' }}>
                {existingCategories.length === 0 ? (
                  <Typography variant="body2" sx={{ px: 2, py: 2, color: 'text.secondary' }}>
                    No categories yet. Add one above or when creating a project.
                  </Typography>
                ) : (
                  existingCategories.map((cat) => {
                    const Icon = getCategoryIcon(cat);
                    const count = projects.filter((p) => (p.category || '').trim() === cat).length;
                    const isDeleting = deletingCategory === cat;
                    const isEditing = editingCategory === cat;
                    return (
                      <Box
                        key={cat}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 2,
                          py: 1.25,
                          '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.08) },
                        }}
                      >
                        <AppIcon
                          fallback={Icon}
                          sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0 }}
                        />
                        {isEditing ? (
                          <>
                            <TextField
                              size="small"
                              value={editingCategoryValue}
                              onChange={(e) => setEditingCategoryValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter')
                                  handleEditCategory(cat, editingCategoryValue);
                                if (e.key === 'Escape') setEditingCategory(null);
                              }}
                              autoFocus
                              sx={{
                                flex: 1,
                                '& .MuiInputBase-root': { borderRadius: 2, fontSize: '0.875rem' },
                              }}
                            />
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleEditCategory(cat, editingCategoryValue)}
                              aria-label="Save"
                            >
                              <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setEditingCategory(null)}
                              aria-label="Cancel"
                            >
                              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
                            </IconButton>
                          </>
                        ) : (
                          <>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {cat}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {count} project{count !== 1 ? 's' : ''}
                              </Typography>
                            </Box>
                            <Tooltip title="Rename category" arrow>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setEditingCategory(cat);
                                  setEditingCategoryValue(cat);
                                }}
                                aria-label={`Edit category ${cat}`}
                              >
                                <AppIcon
                                  name="EditOutlined"
                                  fallback={EditOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove this category from all projects" arrow>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={isDeleting}
                                onClick={() => handleDeleteCategory(cat)}
                                aria-label={`Delete category ${cat}`}
                              >
                                {isDeleting ? (
                                  <CircularProgress size={18} />
                                ) : (
                                  <AppIcon
                                    name="DeleteOutline"
                                    fallback={DeleteOutlineIcon}
                                    sx={{ fontSize: 18 }}
                                  />
                                )}
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Popover>
          </Box>

          {filtered.length === 0 ? (
            <Box sx={{ p: 4 }}>
              <EmptyState
                illustration={ProjectsArt}
                title="No projects found"
                description={
                  search ||
                  statusFilter !== 'All' ||
                  categoryFilter !== 'All' ||
                  partnerFilter !== 'All' ||
                  teamFilter !== 'All' ||
                  workflowFilter !== 'All' ||
                  campaignFilter !== 'All'
                    ? 'Try adjusting your filters or search query.'
                    : 'Create your first project to get started.'
                }
                actionLabel="New"
                onAction={openCreateDialog}
              />
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  mb: 1.5,
                  flexWrap: 'wrap',
                }}
              >
                <Typography
                  variant="overline"
                  sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em' }}
                >
                  Project list
                </Typography>
              </Box>

              {viewMode === 'card' ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                    gap: 1.5,
                    mb: 2,
                  }}
                >
                  {paginated.map((project) => {
                    const CategoryIconComp = getCategoryIcon(project.category);
                    return (
                      <Paper
                        key={project.id}
                        elevation={0}
                        onClick={() => openEditDialog(project)}
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: theme.palette.background.paper,
                          cursor: 'pointer',
                          transition: 'border-color 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            borderColor: theme.palette.primary.main,
                            boxShadow: createHoverGlowShadow(theme),
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: isDark
                                ? alpha(theme.palette.primary.main, 0.12)
                                : alpha(theme.palette.primary.main, 0.08),
                              flexShrink: 0,
                            }}
                          >
                            <AppIcon
                              name="FolderOutlined"
                              fallback={FolderOutlinedIcon}
                              sx={{ fontSize: 18, color: 'primary.main' }}
                            />
                          </Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                            {project.name}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Categories
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                              {project.category ? (
                                <>
                                  <CategoryIconComp
                                    sx={{ fontSize: 18, color: 'text.secondary' }}
                                  />
                                  <Typography variant="body2">{project.category}</Typography>
                                </>
                              ) : (
                                <Typography variant="body2" color="text.disabled">
                                  -
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Partner
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.25 }}>
                              {project.partnerName || '-'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Team
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.25 }}>
                              {project.teamName || '-'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Workflow
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.25 }}>
                              {project.workflowName || '-'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Campaign
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.25 }}>
                              {project.campaignName || '-'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              Agents
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                              {(() => {
                                const ids = project.agentIds || [];
                                if (ids.length === 0)
                                  return (
                                    <Typography variant="body2" color="text.disabled">
                                      -
                                    </Typography>
                                  );
                                const matched = ids
                                  .map((aid) => hubAgents.find((a) => a.id === aid))
                                  .filter(Boolean);
                                return matched
                                  .slice(0, 3)
                                  .map((a) => (
                                    <Chip
                                      key={a.id}
                                      size="small"
                                      icon={
                                        <AppIcon
                                          name="SmartToyOutlined"
                                          fallback={SmartToyOutlinedIcon}
                                          sx={{ fontSize: '14px !important' }}
                                        />
                                      }
                                      label={a.role || a.agent_id}
                                      variant="outlined"
                                      sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1.5 }}
                                    />
                                  ));
                              })()}
                              {(project.agentIds || []).length > 3 && (
                                <Chip
                                  size="small"
                                  label={`+${(project.agentIds || []).length - 3}`}
                                  sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1.5 }}
                                />
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              ) : null}
              {viewMode === 'card' && (
                <Pagination
                  count={projectsPagination.totalCount}
                  page={projectsPagination.page}
                  rowsPerPage={projectsPagination.rowsPerPage}
                  rowsPerPageOptions={projectsPagination.rowsPerPageOptions}
                  onPageChange={projectsPagination.setPage}
                  onRowsPerPageChange={projectsPagination.setRowsPerPage}
                  onLoadAll={projectsPagination.loadAll}
                  onCollapseAll={projectsPagination.collapseAll}
                  allMode={projectsPagination.allMode}
                  label="projects"
                />
              )}
              {viewMode === 'list' && (
                <>
                  <TableContainer sx={{ maxHeight: 'calc(100vh - 350px)', flex: 1 }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow>
                          {COLUMNS.map((col) => (
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
                        {paginated.map((project) => {
                          const sc = statusColors[project.status] || statusColors.Active;
                          return (
                            <TableRow
                              key={project.id}
                              hover
                              sx={{
                                cursor: 'pointer',
                                '&:last-child td': { borderBottom: 0 },
                              }}
                              onClick={() => openEditDialog(project)}
                            >
                              {/* Project Name */}
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                  <Box
                                    sx={{
                                      width: 36,
                                      height: 36,
                                      borderRadius: 2,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      bgcolor: isDark
                                        ? alpha(theme.palette.primary.main, 0.12)
                                        : alpha(theme.palette.primary.main, 0.08),
                                      flexShrink: 0,
                                    }}
                                  >
                                    <AppIcon
                                      name="FolderOutlined"
                                      fallback={FolderOutlinedIcon}
                                      sx={{ fontSize: 18, color: 'primary.main' }}
                                    />
                                  </Box>
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: 600,
                                        lineHeight: 1.3,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: 220,
                                      }}
                                    >
                                      {project.name}
                                    </Typography>
                                    {project.description && (
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          color: 'text.secondary',
                                          lineHeight: 1.2,
                                          display: 'block',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          maxWidth: 220,
                                        }}
                                      >
                                        {project.description}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              </TableCell>
                              {/* Categories */}
                              <TableCell align="center">
                                {project.category ? (
                                  <Tooltip title={project.category}>
                                    <Box
                                      sx={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                      }}
                                    >
                                      {(() => {
                                        const Icon = getCategoryIcon(project.category);
                                        return (
                                          <AppIcon
                                            fallback={Icon}
                                            sx={{ fontSize: 20, color: 'text.secondary' }}
                                          />
                                        );
                                      })()}
                                      <Typography
                                        variant="caption"
                                        sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                                      >
                                        {project.category}
                                      </Typography>
                                    </Box>
                                  </Tooltip>
                                ) : (
                                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                    -
                                  </Typography>
                                )}
                              </TableCell>
                              {/* Status */}
                              <TableCell align="center">
                                <Chip
                                  label={project.status}
                                  size="small"
                                  sx={{
                                    height: 24,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    bgcolor: sc.bg,
                                    color: sc.color,
                                  }}
                                />
                              </TableCell>
                              {/* Partner */}
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <AppIcon
                                    name="PersonOutline"
                                    fallback={PersonOutlineIcon}
                                    sx={{ fontSize: 16, color: 'text.secondary' }}
                                  />
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 500, fontSize: '0.8rem' }}
                                  >
                                    {project.partnerName || '-'}
                                  </Typography>
                                </Box>
                              </TableCell>
                              {/* Team */}
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <AppIcon
                                    name="GroupsOutlined"
                                    fallback={GroupsOutlinedIcon}
                                    sx={{ fontSize: 16, color: 'text.secondary' }}
                                  />
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      fontSize: '0.8rem',
                                      color: project.teamName ? 'text.primary' : 'text.disabled',
                                    }}
                                  >
                                    {project.teamName || '-'}
                                  </Typography>
                                </Box>
                              </TableCell>
                              {/* Workflow */}
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                {project.workflowId ? (
                                  <Chip
                                    icon={
                                      <AppIcon
                                        name="AccountTreeOutlined"
                                        fallback={AccountTreeOutlinedIcon}
                                        sx={{ fontSize: '15px !important' }}
                                      />
                                    }
                                    label={project.workflowName || 'Workflow'}
                                    size="small"
                                    clickable
                                    onClick={() =>
                                      openWorkflowPreview(project.workflowId, project.workflowName)
                                    }
                                    sx={{
                                      maxWidth: 180,
                                      height: 28,
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      bgcolor: isDark
                                        ? alpha(theme.palette.primary.main, 0.1)
                                        : alpha(theme.palette.primary.main, 0.06),
                                      color: 'primary.main',
                                      border: '1px solid',
                                      borderColor: isDark
                                        ? alpha(theme.palette.primary.main, 0.2)
                                        : alpha(theme.palette.primary.main, 0.15),
                                      '&:hover': {
                                        bgcolor: isDark
                                          ? alpha(theme.palette.primary.main, 0.18)
                                          : alpha(theme.palette.primary.main, 0.12),
                                      },
                                      '& .MuiChip-label': {
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      },
                                    }}
                                  />
                                ) : (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <AppIcon
                                      name="AccountTreeOutlined"
                                      fallback={AccountTreeOutlinedIcon}
                                      sx={{ fontSize: 16, color: 'text.disabled' }}
                                    />
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: 500,
                                        fontSize: '0.8rem',
                                        color: 'text.disabled',
                                      }}
                                    >
                                      -
                                    </Typography>
                                  </Box>
                                )}
                              </TableCell>
                              {/* Campaign */}
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <AppIcon
                                    name="CampaignOutlined"
                                    fallback={CampaignOutlinedIcon}
                                    sx={{ fontSize: 16, color: 'text.secondary' }}
                                  />
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 500,
                                      fontSize: '0.8rem',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: 140,
                                    }}
                                  >
                                    {project.campaignName || '-'}
                                  </Typography>
                                </Box>
                              </TableCell>
                              {/* Agents */}
                              <TableCell>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  {(() => {
                                    const ids = project.agentIds || [];
                                    if (ids.length === 0)
                                      return (
                                        <Typography variant="caption" color="text.disabled">
                                          -
                                        </Typography>
                                      );
                                    const matched = ids
                                      .map((aid) => hubAgents.find((a) => a.id === aid))
                                      .filter(Boolean);
                                    return (
                                      <>
                                        {matched.slice(0, 3).map((a) => (
                                          <Chip
                                            key={a.id}
                                            size="small"
                                            icon={
                                              <AppIcon
                                                name="SmartToyOutlined"
                                                fallback={SmartToyOutlinedIcon}
                                                sx={{ fontSize: '14px !important' }}
                                              />
                                            }
                                            label={a.role || a.agent_id}
                                            variant="outlined"
                                            sx={{
                                              height: 22,
                                              fontSize: '0.68rem',
                                              maxWidth: 110,
                                              borderRadius: 1.5,
                                            }}
                                          />
                                        ))}
                                        {matched.length > 3 && (
                                          <Chip
                                            size="small"
                                            label={`+${matched.length - 3}`}
                                            sx={{
                                              height: 22,
                                              fontSize: '0.68rem',
                                              borderRadius: 1.5,
                                            }}
                                          />
                                        )}
                                      </>
                                    );
                                  })()}
                                </Box>
                              </TableCell>
                              {/* Last Updated */}
                              <TableCell align="center">
                                <Tooltip title={formatDate(project.updatedAt)}>
                                  <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 500, color: 'text.secondary' }}
                                  >
                                    {formatRelative(project.updatedAt)}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                              {/* Actions */}
                              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                  <Tooltip title="Edit project">
                                    <IconButton
                                      size="small"
                                      onClick={() => openEditDialog(project)}
                                    >
                                      <AppIcon
                                        name="EditOutlined"
                                        fallback={EditOutlinedIcon}
                                        sx={{ fontSize: 18 }}
                                      />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete project">
                                    <IconButton
                                      size="small"
                                      onClick={() => setDeleteConfirm(project)}
                                      sx={{ color: 'error.main' }}
                                    >
                                      <AppIcon
                                        name="DeleteOutline"
                                        fallback={DeleteOutlineIcon}
                                        sx={{ fontSize: 18 }}
                                      />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Log">
                                    <IconButton
                                      size="small"
                                      onClick={() => openChangeLog(project)}
                                      sx={{ color: 'primary.main' }}
                                    >
                                      <AppIcon
                                        name="History"
                                        fallback={HistoryIcon}
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
                    count={projectsPagination.totalCount}
                    page={projectsPagination.page}
                    rowsPerPage={projectsPagination.rowsPerPage}
                    rowsPerPageOptions={projectsPagination.rowsPerPageOptions}
                    onPageChange={projectsPagination.setPage}
                    onRowsPerPageChange={projectsPagination.setRowsPerPage}
                    onLoadAll={projectsPagination.loadAll}
                    onCollapseAll={projectsPagination.collapseAll}
                    allMode={projectsPagination.allMode}
                    label="projects"
                  />
                </>
              )}
            </>
          )}
        </Box>
      </BentoCard>
      {/* ── Create / Edit Dialog ───────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        {/* Header */}
        <Box
          sx={{
            bgcolor: alpha(theme.palette.primary.main, isDark ? 0.08 : 0.04),
            px: 3,
            pt: 3,
            pb: 2,
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
                bgcolor: alpha(theme.palette.primary.main, isDark ? 0.15 : 0.1),
              }}
            >
              <AppIcon
                name="FolderOutlined"
                fallback={FolderOutlinedIcon}
                sx={{ fontSize: 22, color: 'primary.main' }}
              />
            </Box>
            <Box>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}
              >
                {editingProject ? 'Edit Project' : 'New'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {editingProject
                  ? 'Update project details and connections'
                  : 'Connect a partner, workflow, and campaign'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          {/* ── Section: Project Info ─────────────────── */}
          <SectionLabel
            icon={<AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} />}
            label="Project Info"
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2.5 }}>
            <TextField
              label="Project Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              size="small"
              required
              autoFocus
              placeholder="e.g. FB Lead Gen - Brazil"
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="Brief project description..."
            />
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {PROJECT_STATUSES_LIST.map((s) => {
                const sc = statusColors[s] || {};
                const selected = form.status === s;
                return (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    onClick={() => setForm((f) => ({ ...f, status: s }))}
                    sx={{
                      height: 28,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      bgcolor: selected ? sc.bg : 'transparent',
                      color: selected ? sc.color : 'text.secondary',
                      border: '1.5px solid',
                      borderColor: selected ? sc.color : 'divider',
                      transition: 'all 0.15s',
                      '&:hover': { bgcolor: sc.bg, color: sc.color, borderColor: sc.color },
                    }}
                  />
                );
              })}
            </Box>
            <Autocomplete
              size="small"
              freeSolo
              options={existingCategories}
              value={form.category || ''}
              onChange={(e, newVal) =>
                setForm((f) => ({ ...f, category: (newVal && String(newVal).trim()) || null }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Category"
                  placeholder="Select existing or type a new category"
                />
              )}
              sx={{ mt: 0.5, '& .MuiInputBase-root': { borderRadius: 2 } }}
            />
          </Box>

          <Divider sx={{ mb: 2.5 }} />

          {/* ── Section: Connections ──────────────────── */}
          <SectionLabel
            icon={<AppIcon name="PersonOutline" fallback={PersonOutlineIcon} />}
            label="Partner & Team"
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2.5 }}>
            <Autocomplete
              size="small"
              options={partners}
              getOptionLabel={(opt) => opt.name || opt.information?.name || ''}
              value={partners.find((p) => p.id === form.partnerId) || null}
              onChange={(e, newVal) => {
                setForm((f) => ({
                  ...f,
                  partnerId: newVal?.id || null,
                  partnerName: newVal?.name || newVal?.information?.name || '',
                  teamId: null,
                  teamName: '',
                  campaignId: null,
                  campaignName: '',
                }));
              }}
              renderInput={(params) => (
                <TextField {...params} label="Partner" placeholder="Select partner..." />
              )}
              isOptionEqualToValue={(opt, val) => opt.id === val?.id}
            />
            {partnerTeams.length > 0 && (
              <Autocomplete
                size="small"
                options={partnerTeams}
                getOptionLabel={(opt) => opt.name || ''}
                value={partnerTeams.find((t) => t.id === form.teamId) || null}
                onChange={(e, newVal) => {
                  setForm((f) => ({
                    ...f,
                    teamId: newVal?.id || null,
                    teamName: newVal?.name || '',
                  }));
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Team" placeholder="Select team..." />
                )}
                isOptionEqualToValue={(opt, val) => opt.id === val?.id}
              />
            )}
          </Box>

          <Divider sx={{ mb: 2.5 }} />

          <SectionLabel
            icon={<AppIcon name="AccountTreeOutlined" fallback={AccountTreeOutlinedIcon} />}
            label="Workflow & Campaign"
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2.5 }}>
            <Autocomplete
              size="small"
              options={workflows}
              getOptionLabel={(opt) => opt.name || ''}
              value={workflows.find((w) => w.id === form.workflowId) || null}
              onChange={(e, newVal) => {
                setForm((f) => ({
                  ...f,
                  workflowId: newVal?.id || null,
                  workflowName: newVal?.name || '',
                }));
              }}
              renderInput={(params) => (
                <TextField {...params} label="Workflow" placeholder="Select workflow..." />
              )}
              isOptionEqualToValue={(opt, val) => opt.id === val?.id}
            />
            {partnerCampaigns.length > 0 ? (
              <Autocomplete
                size="small"
                options={partnerCampaigns}
                getOptionLabel={(opt) =>
                  `${opt.name || opt.id}${opt.teamName ? ` (${opt.teamName})` : ''}`
                }
                value={partnerCampaigns.find((c) => c.id === form.campaignId) || null}
                onChange={(e, newVal) => {
                  setForm((f) => ({
                    ...f,
                    campaignId: newVal?.id || null,
                    campaignName: newVal?.name || newVal?.id || '',
                  }));
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Campaign" placeholder="Select campaign..." />
                )}
                isOptionEqualToValue={(opt, val) => opt.id === val?.id}
              />
            ) : (
              <TextField
                label="Campaign Name"
                value={form.campaignName}
                onChange={(e) => setForm((f) => ({ ...f, campaignName: e.target.value }))}
                fullWidth
                size="small"
                placeholder="Type campaign name..."
                helperText={
                  form.partnerId
                    ? 'No campaigns found for this partner'
                    : 'Select a partner or type campaign name'
                }
              />
            )}
          </Box>

          <Divider sx={{ mb: 2.5 }} />

          {/* ── Section: Agents ──────────────────────── */}
          <SectionLabel
            icon={<AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />}
            label="Agents"
          />
          <Autocomplete
            multiple
            size="small"
            options={hubAgents}
            value={hubAgents.filter((a) => (form.agentIds || []).includes(a.id))}
            onChange={(_, newVal) => setForm((f) => ({ ...f, agentIds: newVal.map((a) => a.id) }))}
            getOptionLabel={(opt) => opt.role || opt.agent_id || opt.id}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            renderOption={(props, opt) => {
              const { key, ...rest } = props;
              return (
                <Box
                  component="li"
                  key={key}
                  {...rest}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <AppIcon
                    name="SmartToyOutlined"
                    fallback={SmartToyOutlinedIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {opt.role || opt.agent_id}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {opt.connection_type?.toUpperCase()} ·{' '}
                      {(opt.capabilities || []).slice(0, 3).join(', ') || 'No capabilities'}
                    </Typography>
                  </Box>
                </Box>
              );
            }}
            renderTags={(value, getTagProps) =>
              value.map((opt, idx) => {
                const { key, ...rest } = getTagProps({ index: idx });
                return (
                  <Chip
                    key={key}
                    {...rest}
                    size="small"
                    icon={
                      <AppIcon
                        name="SmartToyOutlined"
                        fallback={SmartToyOutlinedIcon}
                        sx={{ fontSize: '14px !important' }}
                      />
                    }
                    label={opt.role || opt.agent_id}
                    sx={{ borderRadius: 1.5, fontWeight: 600, fontSize: '0.75rem' }}
                  />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={
                  form.agentIds?.length ? '' : 'Select agents to work on this project...'
                }
              />
            )}
            noOptionsText="No agents available - add agents in Agent Hub"
            sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          <Divider sx={{ mb: 2.5 }} />

          {/* ── Section: Notes ───────────────────────── */}
          <SectionLabel
            icon={<AppIcon name="NotesOutlined" fallback={NotesOutlinedIcon} />}
            label="Notes"
          />
          <TextField
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            fullWidth
            size="small"
            multiline
            rows={3}
            placeholder="Add any additional notes..."
            sx={{ mb: 1 }}
          />
        </DialogContent>

        <DialogActions
          sx={{ px: 3, py: 2, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}
        >
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              color: 'text.secondary',
            }}
          >
            Cancel
          </Button>
          {editingProject && (
            <Button
              variant="outlined"
              color="info"
              size="small"
              startIcon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 16 }} />}
              onClick={() => openChangeLog(editingProject)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
            >
              Log
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.name.trim() || projectSaving}
            startIcon={projectSaving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 4 }}
          >
            {projectSaving ? 'Saving...' : editingProject ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Delete Confirmation Dialog ─────────────────────── */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <Box sx={{ bgcolor: alpha(theme.palette.error.main, 0.06), px: 3, pt: 3, pb: 1.5 }}>
          <DialogTitle sx={{ p: 0, fontWeight: 700, fontSize: '1.1rem' }}>
            Delete project?
          </DialogTitle>
        </Box>
        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <DialogContentText sx={{ color: 'text.primary', fontSize: '0.9rem' }}>
            Are you sure you want to delete <strong>"{deleteConfirm?.name || 'Untitled'}"</strong>?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setDeleteConfirm(null)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Delete Project
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Workflow Preview Dialog ────────────────────────── */}
      <Dialog
        open={wfPreview.open}
        onClose={() =>
          setWfPreview({ open: false, workflow: null, nodes: [], edges: [], loading: false })
        }
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            height: '80vh',
            maxHeight: 720,
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: isDark
              ? alpha(theme.palette.primary.main, 0.06)
              : alpha(theme.palette.primary.main, 0.03),
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(theme.palette.primary.main, isDark ? 0.15 : 0.1),
            }}
          >
            <AppIcon
              name="AccountTreeOutlined"
              fallback={AccountTreeOutlinedIcon}
              sx={{ fontSize: 20, color: 'primary.main' }}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {wfPreview.workflow?.name || 'Workflow Preview'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Read-only preview of the workflow structure
            </Typography>
          </Box>
          {wfPreview.workflow?.id && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setWfPreview({ open: false, workflow: null, nodes: [], edges: [], loading: false });
                navigate('/workflow');
              }}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, mr: 1 }}
            >
              Open in Editor
            </Button>
          )}
          <IconButton
            size="small"
            onClick={() =>
              setWfPreview({ open: false, workflow: null, nodes: [], edges: [], loading: false })
            }
          >
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* Canvas */}
        <Box sx={{ flex: 1, position: 'relative', bgcolor: theme.palette.background.default }}>
          {wfPreview.loading ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}
            >
              <LoadingSpinner message="Loading workflow..." />
            </Box>
          ) : wfPreview.nodes.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 1,
              }}
            >
              <AppIcon
                name="AccountTreeOutlined"
                fallback={AccountTreeOutlinedIcon}
                sx={{ fontSize: 48, color: 'text.disabled' }}
              />
              <Typography variant="body2" color="text.secondary">
                This workflow has no blocks yet
              </Typography>
            </Box>
          ) : (
            <ReactFlowProvider>
              <ReactFlow
                nodes={wfPreview.nodes}
                edges={wfPreview.edges}
                nodeTypes={workflowNodeTypes}
                defaultEdgeOptions={{ type: 'smoothstep', style: { strokeWidth: 2 } }}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                preventScrolling={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={16} size={1} color={theme.palette.divider} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
          )}
        </Box>

        {/* Footer info */}
        {wfPreview.workflow && !wfPreview.loading && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 3,
              py: 1.5,
              borderTop: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
            }}
          >
            <Chip
              label={wfPreview.workflow.enabled !== false ? 'Enabled' : 'Disabled'}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor:
                  wfPreview.workflow.enabled !== false
                    ? isDark
                      ? alpha('#4ade80', 0.15)
                      : '#D1FAE5'
                    : isDark
                      ? alpha('#f87171', 0.15)
                      : '#FEE2E2',
                color:
                  wfPreview.workflow.enabled !== false
                    ? isDark
                      ? '#4ade80'
                      : '#059669'
                    : isDark
                      ? '#f87171'
                      : '#DC2626',
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {wfPreview.nodes.length} block{wfPreview.nodes.length !== 1 ? 's' : ''}
              {wfPreview.edges.length > 0 &&
                ` · ${wfPreview.edges.length} connection${wfPreview.edges.length !== 1 ? 's' : ''}`}
            </Typography>
            {wfPreview.workflow.landingPageUrl && (
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 300,
                }}
              >
                Landing: {wfPreview.workflow.landingPageUrl}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              onClick={() =>
                setWfPreview({ open: false, workflow: null, nodes: [], edges: [], loading: false })
              }
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              Close
            </Button>
          </Box>
        )}
      </Dialog>
      {/* ── Change Log Dialog ─────────────────────────────── */}
      <Dialog
        open={changeLogDialog.open}
        onClose={closeChangeLog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            maxHeight: '80vh',
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            py: 2,
            borderBottom: '2px solid',
            borderColor: 'divider',
            bgcolor: isDark
              ? alpha(theme.palette.primary.main, 0.06)
              : alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <AppIcon
            name="History"
            fallback={HistoryIcon}
            sx={{ color: 'primary.main', fontSize: 24 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
              Change Log
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {changeLogDialog.project?.name || 'Project'} - Change history
            </Typography>
          </Box>
          <Chip
            label={`${changeLogs.length} entries`}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.72rem',
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main',
            }}
          />
          <IconButton size="small" onClick={closeChangeLog} sx={{ p: 0.5 }}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        <DialogContent sx={{ p: 0 }}>
          {changeLogsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                Loading change log...
              </Typography>
            </Box>
          ) : changeLogs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
              <AppIcon
                name="History"
                fallback={HistoryIcon}
                sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
                No changes recorded yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Actions like creating, editing, changing status, and deleting this project will
                appear here.
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 480 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {['Action', 'User', 'IP Address', 'Date & Time', 'Details'].map((header) => (
                      <TableCell
                        key={header}
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
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {changeLogs.map((log) => (
                    <TableRow key={log.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ py: 1.25 }}>
                        <Chip
                          label={log.action}
                          size="small"
                          color={getActionChipColor(log.action)}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.68rem',
                            borderRadius: 1.5,
                            height: 24,
                          }}
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
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Showing {changeLogs.length} log entries for this project
          </Typography>
          <Button
            onClick={closeChangeLog}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {/* ===== Activity Log Dialog ===== */}
      <Dialog
        open={activityLogOpen}
        onClose={closeActivityLog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '80vh' } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            py: 2,
            borderBottom: 'none',
            bgcolor: isDark
              ? alpha(theme.palette.primary.main, 0.06)
              : alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <AppIcon
            name="History"
            fallback={HistoryIcon}
            sx={{ color: 'primary.main', fontSize: 24 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
              Projects Activity
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Project action history
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeActivityLog} sx={{ p: 0.5 }}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
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
        <DialogContent sx={{ p: 0 }}>
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
                Actions like creating, editing, and deleting projects will appear here.
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
                          color={getActionChipColor(log.action)}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.68rem',
                            borderRadius: 1.5,
                            height: 24,
                          }}
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
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
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
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
