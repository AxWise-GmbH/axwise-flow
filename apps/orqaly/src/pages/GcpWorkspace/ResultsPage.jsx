import { Alert } from '@mui/material';
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
import {
  humanize,
  resultItems,
  shortReference,
  workflowHref,
  workflowTitle,
} from './workspaceViewModel.js';

const RESULTS_STATUS = Object.freeze({
  available: Object.freeze([
    'Review completed Goal outcomes, evidence readiness, and immutable artifact hashes.',
    'Open each result in its exact Goal run.',
  ]),
  remaining: Object.freeze([
    'Add a dedicated artifact viewer and direct downloads on this page.',
    'Add result filters, sharing, and retention controls.',
  ]),
});

export default function ResultsPage() {
  const state = useWorkspaceData({ overview: true });
  const results = resultItems(state.overview);
  const ready = results.filter((workflow) => workflow.run.evidenceReadiness === 'ready').length;
  const gaps = results.filter(
    (workflow) => workflow.run.evidenceReadiness === 'ready_with_gaps'
  ).length;
  const rows = results.map((workflow) => ({
    id: workflow.run.id,
    title: workflowTitle(workflow),
    description: workflow.run.finalArtifact
      ? `${humanize(workflow.run.finalArtifact.kind)} · sha256:${shortReference(
          workflow.run.finalArtifact.artifactHash
        )}`
      : 'Completed result without an exported artifact.',
    status: workflow.run.status,
    at: workflow.run.updatedAt,
    href: workflowHref(workflow),
    actionLabel: 'Open result',
  }));

  return (
    <WorkspacePage
      title="Results"
      description="Completed outcomes, immutable artifacts, and evidence readiness from durable Goals."
      actions={<PageLink to="/goals">Open Goals</PageLink>}
    >
      <FeatureStatusNotice {...RESULTS_STATUS} />
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <MetricGrid
          items={[
            { label: 'Results', value: results.length },
            { label: 'Evidence ready', value: ready },
            { label: 'Ready with gaps', value: gaps },
            {
              label: 'Artifacts',
              value: results.filter((workflow) => workflow.run.finalArtifact).length,
            },
            { label: 'Storage', value: 'Immutable' },
          ]}
        />
        {gaps ? (
          <Alert severity="warning" variant="outlined">
            Some results completed with documented evidence gaps. Open the Goal to review them.
          </Alert>
        ) : null}
        <SectionCard title="Goal results" description="Latest completed outputs in this workspace.">
          <RecordList
            ariaLabel="Goal results"
            items={rows}
            empty={
              <EmptyState
                title="No completed results"
                body="When a Goal completes, its result and evidence readiness will appear here."
                action={<PageLink to="/goals">Start a Goal</PageLink>}
              />
            }
          />
        </SectionCard>
      </DataBoundary>
    </WorkspacePage>
  );
}
