/**
 * [module: frontend]
 * AddPulseDialog — re-run a goal via Pulse: same team or Consilium-assigned agents.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  alpha,
} from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import PulseScheduleFields from '../Pulse/PulseScheduleFields';
import { createGoalPulseSchedule, firePulseNow } from '../../services/pulseScheduleService';
import { defaultDateTimeLocal } from '../../utils/pulseSchedule';
import { getAllConcilium } from '../../services/conciliumService';

import AppIcon from '../icons/AppIcon';

export default function AddPulseDialog({ open, onClose, goal, onSuccess, onOpenGoal }) {
  const theme = useTheme();
  const [mode, setMode] = useState('same_team');
  const [conciliumId, setConciliumId] = useState('');
  const [boards, setBoards] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [scheduleKind, setScheduleKind] = useState('once');
  const [runAt, setRunAt] = useState(() => defaultDateTimeLocal(0));
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const isRunNow = useMemo(
    () => scheduleKind === 'once' && new Date(runAt) <= new Date(),
    [scheduleKind, runAt]
  );

  useEffect(() => {
    if (!open) return;
    setMode('same_team');
    setError(null);
    setResult(null);
    setScheduleKind('once');
    setRunAt(defaultDateTimeLocal(0));
    setConciliumId(goal?.concilium_id || '');
    setLoadingBoards(true);
    getAllConcilium()
      .then((list) => setBoards(Array.isArray(list) ? list : []))
      .catch(() => setBoards([]))
      .finally(() => setLoadingBoards(false));
  }, [open, goal?.concilium_id]);

  async function handleSubmit() {
    if (!goal?.id) return;
    if (mode === 'consilium' && !conciliumId) {
      setError('Select a Consilium board.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const pulse = await createGoalPulseSchedule({
        goal,
        mode,
        conciliumId: mode === 'consilium' ? conciliumId : undefined,
        scheduleKind,
        runAt: scheduleKind === 'once' ? new Date(runAt).toISOString() : null,
        timeOfDay: scheduleKind === 'once' ? null : timeOfDay,
        weekday: scheduleKind === 'weekly' ? weekday : undefined,
        dayOfMonth: scheduleKind === 'monthly' ? dayOfMonth : undefined,
      });

      let firedGoal = null;
      if (isRunNow) {
        const fireResult = await firePulseNow(pulse.id);
        const goalId = fireResult?.goalIds?.[0];
        if (goalId) {
          firedGoal = { id: goalId, title: `Pulse: ${goal.title || 'Goal'}` };
        }
      }

      setResult({
        pulse,
        firedGoal,
        scheduledOnly: !isRunNow,
      });
    } catch (err) {
      setError(err.message || 'Failed to start pulse');
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (result) onSuccess?.(result.firedGoal || result.pulse);
    setResult(null);
    setError(null);
    onClose();
  }

  const primaryLabel = saving
    ? isRunNow
      ? 'Starting…'
      : 'Scheduling…'
    : isRunNow
      ? 'Start Pulse'
      : 'Schedule Pulse';

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={result ? (result.scheduledOnly ? 'Pulse scheduled' : 'Pulse started') : 'Add Pulse'}
      icon={BoltOutlinedIcon}
      iconVariant="primary"
      actions={
        <>
          <Button onClick={handleClose} sx={{ borderRadius: 2, textTransform: 'none' }}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={saving}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              {primaryLabel}
            </Button>
          )}
          {result?.firedGoal && onOpenGoal && (
            <Button
              variant="contained"
              onClick={() => {
                onOpenGoal(result.firedGoal.id);
                handleClose();
              }}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Open pulse goal
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              mx: 'auto',
              mb: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon
              name="CheckCircleOutline"
              fallback={CheckCircleOutlineIcon}
              sx={{ fontSize: 30, color: 'success.main' }}
            />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            {result.scheduledOnly ? 'Pulse scheduled' : 'Pulse started'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {result.scheduledOnly ? (
              <>
                A pulse for <b>&quot;{goal?.title}&quot;</b> will run on schedule. View it on the
                Pulse tab.
              </>
            ) : (
              <>
                A fresh run of <b>&quot;{goal?.title}&quot;</b> is starting in the pipeline.
              </>
            )}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Run <b>&quot;{goal?.title}&quot;</b> again as a pulse — same brief, fresh execution.
          </Typography>
          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
            <FormControlLabel
              value="same_team"
              control={<Radio size="small" />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                  <AppIcon
                    name="GroupsOutlined"
                    fallback={GroupsOutlinedIcon}
                    sx={{ fontSize: 20, color: 'primary.main', mt: 0.15 }}
                  />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Same team
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Re-run with the agents who worked on this goal last time.
                    </Typography>
                  </Box>
                </Box>
              }
            />
            <FormControlLabel
              value="consilium"
              control={<Radio size="small" />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                  <AppIcon
                    name="GavelOutlined"
                    fallback={GavelOutlinedIcon}
                    sx={{ fontSize: 20, color: 'info.main', mt: 0.15 }}
                  />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Consilium picks agents
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Let a Consilium board assign different agents for a fresh take on the same
                      goal.
                    </Typography>
                  </Box>
                </Box>
              }
            />
          </RadioGroup>
          {mode === 'consilium' && (
            <FormControl size="small" fullWidth sx={FORM_FIELD_SX} disabled={loadingBoards}>
              <InputLabel>Consilium board</InputLabel>
              <Select
                label="Consilium board"
                value={conciliumId}
                onChange={(e) => setConciliumId(e.target.value)}
              >
                {boards.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name || b.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <PulseScheduleFields
            scheduleKind={scheduleKind}
            onScheduleKindChange={setScheduleKind}
            runAt={runAt}
            onRunAtChange={setRunAt}
            timeOfDay={timeOfDay}
            onTimeOfDayChange={setTimeOfDay}
            weekday={weekday}
            onWeekdayChange={setWeekday}
            dayOfMonth={dayOfMonth}
            onDayOfMonthChange={setDayOfMonth}
          />
          {error && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
