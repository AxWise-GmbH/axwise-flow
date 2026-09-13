import { useAuth } from '@clerk/react';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { AgentSolutions } from './AgentSolutions.jsx';
import { WorkflowBuildEntry } from './WorkflowBuildEntry.jsx';
import { TaskDisclosure } from '../WorkflowV2/TaskDisclosure.jsx';
import { compactTaskTitle, taskStatusLabel } from '../WorkflowV2/task-presentation.js';
import { AgentProfileDialog } from './AgentProfileDialog.jsx';
import { AgentRuntimeArchitecture } from './AgentRuntimeArchitecture.jsx';
import { useAgentRuntimeStatus } from './useAgentRuntimeStatus.js';
import { EmptyState, SectionCard, StatusChip, WorkspacePage } from './WorkspacePrimitives.jsx';
import {
  formatWhen,
  humanize,
  normalizeDelegatedAgents,
  shortReference,
} from './workspaceViewModel.js';

function responseAgent(response) {
  const raw = response?.agent || response?.result?.agent || response;
  return normalizeDelegatedAgents({ agents: raw ? [raw] : [] })[0] || null;
}

function responseRuns(response) {
  const runs = response?.runs || response?.agentRuns || [];
  return Array.isArray(runs) ? runs : [];
}

function Definition({ label, children }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.35, overflowWrap: 'anywhere' }}>
        {children || 'Not set'}
      </Typography>
    </Box>
  );
}

export default function AgentDetailPage() {
  const { agentId } = useParams();
  const { getToken } = useAuth();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);
  const [agent, setAgent] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const runtimeState = useAgentRuntimeStatus(client);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentResponse, runResponse] = await Promise.all([
        client.agent(agentId),
        client.agentRuns(agentId, { limit: 50 }),
      ]);
      setAgent(responseAgent(agentResponse));
      setRuns(responseRuns(runResponse));
    } catch (value) {
      setError(value);
    } finally {
      setLoading(false);
    }
  }, [agentId, client]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProfile = async (profile) => {
    setBusy(true);
    setError(null);
    try {
      const response = await client.updateAgentProfile(agent.id, agent.version, {
        version: 'orqaly_agent_profile_update_request_v1',
        profile,
        idempotencyKey: `agent-profile-${crypto.randomUUID()}`,
      });
      setAgent(responseAgent(response));
      setDialogOpen(false);
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const response = await client.changeAgentLifecycle(agent.id, agent.version, {
        version: 'orqaly_agent_lifecycle_request_v1',
        action,
        reason: `${action} requested from the Agent profile`,
        idempotencyKey: `agent-${action}-${crypto.randomUUID()}`,
      });
      setAgent(responseAgent(response));
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading Agent" />
      </Box>
    );
  }
  if (error && !agent) {
    return (
      <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>
        {error.message || 'Agent could not be loaded.'}
      </Alert>
    );
  }
  if (!agent) {
    return (
      <EmptyState
        title="Agent not found"
        body="This Agent is not available in your workspace."
        action={
          <Button component={RouterLink} to="/agent-hub">
            Back to Agents
          </Button>
        }
      />
    );
  }

  const canResume = agent.status === 'paused';
  const canPause = agent.status === 'active';
  const canAcceptWork = ['active', 'draft', 'proposed'].includes(agent.status);
  const canEditProfile = !['revoked', 'expired', 'archived'].includes(agent.status);

  return (
    <WorkspacePage
      title={agent.name}
      description={
        agent.description || `${agent.role || 'Task executor'} in your personal workspace.`
      }
      actions={
        <>
          <Button component={RouterLink} to="/agent-hub" startIcon={<ArrowBackRoundedIcon />}>
            All Agents
          </Button>
          {canEditProfile ? (
            <Button
              variant="outlined"
              startIcon={<EditRoundedIcon />}
              onClick={() => setDialogOpen(true)}
            >
              Edit profile
            </Button>
          ) : null}
          {canAcceptWork ? (
            <Button
              component={RouterLink}
              to={`/assistant?${new URLSearchParams({ agent: agent.id })}`}
              variant="contained"
            >
              Give work
            </Button>
          ) : null}
        </>
      }
    >
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error.message}
        </Alert>
      ) : null}
      <SectionCard
        title="Identity"
        description={`${agent.lifetime === 'persistent' ? 'Reusable' : 'Temporary'} profile; long-term memory not connected. Each task keeps its own context.`}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          gap={2.25}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <AgentAvatar avatar={agent.avatar} name={agent.name} size={44} />
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="h6">{agent.name}</Typography>
              <StatusChip status={agent.status} />
              <Chip size="small" variant="outlined" label={humanize(agent.lifetime)} />
              {agent.profileVersion ? (
                <Chip size="small" label={`Profile v${agent.profileVersion}`} />
              ) : null}
            </Stack>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {agent.role || 'Task executor'}
            </Typography>
          </Box>
          {canPause || canResume ? (
            <Button
              disabled={busy}
              startIcon={canResume ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
              onClick={() => lifecycle(canResume ? 'resume' : 'pause')}
            >
              {canResume ? 'Resume assignments' : 'Pause new assignments'}
            </Button>
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 1 }}>
          Pausing blocks new assignments. It does not stop tasks already running.
        </Typography>
        <TaskDisclosure title="Profile, instructions & memory">
          <Box
            component="dl"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            <Definition label="Agent ID">{agent.id}</Definition>
            <Definition label="Created from">{humanize(agent.createdFrom)}</Definition>
            <Definition label="Last updated">{formatWhen(agent.updatedAt)}</Definition>
            <Definition label="Profile hash">
              {agent.profileHash ? shortReference(agent.profileHash) : null}
            </Definition>
            <Definition label="Memory policy">
              Current chat and task only; long-term memory not connected
            </Definition>
            <Definition label="Data scope">Tenant + user; shared private runtime</Definition>
          </Box>
          <Typography variant="subtitle2">Working instructions</Typography>
          <Typography variant="caption" color="text.secondary">
            Profile edits apply to new assignments; existing tasks keep their approved profile
            version.
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {agent.instructions ||
              'No custom instructions yet. Edit the profile to define how this Agent should approach its work.'}
          </Typography>
        </TaskDisclosure>
      </SectionCard>

      <AgentSolutions key={agent.id} agent={agent} client={client} />

      <SectionCard
        title="Tasks & results"
        description="Each assignment has its own context, approvals, execution state and evidence trail."
      >
        {runs.length ? (
          <Stack
            component="ul"
            sx={{ listStyle: 'none', m: 0, p: 0 }}
            divider={<Divider flexItem />}
          >
            {runs.map((run) => {
              const id = run.id || run.runId || run.run_id;
              const workflowRunId = run.workflowRunId || run.workflow_run_id || null;
              const title =
                run.title ||
                run.sourceTaskTitle ||
                run.source_task_id ||
                `Run ${shortReference(id)}`;
              const status = run.state || run.status || 'unknown';
              const updatedAt = run.updatedAt || run.updated_at || run.createdAt || run.created_at;
              return (
                <Stack
                  component="li"
                  key={id}
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  gap={1}
                  sx={{ py: 1.5 }}
                >
                  <Box>
                    <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                      <Typography variant="subtitle2" title={title}>
                        {compactTaskTitle(title)}
                      </Typography>
                      <Chip size="small" variant="outlined" label={taskStatusLabel(status)} />
                    </Stack>
                    {updatedAt ? (
                      <Typography variant="caption" color="text.secondary">
                        {formatWhen(updatedAt)}
                      </Typography>
                    ) : null}
                    {workflowRunId && canAcceptWork ? (
                      <Box sx={{ mt: 1.5 }}>
                        <WorkflowBuildEntry
                          client={client}
                          agentId={agent.id}
                          runId={workflowRunId}
                          taskLabel={title}
                          showBuilds={false}
                        />
                      </Box>
                    ) : null}
                  </Box>
                  {workflowRunId ? (
                    <Button
                      component={RouterLink}
                      to={`/goals?run=${encodeURIComponent(workflowRunId)}`}
                      size="small"
                    >
                      Review task
                    </Button>
                  ) : null}
                </Stack>
              );
            })}
          </Stack>
        ) : (
          <EmptyState
            title="No runs yet"
            body="Give this Agent work in Assistant. The task will appear here as a separate run without changing the Agent identity."
            action={
              canAcceptWork ? (
                <Button
                  component={RouterLink}
                  to={`/assistant?${new URLSearchParams({ agent: agent.id })}`}
                >
                  Give work
                </Button>
              ) : null
            }
          />
        )}
      </SectionCard>

      <TaskDisclosure title="Technical details · n8n execution readiness">
        <Typography variant="body2" color="text.secondary">
          Service configuration is separate from task completion. Inspect a task's execution details
          for its saved action and verified receipt.
        </Typography>
        <AgentRuntimeArchitecture
          runtime={runtimeState.runtime}
          agent={agent}
          latestRun={runs[0] || null}
          loading={runtimeState.loading}
          error={runtimeState.error}
          onRetry={runtimeState.retry}
        />
      </TaskDisclosure>

      {dialogOpen ? (
        <AgentProfileDialog
          open
          agent={agent}
          busy={busy}
          error={error}
          onClose={() => setDialogOpen(false)}
          onSave={updateProfile}
        />
      ) : null}
    </WorkspacePage>
  );
}
