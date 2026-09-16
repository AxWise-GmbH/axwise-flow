import { Button, Stack } from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  DataBoundary,
  EmptyState,
  FeatureStatusNotice,
  RecordList,
  SectionCard,
  WorkspacePage,
} from './WorkspacePrimitives.jsx';
import { useWorkspaceData } from './useWorkspaceData.js';
import {
  humanize,
  resultItems,
  threadHref,
  workflowHref,
  workflowStatus,
  workflowTitle,
  workflowWhen,
} from './workspaceViewModel.js';

const HISTORY_KINDS = new Set(['chats', 'goals', 'results']);
const HISTORY_STATUS = Object.freeze({
  available: Object.freeze([
    'Browse persisted Assistant chats, Goal runs, and completed results on separate routes.',
    'Open each saved record in its source chat or Goal.',
  ]),
  remaining: Object.freeze([
    'Add pagination beyond the current recent 50-record projection.',
    'Add cross-history search and filters.',
  ]),
});

export default function HistoryPage() {
  const { kind: requestedKind = 'chats' } = useParams();
  const kind = HISTORY_KINDS.has(requestedKind) ? requestedKind : 'chats';
  const state = useWorkspaceData({ overview: true });

  const chats = state.overview.threads.map((thread) => ({
    id: thread.id,
    title: thread.title || 'Assistant conversation',
    description: humanize(thread.status || 'conversation'),
    at: thread.updatedAt || thread.updated_at || thread.createdAt || thread.created_at,
    href: threadHref(thread),
    actionLabel: 'Open chat',
  }));
  const goals = state.overview.workflows.map((workflow) => ({
    id: workflow.run.id,
    title: workflowTitle(workflow),
    status: workflowStatus(workflow),
    at: workflowWhen(workflow),
    href: workflowHref(workflow),
    actionLabel: 'Open Goal',
  }));
  const results = resultItems(state.overview).map((workflow) => ({
    id: workflow.run.id,
    title: workflowTitle(workflow),
    status: workflow.run.status,
    at: workflow.run.updatedAt,
    href: workflowHref(workflow),
    actionLabel: 'Open result',
  }));
  const rows = kind === 'goals' ? goals : kind === 'results' ? results : chats;
  const labels = {
    chats: ['Assistant Chats', 'Saved Assistant conversations in this personal workspace.'],
    goals: ['Goal Runs', 'Durable Goal runs across every status.'],
    results: ['Results & Artifacts', 'Completed Goals and their final outcomes.'],
  };

  return (
    <WorkspacePage
      title="History"
      description="Chats, Goals, and results kept by the GCP control plane."
    >
      <FeatureStatusNotice {...HISTORY_STATUS} />
      <Stack
        component="nav"
        aria-label="History sections"
        direction="row"
        flexWrap="wrap"
        gap={0.75}
      >
        {Object.entries(labels).map(([value, [label]]) => (
          <Button
            key={value}
            component={RouterLink}
            to={`/history/${value}`}
            variant={kind === value ? 'contained' : 'text'}
            color="inherit"
            aria-current={kind === value ? 'page' : undefined}
          >
            {label}
          </Button>
        ))}
      </Stack>
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <SectionCard title={labels[kind][0]} description={labels[kind][1]}>
          <RecordList
            ariaLabel={labels[kind][0]}
            items={rows}
            empty={
              <EmptyState
                title={`No ${labels[kind][0].toLocaleLowerCase()} yet`}
                body="Items appear here as soon as they are persisted in your workspace."
              />
            }
          />
        </SectionCard>
      </DataBoundary>
    </WorkspacePage>
  );
}
