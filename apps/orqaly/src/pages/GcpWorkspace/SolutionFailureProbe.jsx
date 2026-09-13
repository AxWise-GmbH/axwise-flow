import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';

export default function SolutionFailureProbe(props) {
  const { revision } = props;
  return (
    <FailureProbe key={`${revision.id}:${revision.rowVersion}:${revision.bundleHash}`} {...props} />
  );
}

function FailureProbe({ client, solutionId, revision, disabled = false, onBusyChange }) {
  const [snapshot, setSnapshot] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const dispatching = useRef(false);
  const request = useRef(null);
  const callback = useRef(onBusyChange);
  callback.current = onBusyChange;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      callback.current?.(false);
    };
  }, []);
  const load = useCallback(async () => {
    const value = await client.solutionFailureProbes(solutionId, revision.id);
    if (mounted.current) setSnapshot(value);
    return value;
  }, [client, solutionId, revision.id]);
  useEffect(() => {
    let cancelled = false;
    client
      .solutionFailureProbes(solutionId, revision.id)
      .then((value) => {
        if (!cancelled) setSnapshot(value);
      })
      .catch(() => {
        if (!cancelled) setError('Handler test status could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [client, solutionId, revision.id]);
  const sourceMatches = (item) =>
    item?.revisionId === revision.id &&
    item.sourceRowVersion === revision.rowVersion &&
    item.workflowHash === revision.workflowHash &&
    item.bundleHash === revision.bundleHash &&
    item.coverage === 'handler_with_synthetic_failure';
  const latest = [receipt, ...(snapshot?.probes || [])].find(sourceMatches);
  const unresolved = [receipt, ...(snapshot?.probes || [])].find(
    (item) =>
      item &&
      ['running', 'outcome_unknown'].includes(item.status) &&
      item.cleanupState !== 'removed'
  );
  const hold = (value) => {
    lock.current = value;
    callback.current?.(value);
  };
  async function perform(action) {
    if (dispatching.current || busy || disabled || (lock.current && !confirming)) return;
    dispatching.current = true;
    hold(true);
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      if (mounted.current)
        setError(
          'The result could not be confirmed. Check its status before starting another test.'
        );
    } finally {
      dispatching.current = false;
      hold(false);
      if (mounted.current) {
        setBusy(false);
        setConfirming(false);
      }
    }
  }
  const run = () =>
    perform(async () => {
      request.current ||= {
        key: crypto.randomUUID(),
        priorIds: new Set((snapshot?.probes || []).map((item) => item.id)),
      };
      // A timeout may occur after dispatch. Keep the key and block a second send;
      // only an explicit read/reconcile can resolve the saved operation.
      setUncertain(true);
      const value = await client.testSolutionFailureHandler(
        solutionId,
        revision.id,
        {
          expectedVersion: revision.rowVersion,
          workflowHash: revision.workflowHash,
          bundleHash: revision.bundleHash,
          confirmSyntheticFailure: true,
        },
        request.current.key
      );
      if (!mounted.current) return;
      if (!sourceMatches(value.probe)) throw new Error('wrong_source');
      request.current.probeId = value.probe.id;
      setReceipt(value.probe);
      if (
        !['running', 'outcome_unknown'].includes(value.probe.status) ||
        value.probe.cleanupState === 'removed'
      ) {
        setUncertain(false);
        request.current = null;
      }
      await load();
    });
  const refresh = () =>
    perform(async () => {
      const value = await load();
      const current = value.probes?.find(
        (item) =>
          sourceMatches(item) &&
          (!request.current ||
            (request.current.probeId
              ? item.id === request.current.probeId
              : !request.current.priorIds.has(item.id)))
      );
      if (
        current &&
        (current.cleanupState === 'removed' ||
          !['running', 'outcome_unknown'].includes(current.status))
      ) {
        setReceipt(current);
        setUncertain(false);
        request.current = null;
      }
    });
  const reconcile = () =>
    perform(async () => {
      const target = unresolved;
      const value = await client.reconcileSolutionFailureProbe(solutionId, revision.id, target.id);
      if (
        value.probe?.id !== target.id ||
        value.probe.revisionId !== revision.id ||
        value.probe.workflowHash !== target.workflowHash ||
        value.probe.bundleHash !== target.bundleHash
      )
        throw new Error('wrong_source');
      if (!mounted.current) return;
      setReceipt(value.probe);
      if (value.probe.cleanupState === 'removed') {
        setUncertain(false);
        request.current = null;
      }
      await load();
    });
  return (
    <TaskDisclosure title="Error-handler check">
      <Stack gap={1.5}>
        <Typography variant="body2">
          Test this version’s linked error handler with a temporary, deliberately failing workflow.
          Your main workflow is not run or changed. No connected services are called.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          This checks the handler only—not your main workflow, a provider connection or delivery.
        </Typography>
        {error ? <Alert severity="warning">{error}</Alert> : null}
        {latest ? (
          <Alert
            severity={
              latest.status === 'succeeded'
                ? 'success'
                : latest.status === 'failed'
                  ? 'warning'
                  : 'info'
            }
          >
            {latest.status === 'succeeded'
              ? 'Handler ran successfully'
              : latest.status === 'failed'
                ? 'Handler check failed'
                : latest.status === 'running'
                  ? 'Handler check is running'
                  : 'Handler result is unknown'}{' '}
            for v{revision.version}.{' '}
            {latest.cleanupState === 'removed'
              ? 'Temporary workflows removed.'
              : 'Temporary workflow cleanup is not yet confirmed.'}
          </Alert>
        ) : null}
        {!snapshot?.allowed && snapshot?.reason ? (
          <Typography variant="body2" color="text.secondary">
            {snapshot.reason}
          </Typography>
        ) : null}
        {confirming ? (
          <Stack gap={1} role="group" aria-label="Confirm isolated handler test">
            <Typography variant="body2">
              Start one isolated test for v{revision.version}?
            </Typography>
            <Stack direction="row" gap={1}>
              <Button disabled={busy || disabled} variant="contained" onClick={run}>
                {busy ? 'Testing handler…' : 'Run isolated handler test'}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  hold(false);
                }}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button
              disabled={disabled || busy || uncertain || unresolved || !snapshot?.allowed}
              onClick={() => {
                if (lock.current || disabled) return;
                hold(true);
                setConfirming(true);
              }}
            >
              Test error handler
            </Button>
            <Button disabled={disabled || busy} onClick={refresh}>
              Check test status
            </Button>
            {unresolved?.canReconcile ? (
              <Button disabled={disabled || busy} onClick={reconcile}>
                Resolve temporary cleanup
              </Button>
            ) : null}
          </Stack>
        )}
      </Stack>
    </TaskDisclosure>
  );
}
