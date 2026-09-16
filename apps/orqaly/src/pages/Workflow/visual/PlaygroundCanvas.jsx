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
import InputAdornment from '@mui/material/InputAdornment';
import CustomBlockNode from './CustomBlockNode';
import {
  CUSTOM_BLOCK_ICON_CATEGORIES,
  CUSTOM_BLOCK_ICON_LIBRARY,
  getCustomBlockIconById,
} from './customBlockIcons';
import VoiceAssistantPanel from '../../../features/voiceWorkflow/ui/VoiceAssistantPanel';
import { BlockRegistry } from '../../../features/voiceWorkflow/registry/blockRegistry';
import {
  PREDEFINED_BLOCKS,
  DEFAULT_ALIASES,
} from '../../../features/voiceWorkflow/registry/predefinedBlocks';

import AppIcon from '../../../components/icons/AppIcon';

const nodeTypes = { custom: CustomBlockNode };
const defaultEdgeOptions = { type: 'smoothstep', style: { strokeWidth: 2 } };

const VOICE_BLOCK_REGISTRY = new BlockRegistry(PREDEFINED_BLOCKS, { aliases: DEFAULT_ALIASES });

let connectionIdCounter = 1;
function generateConnectionId() {
  return `conn_${Date.now().toString(36)}_${(connectionIdCounter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeNodePosition(node, index = 0) {
  if (!node || typeof node !== 'object') return null;
  const pos = node.position;
  const x = typeof pos?.x === 'number' ? pos.x : (index * 220) % 400;
  const y = typeof pos?.y === 'number' ? pos.y : Math.floor(index / 2) * 120;
  return { ...node, position: { x, y } };
}

function normalizeNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n, i) => normalizeNodePosition(n, i)).filter(Boolean);
}

let nodeIdCounter = 1;
function getNextId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

const MAX_BLOCK_DESC_CHARS = 20;
const MAX_BLOCK_LABEL_CHARS_PER_LINE = 20;
function BlockItem({ block, onAdd, onIconClick, iconInteractive = false, onRemove, onEdit }) {
  const theme = useTheme();
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
        e.dataTransfer.setData(
          'application/reactflow',
          JSON.stringify({
            blockId: block.id,
            type: 'custom',
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
          borderColor: 'primary.main',
          bgcolor: alpha(theme.palette.primary.main, 0.04),
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
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            '& svg': { fontSize: 24 },
            cursor: iconInteractive ? 'pointer' : 'default',
            borderRadius: 1.5,
            p: iconInteractive ? 0.5 : 0,
            '&:hover': iconInteractive
              ? { bgcolor: alpha(theme.palette.primary.main, 0.12) }
              : undefined,
          }}
        >
          {block.icon}
        </Box>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 700, fontSize: '0.8rem', minWidth: 0, whiteSpace: 'pre-line', pr: 0.5 }}
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
          {typeof onEdit === 'function' && (
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
          {typeof onRemove === 'function' && (
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
          <Tooltip title="Add to canvas">
            <IconButton
              size="small"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.(block);
              }}
              sx={{
                p: 0.5,
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
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
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'secondary.main',
                  },
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

function PlaygroundSidebar({
  onCollapse,
  onAddBlock,
  onOpenAddCustom,
  onUpdateCustomBlock,
  onRemoveCustomBlock,
  customBlocks,
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
  const filteredCustomBlocks = useMemo(() => {
    const blocks = Array.isArray(customBlocks) ? customBlocks : [];
    if (!normalizedBlocksQuery) return blocks;
    return blocks.filter((b) => {
      const label = String(b?.label || '').toLowerCase();
      const desc = String(b?.description || '').toLowerCase();
      return label.includes(normalizedBlocksQuery) || desc.includes(normalizedBlocksQuery);
    });
  }, [customBlocks, normalizedBlocksQuery]);

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
          Test ideas with custom blocks. Data is not saved.
        </Typography>

        {blocksSearchOpen && (
          <TextField
            size="small"
            placeholder="Search custom blocks"
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
          onClick={onOpenAddCustom}
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
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {normalizedBlocksQuery
              ? 'No custom blocks match your search.'
              : 'No custom blocks yet. Click "Custom" to create one.'}
          </Typography>
        ) : (
          filteredCustomBlocks.map((block) => {
            const iconId = block.iconId || 'extension';
            const Icon = getCustomBlockIconById(iconId)?.Icon || ExtensionOutlinedIcon;
            return (
              <BlockItem
                key={block.id}
                block={{ ...block, icon: <AppIcon fallback={Icon} sx={{ fontSize: 24 }} /> }}
                onAdd={onAddBlock}
                iconInteractive
                onRemove={() => {
                  if (
                    window.confirm(
                      `Remove custom block "${block.label}"?\n\nThis removes it from the sidebar. Existing nodes already placed on the canvas will not be deleted.`
                    )
                  ) {
                    onRemoveCustomBlock?.(block.id);
                  }
                }}
                onEdit={() => {
                  setEditDialog({
                    open: true,
                    blockId: block.id,
                    label: block.label || '',
                    description: block.description || '',
                  });
                }}
                onIconClick={(e) =>
                  setIconPicker({ open: true, anchorEl: e.currentTarget, blockId: block.id })
                }
              />
            );
          })
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
                    borderColor: 'secondary.main',
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

function FlowInner({
  initialNodes = [],
  initialEdges = [],
  stateRef,
  addBlockRef,
  customBlocks,
  onCreateCustomBlock,
}) {
  const theme = useTheme();
  const reactFlowWrapper = useRef(null);
  const safeInitialNodes = normalizeNodes(initialNodes);
  const [nodes, setNodes, onNodesChange] = useNodesState(safeInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [connectDialog, setConnectDialog] = useState({
    open: false,
    params: null,
    connectionType: 'outgoing',
    connectionId: '',
  });

  useEffect(() => {
    if (stateRef) stateRef.current = { nodes, edges };
  });

  /* Keep node connection counts + metadata in sync with edges */
  useEffect(() => {
    setNodes((nds) => {
      const labelById = new Map(nds.map((n) => [n.id, n.data?.label || 'Block']));
      return nds.map((n) => {
        const incomingEdges = edges.filter((e) => e.target === n.id);
        const outgoingEdges = edges.filter((e) => e.source === n.id);
        const incomingCount = incomingEdges.length;
        const outgoingCount = outgoingEdges.length;

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

        if (
          n.data?.incomingCount === incomingCount &&
          n.data?.outgoingCount === outgoingCount &&
          n.data?.incomingConnectionsSig === incomingSig &&
          n.data?.outgoingConnectionsSig === outgoingSig
        ) {
          return n;
        }

        return {
          ...n,
          data: {
            ...(n.data || {}),
            incomingCount,
            outgoingCount,
            incomingConnections,
            outgoingConnections,
            incomingConnectionsSig: incomingSig,
            outgoingConnectionsSig: outgoingSig,
          },
        };
      });
    });
  }, [edges, setNodes]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setNodes(normalizeNodes(Array.isArray(initialNodes) ? initialNodes : []));
    setEdges(Array.isArray(initialEdges) ? initialEdges : []);
  }, [initialNodes, initialEdges]);

  const createNodeAtPosition = useCallback(
    (blockId, label, description, iconId, position) => {
      const id = getNextId();
      const newNode = {
        id,
        type: 'custom',
        position,
        data: {
          justAdded: true,
          blockId,
          label: label || 'Custom block',
          description: description || '',
          iconId: iconId || 'extension',
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
              nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, jsonConfig: newJson } } : n))
            );
          },
          onRemove: () => {
            setNodes((nds) => nds.filter((n) => n.id !== id));
            setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
          },
        },
      };
      setNodes((nds) => nds.concat(newNode));
      // Prevent "justAdded" from lingering if the node is serialized elsewhere.
      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...(n.data || {}), justAdded: false } } : n
          )
        );
      }, 2500);
    },
    [setNodes, setEdges]
  );

  /* Keep placed nodes in sync with the custom block definitions */
  useEffect(() => {
    if (!Array.isArray(customBlocks) || customBlocks.length === 0) return;
    const iconByBlockId = new Map(customBlocks.map((b) => [b.id, b.iconId || 'extension']));
    setNodes((nds) =>
      nds.map((n) => {
        const blockId = n.data?.blockId;
        if (!blockId) return n;
        const nextIconId = iconByBlockId.get(blockId);
        if (!nextIconId || n.data?.iconId === nextIconId) return n;
        return { ...n, data: { ...(n.data || {}), iconId: nextIconId } };
      })
    );
  }, [customBlocks, setNodes]);

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
        block.id,
        block.label,
        block.description || '',
        block.iconId || 'extension',
        position
      );
    },
    [screenToFlowPosition, createNodeAtPosition]
  );

  useEffect(() => {
    if (addBlockRef) addBlockRef.current = addBlockToCenter;
  }, [addBlockRef, addBlockToCenter]);

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
      createNodeAtPosition(
        payload.blockId,
        payload.label,
        payload.description ?? '',
        payload.iconId || 'extension',
        position
      );
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

  return (
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
        connectionMode={ConnectionMode.Loose}
        selectionOnDrag={multiSelectEnabled}
        selectionMode={SelectionMode.Partial}
        panOnDrag={!multiSelectEnabled}
        onPaneClick={multiSelectEnabled ? clearSelection : undefined}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.1, maxZoom: 0.85 }}
        minZoom={0.1}
        maxZoom={1.5}
        style={{ background: theme.palette.background.default }}
      >
        <Background color={theme.palette.divider} gap={16} />
        <Controls />

        <Panel position="top-right">
          <Tooltip
            title={multiSelectEnabled ? 'Multi-select: ON (drag to select)' : 'Multi-select: OFF'}
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
                  ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.12)
                  : alpha(theme.palette.background.paper, 0.7),
                color: multiSelectEnabled ? 'primary.main' : 'text.secondary',
                boxShadow: `0 10px 24px ${alpha(theme.palette.common.black, 0.15)}`,
                '&:hover': {
                  bgcolor: multiSelectEnabled
                    ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.16)
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
        </Panel>

        <Panel position="bottom-center">
          <VoiceAssistantPanel
            mode="playground"
            registry={VOICE_BLOCK_REGISTRY}
            getNodes={() => nodes}
            getEdges={() => edges}
            setNodes={setNodes}
            setEdges={setEdges}
            defaultEdgeFactory={() => ({
              type: 'smoothstep',
              style: { strokeWidth: 2 },
              data: {},
            })}
            createCustomBlock={onCreateCustomBlock}
          />
        </Panel>
      </ReactFlow>
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
            Choose a connection type and ID.
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
                    data: { connectionId, connectionType },
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
  );
}

export default function PlaygroundCanvas({
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
}) {
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
        <PlaygroundSidebar
          onCollapse={() => setSidebarOpen(false)}
          onAddBlock={handleAddBlock}
          onOpenAddCustom={onOpenAddCustomBlockDialog}
          customBlocks={customBlocks}
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
        />
      </ReactFlowProvider>
    </Box>
  );
}
