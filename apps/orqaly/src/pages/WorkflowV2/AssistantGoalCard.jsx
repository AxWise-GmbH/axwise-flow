import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CollapsibleMarkdownDocument } from '../../components/VoiceControl/CollapsibleMarkdownDocument.jsx';
import AssistantExecutableAction from './AssistantExecutableAction.jsx';
import { WorkflowBuildEntry } from '../GcpWorkspace/WorkflowBuildEntry.jsx';
import { TaskDisclosure } from './TaskDisclosure.jsx';
import { deliverableTitle, taskPlanSteps, taskStatusLabel } from './task-presentation.js';
import {
  activeApproval,
  approvalIdempotencyKey,
  runProgress,
  stageDisplayName,
} from '../../workflow-v2/view-model.js';

const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'completed_with_evidence_gaps',
  'blocked',
  'failed',
  'cancelled',
]);

const ACTIVE_STAGE_STATUSES = new Set([
  'ready',
  'queued',
  'running',
  'polling',
  'awaiting_approval',
]);

const STATUS_TONES = {
  completed: 'success',
  completed_with_evidence_gaps: 'warning',
  awaiting_gate_1: 'info',
  awaiting_gate_2: 'info',
  blocked: 'error',
  failed: 'error',
  running: 'primary',
};

const MAX_POLL_DELAY_MS = 30_000;

const ARTIFACT_TYPE_LABELS = {
  product_prd: 'Product PRD',
  software_prd: 'Software PRD',
  research_strategy: 'Research strategy',
  content_artifact: 'Content artifact',
  operational_plan: 'Operational plan',
  launch_authorization: 'Launch authorization',
  general_artifact: 'General artifact',
};

function readable(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function errorMessage(value) {
  return value instanceof Error ? value.message : String(value || 'Request failed');
}

function pollDelay(interval, failureCount = 0) {
  return Math.min(interval * 2 ** Math.min(Math.max(failureCount, 0), 30), MAX_POLL_DELAY_MS);
}

function shouldPoll(workflow) {
  return workflow?.run?.id && !TERMINAL_RUN_STATUSES.has(workflow.run.status);
}

function artifactReferenceForStage(workflow, kind) {
  return workflow?.stages?.find((stage) => stage.kind === kind)?.outputArtifact || null;
}

function artifactMatchesReference(artifact, reference) {
  return (
    artifact?.artifactId === reference?.artifactId &&
    artifact?.artifactHash === reference?.artifactHash
  );
}

function exactArtifact(artifacts, reference) {
  const artifact = reference ? artifacts[reference.artifactId] : null;
  return artifactMatchesReference(artifact, reference) ? artifact : null;
}

function defaultAdvancedHref(runId) {
  const params = new URLSearchParams({ section: 'goals', run: runId });
  return `/goals?${params}`;
}

function StatusChip({ status, evidenceReadiness }) {
  return (
    <Chip
      size="small"
      color={STATUS_TONES[status] || 'default'}
      variant={['running', 'completed'].includes(status) ? 'filled' : 'outlined'}
      label={taskStatusLabel(status, evidenceReadiness)}
    />
  );
}

function ArtifactIdentity({ artifact, label }) {
  if (!artifact) return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        component="code"
        variant="caption"
        data-testid="assistant-goal-artifact-hash"
        sx={{ display: 'block', overflowWrap: 'anywhere' }}
      >
        sha256:{artifact.artifactHash}
      </Typography>
    </Box>
  );
}

function ScopeSummary({ artifact }) {
  const scope = artifact?.payload;
  if (!scope) return <LinearProgress aria-label="Loading Goal scope" />;
  const profile = scope.deliverableProfile;
  return (
    <Stack spacing={1.5}>
      <Typography variant="overline" color="text.secondary">
        Scope
      </Typography>
      <Typography variant="subtitle1" fontWeight={600}>
        {scope.objective || 'Compiled scope'}
      </Typography>
      {profile ? (
        <Stack spacing={1}>
          {profile.artifactType ? (
            <Chip
              size="small"
              label={ARTIFACT_TYPE_LABELS[profile.artifactType] || profile.artifactType}
              sx={{ alignSelf: 'flex-start' }}
            />
          ) : null}
          {profile.problem ? (
            <Box>
              <Typography variant="subtitle2">Problem</Typography>
              <Typography variant="body2" color="text.secondary">
                {profile.problem}
              </Typography>
            </Box>
          ) : null}
          {profile.desiredOutcome ? (
            <Box>
              <Typography variant="subtitle2">Desired outcome</Typography>
              <Typography variant="body2" color="text.secondary">
                {profile.desiredOutcome}
              </Typography>
            </Box>
          ) : null}
          {profile.audiences?.length ? (
            <Typography variant="body2" color="text.secondary">
              Audiences: {profile.audiences.join(' · ')}
            </Typography>
          ) : null}
          {profile.nonGoals?.length ? (
            <Typography variant="body2" color="text.secondary">
              Non-goals: {profile.nonGoals.join(' · ')}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
      {!!scope.deliverables?.length && (
        <Typography variant="body2" color="text.secondary">
          Deliverables: {scope.deliverables.join(' · ')}
        </Typography>
      )}
      <Stack direction="row" gap={0.75} flexWrap="wrap">
        {scope.topicAnchors?.map((anchor) => (
          <Chip key={anchor.value} size="small" label={anchor.value} />
        ))}
        {scope.geography?.map((place) => (
          <Chip key={place} size="small" variant="outlined" label={place} />
        ))}
      </Stack>
      {scope.assumptions?.length ? (
        <Box>
          <Typography variant="subtitle2">Safe defaults and assumptions</Typography>
          {scope.assumptions.map((assumption) => (
            <Typography key={assumption} variant="body2" color="text.secondary">
              • {assumption}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Stack>
  );
}

function PlanSummary({ artifact, workflow }) {
  const tasks = artifact?.payload?.tasks;
  if (!tasks) return <LinearProgress aria-label="Loading Goal plan" />;
  return (
    <Stack spacing={1}>
      <Typography variant="overline" color="text.secondary">
        Plan · {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Steps from your task plan. Dependencies show which outputs each step needs.
      </Typography>
      <Stack component="ol" aria-label="Task workflow" spacing={1.5} sx={{ m: 0, pl: 3 }}>
        {taskPlanSteps(tasks, workflow?.stages).map((task) => (
          <Box
            component="li"
            key={task.stageId || task.stageKey || task.title}
            sx={{
              pl: 1,
              borderLeft: '2px solid',
              borderColor: task.status === 'completed' ? 'success.main' : 'divider',
            }}
          >
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="body2" fontWeight={600}>
                {task.title}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                color={task.status === 'completed' ? 'success' : 'default'}
                label={
                  task.status === 'not_reported' ? 'Progress not reported' : readable(task.status)
                }
              />
            </Stack>
            {task.dependencies.length ? (
              <Typography variant="caption" color="text.secondary">
                Depends on: {task.dependencies.join(' · ')}
              </Typography>
            ) : null}
            {task.outputArtifact ? (
              <Typography variant="caption" sx={{ display: 'block' }}>
                Output saved · inspect in advanced details
              </Typography>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function ApprovalControls({ approval, artifact, busy, onApprove, onRevise }) {
  const [showRevision, setShowRevision] = useState(false);
  const [correction, setCorrection] = useState('');
  const isScope = approval.kind === 'scope';
  const artifactMatches = artifactMatchesReference(artifact, approval.artifact);
  const clarification = isScope ? artifact?.payload?.materialClarification : null;

  return (
    <Paper
      variant="outlined"
      data-testid={`assistant-goal-approval-${approval.kind}`}
      sx={{ p: 2, borderColor: 'primary.main', borderRadius: 1 }}
    >
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="overline" color="primary.main">
            {isScope ? 'Gate 1' : 'Gate 2'}
          </Typography>
          <Typography variant="subtitle2">
            Approve the exact {approval.kind} before the Goal continues
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Approval is bound to this immutable artifact and input hash.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Review the summary before approving. Open advanced details for the complete immutable
            contract.
          </Typography>
        </Box>
        {!artifactMatches && (
          <LinearProgress aria-label={`Loading exact ${approval.kind} artifact`} />
        )}
        {clarification && <Alert severity="info">{clarification}</Alert>}
        <ArtifactIdentity artifact={approval.artifact} label="Artifact bound to this approval" />
        {isScope && (showRevision || clarification) && (
          <Stack spacing={1}>
            <TextField
              label={clarification ? 'One material clarification' : 'Scope correction'}
              placeholder="Describe only the change that matters"
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              multiline
              minRows={2}
              inputProps={{ maxLength: 6000 }}
            />
            <Button
              variant="outlined"
              disabled={busy || !correction.trim() || !artifactMatches}
              onClick={async () => {
                const accepted = await onRevise(correction.trim());
                if (accepted) setCorrection('');
              }}
            >
              Apply correction and recompile
            </Button>
          </Stack>
        )}
        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="flex-end" gap={1}>
          {isScope && !showRevision && !clarification && (
            <Button disabled={busy} onClick={() => setShowRevision(true)}>
              Change scope
            </Button>
          )}
          <Button variant="contained" disabled={busy || !artifactMatches} onClick={onApprove}>
            Approve exact {approval.kind}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function EvidenceStatus({ workflow }) {
  const readiness = workflow.run.evidenceReadiness;
  if (workflow.run.status === 'blocked' || readiness === 'blocked') {
    return (
      <Alert severity="error">
        This Goal is blocked by essential legal or safety evidence. No launch-ready artifact was
        claimed.
      </Alert>
    );
  }
  if (workflow.run.status === 'completed_with_evidence_gaps' || readiness === 'ready_with_gaps') {
    return (
      <Alert severity="warning">
        Some claims still need verification before you act on this result. Review the evidence gaps
        in the deliverable.
      </Alert>
    );
  }
  if (readiness === 'ready') {
    return <Alert severity="success">All applicable blocking evidence is verified.</Alert>;
  }
  return null;
}

function FinalArtifact({ artifact, markdown, onDownload }) {
  const [open, setOpen] = useState(false);
  if (!artifact) return null;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
          gap={1}
        >
          <Box>
            <Typography variant="overline" color="success.main">
              Final deliverable
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your requested document is ready to review.
            </Typography>
          </Box>
          <Stack direction="row" gap={0.5}>
            <Button
              size="small"
              variant="contained"
              disabled={!markdown}
              aria-expanded={open}
              aria-controls={`deliverable-${artifact.artifactId}`}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? 'Close deliverable' : 'Open deliverable'}
            </Button>
            <Button size="small" variant="outlined" disabled={!markdown} onClick={onDownload}>
              Download .md
            </Button>
          </Stack>
        </Stack>
        {open && markdown ? (
          <Box id={`deliverable-${artifact.artifactId}`}>
            <CollapsibleMarkdownDocument
              text={markdown}
              previewBlocks={Number.MAX_SAFE_INTEGER}
              testId="assistant-goal-final-markdown"
            />
          </Box>
        ) : !markdown ? (
          <LinearProgress aria-label="Loading Goal final Markdown" />
        ) : null}
      </Stack>
    </Paper>
  );
}

/**
 * Live, durable Goal projection intended for an Assistant message.
 *
 * `client` is the existing WorkflowV2 client and must expose `read`, `artifact`,
 * `approve`, and `reviseScope`. `label` and `initialStatus` keep the persisted
 * Assistant message useful while its live snapshot loads. `onStatusChange(runId,
 * status)` exposes only an adopted live workflow status to sibling UI. `onOpenAdvanced(runId)`
 * may be provided for SPA navigation; otherwise the control is a normal link to
 * `advancedHref` (or the canonical `/goals?section=goals&run=...` location).
 */
export function AssistantGoalCard({
  client,
  runId,
  label = 'Durable execution',
  initialStatus = null,
  onOpenAdvanced,
  onStatusChange,
  advancedHref,
  buildAgentId,
  onOpenWorkflow,
  onOpenBuild,
  hasSavedWorkflow = false,
  pollIntervalMs = 2000,
}) {
  const [workflow, setWorkflow] = useState(null);
  const [artifacts, setArtifacts] = useState({});
  const [finalMarkdown, setFinalMarkdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(null);
  const [resourceErrors, setResourceErrors] = useState({});
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const currentRunId = useRef(runId);
  const revisionCommand = useRef(null);
  const selectedWorkflow = workflow?.run?.id === runId ? workflow : null;

  const adoptWorkflow = useCallback(
    (nextWorkflow) => {
      if (!nextWorkflow?.run || nextWorkflow.run.id !== runId) {
        throw new Error('The Goal API returned an invalid workflow snapshot.');
      }
      setWorkflow((current) => {
        if (current?.run?.id !== runId) return nextWorkflow;
        return nextWorkflow.run.rowVersion >= current.run.rowVersion ? nextWorkflow : current;
      });
    },
    [runId]
  );

  useEffect(() => {
    currentRunId.current = runId;
    setWorkflow(null);
    setArtifacts({});
    setFinalMarkdown(null);
    setLoading(Boolean(runId));
    setReadError(null);
    setResourceErrors({});
    setActionError(null);
    setBusy(false);
    revisionCommand.current = null;
  }, [runId]);

  useEffect(() => {
    const status = selectedWorkflow?.run?.status;
    if (status) onStatusChange?.(runId, status);
  }, [onStatusChange, runId, selectedWorkflow?.run?.status]);

  useEffect(() => {
    if (!runId) return undefined;
    let disposed = false;
    let timer;
    let failureCount = 0;
    const interval = Math.max(250, pollIntervalMs);

    const read = async () => {
      let nextDelay = interval;
      try {
        const response = await client.read(runId);
        if (disposed || currentRunId.current !== runId) return;
        const nextWorkflow = response?.workflow;
        if (!nextWorkflow?.run || nextWorkflow.run.id !== runId) {
          throw new Error('The Goal API returned an invalid workflow snapshot.');
        }
        failureCount = 0;
        adoptWorkflow(nextWorkflow);
        setReadError(null);
        setLoading(false);
        if (!shouldPoll(nextWorkflow)) return;
        if (activeApproval(nextWorkflow)) {
          nextDelay = Math.min(Math.max(interval * 5, 10_000), MAX_POLL_DELAY_MS);
        }
      } catch (value) {
        if (disposed || currentRunId.current !== runId) return;
        failureCount += 1;
        nextDelay = pollDelay(interval, failureCount);
        setReadError(value);
        setLoading(false);
      }
      if (!disposed && currentRunId.current === runId) {
        timer = window.setTimeout(read, nextDelay);
      }
    };

    read();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [adoptWorkflow, client, pollIntervalMs, reloadKey, runId]);

  const artifactReferencesKey = useMemo(() => {
    const references = [
      artifactReferenceForStage(selectedWorkflow, 'compile_scope'),
      artifactReferenceForStage(selectedWorkflow, 'planning'),
      activeApproval(selectedWorkflow)?.artifact,
    ].filter(Boolean);
    const unique = new Map();
    for (const reference of references) unique.set(reference.artifactId, reference);
    return JSON.stringify([...unique.values()]);
  }, [selectedWorkflow]);

  useEffect(() => {
    if (!runId) return undefined;
    const references = JSON.parse(artifactReferencesKey);
    if (!references.length) return undefined;
    let disposed = false;

    for (const reference of references) {
      client
        .artifact(runId, reference.artifactId)
        .then((response) => {
          if (disposed || currentRunId.current !== runId) return;
          const artifact = response?.artifact;
          if (!artifactMatchesReference(artifact, reference)) {
            throw new Error(`The ${reference.kind || 'Goal'} artifact hash did not match.`);
          }
          setArtifacts((current) => ({ ...current, [artifact.artifactId]: artifact }));
          setResourceErrors((current) => {
            if (!current[reference.artifactId]) return current;
            const next = { ...current };
            delete next[reference.artifactId];
            return next;
          });
        })
        .catch((value) => {
          if (disposed || currentRunId.current !== runId) return;
          setResourceErrors((current) => ({
            ...current,
            [reference.artifactId]: value,
          }));
        });
    }
    return () => {
      disposed = true;
    };
  }, [artifactReferencesKey, client, reloadKey, runId]);

  const finalReference = selectedWorkflow?.run?.finalArtifact;
  const finalReferenceKey = finalReference
    ? `${finalReference.artifactId}:${finalReference.artifactHash}`
    : '';
  useEffect(() => {
    setFinalMarkdown(null);
    if (!runId || !finalReferenceKey) return undefined;
    let disposed = false;
    const [artifactId] = finalReferenceKey.split(':');
    const resourceKey = `markdown:${artifactId}`;

    client
      .artifact(runId, artifactId, { markdown: true, includeMetadata: true })
      .then((response) => {
        if (disposed || currentRunId.current !== runId) return;
        const markdown = response?.markdown;
        if (typeof markdown !== 'string') {
          throw new Error('The Goal API returned an invalid Markdown artifact.');
        }
        if (response.etag !== `"sha256-${finalReference.artifactHash}"`) {
          throw new Error('The Goal final Markdown hash did not match its immutable reference.');
        }
        setFinalMarkdown(markdown);
        setResourceErrors((current) => {
          if (!current[resourceKey]) return current;
          const next = { ...current };
          delete next[resourceKey];
          return next;
        });
      })
      .catch((value) => {
        if (disposed || currentRunId.current !== runId) return;
        setResourceErrors((current) => ({ ...current, [resourceKey]: value }));
      });
    return () => {
      disposed = true;
    };
  }, [client, finalReference?.artifactHash, finalReferenceKey, reloadKey, runId]);

  const acceptCommandResponse = (response) => {
    const nextWorkflow = response?.workflow;
    if (!nextWorkflow?.run || nextWorkflow.run.id !== runId) {
      throw new Error('The Goal API returned an invalid workflow snapshot.');
    }
    adoptWorkflow(nextWorkflow);
    setReadError(null);
    setResourceErrors({});
    setReloadKey((current) => current + 1);
  };

  const approve = async () => {
    const approval = activeApproval(selectedWorkflow);
    const idempotencyKey = approvalIdempotencyKey(selectedWorkflow, approval);
    if (!approval || !idempotencyKey) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await client.approve(runId, {
        commandId: crypto.randomUUID(),
        issuedAt: new Date().toISOString(),
        approvalKind: approval.kind,
        artifact: approval.artifact,
        idempotencyKey,
      });
      if (currentRunId.current !== runId) return;
      acceptCommandResponse(response);
    } catch (value) {
      if (currentRunId.current === runId) setActionError(value);
    } finally {
      if (currentRunId.current === runId) setBusy(false);
    }
  };

  const revise = async (correction) => {
    const approval = activeApproval(selectedWorkflow);
    if (approval?.kind !== 'scope') return false;
    const previous = revisionCommand.current;
    const command =
      previous?.runId === runId &&
      previous?.artifactHash === approval.artifact.artifactHash &&
      previous?.correction === correction
        ? previous.command
        : {
            commandId: crypto.randomUUID(),
            issuedAt: new Date().toISOString(),
            acceptedScope: approval.artifact,
            correction,
            idempotencyKey: `${runId}:scope-revision:${crypto.randomUUID()}`,
          };
    revisionCommand.current = {
      runId,
      artifactHash: approval.artifact.artifactHash,
      correction,
      command,
    };
    setBusy(true);
    setActionError(null);
    try {
      const response = await client.reviseScope(runId, command);
      if (currentRunId.current !== runId) return false;
      if (revisionCommand.current?.command === command) revisionCommand.current = null;
      acceptCommandResponse(response);
      return true;
    } catch (value) {
      if (currentRunId.current === runId) setActionError(value);
      return false;
    } finally {
      if (currentRunId.current === runId) setBusy(false);
    }
  };

  const download = () => {
    if (!finalMarkdown || !finalReference) return;
    const url = URL.createObjectURL(
      new Blob([finalMarkdown], { type: 'text/markdown;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orqaly-${runId}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const retry = () => {
    setReadError(null);
    setResourceErrors({});
    setReloadKey((current) => current + 1);
  };

  const openAdvancedControl = onOpenAdvanced ? (
    <Button size="small" variant="outlined" onClick={() => onOpenAdvanced(runId)}>
      Open advanced details
    </Button>
  ) : (
    <Button
      component="a"
      size="small"
      variant="outlined"
      href={advancedHref || defaultAdvancedHref(runId)}
    >
      Open advanced details
    </Button>
  );

  if (!runId) {
    return <Alert severity="error">This Goal message does not contain a run ID.</Alert>;
  }

  if ((loading || workflow !== selectedWorkflow) && !selectedWorkflow) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }} aria-label="Loading Goal">
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ sm: 'center' }}
            gap={1}
          >
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="subtitle2">{label}</Typography>
              {initialStatus && <StatusChip status={initialStatus} />}
            </Stack>
            {openAdvancedControl}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1.5} role="status">
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading durable Goal…
            </Typography>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  if (!selectedWorkflow) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle2">{label}</Typography>
            {initialStatus && <StatusChip status={initialStatus} />}
          </Stack>
          <Alert severity="error">{errorMessage(readError)}</Alert>
          <Stack direction="row" gap={1}>
            <Button size="small" variant="contained" onClick={retry}>
              Retry Goal
            </Button>
            {openAdvancedControl}
          </Stack>
        </Stack>
      </Paper>
    );
  }

  const progress = runProgress(selectedWorkflow);
  const approval = activeApproval(selectedWorkflow);
  const currentStage = [...(selectedWorkflow.stages || [])]
    .sort((left, right) => left.ordinal - right.ordinal)
    .find((stage) => ACTIVE_STAGE_STATUSES.has(stage.status));
  const scopeReference = artifactReferenceForStage(selectedWorkflow, 'compile_scope');
  const planReference = artifactReferenceForStage(selectedWorkflow, 'planning');
  const scopeArtifact = exactArtifact(artifacts, scopeReference);
  const planArtifact = exactArtifact(artifacts, planReference);
  const approvalArtifact = exactArtifact(artifacts, approval?.artifact);
  const resourceError = Object.values(resourceErrors)[0];

  return (
    <Paper
      variant="outlined"
      data-testid="assistant-goal-card"
      sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1, overflow: 'hidden' }}
    >
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
          gap={1}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              Your task
            </Typography>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="subtitle1" fontWeight={600}>
                {deliverableTitle(finalMarkdown, scopeArtifact?.payload, label)}
              </Typography>
              <StatusChip
                status={selectedWorkflow.run.status}
                evidenceReadiness={selectedWorkflow.run.evidenceReadiness}
              />
            </Stack>
          </Box>
        </Stack>

        {!TERMINAL_RUN_STATUSES.has(selectedWorkflow.run.status) && (
          <Box>
            <Stack direction="row" justifyContent="space-between" gap={2}>
              <Typography variant="caption" color="text.secondary">
                {currentStage
                  ? `${stageDisplayName(currentStage)} · ${readable(currentStage.status)}`
                  : 'Workflow settled'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {progress.completed}/{progress.total} stages settled
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={progress.total ? (progress.completed / progress.total) * 100 : 0}
              aria-label="Goal progress"
            />
          </Box>
        )}

        {readError && (
          <Alert severity="warning" action={<Button onClick={retry}>Retry</Button>}>
            Live updates paused: {errorMessage(readError)}
          </Alert>
        )}
        {resourceError && (
          <Alert severity="warning" action={<Button onClick={retry}>Retry</Button>}>
            Some Goal details could not be loaded: {errorMessage(resourceError)}
          </Alert>
        )}
        {actionError && (
          <Alert
            severity="error"
            action={<Button onClick={() => setActionError(null)}>Dismiss</Button>}
          >
            {errorMessage(actionError)}
          </Alert>
        )}

        {approval?.kind === 'scope' && scopeReference && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
            <ScopeSummary artifact={scopeArtifact} />
          </Paper>
        )}
        {approval?.kind === 'scope' && (
          <ApprovalControls
            key={`${approval.kind}:${approval.artifact.artifactHash}`}
            approval={approval}
            artifact={approvalArtifact}
            busy={busy}
            onApprove={approve}
            onRevise={revise}
          />
        )}
        {approval?.kind === 'plan' && planReference && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
            <PlanSummary artifact={planArtifact} workflow={selectedWorkflow} />
          </Paper>
        )}
        {approval?.kind === 'plan' && (
          <ApprovalControls
            key={`${approval.kind}:${approval.artifact.artifactHash}`}
            approval={approval}
            artifact={approvalArtifact}
            busy={busy}
            onApprove={approve}
            onRevise={revise}
          />
        )}
        <EvidenceStatus workflow={selectedWorkflow} />
        <WorkflowBuildEntry
          client={client}
          runId={runId}
          agentId={buildAgentId}
          taskLabel={label}
          onOpenWorkflow={onOpenWorkflow}
          onOpenBuild={onOpenBuild}
        />
        {hasSavedWorkflow ? (
          <TaskDisclosure title="Supporting document">
            <FinalArtifact
              key={finalReference?.artifactId || 'pending-final-artifact'}
              artifact={finalReference}
              markdown={finalMarkdown}
              onDownload={download}
            />
          </TaskDisclosure>
        ) : (
          <FinalArtifact
            key={finalReference?.artifactId || 'pending-final-artifact'}
            artifact={finalReference}
            markdown={finalMarkdown}
            onDownload={download}
          />
        )}
        <TaskDisclosure title="Plan & activity">
          <Stack direction="row" gap={0.75} flexWrap="wrap" aria-label="Approval checkpoints">
            {selectedWorkflow.stages
              .filter((stage) => ['gate_1', 'gate_2'].includes(stage.kind))
              .map((stage) => (
                <Chip
                  key={stage.kind}
                  size="small"
                  variant="outlined"
                  label={`${stage.kind === 'gate_1' ? 'Scope approval' : 'Plan approval'} · ${stage.status === 'completed' ? 'Approved' : readable(stage.status)}`}
                />
              ))}
          </Stack>
          {planReference ? (
            <PlanSummary artifact={planArtifact} workflow={selectedWorkflow} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              The task plan will appear after the scope and research steps.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {progress.completed}/{progress.total} workflow stages settled. This is process progress,
            not a measure of evidence quality.
          </Typography>
          {openAdvancedControl}
        </TaskDisclosure>
        {scopeReference && approval?.kind !== 'scope' ? (
          <TaskDisclosure title="Task brief & boundaries">
            <ScopeSummary artifact={scopeArtifact} />
          </TaskDisclosure>
        ) : null}
        <TaskDisclosure title="Technical execution details">
          <Typography variant="body2" color="text.secondary">
            Internal execution records test the approval → self-hosted n8n → receipt path. They do
            not perform the work described in your deliverable or contact external services.
          </Typography>
          <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
            Run {runId}
          </Typography>
          <ArtifactIdentity artifact={finalReference} label="Immutable final artifact" />
          <AssistantExecutableAction
            client={client}
            runId={runId}
            enabled={Boolean(finalReference)}
            pollIntervalMs={pollIntervalMs}
          />
        </TaskDisclosure>
        {!finalReference && !approval && TERMINAL_RUN_STATUSES.has(selectedWorkflow.run.status)
          ? openAdvancedControl
          : null}
      </Stack>
    </Paper>
  );
}
