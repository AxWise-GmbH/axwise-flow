import { GOAL_WORKFLOW_VIEW_LIMITS } from '../../shared/workflow-v2/goal-workflow-view-contract.js';

const limits = GOAL_WORKFLOW_VIEW_LIMITS;
const timestamp = (value) => (value instanceof Date ? value.toISOString() : value);
function artifactRef(row, pointer) {
  if (row[pointer] == null) return null;
  if (row[pointer] !== row.artifact_id)
    throw new TypeError('Goal workflow view artifact pointer mismatch');
  return { artifactId: row.artifact_id, artifactHash: row.artifact_hash, kind: row.artifact_kind };
}

// Called only inside the API-role tenant transaction, at REPEATABLE READ / READ
// ONLY. Three bounded SELECTs for an owned run, one for a miss; no body, attempt,
// lease, transcript, event-history, provider, scheduler or command reads.
export async function readGoalWorkflowViewWithClient(client, tenantId, ownerUserId, runId) {
  const params = [tenantId, runId, ownerUserId];
  const runResult = await client.query(
    `SELECT run.id, run.tenant_id, run.owner_user_id, run.owner_organization_id,
            run.mode, run.status, left(run.request_payload ->> 'request', 24001) AS request,
            run.request_payload -> 'workProfile' AS work_profile,
            run.request_hash, run.row_version, run.evidence_readiness, run.created_at, run.updated_at,
            run.final_artifact_id, final.id AS artifact_id,
            final.content_hash AS artifact_hash, final.kind AS artifact_kind
       FROM orqaly.workflow_runs AS run
       LEFT JOIN orqaly.artifacts AS final ON final.tenant_id = run.tenant_id
        AND final.run_id = run.id AND final.id = run.final_artifact_id
       WHERE run.tenant_id = $1 AND run.id = $2 AND run.owner_user_id = $3
       LIMIT 1`,
    params
  );
  const run = runResult.rows[0];
  if (!run) return null;
  if (run.id !== runId || run.tenant_id !== tenantId || run.owner_user_id !== ownerUserId) {
    throw new TypeError('Goal workflow view owner mismatch');
  }
  const stageResult = await client.query(
    `SELECT stage.id, stage.tenant_id, stage.run_id, stage.stage_key, stage.kind, stage.status,
            stage.row_version, stage.ordinal, stage.input_hash, stage.output_artifact_id,
            output.id AS artifact_id, output.content_hash AS artifact_hash, output.kind AS artifact_kind
       FROM orqaly.workflow_stages AS stage
       JOIN orqaly.workflow_runs AS run ON run.tenant_id = stage.tenant_id AND run.id = stage.run_id
       LEFT JOIN orqaly.artifacts AS output ON output.tenant_id = stage.tenant_id
        AND output.run_id = stage.run_id AND output.id = stage.output_artifact_id
       WHERE stage.tenant_id = $1 AND stage.run_id = $2 AND run.owner_user_id = $3
       ORDER BY stage.ordinal, stage.id LIMIT $4`,
    [...params, limits.stages + 1]
  );
  const stages = stageResult.rows.slice(0, limits.stages);
  if (stageResult.rows.some((row) => row.tenant_id !== tenantId || row.run_id !== runId)) {
    throw new TypeError('Goal workflow view stage mismatch');
  }
  // Validate joined identities before using these pointers to batch metadata.
  artifactRef(run, 'final_artifact_id');
  stages.forEach((row) => artifactRef(row, 'output_artifact_id'));
  const artifactIds = [
    ...new Set(
      [run.final_artifact_id, ...stages.map((row) => row.output_artifact_id)].filter(Boolean)
    ),
  ];
  const artifactResult = await client.query(
    `SELECT artifact.id AS artifact_id, artifact.tenant_id, artifact.run_id,
            artifact.content_hash AS artifact_hash, artifact.kind AS artifact_kind,
            artifact.content_type, artifact.input_hash,
            ARRAY(SELECT lineage.source_artifact_id FROM orqaly.artifact_lineage AS lineage
                   WHERE lineage.tenant_id = artifact.tenant_id AND lineage.run_id = artifact.run_id
                     AND lineage.artifact_id = artifact.id
                   ORDER BY lineage.source_artifact_id LIMIT $5) AS source_artifact_ids
       FROM orqaly.artifacts AS artifact
       JOIN orqaly.workflow_runs AS run ON run.tenant_id = artifact.tenant_id AND run.id = artifact.run_id
       WHERE artifact.tenant_id = $1 AND artifact.run_id = $2 AND run.owner_user_id = $3
         AND artifact.id = ANY($4::uuid[])
       ORDER BY artifact.id LIMIT $6`,
    [...params, artifactIds, limits.lineage + 1, limits.outputs + 1]
  );
  if (
    artifactResult.rows.length > limits.outputs ||
    artifactResult.rows.some(
      (row) =>
        row.tenant_id !== tenantId || row.run_id !== runId || !artifactIds.includes(row.artifact_id)
    )
  ) {
    throw new TypeError('Goal workflow view artifact mismatch');
  }
  const incompleteArtifactIds = artifactResult.rows
    .filter((row) => row.source_artifact_ids.length > limits.lineage)
    .map((row) => row.artifact_id);
  return {
    snapshot: {
      run: {
        id: run.id,
        tenantId: run.tenant_id,
        ownerUserId: run.owner_user_id,
        ownerOrganizationId: run.owner_organization_id,
        mode: run.mode,
        ...(run.work_profile ? { workProfile: run.work_profile } : {}),
        status: run.status,
        request: run.request,
        requestHash: run.request_hash,
        rowVersion: Number(run.row_version),
        evidenceReadiness: run.evidence_readiness,
        finalArtifact: artifactRef(run, 'final_artifact_id'),
      },
      stages: stages.map((row) => ({
        id: row.id,
        stageKey: row.stage_key,
        kind: row.kind,
        status: row.status,
        rowVersion: Number(row.row_version),
        ordinal: row.ordinal,
        inputHash: row.input_hash,
        outputArtifact: artifactRef(row, 'output_artifact_id'),
      })),
      attempts: [],
      dependencies: [],
      approvals: [],
    },
    timestamps: { createdAt: timestamp(run.created_at), updatedAt: timestamp(run.updated_at) },
    artifactRecords: artifactResult.rows.map((row) => ({
      runId: row.run_id,
      artifactId: row.artifact_id,
      artifactHash: row.artifact_hash,
      kind: row.artifact_kind,
      contentType: row.content_type,
      inputHash: row.input_hash,
      sourceArtifactIds: row.source_artifact_ids.slice(0, limits.lineage),
    })),
    coverage: {
      stages: {
        loaded: stages.length,
        limit: limits.stages,
        complete: stageResult.rows.length <= limits.stages,
      },
      outputs: {
        loaded: artifactIds.length,
        limit: limits.outputs,
        complete:
          stageResult.rows.length <= limits.stages &&
          artifactResult.rows.length === artifactIds.length,
      },
      lineage: { limitPerOutput: limits.lineage, incompleteArtifactIds },
      attempts: 'not_loaded',
      dependencies: 'not_loaded',
      approvals: 'not_loaded',
      history: 'not_loaded',
      content: 'not_loaded',
    },
  };
}
