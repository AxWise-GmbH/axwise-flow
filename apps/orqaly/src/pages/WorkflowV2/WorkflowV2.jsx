import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SignIn, UserButton, useAuth } from '@clerk/react';
import { Navigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { CollapsibleMarkdownDocument } from '../../components/VoiceControl/CollapsibleMarkdownDocument.jsx';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import {
  activeApproval,
  approvalIdempotencyKey,
  artifactRefs,
  goalWorkflowViewRefreshKey,
  normalizedRunItems,
  runProgress,
  stageDisplayName,
} from '../../workflow-v2/view-model.js';
import {
  workflowCatalogTileSx,
  workflowComposerCardSx,
  workflowConversationBubbleSx,
  workflowLoginShellSx,
  workflowProjectionToolbarSx,
} from './surface-styles.js';
import { AssistantSurface } from './AssistantSurface.jsx';
import { GoalWorkflowOutputs } from './GoalWorkflowOutputs.jsx';
import { CapabilityWorkPanel } from './CapabilityWorkPanel.jsx';
import { isCapabilityWork } from '../../../shared/workflow-v2/capability-work-primitives.js';

const TERMINAL = new Set([
  'completed',
  'completed_with_evidence_gaps',
  'blocked',
  'failed',
  'cancelled',
  'awaiting_capability_input',
]);

const WORKFLOW_POLL_INTERVAL_MS = 2000;
const WORKFLOW_POLL_MAX_BACKOFF_MS = 30000;

function workflowPollDelay(failureCount = 0) {
  const boundedFailureCount = Math.min(Math.max(0, failureCount), 30);
  return Math.min(
    WORKFLOW_POLL_INTERVAL_MS * 2 ** boundedFailureCount,
    WORKFLOW_POLL_MAX_BACKOFF_MS
  );
}

const ACTIVE_STAGE_STATUSES = new Set([
  'ready',
  'queued',
  'running',
  'polling',
  'awaiting_approval',
]);

const STATUS_TONE = {
  completed: 'success',
  completed_with_evidence_gaps: 'warning',
  awaiting_gate_1: 'info',
  awaiting_gate_2: 'info',
  awaiting_capability_input: 'info',
  blocked: 'error',
  failed: 'error',
  cancelled: 'default',
  running: 'primary',
};

function readable(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function shortId(value) {
  if (!value) return '—';
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function workflowRunLocation(runId, embedded) {
  const params = new URLSearchParams();
  if (embedded) params.set('section', 'goals');
  if (runId) params.set('run', runId);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

async function copyPlainText(value) {
  if (!value || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CopyAction({ value, label = 'Copy message' }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <Button
      size="small"
      color="inherit"
      aria-label={label}
      onClick={async () => setCopied(await copyPlainText(value))}
      sx={{ minWidth: 0, px: 0.75, color: 'text.secondary', alignSelf: 'flex-start' }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function ArtifactIdentity({ artifact, label = 'Artifact bound to this action' }) {
  if (!artifact) return null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        component="code"
        variant="caption"
        data-testid="artifact-hash"
        sx={{ display: 'block', overflowWrap: 'anywhere', color: 'text.primary' }}
      >
        sha256:{artifact.artifactHash}
      </Typography>
    </Box>
  );
}

function StatusChip({ status, size = 'small' }) {
  return (
    <Chip
      size={size}
      color={STATUS_TONE[status] || 'default'}
      variant={['running', 'completed'].includes(status) ? 'filled' : 'outlined'}
      label={readable(status)}
    />
  );
}

function ConversationMessage({
  children,
  user = false,
  copyValue = null,
  copyLabel,
  wide = false,
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        ...workflowConversationBubbleSx(theme, { user }),
        alignSelf: user ? 'flex-end' : 'flex-start',
        width: wide ? '100%' : 'fit-content',
        maxWidth: wide ? '100%' : { xs: '100%', md: 680 },
        borderRadius: 1,
        px: { xs: 2, sm: 2.5 },
        py: 2,
        overflow: 'hidden',
      }}
    >
      <Stack spacing={copyValue ? 1 : 0} sx={{ minWidth: 0 }}>
        {children}
        <CopyAction value={copyValue} label={copyLabel} />
      </Stack>
    </Box>
  );
}

function RequestComposer({ advanced, busy, request, onRequestChange, onStart }) {
  const theme = useTheme();
  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 760, mx: 'auto', py: { md: 4 } }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h4" component="h1">
          What should we make?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Turn your request into research, a design or a written plan with AxWise.
          You can use the result as context for implementation in Orqaly Preview on your desktop.
        </Typography>
      </Box>
      <Paper
        aria-label="New workflow composer"
        sx={{
          ...workflowComposerCardSx(theme),
          borderRadius: 1,
          p: { xs: 2, sm: 2.5 },
        }}
      >
        <Stack spacing={1.5}>
          <TextField
            autoFocus
            multiline
            minRows={5}
            variant="standard"
            label="Your request"
            value={request}
            onChange={onRequestChange}
            inputProps={{ maxLength: 24000 }}
            InputProps={{ disableUnderline: true }}
          />
          <Divider />
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ sm: 'center' }}
            gap={1.5}
          >
            <Typography variant="caption" color="text.secondary">
              {advanced
                ? 'Review evidence, catalog selection, tools, budget, boundaries, DAG and retries.'
                : 'Review the brief and document plan before generating your deliverable.'}
            </Typography>
            <Button variant="contained" disabled={busy || !request.trim()} onClick={onStart}>
              {busy ? 'Starting…' : 'Compile scope'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

const artifactTypeLabels = {
  product_prd: 'Product PRD',
  software_prd: 'Software PRD',
  research_strategy: 'Research strategy',
  content_artifact: 'Content artifact',
  operational_plan: 'Operational plan',
  launch_authorization: 'Launch authorization',
  general_artifact: 'General artifact',
};

function artifactTypeLabel(value) {
  return artifactTypeLabels[value] || value;
}

function scopeSummaryCopy(artifact, advanced = false) {
  const scope = artifact?.payload;
  if (!scope) return null;
  const profile = scope.deliverableProfile;
  const summary = [
    `Objective: ${scope.objective}`,
    profile?.artifactType
      ? `Artifact type: ${artifactTypeLabel(profile.artifactType)} (${profile.artifactType})`
      : null,
    profile?.problem ? `Problem: ${profile.problem}` : null,
    profile?.desiredOutcome ? `Desired outcome: ${profile.desiredOutcome}` : null,
    profile?.audiences?.length ? `Audiences: ${profile.audiences.join(' · ')}` : null,
    profile?.nonGoals?.length ? `Non-goals: ${profile.nonGoals.join(' · ')}` : null,
    scope.deliverables?.length ? `Deliverables: ${scope.deliverables.join(' · ')}` : null,
    scope.assumptions?.length ? `Assumptions: ${scope.assumptions.join(' · ')}` : null,
  ].filter(Boolean);
  if (advanced && scope.requirements?.length) {
    summary.push(
      'Typed requirements:',
      ...scope.requirements.map(
        (requirement) =>
          `- [${requirement.priority}] ${requirement.category} · ${requirement.authority}: ${requirement.description} (${requirement.id})`
      )
    );
  }
  if (advanced && scope.acceptanceCriteria?.length) {
    summary.push(
      'Acceptance criteria:',
      ...scope.acceptanceCriteria.map(
        (criterion) =>
          `- ${criterion.id}\n  Given ${criterion.given}\n  When ${criterion.when}\n  Then ${criterion.then}\n  Supports ${criterion.supports.join(', ')}`
      )
    );
  }
  return summary.join('\n\n');
}

function readerOutputSummary(outputContract) {
  const readerOutput = outputContract?.readerOutput;
  if (!readerOutput) return null;
  const parts = [`${readable(readerOutput.readerFormat.value)} format`];
  if (readerOutput.itemLimit) {
    parts.push(
      `exactly ${readerOutput.itemLimit.exactItems} ${readable(
        readerOutput.itemLimit.itemKind
      ).toLowerCase()}${readerOutput.itemLimit.exactItems === 1 ? '' : 's'}`
    );
  }
  if (readerOutput.wordLimit) {
    const basis =
      readerOutput.wordLimit.basis === 'bounded_content_default_v1'
        ? 'inferred compact default'
        : 'owner-explicit limit';
    parts.push(`maximum ${readerOutput.wordLimit.maximumWords} reader words (${basis})`);
  }
  return parts.join(' · ');
}

function readerOutputProvenance(outputContract) {
  const readerOutput = outputContract?.readerOutput;
  if (!readerOutput) return null;
  return [
    `Format requirement ${readerOutput.readerFormat.requirementId}`,
    readerOutput.itemLimit
      ? `Item-limit requirement ${readerOutput.itemLimit.requirementId}`
      : null,
    readerOutput.wordLimit
      ? `Word-limit requirement ${readerOutput.wordLimit.requirementId}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function planSummaryCopy(artifact) {
  const tasks = artifact?.payload?.tasks || [];
  if (!tasks.length) return null;
  const readerSummary = readerOutputSummary(artifact?.payload?.outputContract);
  return [
    `Plan for this deliverable: ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
    readerSummary ? `Reader output: ${readerSummary}` : null,
    ...tasks.map((task, index) => `${index + 1}. ${task.title}`),
  ]
    .filter(Boolean)
    .join('\n');
}

function ScopeSummary({ artifact, advanced = false }) {
  const scope = artifact?.payload;
  if (!scope) return <LinearProgress aria-label="Loading scope artifact" />;
  const profile = scope.deliverableProfile;
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Task brief
        </Typography>
        <Typography variant="h6">{scope.objective}</Typography>
      </Box>
      {profile && (
        <Stack spacing={1.25}>
          <Chip
            size="small"
            label={artifactTypeLabel(profile.artifactType)}
            sx={{ alignSelf: 'flex-start' }}
          />
          <Box>
            <Typography variant="subtitle2">Problem</Typography>
            <Typography variant="body2" color="text.secondary">
              {profile.problem}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Desired outcome</Typography>
            <Typography variant="body2" color="text.secondary">
              {profile.desiredOutcome}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Audiences: {profile.audiences.join(' · ')}
          </Typography>
          {!!profile.nonGoals.length && (
            <Typography variant="body2" color="text.secondary">
              Non-goals: {profile.nonGoals.join(' · ')}
            </Typography>
          )}
        </Stack>
      )}
      <Stack direction="row" gap={1} flexWrap="wrap">
        {scope.topicAnchors?.map((anchor) => (
          <Chip key={anchor.value} size="small" label={anchor.value} />
        ))}
        {scope.geography?.map((place) => (
          <Chip key={place} size="small" label={place} variant="outlined" />
        ))}
      </Stack>
      <Box>
        <Typography variant="subtitle2">Deliverables</Typography>
        <Typography variant="body2" color="text.secondary">
          {scope.deliverables?.join(' · ')}
        </Typography>
      </Box>
      {!!scope.assumptions?.length && (
        <Box>
          <Typography variant="subtitle2">Safe defaults and assumptions</Typography>
          {scope.assumptions.map((item) => (
            <Typography key={item} variant="body2" color="text.secondary">
              • {item}
            </Typography>
          ))}
        </Box>
      )}
      {advanced && (
        <Stack spacing={1.5}>
          {!!scope.personas?.length && (
            <Box>
              <Typography variant="subtitle2">Personas</Typography>
              <Typography variant="body2">{scope.personas.join(' · ')}</Typography>
            </Box>
          )}
          {!!scope.interviewRequirements?.length && (
            <Box>
              <Typography variant="subtitle2">Interview requirements</Typography>
              {scope.interviewRequirements.map((item) => (
                <Typography key={item} variant="body2">
                  • {item}
                </Typography>
              ))}
            </Box>
          )}
          {!!scope.prdRequirements?.length && (
            <Box>
              <Typography variant="subtitle2">PRD contract</Typography>
              {scope.prdRequirements.map((item) => (
                <Typography key={item} variant="body2">
                  • {item}
                </Typography>
              ))}
            </Box>
          )}
          {!!scope.limits?.length && (
            <Typography variant="body2">Limits: {scope.limits.join(' · ')}</Typography>
          )}
          {!!scope.policies?.length && (
            <Typography variant="body2">Policies: {scope.policies.join(' · ')}</Typography>
          )}
          {!!scope.requirements?.length && (
            <Box>
              <Typography variant="subtitle2">Typed requirements</Typography>
              <Stack component="ol" spacing={1.25} sx={{ pl: 2.5, my: 1 }}>
                {scope.requirements.map((requirement) => (
                  <Box component="li" key={requirement.id} sx={{ pl: 0.5, minWidth: 0 }}>
                    <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
                      <Chip size="small" label={requirement.priority} />
                      <Typography variant="caption" color="text.secondary">
                        {requirement.category} · {requirement.authority}
                      </Typography>
                    </Stack>
                    <Typography variant="body2">{requirement.description}</Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {requirement.id}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
          {!!scope.acceptanceCriteria?.length && (
            <Box>
              <Typography variant="subtitle2">Acceptance criteria</Typography>
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {scope.acceptanceCriteria.map((criterion) => (
                  <Box key={criterion.id} sx={{ minWidth: 0 }}>
                    <Typography variant="body2">Given {criterion.given}</Typography>
                    <Typography variant="body2">When {criterion.when}</Typography>
                    <Typography variant="body2">Then {criterion.then}</Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', overflowWrap: 'anywhere' }}
                    >
                      {criterion.id} · supports {criterion.supports.join(', ')}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
          <CopyAction value={scopeSummaryCopy(artifact, true)} label="Copy exact scope contract" />
          <ArtifactIdentity artifact={artifact} label="Immutable scope" />
        </Stack>
      )}
    </Stack>
  );
}

function PlanSummary({ artifact, advanced = false }) {
  const plan = artifact?.payload;
  if (!plan) return <LinearProgress aria-label="Loading plan artifact" />;
  const tasks = plan.tasks || [];
  const readerSummary = readerOutputSummary(plan.outputContract);
  const readerProvenance = readerOutputProvenance(plan.outputContract);
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Plan for this deliverable
        </Typography>
        <Typography variant="h6">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} ready for approval
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          This plan produces a written deliverable. Local implementation can continue in Orqaly Preview.
        </Typography>
      </Box>
      {readerSummary && (
        <Box
          data-testid="reader-output-contract"
          sx={{ borderLeft: '2px solid', borderColor: 'divider', pl: 1.5 }}
        >
          <Typography variant="overline" color="text.secondary">
            Reader output contract
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {readerSummary}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Measured on reader-facing Markdown before Sources and server disclosures.
          </Typography>
          {advanced && readerProvenance && (
            <Typography
              component="code"
              variant="caption"
              color="text.secondary"
              data-testid="reader-output-provenance"
              sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}
            >
              {readerProvenance}
            </Typography>
          )}
        </Box>
      )}
      <Stack spacing={1}>
        {tasks.map((task, index) => (
          <Box key={task.stageId || task.stageKey} sx={{ display: 'flex', gap: 1.5 }}>
            <Typography color="text.secondary" sx={{ minWidth: 20 }}>
              {index + 1}.
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600}>
                {task.title}
              </Typography>
              {advanced && (
                <Typography variant="caption" color="text.secondary">
                  {task.dependsOnStageKeys?.length
                    ? `After ${task.dependsOnStageKeys.join(', ')}`
                    : 'Root task'}{' '}
                  · agent {task.agentId ? shortId(task.agentId) : 'unassigned'} ·{' '}
                  {task.toolIds?.length || 0} tools · {task.budgetCents || 0} budget cents
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Stack>
      {advanced && <ArtifactIdentity artifact={artifact} label="Immutable plan" />}
    </Stack>
  );
}

function EvidencePanel({ scopeArtifact, researchArtifact }) {
  const scope = scopeArtifact?.payload;
  const research = researchArtifact?.payload;
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
        <Typography variant="h6">Evidence controls</Typography>
        {research?.readiness && <StatusChip status={research.readiness} />}
      </Stack>
      {(scope?.evidenceRequirements || []).map((requirement) => {
        const finding = research?.findings?.find(
          (candidate) => candidate.requirementId === requirement.id
        );
        return (
          <Box
            key={requirement.id}
            sx={{ borderLeft: '2px solid', borderColor: 'divider', pl: 1.5 }}
          >
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle2">{requirement.description}</Typography>
              <Chip
                size="small"
                variant="outlined"
                color={requirement.criticality === 'blocking' ? 'error' : 'default'}
                label={requirement.criticality}
              />
              {finding && <StatusChip status={finding.status} />}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Applies when: {requirement.appliesWhen} · accepted sources:{' '}
              {requirement.acceptedSourceTypes.join(', ')}
            </Typography>
            {finding?.note && <Typography variant="body2">{finding.note}</Typography>}
          </Box>
        );
      })}
      {!scope?.evidenceRequirements?.length && (
        <Typography variant="body2" color="text.secondary">
          No additional evidence classes apply to this accepted scope.
        </Typography>
      )}
      {research && (
        <Alert
          severity={
            research.readiness === 'blocked'
              ? 'error'
              : research.readiness === 'ready'
                ? 'success'
                : 'warning'
          }
        >
          {research.readiness === 'ready'
            ? 'All applicable blocking requirements are verified.'
            : research.readiness === 'blocked'
              ? 'Essential legal or safety evidence is unresolved or conflicting.'
              : 'The artifact may be delivered with explicit nonblocking gaps; it is not launch-ready.'}
        </Alert>
      )}
    </Stack>
  );
}

function ResourceBoundaries({ planArtifact }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const tasks = planArtifact?.payload?.tasks || [];
  const agentsById = new Map();
  for (const task of tasks) {
    if (task.agent?.id && !agentsById.has(task.agent.id)) {
      agentsById.set(task.agent.id, task.agent);
    }
  }
  const agents = [...agentsById.values()];
  const tools = [...new Set(tasks.flatMap((task) => task.toolIds || []))];
  const boundaries = [...new Set(tasks.flatMap((task) => task.dataBoundary || []))];
  const totalBudget = tasks.reduce((sum, task) => sum + (task.budgetCents || 0), 0);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTasks = normalizedQuery
    ? tasks.filter((task) =>
        [
          task.title,
          task.requiredRole,
          task.lens,
          task.agent?.name,
          ...(task.requiredCapabilities || []),
          ...(task.toolIds || []),
        ]
          .filter(Boolean)
          .join('\n')
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : tasks;
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6">Bound Personal Catalog</Typography>
        <Typography variant="body2" color="text.secondary">
          Read-only receipt of the tenant-scoped agents and resources already bound by the immutable
          plan.
        </Typography>
      </Box>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip label={`${agents.length} tenant ${agents.length === 1 ? 'agent' : 'agents'}`} />
        <Chip label={`${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`} />
        <Chip label={`${totalBudget} budget cents`} />
      </Stack>
      {!!tasks.length && (
        <TextField
          type="search"
          size="small"
          label="Filter bound catalog"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputProps={{ maxLength: 200 }}
          helperText={`${visibleTasks.length} of ${tasks.length} bound ${tasks.length === 1 ? 'task' : 'tasks'} shown`}
        />
      )}
      <Box>
        <Typography variant="subtitle2">Bound task roles &amp; tenant agents</Typography>
        {visibleTasks.length ? (
          <Stack role="list" spacing={1} sx={{ mt: 0.75 }}>
            {visibleTasks.map((task) => {
              const agent = task.agent;
              const quality = Number.isInteger(agent?.qualityScoreMicros)
                ? `${(agent.qualityScoreMicros / 10_000).toFixed(1)}% quality`
                : null;
              return (
                <Box
                  key={task.stageId || task.stageKey}
                  role="listitem"
                  sx={workflowCatalogTileSx(theme)}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {task.requiredRole} · {agent?.name || 'Unbound agent'}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {[task.lens, quality, `${task.budgetCents || 0} budget cents`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                  <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {(task.requiredCapabilities || []).map((capability) => (
                      <Chip
                        key={`${task.stageKey}:${capability}`}
                        size="small"
                        variant="outlined"
                        label={readable(capability)}
                      />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {tasks.length
              ? 'No bound task matches this filter.'
              : 'No task role or tenant-agent binding is recorded in the plan.'}
          </Typography>
        )}
      </Box>
      <Box>
        <Typography variant="subtitle2">Tools</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {tools.length ? tools.join(' · ') : 'No tools authorized.'}
        </Typography>
      </Box>
      <Box>
        <Typography variant="subtitle2">Data boundaries</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {boundaries.length ? boundaries.join(' · ') : 'No additional data boundary recorded.'}
        </Typography>
      </Box>
    </Stack>
  );
}

function StageDag({ workflow }) {
  const stages = [...(workflow?.stages || [])].sort((left, right) => left.ordinal - right.ordinal);
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  return (
    <Stack spacing={1.25}>
      <Typography variant="h6">Task DAG, attempts and retries</Typography>
      {stages.map((stage) => {
        const attempts = workflow.attempts
          .filter((attempt) => attempt.stageId === stage.id)
          .sort((left, right) => left.attemptNumber - right.attemptNumber);
        const parents = workflow.dependencies
          .filter((edge) => edge.stageId === stage.id)
          .map((edge) => byId.get(edge.dependsOnStageId)?.stageKey)
          .filter(Boolean);
        return (
          <Box key={stage.id} sx={{ py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" gap={2}>
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>
                  {stageDisplayName(stage)}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  {parents.length ? `Depends on ${parents.join(', ')}` : 'Root stage'} · row version{' '}
                  {stage.rowVersion}
                </Typography>
              </Box>
              <StatusChip status={stage.status} />
            </Stack>
            {!!attempts.length && (
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {attempts.map((attempt) => (
                  <Typography
                    key={attempt.id}
                    variant="caption"
                    color="text.secondary"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    Attempt {attempt.attemptNumber}: {readable(attempt.status)} · operation{' '}
                    {shortId(attempt.operationId)} · input {shortId(attempt.inputHash)}
                    {attempt.leaseExpiresAt ? ` · lease until ${attempt.leaseExpiresAt}` : ''}
                  </Typography>
                ))}
              </Stack>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

function ApprovalHistory({ approvals }) {
  return (
    <Stack spacing={1}>
      <Typography variant="h6">Immutable approvals</Typography>
      {!approvals.length && (
        <Typography variant="body2" color="text.secondary">
          No artifact has been approved yet.
        </Typography>
      )}
      {approvals.map((approval) => (
        <Box key={approval.id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between" gap={2}>
            <Typography variant="subtitle2">{readable(approval.kind)} gate</Typography>
            <StatusChip status={approval.decision} />
          </Stack>
          <ArtifactIdentity artifact={approval.artifact} label="Approved artifact" />
        </Box>
      ))}
    </Stack>
  );
}

function ApprovalCard({ approval, artifact, busy, onApprove, onRevise, advanced }) {
  const [showRevision, setShowRevision] = useState(false);
  const [correction, setCorrection] = useState('');
  if (!approval) return null;
  const isScope = approval.kind === 'scope';
  const clarification = isScope ? artifact?.payload?.materialClarification : null;
  const artifactMatches =
    artifact?.artifactId === approval.artifact.artifactId &&
    artifact?.artifactHash === approval.artifact.artifactHash;
  return (
    <Paper
      variant="outlined"
      data-testid={`approval-${approval.kind}`}
      sx={{
        p: { xs: 2, sm: 3 },
        borderColor: 'primary.main',
        borderRadius: 1,
        alignSelf: advanced ? 'stretch' : 'flex-start',
        width: advanced ? 'auto' : { xs: '100%', md: 720 },
        maxWidth: '100%',
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="primary.main">
            {advanced ? (isScope ? 'Gate 1' : 'Gate 2') : (isScope ? 'Review brief' : 'Review document plan')}
          </Typography>
          <Typography variant="h6">
            Review and approve this {isScope ? 'brief' : 'document plan'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {advanced
              ? 'Approval binds this immutable artifact and its input hash. Later edits require a new scope attempt.'
              : `Your approval applies to this version of the Goal’s ${isScope ? 'brief' : 'document plan'}.`}
          </Typography>
        </Box>
        {!artifactMatches && <LinearProgress aria-label={`Loading ${approval.kind} approval`} />}
        {clarification && <Alert severity="info">{clarification}</Alert>}
        <ArtifactIdentity artifact={approval.artifact} />
        {isScope && (advanced || clarification || showRevision) && (
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
          {isScope && !advanced && !clarification && !showRevision && (
            <Button onClick={() => setShowRevision(true)}>Change scope</Button>
          )}
          <Button variant="contained" disabled={busy || !artifactMatches} onClick={onApprove}>
            Approve exact {approval.kind} artifact
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function FinalArtifact({ markdown, artifact, runId, onDownload, wide = false }) {
  const [copyState, setCopyState] = useState(null);
  if (!artifact) return null;
  const desktopLink = runId
    ? `${window.location.origin}/goals?${new URLSearchParams({ section: 'goals', run: runId })}`
    : null;
  return (
    <ConversationMessage wide={wide} copyValue={markdown} copyLabel="Copy final Markdown">
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline" color="success.main">
              Written deliverable
            </Typography>
            <Typography variant="h6">{markdown ? 'Document ready' : 'Loading document'}</Typography>
          </Box>
          <Stack direction="row" gap={0.5} alignSelf={{ xs: 'flex-start', sm: 'center' }}>
            <Button variant="outlined" disabled={!markdown} onClick={onDownload}>
              Download .md
            </Button>
          </Stack>
        </Stack>
        {desktopLink && (
          <Box sx={{ borderLeft: '2px solid', borderColor: 'divider', pl: 1.5 }}>
            <Typography variant="subtitle2">Continue in your desktop chat</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              In Orqaly Preview, paste this link into Project context in your current conversation.
              Sign in with the same account, then ask for your next step: implement, research or revise.
            </Typography>
            <Button
              size="small"
              disabled={!markdown}
              onClick={async () => setCopyState(await copyPlainText(desktopLink) ? 'copied' : 'failed')}
              sx={{ mt: 0.5, ml: -1 }}
            >
              Copy Goal link for desktop
            </Button>
            {copyState === 'copied' && (
              <Typography role="status" variant="caption" sx={{ display: 'block' }}>
                Link copied. Paste it into Project context in Orqaly Preview.
              </Typography>
            )}
            {copyState === 'failed' && (
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Typography role="status" variant="caption">
                  Clipboard access is unavailable. Select and copy this link:
                </Typography>
                <TextField
                  label="Goal link for desktop"
                  value={desktopLink}
                  size="small"
                  InputProps={{ readOnly: true }}
                  onFocus={(event) => event.target.select()}
                />
              </Stack>
            )}
          </Box>
        )}
        <ArtifactIdentity artifact={artifact} label="Immutable final artifact" />
        <Divider />
        {markdown ? (
          <CollapsibleMarkdownDocument text={markdown} testId="final-markdown" />
        ) : (
          <LinearProgress aria-label="Loading final Markdown" />
        )}
      </Stack>
    </ConversationMessage>
  );
}

function RunLibrary({ runs, selectedRunId, busy, error, onOpen, onNew }) {
  return (
    <Paper
      component="nav"
      aria-label="Workflow navigation"
      elevation={0}
      sx={{
        p: 1,
        alignSelf: 'start',
        position: { lg: 'sticky' },
        top: 16,
        width: '100%',
        bgcolor: 'transparent',
        maxHeight: { lg: 'calc(100vh - 32px)' },
        overflowY: 'auto',
      }}
    >
      <Stack spacing={1.25}>
        <Button
          color="inherit"
          onClick={onNew}
          sx={{ justifyContent: 'flex-start', textTransform: 'none', bgcolor: 'action.hover' }}
        >
          New workflow
        </Button>
        <Divider />
        <Typography variant="overline" color="text.secondary">
          Workflow history
        </Typography>
        {busy && <LinearProgress aria-label="Loading workflows" />}
        {error && (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        )}
        {!busy && !runs.length && (
          <Typography variant="body2" color="text.secondary">
            New runs will appear here and can be resumed after refresh.
          </Typography>
        )}
        {runs.map((item) => (
          <Button
            key={item.run.id}
            color="inherit"
            onClick={() => onOpen(item.run.id)}
            aria-current={selectedRunId === item.run.id ? 'page' : undefined}
            sx={{
              display: 'block',
              textAlign: 'left',
              textTransform: 'none',
              p: 1,
              borderRadius: 1.5,
              bgcolor: selectedRunId === item.run.id ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              {readable(item.run.mode)} · {shortId(item.run.id)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {readable(item.run.status)}
            </Typography>
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}

function CurrentStageMessage({ workflow }) {
  const stage = [...workflow.stages]
    .sort((left, right) => left.ordinal - right.ordinal)
    .find((candidate) => ACTIVE_STAGE_STATUSES.has(candidate.status));
  if (!stage || stage.status === 'awaiting_approval') return null;
  const statusText =
    stage.status === 'polling'
      ? 'AxWise accepted the same durable operation; Orqaly is polling without creating another attempt.'
      : `${readable(stage.status)}. This page will update from the durable workflow state.`;
  return (
    <ConversationMessage
      copyValue={`${stageDisplayName(stage)}\n${statusText}`}
      copyLabel="Copy stage update"
    >
      <Box role="status">
        <Typography variant="subtitle2">{stageDisplayName(stage)}</Typography>
        <Typography variant="body2" color="text.secondary">
          {statusText}
        </Typography>
      </Box>
    </ConversationMessage>
  );
}

export function WorkflowV2Surface({
  client,
  ownerUserId = null,
  authScopeKey = null,
  embedded = false,
  routeSearch,
  initialDraft = null,
  onDraftConsumed = null,
}) {
  const [projection, setProjection] = useState('simple');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [request, setRequest] = useState('');
  const [requestLabels, setRequestLabels] = useState({});
  const [workflow, setWorkflow] = useState(null);
  const [runs, setRuns] = useState([]);
  const [artifacts, setArtifacts] = useState({});
  const [finalMarkdown, setFinalMarkdown] = useState(null);
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [error, setError] = useState(null);
  const [unavailableRunId, setUnavailableRunId] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [resourceErrors, setResourceErrors] = useState({});
  const [capabilityConfiguration, setCapabilityConfiguration] = useState(null);
  const revisionCommand = useRef(null);
  const viewRequestEpoch = useRef(0);
  const initialWindowRouteSearch = useRef(window.location.search);
  const appliedRouteSearch = useRef({ initialized: false, search: undefined, runId: null });
  const appliedInitialDraft = useRef(null);
  const advanced = projection === 'advanced';
  const capabilityWork = isCapabilityWork(workflow?.run);
  const capabilityConfigured = capabilityConfiguration?.client === client &&
    capabilityConfiguration?.authScopeKey === authScopeKey && capabilityConfiguration?.configured === true;

  useEffect(() => {
    let disposed = false;
    setCapabilityConfiguration(null);
    if (!ownerUserId || !authScopeKey || typeof client.capabilityWorkConfiguration !== 'function') return undefined;
    client.capabilityWorkConfiguration().then((value) => {
      if (!disposed) setCapabilityConfiguration({ client, authScopeKey, configured: value?.configured === true });
    }).catch(() => {
      if (!disposed) setCapabilityConfiguration({ client, authScopeKey, configured: false });
    });
    return () => { disposed = true; };
  }, [client, ownerUserId, authScopeKey]);

  const clearRunView = useCallback(
    ({ replaceHistory = true } = {}) => {
      viewRequestEpoch.current += 1;
      setHistoryOpen(false);
      setWorkflow(null);
      setRequest('');
      setArtifacts({});
      setFinalMarkdown(null);
      setError(null);
      setUnavailableRunId(null);
      setPollError(null);
      setResourceErrors({});
      setBusy(false);
      revisionCommand.current = null;
      if (replaceHistory) {
        window.history.replaceState(window.history.state, '', workflowRunLocation(null, embedded));
      }
    },
    [embedded]
  );

  useEffect(
    () => () => {
      viewRequestEpoch.current += 1;
    },
    []
  );

  const acceptWorkflow = useCallback((nextWorkflow) => {
    setWorkflow(nextWorkflow);
    setRuns((current) => [
      nextWorkflow,
      ...current.filter((item) => item.run.id !== nextWorkflow.run.id),
    ]);
  }, []);

  const acceptCapabilityWorkflow = useCallback((nextWorkflow) => {
    if (!isCapabilityWork(nextWorkflow?.run) || nextWorkflow.run.ownerUserId !== ownerUserId) return;
    viewRequestEpoch.current += 1;
    setArtifacts({});
    setFinalMarkdown(null);
    setResourceErrors({});
    setError(null);
    setPollError(null);
    setProjection('simple');
    acceptWorkflow(nextWorkflow);
    window.history.replaceState(window.history.state, '', workflowRunLocation(nextWorkflow.run.id, embedded));
  }, [acceptWorkflow, embedded, ownerUserId]);

  const loadRuns = useCallback(async () => {
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      const response = await client.list({ limit: 25 });
      setRuns(normalizedRunItems(response));
    } catch (value) {
      setHistoryError(value.message);
    } finally {
      setHistoryBusy(false);
    }
  }, [client]);

  const openRun = useCallback(
    async (runId) => {
      const requestEpoch = ++viewRequestEpoch.current;
      setBusy(true);
      setError(null);
      setUnavailableRunId(null);
      setPollError(null);
      setResourceErrors({});
      if (workflow?.run?.id !== runId) {
        setArtifacts({});
        setFinalMarkdown(null);
      }
      setRequest('');
      try {
        const response = await client.read(runId);
        if (viewRequestEpoch.current !== requestEpoch) return;
        acceptWorkflow(response.workflow);
        setProjection(response.workflow.run.mode);
        window.history.replaceState(window.history.state, '', workflowRunLocation(runId, embedded));
      } catch (value) {
        if (viewRequestEpoch.current === requestEpoch) {
          if (value?.status === 404) {
            setWorkflow(null);
            setUnavailableRunId(runId);
          } else {
            setError(value);
          }
        }
      } finally {
        if (viewRequestEpoch.current === requestEpoch) setBusy(false);
      }
    },
    [acceptWorkflow, client, embedded, workflow?.run?.id]
  );

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const effectiveRouteSearch = routeSearch ?? initialWindowRouteSearch.current;
  const requestedRun = new URLSearchParams(effectiveRouteSearch).get('run');
  useEffect(() => {
    const previous = appliedRouteSearch.current;
    if (previous.initialized && previous.search === effectiveRouteSearch) return;
    appliedRouteSearch.current = {
      initialized: true,
      search: effectiveRouteSearch,
      runId: requestedRun,
    };
    if (requestedRun && requestedRun !== workflow?.run?.id) {
      openRun(requestedRun);
    } else if (!requestedRun && previous.initialized && previous.runId) {
      clearRunView({ replaceHistory: false });
    }
  }, [clearRunView, effectiveRouteSearch, openRun, requestedRun, workflow?.run?.id]);

  useEffect(() => {
    if (!initialDraft || appliedInitialDraft.current === initialDraft.nonce) return;
    appliedInitialDraft.current = initialDraft.nonce;
    const content = typeof initialDraft.text === 'string' ? initialDraft.text.trim() : '';
    if (
      initialDraft.mode === 'goal' &&
      !requestedRun &&
      !workflow &&
      content &&
      content.length <= 24_000
    ) {
      setRequest((current) => current || content);
    }
    onDraftConsumed?.(initialDraft.nonce);
  }, [initialDraft, onDraftConsumed, requestedRun, workflow]);

  useEffect(() => {
    const runId = workflow?.run?.id;
    const runStatus = workflow?.run?.status;
    if (!runId || TERMINAL.has(runStatus) || activeApproval(workflow)) return undefined;
    let disposed = false;
    let timer;
    let failureCount = 0;
    const pollEpoch = viewRequestEpoch.current;

    const poll = async () => {
      let nextDelay = WORKFLOW_POLL_INTERVAL_MS;
      try {
        const response = await client.read(runId);
        if (disposed || viewRequestEpoch.current !== pollEpoch) return;
        failureCount = 0;
        setPollError(null);
        acceptWorkflow(response.workflow);
      } catch (value) {
        if (disposed || viewRequestEpoch.current !== pollEpoch) return;
        failureCount += 1;
        nextDelay = workflowPollDelay(failureCount);
        setPollError(value);
      }

      if (!disposed && viewRequestEpoch.current === pollEpoch) {
        timer = window.setTimeout(poll, nextDelay);
      }
    };

    timer = window.setTimeout(poll, WORKFLOW_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [acceptWorkflow, client, workflow]);

  const refs = useMemo(
    () => isCapabilityWork(workflow?.run) ? [] : artifactRefs(workflow, { includeExecution: advanced }),
    [advanced, workflow]
  );
  const refsKey = refs
    .map((artifact) => `${artifact.artifactId}:${artifact.artifactHash}`)
    .join('|');
  useEffect(() => {
    if (!workflow?.run?.id || !refs.length) return undefined;
    let disposed = false;
    const retryTimers = new Set();
    const missing = refs.filter(
      (reference) => artifacts[reference.artifactId]?.artifactHash !== reference.artifactHash
    );
    if (!missing.length) return undefined;
    const artifactEpoch = viewRequestEpoch.current;
    const loadArtifact = (reference, failureCount = 0) => {
      client
        .artifact(workflow.run.id, reference.artifactId)
        .then((response) => {
          if (disposed || viewRequestEpoch.current !== artifactEpoch) return;
          const loaded = response.artifact;
          setArtifacts((current) => ({
            ...current,
            [loaded.artifactId]: loaded,
          }));
          setResourceErrors((current) => {
            if (!current[reference.artifactId]) return current;
            const next = { ...current };
            delete next[reference.artifactId];
            return next;
          });
        })
        .catch((value) => {
          if (disposed || viewRequestEpoch.current !== artifactEpoch) return;
          setResourceErrors((current) => ({
            ...current,
            [reference.artifactId]: value,
          }));
          const timer = window.setTimeout(
            () => {
              retryTimers.delete(timer);
              loadArtifact(reference, failureCount + 1);
            },
            workflowPollDelay(failureCount + 1)
          );
          retryTimers.add(timer);
        });
    };
    for (const reference of missing) {
      loadArtifact(reference);
    }
    return () => {
      disposed = true;
      for (const timer of retryTimers) window.clearTimeout(timer);
    };
    // refsKey is the stable immutable identity list; artifacts is intentionally read as a cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, refsKey, workflow?.run?.id]);

  const finalArtifactId = capabilityWork ? undefined : workflow?.run?.finalArtifact?.artifactId;
  const finalArtifactHash = workflow?.run?.finalArtifact?.artifactHash;
  const workflowRunId = workflow?.run?.id;
  useEffect(() => {
    if (!finalArtifactId) {
      setFinalMarkdown(null);
      return undefined;
    }
    setFinalMarkdown(null);
    let disposed = false;
    let retryTimer;
    const finalArtifactEpoch = viewRequestEpoch.current;
    const resourceKey = `markdown:${finalArtifactId}`;
    const loadFinalMarkdown = (failureCount = 0) => {
      client
        .artifact(workflowRunId, finalArtifactId, {
          markdown: true,
          includeMetadata: true,
        })
        .then((response) => {
          if (disposed || viewRequestEpoch.current !== finalArtifactEpoch) return;
          const markdown = response?.markdown;
          if (typeof markdown !== 'string') {
            throw new Error('The Goal API returned an invalid Markdown artifact.');
          }
          if (response.etag !== `"sha256-${finalArtifactHash}"`) {
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
          if (disposed || viewRequestEpoch.current !== finalArtifactEpoch) return;
          setResourceErrors((current) => ({ ...current, [resourceKey]: value }));
          retryTimer = window.setTimeout(
            () => loadFinalMarkdown(failureCount + 1),
            workflowPollDelay(failureCount + 1)
          );
        });
    };
    loadFinalMarkdown();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
    };
  }, [client, finalArtifactHash, finalArtifactId, workflowRunId]);

  const start = async () => {
    const requestEpoch = ++viewRequestEpoch.current;
    setBusy(true);
    setError(null);
    setPollError(null);
    const command = {
      commandId: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
      mode: projection,
      request: request.trim(),
    };
    try {
      const response = await client.start(command);
      if (viewRequestEpoch.current !== requestEpoch) return;
      setRequestLabels((current) => ({ ...current, [response.workflow.run.id]: request.trim() }));
      acceptWorkflow(response.workflow);
      window.history.replaceState(
        window.history.state,
        '',
        workflowRunLocation(response.workflow.run.id, embedded)
      );
    } catch (value) {
      if (viewRequestEpoch.current === requestEpoch) setError(value);
    } finally {
      if (viewRequestEpoch.current === requestEpoch) setBusy(false);
    }
  };

  const approve = async () => {
    const approval = activeApproval(workflow);
    const idempotencyKey = approvalIdempotencyKey(workflow, approval);
    if (!approval || !idempotencyKey) return;
    const requestEpoch = viewRequestEpoch.current;
    setBusy(true);
    setError(null);
    try {
      const response = await client.approve(workflow.run.id, {
        commandId: crypto.randomUUID(),
        issuedAt: new Date().toISOString(),
        approvalKind: approval.kind,
        artifact: approval.artifact,
        idempotencyKey,
      });
      if (viewRequestEpoch.current !== requestEpoch) return;
      acceptWorkflow(response.workflow);
    } catch (value) {
      if (viewRequestEpoch.current === requestEpoch) setError(value);
    } finally {
      if (viewRequestEpoch.current === requestEpoch) setBusy(false);
    }
  };

  const revise = async (correction) => {
    const approval = activeApproval(workflow);
    if (approval?.kind !== 'scope') return false;
    const requestEpoch = viewRequestEpoch.current;
    const previous = revisionCommand.current;
    const command =
      previous?.runId === workflow.run.id &&
      previous?.artifactHash === approval.artifact.artifactHash &&
      previous?.correction === correction
        ? previous.command
        : {
            commandId: crypto.randomUUID(),
            issuedAt: new Date().toISOString(),
            acceptedScope: approval.artifact,
            correction,
            idempotencyKey: `${workflow.run.id}:scope-revision:${crypto.randomUUID()}`,
          };
    revisionCommand.current = {
      runId: workflow.run.id,
      artifactHash: approval.artifact.artifactHash,
      correction,
      command,
    };
    setBusy(true);
    setError(null);
    try {
      const response = await client.reviseScope(workflow.run.id, command);
      if (viewRequestEpoch.current !== requestEpoch) return false;
      if (revisionCommand.current?.command === command) revisionCommand.current = null;
      acceptWorkflow(response.workflow);
      return true;
    } catch (value) {
      if (viewRequestEpoch.current === requestEpoch) setError(value);
      return false;
    } finally {
      if (viewRequestEpoch.current === requestEpoch) setBusy(false);
    }
  };

  const reset = () => clearRunView();

  const download = () => {
    if (!finalMarkdown || !workflow?.run?.finalArtifact) return;
    const url = URL.createObjectURL(
      new Blob([finalMarkdown], { type: 'text/markdown;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orqaly-${workflow.run.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const progress = runProgress(workflow);
  const approval = activeApproval(workflow);
  const artifactForStage = (kind) => {
    const reference = workflow?.stages.find((stage) => stage.kind === kind)?.outputArtifact;
    return reference ? artifacts[reference.artifactId] : null;
  };
  const scopeArtifact = artifactForStage('compile_scope');
  const researchArtifact = artifactForStage('execute_research');
  const planArtifact = artifactForStage('planning');
  const approvalArtifact = approval ? artifacts[approval.artifact.artifactId] : null;
  const persistedRequest =
    typeof workflow?.run?.request === 'string' && workflow.run.request.trim()
      ? workflow.run.request.trim()
      : null;
  const originalRequestLabel = workflow
    ? persistedRequest || requestLabels[workflow.run.id] || null
    : null;

  const openFromHistory = async (runId) => {
    setHistoryOpen(false);
    await openRun(runId);
  };

  const visibleError = error || pollError || Object.values(resourceErrors)[0];

  return (
    <Container
      maxWidth="xl"
      sx={{ py: embedded ? 0 : { xs: 2, md: 4 }, minHeight: embedded ? 'auto' : '100vh' }}
    >
      <Stack spacing={3}>
        {!embedded && (
          <Stack
            component="header"
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            gap={2}
          >
            <Box>
              <Typography variant="h4">Orqaly × AxWise</Typography>
              <Typography color="text.secondary">
                One durable workflow. Simple and Advanced are two views of the same run.
              </Typography>
            </Box>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Button
                color="inherit"
                aria-label="Open workflow history"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen(true)}
                sx={{ display: { xs: 'inline-flex', lg: 'none' } }}
              >
                History
              </Button>
              <Button color="inherit" onClick={reset}>
                New
              </Button>
              <UserButton />
            </Stack>
          </Stack>
        )}
        <Drawer anchor="left" open={historyOpen} onClose={() => setHistoryOpen(false)}>
          <Box sx={{ width: { xs: 'min(88vw, 360px)', sm: 360 }, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" px={1}>
              <Typography variant="h6">Workflow history</Typography>
              <Button color="inherit" onClick={() => setHistoryOpen(false)}>
                Close
              </Button>
            </Stack>
            <RunLibrary
              runs={runs}
              selectedRunId={workflow?.run?.id}
              busy={historyBusy}
              error={historyError}
              onOpen={openFromHistory}
              onNew={reset}
            />
          </Box>
        </Drawer>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr)' },
            gap: 3,
          }}
        >
          <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
            <RunLibrary
              runs={runs}
              selectedRunId={workflow?.run?.id}
              busy={historyBusy}
              error={historyError}
              onOpen={openRun}
              onNew={reset}
            />
          </Box>
          <Stack spacing={3} sx={{ minWidth: 0, maxWidth: advanced ? 'none' : 860 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              gap={2}
              data-testid="workflow-projection-toolbar"
              sx={workflowProjectionToolbarSx({ embedded })}
            >
              <ToggleButtonGroup
                exclusive
                size="small"
                value={projection}
                onChange={(_event, value) => value && setProjection(value)}
                aria-label="Workflow detail mode"
                sx={(theme) => ({
                  gap: 0.5,
                  '& .MuiToggleButtonGroup-grouped': {
                    border: 0,
                    borderRadius: '0 !important',
                    px: 1.5,
                    textTransform: 'none',
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                    '&.Mui-selected': {
                      bgcolor: 'transparent',
                      color: 'text.primary',
                      boxShadow: `inset 0 -2px 0 ${theme.palette.text.primary}`,
                    },
                    '&.Mui-selected:hover': { bgcolor: 'action.hover' },
                  },
                })}
              >
                <ToggleButton value="simple">Simple</ToggleButton>
                <ToggleButton value="advanced">Advanced</ToggleButton>
              </ToggleButtonGroup>
              {workflow && <StatusChip status={workflow.run.status} />}
            </Stack>
            {visibleError && (
              <Alert
                severity="error"
                action={
                  <Button
                    onClick={() => {
                      setError(null);
                      setPollError(null);
                      setResourceErrors({});
                    }}
                  >
                    Dismiss
                  </Button>
                }
              >
                {visibleError.message}
              </Alert>
            )}
            {unavailableRunId && (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" onClick={reset}>
                    Start a new Goal
                  </Button>
                }
              >
                This Goal isn’t available in the signed-in workspace. It may belong to another
                account, or the link may be outdated.
              </Alert>
            )}
            {capabilityConfigured && !unavailableRunId && (!workflow || capabilityWork) && (
              <CapabilityWorkPanel
                client={client}
                workflow={workflow}
                onWorkflow={acceptCapabilityWorkflow}
                authScopeKey={authScopeKey}
                ownerUserId={ownerUserId}
                busy={busy}
              />
            )}
            {capabilityWork && !capabilityConfigured && (
              <Alert severity="info">Capability work is not configured. Existing outputs remain available; no new processing can be started.</Alert>
            )}
            {!workflow && !unavailableRunId && (
              <RequestComposer
                advanced={advanced}
                busy={busy}
                request={request}
                onRequestChange={(event) => setRequest(event.target.value)}
                onStart={start}
              />
            )}
            {workflow && (
              <>
                <Box>
                  <Stack direction="row" justifyContent="space-between" gap={2}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ overflowWrap: 'anywhere', minWidth: 0 }}
                    >
                      Run {workflow.run.id} · durable row version {workflow.run.rowVersion}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {progress.completed}/{progress.total} stages settled
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={progress.total ? (progress.completed / progress.total) * 100 : 0}
                  />
                </Box>
                <GoalWorkflowOutputs
                  client={client}
                  runId={busy ? null : workflow.run.id}
                  rowVersion={workflow.run.rowVersion}
                  refreshKey={goalWorkflowViewRefreshKey(workflow)}
                  ownerUserId={ownerUserId}
                  authScopeKey={authScopeKey}
                  selectionEpoch={viewRequestEpoch.current}
                />
                {!advanced && !capabilityWork && (
                  <Stack spacing={2.5} aria-label="Simple workflow conversation">
                    <ConversationMessage
                      user
                      copyValue={originalRequestLabel}
                      copyLabel="Copy request"
                    >
                      <Typography variant="body2">
                        {originalRequestLabel ||
                          'Original request unavailable for this legacy run.'}
                      </Typography>
                    </ConversationMessage>
                    <CurrentStageMessage workflow={workflow} />
                    {scopeArtifact && (
                      <ConversationMessage
                        copyValue={scopeSummaryCopy(scopeArtifact)}
                        copyLabel="Copy scope summary"
                      >
                        <ScopeSummary artifact={scopeArtifact} />
                      </ConversationMessage>
                    )}
                    {approval?.kind === 'scope' && (
                      <ApprovalCard
                        approval={approval}
                        artifact={approvalArtifact}
                        busy={busy}
                        onApprove={approve}
                        onRevise={revise}
                      />
                    )}
                    {planArtifact && (
                      <ConversationMessage
                        copyValue={planSummaryCopy(planArtifact)}
                        copyLabel="Copy plan summary"
                      >
                        <PlanSummary artifact={planArtifact} />
                      </ConversationMessage>
                    )}
                    {approval?.kind === 'plan' && (
                      <ApprovalCard
                        approval={approval}
                        artifact={approvalArtifact}
                        busy={busy}
                        onApprove={approve}
                        onRevise={revise}
                      />
                    )}
                    {workflow.run.evidenceReadiness === 'ready_with_gaps' && (
                      <Alert severity="warning">
                        Useful output is delivered with explicit evidence gaps and cannot claim
                        launch-ready.
                      </Alert>
                    )}
                    {workflow.run.status === 'blocked' && (
                      <Alert severity="error">
                        This run is blocked by essential legal or safety evidence. No launch-ready
                        artifact was claimed.
                      </Alert>
                    )}
                    <FinalArtifact
                      key={workflow.run.finalArtifact?.artifactId || workflow.run.id}
                      markdown={finalMarkdown}
                      artifact={workflow.run.finalArtifact}
                      runId={workflow.run.id}
                      onDownload={download}
                    />
                  </Stack>
                )}
                {advanced && !capabilityWork && (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' },
                      gap: 2,
                    }}
                  >
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <ScopeSummary artifact={scopeArtifact} advanced />
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <EvidencePanel
                        scopeArtifact={scopeArtifact}
                        researchArtifact={researchArtifact}
                      />
                    </Paper>
                    {planArtifact && (
                      <Paper variant="outlined" sx={{ p: 3 }}>
                        <PlanSummary artifact={planArtifact} advanced />
                      </Paper>
                    )}
                    {planArtifact && (
                      <Paper variant="outlined" sx={{ p: 3 }}>
                        <ResourceBoundaries planArtifact={planArtifact} />
                      </Paper>
                    )}
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <StageDag workflow={workflow} />
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <ApprovalHistory approvals={workflow.approvals} />
                    </Paper>
                  </Box>
                )}
                {advanced && !capabilityWork && approval && (
                  <ApprovalCard
                    approval={approval}
                    artifact={approvalArtifact}
                    busy={busy}
                    onApprove={approve}
                    onRevise={revise}
                    advanced
                  />
                )}
                {advanced && !capabilityWork && (
                  <FinalArtifact
                    key={workflow.run.finalArtifact?.artifactId || workflow.run.id}
                    wide
                    markdown={finalMarkdown}
                    artifact={workflow.run.finalArtifact}
                    runId={workflow.run.id}
                    onDownload={download}
                  />
                )}
              </>
            )}
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}

export function OrqalyV2Surface({
  client,
  ownerUserId = null,
  authScopeKey = null,
  embedded = false,
  initialSection = null,
  showSectionNav = true,
  showAssistantThreadRail = true,
  routeSearch,
  initialDraft = null,
  onDraftConsumed = null,
  onNavigateGoal = null,
}) {
  const initialParams = new URLSearchParams(window.location.search);
  const requestedRun = initialParams.get('run');
  const requestedSection = initialParams.get('section');
  const [section, setSection] = useState(
    requestedRun || requestedSection === 'goals' ? 'goals' : 'assistant'
  );
  const activeSection = initialSection || section;

  const openSection = (value) => {
    setSection(value);
    const params = new URLSearchParams();
    if (value === 'goals') params.set('section', 'goals');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`
    );
  };
  const openGoal = (runId) => {
    if (onNavigateGoal) {
      onNavigateGoal(runId);
      return;
    }
    window.history.replaceState(window.history.state, '', workflowRunLocation(runId, true));
    setSection('goals');
  };

  return (
    <Container
      maxWidth="xl"
      sx={{ py: embedded ? 0 : { xs: 2, md: 3 }, minHeight: embedded ? 'auto' : '100vh' }}
    >
      <Stack spacing={embedded ? 2 : 3}>
        {!embedded && (
          <Stack
            component="header"
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
            gap={2}
          >
            <Typography variant="h5">Orqaly</Typography>
            <Stack direction="row" alignItems="center" gap={1}>
              <UserButton />
            </Stack>
          </Stack>
        )}
        {showSectionNav && (
          <Stack component="nav" direction="row" aria-label="Assistant sections" spacing={0.5}>
            <Button
              color="inherit"
              variant={activeSection === 'assistant' ? 'contained' : 'text'}
              onClick={() => openSection('assistant')}
            >
              Assistant
            </Button>
            <Button
              color="inherit"
              variant={activeSection === 'goals' ? 'contained' : 'text'}
              onClick={() => openSection('goals')}
            >
              Goals
            </Button>
          </Stack>
        )}
        {showSectionNav && <Divider />}
        {activeSection === 'assistant' ? (
          <AssistantSurface
            client={client}
            onOpenGoal={openGoal}
            showThreadRail={showAssistantThreadRail}
            routeSearch={routeSearch}
            initialDraft={initialDraft}
            onDraftConsumed={onDraftConsumed}
          />
        ) : (
          <WorkflowV2Surface
            client={client}
            ownerUserId={ownerUserId}
            authScopeKey={authScopeKey}
            embedded
            routeSearch={routeSearch}
            initialDraft={initialDraft}
            onDraftConsumed={onDraftConsumed}
          />
        )}
      </Stack>
    </Container>
  );
}

export default function WorkflowV2({
  embedded = false,
  initialSection = null,
  showSectionNav = true,
  showAssistantThreadRail = true,
  routeSearch,
  initialDraft = null,
  onDraftConsumed = null,
  onNavigateGoal = null,
}) {
  const { isLoaded, isSignedIn, getToken, userId, sessionId } = useAuth();
  const theme = useTheme();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);

  if (!isLoaded) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: embedded ? 240 : '100vh' }}>
        <CircularProgress aria-label="Loading authentication" />
      </Box>
    );
  }
  if (!isSignedIn) {
    if (embedded) return <Navigate to="/login" replace />;
    return (
      <Box sx={workflowLoginShellSx(theme)}>
        <Stack
          component="section"
          justifyContent="space-between"
          spacing={4}
          sx={{
            p: { xs: 3, sm: 5, md: 7 },
            borderRight: { md: '1px solid' },
            borderColor: 'divider',
          }}
        >
          <Typography variant="overline">Orqaly × AxWise</Typography>
          <Box>
            <Typography variant="h3" component="h1" sx={{ maxWidth: 520 }}>
              Start with a conversation. Move durable work into a Goal.
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 480 }}>
              Sign in to use Assistant, revisit grounded answers, and resume durable Goals.
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Orqaly routes the work. AxWise executes grounded cognition.
          </Typography>
        </Stack>
        <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4 } }}>
          <SignIn routing="hash" />
        </Box>
      </Box>
    );
  }
  return (
    <OrqalyV2Surface
      client={client}
      ownerUserId={userId}
      authScopeKey={userId && sessionId ? `${userId}:${sessionId}` : null}
      embedded={embedded}
      initialSection={initialSection}
      showSectionNav={showSectionNav}
      showAssistantThreadRail={showAssistantThreadRail}
      routeSearch={routeSearch}
      initialDraft={initialDraft}
      onDraftConsumed={onDraftConsumed}
      onNavigateGoal={onNavigateGoal}
    />
  );
}
