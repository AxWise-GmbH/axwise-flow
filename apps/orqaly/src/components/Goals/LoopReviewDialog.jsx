import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Chip,
  Link,
  Button,
  Divider,
  Tooltip,
} from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import PauseOutlinedIcon from '@mui/icons-material/PauseOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import { pauseGoal, resumeGoal, cancelGoal } from '../../services/goalService';
import GoalDetailDialog from './GoalDetailDialog';
import AgentDetailDialog from '../AgentHub/AgentDetailDialog';

import AppIcon from '../icons/AppIcon';

/** ISO timestamp -> "dd.mm.yy hh:mm" (locale-independent). */
function formatStarted(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STATUS_COLOR = {
  active: 'success',
  paused: 'warning',
  completed: 'info',
  failed: 'error',
  cancelled: 'error',
};

/** Human-readable label for a loop_paused_reason. */
function pausedReasonLabel(reason) {
  if (!reason) return '';
  if (reason === 'chain_budget_cap') return 'Chain budget cap reached';
  if (reason === 'converged') return 'Converged (low quality gain)';
  if (reason === 'hitl_checkpoint') return 'Awaiting your approval';
  if (reason.startsWith('max_loop_depth')) return 'Max loop depth reached';
  if (reason.startsWith('spawn_failed')) return 'Continuation failed to spawn';
  if (reason === 'continuation_failed_after_heal') return 'Continuation failed after heal';
  return reason;
}

function Field({ label, children }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        py: 0.75,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right', minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

/**
 * Dedicated review popup for a single loop (a looped goal). Shows the loop's
 * info — agent (team lead), goal, iterations, started, status — and its
 * controls (resume / pause / delete / open goal). Built entirely from the loop
 * row already loaded on the page (the getLoops() shape).
 */
export default function LoopReviewDialog({ open, loop, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailGoalId, setDetailGoalId] = useState(null);
  const [detailAgent, setDetailAgent] = useState(null);

  const paused = loop ? loop.loop_paused || loop.status === 'paused' : false;

  const runAction = useCallback(
    async (fn) => {
      if (!loop) return;
      setBusy(true);
      try {
        await fn(loop.goal_id);
        onChanged?.();
        onClose?.();
      } catch {
        /* surfaced via parent refetch */
      } finally {
        setBusy(false);
      }
    },
    [loop, onChanged, onClose]
  );

  if (!loop) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <AppIcon
                name="SyncOutlined"
                fallback={SyncOutlinedIcon}
                sx={{ color: 'primary.main' }}
              />
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: '1rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {loop.goal_title || 'Untitled goal'}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={loop.status || 'active'}
              color={STATUS_COLOR[loop.status] || 'default'}
              sx={{ fontWeight: 700, textTransform: 'capitalize' }}
            />
          </Box>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Field label="Agent">
            {loop.agent_id ? (
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() =>
                  setDetailAgent({
                    id: loop.agent_id,
                    name: loop.agent_name,
                    role: loop.agent_role,
                  })
                }
                sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}
              >
                {loop.agent_name}
                {loop.agent_role ? ` · ${loop.agent_role}` : ''}
              </Link>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                {loop.agent_name || 'Unassigned'}
              </Typography>
            )}
          </Field>
          <Field label="Goal">
            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={() => setDetailGoalId(loop.goal_id)}
              sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'primary.main' }}
            >
              {String(loop.goal_id).slice(0, 8)}
            </Link>
          </Field>
          <Field label="Loops">
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {loop.max_loops ? `${loop.loops} / ${loop.max_loops}` : loop.loops}
            </Typography>
          </Field>
          <Field label="Started">
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {formatStarted(loop.started_at)}
            </Typography>
          </Field>
          <Field label="Loop state">
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
              <Chip
                size="small"
                variant="outlined"
                label={loop.loop_enabled ? 'Loop on' : 'Loop off'}
                color={loop.loop_enabled ? 'success' : 'default'}
                sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }}
              />
              {loop.loop_advanced && (
                <Chip
                  size="small"
                  label="Advanced"
                  color="primary"
                  sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }}
                />
              )}
              {paused && (
                <Chip
                  size="small"
                  variant="outlined"
                  label="Paused"
                  color="warning"
                  sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }}
                />
              )}
            </Box>
          </Field>
          {paused && loop.loop_paused_reason && (
            <Field label="Why paused">
              <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>
                {pausedReasonLabel(loop.loop_paused_reason)}
              </Typography>
            </Field>
          )}

          {confirmDelete && (
            <Box
              sx={{
                mt: 2,
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'error.main',
                color: 'error.contrastText',
                opacity: 0.95,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Delete this loop? This cancels the goal and stops further continuations. Existing
                child goals are not affected.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          {confirmDelete ? (
            <>
              <Button
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => runAction(cancelGoal)}
                disabled={busy}
                color="error"
                variant="contained"
                disableElevation
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Confirm delete
              </Button>
            </>
          ) : (
            <>
              <Tooltip title="Open the full goal" arrow>
                <Button
                  onClick={() => setDetailGoalId(loop.goal_id)}
                  startIcon={<AppIcon name="OpenInNewOutlined" fallback={OpenInNewOutlinedIcon} />}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Open goal
                </Button>
              </Tooltip>
              <Box sx={{ flex: 1 }} />
              <Button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                color="error"
                startIcon={<AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} />}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Delete
              </Button>
              {paused ? (
                <Button
                  onClick={() => runAction(resumeGoal)}
                  disabled={busy}
                  color="success"
                  variant="contained"
                  disableElevation
                  startIcon={<AppIcon name="PlayArrowOutlined" fallback={PlayArrowOutlinedIcon} />}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  onClick={() => runAction(pauseGoal)}
                  disabled={busy}
                  color="warning"
                  variant="contained"
                  disableElevation
                  startIcon={<AppIcon name="PauseOutlined" fallback={PauseOutlinedIcon} />}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  Pause
                </Button>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>
      {detailGoalId && (
        <GoalDetailDialog
          open
          goalId={detailGoalId}
          onClose={() => setDetailGoalId(null)}
          onUpdated={onChanged}
        />
      )}
      {detailAgent && (
        <AgentDetailDialog open agent={detailAgent} onClose={() => setDetailAgent(null)} />
      )}
    </>
  );
}
