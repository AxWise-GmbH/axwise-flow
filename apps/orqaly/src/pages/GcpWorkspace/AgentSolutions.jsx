import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { SectionCard } from './WorkspacePrimitives.jsx';
import { useWorkflowBuilds } from './useWorkflowBuilds.js';
import { WorkflowBuildCard } from './WorkflowBuildCard.jsx';
import { unduplicatedWorkflowBuilds } from './workflow-discovery.js';

export function AgentSolutions(props) {
  const [identity, setIdentity] = useState({ client: props.client, version: 0 });
  if (identity.client !== props.client)
    setIdentity({ client: props.client, version: identity.version + 1 });
  return <AgentWorkflowList key={`${identity.version}:${props.agent.id}`} {...props} />;
}

function AgentWorkflowList({ agent, client }) {
  const [solutions, setSolutions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const builds = useWorkflowBuilds(client, { agentId: agent.id });
  const refresh = () => {
    setRefreshKey((value) => value + 1);
    builds.refresh();
  };
  useEffect(() => {
    let cancelled = false;
    let timer;
    const read = async () => {
      try {
        const result = await client.agentSolutions(agent.id);
        if (cancelled) return;
        if (!Array.isArray(result.solutions))
          throw new Error('Workflow status could not be verified.');
        setSolutions(result.solutions);
        setLoaded(true);
        setError(null);
      } catch (value) {
        if (!cancelled) setError(value);
      }
      if (!cancelled) timer = setTimeout(read, 15_000);
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [agent.id, client, refreshKey]);
  const drafts = unduplicatedWorkflowBuilds(builds.builds, solutions);
  return (
    <SectionCard
      title="Workflows"
      description="Work prepared with this Agent, from its first draft to a running workflow."
    >
      <Stack gap={2}>
        {error || builds.error ? (
          <Alert severity="warning" action={<Button onClick={refresh}>Reconnect</Button>}>
            Some workflow updates are unavailable. Showing only confirmed saved work.
          </Alert>
        ) : null}
        {solutions.map((solution) => (
          <WorkflowBuildCard key={solution.id} solution={solution} />
        ))}
        {drafts.map((build) => (
          <WorkflowBuildCard key={build.id} build={build} />
        ))}
        {!loaded && !error ? (
          <Typography role="status" color="text.secondary">
            Loading saved workflows…
          </Typography>
        ) : null}
        {loaded &&
        !error &&
        !builds.error &&
        !builds.loading &&
        !solutions.length &&
        !drafts.length ? (
          <Typography color="text.secondary">
            No workflows yet. Choose “Turn into workflow” on a task below to prepare its first
            draft.
          </Typography>
        ) : null}
        <Button component={RouterLink} to="/workspace/workflows" sx={{ alignSelf: 'flex-start' }}>
          View all workflows
        </Button>
      </Stack>
    </SectionCard>
  );
}
