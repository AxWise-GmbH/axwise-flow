import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSolutionBuildService } from '../server/workflow-v2/solution-build-service.js';
import { createSolutionService } from '../server/workflow-v2/solution-service.js';
import { createSolutionRevisionService } from '../server/workflow-v2/solution-revision-service.js';
import { createSolutionApplicationKeyService } from '../server/workflow-v2/solution-application-key-service.js';
import { startNativeOutboundLocalRuntime } from './native-outbound-local-runtime.mjs';
import { nativeOutboundFixture } from './fixtures/native-outbound-workflow.mjs';

// Called from the real PostgreSQL16 harness. Model design is a declared fixture;
// all DB transactions, worker claims, credentials, n8n and TLS effects are real.
export async function runNativeOutboundBuildAcceptance({
  repository,
  workerRepository,
  admin,
  auth,
  agentId,
  runId,
  agentService,
}) {
  const tenantId = await repository.resolveTenant(auth);
  const scope = { tenantId, userId: auth.userId };
  const local = await startNativeOutboundLocalRuntime(scope);
  const fixture = nativeOutboundFixture();
  let buildId;
  const log = (message) => console.log(`check: bounded outbound ${message}`);
  const axwiseClient = {
    submit: async (envelope) => ({
      operationId: envelope.operationId,
      status: 'completed',
      canonicalInputHash: envelope.canonicalInputHash,
      result: {
        resultType: 'solution_prepared',
        response: {
          schemaVersion: 'axwise.solution-preparation.v2',
          buildRequestId: envelope.input.buildRequestId,
          inputVersion: envelope.input.inputVersion,
          outcome: 'candidate',
          name: 'Deliver approved event',
          purpose: 'Send a bounded event to the explicitly connected customer receiver',
          explanation:
            'A declared model fixture supplies the native graph; all following execution evidence is real.',
          workflow: structuredClone(fixture.workflow),
          spec: structuredClone(fixture.spec),
          questions: [],
          dependencies: [],
          baseWorkflowHash: envelope.input.draft?.workflowHash ?? null,
          semanticReview: {
            advisory: true,
            summary: 'The approved event and acknowledgement contract are represented.',
            concerns: [],
          },
        },
      },
    }),
  };
  const makeWorker = () =>
    createSolutionBuildService({
      repository: workerRepository,
      axwiseClient,
      runtime: local.runtime,
      enableNativeWorkflows: true,
    });
  const builds = createSolutionBuildService({
    repository,
    agentService,
    axwiseClient,
    runtime: local.runtime,
    enableNativeWorkflows: true,
  });
  const current = async () => (await builds.read(auth, buildId)).buildRequest;
  const hits = () => local.receiverProof().counts['/ok'] ?? 0;
  try {
    log('real task -> native graph -> secure connection');
    let build = (
      await builds.create(
        auth,
        {
          runId,
          agentId,
          instruction:
            'Build the approved JSON event webhook and POST its event to https://outbound-fixture.orqaly.example/ok using a separately connected credential; return only a delivery receipt.',
        },
        `outbound_create_${randomUUID()}`
      )
    ).buildRequest;
    buildId = build.id;
    await makeWorker().advancePending();
    build = await current();
    assert.equal(build.spec.kind, 'n8n_workflow_v2');
    assert.equal(build.workflow.nodes[1].type, 'CUSTOM.boundedHttp');
    assert.equal(hits(), 0);
    build = (
      await builds.createConnection(
        auth,
        buildId,
        {
          expectedVersion: build.rowVersion,
          requirementId: 'receiver',
          credentials: local.receiverCredential(),
        },
        `outbound_connect_${randomUUID()}`
      )
    ).buildRequest;
    assert.equal(hits(), 0, 'saving a credential must never test it');
    assert.equal(build.connectionRequirements[0].status, 'saved');
    log('no effect before explicit queued consent; recreated worker owns execution');
    await assert.rejects(
      builds.test(
        auth,
        buildId,
        {
          expectedVersion: build.rowVersion,
          workflowHash: build.workflowHash,
          allowExternalEffects: false,
          repairOnFailure: false,
        },
        `outbound_denied_${randomUUID()}`
      )
    );
    assert.equal(hits(), 0);
    const testKey = `outbound_test_${randomUUID()}`;
    const consent = {
      expectedVersion: build.rowVersion,
      workflowHash: build.workflowHash,
      allowExternalEffects: true,
      repairOnFailure: false,
    };
    build = (await builds.test(auth, buildId, consent, testKey)).buildRequest;
    assert.equal(build.testEvidence.status, 'queued');
    assert.equal(hits(), 0);
    assert.equal(
      (
        await admin.query(
          'SELECT count(*)::int AS total FROM orqaly.solution_build_tests WHERE tenant_id=$1 AND build_request_id=$2',
          [tenantId, buildId]
        )
      ).rows[0].total,
      0
    );
    await makeWorker().advancePending();
    build = await current();
    assert.equal(build.testEvidence.status, 'succeeded', JSON.stringify(build.testEvidence));
    assert.equal(hits(), 1);
    assert.equal(build.connectionRequirements[0].status, 'verified');
    const verifiedConnection = (
      await admin.query(
        'SELECT id FROM orqaly.solution_connections WHERE tenant_id=$1 AND build_request_id=$2',
        [tenantId, buildId]
      )
    ).rows[0].id;
    const verify = (client, testId = build.testEvidence.id, connectionId = verifiedConnection) =>
      client.query(
        'SELECT orqaly.verify_native_outbound_connection($1::uuid,$2::uuid) AS verified',
        [testId, connectionId]
      );
    await assert.rejects(
      repository.solutionBuildTransaction(scope, (client) => verify(client)),
      { code: '42501' }
    );
    await assert.rejects(
      workerRepository.solutionBuildTransaction(scope, (client) =>
        client.query(
          "UPDATE orqaly.solution_connections SET status='verified' WHERE tenant_id=$1 AND id=$2",
          [tenantId, verifiedConnection]
        )
      ),
      { code: '42501' }
    );
    await assert.rejects(
      workerRepository.solutionBuildTransaction(scope, (client) => verify(client, randomUUID())),
      { code: '42501' }
    );
    await assert.rejects(
      workerRepository.solutionBuildTransaction(scope, (client) =>
        verify(client, build.testEvidence.id, randomUUID())
      ),
      { code: '42501' }
    );
    await assert.rejects(
      workerRepository.solutionBuildTransaction({ ...scope, tenantId: randomUUID() }, (client) =>
        verify(client)
      ),
      { code: '42501' }
    );
    await assert.rejects(
      workerRepository.solutionBuildTransaction(
        { ...scope, userId: 'user_other_owner' },
        (client) => verify(client)
      ),
      { code: '42501' }
    );
    await assert.rejects(
      workerRepository.solutionBuildTransaction(scope, async (client) => {
        await client.query("SELECT set_config('orqaly.build_owner_user_id','',true)");
        return verify(client);
      }),
      { code: '42501' }
    );
    assert.equal(
      (await workerRepository.solutionBuildTransaction(scope, (client) => verify(client))).rows[0]
        .verified,
      true
    );
    assert.equal(hits(), 1, 'verification RPC cannot send or replay requests');
    await builds.test(auth, buildId, consent, testKey);
    assert.equal(hits(), 1, 'original consent replay cannot resend');
    log('immutable review/handoff -> staged native Solution');
    build = (await builds.review(auth, buildId, { expectedVersion: build.rowVersion }))
      .buildRequest;
    build = (
      await builds.confirm(
        auth,
        buildId,
        { expectedVersion: build.rowVersion, workflowHash: build.workflowHash },
        `outbound_confirm_${randomUUID()}`
      )
    ).buildRequest;
    assert.equal(build.status, 'completed');
    assert.equal(hits(), 1);
    const solutions = createSolutionService({ repository, agentService, runtime: local.runtime });
    const revisions = createSolutionRevisionService({ repository, runtime: local.runtime });
    let solution = (await solutions.read(auth, buildId)).solution;
    solution = (
      await solutions.decide(
        auth,
        buildId,
        {
          action: 'deploy',
          workflowHash: solution.workflowHash,
          environmentId: local.environmentId,
        },
        solution.rowVersion
      )
    ).solution;
    assert.equal(solution.status, 'ready', solution.lastError);
    assert.equal(hits(), 1, 'staging does not call receiver');
    await assert.rejects(
      solutions.invoke(
        auth,
        buildId,
        { mode: 'test', input: { event: 'ready' } },
        `outbound_release_denied_${randomUUID()}`
      ),
      { code: 'SOLUTION_EFFECT_APPROVAL_REQUIRED' }
    );
    assert.equal(hits(), 1);
    const releaseCommand = {
      mode: 'test',
      input: { event: 'ready' },
      allowExternalEffects: true,
      workflowHash: solution.workflowHash,
    };
    const releaseKey = `outbound_release_test_${randomUUID()}`;
    const tested = await solutions.invoke(auth, buildId, releaseCommand, releaseKey);
    assert.equal(tested.invocation.status, 'succeeded', tested.invocation.errorCode);
    assert.equal(hits(), 2);
    assert.equal(
      tested.invocation.evidence.effectAuthorization.workflowHash,
      solution.workflowHash
    );
    assert.equal(tested.invocation.evidence.outboundDelivery.delivery, 'accepted');
    assert.equal(tested.invocation.evidence.testConfiguration.saveDataErrorExecution, 'none');
    await solutions.invoke(auth, buildId, releaseCommand, releaseKey);
    assert.equal(hits(), 2);
    solution = (await solutions.read(auth, buildId)).solution;
    assert.ok(solution.testedAt);
    solution = (
      await solutions.decide(
        auth,
        buildId,
        {
          action: 'activate',
          workflowHash: solution.workflowHash,
          environmentId: local.environmentId,
        },
        solution.rowVersion
      )
    ).solution;
    assert.equal(solution.status, 'active');
    assert.equal(hits(), 2);
    const invocation = await solutions.invoke(
      auth,
      buildId,
      { mode: 'production', input: { event: 'ready' } },
      `outbound_production_${randomUUID()}`
    );
    assert.equal(invocation.invocation.status, 'succeeded');
    assert.equal(hits(), 3);
    log('native revision inherits only exact connection scope and requires fresh explicit test');
    solution = (await solutions.read(auth, buildId)).solution;
    let revision = (
      await revisions.createDraft(auth, buildId, { expectedVersion: solution.rowVersion })
    ).revision;
    assert.ok(revision);
    revision = (
      await revisions.review(auth, buildId, revision.id, { expectedVersion: revision.rowVersion })
    ).revision;
    assert.equal(
      revision.review.execution.allowed,
      true,
      JSON.stringify(revision.review.execution.reasons)
    );
    revision = (
      await revisions.decide(auth, buildId, revision.id, {
        action: 'approve',
        workflowHash: revision.workflowHash,
        expectedVersion: revision.rowVersion,
      })
    ).revision;
    revision = (
      await revisions.decide(auth, buildId, revision.id, {
        action: 'deploy',
        workflowHash: revision.workflowHash,
        expectedVersion: revision.rowVersion,
      })
    ).revision;
    assert.equal(revision.status, 'ready');
    assert.equal(hits(), 3);
    await assert.rejects(
      revisions.invoke(
        auth,
        buildId,
        revision.id,
        { input: { event: 'ready' } },
        `outbound_revision_denied_${randomUUID()}`
      ),
      { code: 'SOLUTION_EFFECT_APPROVAL_REQUIRED' }
    );
    const revisionTest = await revisions.invoke(
      auth,
      buildId,
      revision.id,
      {
        input: { event: 'ready' },
        allowExternalEffects: true,
        workflowHash: revision.workflowHash,
      },
      `outbound_revision_test_${randomUUID()}`
    );
    assert.equal(revisionTest.invocation.status, 'succeeded', revisionTest.invocation.errorCode);
    assert.equal(hits(), 4);
    log(
      'unknown-effect barrier blocks application-key and human sends; stopping stays possible after revocation'
    );
    const keys = createSolutionApplicationKeyService({
      repository,
      solutionService: solutions,
      environment: 'preview',
    });
    solution = (await solutions.read(auth, buildId)).solution;
    const application = await keys.create(
      auth,
      buildId,
      { label: 'Controlled receiver caller', workflowHash: solution.workflowHash },
      solution.rowVersion,
      `outbound_app_${randomUUID()}`
    );
    // Test the durable unknown guard via a synthetic record, not another
    // ambiguous provider action; runtime-level disconnect proof is separate.
    await admin.query(
      "INSERT INTO orqaly.solution_invocations(tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,status,completed_at) VALUES($1,$2,$3,$4,'production',$5,$6,$6,$7,'outcome_unknown',clock_timestamp())",
      [
        tenantId,
        buildId,
        randomUUID(),
        auth.userId,
        `synthetic_barrier_${randomUUID()}`,
        solution.workflowHash,
        { event: 'ready' },
      ]
    );
    await assert.rejects(
      solutions.invoke(
        auth,
        buildId,
        { mode: 'production', input: { event: 'ready' } },
        `outbound_after_unknown_${randomUUID()}`
      ),
      { code: 'SOLUTION_EFFECT_UNRESOLVED' }
    );
    assert.equal(hits(), 4);
    await assert.rejects(
      keys.invoke(
        `Bearer ${application.token}`,
        buildId,
        { input: { event: 'ready' } },
        `outbound_app_unknown_${randomUUID()}`
      ),
      { code: 'SOLUTION_EFFECT_UNRESOLVED' }
    );
    assert.equal(hits(), 4);
    const connection = (
      await admin.query(
        'SELECT * FROM orqaly.solution_connections WHERE tenant_id=$1 AND build_request_id=$2',
        [tenantId, buildId]
      )
    ).rows[0];
    await repository.solutionBuildTransaction(scope, (client) =>
      client.query(
        "UPDATE orqaly.solution_connections SET status='revoked',revoked_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3",
        [tenantId, auth.userId, connection.id]
      )
    );
    const recoveredCleanup = await local.runtime.reconcileNativeCredential(scope, {
      environmentId: local.environmentId,
      connectionId: connection.id,
    });
    assert.deepEqual(recoveredCleanup, {
      status: 'removed',
      credentialId: connection.provider_credential_id,
    });
    const repeatedCleanup = await local.runtime.reconcileNativeCredential(scope, {
      environmentId: local.environmentId,
      connectionId: connection.id,
      credentialId: connection.provider_credential_id,
    });
    assert.deepEqual(repeatedCleanup, recoveredCleanup);
    solution = (await solutions.read(auth, buildId)).solution;
    solution = (
      await solutions.decide(
        auth,
        buildId,
        {
          action: 'pause',
          workflowHash: solution.workflowHash,
          environmentId: local.environmentId,
        },
        solution.rowVersion
      )
    ).solution;
    assert.equal(solution.status, 'paused');
    assert.equal(solution.lastError, null);
    const proof = local.receiverProof();
    assert.equal(proof.authenticated, 4);
    assert.equal(proof.leakedIncomingAuth, false);
    log(
      `passed: actual authenticated receiver deliveries=${hits()}, no implicit/replayed sends, release and revision consent proven`
    );
  } finally {
    await local.close();
  }
}
