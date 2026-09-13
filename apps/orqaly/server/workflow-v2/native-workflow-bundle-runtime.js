import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  nativeBundleHash,
  nativeBundleMembers,
  materializeNativeBundle,
  normalizeNativeBundle,
} from './native-workflow-bundle.js';
import { reviewNativeWorkflow, validateNativeWorkflowData } from './native-workflow-review.js';
import { assertNativeTransportBindings } from './native-workflow-runtime-contract.js';
import { hasNativeOutbound } from './native-outbound-policy.js';
import {
  createNativeFailureProbeArtifact,
  NATIVE_FAILURE_PROBE_KIND,
} from './native-failure-probe.js';

const safeId = (value) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .parse(value);
const execId = (value) => (/^[1-9][0-9]{0,30}$/.test(String(value ?? '')) ? String(value) : null);
const path = (id) => `/api/v1/workflows/${safeId(id)}`;
const isBundle = (value) => value.spec?.ownedDependencies?.length === 1;
const childRecords = (records, id) =>
  records
    .filter((record) => record.dependency_id === id)
    .map((record) => ({
      ...record,
      requirement_id: record.member_requirement_id ?? record.requirement_id,
    }));

// Genuine pinned n8n ErrorTrigger execution, not an Orqaly error emulation.
// Provider workflow IDs are materialized only from this exact owned bundle;
// the customer-approved logical graphs remain immutable in the control plane.
export function createOwnedNativeBundleRuntime({
  binding,
  request,
  nativeWebhook,
  verifyStoredWorkflow,
  verifyWorkflow,
  verifyNativeCredentials,
  verifiedExecutionSnapshot,
  capturedFailure,
  waitForEvidence = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  function checked(
    config,
    value,
    id,
    controlledTest = false,
    connections = [],
    requirePolicy = true
  ) {
    if (!isBundle(value) || hash(value.workflow) !== (value.workflow_hash ?? hash(value.workflow)))
      throw new Error('native_bundle_source_mismatch');
    const normalized = normalizeNativeBundle({ ...value, id, controlledTest });
    if (normalized.bundleHash !== nativeBundleHash(value))
      throw new Error('native_bundle_transport_changed');
    assertNativeTransportBindings({ workflow: value.workflow, id, controlledTest });
    if (
      connections.some(
        (record) =>
          record.tenant_id !== config.tenantId ||
          record.owner_user_id !== config.userId ||
          record.environment_id !== config.id
      )
    )
      throw new Error('native_bundle_connection_scope_denied');
    if (requirePolicy) {
      if (
        config.nativePolicy?.ownedErrorHandlers !== true ||
        config.nativePolicy?.backgroundExecution !== 'instance_cpu_always'
      )
        throw new Error('native_owned_background_runtime_required');
      const candidate = structuredClone(value);
      if (controlledTest)
        for (const member of [
          candidate.workflow,
          ...candidate.spec.ownedDependencies.map((entry) => entry.workflow),
        ]) {
          member.settings.saveDataErrorExecution = 'none';
          member.settings.saveDataSuccessExecution = 'none';
        }
      const report = reviewNativeWorkflow({
        ...candidate,
        runtimePolicy: config.nativePolicy,
        connections,
        environmentId: config.id,
      });
      if (!report.valid || !report.execution.allowed)
        throw new Error('native_bundle_capability_denied');
    }
    return nativeBundleMembers(value);
  }
  async function inventory(config) {
    const list = await request(config, '/api/v1/workflows?limit=100');
    if (!Array.isArray(list.data) || list.nextCursor)
      throw new Error('native_bundle_inventory_unverified');
    return list.data;
  }
  async function stageMember(config, workflow, listing) {
    const matches = listing.filter((entry) => entry.name === workflow.name);
    if (matches.length > 1) throw new Error('native_bundle_duplicate_member');
    const stored = matches.length
      ? await request(config, path(matches[0].id))
      : await request(config, '/api/v1/workflows', { method: 'POST', body: workflow });
    safeId(stored.id);
    safeId(stored.versionId);
    verifyStoredWorkflow(stored, workflow);
    if (stored.active === true || stored.activeVersion)
      throw new Error('native_bundle_stage_not_inactive');
    const readback = await request(config, path(stored.id));
    verifyStoredWorkflow(readback, workflow);
    if (
      readback.id !== stored.id ||
      readback.versionId !== stored.versionId ||
      readback.active === true ||
      readback.activeVersion
    )
      throw new Error('native_bundle_stage_unverified');
    return readback;
  }
  const childPin = (member, actual) => ({
    dependencyId: member.dependencyId,
    workflowId: safeId(actual.id),
    versionId: safeId(actual.versionId),
    workflowHash: hash(member.workflow),
    specHash: hash(member.spec),
  });
  function receipt(value, actual, pins, active) {
    return {
      workflowId: safeId(actual.id),
      versionId: safeId(actual.versionId),
      workflowHash: hash(value.workflow),
      bundleHash: nativeBundleHash(value),
      materializedWorkflowHash: materializeNativeBundle(value, pins).workflowHash,
      dependencies: pins,
      active,
      verifiedAt: new Date().toISOString(),
    };
  }
  async function verifyPinned(config, value, published = false) {
    const deployment = value.deployment;
    const bundleHash = nativeBundleHash(value);
    if (
      !deployment ||
      deployment.bundleHash !== bundleHash ||
      deployment.workflowHash !== hash(value.workflow)
    )
      throw new Error('native_bundle_deployment_mismatch');
    const materialized = materializeNativeBundle(value, deployment.dependencies);
    if (deployment.materializedWorkflowHash !== materialized.workflowHash)
      throw new Error('native_bundle_materialized_hash_changed');
    const members = nativeBundleMembers(value);
    const children = [];
    for (const member of members.slice(1)) {
      const pin = deployment.dependencies.find(
        (entry) => entry.dependencyId === member.dependencyId
      );
      const stored = await request(config, path(pin.workflowId));
      (published ? verifyWorkflow : verifyStoredWorkflow)(stored, member.workflow);
      if (
        stored.id !== pin.workflowId ||
        stored.versionId !== pin.versionId ||
        (published && stored.active !== true)
      )
        throw new Error('native_owned_dependency_pin_changed');
      children.push({ member, pin, stored });
    }
    const main = await request(config, path(deployment.workflowId));
    (published ? verifyWorkflow : verifyStoredWorkflow)(main, materialized.workflow);
    if (
      main.id !== deployment.workflowId ||
      main.versionId !== deployment.versionId ||
      (published && main.active !== true)
    )
      throw new Error('native_bundle_main_pin_changed');
    return { main, children, materialized };
  }
  async function credentials(config, value, records) {
    for (const member of nativeBundleMembers(value))
      await verifyNativeCredentials(
        config,
        member.workflow,
        member.dependencyId == null
          ? records.filter((record) => record.dependency_id == null)
          : childRecords(records, member.dependencyId)
      );
  }
  async function setPublished(config, actual, workflow, enabled) {
    if (enabled && actual.active !== true)
      await request(config, `${path(actual.id)}/publish`, {
        method: 'POST',
        body: { versionId: actual.versionId },
      });
    if (!enabled && actual.active === true)
      await request(config, `${path(actual.id)}/unpublish`, { method: 'POST', body: {} });
    const current = await request(config, path(actual.id));
    (enabled ? verifyWorkflow : verifyStoredWorkflow)(current, workflow);
    if (
      current.id !== actual.id ||
      current.versionId !== actual.versionId ||
      (enabled ? current.active !== true : current.active === true || current.activeVersion)
    )
      throw new Error('native_bundle_publish_state_unverified');
    return current;
  }
  async function deploy(scope, value) {
    const config = binding(scope, value.environment_id);
    const members = checked(
      config,
      value,
      value.revision_id ?? value.id,
      false,
      value.nativeConnections ?? []
    );
    await credentials(config, value, value.nativeConnections ?? []);
    const listing = await inventory(config);
    const names = new Set(members.map((member) => member.workflow.name));
    const known = new Set((value.known_workflow_ids ?? []).map(safeId));
    if (
      names.size !== members.length ||
      listing.some((entry) => !names.has(entry.name) && !known.has(entry.id))
    )
      throw new Error('native_bundle_environment_not_exclusive');
    const pins = [];
    for (const child of members.slice(1))
      pins.push(childPin(child, await stageMember(config, child.workflow, listing)));
    const materialized = materializeNativeBundle(value, pins);
    const main = await stageMember(config, materialized.workflow, listing);
    return receipt(value, main, pins, false);
  }
  async function activation(scope, value, enabled) {
    const config = binding(scope, value.environment_id);
    checked(
      config,
      value,
      value.revision_id ?? value.id,
      false,
      value.nativeConnections ?? [],
      enabled
    );
    const pinned = await verifyPinned(config, value);
    if (enabled) {
      await credentials(config, value, value.nativeConnections ?? []);
      // n8n2.37.10 loads ONLY the published error-workflow version. Verify it
      // first; never open the main endpoint with an unpublished dependency.
      for (const child of pinned.children)
        await setPublished(config, child.stored, child.member.workflow, true);
      await setPublished(config, pinned.main, pinned.materialized.workflow, true);
      await verifyPinned(config, value, true);
    } else {
      // Stop admission first. A partial pause never claims complete revocation.
      await setPublished(config, pinned.main, pinned.materialized.workflow, false);
      for (const child of pinned.children)
        await setPublished(config, child.stored, child.member.workflow, false);
    }
    return receipt(value, pinned.main, value.deployment.dependencies, enabled);
  }
  async function invoke(scope, value, invocation) {
    const config = binding(scope, value.environment_id);
    checked(config, value, value.revision_id ?? value.id, false, value.nativeConnections ?? []);
    if (
      !validateNativeWorkflowData({ schema: value.spec.inputSchema, value: invocation.input }).valid
    )
      throw new Error('native_bundle_input_invalid');
    const pinned = await verifyPinned(config, value, true);
    await credentials(config, value, value.nativeConnections ?? []);
    // An HTTP failure is not evidence the asynchronous handler completed.
    let result;
    try {
      result = await nativeWebhook(
        config,
        value.revision_id ?? value.id,
        z.uuid().parse(invocation.id),
        invocation.input,
        pinned.materialized.workflow,
        value.nativeConnections ?? []
      );
    } catch {
      result = {
        status: 'outcome_unknown',
        executionId: null,
        diagnostics: [
          {
            code: 'N8N_BUNDLE_EXECUTION_UNCONFIRMED',
            message: 'The native request outcome is unconfirmed. Do not retry automatically.',
          },
        ],
        executedNodeIds: [],
      };
    }
    const evidence = await reconcileExecutions(
      config,
      value,
      pinned,
      invocation.id,
      result.executionId
    );
    return {
      ...result,
      ...evidence,
      status: evidence.mainExecution.status,
      bundleHash: nativeBundleHash(value),
      materializedWorkflowHash: pinned.materialized.workflowHash,
    };
  }
  async function executionInventory(config, workflowId, executionId = null) {
    if (executionId) {
      const found = await request(
        config,
        `/api/v1/executions/${execId(executionId)}?includeData=true`,
        { maxBytes: 1048576 }
      );
      if (execId(found?.id) !== executionId)
        throw new Error('native_bundle_execution_identity_changed');
      return [found];
    }
    const list = await request(
      config,
      `/api/v1/executions?workflowId=${safeId(workflowId)}&limit=100&includeData=true`,
      { maxBytes: 1048576 }
    );
    if (!Array.isArray(list.data) || list.data.length > 100 || list.nextCursor)
      throw new Error('native_bundle_execution_inventory_unverified');
    return list.data;
  }
  function linkedParent(execution, child, mainId, parentExecutionId) {
    const trigger = child.member.workflow.nodes.find(
      (node) => node.type === 'n8n-nodes-base.errorTrigger'
    );
    const events =
      execution?.data?.resultData?.runData?.[trigger?.name]?.flatMap(
        (run) => run.data?.main?.[0] ?? []
      ) ?? [];
    return events.some(
      (event) =>
        String(event.json?.execution?.id) === parentExecutionId &&
        event.json?.workflow?.id === mainId
    );
  }
  async function reconcileExecutions(config, value, pinned, invocationId, executionId = null) {
    z.uuid().parse(invocationId);
    if (executionId != null && !execId(executionId))
      throw new Error('native_bundle_execution_id_invalid');
    const unknown = (pin) => ({
      ...pin,
      executionId: null,
      parentExecutionId: null,
      status: 'outcome_unknown',
    });
    let parent = null;
    try {
      const trigger = pinned.materialized.workflow.nodes.find(
        (node) => node.type === 'n8n-nodes-base.webhook'
      );
      const matches = (await executionInventory(config, pinned.main.id, executionId)).filter(
        (execution) => {
          const items =
            execution?.data?.resultData?.runData?.[trigger.name]?.flatMap(
              (run) => run.data?.main?.[0] ?? []
            ) ?? [];
          return (
            execId(execution.id) &&
            ['success', 'error'].includes(execution.status) &&
            verifiedExecutionSnapshot(
              execution,
              pinned.materialized.workflow,
              pinned.main,
              value.spec,
              config.nativePolicy,
              { logicalWorkflow: value.workflow }
            ) &&
            items.some((item) => item.json?.headers?.['x-orqaly-invocation-id'] === invocationId)
          );
        }
      );
      if (matches.length === 1) parent = matches[0];
    } catch {
      /* No retained exact snapshot means unknown, not success or absence. */
    }
    const mainExecution = {
      executionId: parent ? execId(parent.id) : execId(executionId),
      status:
        parent?.status === 'success'
          ? 'succeeded'
          : parent?.status === 'error'
            ? 'failed'
            : 'outcome_unknown',
    };
    const dependencies = [];
    for (const child of pinned.children) {
      let evidence = unknown(child.pin);
      if (parent?.status === 'success')
        evidence = { ...evidence, status: 'not_triggered', parentExecutionId: execId(parent.id) };
      else if (parent?.status === 'error') {
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const matches = (await executionInventory(config, child.stored.id)).filter(
              (execution) =>
                execId(execution.id) &&
                linkedParent(execution, child, pinned.main.id, execId(parent.id)) &&
                verifiedExecutionSnapshot(
                  execution,
                  child.member.workflow,
                  child.stored,
                  child.member.spec,
                  config.nativePolicy,
                  { workflowRole: 'error_handler' }
                ) &&
                ['success', 'error'].includes(execution.status)
            );
            if (matches.length > 1) break;
            if (matches.length === 1) {
              evidence = {
                ...child.pin,
                executionId: execId(matches[0].id),
                parentExecutionId: execId(parent.id),
                status: matches[0].status === 'success' ? 'succeeded' : 'failed',
              };
              break;
            }
          } catch {
            /* No untrusted run payload is copied into the receipt. */
          }
          if (attempt < 19) await waitForEvidence(500);
        }
      }
      dependencies.push(evidence);
    }
    return { mainExecution, ownedDependencies: dependencies };
  }
  async function reconcileInvocation(scope, value, invocation) {
    const config = binding(scope, value.environment_id);
    checked(
      config,
      value,
      value.revision_id ?? value.id,
      false,
      value.nativeConnections ?? [],
      false
    );
    const pinned = await verifyPinned(config, value);
    return {
      ...(await reconcileExecutions(
        config,
        value,
        pinned,
        invocation.id,
        invocation.executionId ?? invocation.execution_id
      )),
      bundleHash: nativeBundleHash(value),
      materializedWorkflowHash: pinned.materialized.workflowHash,
    };
  }
  async function removeTest(config, provider, workflow) {
    const current = await request(config, path(provider.id));
    verifyStoredWorkflow(current, workflow);
    if (current.id !== provider.id || current.versionId !== provider.versionId)
      throw new Error('native_bundle_cleanup_identity_changed');
    await request(config, path(provider.id), { method: 'DELETE' });
    const remaining = await inventory(config);
    if (remaining.some((entry) => entry.id === provider.id || entry.name === workflow.name))
      throw new Error('native_bundle_cleanup_unconfirmed');
  }
  async function testNative(scope, args, { failureProbe = false } = {}) {
    const {
      environmentId,
      workflow,
      spec,
      testId,
      invocationId,
      input,
      nativeConnections = [],
      allowExternalEffects = false,
    } = args;
    let config = binding(scope, environmentId);
    if (failureProbe) {
      if (
        config.nativePolicy?.ownedErrorHandlerProbe !== true ||
        config.nativePolicy?.backgroundExecution !== 'instance_cpu_always'
      )
        throw new Error('native_failure_probe_runtime_required');
      config = { ...config, nativePolicy: { ...config.nativePolicy, ownedErrorHandlers: true } };
    }
    z.uuid().parse(testId);
    z.uuid().parse(invocationId);
    const value = { workflow, spec };
    const members = checked(config, value, testId, true, nativeConnections);
    const outbound = members.some((member) => hasNativeOutbound(member.workflow));
    if (outbound && allowExternalEffects !== true)
      throw new Error('native_bundle_external_consent_required');
    if (!validateNativeWorkflowData({ schema: spec.inputSchema, value: input }).valid)
      throw new Error('native_bundle_input_invalid');
    await credentials(config, value, nativeConnections);
    const proof = {
      testArtifactHash: hash(workflow),
      testBundleHash: nativeBundleHash(value),
      testConfiguration: {
        controlledTest: true,
        ownedDependencies: members.slice(1).map((member) => ({
          dependencyId: member.dependencyId,
          saveDataSuccessExecution: member.workflow.settings.saveDataSuccessExecution,
          saveDataErrorExecution: member.workflow.settings.saveDataErrorExecution,
        })),
      },
    };
    const owned = [];
    let main;
    let materialized;
    let dispatched = false;
    let result;
    try {
      const listing = await inventory(config);
      if (listing.some((entry) => members.some((member) => member.workflow.name === entry.name)))
        throw new Error('native_bundle_test_attempt_exists');
      for (const member of members.slice(1)) {
        const provider = await stageMember(config, member.workflow, listing);
        owned.push({ member, provider, pin: childPin(member, provider) });
      }
      materialized = materializeNativeBundle(
        value,
        owned.map((entry) => entry.pin)
      );
      main = await stageMember(config, materialized.workflow, listing);
      for (const child of owned)
        await setPublished(config, child.provider, child.member.workflow, true);
      await setPublished(config, main, materialized.workflow, true);
      dispatched = true;
      result = await nativeWebhook(
        config,
        testId,
        invocationId,
        input,
        materialized.workflow,
        nativeConnections
      );
    } catch {
      result = {
        status: 'outcome_unknown',
        diagnostics: [
          {
            code: dispatched ? 'N8N_BUNDLE_EXECUTION_UNCONFIRMED' : 'N8N_BUNDLE_SETUP_UNCONFIRMED',
            message:
              'No complete owned-bundle execution result was verified. Do not retry automatically.',
          },
        ],
        executedNodeIds: [],
      };
      if (main && dispatched && !outbound) {
        try {
          const list = await request(
            config,
            `/api/v1/executions?workflowId=${safeId(main.id)}&limit=1&includeData=true`,
            { maxBytes: 1048576 }
          );
          const captured =
            list.data?.length === 1
              ? capturedFailure(
                  list.data[0],
                  materialized.workflow,
                  main,
                  invocationId,
                  spec,
                  config.nativePolicy,
                  { logicalWorkflow: workflow }
                )
              : null;
          if (captured) result = captured;
        } catch {
          /* Retained, correlated native evidence only. */
        }
      }
    }
    let completedEvidence = null;
    if (main && materialized && result.status === 'succeeded') {
      completedEvidence = await reconcileExecutions(
        config,
        value,
        {
          main,
          materialized,
          children: owned.map((child) => ({ ...child, stored: child.provider })),
        },
        invocationId,
        result.executionId
      );
      result = {
        ...result,
        mainExecution: completedEvidence.mainExecution,
        status: completedEvidence.mainExecution.status,
      };
    }
    const dependencies = completedEvidence?.ownedDependencies ?? [];
    for (const child of owned) {
      if (completedEvidence) break;
      let evidence = {
        ...child.pin,
        executionId: null,
        parentExecutionId: null,
        status: result.status === 'succeeded' ? 'not_triggered' : 'outcome_unknown',
      };
      if (
        result.status === 'failed' &&
        result.executionId &&
        !hasNativeOutbound(child.member.workflow)
      ) {
        // n8n starts error workflows asynchronously. Poll only this unique
        // test's child, bounded to10s; never retry the main effect or trigger.
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const list = await request(
              config,
              `/api/v1/executions?workflowId=${safeId(child.provider.id)}&limit=1&includeData=true`,
              { maxBytes: 1048576 }
            );
            const execution = list.data?.length === 1 ? list.data[0] : null;
            const trigger = child.member.workflow.nodes.find(
              (node) => node.type === 'n8n-nodes-base.errorTrigger'
            );
            const events =
              execution?.data?.resultData?.runData?.[trigger.name]?.flatMap(
                (run) => run.data?.main?.[0] ?? []
              ) ?? [];
            const linked = events.some(
              (event) =>
                String(event.json?.execution?.id) === result.executionId &&
                event.json?.workflow?.id === main.id
            );
            if (
              linked &&
              execId(execution.id) &&
              verifiedExecutionSnapshot(
                execution,
                child.member.workflow,
                child.provider,
                child.member.spec,
                config.nativePolicy,
                { workflowRole: 'error_handler' }
              ) &&
              ['success', 'error'].includes(execution.status)
            ) {
              evidence = {
                ...child.pin,
                executionId: execId(execution.id),
                parentExecutionId: result.executionId,
                status: execution.status === 'success' ? 'succeeded' : 'failed',
              };
              break;
            }
          } catch {
            /* No raw provider payload escapes. */
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      dependencies.push(evidence);
    }
    let removed = true;
    // Exact source IDs/version/hash are reverified, main first then child. On
    // a drift or unknown write, leave only the owned artifact for reconciliation.
    for (const entry of [
      ...(main ? [{ provider: main, workflow: materialized.workflow }] : []),
      ...owned.map((child) => ({ provider: child.provider, workflow: child.member.workflow })),
    ]) {
      try {
        await removeTest(config, entry.provider, entry.workflow);
      } catch {
        removed = false;
      }
    }
    return {
      ...result,
      ...proof,
      ...(materialized ? { materializedWorkflowHash: materialized.workflowHash } : {}),
      ownedDependencies: dependencies,
      cleanup: {
        status: removed && main && owned.length === members.length - 1 ? 'removed' : 'pending',
      },
    };
  }
  async function probeNativeFailure(scope, command) {
    const artifact = createNativeFailureProbeArtifact(command);
    const result = await testNative(
      scope,
      {
        environmentId: command.environmentId,
        workflow: artifact.workflow,
        spec: artifact.spec,
        testId: command.probeId,
        invocationId: command.invocationId,
        input: {},
        nativeConnections: [],
        allowExternalEffects: false,
      },
      { failureProbe: true }
    );
    const complete =
      result.status === 'failed' &&
      execId(result.executionId) &&
      result.ownedDependencies.length === 1 &&
      result.ownedDependencies[0].status === 'succeeded' &&
      result.ownedDependencies[0].parentExecutionId === result.executionId &&
      result.cleanup.status === 'removed';
    return {
      ...result,
      ...artifact.source,
      kind: NATIVE_FAILURE_PROBE_KIND,
      coverage: NATIVE_FAILURE_PROBE_KIND,
      mainExecution: { status: result.status, executionId: execId(result.executionId) },
      status: complete
        ? 'succeeded'
        : result.status === 'outcome_unknown' ||
            result.cleanup.status !== 'removed' ||
            result.ownedDependencies.some((entry) => entry.status === 'outcome_unknown')
          ? 'outcome_unknown'
          : 'failed',
      externalEffects: false,
    };
  }
  async function reconcileNativeFailureProbe(scope, command) {
    const artifact = createNativeFailureProbeArtifact(command);
    const originalConfig = binding(scope, command.environmentId);
    // Cleanup remains possible after an operator disables the execution policy.
    // This local policy is used solely to validate retained pure snapshots, not
    // to create, publish, execute or change any customer workflow.
    const config = {
      ...originalConfig,
      nativePolicy: {
        ...originalConfig.nativePolicy,
        ownedErrorHandlers: true,
        backgroundExecution: 'instance_cpu_always',
      },
    };
    const result = {
      ...artifact.source,
      kind: NATIVE_FAILURE_PROBE_KIND,
      coverage: NATIVE_FAILURE_PROBE_KIND,
      externalEffects: false,
      status: 'outcome_unknown',
      mainExecution: { status: 'outcome_unknown', executionId: null },
      ownedDependencies: [],
      testArtifactHash: artifact.workflowHash,
      testBundleHash: artifact.bundleHash,
      cleanup: { status: 'pending' },
    };
    try {
      const members = checked(config, artifact, command.probeId, true, [], false);
      const listing = await inventory(config);
      const owned = [];
      for (const member of members.slice(1)) {
        const matches = listing.filter((entry) => entry.name === member.workflow.name);
        if (matches.length > 1) return result;
        if (matches.length === 1) {
          const stored = await request(config, path(matches[0].id));
          verifyStoredWorkflow(stored, member.workflow);
          owned.push({ member, stored, pin: childPin(member, stored) });
        }
      }
      const mainMatches = listing.filter((entry) => entry.name === artifact.workflow.name);
      if (mainMatches.length > 1 || (mainMatches.length && owned.length !== members.length - 1))
        return result;
      let main, materialized;
      if (mainMatches.length === 1) {
        materialized = materializeNativeBundle(
          artifact,
          owned.map((entry) => entry.pin)
        );
        main = await request(config, path(mainMatches[0].id));
        verifyStoredWorkflow(main, materialized.workflow);
        result.materializedWorkflowHash = materialized.workflowHash;
        Object.assign(
          result,
          await reconcileExecutions(
            config,
            artifact,
            { main, materialized, children: owned },
            command.invocationId
          )
        );
      }
      // Exact deterministic ownership and source bytes only. Never retry the
      // failed main, synthesize an ErrorTrigger event, or edit provider state.
      for (const entry of [
        ...(main ? [{ stored: main, member: { workflow: materialized.workflow } }] : []),
        ...owned,
      ])
        await removeTest(config, entry.stored, entry.member.workflow);
      result.cleanup.status = 'removed';
      if (
        result.mainExecution.status === 'failed' &&
        result.ownedDependencies.length === 1 &&
        result.ownedDependencies[0].status === 'succeeded' &&
        result.ownedDependencies[0].parentExecutionId === result.mainExecution.executionId
      )
        result.status = 'succeeded';
      else if (
        result.mainExecution.status !== 'outcome_unknown' &&
        result.ownedDependencies.length === 1 &&
        result.ownedDependencies[0].status !== 'outcome_unknown'
      )
        result.status = 'failed';
    } catch {
      /* Absence of verified evidence must not become a success claim. */
    }
    return result;
  }
  return {
    deploy,
    activation,
    invoke,
    reconcileInvocation,
    testNative,
    probeNativeFailure,
    reconcileNativeFailureProbe,
  };
}
