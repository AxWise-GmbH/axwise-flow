import { useAuth } from '@clerk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import {
  SOLUTION_STATUS_LABELS,
  isNativeWorkflowSpec,
  workflowExampleInput,
  workflowInputError,
} from './solution-presentation.js';
import { SectionCard, WorkspacePage } from './WorkspacePrimitives.jsx';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';
import SolutionNativeWorkspace from './SolutionNativeWorkspace.jsx';
import SolutionAppAccess from './SolutionAppAccess.jsx';
import SolutionSchedules from './SolutionSchedules.jsx';
import SolutionCodingJobs from './SolutionCodingJobs.jsx';
import WorkflowContractSummary from './WorkflowContractSummary.jsx';
import WorkflowJsonInput from './WorkflowJsonInput.jsx';
import WorkflowExecutionEvidence from './WorkflowExecutionEvidence.jsx';
import SolutionControlTabs from './SolutionControlTabs.jsx';

function JsonBlock({ value, label }) {
  return (
    <Box
      component="pre"
      aria-label={label}
      sx={{
        m: 0,
        p: 2,
        bgcolor: 'action.hover',
        borderRadius: 1,
        overflowX: 'auto',
        fontSize: 13,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }}
    >
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </Box>
  );
}

export function SolutionWorkflow({ workflow }) {
  const nodes = workflow?.nodes || [];
  return (
    <Stack
      component="ol"
      aria-label="Executable n8n workflow"
      spacing={2}
      sx={{
        m: 0,
        p: 0,
        listStyle: 'none',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2,minmax(0,1fr))' },
      }}
    >
      {nodes.map((node, index) => {
        const targets = Object.entries(workflow.connections?.[node.name] || {}).flatMap(
          ([port, outputs]) =>
            (outputs || []).flatMap((edges, outputIndex) =>
              (edges || []).map((edge) => `${port} output ${outputIndex + 1} → ${edge.node}`)
            )
        );
        return (
          <Box
            component="li"
            key={node.id}
            sx={{ flex: 1, minWidth: 0, border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}
          >
            <Typography variant="overline" color="text.secondary">
              Node {index + 1}
            </Typography>
            <Typography variant="subtitle1">{node.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {node.type?.split('.').at(-1)}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {targets.length ? targets.join(' · ') : 'No outgoing connection'}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

export default function SolutionDetailPage() {
  const { solutionId } = useParams();
  const { userId, orgId } = useAuth();
  return (
    <SolutionSourceRoute
      key={JSON.stringify([solutionId, userId, orgId])}
      solutionId={solutionId}
    />
  );
}

function SolutionSourceRoute({ solutionId }) {
  const { getToken } = useAuth();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);
  const [state, setState] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      let solution;
      try {
        const result = await client.solution(solutionId);
        if (result?.solution?.id !== solutionId)
          throw new Error('The owned workflow could not be verified.');
        solution = result.solution;
        if (!solution.buildRequestId) {
          if (!cancelled) setState({ solution, sourceMissing: true });
          return;
        }
        const { buildRequest } = await client.solutionBuildRequest(solution.buildRequestId);
        if (buildRequest?.id !== solution.buildRequestId || buildRequest.solutionId !== solutionId)
          throw new Error('The workflow source could not be verified.');
        const threadId = buildRequest.source?.threadId;
        if (!threadId) {
          if (!cancelled) setState({ solution, sourceMissing: true });
          return;
        }
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            threadId
          )
        )
          throw new Error('The original conversation identifier is invalid.');
        // The source ID is server-recorded, and this second owner-scoped read
        // proves that the original Assistant thread still exists and is owned.
        const source = await client.assistantThread(threadId);
        if (source?.thread?.id !== threadId)
          throw new Error('The original conversation could not be verified.');
        if (!cancelled) setState({ solution, threadId });
      } catch (error) {
        if (!cancelled) setState({ solution, error });
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [client, solutionId, retry]);
  if (!state) return <CircularProgress aria-label="Opening workflow in its source chat" />;
  if (state.threadId)
    return (
      <Navigate
        replace
        to={`/assistant?${new URLSearchParams({ thread: state.threadId, workflow: solutionId })}`}
      />
    );
  if (!state.solution)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
      >
        {state.error?.message || 'The workflow could not be loaded.'}
      </Alert>
    );
  return (
    <WorkspacePage title={state.solution.name} description={state.solution.purpose}>
      <Alert
        severity={state.error ? 'warning' : 'info'}
        action={
          state.error ? (
            <Button onClick={() => setRetry((value) => value + 1)}>Retry source</Button>
          ) : undefined
        }
      >
        {state.error
          ? 'The original conversation could not be verified.'
          : 'No original conversation is recorded for this workflow.'}{' '}
        The existing workflow controls remain available below. No new conversation has been created.
      </Alert>
      <SolutionDetailWorkspace key={solutionId} client={client} solutionId={solutionId} embedded />
    </WorkspacePage>
  );
}

export function SolutionDetailWorkspace(props) {
  const { userId, orgId } = useAuth();
  return (
    <SolutionWorkspaceContent key={JSON.stringify([props.solutionId, userId, orgId])} {...props} />
  );
}

function SolutionWorkspaceContent({
  solutionId,
  client: providedClient,
  embedded = false,
  conversationWorking: externalConversationWorking = false,
  selectedDraftId: controlledDraftId,
  onSelectedDraftChange,
  onContextChange,
  onEditingChange,
}) {
  const { getToken } = useAuth();
  const client = useMemo(
    () => providedClient || createWorkflowV2Client(getToken),
    [providedClient, getToken]
  );
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(0);
  const [localSelectedDraftId, setLocalSelectedDraftId] = useState(null);
  const selectedDraftId =
    controlledDraftId === undefined ? localSelectedDraftId : controlledDraftId;
  const setSelectedDraftId = useCallback(
    (value) => {
      setLocalSelectedDraftId(value);
      onSelectedDraftChange?.(value);
    },
    [onSelectedDraftChange]
  );
  const [draftRefreshKey, setDraftRefreshKey] = useState(0);
  const [nativeEditing, setNativeEditing] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [candidateContext, setCandidateContext] = useState(null);
  const conversationWorking = externalConversationWorking;
  const [pendingDraftId, setPendingDraftId] = useState(null);
  const nativeEditingRef = useRef(false);
  const recordEditing = useCallback(
    (value) => {
      nativeEditingRef.current = value;
      setNativeEditing(value);
      onEditingChange?.(value);
    },
    [onEditingChange]
  );
  const refreshDraft = useCallback(
    (revisionId) => {
      if (!revisionId) return;
      if (nativeEditingRef.current) setPendingDraftId(revisionId);
      else {
        // The conversation reports a saved revision of this Solution, not a new
        // workflow. Show that exact candidate in the existing canvas; no review,
        // execution or activation is implied by this display change.
        setPendingDraftId(null);
        setSelectedDraftId(revisionId);
        setDraftRefreshKey((value) => value + 1);
      }
    },
    [setSelectedDraftId]
  );
  const selectDraft = useCallback(
    (id) => {
      if (nativeEditingRef.current) return;
      setSelectedDraftId(id);
      setTab(0);
    },
    [setSelectedDraftId]
  );
  const openHistory = useCallback(() => setTab(2), []);
  const [input, setInput] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [testProgress, setTestProgress] = useState(null);
  const [effectTest, setEffectTest] = useState(null);
  const [codingTask, setCodingTask] = useState({ runId: null, threadId: null, error: false });
  const invocationRequest = useRef(null);
  const testBatch = useRef(null);
  const readEpoch = useRef(0);
  const load = useCallback(
    async ({ preserveError = false } = {}) => {
      const epoch = ++readEpoch.current;
      try {
        const result = await client.solution(solutionId);
        if (result?.solution?.id !== solutionId)
          throw new Error('The selected workflow could not be verified.');
        if (epoch === readEpoch.current) {
          setData(result);
          if (!preserveError) setError(null);
        }
      } catch (value) {
        if (epoch === readEpoch.current) setError(value);
      }
    },
    [client, solutionId]
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (
      data?.solution.status !== 'deploying' &&
      !data?.invocations.some((item) => item.status === 'running')
    )
      return undefined;
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [data, load]);
  const solution = data?.solution;
  useEffect(() => {
    onContextChange?.(
      solution
        ? {
            client,
            solution,
            selectedDraftId,
            nativeEditing,
            panelBusy: busy || revisionBusy,
            candidate: candidateContext,
            refreshDraft,
            onOpenHistory: openHistory,
            onSelectDraft: selectDraft,
          }
        : null
    );
  }, [
    client,
    solution,
    selectedDraftId,
    nativeEditing,
    busy,
    revisionBusy,
    candidateContext,
    refreshDraft,
    openHistory,
    selectDraft,
    onContextChange,
  ]);
  // Hiding the canvas preserves this mounted owner. Removing this exact panel
  // (including an access-denied discovery result) must release its host context.
  useEffect(() => () => onContextChange?.(null), [onContextChange]);
  useEffect(() => {
    let active = true;
    setCodingTask({ runId: null, threadId: null, error: false });
    if (solution?.buildRequestId && client.solutionBuildRequest) {
      void client
        .solutionBuildRequest(solution.buildRequestId)
        .then((result) => {
          if (active)
            setCodingTask({
              runId: result.buildRequest.runId ?? result.buildRequest.source?.runId ?? null,
              threadId: result.buildRequest.source?.threadId ?? null,
              error: false,
            });
        })
        .catch(() => {
          if (active) setCodingTask({ runId: null, threadId: null, error: true });
        });
    }
    return () => {
      active = false;
    };
  }, [client, solution?.buildRequestId]);
  const example = useMemo(() => workflowExampleInput(solution?.spec), [solution?.spec]);
  const displayedInput = input ?? JSON.stringify(example, null, 2);
  async function decide(action) {
    setBusy(true);
    setError(null);
    try {
      readEpoch.current += 1;
      const result = await client.decideSolution(solution, action);
      readEpoch.current += 1;
      setData(result);
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  const hasExternalEffects = Boolean(solution?.spec?.connections?.length);
  function requestTest(allCases = false) {
    if (!hasExternalEffects) return allCases ? testAllCases() : runTest('test');
    try {
      setEffectTest({
        allCases,
        workflowHash: solution.workflowHash,
        inputs: allCases
          ? solution.spec.acceptanceCases.map((item) => item.input)
          : [JSON.parse(displayedInput)],
      });
    } catch (value) {
      setError(value);
    }
  }
  async function runTest(mode = 'test', authorization = null, approvedInput = null) {
    setBusy(true);
    setError(null);
    try {
      if (authorization && authorization.workflowHash !== solution.workflowHash)
        throw new Error('The workflow changed. Review and approve its test again.');
      const parsed = approvedInput ?? JSON.parse(displayedInput);
      const fingerprint = JSON.stringify({
        input: parsed,
        mode,
        workflowHash: solution.workflowHash,
      });
      if (invocationRequest.current?.fingerprint !== fingerprint)
        invocationRequest.current = { fingerprint, key: crypto.randomUUID() };
      const response = await client.invokeSolution(
        solution.id,
        parsed,
        mode,
        invocationRequest.current.key,
        ...(authorization ? [authorization] : [])
      );
      setLastResult(response.invocation);
      invocationRequest.current = null;
      await load();
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  }
  async function testAllCases(authorization = null) {
    setBusy(true);
    setError(null);
    const cases = solution.spec.acceptanceCases;
    const fingerprint = JSON.stringify({ workflowHash: solution.workflowHash, cases });
    if (testBatch.current?.fingerprint !== fingerprint)
      testBatch.current = { fingerprint, keys: cases.map(() => crypto.randomUUID()) };
    try {
      if (authorization && authorization.workflowHash !== solution.workflowHash)
        throw new Error('The workflow changed. Review and approve its tests again.');
      for (const [index, test] of cases.entries()) {
        const latest = await client.solution(solutionId);
        if (latest.solution.workflowHash !== solution.workflowHash)
          throw new Error('The live version changed. Refresh before testing its agreed cases.');
        setTestProgress({
          completed: index,
          total: cases.length,
          name: test.description || test.id,
        });
        const response = await client.invokeSolution(
          solution.id,
          test.input,
          'test',
          testBatch.current.keys[index],
          ...(authorization ? [authorization] : [])
        );
        setLastResult(response.invocation);
        if (response.invocation.workflowHash !== solution.workflowHash)
          throw new Error(
            'The result belongs to a different workflow version. Refresh to review it.'
          );
        if (response.invocation.status !== 'succeeded')
          throw new Error(
            response.invocation.status === 'outcome_unknown' ||
              response.invocation.status === 'running'
              ? 'This test has an unknown or unfinished outcome. No further cases were sent; inspect its receipt before retrying.'
              : 'An agreed case failed. Remaining cases were not sent; inspect the result and edit the draft.'
          );
        setTestProgress({ completed: index + 1, total: cases.length, name: null });
      }
      testBatch.current = null;
    } catch (value) {
      setError(value);
    } finally {
      try {
        await load({ preserveError: true });
      } catch (value) {
        setError(value);
      }
      setBusy(false);
    }
  }
  if (!solution)
    return error ? (
      <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>
        {error.message}
      </Alert>
    ) : (
      <CircularProgress aria-label="Loading solution" />
    );
  const deployed =
    Boolean(solution.deployment) && ['ready', 'active', 'paused'].includes(solution.status);
  const pauseUnverified =
    isNativeWorkflowSpec(solution.spec) &&
    ['PAUSE_PENDING_VERIFICATION', 'RUNTIME_PAUSE_REQUIRES_VERIFICATION'].includes(
      solution.lastError
    );
  const Container = embedded ? Stack : WorkspacePage;
  return (
    <Container
      {...(embedded
        ? {
            gap: 1.5,
            sx: { minWidth: 0, minHeight: 0 },
            role: 'region',
            'aria-label': `Workflow controls: ${solution.name}`,
          }
        : {
            title: solution.name,
            description: solution.purpose,
            compact: tab === 0,
            actions: (
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Button component={RouterLink} to="/workspace/workflows">
                  All workflows
                </Button>
              </Stack>
            ),
          })}
    >
      {error ? <Alert severity="error">{error.message}</Alert> : null}
      <Box
        component="section"
        aria-label="Workflow status"
        sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}
      >
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.5}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip
              color={solution.status === 'active' ? 'success' : 'default'}
              label={SOLUTION_STATUS_LABELS[solution.status]}
            />
            <Chip variant="outlined" label={`Workflow v${solution.version}`} />
            <Chip variant="outlined" label={solution.agent.name} />
          </Stack>
          {!solution.environment ? (
            <Typography variant="body2" color="text.secondary">
              No isolated environment is connected yet. You can inspect this workflow; deployment
              requires an authorized environment.
            </Typography>
          ) : null}
          {solution.lastError ? (
            <Alert severity="warning">
              {pauseUnverified
                ? 'Production calls are blocked in Orqanix, but the n8n pause is not yet verified. Verify the runtime pause before activating again.'
                : 'Deployment could not be verified. Check the environment and reconcile the same workflow; do not assume it is running.'}
            </Alert>
          ) : null}
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ ml: { md: 'auto' } }}>
            {['draft', 'deployment_unknown'].includes(solution.status) ? (
              <Button
                variant="contained"
                disabled={busy || !solution.environment}
                onClick={() => decide('deploy')}
              >
                {busy
                  ? 'Verifying deployment…'
                  : solution.status === 'draft'
                    ? 'Approve & deploy workflow'
                    : 'Reconcile deployment'}
              </Button>
            ) : null}
            {deployed && !(embedded && selectedDraftId) ? (
              <Button variant="contained" disabled={busy} onClick={() => setTab(1)}>
                {embedded ? `Test current v${solution.version}` : 'Test workflow'}
              </Button>
            ) : null}
            {['ready', 'paused'].includes(solution.status) ? (
              <Button
                variant="outlined"
                disabled={busy || !solution.testedAt || pauseUnverified}
                onClick={() => decide('activate')}
              >
                Activate production endpoint
              </Button>
            ) : null}
            {solution.status === 'active' ? (
              <Button
                color="warning"
                variant="outlined"
                disabled={busy}
                onClick={() => decide('pause')}
              >
                Pause production calls
              </Button>
            ) : null}
            {pauseUnverified ? (
              <Button
                color="warning"
                variant="outlined"
                disabled={busy}
                onClick={() => decide('pause')}
              >
                Verify runtime pause
              </Button>
            ) : null}
            <Button disabled={busy} onClick={load}>
              Refresh status
            </Button>
          </Stack>
          {deployed && !solution.testedAt ? (
            <Typography variant="body2" color="text.secondary">
              {isNativeWorkflowSpec(solution.spec)
                ? 'Every agreed acceptance case must pass for this exact version before activation.'
                : 'Run a successful test before activation.'}
            </Typography>
          ) : null}
          {solution.status === 'paused' ? (
            <Typography variant="body2">
              New production calls are blocked. Already-running calls are not cancelled. Explicit
              tests are available after any pending runtime change is verified.
            </Typography>
          ) : null}
        </Stack>
      </Box>
      <SolutionControlTabs value={tab} onChange={setTab} />
      <Box>
        <Box
          role="tabpanel"
          id="solution-panel-0"
          aria-labelledby="solution-tab-0"
          hidden={tab !== 0}
          sx={{ display: tab === 0 ? 'block' : 'none' }}
        >
          <Stack gap={2}>
            <Box
              aria-label={
                embedded ? 'Native workflow and saved revisions' : 'Workflow chat and canvas'
              }
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'minmax(0,1fr)',
                  lg: embedded ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
                },
                gap: 2,
                alignItems: 'start',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                {pendingDraftId ? (
                  <Alert
                    severity="info"
                    action={
                      <Button
                        disabled={nativeEditing}
                        onClick={() => {
                          if (nativeEditingRef.current) return;
                          setSelectedDraftId(pendingDraftId);
                          setPendingDraftId(null);
                          setDraftRefreshKey((value) => value + 1);
                        }}
                      >
                        Load saved draft
                      </Button>
                    }
                  >
                    A saved draft update is available. Finish saving your native edits before
                    loading it.
                  </Alert>
                ) : null}
                <SolutionNativeWorkspace
                  client={client}
                  solution={solution}
                  onChange={load}
                  requestedRevisionId={selectedDraftId}
                  onSelectedRevision={setSelectedDraftId}
                  refreshKey={draftRefreshKey}
                  onEditingChange={recordEditing}
                  onBusyChange={setRevisionBusy}
                  onCandidateChange={setCandidateContext}
                  externalBusy={conversationWorking}
                />
              </Box>
            </Box>
            {!selectedDraftId &&
            data.invocations.find(
              (invocation) => invocation.workflowHash === solution.workflowHash
            ) ? (
              <SectionCard
                title={`Latest result · live v${solution.version}`}
                action={<Button onClick={() => setTab(2)}>All runs</Button>}
              >
                <WorkflowExecutionEvidence
                  evidence={data.invocations.find(
                    (invocation) => invocation.workflowHash === solution.workflowHash
                  )}
                  outputLabel="Latest workflow output"
                />
              </SectionCard>
            ) : null}
            <TaskDisclosure title="Purpose, requirements & supporting evidence">
              {!embedded && codingTask.threadId ? (
                <Button
                  component={RouterLink}
                  to={`/assistant?thread=${encodeURIComponent(codingTask.threadId)}`}
                >
                  Source chat
                </Button>
              ) : null}
              <Typography variant="body2" color="text.secondary">
                {deployed
                  ? isNativeWorkflowSpec(solution.spec) && solution.status !== 'active'
                    ? 'Staged in n8n; production is not active.'
                    : 'Verified against the published n8n workflow.'
                  : 'The exact workflow awaiting your approval.'}{' '}
                {solution.creationMethod === 'axwise_designed_native_reviewed'
                  ? 'Designed from your explicit task, then checked and handed off from the reviewed native draft. Deployment and activation remain separate approvals.'
                  : solution.creationMethod === 'native_n8n_reviewed_revision'
                    ? 'This native n8n revision passed the Orqanix workflow review. Its source build and prior versions remain available in history.'
                    : isNativeWorkflowSpec(solution.spec)
                      ? 'Orqanix manages this native workflow and its reviewed versions. Generation, validation and real execution remain distinct.'
                      : 'Compiled from your mappings; not an autonomous AI build.'}
              </Typography>
              {solution.buildRequestId ? (
                <Button
                  component={RouterLink}
                  to={`/workspace/builds/${encodeURIComponent(solution.buildRequestId)}`}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  View source build, answers & review
                </Button>
              ) : null}
              <TaskDisclosure title="Accessible workflow summary">
                <SolutionWorkflow workflow={solution.workflow} />
              </TaskDisclosure>
              <SectionCard
                title={
                  isNativeWorkflowSpec(solution.spec)
                    ? 'What this workflow should do'
                    : 'What changes in your data'
                }
                description={
                  isNativeWorkflowSpec(solution.spec)
                    ? 'Saved requirements, input/output contracts and acceptance cases for this version.'
                    : 'Only the listed fields are returned. Input must be a JSON object with scalar values; no external services are contacted.'
                }
              >
                {isNativeWorkflowSpec(solution.spec) ? (
                  <WorkflowContractSummary spec={solution.spec} />
                ) : (
                  <Stack gap={1}>
                    {(solution.spec?.fields || []).map((field) => (
                      <Typography key={field.target} variant="body2">
                        <Box component="code">{field.source}</Box> →{' '}
                        <Box component="code">{field.target}</Box> ·{' '}
                        {field.transform === 'copy' ? 'Keep original value' : field.transform}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </SectionCard>
              <TaskDisclosure title="Workflow JSON & version evidence">
                <JsonBlock
                  value={{
                    workflowHash: solution.workflowHash,
                    deployment: solution.deployment,
                    workflow: solution.workflow,
                  }}
                  label="Workflow deployment evidence"
                />
              </TaskDisclosure>
            </TaskDisclosure>
          </Stack>
        </Box>
        {tab === 1 ? (
          <Stack gap={2} role="tabpanel" id="solution-panel-1" aria-labelledby="solution-tab-1">
            <SectionCard
              title={embedded ? `Test current workflow v${solution.version}` : 'Run a real test'}
              description="This sends your input to n8n. The execution ID and result are saved to this solution's history. Use non-sensitive sample data."
            >
              <Stack gap={2}>
                {embedded && selectedDraftId ? (
                  <Alert severity="info">
                    These controls test current v{solution.version}, not the selected draft. Use the
                    draft’s own review and test controls in Workflow to test that candidate.
                  </Alert>
                ) : null}
                {isNativeWorkflowSpec(solution.spec) ? (
                  <>
                    <Typography variant="body2">
                      All {solution.spec.acceptanceCases.length} agreed cases must pass. Each runs
                      in an isolated temporary test workflow; production activation is a separate
                      action.
                    </Typography>
                    <Button
                      variant="contained"
                      sx={{ alignSelf: 'flex-start' }}
                      disabled={busy || !deployed}
                      onClick={() => requestTest(true)}
                    >
                      Test all agreed cases
                    </Button>
                    {testProgress ? (
                      <Typography role="status" variant="body2">
                        {testProgress.completed} of {testProgress.total} cases passed
                        {testProgress.name ? ` · Testing ${testProgress.name}` : ''}
                      </Typography>
                    ) : null}
                    {solution.spec.connections?.length ? (
                      <Alert severity="info">
                        These tests contact a real service. You will review the destination and
                        sample data before authorizing any send. Use an agreed test case below.
                      </Alert>
                    ) : null}
                    <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Agreed test inputs">
                      {solution.spec.acceptanceCases.map((test) => (
                        <Button
                          key={test.id}
                          size="small"
                          disabled={busy}
                          onClick={() => setInput(JSON.stringify(test.input, null, 2))}
                        >
                          Use case: {test.description || test.id}
                        </Button>
                      ))}
                    </Stack>
                  </>
                ) : null}
                <WorkflowJsonInput
                  label="Test input JSON"
                  value={displayedInput}
                  onChange={setInput}
                  spec={solution.spec}
                  disabled={busy}
                />
                <Button
                  variant="contained"
                  disabled={busy || !deployed || !!workflowInputError(displayedInput)}
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => requestTest(false)}
                >
                  {busy
                    ? 'Waiting for n8n…'
                    : embedded
                      ? `Run test for current v${solution.version}`
                      : 'Run test in n8n'}
                </Button>
                {!deployed ? (
                  <Alert severity="info">Approve and deploy the workflow first.</Alert>
                ) : null}
                <WorkflowExecutionEvidence evidence={lastResult} />
              </Stack>
            </SectionCard>
            <TaskDisclosure title="Code & downloadable files">
              {codingTask.error ? (
                <Alert severity="warning">
                  The linked coding task could not be loaded. Refresh this Solution to reconnect.
                </Alert>
              ) : (
                <SolutionCodingJobs client={client} solution={solution} runId={codingTask.runId} />
              )}
            </TaskDisclosure>
          </Stack>
        ) : null}
        {tab === 2 ? (
          <Box role="tabpanel" id="solution-panel-2" aria-labelledby="solution-tab-2">
            <SectionCard
              title="Execution history"
              description="Actual invocations, newest first. Input/output history persists after refresh; no provider credentials are stored here."
            >
              <Stack gap={2}>
                {!data.invocations.length ? (
                  <Typography color="text.secondary">
                    No executions yet. Deploy the workflow and run a test.
                  </Typography>
                ) : (
                  data.invocations.map((invocation) => (
                    <Box
                      key={invocation.id}
                      sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}
                    >
                      <Stack direction="row" gap={1} flexWrap="wrap">
                        <Chip
                          size="small"
                          label={invocation.status.replaceAll('_', ' ')}
                          color={invocation.status === 'succeeded' ? 'success' : 'warning'}
                        />
                        <Typography variant="body2">
                          {invocation.mode} · {new Date(invocation.createdAt).toLocaleString()}
                        </Typography>
                      </Stack>
                      <Typography variant="caption">
                        {invocation.executionId
                          ? `n8n execution ${invocation.executionId}`
                          : 'No verified n8n execution receipt'}
                      </Typography>
                      {invocation.actor?.kind === 'application_key' ? (
                        <Typography variant="body2">
                          Calling app: {invocation.actor.label || 'Application key'}
                          {invocation.actor.id ? ` · Key ID ${invocation.actor.id}` : ''}
                        </Typography>
                      ) : invocation.actor?.kind === 'schedule' ? (
                        <Typography variant="body2">
                          Triggered automatically by your approved schedule
                        </Typography>
                      ) : invocation.actor?.kind === 'user' ? (
                        <Typography variant="body2">Called by a signed-in user</Typography>
                      ) : null}
                      {invocation.status === 'succeeded' && invocation.output !== undefined ? (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                            Result
                          </Typography>
                          <JsonBlock value={invocation.output} label="Recorded workflow output" />
                        </Box>
                      ) : null}
                      <TaskDisclosure title="Input, output & evidence">
                        <JsonBlock value={invocation} label="Invocation evidence" />
                      </TaskDisclosure>
                    </Box>
                  ))
                )}
              </Stack>
            </SectionCard>
          </Box>
        ) : null}
        {tab === 3 ? (
          <Stack gap={2} role="tabpanel" id="solution-panel-3" aria-labelledby="solution-tab-3">
            <TaskDisclosure title="Isolated runtime & Agent">
              {solution.environment ? (
                <Box>
                  <Typography variant="subtitle2">
                    {!deployed ? 'Available environment (not deployed): ' : ''}
                    {solution.environment.name} · {solution.environment.region}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {solution.environment.isolation}. {solution.environment.capacity}.
                  </Typography>
                </Box>
              ) : (
                <Typography color="text.secondary">
                  No isolated environment is connected yet.
                </Typography>
              )}
              <Button component={RouterLink} to={`/agent-hub/${solution.agentId}`}>
                Open {solution.agent.name}
              </Button>
            </TaskDisclosure>
            <SolutionSchedules
              key={solution.workflowHash}
              client={client}
              solution={solution}
              example={example}
            />
            <TaskDisclosure title="Connect an application · API keys">
              <SolutionAppAccess
                client={client}
                solution={solution}
                example={example}
                onRefreshSolution={load}
              />
            </TaskDisclosure>
            <TaskDisclosure title="Manual signed-in production check">
              <Stack gap={1}>
                <Typography variant="body2">
                  This sends a real production call using your current Orqanix sign-in. Use an
                  application key for server integrations.
                </Typography>
                <JsonBlock
                  label="Production request body"
                  value={{ mode: 'production', input: example }}
                />
                <Button
                  variant="outlined"
                  disabled={
                    busy || solution.status !== 'active' || !!workflowInputError(displayedInput)
                  }
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => runTest('production')}
                >
                  Send current input to active endpoint
                </Button>
              </Stack>
            </TaskDisclosure>
          </Stack>
        ) : null}
      </Box>
      <Dialog
        open={Boolean(effectTest)}
        onClose={() => setEffectTest(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Approve real service test{effectTest?.inputs.length > 1 ? 's' : ''}?
        </DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="warning">
              This sends each sample below once to the connected service. It may create real data or
              incur provider charges. A failed or uncertain result stops further tests; Orqanix will
              not automatically retry it.
            </Alert>
            {(solution.workflow?.nodes ?? [])
              .filter((node) => node.type === 'CUSTOM.boundedHttp')
              .map((node) => (
                <Typography key={node.id} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {node.parameters.method || 'POST'} {node.parameters.url}
                </Typography>
              ))}
            <JsonBlock
              value={effectTest?.inputs ?? []}
              label="Data sent in approved service tests"
            />
            <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
              Approval applies only to workflow {effectTest?.workflowHash}.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEffectTest(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const approved = effectTest;
              setEffectTest(null);
              const authorization = {
                allowExternalEffects: true,
                workflowHash: approved.workflowHash,
              };
              void (approved.allCases
                ? testAllCases(authorization)
                : runTest('test', authorization, approved.inputs[0]));
            }}
          >
            Approve & send test{effectTest?.inputs.length > 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
