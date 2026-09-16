import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  IconButton,
  Chip,
  CircularProgress,
  Switch,
  Stack,
  alpha,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import ScheduleIcon from '@mui/icons-material/Schedule';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../../services/dashboardService';

import AppIcon from '../icons/AppIcon';

const CRON_PRESETS = [
  { label: 'Every day at 9:00 UTC', value: '0 9 * * *' },
  { label: 'Every Monday at 9:00', value: '0 9 * * 1' },
  { label: 'First of month at 9:00', value: '0 9 1 * *' },
  { label: 'Every weekday at 17:00', value: '0 17 * * 1-5' },
  { label: 'Every hour', value: '0 * * * *' },
];

export default function ScheduleDialog({ open, dashboardId, onClose }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // form state for new schedule
  const [cron, setCron] = useState(CRON_PRESETS[0].value);
  const [recipientsText, setRecipientsText] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!dashboardId) return;
    setLoading(true);
    setError('');
    try {
      const data = await listSchedules(dashboardId);
      setSchedules(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleCreate = async () => {
    const recipients = recipientsText
      .split(/[,;\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!recipients.length) {
      setError('Add at least one recipient email.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const s = await createSchedule(dashboardId, { cron_expr: cron, recipients });
      setSchedules((prev) => [s, ...prev]);
      setRecipientsText('');
    } catch (err) {
      setError(err.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (s) => {
    try {
      const updated = await updateSchedule(s.id, { enabled: !s.enabled });
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
    } catch (err) {
      setError(err.message || 'Toggle failed');
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await deleteSchedule(s.id);
      setSchedules((prev) => prev.filter((x) => x.id !== s.id));
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Schedule email exports"
      icon={ScheduleIcon}
      paperSx={{ borderRadius: isMobile ? 0 : 3, m: { xs: 0, sm: 4 } }}
      contentSx={{ pt: 2, px: { xs: 1.75, sm: 3 } }}
      hideCancel
      primaryLabel="Done"
      onPrimary={onClose}
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        {loading ? (
          <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {error && (
              <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                {error}
              </Typography>
            )}

            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  color: 'text.secondary',
                  display: 'block',
                  mb: 0.75,
                }}
              >
                Existing schedules
              </Typography>
              {schedules.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  No schedules yet — add one below.
                </Typography>
              ) : (
                schedules.map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: s.enabled
                        ? 'background.paper'
                        : alpha(theme.palette.text.disabled, 0.04),
                      display: 'flex',
                      gap: 1,
                      alignItems: 'center',
                      mb: 0.75,
                      opacity: s.enabled ? 1 : 0.65,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        <code>{s.cron_expr}</code>
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        → {(s.recipients || []).join(', ')}
                      </Typography>
                      {s.last_run_at && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          Last run: {new Date(s.last_run_at).toLocaleString()}
                        </Typography>
                      )}
                    </Box>
                    <Switch
                      size="small"
                      checked={s.enabled}
                      onChange={() => handleToggle(s)}
                      color="primary"
                    />
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(s)}
                      sx={{ color: 'error.main' }}
                    >
                      <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} fontSize="small" />
                    </IconButton>
                  </Box>
                ))
              )}
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: `1px dashed ${theme.palette.divider}`,
                bgcolor: alpha(theme.palette.primary.main, 0.02),
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  color: 'text.secondary',
                  display: 'block',
                  mb: 1,
                }}
              >
                Add a new schedule
              </Typography>

              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
                {CRON_PRESETS.map((p) => (
                  <Chip
                    key={p.value}
                    label={p.label}
                    size="small"
                    onClick={() => setCron(p.value)}
                    variant={cron === p.value ? 'filled' : 'outlined'}
                    color={cron === p.value ? 'primary' : 'default'}
                    sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
                  />
                ))}
              </Box>

              <TextField
                size="small"
                fullWidth
                label="Cron expression (5 fields)"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                helperText="Use a preset above or enter custom (e.g. '0 9 * * *')."
                sx={{ mb: 1.5, ...FORM_FIELD_SX }}
              />
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label="Recipients (one email per line, or comma-separated)"
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                helperText="Emails will receive an HTML snapshot of this dashboard."
              />
              <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={creating || !recipientsText.trim()}
                  startIcon={
                    creating ? (
                      <CircularProgress size={14} />
                    ) : (
                      <AppIcon name="Add" fallback={AddIcon} />
                    )
                  }
                  onClick={handleCreate}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Add schedule
                </Button>
              </Box>
            </Box>
          </>
        )}
      </Stack>
    </FormDialog>
  );
}
