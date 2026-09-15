import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { SectionCard } from './WorkspacePrimitives.jsx';

export default function SolutionSchedules({ client, solution, example }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('interval'),
    [minutes, setMinutes] = useState('60'),
    [time, setTime] = useState('09:00');
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [input, setInput] = useState(() => JSON.stringify(example ?? {}, null, 2));
  const pending = useRef(null);
  const load = useCallback(async () => {
    if (!client.solutionSchedules) return;
    try {
      setData(await client.solutionSchedules(solution.id));
      setError('');
    } catch {
      setError('Could not load schedules. Retry to check their current state.');
    }
  }, [client, solution.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  async function create() {
    setBusy(true);
    setError('');
    try {
      const [hour, minute] = time.split(':').map(Number);
      const command = {
        label: kind === 'daily' ? `Daily at ${time}` : `Every ${minutes} minutes`,
        workflowHash: solution.workflowHash,
        timing:
          kind === 'daily' ? { kind, hour, minute, timezone } : { kind, minutes: Number(minutes) },
        input: JSON.parse(input),
      };
      const fingerprint = JSON.stringify(command);
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, key: crypto.randomUUID() };
      await client.createSolutionSchedule(solution.id, command, pending.current.key);
      pending.current = null;
      await load();
    } catch (problem) {
      setError(
        problem instanceof SyntaxError
          ? 'Enter valid JSON for the scheduled input.'
          : problem.message || 'Schedule could not be saved. Retry uses the same request ID.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function pause(id) {
    setBusy(true);
    setError('');
    try {
      await client.pauseSolutionSchedule(solution.id, id);
      await load();
    } catch {
      setError('Pause could not be confirmed. Retry; an already-running task may finish.');
    } finally {
      setBusy(false);
    }
  }
  if (!client.solutionSchedules) return null;
  return (
    <SectionCard title="Run automatically">
      <Stack gap={2}>
        <Typography variant="body2">
          Orqanix triggers this exact n8n release on your schedule. You can leave the browser closed.
          Each run appears in execution history.
        </Typography>
        {error && (
          <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>
            {error}
          </Alert>
        )}
        {data?.enabled === false && (
          <Alert severity="info">
            {data.disabledReason ||
              'Scheduled execution is not configured in this environment yet.'}
          </Alert>
        )}
        {data?.enabled && (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                select
                label="Frequency"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <MenuItem value="interval">Every interval</MenuItem>
                <MenuItem value="daily">Daily</MenuItem>
              </TextField>
              {kind === 'interval' ? (
                <TextField
                  type="number"
                  label="Minutes between runs"
                  sx={{ minWidth: { sm: 220 } }}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                  slotProps={{ htmlInput: { min: 5, max: 10080 } }}
                />
              ) : (
                <>
                  <TextField
                    type="time"
                    label="Local time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    label="Timezone"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    helperText="IANA name, e.g. Europe/Berlin"
                  />
                </>
              )}
            </Stack>
            <TextField
              multiline
              minRows={3}
              maxRows={10}
              label="Input sent on each run (JSON; no secrets)"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <Typography variant="body2" color="text.secondary">
              Starting authorizes repeated real runs with this input. Missed runs are skipped;
              uncertain or failed runs stop the schedule. Editing or pausing the release requires a
              new schedule approval. Daylight-saving gaps are skipped, repeated local times run
              once.
            </Typography>
            <Button
              variant="outlined"
              disabled={busy || solution.status !== 'active'}
              onClick={create}
            >
              Approve & start schedule
            </Button>
            {solution.status !== 'active' && (
              <Typography variant="body2">Activate the tested Solution first.</Typography>
            )}
          </>
        )}
        {(data?.schedules ?? []).map((schedule) => (
          <Stack key={schedule.id} gap={1} sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
            <Stack direction="row" gap={1} alignItems="center">
              <Typography fontWeight={600}>{schedule.label}</Typography>
              <Chip
                size="small"
                label={
                  schedule.status === 'needs_attention' ? 'Needs your attention' : schedule.status
                }
              />
            </Stack>
            {schedule.status === 'active' && (
              <Typography variant="body2">
                Next due: {new Date(schedule.nextRunAt).toLocaleString()}. Dispatch can be delayed
                while another task is running.
              </Typography>
            )}
            {schedule.lastError && schedule.status !== 'paused' && (
              <Alert severity="warning">
                {schedule.lastError === 'SCHEDULE_ENVIRONMENT_UNAVAILABLE'
                  ? 'Stopped safely: scheduled execution is no longer enabled for this isolated runtime. No new run was sent.'
                  : 'Stopped safely: the release changed, or a previous result needs checking. Review execution history before starting a new schedule.'}
              </Alert>
            )}
            {schedule.status === 'active' && (
              <Button disabled={busy} onClick={() => pause(schedule.id)}>
                Pause schedule
              </Button>
            )}
          </Stack>
        ))}
        {data?.ticks?.length > 0 && (
          <Typography variant="body2">
            Latest scheduled run: {data.ticks[0].status.replaceAll('_', ' ')}. Open Execution
            history for its n8n result.
          </Typography>
        )}
      </Stack>
    </SectionCard>
  );
}
