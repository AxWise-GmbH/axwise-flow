import { Box, Chip, Stack, Typography } from '@mui/material';
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

const CAPABILITIES_STATUS = Object.freeze({
  available: Object.freeze([
    'Published capability catalogue, agent coverage, and assigned-tool totals.',
    'Goal handoff using the capabilities already assigned to tenant agents.',
  ]),
  remaining: Object.freeze([
    'Personal Catalog installs and provider connection management.',
    'Credential setup, testing, and rotation controls.',
  ]),
});

export default function CapabilitiesPage() {
  const state = useWorkspaceData({ workspace: true });
  const { workspace } = state;
  const capabilities = workspace.capabilities || [];
  const tools = Number.isFinite(workspace.toolCount)
    ? workspace.toolCount
    : new Set(workspace.agents.flatMap((agent) => agent.toolIds || [])).size;

  return (
    <WorkspacePage
      title="Capabilities"
      description="Published agent capabilities and assigned-tool coverage in one GCP-native surface."
      actions={<PageLink to="/goals">Use in a Goal</PageLink>}
    >
      <FeatureStatusNotice {...CAPABILITIES_STATUS} />
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <MetricGrid
          items={[
            { label: 'Capabilities', value: workspace.capabilityCount ?? capabilities.length },
            { label: 'Assigned tools', value: tools },
            { label: 'Agents', value: workspace.agentCount ?? workspace.agents.length },
            { label: 'Credential scope', value: 'Tenant' },
            { label: 'Runtime', value: 'GCP' },
          ]}
        />

        <SectionCard
          title="Available capabilities"
          description="The planner uses this catalogue when selecting an execution team."
        >
          {capabilities.length ? (
            <Box
              component="ul"
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1,
                listStyle: 'none',
                p: 0,
                m: 0,
              }}
            >
              {capabilities.map((capability) => (
                <Stack
                  component="li"
                  key={capability.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  gap={1}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}
                >
                  <Box>
                    <Typography variant="subtitle2">{capability.label}</Typography>
                    {capability.description ? (
                      <Typography variant="body2" color="text.secondary">
                        {capability.description}
                      </Typography>
                    ) : null}
                  </Box>
                  {Number.isFinite(capability.agentCount) ? (
                    <Chip
                      size="small"
                      label={`${capability.agentCount} agent${capability.agentCount === 1 ? '' : 's'}`}
                    />
                  ) : null}
                </Stack>
              ))}
            </Box>
          ) : (
            <EmptyState
              title="No capabilities have been published"
              body="The workspace exists, but its tenant agents do not advertise a capability catalogue yet."
            />
          )}
        </SectionCard>
      </DataBoundary>
    </WorkspacePage>
  );
}
