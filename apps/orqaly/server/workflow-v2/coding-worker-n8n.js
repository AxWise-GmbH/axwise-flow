import { randomUUID } from 'node:crypto';
import { CodingWorkerError } from './coding-worker-contracts.js';
import { codingHash } from './coding-worker-contracts.js';
import { describeNativeConnection, bindNativeConnections } from './native-workflow-connections.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';

// Application-owned graph. The model cannot change the broker, claim, command,
// credential target or execution authority. n8n queues; the worker executes.
export function codingDispatchWorkflow({ origin, jobId, specHash }) {
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.protocol !== 'https:' || !parsed.hostname.includes('.'))
    throw new CodingWorkerError('CODING_BROKER_ORIGIN_INVALID', 503);
  const edge = (node) => ({ node, type: 'main', index: 0 });
  const workflow = { name: 'Queue approved coding job', settings: {}, nodes: [
    { id: 'receive', name: 'Receive approved launch', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0], parameters: { httpMethod: 'POST', path: 'unused', responseMode: 'responseNode', options: {} } },
    { id: 'dispatch', name: 'Queue approved coding job', type: 'CUSTOM.boundedHttp', typeVersion: 1, position: [240, 0], parameters: {
      url: `${origin}/coding/v1/jobs/${jobId}/dispatch`, method: 'POST', body: `={{ {"specHash":"${specHash}"} }}` } },
    { id: 'respond', name: 'Return queue receipt', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: [480, 0], parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} } },
  ], connections: { 'Receive approved launch': { main: [[edge('Queue approved coding job')]] }, 'Queue approved coding job': { main: [[edge('Return queue receipt')]] } } };
  const spec = { kind: 'n8n_workflow_v2', runtimeProfile: 'request_automation', requirements: [{ id: 'queue', description: 'Queue the exact human-approved offline coding job once' }],
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: { type: 'object', properties: { delivery: { type: 'string' }, statusCode: { type: 'integer' }, responseBytes: { type: 'integer' }, connectionId: { type: 'string' } }, required: ['delivery', 'statusCode', 'connectionId'], additionalProperties: true },
    acceptanceCases: [{ id: 'queue-approved', description: 'Broker durably accepts the approved job', requirementIds: ['queue'], input: {}, assertions: [{ path: '/delivery', operator: 'equals', value: 'accepted' }, { path: '/statusCode', operator: 'equals', value: 202 }] }],
    connections: [{ id: 'coding-broker', provider: 'Orqaly approved coding broker', operation: 'Queue exact approved job', purpose: 'Dispatch only this approved job; expires in five minutes', credentialType: 'orqalyBoundedHttp', nodeIds: ['dispatch'] }] };
  return { workflow, spec };
}

export function createCodingN8nLauncher({ runtime, store, environmentId, origin, now = Date.now }) {
  if (!runtime || !environmentId) throw new CodingWorkerError('CODING_N8N_NOT_CONFIGURED', 503);
  return {
    async reconcile(scope, { job, dispatch }) {
      if (dispatch.environment_id !== environmentId || dispatch.job_id !== job.id || new Date(dispatch.created_at).getTime() + 300000 > now())
        throw new CodingWorkerError('CODING_DISPATCH_RECONCILE_NOT_READY');
      let workflowCleanup = dispatch.evidence?.workflowCleanup || 'pending';
      let credentialCleanup = dispatch.evidence?.credentialCleanup || 'pending';
      if (dispatch.credential_id && workflowCleanup !== 'removed') {
        const f = codingDispatchWorkflow({ origin, jobId: job.id, specHash: job.spec_hash });
        const described = describeNativeConnection({ requirement: f.spec.connections[0], workflow: f.workflow, environmentId });
        const connection = { id: dispatch.id, tenant_id: scope.tenantId, owner_user_id: scope.userId, environment_id: environmentId,
          requirement_id: 'coding-broker', credential_type: 'orqalyBoundedHttp', provider_credential_id: dispatch.credential_id, scope: described.scope, status: 'saved' };
        const artifact = normalizeNativeWorkflow({ workflow: bindNativeConnections(f.workflow, f.spec, [connection], environmentId), id: dispatch.id, controlledTest: true });
        try { const result = await runtime.cleanupNativeTest(scope, { environmentId, testId: dispatch.id, workflow: artifact.workflow, workflowHash: codingHash(artifact.workflow) });
          if (result.status === 'removed') workflowCleanup = 'removed'; } catch { /* exact owned cleanup remains pending */ }
      } else if (!dispatch.credential_id) {
        // The launcher persists the returned credential ID BEFORE staging a
        // workflow. If it is absent durably, this path never staged a workflow.
        workflowCleanup = 'removed';
      }
      if (credentialCleanup !== 'removed' && runtime.reconcileNativeCredential) {
        try { const result = await runtime.reconcileNativeCredential(scope, { environmentId, connectionId: dispatch.id, credentialId: dispatch.credential_id || undefined });
          if (['removed', 'revoked'].includes(result.status)) credentialCleanup = 'removed'; } catch { /* unresolved, never broad credential deletion */ }
      }
      const evidence = dispatch.evidence ? { ...dispatch.evidence, workflowCleanup, credentialCleanup } :
        { kind: 'native_n8n_dispatch', status: 'outcome_unknown', executionId: null, testArtifactHash: null,
          queueAccepted: ['queued', 'running', 'succeeded', 'failed', 'timed_out', 'outcome_unknown'].includes(job.status),
          workflowCleanup, credentialCleanup, capabilityExpiresAt: new Date(new Date(dispatch.created_at).getTime() + 300000).toISOString() };
      await store.updateDispatch(scope, dispatch.id, { status: 'outcome_unknown', cleanupOnly: true, evidence });
      return evidence;
    },
    async queue(scope, { job, token, key }) {
      if (!(await runtime.environmentIds(scope)).includes(environmentId)) throw new CodingWorkerError('CODING_ENVIRONMENT_SCOPE_MISMATCH');
      const started = await store.beginDispatch(scope, job.id, { id: randomUUID(), key, expectedVersion: job.row_version, environmentId });
      if (!started.created) return { ...started.dispatch.evidence, status: started.dispatch.status, replayed: true };
      const dispatch = started.dispatch; const connectionId = dispatch.id;
      const f = codingDispatchWorkflow({ origin, jobId: job.id, specHash: job.spec_hash });
      const described = describeNativeConnection({ requirement: f.spec.connections[0], workflow: f.workflow, environmentId });
      let credentialId; let result; let credentialCleanup = 'pending';
      try {
        const credential = await runtime.createNativeCredential(scope, { environmentId, connectionId, type: 'orqalyBoundedHttp',
          data: { name: 'Authorization', value: `Bearer ${token}` }, scope: described.scope });
        credentialId = credential.id;
        await store.updateDispatch(scope, dispatch.id, { credentialId });
        const connection = { id: connectionId, tenant_id: scope.tenantId, owner_user_id: scope.userId, environment_id: environmentId,
          requirement_id: 'coding-broker', credential_type: 'orqalyBoundedHttp', provider_credential_id: credentialId, scope: described.scope, status: 'saved' };
        const bound = bindNativeConnections(f.workflow, f.spec, [connection], environmentId);
        const artifact = normalizeNativeWorkflow({ workflow: bound, id: dispatch.id, controlledTest: true });
        result = await runtime.testNative(scope, { environmentId, workflow: artifact.workflow, spec: f.spec,
          testId: dispatch.id, invocationId: dispatch.id, input: {}, nativeConnections: [connection], allowExternalEffects: true });
      } catch { /* An uncertain outbound operation is recorded, never retried. */ }
      finally {
        if (credentialId) {
          try { const deleted = await runtime.revokeNativeCredential(scope, { environmentId, connectionId, credentialId });
            if (deleted.status === 'revoked') credentialCleanup = 'removed'; } catch { /* durable pending cleanup */ }
        }
      }
      const actual = await store.read(scope, job.id);
      const accepted = result?.status === 'succeeded' && result.output?.delivery === 'accepted' && result.output?.statusCode === 202 &&
        ['queued', 'running', 'succeeded', 'failed', 'timed_out', 'outcome_unknown'].includes(actual.status);
      const clean = result?.cleanup?.status === 'removed' && credentialCleanup === 'removed';
      const status = accepted && clean ? 'accepted' : result?.output?.delivery === 'rejected' && clean ? 'rejected' : 'outcome_unknown';
      const evidence = { kind: 'native_n8n_dispatch', status, executionId: result?.executionId || null,
        testArtifactHash: result?.testArtifactHash || null, queueAccepted: accepted,
        workflowCleanup: result?.cleanup?.status || 'pending', credentialCleanup,
        capabilityExpiresAt: new Date(new Date(dispatch.created_at).getTime() + 300000).toISOString() };
      await store.updateDispatch(scope, dispatch.id, { status, credentialId, evidence });
      return evidence;
    },
  };
}
