import {
  DataBoundary,
  EmptyState,
  FeatureStatusNotice,
  MetricGrid,
  RecordList,
  SectionCard,
  WorkspacePage,
} from './WorkspacePrimitives.jsx';
import { useWorkspaceData } from './useWorkspaceData.js';
import { activityItems, overviewMetrics } from './workspaceViewModel.js';

const ACTIVITY_STATUS = Object.freeze({
  available: Object.freeze([
    'Tenant-scoped workflow events and current Goal and completion totals.',
  ]),
  remaining: Object.freeze([
    'Aggregate token and tool totals plus detailed model and cost analytics.',
    'Reasoning diagnostics, workflow traces, filtering, and export.',
  ]),
});

export default function ActivityPage() {
  const state = useWorkspaceData({ overview: true, activity: true });
  const activity = activityItems(state.overview, 50);
  const metrics = overviewMetrics(state.overview);
  const usage = state.overview.usage || {};
  const trackedTokens = usage.tokens ?? usage.totalTokens ?? null;
  const toolCalls = usage.toolCalls ?? usage.tools ?? null;

  return (
    <WorkspacePage
      title="Activity & Usage"
      description="Tenant-scoped workflow events, with usage totals retained for the next GCP control-plane increment."
    >
      <FeatureStatusNotice {...ACTIVITY_STATUS} />
      <DataBoundary loading={state.loading} error={state.error} onRetry={state.refresh}>
        <MetricGrid
          items={[
            { label: 'Activity rows', value: activity.length },
            { label: 'Goals', value: metrics.goals },
            { label: 'Completed', value: metrics.completed },
            { label: 'Tracked tokens', value: trackedTokens ?? '—' },
            { label: 'Tool calls', value: toolCalls ?? '—' },
          ]}
        />
        <SectionCard title="Workspace activity" description="Newest durable events first.">
          <RecordList
            ariaLabel="Workspace activity log"
            items={activity}
            empty={
              <EmptyState
                title="No activity recorded"
                body="Assistant conversations and Goal events will appear after the first interaction."
              />
            }
          />
        </SectionCard>
      </DataBoundary>
    </WorkspacePage>
  );
}
