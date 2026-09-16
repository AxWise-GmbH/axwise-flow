/**
 * CommentsSidebar — list of pin comments + the "Apply Feedback" action.
 *
 * Open comments are the ones that will be bundled into the next Designer
 * re-run. Dismissed/applied comments stay visible but greyed out so the
 * user has an audit trail.
 */
import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  Chip,
  TextField,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import PropTypes from 'prop-types';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import SendIcon from '@mui/icons-material/Send';

import AppIcon from '../icons/AppIcon';

const STATUS_COLORS = {
  open: 'primary',
  applied: 'success',
  dismissed: 'default',
  stale: 'warning',
};

export default function CommentsSidebar({
  comments = [],
  onCreate,
  onUpdate,
  onDelete,
  onApply,
  pendingPin,
  onCancelPendingPin,
  applying = false,
}) {
  const theme = useTheme();
  const [draftText, setDraftText] = useState('');
  const [error, setError] = useState('');

  const openCount = comments.filter((c) => c.status === 'open').length;

  const handleSubmit = async () => {
    setError('');
    if (!draftText.trim()) {
      setError('Comment cannot be empty.');
      return;
    }
    if (!pendingPin) {
      setError('Click on the preview to drop a pin first.');
      return;
    }
    try {
      await onCreate?.(draftText.trim(), pendingPin);
      setDraftText('');
    } catch (err) {
      setError(err.message || 'Failed to save comment');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Pin comments{' '}
          {openCount > 0 && (
            <Chip size="small" label={`${openCount} open`} color="primary" sx={{ ml: 1 }} />
          )}
        </Typography>
        <Tooltip
          title={
            openCount === 0
              ? 'No open comments to apply'
              : `Bundle ${openCount} comments into a Designer re-run`
          }
        >
          <span>
            <Button
              size="small"
              variant="contained"
              startIcon={<AppIcon name="Send" fallback={SendIcon} sx={{ fontSize: 16 }} />}
              disabled={openCount === 0 || applying}
              onClick={() => onApply?.()}
            >
              {applying ? 'Applying…' : 'Apply feedback'}
            </Button>
          </span>
        </Tooltip>
      </Box>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          borderRadius: 2,
          bgcolor: pendingPin ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
        }}
      >
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
          {pendingPin
            ? `New pin at ${pendingPin.x.toFixed(1)}%, ${pendingPin.y.toFixed(1)}% — describe what should change.`
            : 'Click the preview to drop a pin, then describe what should change.'}
        </Typography>
        <TextField
          multiline
          minRows={2}
          maxRows={6}
          fullWidth
          size="small"
          placeholder='e.g. "Hero CTA is gray on white — increase contrast"'
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          disabled={!pendingPin}
        />
        {error && (
          <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>
            {error}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
          {pendingPin && (
            <Button size="small" onClick={onCancelPendingPin}>
              Cancel
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            disabled={!pendingPin || !draftText.trim()}
            onClick={handleSubmit}
          >
            Save pin
          </Button>
        </Box>
      </Paper>
      <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {comments.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'center', mt: 2 }}>
            No comments yet.
          </Typography>
        )}
        {comments.map((c, i) => (
          <Paper
            key={c.id}
            variant="outlined"
            sx={{
              p: 1.25,
              borderRadius: 2,
              borderColor: c.status === 'open' ? alpha(theme.palette.primary.main, 0.4) : 'divider',
              opacity: c.status === 'dismissed' ? 0.55 : 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
              <Chip
                size="small"
                label={`#${i + 1}`}
                sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
              />
              <Chip
                size="small"
                label={c.status}
                color={STATUS_COLORS[c.status] || 'default'}
                sx={{ height: 18, fontSize: '0.65rem', textTransform: 'capitalize' }}
              />
              <Box sx={{ flex: 1 }} />
              {c.status !== 'dismissed' && c.status !== 'applied' && (
                <Tooltip title="Dismiss">
                  <IconButton
                    size="small"
                    onClick={() => onUpdate?.(c.id, { status: 'dismissed' })}
                  >
                    <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => onDelete?.(c.id)}>
                  <AppIcon
                    name="DeleteOutline"
                    fallback={DeleteOutlineIcon}
                    sx={{ fontSize: 16 }}
                  />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {c.comment_text}
            </Typography>
            {c.element_selector && (
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}
              >
                @ {c.element_selector}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

CommentsSidebar.propTypes = {
  comments: PropTypes.array,
  onCreate: PropTypes.func,
  onUpdate: PropTypes.func,
  onDelete: PropTypes.func,
  onApply: PropTypes.func,
  pendingPin: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
  onCancelPendingPin: PropTypes.func,
  applying: PropTypes.bool,
};
