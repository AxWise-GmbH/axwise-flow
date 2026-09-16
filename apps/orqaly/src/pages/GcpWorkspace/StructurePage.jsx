import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import {
  DataBoundary,
  EmptyState,
  FeatureStatusNotice,
  MetricGrid,
  PageLink,
  SectionCard,
  WorkspacePage,
} from './WorkspacePrimitives.jsx';
import { useWorkspaceData } from './useWorkspaceData.js';
import { agentName, humanize, workspaceName } from './workspaceViewModel.js';

const WORKSPACE_STATUS = Object.freeze({
  available: Object.freeze([
    'Your sign-in is linked to your personal Orqanix workspace.',
    'Live workspace readiness, agent catalogue, and capability coverage.',
  ]),
  remaining: Object.freeze([
    'App-owned units, memberships, groups, and role controls without Clerk Organizations.',
    'Workspace management actions and cross-device preference synchronization.',
  ]),
});

export default function StructurePage() {
  const state = useWorkspaceData({ workspace: true });
  const { workspace } = state;
  const activeAgents = Number.isFinite(workspace.activeAgentCount)
    ? workspace.activeAgentCount
    : workspace.agents.filter((agent) => agent.status === 'active').length;

  return (
    <WorkspacePage
      title="Workspace"
      description="Your app-owned personal workspace for agents and durable work."
      actions={<PageLink to="/agent-hub">Open agents</PageLink>}
    >
      <FeatureStatusNotice {...WORKSPACE_STATUS} />
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <Alert severity="info" variant="outlined">
          This Preview uses a personal Clerk account, not paid Clerk Organizations. Orqanix keeps
          workspace membership and domain data in its own GCP tenant boundary.
        </Alert>

        <MetricGrid
          items={[
            { label: 'Workspace', value: workspace.tenantBound ? 'Ready' : 'Pending' },
            {
              label: 'Agents',
              value: Number.isFinite(workspace.agentCount)
                ? workspace.agentCount
                : workspace.agents.length,
            },
            { label: 'Active agents', value: activeAgents },
            {
              label: 'Capabilities',
              value: Number.isFinite(workspace.capabilityCount)
                ? workspace.capabilityCount
                : workspace.capabilities.length,
            },
            { label: 'Access model', value: 'Personal' },
          ]}
        />

        <SectionCard
          title={workspaceName(workspace)}
          description="Agents available inside this workspace."
        >
          {workspace.agents.length ? (
            <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {workspace.agents.map((agent, index) => (
                <Box
                  component="li"
                  key={agent.id || `${agentName(agent, index)}-${index}`}
                  sx={{ pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Typography variant="subtitle2">{agentName(agent, index)}</Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={humanize(agent.status || 'available')}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {agent.capabilities?.length
                      ? agent.capabilities.map(humanize).join(' · ')
                      : 'No capabilities have been published for this agent yet.'}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <EmptyState
              title="No agents are listed"
              body="The personal workspace is ready, but its agent catalogue has not been populated."
              action={<PageLink to="/agent-hub">Open Agents</PageLink>}
            />
          )}
        </SectionCard>
      </DataBoundary>
    </WorkspacePage>
  );
}
