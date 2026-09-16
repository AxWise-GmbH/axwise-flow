import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  Grid,
  IconButton,
  Tooltip,
  DialogContentText,
  DialogActions,
  Drawer,
  TextField,
  InputAdornment,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  useTheme,
  Tabs,
  Tab,
  MenuItem,
  alpha,
  useMediaQuery,
  Popover,
  FormControl,
  InputLabel,
  Select,
  Menu,
  ListItemIcon,
  ListItemText,
  Collapse,
  Switch,
  FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import LinkIcon from '@mui/icons-material/Link';
import HistoryIcon from '@mui/icons-material/History';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PageLayout from '../../components/Common/PageLayout';
import FormDialog from '../../components/Common/FormDialog';
import BentoCard from '../../components/Common/BentoCard';
import WorkflowLetsTalkDialog from './components/WorkflowLetsTalkDialog';
import {
  getAllWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  toggleWorkflowEnabled,
} from '../../services/workflowService';
import { logAction, loadAuditLogs, buildAgentMeta } from '../../services/auditLogBackend';
import WorkflowDrawer from './components/WorkflowDrawer';
import CreateWorkflowNameDialog from './components/CreateWorkflowNameDialog';
import SaveAsTemplateDialog, {
  loadCustomTemplates,
  deleteCustomTemplate,
  updateCustomTemplate,
  EditTemplateDialog,
} from './components/SaveAsTemplateDialog';
import WorkflowCanvas from './visual/WorkflowCanvas';
import PlaygroundCanvas from './visual/PlaygroundCanvas';
import RunWorkflowDialog from '../../components/WorkflowExecution/RunWorkflowDialog';
import ExecutionTracePanel from '../../components/WorkflowExecution/ExecutionTracePanel';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import WorkflowOptionsContext from './visual/WorkflowOptionsContext';
import { WORKFLOW_TEMPLATES, TEMPLATE_CATEGORIES } from './visual/workflowTemplates';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { getGoal } from '../../services/goalService';
import GoalPhaseDrawer from './components/GoalPhaseDrawer';
import EntityInfoBadge from '../../components/Common/EntityInfoBadge';
import { useNotifications } from '../../context/NotificationContext';
import { useProjects } from '../../hooks/useProjects';
import { usePartners } from '../../hooks/usePartners';
import { useAuth } from '../../context/AuthContext';
import { usePartnerAccessOptional } from '../../context/PartnerAccessContext';
import { FUNNEL_BLOCKS } from './visual/blockLibrary';
import CategoryIcon from '@mui/icons-material/Category';
import CheckIcon from '@mui/icons-material/Check';
import CasinoIcon from '@mui/icons-material/Casino';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';

import AppIcon from '../../components/icons/AppIcon';

/* ------------------------------------------------------------------ */
/*  Tab-level constants                                                */
/* ------------------------------------------------------------------ */
const TAB_WORKFLOW = 0;
const TAB_TEMPLATES = 1;
const TAB_PLAYGROUND = 2;

const WORKFLOW_CATEGORY_ICONS = {
  Gambling: CasinoIcon,
  'E-Commerce': ShoppingCartOutlinedIcon,
  Travel: FlightTakeoffIcon,
};
function getWorkflowCategoryIcon(cat) {
  return WORKFLOW_CATEGORY_ICONS[cat] || LabelOutlinedIcon;
}

/* ------------------------------------------------------------------ */
/*  Add Custom Block form (Playground)                                  */
/* ------------------------------------------------------------------ */
function AddCustomBlockForm({ existingNames = [], onCancel, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jsonConfig, setJsonConfig] = useState('');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [error, setError] = useState('');

  const jsonValid = (() => {
    if (!jsonConfig) return null;
    try {
      JSON.parse(jsonConfig);
      return true;
    } catch {
      return false;
    }
  })();

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    const isDuplicate = existingNames.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      setError('A block with this name already exists');
      return;
    }
    setError('');
    onSave(trimmed, description.trim(), jsonConfig.trim());
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        autoFocus
        fullWidth
        label="Block name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        placeholder="e.g. My step"
        error={Boolean(error)}
        helperText={error}
        slotProps={{ input: { sx: { borderRadius: 2 } } }}
      />
      <TextField
        fullWidth
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What this block does"
        multiline
        rows={2}
        slotProps={{ input: { sx: { borderRadius: 2 } } }}
      />
      {/* JSON Configuration (collapsible) */}
      <Button
        size="small"
        startIcon={
          <AppIcon
            name="DataObjectRounded"
            fallback={DataObjectRoundedIcon}
            sx={{ fontSize: 16 }}
          />
        }
        endIcon={
          <AppIcon
            name="ExpandMore"
            fallback={ExpandMoreIcon}
            sx={{
              fontSize: 16,
              transition: 'transform 0.2s',
              transform: jsonOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        }
        onClick={() => setJsonOpen((p) => !p)}
        sx={{
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.8rem',
          color: jsonConfig ? 'primary.main' : 'text.secondary',
          justifyContent: 'flex-start',
          alignSelf: 'flex-start',
        }}
      >
        Add JSON
      </Button>
      <Collapse in={jsonOpen}>
        <TextField
          fullWidth
          label="JSON Configuration"
          value={jsonConfig}
          onChange={(e) => setJsonConfig(e.target.value)}
          placeholder={'{\n  "apiKey": "...",\n  "endpoint": "..."\n}'}
          multiline
          rows={4}
          error={jsonValid === false}
          helperText={jsonValid === false ? 'Invalid JSON' : jsonValid === true ? 'Valid JSON' : ''}
          FormHelperTextProps={{
            sx: { color: jsonValid ? 'success.main' : undefined },
          }}
          slotProps={{ input: { sx: { borderRadius: 2, fontFamily: 'monospace', fontSize: 12 } } }}
        />
      </Collapse>
      <DialogActions sx={{ px: 0, pb: 0 }}>
        <Button onClick={onCancel} sx={{ textTransform: 'none', fontWeight: 600 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Add block
        </Button>
      </DialogActions>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Workflow list – shown when no workflow is being edited              */
/* ------------------------------------------------------------------ */
function WorkflowList({
  workflows,
  projects = [],
  onPlay,
  onPause,
  onEdit,
  onDelete,
  onCreate,
  onToggleProject,
  onActionLog,
  viewMode,
  setViewMode,
  currentUserId,
  isSuperAdmin,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [projectsDrawer, setProjectsDrawer] = useState({
    open: false,
    workflow: null,
    projects: [],
  });

  // Map projects by workflowId for quick lookup
  const projectsByWorkflow = useMemo(() => {
    const map = {};
    projects.forEach((p) => {
      if (!p.workflowId) return;
      if (!map[p.workflowId]) map[p.workflowId] = [];
      map[p.workflowId].push(p);
    });
    return map;
  }, [projects]);

  if (workflows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, px: 2 }}>
        <AppIcon
          name="AccountTreeOutlined"
          fallback={AccountTreeOutlinedIcon}
          sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }}
        />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          No workflows yet
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}
        >
          Create your first workflow to build funnels with landing pages, campaigns, SMS, email, and
          more.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={onCreate}
          sx={{ borderRadius: 2 }}
        >
          Create workflow
        </Button>
      </Box>
    );
  }

  const statusColors = isDark
    ? { Active: '#4ADE80', Paused: '#FACC15', Completed: '#60A5FA', Archived: '#8B949E' }
    : { Active: '#059669', Paused: '#D97706', Completed: '#2563EB', Archived: '#64748B' };

  const formatDate = (d) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  const truncateText = (value, max = 21) => {
    const text = String(value || '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  };

  return (
    <Box sx={{ overflow: 'hidden' }}>
      {/* Header removed for Enterprise Layout - handled by parent PageLayout */}
      {/* ===== GRID (Bento) VIEW - Compact, Mobile-First ===== */}
      {viewMode === 'grid' && (
        <Box
          data-tour-block="workflow-content"
          data-tour-label="Your workflows"
          sx={{
            display: 'grid',
            gap: { xs: 1, sm: 1.25, md: 1.5 },
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
              lg: 'repeat(5, 1fr)',
            },
          }}
        >
          {workflows.map((wf) => {
            const isEnabled = wf.enabled !== false;
            const wfProjects = projectsByWorkflow[wf.id] || [];
            return (
              <Paper
                key={wf.id}
                variant="outlined"
                onClick={() => onEdit(wf)}
                sx={{
                  p: { xs: 1.25, sm: 1.5 },
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.background.paper, 0.6),
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  overflow: 'hidden',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: createHoverGlowShadow(theme),
                  },
                }}
              >
                {/* Title */}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: '0.75rem', sm: '0.82rem' },
                    lineHeight: 1.3,
                    mb: 0.5,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {wf.name || 'Untitled'}
                </Typography>
                {/* Status + Visibility inline */}
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, flexWrap: 'wrap' }}
                >
                  <Chip
                    label={isEnabled ? 'Active' : 'Paused'}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 16,
                      borderRadius: 0.75,
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      borderColor: isEnabled
                        ? alpha(theme.palette.success.main, 0.3)
                        : alpha(theme.palette.warning.main, 0.3),
                      color: isEnabled ? 'success.main' : 'warning.main',
                    }}
                  />
                  <Chip
                    label={wf.visibility === 'private' ? 'Prv' : 'Pub'}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 16,
                      borderRadius: 0.75,
                      fontSize: '0.55rem',
                      fontWeight: 600,
                      borderColor: alpha(theme.palette.divider, 0.3),
                      color: 'text.disabled',
                    }}
                  />
                </Box>
                {/* Stats: blocks + version + projects */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 600 }}
                  >
                    {wf.nodes?.length || 0} blocks
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.55rem', color: 'text.disabled' }}
                  >
                    ·
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 600 }}
                  >
                    v{wf.version || 1}
                  </Typography>
                  {wfProjects.length > 0 && (
                    <>
                      <Typography
                        variant="caption"
                        sx={{ fontSize: '0.55rem', color: 'text.disabled' }}
                      >
                        ·
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontSize: '0.6rem', color: 'info.main', fontWeight: 600 }}
                      >
                        {wfProjects.length} proj
                      </Typography>
                    </>
                  )}
                </Box>
                {/* Date */}
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.5rem', color: 'text.disabled', mb: 0.75 }}
                >
                  {formatDate(wf.updatedAt)}
                </Typography>
                {/* Actions */}
                <Box
                  sx={{
                    mt: 'auto',
                    pt: 0.75,
                    borderTop: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.3),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconButton
                    size="small"
                    onClick={() => (isEnabled ? onPause(wf) : onPlay(wf))}
                    sx={{
                      p: 0.4,
                      borderRadius: 1,
                      color: isEnabled ? 'success.main' : 'warning.main',
                    }}
                  >
                    {isEnabled ? (
                      <AppIcon name="Pause" fallback={PauseIcon} sx={{ fontSize: 14 }} />
                    ) : (
                      <AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                  <Box sx={{ flex: 1 }} />
                  <IconButton
                    size="small"
                    onClick={() => onActionLog?.(wf)}
                    sx={{ p: 0.4, borderRadius: 1 }}
                  >
                    <AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 14 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => onEdit(wf)}
                    sx={{ p: 0.4, borderRadius: 1 }}
                  >
                    <AppIcon
                      name="EditOutlined"
                      fallback={EditOutlinedIcon}
                      sx={{ fontSize: 14 }}
                    />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => onDelete(wf)}
                    sx={{ p: 0.4, borderRadius: 1, '&:hover': { color: 'error.main' } }}
                  >
                    <AppIcon
                      name="DeleteOutline"
                      fallback={DeleteOutlineIcon}
                      sx={{ fontSize: 14 }}
                    />
                  </IconButton>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
      {/* ===== TABLE VIEW ===== */}
      {viewMode === 'table' && (
        <TableContainer
          component={Paper}
          variant="outlined"
          data-tour-block="workflow-content"
          data-tour-label="Your workflows"
          sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: isDark ? alpha('#fff', 0.03) : alpha('#000', 0.02) }}>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Workflow
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Status
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Visibility
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Blocks
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Projects
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Created
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Updated
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {workflows.map((wf) => {
                const isEnabled = wf.enabled !== false;
                const wfProjects = projectsByWorkflow[wf.id] || [];
                return (
                  <TableRow
                    key={wf.id}
                    hover
                    onClick={() => onEdit(wf)}
                    sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                  >
                    {/* Name */}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="AccountTreeOutlined"
                          fallback={AccountTreeOutlinedIcon}
                          sx={{ fontSize: 18, color: 'primary.main' }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                          {wf.name || 'Untitled'}
                        </Typography>
                      </Box>
                    </TableCell>
                    {/* Status */}
                    <TableCell>
                      <Chip
                        label={isEnabled ? 'Active' : 'Paused'}
                        size="small"
                        sx={{
                          height: 22,
                          borderRadius: 1.5,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          bgcolor: isEnabled
                            ? alpha(theme.palette.success.main, 0.1)
                            : alpha(theme.palette.warning.main, 0.1),
                          color: isEnabled ? 'success.main' : 'warning.main',
                        }}
                      />
                    </TableCell>
                    {/* Visibility */}
                    <TableCell>
                      {wf.visibility === 'private' ? (
                        <Tooltip
                          title={
                            isSuperAdmin && wf.createdBy !== currentUserId
                              ? `Private\nUser ID: ${wf.createdBy || '-'}\nEmail: ${wf.updatedByEmail || '-'}`
                              : 'Only visible to you'
                          }
                          arrow
                        >
                          <Chip
                            icon={
                              <AppIcon
                                name="LockOutlined"
                                fallback={LockOutlinedIcon}
                                sx={{ fontSize: 12 }}
                              />
                            }
                            label="Private"
                            size="small"
                            sx={{
                              height: 22,
                              borderRadius: 1.5,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              bgcolor: alpha(theme.palette.warning.main, 0.1),
                              color: 'warning.main',
                              '& .MuiChip-icon': { ml: 0.3, color: 'warning.main' },
                            }}
                          />
                        </Tooltip>
                      ) : (
                        <Chip
                          icon={
                            <AppIcon
                              name="PublicRounded"
                              fallback={PublicRoundedIcon}
                              sx={{ fontSize: 12 }}
                            />
                          }
                          label="Public"
                          size="small"
                          sx={{
                            height: 22,
                            borderRadius: 1.5,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            bgcolor: alpha(theme.palette.info.main, 0.06),
                            color: alpha(theme.palette.text.secondary, 0.7),
                            '& .MuiChip-icon': {
                              ml: 0.3,
                              color: alpha(theme.palette.text.secondary, 0.5),
                            },
                          }}
                        />
                      )}
                    </TableCell>
                    {/* Blocks */}
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.82rem', color: 'text.secondary' }}
                      >
                        {wf.nodes?.length || 0}
                      </Typography>
                    </TableCell>
                    {/* Projects */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {wfProjects.length === 0 ? (
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.disabled', fontSize: '0.72rem' }}
                        >
                          -
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {/* Show first project inline */}
                          {(() => {
                            const first = wfProjects[0];
                            const c = statusColors[first.status] || statusColors.Active;
                            const isActive = first.status === 'Active';
                            return (
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.3,
                                  py: 0.2,
                                  px: 0.6,
                                  borderRadius: 1,
                                  bgcolor: isDark ? alpha(c, 0.08) : alpha(c, 0.05),
                                  border: '1px solid',
                                  borderColor: isDark ? alpha(c, 0.18) : alpha(c, 0.12),
                                }}
                              >
                                <AppIcon
                                  name="FolderOutlined"
                                  fallback={FolderOutlinedIcon}
                                  sx={{ fontSize: 12, color: c }}
                                />
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 600,
                                    fontSize: '0.65rem',
                                    color: c,
                                    maxWidth: 90,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {first.name}
                                </Typography>
                                <Tooltip title={isActive ? 'Pause' : 'Activate'}>
                                  <IconButton
                                    size="small"
                                    onClick={() => onToggleProject?.(first)}
                                    sx={{
                                      p: 0.15,
                                      color: isActive ? 'warning.main' : 'success.main',
                                    }}
                                  >
                                    {isActive ? (
                                      <AppIcon
                                        name="Pause"
                                        fallback={PauseIcon}
                                        sx={{ fontSize: 13 }}
                                      />
                                    ) : (
                                      <AppIcon
                                        name="PlayArrow"
                                        fallback={PlayArrowIcon}
                                        sx={{ fontSize: 13 }}
                                      />
                                    )}
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            );
                          })()}
                          {/* "View all" button when more than 1 project */}
                          {wfProjects.length > 1 && (
                            <Button
                              size="small"
                              variant="text"
                              onClick={() =>
                                setProjectsDrawer({
                                  open: true,
                                  workflow: wf,
                                  projects: wfProjects,
                                })
                              }
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: '0.65rem',
                                minWidth: 'auto',
                                px: 0.75,
                                py: 0.2,
                                borderRadius: 1,
                                color: 'primary.main',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              +{wfProjects.length - 1} more
                            </Button>
                          )}
                        </Box>
                      )}
                    </TableCell>
                    {/* Created */}
                    <TableCell>
                      <Typography
                        variant="caption"
                        sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
                      >
                        {formatDate(wf.createdAt)}
                      </Typography>
                    </TableCell>
                    {/* Updated */}
                    <TableCell>
                      <Typography
                        variant="caption"
                        sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
                      >
                        {formatDate(wf.updatedAt)}
                      </Typography>
                    </TableCell>
                    {/* Actions */}
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title={isEnabled ? 'Pause' : 'Activate'}>
                          <IconButton
                            size="small"
                            onClick={() => (isEnabled ? onPause(wf) : onPlay(wf))}
                            sx={{ p: 0.5 }}
                          >
                            {isEnabled ? (
                              <AppIcon name="Pause" fallback={PauseIcon} sx={{ fontSize: 18 }} />
                            ) : (
                              <AppIcon
                                name="PlayArrow"
                                fallback={PlayArrowIcon}
                                sx={{ fontSize: 18 }}
                              />
                            )}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => onEdit(wf)} sx={{ p: 0.5 }}>
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
                            onClick={() => onDelete(wf)}
                            sx={{ p: 0.5, color: 'error.main' }}
                          >
                            <AppIcon
                              name="DeleteOutline"
                              fallback={DeleteOutlineIcon}
                              sx={{ fontSize: 18 }}
                            />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Action Log">
                          <IconButton
                            size="small"
                            onClick={() => onActionLog?.(wf)}
                            sx={{ p: 0.5, color: 'primary.main' }}
                          >
                            <AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 18 }} />
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
      {/* ===== Projects sidebar drawer ===== */}
      <Drawer
        anchor="right"
        open={projectsDrawer.open}
        onClose={() => setProjectsDrawer({ open: false, workflow: null, projects: [] })}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 380 },
            borderRadius: { xs: 0, sm: '12px 0 0 12px' },
            bgcolor: 'background.paper',
          },
        }}
      >
        {/* Header */}
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
          <AppIcon
            name="FolderOutlined"
            fallback={FolderOutlinedIcon}
            sx={{ color: 'primary.main', fontSize: 22 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}
            >
              Projects
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {projectsDrawer.workflow?.name || 'Workflow'}
            </Typography>
          </Box>
          <Chip
            label={`${projectsDrawer.projects.length}`}
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.75rem', borderRadius: 1.5 }}
          />
          <IconButton
            size="small"
            onClick={() => setProjectsDrawer({ open: false, workflow: null, projects: [] })}
            sx={{ p: 0.5 }}
          >
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* Project list */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {projectsDrawer.projects.map((proj) => {
              const c = statusColors[proj.status] || statusColors.Active;
              const isActive = proj.status === 'Active';
              return (
                <Box
                  key={proj.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 1,
                    px: 1.5,
                    borderRadius: 2,
                    bgcolor: isDark ? alpha(c, 0.06) : alpha(c, 0.03),
                    border: '1px solid',
                    borderColor: isDark ? alpha(c, 0.15) : alpha(c, 0.1),
                    transition: 'all 0.15s',
                    '&:hover': { bgcolor: isDark ? alpha(c, 0.1) : alpha(c, 0.06) },
                  }}
                >
                  <AppIcon
                    name="FolderOutlined"
                    fallback={FolderOutlinedIcon}
                    sx={{ fontSize: 18, color: c, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        color: c,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {proj.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.25 }}>
                      {proj.partnerName && (
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.65rem', color: 'text.secondary' }}
                        >
                          {proj.partnerName}
                        </Typography>
                      )}
                      {proj.teamName && (
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.65rem', color: 'text.disabled' }}
                        >
                          · {proj.teamName}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Chip
                    label={proj.status}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      borderRadius: 1,
                      color: c,
                      bgcolor: isDark ? alpha(c, 0.12) : alpha(c, 0.08),
                      flexShrink: 0,
                    }}
                  />
                  <Tooltip title={isActive ? 'Pause project' : 'Activate project'}>
                    <IconButton
                      size="small"
                      onClick={() => onToggleProject?.(proj)}
                      sx={{
                        p: 0.5,
                        flexShrink: 0,
                        color: isActive ? 'warning.main' : 'success.main',
                        '&:hover': {
                          bgcolor: isActive
                            ? alpha(theme.palette.warning.main, 0.12)
                            : alpha(theme.palette.success.main, 0.12),
                        },
                      }}
                    >
                      {isActive ? (
                        <AppIcon name="Pause" fallback={PauseIcon} sx={{ fontSize: 18 }} />
                      ) : (
                        <AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 18 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Templates tab – gallery of pre-built workflow templates             */
/* ------------------------------------------------------------------ */
function TemplatesTab({
  onUseTemplate,
  customTemplates,
  onEditCustomTemplate,
  onDeleteCustomTemplate,
}) {
  const theme = useTheme();
  const [filterCategory, setFilterCategory] = useState('all');

  const allTemplates = [...WORKFLOW_TEMPLATES, ...(customTemplates || [])];
  const filtered =
    filterCategory === 'all'
      ? allTemplates
      : allTemplates.filter((t) => t.category === filterCategory);

  return (
    <Box sx={{ width: '100%' }}>
      {/* Category filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          label="All"
          size="small"
          onClick={() => setFilterCategory('all')}
          variant={filterCategory === 'all' ? 'filled' : 'outlined'}
          sx={{
            borderRadius: 1.5,
            fontWeight: 600,
            fontSize: '0.75rem',
            ...(filterCategory === 'all'
              ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
              : {}),
          }}
        />
        {TEMPLATE_CATEGORIES.map((cat) => (
          <Chip
            key={cat.id}
            label={cat.label}
            size="small"
            onClick={() => setFilterCategory(cat.id)}
            variant={filterCategory === cat.id ? 'filled' : 'outlined'}
            sx={{
              borderRadius: 1.5,
              fontWeight: 600,
              fontSize: '0.75rem',
              ...(filterCategory === cat.id
                ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
                : {}),
            }}
          />
        ))}
      </Box>
      {/* Card grid: multiple cards per row using CSS Grid */}
      <Box
        sx={{
          display: 'grid',
          width: '100%',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
        }}
      >
        {filtered.map((tpl) => {
          const category = TEMPLATE_CATEGORIES.find((c) => c.id === tpl.category);
          return (
            <Paper
              key={tpl.id}
              variant="outlined"
              sx={{
                p: 0,
                width: '100%',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.background.paper, 0.8),
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                minWidth: 0,
                '&:hover': {
                  borderColor: 'primary.main',
                  boxShadow: createHoverGlowShadow(theme),
                },
              }}
            >
              {/* Compact header: title + chips + actions */}
              <Box
                sx={{
                  px: 1.5,
                  py: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.primary.main, 0.03),
                }}
              >
                <AppIcon
                  name="AutoAwesomeOutlined"
                  fallback={AutoAwesomeOutlinedIcon}
                  sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }}
                />
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tpl.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  {tpl.isCustom && (
                    <Chip
                      label="Custom"
                      size="small"
                      sx={{
                        borderRadius: 1,
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        height: 20,
                        py: 0,
                      }}
                    />
                  )}
                  {category && (
                    <Chip
                      label={category.label}
                      size="small"
                      sx={{
                        borderRadius: 1,
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        height: 20,
                        py: 0,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                      }}
                    />
                  )}
                  <Chip
                    label={`${tpl.blockCount}`}
                    size="small"
                    sx={{
                      borderRadius: 1,
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      height: 20,
                      minWidth: 24,
                      py: 0,
                      bgcolor: alpha(theme.palette.text.primary, 0.06),
                      color: 'text.secondary',
                    }}
                  />
                </Box>
                {tpl.isCustom && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    <Tooltip title="Edit template">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditCustomTemplate?.(tpl);
                        }}
                        sx={{
                          p: 0.4,
                          color: 'text.secondary',
                          '&:hover': {
                            color: 'primary.main',
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                          },
                        }}
                      >
                        <AppIcon
                          name="EditOutlined"
                          fallback={EditOutlinedIcon}
                          sx={{ fontSize: 16 }}
                        />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove template">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCustomTemplate?.(tpl.id);
                        }}
                        sx={{
                          p: 0.4,
                          color: 'text.secondary',
                          '&:hover': {
                            color: 'error.main',
                            bgcolor: alpha(theme.palette.error.main, 0.08),
                          },
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
                )}
              </Box>
              {/* Compact body: description + flow + action */}
              <Box
                sx={{
                  px: 1.5,
                  py: 1.25,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    lineHeight: 1.4,
                    mb: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    fontSize: '0.75rem',
                  }}
                >
                  {tpl.description}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 0.35,
                    mb: 1.25,
                  }}
                >
                  {tpl.nodes.slice(0, 5).map((node, i) => (
                    <Box key={node.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <Chip
                        label={node.data?.label || node.id}
                        size="small"
                        variant="outlined"
                        sx={{
                          borderRadius: 1,
                          fontSize: '0.6rem',
                          fontWeight: 600,
                          height: 20,
                          py: 0,
                        }}
                      />
                      {i < Math.min(tpl.nodes.length, 5) - 1 && (
                        <Typography
                          component="span"
                          sx={{ fontSize: '0.65rem', color: 'text.disabled' }}
                        >
                          {'\u2192'}
                        </Typography>
                      )}
                    </Box>
                  ))}
                  {tpl.nodes.length > 5 && (
                    <Typography component="span" variant="caption" color="text.disabled">
                      +{tpl.nodes.length - 5}
                    </Typography>
                  )}
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={
                    <AppIcon
                      name="ContentCopyOutlined"
                      fallback={ContentCopyOutlinedIcon}
                      sx={{ fontSize: 14 }}
                    />
                  }
                  onClick={() => onUseTemplate(tpl)}
                  fullWidth
                  sx={{
                    borderRadius: 1.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    py: 0.5,
                  }}
                >
                  Use template
                </Button>
              </Box>
            </Paper>
          );
        })}
      </Box>
      {filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            No templates in this category yet.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/* ================================================================== */
/*  Main Workflow page                                                 */
/* ================================================================== */
export default function Workflow() {
  const { pushNotification } = useNotifications();
  const [searchParams] = useSearchParams();
  const orgFilter = searchParams.get('org_id') || '';
  const { partners = [] } = usePartners();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isDark = theme.palette.mode === 'dark';
  const editorEmail = user?.email || '';
  const partnerAccess = usePartnerAccessOptional();
  const isSuperAdmin = (partnerAccess?.roleId ?? '') === 'role-super-admin';

  const { projects, editProject: editProjectInHook } = useProjects();
  const [workflows, setWorkflows] = useState([]);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, workflow: null });
  const WORKFLOW_CATEGORIES_EXTRA_KEY = 'orch_workflow_categories_extra';
  const [workflowCategoriesAnchorEl, setWorkflowCategoriesAnchorEl] = useState(null);
  const [deletingWfCategory, setDeletingWfCategory] = useState(null);
  const [editingWfCategory, setEditingWfCategory] = useState(null);
  const [editingWfCategoryValue, setEditingWfCategoryValue] = useState('');
  const [newWfCategoryName, setNewWfCategoryName] = useState('');
  const [extraWfCategories, setExtraWfCategories] = useState(() => {
    try {
      const raw = localStorage.getItem(WORKFLOW_CATEGORIES_EXTRA_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [customTemplates, setCustomTemplates] = useState(() => loadCustomTemplates());
  const [activeTab, setActiveTab] = useState(TAB_WORKFLOW);
  const [viewMode, setViewMode] = useState('grid'); // Added for Enterprise Layout
  const [workflowFilterAnchorEl, setWorkflowFilterAnchorEl] = useState(null);
  const [workflowSearch, setWorkflowSearch] = useState('');
  const [workflowCategoryFilter, setWorkflowCategoryFilter] = useState('All');
  const [showPrivateWorkflows, setShowPrivateWorkflows] = useState(false);

  /* Playground: ephemeral, not stored in DB; cleared when leaving tab */
  const [playgroundCustomBlocks, setPlaygroundCustomBlocks] = useState([]);
  const [playgroundSidebarOpen, setPlaygroundSidebarOpen] = useState(true);
  const [addCustomBlockDialogOpen, setAddCustomBlockDialogOpen] = useState(false);
  const [playgroundResetKey, setPlaygroundResetKey] = useState(0);
  const [playgroundInfoOpen, setPlaygroundInfoOpen] = useState(false);
  const playgroundStateRef = useRef({ nodes: [], edges: [] });
  // Keep these stable so PlaygroundCanvas doesn't "reinitialize" on unrelated re-renders.
  const playgroundInitialNodes = useMemo(() => [], []);
  const playgroundInitialEdges = useMemo(() => [], []);

  const updatePlaygroundCustomBlock = useCallback((blockId, patch) => {
    setPlaygroundCustomBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, ...patch } : b))
    );
  }, []);

  const removePlaygroundCustomBlock = useCallback((blockId) => {
    setPlaygroundCustomBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const createPlaygroundCustomBlock = useCallback((name, description = '', jsonConfig = '') => {
    const block = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: String(name || '').trim(),
      description: String(description || '').trim(),
      jsonConfig: String(jsonConfig || '').trim(),
      iconId: 'extension',
    };
    if (!block.label) return null;
    setPlaygroundCustomBlocks((prev) => prev.concat(block));
    return block;
  }, []);

  /* ---- Action Log / Version History state ---- */
  const [actionLogDialog, setActionLogDialog] = useState({ open: false, workflow: null });
  const [actionLogs, setActionLogs] = useState([]);
  const [actionLogsLoading, setActionLogsLoading] = useState(false);
  const [actionLogTab, setActionLogTab] = useState(0); // 0 = Version History, 1 = Action Log

  const [infoVersionCount, setInfoVersionCount] = useState(null);

  /* Canvas state – initialNodes/Edges are for loading; canvasStateRef holds live data */
  const [activeWorkflowId, setActiveWorkflowId] = useState(null);
  const [canvasInitialNodes, setCanvasInitialNodes] = useState([]);
  const [canvasInitialEdges, setCanvasInitialEdges] = useState([]);
  const canvasStateRef = useRef({ nodes: [], edges: [] });
  const [templateSnapshot, setTemplateSnapshot] = useState({ nodes: [], edges: [] });
  const [blocksSidebarOpen, setBlocksSidebarOpen] = useState(false);
  // Goal workflow tracking
  const [activeGoalId, setActiveGoalId] = useState(null);
  const [goalData, setGoalData] = useState(null);
  const [phaseDrawer, setPhaseDrawer] = useState({ open: false, phaseIndex: null });
  const [tourActive, setTourActive] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [infoEditMode, setInfoEditMode] = useState(false);
  const [infoJsonOpen, setInfoJsonOpen] = useState(false);
  const [infoJsonDraft, setInfoJsonDraft] = useState('');
  const [infoJsonError, setInfoJsonError] = useState('');
  const [infoDraft, setInfoDraft] = useState({
    name: '',
    enabled: true,
    description: '',
    category: '',
    visibility: 'public',
  });
  const [workflowLetsTalkOpen, setWorkflowLetsTalkOpen] = useState(false);
  const [editorMenuAnchor, setEditorMenuAnchor] = useState(null);
  const workflowVoiceApiRef = useRef(null);
  const [workflowCustomBlocks, setWorkflowCustomBlocks] = useState([]);
  const [workflowAddCustomBlockDialogOpen, setWorkflowAddCustomBlockDialogOpen] = useState(false);
  const workflowCustomBlocksRef = useRef([]);
  useEffect(() => {
    workflowCustomBlocksRef.current = workflowCustomBlocks;
  }, [workflowCustomBlocks]);

  const loadWorkflows = useCallback(async () => {
    const list = await getAllWorkflows();
    setWorkflows(list);
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  /* Load version count when info drawer opens */
  useEffect(() => {
    if (!infoDrawerOpen || !activeWorkflowId) {
      setInfoVersionCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const allLogs = await loadAuditLogs({ limit: 500 });
        const versions = allLogs.filter(
          (log) =>
            log.entity === 'Workflow' &&
            log.entityId === activeWorkflowId &&
            (log.detailsStructured?.codeAfter || log.detailsStructured?.codeBefore)
        );
        if (!cancelled) setInfoVersionCount(versions.length);
      } catch {
        if (!cancelled) setInfoVersionCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [infoDrawerOpen, activeWorkflowId]);

  /* ---- Action Log helpers ---- */
  const logWorkflowAction = useCallback(
    async (action, workflowId, details, agentContext = null) => {
      try {
        await logAction({
          action,
          entity: 'Workflow',
          entityId: workflowId,
          details,
          meta: {
            source: 'workflowPage',
            importance: 'medium',
            tags: ['workflow', action.toLowerCase().replace(/\s+/g, '-')],
            ...buildAgentMeta(agentContext),
          },
        });
      } catch (_) {
        // Don't fail the main operation
      }
    },
    []
  );

  const updateWorkflowCustomBlock = useCallback(
    async (blockId, patch) => {
      const current = Array.isArray(workflowCustomBlocksRef.current)
        ? workflowCustomBlocksRef.current
        : [];
      const nextBlocks = current.map((b) => (b.id === blockId ? { ...b, ...patch } : b));
      setWorkflowCustomBlocks(nextBlocks);
      if (!activeWorkflowId) return;
      try {
        await updateWorkflow(activeWorkflowId, {
          customBlocks: nextBlocks,
          updatedByEmail: editorEmail,
        });
        logWorkflowAction(
          'Custom block updated',
          activeWorkflowId,
          `Updated custom block "${blockId}"`
        );
        loadWorkflows();
      } catch (_) {
        // Non-fatal.
      }
    },
    [activeWorkflowId, editorEmail, loadWorkflows, logWorkflowAction]
  );

  const removeWorkflowCustomBlock = useCallback(
    async (blockId) => {
      const current = Array.isArray(workflowCustomBlocksRef.current)
        ? workflowCustomBlocksRef.current
        : [];
      const nextBlocks = current.filter((b) => b.id !== blockId);
      setWorkflowCustomBlocks(nextBlocks);
      if (!activeWorkflowId) return;
      try {
        await updateWorkflow(activeWorkflowId, {
          customBlocks: nextBlocks,
          updatedByEmail: editorEmail,
        });
        logWorkflowAction(
          'Custom block removed',
          activeWorkflowId,
          `Removed custom block "${blockId}"`
        );
        loadWorkflows();
      } catch (_) {
        // Non-fatal.
      }
    },
    [activeWorkflowId, editorEmail, loadWorkflows, logWorkflowAction]
  );

  const createWorkflowCustomBlock = useCallback(
    async (name, description = '', jsonConfig = '') => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return null;
      const block = {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        label: trimmed,
        description: String(description || '').trim(),
        jsonConfig: String(jsonConfig || '').trim(),
        iconId: 'extension',
      };
      const current = Array.isArray(workflowCustomBlocksRef.current)
        ? workflowCustomBlocksRef.current
        : [];
      const next = current.concat(block);
      setWorkflowCustomBlocks(next);

      // Persist immediately so it behaves like a "new block type" in the workflow DB record.
      if (activeWorkflowId) {
        try {
          await updateWorkflow(activeWorkflowId, {
            customBlocks: next,
            updatedByEmail: editorEmail,
          });
          logWorkflowAction(
            'Custom block created',
            activeWorkflowId,
            `Created custom block "${trimmed}"`
          );
          loadWorkflows();
        } catch (_) {
          // Non-fatal.
        }
      }
      return block;
    },
    [activeWorkflowId, editorEmail, loadWorkflows, logWorkflowAction]
  );

  const openActionLog = useCallback(async (workflow) => {
    setActionLogDialog({ open: true, workflow });
    setActionLogTab(0);
    setActionLogsLoading(true);
    try {
      const allLogs = await loadAuditLogs({ limit: 500 });
      const filtered = allLogs.filter(
        (log) => log.entity === 'Workflow' && log.entityId === workflow.id
      );
      setActionLogs(filtered);
    } catch (_) {
      setActionLogs([]);
    } finally {
      setActionLogsLoading(false);
    }
  }, []);

  const closeActionLog = useCallback(() => {
    setActionLogDialog({ open: false, workflow: null });
    setActionLogs([]);
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
    if (a.includes('created') || a.includes('create')) return 'success';
    if (a.includes('deleted') || a.includes('delete')) return 'error';
    if (a.includes('enabled') || a.includes('activated') || a.includes('play')) return 'success';
    if (a.includes('paused') || a.includes('disabled')) return 'warning';
    if (a.includes('updated') || a.includes('saved') || a.includes('save')) return 'info';
    return 'default';
  };

  const getIpFromLog = (log) => {
    const s = log.detailsStructured;
    if (s?.network?.ip) return s.network.ip;
    return '-';
  };

  const getUserFromLog = (log) => {
    if (log.user && log.user !== '-') return log.user;
    return user?.email || '-';
  };

  /** Extract version history entries from audit logs (entries with codeBefore/codeAfter). */
  const versionEntries = useMemo(() => {
    return actionLogs
      .filter((log) => {
        const s = log.detailsStructured;
        return s?.codeAfter || s?.codeBefore;
      })
      .map((log, idx, arr) => {
        const s = log.detailsStructured || {};
        let before = null;
        let after = null;
        try {
          before = s.codeBefore ? JSON.parse(s.codeBefore) : null;
        } catch {}
        try {
          after = s.codeAfter ? JSON.parse(s.codeAfter) : null;
        } catch {}
        const changes = Array.isArray(s.versionChanges) ? s.versionChanges : [];
        return {
          id: log.id,
          version: arr.length - idx,
          action: log.action,
          user: getUserFromLog(log),
          timestamp: log.timestamp,
          before,
          after: after || before,
          changes,
        };
      });
  }, [actionLogs]);

  const workflowOptions = useMemo(() => {
    const landings = [...new Set(workflows.map((w) => w.landingPageUrl?.trim()).filter(Boolean))];
    const campaignSet = new Map();
    workflows.forEach((w) => {
      const c = w.trackingCampaign;
      if (c && (c.id || c.name)) {
        const key = c.id || c.name;
        campaignSet.set(key, { id: c.id || key, name: c.name || key });
      }
    });
    return {
      landings,
      campaigns: [...campaignSet.values()],
      partners: Array.isArray(partners) ? partners : [],
    };
  }, [workflows, partners]);

  const existingWorkflowCategories = useMemo(() => {
    const set = new Set();
    workflows.forEach((w) => {
      const c = (w.category && String(w.category).trim()) || null;
      if (c) set.add(c);
    });
    extraWfCategories.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [workflows, extraWfCategories]);

  const filteredWorkflows = useMemo(() => {
    let result = workflows;
    const q = (workflowSearch || '').trim().toLowerCase();
    if (q) {
      result = result.filter(
        (w) =>
          (w.name && w.name.toLowerCase().includes(q)) ||
          (w.description && w.description.toLowerCase().includes(q)) ||
          (w.category && w.category.toLowerCase().includes(q))
      );
    }
    if (workflowCategoryFilter !== 'All') {
      result = result.filter((w) => (w.category || '').trim() === workflowCategoryFilter);
    }
    // Visibility filter: hide other users' private workflows
    if (isSuperAdmin && showPrivateWorkflows) {
      // Super admin with toggle ON: show everything
    } else {
      result = result.filter((w) => w.visibility !== 'private' || w.createdBy === user?.uid);
    }
    return result;
  }, [
    workflows,
    workflowSearch,
    workflowCategoryFilter,
    isSuperAdmin,
    showPrivateWorkflows,
    user?.uid,
  ]);

  /* ---- n8n Import ---- */
  const [n8nImportOpen, setN8nImportOpen] = useState(false);
  const [n8nImportJson, setN8nImportJson] = useState('');
  const [n8nImportError, setN8nImportError] = useState('');
  const [n8nImportWarnings, setN8nImportWarnings] = useState([]);

  const handleN8nImport = async () => {
    setN8nImportError('');
    setN8nImportWarnings([]);
    try {
      const { importN8nWorkflow } = await import('../../utils/n8nImporter');
      const result = importN8nWorkflow(n8nImportJson);
      setN8nImportWarnings(result.warnings);

      const wf = await createWorkflow({
        name: result.name,
        nodes: result.nodes,
        edges: result.edges,
        description: `Imported from n8n on ${new Date().toLocaleDateString()}`,
      });

      const updatedList = await getAllWorkflows();
      setWorkflows(updatedList);
      pushNotification(
        'Success',
        `Imported "${result.name}" (${result.nodes.length} nodes, ${result.edges.length} connections)`
      );
      setN8nImportOpen(false);
      setN8nImportJson('');
      setActiveWorkflowId(wf.id);
      setEditingWorkflow(wf);
      setCanvasInitialNodes(result.nodes);
      setCanvasInitialEdges(result.edges);
      canvasStateRef.current = { nodes: result.nodes, edges: result.edges };
    } catch (err) {
      setN8nImportError(err.message || 'Import failed');
    }
  };

  /* ---- Handlers ---- */
  const handleCreate = () => setCreateDialogOpen(true);

  const handleCreateFromName = async (name, category = null, visibility = 'public') => {
    let finalName = name;

    // Check for duplicate names
    const existingNames = workflows.map((w) => (w.name || '').toLowerCase());
    if (existingNames.includes(finalName.toLowerCase())) {
      // Find next available suffix -01, -02, etc.
      let suffix = 1;
      let candidate;
      do {
        candidate = `${finalName}-${String(suffix).padStart(2, '0')}`;
        suffix++;
      } while (existingNames.includes(candidate.toLowerCase()));

      pushNotification(
        'Workflow',
        `A workflow named "${finalName}" already exists. Renamed to "${candidate}".`
      );
      finalName = candidate;
    }

    const finalCategory = (category && String(category).trim()) || null;
    const wf = await createWorkflow({
      name: finalName,
      category: finalCategory,
      visibility,
      updatedByEmail: editorEmail,
    });
    if (finalCategory) {
      setExtraWfCategories((prev) => {
        if (prev.includes(finalCategory)) return prev;
        const next = [...prev, finalCategory].sort((a, b) => a.localeCompare(b));
        try {
          localStorage.setItem(WORKFLOW_CATEGORIES_EXTRA_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    logWorkflowAction('Workflow created', wf.id, `Created workflow "${finalName}"`);
    pushNotification('Workflow', `Workflow "${finalName}" created.`);
    loadWorkflows();
    setEditingWorkflow(wf);
    setActiveWorkflowId(wf.id);
    setCanvasInitialNodes([]);
    setCanvasInitialEdges([]);
    canvasStateRef.current = { nodes: [], edges: [] };
    setWorkflowCustomBlocks([]);
    setActiveTab(TAB_WORKFLOW);
  };

  const handleDeleteWfCategory = useCallback(
    async (categoryName) => {
      const toUpdate = workflows.filter((w) => (w.category || '').trim() === categoryName);
      setDeletingWfCategory(categoryName);
      try {
        for (const w of toUpdate) {
          await updateWorkflow(w.id, { category: null });
        }
        setExtraWfCategories((prev) => {
          const next = prev.filter((c) => c !== categoryName);
          try {
            localStorage.setItem(WORKFLOW_CATEGORIES_EXTRA_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
        setWorkflowCategoriesAnchorEl(null);
        loadWorkflows();
      } finally {
        setDeletingWfCategory(null);
      }
    },
    [workflows, loadWorkflows]
  );

  const handleAddWfCategory = useCallback(() => {
    const name = (newWfCategoryName && String(newWfCategoryName).trim()) || '';
    if (!name) return;
    const exists = existingWorkflowCategories.some((c) => c.toLowerCase() === name.toLowerCase());
    if (exists) return;
    setExtraWfCategories((prev) => {
      const next = [...prev, name].sort((a, b) => a.localeCompare(b));
      try {
        localStorage.setItem(WORKFLOW_CATEGORIES_EXTRA_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setNewWfCategoryName('');
  }, [newWfCategoryName, existingWorkflowCategories]);

  const handleEditWfCategory = useCallback(
    async (oldName, newName) => {
      const name = (newName && String(newName).trim()) || '';
      if (!name || name === oldName) {
        setEditingWfCategory(null);
        return;
      }
      const toUpdate = workflows.filter((w) => (w.category || '').trim() === oldName);
      try {
        for (const w of toUpdate) {
          await updateWorkflow(w.id, { category: name });
        }
        setExtraWfCategories((prev) => {
          const next = prev
            .map((c) => (c === oldName ? name : c))
            .filter((c, i, a) => a.indexOf(c) === i)
            .sort((a, b) => a.localeCompare(b));
          try {
            localStorage.setItem(WORKFLOW_CATEGORIES_EXTRA_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
        setEditingWfCategory(null);
        loadWorkflows();
      } catch (err) {
        console.error('Failed to rename workflow category:', err);
      }
    },
    [workflows, loadWorkflows]
  );

  const handleEdit = async (workflow) => {
    setDrawerOpen(false);
    setEditingWorkflow(workflow);
    const full = await getWorkflowById(workflow.id);
    const wf = full || workflow;
    const nodes = Array.isArray(wf?.nodes) ? [...wf.nodes] : [];
    const edges = Array.isArray(wf?.edges) ? [...wf.edges] : [];
    const customBlocks = Array.isArray(wf?.customBlocks) ? [...wf.customBlocks] : [];
    setCanvasInitialNodes(nodes);
    setCanvasInitialEdges(edges);
    canvasStateRef.current = { nodes, edges };
    setWorkflowCustomBlocks(customBlocks);
    setActiveWorkflowId(workflow.id);
    setActiveTab(TAB_WORKFLOW);
    setWorkflowLetsTalkOpen(false);

    // Detect goal-linked workflow
    const goalId = wf?.goal_id || workflow?.data?.goal_id || null;
    setActiveGoalId(goalId);
    setGoalData(null);
    setTourActive(false);
    if (goalId) {
      try {
        const goal = await getGoal(goalId);
        setGoalData(goal);
      } catch {
        /* ignore */
      }
    }
  };

  // Poll for goal workflow updates
  useEffect(() => {
    if (!activeGoalId || !activeWorkflowId) return;
    const isTerminal = (status) => ['completed', 'failed', 'cancelled'].includes(status);
    if (goalData && isTerminal(goalData.status)) return;

    const poll = async () => {
      try {
        const [wf, goal] = await Promise.all([
          getWorkflowById(activeWorkflowId),
          getGoal(activeGoalId),
        ]);
        if (wf) {
          const nodes = Array.isArray(wf.nodes) ? [...wf.nodes] : [];
          const edges = Array.isArray(wf.edges) ? [...wf.edges] : [];
          setCanvasInitialNodes(nodes);
          setCanvasInitialEdges(edges);
        }
        if (goal) setGoalData(goal);
      } catch {
        /* ignore polling errors */
      }
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [activeGoalId, activeWorkflowId, goalData?.status]);

  const handleViewPhaseOutput = useCallback((phaseIndex) => {
    setPhaseDrawer({ open: true, phaseIndex });
  }, []);

  const handleStartTour = useCallback(() => {
    setTourActive(true);
    setTourIndex(0);
  }, []);

  const handlePlay = async (workflow) => {
    await toggleWorkflowEnabled(workflow.id);
    logWorkflowAction(
      'Workflow enabled',
      workflow.id,
      `Activated workflow "${workflow.name || 'Untitled'}" - status changed from Paused to Active`
    );
    loadWorkflows();
    pushNotification('Workflow', 'Workflow enabled.');
  };

  const handlePause = async (workflow) => {
    await toggleWorkflowEnabled(workflow.id);
    logWorkflowAction(
      'Workflow paused',
      workflow.id,
      `Paused workflow "${workflow.name || 'Untitled'}" - status changed from Active to Paused`
    );
    loadWorkflows();
    pushNotification('Workflow', 'Workflow paused.');
  };

  const handleDelete = (workflow) => {
    setDeleteConfirm({ open: true, workflow });
  };

  const handleDeleteConfirmed = async () => {
    const workflow = deleteConfirm.workflow;
    setDeleteConfirm({ open: false, workflow: null });
    if (!workflow) return;
    try {
      await deleteWorkflow(workflow.id);
    } catch (err) {
      console.error('Failed to delete workflow:', err);
      pushNotification('Workflow', `Failed to delete: ${err.message || 'Unknown error'}`, {
        severity: 'error',
      });
      return;
    }
    logWorkflowAction(
      'Workflow deleted',
      workflow.id,
      `Deleted workflow "${workflow.name || 'Untitled'}"`
    );
    pushNotification('Workflow', `"${workflow.name || 'Untitled'}" deleted.`);
    // Remove from local state immediately (don't rely on re-fetch which can be cached)
    setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
    // If the info drawer was open for this workflow, close it.
    if (activeWorkflowId === workflow.id) {
      setInfoDrawerOpen(false);
      setInfoEditMode(false);
    }
    if (editingWorkflow?.id === workflow.id) {
      setDrawerOpen(false);
      setEditingWorkflow(null);
      setActiveWorkflowId(null);
      setCanvasInitialNodes([]);
      setCanvasInitialEdges([]);
      canvasStateRef.current = { nodes: [], edges: [] };
      setWorkflowCustomBlocks([]);
      setWorkflowLetsTalkOpen(false);
    }
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setEditingWorkflow(null);
  };

  /** Read current canvas state from ref and strip functions for serialization. */
  const getSerializableCanvasState = () => {
    const { nodes, edges } = canvasStateRef.current;
    const serializableNodes = (nodes || []).map((n) => ({
      ...n,
      data: n.data
        ? Object.fromEntries(Object.entries(n.data).filter(([, v]) => typeof v !== 'function'))
        : {},
    }));
    const serializableEdges = (edges || []).map((e) => ({
      ...e,
      data: e.data
        ? Object.fromEntries(Object.entries(e.data).filter(([, v]) => typeof v !== 'function'))
        : {},
    }));
    return { nodes: serializableNodes, edges: serializableEdges };
  };

  const handleSaveWorkflow = async () => {
    if (!activeWorkflowId || workflowSaving) return;
    setWorkflowSaving(true);
    try {
      const { nodes, edges } = getSerializableCanvasState();
      await updateWorkflow(activeWorkflowId, {
        nodes,
        edges,
        customBlocks: workflowCustomBlocks,
        updatedByEmail: editorEmail,
      });
      const wfName =
        workflows.find((w) => w.id === activeWorkflowId)?.name ||
        editingWorkflow?.name ||
        'Untitled';
      logWorkflowAction(
        'Workflow saved',
        activeWorkflowId,
        `Saved canvas for "${wfName}" - ${nodes.length} block(s), ${edges.length} connection(s)`
      );
      pushNotification('Workflow', 'Workflow saved.', { severity: 'success' });
      loadWorkflows();
    } catch (e) {
      pushNotification('Workflow', e?.message || 'Failed to save workflow', { severity: 'error' });
    } finally {
      setWorkflowSaving(false);
    }
  };

  const handleSave = async (id, payload) => {
    if (id) {
      const { nodes, edges } = getSerializableCanvasState();
      await updateWorkflow(id, {
        ...payload,
        nodes,
        edges,
        customBlocks: workflowCustomBlocks,
        updatedByEmail: editorEmail,
      });
      const changedFields = Object.keys(payload)
        .filter((k) => payload[k] !== undefined)
        .join(', ');
      logWorkflowAction('Workflow updated', id, `Updated workflow fields: ${changedFields}`);
      pushNotification('Workflow', 'Workflow updated.');
    } else {
      const wf = await createWorkflow({
        ...payload,
        customBlocks: workflowCustomBlocks,
        updatedByEmail: editorEmail,
      });
      logWorkflowAction(
        'Workflow created',
        wf.id,
        `Created workflow "${payload.name || 'Untitled'}"`
      );
      pushNotification('Workflow', 'Workflow created.');
      setActiveWorkflowId(wf.id);
    }
    loadWorkflows();
  };

  /* Use template */
  const handleUseTemplate = async (template) => {
    const wf = await createWorkflow({
      name: template.name,
      nodes: template.nodes,
      edges: template.edges,
      customBlocks: Array.isArray(template.customBlocks) ? template.customBlocks : [],
      updatedByEmail: editorEmail,
    });
    logWorkflowAction(
      'Workflow created from template',
      wf.id,
      `Created from template "${template.name}" - ${template.nodes?.length || 0} block(s)`
    );
    pushNotification('Workflow', `Workflow created from "${template.name}" template.`);
    loadWorkflows();
    const tplNodes = [...template.nodes];
    const tplEdges = [...template.edges];
    setEditingWorkflow(wf);
    setActiveWorkflowId(wf.id);
    setCanvasInitialNodes(tplNodes);
    setCanvasInitialEdges(tplEdges);
    canvasStateRef.current = { nodes: tplNodes, edges: tplEdges };
    setWorkflowCustomBlocks(Array.isArray(template.customBlocks) ? template.customBlocks : []);
    setActiveTab(TAB_WORKFLOW);
  };

  /* Save as template */
  const handleSaveAsTemplate = () => {
    const { nodes, edges } = getSerializableCanvasState();
    setTemplateSnapshot({ nodes, edges });
    setSaveTemplateDialogOpen(true);
  };
  const handleTemplateSaved = (template) => {
    setCustomTemplates(loadCustomTemplates());
    pushNotification('Workflow', `Template "${template.name}" saved.`);
  };
  const handleDeleteCustomTemplate = (id) => {
    if (window.confirm('Delete this custom template?')) {
      deleteCustomTemplate(id);
      setCustomTemplates(loadCustomTemplates());
      pushNotification('Workflow', 'Custom template deleted.');
    }
  };
  const handleEditCustomTemplate = (template) => {
    setEditingTemplate(template);
  };

  const handleBack = () => {
    setActiveWorkflowId(null);
    setEditingWorkflow(null);
    setCanvasInitialNodes([]);
    setCanvasInitialEdges([]);
    canvasStateRef.current = { nodes: [], edges: [] };
    setWorkflowCustomBlocks([]);
  };

  /* Are we in canvas-editing mode? */
  const isEditing = Boolean(activeWorkflowId);
  const currentWorkflow = workflows.find((w) => w.id === activeWorkflowId) || editingWorkflow;

  // Reset info-drawer edit state on open/close or workflow switch.
  useEffect(() => {
    if (!infoDrawerOpen || !currentWorkflow) {
      setInfoEditMode(false);
      return;
    }
    setInfoEditMode(false);
    setInfoDraft({
      name: currentWorkflow.name || '',
      enabled: currentWorkflow.enabled !== false,
      description: currentWorkflow.description || '',
      category: currentWorkflow.category || '',
      visibility: currentWorkflow.visibility || 'public',
    });
  }, [infoDrawerOpen, currentWorkflow?.id]);

  /* Overview chips for list mode (like Task Manager) */
  const workflowsCount = workflows.length;
  const templatesCount = WORKFLOW_TEMPLATES.length + (customTemplates?.length || 0);
  const workflowOverview = [
    {
      label: 'Workflows',
      value: workflowsCount,
      color: 'text.primary',
      bg: alpha(theme.palette.primary.main, 0.1),
    },
    {
      label: 'Templates',
      value: templatesCount,
      color: theme.palette.primary.main,
      bg: alpha(theme.palette.primary.main, 0.14),
    },
  ];

  // Dialogs content - reused
  const dialogs = (
    <>
      <CreateWorkflowNameDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateFromName}
        existingNames={workflows.map((w) => w.name || '')}
        existingCategories={existingWorkflowCategories}
      />

      {/* n8n Import Dialog */}
      <FormDialog
        open={n8nImportOpen}
        onClose={() => {
          setN8nImportOpen(false);
          setN8nImportError('');
          setN8nImportWarnings([]);
        }}
        title="Import n8n Workflow"
        subtitle="Paste your n8n workflow JSON export below"
        icon={DataObjectRoundedIcon}
        maxWidth="sm"
        contentDividers={false}
        primaryLabel="Import"
        onPrimary={handleN8nImport}
        primaryDisabled={!n8nImportJson.trim()}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Nodes will be converted to Orqaly blocks.
        </Typography>
        <TextField
          multiline
          rows={10}
          fullWidth
          placeholder='{"name":"My Workflow","nodes":[...],"connections":{...}}'
          value={n8nImportJson}
          onChange={(e) => setN8nImportJson(e.target.value)}
          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
        />
        {n8nImportError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {n8nImportError}
          </Alert>
        )}
        {n8nImportWarnings.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Conversion warnings:
            </Typography>
            {n8nImportWarnings.map((w, i) => (
              <Typography key={i} variant="caption" display="block">
                {w}
              </Typography>
            ))}
          </Alert>
        )}
      </FormDialog>

      {/* Add Custom Block dialog (Workflow - persisted in DB via workflow.customBlocks) */}
      <FormDialog
        open={workflowAddCustomBlockDialogOpen}
        onClose={() => setWorkflowAddCustomBlockDialogOpen(false)}
        title="Add custom block"
        icon={ExtensionOutlinedIcon}
        maxWidth="sm"
        hideFooter
        contentDividers={false}
      >
        <DialogContentText sx={{ mb: 2 }}>
          Create a block with a unique name and optional description. It will appear in the Blocks
          sidebar and can be dragged to the canvas or added with +. This is saved with the workflow.
        </DialogContentText>
        <AddCustomBlockForm
          existingNames={workflowCustomBlocks.map((b) => b.label)}
          onCancel={() => setWorkflowAddCustomBlockDialogOpen(false)}
          onSave={async (name, description, jsonConfig) => {
            await createWorkflowCustomBlock(name, description, jsonConfig);
            setWorkflowAddCustomBlockDialogOpen(false);
          }}
        />
      </FormDialog>

      <WorkflowDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        workflow={editingWorkflow}
        onSave={handleSave}
      />

      <SaveAsTemplateDialog
        open={saveTemplateDialogOpen}
        onClose={() => setSaveTemplateDialogOpen(false)}
        nodes={templateSnapshot.nodes}
        edges={templateSnapshot.edges}
        onSaved={handleTemplateSaved}
      />

      <EditTemplateDialog
        open={Boolean(editingTemplate)}
        onClose={() => setEditingTemplate(null)}
        template={editingTemplate || undefined}
        onSaved={() => {
          setCustomTemplates(loadCustomTemplates());
          pushNotification('Workflow', 'Template updated.');
          setEditingTemplate(null);
        }}
      />

      {/* Delete confirmation dialog */}
      <FormDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, workflow: null })}
        title="Delete workflow?"
        icon={DeleteOutlineIcon}
        iconVariant="error"
        maxWidth="xs"
        contentDividers={false}
        actions={
          <>
            <Button
              onClick={() => setDeleteConfirm({ open: false, workflow: null })}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteConfirmed}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Delete
            </Button>
          </>
        }
      >
        <DialogContentText sx={{ color: 'text.primary', fontSize: '0.9rem' }}>
          Are you sure you want to delete{' '}
          <strong>"{deleteConfirm.workflow?.name || 'Untitled'}"</strong>? This action cannot be
          undone.
        </DialogContentText>
      </FormDialog>

      {/* ===== Action Log / Version History Dialog ===== */}
      <FormDialog
        open={actionLogDialog.open}
        onClose={closeActionLog}
        title={actionLogDialog.workflow?.name || 'Workflow'}
        subtitle="Version control & action history"
        icon={HistoryIcon}
        maxWidth="md"
        paperSx={{ maxHeight: '80vh' }}
        contentDividers={false}
        contentSx={{ p: 0, pt: 0, px: 0, pb: 0 }}
        footerJustify="flex-start"
        actions={
          <>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {actionLogTab === 0
                ? `${versionEntries.length} version${versionEntries.length !== 1 ? 's' : ''} recorded`
                : `${actionLogs.length} log entr${actionLogs.length !== 1 ? 'ies' : 'y'}`}
            </Typography>
            <Button
              onClick={closeActionLog}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
            >
              Close
            </Button>
          </>
        }
      >
        {/* Tabs */}
        <Tabs
          value={actionLogTab}
          onChange={(_, v) => setActionLogTab(v)}
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
            icon={
              <AppIcon name="CompareArrows" fallback={CompareArrowsIcon} sx={{ fontSize: 18 }} />
            }
            iconPosition="start"
            label={`Version History (${versionEntries.length})`}
          />
          <Tab
            icon={<AppIcon name="History" fallback={HistoryIcon} sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Action Log (${actionLogs.length})`}
          />
        </Tabs>

        {actionLogsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading...
            </Typography>
          </Box>
        ) : actionLogTab === 0 ? (
          /* ── Version History Tab ─────────────────────────────── */
          versionEntries.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
              <AppIcon
                name="CompareArrows"
                fallback={CompareArrowsIcon}
                sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
              />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.95rem' }}>
                No versions recorded yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Each time you save this workflow, a version snapshot will be created here.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ maxHeight: 480, overflowY: 'auto', py: 2, px: 3 }}>
              {versionEntries.map((entry, idx) => {
                const isFirst = idx === 0;
                const isCreate = (entry.action || '').toLowerCase().includes('created');
                const snap = entry.after || {};
                return (
                  <Box
                    key={entry.id}
                    sx={{
                      position: 'relative',
                      pl: 4,
                      pb: idx < versionEntries.length - 1 ? 2.5 : 0,
                      '&::before':
                        idx < versionEntries.length - 1
                          ? {
                              content: '""',
                              position: 'absolute',
                              left: 13,
                              top: 28,
                              bottom: 0,
                              width: 2,
                              bgcolor: alpha(theme.palette.primary.main, 0.15),
                            }
                          : {},
                    }}
                  >
                    {/* Timeline dot */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 4,
                        top: 8,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: isFirst
                          ? 'primary.main'
                          : isCreate
                            ? 'success.main'
                            : alpha(theme.palette.primary.main, 0.15),
                        color: isFirst || isCreate ? '#fff' : 'primary.main',
                        fontSize: 11,
                        fontWeight: 800,
                        zIndex: 1,
                      }}
                    >
                      {isCreate ? '+' : `v${entry.version}`}
                    </Box>
                    {/* Version card */}
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: isFirst ? alpha(theme.palette.primary.main, 0.3) : 'divider',
                        bgcolor: isFirst
                          ? alpha(theme.palette.primary.main, 0.04)
                          : alpha(theme.palette.grey[500], 0.03),
                        transition: 'border-color 0.2s',
                        '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.4) },
                      }}
                    >
                      {/* Header row */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          mb: 1,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: 700, fontSize: '0.85rem' }}
                          >
                            {isCreate ? 'Initial version' : `Version ${entry.version}`}
                          </Typography>
                          {isFirst && !isCreate && (
                            <Chip
                              label="Current"
                              size="small"
                              color="primary"
                              sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700 }}
                            />
                          )}
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: 'nowrap', fontSize: '0.72rem' }}
                        >
                          {formatLogDateTime(entry.timestamp)}
                        </Typography>
                      </Box>

                      {/* Changes list */}
                      {entry.changes.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                          {entry.changes.map((ch, ci) => {
                            const isAdd = ch.startsWith('+');
                            const isRemove = ch.startsWith('-');
                            return (
                              <Chip
                                key={ci}
                                label={ch}
                                size="small"
                                icon={
                                  isAdd ? (
                                    <AppIcon
                                      name="AddCircleOutline"
                                      fallback={AddCircleOutlineIcon}
                                      sx={{ fontSize: 14 }}
                                    />
                                  ) : isRemove ? (
                                    <AppIcon
                                      name="RemoveCircleOutline"
                                      fallback={RemoveCircleOutlineIcon}
                                      sx={{ fontSize: 14 }}
                                    />
                                  ) : (
                                    <AppIcon
                                      name="SwapHoriz"
                                      fallback={SwapHorizIcon}
                                      sx={{ fontSize: 14 }}
                                    />
                                  )
                                }
                                sx={{
                                  height: 22,
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  bgcolor: isAdd
                                    ? alpha(theme.palette.success.main, 0.1)
                                    : isRemove
                                      ? alpha(theme.palette.error.main, 0.1)
                                      : alpha(theme.palette.primary.main, 0.08),
                                  color: isAdd
                                    ? 'success.main'
                                    : isRemove
                                      ? 'error.main'
                                      : 'primary.main',
                                  '& .MuiChip-icon': {
                                    color: 'inherit',
                                  },
                                }}
                              />
                            );
                          })}
                        </Box>
                      )}

                      {/* Snapshot stats */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        {snap.nodesCount != null && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                          >
                            <AppIcon
                              name="AccountTreeOutlined"
                              fallback={AccountTreeOutlinedIcon}
                              sx={{ fontSize: 14 }}
                            />
                            {snap.nodesCount} block{snap.nodesCount !== 1 ? 's' : ''}
                          </Typography>
                        )}
                        {snap.edgesCount != null && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                          >
                            <AppIcon name="Link" fallback={LinkIcon} sx={{ fontSize: 14 }} />
                            {snap.edgesCount} connection{snap.edgesCount !== 1 ? 's' : ''}
                          </Typography>
                        )}
                        {snap.enabled != null && (
                          <Chip
                            label={snap.enabled ? 'Active' : 'Paused'}
                            size="small"
                            color={snap.enabled ? 'success' : 'default'}
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                          />
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ fontSize: '0.68rem' }}
                        >
                          {entry.user}
                        </Typography>
                      </Box>
                    </Paper>
                  </Box>
                );
              })}
            </Box>
          )
        ) : /* ── Action Log Tab ──────────────────────────────── */
        actionLogs.length === 0 ? (
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
              Actions like creating, editing, enabling, pausing, and deleting this workflow will
              appear here.
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
                {actionLogs.map((log) => (
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
      </FormDialog>

      {/* Workflow info side drawer */}
      <Drawer
        anchor="right"
        open={infoDrawerOpen}
        onClose={() => setInfoDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 380 },
            borderRadius: { xs: 0, sm: '12px 0 0 12px' },
            bgcolor: 'background.paper',
          },
        }}
      >
        {(() => {
          const wf = currentWorkflow;
          if (!wf) return null;
          const wfProjects = (projects || []).filter((p) => p.workflowId === wf.id);
          const isDark = theme.palette.mode === 'dark';
          const userEmail = wf.updatedByEmail || user?.email || '-';
          const formatDate = (d) => {
            if (!d) return '-';
            try {
              return new Date(d).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
            } catch {
              return d;
            }
          };
          const hasInfoChanges =
            infoDraft.name.trim() !== (wf.name || '') ||
            Boolean(infoDraft.enabled) !== (wf.enabled !== false) ||
            infoDraft.description !== (wf.description || '') ||
            (infoDraft.category || '').trim() !== (wf.category || '').trim() ||
            (infoDraft.visibility || 'public') !== (wf.visibility || 'public');

          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Header */}
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
                <AppIcon
                  name="AccountTreeOutlined"
                  fallback={AccountTreeOutlinedIcon}
                  sx={{ color: 'primary.main', fontSize: 22 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}
                  >
                    Workflow Info
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Details & metadata
                  </Typography>
                </Box>
                {!infoEditMode && (
                  <>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setInfoEditMode(true);
                          setInfoDraft({
                            name: wf.name || '',
                            enabled: wf.enabled !== false,
                            description: wf.description || '',
                            category: wf.category || '',
                            visibility: wf.visibility || 'public',
                          });
                        }}
                        sx={{ p: 0.5 }}
                      >
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
                        onClick={() => {
                          setInfoDrawerOpen(false);
                          setInfoEditMode(false);
                          handleDelete(wf);
                        }}
                        sx={{ p: 0.5, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <IconButton size="small" onClick={() => setInfoDrawerOpen(false)} sx={{ p: 0.5 }}>
                  <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
                </IconButton>
              </Box>
              {/* Content */}
              <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2 }}>
                {/* Name */}
                <Box sx={{ mb: 2.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    Workflow Name
                  </Typography>
                  {infoEditMode ? (
                    <TextField
                      fullWidth
                      size="small"
                      value={infoDraft.name}
                      onChange={(e) => setInfoDraft((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Workflow name"
                      sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.9rem', borderRadius: 2 } }}
                    />
                  ) : (
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {wf.name || 'Untitled'}
                    </Typography>
                  )}
                </Box>

                {/* Category */}
                <Box sx={{ mb: 2.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    Category
                  </Typography>
                  {infoEditMode ? (
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={infoDraft.category || ''}
                      onChange={(e) => setInfoDraft((p) => ({ ...p, category: e.target.value }))}
                      sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.85rem', borderRadius: 2 } }}
                    >
                      <MenuItem value="">None</MenuItem>
                      {Array.from(
                        new Set([
                          ...(wf.category ? [wf.category] : []),
                          ...existingWorkflowCategories,
                        ])
                      )
                        .sort((a, b) => a.localeCompare(b))
                        .map((cat) => (
                          <MenuItem key={cat} value={cat}>
                            {cat}
                          </MenuItem>
                        ))}
                    </TextField>
                  ) : (
                    <Typography variant="body1" sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
                      {wf.category && String(wf.category).trim() ? wf.category : '-'}
                    </Typography>
                  )}
                </Box>

                {/* Visibility */}
                <Box sx={{ mb: 2.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    Visibility
                  </Typography>
                  {infoEditMode ? (
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={infoDraft.visibility || 'public'}
                      onChange={(e) => setInfoDraft((p) => ({ ...p, visibility: e.target.value }))}
                      sx={{
                        '& .MuiOutlinedInput-root': { fontSize: '0.85rem', borderRadius: 2 },
                      }}
                    >
                      <MenuItem value="public">Public</MenuItem>
                      <MenuItem value="private">Private</MenuItem>
                    </TextField>
                  ) : (
                    <Chip
                      icon={
                        wf.visibility === 'private' ? (
                          <AppIcon
                            name="LockOutlined"
                            fallback={LockOutlinedIcon}
                            sx={{ fontSize: 14 }}
                          />
                        ) : (
                          <AppIcon
                            name="PublicRounded"
                            fallback={PublicRoundedIcon}
                            sx={{ fontSize: 14 }}
                          />
                        )
                      }
                      label={wf.visibility === 'private' ? 'Private' : 'Public'}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        borderRadius: 1.5,
                        bgcolor:
                          wf.visibility === 'private'
                            ? alpha(theme.palette.warning.main, 0.1)
                            : alpha(theme.palette.info.main, 0.06),
                        color:
                          wf.visibility === 'private'
                            ? 'warning.main'
                            : alpha(theme.palette.text.secondary, 0.7),
                        '& .MuiChip-icon': {
                          color:
                            wf.visibility === 'private'
                              ? 'warning.main'
                              : alpha(theme.palette.text.secondary, 0.5),
                        },
                      }}
                    />
                  )}
                </Box>

                {/* Status & Version row */}
                <Box sx={{ display: 'flex', gap: 3, mb: 2.5 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        display: 'block',
                        mb: 0.5,
                      }}
                    >
                      Status
                    </Typography>
                    {infoEditMode ? (
                      <TextField
                        select
                        fullWidth
                        size="small"
                        value={infoDraft.enabled ? 'Active' : 'Paused'}
                        onChange={(e) =>
                          setInfoDraft((p) => ({ ...p, enabled: e.target.value === 'Active' }))
                        }
                        sx={{
                          '& .MuiOutlinedInput-root': { fontSize: '0.85rem', borderRadius: 2 },
                        }}
                      >
                        <MenuItem value="Active">Active</MenuItem>
                        <MenuItem value="Paused">Paused</MenuItem>
                      </TextField>
                    ) : (
                      <Chip
                        label={wf.enabled !== false ? 'Active' : 'Paused'}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          borderRadius: 1.5,
                          bgcolor:
                            wf.enabled !== false
                              ? alpha(theme.palette.success.main, 0.1)
                              : alpha(theme.palette.warning.main, 0.1),
                          color: wf.enabled !== false ? 'success.main' : 'warning.main',
                        }}
                      />
                    )}
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        display: 'block',
                        mb: 0.5,
                      }}
                    >
                      Version
                    </Typography>
                    <Chip
                      icon={
                        <AppIcon
                          name="CompareArrows"
                          fallback={CompareArrowsIcon}
                          sx={{ fontSize: 14 }}
                        />
                      }
                      label={infoVersionCount != null ? `v${infoVersionCount}` : '...'}
                      size="small"
                      onClick={() => {
                        setInfoDrawerOpen(false);
                        if (wf) openActionLog(wf);
                      }}
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        borderRadius: 1.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                        '& .MuiChip-icon': { color: 'primary.main' },
                      }}
                    />
                  </Box>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* Date created */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <AppIcon
                    name="CalendarTodayOutlined"
                    fallback={CalendarTodayOutlinedIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }}
                  />
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        display: 'block',
                      }}
                    >
                      Created
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.82rem' }}>
                      {formatDate(wf.createdAt)}
                    </Typography>
                  </Box>
                </Box>

                {/* Date updated */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <AppIcon
                    name="CalendarTodayOutlined"
                    fallback={CalendarTodayOutlinedIcon}
                    sx={{ fontSize: 16, color: 'text.secondary' }}
                  />
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        display: 'block',
                      }}
                    >
                      Last Updated
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.82rem' }}>
                      {formatDate(wf.updatedAt)}
                    </Typography>
                  </Box>
                </Box>

                {/* Created by / Manager */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                    <AppIcon
                      name="PersonOutline"
                      fallback={PersonOutlineIcon}
                      sx={{ fontSize: 16, color: 'text.secondary' }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      User
                    </Typography>
                  </Box>
                  <TextField
                    fullWidth
                    size="small"
                    value={userEmail}
                    InputProps={{ readOnly: true }}
                    sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.85rem', borderRadius: 2 } }}
                  />
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* Description */}
                <Box sx={{ mb: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                    <AppIcon
                      name="NotesOutlined"
                      fallback={NotesOutlinedIcon}
                      sx={{ fontSize: 16, color: 'text.secondary' }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Description
                    </Typography>
                  </Box>
                  {infoEditMode ? (
                    <TextField
                      multiline
                      minRows={2}
                      maxRows={6}
                      fullWidth
                      size="small"
                      placeholder="Add a description..."
                      value={infoDraft.description}
                      onChange={(e) => setInfoDraft((p) => ({ ...p, description: e.target.value }))}
                      sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.85rem', borderRadius: 2 } }}
                    />
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.82rem',
                        color: wf.description ? 'text.primary' : 'text.disabled',
                      }}
                    >
                      {wf.description || '-'}
                    </Typography>
                  )}
                </Box>

                {/* Landing page URL */}
                {wf.landingPageUrl && (
                  <Box sx={{ mb: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                      <AppIcon
                        name="Link"
                        fallback={LinkIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.65rem',
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Landing Page
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.82rem', color: 'primary.main', wordBreak: 'break-all' }}
                    >
                      {wf.landingPageUrl}
                    </Typography>
                  </Box>
                )}

                {/* Canvas stats */}
                <Box sx={{ mb: 2.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      display: 'block',
                      mb: 0.75,
                    }}
                  >
                    Canvas
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip
                      label={`${wf.nodes?.length || 0} blocks`}
                      size="small"
                      sx={{ borderRadius: 1.5, fontWeight: 600, fontSize: '0.72rem' }}
                    />
                    <Chip
                      label={`${wf.edges?.length || 0} connections`}
                      size="small"
                      sx={{ borderRadius: 1.5, fontWeight: 600, fontSize: '0.72rem' }}
                    />
                  </Box>
                </Box>

                {/* Workflow JSON (nodes + edges) - view & edit */}
                <Box sx={{ mb: 2.5 }}>
                  <Box
                    onClick={() => {
                      if (!infoJsonOpen) {
                        // Build JSON from current canvas state
                        const currentNodes = canvasStateRef.current?.nodes || wf.nodes || [];
                        const currentEdges = canvasStateRef.current?.edges || wf.edges || [];
                        const jsonData = {
                          nodes: currentNodes.map((n) => ({
                            id: n.id,
                            type: n.type,
                            label: n.data?.label || n.data?.blockType || '',
                            blockType: n.data?.blockType || n.data?.blockId || '',
                            config: n.data?.config || {},
                            position: n.position,
                            ...(n.data?._n8nType ? { _n8nType: n.data._n8nType } : {}),
                          })),
                          edges: currentEdges.map((e) => ({
                            id: e.id,
                            source: e.source,
                            target: e.target,
                            ...(e.data?.connectionId ? { connectionId: e.data.connectionId } : {}),
                          })),
                        };
                        setInfoJsonDraft(JSON.stringify(jsonData, null, 2));
                        setInfoJsonError('');
                      }
                      setInfoJsonOpen((v) => !v);
                    }}
                    sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.75 }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        flex: 1,
                      }}
                    >
                      Workflow JSON
                    </Typography>
                    {infoJsonOpen ? (
                      <AppIcon
                        name="ExpandLess"
                        fallback={ExpandLessIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    ) : (
                      <AppIcon
                        name="ExpandMore"
                        fallback={ExpandMoreIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    )}
                  </Box>

                  <Collapse in={infoJsonOpen}>
                    <TextField
                      multiline
                      fullWidth
                      minRows={8}
                      maxRows={20}
                      size="small"
                      value={infoJsonDraft}
                      onChange={(e) => {
                        setInfoJsonDraft(e.target.value);
                        setInfoJsonError('');
                      }}
                      slotProps={{
                        input: {
                          sx: {
                            fontFamily: 'monospace',
                            fontSize: 11,
                            lineHeight: 1.5,
                            borderRadius: 2,
                          },
                        },
                      }}
                      sx={{ mb: 1 }}
                    />
                    {infoJsonError && (
                      <Alert severity="error" sx={{ mb: 1, py: 0, fontSize: 11 }}>
                        {infoJsonError}
                      </Alert>
                    )}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        sx={{
                          textTransform: 'none',
                          borderRadius: 2,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                        }}
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(infoJsonDraft);
                            if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
                              setInfoJsonError('JSON must have a "nodes" array');
                              return;
                            }
                            // Convert back to ReactFlow format
                            const newNodes = parsed.nodes.map((n) => ({
                              id: n.id,
                              type: n.type || 'workflow',
                              position: n.position || { x: 0, y: 0 },
                              data: {
                                nodeId: n.id,
                                blockType: n.blockType || n.config?.blockType || 'transform',
                                blockId: n.blockType || n.config?.blockType || 'transform',
                                label: n.label || n.blockType || 'Block',
                                config: n.config || {},
                                ...(n._n8nType ? { _n8nType: n._n8nType } : {}),
                              },
                            }));
                            const newEdges = (parsed.edges || []).map((e) => ({
                              id: e.id,
                              source: e.source,
                              target: e.target,
                              type: 'smoothstep',
                              style: { strokeWidth: 2 },
                              data: {
                                connectionType: 'outgoing',
                                connectionId: e.connectionId || e.id,
                              },
                            }));
                            setCanvasInitialNodes(newNodes);
                            setCanvasInitialEdges(newEdges);
                            canvasStateRef.current = { nodes: newNodes, edges: newEdges };
                            setInfoJsonError('');
                            pushNotification(
                              'Workflow',
                              `Applied JSON: ${newNodes.length} blocks, ${newEdges.length} connections`,
                              { severity: 'success' }
                            );
                          } catch (err) {
                            setInfoJsonError(err.message || 'Invalid JSON');
                          }
                        }}
                      >
                        Apply to Canvas
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: 'none', borderRadius: 2, fontSize: '0.72rem' }}
                        onClick={() => {
                          navigator.clipboard?.writeText(infoJsonDraft);
                          pushNotification('Copied', 'JSON copied to clipboard', {
                            severity: 'info',
                          });
                        }}
                      >
                        Copy
                      </Button>
                    </Box>
                  </Collapse>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* Projects using this workflow */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      display: 'block',
                      mb: 0.75,
                    }}
                  >
                    Projects ({wfProjects.length})
                  </Typography>
                  {wfProjects.length === 0 ? (
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.82rem', color: 'text.disabled' }}
                    >
                      No projects linked to this workflow.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {wfProjects.map((proj) => {
                        const statusColors = isDark
                          ? {
                              Active: '#4ADE80',
                              Paused: '#FACC15',
                              Completed: '#60A5FA',
                              Archived: '#8B949E',
                            }
                          : {
                              Active: '#059669',
                              Paused: '#D97706',
                              Completed: '#2563EB',
                              Archived: '#64748B',
                            };
                        const c = statusColors[proj.status] || statusColors.Active;
                        return (
                          <Box
                            key={proj.id}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              py: 0.75,
                              px: 1,
                              borderRadius: 1.5,
                              bgcolor: isDark ? alpha(c, 0.06) : alpha(c, 0.04),
                              border: '1px solid',
                              borderColor: isDark ? alpha(c, 0.15) : alpha(c, 0.1),
                            }}
                          >
                            <AppIcon
                              name="FolderOutlined"
                              fallback={FolderOutlinedIcon}
                              sx={{ fontSize: 15, color: c }}
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  fontSize: '0.78rem',
                                  color: c,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {proj.name}
                              </Typography>
                              {proj.partnerName && (
                                <Typography
                                  variant="caption"
                                  sx={{ fontSize: '0.62rem', color: 'text.secondary' }}
                                >
                                  {proj.partnerName}
                                  {proj.teamName ? ` · ${proj.teamName}` : ''}
                                </Typography>
                              )}
                            </Box>
                            <Chip
                              label={proj.status}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                color: c,
                                bgcolor: isDark ? alpha(c, 0.12) : alpha(c, 0.08),
                                borderRadius: 1,
                              }}
                            />
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Box>
              {/* Footer actions (edit mode) */}
              {infoEditMode && (
                <Box
                  sx={{
                    px: 2.5,
                    py: 2,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    bgcolor: alpha(theme.palette.background.default, 0.4),
                  }}
                >
                  <Stack direction="row" spacing={1.25} justifyContent="flex-end">
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setInfoEditMode(false);
                        setInfoDraft({
                          name: wf.name || '',
                          enabled: wf.enabled !== false,
                          description: wf.description || '',
                          category: wf.category || '',
                          visibility: wf.visibility || 'public',
                        });
                      }}
                      sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<AppIcon name="Save" fallback={SaveIcon} />}
                      disabled={!hasInfoChanges || !infoDraft.name.trim()}
                      onClick={async () => {
                        const payload = {
                          name: infoDraft.name.trim() || 'Untitled Workflow',
                          enabled: Boolean(infoDraft.enabled),
                          description: infoDraft.description || '',
                          category: (infoDraft.category || '').trim() || null,
                          visibility: infoDraft.visibility || 'public',
                          updatedByEmail: user?.email || '',
                        };
                        const updated = await updateWorkflow(wf.id, payload);
                        logWorkflowAction(
                          'Workflow updated',
                          wf.id,
                          'Updated workflow metadata (name, status, description).'
                        );
                        pushNotification('Workflow', 'Workflow updated.');
                        setInfoEditMode(false);
                        if (updated) {
                          setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? updated : w)));
                          if (editingWorkflow?.id === wf.id) setEditingWorkflow(updated);
                        }
                        loadWorkflows();
                      }}
                      sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                    >
                      Save
                    </Button>
                  </Stack>
                </Box>
              )}
            </Box>
          );
        })()}
      </Drawer>
    </>
  );

  // If editing, use Canvas layout
  if (isEditing) {
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Sticky Header for Edit Mode */}
        <Paper
          elevation={0}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 11,
            flexShrink: 0,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.paper, 0.8),
            backdropFilter: 'blur(12px)',
            backgroundImage: `linear-gradient(to right, ${alpha(theme.palette.primary.main, 0.05)}, ${alpha(theme.palette.background.paper, 0.2)})`,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: { xs: 1, md: 2 },
              py: { xs: 1, md: 1.5 },
              gap: 1,
            }}
          >
            {/* Left: Back & Title */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
              <Tooltip title="Back to Workflows">
                <IconButton
                  onClick={handleBack}
                  size={isMobile ? 'small' : 'medium'}
                  sx={{
                    bgcolor: alpha(theme.palette.text.primary, 0.04),
                    '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.08) },
                    '& svg': { fontSize: isMobile ? 22 : undefined },
                  }}
                >
                  <AppIcon name="ArrowBack" fallback={ArrowBackIcon} fontSize="small" />
                </IconButton>
              </Tooltip>

              <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant={isMobile ? 'subtitle1' : 'h6'}
                    noWrap
                    sx={{ fontWeight: 700, lineHeight: 1.2 }}
                  >
                    Editor
                  </Typography>
                  {!isMobile && (
                    <Chip
                      label={currentWorkflow?.name || 'Untitled'}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 20,
                        fontSize: '0.75rem',
                        maxWidth: 200,
                        borderColor: alpha(theme.palette.divider, 0.5),
                        bgcolor: alpha(theme.palette.background.default, 0.4),
                      }}
                    />
                  )}
                </Box>
                {!isMobile && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ opacity: 0.8 }}>
                    Drag blocks to build your automation flow.
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Right: Actions */}
            <Stack direction="row" spacing={isMobile ? 0.5 : 1} alignItems="center">
              {/* Blocks Toggle */}
              <Tooltip title={blocksSidebarOpen ? 'Hide Blocks' : 'Show Blocks'}>
                <Button
                  variant={blocksSidebarOpen ? 'contained' : 'text'}
                  color="primary"
                  onClick={() => setBlocksSidebarOpen((v) => !v)}
                  size={isMobile ? 'small' : 'medium'}
                  sx={{
                    minWidth: isMobile ? 36 : undefined,
                    px: isMobile ? 1 : 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    ...(blocksSidebarOpen && {
                      boxShadow: 'none',
                    }),
                  }}
                >
                  {isMobile ? (
                    <AppIcon name="ViewModule" fallback={ViewModuleIcon} sx={{ fontSize: 22 }} />
                  ) : (
                    <>
                      <AppIcon
                        name="ViewModule"
                        fallback={ViewModuleIcon}
                        fontSize="small"
                        sx={{ mr: 1 }}
                      />
                      Blocks
                    </>
                  )}
                </Button>
              </Tooltip>

              {isMobile ? (
                <>
                  <Tooltip title="More actions">
                    <IconButton
                      onClick={(e) => setEditorMenuAnchor(e.currentTarget)}
                      size="small"
                      sx={{
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        borderRadius: 1,
                        '& svg': { fontSize: 22 },
                      }}
                    >
                      <AppIcon name="MoreVert" fallback={MoreVertIcon} fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Menu
                    anchorEl={editorMenuAnchor}
                    open={Boolean(editorMenuAnchor)}
                    onClose={() => setEditorMenuAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{ paper: { sx: { borderRadius: 2, minWidth: 220, mt: 1.25 } } }}
                  >
                    <MenuItem
                      onClick={() => {
                        setWorkflowLetsTalkOpen(true);
                        setEditorMenuAnchor(null);
                      }}
                      sx={{ py: 1.25 }}
                    >
                      <ListItemIcon>
                        <AppIcon name="MicRounded" fallback={MicRoundedIcon} fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary="Let's Talk" />
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setInfoDrawerOpen(true);
                        setEditorMenuAnchor(null);
                      }}
                      sx={{ py: 1.25 }}
                    >
                      <ListItemIcon>
                        <AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary="Workflow Settings" />
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        if (currentWorkflow) openActionLog(currentWorkflow);
                        setEditorMenuAnchor(null);
                      }}
                      disabled={!currentWorkflow}
                      sx={{ py: 1.25 }}
                    >
                      <ListItemIcon>
                        <AppIcon
                          name="CompareArrows"
                          fallback={CompareArrowsIcon}
                          fontSize="small"
                        />
                      </ListItemIcon>
                      <ListItemText primary="Version History" />
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        handleSaveAsTemplate();
                        setEditorMenuAnchor(null);
                      }}
                      sx={{ py: 1.25 }}
                    >
                      <ListItemIcon sx={{ color: 'success.main' }}>
                        <AppIcon
                          name="BookmarkBorderOutlined"
                          fallback={BookmarkBorderOutlinedIcon}
                          fontSize="small"
                        />
                      </ListItemIcon>
                      <ListItemText primary="Save as Template" />
                    </MenuItem>
                  </Menu>
                </>
              ) : (
                <>
                  <Tooltip title="Let's Talk">
                    <IconButton
                      onClick={() => setWorkflowLetsTalkOpen(true)}
                      size="small"
                      sx={{
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        borderRadius: 1,
                        '& svg': { fontSize: isMobile ? 22 : undefined },
                      }}
                    >
                      <AppIcon name="MicRounded" fallback={MicRoundedIcon} fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Workflow Settings">
                    <IconButton
                      onClick={() => setInfoDrawerOpen(true)}
                      size="small"
                      sx={{
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        borderRadius: 1,
                        '& svg': { fontSize: isMobile ? 22 : undefined },
                      }}
                    >
                      <AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Version History">
                    <IconButton
                      onClick={() => currentWorkflow && openActionLog(currentWorkflow)}
                      size="small"
                      sx={{
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        borderRadius: 1,
                        '& svg': { fontSize: isMobile ? 22 : undefined },
                      }}
                    >
                      <AppIcon name="CompareArrows" fallback={CompareArrowsIcon} fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Save as Template">
                    <IconButton
                      onClick={handleSaveAsTemplate}
                      size="small"
                      color="success"
                      sx={{
                        border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
                        bgcolor: alpha(theme.palette.success.main, 0.05),
                        borderRadius: 1,
                        '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.1) },
                        '& svg': { fontSize: isMobile ? 22 : undefined },
                      }}
                    >
                      <AppIcon
                        name="BookmarkBorderOutlined"
                        fallback={BookmarkBorderOutlinedIcon}
                        fontSize="small"
                      />
                    </IconButton>
                  </Tooltip>
                </>
              )}

              <Divider
                orientation="vertical"
                flexItem
                sx={{ height: 24, alignSelf: 'center', mx: 0.5 }}
              />

              {/* Save Action */}
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveWorkflow}
                disabled={workflowSaving}
                size={isMobile ? 'small' : 'medium'}
                sx={{
                  boxShadow: 'none',
                  textTransform: 'none',
                  fontWeight: 700,
                  minWidth: isMobile ? 36 : undefined,
                  px: isMobile ? 0 : 2,
                  borderRadius: 2,
                }}
              >
                {workflowSaving ? (
                  <CircularProgress size={18} color="inherit" />
                ) : isMobile ? (
                  <AppIcon name="Save" fallback={SaveIcon} sx={{ fontSize: 22 }} />
                ) : (
                  <>
                    <AppIcon name="Save" fallback={SaveIcon} fontSize="small" sx={{ mr: 1 }} />
                    Save
                  </>
                )}
              </Button>

              {/* Run Workflow */}
              <Button
                variant="outlined"
                color="success"
                onClick={() => setRunDialogOpen(true)}
                size={isMobile ? 'small' : 'medium'}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  minWidth: isMobile ? 36 : undefined,
                  px: isMobile ? 0 : 2,
                  borderRadius: 2,
                }}
              >
                {isMobile ? (
                  <AppIcon name="PlayArrow" fallback={PlayArrowIcon} sx={{ fontSize: 22 }} />
                ) : (
                  <>
                    <AppIcon
                      name="PlayArrow"
                      fallback={PlayArrowIcon}
                      fontSize="small"
                      sx={{ mr: 0.5 }}
                    />
                    Run
                  </>
                )}
              </Button>
            </Stack>
          </Box>
        </Paper>
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <WorkflowOptionsContext.Provider value={workflowOptions}>
            <WorkflowCanvas
              key={activeWorkflowId || 'new'}
              initialNodes={
                activeGoalId
                  ? canvasInitialNodes.map((n) =>
                      n.type === 'phase'
                        ? { ...n, data: { ...(n.data || {}), onViewOutput: handleViewPhaseOutput } }
                        : n
                    )
                  : canvasInitialNodes
              }
              initialEdges={canvasInitialEdges}
              stateRef={canvasStateRef}
              sidebarOpen={blocksSidebarOpen}
              onSidebarToggle={setBlocksSidebarOpen}
              customBlocks={workflowCustomBlocks}
              onOpenAddCustomBlockDialog={() => setWorkflowAddCustomBlockDialogOpen(true)}
              onUpdateCustomBlock={updateWorkflowCustomBlock}
              onRemoveCustomBlock={removeWorkflowCustomBlock}
              onCreateCustomBlock={createWorkflowCustomBlock}
              voiceApiRef={workflowVoiceApiRef}
              isMobile={isMobile}
              isGoalWorkflow={Boolean(activeGoalId)}
              goalData={goalData}
              onStartTour={handleStartTour}
            />
          </WorkflowOptionsContext.Provider>
        </Box>
        <WorkflowLetsTalkDialog
          open={workflowLetsTalkOpen}
          onClose={() => setWorkflowLetsTalkOpen(false)}
          funnelBlocks={FUNNEL_BLOCKS}
          workflowCustomBlocks={workflowCustomBlocks}
          voiceApiRef={workflowVoiceApiRef}
          userScope={user?.uid || user?.email || 'anonymous'}
        />
        {/* Goal phase output drawer */}
        {activeGoalId && (
          <GoalPhaseDrawer
            open={phaseDrawer.open}
            onClose={() => setPhaseDrawer({ open: false, phaseIndex: null })}
            goalId={activeGoalId}
            goalData={goalData}
            phaseIndex={phaseDrawer.phaseIndex}
          />
        )}
        {/* Tour controls */}
        {tourActive && goalData?.plan?.phases?.length > 0 && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              px: 3,
              py: 1.5,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              zIndex: 10,
            }}
          >
            <Button
              size="small"
              disabled={tourIndex <= 0}
              onClick={() => setTourIndex((i) => Math.max(0, i - 1))}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Previous
            </Button>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, minWidth: 100, textAlign: 'center' }}
            >
              Phase {tourIndex + 1} of {goalData.plan.phases.length}
            </Typography>
            <Button
              size="small"
              disabled={tourIndex >= goalData.plan.phases.length - 1}
              onClick={() => setTourIndex((i) => Math.min(goalData.plan.phases.length - 1, i + 1))}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Next
            </Button>
            <Button
              size="small"
              color="inherit"
              onClick={() => setTourActive(false)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Exit
            </Button>
          </Paper>
        )}
        <RunWorkflowDialog
          open={runDialogOpen}
          onClose={() => setRunDialogOpen(false)}
          workflowId={activeWorkflowId}
          workflowName={editingWorkflow?.name}
          workflow={currentWorkflow}
          nodes={canvasStateRef.current?.nodes || []}
          edges={canvasStateRef.current?.edges || []}
          onExecutionStart={(jobId) => {
            setRunDialogOpen(false);
            setActiveExecutionId(jobId);
          }}
        />
        {activeExecutionId && (
          <ExecutionTracePanel
            executionId={activeExecutionId}
            onClose={() => setActiveExecutionId(null)}
          />
        )}
        {dialogs}
      </Box>
    );
  }

  // List Mode (Enterprise Layout)
  return (
    <PageLayout
      title="Workflows"
      subtitle="Build funnels with landing pages, campaigns, SMS, email, and scheduling blocks."
      showTitleBlock={false}
    >
      <BentoCard
        title="Workflows"
        explain
        noTour
        subtitle={
          !isMobile && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {orgFilter && (
                <Chip
                  label="Organization filter"
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 24, fontWeight: 700, fontSize: '0.72rem' }}
                />
              )}
              {workflowOverview.map((item) => (
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
          )
        }
        icon={AccountTreeOutlinedIcon}
        noPadding
      >
        {/* Toolbar */}
        <Box
          sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
            p: { xs: 1.5, md: 2 },
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            bgcolor: alpha(theme.palette.background.paper, 0.4),
          }}
        >
          {/* Row 1: Tabs only */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
                { id: TAB_WORKFLOW, label: 'Workflows', icon: AccountTreeOutlinedIcon },
                { id: TAB_TEMPLATES, label: 'Templates', icon: AutoAwesomeOutlinedIcon },
                { id: TAB_PLAYGROUND, label: 'Playground', icon: ExtensionOutlinedIcon },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  startIcon={<AppIcon fallback={tab.icon} sx={{ fontSize: 18 }} />}
                  onClick={() => setActiveTab(tab.id)}
                  fullWidth={isMobile}
                  sx={{
                    borderRadius: 2.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    px: 2,
                    minHeight: 36,
                    transition: 'all 0.2s',
                    bgcolor:
                      activeTab === tab.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    color: activeTab === tab.id ? 'primary.main' : 'text.secondary',
                    boxShadow:
                      activeTab === tab.id
                        ? `0 2px 4px ${alpha(theme.palette.primary.main, 0.1)}`
                        : 'none',
                    '&:hover': {
                      bgcolor:
                        activeTab === tab.id
                          ? alpha(theme.palette.primary.main, 0.15)
                          : alpha(theme.palette.text.primary, 0.05),
                      color: activeTab === tab.id ? 'primary.main' : 'text.primary',
                    },
                  }}
                >
                  {tab.label}
                </Button>
              ))}
            </Box>
          </Box>

          {/* Row 2 (Workflows tab only): Filter, Card/Table view on left, Categories + Create on right */}
          {activeTab === TAB_WORKFLOW && (
            <Box
              data-tour-block="workflow-toolbar"
              data-tour-label="Controls"
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}
            >
              {/* Filter - left, before card/table view */}
              <Tooltip title="Filter workflows by search and category" placement="bottom" arrow>
                <IconButton
                  onClick={(e) => setWorkflowFilterAnchorEl(e.currentTarget)}
                  size="small"
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
                  aria-label="Filter workflows"
                >
                  <AppIcon
                    name="Tune"
                    fallback={TuneIcon}
                    sx={{ fontSize: 20, color: 'text.secondary' }}
                  />
                </IconButton>
              </Tooltip>
              <Popover
                open={Boolean(workflowFilterAnchorEl)}
                anchorEl={workflowFilterAnchorEl}
                onClose={() => setWorkflowFilterAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{
                  paper: {
                    sx: {
                      mt: 1.5,
                      p: 0,
                      borderRadius: 3,
                      minWidth: 300,
                      maxWidth: 360,
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
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 700, color: 'text.primary' }}
                      >
                        Filters
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block' }}
                      >
                        Search and category
                      </Typography>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ p: 2.5 }}>
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
                    placeholder="Search workflows..."
                    value={workflowSearch}
                    onChange={(e) => setWorkflowSearch(e.target.value)}
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
                  <FormControl size="small" fullWidth sx={{ borderRadius: 2 }}>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={workflowCategoryFilter}
                      label="Category"
                      onChange={(e) => setWorkflowCategoryFilter(e.target.value)}
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
                      {existingWorkflowCategories.map((cat) => (
                        <MenuItem key={cat} value={cat}>
                          {cat}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                {isSuperAdmin && (
                  <>
                    <Divider />
                    <Box sx={{ px: 2.5, py: 1.5 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={showPrivateWorkflows}
                            onChange={(e) => setShowPrivateWorkflows(e.target.checked)}
                            color="warning"
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                            Show private workflows
                          </Typography>
                        }
                      />
                    </Box>
                  </>
                )}
                <Divider />
                <Box sx={{ px: 2.5, py: 1.5, bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
                  <Typography
                    component="button"
                    variant="body2"
                    onClick={() => {
                      setWorkflowSearch('');
                      setWorkflowCategoryFilter('All');
                      setShowPrivateWorkflows(false);
                      setWorkflowFilterAnchorEl(null);
                    }}
                    sx={{
                      border: 0,
                      background: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: 'primary.main',
                    }}
                  >
                    Reset filters
                  </Typography>
                </Box>
              </Popover>

              {/* Card/Table view toggle */}
              <Box
                sx={{
                  display: 'flex',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: theme.palette.background.paper,
                }}
              >
                <Tooltip title="Grid view">
                  <IconButton
                    size="small"
                    onClick={() => setViewMode('grid')}
                    sx={{
                      borderRadius: 0,
                      px: 1,
                      py: 0.5,
                      bgcolor:
                        viewMode === 'grid'
                          ? alpha(theme.palette.primary.main, 0.1)
                          : 'transparent',
                      color: viewMode === 'grid' ? 'primary.main' : 'text.secondary',
                      '&:hover': {
                        bgcolor:
                          viewMode === 'grid'
                            ? alpha(theme.palette.primary.main, 0.15)
                            : alpha(theme.palette.action.hover, 0.05),
                      },
                    }}
                  >
                    <AppIcon
                      name="GridViewRounded"
                      fallback={GridViewRoundedIcon}
                      sx={{ fontSize: 20 }}
                    />
                  </IconButton>
                </Tooltip>
                <Divider orientation="vertical" flexItem />
                <Tooltip title="Table view">
                  <IconButton
                    size="small"
                    onClick={() => setViewMode('table')}
                    sx={{
                      borderRadius: 0,
                      px: 1,
                      py: 0.5,
                      bgcolor:
                        viewMode === 'table'
                          ? alpha(theme.palette.primary.main, 0.1)
                          : 'transparent',
                      color: viewMode === 'table' ? 'primary.main' : 'text.secondary',
                      '&:hover': {
                        bgcolor:
                          viewMode === 'table'
                            ? alpha(theme.palette.primary.main, 0.15)
                            : alpha(theme.palette.action.hover, 0.05),
                      },
                    }}
                  >
                    <AppIcon
                      name="TableRowsRounded"
                      fallback={TableRowsRoundedIcon}
                      sx={{ fontSize: 20 }}
                    />
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }} />

              {/* Categories + Create - right side of same line as card/table view */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0 }}>
                {/* Categories (add/edit/delete only from here; add when creating workflow; categories persist after workflow delete) */}
                <Tooltip
                  title="Manage categories - add here or when creating; remove only here"
                  placement="bottom"
                  arrow
                >
                  <IconButton
                    onClick={(e) => setWorkflowCategoriesAnchorEl(e.currentTarget)}
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
                <Popover
                  open={Boolean(workflowCategoriesAnchorEl)}
                  anchorEl={workflowCategoriesAnchorEl}
                  onClose={() => {
                    setWorkflowCategoriesAnchorEl(null);
                    setEditingWfCategory(null);
                    setNewWfCategoryName('');
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
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block' }}
                    >
                      Add here or when creating a workflow. Edit or delete only from this list.
                    </Typography>
                  </Box>
                  <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', gap: 0.75 }}>
                      <TextField
                        size="small"
                        placeholder="New category name"
                        value={newWfCategoryName}
                        onChange={(e) => setNewWfCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddWfCategory();
                          }
                        }}
                        sx={{ flex: 1, '& .MuiInputBase-root': { borderRadius: 2 } }}
                      />
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleAddWfCategory}
                        disabled={!newWfCategoryName.trim()}
                        sx={{
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 600,
                          minWidth: 56,
                        }}
                      >
                        Add
                      </Button>
                    </Box>
                  </Box>
                  <Box sx={{ py: 1, maxHeight: 320, overflowY: 'auto' }}>
                    {existingWorkflowCategories.length === 0 ? (
                      <Typography variant="body2" sx={{ px: 2, py: 2, color: 'text.secondary' }}>
                        No categories yet. Add one above or when creating a workflow.
                      </Typography>
                    ) : (
                      existingWorkflowCategories.map((cat) => {
                        const Icon = getWorkflowCategoryIcon(cat);
                        const count = workflows.filter(
                          (w) => (w.category || '').trim() === cat
                        ).length;
                        const isDeleting = deletingWfCategory === cat;
                        const isEditing = editingWfCategory === cat;
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
                            <Icon sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0 }} />
                            {isEditing ? (
                              <>
                                <TextField
                                  size="small"
                                  value={editingWfCategoryValue}
                                  onChange={(e) => setEditingWfCategoryValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter')
                                      handleEditWfCategory(cat, editingWfCategoryValue);
                                    if (e.key === 'Escape') setEditingWfCategory(null);
                                  }}
                                  autoFocus
                                  sx={{
                                    flex: 1,
                                    '& .MuiInputBase-root': {
                                      borderRadius: 2,
                                      fontSize: '0.875rem',
                                    },
                                  }}
                                />
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => handleEditWfCategory(cat, editingWfCategoryValue)}
                                  aria-label="Save"
                                >
                                  <AppIcon
                                    name="Check"
                                    fallback={CheckIcon}
                                    sx={{ fontSize: 18 }}
                                  />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => setEditingWfCategory(null)}
                                  aria-label="Cancel"
                                >
                                  <AppIcon
                                    name="Close"
                                    fallback={CloseIcon}
                                    sx={{ fontSize: 18 }}
                                  />
                                </IconButton>
                              </>
                            ) : (
                              <>
                                <Tooltip title="Filter workflows by this category" arrow>
                                  <Box
                                    sx={{
                                      flex: 1,
                                      minWidth: 0,
                                      cursor: 'pointer',
                                      borderRadius: 1,
                                      px: 0.5,
                                      py: 0.25,
                                      mx: -0.5,
                                      my: -0.25,
                                      '&:hover': {
                                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                                      },
                                    }}
                                    onClick={() => {
                                      setWorkflowCategoryFilter(cat);
                                      setWorkflowCategoriesAnchorEl(null);
                                    }}
                                  >
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      {cat}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                      {count} workflow{count !== 1 ? 's' : ''}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                                <Tooltip title="Rename category" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWfCategory(cat);
                                      setEditingWfCategoryValue(cat);
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
                                <Tooltip title="Remove this category from all workflows" arrow>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    disabled={isDeleting}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteWfCategory(cat);
                                    }}
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

                {/* Create Button */}
                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  startIcon={<AppIcon name="Add" fallback={AddIcon} />}
                  onClick={handleCreate}
                  sx={{
                    borderRadius: 3,
                    height: 36,
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 2,
                    borderWidth: 2,
                    '&:hover': { borderWidth: 2 },
                  }}
                >
                  Add
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  size="small"
                  startIcon={<AppIcon name="SwapHoriz" fallback={SwapHorizIcon} />}
                  onClick={() => setN8nImportOpen(true)}
                  sx={{
                    borderRadius: 3,
                    height: 36,
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 2,
                    borderWidth: 2,
                    '&:hover': { borderWidth: 2 },
                  }}
                >
                  Import n8n
                </Button>
              </Box>
            </Box>
          )}
        </Box>

        <Box sx={{ p: activeTab === TAB_PLAYGROUND ? 0 : 3, overflow: 'hidden' }}>
          {activeTab === TAB_WORKFLOW && (
            <WorkflowList
              workflows={filteredWorkflows}
              projects={projects}
              onPlay={handlePlay}
              onPause={handlePause}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreate={handleCreate}
              onActionLog={openActionLog}
              onToggleProject={async (proj) => {
                const newStatus = proj.status === 'Active' ? 'Paused' : 'Active';
                await editProjectInHook(proj.id, { status: newStatus });
              }}
              viewMode={viewMode}
              setViewMode={setViewMode}
              currentUserId={user?.uid}
              isSuperAdmin={isSuperAdmin}
            />
          )}
          {activeTab === TAB_TEMPLATES && (
            <TemplatesTab
              onUseTemplate={handleUseTemplate}
              customTemplates={customTemplates}
              onEditCustomTemplate={handleEditCustomTemplate}
              onDeleteCustomTemplate={handleDeleteCustomTemplate}
            />
          )}
          {/* Playground: always mounted but hidden when inactive so blocks/canvas persist until leaving page */}
          <Box
            sx={{
              display: activeTab === TAB_PLAYGROUND ? 'flex' : 'none',
              width: '100%',
              height: '100%',
              flexDirection: 'column',
            }}
          >
            <Paper
              elevation={0}
              sx={{
                flexShrink: 0,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: alpha(theme.palette.background.paper, 0.8),
                backdropFilter: 'blur(12px)',
                backgroundImage: `linear-gradient(to right, ${alpha(theme.palette.primary.main, 0.05)}, ${alpha(theme.palette.background.paper, 0.2)})`,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: { xs: 1, md: 2 },
                  py: { xs: 1, md: 1.5 },
                  gap: 1,
                }}
              >
                {/* Left: Back & Title (match Editor layout) */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                  <Tooltip title="Back to Workflows">
                    <IconButton
                      onClick={() => setActiveTab(TAB_WORKFLOW)}
                      size={isMobile ? 'small' : 'medium'}
                      sx={{
                        bgcolor: alpha(theme.palette.text.primary, 0.04),
                        '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.08) },
                        '& svg': { fontSize: isMobile ? 22 : undefined },
                      }}
                    >
                      <AppIcon name="ArrowBack" fallback={ArrowBackIcon} fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        variant={isMobile ? 'subtitle1' : 'h6'}
                        noWrap
                        sx={{ fontWeight: 700, lineHeight: 1.2 }}
                      >
                        Playground
                      </Typography>
                      {!isMobile && (
                        <Chip
                          label="Ephemeral"
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 20,
                            fontSize: '0.75rem',
                            borderColor: alpha(theme.palette.warning.main, 0.3),
                            bgcolor: alpha(theme.palette.warning.main, 0.08),
                            color: 'warning.dark',
                          }}
                        />
                      )}
                    </Box>
                    {!isMobile && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ opacity: 0.8 }}
                      >
                        Test ideas with custom blocks. Data is not saved.
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Right: Playground Controls (match Editor style) */}
                <Stack direction="row" spacing={isMobile ? 0.5 : 1} alignItems="center">
                  <Tooltip title={playgroundSidebarOpen ? 'Hide Blocks' : 'Show Blocks'}>
                    <Button
                      variant={playgroundSidebarOpen ? 'contained' : 'text'}
                      color="primary"
                      onClick={() => setPlaygroundSidebarOpen((v) => !v)}
                      size={isMobile ? 'small' : 'medium'}
                      sx={{
                        minWidth: isMobile ? 36 : undefined,
                        px: isMobile ? 1 : 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 2,
                        ...(playgroundSidebarOpen && { boxShadow: 'none' }),
                      }}
                    >
                      {isMobile ? (
                        <AppIcon
                          name="ViewModule"
                          fallback={ViewModuleIcon}
                          sx={{ fontSize: 22 }}
                        />
                      ) : (
                        <>
                          <AppIcon
                            name="ViewModule"
                            fallback={ViewModuleIcon}
                            fontSize="small"
                            sx={{ mr: 1 }}
                          />
                          Blocks
                        </>
                      )}
                    </Button>
                  </Tooltip>

                  <Tooltip title="Playground Info">
                    <IconButton
                      onClick={() => setPlaygroundInfoOpen(true)}
                      size="small"
                      sx={{
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        borderRadius: 1,
                        '& svg': { fontSize: isMobile ? 22 : undefined },
                      }}
                    >
                      <AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={{ height: 24, alignSelf: 'center', mx: 0.5 }}
                  />

                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      if (window.confirm('Clear playground? This cannot be undone.')) {
                        setPlaygroundResetKey((k) => k + 1);
                        setPlaygroundCustomBlocks([]); // Optional: clear custom blocks too? Usually yes for "Reset"
                      }
                    }}
                    size={isMobile ? 'small' : 'medium'}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      minWidth: isMobile ? 36 : undefined,
                      px: isMobile ? 0 : 2,
                      borderRadius: 2,
                      borderStyle: 'dashed',
                    }}
                  >
                    {isMobile ? (
                      <AppIcon name="RestartAlt" fallback={RestartAltIcon} sx={{ fontSize: 22 }} />
                    ) : (
                      <>
                        <AppIcon
                          name="RestartAlt"
                          fallback={RestartAltIcon}
                          fontSize="small"
                          sx={{ mr: 1 }}
                        />
                        Reset
                      </>
                    )}
                  </Button>
                </Stack>
              </Box>
            </Paper>
            <PlaygroundCanvas
              key={playgroundResetKey} // Force remount on reset
              initialNodes={playgroundInitialNodes}
              initialEdges={playgroundInitialEdges}
              stateRef={playgroundStateRef}
              sidebarOpen={playgroundSidebarOpen}
              onSidebarToggle={setPlaygroundSidebarOpen}
              customBlocks={playgroundCustomBlocks}
              onOpenAddCustomBlockDialog={() => setAddCustomBlockDialogOpen(true)}
              onUpdateCustomBlock={updatePlaygroundCustomBlock}
              onRemoveCustomBlock={removePlaygroundCustomBlock}
              onCreateCustomBlock={createPlaygroundCustomBlock}
            />
          </Box>
        </Box>
      </BentoCard>
      {/* Add Custom Block dialog (Playground) */}
      <FormDialog
        open={addCustomBlockDialogOpen}
        onClose={() => setAddCustomBlockDialogOpen(false)}
        title="Add custom block"
        icon={ExtensionOutlinedIcon}
        maxWidth="sm"
        hideFooter
        contentDividers={false}
      >
        <DialogContentText sx={{ mb: 2 }}>
          Create a block with a unique name and optional description. It will appear in the sidebar
          and can be dragged to the canvas or added with +.
        </DialogContentText>
        <AddCustomBlockForm
          existingNames={playgroundCustomBlocks.map((b) => b.label)}
          onCancel={() => setAddCustomBlockDialogOpen(false)}
          onSave={(name, description, jsonConfig) => {
            createPlaygroundCustomBlock(name, description, jsonConfig);
            setAddCustomBlockDialogOpen(false);
          }}
        />
      </FormDialog>
      {/* Playground Info Dialog */}
      <FormDialog
        open={playgroundInfoOpen}
        onClose={() => setPlaygroundInfoOpen(false)}
        title="About Playground"
        icon={InfoOutlinedIcon}
        maxWidth="xs"
        contentDividers={false}
        primaryLabel="Got it"
        onPrimary={() => setPlaygroundInfoOpen(false)}
        hideCancel
      >
        <DialogContentText>
          This is an ephemeral workspace for testing ideas and custom blocks.
          <br />
          <br />• <b>Not Saved:</b> All data is lost when you refresh or leave.
          <br />• <b>Custom Blocks:</b> Use the sidebar to create block types.
          <br />• <b>Reset:</b> Use the reset button to clear the canvas.
        </DialogContentText>
      </FormDialog>
      {dialogs}
    </PageLayout>
  );
}
