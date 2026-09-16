import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Typography,
  Paper,
  Chip,
  Button,
  Stack,
  Collapse,
  TextField,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PhaseStatusTicker from './PhaseStatusTicker';

import AppIcon from '../../../components/icons/AppIcon';

const STATUS_COLORS = {
  idle: 'default',
  validating: 'info',
  connecting: 'info',
  in_flight: 'info',
  awaiting_response: 'info',
  success: 'success',
  error: 'error',
  timeout: 'warning',
  cancelled: 'default',
};

function inputFieldsFromSchema(schema) {
  if (!schema || typeof schema !== 'object') return [];
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  return Object.entries(props).map(([name, def]) => ({
    name,
    type: def?.type || 'string',
    label: def?.title || name,
    help: def?.description || '',
    required: required.has(name),
    enum: Array.isArray(def?.enum) ? def.enum : null,
    example: def?.example ?? def?.default ?? '',
  }));
}

export default function ReplicatorPhaseCard({ phase, onRun, initialValues }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [status, setStatus] = useState('idle');
  const [values, setValues] = useState(initialValues || {});
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const fields = useMemo(() => inputFieldsFromSchema(phase.input_schema), [phase.input_schema]);
  const statusColor = STATUS_COLORS[status] || 'default';

  useEffect(() => {
    if (initialValues) setValues(initialValues);
  }, [initialValues]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    },
    []
  );

  const handleValueChange = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  const startTimer = () => {
    const startedAt = Date.now();
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortRef.current) abortRef.current.abort();
    stopTimer();
    setStatus('cancelled');
  };

  const handleRun = async () => {
    if (!onRun) {
      setStatus('error');
      setErrorMessage('No run handler wired.');
      return;
    }
    setStatus('in_flight');
    setResult(null);
    setErrorMessage(null);
    setLatencyMs(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startTimer();
    try {
      const resp = await onRun({ phase, input: values, signal: ctrl.signal });
      stopTimer();
      if (resp && typeof resp === 'object') {
        setLatencyMs(resp.latencyMs ?? null);
        if (resp.status === 'success') {
          setStatus('success');
          setResult(resp.output);
        } else if (resp.status === 'timeout') {
          setStatus('timeout');
          setErrorMessage(resp.errorMessage || 'Timed out.');
        } else {
          setStatus('error');
          setErrorMessage(resp.errorMessage || `Run failed (${resp.errorClass || 'unknown'}).`);
        }
      } else {
        setStatus('success');
      }
    } catch (err) {
      stopTimer();
      if (err?.name === 'AbortError' || ctrl.signal.aborted) {
        setStatus('cancelled');
      } else {
        setStatus('error');
        setErrorMessage(err?.message || 'Run failed.');
      }
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <Paper
      id={`replicator-phase-${phase.id}`}
      variant="outlined"
      sx={{
        p: 2,
        borderColor: alpha(theme.palette.primary.main, 0.15),
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
          {phase.name}
        </Typography>
        <Chip
          size="small"
          label={status}
          color={statusColor === 'default' ? undefined : statusColor}
          variant={statusColor === 'default' ? 'outlined' : 'filled'}
        />
        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          endIcon={
            expanded ? (
              <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
            ) : (
              <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
            )
          }
        >
          {expanded ? 'Collapse' : 'Expand'}
        </Button>
      </Stack>
      {phase.description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {phase.description}
        </Typography>
      ) : null}
      <Collapse in={expanded}>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {fields.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No inputs for this action.
            </Typography>
          ) : (
            fields.map((f) => (
              <TextField
                key={f.name}
                size="small"
                label={f.label + (f.required ? ' *' : '')}
                helperText={f.help}
                value={values[f.name] ?? ''}
                placeholder={f.example ? String(f.example) : ''}
                onChange={(e) => handleValueChange(f.name, e.target.value)}
                select={!!f.enum}
                SelectProps={f.enum ? { native: true } : undefined}
              >
                {f.enum
                  ? [
                      <option key="__empty" value="" />,
                      ...f.enum.map((opt) => (
                        <option key={String(opt)} value={String(opt)}>
                          {String(opt)}
                        </option>
                      )),
                    ]
                  : null}
              </TextField>
            ))
          )}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AppIcon name="PlayArrowRounded" fallback={PlayArrowRoundedIcon} />}
              onClick={handleRun}
              disabled={status === 'in_flight'}
            >
              {status === 'in_flight' ? `Running… ${(elapsedMs / 1000).toFixed(1)}s` : 'Run'}
            </Button>
            {status === 'in_flight' && elapsedMs >= 1500 ? (
              <Button
                variant="outlined"
                size="small"
                color="warning"
                startIcon={<AppIcon name="StopRounded" fallback={StopRoundedIcon} />}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            ) : null}
            {latencyMs != null ? (
              <Typography variant="caption" color="text.secondary">
                {latencyMs} ms
              </Typography>
            ) : null}
          </Stack>
          <PhaseStatusTicker status={status} elapsedMs={elapsedMs} />
          {status === 'error' && errorMessage ? (
            <Alert severity="error" sx={{ whiteSpace: 'pre-wrap' }}>
              {errorMessage}
            </Alert>
          ) : null}
          {status === 'success' && result != null ? (
            <Paper
              variant="outlined"
              sx={{
                p: 1.25,
                bgcolor: alpha(theme.palette.success.main, 0.05),
                borderColor: alpha(theme.palette.success.main, 0.3),
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  m: 0,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </Typography>
            </Paper>
          ) : null}
        </Stack>
      </Collapse>
    </Paper>
  );
}
