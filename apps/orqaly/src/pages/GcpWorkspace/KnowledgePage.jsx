import { Stack, Typography } from '@mui/material';
import {
  DataBoundary,
  EmptyState,
  FeatureStatusNotice,
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

const KNOWLEDGE_STATUS = Object.freeze({
  available: Object.freeze([
    'Immutable final Goal artifacts with status, identity, and source-Goal links.',
  ]),
  remaining: Object.freeze([
    'Tenant document upload, versioning, and external storage connections.',
    'Indexing and source-backed semantic retrieval for Assistant and Goals.',
  ]),
});

export default function KnowledgePage() {
  const state = useWorkspaceData({ overview: true });
  const artifacts = resultItems(state.overview)
    .filter((workflow) => workflow.run.finalArtifact)
    .map((workflow) => ({
      id: workflow.run.finalArtifact.artifactId,
      title: workflowTitle(workflow),
      description: `${humanize(workflow.run.finalArtifact.kind)} · sha256:${shortReference(
        workflow.run.finalArtifact.artifactHash
      )}`,
      status: workflow.run.status,
      at: workflow.run.updatedAt,
      href: workflowHref(workflow),
      actionLabel: 'Open Goal',
    }));

  return (
    <WorkspacePage
      title="Knowledge Storage"
      description="Durable outputs today, with tenant-scoped documents, connections, and retrieval retained for the GCP data cutover."
      actions={<PageLink to="/goals">Open Goals</PageLink>}
    >
      <FeatureStatusNotice {...KNOWLEDGE_STATUS} />
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <SectionCard
          title="Durable Goal outputs"
          description="Immutable final artifacts already available inside this workspace."
        >
          <RecordList
            ariaLabel="Durable Goal artifacts"
            items={artifacts}
            empty={
              <EmptyState
                title="No durable outputs yet"
                body="Complete a Goal and its immutable final artifact will appear here while the wider Knowledge migration is prepared."
                action={<PageLink to="/goals">Create a Goal</PageLink>}
              />
            }
          />
        </SectionCard>

        <SectionCard title="Retained Knowledge capabilities">
          <Stack component="ul" spacing={1} sx={{ pl: 2.5, my: 0 }}>
            <Typography component="li" variant="body2">
              Tenant-scoped documents and versioned sources
            </Typography>
            <Typography component="li" variant="body2">
              Storage and provider connections with Clerk-authenticated ownership
            </Typography>
            <Typography component="li" variant="body2">
              Retrieval for Assistant and Goal execution with source evidence
            </Typography>
          </Stack>
        </SectionCard>
      </DataBoundary>
    </WorkspacePage>
  );
}
