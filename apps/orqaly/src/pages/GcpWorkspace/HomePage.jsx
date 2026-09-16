import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import HomeHero from './HomeHero.jsx';
import {
  DataBoundary,
  EmptyState,
  MetricGrid,
  PageLink,
  RecordList,
  SectionCard,
  WorkspacePage,
} from './WorkspacePrimitives.jsx';
import { useWorkspaceData } from './useWorkspaceData.js';
import { activityItems, overviewMetrics, workspaceName } from './workspaceViewModel.js';

export default function HomePage() {
  const state = useWorkspaceData({ overview: true, workspace: true });
  const metrics = overviewMetrics(state.overview);
  const recent = activityItems(state.overview, 6);

  return (
    <Box sx={{ bgcolor: '#0A0A0A' }}>
      <HomeHero />
      <Box sx={{ pt: { xs: 8, md: 10 }, pb: { xs: 3, md: 5 } }}>
        <WorkspacePage
          title="Home"
          description="Your current work, approvals, recent outcomes, and personal Orqanix workspace."
          actions={<PageLink to="/assistant">New chat</PageLink>}
        >
          <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
            <MetricGrid
              items={[
                { label: 'Conversations', value: metrics.conversations },
                { label: 'Goals', value: metrics.goals },
                { label: 'Active', value: metrics.active },
                { label: 'Approvals', value: metrics.approvals },
                { label: 'Completed', value: metrics.completed },
              ]}
            />

            <SectionCard
              title={workspaceName(state.workspace)}
              description="Your sign-in and Orqanix account data."
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
                  This workspace is bound to your signed-in account. Goals, agents, approvals, and
                  artifacts stay inside its GCP tenant boundary.
                </Typography>
                <Stack direction="row" gap={1}>
                  <Button component={RouterLink} to="/goals" size="small" variant="outlined">
                    Open Goals
                  </Button>
                  <Button component={RouterLink} to="/workspace" size="small" variant="outlined">
                    View workspace
                  </Button>
                </Stack>
              </Stack>
            </SectionCard>

            <SectionCard
              title="Recent activity"
              description="The latest Assistant conversations and durable Goals."
              action={<PageLink to="/history/chats">See history</PageLink>}
            >
              <RecordList
                ariaLabel="Recent workspace activity"
                items={recent}
                empty={
                  <EmptyState
                    title="Nothing has happened yet"
                    body="Start a conversation or create a Goal and the latest activity will appear here."
                    action={<PageLink to="/assistant">Start with Assistant</PageLink>}
                  />
                }
              />
            </SectionCard>
          </DataBoundary>
        </WorkspacePage>
      </Box>
    </Box>
  );
}
