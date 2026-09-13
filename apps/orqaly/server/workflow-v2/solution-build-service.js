import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  AXWISE_OPERATION_CONTRACT_VERSION,
  AxWiseOperationEnvelopeSchema,
  AxWiseOperationResponseSchema,
  PrepareSolutionInputV1Schema,
  PrepareSolutionResponseV1Schema,
  PrepareSolutionInputV2Schema,
  PrepareSolutionResponseV2Schema,
} from '../../shared/workflow-v2/contracts.js';
import {
  AnswerSolutionBuildSchema,
  ConfirmSolutionBuildSchema,
  CreateSolutionBuildSchema,
  ReviewSolutionBuildSchema,
  SaveSolutionBuildSchema,
  SolutionBuildKeySchema,
  containsSolutionBuildSecret,
} from '../../shared/workflow-v2/solution-build-contracts.js';
import { compileSolutionBlueprint, compileSolutionWorkflow } from './solution-compiler.js';
import { reviewSolutionWorkflow } from './solution-workflow-review.js';
import { deterministicUuid } from './ids.js';
import { requestsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';
import { createNativeWorkflowKnowledge } from './native-workflow-knowledge.js';
import { reviewNativeWorkflow } from './native-workflow-review.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import {
  createNativeBuildOperations,
  nativeBuildProjection,
} from './native-solution-build-operations.js';
import { bindNativeConnections } from './native-workflow-connections.js';
import { normalizeNativeBundle } from './native-workflow-bundle.js';
import {
  projectNativeBuildDraft,
  assertNativeModelHasNoCredentialSelectors,
  bindNativeBuildBundle,
} from './native-build-model-context.js';

export class SolutionBuildError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'SolutionBuildError';
    this.code = code;
    this.status = status;
  }
}
const fail = (code, message, status) => {
  throw new SolutionBuildError(code, message, status);
};
const row = (result) => result.rows[0];
const same = (a, b) => hash(a) === hash(b);

// A repair may change implementation, not its agreed business contract or the
// execution profile. This runs before any completed provider result is stored.
export function assertNativePreparationContract(input, prepared) {
  if (prepared.baseWorkflowHash !== (input.draft?.workflowHash ?? null))
    throw new Error('native_design_base_changed');
  if (input.phase === 'repair' && prepared.spec) {
    for (const field of [
      'requirements',
      'inputSchema',
      'outputSchema',
      'acceptanceCases',
      'runtimeProfile',
    ]) {
      if (!input.draft?.spec || !same(prepared.spec[field], input.draft.spec[field]))
        throw new Error('native_repair_changed_acceptance_contract');
    }
    const before = input.draft.spec.ownedDependencies ?? [];
    const after = prepared.spec.ownedDependencies ?? [];
    if (before.length !== after.length)
      throw new Error('native_repair_changed_acceptance_contract');
    for (const dependency of after) {
      const previous = before.find(
        (item) => item.id === dependency.id && item.kind === dependency.kind
      );
      if (!previous) throw new Error('native_repair_changed_acceptance_contract');
      for (const field of [
        'requirements',
        'inputSchema',
        'outputSchema',
        'acceptanceCases',
        'runtimeProfile',
      ])
        if (!same(dependency.spec[field], previous.spec[field]))
          throw new Error('native_repair_changed_acceptance_contract');
    }
  }
}

export function nativeDesignFailureCode(attempt, response) {
  const allowed = new Set([
    'AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED',
    'AXWISE_SOLUTION_DESIGN_DEADLINE',
  ]);
  return attempt.envelope?.input?.type === 'PrepareSolutionV2' &&
    response?.status === 'failed' &&
    response.operationId === attempt.operation_id &&
    response.canonicalInputHash === attempt.input_hash &&
    allowed.has(response.errorClass)
    ? response.errorClass
    : 'BUILD_DESIGN_FAILED';
}

export function nativePreparedDraftState({ value, prepared, compiled, checked }) {
  const preserved =
    prepared.outcome !== 'candidate' &&
    prepared.workflow === null &&
    prepared.spec === null &&
    !!value.workflow &&
    !!value.spec &&
    !!value.workflow_hash;
  if (preserved && hash(value.workflow) !== value.workflow_hash)
    throw new Error('native_previous_draft_hash_mismatch');
  const candidate = prepared.outcome === 'candidate';
  const shouldRepair = !!(
    candidate &&
    compiled &&
    prepared.spec &&
    checked &&
    !checked.valid &&
    !prepared.questions.length &&
    (value.native_metadata?.repairCount ?? 0) < 3
  );
  return {
    preserved,
    shouldRepair,
    review: null,
    testEvidence: null,
    workflow: compiled?.workflow ?? (preserved ? value.workflow : null),
    workflowHash: compiled?.workflowHash ?? (preserved ? value.workflow_hash : null),
    spec: compiled?.spec ?? prepared.spec ?? (preserved ? value.spec : null),
    // A preserved prior draft is context for clarification, not a fresh model
    // candidate or validation result. Dependencies do not schedule model repair.
    status: shouldRepair
      ? 'preparing'
      : prepared.questions.length
        ? 'needs_input'
        : prepared.outcome === 'dependencies'
          ? 'unsupported'
          : compiled
            ? 'draft'
            : 'unsupported',
    stage: shouldRepair
      ? 'repairing'
      : prepared.questions.length
        ? 'needs_input'
        : prepared.outcome === 'dependencies'
          ? 'dependencies'
          : candidate && checked?.valid
            ? 'ready'
            : 'validating',
    autoRetest: candidate && value.native_metadata?.autoRetest === true,
  };
}
const uuid = (value) => z.uuid().parse(value);
const editable = new Set(['preparing', 'needs_input', 'draft', 'reviewed', 'failed']);
const jsonColumns = new Set([
  'partial_fields',
  'questions',
  'answers',
  'workflow',
  'spec',
  'review',
  'unsupported_capabilities',
  'native_metadata',
]);
const updateColumns = new Set([
  'name',
  'purpose',
  'status',
  'partial_fields',
  'questions',
  'answers',
  'workflow',
  'workflow_hash',
  'spec',
  'review',
  'explanation',
  'unsupported_capabilities',
  'solution_id',
  'input_version',
  'last_error',
  'native_metadata',
  'environment_id',
]);

function noSecrets(value) {
  if (containsSolutionBuildSecret(value))
    fail(
      'BUILD_SECRET_REJECTED',
      'Do not enter secrets here. Use the separate secure connection form.',
      400
    );
}
function safeNativeDraft(workflow, native = false) {
  noSecrets(workflow);
  const visit = (value, depth = 0) => {
    if (depth > 30) fail('BUILD_DRAFT_REJECTED', 'The draft is too deeply nested', 400);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (
        (native
          ? /^(password|apikey|accesstoken|clientsecret|authorization)$/i
          : /^(credentials|password|apikey|accesstoken|clientsecret|authorization)$/i
        ).test(key.replace(/[_-]/g, '')) &&
        child != null
      ) {
        fail('BUILD_SECRET_REJECTED', 'Credentials are not accepted in workflow drafts', 400);
      }
      visit(child, depth + 1);
    }
  };
  visit(workflow);
  return structuredClone(workflow);
}

// This private valid baseline supplies the compiler's invariant trigger/settings
// to the existing native validator. It is never displayed, stored or executed.
const validationSpec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'validation', target: 'validation', transform: 'copy' }],
};
export function reviewSolutionBuildWorkflow({ id, workflow, baseSpec = null }) {
  if (baseSpec?.kind === 'n8n_workflow_v2') {
    return reviewNativeWorkflow({ workflow, spec: baseSpec });
  }
  const baseline = baseSpec || validationSpec;
  const reviewed = reviewSolutionWorkflow({
    solutionId: id,
    baseWorkflow: compileSolutionWorkflow({ id, spec: baseline }).workflow,
    baseSpec: baseline,
    workflow,
  });
  if (!baseSpec && reviewed.valid) {
    reviewed.changes = reviewed.spec.fields.map((field) => ({
      kind: 'mapping_added',
      message: `${field.source} → ${field.target}: ${field.transform}`,
    }));
    reviewed.summary = `${reviewed.spec.fields.length} supported field mapping${reviewed.spec.fields.length === 1 ? '' : 's'} validated. No external providers or credentials are used.`;
  }
  return reviewed;
}

function publicBuild(value, attempt = null) {
  return {
    id: value.id,
    agentId: value.agent_id,
    runId: value.run_id,
    instruction: value.instruction,
    name: value.name,
    purpose: value.purpose,
    status: value.status,
    rowVersion: value.row_version,
    inputVersion: value.input_version,
    agent: value.agent_snapshot,
    source: { ...value.source_snapshot, request: value.source_snapshot.taskText },
    questions: value.questions,
    answers: value.answers,
    partialFields: value.partial_fields,
    workflow: value.workflow,
    workflowHash: value.workflow_hash,
    spec: value.spec,
    review: value.review,
    explanation: value.explanation,
    unsupportedCapabilities: value.unsupported_capabilities,
    solutionId: value.solution_id,
    lastError: value.last_error,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    runnable: false,
    ...(value.preparation_version === 2 ? nativeBuildProjection(value) : {}),
    operation: attempt
      ? { id: attempt.operation_id, status: attempt.status, inputVersion: attempt.input_version }
      : null,
  };
}

export function createSolutionBuildService({
  repository,
  agentService,
  axwiseClient,
  runtime = null,
  enableNativeWorkflows = false,
  knowledgeProvider = createNativeWorkflowKnowledge,
}) {
  const tx = (scope, fn) => repository.solutionBuildTransaction(scope, fn);
  async function owner(auth) {
    if (!auth?.userId) fail('UNAUTHENTICATED', 'Sign in required', 401);
    const tenantId = await repository.resolveTenant({ userId: auth.userId });
    if (!tenantId) fail('BUILD_NOT_FOUND', 'Build request not found', 404);
    return { tenantId, userId: auth.userId };
  }
  async function find(client, scope, id, lock = false) {
    const found = row(
      await client.query(
        `SELECT * FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 ${lock ? 'FOR UPDATE' : ''}`,
        [scope.tenantId, scope.userId, uuid(id)]
      )
    );
    if (!found) fail('BUILD_NOT_FOUND', 'Build request not found', 404);
    return found;
  }
  async function readFor(scope, id) {
    return tx(scope, async (client) => {
      const value = await find(client, scope, id);
      const attempt = row(
        await client.query(
          `SELECT operation_id,status,input_version FROM orqaly.solution_build_attempts
         WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 ORDER BY input_version DESC LIMIT 1`,
          [scope.tenantId, scope.userId, id]
        )
      );
      const buildRequest = publicBuild(value, attempt);
      return {
        buildRequest:
          value.preparation_version === 2
            ? await nativeOperations.describe(client, scope, value, buildRequest)
            : buildRequest,
      };
    });
  }
  async function bindConnections(client, scope, value, workflow, spec = value.spec) {
    const owned = (
      await client.query(
        `SELECT * FROM orqaly.solution_connections
      WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND status<>'revoked'`,
        [scope.tenantId, scope.userId, value.id]
      )
    ).rows;
    return bindNativeConnections(workflow, spec, owned, value.environment_id);
  }
  async function bindBundle(client, scope, value, workflow, spec) {
    const owned = (
      await client.query(
        `SELECT * FROM orqaly.solution_connections
      WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND status<>'revoked'`,
        [scope.tenantId, scope.userId, value.id]
      )
    ).rows;
    return bindNativeBuildBundle({ workflow, spec }, owned, value.environment_id);
  }
  function version(value, expected) {
    if (value.row_version !== expected)
      fail('BUILD_VERSION_CONFLICT', 'This build changed. Refresh before continuing.');
  }
  function canEdit(value) {
    if (!editable.has(value.status)) fail('BUILD_NOT_EDITABLE', 'This build is not editable');
  }
  async function update(client, scope, id, patch) {
    const params = [scope.tenantId, scope.userId, id];
    const columns = Object.entries(patch).map(([key, value]) => {
      if (!updateColumns.has(key)) throw new Error('invalid_build_update_column');
      params.push(value != null && jsonColumns.has(key) ? JSON.stringify(value) : value);
      return `${key}=$${params.length}`;
    });
    return row(
      await client.query(
        `UPDATE orqaly.solution_build_requests SET ${columns.join(',')},row_version=row_version+1,updated_at=clock_timestamp()
       WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 RETURNING *`,
        params
      )
    );
  }
  async function event(client, scope, value, kind, details = {}, key = null, commandHash = null) {
    await client.query(
      `INSERT INTO orqaly.solution_build_events(tenant_id,build_request_id,id,owner_user_id,kind,input_version,request_key,request_hash,details)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        scope.tenantId,
        value.id,
        randomUUID(),
        scope.userId,
        kind,
        value.input_version,
        key,
        commandHash,
        JSON.stringify(details),
      ]
    );
  }
  async function replay(client, scope, id, kind, key, command) {
    const prior = row(
      await client.query(
        `SELECT request_hash FROM orqaly.solution_build_events WHERE tenant_id=$1 AND owner_user_id=$2
       AND build_request_id=$3 AND kind=$4 AND request_key=$5`,
        [scope.tenantId, scope.userId, id, kind, key]
      )
    );
    if (!prior) return false;
    if (prior.request_hash !== hash(command))
      fail('IDEMPOTENCY_CONFLICT', 'This request key was reused with changed input');
    return true;
  }
  async function enqueue(client, scope, value) {
    const attemptId = deterministicUuid(value.id, 'design', String(value.input_version));
    const operationId = deterministicUuid(attemptId, 'axwise');
    const { id, name, profileVersion, roleLabel, description, instructions, profileHash } =
      value.agent_snapshot;
    const source = value.source_snapshot;
    const common = {
      buildRequestId: value.id,
      inputVersion: value.input_version,
      instruction: value.instruction,
      agent: { id, name, profileVersion, roleLabel, description, instructions, profileHash },
      source: {
        runId: value.run_id,
        taskHash: source.taskHash,
        title: source.title,
        taskText: source.taskText,
        contextHash: source.contextHash,
      },
      answers: value.answers,
    };
    const isNative = value.preparation_version === 2;
    const modelDraft = isNative ? projectNativeBuildDraft(value) : null;
    const input = isNative
      ? PrepareSolutionInputV2Schema.parse({
          ...common,
          type: 'PrepareSolutionV2',
          instruction: [value.instruction, value.native_metadata?.repairInstruction]
            .filter(Boolean)
            .join('\n\nRequested revision: ')
            .slice(0, 24000),
          knowledge: knowledgeProvider({
            instruction: value.instruction,
            phase: value.native_metadata?.phase === 'repair' ? 'repair' : 'design',
            draft: modelDraft,
          }),
          draft: modelDraft,
          diagnostics: (value.native_metadata?.diagnostics ?? []).slice(0, 40).map((issue) => ({
            code: String(issue.code ?? 'VALIDATION_FAILED').slice(0, 120),
            message: String(issue.message ?? issue).slice(0, 2000),
            ...(issue.nodeId ? { nodeId: String(issue.nodeId).slice(0, 120) } : {}),
          })),
          phase: value.native_metadata?.phase === 'repair' ? 'repair' : 'design',
          frozenAcceptanceCases: value.native_metadata?.frozenAcceptanceCases ?? [],
        })
      : PrepareSolutionInputV1Schema.parse({
          ...common,
          type: 'PrepareSolutionV1',
          draft: value.workflow
            ? { kind: 'webhook_transform_v1', fields: value.partial_fields }
            : null,
          supportedCapabilities: ['webhook_transform_v1'],
        });
    noSecrets(input);
    const envelope = AxWiseOperationEnvelopeSchema.parse({
      operationId,
      operationType: isNative ? 'PrepareSolutionV2' : 'PrepareSolutionV1',
      contractVersion: AXWISE_OPERATION_CONTRACT_VERSION,
      owner: { tenantId: scope.tenantId, userId: scope.userId, organizationId: null },
      workflow: {
        runId: value.run_id,
        stageId: deterministicUuid(value.id, 'design-stage'),
        stageAttemptId: attemptId,
      },
      canonicalInputHash: hash(input),
      input,
    });
    await client.query(
      `INSERT INTO orqaly.solution_build_attempts(tenant_id,build_request_id,id,owner_user_id,input_version,operation_id,input_hash,envelope)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id,build_request_id,input_version) DO NOTHING`,
      [
        scope.tenantId,
        value.id,
        attemptId,
        scope.userId,
        value.input_version,
        operationId,
        envelope.canonicalInputHash,
        JSON.stringify(envelope),
      ]
    );
  }
  async function supersede(client, scope, value) {
    await client.query(
      `UPDATE orqaly.solution_build_attempts SET status='superseded',lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
       WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND status IN ('pending','accepted')`,
      [scope.tenantId, scope.userId, value.id]
    );
  }

  const service = {
    async read(auth, id) {
      return readFor(await owner(auth), id);
    },
    async nativeSelection(auth, id) {
      return readFor(await owner(auth), id);
    },
    async list(auth, filter = {}) {
      const checked = z
        .object({ runId: z.uuid().optional(), agentId: z.uuid().optional() })
        .strict()
        .parse(filter);
      const scope = await owner(auth);
      return tx(scope, async (client) => ({
        buildRequests: (
          await client.query(
            `SELECT * FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2
         AND ($3::uuid IS NULL OR run_id=$3) AND ($4::uuid IS NULL OR agent_id=$4)
         ORDER BY created_at DESC,id DESC LIMIT 50`,
            [scope.tenantId, scope.userId, checked.runId || null, checked.agentId || null]
          )
        ).rows.map((value) => publicBuild(value)),
      }));
    },
    async create(auth, body, key) {
      const command = CreateSolutionBuildSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      const prior = await tx(scope, async (client) =>
        row(
          await client.query(
            `SELECT * FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND create_key=$3`,
            [scope.tenantId, scope.userId, key]
          )
        )
      );
      if (prior) {
        if (prior.create_hash !== hash(command))
          fail('IDEMPOTENCY_CONFLICT', 'This request key was reused with changed input');
        return readFor(scope, prior.id);
      }
      const snapshot = await repository.loadSnapshot(scope.tenantId, command.runId);
      if (
        !snapshot ||
        snapshot.run.tenantId !== scope.tenantId ||
        snapshot.run.ownerUserId !== scope.userId
      ) {
        fail('BUILD_SOURCE_NOT_FOUND', 'Task not found in your workspace', 404);
      }
      const execution = [...snapshot.attempts]
        .sort((a, b) => a.attemptNumber - b.attemptNumber)
        .find((attempt) => attempt.inputPayload?.executionAgent)?.inputPayload.executionAgent;
      if (
        execution &&
        (execution.runId !== command.runId ||
          execution.owner.tenantId !== scope.tenantId ||
          execution.owner.userId !== scope.userId)
      ) {
        fail('BUILD_SOURCE_INVALID', 'The task Agent binding could not be verified');
      }
      const agentId = command.agentId || execution?.id;
      if (!agentId)
        fail(
          'BUILD_AGENT_REQUIRED',
          'Select an Agent in your workspace to build this workflow',
          400
        );
      if (!agentService) fail('BUILD_AGENT_UNAVAILABLE', 'Agent service is unavailable', 503);
      const response = await agentService.read(auth, agentId);
      const agent = response.body?.agent;
      if (!agent || !['active', 'draft', 'proposed'].includes(agent.status ?? agent.state))
        fail('BUILD_AGENT_UNAVAILABLE', 'The selected Agent cannot accept new work', 409);
      if (agent.id && agent.id !== agentId)
        fail('BUILD_AGENT_UNAVAILABLE', 'The selected Agent identity could not be verified', 409);
      const profileVersion = agent.currentProfile ?? agent.profile ?? {};
      const profile = profileVersion.profile ?? profileVersion;
      const selectedProfile = {
        id: agentId,
        name: String(profile.displayName ?? profile.name ?? agent.name ?? 'Agent').slice(0, 120),
        profileVersion: Number(profileVersion.versionNumber ?? agent.profileVersion ?? 1),
        roleLabel: String(profile.roleLabel ?? 'Task executor').slice(0, 120),
        description: String(profile.description ?? '').slice(0, 2000),
        instructions: String(profile.instructions ?? '').slice(0, 12000),
      };
      const agentSnapshot = {
        ...selectedProfile,
        profileHash: hash(selectedProfile),
        profileReference: {
          id: profileVersion.id ?? null,
          contentHash: profileVersion.contentHash ?? null,
        },
      };
      const taskText = String(snapshot.run.request || '').slice(0, 24000);
      if (!taskText) fail('BUILD_SOURCE_INVALID', 'The task has no persisted source instruction');
      const artifacts = [
        ...new Map(
          [snapshot.run.finalArtifact, ...snapshot.stages.map((stage) => stage.outputArtifact)]
            .filter(Boolean)
            .map((artifact) => [artifact.artifactId, artifact])
        ).values(),
      ];
      const source = {
        runId: command.runId,
        taskHash: snapshot.run.requestHash,
        taskText,
        title: taskText.slice(0, 500),
        authority: 'reference_only',
        artifacts,
        ...(execution?.source
          ? { threadId: execution.source.threadId, turnId: execution.source.turnId }
          : {}),
      };
      source.contextHash = hash(source);
      noSecrets(source);
      noSecrets(agentSnapshot);
      const id = randomUUID();
      const createdId = await tx(scope, async (client) => {
        const created = row(
          await client.query(
            `INSERT INTO orqaly.solution_build_requests(tenant_id,id,owner_user_id,agent_id,run_id,instruction,source_snapshot,agent_snapshot,name,purpose,create_key,create_hash${enableNativeWorkflows ? ',preparation_version' : ''})
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12${enableNativeWorkflows ? ',2' : ''})
           ON CONFLICT (tenant_id,owner_user_id,create_key) DO NOTHING RETURNING *`,
            [
              scope.tenantId,
              id,
              scope.userId,
              agentId,
              command.runId,
              command.instruction,
              JSON.stringify(source),
              JSON.stringify(agentSnapshot),
              'Workflow build',
              command.instruction.slice(0, 2000),
              key,
              hash(command),
            ]
          )
        );
        if (!created) {
          const existing = row(
            await client.query(
              'SELECT * FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND create_key=$3',
              [scope.tenantId, scope.userId, key]
            )
          );
          if (existing.create_hash !== hash(command))
            fail('IDEMPOTENCY_CONFLICT', 'This request key was reused with changed input');
          return existing.id;
        }
        await enqueue(client, scope, created);
        await event(client, scope, created, 'created', {
          sourceHash: source.contextHash,
          agentProfileHash: agentSnapshot.profileHash,
        });
        return created.id;
      });
      return readFor(scope, createdId);
    },
    async answer(auth, id, body, key) {
      const command = AnswerSolutionBuildSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        if (await replay(client, scope, id, 'answered', key, command)) return;
        version(value, command.expectedVersion);
        if (value.status !== 'needs_input')
          fail('BUILD_NOT_WAITING', 'This build is not waiting for an answer');
        const question = value.questions.find((item) => item.id === command.questionId);
        if (!question)
          fail('BUILD_QUESTION_STALE', 'This question is no longer waiting for an answer');
        if (question.kind !== 'information')
          fail(
            'BUILD_SECURE_ACTION_REQUIRED',
            'Use the dedicated connection or setup action, not a chat answer.',
            400
          );
        const answers = [
          ...value.answers.filter((item) => item.questionId !== question.id),
          { questionId: question.id, value: command.value },
        ];
        if (answers.length > 32)
          fail('BUILD_INPUT_LIMIT', 'This build has reached its answer limit');
        const questions = value.questions.filter((item) => item.id !== question.id);
        await supersede(client, scope, value);
        const updated = await update(client, scope, id, {
          answers,
          questions,
          status: questions.length ? 'needs_input' : 'preparing',
          input_version: value.input_version + 1,
          review: null,
          last_error: null,
          ...(value.preparation_version === 2
            ? {
                native_metadata: {
                  ...value.native_metadata,
                  pendingTest: null,
                  autoRetest: false,
                  testEvidence: null,
                },
              }
            : {}),
        });
        await event(
          client,
          scope,
          updated,
          'answered',
          {
            question,
            answer: { questionId: question.id, value: command.value },
            previousInputVersion: value.input_version,
          },
          key,
          hash(command)
        );
        if (!questions.length) await enqueue(client, scope, updated);
      });
      return readFor(scope, id);
    },
    async saveDraft(auth, id, body) {
      const command = SaveSolutionBuildSchema.parse(body);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        const isNative = value.preparation_version === 2;
        const submitted = safeNativeDraft(command.workflow, isNative);
        const workflow = isNative
          ? normalizeNativeWorkflow({
              workflow: await bindConnections(client, scope, value, submitted),
              id,
            }).workflow
          : submitted;
        version(value, command.expectedVersion);
        canEdit(value);
        if (!value.workflow || value.workflow_hash !== command.workflowHash)
          fail('BUILD_DRAFT_CONFLICT', 'Refresh the current native draft before saving');
        if (same(value.workflow, workflow)) return;
        const checked = isNative
          ? (
              await nativeOperations.context(client, scope, {
                ...value,
                workflow,
                workflow_hash: hash(workflow),
              })
            ).checked
          : reviewSolutionBuildWorkflow({ id, workflow, baseSpec: value.spec });
        await supersede(client, scope, value);
        const updated = await update(client, scope, id, {
          workflow,
          workflow_hash: hash(workflow),
          spec: isNative ? value.spec : checked.valid ? checked.spec : null,
          partial_fields: isNative
            ? []
            : checked.valid
              ? checked.spec.fields
              : value.partial_fields,
          review: null,
          status: value.questions.length ? 'needs_input' : 'draft',
          input_version: value.input_version + 1,
          last_error: null,
          ...(isNative
            ? {
                native_metadata: {
                  ...value.native_metadata,
                  autoRetest: false,
                  pendingTest: null,
                  testEvidence: null,
                  diagnostics: checked.issues ?? [],
                  phase: 'design',
                  stage: 'validating',
                },
              }
            : {}),
        });
        await event(client, scope, updated, 'saved', {
          workflow,
          workflowHash: updated.workflow_hash,
        });
      });
      return readFor(scope, id);
    },
    async review(auth, id, body) {
      const command = ReviewSolutionBuildSchema.parse(body);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        version(value, command.expectedVersion);
        if (value.native_metadata?.pendingTest)
          fail(
            'BUILD_TEST_QUEUED',
            'Wait for the queued test or edit the draft to supersede it before review.'
          );
        if (value.questions.length)
          fail('BUILD_INPUT_REQUIRED', 'Answer the pending questions before review');
        if (!['draft', 'reviewed'].includes(value.status) || !value.workflow)
          fail('BUILD_NOT_READY', 'Wait for a supported workflow draft before review');
        const checked =
          value.preparation_version === 2
            ? (await nativeOperations.context(client, scope, value)).checked
            : reviewSolutionBuildWorkflow({
                id,
                workflow: value.workflow,
                baseSpec: null,
              });
        const review = {
          valid: checked.valid,
          summary: checked.summary,
          issues: checked.issues,
          changes: checked.changes,
          workflowHash: checked.valid ? checked.workflowHash : value.workflow_hash,
        };
        const updated = await update(client, scope, id, {
          workflow: checked.valid ? checked.workflow : value.workflow,
          workflow_hash: review.workflowHash,
          spec: value.preparation_version === 2 ? value.spec : checked.valid ? checked.spec : null,
          review,
          status: checked.valid ? 'reviewed' : 'draft',
          partial_fields:
            value.preparation_version === 2
              ? []
              : checked.valid
                ? checked.spec.fields
                : value.partial_fields,
          ...(value.preparation_version === 2
            ? {
                native_metadata: {
                  ...value.native_metadata,
                  diagnostics: checked.issues ?? [],
                  validation: checked,
                },
              }
            : {}),
        });
        await event(client, scope, updated, 'reviewed', {
          review,
          workflowHash: updated.workflow_hash,
        });
      });
      return readFor(scope, id);
    },
    async confirm(auth, id, body, key) {
      const command = ConfirmSolutionBuildSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        if (await replay(client, scope, id, 'handed_off', key, command)) return;
        version(value, command.expectedVersion);
        if (
          value.status !== 'reviewed' ||
          value.questions.length ||
          !value.review?.valid ||
          !value.spec ||
          value.workflow_hash !== command.workflowHash ||
          value.review.workflowHash !== command.workflowHash ||
          hash(value.workflow) !== command.workflowHash
        )
          fail(
            'BUILD_NOT_REVIEWED',
            'Review this exact complete workflow before creating a Solution'
          );
        const checked =
          value.preparation_version === 2
            ? (await nativeOperations.context(client, scope, value)).checked
            : reviewSolutionBuildWorkflow({
                id,
                workflow: value.workflow,
                baseSpec: value.spec,
              });
        if (!checked.valid || checked.workflowHash !== command.workflowHash)
          fail('BUILD_REVIEW_STALE', 'The reviewed workflow could not be verified');
        if (value.preparation_version === 2)
          await nativeOperations.assertHandoff(client, scope, value);
        const creation = {
          agentId: value.agent_id,
          name: value.name,
          purpose: value.purpose,
          spec: value.spec,
          workflowHash: command.workflowHash,
          buildRequestId: id,
        };
        const inserted = row(
          await client.query(
            `INSERT INTO orqaly.customer_solutions(tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash,build_request_id${value.preparation_version === 2 ? ',environment_id' : ''})
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$2${value.preparation_version === 2 ? ',$13' : ''})
           ON CONFLICT (tenant_id,id) DO NOTHING RETURNING *`,
            [
              scope.tenantId,
              id,
              scope.userId,
              value.agent_id,
              value.name,
              value.purpose,
              JSON.stringify(value.spec),
              JSON.stringify(value.agent_snapshot),
              JSON.stringify(value.workflow),
              command.workflowHash,
              `build_${id}`,
              hash(creation),
              ...(value.preparation_version === 2 ? [value.environment_id] : []),
            ]
          )
        );
        if (!inserted) {
          const existing = row(
            await client.query(
              'SELECT * FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
              [scope.tenantId, scope.userId, id]
            )
          );
          if (
            !existing ||
            existing.build_request_id !== id ||
            existing.workflow_hash !== command.workflowHash ||
            existing.create_hash !== hash(creation)
          )
            fail('BUILD_HANDOFF_CONFLICT', 'The Solution identity is already in use');
        }
        const updated = await update(client, scope, id, { status: 'completed', solution_id: id });
        await event(
          client,
          scope,
          updated,
          'handed_off',
          { solutionId: id, workflowHash: command.workflowHash },
          key,
          hash(command)
        );
      });
      return readFor(scope, id);
    },
    async retry(auth, id, body, key) {
      const command = ReviewSolutionBuildSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        if (await replay(client, scope, id, 'retried', key, command)) return;
        version(value, command.expectedVersion);
        if (value.status !== 'failed')
          fail('BUILD_RETRY_UNAVAILABLE', 'Only a failed design can be retried');
        const updated = await update(client, scope, id, {
          status: 'preparing',
          input_version: value.input_version + 1,
          last_error: null,
          review: null,
          ...(value.preparation_version === 2
            ? {
                native_metadata: {
                  ...value.native_metadata,
                  pendingTest: null,
                  autoRetest: false,
                  testEvidence: null,
                },
              }
            : {}),
        });
        await enqueue(client, scope, updated);
        await event(client, scope, updated, 'retried', {}, key, hash(command));
      });
      return readFor(scope, id);
    },
    async advancePending({ workerId = 'solution-build-worker' } = {}) {
      if (!axwiseClient) return { processed: false, reason: 'axwise_unavailable' };
      const claim = await repository.claimSolutionBuildAttempt(workerId, randomUUID(), 180);
      if (!claim)
        return enableNativeWorkflows ? nativeOperations.advancePendingTest() : { processed: false };
      const scope = { tenantId: claim.tenantId, userId: claim.userId };
      const attempt = await tx(scope, async (client) => {
        const value = await find(client, scope, claim.buildRequestId, true);
        const current = row(
          await client.query(
            `SELECT * FROM orqaly.solution_build_attempts WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 AND lease_token=$4`,
            [scope.tenantId, scope.userId, claim.attemptId, claim.leaseToken]
          )
        );
        if (!current || !['pending', 'accepted'].includes(current.status)) return null;
        if (value.input_version !== current.input_version || value.status !== 'preparing') {
          await client.query(
            "UPDATE orqaly.solution_build_attempts SET status='superseded',lease_token=NULL,lease_expires_at=NULL WHERE tenant_id=$1 AND id=$2 AND lease_token=$3",
            [scope.tenantId, current.id, claim.leaseToken]
          );
          return null;
        }
        return current;
      });
      if (!attempt) return { processed: true, stale: true };
      let response;
      let failure;
      try {
        const envelope = AxWiseOperationEnvelopeSchema.parse(attempt.envelope);
        if (
          envelope.operationId !== attempt.operation_id ||
          envelope.canonicalInputHash !== attempt.input_hash ||
          envelope.owner.tenantId !== scope.tenantId ||
          envelope.owner.userId !== scope.userId
        )
          throw new Error('invalid_build_attempt');
        response = attempt.status_url
          ? await axwiseClient.poll(attempt.status_url, attempt.operation_id, scope.tenantId)
          : await axwiseClient.submit(envelope);
        response = AxWiseOperationResponseSchema.parse(response);
        if (
          response.operationId !== attempt.operation_id ||
          response.canonicalInputHash !== attempt.input_hash
        )
          throw new Error('invalid_build_response');
        if (response.status === 'completed') {
          if (response.result?.resultType !== 'solution_prepared')
            throw new Error('invalid_build_result_type');
          const isNative = attempt.envelope.input.type === 'PrepareSolutionV2';
          const prepared = (
            isNative ? PrepareSolutionResponseV2Schema : PrepareSolutionResponseV1Schema
          ).parse(response.result.response);
          if (
            prepared.buildRequestId !== claim.buildRequestId ||
            prepared.inputVersion !== attempt.input_version
          )
            throw new Error('invalid_build_result_version');
          noSecrets(prepared);
          if (
            prepared.questions.some(
              (question) =>
                question.kind === 'information' &&
                requestsSolutionBuildSecret(`${question.prompt}\n${question.reason}`)
            )
          ) {
            throw new Error('unsupported_credential_question');
          }
          // Reject invalid partial mappings before the completion transaction,
          // so a bad provider result is recorded as failed instead of endlessly
          // reclaiming a lease whose transaction always rolls back.
          if (isNative) {
            assertNativePreparationContract(attempt.envelope.input, prepared);
            if (prepared.workflow) {
              assertNativeModelHasNoCredentialSelectors(prepared.workflow, prepared.spec);
              normalizeNativeBundle({
                workflow: safeNativeDraft(prepared.workflow, true),
                spec: prepared.spec,
                id: claim.buildRequestId,
              });
            }
          } else if (prepared.outcome !== 'unsupported')
            compileSolutionBlueprint({ id: claim.buildRequestId, fields: prepared.partialFields });
        }
      } catch (error) {
        failure = {
          retryable: error.retryable === true && attempt.dispatch_count < 240,
          notFound: error.disposition === 'not_found',
          code:
            error.retryable === true
              ? 'BUILD_DESIGN_RETRY_PENDING'
              : 'BUILD_DESIGN_INVALID_RESPONSE',
        };
      }
      await tx(scope, async (client) => {
        const value = await find(client, scope, claim.buildRequestId, true);
        const current = row(
          await client.query(
            'SELECT * FROM orqaly.solution_build_attempts WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 FOR UPDATE',
            [scope.tenantId, scope.userId, attempt.id]
          )
        );
        if (
          !current ||
          current.lease_token !== claim.leaseToken ||
          !['pending', 'accepted'].includes(current.status)
        )
          return;
        const finishAttempt = async (
          status,
          result = null,
          statusUrl = null,
          waitSeconds = 2,
          errorCode = null
        ) => {
          await client.query(
            `UPDATE orqaly.solution_build_attempts SET status=$4,result=$5,status_url=$6,next_at=clock_timestamp()+make_interval(secs=>$7),
             last_error=$8,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
             WHERE tenant_id=$1 AND id=$2 AND lease_token=$3`,
            [
              scope.tenantId,
              attempt.id,
              claim.leaseToken,
              status,
              result ? JSON.stringify(result) : null,
              statusUrl,
              waitSeconds,
              errorCode,
            ]
          );
        };
        if (value.input_version !== attempt.input_version || value.status !== 'preparing') {
          await finishAttempt('superseded');
          await event(client, scope, value, 'design_superseded', {
            operationId: attempt.operation_id,
            inputVersion: attempt.input_version,
          });
          return;
        }
        if (failure?.retryable) {
          await finishAttempt(
            failure.notFound ? 'pending' : attempt.status,
            null,
            failure.notFound ? null : attempt.status_url,
            5,
            failure.code
          );
          await update(client, scope, value.id, { last_error: failure.code });
          return;
        }
        if (failure || ['failed', 'cancelled'].includes(response?.status)) {
          const code = failure?.code || nativeDesignFailureCode(attempt, response);
          await finishAttempt('failed', null, null, 2, code);
          const updated = await update(client, scope, value.id, {
            status: 'failed',
            last_error: code,
          });
          await event(client, scope, updated, 'design_failed', {
            operationId: attempt.operation_id,
            errorCode: code,
          });
          return;
        }
        if (['accepted', 'running', 'cancel_requested'].includes(response.status)) {
          await finishAttempt(
            'accepted',
            null,
            response.statusUrl,
            Math.max(1, Math.min(300, response.retryAfterSeconds || 2))
          );
          return;
        }
        if (attempt.envelope.input.type === 'PrepareSolutionV2') {
          const prepared = PrepareSolutionResponseV2Schema.parse(response.result.response);
          const compiled = prepared.workflow
            ? normalizeNativeBundle({
                ...(await bindBundle(client, scope, value, prepared.workflow, prepared.spec)),
                id: value.id,
              })
            : null;
          const checked = compiled
            ? reviewNativeWorkflow({ workflow: compiled.workflow, spec: compiled.spec })
            : null;
          const draftState = nativePreparedDraftState({ value, prepared, compiled, checked });
          const diagnostics = (checked?.issues ?? []).slice(0, 40).map((issue) => ({
            code: String(issue.code || 'NATIVE_VALIDATION_FAILED')
              .replace(/[^A-Za-z0-9_.:-]/g, '_')
              .slice(0, 120),
            message: String(issue.message || 'The draft did not pass validation.').slice(0, 2000),
            ...(issue.nodeId ? { nodeId: String(issue.nodeId).slice(0, 120) } : {}),
          }));
          const metadata = {
            ...value.native_metadata,
            stage: draftState.stage,
            autoRetest: draftState.autoRetest,
            preservedDraft: draftState.preserved,
            diagnostics,
            validation: checked
              ? {
                  valid: checked.valid,
                  issues: checked.issues,
                  summary: checked.summary,
                  execution: checked.execution,
                  dependencies: checked.dependencies,
                }
              : null,
            dependencies: prepared.dependencies,
            semanticReview: prepared.semanticReview,
            catalogHash: attempt.envelope.input.knowledge.catalogHash,
            knowledgeVersion: attempt.envelope.input.knowledge.version,
            generation: {
              operationId: attempt.operation_id,
              inputVersion: attempt.input_version,
              metrics: response.result.metrics ?? null,
            },
            skills: attempt.envelope.input.knowledge.skills.map(
              ({ id, sourceCommit, contentHash }) => ({ id, sourceCommit, contentHash })
            ),
            frozenAcceptanceCases: value.native_metadata?.frozenAcceptanceCases?.length
              ? value.native_metadata.frozenAcceptanceCases
              : (draftState.spec?.acceptanceCases ?? []),
            testEvidence: draftState.testEvidence,
            pendingTest: null,
          };
          const { shouldRepair } = draftState;
          if (shouldRepair)
            Object.assign(metadata, {
              phase: 'repair',
              stage: 'repairing',
              repairCount: (metadata.repairCount ?? 0) + 1,
            });
          const updated = await update(client, scope, value.id, {
            name: prepared.name,
            purpose: prepared.purpose,
            status: draftState.status,
            partial_fields: [],
            questions: prepared.questions,
            spec: draftState.spec,
            workflow: draftState.workflow,
            workflow_hash: draftState.workflowHash,
            review: draftState.review,
            explanation: prepared.explanation.slice(0, 2000),
            unsupported_capabilities: prepared.dependencies.map((dependency) =>
              dependency.description.slice(0, 120)
            ),
            last_error: null,
            native_metadata: metadata,
            ...(shouldRepair ? { input_version: value.input_version + 1 } : {}),
          });
          await finishAttempt('completed', prepared);
          await event(client, scope, updated, 'design_completed', {
            operationId: attempt.operation_id,
            outcome: prepared.outcome,
            workflowHash: updated.workflow_hash,
            questions: prepared.questions,
            validation: metadata.validation,
            skills: metadata.skills,
            catalogHash: metadata.catalogHash,
            generation: metadata.generation,
          });
          if (shouldRepair) await enqueue(client, scope, updated);
          return;
        }
        const prepared = PrepareSolutionResponseV1Schema.parse(response.result.response);
        const compiled =
          prepared.outcome === 'unsupported'
            ? null
            : compileSolutionBlueprint({ id: value.id, fields: prepared.partialFields });
        if (compiled && value.workflow) {
          for (const node of compiled.workflow.nodes) {
            const previous = value.workflow.nodes?.find((item) => item.id === node.id);
            if (
              Array.isArray(previous?.position) &&
              previous.position.length === 2 &&
              previous.position.every((x) => Number.isFinite(x) && Math.abs(x) <= 100000)
            )
              node.position = [...previous.position];
          }
          compiled.workflowHash = hash(compiled.workflow);
        }
        const updated = await update(client, scope, value.id, {
          name: prepared.name,
          purpose: prepared.purpose,
          status: prepared.outcome === 'candidate' ? 'draft' : prepared.outcome,
          partial_fields: prepared.partialFields,
          questions: prepared.questions,
          spec: prepared.spec,
          workflow: compiled?.workflow || null,
          workflow_hash: compiled?.workflowHash || null,
          review: null,
          explanation: prepared.explanation,
          unsupported_capabilities: prepared.unsupportedCapabilities,
          last_error: null,
        });
        await finishAttempt('completed', prepared);
        await event(client, scope, updated, 'design_completed', {
          operationId: attempt.operation_id,
          outcome: prepared.outcome,
          workflowHash: updated.workflow_hash,
          questions: prepared.questions,
        });
      });
      return { processed: true, buildRequestId: claim.buildRequestId };
    },
  };
  const nativeOperations = createNativeBuildOperations({
    enableTests: enableNativeWorkflows,
    repository,
    runtime,
    axwiseClient,
    tx,
    owner,
    find,
    update,
    event,
    replay,
    readFor,
    version,
    enqueue,
    supersede,
    fail,
    publicBuild,
  });
  return { ...service, ...nativeOperations.methods };
}
