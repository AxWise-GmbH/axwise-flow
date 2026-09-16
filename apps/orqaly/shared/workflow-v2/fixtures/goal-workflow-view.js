import { projectGoalWork } from '../workflow-view.js';
import { GOAL_WORKFLOW_VIEW_LIMITS } from '../goal-workflow-view-contract.js';

export const goalViewId = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
export const goalViewOwner = 'user_goalviewfixture';
export const goalViewAt = '2026-09-09T10:00:00.000Z';
export function goalViewRows() {
  return {
    run: {
      id: goalViewId(2),
      tenant_id: goalViewId(1),
      owner_user_id: goalViewOwner,
      owner_organization_id: null,
      mode: 'simple',
      status: 'completed',
      request: 'Compare official product documentation.',
      request_hash: 'a'.repeat(64),
      row_version: '9',
      evidence_readiness: 'ready',
      created_at: goalViewAt,
      updated_at: goalViewAt,
      final_artifact_id: goalViewId(4),
      artifact_id: goalViewId(4),
      artifact_hash: 'b'.repeat(64),
      artifact_kind: 'final_markdown',
    },
    stages: [
      {
        id: goalViewId(3),
        tenant_id: goalViewId(1),
        run_id: goalViewId(2),
        stage_key: 'synthesis',
        kind: 'synthesis',
        status: 'completed',
        row_version: '4',
        ordinal: 7,
        input_hash: 'c'.repeat(64),
        output_artifact_id: goalViewId(4),
        artifact_id: goalViewId(4),
        artifact_hash: 'b'.repeat(64),
        artifact_kind: 'final_markdown',
      },
    ],
    artifacts: [
      {
        tenant_id: goalViewId(1),
        run_id: goalViewId(2),
        artifact_id: goalViewId(4),
        artifact_hash: 'b'.repeat(64),
        artifact_kind: 'final_markdown',
        content_type: 'text/markdown',
        input_hash: 'c'.repeat(64),
        source_artifact_ids: [goalViewId(5)],
      },
    ],
  };
}
export function goalViewProjection() {
  const limits = GOAL_WORKFLOW_VIEW_LIMITS;
  return {
    snapshot: {
      run: {
        id: goalViewId(2),
        tenantId: goalViewId(1),
        ownerUserId: goalViewOwner,
        ownerOrganizationId: null,
        mode: 'simple',
        status: 'completed',
        request: 'Compare official product documentation.',
        requestHash: 'a'.repeat(64),
        rowVersion: 9,
        evidenceReadiness: 'ready',
        finalArtifact: {
          artifactId: goalViewId(4),
          artifactHash: 'b'.repeat(64),
          kind: 'final_markdown',
        },
      },
      stages: [
        {
          id: goalViewId(3),
          stageKey: 'synthesis',
          kind: 'synthesis',
          status: 'completed',
          rowVersion: 4,
          ordinal: 7,
          inputHash: 'c'.repeat(64),
          outputArtifact: {
            artifactId: goalViewId(4),
            artifactHash: 'b'.repeat(64),
            kind: 'final_markdown',
          },
        },
      ],
      attempts: [],
      dependencies: [],
      approvals: [],
    },
    timestamps: { createdAt: goalViewAt, updatedAt: goalViewAt },
    artifactRecords: [
      {
        runId: goalViewId(2),
        artifactId: goalViewId(4),
        artifactHash: 'b'.repeat(64),
        kind: 'final_markdown',
        contentType: 'text/markdown',
        inputHash: 'c'.repeat(64),
        sourceArtifactIds: [goalViewId(5)],
      },
    ],
    coverage: {
      stages: { loaded: 1, limit: limits.stages, complete: true },
      outputs: { loaded: 1, limit: limits.outputs, complete: true },
      lineage: { limitPerOutput: limits.lineage, incompleteArtifactIds: [] },
      attempts: 'not_loaded',
      dependencies: 'not_loaded',
      approvals: 'not_loaded',
      history: 'not_loaded',
      content: 'not_loaded',
    },
  };
}
export function goalViewResponse() {
  const projection = goalViewProjection();
  return {
    workflow: {
      ...projectGoalWork(projection.snapshot, { artifactRecords: projection.artifactRecords }),
      ...projection.timestamps,
    },
    coverage: projection.coverage,
  };
}
