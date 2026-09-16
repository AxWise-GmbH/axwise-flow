import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { z } from 'zod';
import {
  ApprovalGrantedEventSchema,
  ExecuteTaskSynthesisInputV1Schema,
  ExecuteResearchInputV2Schema,
  FinalArtifactV1Schema,
  PlanningResultSchema,
  ScopeArtifactV2Schema,
} from '../shared/workflow-v2/contracts.js';
import {
  artifactContentHash,
  canonicalHash,
  canonicalJson,
} from '../lib/workflow-v2/canonical.js';

const { Pool } = pg;

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const Uuid = z.string().uuid();
const Commit = z.string().regex(/^[a-f0-9]{40}$/);
const ArtifactRef = z
  .object({ artifactId: Uuid, artifactHash: Sha256, kind: z.string().min(1).max(120) })
  .strict();
const AdditiveMigrationSchema = z
  .object({
    migrationNumber: z.number().int().min(2),
    migrationPath: z.string().min(1).max(500),
    migrationSha256: Sha256,
    sourceCommit: Commit,
  })
  .strict();
const AdditiveMigrationsSchema = z
  .array(AdditiveMigrationSchema)
  .max(100)
  .refine(
    (migrations) =>
      migrations.every(
        (migration, index) =>
          index === 0 || migration.migrationNumber > migrations[index - 1].migrationNumber
      ),
    { message: 'additive migrations must be ordered by strictly increasing migration number' }
  );

export const ReleaseMarkerSchema = z
  .object({
    component: z.enum(['orqaly', 'axwise']),
    migrationNumber: z.literal(1),
    migrationPath: z.string().min(1).max(500),
    migrationSha256: Sha256,
    bindingsPath: z.string().min(1).max(500),
    bindingsSha256: Sha256,
    sourceCommit: Commit,
    additiveMigrations: AdditiveMigrationsSchema,
  })
  .strict();

const ApprovalEvidenceSchema = z
  .object({
    approvalId: Uuid,
    stageId: Uuid,
    artifact: ArtifactRef,
    inputHash: Sha256,
    selectedEvidence: z.array(ArtifactRef).max(200),
    decisionHash: Sha256,
    decidedBy: z.string().regex(/^user_[A-Za-z0-9]+$/),
    event: z
      .object({ eventId: Uuid, eventHash: Sha256, occurredAt: z.string().datetime() })
      .strict(),
    consumerAttempts: z
      .array(
        z
          .object({
            stageId: Uuid,
            attemptId: Uuid,
            attemptNumber: z.number().int().positive(),
            inputHash: Sha256,
          })
          .strict()
      )
      .min(1)
      .max(200),
  })
  .strict();

export const LiveRunEvidenceSchema = z
  .object({
    tenantId: Uuid,
    ownerUserId: z.string().regex(/^user_[A-Za-z0-9]+$/),
    ownerOrganizationId: z.string().regex(/^org_[A-Za-z0-9]+$/).nullable(),
    mode: z.enum(['simple', 'advanced']),
    runId: Uuid,
    status: z.enum(['completed', 'completed_with_evidence_gaps']),
    evidenceReadiness: z.enum(['ready', 'ready_with_gaps']),
    launchReady: z.boolean(),
    finalArtifact: z
      .object({
        artifactId: Uuid,
        artifactHash: Sha256,
        kind: z.literal('final_markdown'),
        markdown: z.string().min(1),
      })
      .strict(),
    usage: z
      .object({
        inputTokens: z.number().int().positive(),
        outputTokens: z.number().int().positive(),
        totalTokens: z.number().int().positive(),
        searchCalls: z.number().int().positive(),
        estimatedCostMicros: z.number().int().positive(),
        operationCount: z.number().int().positive(),
        models: z.array(z.literal('gemini-3.8-flash')).length(1),
      })
      .strict()
      .refine((usage) => usage.totalTokens === usage.inputTokens + usage.outputTokens, {
        message: 'durable total tokens must equal input plus output tokens',
        path: ['totalTokens'],
      }),
    latencyMs: z.number().int().positive(),
    approvalBindings: z
      .object({
        scope: ApprovalEvidenceSchema.extend({
          artifact: ArtifactRef.extend({ kind: z.literal('scope') }),
        }),
        plan: ApprovalEvidenceSchema.extend({
          artifact: ArtifactRef.extend({ kind: z.literal('plan') }),
        }),
      })
      .strict(),
  })
  .strict()
  .superRefine((run, context) => {
    const expectedStatus =
      run.evidenceReadiness === 'ready' ? 'completed' : 'completed_with_evidence_gaps';
    if (run.status !== expectedStatus) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'terminal status must exactly match evidence readiness',
      });
    }
    if (run.evidenceReadiness !== 'ready' && run.launchReady) {
      context.addIssue({
        code: 'custom',
        path: ['launchReady'],
        message: 'an evidence-gap run cannot claim launch-ready',
      });
    }
  });

const LiveEvidenceCoreSchema = z
  .object({
    schemaVersion: z.literal('orqaly.preview-live-database-evidence.v1'),
    capturedAt: z.string().datetime(),
    database: z
      .object({
        name: z.literal('orqaly_v2_preview_001'),
        transactionReadOnly: z.literal(true),
        releaseMarker: ReleaseMarkerSchema.extend({ component: z.literal('orqaly') }),
      })
      .strict(),
    e2e: z
      .object({ simple: LiveRunEvidenceSchema, advanced: LiveRunEvidenceSchema })
      .strict()
      .superRefine((runs, context) => {
        if (runs.simple.mode !== 'simple') {
          context.addIssue({ code: 'custom', path: ['simple', 'mode'], message: 'wrong UI mode' });
        }
        if (runs.advanced.mode !== 'advanced') {
          context.addIssue({ code: 'custom', path: ['advanced', 'mode'], message: 'wrong UI mode' });
        }
        const identities = [
          runs.simple.runId,
          runs.advanced.runId,
          runs.simple.finalArtifact.artifactId,
          runs.advanced.finalArtifact.artifactId,
          ...['scope', 'plan'].flatMap((kind) => [
            runs.simple.approvalBindings[kind].approvalId,
            runs.advanced.approvalBindings[kind].approvalId,
            runs.simple.approvalBindings[kind].stageId,
            runs.advanced.approvalBindings[kind].stageId,
            runs.simple.approvalBindings[kind].artifact.artifactId,
            runs.advanced.approvalBindings[kind].artifact.artifactId,
          ]),
        ];
        if (new Set(identities).size !== identities.length) {
          context.addIssue({
            code: 'custom',
            path: [],
            message: 'Simple and Advanced must use distinct run, stage, approval, and artifact rows',
          });
        }
        if (
          runs.simple.tenantId !== runs.advanced.tenantId ||
          runs.simple.ownerUserId !== runs.advanced.ownerUserId ||
          runs.simple.ownerOrganizationId !== runs.advanced.ownerOrganizationId
        ) {
          context.addIssue({
            code: 'custom',
            path: [],
            message: 'Simple and Advanced evidence must belong to the same authenticated owner',
          });
        }
      }),
  })
  .strict();

export const LiveEvidenceSchema = LiveEvidenceCoreSchema.extend({
  attestationSha256: Sha256,
}).superRefine((evidence, context) => {
  const { attestationSha256, ...core } = evidence;
  if (canonicalHash(core) !== attestationSha256) {
    context.addIssue({
      code: 'custom',
      path: ['attestationSha256'],
      message: 'live database evidence attestation hash is invalid',
    });
  }
});

export const LIVE_EVIDENCE_QUERY = String.raw`
WITH requested(expected_mode, run_id) AS (
  VALUES ('simple'::text, $2::uuid), ('advanced'::text, $3::uuid)
), selected_runs AS (
  SELECT requested.expected_mode, run.*
  FROM requested
  JOIN orqaly.workflow_runs AS run ON run.id = requested.run_id
  WHERE run.tenant_id = $1::uuid AND run.owner_user_id = $4::text
), approval_facts AS (
  SELECT
    run.expected_mode,
    run.tenant_id,
    run.id AS run_id,
    run.owner_user_id,
    run.owner_organization_id,
    run.mode,
    run.status AS run_status,
    run.evidence_readiness,
    final.id AS final_artifact_id,
    final.content_hash AS final_artifact_hash,
    final.kind AS final_artifact_kind,
    final.content_type AS final_content_type,
    final.payload AS final_payload,
    final.markdown AS final_markdown,
    final.stage_id AS final_stage_id,
    final.attempt_id AS final_attempt_id,
    final_producer.kind AS final_producer_kind,
    final_producer.status AS final_producer_status,
    final_producer.output_artifact_id AS final_producer_output_artifact_id,
    final_sources.resolved AS final_sources,
    final_lineage.source_ids AS final_lineage_source_ids,
    provider_usage.input_tokens,
    provider_usage.output_tokens,
    provider_usage.total_tokens,
    provider_usage.search_calls,
    provider_usage.estimated_cost_micros,
    provider_usage.operation_count,
    provider_usage.models,
    GREATEST(
      1,
      floor(extract(epoch FROM (run.updated_at - run.created_at)) * 1000)::bigint
    ) AS run_latency_ms,
    approval.id AS approval_id,
    approval.kind AS approval_kind,
    approval.stage_id AS approval_stage_id,
    approval.input_hash AS approval_input_hash,
    approval.artifact_hash AS approval_artifact_hash,
    approval.decision_hash,
    approval.decision,
    approval.decided_by,
    approval_artifact.id AS approval_artifact_id,
    approval_artifact.kind AS approval_artifact_kind,
    approval_artifact.content_hash AS approval_content_hash,
    approval_artifact.content_type AS approval_content_type,
    approval_artifact.payload AS approval_payload,
    approval_artifact.markdown AS approval_markdown,
    approval_artifact.stage_id AS approval_artifact_stage_id,
    gate.kind AS gate_kind,
    gate.status AS gate_status,
    producer.id AS producer_stage_id,
    producer.input_hash AS producer_input_hash,
    producer.output_artifact_id AS producer_output_artifact_id,
    approval_event.id AS approval_event_id,
    approval_event.event_hash AS approval_event_hash,
    approval_event.event_payload AS approval_event_payload,
    approval_event.occurred_at AS approval_event_occurred_at,
    selected.resolved AS selected_evidence,
    consumers.bound_attempts AS consumer_attempts,
    transaction_timestamp() AS captured_at,
    current_database() AS database_name,
    current_setting('transaction_read_only') AS transaction_read_only,
    marker.component AS marker_component,
    marker.migration_number AS marker_migration_number,
    marker.migration_path AS marker_migration_path,
    marker.sha256 AS marker_migration_sha256,
    marker.bindings_path AS marker_bindings_path,
    marker.bindings_sha256 AS marker_bindings_sha256,
    marker.source_commit AS marker_source_commit,
    additive_migrations.entries AS marker_additive_migrations
  FROM selected_runs AS run
  JOIN orqaly.artifacts AS final
    ON final.tenant_id = run.tenant_id AND final.run_id = run.id
   AND final.id = run.final_artifact_id
  JOIN orqaly.workflow_stages AS final_producer
    ON final_producer.tenant_id = final.tenant_id AND final_producer.run_id = final.run_id
   AND final_producer.id = final.stage_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'reference', item.reference,
      'resolvedArtifactId', source.id,
      'resolvedArtifactHash', source.content_hash,
      'resolvedArtifactKind', source.kind,
      'resolvedTenantId', source.tenant_id,
      'resolvedRunId', source.run_id
    ) ORDER BY item.ordinality), '[]'::jsonb) AS resolved
    FROM jsonb_array_elements(
      COALESCE(final.payload -> 'sourceArtifacts', '[]'::jsonb)
    ) WITH ORDINALITY AS item(reference, ordinality)
    LEFT JOIN orqaly.artifacts AS source
      ON source.tenant_id = run.tenant_id AND source.run_id = run.id
     AND source.id = (item.reference ->> 'artifactId')::uuid
     AND source.content_hash = item.reference ->> 'artifactHash'
     AND source.kind = item.reference ->> 'kind'
  ) AS final_sources ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(lineage.source_artifact_id ORDER BY lineage.source_artifact_id), '[]'::jsonb)
      AS source_ids
    FROM orqaly.artifact_lineage AS lineage
    WHERE lineage.tenant_id = final.tenant_id AND lineage.run_id = final.run_id
      AND lineage.artifact_id = final.id
  ) AS final_lineage ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(sum((event.event_payload #>> '{result,metrics,inputTokens}')::bigint), 0) AS input_tokens,
      COALESCE(sum((event.event_payload #>> '{result,metrics,outputTokens}')::bigint), 0) AS output_tokens,
      COALESCE(sum((event.event_payload #>> '{result,metrics,totalTokens}')::bigint), 0) AS total_tokens,
      COALESCE(sum((event.event_payload #>> '{result,metrics,searchCalls}')::bigint), 0) AS search_calls,
      COALESCE(sum((event.event_payload #>> '{result,metrics,estimatedCostMicros}')::bigint), 0)
        AS estimated_cost_micros,
      count(*)::integer AS operation_count,
      COALESCE(
        array_agg(DISTINCT event.event_payload #>> '{result,metrics,model}')
          FILTER (WHERE event.event_payload #>> '{result,metrics,model}' IS NOT NULL),
        ARRAY[]::text[]
      ) AS models
    FROM orqaly.workflow_events AS event
    WHERE event.tenant_id = run.tenant_id AND event.run_id = run.id
      AND event.event_type = 'ActivityCompleted'
      AND event.event_payload #>> '{result,metrics,provider}' = 'google'
  ) AS provider_usage ON true
  JOIN orqaly.approvals AS approval
    ON approval.tenant_id = run.tenant_id AND approval.run_id = run.id
   AND approval.decision = 'approved'
  JOIN orqaly.workflow_stages AS gate
    ON gate.tenant_id = approval.tenant_id AND gate.run_id = approval.run_id
   AND gate.id = approval.stage_id
  JOIN orqaly.workflow_stages AS producer
    ON producer.tenant_id = approval.tenant_id AND producer.run_id = approval.run_id
   AND producer.kind = CASE approval.kind WHEN 'scope' THEN 'compile_scope' ELSE 'planning' END
  JOIN orqaly.artifacts AS approval_artifact
    ON approval_artifact.tenant_id = approval.tenant_id
   AND approval_artifact.run_id = approval.run_id
   AND approval_artifact.id = approval.artifact_id
   AND approval_artifact.content_hash = approval.artifact_hash
   AND approval_artifact.input_hash = approval.input_hash
  JOIN orqaly.workflow_events AS approval_event
    ON approval_event.tenant_id = approval.tenant_id
   AND approval_event.run_id = approval.run_id
   AND approval_event.event_type = 'ApprovalGranted'
   AND approval_event.event_payload ->> 'approvalId' = approval.id::text
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'reference', item.reference,
      'resolvedArtifactId', evidence.id,
      'resolvedArtifactHash', evidence.content_hash,
      'resolvedArtifactKind', evidence.kind,
      'resolvedTenantId', evidence.tenant_id
    ) ORDER BY item.ordinality), '[]'::jsonb) AS resolved
    FROM jsonb_array_elements(
      COALESCE(approval_event.event_payload -> 'selectedEvidence', '[]'::jsonb)
    ) WITH ORDINALITY AS item(reference, ordinality)
    LEFT JOIN orqaly.artifacts AS evidence
      ON evidence.tenant_id = run.tenant_id
     AND evidence.id = (item.reference ->> 'artifactId')::uuid
     AND evidence.content_hash = item.reference ->> 'artifactHash'
     AND evidence.kind = item.reference ->> 'kind'
  ) AS selected ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stageId', consumer.id,
      'stageKey', consumer.stage_key,
      'stageStatus', consumer.status,
      'attemptId', attempt.id,
      'attemptNumber', attempt.attempt_number,
      'inputHash', attempt.input_hash,
      'inputPayload', attempt.input_payload
    ) ORDER BY consumer.ordinal, attempt.attempt_number), '[]'::jsonb) AS bound_attempts
    FROM orqaly.workflow_stages AS consumer
    JOIN orqaly.stage_attempts AS attempt
      ON attempt.tenant_id = consumer.tenant_id AND attempt.run_id = consumer.run_id
     AND attempt.stage_id = consumer.id
    WHERE consumer.tenant_id = run.tenant_id AND consumer.run_id = run.id
      AND attempt.attempt_number = 1
      AND (
        (approval.kind = 'scope' AND consumer.kind = 'execute_research') OR
        (approval.kind = 'plan' AND consumer.kind = 'execution')
      )
  ) AS consumers ON true
  CROSS JOIN workflow_v2_release.applied_baseline AS marker
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'migrationNumber', additive.migration_number,
          'migrationPath', additive.migration_path,
          'migrationSha256', additive.sha256,
          'sourceCommit', additive.source_commit
        )
        ORDER BY additive.migration_number
      ),
      '[]'::jsonb
    ) AS entries
    FROM workflow_v2_release.applied_additive_migrations AS additive
    WHERE additive.component = marker.component
  ) AS additive_migrations
  WHERE marker.component = 'orqaly' AND marker.migration_number = 1
)
SELECT * FROM approval_facts ORDER BY expected_mode, approval_kind;
`;

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error('database evidence contains an invalid timestamp');
  return date.toISOString();
}

function exactRef(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyApproval(row, run, expectedKind) {
  assert(row.approval_kind === expectedKind, `${run.mode} is missing its ${expectedKind} approval`);
  const expectedGate = expectedKind === 'scope' ? 'gate_1' : 'gate_2';
  const expectedProducer = expectedKind === 'scope' ? 'compile_scope' : 'planning';
  assert(row.gate_kind === expectedGate, `${expectedKind} approval is not bound to ${expectedGate}`);
  assert(row.gate_status === 'completed', `${expectedGate} is not durably completed`);
  assert(
    row.approval_artifact_stage_id === row.producer_stage_id &&
      row.producer_output_artifact_id === row.approval_artifact_id,
    `${expectedKind} approval artifact is not the exact ${expectedProducer} output`
  );
  assert(
    row.producer_input_hash === row.approval_input_hash,
    `${expectedKind} approval does not bind the producer input hash`
  );
  assert(row.decision === 'approved', `${expectedKind} approval was not approved`);
  assert(row.decided_by === run.ownerUserId, `${expectedKind} approval was not decided by the run owner`);
  assert(
    row.approval_artifact_kind === expectedKind &&
      row.approval_content_hash === row.approval_artifact_hash,
    `${expectedKind} approval artifact identity is inconsistent`
  );
  assert(
    artifactContentHash({
      contentType: row.approval_content_type,
      payload: row.approval_payload,
      markdown: row.approval_markdown,
    }) === row.approval_content_hash,
    `${expectedKind} approval artifact bytes do not match its immutable hash`
  );
  const typedPayload = expectedKind === 'scope'
    ? ScopeArtifactV2Schema.parse(row.approval_payload)
    : PlanningResultSchema.parse(row.approval_payload);

  const event = ApprovalGrantedEventSchema.parse(row.approval_event_payload);
  assert(event.eventId === row.approval_event_id, `${expectedKind} event ID is inconsistent`);
  assert(canonicalHash(event) === row.approval_event_hash, `${expectedKind} event hash is invalid`);
  assert(event.tenantId === run.tenantId && event.runId === run.runId, `${expectedKind} event ownership is invalid`);
  assert(event.approvalId === row.approval_id, `${expectedKind} event does not bind the approval row`);
  assert(event.approvalKind === expectedKind, `${expectedKind} event kind is invalid`);
  assert(event.stageId === row.approval_stage_id, `${expectedKind} event does not bind the gate stage`);
  assert(event.decidedBy === run.ownerUserId, `${expectedKind} event was not issued by the owner`);
  const artifact = {
    artifactId: row.approval_artifact_id,
    artifactHash: row.approval_artifact_hash,
    kind: row.approval_artifact_kind,
  };
  assert(exactRef(event.artifact, artifact), `${expectedKind} event artifact binding differs from the row`);
  assert(event.inputHash === row.approval_input_hash, `${expectedKind} event input hash differs from the row`);
  assert(event.decisionHash === row.decision_hash, `${expectedKind} event decision hash differs from the row`);
  assert(
    canonicalHash({
      approvalKind: expectedKind,
      artifact,
      inputHash: row.approval_input_hash,
      selectedEvidence: event.selectedEvidence,
    }) === row.decision_hash,
    `${expectedKind} approval decision hash is invalid`
  );

  const resolvedEvidence = row.selected_evidence || [];
  assert(resolvedEvidence.length === event.selectedEvidence.length, `${expectedKind} selected evidence did not resolve`);
  resolvedEvidence.forEach((resolved, index) => {
    assert(exactRef(resolved.reference, event.selectedEvidence[index]), `${expectedKind} evidence order changed`);
    assert(resolved.resolvedTenantId === run.tenantId, `${expectedKind} evidence belongs to another tenant`);
    assert(
      resolved.resolvedArtifactId === resolved.reference.artifactId &&
        resolved.resolvedArtifactHash === resolved.reference.artifactHash &&
        resolved.resolvedArtifactKind === 'evidence',
      `${expectedKind} selected evidence reference was not resolved exactly`
    );
  });
  if (expectedKind === 'plan') {
    assert(event.selectedEvidence.length === 0, 'Gate 2 must not change selected evidence');
  }

  const consumers = row.consumer_attempts || [];
  assert(consumers.length > 0, `${expectedKind} approval has no durable consumer attempt`);
  const planTasksByStage = expectedKind === 'plan'
    ? new Map(typedPayload.tasks.map((task) => [task.stageId, task]))
    : null;
  if (expectedKind === 'scope') {
    assert(consumers.length === 1, 'Gate 1 must bind exactly one initial research attempt');
  } else {
    assert(
      consumers.length === typedPayload.tasks.length &&
        new Set(consumers.map((consumer) => consumer.stageId)).size === typedPayload.tasks.length &&
        consumers.every((consumer) => planTasksByStage.has(consumer.stageId)),
      'Gate 2 plan tasks and durable execution attempts do not have identical stage identities'
    );
  }
  for (const consumer of consumers) {
    assert(
      ['completed', 'completed_with_evidence_gaps'].includes(consumer.stageStatus),
      `${expectedKind} consumer stage is not durably complete`
    );
    assert(
      canonicalHash(consumer.inputPayload) === consumer.inputHash,
      `${expectedKind} consumer attempt input hash is invalid`
    );
    if (expectedKind === 'scope') {
      const input = ExecuteResearchInputV2Schema.parse(consumer.inputPayload);
      assert(exactRef(input.acceptedScope, artifact), 'research did not consume the accepted scope');
      assert(
        canonicalJson(input.scope) === canonicalJson(typedPayload),
        'research scope payload differs from the accepted immutable scope'
      );
      assert(
        canonicalJson(input.selectedEvidence) === canonicalJson(event.selectedEvidence),
        'research selected evidence differs from Gate 1'
      );
    } else {
      const input = ExecuteTaskSynthesisInputV1Schema.parse(consumer.inputPayload);
      assert(exactRef(input.acceptedPlan, artifact), 'execution did not consume the accepted plan');
      assert(
        canonicalJson(input.task) === canonicalJson(planTasksByStage.get(consumer.stageId)),
        'execution task differs from the exact approved plan task for its stable stage'
      );
      assert(input.task.stageKey === consumer.stageKey, 'execution task stage key differs from its stable stage');
      assert(
        exactRef(input.acceptedScope, typedPayload.acceptedScopeArtifact) &&
          exactRef(input.research, typedPayload.researchArtifact),
        'execution scope/research inputs differ from the approved plan provenance'
      );
    }
  }
  for (const nextAttempt of event.nextAttempts) {
    assert(
      consumers.some(
        (consumer) =>
          consumer.stageId === nextAttempt.stageId &&
          consumer.attemptId === nextAttempt.attemptId &&
          consumer.inputHash === nextAttempt.inputHash
      ),
      `${expectedKind} event dispatched an attempt outside its durable consumers`
    );
  }

  return {
    approvalId: row.approval_id,
    stageId: row.approval_stage_id,
    artifact,
    inputHash: row.approval_input_hash,
    selectedEvidence: event.selectedEvidence,
    decisionHash: row.decision_hash,
    decidedBy: row.decided_by,
    event: {
      eventId: row.approval_event_id,
      eventHash: row.approval_event_hash,
      occurredAt: iso(row.approval_event_occurred_at),
    },
    consumerAttempts: consumers.map((consumer) => ({
      stageId: consumer.stageId,
      attemptId: consumer.attemptId,
      attemptNumber: Number(consumer.attemptNumber),
      inputHash: consumer.inputHash,
    })),
  };
}

function verifyRun(rows, expectedMode, tenantId, ownerUserId) {
  assert(rows.length === 2, `${expectedMode} must have exactly one scope and one plan approval event`);
  const first = rows[0];
  assert(first.expected_mode === expectedMode && first.mode === expectedMode, `${expectedMode} mode mismatch`);
  assert(first.tenant_id === tenantId, `${expectedMode} tenant mismatch`);
  assert(first.owner_user_id === ownerUserId, `${expectedMode} owner mismatch`);
  for (const row of rows) {
    for (const field of [
      'tenant_id', 'run_id', 'owner_user_id', 'owner_organization_id', 'mode', 'run_status',
      'evidence_readiness', 'final_artifact_id', 'final_artifact_hash', 'marker_source_commit',
      'input_tokens', 'output_tokens', 'total_tokens', 'search_calls',
      'estimated_cost_micros', 'operation_count', 'run_latency_ms',
    ]) {
      assert(row[field] === first[field], `${expectedMode} database join returned inconsistent ${field}`);
    }
    assert(
      canonicalJson(row.models) === canonicalJson(first.models),
      `${expectedMode} database join returned inconsistent provider models`
    );
  }
  assert(first.final_artifact_kind === 'final_markdown', `${expectedMode} final artifact is not Markdown`);
  assert(first.final_content_type === 'text/markdown' && first.final_markdown, `${expectedMode} final Markdown is empty`);
  assert(
    artifactContentHash({
      contentType: first.final_content_type,
      payload: first.final_payload,
      markdown: first.final_markdown,
    }) === first.final_artifact_hash,
    `${expectedMode} final artifact bytes do not match its immutable hash`
  );
  const finalPayload = FinalArtifactV1Schema.parse(first.final_payload);
  assert(finalPayload.markdown === first.final_markdown, `${expectedMode} final payload and Markdown column differ`);
  assert(
    finalPayload.evidenceReadiness === first.evidence_readiness,
    `${expectedMode} final artifact readiness differs from the run`
  );
  if (first.evidence_readiness !== 'ready') {
    assert(finalPayload.launchReady === false, `${expectedMode} gapped final artifact claims typed launch readiness`);
  }
  assert(
    ['execution', 'synthesis'].includes(first.final_producer_kind) &&
      first.final_producer_status === 'completed' &&
      first.final_producer_output_artifact_id === first.final_artifact_id,
    `${expectedMode} final artifact is not the exact output of a completed execution or synthesis stage`
  );
  const finalSources = first.final_sources || [];
  assert(
    finalSources.length === finalPayload.sourceArtifacts.length,
    `${expectedMode} final artifact sources did not resolve exactly`
  );
  finalSources.forEach((resolved, index) => {
    assert(exactRef(resolved.reference, finalPayload.sourceArtifacts[index]), `${expectedMode} final source order changed`);
    assert(
      resolved.resolvedTenantId === tenantId &&
        resolved.resolvedRunId === first.run_id &&
        resolved.resolvedArtifactId === resolved.reference.artifactId &&
        resolved.resolvedArtifactHash === resolved.reference.artifactHash &&
        resolved.resolvedArtifactKind === resolved.reference.kind,
      `${expectedMode} final source does not resolve to the same tenant/run artifact`
    );
  });
  const payloadSourceIds = finalPayload.sourceArtifacts
    .map((source) => source.artifactId)
    .sort();
  assert(
    canonicalJson(first.final_lineage_source_ids || []) === canonicalJson(payloadSourceIds),
    `${expectedMode} final artifact lineage differs from its immutable source references`
  );
  const run = {
    tenantId: first.tenant_id,
    ownerUserId: first.owner_user_id,
    ownerOrganizationId: first.owner_organization_id,
    mode: first.mode,
    runId: first.run_id,
    status: first.run_status,
    evidenceReadiness: first.evidence_readiness,
    launchReady: finalPayload.launchReady,
    finalArtifact: {
      artifactId: first.final_artifact_id,
      artifactHash: first.final_artifact_hash,
      kind: first.final_artifact_kind,
      markdown: first.final_markdown,
    },
    usage: {
      inputTokens: Number(first.input_tokens),
      outputTokens: Number(first.output_tokens),
      totalTokens: Number(first.total_tokens),
      searchCalls: Number(first.search_calls),
      estimatedCostMicros: Number(first.estimated_cost_micros),
      operationCount: Number(first.operation_count),
      models: first.models,
    },
    latencyMs: Number(first.run_latency_ms),
  };
  const byKind = Object.fromEntries(rows.map((row) => [row.approval_kind, row]));
  run.approvalBindings = {
    scope: verifyApproval(byKind.scope, run, 'scope'),
    plan: verifyApproval(byKind.plan, run, 'plan'),
  };
  for (const kind of ['scope', 'plan']) {
    assert(
      finalPayload.sourceArtifacts.some((source) =>
        exactRef(source, run.approvalBindings[kind].artifact)
      ),
      `${expectedMode} final artifact does not retain the accepted ${kind} provenance`
    );
  }
  if (first.final_producer_kind === 'execution') {
    assert(
      run.approvalBindings.plan.consumerAttempts.some(
        (consumer) => consumer.stageId === first.final_stage_id && consumer.attemptId === first.final_attempt_id
      ),
      `${expectedMode} directly promoted final artifact was not produced by an approved plan attempt`
    );
  }
  return LiveRunEvidenceSchema.parse(run);
}

export function verifyLiveEvidenceRows(rows, { tenantId, ownerUserId }) {
  assert(rows.length === 4, 'live evidence must resolve exactly four approval facts');
  const metadata = rows[0];
  for (const row of rows) {
    assert(row.captured_at.valueOf() === metadata.captured_at.valueOf(), 'capture is not one database snapshot');
    assert(row.database_name === 'orqaly_v2_preview_001', 'capture used the wrong database');
    assert(row.transaction_read_only === 'on', 'capture transaction was not read-only');
    for (const field of [
      'marker_component', 'marker_migration_number', 'marker_migration_path',
      'marker_migration_sha256', 'marker_bindings_path', 'marker_bindings_sha256',
      'marker_source_commit',
    ]) {
      assert(row[field] === metadata[field], `release marker ${field} changed within the capture`);
    }
    assert(
      canonicalJson(row.marker_additive_migrations) ===
        canonicalJson(metadata.marker_additive_migrations),
      'release marker additive migrations changed within the capture'
    );
  }
  const core = LiveEvidenceCoreSchema.parse({
    schemaVersion: 'orqaly.preview-live-database-evidence.v1',
    capturedAt: iso(metadata.captured_at),
    database: {
      name: metadata.database_name,
      transactionReadOnly: metadata.transaction_read_only === 'on',
      releaseMarker: {
        component: metadata.marker_component,
        migrationNumber: Number(metadata.marker_migration_number),
        migrationPath: metadata.marker_migration_path,
        migrationSha256: metadata.marker_migration_sha256,
        bindingsPath: metadata.marker_bindings_path,
        bindingsSha256: metadata.marker_bindings_sha256,
        sourceCommit: metadata.marker_source_commit,
        additiveMigrations: (metadata.marker_additive_migrations || []).map((migration) => ({
          migrationNumber: Number(migration.migrationNumber),
          migrationPath: migration.migrationPath,
          migrationSha256: migration.migrationSha256,
          sourceCommit: migration.sourceCommit,
        })),
      },
    },
    e2e: {
      simple: verifyRun(rows.filter((row) => row.expected_mode === 'simple'), 'simple', tenantId, ownerUserId),
      advanced: verifyRun(rows.filter((row) => row.expected_mode === 'advanced'), 'advanced', tenantId, ownerUserId),
    },
  });
  return LiveEvidenceSchema.parse({ ...core, attestationSha256: canonicalHash(core) });
}

export async function captureLiveEvidence({ connectionString, tenantId, ownerUserId, simpleRunId, advancedRunId }) {
  if (!connectionString) throw new Error('ORQALY_RELEASE_DATABASE_URL is required');
  const pool = new Pool({
    connectionString,
    application_name: 'orqaly-v2-preview-read-only-evidence',
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000,
    query_timeout: 30_000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SELECT set_config('orqaly.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(LIVE_EVIDENCE_QUERY, [tenantId, simpleRunId, advancedRunId, ownerUserId]);
    const evidence = verifyLiveEvidenceRows(result.rows, { tenantId, ownerUserId });
    await client.query('COMMIT');
    return evidence;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const tenantId = argument('--tenant-id');
  const ownerUserId = argument('--owner-user-id');
  const simpleRunId = argument('--simple-run-id');
  const advancedRunId = argument('--advanced-run-id');
  const outputPath = argument('--output');
  if (!tenantId || !ownerUserId || !simpleRunId || !advancedRunId || !outputPath) {
    throw new Error(
      'usage: node scripts/workflow-v2-live-evidence.mjs --tenant-id UUID --owner-user-id user_ID --simple-run-id UUID --advanced-run-id UUID --output /absolute/evidence.json'
    );
  }
  const evidence = await captureLiveEvidence({
    connectionString: process.env.ORQALY_RELEASE_DATABASE_URL,
    tenantId,
    ownerUserId,
    simpleRunId,
    advancedRunId,
  });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Wrote create-only read-only Preview database evidence ${evidence.attestationSha256}.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
