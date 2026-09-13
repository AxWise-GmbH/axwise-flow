import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { createWorkflowV2Client } from '../../workflow-v2/api.js';
import { useWorkflowBuilds } from './useWorkflowBuilds.js';
import { WorkflowBuildCard } from './WorkflowBuildCard.jsx';
import {
  DataBoundary,
  EmptyState,
  FeatureStatusNotice,
  MetricGrid,
  PageLink,
  RecordList,
  SectionCard,
  WorkspacePage,
} from './WorkspacePrimitives.jsx';
import { useWorkspaceData } from './useWorkspaceData.js';
import { attentionItems, overviewMetrics } from './workspaceViewModel.js';

const NOTIFICATIONS_STATUS = Object.freeze({
  available: Object.freeze([
    'See the live in-app queue for approvals, blocked work, and failed Goals.',
    'Open each notification in the exact Goal that needs review.',
    'Answer durable workflow-build questions from the same saved Build Request.',
  ]),
  remaining: Object.freeze([
    'Add read and unread state, dismissal, and persistent delivery history.',
    'Add notification preferences plus email and push delivery.',
  ]),
});

export default function NotificationsPage() {
  const { getToken } = useAuth();
  const client = useMemo(() => createWorkflowV2Client(getToken), [getToken]);
  const builds = useWorkflowBuilds(client);
  const needsYou = builds.builds.filter((build) =>
    ['needs_input', 'dependencies'].includes(build.status)
  );
  const state = useWorkspaceData({ overview: true });
  const metrics = overviewMetrics(state.overview);
  const attention = attentionItems(state.overview).map((item) => ({
    ...item,
    actionLabel: 'Review',
  }));
  const blockedOrFailed = attention.filter(
    (item) => item.status === 'blocked' || item.status === 'failed' || item.severity === 'error'
  ).length;

  return (
    <WorkspacePage
      title="Notifications"
      description="Approvals, failures, blocked work, and other events that need your attention."
      actions={<PageLink to="/goals">Open Goals</PageLink>}
    >
      <FeatureStatusNotice {...NOTIFICATIONS_STATUS} />
      <SectionCard
        title="Workflow builds · Needs you"
        description="Answering a question here updates the same build shown in your task and Agent profile."
      >
        <Stack gap={1.5}>
          {builds.error ? (
            <Alert severity="warning" action={<Button onClick={builds.refresh}>Reconnect</Button>}>
              Build notifications could not be refreshed. The last confirmed items remain visible.
            </Alert>
          ) : null}
          {builds.loading ? (
            <Typography color="text.secondary">Checking saved workflow questions…</Typography>
          ) : null}
          {needsYou.map((build) => (
            <WorkflowBuildCard key={build.id} build={build} />
          ))}
          {!builds.loading && !builds.error && !needsYou.length ? (
            <Typography color="text.secondary">
              No workflow-build questions need an answer.
            </Typography>
          ) : null}
        </Stack>
      </SectionCard>
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <MetricGrid
          items={[
            { label: 'Needs attention', value: attention.length },
            { label: 'Awaiting approval', value: metrics.approvals },
            { label: 'Blocked or failed', value: blockedOrFailed },
            { label: 'Active Goals', value: metrics.active },
            { label: 'Delivery', value: 'In app' },
          ]}
        />

        <SectionCard
          title="Attention queue"
          description="Only actionable workspace events appear here."
        >
          <RecordList
            ariaLabel="Workspace notifications"
            items={attention}
            empty={
              <EmptyState
                title="You're caught up"
                body="There are no pending approvals, blocked Goals, or failed runs in this workspace."
              />
            }
          />
        </SectionCard>
      </DataBoundary>
    </WorkspacePage>
  );
}
