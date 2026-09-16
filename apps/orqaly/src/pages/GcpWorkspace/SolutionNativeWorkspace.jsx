import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import NativeN8nCanvas from './NativeN8nCanvas.jsx';
import { SectionCard } from './WorkspacePrimitives.jsx';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';
import {
  workflowExampleInput,
  workflowInputError,
  isNativeWorkflowSpec,
  executionHasUnknownOutcome,
} from './solution-presentation.js';
import WorkflowJsonInput from './WorkflowJsonInput.jsx';
import WorkflowExecutionEvidence from './WorkflowExecutionEvidence.jsx';
import SolutionRevisionProgress from './SolutionRevisionProgress.jsx';
import SolutionRevisionConnections from './SolutionRevisionConnections.jsx';
import SolutionFailureProbe from './SolutionFailureProbe.jsx';

const draftStatuses = new Set(['draft', 'reviewed']);
const forkableStatuses = new Set(['approved', 'ready', 'rejected', 'superseded']);
const unresolved = (value) =>
  executionHasUnknownOutcome(value) || ['queued', 'running'].includes(value?.status);
const displayReceipt = (receipt) =>
  receipt
    ? {
        ...receipt,
        diagnostics: receipt.evidence?.diagnostics || receipt.diagnostics,
        assertions:
          receipt.evidence?.acceptance?.caseResults ||
          receipt.evidence?.assertions ||
          receipt.assertions,
      }
    : null;
const labels = {
  draft: 'Draft',
  reviewed: 'Ready for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  deploying: 'Deploying',
  deployment_unknown: 'Verify deployment',
  ready: 'Ready to test',
  active: 'Active',
  superseded: 'Previous version',
};
const revisionLabel = (revision) =>
  revision.status === 'ready' && revision.testedAt
    ? 'Test passed'
    : labels[revision.status] || revision.status;

export default function SolutionNativeWorkspace(props) {
  return <NativeWorkspace key={props.solution.id} {...props} />;
}

function NativeWorkspace({
  client,
  solution,
  onChange,
  requestedRevisionId,
  refreshKey = 0,
  onSelectedRevision,
  onEditingChange,
  onBusyChange,
  onCandidateChange,
  externalBusy = false,
}) {
  const [revisions, setRevisions] = useState([]);
  const [invocations, setInvocations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [nativeSessionState, setNativeSessionState] = useState('connecting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [input, setInput] = useState(null);
  const [result, setResult] = useState(null);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [testProgress, setTestProgress] = useState(null);
  const [effectTest, setEffectTest] = useState(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [probeBusy, setProbeBusy] = useState(false);
  const panelBusy = connectionBusy || probeBusy;
  const probeBusyLock = useRef(false);
  const [connectionSetup, setConnectionSetup] = useState(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [dependencyId, setDependencyId] = useState(null);
  const connectionBusyLock = useRef(false);
  const connectionPanel = useRef(null);
  const forkRequest = useRef(null);
  const mounted = useRef(true);
  const hostCallbacks = useRef({ onBusyChange, onEditingChange, onCandidateChange });
  hostCallbacks.current = { onBusyChange, onEditingChange, onCandidateChange };
  useEffect(() => {
    onBusyChange?.(busy || panelBusy);
  }, [busy, panelBusy, onBusyChange]);
  const receiveConnectionBusy = useCallback((value) => {
    connectionBusyLock.current = value;
    setConnectionBusy(value);
    hostCallbacks.current.onBusyChange?.(value || busyLock.current || probeBusyLock.current);
  }, []);
  const receiveProbeBusy = useCallback((value) => {
    probeBusyLock.current = value;
    setProbeBusy(value);
    hostCallbacks.current.onBusyChange?.(value || busyLock.current || connectionBusyLock.current);
  }, []);
  const openConnections = useCallback(() => {
    setConnectionsOpen(true);
    window.requestAnimationFrame(() =>
      connectionPanel.current?.scrollIntoView?.({ block: 'nearest' })
    );
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      hostCallbacks.current.onBusyChange?.(false);
      hostCallbacks.current.onEditingChange?.(false);
      hostCallbacks.current.onCandidateChange?.(null);
    };
  }, []);
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  const requestRef = useRef(null);
  const testBatch = useRef(null);
  const busyLock = useRef(false);
  const revisionReadEpoch = useRef(0);
  const loadedRefreshKey = useRef(undefined);
  const lastReportedSelection = useRef(undefined);
  const appliedRefreshKey = useRef(refreshKey);
  const load = useCallback(async () => {
    const epoch = ++revisionReadEpoch.current;
    const data = await client.solutionRevisions(solution.id);
    if (mounted.current && epoch === revisionReadEpoch.current) {
      setRevisions(data.revisions);
      setInvocations(data.invocations || []);
    }
    return data;
  }, [client, solution.id]);
  useEffect(() => {
    if (editing || busy || panelBusy || externalBusy) return undefined;
    if (loadedRefreshKey.current === refreshKey) return undefined;
    let cancelled = false;
    const epoch = ++revisionReadEpoch.current;
    client
      .solutionRevisions(solution.id)
      .then((data) => {
        if (!cancelled && epoch === revisionReadEpoch.current) {
          loadedRefreshKey.current = refreshKey;
          setRevisions(data.revisions);
          setInvocations(data.invocations || []);
        }
      })
      .catch((value) => {
        if (!cancelled && epoch === revisionReadEpoch.current) setError(value.message);
      });
    return () => {
      cancelled = true;
    };
  }, [client, solution.id, refreshKey, editing, busy, panelBusy, externalBusy]);
  const revision = revisions.find((value) => value.id === selectedId);
  const currentDraft = revisions.find((value) => draftStatuses.has(value.status));
  const candidateHistory = useMemo(() => {
    if (!revision) return [];
    return invocations
      .filter(
        (item) =>
          item.revisionId === revision.id &&
          item.workflowHash === revision.workflowHash &&
          (!revision.bundleHash || item.evidence?.bundleHash === revision.bundleHash) &&
          (!item.solutionId || item.solutionId === solution.id)
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [invocations, revision, solution.id]);
  const candidateResult =
    revision &&
    result?.workflowHash === revision.workflowHash &&
    (!revision.bundleHash || result?.evidence?.bundleHash === revision.bundleHash) &&
    (!result.revisionId || result.revisionId === revision.id)
      ? candidateHistory.find((item) => result.id && item.id === result.id) || result
      : candidateHistory[0] || null;
  const earlierResults = candidateHistory.filter((item) => item.id !== candidateResult?.id);
  const outcomeUnknown =
    candidateHistory.some(unresolved) || (!!candidateResult && unresolved(candidateResult));
  const candidateContext = useMemo(
    () =>
      revision
        ? {
            revisionId: revision.id,
            version: revision.version,
            workflowHash: revision.workflowHash,
            bundleHash: revision.bundleHash || null,
            status: revision.status,
            testedAt: revision.testedAt || null,
            setup:
              connectionSetup?.revisionId === revision.id &&
              connectionSetup.workflowHash === revision.workflowHash &&
              connectionSetup.bundleHash === (revision.bundleHash || null)
                ? connectionSetup
                : null,
            onOpenConnections: openConnections,
            receipt: candidateResult
              ? {
                  id: candidateResult.id,
                  status: candidateResult.status,
                  executionId: candidateResult.executionId,
                  workflowHash: candidateResult.workflowHash,
                  bundleHash: candidateResult.evidence?.bundleHash || null,
                  revisionId: candidateResult.revisionId,
                  createdAt: candidateResult.createdAt,
                }
              : null,
          }
        : null,
    [revision, candidateResult, connectionSetup, openConnections]
  );
  useEffect(() => {
    onCandidateChange?.(candidateContext);
  }, [candidateContext, onCandidateChange]);
  useEffect(() => {
    if (editing || busy || panelBusy || externalBusy) return;
    if (requestedRevisionId === undefined) return;
    if (lastReportedSelection.current === requestedRevisionId) return;
    // A chat completion can arrive before its revision-list refresh. Keep the
    // currently displayed entity until that exact revision is loaded, rather
    // than pairing a new iframe target with the old workflow title/controls.
    if (requestedRevisionId && !revisions.some((value) => value.id === requestedRevisionId)) return;
    lastReportedSelection.current = requestedRevisionId;
    setSelectedId(requestedRevisionId || null);
    setDependencyId(null);
    setConnectionsOpen(false);
    setConnectionSetup(null);
    setEditing(false);
    setResult(null);
    setInput(null);
    setEffectTest(null);
    setFixOpen(false);
    setTestProgress(null);
    setCanvasEpoch((value) => value + 1);
  }, [requestedRevisionId, revisions, editing, busy, panelBusy, externalBusy]);
  useEffect(() => {
    if (editing || busy || panelBusy || externalBusy || appliedRefreshKey.current === refreshKey)
      return;
    appliedRefreshKey.current = refreshKey;
    // A generated draft was saved by the backend. Reload the native viewer;
    // defer this while the native editor or an operation owns the current view.
    setCanvasEpoch((value) => value + 1);
  }, [refreshKey, editing, busy, panelBusy, externalBusy]);
  const choose = (value, edit = false) => {
    setSelectedId(value?.id || null);
    setDependencyId(null);
    setConnectionsOpen(false);
    setConnectionSetup(null);
    lastReportedSelection.current = value?.id || null;
    onSelectedRevision?.(value?.id || null);
    // Publish edit ownership in the same user action, before an asynchronous
    // conversation completion can ask the parent to switch its canvas target.
    onEditingChange?.(edit);
    setNativeSessionState('connecting');
    setEditing(edit);
    setResult(null);
    setInput(null);
    setError(null);
    setTestProgress(null);
    setEffectTest(null);
    setFixOpen(false);
  };
  const chooseFromControls = (value, edit = false) => {
    if (
      busyLock.current ||
      connectionBusyLock.current ||
      probeBusyLock.current ||
      editing ||
      externalBusy
    )
      return;
    choose(value, edit);
  };
  const act = async (fn) => {
    if (busyLock.current || connectionBusyLock.current || probeBusyLock.current || externalBusy)
      return;
    busyLock.current = true;
    hostCallbacks.current.onBusyChange?.(true);
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (!mounted.current) return;
      await load();
      if (!mounted.current) return;
      await onChange();
    } catch (value) {
      if (mounted.current) setError(value.message);
    } finally {
      busyLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const startEditing = () =>
    act(async () => {
      if (externalBusy || editing)
        throw new Error(
          'Wait for the workflow conversation request to finish before opening the draft editor.'
        );
      const data = await client.createSolutionDraft(solution);
      if (!mounted.current) return;
      const draft =
        data.revision || data.revisions.find((value) => draftStatuses.has(value.status));
      if (!draft) throw new Error('The draft could not be opened. Refresh and try again.');
      setRevisions(data.revisions);
      choose(draft, true);
    });
  const review = () =>
    act(async () => {
      if (editing && nativeSessionState !== 'ready')
        throw new Error('Reconnect the editor and wait for n8n to show Saved before reviewing.');
      // Fetch the revision saved by n8n autosave before binding the review request.
      const latest = await load();
      const saved = latest.revisions.find((value) => value.id === selectedId);
      if (!saved) throw new Error('Draft not found. Refresh and try again.');
      await client.reviewSolutionRevision(solution.id, saved);
      if (!mounted.current) return;
      setEditing(false);
      setCanvasEpoch((value) => value + 1);
    });
  const decide = (action) =>
    act(async () => {
      await client.decideSolutionRevision(solution.id, revision, action);
      if (!mounted.current) return;
      setEditing(false);
      setCanvasEpoch((value) => value + 1);
      if (action === 'activate') choose(null);
    });
  const example = workflowExampleInput(revision?.spec || solution.spec);
  const displayedInput = input ?? JSON.stringify(example, null, 2);
  const test = (authorization = {}) =>
    act(async () => {
      const value = JSON.parse(displayedInput);
      const testScope = {
        ...(revision.bundleHash ? { bundleHash: revision.bundleHash } : {}),
        ...authorization,
      };
      const fingerprint = JSON.stringify({
        revisionId: revision.id,
        workflowHash: revision.workflowHash,
        bundleHash: revision.bundleHash || null,
        value,
      });
      if (requestRef.current?.fingerprint !== fingerprint)
        requestRef.current = { fingerprint, key: crypto.randomUUID() };
      const response = await client.testSolutionRevision(
        solution.id,
        revision.id,
        value,
        requestRef.current.key,
        ...(Object.keys(testScope).length ? [testScope] : [])
      );
      if (!mounted.current) return;
      if (
        response.invocation?.workflowHash !== revision.workflowHash ||
        (revision.bundleHash &&
          response.invocation?.evidence?.bundleHash !== revision.bundleHash) ||
        (response.invocation?.revisionId && response.invocation.revisionId !== revision.id)
      )
        throw new Error(
          'The result belongs to a different candidate. Refresh its saved history before continuing.'
        );
      setResult(response.invocation);
      requestRef.current = null;
    });
  const testAllCases = (authorization = {}) =>
    act(async () => {
      const cases = revision.spec.acceptanceCases;
      const testScope = {
        ...(revision.bundleHash ? { bundleHash: revision.bundleHash } : {}),
        ...authorization,
      };
      const fingerprint = JSON.stringify({
        revisionId: revision.id,
        workflowHash: revision.workflowHash,
        bundleHash: revision.bundleHash || null,
        cases,
      });
      if (testBatch.current?.fingerprint !== fingerprint)
        testBatch.current = { fingerprint, keys: cases.map(() => crypto.randomUUID()) };
      for (const [index, testCase] of cases.entries()) {
        if (!mounted.current) return;
        const latest = await load();
        if (!mounted.current) return;
        const current = latest.revisions.find((item) => item.id === revision.id);
        if (
          current?.workflowHash !== revision.workflowHash ||
          (current?.bundleHash || null) !== (revision.bundleHash || null) ||
          current.status !== 'ready'
        )
          throw new Error('The candidate version changed. Refresh before testing.');
        setTestProgress({
          completed: index,
          total: cases.length,
          name: testCase.description || testCase.id,
        });
        const response = await client.testSolutionRevision(
          solution.id,
          revision.id,
          testCase.input,
          testBatch.current.keys[index],
          ...(Object.keys(testScope).length ? [testScope] : [])
        );
        if (!mounted.current) return;
        if (
          response.invocation?.workflowHash !== revision.workflowHash ||
          (revision.bundleHash &&
            response.invocation?.evidence?.bundleHash !== revision.bundleHash) ||
          (response.invocation?.revisionId && response.invocation.revisionId !== revision.id)
        )
          throw new Error(
            'The result belongs to a different candidate. Refresh before continuing.'
          );
        setResult(response.invocation);
        if (response.invocation.status !== 'succeeded')
          throw new Error(
            ['running', 'outcome_unknown'].includes(response.invocation.status)
              ? 'The outcome is unfinished or unknown. No further cases were sent; inspect this receipt before retrying.'
              : 'An agreed case failed. Remaining cases were not sent; edit and review a new draft.'
          );
        setTestProgress({ completed: index + 1, total: cases.length, name: null });
      }
      testBatch.current = null;
    });
  const requestTest = (kind) => {
    if (
      busyLock.current ||
      connectionBusyLock.current ||
      probeBusyLock.current ||
      externalBusy ||
      outcomeUnknown
    )
      return;
    if (revision?.spec?.kind === 'n8n_workflow_v2' && hasExternalConnections) {
      setEffectTest({
        kind,
        revisionId: revision.id,
        workflowHash: revision.workflowHash,
        bundleHash: revision.bundleHash || null,
      });
    } else if (kind === 'all') testAllCases();
    else test();
  };
  const confirmEffectTest = () => {
    if (
      busyLock.current ||
      connectionBusyLock.current ||
      probeBusyLock.current ||
      externalBusy ||
      outcomeUnknown
    )
      return;
    const pending = effectTest;
    setEffectTest(null);
    if (
      !pending ||
      pending.revisionId !== revision?.id ||
      pending.workflowHash !== revision?.workflowHash ||
      pending.bundleHash !== (revision?.bundleHash || null)
    ) {
      setError('The workflow version changed. Review it before sending a service test.');
      return;
    }
    const authorization = {
      allowExternalEffects: true,
      workflowHash: pending.workflowHash,
      ...(pending.bundleHash ? { bundleHash: pending.bundleHash } : {}),
    };
    if (pending.kind === 'all') testAllCases(authorization);
    else test(authorization);
  };
  const forkCandidate = () =>
    act(async () => {
      const source = fixOpen;
      if (
        !source ||
        !revision ||
        source.id !== revision.id ||
        source.workflowHash !== revision.workflowHash ||
        source.bundleHash !== (revision.bundleHash || null) ||
        source.rowVersion !== revision.rowVersion ||
        outcomeUnknown ||
        revision.forkEligibility?.allowed === false ||
        currentDraft
      )
        throw new Error(
          'The source candidate changed. Refresh and choose the exact version to fix again.'
        );
      const body = {
        expectedVersion: source.rowVersion,
        workflowHash: source.workflowHash,
        ...(source.bundleHash ? { bundleHash: source.bundleHash } : {}),
      };
      const fingerprint = JSON.stringify({ solutionId: solution.id, revisionId: source.id, body });
      if (forkRequest.current?.fingerprint !== fingerprint)
        forkRequest.current = { fingerprint, key: crypto.randomUUID() };
      const data = await client.forkSolutionRevision(
        solution.id,
        source.id,
        body,
        forkRequest.current.key
      );
      if (!mounted.current) return;
      const next = data.revision;
      if (
        !next ||
        next.id === source.id ||
        next.solutionId !== solution.id ||
        next.status !== 'draft' ||
        !Array.isArray(data.revisions)
      )
        throw new Error(
          'The repair draft has not been confirmed. Retry this same request to check it.'
        );
      setRevisions(data.revisions);
      setInvocations(data.invocations || []);
      choose(next);
      setCanvasEpoch((value) => value + 1);
      forkRequest.current = null;
    });
  const operationDisabled = busy || panelBusy || externalBusy;
  const members = (revision?.spec || solution.spec)?.ownedDependencies || [];
  const selectedMember = members.find((item) => item.id === dependencyId);
  const hasExternalConnections =
    !!revision?.spec?.connections?.length || members.some((item) => item.spec?.connections?.length);
  const hasConnectionRequirements =
    hasExternalConnections || !!connectionSetup?.requirements?.length;
  const setupNeedsInput =
    !!revision && connectionSetup?.revisionId === revision.id && connectionSetup?.ready === false;
  const connectionSaved = async () => {
    // A saved connection changes the draft hash/version and remounts its form.
    // Keep parent ownership until both reads settle, even after that form's
    // cleanup releases its own lock.
    busyLock.current = true;
    setBusy(true);
    hostCallbacks.current.onBusyChange?.(true);
    try {
      await load();
      if (!mounted.current) return;
      setConnectionsOpen(false);
      setCanvasEpoch((value) => value + 1);
      await onChange();
    } finally {
      busyLock.current = false;
      if (mounted.current) {
        setBusy(false);
        hostCallbacks.current.onBusyChange?.(connectionBusyLock.current || probeBusyLock.current);
      }
    }
  };
  const canFork =
    !!client.forkSolutionRevision && !!revision && forkableStatuses.has(revision.status);
  return (
    <Stack gap={2}>
      {revision ? (
        <SolutionRevisionProgress
          revision={revision}
          liveVersion={solution.version}
          editing={editing}
          sessionReady={nativeSessionState === 'ready'}
          outcomeUnknown={outcomeUnknown}
          busy={busy}
          setup={connectionSetup?.revisionId === revision.id ? connectionSetup : null}
        >
          <Stack direction="row" gap={1} flexWrap="wrap">
            {!editing && setupNeedsInput && hasConnectionRequirements ? (
              <Button variant="contained" disabled={operationDisabled} onClick={openConnections}>
                Set up required connections
              </Button>
            ) : editing ? (
              <Button
                variant="contained"
                disabled={operationDisabled || nativeSessionState !== 'ready'}
                onClick={review}
              >
                Review saved changes
              </Button>
            ) : revision.status === 'draft' ? (
              <Button variant="contained" disabled={operationDisabled} onClick={review}>
                Review changes
              </Button>
            ) : revision.status === 'reviewed' ? (
              <Button
                variant="contained"
                disabled={operationDisabled || !revision.review?.valid || setupNeedsInput}
                onClick={() => decide('approve')}
              >
                Approve v{revision.version}
              </Button>
            ) : ['approved', 'deployment_unknown'].includes(revision.status) ? (
              <Button
                variant="contained"
                disabled={operationDisabled}
                onClick={() => decide('deploy')}
              >
                {revision.status === 'approved' ? 'Deploy approved version' : 'Verify deployment'}
              </Button>
            ) : revision.status === 'ready' && revision.testedAt ? (
              <Button
                variant="contained"
                disabled={operationDisabled || outcomeUnknown}
                onClick={() => decide('activate')}
              >
                Activate v{revision.version}
              </Button>
            ) : revision.status === 'ready' ? (
              <Button
                variant="contained"
                disabled={
                  operationDisabled ||
                  outcomeUnknown ||
                  (!isNativeWorkflowSpec(revision.spec) && !!workflowInputError(displayedInput))
                }
                onClick={() => requestTest(isNativeWorkflowSpec(revision.spec) ? 'all' : 'one')}
              >
                {isNativeWorkflowSpec(revision.spec)
                  ? 'Test all agreed cases'
                  : `Test v${revision.version} in n8n`}
              </Button>
            ) : null}
            {canFork ? (
              <Button
                variant="outlined"
                disabled={
                  operationDisabled ||
                  editing ||
                  outcomeUnknown ||
                  !!currentDraft ||
                  revision.forkEligibility?.allowed === false
                }
                onClick={() =>
                  setFixOpen({
                    id: revision.id,
                    version: revision.version,
                    workflowHash: revision.workflowHash,
                    bundleHash: revision.bundleHash || null,
                    rowVersion: revision.rowVersion,
                  })
                }
              >
                Fix this version
              </Button>
            ) : null}
            <Button
              size="small"
              disabled={operationDisabled || editing}
              onClick={() => act(async () => {})}
            >
              Refresh candidate
            </Button>
          </Stack>
          {canFork && currentDraft ? (
            <Typography variant="caption">
              Finish or reject the existing draft before creating a repair draft from this version.
            </Typography>
          ) : null}
          {canFork && !currentDraft && revision.forkEligibility?.allowed === false ? (
            <Typography variant="caption">{revision.forkEligibility.reason}</Typography>
          ) : null}
          {hasConnectionRequirements && !setupNeedsInput ? (
            <Button size="small" disabled={operationDisabled || editing} onClick={openConnections}>
              Manage draft connections
            </Button>
          ) : null}
        </SolutionRevisionProgress>
      ) : null}
      {revision &&
      isNativeWorkflowSpec(revision.spec) &&
      typeof client.solutionRevisionSetup === 'function' ? (
        <Box ref={connectionPanel} sx={{ display: connectionsOpen ? 'block' : 'none' }}>
          <SolutionRevisionConnections
            client={client}
            solutionId={solution.id}
            revision={revision}
            disabled={busy || probeBusy || externalBusy || editing}
            onBusyChange={receiveConnectionBusy}
            onSetupChange={setConnectionSetup}
            onSaved={connectionSaved}
          />
        </Box>
      ) : null}
      <Dialog open={!!fixOpen} onClose={() => !busy && setFixOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Fix candidate v{fixOpen?.version}?</DialogTitle>
        <DialogContent>
          <Typography>
            Create a new draft from this exact candidate, keeping its workflow and agreed tests. The
            failed or frozen version remains unchanged. No approval, test success or activation is
            copied.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            Then describe the correction in the existing chat or edit the draft in n8n. This action
            does not run or resend anything.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setFixOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={operationDisabled || outcomeUnknown}
            onClick={forkCandidate}
          >
            Create repair draft
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!effectTest} onClose={() => setEffectTest(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Send a real service test?</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="warning">
              This sends real requests to the connected service. It is not a simulation and may
              create or change data.
            </Alert>
            <Typography>
              Approve {effectTest?.kind === 'all' ? revision?.spec?.acceptanceCases?.length : 1}{' '}
              test request(s) for this exact workflow version.
            </Typography>
            {[
              ...(revision?.workflow?.nodes || []),
              ...members.flatMap((item) => item.workflow?.nodes || []),
            ]
              ?.filter((node) => node.type === 'CUSTOM.boundedHttp')
              .map((node) => (
                <Typography key={node.id} sx={{ overflowWrap: 'anywhere' }}>
                  POST {node.parameters?.url}
                </Typography>
              ))}
            <Typography variant="body2">Test data</Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                maxHeight: 200,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {effectTest?.kind === 'all'
                ? JSON.stringify(
                    revision?.spec?.acceptanceCases?.map(({ id, input: caseInput }) => ({
                      id,
                      input: caseInput,
                    })),
                    null,
                    2
                  )
                : displayedInput}
            </Box>
            <Typography variant="body2" color="text.secondary">
              An unknown result stops testing. No further requests are sent automatically; an
              already sent request cannot be undone.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEffectTest(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={operationDisabled || outcomeUnknown}
            onClick={confirmEffectTest}
          >
            Approve and send test
          </Button>
        </DialogActions>
      </Dialog>
      <SectionCard
        title="Workflow canvas"
        description={
          revision
            ? `${editing ? 'Editing' : 'Viewing'} candidate v${revision.version}. Your deployed workflow stays unchanged until activation.`
            : `Viewing workflow v${solution.version}. Open a draft to make changes.`
        }
        action={
          <Button
            disabled={operationDisabled || editing || !solution.deployment}
            variant="outlined"
            onClick={startEditing}
          >
            {currentDraft
              ? 'Continue editing draft'
              : revision
                ? `Edit live v${solution.version}`
                : 'Edit workflow'}
          </Button>
        }
      >
        <Stack gap={2}>
          {error ? <Alert severity="warning">{error}</Alert> : null}
          {!solution.deployment ? (
            <Typography variant="body2" color="text.secondary">
              Deploy the first version before opening an editable revision.
            </Typography>
          ) : null}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button
              size="small"
              disabled={operationDisabled || editing}
              variant={!selectedId ? 'contained' : 'text'}
              onClick={() => chooseFromControls(null)}
            >
              Current v{solution.version}
            </Button>
            {revisions.map((item) => (
              <Button
                size="small"
                key={item.id}
                disabled={operationDisabled || editing}
                variant={selectedId === item.id ? 'contained' : 'text'}
                onClick={() => chooseFromControls(item)}
              >{`v${item.version} · ${revisionLabel(item)}`}</Button>
            ))}
          </Stack>
          {members.length ? (
            <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Workflow bundle members">
              <Button
                size="small"
                disabled={operationDisabled || editing}
                variant={!selectedMember ? 'contained' : 'text'}
                onClick={() => {
                  if (
                    !busyLock.current &&
                    !connectionBusyLock.current &&
                    !probeBusyLock.current &&
                    !editing &&
                    !externalBusy
                  )
                    setDependencyId(null);
                }}
              >
                Main workflow
              </Button>
              {members.map((item) => (
                <Button
                  key={item.id}
                  size="small"
                  disabled={operationDisabled || editing}
                  variant={selectedMember?.id === item.id ? 'contained' : 'text'}
                  onClick={() => {
                    if (
                      !busyLock.current &&
                      !connectionBusyLock.current &&
                      !probeBusyLock.current &&
                      !editing &&
                      !externalBusy
                    )
                      setDependencyId(item.id);
                  }}
                >
                  View {item.workflow?.name || 'linked error workflow'}
                </Button>
              ))}
            </Stack>
          ) : null}
          {selectedMember ? (
            <Typography variant="caption">
              Viewing linked error workflow: {selectedMember.workflow?.name || selectedMember.id}.
              Read-only; the same candidate and approval bundle stay selected. Viewing does not run
              or test this handler.
            </Typography>
          ) : null}
          <NativeN8nCanvas
            key={`${selectedId || 'current'}-${selectedMember?.id || 'main'}-${editing}-${canvasEpoch}`}
            client={client}
            solutionId={solution.id}
            revisionId={selectedId}
            dependencyId={selectedMember?.id}
            mode={editing ? 'edit' : 'view'}
            onSessionStateChange={setNativeSessionState}
            compact
          />
          {editing ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                Changes save to this draft. Wait for n8n to show Saved, then review them here.
              </Typography>
            </Stack>
          ) : null}
        </Stack>
      </SectionCard>
      {revision && members.length && typeof client.solutionFailureProbes === 'function' ? (
        <SolutionFailureProbe
          client={client}
          solutionId={solution.id}
          revision={revision}
          disabled={busy || connectionBusy || externalBusy || editing}
          onBusyChange={receiveProbeBusy}
        />
      ) : null}
      {revision ? (
        <SectionCard
          title={`Revision v${revision.version}`}
          description={`Based on v${revision.baseVersion}`}
        >
          <Stack gap={2}>
            <Chip sx={{ alignSelf: 'flex-start' }} label={revisionLabel(revision)} />
            {revision.review ? (
              <>
                <Typography>{revision.review.summary}</Typography>
                {revision.review.issues?.map((issue, index) => (
                  <Alert key={`${issue.code}-${index}`} severity="warning">
                    {issue.message}
                  </Alert>
                ))}
                {revision.review.changes?.length ? (
                  <Stack component="ul" gap={1} sx={{ pl: 2, m: 0 }}>
                    {revision.review.changes.map((change, index) => (
                      <Typography component="li" variant="body2" key={index}>
                        {change.message}
                      </Typography>
                    ))}
                  </Stack>
                ) : null}
                <Typography variant="caption" color="text.secondary">
                  Orqanix checks the saved workflow against the available capability rules. A model
                  assessment is not execution evidence.
                </Typography>
              </>
            ) : (
              <Typography color="text.secondary">
                Review the saved changes to see their effect before approval.
              </Typography>
            )}
            <Stack direction="row" gap={1} flexWrap="wrap">
              {draftStatuses.has(revision.status) ? (
                <>
                  <Button
                    disabled={operationDisabled || editing}
                    onClick={() => chooseFromControls(revision, true)}
                  >
                    Edit in n8n
                  </Button>
                  {revision.status === 'reviewed' && !editing ? (
                    <Button disabled={operationDisabled} onClick={review}>
                      Review changes
                    </Button>
                  ) : null}
                  {revision.status !== 'reviewed' || editing ? (
                    <Button
                      disabled={
                        operationDisabled ||
                        editing ||
                        externalBusy ||
                        revision.status !== 'reviewed' ||
                        !revision.review?.valid
                      }
                      variant="contained"
                      onClick={() => decide('approve')}
                    >
                      Approve v{revision.version}
                    </Button>
                  ) : null}
                  <Button
                    disabled={operationDisabled || editing}
                    color="warning"
                    onClick={() => decide('reject')}
                  >
                    Reject draft
                  </Button>
                </>
              ) : null}
              {revision.status === 'ready' && !revision.testedAt ? (
                <Button
                  disabled={operationDisabled || !revision.testedAt}
                  variant="contained"
                  onClick={() => decide('activate')}
                >
                  Activate v{revision.version}
                </Button>
              ) : null}
            </Stack>
            {revision.status === 'ready' ? (
              <>
                {isNativeWorkflowSpec(revision.spec) ? (
                  <>
                    <Typography variant="body2">
                      Every agreed case must pass for this exact candidate before activation.
                    </Typography>
                    {revision.testedAt ? (
                      <Button
                        sx={{ alignSelf: 'flex-start' }}
                        variant="contained"
                        disabled={operationDisabled || outcomeUnknown}
                        onClick={() => requestTest('all')}
                      >
                        Test all agreed cases
                      </Button>
                    ) : null}
                    {testProgress ? (
                      <Typography role="status" variant="body2">
                        {testProgress.completed} of {testProgress.total} cases passed
                        {testProgress.name ? ` · Testing ${testProgress.name}` : ''}
                      </Typography>
                    ) : null}
                    {hasExternalConnections ? (
                      <Alert severity="info">
                        Testing opens an explicit authorization for the exact destination and case
                        inputs. No connected-service request is sent before you approve it.
                      </Alert>
                    ) : null}
                    <Stack
                      direction="row"
                      gap={1}
                      flexWrap="wrap"
                      aria-label="Agreed revision test inputs"
                    >
                      {revision.spec.acceptanceCases.map((testCase) => (
                        <Button
                          size="small"
                          key={testCase.id}
                          disabled={operationDisabled}
                          onClick={() => setInput(JSON.stringify(testCase.input, null, 2))}
                        >
                          Use case: {testCase.description || testCase.id}
                        </Button>
                      ))}
                    </Stack>
                  </>
                ) : null}
                <WorkflowJsonInput
                  label={`Test input for v${revision.version}`}
                  value={displayedInput}
                  onChange={setInput}
                  spec={revision.spec || solution.spec}
                  disabled={operationDisabled}
                />
                {isNativeWorkflowSpec(revision.spec) || revision.testedAt ? (
                  <Button
                    sx={{ alignSelf: 'flex-start' }}
                    variant="outlined"
                    disabled={
                      operationDisabled || outcomeUnknown || !!workflowInputError(displayedInput)
                    }
                    onClick={() => requestTest('one')}
                  >
                    Test v{revision.version} in n8n
                  </Button>
                ) : null}
                {!revision.testedAt ? (
                  <Typography variant="body2">
                    {isNativeWorkflowSpec(revision.spec)
                      ? 'All agreed cases must pass before activation.'
                      : 'A successful real test is required before activation.'}
                  </Typography>
                ) : null}
              </>
            ) : null}
            <Box aria-label={`Recorded results for candidate v${revision.version}`}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Results for candidate v{revision.version}
              </Typography>
              <WorkflowExecutionEvidence
                evidence={displayReceipt(candidateResult)}
                outputLabel={`Candidate v${revision.version} output`}
              />
              {!candidateResult ? (
                <Typography variant="body2" color="text.secondary">
                  No recorded test result for this exact candidate. Results from the live version
                  are not shown here.
                </Typography>
              ) : null}
              {earlierResults.length ? (
                <TaskDisclosure
                  title={`Earlier tests for this candidate (${earlierResults.length})`}
                >
                  <Stack gap={2}>
                    {earlierResults.map((item) => (
                      <Box key={item.id}>
                        <Typography variant="caption">
                          {item.createdAt || 'Recorded test'} · {item.id}
                        </Typography>
                        <WorkflowExecutionEvidence evidence={displayReceipt(item)} />
                      </Box>
                    ))}
                  </Stack>
                </TaskDisclosure>
              ) : null}
            </Box>
            {revision.lastError ? (
              <Alert severity="warning">
                The deployment needs verification before this version can be used.
              </Alert>
            ) : null}
            <TaskDisclosure title="Revision evidence">
              <Box component="pre" sx={{ m: 0, overflowX: 'auto', fontSize: 12 }}>
                {JSON.stringify(
                  {
                    workflowHash: revision.workflowHash,
                    deployment: revision.deployment,
                    approvedAt: revision.approvedAt,
                    testedAt: revision.testedAt,
                  },
                  null,
                  2
                )}
              </Box>
            </TaskDisclosure>
          </Stack>
        </SectionCard>
      ) : null}
    </Stack>
  );
}
