/**
 * BoardList — Board listing with filters, search, table, and CRUD dialogs.
 * Extracted from ConciliumTab in AgentHub.jsx.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSimpleMode } from '../../hooks/useSimpleMode';
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
  Chip,
  IconButton,
  Tooltip,
  Button,
  TextField,
  InputAdornment,
  DialogContentText,
  Popover,
  alpha,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CloseIcon from '@mui/icons-material/Close';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import FormDialog from '../Common/FormDialog';
import EmptyState from '../Common/EmptyState';
import Pagination from '../Common/Pagination';
import usePagination from '../../hooks/usePagination';
import {
  CONCILIUM_STATUSES_LIST,
  LLM_OPTIONS_LIST,
  SECURITY_LEVELS_LIST,
} from '../../services/conciliumService';
import { logAction } from '../../services/auditLogBackend';
import { listOrganizations } from '../../services/organizationService';
import BoardForm from './BoardForm';
import BoardOrgLinkDialog from './BoardOrgLinkDialog';
import { reconcileBoardOrgs } from './reconcileBoardOrgs';

import AppIcon from '../icons/AppIcon';

// ── Status colors ────────────────────────────────────────────
const STATUS_COLORS = {
  active: { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0' },
  paused: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' },
  disbanded: { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0' },
};
const STATUS_COLORS_DARK = {
  active: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: 'rgba(34,197,94,0.2)' },
  paused: { bg: 'rgba(234,179,8,0.1)', color: '#FACC15', border: 'rgba(234,179,8,0.2)' },
  disbanded: { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8', border: 'rgba(148,163,184,0.2)' },
};

const LLM_PROVIDER_COLORS = {
  OpenAI: '#10A37F',
  Anthropic: '#D4A574',
  Groq: '#F55036',
  DeepSeek: '#5B6EF5',
  GLM: '#1E88E5',
  Gemini: '#4285F4',
};

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

const COLUMNS = [
  { id: 'id', label: 'ID', sortKey: 'id', minWidth: 160 },
  { id: 'name', label: 'Name', sortKey: 'name', minWidth: 160 },
  { id: 'quantity', label: 'Qty', sortKey: 'quantity', minWidth: 70, align: 'center' },
  { id: 'llms', label: 'LLMs', minWidth: 200 },
  { id: 'purpose', label: 'Purpose', sortKey: 'purpose', minWidth: 180 },
  { id: 'orgs', label: 'Organizations', minWidth: 150 },
  { id: 'security', label: 'Security', minWidth: 90, align: 'center' },
  { id: 'inJobs', label: 'In Jobs', minWidth: 80, align: 'center' },
  { id: 'createdBy', label: 'Created By', sortKey: 'createdByName', minWidth: 130 },
  { id: 'actions', label: '', minWidth: 80, align: 'right' },
];

const EMPTY_FORM = {
  name: '',
  purpose: '',
  status: 'active',
  llms: [],
  workingOn: [],
  description: '',
  securityLevel: 'standard',
};

function daysAtWork(startedAt) {
  if (!startedAt) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24))
  );
}

const formatLogDateTime = (ts) => {
  if (!ts) return '—';
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

const SECURITY_LEVEL_COLORS = {
  minimal: { bg: '#F1F5F9', color: '#64748B' },
  standard: { bg: '#DBEAFE', color: '#2563EB' },
  strict: { bg: '#FEF3C7', color: '#D97706' },
  paranoid: { bg: '#FEE2E2', color: '#DC2626' },
};

export default function BoardList({
  concilium,
  addConcilium,
  editConcilium,
  removeConcilium,
  jobs,
  user,
  theme,
  isDark,
  openActivityLog,
  focusBoardId = null,
}) {
  // ── Filter state
  const [search, setSearch] = useState('');

  // Deep-link from the Home Consilium tile: pre-filter to the org's board.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (focusedRef.current || !focusBoardId) return;
    const board = (concilium || []).find(
      (c) => c.id === focusBoardId || c.consilium_id === focusBoardId
    );
    if (board) {
      setSearch(board.name || '');
      focusedRef.current = true;
    }
  }, [focusBoardId, concilium]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // ── View mode (card / table), remembered across visits
  const { simpleMode } = useSimpleMode();
  const [viewMode, setViewMode] = useState(() => {
    // Soft default: simple mode prefers the card/block view; advanced keeps table.
    // An explicitly saved choice always wins.
    const fallback = simpleMode ? 'card' : 'table';
    if (typeof window === 'undefined') return fallback;
    const v = localStorage.getItem('concilium.boards.view');
    return v === 'card' || v === 'table' ? v : fallback;
  });
  const changeViewMode = useCallback((mode) => {
    if (!mode) return;
    setViewMode(mode);
    try {
      localStorage.setItem('concilium.boards.view', mode);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Sort
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('createdAt');

  // ── Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConc, setEditingConc] = useState(null);
  const [saving, setSaving] = useState(false);

  // ── Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── In Jobs dialog
  const [inJobsDialog, setInJobsDialog] = useState({ open: false, conc: null });
  const [inJobsSearch, setInJobsSearch] = useState('');

  // ── Change Log dialog
  const [changeLogDialog, setChangeLogDialog] = useState({ open: false, conc: null });
  const [linkOrgConc, setLinkOrgConc] = useState(null);

  // Organizations (for the board form's multi-select + the table's Orgs column).
  // The link is one-way on organizations.consilium_id, so this is the source of truth.
  const [orgs, setOrgs] = useState([]);
  const orgsMountedRef = useRef(false);
  const orgLoadGenerationRef = useRef(0);
  const loadOrgs = useCallback(async () => {
    const generation = ++orgLoadGenerationRef.current;
    let nextOrgs = [];
    try {
      const data = await listOrganizations();
      nextOrgs = Array.isArray(data) ? data : [];
    } catch {
      // Keep the board list usable when organizations cannot be loaded.
    }

    // Ignore requests that finished after unmount or after a newer refresh. Besides
    // preventing stale data, this avoids dispatching React state after page/test teardown.
    if (!orgsMountedRef.current || generation !== orgLoadGenerationRef.current) return;
    setOrgs(nextOrgs);
  }, []);
  useEffect(() => {
    orgsMountedRef.current = true;
    void loadOrgs();
    return () => {
      orgsMountedRef.current = false;
      orgLoadGenerationRef.current += 1;
    };
  }, [loadOrgs]);

  const openCreateDialog = () => {
    setEditingConc(null);
    setDialogOpen(true);
  };
  const openEditDialog = (conc) => {
    setEditingConc(conc);
    setDialogOpen(true);
  };

  // Deep link: /consilium?action=create opens the create-board dialog on mount
  // (used by the Home "Explain?" tour CTA). Ref-guarded so it fires once.
  const [searchParams, setSearchParams] = useSearchParams();
  const actionHandled = useRef(false);
  useEffect(() => {
    if (actionHandled.current) return;
    if (searchParams.get('action') === 'create') {
      actionHandled.current = true;
      openCreateDialog();
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSave = useCallback(
    async (form, orgIds) => {
      if (saving) return;
      setSaving(true);
      try {
        let boardId = editingConc?.id || null;
        if (editingConc) {
          await editConcilium(editingConc.id, form, user?.email || 'Unknown');
          logAction({
            action: 'Concilium updated',
            entity: 'Concilium',
            entityId: editingConc.id,
            details: `Updated concilium "${form.name}"`,
            meta: { source: 'agentHub', importance: 'medium', tags: ['update', 'concilium'] },
          }).catch(() => {});
        } else {
          const created = await addConcilium({
            ...form,
            createdById: user?.id || null,
            createdByName: user?.email || 'Unknown',
          });
          if (created) {
            boardId = created.id;
            logAction({
              action: 'Concilium created',
              entity: 'Concilium',
              entityId: created.id,
              details: `Created concilium "${form.name}"`,
              meta: { source: 'agentHub', importance: 'medium', tags: ['create', 'concilium'] },
            }).catch(() => {});
          }
        }
        // Reconcile the org links chosen in the form (one-way on organizations.consilium_id).
        if (boardId && Array.isArray(orgIds)) {
          await reconcileBoardOrgs(boardId, orgIds, orgs);
          await loadOrgs();
        }
        setDialogOpen(false);
      } catch (err) {
        console.error('Failed to save concilium:', err);
      } finally {
        setSaving(false);
      }
    },
    [editingConc, saving, editConcilium, addConcilium, user, orgs, loadOrgs]
  );

  const handleSort = (sortKey) => {
    const isAsc = orderBy === sortKey && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(sortKey);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    await removeConcilium(deleteConfirm.id);
    logAction({
      action: 'Concilium deleted',
      entity: 'Concilium',
      entityId: deleteConfirm.id,
      details: `Deleted concilium "${deleteConfirm.name}"`,
      meta: { source: 'agentHub', importance: 'high', tags: ['delete', 'concilium'] },
    }).catch(() => {});
    setDeleteConfirm(null);
  }, [deleteConfirm, removeConcilium]);

  // ── Derived data
  const filtered = useMemo(() => {
    let list = [...concilium];
    if (statusFilter !== 'All') list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.id || '').toLowerCase().includes(q) ||
          (c.name || '').toLowerCase().includes(q) ||
          (c.purpose || '').toLowerCase().includes(q) ||
          (c.createdByName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [concilium, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA = a[orderBy];
      let valB = b[orderBy];
      if (orderBy === 'quantity') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = valA || '';
        valB = valB || '';
      }
      if (valB < valA) return order === 'desc' ? -1 : 1;
      if (valB > valA) return order === 'desc' ? 1 : -1;
      return 0;
    });
  }, [filtered, order, orderBy]);

  const pagination = usePagination(sorted, {
    surfaceId: 'concilium.boards',
    defaultRowsPerPage: 10,
    resetOn: [search, statusFilter, order, orderBy],
  });
  const paginated = pagination.paginatedData;

  const getJobCountForConc = (concId) => jobs.filter((j) => j.conciliumId === concId).length;
  const getJobsForConc = (concId) => jobs.filter((j) => j.conciliumId === concId);
  const orgsForBoard = (boardId) => orgs.filter((o) => o.consilium_id === boardId);

  const OrgChips = ({ boardId }) => {
    const linked = orgsForBoard(boardId);
    if (!linked.length)
      return (
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          —
        </Typography>
      );
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {linked.slice(0, 3).map((o) => (
          <Chip
            key={o.id}
            label={o.name || o.id}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600 }}
          />
        ))}
        {linked.length > 3 && (
          <Chip
            label={`+${linked.length - 3}`}
            size="small"
            sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600 }}
          />
        )}
      </Box>
    );
  };

  return (
    <>
      {/* ── Toolbar */}
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
        <Tooltip title="Filter" placement="bottom" arrow>
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
              name="TuneRounded"
              fallback={TuneRoundedIcon}
              sx={{ fontSize: 20, color: 'text.secondary' }}
            />
          </IconButton>
        </Tooltip>
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
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          onChange={(_, v) => changeViewMode(v)}
          aria-label="View mode"
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
          <ToggleButton value="table" aria-label="Table view">
            <AppIcon name="ViewList" fallback={ViewListIcon} sx={{ fontSize: 20 }} />
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          size="small"
          onClick={openCreateDialog}
          aria-label="New Board"
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, minWidth: 0, px: 1 }}
        >
          <AppIcon name="Add" fallback={AddIcon} />
        </Button>
      </Box>
      {/* ── Filter Popover */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              p: 0,
              borderRadius: 3,
              minWidth: 340,
              maxWidth: 400,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
            },
          },
        }}
      >
        <Box sx={{ px: 2.5, pt: 2.5, pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AppIcon
              name="TuneRounded"
              fallback={TuneRoundedIcon}
              sx={{ fontSize: 18, color: 'primary.main' }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Filter Boards
            </Typography>
          </Box>
        </Box>
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search..."
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
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => {
                setStatusFilter(e.target.value);
              }}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="All" sx={{ fontWeight: 700, color: 'primary.main' }}>
                All Statuses
              </MenuItem>
              {CONCILIUM_STATUSES_LIST.map((s) => (
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
            onClick={() => {
              setSearch('');
              setStatusFilter('All');
            }}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: 'divider',
            }}
          >
            Reset
          </Button>
        </Box>
      </Popover>
      {/* ── Content */}
      {filtered.length === 0 ? (
        <Box sx={{ p: 4 }}>
          <EmptyState
            icon={GroupsOutlinedIcon}
            title="No boards found"
            description={
              search || statusFilter !== 'All'
                ? 'Try adjusting your filters.'
                : 'Create your first board to get started.'
            }
            actionLabel="New Board"
            onAction={openCreateDialog}
          />
        </Box>
      ) : (
        <>
          {viewMode === 'card' ? (
            <Box
              data-testid="boards-card-view"
              sx={{
                p: 1.5,
                overflowY: 'auto',
                maxHeight: 'calc(100vh - 420px)',
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
              }}
            >
              {paginated.map((conc) => {
                const sc =
                  (isDark ? STATUS_COLORS_DARK : STATUS_COLORS)[conc.status] ||
                  (isDark ? STATUS_COLORS_DARK : STATUS_COLORS).active;
                const jobCount = getJobCountForConc(conc.id);
                const secColor =
                  SECURITY_LEVEL_COLORS[conc.securityLevel] || SECURITY_LEVEL_COLORS.standard;
                return (
                  <Box
                    key={conc.id}
                    onClick={() => openEditDialog(conc)}
                    sx={{
                      p: 1.75,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      transition: 'border-color 150ms ease, box-shadow 150ms ease',
                      '&:hover': {
                        borderColor: 'primary.main',
                        boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.12)}`,
                      },
                    }}
                  >
                    {/* Header: name + status, actions */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                          {conc.name}
                        </Typography>
                        <Chip
                          label={conc.status}
                          size="small"
                          sx={{
                            height: 20,
                            fontWeight: 600,
                            fontSize: '0.6rem',
                            textTransform: 'capitalize',
                            mt: 0.5,
                            bgcolor: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Change log">
                          <IconButton
                            size="small"
                            onClick={() => setChangeLogDialog({ open: true, conc })}
                          >
                            <AppIcon
                              name="History"
                              fallback={HistoryIcon}
                              sx={{
                                fontSize: 17,
                                color:
                                  (conc.changeLog?.length || 0) > 0
                                    ? 'primary.main'
                                    : 'text.disabled',
                              }}
                            />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Link organizations">
                          <IconButton size="small" onClick={() => setLinkOrgConc(conc)}>
                            <AppIcon
                              name="CorporateFareOutlined"
                              fallback={CorporateFareOutlinedIcon}
                              sx={{ fontSize: 17 }}
                            />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEditDialog(conc)}>
                            <AppIcon
                              name="EditOutlined"
                              fallback={EditOutlinedIcon}
                              sx={{ fontSize: 17 }}
                            />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteConfirm(conc)}
                            sx={{ color: 'error.main' }}
                          >
                            <AppIcon
                              name="DeleteOutline"
                              fallback={DeleteOutlineIcon}
                              sx={{ fontSize: 17 }}
                            />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                    {/* ID */}
                    <Tooltip title={conc.id}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: 'monospace',
                          color: 'text.secondary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conc.id}
                      </Typography>
                    </Tooltip>
                    {/* LLMs */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(conc.llms || []).slice(0, 4).map((llm) => (
                        <Chip
                          key={llm.id}
                          label={llm.name}
                          size="small"
                          sx={{
                            height: 22,
                            fontWeight: 600,
                            fontSize: '0.65rem',
                            bgcolor: alpha(
                              LLM_PROVIDER_COLORS[llm.provider] || '#888',
                              isDark ? 0.15 : 0.1
                            ),
                            color: LLM_PROVIDER_COLORS[llm.provider] || 'text.secondary',
                            border: `1px solid ${alpha(LLM_PROVIDER_COLORS[llm.provider] || '#888', 0.3)}`,
                          }}
                        />
                      ))}
                      {(conc.llms || []).length > 4 && (
                        <Chip
                          label={`+${conc.llms.length - 4}`}
                          size="small"
                          sx={{ height: 22, fontWeight: 600, fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                    {/* Purpose */}
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        minHeight: 32,
                      }}
                    >
                      {conc.purpose || '—'}
                    </Typography>
                    {/* Organizations governed by this board */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AppIcon
                        name="CorporateFareOutlined"
                        fallback={CorporateFareOutlinedIcon}
                        sx={{ fontSize: 14, color: 'text.disabled' }}
                      />
                      <OrgChips boardId={conc.id} />
                    </Box>
                    {/* Footer: security, qty, jobs, created by */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
                        pt: 0.5,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Chip
                        label={conc.securityLevel || 'standard'}
                        size="small"
                        sx={{
                          height: 20,
                          fontWeight: 600,
                          fontSize: '0.6rem',
                          textTransform: 'capitalize',
                          bgcolor: secColor.bg,
                          color: secColor.color,
                        }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        <b>{conc.quantity || conc.llms?.length || 0}</b> LLMs
                      </Typography>
                      {jobCount > 0 ? (
                        <Chip
                          size="small"
                          label={`${jobCount} jobs`}
                          clickable
                          onClick={(e) => {
                            e.stopPropagation();
                            setInJobsDialog({ open: true, conc });
                            setInJobsSearch('');
                          }}
                          sx={{ height: 20, fontWeight: 700, fontSize: '0.65rem' }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          0 jobs
                        </Typography>
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                        <AppIcon
                          name="PersonOutline"
                          fallback={PersonOutlineIcon}
                          sx={{ fontSize: 15, color: 'text.secondary' }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 110,
                          }}
                        >
                          {conc.createdByName || 'System'}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 'calc(100vh - 420px)', flex: 1, overflowX: 'auto' }}>
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
                  {paginated.map((conc) => {
                    const sc =
                      (isDark ? STATUS_COLORS_DARK : STATUS_COLORS)[conc.status] ||
                      (isDark ? STATUS_COLORS_DARK : STATUS_COLORS).active;
                    const jobCount = getJobCountForConc(conc.id);
                    const secColor =
                      SECURITY_LEVEL_COLORS[conc.securityLevel] || SECURITY_LEVEL_COLORS.standard;
                    return (
                      <TableRow
                        key={conc.id}
                        hover
                        sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                        onClick={() => openEditDialog(conc)}
                      >
                        <TableCell>
                          <Tooltip title={conc.id}>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                fontFamily: 'monospace',
                                color: 'text.secondary',
                              }}
                            >
                              {conc.id.length > 18 ? `${conc.id.slice(0, 18)}...` : conc.id}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {conc.name}
                          </Typography>
                          <Chip
                            label={conc.status}
                            size="small"
                            sx={{
                              height: 20,
                              fontWeight: 600,
                              fontSize: '0.6rem',
                              textTransform: 'capitalize',
                              mt: 0.25,
                              bgcolor: sc.bg,
                              color: sc.color,
                              border: `1px solid ${sc.border}`,
                            }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {conc.quantity || conc.llms?.length || 0}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {(conc.llms || []).slice(0, 3).map((llm) => (
                              <Chip
                                key={llm.id}
                                label={llm.name}
                                size="small"
                                sx={{
                                  height: 22,
                                  fontWeight: 600,
                                  fontSize: '0.65rem',
                                  bgcolor: alpha(
                                    LLM_PROVIDER_COLORS[llm.provider] || '#888',
                                    isDark ? 0.15 : 0.1
                                  ),
                                  color: LLM_PROVIDER_COLORS[llm.provider] || 'text.secondary',
                                  border: `1px solid ${alpha(LLM_PROVIDER_COLORS[llm.provider] || '#888', 0.3)}`,
                                }}
                              />
                            ))}
                            {(conc.llms || []).length > 3 && (
                              <Chip
                                label={`+${conc.llms.length - 3}`}
                                size="small"
                                sx={{ height: 22, fontWeight: 600, fontSize: '0.65rem' }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={conc.purpose}>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                maxWidth: 220,
                              }}
                            >
                              {conc.purpose || '—'}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <OrgChips boardId={conc.id} />
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={conc.securityLevel || 'standard'}
                            size="small"
                            sx={{
                              height: 20,
                              fontWeight: 600,
                              fontSize: '0.6rem',
                              textTransform: 'capitalize',
                              bgcolor: secColor.bg,
                              color: secColor.color,
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          {jobCount > 0 ? (
                            <Chip
                              size="small"
                              label={jobCount}
                              clickable
                              onClick={() => {
                                setInJobsDialog({ open: true, conc });
                                setInJobsSearch('');
                              }}
                              sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              0
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
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
                              {conc.createdByName || 'System'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="Change log">
                              <IconButton
                                size="small"
                                onClick={() => setChangeLogDialog({ open: true, conc })}
                              >
                                <AppIcon
                                  name="History"
                                  fallback={HistoryIcon}
                                  sx={{
                                    fontSize: 18,
                                    color:
                                      (conc.changeLog?.length || 0) > 0
                                        ? 'primary.main'
                                        : 'text.disabled',
                                  }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Link organizations">
                              <IconButton size="small" onClick={() => setLinkOrgConc(conc)}>
                                <AppIcon
                                  name="CorporateFareOutlined"
                                  fallback={CorporateFareOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => openEditDialog(conc)}>
                                <AppIcon
                                  name="EditOutlined"
                                  fallback={EditOutlinedIcon}
                                  sx={{ fontSize: 18 }}
                                />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                onClick={() => setDeleteConfirm(conc)}
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
          )}
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
            label="boards"
          />
        </>
      )}
      {/* ── In Jobs Dialog */}
      <FormDialog
        open={inJobsDialog.open}
        onClose={() => setInJobsDialog({ open: false, conc: null })}
        title={`Jobs using "${inJobsDialog.conc?.name || ''}"`}
        icon={WorkOutlineIcon}
        maxWidth="md"
        hideFooter
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search jobs..."
          value={inJobsSearch}
          onChange={(e) => setInJobsSearch(e.target.value)}
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
        {(() => {
          const concJobs = inJobsDialog.conc ? getJobsForConc(inJobsDialog.conc.id) : [];
          const q = inJobsSearch.toLowerCase().trim();
          const fj = q
            ? concJobs.filter(
                (j) =>
                  (j.id || '').toLowerCase().includes(q) ||
                  (j.description || '').toLowerCase().includes(q) ||
                  (j.status || '').toLowerCase().includes(q)
              )
            : concJobs;
          return fj.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}
            >
              No jobs found.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Job ID</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Agent</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fj.map((j) => {
                  const jsc = (isDark ? JOB_STATUS_COLORS_DARK : JOB_STATUS_COLORS)[j.status] || {};
                  return (
                    <TableRow key={j.id}>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {j.id.slice(0, 20)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {j.description?.slice(0, 60)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={j.status}
                          size="small"
                          sx={{
                            height: 22,
                            fontWeight: 600,
                            fontSize: '0.65rem',
                            bgcolor: jsc.bg,
                            color: jsc.color,
                            border: `1px solid ${jsc.border || 'transparent'}`,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{j.assignedAgentName || '—'}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          );
        })()}
      </FormDialog>
      {/* ── Change Log Dialog */}
      <FormDialog
        open={changeLogDialog.open}
        onClose={() => setChangeLogDialog({ open: false, conc: null })}
        title="Change Log"
        subtitle={changeLogDialog.conc?.name}
        icon={HistoryIcon}
        maxWidth="md"
        hideFooter
      >
        {(() => {
          const logs = changeLogDialog.conc?.changeLog || [];
          return logs.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}
            >
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
                {[...logs].reverse().map((entry, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Chip
                        label={entry.action}
                        size="small"
                        color="info"
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
                          {entry.userName || '—'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {formatLogDateTime(entry.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {entry.details}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          );
        })()}
      </FormDialog>
      {/* ── Board Form Dialog */}
      <BoardForm
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        editing={editingConc}
        saving={saving}
        theme={theme}
        isDark={isDark}
        orgs={orgs}
        onShowLog={(conc) => {
          setDialogOpen(false);
          setChangeLogDialog({ open: true, conc });
        }}
      />
      {/* ── Delete Confirmation */}
      <FormDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Board?"
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
          Are you sure you want to delete &quot;{deleteConfirm?.name}&quot;? This action cannot be
          undone.
        </DialogContentText>
      </FormDialog>
      {/* ── Link organizations to this board ── */}
      <BoardOrgLinkDialog
        open={Boolean(linkOrgConc)}
        board={linkOrgConc}
        onClose={() => setLinkOrgConc(null)}
        onChanged={loadOrgs}
      />
    </>
  );
}
