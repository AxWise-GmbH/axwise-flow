import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Collapse,
  TextField,
  Stack,
  alpha,
} from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import PauseOutlinedIcon from '@mui/icons-material/PauseOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import EmptyState from '../../components/Common/EmptyState';
import {
  getLoops,
  pauseGoal,
  resumeGoal,
  cancelGoal,
  updateLoopSettings,
} from '../../services/goalService';
import GoalDetailDialog from '../../components/Goals/GoalDetailDialog';
import AgentDetailDialog from '../../components/AgentHub/AgentDetailDialog';
import LoopReviewDialog from '../../components/Goals/LoopReviewDialog';

import AppIcon from '../../components/icons/AppIcon';

/** ISO timestamp -> "dd.mm.yy hh:mm" (locale-independent). */
function formatStarted(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const shortId = (id) => (id ? String(id).slice(0, 8) : '-');
const isPaused = (r) => r.loop_paused || r.status === 'paused';

const HEAD = ['Loop ID', 'Agent Name / Position', 'Started', 'Goal ID', 'Loops', 'Controls'];

// Mirror of LOOP_SETTINGS_DEFAULTS in lib/goal-handlers/loop-continuation.js.
const DEFAULT_LOOP_SETTINGS = {
  convergence_min_gain: 5,
  chain_budget_cap_usd: '',
  hitl_every: 0,
  refine_max_versions: 2,
};

/** Human-readable label for a loop_paused_reason. */
function pausedReasonLabel(reason) {
  if (!reason) return '';
  if (reason === 'chain_budget_cap') return 'Paused: chain budget cap reached';
  if (reason === 'converged') return 'Paused: converged (low quality gain)';
  if (reason === 'hitl_checkpoint') return 'Paused: awaiting your approval';
  if (reason.startsWith('max_loop_depth')) return 'Paused: max loop depth reached';
  if (reason.startsWith('spawn_failed')) return 'Paused: continuation failed to spawn';
  if (reason === 'continuation_failed_after_heal') return 'Paused: continuation failed after heal';
  return `Paused: ${reason}`;
}

/**
 * Advanced controls panel shown (inside a Collapse) only when a loop's
 * Advanced flag is ON. Edits are committed on blur via updateLoopSettings.
 */
function AdvancedPanel({ loop, onSaved }) {
  const merged = { ...DEFAULT_LOOP_SETTINGS, ...(loop.loop_settings || {}) };
  const [settings, setSettings] = useState({
    convergence_min_gain: merged.convergence_min_gain ?? '',
    chain_budget_cap_usd: merged.chain_budget_cap_usd ?? '',
    hitl_every: merged.hitl_every ?? '',
    refine_max_versions: merged.refine_max_versions ?? '',
  });

  const commit = useCallback(async () => {
    const toNum = (v) => (v === '' || v === null ? undefined : Number(v));
    const patch = {
      convergence_min_gain: toNum(settings.convergence_min_gain),
      hitl_every: toNum(settings.hitl_every),
      refine_max_versions: toNum(settings.refine_max_versions),
      // Empty budget = disable the cap (null clears it server-side).
      chain_budget_cap_usd: settings.chain_budget_cap_usd === '' ? null : Number(settings.chain_budget_cap_usd),
    };
    try {
      await updateLoopSettings(loop.goal_id, { loop_settings: patch });
      onSaved?.();
    } catch {
      /* surfaced on next refresh */
    }
  }, [settings, loop.goal_id, onSaved]);

  const field = (key, label, { min = 0, max, step = 1, placeholder } = {}) => (
    <TextField
      label={label}
      type="number"
      size="small"
      value={settings[key]}
      placeholder={placeholder}
      onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
      onBlur={commit}
      inputProps={{ min, max, step }}
      sx={{ width: 150 }}
    />
  );

  const cap = Number(loop.loop_settings?.chain_budget_cap_usd);
  const spend = Number(loop.chain_spend_usd || 0);

  return (
    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1.5, color: 'text.secondary' }}>
        Advanced loop controls
      </Typography>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        {field('convergence_min_gain', 'Min quality gain', { min: 0, max: 100 })}
        {field('chain_budget_cap_usd', 'Chain budget cap ($)', { min: 0, step: 1, placeholder: 'off' })}
        {field('hitl_every', 'Approve every N', { min: 0, placeholder: 'off' })}
        {field('refine_max_versions', 'Refine max versions', { min: 0, max: 10 })}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Loop depth: <strong>{loop.loop_depth || 0}</strong>
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Chain spend: <strong>${spend.toFixed(2)}</strong>
          {Number.isFinite(cap) && cap > 0 ? ` / $${cap.toFixed(2)}` : ''}
        </Typography>
        {loop.loop_paused && loop.loop_paused_reason && (
          <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
            {pausedReasonLabel(loop.loop_paused_reason)}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

/**
 * Loops tab for the Requests page. Lists looped goals (from getLoops) with the
 * looping agent (team lead), when the loop started, and per-row controls:
 * Play (resume), Pause, Delete (cancel goal), Edit (open goal). Agent and Goal
 * IDs open the agent and goal detail popups respectively.
 */
export default function LoopsTab({ theme, isDark, onStatsChange, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [detailGoalId, setDetailGoalId] = useState(null);
  const [detailAgent, setDetailAgent] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [reviewLoop, setReviewLoop] = useState(null);

  const fetchLoops = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLoops();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoops();
  }, [fetchLoops, refreshKey]);

  // Report stat cards to the parent metrics strip.
  useEffect(() => {
    if (typeof onStatsChange !== 'function') return;
    const active = rows.filter((r) => !isPaused(r)).length;
    const paused = rows.filter((r) => isPaused(r)).length;
    const agents = new Set(rows.map((r) => r.agent_id).filter(Boolean)).size;
    onStatsChange([
      {
        label: 'Total Loops',
        value: rows.length,
        helper: 'Looping goals',
        color: theme.palette.primary.main,
        icon: SyncOutlinedIcon,
      },
      {
        label: 'Active',
        value: active,
        helper: 'Currently looping',
        color: theme.palette.success.main,
        icon: PlayCircleOutlineIcon,
      },
      {
        label: 'Paused',
        value: paused,
        helper: 'On hold',
        color: theme.palette.warning.main,
        icon: PauseCircleOutlineIcon,
      },
      {
        label: 'Agents',
        value: agents,
        helper: 'Distinct leads',
        color: theme.palette.info.main,
        icon: GroupsOutlinedIcon,
      },
    ]);
  }, [rows, onStatsChange, theme]);

  const runAction = useCallback(
    async (id, fn) => {
      setBusyId(id);
      try {
        await fn(id);
        await fetchLoops();
      } catch {
        /* surfaced via list refresh */
      } finally {
        setBusyId(null);
      }
    },
    [fetchLoops]
  );

  const toggleAdvanced = useCallback(
    async (r) => {
      setBusyId(r.goal_id);
      try {
        await updateLoopSettings(r.goal_id, { loop_advanced: !r.loop_advanced });
        await fetchLoops();
      } catch {
        /* surfaced via list refresh */
      } finally {
        setBusyId(null);
      }
    },
    [fetchLoops]
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.goal_id;
    setConfirmDelete(null);
    await runAction(id, cancelGoal);
  }, [confirmDelete, runAction]);

  if (loading && !rows.length)
    return (
      <Box sx={{ p: 4 }}>
        <LoadingSpinner />
      </Box>
    );

  if (!rows.length) {
    return (
      <Box sx={{ p: 4 }}>
        <EmptyState
          icon={SyncOutlinedIcon}
          title="No loops yet"
          description="Goals with looping enabled or iterations will appear here."
        />
      </Box>
    );
  }

  return (
    <>
      <TableContainer>
        <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              {HEAD.map((h) => (
                <TableCell
                  key={h}
                  align={h === 'Loops' || h === 'Controls' ? 'right' : 'left'}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.66rem',
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
            {rows.map((r) => {
              const paused = isPaused(r);
              const busy = busyId === r.goal_id;
              return (
                <Fragment key={r.loop_id}>
                <TableRow
                  hover
                  onClick={() => setReviewLoop(r)}
                  sx={{ cursor: 'pointer', '& td': { borderBottom: r.loop_advanced ? 0 : undefined } }}
                >
                  <TableCell
                    sx={{
                      py: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.74rem',
                      color: 'text.secondary',
                    }}
                  >
                    {shortId(r.loop_id)}
                  </TableCell>
                  <TableCell sx={{ py: 1 }} onClick={(e) => e.stopPropagation()}>
                    {r.agent_id ? (
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() =>
                          setDetailAgent({ id: r.agent_id, name: r.agent_name, role: r.agent_role })
                        }
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          textAlign: 'left',
                          color: 'text.primary',
                        }}
                      >
                        {r.agent_name}
                      </Link>
                    ) : (
                      <Typography
                        component="span"
                        sx={{ fontSize: '0.8rem', color: 'text.disabled' }}
                      >
                        {r.agent_name || 'Unassigned'}
                      </Typography>
                    )}
                    {r.agent_role && (
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.1 }}
                      >
                        {r.agent_role}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell
                    sx={{
                      py: 1,
                      whiteSpace: 'nowrap',
                      fontSize: '0.78rem',
                      color: 'text.secondary',
                    }}
                  >
                    {formatStarted(r.started_at)}
                  </TableCell>
                  <TableCell sx={{ py: 1 }} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={r.goal_title || ''} arrow>
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => setDetailGoalId(r.goal_id)}
                        sx={{ fontFamily: 'monospace', fontSize: '0.74rem', color: 'primary.main' }}
                      >
                        {shortId(r.goal_id)}
                      </Link>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1 }}>
                    <Chip
                      size="small"
                      label={r.max_loops ? `${r.loops}/${r.max_loops}` : r.loops}
                      sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }}
                    />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ py: 0.5, whiteSpace: 'nowrap' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title={r.loop_advanced ? 'Advanced controls on — click to turn off' : 'Turn on advanced loop controls'} arrow>
                      <Chip
                        size="small"
                        label={`Advanced: ${r.loop_advanced ? 'ON' : 'OFF'}`}
                        color={r.loop_advanced ? 'primary' : 'default'}
                        variant={r.loop_advanced ? 'filled' : 'outlined'}
                        disabled={busy}
                        onClick={() => toggleAdvanced(r)}
                        sx={{ mr: 1, height: 20, fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer' }}
                      />
                    </Tooltip>
                    {paused ? (
                      <Tooltip title="Resume loop" arrow>
                        <span>
                          <IconButton
                            aria-label="Resume loop"
                            size="small"
                            disabled={busy}
                            onClick={() => runAction(r.goal_id, resumeGoal)}
                            sx={{ color: 'success.main' }}
                          >
                            <AppIcon
                              name="PlayArrowOutlined"
                              fallback={PlayArrowOutlinedIcon}
                              sx={{ fontSize: 19 }}
                            />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Pause loop" arrow>
                        <span>
                          <IconButton
                            aria-label="Pause loop"
                            size="small"
                            disabled={busy}
                            onClick={() => runAction(r.goal_id, pauseGoal)}
                            sx={{ color: 'warning.main' }}
                          >
                            <AppIcon
                              name="PauseOutlined"
                              fallback={PauseOutlinedIcon}
                              sx={{ fontSize: 19 }}
                            />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title="Review loop" arrow>
                      <span>
                        <IconButton
                          aria-label="Review loop"
                          size="small"
                          disabled={busy}
                          onClick={() => setReviewLoop(r)}
                          sx={{ color: 'text.secondary' }}
                        >
                          <AppIcon
                            name="EditOutlined"
                            fallback={EditOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Delete loop (cancels the goal)" arrow>
                      <span>
                        <IconButton
                          aria-label="Delete loop"
                          size="small"
                          disabled={busy}
                          onClick={() => setConfirmDelete(r)}
                          sx={{ color: 'error.main' }}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={HEAD.length} sx={{ py: 0, borderBottom: r.loop_advanced ? undefined : 0 }}>
                    <Collapse in={r.loop_advanced} unmountOnExit>
                      <Box sx={{ py: 1.5 }}>
                        <AdvancedPanel loop={r} onSaved={fetchLoops} />
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {/* Delete confirmation */}
      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete this loop?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This cancels the goal{confirmDelete?.goal_title ? ` "${confirmDelete.goal_title}"` : ''}{' '}
            and stops it from spawning further loop continuations. Existing child goals are not
            affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDelete(null)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disableElevation
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      {detailGoalId && (
        <GoalDetailDialog
          open
          goalId={detailGoalId}
          onClose={() => setDetailGoalId(null)}
          onUpdated={fetchLoops}
        />
      )}
      {detailAgent && (
        <AgentDetailDialog open agent={detailAgent} onClose={() => setDetailAgent(null)} />
      )}
      <LoopReviewDialog
        open={Boolean(reviewLoop)}
        loop={reviewLoop}
        onClose={() => setReviewLoop(null)}
        onChanged={fetchLoops}
      />
    </>
  );
}
