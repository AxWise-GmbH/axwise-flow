// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HANDLER_003, handler003Hash, handler003Configuration, desiredHandler003Configuration, assertHandler003TargetNames,
  probeOnlyHandler003Bindings, parseHandler003Arguments, handler003PlanReceipt, assertHandler003StagedRuntime } from '../solution-handler-preview-003-operator.mjs';
import { createBoundedHttpPolicy, REQUEST_AUTOMATION_POLICY } from '../../server/workflow-v2/native-workflow-review.js';
import { createSolutionRuntime } from '../../server/workflow-v2/solution-runtime.js';

function bindings() {
  return ['001', '002', '003'].map((suffix) => ({
    id: `orqaly-customer-webhook-preview-${suffix}`,
    tenantId: 'c1b26d36-721b-5d8c-8d4c-180050ee9b94', userId: 'user_2vHlB9JhH4FazWsgKYENFIeAnMu',
    name: `Synthetic ${suffix}`, region: 'europe-west4',
    origin: `https://orqaly-solution-n8n-preview${suffix === '001' ? '' : `-${suffix}`}-161074549006.europe-west4.run.app`,
    apiKey: `synthetic-not-a-real-management-key-${suffix}`, useIdToken: true,
    nativePolicy: suffix === '003' ? createBoundedHttpPolicy({ imageDigest: HANDLER_003.image.split('@')[1] }) : structuredClone(REQUEST_AUTOMATION_POLICY),
  }));
}
function service() {
  return { metadata: { annotations: { 'run.googleapis.com/ingress': 'all' }, labels: { owner: 'existing' } },
    spec: { traffic: [{ revisionName: 'previous', percent: 100 }], template: {
      metadata: { name: 'old-revision', annotations: { 'run.googleapis.com/cpu-throttling': 'true', 'autoscaling.knative.dev/maxScale': '1' } },
      spec: { serviceAccountName: 'existing-service-account', containerConcurrency: 1, timeoutSeconds: 90,
        containers: [{ image: HANDLER_003.image, resources: { limits: { cpu: '1', memory: '1Gi' } },
          env: [{ name: 'NODES_INCLUDE', value: JSON.stringify(['n8n-nodes-base.webhook']) },
            { name: 'DB_POSTGRESDB_PASSWORD', valueFrom: { secretKeyRef: { name: 'existing-secret', key: '1' } } }] }] },
    } } };
}
function staged() {
  const current = { runtimes: [service(), service(), service()].map((value, i) => ({ service: value,
    iam: { bindings: [{ role: 'roles/run.invoker', members: [`serviceAccount:synthetic${i}`] }] } })),
  secretIam: { bindings: [{ role: 'roles/secretmanager.secretAccessor', members: ['serviceAccount:synthetic'] }] },
  versions: [{ version: '1', state: 'ENABLED' }, { version: '2', state: 'ENABLED' }],
  appRefs: ['orqaly-v2-api-preview', 'orqaly-v2-worker-preview'].map((name) => ({ name,
    reference: { name: HANDLER_003.secret, key: '2' } })) };
  const candidate = `${HANDLER_003.service}-${HANDLER_003.suffix}`;
  current.runtimes.forEach(({ service: value }) => { value.status = {
    conditions: ['Ready', 'ConfigurationsReady', 'RoutesReady'].map((type) => ({ type, status: 'True' })) }; });
  const value = current.runtimes[2].service;
  value.spec.template.metadata.name = candidate;
  value.spec.template.metadata.labels = { 'run.googleapis.com/startupProbeType': 'Custom' };
  value.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'] = 'false';
  value.spec.template.spec.containers[0].env[0].value = '["n8n-nodes-base.webhook","n8n-nodes-base.errorTrigger"]';
  value.spec.traffic = [{ revisionName: HANDLER_003.revision, percent: 100 }, { revisionName: candidate, tag: HANDLER_003.tag }];
  Object.assign(value.status, { latestReadyRevisionName: candidate, latestCreatedRevisionName: candidate, traffic: structuredClone(value.spec.traffic) });
  return { current, planned: handler003PlanReceipt(current) };
}
describe('fixed existing003 handler probe operator boundaries', () => {
  it('accepts the short traffic tag and preserves the reviewed revision suffix', () => {
    expect(HANDLER_003.tag).toBe('hp-sep7');
    expect(HANDLER_003.suffix).toBe('handler-probe-sep7');
    expect(() => assertHandler003TargetNames()).not.toThrow();
  });
  it('rejects the previously invalid combined traffic-tag length before a cloud call', () => {
    expect(() => assertHandler003TargetNames({ ...HANDLER_003, tag: 'handler-probe-sep7' })).toThrow('cloud_run_tag_and_service_max46');
  });
  it('binds traffic tag, revision suffix and complete candidate name into the reviewed plan hash', () => {
    const plan = handler003PlanReceipt({ runtimes: [service(), service(), service()].map((value) => ({ service: value, iam: { bindings: [] } })),
      secretIam: { bindings: [] }, versions: [{ version: '2', state: 'ENABLED' }], appRefs: [] });
    expect(plan).toMatchObject({ trafficTag: 'hp-sep7', revisionSuffix: 'handler-probe-sep7',
      candidateRevision: `${HANDLER_003.service}-handler-probe-sep7` });
    expect(handler003Hash({ ...plan, trafficTag: 'different-tag' })).not.toBe(handler003Hash(plan));
    expect(handler003Hash({ ...plan, revisionSuffix: 'different-suffix' })).not.toBe(handler003Hash(plan));
  });
  it.each([{ suffix: 'a'.repeat(64) }, { tag: 'invalid-' }, { tag: 'Uppercase' },
    { service: 'another-service' }])('rejects invalid or different target names: %j', (change) => {
    expect(() => assertHandler003TargetNames({ ...HANDLER_003, ...change })).toThrow();
  });
  it('requires explicit scoped modes and separate reviewed apply confirmation', () => {
    expect(parseHandler003Arguments(['inspect'])).toEqual({ mode: 'inspect' });
    expect(parseHandler003Arguments(['plan', '/private/tmp/orqaly-handler-reviewed.json']).mode).toBe('plan');
    expect(parseHandler003Arguments(['apply', '/private/tmp/orqaly-handler-reviewed.json', '--confirm-existing-003-probe-only']).mode).toBe('apply');
    expect(parseHandler003Arguments(['plan-staged', '/private/tmp/orqaly-handler-staged.json']).mode).toBe('plan-staged');
    expect(parseHandler003Arguments(['resume-staged', '/private/tmp/orqaly-handler-staged.json', '--confirm-existing-003-probe-only']).mode).toBe('resume-staged');
  });
  it.each([[], ['deploy'], ['inspect', 'unexpected'], ['plan', '/private/tmp/other.json'],
    ['plan', '/private/tmp/orqaly-handler-../../bad.json'], ['apply', '/private/tmp/orqaly-handler-reviewed.json'],
    ['apply', '/private/tmp/orqaly-handler-reviewed.json', '--enable-production'],
    ['resume-staged', '/private/tmp/orqaly-handler-staged.json'],
    ['resume-staged', '/private/tmp/orqaly-handler-staged.json', '--enable-production'],
    ['plan-staged', '/private/tmp/orqaly-handler-staged.json', '--confirm-existing-003-probe-only']])('rejects unsafe arguments %j', (args) => {
    expect(() => parseHandler003Arguments(args)).toThrow();
  });
  it('adds only003 probe flags while preserving every key/owner/other environment and generic node grant', () => {
    const previous = bindings(), snapshot = structuredClone(previous);
    const next = probeOnlyHandler003Bindings(previous);
    expect(previous).toEqual(snapshot);
    expect(next.slice(0, 2)).toEqual(previous.slice(0, 2));
    const updated = next[2];
    expect(updated.nativePolicy.ownedErrorHandlerProbe).toBe(true);
    expect(updated.nativePolicy.backgroundExecution).toBe('instance_cpu_always');
    expect(updated.nativePolicy).not.toHaveProperty('ownedErrorHandlers');
    expect(updated.nativePolicy.allowedNodes).toEqual(previous[2].nativePolicy.allowedNodes);
    expect(updated.apiKey).toBe(previous[2].apiKey);
    delete updated.nativePolicy.ownedErrorHandlerProbe; delete updated.nativePolicy.backgroundExecution;
    expect(next).toEqual(previous);
  });
  it.each([
    (value) => { value[2].userId = 'user_other'; },
    (value) => { value[2].tenantId = '01e219b5-817f-4eb8-809c-50dce7089312'; },
    (value) => { value[2].origin = 'https://other.example'; },
    (value) => { value[2].useIdToken = false; },
    (value) => { value[2].nativePolicy.ownedErrorHandlers = true; },
    (value) => { value[2].nativePolicy.maxExecutionSeconds = 59; },
    (value) => { value.push(value[2]); },
  ])('rejects changed baseline binding authority before cloud writes', (change) => {
    const value = bindings(); change(value);
    expect(() => probeOnlyHandler003Bindings(value)).toThrow();
  });
  it('requires CPU capability but never grants general ErrorTrigger execution nodes', () => {
    const value = probeOnlyHandler003Bindings(bindings());
    const make = () => createSolutionRuntime({ bindings: value, fetchImpl: async () => { throw new Error('no_network'); } });
    expect(make().nativePolicy(value[2], HANDLER_003.environmentId).ownedErrorHandlerProbe).toBe(true);
    delete value[2].nativePolicy.backgroundExecution;
    expect(make).toThrow();
    value[2].nativePolicy.backgroundExecution = 'instance_cpu_always';
    value[2].nativePolicy.allowedNodes.push({ type: 'n8n-nodes-base.errorTrigger', typeVersion: 1 });
    expect(make).toThrow();
  });
  it('changes CPU annotation and appends exactly one native node, preserving image/scaling/secrets/SA', () => {
    const original = service(), before = structuredClone(original);
    const desired = desiredHandler003Configuration(original);
    expect(original).toEqual(before);
    const template = desired.spec.template;
    expect(template.metadata.annotations).toEqual({ 'run.googleapis.com/cpu-throttling': 'false', 'autoscaling.knative.dev/maxScale': '1' });
    expect(template.spec.containers[0].env).toEqual([
      { name: 'NODES_INCLUDE', value: '["n8n-nodes-base.webhook","n8n-nodes-base.errorTrigger"]' },
      before.spec.template.spec.containers[0].env[1],
    ]);
    const restored = structuredClone(desired);
    restored.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'] = 'true';
    restored.spec.template.spec.containers[0].env = before.spec.template.spec.containers[0].env;
    expect(handler003Hash(restored)).toBe(handler003Hash(handler003Configuration(before)));
  });
  it('normalizes only the ephemeral template client nonce, including removal and nonce-only labels', () => {
    const original = service(), changed = structuredClone(original);
    original.spec.template.metadata.labels = { 'client.knative.dev/nonce': 'old' };
    expect(handler003Configuration(original)).toEqual(handler003Configuration(changed));
    expect(handler003Configuration(original, { normalizeClientNonce: false })).not.toEqual(handler003Configuration(changed));
    original.spec.template.metadata.labels.owner = 'existing';
    changed.spec.template.metadata.labels = { owner: 'existing', 'client.knative.dev/nonce': 'new' };
    expect(handler003Configuration(original)).toEqual(handler003Configuration(changed));
    expect(original.spec.template.metadata.labels['client.knative.dev/nonce']).toBe('old');
    changed.spec.template.metadata.labels.owner = 'different';
    expect(handler003Configuration(original)).not.toEqual(handler003Configuration(changed));
    changed.spec.template.metadata.labels.owner = 'existing';
    changed.metadata.labels['client.knative.dev/nonce'] = 'service-label-not-ignored';
    expect(handler003Configuration(original)).not.toEqual(handler003Configuration(changed));
  });
  it('accepts only the Ready staged candidate with original100% and its exact zero-traffic tag', () => {
    const { current, planned } = staged();
    expect(() => assertHandler003StagedRuntime(current, planned)).not.toThrow();
    current.runtimes[2].service.spec.template.metadata.labels['client.knative.dev/nonce'] = 'fresh';
    expect(() => assertHandler003StagedRuntime(current, planned)).not.toThrow();
  });
  it.each([
    ['runtime label', (c) => { c.runtimes[2].service.spec.template.metadata.labels.owner = 'different'; }],
    ['service label', (c) => { c.runtimes[2].service.metadata.labels.owner = 'different'; }],
    ['image', (c) => { c.runtimes[2].service.spec.template.spec.containers[0].image += '-different'; }],
    ['max instances', (c) => { c.runtimes[2].service.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'] = '2'; }],
    ['minimum instances', (c) => { c.runtimes[2].service.spec.template.metadata.annotations['autoscaling.knative.dev/minScale'] = '1'; }],
    ['memory', (c) => { c.runtimes[2].service.spec.template.spec.containers[0].resources.limits.memory = '2Gi'; }],
    ['CPU', (c) => { c.runtimes[2].service.spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'] = 'true'; }],
    ['SA', (c) => { c.runtimes[2].service.spec.template.spec.serviceAccountName = 'other'; }],
    ['n8n secret reference', (c) => { c.runtimes[2].service.spec.template.spec.containers[0].env[1].valueFrom.secretKeyRef.key = '2'; }],
    ['n8n nodes', (c) => { c.runtimes[2].service.spec.template.spec.containers[0].env[0].value = '["n8n-nodes-base.errorTrigger","n8n-nodes-base.code"]'; }],
    ['001 spec', (c) => { c.runtimes[0].service.spec.template.spec.timeoutSeconds = 91; }],
    ['002 metadata', (c) => { c.runtimes[1].service.metadata.labels.owner = 'different'; }],
    ['003 IAM', (c) => { c.runtimes[2].iam.bindings[0].members.push('allUsers'); }],
    ['001 IAM', (c) => { c.runtimes[0].iam.bindings[0].members.push('allUsers'); }],
    ['secret IAM', (c) => { c.secretIam.bindings[0].members.push('allUsers'); }],
    ['new secret version', (c) => { c.versions.push({ version: '3', state: 'ENABLED' }); }],
    ['app binding', (c) => { c.appRefs[0].reference.key = '3'; }],
    ['candidate Ready', (c) => { c.runtimes[2].service.status.conditions[0].status = 'False'; }],
    ['another revision', (c) => { c.runtimes[2].service.status.latestCreatedRevisionName = 'other'; }],
    ['another Ready revision', (c) => { c.runtimes[2].service.status.latestReadyRevisionName = 'other'; }],
    ['template name', (c) => { c.runtimes[2].service.spec.template.metadata.name = 'other'; }],
    ['desired traffic', (c) => { c.runtimes[2].service.spec.traffic[0].percent = 99; }],
    ['live traffic', (c) => { c.runtimes[2].service.status.traffic[0].percent = 99; }],
    ['extra tag', (c) => { c.runtimes[2].service.status.traffic.push({ revisionName: 'other', tag: 'other' }); }],
    ['changed tag', (c) => { c.runtimes[2].service.status.traffic[1].tag = 'other'; }],
  ])('rejects staged drift: %s', (_label, change) => {
    const { current, planned } = staged(); change(current);
    expect(() => assertHandler003StagedRuntime(current, planned)).toThrow();
  });
});
