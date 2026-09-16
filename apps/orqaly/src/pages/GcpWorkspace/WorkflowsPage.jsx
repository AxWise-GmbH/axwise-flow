import { useAuth } from '@clerk/react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import { WorkspacePage, SectionCard } from './WorkspacePrimitives.jsx';
import { WorkflowBuildCard } from './WorkflowBuildCard.jsx';
import { useWorkflowBuilds } from './useWorkflowBuilds.js';
import { unduplicatedWorkflowBuilds } from './workflow-discovery.js';

export function WorkflowsWorkspace(props) {
  const [identity, setIdentity] = useState({ client: props.client, version: 0 });
  if (identity.client !== props.client)
    setIdentity({ client: props.client, version: identity.version + 1 });
  return <WorkflowList key={identity.version} {...props} />;
}

function WorkflowList({ client }) {
  const builds = useWorkflowBuilds(client);
  const [solutions, setSolutions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const read = async () => {
      try {
        const response = await client.solutions();
        if (cancelled) return;
        if (!Array.isArray(response.solutions))
          throw new Error('Workflow status could not be verified.');
        setSolutions(response.solutions);
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
  }, [client, refreshKey]);
  const refresh = () => {
    setRefreshKey((value) => value + 1);
    builds.refresh();
  };
  const unlinked = unduplicatedWorkflowBuilds(builds.builds, solutions);
  const drafts = unlinked.filter((build) => !build.solutionId);
  const savedBuilds = unlinked.filter((build) => build.solutionId);
  const empty =
    loaded && !builds.loading && !error && !builds.error && !solutions.length && !unlinked.length;
  return (
    <WorkspacePage
      title="Workflows"
      description="Your saved workflows and drafts. Open one to see its canvas, run it, review results or ask for a change."
      actions={
        <Button component={RouterLink} to="/assistant" variant="contained">
          Start in chat
        </Button>
      }
    >
      {error || builds.error ? (
        <Alert severity="warning" action={<Button onClick={refresh}>Reconnect</Button>}>
          Some workflow updates are unavailable. Showing only confirmed saved work.
        </Alert>
      ) : null}
      {(!loaded && !error) || builds.loading ? (
        <Typography role="status" color="text.secondary">
          Loading saved workflows…
        </Typography>
      ) : null}
      {solutions.length || savedBuilds.length ? (
        <SectionCard
          title="Saved workflows"
          description="Runtime status is shown on each workflow. Saving a workflow does not turn it on."
        >
          <Stack gap={2}>
            {solutions.map((solution) => (
              <WorkflowBuildCard key={solution.id} solution={solution} />
            ))}
            {savedBuilds.map((build) => (
              <WorkflowBuildCard key={build.id} build={build} />
            ))}
          </Stack>
        </SectionCard>
      ) : null}
      {drafts.length ? (
        <SectionCard
          title="In preparation"
          description="Continue a draft or answer what it needs. These drafts are not production workflows."
        >
          <Stack gap={2}>
            {drafts.map((build) => (
              <WorkflowBuildCard key={build.id} build={build} />
            ))}
          </Stack>
        </SectionCard>
      ) : null}
      {empty ? (
        <SectionCard title="Your first workflow starts with a task">
          <Typography color="text.secondary">
            Describe the work in chat, then choose “Turn into workflow” on its task. You review the
            draft before any deployment or live action.
          </Typography>
        </SectionCard>
      ) : null}
    </WorkspacePage>
  );
}

export default function WorkflowsPage() {
  const { getToken, userId, orgId } = useAuth();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);
  return <WorkflowsWorkspace key={JSON.stringify([userId, orgId])} client={client} />;
}
