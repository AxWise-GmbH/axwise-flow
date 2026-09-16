import { useAuth } from '@clerk/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import { containsSolutionBuildSecret } from '../../../shared/workflow-v2/solution-build-secrets.js';
import AssistantMarkdown from '../../components/VoiceControl/AssistantMarkdown.jsx';
import NativeN8nCanvas from './NativeN8nCanvas.jsx';
import { SectionCard, WorkspacePage } from './WorkspacePrimitives.jsx';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';
import { useWorkflowBuild } from './useWorkflowBuilds.js';
import WorkflowContractSummary from './WorkflowContractSummary.jsx';
import WorkflowExecutionEvidence from './WorkflowExecutionEvidence.jsx';
import WorkflowBuildConnections from './WorkflowBuildConnections.jsx';
import {
  executionHasUnknownOutcome,
  hasVerifiedBuildTest,
  isNativeWorkflowSpec,
} from './solution-presentation.js';
import {
  buildFailureMessage,
  buildState,
  illustrateMapping,
  openBuildQuestions,
} from './workflow-build-presentation.js';

const transforms = {
  copy: 'Keep value',
  trim: 'Trim spaces',
  lowercase: 'Lowercase',
  uppercase: 'Uppercase',
};

function BuildQuestion({ question, busy, disabled, onAnswer }) {
  const [value, setValue] = useState('');
  const hasSecret = containsSolutionBuildSecret(value);
  if (question.kind !== 'information')
    return (
      <Alert severity="warning">
        <Typography component="h3" variant="subtitle1">
          {question.prompt}
        </Typography>
        <Typography variant="body2">{question.reason}</Typography>
        {question.nodeId ? (
          <Typography variant="caption">Affected node: {question.nodeId}</Typography>
        ) : null}
        <Typography variant="body2">
          {question.kind === 'connection'
            ? 'Use the secure connection action below when available. Do not paste credentials into an answer.'
            : 'This setup prerequisite must be resolved before the build can continue. Refresh the saved state after setup; no account or runtime is created automatically.'}
        </Typography>
      </Alert>
    );
  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() && !busy && !disabled && !hasSecret) onAnswer(question.id, value.trim());
      }}
    >
      <Stack gap={1.5}>
        <Typography component="h3" variant="subtitle1">
          {question.prompt}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {question.reason}
        </Typography>
        <TextField
          required
          multiline
          minRows={2}
          label="Your answer"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={busy || disabled}
          error={hasSecret}
          inputProps={{ maxLength: 2000 }}
          helperText="Only the information requested. Never paste passwords, API keys or tokens."
        />
        <Button
          type="submit"
          variant="contained"
          disabled={busy || disabled || hasSecret || !value.trim()}
          sx={{ alignSelf: 'flex-start' }}
        >
          {busy ? 'Saving answer…' : 'Save answer & continue'}
        </Button>
      </Stack>
    </Box>
  );
}

function MappingPreview({ spec }) {
  const [input, setInput] = useState('{}');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  return (
    <Stack gap={2}>
      <Box
        component="ul"
        aria-label="Workflow input and output mapping"
        sx={{ listStyle: 'none', m: 0, p: 0 }}
      >
        {spec.fields.map((field, index) => (
          <Box
            component="li"
            key={`${index}:${field.source}`}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
              gap: 1,
              p: 1.5,
              borderBottom: 1,
              borderColor: 'divider',
              overflowWrap: 'anywhere',
            }}
          >
            <Typography component="code" variant="body2">
              Input: {field.source}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {transforms[field.transform] || 'Unsupported transform'} →
            </Typography>
            <Typography component="code" variant="body2">
              Output: {field.target}
            </Typography>
          </Box>
        ))}
      </Box>
      <TaskDisclosure title="Try an input/output illustration">
        <Typography variant="body2" color="text.secondary">
          Local illustration of these mappings only. It does not run n8n, call a provider or prove
          deployment. Real tests happen in the Solution.
        </Typography>
        <TextField
          multiline
          minRows={4}
          label="Example input JSON"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setResult(null);
            setError(null);
          }}
          inputProps={{ maxLength: 12000, spellCheck: false }}
        />
        <Button
          variant="outlined"
          onClick={() => {
            try {
              setResult(illustrateMapping(spec, input));
              setError(null);
            } catch (value) {
              setResult(null);
              setError(value.message);
            }
          }}
        >
          Preview mapped output
        </Button>
        {error ? <Alert severity="warning">{error}</Alert> : null}
        {result ? (
          <Box
            component="pre"
            aria-label="Illustrated output, not an execution result"
            sx={{ p: 2, m: 0, borderRadius: 1, bgcolor: 'action.hover', overflow: 'auto' }}
          >
            {JSON.stringify(result, null, 2)}
          </Box>
        ) : null}
      </TaskDisclosure>
    </Stack>
  );
}

export default function WorkflowBuildPage() {
  const { buildRequestId } = useParams();
  const { getToken, userId, orgId } = useAuth();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);
  return (
    <WorkflowBuildSourceRoute
      key={JSON.stringify([buildRequestId, userId, orgId])}
      client={client}
      buildRequestId={buildRequestId}
    />
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function WorkflowBuildSourceRoute({ client, buildRequestId }) {
  const [source, setSource] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      let build;
      try {
        const response = await client.solutionBuildRequest(buildRequestId);
        if (
          response?.buildRequest?.id !== buildRequestId ||
          !Number.isInteger(response.buildRequest.rowVersion)
        )
          throw new Error('The owned build could not be verified.');
        build = response.buildRequest;
        const threadId = build.source?.threadId;
        if (!threadId) {
          if (!cancelled) setSource({ build });
          return;
        }
        if (!UUID.test(threadId) || (build.solutionId && !UUID.test(build.solutionId)))
          throw new Error('The recorded source identifier is invalid.');
        const thread = await client.assistantThread(threadId);
        if (thread?.thread?.id !== threadId)
          throw new Error('The original conversation could not be verified.');
        if (!cancelled) setSource({ build, threadId });
      } catch (error) {
        if (!cancelled) setSource({ build, error });
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [client, buildRequestId, retry]);
  if (!source) return <CircularProgress aria-label="Opening build in its original chat" />;
  if (source.threadId)
    return (
      <Navigate
        replace
        to={`/assistant?${new URLSearchParams({
          thread: source.threadId,
          ...(source.build.solutionId
            ? { workflow: source.build.solutionId }
            : { build: buildRequestId }),
        })}`}
      />
    );
  if (!source.build)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
      >
        {source.error?.message || 'The build could not be loaded.'}
      </Alert>
    );
  return (
    <Stack gap={2}>
      <Alert
        severity={source.error ? 'warning' : 'info'}
        action={
          source.error ? (
            <Button onClick={() => setRetry((value) => value + 1)}>Retry source</Button>
          ) : undefined
        }
      >
        {source.error
          ? 'The original conversation could not be verified.'
          : 'No original conversation is recorded for this build.'}{' '}
        The saved preparation controls remain available. No new conversation has been created.
      </Alert>
      <WorkflowBuildWorkspace
        key={buildRequestId}
        client={client}
        buildRequestId={buildRequestId}
        embedded
      />
    </Stack>
  );
}

export function WorkflowBuildWorkspace({
  client,
  buildRequestId,
  embedded = false,
  onOpenWorkflow,
  onEditingChange,
  onBusyChange,
  onContextChange,
}) {
  const state = useWorkflowBuild(client, buildRequestId);
  const { build } = state;
  const [busy, setBusy] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [repairInstruction, setRepairInstruction] = useState('');
  const [stopOpen, setStopOpen] = useState(false);
  const [effectTestOpen, setEffectTestOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stopRequest = useRef(null);
  const pending = useRef(null);
  const nextActionRef = useRef(null);
  const actionGeneration = useRef(0);
  const mutationLock = useRef(false);
  const hostOperation = useRef(null);
  const canEdit =
    ['needs_input', 'dependencies', 'draft', 'ready_for_review', 'reviewed'].includes(
      build?.status
    ) && Boolean(build?.workflow);
  const editorOpen = editing && canEdit;
  useEffect(() => {
    onEditingChange?.(editorOpen);
  }, [editorOpen, onEditingChange]);
  useEffect(() => {
    onBusyChange?.(busy || stopping || connectionBusy);
  }, [busy, stopping, connectionBusy, onBusyChange]);
  // A hidden panel stays mounted. Release ownership only when its editor/action
  // actually ends or this exact build panel unmounts; polling is not an action.
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  useEffect(() => () => onContextChange?.(null), [onContextChange]);
  useEffect(
    () => () => {
      actionGeneration.current += 1;
      hostOperation.current = null;
    },
    []
  );
  const mutation = async (kind, payload = {}) => {
    if (mutationLock.current || busy || stopping || connectionBusy || !build || state.error)
      return false;
    mutationLock.current = true;
    onBusyChange?.(true);
    setBusy(true);
    setActionError(null);
    const generation = ++actionGeneration.current;
    try {
      // Native edits may have saved since our last poll. Review the latest saved
      // candidate; never silently apply an answer or confirmation to a new version.
      const latest = await client.solutionBuildRequest(buildRequestId);
      if (generation !== actionGeneration.current) return false;
      state.adopt(latest);
      const current = latest.buildRequest;
      if (kind !== 'review' && current.rowVersion !== build.rowVersion)
        throw new Error(
          'This build changed in another session. Review the refreshed state, then try again. Your answer has not been submitted.'
        );
      if (
        kind === 'answer' &&
        (current.status !== 'needs_input' ||
          !openBuildQuestions(current).some(
            (question) => question.id === payload.questionId && question.kind === 'information'
          ) ||
          typeof payload.value !== 'string' ||
          !payload.value.trim() ||
          payload.value.length > 2000 ||
          containsSolutionBuildSecret(payload.value))
      )
        throw new Error(
          'Choose the current information question and provide only its non-secret answer.'
        );
      if (
        kind === 'repair' &&
        (!current.repairEligibility?.allowed ||
          executionHasUnknownOutcome(current.testEvidence) ||
          ['queued', 'running'].includes(current.testEvidence?.status) ||
          (payload.instruction !== undefined &&
            (typeof payload.instruction !== 'string' ||
              payload.instruction.length > 4000 ||
              containsSolutionBuildSecret(payload.instruction))))
      )
        throw new Error(
          'Repair is not authorized for the current saved state. Unknown external outcomes must be reconciled first.'
        );
      if (
        kind === 'test' &&
        (!current.testEligibility?.allowed || executionHasUnknownOutcome(current.testEvidence))
      )
        throw new Error(
          'Testing is not authorized for the current saved draft. Refresh the recorded requirements and evidence.'
        );
      const body = {
        expectedVersion: current.rowVersion,
        ...payload,
        ...(['confirm', 'repair', 'test'].includes(kind)
          ? { workflowHash: build.workflowHash }
          : {}),
      };
      const fingerprint = JSON.stringify({ id: buildRequestId, kind, body });
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, key: crypto.randomUUID() };
      const response =
        kind === 'answer'
          ? await client.answerSolutionBuildRequest(buildRequestId, body, pending.current.key)
          : kind === 'confirm'
            ? await client.confirmSolutionBuildRequest(buildRequestId, body, pending.current.key)
            : kind === 'retry'
              ? await client.retrySolutionBuildRequest(buildRequestId, body, pending.current.key)
              : kind === 'repair'
                ? await client.repairSolutionBuildRequest(buildRequestId, body, pending.current.key)
                : kind === 'test'
                  ? await client.testSolutionBuildRequest(buildRequestId, body, pending.current.key)
                  : await client.reviewSolutionBuildRequest(buildRequestId, body);
      if (generation !== actionGeneration.current) return false;
      state.adopt(response);
      pending.current = null;
      setEditing(false);
      setCanvasEpoch((value) => value + 1);
      if (kind === 'repair') setRepairInstruction('');
      return true;
    } catch (value) {
      if (generation === actionGeneration.current) {
        setActionError(
          value.status === 409
            ? 'This draft changed. Refresh, check the saved version, and try again. Nothing new was approved.'
            : value.message || 'The action could not be confirmed. Retry to check the same request.'
        );
        state.refresh();
      }
      return false;
    } finally {
      mutationLock.current = false;
      if (generation === actionGeneration.current) setBusy(false);
    }
  };
  hostOperation.current = {
    build,
    mutation,
    editorOpen,
    blocked: busy || stopping || connectionBusy || !!state.error,
  };
  const hostContext = useMemo(() => {
    if (!build) return null;
    const run = (kind, payload) => {
      const current = hostOperation.current;
      if (
        !current ||
        current.blocked ||
        current.editorOpen ||
        current.build?.id !== build.id ||
        current.build.rowVersion !== build.rowVersion ||
        current.build.inputVersion !== build.inputVersion
      )
        return Promise.resolve(false);
      return current.mutation(kind, payload);
    };
    return {
      build,
      nativeEditing: editorOpen,
      panelBusy: busy || stopping || connectionBusy,
      error: state.error?.message || actionError || null,
      ready: !state.error,
      refresh: state.refresh,
      onAnswer: (questionId, value) => run('answer', { questionId, value }),
      onRepair: (instruction) => run('repair', { instruction }),
    };
  }, [build, editorOpen, busy, stopping, connectionBusy, state.error, state.refresh, actionError]);
  useEffect(() => {
    onContextChange?.(hostContext);
  }, [hostContext, onContextChange]);
  // Independent from the long test request: a customer must still be able to
  // stop further work while that request is waiting for runtime evidence.
  const stopBuild = async () => {
    if (stopping || state.error) return;
    onBusyChange?.(true);
    setStopping(true);
    setActionError(null);
    const generation = ++actionGeneration.current;
    try {
      const latest = await client.solutionBuildRequest(buildRequestId);
      if (generation !== actionGeneration.current) return;
      state.adopt(latest);
      const body = { expectedVersion: latest.buildRequest.rowVersion };
      if (stopRequest.current?.version !== body.expectedVersion)
        stopRequest.current = { version: body.expectedVersion, key: crypto.randomUUID() };
      const response = await client.cancelSolutionBuildRequest(
        buildRequestId,
        body,
        stopRequest.current.key
      );
      if (generation !== actionGeneration.current) return;
      state.adopt(response);
      setStopOpen(false);
      setEditing(false);
    } catch (error) {
      if (generation === actionGeneration.current) {
        setActionError(
          error.message || 'Stopping could not be confirmed. Refresh before starting more work.'
        );
        state.refresh();
      }
    } finally {
      if (generation === actionGeneration.current) {
        setStopping(false);
        setBusy(false);
      }
    }
  };
  const Container = embedded ? Stack : WorkspacePage;
  if (!build)
    return (
      <Container
        {...(embedded
          ? { gap: 1.5, sx: { minWidth: 0 } }
          : {
              title: 'Workflow build',
              description: 'Your task, draft and next action in one place.',
            })}
      >
        {state.error ? (
          <Alert severity="error" action={<Button onClick={state.refresh}>Retry</Button>}>
            {state.error.message || 'This build is unavailable in your workspace.'}
          </Alert>
        ) : (
          <Stack role="status" direction="row" gap={1} alignItems="center">
            <CircularProgress size={20} />
            Loading saved workflow build…
          </Stack>
        )}
      </Container>
    );
  const status = buildState(build.status);
  const questions = openBuildQuestions(build);
  const canReview =
    ['draft', 'ready_for_review', 'reviewed'].includes(build.status) &&
    !questions.length &&
    !!build.workflow;
  const validReview = build.status === 'reviewed' && build.review?.valid === true;
  const verifiedBuildTest = hasVerifiedBuildTest(build);
  const progress = build.progress;
  // A saved validation report is not a running job. In particular a native
  // editor save must not disable Review/Test forever while its report is idle.
  const phaseBusy =
    ['preparing', 'designing', 'testing', 'repairing'].includes(build.status) ||
    ['designing', 'testing', 'repairing'].includes(progress?.stage) ||
    ['queued', 'running'].includes(build.testEvidence?.status);
  const sourceHref = build.source?.threadId
    ? `/assistant?thread=${encodeURIComponent(build.source.threadId)}`
    : `/goals?run=${encodeURIComponent(build.runId)}`;
  const stopAction =
    (build.preparationVersion === 2 || isNativeWorkflowSpec(build.spec)) &&
    !['completed', 'cancelled'].includes(build.status) ? (
      <Button
        color="warning"
        onClick={() => setStopOpen(true)}
        disabled={stopping || !!state.error}
      >
        Stop build
      </Button>
    ) : null;
  const openWorkflow = (event) => {
    if (
      !onOpenWorkflow ||
      !build.solutionId ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onOpenWorkflow(build.solutionId);
  };
  return (
    <Container
      {...(embedded
        ? {
            gap: 1.5,
            sx: { minWidth: 0, minHeight: 0 },
            role: 'region',
            'aria-label': 'Workflow preparation controls',
          }
        : {
            title: build.spec?.name || 'Preparing your workflow',
            description: build.instruction,
            actions: (
              <Stack direction="row" gap={1} flexWrap="wrap">
                {stopAction}
                <Button component={RouterLink} to={sourceHref}>
                  {build.source?.threadId ? 'Back to chat' : 'Back to source task'}
                </Button>
              </Stack>
            ),
          })}
    >
      <Dialog
        open={stopOpen}
        onClose={() => {
          if (!stopping) setStopOpen(false);
        }}
        aria-labelledby="stop-build-title"
      >
        <DialogTitle id="stop-build-title">Stop this build?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Stops further generation, repairs and tests. An already running action may still finish;
            stopping does not undo it. The draft and recorded results remain available.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopOpen(false)} disabled={stopping}>
            Keep working
          </Button>
          <Button color="warning" variant="contained" onClick={stopBuild} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Confirm stop'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={effectTestOpen}
        onClose={() => !busy && setEffectTestOpen(false)}
        aria-labelledby="effect-test-title"
      >
        <DialogTitle id="effect-test-title">Authorize a real service test?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Each acceptance case can send a real request to the connected destination below. This is
            not a dry run. It may create records or incur provider costs. No automatic repair or
            resend is authorized.
          </DialogContentText>
          {(build?.connectionRequirements ?? []).map((requirement) => (
            <Box key={requirement.id} sx={{ mt: 2 }}>
              <Typography variant="subtitle2">{requirement.service || requirement.id}</Typography>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {requirement.reason}
              </Typography>
              <Box
                component="pre"
                sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}
              >
                {JSON.stringify(requirement.scope?.targets ?? requirement.targets ?? [], null, 2)}
              </Box>
            </Box>
          ))}
          <Typography sx={{ mt: 2 }} variant="subtitle2">
            Input for each real test
          </Typography>
          <Box
            component="pre"
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}
          >
            {JSON.stringify(
              build?.spec?.acceptanceCases?.map(({ id, input }) => ({ id, input })) ?? [],
              null,
              2
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEffectTestOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              setEffectTestOpen(false);
              void mutation('test', { allowExternalEffects: true, repairOnFailure: false });
            }}
          >
            Authorize & run real test
          </Button>
        </DialogActions>
      </Dialog>
      <Paper variant="outlined" sx={{ p: embedded ? 1.5 : 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} justifyContent="space-between">
          <Box>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Chip color={status.color} label={status.label} />
            </Stack>
            <Typography role="status" sx={{ mt: 1 }}>
              {validReview && !verifiedBuildTest
                ? 'The saved review is ready. A verified real test of this exact candidate is still required before handoff.'
                : status.next}
            </Typography>
            {questions.length ? (
              <Button
                href="#build-next-action"
                size="small"
                onClick={(event) => {
                  event.preventDefault();
                  nextActionRef.current?.querySelector('textarea,input,button')?.focus();
                }}
              >
                Go to your question
              </Button>
            ) : null}
          </Box>
          {embedded ? (
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              {build.agent ? (
                <Chip size="small" variant="outlined" label={build.agent.name} />
              ) : null}
              {stopAction}
            </Stack>
          ) : build.agent ? (
            <Button component={RouterLink} to={`/agent-hub/${encodeURIComponent(build.agent.id)}`}>
              {build.agent.name}
            </Button>
          ) : null}
        </Stack>
      </Paper>
      {state.error ? (
        <Alert severity="warning" action={<Button onClick={state.refresh}>Reconnect</Button>}>
          Live updates paused. Showing the last confirmed saved version. Review and handoff are
          unavailable until reconnected.
        </Alert>
      ) : null}
      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      {build.explanation && build.status !== 'unsupported' ? (
        <AssistantMarkdown text={build.explanation} variant="conversation" />
      ) : null}
      {build.status === 'unsupported' ? (
        <Alert severity="warning">
          <Typography fontWeight={600}>
            This task cannot be built by the current runtime.
          </Typography>
          {build.explanation ||
            'This draft requires capabilities that are not available in the assigned runtime. The request has not been replaced with a sample workflow.'}
          {build.unsupportedCapabilities?.length ? (
            <Typography variant="body2">
              Missing capabilities: {build.unsupportedCapabilities.join(', ')}
            </Typography>
          ) : null}
        </Alert>
      ) : null}
      {build.status === 'failed' ? (
        <Alert severity="error">
          {buildFailureMessage(build.lastError)} No deployment or execution is implied.
        </Alert>
      ) : null}
      {build.solutionId ? (
        <Alert
          severity="success"
          action={
            <Button
              component={RouterLink}
              to={`/workspace/solutions/${encodeURIComponent(build.solutionId)}`}
              onClick={openWorkflow}
            >
              {embedded ? 'Open workflow' : 'Open Solution'}
            </Button>
          }
        >
          {embedded
            ? 'The workflow is saved. Open it in this panel to review its current version and run results. Your original conversation stays in place.'
            : 'This build is saved as a workflow. Open it to see its current version, run results and conversation. This page retains the original build evidence.'}
        </Alert>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0,1fr)',
            lg: embedded ? 'minmax(0,1fr)' : 'minmax(0,1fr) 340px',
          },
          alignItems: 'start',
          gap: 2,
        }}
      >
        <SectionCard
          title="Your native workflow"
          description="This authoring draft cannot run, publish or activate anything. Native edits save to this build request."
        >
          <Stack gap={2}>
            {build.workflow ? (
              <>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  <Chip
                    size="small"
                    label={editorOpen ? 'Editing draft · not runnable' : 'Read-only draft'}
                    variant="outlined"
                  />
                  {canEdit ? (
                    <Button
                      size="small"
                      disabled={busy || phaseBusy || !!state.error}
                      onClick={() => {
                        onEditingChange?.(!editorOpen);
                        setEditing(!editorOpen);
                        setCanvasEpoch((value) => value + 1);
                      }}
                    >
                      {editorOpen ? 'Leave editor (saved changes only)' : 'Edit native draft'}
                    </Button>
                  ) : null}
                  <Button size="small" disabled={busy} onClick={state.refresh}>
                    Refresh saved state
                  </Button>
                </Stack>
                <NativeN8nCanvas
                  key={`${build.id}:${editorOpen ? 'edit' : build.workflowHash}:${canvasEpoch}`}
                  client={client}
                  buildRequestId={build.id}
                  mode={editorOpen ? 'edit' : 'view'}
                  compact={embedded}
                />
                {editorOpen ? (
                  <Typography variant="body2" color="text.secondary">
                    Close the node panel and wait for native n8n to show Saved before leaving the
                    editor or reviewing. Editing invalidates an earlier review.
                  </Typography>
                ) : null}
              </>
            ) : (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="subtitle1">
                  {['preparing', 'designing'].includes(build.status)
                    ? 'Waiting for the first saved native draft'
                    : 'No supported draft available'}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  Only a real persisted workflow will appear here. No placeholder graph is
                  substituted.
                </Typography>
              </Box>
            )}
          </Stack>
        </SectionCard>
        <Box ref={nextActionRef} id="build-next-action" sx={{ minWidth: 0, scrollMarginTop: 24 }}>
          <SectionCard
            title={questions.length ? 'Needs you' : 'Next action'}
            description={
              questions.length
                ? 'The build is waiting for this information, not running in the background.'
                : 'Review and release remain under your control.'
            }
          >
            <Stack gap={2}>
              {questions.length ? (
                questions.map((question) =>
                  embedded && onContextChange && question.kind === 'information' ? (
                    <Stack gap={0.5} key={`${build.id}:${build.inputVersion}:${question.id}`}>
                      <Typography variant="subtitle2">{question.prompt}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {question.reason}
                      </Typography>
                      <Typography variant="caption">
                        Answer in the original chat. Never include passwords, API keys or tokens.
                      </Typography>
                    </Stack>
                  ) : (
                    <BuildQuestion
                      key={`${build.id}:${build.inputVersion}:${question.id}`}
                      question={question}
                      busy={busy}
                      disabled={!!state.error}
                      onAnswer={(questionId, value) => mutation('answer', { questionId, value })}
                    />
                  )
                )
              ) : (
                <Typography>{status.next}</Typography>
              )}
              <WorkflowBuildConnections
                key={`${build.id}:${build.workflowHash || 'no-draft'}`}
                client={client}
                build={build}
                disabled={busy || !!state.error}
                onBusyChange={setConnectionBusy}
                onSaved={(response) => {
                  state.adopt(response);
                  setCanvasEpoch((value) => value + 1);
                }}
                onRefresh={state.refresh}
              />
              {build.dependencies?.length ? (
                <Stack gap={1} aria-label="Required runtime capabilities">
                  {build.dependencies.map((dependency) => (
                    <Alert key={dependency.id} severity="warning">
                      {dependency.description}
                      {dependency.nodeId ? ` · Node: ${dependency.nodeId}` : ''}
                    </Alert>
                  ))}
                </Stack>
              ) : null}
              {canReview ? (
                <Button
                  variant={validReview ? 'outlined' : 'contained'}
                  disabled={busy || phaseBusy || !!state.error}
                  onClick={() => mutation('review')}
                >
                  {busy ? 'Checking saved draft…' : 'Review saved workflow'}
                </Button>
              ) : null}
              {isNativeWorkflowSpec(build.spec) && !build.solutionId ? (
                <Stack gap={1.5}>
                  <Typography variant="subtitle2">Test this saved draft</Typography>
                  <Typography variant="body2">
                    {build.testEligibility?.requiresEffectApproval
                      ? 'This workflow contacts an outgoing service. Review its destinations and exact test inputs before approving a real test. External effects are never automatically repeated.'
                      : 'Runs the saved acceptance cases in an authorized n8n test environment without external effects. Orqanix may repair a failed draft within its recorded attempt limit; your active release stays unchanged.'}
                  </Typography>
                  {build.testEligibility?.reason ? (
                    <Typography variant="body2" color="text.secondary">
                      {build.testEligibility.reason}
                    </Typography>
                  ) : null}
                  <Button
                    variant="contained"
                    disabled={
                      busy ||
                      editorOpen ||
                      phaseBusy ||
                      !!state.error ||
                      build.testEligibility?.allowed !== true ||
                      !client.testSolutionBuildRequest ||
                      executionHasUnknownOutcome(build.testEvidence)
                    }
                    onClick={() =>
                      build.testEligibility?.requiresEffectApproval
                        ? setEffectTestOpen(true)
                        : mutation('test', { allowExternalEffects: false, repairOnFailure: true })
                    }
                  >
                    Test draft in n8n
                  </Button>
                  {!build.testEligibility ? (
                    <Typography variant="caption" color="text.secondary">
                      Testing is unavailable until the server confirms this draft’s runtime and
                      permissions.
                    </Typography>
                  ) : null}
                </Stack>
              ) : null}
              {build.status === 'failed' ? (
                <Button
                  variant="outlined"
                  disabled={busy || !!state.error}
                  onClick={() => mutation('retry')}
                >
                  {busy ? 'Requesting preparation…' : 'Retry preparation'}
                </Button>
              ) : null}
              {build.repairEligibility ? (
                <TaskDisclosure
                  title="Troubleshoot this draft"
                  defaultOpen={build.repairEligibility.allowed && !validReview}
                >
                  <Stack gap={1.5}>
                    {build.repairEligibility.reason ? (
                      <Typography variant="body2" color="text.secondary">
                        {build.repairEligibility.reason}
                      </Typography>
                    ) : null}
                    <TextField
                      label="Guidance for fixing this draft"
                      value={repairInstruction}
                      onChange={(event) => setRepairInstruction(event.target.value)}
                      multiline
                      minRows={2}
                      disabled={
                        busy ||
                        phaseBusy ||
                        !build.repairEligibility.allowed ||
                        editorOpen ||
                        !!state.error ||
                        executionHasUnknownOutcome(build.testEvidence)
                      }
                      error={containsSolutionBuildSecret(repairInstruction)}
                      helperText="Optional. Repairs keep the agreed behavior and test cases. Request new behavior in the saved workflow conversation. Never enter secrets."
                      inputProps={{ maxLength: 2000 }}
                    />
                    <Button
                      variant="outlined"
                      disabled={
                        busy ||
                        phaseBusy ||
                        editorOpen ||
                        !!state.error ||
                        !build.repairEligibility.allowed ||
                        !client.repairSolutionBuildRequest ||
                        executionHasUnknownOutcome(build.testEvidence) ||
                        containsSolutionBuildSecret(repairInstruction)
                      }
                      onClick={() =>
                        mutation(
                          'repair',
                          repairInstruction.trim() ? { instruction: repairInstruction.trim() } : {}
                        )
                      }
                    >
                      Repair draft
                    </Button>
                    {executionHasUnknownOutcome(build.testEvidence) ? (
                      <Alert severity="warning">
                        Reconcile the unknown outcome before repairing or retrying an external
                        action.
                      </Alert>
                    ) : null}
                    <Typography variant="caption" color="text.secondary">
                      A repair creates a new draft. It does not approve, activate or silently change
                      the current release.
                    </Typography>
                  </Stack>
                </TaskDisclosure>
              ) : null}
              {validReview ? (
                <>
                  <Typography variant="body2">
                    Create a Solution from this exact reviewed version. This does not deploy,
                    activate or grant provider access.
                  </Typography>
                  <Button
                    variant="contained"
                    disabled={
                      busy || editorOpen || phaseBusy || !!state.error || !verifiedBuildTest
                    }
                    onClick={() => mutation('confirm')}
                  >
                    {busy ? 'Confirming handoff…' : 'Create reviewed Solution'}
                  </Button>
                  {!verifiedBuildTest ? (
                    <Typography variant="body2" color="text.secondary">
                      Test this exact saved draft in n8n before creating the reviewed Solution.
                      Mocked, missing or stale evidence cannot unlock handoff.
                    </Typography>
                  ) : null}
                </>
              ) : null}
              {build.solutionId ? (
                <Button
                  component={RouterLink}
                  to={`/workspace/solutions/${encodeURIComponent(build.solutionId)}`}
                  onClick={openWorkflow}
                  variant="contained"
                >
                  {embedded ? 'Continue to workflow controls' : 'Continue to Solution controls'}
                </Button>
              ) : null}
            </Stack>
          </SectionCard>
        </Box>
      </Box>
      {build.spec?.kind === 'webhook_transform_v1' ? (
        <SectionCard
          title="What this workflow will give you"
          description="A webhook takes the named input fields and returns the mapped JSON fields below."
        >
          <MappingPreview key={build.workflowHash} spec={build.spec} />
        </SectionCard>
      ) : null}
      {isNativeWorkflowSpec(build.spec) ? (
        <TaskDisclosure title="Agreed behavior & acceptance cases">
          <SectionCard
            title="What this workflow should give you"
            description="Saved requirements and input/output contracts for the native draft."
          >
            <WorkflowContractSummary spec={build.spec} />
          </SectionCard>
        </TaskDisclosure>
      ) : null}
      {build.testEvidence ? (
        <SectionCard
          title="Recorded test evidence"
          description="Only recorded evidence is shown. Draft generation and static review do not imply a successful execution."
        >
          <WorkflowExecutionEvidence evidence={build.testEvidence} />
        </SectionCard>
      ) : null}
      {build.review ? (
        <TaskDisclosure
          title="Supporting review evidence"
          key={`${build.workflowHash}:${validReview}`}
          defaultOpen={validReview || build.review.valid === false}
        >
          <SectionCard
            title="Saved workflow review"
            description={
              build.status === 'completed'
                ? 'This reviewed version was handed off to the Solution. Deployment and execution are separate steps.'
                : validReview
                  ? 'Checks passed for this saved candidate. This is not execution evidence.'
                  : 'This review does not authorize handoff.'
            }
          >
            <Stack gap={1}>
              <Typography>{build.review.summary}</Typography>
              {build.review.issues?.map((issue, index) => (
                <Alert key={index} severity="warning">
                  {issue.message}
                </Alert>
              ))}
              {build.review.changes?.map((change, index) => (
                <Typography key={index} variant="body2">
                  {typeof change === 'string'
                    ? change
                    : change.message || change.description || change.summary}
                </Typography>
              ))}
              <Typography component="code" variant="caption" sx={{ overflowWrap: 'anywhere' }}>
                Candidate hash: {build.workflowHash}
              </Typography>
            </Stack>
          </SectionCard>
        </TaskDisclosure>
      ) : null}
      <TaskDisclosure title="Build technical details">
        <Typography variant="caption">
          Saved version {build.rowVersion} · Input version {build.inputVersion}
        </Typography>
        {build.operation ? (
          <Typography variant="caption">
            Saved operation: {build.operation.status.replaceAll('_', ' ')} · Input version{' '}
            {build.operation.inputVersion}
          </Typography>
        ) : null}
        {progress ? (
          <Typography variant="body2">
            Recorded stage: {progress.stage.replaceAll('_', ' ')}
            {Number.isInteger(progress.attempt) ? ` · Attempt ${progress.attempt}` : ''}
            {Number.isInteger(progress.maxAttempts) ? ` · Limit ${progress.maxAttempts}` : ''}
          </Typography>
        ) : null}
      </TaskDisclosure>
      <TaskDisclosure title="Source, saved answers & boundaries">
        <Typography variant="body2">
          Only this selected task is source context. Its research and approvals do not authorize
          this workflow.
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {build.source?.request || build.source?.taskText}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Task reference: {build.source?.runId || build.runId}
        </Typography>
        <Divider />
        {(build.answers || []).length ? (
          build.answers.map((answer, index) => (
            <Typography key={answer.questionId || index} variant="body2">
              Saved answer: {typeof answer.value === 'string' ? answer.value : 'Recorded'}
            </Typography>
          ))
        ) : (
          <Typography variant="body2" color="text.secondary">
            No answers recorded yet.
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          The source task grants no access to provider accounts, credentials, paid setup, messages
          or repositories. Connections and effects require their own authorization. Deployment uses
          only an available authorized environment; authoring does not require creating one.
        </Typography>
      </TaskDisclosure>
    </Container>
  );
}
