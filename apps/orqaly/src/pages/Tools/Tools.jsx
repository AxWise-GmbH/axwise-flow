import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
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
  ToggleButtonGroup,
  ToggleButton,
  Autocomplete,
  Tabs,
  Tab,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LaunchIcon from '@mui/icons-material/Launch';
import CategoryIcon from '@mui/icons-material/Category';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import TimelineIcon from '@mui/icons-material/Timeline';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import MetricsToggleButton from '../../components/Common/MetricsToggleButton';
import { useShowMetrics } from '../../hooks/useShowMetrics';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { cardGridColumns } from '../../utils/cardGridColumns';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import EmptyState from '../../components/Common/EmptyState';
import { useTools } from '../../hooks/useTools';
import { useAuth } from '../../context/AuthContext';
import { logAction, loadAuditLogs, buildAgentMeta } from '../../services/auditLogBackend';
import { TOOL_STATUSES_LIST, TOOL_CONNECTION_TYPES } from '../../services/toolService';
import {
  testToolConnection,
  executeTool as executeToolApi,
  getExecutionHistory,
} from '../../services/toolExecutionService';
import Pagination from '../../components/Common/Pagination';
import usePagination from '../../hooks/usePagination';
import McpToolDetail from '../../components/Tools/McpToolDetail';
import ToolIcon from '../../components/icons/ToolIcon';
import { getMcpAppById } from '../../config/mcpToolCatalog';
import { fetchComposioConnections } from '../../services/composioService';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import { loadPredefinedTools } from '../../services/predefinedToolService';

import AppIcon from '../../components/icons/AppIcon';

// ── Status colors ─────────────────────────────────────────────
const STATUS_COLORS = {
  active: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  blocked: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  inactive: { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' },
};

const STATUS_COLORS_DARK = {
  active: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  blocked: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  inactive: { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
};

// ── Connection type labels ────────────────────────────────────
const CONNECTION_LABELS = {
  api: 'API',
  internal: 'Internal',
  webhook: 'Webhook',
  sdk: 'SDK',
  composio: 'Composio',
};

// ── Table columns ─────────────────────────────────────────────
const COLUMNS = [
  { id: 'name', label: 'Tool', sortKey: 'name', minWidth: 200 },
  { id: 'createdAt', label: 'Created', sortKey: 'createdAt', minWidth: 120, align: 'center' },
  { id: 'createdBy', label: 'User', sortKey: 'createdBy', minWidth: 120 },
  { id: 'status', label: 'Status', sortKey: 'status', minWidth: 100, align: 'center' },
  { id: 'category', label: 'Category', sortKey: 'category', minWidth: 120, align: 'center' },
  { id: 'description', label: 'Description', minWidth: 200 },
  { id: 'usedBy', label: 'Used by', minWidth: 140, align: 'center' },
  {
    id: 'connectionType',
    label: 'Connection',
    sortKey: 'connectionType',
    minWidth: 120,
    align: 'center',
  },
  { id: 'url', label: 'URL', minWidth: 100, align: 'center' },
  { id: 'actions', label: '', minWidth: 120, align: 'right' },
];

// ── Empty form ────────────────────────────────────────────────
const EMPTY_FORM = {
  name: '',
  description: '',
  status: 'active',
  connectionType: 'api',
  category: '',
  url: '',
  // API fields
  apiKey: '',
  apiHeaders: '',
  apiMethod: 'POST',
  // Webhook fields
  webhookSecret: '',
  webhookEvents: '',
  // SDK fields
  sdkPackage: '',
  sdkVersion: '',
  sdkConfig: '',
  // Internal fields
  modulePath: '',
  entryFunction: '',
};

const API_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

const CATEGORIES_EXTRA_KEY = 'orch_tool_categories_extra';
const VIEW_MODE_KEY = 'orch_tools_view';

// ── Date formatters ───────────────────────────────────────────
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
  if (a.includes('blocked') || a.includes('block')) return 'warning';
  if (a.includes('unblocked') || a.includes('unblock')) return 'success';
  if (a.includes('updated') || a.includes('edited') || a.includes('changed')) return 'info';
  return 'default';
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

export default function Tools() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const { tools, loading, addTool, editTool, removeTool, toggleBlock, refetch } = useTools();
  const { simpleMode } = useSimpleMode();
  const { user } = useAuth();
  const [showMetrics, setShowMetrics] = useShowMetrics('tools');

  // ── Seed MCP tools if not yet loaded (self-heals if flag set but DB empty) ──
  useEffect(() => {
    if (!loading) {
      loadPredefinedTools().then(({ tools }) => {
        if (tools.length > 0) refetch();
      });
    }
  }, [loading, refetch]);

  // ── MCP detail state ───────────────────────────────────────
  const [mcpDetailTool, setMcpDetailTool] = useState(null);
  const [composioConnections, setComposioConnections] = useState([]);
  useEffect(() => {
    fetchComposioConnections()
      .then(setComposioConnections)
      .catch(() => {});
  }, []);

  // ── View mode (list / card) ───────────────────────────────
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) || 'list';
    } catch {
      return 'list';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  // ── Filter / search state ───────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [connectionTypeFilter, setConnectionTypeFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // ── Sort ────────────────────────────────────────────────────
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('createdAt');

  // ── Dialog state ────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState(null); // null = create mode
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [toolSaving, setToolSaving] = useState(false);

  // ── Delete / UI state ───────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [toolDeleting, setToolDeleting] = useState(false);
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [usedByAnchorEl, setUsedByAnchorEl] = useState(null);
  const [usedByTarget, setUsedByTarget] = useState(null);

  // ── Change Log state ────────────────────────────────────────
  const [changeLogDialog, setChangeLogDialog] = useState({ open: false, tool: null });
  const [changeLogs, setChangeLogs] = useState([]);
  const [changeLogsLoading, setChangeLogsLoading] = useState(false);

  // ── Category management state ─────────────────────────────
  const [categoriesAnchorEl, setCategoriesAnchorEl] = useState(null);
  const [extraCategories, setExtraCategories] = useState(() => {
    try {
      const raw = localStorage.getItem(CATEGORIES_EXTRA_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [deletingCategory, setDeletingCategory] = useState(null);

  // ── Test Connection state ──────────────────────────────────
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null); // { reachable, status, durationMs, error? }

  // ── Execute Dialog state ──────────────────────────────────
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [executingTool, setExecutingTool] = useState(null);
  const [executePayload, setExecutePayload] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState(null);

  // ── Execution History state ───────────────────────────────
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTool, setHistoryTool] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* ---- Page Activity Log Dialog ---- */
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  const openActivityLog = useCallback(async () => {
    setActivityLogOpen(true);
    setActivityLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Tool');
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

  // ── Test Connection handler ────────────────────────────────
  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const params = {
        connectionType: form.connectionType,
        url: form.url,
        apiKey: form.apiKey || undefined,
        webhookSecret: form.webhookSecret || undefined,
      };
      const result = await testToolConnection(params);
      setTestResult(result);
    } catch (err) {
      setTestResult({ reachable: false, error: err.message });
    } finally {
      setTestingConnection(false);
    }
  }, [form.connectionType, form.url, form.apiKey, form.webhookSecret]);

  // ── Execute tool handler ──────────────────────────────────
  const openExecuteDialog = useCallback((tool) => {
    setExecutingTool(tool);
    setExecutePayload('');
    setExecuteResult(null);
    setExecuteDialogOpen(true);
  }, []);

  const handleExecuteTool = useCallback(async () => {
    if (!executingTool || executing) return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      let payload;
      if (executePayload.trim()) {
        try {
          payload = JSON.parse(executePayload);
        } catch {
          setExecuteResult({ success: false, error: 'Invalid JSON payload' });
          setExecuting(false);
          return;
        }
      }
      const result = await executeToolApi(executingTool.id, payload);
      setExecuteResult(result);
    } catch (err) {
      setExecuteResult({ success: false, error: err.message });
    } finally {
      setExecuting(false);
    }
  }, [executingTool, executePayload, executing]);

  // ── Execution History handler ─────────────────────────────
  const openHistoryDialog = useCallback(async (tool) => {
    setHistoryTool(tool);
    setHistoryDialogOpen(true);
    setHistoryLoading(true);
    try {
      const history = await getExecutionHistory(tool.id);
      setExecutionHistory(history);
    } catch {
      setExecutionHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── Dialog helpers ──────────────────────────────────────────
  const openCreateDialog = () => {
    setEditingTool(null);
    setForm({ ...EMPTY_FORM });
    setTestResult(null);
    setDialogOpen(true);
  };

  const openEditDialog = (tool) => {
    setEditingTool(tool);
    setShowApiKey(false);
    setShowWebhookSecret(false);
    setTestResult(null);
    setForm({
      ...EMPTY_FORM,
      name: tool.name || '',
      description: tool.description || '',
      status: tool.status || 'active',
      connectionType: tool.connectionType || 'api',
      category: tool.category || '',
      url: tool.url || '',
      apiKey: tool.apiKey || '',
      apiHeaders: tool.apiHeaders || '',
      apiMethod: tool.apiMethod || 'POST',
      webhookSecret: tool.webhookSecret || '',
      webhookEvents: tool.webhookEvents || '',
      sdkPackage: tool.sdkPackage || '',
      sdkVersion: tool.sdkVersion || '',
      sdkConfig: tool.sdkConfig || '',
      modulePath: tool.modulePath || '',
      entryFunction: tool.entryFunction || '',
    });
    setDialogOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || toolSaving) return;
    setToolSaving(true);
    try {
      if (editingTool) {
        const changes = [];
        if (form.name !== editingTool.name) changes.push(`name → "${form.name}"`);
        if (form.description !== editingTool.description) changes.push('description updated');
        if (form.status !== editingTool.status) changes.push(`status → ${form.status}`);
        if (form.connectionType !== editingTool.connectionType)
          changes.push(`connection → ${form.connectionType}`);
        if ((form.category || '') !== (editingTool.category || ''))
          changes.push(`category → ${form.category || 'none'}`);
        if ((form.url || '') !== (editingTool.url || '')) changes.push('url updated');
        if ((form.apiKey || '') !== (editingTool.apiKey || '')) changes.push('api key updated');
        if ((form.apiHeaders || '') !== (editingTool.apiHeaders || ''))
          changes.push('headers updated');
        if ((form.apiMethod || 'POST') !== (editingTool.apiMethod || 'POST'))
          changes.push(`method → ${form.apiMethod}`);
        if ((form.webhookSecret || '') !== (editingTool.webhookSecret || ''))
          changes.push('webhook secret updated');
        if ((form.webhookEvents || '') !== (editingTool.webhookEvents || ''))
          changes.push('webhook events updated');
        if ((form.sdkPackage || '') !== (editingTool.sdkPackage || ''))
          changes.push(`package → ${form.sdkPackage}`);
        if ((form.sdkVersion || '') !== (editingTool.sdkVersion || ''))
          changes.push(`version → ${form.sdkVersion}`);
        if ((form.sdkConfig || '') !== (editingTool.sdkConfig || ''))
          changes.push('sdk config updated');
        if ((form.modulePath || '') !== (editingTool.modulePath || ''))
          changes.push(`module → ${form.modulePath}`);
        if ((form.entryFunction || '') !== (editingTool.entryFunction || ''))
          changes.push(`entry → ${form.entryFunction}`);
        await editTool(editingTool.id, form);
        const detail =
          changes.length > 0
            ? `Updated "${form.name}": ${changes.join(', ')}`
            : `Updated "${form.name}"`;
        logAction({
          action: 'Tool updated',
          entity: 'Tool',
          entityId: editingTool.id,
          details: detail,
          meta: {
            source: 'toolsPage',
            importance: 'medium',
            tags: ['update', 'tool'],
          },
        }).catch(() => {});
      } else {
        const created = await addTool({
          ...form,
          createdBy: user?.email || 'System',
        });
        if (created) {
          logAction({
            action: 'Tool created',
            entity: 'Tool',
            entityId: created.id,
            details: `Created tool "${form.name}"`,
            meta: {
              source: 'toolsPage',
              importance: 'medium',
              tags: ['create', 'tool'],
            },
          }).catch(() => {});
        }
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save tool:', err);
    } finally {
      setToolSaving(false);
    }
  }, [form, editingTool, toolSaving, editTool, addTool, user]);

  // ── Handlers ────────────────────────────────────────────────
  const handleSort = (sortKey) => {
    if (!sortKey) return;
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm || toolDeleting) return;
    setToolDeleting(true);
    setDeleteError(null);
    try {
      await removeTool(deleteConfirm.id);
      logAction({
        action: 'Tool deleted',
        entity: 'Tool',
        entityId: deleteConfirm.id,
        details: `Deleted tool "${deleteConfirm.name}"`,
        meta: {
          source: 'toolsPage',
          importance: 'high',
          tags: ['delete', 'tool'],
        },
      }).catch(() => {});
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete tool:', err);
      setDeleteError(err?.message || 'Failed to delete this tool. Please try again.');
    } finally {
      setToolDeleting(false);
    }
  }, [deleteConfirm, removeTool, toolDeleting]);

  const handleToggleBlock = useCallback(
    async (tool) => {
      try {
        await toggleBlock(tool.id);
        const newStatus = tool.status === 'blocked' ? 'active' : 'blocked';
        logAction({
          action: newStatus === 'blocked' ? 'Tool blocked' : 'Tool unblocked',
          entity: 'Tool',
          entityId: tool.id,
          details: `${newStatus === 'blocked' ? 'Blocked' : 'Unblocked'} tool "${tool.name}"`,
          meta: {
            source: 'toolsPage',
            importance: 'medium',
            tags: [newStatus === 'blocked' ? 'block' : 'unblock', 'tool'],
          },
        }).catch(() => {});
      } catch (err) {
        console.error('Failed to toggle tool block:', err);
      }
    },
    [toggleBlock]
  );

  const handleOpenUsedBy = useCallback((e, tool) => {
    e.stopPropagation();
    setUsedByAnchorEl(e.currentTarget);
    setUsedByTarget(tool);
  }, []);

  // ── Change Log helpers ──────────────────────────────────────
  const openChangeLog = useCallback(async (tool) => {
    setChangeLogDialog({ open: true, tool });
    setChangeLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter((log) => log.entity === 'Tool' && log.entityId === tool.id);
      setChangeLogs(filtered);
    } catch (_) {
      setChangeLogs([]);
    } finally {
      setChangeLogsLoading(false);
    }
  }, []);

  const closeChangeLog = useCallback(() => {
    setChangeLogDialog({ open: false, tool: null });
    setChangeLogs([]);
  }, []);

  const getUserFromLog = useCallback(
    (log) => {
      if (log.user && log.user !== '-') return log.user;
      return user?.email || '-';
    },
    [user]
  );

  const getIpFromLog = (log) => {
    const s = log.detailsStructured;
    return s?.network?.ip || '-';
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setConnectionTypeFilter('All');
    setCategoryFilter('All');
  };

  // ── Category management helpers ─────────────────────────────
  const existingCategories = useMemo(() => {
    const set = new Set();
    tools.forEach((t) => {
      const c = (t.category && String(t.category).trim()) || null;
      if (c) set.add(c);
    });
    extraCategories.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tools, extraCategories]);

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
      const toUpdate = tools.filter((t) => (t.category || '').trim() === oldName);
      try {
        for (const t of toUpdate) await editTool(t.id, { category: name });
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
      } catch (err) {
        console.error('Failed to rename category:', err);
      }
    },
    [tools, editTool]
  );

  const handleDeleteCategory = useCallback(
    async (categoryName) => {
      const toUpdate = tools.filter((t) => (t.category || '').trim() === categoryName);
      setDeletingCategory(categoryName);
      try {
        for (const t of toUpdate) await editTool(t.id, { category: null });
        setExtraCategories((prev) => {
          const next = prev.filter((c) => c !== categoryName);
          try {
            localStorage.setItem(CATEGORIES_EXTRA_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
        setCategoriesAnchorEl(null);
      } finally {
        setDeletingCategory(null);
      }
    },
    [tools, editTool]
  );

  // ── Derived data ────────────────────────────────────────────
  const mcpToolCount = useMemo(
    () => tools.filter((t) => t.connectionType === 'composio').length,
    [tools]
  );

  const filtered = useMemo(() => {
    let list = [...tools];
    if (statusFilter !== 'All') {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (connectionTypeFilter !== 'All') {
      list = list.filter((t) => t.connectionType === connectionTypeFilter);
    }
    if (categoryFilter !== 'All') {
      list = list.filter((t) => {
        const cat = (t.category || '').trim();
        const sub = t.data?.subcategory || t.subcategory || '';
        return cat === categoryFilter || sub === categoryFilter;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.name || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.createdBy || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q) ||
          (t.data?.subcategory || t.subcategory || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [tools, search, statusFilter, connectionTypeFilter, categoryFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[orderBy] || '';
      const valB = b[orderBy] || '';
      if (valB < valA) return order === 'desc' ? -1 : 1;
      if (valB > valA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [filtered, order, orderBy]);

  const pagination = usePagination(sorted, {
    surfaceId: 'tools.list',
    defaultRowsPerPage: 10,
    resetOn: [search, statusFilter, connectionTypeFilter, categoryFilter, order, orderBy],
  });
  const paginated = pagination.paginatedData;

  // ── Stats ───────────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      total: tools.length,
      active: tools.filter((t) => t.status === 'active').length,
      blocked: tools.filter((t) => t.status === 'blocked').length,
      inactive: tools.filter((t) => t.status === 'inactive').length,
      mcp: mcpToolCount,
    }),
    [tools, mcpToolCount]
  );

  const statCards = [
    {
      label: 'Total Tools',
      value: stats.total,
      helper: `${stats.mcp} MCP integrations`,
      color: theme.palette.primary.main,
      icon: BuildOutlinedIcon,
    },
    {
      label: 'Active',
      value: stats.active,
      helper: 'Currently operational',
      color: theme.palette.success.main,
      icon: PlayCircleOutlineIcon,
    },
    {
      label: 'Blocked',
      value: stats.blocked,
      helper: 'Temporarily disabled',
      color: theme.palette.warning.main,
      icon: PauseCircleOutlineIcon,
    },
    {
      label: 'MCP Integrations',
      value: stats.mcp,
      helper: 'Composio-powered tools',
      color: theme.palette.info.main,
      icon: ExtensionOutlinedIcon,
    },
  ];

  // ── Loading state ───────────────────────────────────────────
  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <PageLayout showTitleBlock={false}>
      <BentoCard
        title="Tools"
        explain
        noTour
        pageInfoPath="/tools"
        icon={BuildOutlinedIcon}
        noPadding
        action={
          <MetricsToggleButton
            showMetrics={showMetrics}
            onToggle={() => setShowMetrics((v) => !v)}
          />
        }
      >
        {/* ── Metrics ──────────────────────────────────────── */}
        <Collapse in={showMetrics}>
          <Box
            data-tour-block="tools-metrics"
            data-tour-label="Tool stats"
            sx={{ px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25 }}
          >
            <Box
              sx={{
                mb: 2,
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(4, minmax(0, 1fr))',
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

        {/* ── Toolbar ──────────────────────────────────────── */}
        <Box
          data-tour-block="tools-toolbar"
          data-tour-label="Controls"
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
          <Tooltip title="Filters" placement="bottom" arrow>
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
            <ToggleButton value="list" aria-label="List view">
              <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
            </ToggleButton>
            <ToggleButton value="card" aria-label="Card view">
              <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 20 }} />
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
            >
              <AppIcon
                name="History"
                fallback={HistoryIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Manage categories" placement="bottom" arrow>
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
            >
              <AppIcon
                name="Category"
                fallback={CategoryIcon}
                sx={{ fontSize: 20, color: 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add new tool">
            <IconButton
              onClick={openCreateDialog}
              sx={{
                bgcolor: 'background.paper',
                border: '2px solid',
                borderColor: alpha(theme.palette.primary.main, 0.5),
                borderRadius: 2,
                color: 'primary.main',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderColor: 'primary.main',
                },
              }}
            >
              <AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
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
              <AppIcon
                name="Tune"
                fallback={TuneIcon}
                sx={{ fontSize: 18, color: 'primary.main' }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Filter Tools
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
              Narrow down tools by source, name, status, or connection type.
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
              placeholder="Search tools..."
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
                {TOOL_STATUSES_LIST.map((s) => (
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
              Connection Type
            </Typography>
            <FormControl size="small" fullWidth sx={{ borderRadius: 2, mb: 2 }}>
              <InputLabel>Connection Type</InputLabel>
              <Select
                value={connectionTypeFilter}
                label="Connection Type"
                onChange={(e) => {
                  setConnectionTypeFilter(e.target.value);
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
                  All Types
                </MenuItem>
                {TOOL_CONNECTION_TYPES.map((ct) => (
                  <MenuItem key={ct} value={ct}>
                    {CONNECTION_LABELS[ct] || ct}
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

        {/* ── Table or Empty ───────────────────────────────── */}
        {filtered.length === 0 ? (
          <Box sx={{ p: 4 }}>
            <EmptyState
              icon={BuildOutlinedIcon}
              title="No tools found"
              description={
                search ||
                statusFilter !== 'All' ||
                connectionTypeFilter !== 'All' ||
                categoryFilter !== 'All'
                  ? 'Try adjusting your filters or search query.'
                  : 'Create your first tool to get started.'
              }
              actionLabel="New"
              onAction={openCreateDialog}
            />
          </Box>
        ) : viewMode === 'card' ? (
          <>
            <Box data-tour-block="tools-content" data-tour-label="Your tools" sx={{ p: 1.5 }}>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: cardGridColumns(simpleMode, {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(3, 1fr)',
                  }),
                }}
              >
                {paginated.map((tool) => {
                  const isMcp = tool.connectionType === 'composio';
                  const sc =
                    (isDark ? STATUS_COLORS_DARK : STATUS_COLORS)[tool.status] ||
                    (isDark ? STATUS_COLORS_DARK : STATUS_COLORS).inactive;
                  const usedByList = tool.usedBy || [];
                  const accentColor = isMcp ? theme.palette.info.main : theme.palette.primary.main;
                  return (
                    <Paper
                      key={tool.id}
                      elevation={0}
                      onClick={() => (isMcp ? setMcpDetailTool(tool) : openEditDialog(tool))}
                      sx={{
                        p: 2,
                        borderRadius: 2.5,
                        border: '1px solid',
                        borderColor: isMcp ? alpha(accentColor, 0.22) : 'divider',
                        cursor: 'pointer',
                        background: isMcp
                          ? `linear-gradient(135deg, ${alpha(accentColor, 0.04)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`
                          : undefined,
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        '&:hover': {
                          borderColor: 'primary.main',
                          boxShadow: createHoverGlowShadow(theme),
                        },
                      }}
                    >
                      {/* Header */}
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
                        <ToolIcon tool={tool} tileSize={36} size={18} subColor={accentColor} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 700,
                              lineHeight: 1.3,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tool.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}
                          >
                            {formatRelative(tool.createdAt)}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {isMcp && (
                            <Chip
                              label="MCP"
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                bgcolor: alpha(theme.palette.info.main, 0.12),
                                color: 'info.main',
                              }}
                            />
                          )}
                          <Chip
                            label={tool.status}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              bgcolor: sc.bg,
                              color: sc.color,
                            }}
                          />
                        </Box>
                      </Box>
                      {/* Description */}
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.8rem',
                          mb: 1.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: 1.5,
                          minHeight: '2.4em',
                        }}
                      >
                        {tool.description || 'No description'}
                      </Typography>
                      {/* Info chips */}
                      <Box
                        sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}
                      >
                        <Chip
                          label={CONNECTION_LABELS[tool.connectionType] || tool.connectionType}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 22,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            borderRadius: 1.5,
                          }}
                        />
                        {(tool.category || tool.data?.subcategory || tool.subcategory) && (
                          <Chip
                            icon={
                              <AppIcon
                                name="LabelOutlined"
                                fallback={LabelOutlinedIcon}
                                sx={{ fontSize: '14px !important' }}
                              />
                            }
                            label={tool.data?.subcategory || tool.subcategory || tool.category}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 22,
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              borderRadius: 1.5,
                            }}
                          />
                        )}
                        {usedByList.length > 0 && (
                          <Chip
                            label={`${usedByList.length} user${usedByList.length !== 1 ? 's' : ''}`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              bgcolor: isDark
                                ? alpha(theme.palette.primary.main, 0.1)
                                : alpha(theme.palette.primary.main, 0.06),
                              color: 'primary.main',
                            }}
                          />
                        )}
                        {tool.url && (
                          <Tooltip title={tool.url}>
                            <IconButton
                              size="small"
                              component="a"
                              href={tool.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              sx={{ color: 'primary.main', p: 0.25 }}
                            >
                              <AppIcon name="Launch" fallback={LaunchIcon} sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                      {/* Footer actions */}
                      {!isMcp && (
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 0.5,
                            justifyContent: 'flex-end',
                            mt: 1.5,
                            pt: 1,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEditDialog(tool)}>
                              <AppIcon
                                name="EditOutlined"
                                fallback={EditOutlinedIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={tool.status === 'blocked' ? 'Unblock' : 'Block'}>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleBlock(tool)}
                              sx={{
                                color: tool.status === 'blocked' ? 'success.main' : 'warning.main',
                              }}
                            >
                              {tool.status === 'blocked' ? (
                                <AppIcon
                                  name="CheckCircleOutline"
                                  fallback={CheckCircleOutlineIcon}
                                  sx={{ fontSize: 16 }}
                                />
                              ) : (
                                <AppIcon
                                  name="BlockOutlined"
                                  fallback={BlockOutlinedIcon}
                                  sx={{ fontSize: 16 }}
                                />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Execute">
                            <IconButton
                              size="small"
                              onClick={() => openExecuteDialog(tool)}
                              sx={{ color: 'success.main' }}
                            >
                              <AppIcon
                                name="PlayArrow"
                                fallback={PlayArrowIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Execution history">
                            <IconButton
                              size="small"
                              onClick={() => openHistoryDialog(tool)}
                              sx={{ color: 'info.main' }}
                            >
                              <AppIcon
                                name="Timeline"
                                fallback={TimelineIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Change log">
                            <IconButton
                              size="small"
                              onClick={() => openChangeLog(tool)}
                              sx={{ color: 'primary.main' }}
                            >
                              <AppIcon
                                name="History"
                                fallback={HistoryIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirm(tool)}
                              sx={{ color: 'error.main' }}
                            >
                              <AppIcon
                                name="DeleteOutline"
                                fallback={DeleteOutlineIcon}
                                sx={{ fontSize: 16 }}
                              />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Paper>
                  );
                })}
              </Box>
            </Box>
            <Pagination
              count={pagination.totalCount}
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              rowsPerPageOptions={pagination.rowsPerPageOptions}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
              onLoadAll={pagination.loadAll}
              onCollapseAll={pagination.collapseAll}
              allMode={pagination.allMode}
              label="tools"
            />
          </>
        ) : (
          <>
            <TableContainer
              data-tour-block="tools-content"
              data-tour-label="Your tools"
              sx={{ maxHeight: 'calc(100vh - 350px)', flex: 1 }}
            >
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
                  {paginated.map((tool) => {
                    const isMcp = tool.connectionType === 'composio';
                    const sc =
                      (isDark ? STATUS_COLORS_DARK : STATUS_COLORS)[tool.status] ||
                      (isDark ? STATUS_COLORS_DARK : STATUS_COLORS).inactive;
                    const usedByList = tool.usedBy || [];
                    return (
                      <TableRow
                        key={tool.id}
                        hover
                        sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                        onClick={() => (isMcp ? setMcpDetailTool(tool) : openEditDialog(tool))}
                      >
                        {/* Tool name */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <ToolIcon
                              tool={tool}
                              tileSize={36}
                              size={18}
                              subColor={
                                isMcp ? theme.palette.info.main : theme.palette.primary.main
                              }
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 600,
                                    lineHeight: 1.3,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 200,
                                  }}
                                >
                                  {tool.name}
                                </Typography>
                                {isMcp && (
                                  <Chip
                                    label="MCP"
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.55rem',
                                      fontWeight: 700,
                                      bgcolor: alpha(theme.palette.info.main, 0.12),
                                      color: 'info.main',
                                    }}
                                  />
                                )}
                              </Box>
                            </Box>
                          </Box>
                        </TableCell>
                        {/* Created */}
                        <TableCell align="center">
                          <Tooltip title={formatDate(tool.createdAt)}>
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 500, color: 'text.secondary' }}
                            >
                              {formatRelative(tool.createdAt)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        {/* User */}
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
                              {tool.createdBy || 'System'}
                            </Typography>
                          </Box>
                        </TableCell>
                        {/* Status */}
                        <TableCell align="center">
                          <Chip
                            label={tool.status}
                            size="small"
                            sx={{
                              height: 24,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              bgcolor: sc.bg,
                              color: sc.color,
                            }}
                          />
                        </TableCell>
                        {/* Category */}
                        <TableCell align="center">
                          {tool.category || tool.data?.subcategory || tool.subcategory ? (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <AppIcon
                                name="LabelOutlined"
                                fallback={LabelOutlinedIcon}
                                sx={{ fontSize: 16, color: 'text.secondary' }}
                              />
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                              >
                                {tool.data?.subcategory || tool.subcategory || tool.category}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              -
                            </Typography>
                          )}
                        </TableCell>
                        {/* Description */}
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'text.secondary',
                              fontSize: '0.8rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 220,
                            }}
                          >
                            {tool.description || '-'}
                          </Typography>
                        </TableCell>
                        {/* Used by */}
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          {usedByList.length > 0 ? (
                            <Chip
                              size="small"
                              label={`${usedByList.length} ${usedByList.length === 1 ? 'user' : 'users'}`}
                              clickable
                              onClick={(e) => handleOpenUsedBy(e, tool)}
                              sx={{
                                height: 24,
                                fontSize: '0.7rem',
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
                              }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              -
                            </Typography>
                          )}
                        </TableCell>
                        {/* Connection type */}
                        <TableCell align="center">
                          <Chip
                            label={CONNECTION_LABELS[tool.connectionType] || tool.connectionType}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 24,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              borderRadius: 1.5,
                            }}
                          />
                        </TableCell>
                        {/* URL */}
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          {tool.url ? (
                            <Tooltip title={tool.url}>
                              <IconButton
                                size="small"
                                component="a"
                                href={tool.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ color: 'primary.main' }}
                              >
                                <AppIcon
                                  name="Launch"
                                  fallback={LaunchIcon}
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
                        {/* Actions */}
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="Edit tool">
                              <IconButton size="small" onClick={() => openEditDialog(tool)}>
                                <AppIcon
                                  name="EditOutlined"
                                  fallback={EditOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip
                              title={tool.status === 'blocked' ? 'Unblock tool' : 'Block tool'}
                            >
                              <IconButton
                                size="small"
                                onClick={() => handleToggleBlock(tool)}
                                sx={{
                                  color:
                                    tool.status === 'blocked' ? 'success.main' : 'warning.main',
                                }}
                              >
                                {tool.status === 'blocked' ? (
                                  <AppIcon
                                    name="CheckCircleOutline"
                                    fallback={CheckCircleOutlineIcon}
                                    sx={{ fontSize: 18 }}
                                  />
                                ) : (
                                  <AppIcon
                                    name="BlockOutlined"
                                    fallback={BlockOutlinedIcon}
                                    sx={{ fontSize: 18 }}
                                  />
                                )}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Execute tool">
                              <IconButton
                                size="small"
                                onClick={() => openExecuteDialog(tool)}
                                sx={{ color: 'success.main' }}
                              >
                                <AppIcon
                                  name="PlayArrow"
                                  fallback={PlayArrowIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Execution history">
                              <IconButton
                                size="small"
                                onClick={() => openHistoryDialog(tool)}
                                sx={{ color: 'info.main' }}
                              >
                                <AppIcon
                                  name="Timeline"
                                  fallback={TimelineIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Change log">
                              <IconButton
                                size="small"
                                onClick={() => openChangeLog(tool)}
                                sx={{ color: 'primary.main' }}
                              >
                                <AppIcon
                                  name="History"
                                  fallback={HistoryIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete tool">
                              <IconButton
                                size="small"
                                onClick={() => setDeleteConfirm(tool)}
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
              count={pagination.totalCount}
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              rowsPerPageOptions={pagination.rowsPerPageOptions}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
              onLoadAll={pagination.loadAll}
              onCollapseAll={pagination.collapseAll}
              allMode={pagination.allMode}
              label="tools"
            />
          </>
        )}
      </BentoCard>
      {/* ── Create / Edit Dialog ─────────────────────────── */}
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
                name="BuildOutlined"
                fallback={BuildOutlinedIcon}
                sx={{ fontSize: 22, color: 'primary.main' }}
              />
            </Box>
            <Box>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}
              >
                {editingTool ? 'Edit Tool' : 'New Tool'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {editingTool
                  ? 'Update tool details and connection settings'
                  : 'Connect a new tool to the platform'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <DialogContent sx={{ pt: 3 }}>
          {/* Tool Info */}
          <SectionLabel
            icon={<AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} />}
            label="Tool Info"
          />
          <TextField
            fullWidth
            size="small"
            label="Tool Name"
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            fullWidth
            size="small"
            label="Description"
            multiline
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          {/* Status */}
          <SectionLabel
            icon={<AppIcon name="PlayCircleOutline" fallback={PlayCircleOutlineIcon} />}
            label="Status"
          />
          <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            {TOOL_STATUSES_LIST.map((s) => {
              const isSelected = form.status === s;
              const sc = (isDark ? STATUS_COLORS_DARK : STATUS_COLORS)[s] || {};
              return (
                <Chip
                  key={s}
                  label={s}
                  size="small"
                  clickable
                  onClick={() => setForm((f) => ({ ...f, status: s }))}
                  sx={{
                    height: 28,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    bgcolor: isSelected ? sc.bg : 'transparent',
                    color: isSelected ? sc.color : 'text.secondary',
                    border: '1px solid',
                    borderColor: isSelected ? sc.border || sc.color : 'divider',
                    '&:hover': { bgcolor: sc.bg },
                  }}
                />
              );
            })}
          </Box>

          {/* Category */}
          <SectionLabel
            icon={<AppIcon name="Category" fallback={CategoryIcon} />}
            label="Category"
          />
          <Autocomplete
            size="small"
            freeSolo
            options={existingCategories}
            value={form.category || ''}
            onChange={(e, newVal) =>
              setForm((f) => ({ ...f, category: (newVal && String(newVal).trim()) || '' }))
            }
            onInputChange={(e, val, reason) => {
              if (reason === 'input') setForm((f) => ({ ...f, category: val }));
            }}
            renderInput={(params) => (
              <TextField {...params} label="Category" placeholder="Select or type a new category" />
            )}
            sx={{ mb: 3, '& .MuiInputBase-root': { borderRadius: 2 } }}
          />

          {/* Connection */}
          <SectionLabel
            icon={<AppIcon name="LinkOutlined" fallback={LinkOutlinedIcon} />}
            label="Connection"
          />
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Connection Type</InputLabel>
            <Select
              value={form.connectionType}
              label="Connection Type"
              onChange={(e) => setForm((f) => ({ ...f, connectionType: e.target.value }))}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              {TOOL_CONNECTION_TYPES.map((ct) => (
                <MenuItem key={ct} value={ct}>
                  {CONNECTION_LABELS[ct] || ct}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* ── API fields ─────────────────────────────────── */}
          {form.connectionType === 'api' && (
            <>
              <TextField
                fullWidth
                size="small"
                label="Endpoint URL"
                placeholder="https://api.example.com/v1/..."
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="Launch"
                        fallback={LaunchIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Base URL for API requests"
              />
              <TextField
                fullWidth
                size="small"
                label="API Key"
                placeholder="sk-..."
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowApiKey((v) => !v)} edge="end">
                        {showApiKey ? (
                          <AppIcon
                            name="VisibilityOffOutlined"
                            fallback={VisibilityOffOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        ) : (
                          <AppIcon
                            name="VisibilityOutlined"
                            fallback={VisibilityOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Authentication key for the API"
              />
              <TextField
                fullWidth
                size="small"
                label="Headers"
                multiline
                rows={2}
                placeholder={'Content-Type: application/json\nAuthorization: Bearer ...'}
                value={form.apiHeaders}
                onChange={(e) => setForm((f) => ({ ...f, apiHeaders: e.target.value }))}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="One header per line - Key: Value"
              />
              <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                <InputLabel>Method</InputLabel>
                <Select
                  value={form.apiMethod}
                  label="Method"
                  onChange={(e) => setForm((f) => ({ ...f, apiMethod: e.target.value }))}
                  sx={{ borderRadius: 2, fontWeight: 600 }}
                >
                  {API_METHODS.map((m) => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {/* ── Webhook fields ─────────────────────────────── */}
          {form.connectionType === 'webhook' && (
            <>
              <TextField
                fullWidth
                size="small"
                label="Callback URL"
                placeholder="https://your-app.com/webhook/..."
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="Launch"
                        fallback={LaunchIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="URL that receives webhook payloads"
              />
              <TextField
                fullWidth
                size="small"
                label="Secret"
                placeholder="whsec_..."
                type={showWebhookSecret ? 'text' : 'password'}
                value={form.webhookSecret}
                onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowWebhookSecret((v) => !v)}
                        edge="end"
                      >
                        {showWebhookSecret ? (
                          <AppIcon
                            name="VisibilityOffOutlined"
                            fallback={VisibilityOffOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        ) : (
                          <AppIcon
                            name="VisibilityOutlined"
                            fallback={VisibilityOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Signing secret for payload verification"
              />
              <TextField
                fullWidth
                size="small"
                label="Events"
                placeholder="tool.run, tool.complete, tool.error"
                value={form.webhookEvents}
                onChange={(e) => setForm((f) => ({ ...f, webhookEvents: e.target.value }))}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Comma-separated event triggers"
              />
            </>
          )}

          {/* ── SDK fields ─────────────────────────────────── */}
          {form.connectionType === 'sdk' && (
            <>
              <TextField
                fullWidth
                size="small"
                label="Package Name"
                placeholder="@company/sdk-name"
                value={form.sdkPackage}
                onChange={(e) => setForm((f) => ({ ...f, sdkPackage: e.target.value }))}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="npm / pip package identifier"
              />
              <TextField
                fullWidth
                size="small"
                label="Version"
                placeholder="^2.0.0"
                value={form.sdkVersion}
                onChange={(e) => setForm((f) => ({ ...f, sdkVersion: e.target.value }))}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Semver range"
              />
              <TextField
                fullWidth
                size="small"
                label="Init Config"
                multiline
                rows={3}
                placeholder={'{\n  "region": "us-east-1",\n  "timeout": 30000\n}'}
                value={form.sdkConfig}
                onChange={(e) => setForm((f) => ({ ...f, sdkConfig: e.target.value }))}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="SDK initialization config (JSON)"
              />
            </>
          )}

          {/* ── Internal fields ────────────────────────────── */}
          {form.connectionType === 'internal' && (
            <>
              <TextField
                fullWidth
                size="small"
                label="Module Path"
                placeholder="core/modules/data-hub"
                value={form.modulePath}
                onChange={(e) => setForm((f) => ({ ...f, modulePath: e.target.value }))}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Path to the internal module"
              />
              <TextField
                fullWidth
                size="small"
                label="Entry Function"
                placeholder="processData"
                value={form.entryFunction}
                onChange={(e) => setForm((f) => ({ ...f, entryFunction: e.target.value }))}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Main function to invoke"
              />
              <TextField
                fullWidth
                size="small"
                label="Service URL"
                placeholder="https://..."
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="Launch"
                        fallback={LaunchIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                helperText="Dashboard or docs link (optional)"
              />
            </>
          )}

          {/* ── Test Connection ───────────────────────────── */}
          {form.url && ['api', 'webhook'].includes(form.connectionType) && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleTestConnection}
                disabled={testingConnection}
                startIcon={
                  testingConnection ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : (
                    <AppIcon
                      name="LinkOutlined"
                      fallback={LinkOutlinedIcon}
                      sx={{ fontSize: 16 }}
                    />
                  )
                }
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
              >
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </Button>
              {testResult && (
                <Chip
                  size="small"
                  label={
                    testResult.reachable
                      ? `Connected${testResult.durationMs ? ` (${testResult.durationMs}ms)` : ''}`
                      : testResult.error || `Failed (${testResult.status || 'unreachable'})`
                  }
                  color={testResult.reachable ? 'success' : 'error'}
                  sx={{ fontWeight: 600, fontSize: '0.7rem', height: 24 }}
                />
              )}
            </Box>
          )}
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
          {editingTool && (
            <Button
              variant="outlined"
              color="info"
              size="small"
              startIcon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 16 }} />}
              onClick={() => {
                setDialogOpen(false);
                openChangeLog(editingTool);
              }}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
            >
              Log
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.name.trim() || toolSaving}
            startIcon={toolSaving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 4 }}
          >
            {toolSaving ? 'Saving...' : editingTool ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Delete Confirmation Dialog ───────────────────── */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => {
          if (toolDeleting) return;
          setDeleteConfirm(null);
          setDeleteError(null);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <Box sx={{ bgcolor: alpha(theme.palette.error.main, 0.06), px: 3, pt: 3, pb: 1.5 }}>
          <DialogTitle sx={{ p: 0, fontWeight: 700, fontSize: '1.1rem' }}>Delete tool?</DialogTitle>
        </Box>
        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <DialogContentText sx={{ color: 'text.primary', fontSize: '0.9rem' }}>
            Are you sure you want to delete{' '}
            <strong>&quot;{deleteConfirm?.name || 'Untitled'}&quot;</strong>? This action cannot be
            undone.
          </DialogContentText>
          {deleteError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => {
              setDeleteConfirm(null);
              setDeleteError(null);
            }}
            disabled={toolDeleting}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            disabled={toolDeleting}
            startIcon={toolDeleting ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            {toolDeleting ? 'Deleting...' : 'Delete Tool'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Change Log Dialog ────────────────────────────── */}
      <Dialog
        open={changeLogDialog.open}
        onClose={closeChangeLog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '80vh' } }}
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
              {changeLogDialog.tool?.name || 'Tool'} - Change history
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
                Actions like creating, editing, blocking, and deleting this tool will appear here.
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
            Showing {changeLogs.length} log entries for this tool
          </Typography>
          <Button
            onClick={closeChangeLog}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Categories Management Popover ─────────────── */}
      <Popover
        open={Boolean(categoriesAnchorEl)}
        anchorEl={categoriesAnchorEl}
        onClose={() => {
          setCategoriesAnchorEl(null);
          setEditingCategory(null);
          setNewCategoryName('');
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              borderRadius: 3,
              minWidth: 320,
              maxWidth: 380,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            },
          },
        }}
      >
        <Box sx={{ px: 2.5, pt: 2.5, pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AppIcon
              name="Category"
              fallback={CategoryIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Categories
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            Add, rename, or remove tool categories.
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, pb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="New category..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCategory();
                }
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, minWidth: 60 }}
            >
              Add
            </Button>
          </Box>
        </Box>
        <Box sx={{ maxHeight: 260, overflowY: 'auto', px: 2.5, pb: 2.5 }}>
          {existingCategories.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No categories yet
            </Typography>
          ) : (
            existingCategories.map((cat) => {
              const count = tools.filter((t) => (t.category || '').trim() === cat).length;
              const isEditing = editingCategory === cat;
              return (
                <Box
                  key={cat}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.75,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <AppIcon
                    name="LabelOutlined"
                    fallback={LabelOutlinedIcon}
                    sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }}
                  />
                  {isEditing ? (
                    <TextField
                      size="small"
                      fullWidth
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleEditCategory(cat, editingCategoryName);
                        }
                        if (e.key === 'Escape') setEditingCategory(null);
                      }}
                      autoFocus
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
                        '& .MuiOutlinedInput-input': { py: 0.5, fontSize: '0.82rem' },
                      }}
                    />
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85rem',
                      }}
                    >
                      {cat}
                    </Typography>
                  )}
                  <Chip
                    label={count}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      minWidth: 28,
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      color: 'primary.main',
                    }}
                  />
                  {isEditing ? (
                    <IconButton
                      size="small"
                      onClick={() => handleEditCategory(cat, editingCategoryName)}
                      sx={{ p: 0.25 }}
                    >
                      <AppIcon
                        name="Check"
                        fallback={CheckIcon}
                        sx={{ fontSize: 16, color: 'success.main' }}
                      />
                    </IconButton>
                  ) : (
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditingCategory(cat);
                        setEditingCategoryName(cat);
                      }}
                      sx={{ p: 0.25 }}
                    >
                      <AppIcon
                        name="EditOutlined"
                        fallback={EditOutlinedIcon}
                        sx={{ fontSize: 16 }}
                      />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteCategory(cat)}
                    disabled={deletingCategory === cat}
                    sx={{ p: 0.25 }}
                  >
                    {deletingCategory === cat ? (
                      <CircularProgress size={14} />
                    ) : (
                      <AppIcon
                        name="DeleteOutline"
                        fallback={DeleteOutlineIcon}
                        sx={{ fontSize: 16, color: 'error.main' }}
                      />
                    )}
                  </IconButton>
                </Box>
              );
            })
          )}
        </Box>
      </Popover>
      {/* ── Used By Popover ──────────────────────────────── */}
      <Popover
        open={!!usedByAnchorEl}
        anchorEl={usedByAnchorEl}
        onClose={() => {
          setUsedByAnchorEl(null);
          setUsedByTarget(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              borderRadius: 3,
              minWidth: 240,
              maxWidth: 360,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            },
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.85rem' }}>
            Used by ({usedByTarget?.usedBy?.length || 0})
          </Typography>
          {(usedByTarget?.usedBy || []).length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No users or agents
            </Typography>
          ) : (
            (usedByTarget?.usedBy || []).map((item, idx) => (
              <Box
                key={item.id || idx}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.75,
                  borderBottom:
                    idx < (usedByTarget?.usedBy?.length || 0) - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}
              >
                {item.type === 'agent' ? (
                  <AppIcon
                    name="SmartToyOutlined"
                    fallback={SmartToyOutlinedIcon}
                    sx={{ fontSize: 18, color: 'primary.main' }}
                  />
                ) : (
                  <AppIcon
                    name="PersonOutline"
                    fallback={PersonOutlineIcon}
                    sx={{ fontSize: 18, color: 'text.secondary' }}
                  />
                )}
                <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}>
                  {item.name}
                </Typography>
                <Chip
                  size="small"
                  label={item.type}
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    borderRadius: 1,
                    textTransform: 'capitalize',
                  }}
                />
              </Box>
            ))
          )}
        </Box>
      </Popover>
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
              Tools Activity
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Tool action history
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
                Actions like creating, editing, and deleting tools will appear here.
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
      {/* ── Execute Tool Dialog ─────────────────────────── */}
      <Dialog
        open={executeDialogOpen}
        onClose={() => setExecuteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <Box
          sx={{
            bgcolor: alpha(theme.palette.success.main, isDark ? 0.08 : 0.04),
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
                bgcolor: alpha(theme.palette.success.main, isDark ? 0.15 : 0.1),
              }}
            >
              <AppIcon
                name="PlayArrow"
                fallback={PlayArrowIcon}
                sx={{ fontSize: 22, color: 'success.main' }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}
              >
                Execute Tool
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {executingTool?.name || 'Tool'} -{' '}
                {CONNECTION_LABELS[executingTool?.connectionType] || executingTool?.connectionType}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setExecuteDialogOpen(false)} sx={{ p: 0.5 }}>
              <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>

        <DialogContent sx={{ pt: 3 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              fontSize: '0.8rem',
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              mb: 1,
            }}
          >
            Payload (optional)
          </Typography>
          <TextField
            fullWidth
            size="small"
            multiline
            rows={4}
            placeholder={'{\n  "key": "value"\n}'}
            value={executePayload}
            onChange={(e) => setExecutePayload(e.target.value)}
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                fontFamily: 'monospace',
                fontSize: '0.85rem',
              },
            }}
            helperText="JSON payload to send with the request"
          />

          {executeResult && (
            <Box sx={{ mt: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  mb: 1,
                }}
              >
                Result
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: executeResult.success
                    ? alpha(theme.palette.success.main, 0.3)
                    : alpha(theme.palette.error.main, 0.3),
                  bgcolor: executeResult.success
                    ? alpha(theme.palette.success.main, 0.04)
                    : alpha(theme.palette.error.main, 0.04),
                }}
              >
                {executeResult.error ? (
                  <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 500 }}>
                    {executeResult.error}
                  </Typography>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={`${executeResult.result?.status} ${executeResult.result?.statusText || ''}`}
                        color={executeResult.success ? 'success' : 'error'}
                        sx={{ fontWeight: 600, fontSize: '0.7rem', height: 24 }}
                      />
                      {executeResult.result?.durationMs != null && (
                        <Chip
                          size="small"
                          label={`${executeResult.result.durationMs}ms`}
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: '0.7rem', height: 24 }}
                        />
                      )}
                    </Box>
                    <Box
                      sx={{
                        maxHeight: 200,
                        overflow: 'auto',
                        bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                        borderRadius: 1.5,
                        p: 1.5,
                      }}
                    >
                      <Typography
                        component="pre"
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.78rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          m: 0,
                        }}
                      >
                        {typeof executeResult.result?.body === 'string'
                          ? executeResult.result.body
                          : JSON.stringify(executeResult.result?.body, null, 2)}
                      </Typography>
                    </Box>
                  </>
                )}
              </Paper>
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{ px: 3, py: 2, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}
        >
          <Button
            onClick={() => setExecuteDialogOpen(false)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              color: 'text.secondary',
            }}
          >
            Close
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            color="success"
            onClick={handleExecuteTool}
            disabled={executing}
            startIcon={
              executing ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <AppIcon name="PlayArrow" fallback={PlayArrowIcon} />
              )
            }
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            {executing ? 'Running...' : 'Run'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Execution History Dialog ─────────────────────── */}
      <Dialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
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
            borderBottom: '2px solid',
            borderColor: 'divider',
            bgcolor: isDark
              ? alpha(theme.palette.info.main, 0.06)
              : alpha(theme.palette.info.main, 0.04),
          }}
        >
          <AppIcon
            name="Timeline"
            fallback={TimelineIcon}
            sx={{ color: 'info.main', fontSize: 24 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
              Execution History
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {historyTool?.name || 'Tool'} - Recent executions
            </Typography>
          </Box>
          <Chip
            label={`${executionHistory.length} runs`}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.72rem',
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.info.main, 0.1),
              color: 'info.main',
            }}
          />
          <IconButton size="small" onClick={() => setHistoryDialogOpen(false)} sx={{ p: 0.5 }}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        <DialogContent sx={{ p: 0 }}>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                Loading history...
              </Typography>
            </Box>
          ) : executionHistory.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
              <AppIcon
                name="Timeline"
                fallback={TimelineIcon}
                sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
                No executions yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Execute this tool to see results here.
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 480 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {['Status', 'Type', 'Response', 'Duration', 'Date & Time'].map((header) => (
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
                  {executionHistory.map((exec) => (
                    <TableRow key={exec.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ py: 1.25 }}>
                        <Chip
                          label={exec.status}
                          size="small"
                          color={
                            exec.status === 'success'
                              ? 'success'
                              : exec.status === 'failed'
                                ? 'error'
                                : 'default'
                          }
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.68rem',
                            borderRadius: 1.5,
                            height: 24,
                            textTransform: 'capitalize',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        <Chip
                          label={CONNECTION_LABELS[exec.connection_type] || exec.connection_type}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.68rem',
                            borderRadius: 1.5,
                            height: 22,
                          }}
                        />
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
                          {exec.response_summary?.status
                            ? `${exec.response_summary.status} ${exec.response_summary.statusText || ''}`.trim()
                            : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                        >
                          {exec.duration_ms != null ? `${exec.duration_ms}ms` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                        >
                          {formatLogDateTime(exec.created_at)}
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
            Showing last {executionHistory.length} execution
            {executionHistory.length !== 1 ? 's' : ''}
          </Typography>
          {historyTool && (
            <Button
              variant="outlined"
              color="success"
              size="small"
              startIcon={
                <AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 16 }} />
              }
              onClick={() => {
                setHistoryDialogOpen(false);
                openExecuteDialog(historyTool);
              }}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
            >
              Execute
            </Button>
          )}
          <Button
            onClick={() => setHistoryDialogOpen(false)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── MCP Tool Detail Dialog ────────────────────────── */}
      <McpToolDetail
        open={!!mcpDetailTool}
        onClose={() => setMcpDetailTool(null)}
        tool={mcpDetailTool}
        catalogEntry={mcpDetailTool ? getMcpAppById(mcpDetailTool.id) : null}
        connections={composioConnections}
        onToolUpdated={() => {
          refetch();
          fetchComposioConnections()
            .then(setComposioConnections)
            .catch(() => {});
        }}
      />
    </PageLayout>
  );
}
