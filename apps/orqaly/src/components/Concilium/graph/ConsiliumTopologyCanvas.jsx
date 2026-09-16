/**
 * ConsiliumTopologyCanvas - the editable org-graph canvas.
 *
 * A cloned workflow-style React Flow editor (drag / connect / add / delete / pan /
 * zoom / fit / minimap) specialised for the Organization -> Consilium -> Team ->
 * Agent hierarchy. Free-form editable: seeded from the DB, then fully the user's.
 * Persists to the consilium-topology backend with version snapshots and a
 * per-action activity feed. Intentionally decoupled from the /workflow editor and
 * its library.
 */
import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Chip,
  Snackbar,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';

import AppIcon from '../../icons/AppIcon';
import { nodeTypes, KIND_META } from './nodes/TopologyNodes';
import { VersionsPanel, ActivityPanel } from './TopologyPanels';
import TopologyNodeDialogs from './TopologyNodeDialogs';
import {
  saveTopology,
  reseedTopology,
  restoreVersion,
  getTopology,
} from '../../../services/consiliumTopologyService';

const ADD_KINDS = ['organization', 'consilium', 'team', 'agent'];
const miniMapColor = (n) => KIND_META[n?.data?.kind]?.color || '#888';

function newNodeId() {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ConsiliumTopologyCanvas({ diagram, user, variant }) {
  const theme = useTheme();
  // Simple-mode look: rounded tiles + pill buttons + accent-tinted chrome, to
  // match the simple Organizations page. Default keeps the technical editor look.
  const simple = variant === 'simple';
  const accent = theme.palette.primary.main;
  const panelSx = {
    bgcolor: alpha(theme.palette.background.paper, simple ? 0.92 : 0.9),
    backdropFilter: 'blur(6px)',
    border: '1px solid',
    borderColor: simple ? alpha(accent, 0.25) : 'divider',
    borderRadius: simple ? '20px' : 2,
    boxShadow: simple ? `0 0 0 1px ${alpha(accent, 0.08)}, 0 8px 24px rgba(0,0,0,0.28)` : 'none',
  };
  const pillBtnSx = {
    textTransform: 'none',
    borderRadius: simple ? '999px' : 1.5,
    fontWeight: simple ? 700 : undefined,
    px: simple ? 1.75 : undefined,
  };
  const chromeStyle = {
    border: `1px solid ${simple ? alpha(accent, 0.25) : theme.palette.divider}`,
    borderRadius: simple ? 14 : 8,
  };
  const [nodes, setNodes, onNodesChange] = useNodesState(diagram?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(diagram?.edges || []);
  const [version, setVersion] = useState(diagram?.current_version || 0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addAnchor, setAddAnchor] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [snack, setSnack] = useState(null); // { severity, message }
  const [inspected, setInspected] = useState(null); // node whose detail dialog is open

  const activitiesRef = useRef([]);
  const addNodeCount = useRef(0);

  const pushActivity = useCallback((action, payload) => {
    activitiesRef.current.push({ action, payload: payload || {} });
  }, []);

  const applyDiagram = useCallback(
    (d) => {
      setNodes(d?.nodes || []);
      setEdges(d?.edges || []);
      setVersion(d?.current_version || 0);
      setDirty(false);
      activitiesRef.current = [];
    },
    [setNodes, setEdges]
  );

  // A node's underlying DB record was edited via its detail dialog: reflect the
  // change on the canvas node and mark the diagram dirty.
  const handleNodeSaved = useCallback(
    (nodeId, patch) => {
      if (!patch || Object.keys(patch).length === 0) return;
      setNodes((ns) =>
        ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      pushActivity('entity_edit', { nodeId, ...patch });
      setDirty(true);
    },
    [setNodes, pushActivity]
  );

  const onConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds));
      pushActivity('edge_connect', { source: params.source, target: params.target });
      setDirty(true);
    },
    [setEdges, pushActivity]
  );

  const onNodeDragStop = useCallback(
    (_evt, node) => {
      pushActivity('node_move', { id: node.id, position: node.position });
      setDirty(true);
    },
    [pushActivity]
  );

  const onNodesDelete = useCallback(
    (deleted) => {
      for (const n of deleted) pushActivity('node_delete', { id: n.id, kind: n.data?.kind });
      setDirty(true);
    },
    [pushActivity]
  );

  const onEdgesDelete = useCallback(
    (deleted) => {
      for (const e of deleted)
        pushActivity('edge_disconnect', { source: e.source, target: e.target });
      setDirty(true);
    },
    [pushActivity]
  );

  const handleAddNode = useCallback(
    (kind) => {
      setAddAnchor(null);
      const i = addNodeCount.current++;
      const id = newNodeId();
      const node = {
        id,
        type: kind,
        position: { x: 60 + (i % 5) * 60, y: 60 + Math.floor(i / 5) * 60 },
        data: {
          label: `New ${KIND_META[kind].label}`,
          kind,
          subtitle: KIND_META[kind].label,
          statusKey: 'active',
        },
      };
      setNodes((ns) => [...ns, node]);
      pushActivity('node_add', { id, kind });
      setDirty(true);
    },
    [setNodes, pushActivity]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await saveTopology({
        nodes,
        edges,
        expectedVersion: version,
        activities: activitiesRef.current,
      });
      setVersion(res.version);
      activitiesRef.current = [];
      setDirty(false);
      setSnack({ severity: 'success', message: `Saved as v${res.version}` });
    } catch (err) {
      if (err?.status === 409) {
        try {
          const { diagram: fresh } = await getTopology();
          applyDiagram(fresh);
          setSnack({
            severity: 'warning',
            message:
              'Reloaded newer version - your changes were not saved. Re-apply and save again.',
          });
        } catch {
          setSnack({ severity: 'error', message: 'Save conflict and reload failed.' });
        }
      } else {
        setSnack({ severity: 'error', message: err?.message || 'Save failed' });
      }
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, version, applyDiagram]);

  const handleReseed = useCallback(async () => {
    setSaving(true);
    try {
      const { diagram: fresh } = await reseedTopology();
      applyDiagram(fresh);
      setSnack({ severity: 'success', message: 'Rebuilt from the database' });
    } catch (err) {
      setSnack({ severity: 'error', message: err?.message || 'Re-seed failed' });
    } finally {
      setSaving(false);
    }
  }, [applyDiagram]);

  const handleRestore = useCallback(
    async (v) => {
      setVersionsOpen(false);
      setSaving(true);
      try {
        const { diagram: fresh } = await restoreVersion(v);
        applyDiagram(fresh);
        setSnack({ severity: 'success', message: `Restored v${v}` });
      } catch (err) {
        setSnack({ severity: 'error', message: err?.message || 'Restore failed' });
      } finally {
        setSaving(false);
      }
    },
    [applyDiagram]
  );

  return (
    <Box
      data-testid="boards-graph-view"
      data-variant={variant || 'default'}
      sx={{
        width: '100%',
        height: '100%',
        ...(simple && { borderRadius: '18px', overflow: 'hidden' }),
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_evt, node) => setInspected(node)}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        fitViewOptions={{ padding: simple ? 0.4 : 0.1, maxZoom: simple ? 0.85 : 1.5 }}
        colorMode={theme.palette.mode}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color={theme.palette.divider} />
        <Controls style={{ ...chromeStyle, overflow: 'hidden', boxShadow: 'none' }} />
        {/* Minimap is hidden in the simple (Organizations) look for a cleaner view. */}
        {!simple && (
          <MiniMap
            nodeColor={miniMapColor}
            nodeStrokeColor="transparent"
            bgColor={theme.palette.background.paper}
            maskColor={alpha(theme.palette.background.default, 0.6)}
            pannable
            zoomable
            style={{ ...chromeStyle, backgroundColor: theme.palette.background.paper }}
          />
        )}

        {/* Toolbar */}
        <Panel position="top-left">
          <Stack direction="row" spacing={1} alignItems="center" sx={{ ...panelSx, p: 0.75 }}>
            <Button
              size="small"
              startIcon={<AppIcon fallback={AddIcon} sx={{ fontSize: 18 }} />}
              onClick={(e) => setAddAnchor(e.currentTarget)}
              sx={pillBtnSx}
            >
              Add
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={saving || !dirty}
              startIcon={<AppIcon fallback={SaveOutlinedIcon} sx={{ fontSize: 18 }} />}
              onClick={handleSave}
              sx={pillBtnSx}
            >
              Save
            </Button>
            <Button
              size="small"
              startIcon={<AppIcon fallback={AutorenewIcon} sx={{ fontSize: 18 }} />}
              onClick={handleReseed}
              disabled={saving}
              sx={pillBtnSx}
            >
              Refresh
            </Button>
            {/* Versions + Activity are hidden in the simple (Organizations) look. */}
            {!simple && (
              <>
                <Button
                  size="small"
                  startIcon={<AppIcon fallback={HistoryIcon} sx={{ fontSize: 18 }} />}
                  onClick={() => setVersionsOpen(true)}
                  sx={pillBtnSx}
                >
                  Versions
                </Button>
                <Button
                  size="small"
                  startIcon={<AppIcon fallback={TimelineOutlinedIcon} sx={{ fontSize: 18 }} />}
                  onClick={() => setActivityOpen(true)}
                  sx={pillBtnSx}
                >
                  Activity
                </Button>
              </>
            )}
            <Chip label={`v${version}`} size="small" sx={{ fontWeight: 700 }} />
            {dirty && (
              <Chip label="Unsaved" size="small" color="warning" sx={{ fontWeight: 700 }} />
            )}
          </Stack>
        </Panel>

        {/* Legend — hidden in the simple (Organizations) look for a cleaner view. */}
        {!simple && (
          <Panel position="top-right">
            <Stack spacing={0.5} sx={{ ...panelSx, p: 1 }}>
              {ADD_KINDS.map((k) => (
                <Stack key={k} direction="row" spacing={0.75} alignItems="center">
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: 0.5,
                      bgcolor: alpha(KIND_META[k].color, 0.7),
                    }}
                  />
                  <Box sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                    {KIND_META[k].label}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Panel>
        )}
      </ReactFlow>

      <TopologyNodeDialogs
        node={inspected}
        user={user}
        onClose={() => setInspected(null)}
        onSaved={handleNodeSaved}
      />

      <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
        {ADD_KINDS.map((k) => {
          const Meta = KIND_META[k];
          return (
            <MenuItem key={k} onClick={() => handleAddNode(k)}>
              <ListItemIcon>
                <AppIcon fallback={Meta.Icon} sx={{ fontSize: 18, color: Meta.color }} />
              </ListItemIcon>
              <ListItemText>{Meta.label}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>

      <VersionsPanel
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        onRestore={handleRestore}
      />
      <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} />

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled">
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
