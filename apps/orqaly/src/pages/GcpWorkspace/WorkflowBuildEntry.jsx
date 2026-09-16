import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useWorkflowBuilds } from './useWorkflowBuilds.js';
import { WorkflowBuildCard } from './WorkflowBuildCard.jsx';
import { normalizeDelegatedAgents } from './workspaceViewModel.js';
import { containsSolutionBuildSecret } from '../../../shared/workflow-v2/solution-build-secrets.js';

export function WorkflowBuildEntry(props) {
  // Reset the entire request scope before rendering a different client/task.
  const [identity, setIdentity] = useState({ client: props.client, version: 0 });
  if (identity.client !== props.client)
    setIdentity({ client: props.client, version: identity.version + 1 });
  return props.client?.createSolutionBuildRequest ? (
    <ConnectedBuildEntry
      key={JSON.stringify([identity.version, props.runId, props.agentId, props.taskLabel])}
      {...props}
    />
  ) : null;
}

function ConnectedBuildEntry({
  client,
  runId,
  agentId,
  taskLabel = 'This task',
  showBuilds = true,
  onOpenWorkflow,
  onOpenBuild,
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState(() =>
    taskLabel === 'This task' ? '' : taskLabel.slice(0, 4000)
  );
  const [created, setCreated] = useState([]);
  const list = useWorkflowBuilds(client, { runId, enabled: showBuilds });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [needsAgent, setNeedsAgent] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(agentId || '');
  const pending = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hasSecret = containsSolutionBuildSecret(instruction);
  const saved = new Map(created.map((build) => [build.id, build]));
  for (const build of list.builds) {
    if (!showBuilds && !saved.has(build.id)) continue;
    if (!saved.has(build.id) || build.rowVersion >= saved.get(build.id).rowVersion)
      saved.set(build.id, build);
  }
  async function create(event) {
    event.preventDefault();
    if (busy || hasSecret || !instruction.trim() || (needsAgent && !selectedAgent)) return;
    const body = {
      runId,
      instruction: instruction.trim(),
      ...(selectedAgent ? { agentId: selectedAgent } : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      const response = await client.createSolutionBuildRequest(body, pending.current.key);
      if (!mounted.current) return;
      const build = response.buildRequest;
      if (
        !build?.id ||
        build.runId !== runId ||
        !Number.isInteger(build.rowVersion) ||
        (selectedAgent && build.agentId !== selectedAgent)
      )
        throw new Error(
          'The server did not confirm a saved workflow for this task. Retry to check the same request.'
        );
      setCreated((current) => [...current.filter((item) => item.id !== build.id), build]);
      pending.current = null;
      setOpen(false);
      list.refresh();
      onOpenBuild?.(build.id);
    } catch (value) {
      if (!mounted.current) return;
      setError(
        value.message || 'The request could not be confirmed. Retry to check the same request.'
      );
      if (value.code === 'BUILD_AGENT_REQUIRED') {
        setNeedsAgent(true);
        try {
          const response = await client.agents({ limit: 100 });
          if (mounted.current)
            setAgents(
              normalizeDelegatedAgents(response).filter((agent) =>
                ['active', 'draft', 'proposed'].includes(agent.status)
              )
            );
        } catch {
          if (mounted.current)
            setError(
              'Your Agent list could not be loaded. Reopen this task from its Agent and try again.'
            );
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Stack gap={1.5} sx={{ minWidth: 0 }}>
      {showBuilds ? (
        [...saved.values()].map((build) => (
          <WorkflowBuildCard
            key={build.id}
            build={build}
            onOpenWorkflow={onOpenWorkflow}
            onOpenBuild={onOpenBuild}
          />
        ))
      ) : created.length ? (
        <Typography variant="body2" role="status">
          Draft request saved with this Agent.{' '}
          <Button
            component={RouterLink}
            to={`/workspace/builds/${encodeURIComponent(created.at(-1).id)}`}
          >
            View draft
          </Button>
        </Typography>
      ) : null}
      {list.error && showBuilds ? (
        <Alert severity="warning" action={<Button onClick={list.refresh}>Reconnect</Button>}>
          Workflow updates are unavailable. Showing only confirmed saved work.
        </Alert>
      ) : null}
      {!open ? (
        <Button variant="outlined" onClick={() => setOpen(true)} sx={{ alignSelf: 'flex-start' }}>
          {saved.size ? 'Prepare another workflow' : 'Turn into workflow'}
        </Button>
      ) : (
        <Box
          component="form"
          onSubmit={create}
          aria-label="Prepare workflow draft"
          sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}
        >
          <Stack gap={1.5}>
            <Typography variant="subtitle2">Prepare a workflow from this task</Typography>
            <TextField
              autoFocus
              required
              multiline
              minRows={2}
              label="What should this workflow do?"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={busy}
              error={hasSecret}
              inputProps={{ maxLength: 4000 }}
              helperText="Draft request copied from your task. Adjust the input and expected result if needed. Never paste passwords or API keys."
            />
            <Typography variant="body2" color="text.secondary">
              Your task and evidence provide context. Building a draft does not deploy it or
              authorize live actions.
            </Typography>
            {needsAgent ? (
              <TextField
                select
                required
                label="Agent for this workflow"
                value={selectedAgent}
                disabled={busy}
                onChange={(event) => setSelectedAgent(event.target.value)}
                helperText={
                  agents.length
                    ? 'Your selected Agent will be verified before preparing the draft.'
                    : 'No available Agent found. Open this task from an Agent and try again.'
                }
              >
                {agents.map((agent) => (
                  <MenuItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Stack direction="row" gap={1}>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  busy || hasSecret || !instruction.trim() || (needsAgent && !selectedAgent)
                }
              >
                {busy ? 'Saving draft request…' : 'Build draft'}
              </Button>
              <Button disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
