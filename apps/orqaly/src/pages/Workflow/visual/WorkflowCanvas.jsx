import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './workflowHandles.css';
import {
  Box,
  Typography,
  Paper,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Stack,
  Button,
  Popover,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import SelectAllOutlinedIcon from '@mui/icons-material/SelectAllOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import InputAdornment from '@mui/material/InputAdornment';
import ShowConnectionNumbersContext from './ShowConnectionNumbersContext';
import Menu from '@mui/material/Menu';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CircularProgress from '@mui/material/CircularProgress';
import { FUNNEL_BLOCKS } from './blockLibrary';
import WorkflowNode from './WorkflowNode';
import WorkflowEdge from './WorkflowEdge';
import CustomBlockNode from './CustomBlockNode';
import PhaseNode from './PhaseNode';
import {
  CUSTOM_BLOCK_ICON_CATEGORIES,
  CUSTOM_BLOCK_ICON_LIBRARY,
  getCustomBlockIconById,
} from './customBlockIcons';
import { applyIntentToReactFlow } from '../../../features/voiceWorkflow/canvas/canvasStateManager';

import AppIcon from '../../../components/icons/AppIcon';

const nodeTypes = { workflow: WorkflowNode, custom: CustomBlockNode, phase: PhaseNode };
const edgeTypes = { workflow: WorkflowEdge };
const defaultEdgeOptions = { type: 'workflow', style: { strokeWidth: 2 }, data: {} };

let connectionIdCounter = 1;
function generateConnectionId() {
  return `conn_${Date.now().toString(36)}_${(connectionIdCounter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Ensure every node has position { x, y }. */
function normalizeNodePosition(node, index = 0) {
  if (!node || typeof node !== 'object') return null;
  const pos = node.position;
  const x = typeof pos?.x === 'number' ? pos.x : (index * 220) % 400;
  const y = typeof pos?.y === 'number' ? pos.y : Math.floor(index / 2) * 120;
  return { ...node, position: { x, y } };
}

function normalizeNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((n, i) => {
      if (n?.type === 'phase' && !n.data) {
        const { id, type, position, ...rest } = n;
        return normalizeNodePosition({ id, type, position, data: rest }, i);
      }
      return normalizeNodePosition(n, i);
    })
    .filter(Boolean);
}

function normalizeEdges(edges) {
  if (!Array.isArray(edges)) return [];
  return edges
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      return {
        ...defaultEdgeOptions,
        ...e,
        type: e.type || defaultEdgeOptions.type,
        style: { ...(defaultEdgeOptions.style ?? {}), ...(e.style ?? {}) },
        data: { ...(defaultEdgeOptions.data ?? {}), ...(e.data ?? {}) },
      };
    })
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  Block item – click + to add OR drag to canvas                      */
/* ------------------------------------------------------------------ */
const MAX_BLOCK_DESC_CHARS = 20;
const MAX_BLOCK_LABEL_CHARS_PER_LINE = 20;
function BlockItem({
  block,
  onAdd,
  accentColor = 'primary',
  onIconClick,
  iconInteractive = false,
  onRemove,
  onEdit,
}) {
  const theme = useTheme();
  const accent = theme.palette?.[accentColor]?.main || theme.palette.primary.main;
  const [isHovered, setIsHovered] = useState(false);
  const labelText = String(block?.label || '');
  const visibleLabel =
    labelText.length > MAX_BLOCK_LABEL_CHARS_PER_LINE
      ? `${labelText.slice(0, MAX_BLOCK_LABEL_CHARS_PER_LINE)}\n${labelText.slice(MAX_BLOCK_LABEL_CHARS_PER_LINE)}`
      : labelText;
  const fullDescription = String(block?.description || '');
  const hasDescription = Boolean(fullDescription.trim());
  const isTruncated = hasDescription && fullDescription.length > MAX_BLOCK_DESC_CHARS;
  const visibleDescription = isTruncated
    ? fullDescription.slice(0, MAX_BLOCK_DESC_CHARS)
    : fullDescription;
  return (
    <Paper
      variant="outlined"
      draggable
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragStart={(e) => {
        const type = block.type === 'custom' ? 'custom' : 'workflow';
        e.dataTransfer.setData(
          'application/reactflow',
          JSON.stringify({
            blockId: block.id,
            type,
            label: block.label,
            description: block.description || '',
            iconId: block.iconId || 'extension',
          })
        );
        e.dataTransfer.effectAllowed = 'move';
      }}
      sx={{
        p: 1.5,
        mb: 1,
        cursor: 'grab',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': {
          borderColor: accent,
          bgcolor: alpha(accent, 0.04),
        },
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '32px minmax(0, 1fr) auto',
          alignItems: 'center',
          columnGap: 1.5,
        }}
      >
        <Box
          onMouseDown={(e) => {
            // Prevent drag start when changing icon.
            if (iconInteractive) e.stopPropagation();
          }}
          onClick={(e) => {
            if (!iconInteractive) return;
            e.preventDefault();
            e.stopPropagation();
            onIconClick?.(e);
          }}
          sx={{
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            '& svg': { fontSize: 24 },
            cursor: iconInteractive ? 'pointer' : 'default',
            borderRadius: 1.5,
            p: iconInteractive ? 0.5 : 0,
            '&:hover': iconInteractive ? { bgcolor: alpha(accent, 0.12) } : undefined,
          }}
        >
          {block.icon}
        </Box>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            fontSize: '0.8rem',
            minWidth: 0,
            whiteSpace: 'pre-line',
            pr: 0.5,
          }}
        >
          {visibleLabel}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            justifyContent: 'flex-end',
            pl: 0.25,
          }}
        >
          {typeof onEdit === 'function' && block.type === 'custom' && (
            <Tooltip title={`Edit ${block.label}`}>
              <IconButton
                size="small"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(block);
                }}
                sx={{
                  p: 0.5,
                  color: 'text.secondary',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.text.primary, 0.08),
                    color: 'text.primary',
                  },
                }}
              >
                <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
          {typeof onRemove === 'function' && block.type === 'custom' && (
            <Tooltip title={`Delete ${block.label}`}>
              <IconButton
                size="small"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(block);
                }}
                sx={{
                  p: 0.5,
                  color: 'error.main',
                  '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.12) },
                }}
              >
                <AppIcon
                  name="DeleteOutlineRounded"
                  fallback={DeleteOutlineRoundedIcon}
                  sx={{ fontSize: 22 }}
                />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={`Add ${block.label} to canvas`}>
            <IconButton
              size="small"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.(block);
              }}
              sx={{
                p: 0.5,
                color: accent,
                '&:hover': { bgcolor: alpha(accent, 0.12) },
              }}
            >
              <AppIcon
                name="AddCircleOutline"
                fallback={AddCircleOutlineIcon}
                sx={{ fontSize: 22 }}
              />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      {hasDescription && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mt: 0.25,
            pl: 4,
            pr: 0.5,
            minWidth: 0,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {visibleDescription}
          </Typography>
          {isTruncated && (
            <Tooltip title={fullDescription}>
              <IconButton
                size="small"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  p: 0.25,
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.15s',
                  color: 'text.secondary',
                  '&:hover': { bgcolor: alpha(accent, 0.1), color: accent },
                }}
              >
                <AppIcon name="InfoOutlined" fallback={InfoOutlinedIcon} sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Paper>
  );
}

/* ------------------------------------------------------------------ */
/*  Blocks sidebar                                                     */
/* ------------------------------------------------------------------ */
function BlocksSidebar({
  onCollapse,
  onAddBlock,
  onOpenAddCustomBlockDialog,
  onUpdateCustomBlock,
  onRemoveCustomBlock,
  customBlocks = [],
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [iconPicker, setIconPicker] = useState({ open: false, anchorEl: null, blockId: null });
  const [iconSearch, setIconSearch] = useState('');
  const [iconCategory, setIconCategory] = useState('all');
  const [blocksSearchOpen, setBlocksSearchOpen] = useState(false);
  const [blocksQuery, setBlocksQuery] = useState('');
  const [editDialog, setEditDialog] = useState({
    open: false,
    blockId: null,
    label: '',
    description: '',
  });

  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    return CUSTOM_BLOCK_ICON_LIBRARY.filter((x) => {
      if (iconCategory !== 'all' && x.category !== iconCategory) return false;
      if (!q) return true;
      const hay = `${x.label} ${x.id} ${(x.keywords || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [iconSearch, iconCategory]);

  const normalizedBlocksQuery = blocksQuery.trim().toLowerCase();
  const matchesBlocksQuery = useCallback(
    (block) => {
      if (!normalizedBlocksQuery) return true;
      const label = String(block?.label || '').toLowerCase();
      const desc = String(block?.description || '').toLowerCase();
      return label.includes(normalizedBlocksQuery) || desc.includes(normalizedBlocksQuery);
    },
    [normalizedBlocksQuery]
  );

  const filteredCustomBlocks = useMemo(
    () => (Array.isArray(customBlocks) ? customBlocks.filter(matchesBlocksQuery) : []),
    [customBlocks, matchesBlocksQuery]
  );
  const filteredFunnelBlocks = useMemo(
    () => FUNNEL_BLOCKS.filter(matchesBlocksQuery),
    [matchesBlocksQuery]
  );

  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          Blocks
        </Typography>
        <Stack direction="row" spacing={0.25} alignItems="center">
          <Tooltip title={blocksSearchOpen ? 'Hide search' : 'Search blocks'}>
            <IconButton
              size="small"
              onClick={() => {
                setBlocksSearchOpen((v) => {
                  const next = !v;
                  if (!next) setBlocksQuery('');
                  return next;
                });
              }}
              sx={{ p: 0.5 }}
            >
              {blocksSearchOpen ? (
                <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} sx={{ fontSize: 20 }} />
              ) : (
                <AppIcon
                  name="SearchOutlined"
                  fallback={SearchOutlinedIcon}
                  sx={{ fontSize: 20 }}
                />
              )}
            </IconButton>
          </Tooltip>
          {onCollapse && (
            <Tooltip title="Collapse sidebar">
              <IconButton size="small" onClick={onCollapse} sx={{ p: 0.5 }}>
                <AppIcon name="ChevronLeft" fallback={ChevronLeftIcon} sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, pt: 1.5 }}>
        <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1.5 }}>
          Click <strong>+</strong> to add a block, or drag it onto the canvas.
        </Typography>

        {blocksSearchOpen && (
          <TextField
            size="small"
            placeholder="Search custom + funnel blocks"
            value={blocksQuery}
            onChange={(e) => setBlocksQuery(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            slotProps={{
              input: {
                sx: { borderRadius: 2 },
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon
                      name="SearchOutlined"
                      fallback={SearchOutlinedIcon}
                      sx={{ fontSize: 18, color: 'text.secondary' }}
                    />
                  </InputAdornment>
                ),
              },
            }}
          />
        )}

        <Button
          fullWidth
          variant="outlined"
          color="secondary"
          startIcon={<AppIcon name="Add" fallback={AddIcon} />}
          onClick={onOpenAddCustomBlockDialog}
          sx={{
            mb: 2,
            py: 1.25,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            borderStyle: 'dashed',
          }}
        >
          Custom
        </Button>

        {filteredCustomBlocks.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {normalizedBlocksQuery
              ? 'No custom blocks match your search.'
              : 'No custom blocks yet. Click "Custom" to create one.'}
          </Typography>
        ) : (
          <Box sx={{ mb: 1 }}>
            {filteredCustomBlocks.map((block) => {
              const iconId = block.iconId || 'extension';
              const Icon = getCustomBlockIconById(iconId)?.Icon || ExtensionOutlinedIcon;
              return (
                <BlockItem
                  key={block.id}
                  block={{
                    ...block,
                    type: 'custom',
                    icon: <AppIcon fallback={Icon} sx={{ fontSize: 24 }} />,
                  }}
                  onAdd={onAddBlock}
                  accentColor="secondary"
                  iconInteractive
                  onEdit={() => {
                    setEditDialog({
                      open: true,
                      blockId: block.id,
                      label: block.label || '',
                      description: block.description || '',
                    });
                  }}
                  onRemove={() => {
                    if (
                      window.confirm(
                        `Remove custom block "${block.label}"?\n\nThis removes it from the sidebar. Existing nodes already placed on the canvas will not be deleted.`
                      )
                    ) {
                      onRemoveCustomBlock?.(block.id);
                    }
                  }}
                  onIconClick={(e) =>
                    setIconPicker({ open: true, anchorEl: e.currentTarget, blockId: block.id })
                  }
                />
              );
            })}
          </Box>
        )}

        <Typography
          variant="caption"
          display="block"
          color="text.secondary"
          sx={{ mb: 1.25, mt: 0.5 }}
        >
          Funnel blocks
        </Typography>
        {filteredFunnelBlocks.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            No funnel blocks match your search.
          </Typography>
        ) : (
          filteredFunnelBlocks.map((block) => (
            <BlockItem key={block.id} block={block} onAdd={onAddBlock} />
          ))
        )}
      </Box>
      <Popover
        open={Boolean(iconPicker.open)}
        anchorEl={iconPicker.anchorEl}
        onClose={() => {
          setIconPicker({ open: false, anchorEl: null, blockId: null });
          setIconSearch('');
          setIconCategory('all');
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, borderRadius: 2.5, width: 380 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
          Choose icon
        </Typography>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
          {CUSTOM_BLOCK_ICON_CATEGORIES.map((c) => (
            <Button
              key={c.id}
              size="small"
              variant={iconCategory === c.id ? 'contained' : 'outlined'}
              color={iconCategory === c.id ? 'secondary' : 'inherit'}
              onClick={() => setIconCategory(c.id)}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 800,
                px: 1.25,
                minWidth: 0,
              }}
            >
              {c.label}
            </Button>
          ))}
        </Box>

        <TextField
          size="small"
          placeholder="Search icons"
          value={iconSearch}
          onChange={(e) => setIconSearch(e.target.value)}
          fullWidth
          slotProps={{ input: { sx: { borderRadius: 2 } } }}
          sx={{ mb: 1.25 }}
        />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 1,
            maxHeight: 240,
            overflow: 'auto',
            pr: 0.5,
          }}
        >
          {filteredIcons.map(({ id, label, Icon }) => (
            <Tooltip key={id} title={label}>
              <IconButton
                size="small"
                onClick={() => {
                  const blockId = iconPicker.blockId;
                  if (!blockId) return;
                  onUpdateCustomBlock?.(blockId, { iconId: id });
                  setIconPicker({ open: false, anchorEl: null, blockId: null });
                  setIconSearch('');
                  setIconCategory('all');
                }}
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.8),
                  bgcolor: alpha(theme.palette.background.paper, isDark ? 0.35 : 0.6),
                  color: 'text.primary',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                  },
                }}
              >
                <AppIcon fallback={Icon} sx={{ fontSize: 22 }} />
              </IconButton>
            </Tooltip>
          ))}
        </Box>

        {filteredIcons.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            No icons found.
          </Typography>
        )}
      </Popover>
      <Dialog
        open={Boolean(editDialog.open)}
        onClose={() => setEditDialog({ open: false, blockId: null, label: '', description: '' })}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Edit block</DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          <TextField
            label="Name"
            size="small"
            fullWidth
            value={editDialog.label}
            onChange={(e) => setEditDialog((p) => ({ ...p, label: e.target.value }))}
            sx={{ mb: 1.5 }}
          />
          <TextField
            label="Description"
            size="small"
            fullWidth
            multiline
            minRows={3}
            value={editDialog.description}
            onChange={(e) => setEditDialog((p) => ({ ...p, description: e.target.value }))}
            helperText={`Only the first ${MAX_BLOCK_DESC_CHARS} characters show in the sidebar.`}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1.5 }}>
          <Button
            onClick={() =>
              setEditDialog({ open: false, blockId: null, label: '', description: '' })
            }
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const blockId = editDialog.blockId;
              if (!blockId) return;
              onUpdateCustomBlock?.(blockId, {
                label: (editDialog.label || '').trim() || 'Custom block',
                description: editDialog.description || '',
              });
              setEditDialog({ open: false, blockId: null, label: '', description: '' });
            }}
            sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2 }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Node ID generator                                                  */
/* ------------------------------------------------------------------ */
let nodeIdCounter = 1;
function getNextId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

/* ------------------------------------------------------------------ */
/*  React Flow inner component                                         */
/* ------------------------------------------------------------------ */
function FlowInner({
  initialNodes = [],
  initialEdges = [],
  stateRef,
  addBlockRef,
  customBlocks = [],
  onCreateCustomBlock,
  voiceApiRef,
  isMobile = false,
  isGoalWorkflow = false,
  goalData = null,
  onStartTour,
}) {
  const theme = useTheme();
  const reactFlowWrapper = useRef(null);
  const editorToolsRef = useRef(null);
  const safeInitialNodes = normalizeNodes(initialNodes);
  const safeInitialEdges = normalizeEdges(initialEdges);
  const [nodes, setNodes, onNodesChange] = useNodesState(safeInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(safeInitialEdges);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const [exportLoading, setExportLoading] = useState(null); // 'png' | 'pdf' | null
  const [showAllConnectionNumbers, setShowAllConnectionNumbers] = useState(false);
  const [connectionNumbersMenuAnchor, setConnectionNumbersMenuAnchor] = useState(null);
  const [removeAllConnectionsConfirmOpen, setRemoveAllConnectionsConfirmOpen] = useState(false);
  const [editorToolsMenuAnchor, setEditorToolsMenuAnchor] = useState(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  const [connectDialog, setConnectDialog] = useState({
    open: false,
    params: null,
    connectionType: 'outgoing',
    connectionId: '',
  });

  const removeEdgeById = useCallback(
    (edgeId) => setEdges((eds) => eds.filter((e) => e.id !== edgeId)),
    [setEdges]
  );
  const disconnectIncoming = useCallback(
    (nodeId) => setEdges((eds) => eds.filter((e) => e.target !== nodeId)),
    [setEdges]
  );
  const disconnectOutgoing = useCallback(
    (nodeId) => setEdges((eds) => eds.filter((e) => e.source !== nodeId)),
    [setEdges]
  );

  /* ---- Keep stateRef always up-to-date (no re-renders) ---- */
  useEffect(() => {
    if (stateRef) stateRef.current = { nodes, edges };
  });

  /* ---- Re-initialise when parent passes new initial data ---- */
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return; // skip first render – already set via useNodesState/useEdgesState
    }
    setNodes(normalizeNodes(Array.isArray(initialNodes) ? initialNodes : []));
    setEdges(normalizeEdges(Array.isArray(initialEdges) ? initialEdges : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges]);

  /* ---- Hydrate loaded nodes with callbacks after load ---- */
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    const needsHydration = nodes.some((n) => {
      if (!n?.data) return false;
      if (n.type === 'custom') {
        return (
          typeof n.data.onRename !== 'function' ||
          typeof n.data.onDescriptionChange !== 'function' ||
          typeof n.data.onRemove !== 'function'
        );
      }
      return typeof n.data.onConfigChange !== 'function' || typeof n.data.onRemove !== 'function';
    });
    if (!needsHydration) {
      hydratedRef.current = true;
      return;
    }
    setNodes((nds) =>
      nds.map((n) => {
        const nId = n.id;
        if (n.type === 'custom') {
          return {
            ...n,
            data: {
              ...n.data,
              nodeId: n.data?.nodeId || nId,
              onRename:
                n.data?.onRename ||
                ((newLabel) => {
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === nId ? { ...node, data: { ...node.data, label: newLabel } } : node
                    )
                  );
                }),
              onDescriptionChange:
                n.data?.onDescriptionChange ||
                ((newDesc) => {
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === nId
                        ? { ...node, data: { ...node.data, description: newDesc } }
                        : node
                    )
                  );
                }),
              onJsonConfigChange:
                n.data?.onJsonConfigChange ||
                ((newJson) => {
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === nId
                        ? { ...node, data: { ...node.data, jsonConfig: newJson } }
                        : node
                    )
                  );
                }),
              onRemove:
                n.data?.onRemove ||
                (() => {
                  setNodes((prev) => prev.filter((node) => node.id !== nId));
                  setEdges((prev) => prev.filter((e) => e.source !== nId && e.target !== nId));
                }),
              onDisconnectIncoming: n.data?.onDisconnectIncoming || disconnectIncoming,
              onDisconnectOutgoing: n.data?.onDisconnectOutgoing || disconnectOutgoing,
            },
          };
        }

        if (n.data?.onConfigChange && n.data?.onRemove) return n;
        return {
          ...n,
          data: {
            ...n.data,
            nodeId: n.data?.nodeId || nId,
            onConfigChange:
              n.data?.onConfigChange ||
              ((key, value) => {
                setNodes((prev) =>
                  prev.map((node) => {
                    if (node.id !== nId) return node;
                    const next = { ...(node.data?.config ?? {}), [key]: value };
                    return { ...node, data: { ...node.data, config: next } };
                  })
                );
              }),
            onRemove:
              n.data?.onRemove ||
              (() => {
                setNodes((prev) => prev.filter((node) => node.id !== nId));
                setEdges((prev) => prev.filter((e) => e.source !== nId && e.target !== nId));
              }),
            onDisconnectIncoming: n.data?.onDisconnectIncoming || disconnectIncoming,
            onDisconnectOutgoing: n.data?.onDisconnectOutgoing || disconnectOutgoing,
          },
        };
      })
    );
    hydratedRef.current = true;
  }, [nodes, setNodes, setEdges, disconnectIncoming, disconnectOutgoing]);

  /* ---- Ensure edges have onRemove callback (for removable edge UI) ---- */
  useEffect(() => {
    const needs = edges.some((e) => typeof e.data?.onRemove !== 'function');
    if (!needs) return;
    setEdges((eds) =>
      eds.map((e) => {
        if (typeof e.data?.onRemove === 'function') return e;
        return { ...e, data: { ...(e.data ?? {}), onRemove: removeEdgeById } };
      })
    );
  }, [edges, setEdges, removeEdgeById]);

  /* ---- Keep node connection counts in sync with edges ---- */
  useEffect(() => {
    setNodes((nds) =>
      (() => {
        const labelById = new Map(
          nds.map((n) => [n.id, n.data?.label || (n.type === 'custom' ? 'Custom block' : 'Block')])
        );

        return nds.map((n) => {
          const incomingEdges = edges.filter((e) => e.target === n.id);
          const outgoingEdges = edges.filter((e) => e.source === n.id);
          const incomingCount = incomingEdges.length;
          const outgoingCount = outgoingEdges.length;
          const prevIncoming = n.data?.incomingCount ?? 0;
          const prevOutgoing = n.data?.outgoingCount ?? 0;

          const incomingConnections = incomingEdges.map((e) => ({
            edgeId: e.id,
            connectionId: e.data?.connectionId || '',
            connectionType: e.data?.connectionType || '',
            fromNodeId: e.source,
            fromLabel: labelById.get(e.source) || e.source,
          }));
          const outgoingConnections = outgoingEdges.map((e) => ({
            edgeId: e.id,
            connectionId: e.data?.connectionId || '',
            connectionType: e.data?.connectionType || '',
            toNodeId: e.target,
            toLabel: labelById.get(e.target) || e.target,
          }));

          const incomingSig = incomingConnections
            .map((c) => `${c.edgeId}:${c.connectionId}:${c.connectionType}:${c.fromNodeId}`)
            .join('|');
          const outgoingSig = outgoingConnections
            .map((c) => `${c.edgeId}:${c.connectionId}:${c.connectionType}:${c.toNodeId}`)
            .join('|');

          // Avoid churn when nothing changed.
          if (
            prevIncoming === incomingCount &&
            prevOutgoing === outgoingCount &&
            n.data?.nodeId === n.id &&
            n.data?.incomingConnectionsSig === incomingSig &&
            n.data?.outgoingConnectionsSig === outgoingSig
          ) {
            return n;
          }

          return {
            ...n,
            data: {
              ...(n.data ?? {}),
              nodeId: n.id,
              incomingCount,
              outgoingCount,
              incomingConnections,
              outgoingConnections,
              incomingConnectionsSig: incomingSig,
              outgoingConnectionsSig: outgoingSig,
              onDisconnectIncoming: n.data?.onDisconnectIncoming || disconnectIncoming,
              onDisconnectOutgoing: n.data?.onDisconnectOutgoing || disconnectOutgoing,
            },
          };
        });
      })()
    );
  }, [edges, setNodes, disconnectIncoming, disconnectOutgoing]);

  /* ---- Sync custom block icon changes to existing nodes ---- */
  useEffect(() => {
    if (!Array.isArray(customBlocks) || customBlocks.length === 0) return;
    const iconByBlockId = new Map(customBlocks.map((b) => [b.id, b.iconId || 'extension']));
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== 'custom') return n;
        const blockId = n.data?.blockId;
        if (!blockId) return n;
        const nextIconId = iconByBlockId.get(blockId);
        if (!nextIconId || n.data?.iconId === nextIconId) return n;
        return { ...n, data: { ...(n.data || {}), iconId: nextIconId } };
      })
    );
  }, [customBlocks, setNodes]);

  /* ---- Expose voice API to parent (Workflow "Let's Talk" dialog) ---- */
  useEffect(() => {
    if (!voiceApiRef) return;
    voiceApiRef.current = {
      getNodes: () => nodesRef.current,
      getEdges: () => edgesRef.current,
      applyIntent: async ({ registry, ctx, command }) => {
        return await applyIntentToReactFlow(registry, ctx, command, {
          mode: 'workflow',
          getNodes: () => nodesRef.current,
          getEdges: () => edgesRef.current,
          setNodes,
          setEdges,
          defaultEdgeFactory: ({ source, target }) => ({
            source,
            target,
            type: 'workflow',
            style: { strokeWidth: 2 },
            data: { onRemove: removeEdgeById },
          }),
          createCustomBlock: onCreateCustomBlock,
        });
      },
    };
  }, [voiceApiRef, setNodes, setEdges, removeEdgeById, onCreateCustomBlock]);

  /* ---- Helper: create a node from a sidebar/drag payload ---- */
  const createNodeAtPosition = useCallback(
    (payload, position) => {
      const id = getNextId();
      const type = payload?.type === 'custom' ? 'custom' : 'workflow';

      if (type === 'custom') {
        const newNode = {
          id,
          type: 'custom',
          position,
          data: {
            nodeId: id,
            justAdded: true,
            blockId: payload?.blockId,
            label: payload?.label || 'Custom block',
            description: payload?.description || '',
            iconId: payload?.iconId || 'extension',
            incomingCount: 0,
            outgoingCount: 0,
            onDisconnectIncoming: disconnectIncoming,
            onDisconnectOutgoing: disconnectOutgoing,
            onRename: (newLabel) => {
              setNodes((nds) =>
                nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: newLabel } } : n))
              );
            },
            onDescriptionChange: (newDesc) => {
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === id ? { ...n, data: { ...n.data, description: newDesc } } : n
                )
              );
            },
            onJsonConfigChange: (newJson) => {
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === id ? { ...n, data: { ...n.data, jsonConfig: newJson } } : n
                )
              );
            },
            onRemove: () => {
              setNodes((nds) => nds.filter((n) => n.id !== id));
              setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
            },
          },
        };
        setNodes((nds) => nds.concat(newNode));
        // Don't persist "justAdded" into saved workflows.
        setTimeout(() => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id ? { ...n, data: { ...(n.data || {}), justAdded: false } } : n
            )
          );
        }, 2500);
        return;
      }

      const newNode = {
        id,
        type: 'workflow',
        position,
        data: {
          nodeId: id,
          justAdded: true,
          blockId: payload?.blockId,
          label: payload?.label,
          config: {},
          incomingCount: 0,
          outgoingCount: 0,
          onDisconnectIncoming: disconnectIncoming,
          onDisconnectOutgoing: disconnectOutgoing,
          onConfigChange: (key, value) => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== id) return n;
                const next = { ...(n.data.config ?? {}), [key]: value };
                return { ...n, data: { ...n.data, config: next } };
              })
            );
          },
          onRemove: () => {
            setNodes((nds) => nds.filter((n) => n.id !== id));
            setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
          },
        },
      };
      setNodes((nds) => nds.concat(newNode));
      // Don't persist "justAdded" into saved workflows.
      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...(n.data || {}), justAdded: false } } : n
          )
        );
      }, 2500);
    },
    [setNodes, setEdges, disconnectIncoming, disconnectOutgoing]
  );

  /* ---- Click-to-add: called from sidebar via ref ---- */
  const addBlockToCenter = useCallback(
    (block) => {
      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const offsetX = (Math.random() - 0.5) * 60;
      const offsetY = (Math.random() - 0.5) * 60;
      const position = screenToFlowPosition({
        x: centerX + offsetX,
        y: centerY + offsetY,
      });
      createNodeAtPosition(
        {
          blockId: block.id,
          type: block.type === 'custom' ? 'custom' : 'workflow',
          label: block.label,
          description: block.description || '',
          iconId: block.iconId || 'extension',
        },
        position
      );
    },
    [screenToFlowPosition, createNodeAtPosition]
  );

  /* Expose addBlockToCenter to parent via ref */
  useEffect(() => {
    if (addBlockRef) addBlockRef.current = addBlockToCenter;
  }, [addBlockRef, addBlockToCenter]);

  /* ---- Drag-and-drop handlers ---- */
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/reactflow');
      if (!raw) return;
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      createNodeAtPosition(payload, position);
    },
    [screenToFlowPosition, createNodeAtPosition]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onConnect = useCallback((params) => {
    setConnectDialog({
      open: true,
      params,
      connectionType: 'outgoing',
      connectionId: generateConnectionId(),
    });
  }, []);

  const clearSelection = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
  }, [setNodes, setEdges]);

  const getExportElement = useCallback(() => {
    return reactFlowWrapper.current?.querySelector('.react-flow');
  }, []);

  const captureAsPng = useCallback(async () => {
    const element = getExportElement();
    if (!element) return null;
    const { toPng } = await import('html-to-image');
    const bgColor = theme.palette.background.default;
    return toPng(element, {
      pixelRatio: 2,
      backgroundColor: bgColor,
      filter: (node) => {
        if (typeof node.classList?.contains !== 'function') return true;
        return (
          !node.classList.contains('react-flow__controls') &&
          !node.classList.contains('react-flow__panel')
        );
      },
    });
  }, [theme.palette.background.default, getExportElement]);

  const handleExportPng = useCallback(async () => {
    setExportLoading('png');
    setExportMenuAnchor(null);
    try {
      fitView({ padding: 0.2, duration: 0 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dataUrl = await captureAsPng();
      if (!dataUrl) throw new Error('Could not capture canvas');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `workflow-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export PNG failed:', err);
    } finally {
      setExportLoading(null);
    }
  }, [fitView, captureAsPng]);

  const handleExportPdf = useCallback(async () => {
    setExportLoading('pdf');
    setExportMenuAnchor(null);
    try {
      fitView({ padding: 0.2, duration: 0 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dataUrl = await captureAsPng();
      if (!dataUrl) throw new Error('Could not capture canvas');
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });
      const isLandscape = img.width > img.height;
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'a4',
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const pxToPt = 72 / 96;
      const wPt = img.width * pxToPt;
      const hPt = img.height * pxToPt;
      const scale = Math.min(pageW / wPt, pageH / hPt, 1);
      const w = wPt * scale;
      const h = hPt * scale;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(dataUrl, 'PNG', x, y, w, h);
      pdf.save(`workflow-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`);
    } catch (err) {
      console.error('Export PDF failed:', err);
    } finally {
      setExportLoading(null);
    }
  }, [captureAsPng]);

  const showConnectionNumbersValue = useMemo(
    () => ({
      showAll: showAllConnectionNumbers,
      setShowAll: () => setShowAllConnectionNumbers((s) => !s),
    }),
    [showAllConnectionNumbers]
  );

  return (
    <ShowConnectionNumbersContext.Provider value={showConnectionNumbersValue}>
      <div
        ref={reactFlowWrapper}
        onDrop={onDrop}
        onDragOver={onDragOver}
        style={{ flex: 1, height: '100%' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          selectionOnDrag={multiSelectEnabled}
          selectionMode={SelectionMode.Partial}
          panOnDrag={!multiSelectEnabled}
          onPaneClick={multiSelectEnabled ? clearSelection : undefined}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.1, maxZoom: 0.85 }}
          minZoom={0.1}
          maxZoom={1.5}
          style={{ background: theme.palette.background.default }}
        >
          <Background color={theme.palette.divider} gap={16} />
          <Controls />

          {/* Goal workflow progress overlay */}
          {isGoalWorkflow && goalData && (
            <Panel position="top-left">
              <Paper
                elevation={3}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  minWidth: 220,
                  maxWidth: 280,
                  bgcolor: alpha(theme.palette.background.paper, 0.95),
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    mb: 0.75,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {goalData.title || 'Goal'}
                </Typography>
                {/* Phase progress */}
                {(() => {
                  const phases = goalData.plan?.phases || [];
                  const completed = phases.filter((p) => p.status === 'completed').length;
                  const total = phases.length || 1;
                  const pct = Math.round((completed / total) * 100);
                  return (
                    <>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mb: 0.5,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {completed}/{total} phases
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          {pct}%
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          bgcolor: alpha(theme.palette.primary.main, 0.12),
                          mb: 1,
                        }}
                      >
                        <Box
                          sx={{
                            height: '100%',
                            borderRadius: 2,
                            bgcolor: 'primary.main',
                            width: `${pct}%`,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </Box>
                    </>
                  );
                })()}
                {/* Budget */}
                {goalData.budget_usd > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 0.75,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Budget
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      ${Number(goalData.spent_usd || 0).toFixed(2)} / $
                      {Number(goalData.budget_usd).toFixed(2)}
                    </Typography>
                  </Box>
                )}
                {typeof onStartTour === 'function' && (
                  <Button
                    size="small"
                    variant="outlined"
                    fullWidth
                    className="nodrag nopan"
                    onClick={onStartTour}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      borderRadius: 1.5,
                      mt: 0.5,
                    }}
                  >
                    Tour phases
                  </Button>
                )}
              </Paper>
            </Panel>
          )}

          <Panel position="top-right">
            {isMobile ? (
              <>
                <Tooltip title="Editor tools" placement="left">
                  <IconButton
                    ref={editorToolsRef}
                    size="small"
                    onClick={(e) => setEditorToolsMenuAnchor(e.currentTarget)}
                    sx={{
                      p: 0.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: alpha(theme.palette.background.paper, 0.7),
                      color: 'text.secondary',
                      boxShadow: `0 10px 24px ${alpha(theme.palette.common.black, 0.15)}`,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.background.paper, 0.85),
                        color: 'text.primary',
                      },
                    }}
                  >
                    <AppIcon name="MoreVert" fallback={MoreVertIcon} sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={editorToolsMenuAnchor}
                  open={Boolean(editorToolsMenuAnchor)}
                  onClose={() => setEditorToolsMenuAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  slotProps={{ paper: { sx: { borderRadius: 2, minWidth: 200, mt: 1.25 } } }}
                >
                  <MenuItem
                    onClick={() => {
                      setMultiSelectEnabled((v) => {
                        const next = !v;
                        if (!next) clearSelection();
                        return next;
                      });
                      setEditorToolsMenuAnchor(null);
                    }}
                    sx={{ py: 1.25 }}
                  >
                    <ListItemIcon>
                      <AppIcon
                        name="SelectAllOutlined"
                        fallback={SelectAllOutlinedIcon}
                        fontSize="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={multiSelectEnabled ? 'Multi-select: ON' : 'Multi-select'}
                    />
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setEditorToolsMenuAnchor(null);
                      if (editorToolsRef.current)
                        setConnectionNumbersMenuAnchor(editorToolsRef.current);
                    }}
                    sx={{ py: 1.25 }}
                  >
                    <ListItemIcon>
                      <AppIcon
                        name="FormatListNumbered"
                        fallback={FormatListNumberedIcon}
                        fontSize="small"
                      />
                    </ListItemIcon>
                    <ListItemText primary="Connections" />
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setEditorToolsMenuAnchor(null);
                      if (editorToolsRef.current) setExportMenuAnchor(editorToolsRef.current);
                    }}
                    disabled={!!exportLoading}
                    sx={{ py: 1.25 }}
                  >
                    <ListItemIcon>
                      {exportLoading ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <AppIcon
                          name="DownloadOutlined"
                          fallback={DownloadOutlinedIcon}
                          fontSize="small"
                        />
                      )}
                    </ListItemIcon>
                    <ListItemText primary="Export diagram" />
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Tooltip
                  title={
                    multiSelectEnabled ? 'Multi-select: ON (drag to select)' : 'Multi-select: OFF'
                  }
                >
                  <IconButton
                    size="small"
                    onClick={() => {
                      setMultiSelectEnabled((v) => {
                        const next = !v;
                        if (!next) clearSelection();
                        return next;
                      });
                    }}
                    sx={{
                      p: 0.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: multiSelectEnabled ? 'primary.main' : 'divider',
                      bgcolor: multiSelectEnabled
                        ? alpha(
                            theme.palette.primary.main,
                            theme.palette.mode === 'dark' ? 0.22 : 0.12
                          )
                        : alpha(theme.palette.background.paper, 0.7),
                      color: multiSelectEnabled ? 'primary.main' : 'text.secondary',
                      boxShadow: `0 10px 24px ${alpha(theme.palette.common.black, 0.15)}`,
                      '&:hover': {
                        bgcolor: multiSelectEnabled
                          ? alpha(
                              theme.palette.primary.main,
                              theme.palette.mode === 'dark' ? 0.28 : 0.16
                            )
                          : alpha(theme.palette.background.paper, 0.85),
                      },
                    }}
                  >
                    <AppIcon
                      name="SelectAllOutlined"
                      fallback={SelectAllOutlinedIcon}
                      sx={{ fontSize: 20 }}
                    />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Connections" placement="left">
                  <IconButton
                    size="small"
                    onClick={(e) => setConnectionNumbersMenuAnchor(e.currentTarget)}
                    sx={{
                      p: 0.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: showAllConnectionNumbers ? 'primary.main' : 'divider',
                      bgcolor: showAllConnectionNumbers
                        ? alpha(
                            theme.palette.primary.main,
                            theme.palette.mode === 'dark' ? 0.22 : 0.12
                          )
                        : alpha(theme.palette.background.paper, 0.7),
                      color: showAllConnectionNumbers ? 'primary.main' : 'text.secondary',
                      boxShadow: `0 10px 24px ${alpha(theme.palette.common.black, 0.15)}`,
                      '&:hover': {
                        bgcolor: showAllConnectionNumbers
                          ? alpha(
                              theme.palette.primary.main,
                              theme.palette.mode === 'dark' ? 0.28 : 0.16
                            )
                          : alpha(theme.palette.background.paper, 0.85),
                        color: showAllConnectionNumbers ? 'primary.main' : 'text.primary',
                      },
                    }}
                  >
                    <AppIcon
                      name="FormatListNumbered"
                      fallback={FormatListNumberedIcon}
                      sx={{ fontSize: 20 }}
                    />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Export diagram" placement="left">
                  <IconButton
                    size="small"
                    onClick={(e) => setExportMenuAnchor(e.currentTarget)}
                    disabled={!!exportLoading}
                    sx={{
                      p: 0.75,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: alpha(theme.palette.background.paper, 0.7),
                      color: 'text.secondary',
                      boxShadow: `0 10px 24px ${alpha(theme.palette.common.black, 0.15)}`,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.background.paper, 0.85),
                        color: 'text.primary',
                      },
                    }}
                  >
                    {exportLoading ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <AppIcon
                        name="DownloadOutlined"
                        fallback={DownloadOutlinedIcon}
                        sx={{ fontSize: 20 }}
                      />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Panel>
          <Menu
            anchorEl={exportMenuAnchor}
            open={Boolean(exportMenuAnchor)}
            onClose={() => setExportMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { borderRadius: 2, minWidth: 200, mt: 1.25 } } }}
          >
            <MenuItem
              onClick={handleExportPng}
              disabled={!!exportLoading}
              sx={{ py: 1.25, fontWeight: 500 }}
            >
              <ListItemIcon>
                <AppIcon name="ImageOutlined" fallback={ImageOutlinedIcon} fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Save as PNG" secondary="Image file" />
            </MenuItem>
            <MenuItem
              onClick={handleExportPdf}
              disabled={!!exportLoading}
              sx={{ py: 1.25, fontWeight: 500 }}
            >
              <ListItemIcon>
                <AppIcon
                  name="PictureAsPdfOutlined"
                  fallback={PictureAsPdfOutlinedIcon}
                  fontSize="small"
                />
              </ListItemIcon>
              <ListItemText primary="Save as PDF" secondary="Document" />
            </MenuItem>
          </Menu>
          <Menu
            anchorEl={connectionNumbersMenuAnchor}
            open={Boolean(connectionNumbersMenuAnchor)}
            onClose={() => setConnectionNumbersMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { borderRadius: 2, minWidth: 220, mt: 1.25 } } }}
          >
            <MenuItem
              onClick={() => {
                setShowAllConnectionNumbers((s) => !s);
                setConnectionNumbersMenuAnchor(null);
              }}
              sx={{ py: 1.25, fontWeight: 500 }}
            >
              <ListItemIcon>
                {showAllConnectionNumbers ? (
                  <AppIcon
                    name="VisibilityOffOutlined"
                    fallback={VisibilityOffOutlinedIcon}
                    fontSize="small"
                  />
                ) : (
                  <AppIcon
                    name="VisibilityOutlined"
                    fallback={VisibilityOutlinedIcon}
                    fontSize="small"
                  />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  showAllConnectionNumbers ? 'Hide connection numbers' : 'Show connection numbers'
                }
                secondary={
                  showAllConnectionNumbers
                    ? 'Numbers visible on hover only'
                    : 'Show numbers on all handles'
                }
              />
            </MenuItem>
            <MenuItem
              onClick={() => {
                setConnectionNumbersMenuAnchor(null);
                setRemoveAllConnectionsConfirmOpen(true);
              }}
              sx={{ py: 1.25, fontWeight: 500, color: 'error.main' }}
            >
              <ListItemIcon sx={{ color: 'inherit' }}>
                <AppIcon name="LinkOff" fallback={LinkOffIcon} fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Remove all connections" />
            </MenuItem>
          </Menu>
        </ReactFlow>

        <Dialog
          open={removeAllConnectionsConfirmOpen}
          onClose={() => setRemoveAllConnectionsConfirmOpen(false)}
          maxWidth="xs"
          fullWidth
          slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        >
          <DialogTitle sx={{ fontWeight: 800, pb: 0 }}>Remove all connections?</DialogTitle>
          <DialogContent sx={{ pt: 1.5, pb: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Are you sure you want to remove all?
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, pt: 1.5 }}>
            <Button
              onClick={() => setRemoveAllConnectionsConfirmOpen(false)}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              No
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                setEdges([]);
                setRemoveAllConnectionsConfirmOpen(false);
              }}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              Yes
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(connectDialog.open)}
          onClose={() => setConnectDialog((p) => ({ ...p, open: false, params: null }))}
          maxWidth="xs"
          fullWidth
          slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        >
          <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Connection settings</DialogTitle>
          <DialogContent sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose a connection type and ID. This will be saved with the workflow.
            </Typography>

            <TextField
              select
              label="Connection type"
              size="small"
              fullWidth
              value={connectDialog.connectionType}
              onChange={(e) => setConnectDialog((p) => ({ ...p, connectionType: e.target.value }))}
              sx={{ mb: 1.5 }}
            >
              <MenuItem value="incoming">Incoming</MenuItem>
              <MenuItem value="outgoing">Outgoing</MenuItem>
            </TextField>

            <TextField
              label="Connection ID"
              size="small"
              fullWidth
              value={connectDialog.connectionId}
              onChange={(e) => setConnectDialog((p) => ({ ...p, connectionId: e.target.value }))}
              placeholder="e.g. conn_leads_main"
              helperText="You can paste your own ID or keep the auto-generated one."
            />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 1.5 }}>
            <Button
              onClick={() => setConnectDialog((p) => ({ ...p, open: false, params: null }))}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                const params = connectDialog.params;
                if (!params) return;
                const connectionId =
                  (connectDialog.connectionId || '').trim() || generateConnectionId();
                const connectionType = connectDialog.connectionType || 'outgoing';
                setEdges((eds) =>
                  addEdge(
                    {
                      ...params,
                      ...defaultEdgeOptions,
                      data: {
                        ...(defaultEdgeOptions.data ?? {}),
                        onRemove: removeEdgeById,
                        connectionId,
                        connectionType,
                      },
                    },
                    eds
                  )
                );
                setConnectDialog({
                  open: false,
                  params: null,
                  connectionType: 'outgoing',
                  connectionId: '',
                });
              }}
              sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2 }}
            >
              Create connection
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </ShowConnectionNumbersContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Main exported canvas component                                     */
/* ------------------------------------------------------------------ */
export default function WorkflowCanvas({
  initialNodes = [],
  initialEdges = [],
  stateRef,
  sidebarOpen: externalSidebarOpen,
  onSidebarToggle,
  customBlocks = [],
  onOpenAddCustomBlockDialog,
  onUpdateCustomBlock,
  onRemoveCustomBlock,
  onCreateCustomBlock,
  voiceApiRef,
  isMobile = false,
  isGoalWorkflow = false,
  goalData = null,
  onStartTour,
}) {
  // Use external state if provided, otherwise fall back to internal
  const [internalOpen, setInternalOpen] = useState(true);
  const sidebarOpen = externalSidebarOpen !== undefined ? externalSidebarOpen : internalOpen;
  const setSidebarOpen = onSidebarToggle || setInternalOpen;

  const addBlockRef = useRef(null);

  const handleAddBlock = useCallback((block) => {
    addBlockRef.current?.(block);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        height: 'calc(100vh - 140px)',
        minHeight: 400,
        position: 'relative',
      }}
    >
      {sidebarOpen && (
        <BlocksSidebar
          onCollapse={() => setSidebarOpen(false)}
          onAddBlock={handleAddBlock}
          customBlocks={customBlocks}
          onOpenAddCustomBlockDialog={onOpenAddCustomBlockDialog}
          onUpdateCustomBlock={onUpdateCustomBlock}
          onRemoveCustomBlock={onRemoveCustomBlock}
        />
      )}
      <ReactFlowProvider>
        <FlowInner
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          stateRef={stateRef}
          addBlockRef={addBlockRef}
          customBlocks={customBlocks}
          onCreateCustomBlock={onCreateCustomBlock}
          voiceApiRef={voiceApiRef}
          isMobile={isMobile}
          isGoalWorkflow={isGoalWorkflow}
          goalData={goalData}
          onStartTour={onStartTour}
        />
      </ReactFlowProvider>
    </Box>
  );
}
