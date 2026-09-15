import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { ExecutableActionAggregateSchema } from '../../workflow-v2/executable-action-validation.js';

const OPERATION = 'operational_record_create_v1';
const ACTIVE_STATUSES = new Set(['approved', 'queued', 'running']);
const SETTLED_STATUSES = new Set(['succeeded', 'failed', 'rejected', 'outcome_unknown']);

const STATUS_COPY = {
  proposed: { label: 'Waiting for approval', color: 'warning' },
  approved: { label: 'Approved', color: 'info' },
  queued: { label: 'Queued', color: 'info' },
  running: { label: 'Running in n8n', color: 'primary' },
  succeeded: { label: 'Succeeded', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  rejected: { label: 'Rejected', color: 'default' },
  outcome_unknown: { label: 'Needs reconciliation', color: 'error' },
};

const RECEIPT_COPY = {
  succeeded: {
    title: 'Execution completed and verified',
    severity: 'success',
  },
  failed: {
    title: 'Execution failure recorded and verified',
    severity: 'error',
  },
  outcome_unknown: {
    title: 'Unknown outcome recorded for reconciliation',
    severity: 'warning',
  },
};

function message(value) {
  return value instanceof Error ? value.message : String(value || 'Request failed');
}

function actionFromAggregate(response) {
  try {
    return ExecutableActionAggregateSchema.parse(response).action;
  } catch {
    throw new Error('The execution service returned an invalid action snapshot.');
  }
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function shortHash(value) {
  const hash = String(value || '');
  if (!hash) return null;
  return hash.length > 24 ? `${hash.slice(0, 12)}…${hash.slice(-12)}` : hash;
}

function safeResultUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function idempotencyKey(kind, runId, actionId = '') {
  return [runId, OPERATION, kind, actionId].filter(Boolean).join(':');
}

function proposalIdempotencyKey(runId) {
  const nonce = globalThis.crypto?.randomUUID?.();
  if (!nonce) throw new Error('Secure proposal identity is unavailable in this browser.');
  return idempotencyKey('proposal', runId, nonce);
}

function StatusChip({ status }) {
  const copy = STATUS_COPY[status] || { label: String(status || 'Unknown'), color: 'default' };
  return <Chip size="small" color={copy.color} variant="outlined" label={copy.label} />;
}

function ArchitectureRail({ status }) {
  const executionStarted = [
    'approved',
    'queued',
    'running',
    'succeeded',
    'failed',
    'outcome_unknown',
  ].includes(status);
  const receiptReady = status === 'succeeded';
  const steps = [
    { key: 'agent', label: 'Agent', active: true },
    { key: 'approval', label: 'Your approval', active: status !== 'proposed' },
    { key: 'n8n', label: 'Private n8n', active: executionStarted },
    { key: 'receipt', label: 'Verified receipt', active: receiptReady },
  ];
  return (
    <Box
      aria-label="Execution route"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, minmax(0, 1fr))' },
        gap: 0.75,
      }}
    >
      {steps.map((step, index) => (
        <Stack
          key={step.key}
          data-active={step.active ? 'true' : 'false'}
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{ minWidth: 0 }}
        >
          <Box
            aria-hidden="true"
            sx={{
              width: 8,
              height: 8,
              flex: '0 0 auto',
              borderRadius: '50%',
              bgcolor: step.active ? 'primary.main' : 'action.disabledBackground',
              ...(status === 'running' && step.key === 'n8n'
                ? {
                    animation: 'executionPulse 1.2s ease-in-out infinite',
                    '@keyframes executionPulse': {
                      '0%, 100%': { opacity: 0.35 },
                      '50%': { opacity: 1 },
                    },
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }
                : {}),
            }}
          />
          <Typography
            variant="caption"
            color={step.active ? 'text.primary' : 'text.disabled'}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {step.label}
          </Typography>
          {index < steps.length - 1 ? (
            <Typography
              aria-hidden="true"
              variant="caption"
              color="text.disabled"
              sx={{ display: { xs: 'none', sm: 'block' }, ml: 'auto !important' }}
            >
              →
            </Typography>
          ) : null}
        </Stack>
      ))}
    </Box>
  );
}

function ExactAction({ action }) {
  const presentation = action.approval?.presentation;
  if (!presentation) return null;
  const parameters = presentation.parameters || {};
  return (
    <Stack spacing={1.25}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Exact action
        </Typography>
        <Typography variant="subtitle2">{presentation.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {presentation.summary}
        </Typography>
      </Box>
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '118px minmax(0, 1fr)' },
          columnGap: 1.5,
          rowGap: 0.75,
          '& dt': { color: 'text.secondary', fontSize: '0.75rem' },
          '& dd': { m: 0, fontSize: '0.78rem', overflowWrap: 'anywhere' },
        }}
      >
        <Typography component="dt">Agent</Typography>
        <Typography component="dd">
          {action.agent.name} · {action.agent.id}
        </Typography>
        <Typography component="dt">Operation</Typography>
        <Typography component="dd">
          {presentation.operation?.key} · {presentation.operation?.provider}
        </Typography>
        <Typography component="dt">Target</Typography>
        <Typography component="dd">
          {presentation.target?.type} · {presentation.target?.reference}
        </Typography>
        <Typography component="dt">Record title</Typography>
        <Typography component="dd">{parameters.title}</Typography>
        {parameters.details ? (
          <>
            <Typography component="dt">Details</Typography>
            <Typography component="dd">{parameters.details}</Typography>
          </>
        ) : null}
      </Box>
      {presentation.sideEffects?.length ? (
        <Box>
          <Typography variant="caption" fontWeight={700}>
            What will change
          </Typography>
          {presentation.sideEffects.map((effect) => (
            <Typography key={effect} variant="body2" color="text.secondary">
              • {effect}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Stack>
  );
}

function Receipt({ action }) {
  const receipt = action.receipt;
  if (!receipt) return null;
  const receiptCopy = RECEIPT_COPY[receipt.status] || {
    title: 'Execution receipt recorded',
    severity: 'info',
  };
  const resultUrl = safeResultUrl(receipt.result?.url);
  return (
    <Paper
      variant="outlined"
      data-testid="executable-action-receipt"
      sx={{ p: 1.5, borderColor: `${receiptCopy.severity}.main`, borderRadius: 1 }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center">
          {receipt.status === 'succeeded' ? (
            <CheckCircleOutlineIcon color="success" fontSize="small" />
          ) : (
            <ErrorOutlineIcon color={receiptCopy.severity} fontSize="small" />
          )}
          <Box>
            <Typography variant="subtitle2">{receiptCopy.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {receipt.result?.summary}
            </Typography>
          </Box>
        </Stack>
        {receipt.output ? (
          <Box
            data-testid="executable-action-output"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
              gap: 1,
              p: 1.25,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Created record
              </Typography>
              <Typography component="code" variant="caption" sx={{ display: 'block' }}>
                {receipt.output.recordId}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Record created
              </Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                {safeDate(receipt.output.createdAt) || receipt.output.createdAt}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Idempotency result
              </Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                {receipt.output.idempotencyState === 'replayed'
                  ? 'Existing record reused'
                  : 'New record created'}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Canonical input
              </Typography>
              <Typography component="code" variant="caption" sx={{ display: 'block' }}>
                {shortHash(receipt.output.canonicalInputHash)}
              </Typography>
            </Box>
            <Chip
              size="small"
              color="success"
              variant="outlined"
              label="Gateway signature verified"
              sx={{ justifySelf: 'start', gridColumn: { sm: '1 / -1' } }}
            />
          </Box>
        ) : null}
        {resultUrl ? (
          <Button
            size="small"
            variant="outlined"
            href={resultUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ alignSelf: 'flex-start' }}
          >
            Open created result
          </Button>
        ) : null}
        <Divider />
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} flexWrap="wrap">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              Receipt hash
            </Typography>
            <Typography component="code" variant="caption" sx={{ display: 'block' }}>
              {shortHash(receipt.receiptHash)}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              Signature key
            </Typography>
            <Typography component="code" variant="caption" sx={{ display: 'block' }}>
              {receipt.signatureKeyId}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              Signature
            </Typography>
            <Typography component="code" variant="caption" sx={{ display: 'block' }}>
              {shortHash(receipt.signature)}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              Observed
            </Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>
              {safeDate(receipt.observedAt) || 'Recorded'}
            </Typography>
          </Box>
        </Stack>
        {receipt.externalReferences?.length ? (
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            References:{' '}
            {receipt.externalReferences
              .map((reference) => `${reference.type}: ${reference.value}`)
              .join(' · ')}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}

function ExecutionState({ action }) {
  if (!action.execution) return null;
  return (
    <Stack spacing={0.75}>
      {ACTIVE_STATUSES.has(action.status) ? (
        <LinearProgress aria-label="Executable action progress" />
      ) : null}
      <Typography variant="caption" color="text.secondary">
        Self-hosted n8n · source workflow version {action.execution.workflowId} · binding{' '}
        {action.execution.workflowVersion}
        {action.execution.executionReference
          ? ` · result reference ${action.execution.executionReference}`
          : ''}
      </Typography>
    </Stack>
  );
}

/**
 * The real execution boundary, embedded in the Goal message that produced it.
 * The server owns every exact field shown for approval and every receipt field
 * shown after execution; this component never reconstructs authority locally.
 */
export default function AssistantExecutableAction({
  client,
  runId,
  enabled = false,
  pollIntervalMs = 1500,
}) {
  const supported =
    typeof client?.readExecutableAction === 'function' &&
    typeof client?.proposeExecutableAction === 'function' &&
    typeof client?.decideExecutableAction === 'function';
  const [action, setAction] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const approvalPending = busy === 'approve';
  const [reloadKey, setReloadKey] = useState(0);
  const runRef = useRef(runId);

  const adopt = useCallback(
    (response) => {
      const next = actionFromAggregate(response);
      if (next && next.runId !== runId) {
        throw new Error('The execution service returned an action for a different Goal.');
      }
      setAction((current) => {
        if (!next) return current || null;
        if (!current || current.runId !== runId) return next;
        if (current.id !== next.id) return next;
        // A read already in flight when approval settled must not replace an
        // immutable terminal result with its earlier proposed/running snapshot.
        if (
          SETTLED_STATUSES.has(current.status) &&
          next.status !== current.status &&
          !(
            current.status === 'outcome_unknown' &&
            next.status === 'succeeded' &&
            Number(next.rowVersion) > Number(current.rowVersion) &&
            next.receipt?.output?.signatureVerified === true
          )
        )
          return current;
        return Number(next.rowVersion) >= Number(current.rowVersion) ? next : current;
      });
      return next;
    },
    [runId]
  );

  useEffect(() => {
    runRef.current = runId;
    setAction(null);
    setLoaded(false);
    setError(null);
    setBusy('');
  }, [runId]);

  useEffect(() => {
    if (!enabled || !supported || !runId) return undefined;
    let disposed = false;
    let timer;
    const interval = Math.max(500, pollIntervalMs);
    const read = async () => {
      try {
        const response = await client.readExecutableAction(runId);
        if (disposed || runRef.current !== runId) return;
        const next = adopt(response);
        setLoaded(true);
        if ((next && ACTIVE_STATUSES.has(next.status)) || approvalPending) {
          timer = window.setTimeout(read, interval);
        }
      } catch (value) {
        if (disposed || runRef.current !== runId) return;
        setLoaded(true);
        setError(value);
      }
    };
    read();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [adopt, approvalPending, client, enabled, pollIntervalMs, reloadKey, runId, supported]);

  useEffect(() => {
    if (action?.status !== 'proposed' || !action.approval?.expiresAt) return undefined;
    const expiresAt = new Date(action.approval.expiresAt).valueOf();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
    const timer = window.setTimeout(
      () => setReloadKey((value) => value + 1),
      Math.min(expiresAt - Date.now() + 10, 2_147_483_647)
    );
    return () => window.clearTimeout(timer);
  }, [action?.approval?.expiresAt, action?.status]);

  if (!enabled || !supported) return null;

  const approvalExpiry = action?.approval?.expiresAt
    ? new Date(action.approval.expiresAt).valueOf()
    : Number.NaN;
  const approvalExpired =
    action?.status === 'proposed' &&
    Number.isFinite(approvalExpiry) &&
    approvalExpiry <= Date.now();

  const runProposal = async () => {
    setBusy('propose');
    setError(null);
    try {
      const proposeCommand = {
        version: 'orqaly_executable_action_proposal_v1',
        idempotencyKey: proposalIdempotencyKey(runId),
        operation: OPERATION,
        input: {
          title: 'Completed Goal execution record',
          details: `Registered from Orqanix Goal ${runId} as an approved tenant-scoped action through private n8n.`,
        },
      };
      const response = await client.proposeExecutableAction(runId, proposeCommand);
      if (runRef.current !== runId) return;
      adopt(response);
      setLoaded(true);
    } catch (value) {
      if (runRef.current === runId) setError(value);
    } finally {
      if (runRef.current === runId) setBusy('');
    }
  };

  const decide = async (decision) => {
    if (!action || action.status !== 'proposed' || approvalExpired) return;
    setBusy(decision);
    setError(null);
    try {
      const command = {
        version: 'orqaly_executable_action_decision_v1',
        idempotencyKey: idempotencyKey(decision, runId, action.id),
        decision,
        reason:
          decision === 'approve'
            ? 'Approved in Orqanix Assistant after exact action review.'
            : 'Rejected in Orqanix Assistant.',
      };
      const response = await client.decideExecutableAction(action.id, command, action.rowVersion);
      if (runRef.current !== runId) return;
      const next = adopt(response);
      if (next && ACTIVE_STATUSES.has(next.status)) setReloadKey((value) => value + 1);
    } catch (value) {
      if (runRef.current === runId) setError(value);
    } finally {
      if (runRef.current === runId) setBusy('');
    }
  };

  return (
    <Paper
      variant="outlined"
      data-testid="assistant-executable-action"
      sx={{ p: 2, borderRadius: 1, borderColor: action ? 'primary.main' : 'divider' }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
          gap={1}
        >
          <Box>
            <Typography variant="overline" color="primary.main">
              Internal execution record
            </Typography>
            <Typography variant="subtitle2">
              {action
                ? 'Diagnostic action through self-hosted n8n'
                : 'Test the internal execution path'}
            </Typography>
            {action ? (
              <Typography variant="caption" color="text.secondary">
                Acting as {action.agent.name} for this Goal only
              </Typography>
            ) : null}
          </Box>
          {action ? <StatusChip status={action.status} /> : null}
        </Stack>

        {!loaded && !error ? <LinearProgress aria-label="Loading executable action" /> : null}
        {error ? (
          <Alert
            severity="warning"
            action={
              <Button
                size="small"
                onClick={() => {
                  setError(null);
                  setReloadKey((value) => value + 1);
                }}
              >
                Retry
              </Button>
            }
          >
            {message(error)}
          </Alert>
        ) : null}

        {loaded && !action ? (
          <>
            <Typography variant="body2" color="text.secondary">
              Register one exact, tenant-scoped completed Goal action through the private n8n
              runtime and receive a signed receipt. It does not perform the task in the artifact or
              touch an external service.
            </Typography>
            <ArchitectureRail status="proposed" />
            <Button
              variant="outlined"
              startIcon={
                busy === 'propose' ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <PlayArrowRoundedIcon />
                )
              }
              disabled={Boolean(busy)}
              onClick={runProposal}
              sx={{ alignSelf: 'flex-start' }}
            >
              Prepare exact action
            </Button>
          </>
        ) : null}

        {action ? (
          <>
            <ArchitectureRail status={action.status} />
            <Divider />
            <ExactAction action={action} />
            <ExecutionState action={action} />
            {action.status === 'proposed' && !approvalExpired ? (
              <>
                <Alert severity="info">
                  Approval is bound only to this exact action (sha256:
                  {shortHash(action.approval?.bindingHash)}) and expires{' '}
                  {safeDate(action.approval?.expiresAt) || 'at the server deadline'}.
                </Alert>
                <Stack
                  direction={{ xs: 'column-reverse', sm: 'row' }}
                  justifyContent="flex-end"
                  gap={1}
                >
                  <Button disabled={Boolean(busy)} onClick={() => decide('reject')}>
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    disabled={Boolean(busy)}
                    onClick={() => decide('approve')}
                    startIcon={
                      busy === 'approve' ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <PlayArrowRoundedIcon />
                      )
                    }
                  >
                    Approve and run
                  </Button>
                </Stack>
              </>
            ) : null}
            {approvalExpired ? (
              <Alert
                severity="warning"
                action={
                  <Button disabled={Boolean(busy)} onClick={runProposal}>
                    Prepare new exact action
                  </Button>
                }
              >
                This unapproved action expired safely. It cannot run; prepare a fresh exact action
                to review.
              </Alert>
            ) : null}
            {action.status === 'rejected' ? (
              <Alert severity="info">You rejected this exact action. Nothing was executed.</Alert>
            ) : null}
            {action.status === 'succeeded' && action.error ? (
              <Alert severity="info">
                Recovered from the saved, verified Gateway receipt after the runtime response was
                lost. The action was not run again. The original error remains in the audit history.
              </Alert>
            ) : null}
            {action.status === 'failed' ? (
              <Alert severity="error" icon={<ErrorOutlineIcon />}>
                Execution failed safely:{' '}
                {action.error?.message || action.error?.code || 'Unknown failure'}
              </Alert>
            ) : null}
            {action.status === 'outcome_unknown' && action.recovery === 'confirmed_not_applied' ? (
              <Alert
                severity="warning"
                action={
                  <Button disabled={Boolean(busy)} onClick={runProposal}>
                    Prepare new exact action
                  </Button>
                }
              >
                Recovery verified: the previous grant expired unused and no record was created. This
                attempt stays in the audit history. A new action requires a new exact approval.
              </Alert>
            ) : action.status === 'outcome_unknown' ? (
              <Alert severity="error" icon={<ErrorOutlineIcon />}>
                The outcome cannot be proven automatically. Do not run it again. Manual
                reconciliation is required against Orqanix's saved action and Gateway receipt. n8n
                does not retain execution data.
              </Alert>
            ) : null}
            <Receipt action={action} />
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}
