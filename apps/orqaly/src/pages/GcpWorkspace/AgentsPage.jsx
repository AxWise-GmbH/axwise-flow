import { useAuth } from '@clerk/react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';
import { compactTaskTitle } from '../WorkflowV2/task-presentation.js';
import { AgentProfileDialog } from './AgentProfileDialog.jsx';
import { AgentRuntimeArchitecture } from './AgentRuntimeArchitecture.jsx';
import { useAgentRuntimeStatus } from './useAgentRuntimeStatus.js';
import {
  DataBoundary,
  EmptyState,
  FeatureStatusNotice,
  PageLink,
  SectionCard,
  StatusChip,
  WorkspacePage,
} from './WorkspacePrimitives.jsx';
import { useWorkspaceData } from './useWorkspaceData.js';
import { agentName, formatWhen, humanize } from './workspaceViewModel.js';

const ASSIGNABLE_AGENT_STATUSES = new Set(['active', 'draft', 'proposed']);

const CAPABILITY_LABELS = Object.freeze({
  research: 'Research',
  planning: 'Planning',
  artifactProduction: 'Artifact production',
  approvalGates: 'Approval gates',
  externalActions: 'External actions',
});

const AGENTS_STATUS = Object.freeze({
  available: Object.freeze([
    'Create a named persistent Agent independently of a Goal, then edit its versioned profile and visual identity.',
    'Pause blocks new assignments; active Goals keep their own status and scope or plan approval controls. Resume makes the Agent assignable again.',
    'Internal records can use exact approval and self-hosted n8n. This does not enable external connectors or perform the work described in a document.',
  ]),
  remaining: Object.freeze([
    'Enable each external connector only after its exact permission, credential, approval and reconciliation tests pass.',
    'Add uploaded logo files; this release supports controlled icons, emoji and colors.',
  ]),
});

function contractLabel(contract, fallback = 'Not reported') {
  if (typeof contract === 'string' && contract.trim()) return humanize(contract);
  if (!contract || typeof contract !== 'object') return fallback;
  return (
    contract.label ||
    contract.name ||
    (contract.kind ? humanize(contract.kind) : null) ||
    (contract.provider ? humanize(contract.provider) : null) ||
    fallback
  );
}

function personaLabel(persona) {
  const role = contractLabel(persona);
  const provider = persona?.provider
    ? persona.provider === 'axwise'
      ? 'Reasoning service'
      : humanize(persona.provider)
    : null;
  const status =
    persona?.status === 'legacy_unverified'
      ? 'Legacy metadata — runtime binding was not recorded or verified'
      : persona?.status
        ? humanize(persona.status)
        : null;
  return [role, provider, persona?.version, status].filter(Boolean).join(' · ');
}

function isolationLabel(runtime) {
  if (!runtime?.isolation) return 'Not reported';
  return runtime.isolation === 'tenant_user' ? 'Tenant + user' : humanize(runtime.isolation);
}

function enabledCapabilities(capabilities = {}) {
  return Object.entries(capabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => CAPABILITY_LABELS[key] || humanize(key));
}

function Detail({ label, children }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.25 }}>
        {children}
      </Typography>
    </Box>
  );
}

function DelegatedAgentCard({ agent, busy, onLifecycle }) {
  const capabilityLabels = enabledCapabilities(agent.capabilities);
  const persistent = agent.lifetime === 'persistent';
  const legacyUnverified = agent.executorPersona?.status === 'legacy_unverified';
  const canPause = agent.status === 'active';
  const canResume = agent.status === 'paused';
  const canAcceptWork = ASSIGNABLE_AGENT_STATUSES.has(agent.status);
  const runId = agent.originatingRunId || agent.runId;

  return (
    <Box
      component="li"
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2.25 }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.25}>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
          <AgentAvatar avatar={agent.avatar} name={agent.name} size={46} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" variant="subtitle1" fontWeight={700}>
              {agent.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {agent.role || 'Task executor'}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.75}>
          <Chip
            size="small"
            color={persistent ? 'primary' : 'default'}
            variant="outlined"
            label={persistent ? 'Persistent' : 'Temporary'}
          />
          <StatusChip status={agent.status} />
        </Stack>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        {agent.description ||
          (agent.task ? compactTaskTitle(agent.task) : null) ||
          'A reusable Agent identity. Add a purpose and working instructions to make its responsibilities explicit.'}
      </Typography>

      {capabilityLabels.length ? (
        <Box sx={{ mt: 1.75 }}>
          {legacyUnverified ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 0.75 }}
            >
              Historically declared capabilities — runtime binding was not recorded or verified.
            </Typography>
          ) : null}
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {capabilityLabels.map((capability) => (
              <Chip
                key={capability}
                size="small"
                variant={legacyUnverified ? 'outlined' : 'filled'}
                label={legacyUnverified ? `Declared · ${capability}` : capability}
              />
            ))}
          </Stack>
        </Box>
      ) : null}

      <TaskDisclosure title="Profile & permissions">
        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            gap: 1.5,
            m: 0,
            mt: 2,
          }}
        >
          <Detail label="Profile snapshot">
            {agent.profileVersion ? `Version ${agent.profileVersion}` : 'Versioned on first edit'}
          </Detail>
          <Detail label="Runs">{agent.runCount || (runId ? 1 : 0)}</Detail>
          <Detail label="Created from">{humanize(agent.createdFrom || 'manual')}</Detail>
          <Detail label="Data scope">
            {agent.runtime?.isolation ? isolationLabel(agent.runtime) : 'User + Agent'}
          </Detail>
          {agent.executorPersona && Object.keys(agent.executorPersona).length ? (
            <Detail label="Executor persona contract">{personaLabel(agent.executorPersona)}</Detail>
          ) : null}
          <Detail label="External effects">
            {agent.toolExecution?.status === 'configured'
              ? 'Configured connections; each action requires its own permission and approval'
              : 'Gated until a reviewed connector is enabled'}
          </Detail>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {persistent
            ? 'Reusable profile; long-term memory not connected.'
            : 'Temporary profile; task-end cleanup is not connected yet.'}
        </Typography>
      </TaskDisclosure>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        gap={1.5}
        sx={{ mt: 2 }}
      >
        <Typography variant="caption" color="text.secondary">
          {agent.runCount || (runId ? 1 : 0)} recorded tasks ·{' '}
          {agent.updatedAt ? `Updated ${formatWhen(agent.updatedAt)}` : 'Linked to this workspace'}
        </Typography>
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {(canPause || canResume) && (
            <Button
              size="small"
              color="inherit"
              disabled={busy}
              startIcon={canResume ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
              onClick={() => onLifecycle(agent, canResume ? 'resume' : 'pause')}
            >
              {canResume ? 'Resume assignments' : 'Pause new assignments'}
            </Button>
          )}
          {canAcceptWork ? (
            <Button
              component={RouterLink}
              to={`/assistant?${new URLSearchParams({ agent: agent.id })}`}
              size="small"
              variant="outlined"
            >
              Give work
            </Button>
          ) : null}
          <Button
            component={RouterLink}
            to={`/agent-hub/${encodeURIComponent(agent.id)}`}
            size="small"
            variant="contained"
          >
            Open
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

export default function AgentsPage() {
  const state = useWorkspaceData({ workspace: true });
  const { getToken } = useAuth();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);
  const { workspace } = state;
  const delegatedAgents = state.delegatedAgents || [];
  const planningSpecialists = workspace.agents || [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const runtimeState = useAgentRuntimeStatus(client);

  const saveNewAgent = async (profile) => {
    setMutationBusy(true);
    setMutationError(null);
    try {
      await client.createAgent({
        version: 'orqaly_agent_create_request_v1',
        agentKind: 'persistent',
        profile,
        expiresAt: null,
        idempotencyKey: `agent-create-${crypto.randomUUID()}`,
      });
      setDialogOpen(false);
      state.refresh();
    } catch (error) {
      setMutationError(error);
    } finally {
      setMutationBusy(false);
    }
  };

  const changeLifecycle = async (agent, action) => {
    setMutationBusy(true);
    setMutationError(null);
    try {
      await client.changeAgentLifecycle(agent.id, agent.version, {
        version: 'orqaly_agent_lifecycle_request_v1',
        action,
        reason: `${action} requested from the Agent directory`,
        idempotencyKey: `agent-${action}-${crypto.randomUUID()}`,
      });
      state.refresh();
    } catch (error) {
      setMutationError(error);
    } finally {
      setMutationBusy(false);
    }
  };
  const active = delegatedAgents.filter((agent) => agent.status === 'active').length;
  const persistent = delegatedAgents.filter((agent) => agent.lifetime === 'persistent').length;

  return (
    <WorkspacePage
      title="Agents"
      description="Choose an Agent, give it work, and review its tasks. Each assignment has its own context and approvals."
      actions={
        <>
          <PageLink to="/assistant">Open Assistant</PageLink>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => setDialogOpen(true)}
          >
            Create Agent
          </Button>
        </>
      }
    >
      {mutationError && !dialogOpen ? (
        <Alert severity="error" onClose={() => setMutationError(null)}>
          {mutationError.message || 'The Agent could not be changed.'}
        </Alert>
      ) : null}
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <SectionCard
          title="Your Agents"
          description={`${active} accepting assignments · ${persistent} reusable profiles. Pausing assignments does not stop active tasks.`}
        >
          {delegatedAgents.length ? (
            <Box
              component="ul"
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
                gap: 1.5,
                listStyle: 'none',
                p: 0,
                m: 0,
              }}
            >
              {delegatedAgents.map((agent) => (
                <DelegatedAgentCard
                  key={agent.id}
                  agent={agent}
                  busy={mutationBusy}
                  onLifecycle={changeLifecycle}
                />
              ))}
            </Box>
          ) : (
            <EmptyState
              title="Create your first Agent"
              body="Give it a name, role, visual identity and working instructions. You can then select the same Agent whenever you delegate work in Assistant."
              action={<Button onClick={() => setDialogOpen(true)}>Create Agent</Button>}
            />
          )}
        </SectionCard>

        <TaskDisclosure title="Technical details · n8n & planning specialists">
          <FeatureStatusNotice {...AGENTS_STATUS} />
          <AgentRuntimeArchitecture
            runtime={runtimeState.runtime}
            loading={runtimeState.loading}
            error={runtimeState.error}
            onRetry={runtimeState.retry}
          />
          <SectionCard
            title="Internal planning specialists"
            description="The planner selects these workers inside a Goal. They are implementation resources, not your persistent digital workers."
          >
            {planningSpecialists.length ? (
              <Box
                component="ul"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                  gap: 1.5,
                  listStyle: 'none',
                  p: 0,
                  m: 0,
                }}
              >
                {planningSpecialists.map((agent, index) => (
                  <Box
                    component="li"
                    key={agent.id || `${agentName(agent, index)}-${index}`}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}
                  >
                    <Stack direction="row" justifyContent="space-between" gap={1}>
                      <Typography component="h3" variant="subtitle1">
                        {agentName(agent, index)}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={humanize(agent.status || 'ready')}
                      />
                    </Stack>
                    <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1.5 }}>
                      {(agent.capabilities || []).map((capability) => (
                        <Chip key={capability} size="small" label={humanize(capability)} />
                      ))}
                      {!agent.capabilities?.length ? (
                        <Typography variant="body2" color="text.secondary">
                          General planning specialist
                        </Typography>
                      ) : null}
                    </Stack>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 1.5 }}
                    >
                      {(agent.toolIds || []).length} assigned tool
                      {(agent.toolIds || []).length === 1 ? '' : 's'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <EmptyState
                title="No planning specialists are available"
                body="The default specialist catalogue is created during workspace bootstrap. Retry if the workspace was just provisioned."
              />
            )}
          </SectionCard>
        </TaskDisclosure>
      </DataBoundary>
      {dialogOpen ? (
        <AgentProfileDialog
          open
          busy={mutationBusy}
          error={mutationError}
          onClose={() => {
            setDialogOpen(false);
            setMutationError(null);
          }}
          onSave={saveNewAgent}
        />
      ) : null}
    </WorkspacePage>
  );
}
