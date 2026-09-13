/**
 * DesignReviewDialog — opens from RequestProgressCard once a deployment URL
 * exists. Shows the deployed page in a PreviewCanvas alongside a
 * CommentsSidebar so the user can drop pins, write feedback, and click
 * "Apply feedback" to enqueue a Designer/Developer re-run.
 *
 * Polls comments every 8s while open (Supabase Realtime would be cleaner,
 * but channel setup adds complexity for a feature that's only active while
 * the dialog is open — polling is good enough here and matches the pattern
 * useGoalRealtime uses as its 5s fallback).
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Snackbar,
  Alert,
} from '@mui/material';
import PropTypes from 'prop-types';
import CloseIcon from '@mui/icons-material/Close';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import TabletMacIcon from '@mui/icons-material/TabletMac';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import PreviewCanvas from './PreviewCanvas';
import CommentsSidebar from './CommentsSidebar';
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  applyComments,
} from './designCommentsApi';

import AppIcon from '../icons/AppIcon';

const POLL_INTERVAL_MS = 8000;

export default function DesignReviewDialog({
  open,
  onClose,
  goalId,
  deploymentUrl,
  initialViewport = 'desktop',
}) {
  const [viewport, setViewport] = useState(initialViewport);
  const [comments, setComments] = useState([]);
  const [pendingPin, setPendingPin] = useState(null);
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pin rendering uses 1-based numbering per the comment's order so users can
  // refer to "pin 3" in conversation. Filter out non-open by default but
  // keep them visible in the sidebar.
  const pins = useMemo(
    () =>
      comments.map((c, i) => ({
        id: c.id,
        x: typeof c._x === 'number' ? c._x : parseFloat(c.element_text?.split('|')[0]) || 50,
        y: typeof c._y === 'number' ? c._y : parseFloat(c.element_text?.split('|')[1]) || 50,
        status: c.status,
        index: i + 1,
      })),
    [comments]
  );

  const refresh = useCallback(async () => {
    if (!goalId) return;
    try {
      const data = await listComments(goalId);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      setToast({ severity: 'error', message: err.message || 'Failed to load comments' });
    }
  }, [goalId]);

  useEffect(() => {
    if (!open || !goalId) return undefined;
    setLoading(true);
    refresh().finally(() => setLoading(false));
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [open, goalId, refresh]);

  const handlePlacePin = useCallback(({ x, y }) => {
    setPendingPin({ x, y });
  }, []);

  const handleCreate = useCallback(
    async (commentText, pin) => {
      // Cross-origin previews mean we can't extract a DOM selector. We store
      // the click coordinates as a synthetic selector ("coords:42.1,68.4") so
      // the apply-feedback stage can still tell the Designer agent which
      // viewport region the comment refers to.
      const selector = `coords:${pin.x.toFixed(2)},${pin.y.toFixed(2)} on ${viewport}`;
      const result = await createComment({
        goalId,
        elementSelector: selector,
        elementText: `${pin.x.toFixed(2)}|${pin.y.toFixed(2)}|${viewport}`,
        commentText,
        deploymentUrl,
      });
      setComments((prev) => [...prev, { ...result, _x: pin.x, _y: pin.y }]);
      setPendingPin(null);
      setToast({ severity: 'success', message: 'Pin saved' });
    },
    [goalId, viewport, deploymentUrl]
  );

  const handleUpdate = useCallback(
    async (id, patch) => {
      try {
        await updateComment({ id, ...patch });
        await refresh();
      } catch (err) {
        setToast({ severity: 'error', message: err.message });
      }
    },
    [refresh]
  );

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setToast({ severity: 'error', message: err.message });
    }
  }, []);

  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      const result = await applyComments(goalId);
      setToast({
        severity: 'success',
        message: `${result.applied || 0} comments queued — Designer will re-run shortly.`,
      });
      await refresh();
    } catch (err) {
      setToast({ severity: 'error', message: err.message });
    } finally {
      setApplying(false);
    }
  }, [goalId, refresh]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Design review
          </Typography>
          {deploymentUrl && (
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary' }}
              component="a"
              href={deploymentUrl}
              target="_blank"
              rel="noreferrer"
            >
              {deploymentUrl}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={viewport}
            onChange={(_, v) => v && setViewport(v)}
          >
            <ToggleButton value="desktop">
              <AppIcon name="DesktopWindows" fallback={DesktopWindowsIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton value="tablet">
              <AppIcon name="TabletMac" fallback={TabletMacIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton value="mobile">
              <AppIcon name="PhoneIphone" fallback={PhoneIphoneIcon} sx={{ fontSize: 18 }} />
            </ToggleButton>
          </ToggleButtonGroup>
          <IconButton onClick={onClose} aria-label="Close">
            <AppIcon name="Close" fallback={CloseIcon} />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', gap: 2, minHeight: 600 }}>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <PreviewCanvas
            deploymentUrl={deploymentUrl}
            viewport={viewport}
            pins={pins}
            onPlacePin={handlePlacePin}
          />
        </Box>
        <Box sx={{ width: 360, flexShrink: 0 }}>
          <CommentsSidebar
            comments={comments}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onApply={handleApply}
            pendingPin={pendingPin}
            onCancelPendingPin={() => setPendingPin(null)}
            applying={applying}
          />
          {loading && (
            <Typography variant="caption" sx={{ color: 'text.disabled', mt: 1, display: 'block' }}>
              Loading…
            </Typography>
          )}
        </Box>
      </DialogContent>
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast && (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </Dialog>
  );
}

DesignReviewDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  goalId: PropTypes.string,
  deploymentUrl: PropTypes.string,
  initialViewport: PropTypes.oneOf(['desktop', 'tablet', 'mobile']),
};
