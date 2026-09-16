/**
 * RefineModal — modal that captures the user's "improve quality" feedback
 * and submits it to the deliverable-refine API.
 *
 * Usage: parent renders <VersionPicker> which opens this modal on Improve
 * click. The modal owns the loading + error state for the LLM call and
 * calls back to the parent with the new version row on success so the
 * picker can append the new pill and switch to it.
 */
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import PropTypes from 'prop-types';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CloseIcon from '@mui/icons-material/Close';

import AppIcon from '../icons/AppIcon';

const PLACEHOLDERS = {
  knowledge_document:
    'e.g. "make this shorter and use bullet points" or "rewrite in a more formal tone"',
  landing_page: 'e.g. "use a warmer color palette" or "make the hero more energetic"',
  goal_artifact: 'e.g. "make it more vibrant" or "use cleaner typography"',
  default: 'What would you like to improve?',
};

export default function RefineModal({ open, kind, onClose, onSubmit, remaining }) {
  const theme = useTheme();
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPrompt('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Please describe what to improve.');
      return;
    }
    if (trimmed.length < 5) {
      setError('Feedback is too short — be a bit more specific.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(trimmed);
      // Parent closes the modal on success
    } catch (err) {
      setError(err.message || 'Refinement failed. Please try again.');
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return; // don't allow close while a refinement is in flight
    onClose();
  };

  const placeholder = PLACEHOLDERS[kind] || PLACEHOLDERS.default;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <AppIcon
          name="AutoFixHigh"
          fallback={AutoFixHighIcon}
          sx={{ color: 'primary.main', fontSize: 22 }}
        />
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', flex: 1 }}>
          Improve quality
        </Typography>
        <Button
          onClick={handleClose}
          disabled={submitting}
          sx={{ minWidth: 0, p: 0.5, color: 'text.secondary' }}
        >
          <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
        </Button>
      </DialogTitle>
      <DialogContent dividers sx={{ pt: 2 }}>
        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 1.5, lineHeight: 1.5 }}>
          Describe what you'd like to change. The original version is preserved — you can flip back
          any time.{' '}
          {Number.isFinite(remaining) && (
            <Box
              component="span"
              sx={{ fontWeight: 700, color: remaining > 0 ? 'success.main' : 'error.main' }}
            >
              {remaining} refinement{remaining === 1 ? '' : 's'} left.
            </Box>
          )}
        </Typography>

        <TextField
          autoFocus
          multiline
          minRows={4}
          maxRows={10}
          fullWidth
          placeholder={placeholder}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={submitting}
          variant="outlined"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              fontSize: '0.85rem',
              bgcolor: alpha(theme.palette.text.primary, 0.02),
            },
          }}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.78rem' }}>
            {error}
          </Alert>
        )}

        {submitting && (
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={18} />
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
              Refining — typically 20–45 seconds…
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={submitting} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !prompt.trim()}
          variant="contained"
          startIcon={
            <AppIcon name="AutoFixHigh" fallback={AutoFixHighIcon} sx={{ fontSize: 16 }} />
          }
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {submitting ? 'Refining…' : 'Improve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

RefineModal.propTypes = {
  open: PropTypes.bool.isRequired,
  kind: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  remaining: PropTypes.number,
};
