// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  normalizeNativeWorkflow,
  assertNativeTransportBindings,
  nativeCandidateFingerprint,
} from './native-workflow-runtime-contract.js';
import { reviewNativeWorkflow, REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';

const id = '799a3d83-b19a-4f4f-aa94-bd2b04cc76de';
const workflow = () => ({
  name: 'Deliver order decision',
  nodes: [
    {
      id: 'receive',
      name: 'Receive order',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [0, 0],
      parameters: {
        path: 'authored-path',
        httpMethod: 'POST',
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'reply',
      name: 'Reply',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [250, 0],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ { accepted: true } }}',
        options: {
          responseCode: 202,
          responseHeaders: { entries: [{ name: 'x-customer-result', value: 'accepted' }] },
        },
      },
    },
  ],
  connections: { 'Receive order': { main: [[{ node: 'Reply', type: 'main', index: 0 }]] } },
  settings: {},
});

describe('native artifact normalization is limited to owned transport fields', () => {
  it('preserves real business JSON, response status, graph, positions and nonreserved headers', () => {
    const input = workflow();
    const normalized = normalizeNativeWorkflow({ workflow: input, id });
    expect(normalized.workflow.nodes[1].parameters).toMatchObject({
      responseBody: input.nodes[1].parameters.responseBody,
      options: { responseCode: 202 },
    });
    expect(normalized.workflow.connections).toEqual(input.connections);
    expect(normalized.workflow.nodes[1].position).toEqual([250, 0]);
    expect(normalized.workflow.nodes[1].parameters.options.responseHeaders.entries).toContainEqual({
      name: 'x-customer-result',
      value: 'accepted',
    });
    expect(input.nodes[0].parameters.path).toBe('authored-path');
    expect(() =>
      assertNativeTransportBindings({ workflow: normalized.workflow, id })
    ).not.toThrow();
    expect(normalizeNativeWorkflow({ workflow: normalized.workflow, id }).workflowHash).toBe(
      normalized.workflowHash
    );
  });
  it.each([
    { pinData: { Reply: [{ json: { invented: true } }] } },
    { staticData: { cursor: 'hidden' } },
    { meta: { templateCredsSetupCompleted: true } },
    { nodeGroups: [{ name: 'Customer group' }] },
    { tags: [{ id: 'important' }] },
    { description: 'A meaningful customer edit' },
    { unsupported: true },
    { active: true },
    { active: 'false' },
    { name: '' },
    { name: 'x'.repeat(121) },
    { settings: [] },
  ])(
    'rejects hidden or unsupported data instead of displaying a false Saved state (%j)',
    (extra) => {
      expect(() =>
        normalizeNativeWorkflow({ workflow: { ...workflow(), ...extra }, id })
      ).toThrow();
    }
  );
  it('accepts only empty inert editor metadata and rejects malformed headers', () => {
    expect(
      normalizeNativeWorkflow({
        workflow: {
          ...workflow(),
          active: false,
          pinData: {},
          staticData: null,
          meta: {},
          tags: [],
          nodeGroups: [],
          description: '',
        },
        id,
      }).workflow
    ).toEqual(normalizeNativeWorkflow({ workflow: workflow(), id }).workflow);
    for (const entry of [
      null,
      { value: 'lost' },
      { name: 'x-custom', value: 'value', unsupported: true },
    ]) {
      const input = workflow();
      input.nodes[1].parameters.options.responseHeaders.entries.push(entry);
      expect(() => normalizeNativeWorkflow({ workflow: input, id })).toThrow('headers_invalid');
    }
  });
  it('pins cleanup-retention settings only on disposable tests and rejects identity changes', () => {
    const normal = normalizeNativeWorkflow({ workflow: workflow(), id });
    const test = normalizeNativeWorkflow({ workflow: normal.workflow, id, controlledTest: true });
    expect(test.workflow.settings.saveDataErrorExecution).toBe('all');
    expect(normal.workflow.settings.saveDataErrorExecution).toBe('none');
    expect(() => assertNativeTransportBindings({ workflow: test.workflow, id })).toThrow(
      'binding_changed'
    );
    expect(() =>
      assertNativeTransportBindings({ workflow: test.workflow, id, controlledTest: true })
    ).not.toThrow();
    expect(() =>
      assertNativeTransportBindings({
        workflow: normal.workflow,
        id: 'efe0d088-2908-4c81-8b21-82d0e32c41b4',
      })
    ).toThrow();
  });
  it('retains unreviewed business settings so policy, not normalization, blocks them', () => {
    const value = normalizeNativeWorkflow({
      workflow: { ...workflow(), settings: { errorWorkflow: 'unowned-dependency' } },
      id,
    }).workflow;
    expect(value.settings.errorWorkflow).toBe('unowned-dependency');
    expect(
      reviewNativeWorkflow({ workflow: value, spec: {}, runtimePolicy: REQUEST_AUTOMATION_POLICY })
        .execution.allowed
    ).toBe(false);
  });
  it('fingerprints exact criteria, connection target and runtime while ignoring connection query order', () => {
    const connection = (id) => ({
      id,
      environment_id: 'env1',
      credential_type: 'githubApi',
      provider_credential_id: `private-${id}`,
      scope: { repository: 'repo' },
    });
    const input = {
      workflow: normalizeNativeWorkflow({ workflow: workflow(), id }).workflow,
      spec: { acceptanceCases: [{ input: 1, expectedOutput: 2 }] },
      runtimePolicy: REQUEST_AUTOMATION_POLICY,
      connections: [connection('one'), connection('two')],
    };
    const first = nativeCandidateFingerprint(input);
    expect(
      nativeCandidateFingerprint({ ...input, connections: [...input.connections].reverse() })
    ).toBe(first);
    for (const changed of [
      { ...input, spec: { acceptanceCases: [{ input: 1, expectedOutput: 3 }] } },
      { ...input, runtimePolicy: null },
      { ...input, connections: [connection('one')] },
    ])
      expect(nativeCandidateFingerprint(changed)).not.toBe(first);
  });
});
