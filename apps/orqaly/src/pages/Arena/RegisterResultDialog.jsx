import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  MenuItem,
  Chip,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import AppIcon from '../../components/icons/AppIcon';
import { uploadArenaAsset, registerArenaResult } from '../../services/arenaService';

const KINDS = ['Document', 'SMM pack', 'Report', 'Spreadsheet', 'Link', 'Other'];
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip,.ppt,.pptx';

/**
 * Register what a person delivered.
 *
 * Time is asked for rather than inferred: wall-clock from assignment to now
 * counts the weekend, so the derived figure is only a fallback and is marked as
 * one wherever it appears.
 */
export default function RegisterResultDialog({ open, job, onClose, onRegistered }) {
  const theme = useTheme();
  const fileRef = useRef(null);
  const [actorName, setActorName] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [kind, setKind] = useState('Document');
  const [files, setFiles] = useState([]);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setActorName(job?.assignedTo || '');
    setActorRole(job?.people?.actor_role || '');
    setKind('Document');
    setFiles([]);
    setLink('');
    setNote('');
    setMinutes('');
    setError(null);
  }, [open, job]);

  const addFiles = (list) => {
    const picked = [...list];
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} is over the 25 MB limit`);
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...picked]);
  };

  const canSubmit = actorName.trim() && (files.length > 0 || link.trim() || note.trim());

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const assets = [];
      for (const file of files) {
        assets.push(await uploadArenaAsset(job.taskId, file));
      }
      if (link.trim()) {
        assets.push({ name: link.trim(), url: link.trim(), kind: 'link' });
      }
      await registerArenaResult({
        task_id: job.taskId,
        actor_name: actorName.trim(),
        actor_role: actorRole.trim() || undefined,
        title: `${kind} · ${job.title}`,
        note: note.trim() || undefined,
        assets,
        minutes_spent: minutes === '' ? null : Number(minutes),
      });
      onRegistered?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Could not register that result');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose?.()}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ fontWeight: 800 }}>
        Register a result
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontWeight: 500 }}
        >
          {job?.title} · {job?.departmentLabel}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Who delivered it"
          size="small"
          fullWidth
          required
          value={actorName}
          onChange={(e) => setActorName(e.target.value)}
          placeholder="e.g. Marta K."
        />
        <TextField
          label="Their role"
          size="small"
          fullWidth
          value={actorRole}
          onChange={(e) => setActorRole(e.target.value)}
          placeholder="e.g. Lawyer"
          helperText="Used to file the job under a department and to price it from your rates."
        />
        <TextField
          select
          label="What kind of result"
          size="small"
          fullWidth
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </TextField>

        <Box
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          sx={{
            p: 2.5,
            borderRadius: 2,
            border: '1px dashed',
            borderColor: 'divider',
            textAlign: 'center',
            cursor: 'pointer',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          <AppIcon
            name="UploadFileOutlined"
            fallback={UploadFileOutlinedIcon}
            sx={{ fontSize: 24, color: 'text.disabled' }}
          />
          <Typography variant="body2" color="text.secondary">
            Drop files here, or browse
          </Typography>
          <Typography variant="caption" color="text.disabled">
            pdf, docx, xlsx, png, jpg, zip · 25 MB each
          </Typography>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept={ACCEPT}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </Box>

        {files.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {files.map((f, i) => (
              <Chip
                key={`${f.name}-${i}`}
                label={`${f.name} · ${Math.round(f.size / 1024)} KB`}
                onDelete={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                deleteIcon={<AppIcon name="CloseOutlined" fallback={CloseOutlinedIcon} />}
                size="small"
              />
            ))}
          </Box>
        )}

        <TextField
          label="Link (optional)"
          size="small"
          fullWidth
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://"
        />
        <TextField
          label="Time it actually took (minutes)"
          size="small"
          type="number"
          fullWidth
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          helperText="Leave blank and Arena estimates it from the calendar, which counts idle days as work."
        />
        <TextField
          label="Note (optional)"
          size="small"
          fullWidth
          multiline
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none', fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={!canSubmit || busy}
          variant="contained"
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Register
        </Button>
      </DialogActions>
    </Dialog>
  );
}
