import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { artifactContentHash } from '../lib/workflow-v2/canonical.js';
import { createWorkflowCommandService } from '../server/workflow-v2/command-service.js';
import { createInternalActivityExecutor } from '../server/workflow-v2/internal-activity-executor.js';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createWorkerEngine } from '../server/workflow-v2/worker-engine.js';
import {
  configuredModes,
  createResearchCompletion,
  createScopeCompletion,
  createTaskCompletion,
  createEvaluationCompletion,
  createSynthesisCompletion,
  LOCAL_E2E_REQUEST,
} from './workflow-v2-local-e2e-fixtures.mjs';
import { processWorkerWithBoundedIdle } from './workflow-v2-local-e2e-polling.mjs';

const { Client } = pg;
const databaseUrl = process.env.WORKFLOW_V2_E2E_DATABASE_URL;
if (!databaseUrl) throw new Error('WORKFLOW_V2_E2E_DATABASE_URL is required');

function assert(value, message) {
  if (!value) throw new Error(message);
}

function roleUrl(role) {
  const value = new URL(databaseUrl);
  value.searchParams.set('options', `-c role=${role}`);
  return value.href;
}

const admin = new Client({ connectionString: databaseUrl });
await admin.connect();
if (process.env.WORKFLOW_V2_APPLY_BASELINE === '1') {
  for (const migration of [
    '001_clean_workflow_v2.sql',
    '002_assistant_goal.sql',
    '003_personal_tenant_jit.sql',
    '004_assistant_retry_lineage.sql',
    '005_assistant_turn_events.sql',
    '006_assistant_turn_provenance.sql',
    '007_assistant_grounded_sources_reason.sql',
  ]) {
    await admin.query(
      await readFile(
        new URL(`../database/workflow-v2/migrations/${migration}`, import.meta.url),
        'utf8'
      )
    );
  }
}
const tenantId = randomUUID();
const userId = `user_locale2e${Date.now()}`;
await admin.query(`INSERT INTO orqaly.tenants (id, display_name) VALUES ($1, 'Local E2E')`, [
  tenantId,
]);
await admin.query(
  `INSERT INTO orqaly.tenant_identity_bindings
     (tenant_id, environment, subject_type, subject_id)
   VALUES ($1, 'preview', 'user', $2)`,
  [tenantId, userId]
);
await admin.query(`SELECT set_config('orqaly.tenant_id', $1, false)`, [tenantId]);
await admin.query(
  `INSERT INTO orqaly.tenant_agents
     (tenant_id, id, name, capabilities, tool_ids, quality_score, cost_per_run_cents)
   VALUES ($1, $2, 'Preview analyst',
     ARRAY['evidence_synthesis', 'prd', 'product_strategy', 'research'], '{}', 0.95, 20)`,
  [tenantId, randomUUID()]
);
const capableCatalogue = await admin.query(
  `SELECT id
     FROM orqaly.tenant_agents
    WHERE tenant_id = $1
      AND status = 'active'
      AND capabilities @> ARRAY['evidence_synthesis', 'prd', 'product_strategy']::text[]`,
  [tenantId]
);
assert(
  capableCatalogue.rowCount > 0,
  'Preview catalogue has no tenant agent capable of every bounded software-PRD role'
);

const repository = createPostgresRepositories({
  environment: 'preview',
  identityDatabaseUrl: roleUrl('orqaly_identity'),
  apiDatabaseUrl: roleUrl('orqaly_api'),
  workerDatabaseUrl: roleUrl('orqaly_worker'),
});
const commands = createWorkflowCommandService({ repository });
const internal = createInternalActivityExecutor();
const exported = [];

const activityExecutor = {
  async execute({ context, snapshot, claim }) {
    if (context.stageKind === 'compile_scope') {
      return {
        kind: 'completed',
        result: createScopeCompletion({
          request: context.inputPayload.request,
          inputHash: context.inputHash,
        }),
      };
    }
    if (context.stageKind === 'execute_research') {
      return {
        kind: 'completed',
        result: createResearchCompletion({ input: context.inputPayload }),
      };
    }
    if (context.stageKind === 'execution') {
      return {
        kind: 'completed',
        result: createTaskCompletion({ input: context.inputPayload }),
      };
    }
    if (context.stageKind === 'evaluation') {
      return {
        kind: 'completed',
        result: createEvaluationCompletion({ input: context.inputPayload }),
      };
    }
    if (context.stageKind === 'synthesis') {
      return {
        kind: 'completed',
        result: createSynthesisCompletion({ input: context.inputPayload }),
      };
    }
    return internal.execute({ context, snapshot, claim });
  },
};

const finalArtifactExporter = {
  async exportFinalMarkdown({ tenantId: exportedTenantId, runId, artifact }) {
    assert(exportedTenantId === tenantId, 'export crossed the tenant boundary');
    assert(artifact.kind === 'final_markdown', 'export did not load a final Markdown artifact');
    assert(artifactContentHash(artifact) === artifact.artifactHash, 'export artifact hash drifted');
    const receipt = {
      objectName: `${exportedTenantId}/${runId}/${artifact.artifactHash}.md`,
      artifactHash: artifact.artifactHash,
    };
    exported.push({ tenantId: exportedTenantId, runId, artifact, receipt });
    return receipt;
  },
};

const worker = createWorkerEngine({
  repository,
  activityExecutor,
  finalArtifactExporter,
  workerId: 'local-preview-e2e',
  deploymentId: 'local-preview-revision-a',
});

async function approveIfNeeded(workflow) {
  const gate = workflow.stages.find(
    (stage) => ['gate_1', 'gate_2'].includes(stage.kind) && stage.status === 'awaiting_approval'
  );
  if (!gate) return workflow;
  const scope = gate.kind === 'gate_1';
  const producer = workflow.stages.find((stage) =>
    scope ? stage.kind === 'compile_scope' : stage.kind === 'planning'
  );
  const response = await commands.approve({ userId }, workflow.run.id, {
    type: 'approve_artifact',
    commandId: randomUUID(),
    issuedAt: new Date().toISOString(),
    approvalKind: scope ? 'scope' : 'plan',
    artifact: producer.outputArtifact,
    selectedEvidence: [],
    idempotencyKey: `${scope ? 'scope' : 'plan'}:${producer.outputArtifact.artifactHash}`,
  });
  return response.workflow;
}

async function runMode(mode) {
  const started = await commands.start(
    { userId },
    {
      commandId: randomUUID(),
      issuedAt: new Date().toISOString(),
      mode,
      request: LOCAL_E2E_REQUEST,
    }
  );
  let workflow = started.workflow;
  for (let index = 0; index < 40; index += 1) {
    workflow = await approveIfNeeded(workflow);
    if (
      ['completed', 'completed_with_evidence_gaps', 'blocked', 'failed'].includes(
        workflow.run.status
      )
    ) {
      break;
    }
    await processWorkerWithBoundedIdle({
      processOne: () => worker.processOne(),
      readWorkflow: () => commands.read({ userId }, workflow.run.id),
      label: 'workflow processing',
    });
    workflow = await commands.read({ userId }, workflow.run.id);
  }
  assert(
    workflow.run.status === 'completed_with_evidence_gaps',
    `unexpected terminal status ${workflow.run.status}`
  );
  const synthesisStage = workflow.stages.find((stage) => stage.kind === 'synthesis');
  assert(
    synthesisStage?.status === 'completed',
    'multi-artifact plan did not complete the authorized consolidation pass'
  );
  assert(
    workflow.attempts.filter((attempt) => attempt.stageId === synthesisStage.id).length === 1,
    'multi-artifact plan did not use exactly one synthesis attempt'
  );
  const finalProducer = workflow.stages.find(
    (stage) => stage.outputArtifact?.artifactId === workflow.run.finalArtifact?.artifactId
  );
  assert(finalProducer?.kind === 'synthesis', 'final artifact did not come from bounded synthesis');
  const final = await commands.artifact(
    { userId },
    workflow.run.id,
    workflow.run.finalArtifact.artifactId
  );
  assert(final.markdown?.startsWith('# Product requirements document'), 'final Markdown missing');
  assert(final.markdown.includes('## Evidence gaps and assumptions'), 'gaps were not labeled');
  assert(
    final.payload.launchReady === false,
    'gapped final artifact claimed typed launch readiness'
  );

  const exportResult = await processWorkerWithBoundedIdle({
    processOne: () => worker.processOne(),
    readWorkflow: () => commands.read({ userId }, workflow.run.id),
    label: 'terminal export',
  });
  assert(exportResult.status === 'exported', 'terminal export outbox was not claimed and acked');
  const record = exported.find((item) => item.runId === workflow.run.id);
  assert(
    record?.artifact.artifactHash === final.artifactHash,
    'export did not use exact final hash'
  );
  assert(record?.artifact.markdown === final.markdown, 'export did not use exact final Markdown');

  const durable = await admin.query(
    `SELECT
       (SELECT count(*)::integer FROM orqaly.stage_attempts
          WHERE tenant_id = $1 AND run_id = $2 AND status = 'failed') AS failed_attempts,
       (SELECT count(*)::integer FROM orqaly.outbox_events
          WHERE tenant_id = $1 AND run_id = $2 AND status <> 'completed') AS open_outbox,
       (SELECT count(*)::integer FROM orqaly.outbox_events
          WHERE tenant_id = $1 AND run_id = $2
            AND command_type = 'export_final_artifact') AS export_rows`,
    [tenantId, workflow.run.id]
  );
  assert(durable.rows[0].failed_attempts === 0, 'thin vertical unexpectedly retried or failed');
  assert(durable.rows[0].open_outbox === 0, 'thin vertical left durable outbox work open');
  assert(durable.rows[0].export_rows === 1, 'final export work was duplicated or missing');

  return {
    mode: workflow.run.mode,
    status: workflow.run.status,
    stages: workflow.stages.length,
    attempts: workflow.attempts.length,
    finalArtifactId: workflow.run.finalArtifact.artifactId,
  };
}

try {
  const summaries = [];
  for (const mode of configuredModes(process.env.WORKFLOW_V2_E2E_MODE)) {
    summaries.push(await runMode(mode));
  }
  console.log('workflow-v2-local-e2e-passed', summaries);
} finally {
  await repository.close();
  await admin.end();
}
