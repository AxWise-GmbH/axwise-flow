import { PublicWorkflowSnapshotSchema } from '../../shared/workflow-v2/contracts.js';
import { GoalWorkflowViewResponseSchema } from '../../shared/workflow-v2/goal-workflow-view-contract.js';
import { projectGoalWork } from '../../shared/workflow-v2/workflow-view.js';
import { WorkflowCommandError } from './command-service.js';

export function createGoalWorkflowViewService({ repository }) {
  return {
    async read(auth, runId) {
      if (!auth?.userId) throw new WorkflowCommandError('UNAUTHENTICATED', 'sign-in required', 401);
      try {
        const tenantId = await repository.resolveExistingTenant({ userId: auth.userId });
        if (!tenantId)
          throw new WorkflowCommandError('TENANT_NOT_BOUND', 'identity has no tenant', 403);
        const projection = await repository.loadGoalWorkflowView(tenantId, auth.userId, runId);
        if (!projection)
          throw new WorkflowCommandError('RUN_NOT_FOUND', 'workflow run not found', 404);
        const snapshot = PublicWorkflowSnapshotSchema.parse(projection.snapshot);
        if (
          snapshot.run.id !== runId ||
          snapshot.run.tenantId !== tenantId ||
          snapshot.run.ownerUserId !== auth.userId ||
          snapshot.attempts.length ||
          snapshot.dependencies.length ||
          snapshot.approvals.length
        ) {
          throw new TypeError('Goal workflow view scope mismatch');
        }
        const workflow = projectGoalWork(snapshot, { artifactRecords: projection.artifactRecords });
        workflow.createdAt = projection.timestamps.createdAt;
        workflow.updatedAt = projection.timestamps.updatedAt;
        return GoalWorkflowViewResponseSchema.parse({ workflow, coverage: projection.coverage });
      } catch (error) {
        if (error instanceof WorkflowCommandError) throw error;
        // Do not echo DB content, malformed immutable metadata, or parser details.
        throw new WorkflowCommandError(
          'WORKFLOW_VIEW_UNAVAILABLE',
          'Goal workflow metadata is unavailable.',
          503
        );
      }
    },
  };
}
