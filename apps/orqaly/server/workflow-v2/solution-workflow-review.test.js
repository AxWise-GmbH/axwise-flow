import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { compileSolutionWorkflow, expectedSolutionOutput } from './solution-compiler.js';
import { reviewSolutionWorkflow } from './solution-workflow-review.js';

const solutionId = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const baseSpec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'name', target: 'customer', transform: 'trim' }],
};
const baseWorkflow = compileSolutionWorkflow({ id: solutionId, spec: baseSpec }).workflow;
const draft = () => structuredClone(baseWorkflow);
const review = (workflow) =>
  reviewSolutionWorkflow({ solutionId, baseWorkflow, baseSpec, workflow });
const replaceRaw = (expression) => {
  const workflow = draft();
  workflow.nodes[1].parameters.jsonOutput = expression;
  return workflow;
};
const expectRejected = (workflow, code) => {
  const result = review(workflow);
  expect(result.valid).toBe(false);
  expect(result.issues[0].code).toBe(code);
  expect(result.workflow).toBeNull();
  expect(result.workflowHash).toBeNull();
  expect(result.spec).toBeNull();
};

describe('native solution workflow review', () => {
  it('accepts the compiled baseline without inventing review results or changing its hash', () => {
    const result = review(draft());
    expect(result).toMatchObject({
      valid: true,
      issues: [],
      spec: baseSpec,
      workflow: baseWorkflow,
      changes: [],
    });
    expect(result.workflowHash).toBe(canonicalJsonSha256(baseWorkflow));
    expect(result.summary).toContain('No execution behavior changed');
    expect(JSON.stringify(result)).not.toMatch(/AxWise|LLM|model.*review/i);
  });

  it('recognizes native JSON mapping edits, preserves the exact accepted configuration and reports semantic changes', () => {
    const workflow = replaceRaw(
      `={{ { "customer": $json.body.input["email"].toLowerCase(), 'region': $json.body.input['country'].toUpperCase(), "count": $json.body.input["count"] } }}`
    );
    workflow.nodes[1].position = [380, 140];
    const result = review(workflow);
    expect(result.valid).toBe(true);
    expect(result.spec.fields).toEqual([
      { source: 'email', target: 'customer', transform: 'lowercase' },
      { source: 'country', target: 'region', transform: 'uppercase' },
      { source: 'count', target: 'count', transform: 'copy' },
    ]);
    expect(result.workflow.nodes[1]).toEqual(workflow.nodes[1]);
    expect(result.workflowHash).toBe(canonicalJsonSha256(result.workflow));
    expect(result.changes.map((change) => change.kind)).toEqual([
      'mapping_changed',
      'mapping_added',
      'mapping_added',
      'layout',
    ]);
    expect(
      expectedSolutionOutput(result.spec, { email: 'HELLO@EXAMPLE.COM', country: 'de', count: 3 })
    ).toEqual({ customer: 'hello@example.com', region: 'DE', count: 3 });
  });

  it('accepts the captured native uppercase autosave serialization after gateway default normalization', () => {
    // The real native editor rounds node positions to its grid and serializes
    // parameters before identity fields. The gateway has already removed only
    // its implicit binaryMode:"separate" and autosave-envelope metadata here.
    const saved = {
      name: baseWorkflow.name,
      nodes: [
        {
          parameters: {
            httpMethod: 'POST',
            path: `solution-${solutionId}`,
            responseMode: 'responseNode',
            options: {},
          },
          id: 'receive',
          name: 'Receive input',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2,
          position: [0, 0],
          webhookId: solutionId,
        },
        {
          parameters: {
            mode: 'raw',
            jsonOutput: '={{ { "customer": $json.body.input["name"].toUpperCase() } }}',
            options: {},
          },
          id: 'transform',
          name: 'Transform fields',
          type: 'n8n-nodes-base.set',
          typeVersion: 3.4,
          position: [272, 0],
        },
        {
          parameters: {
            respondWith: 'json',
            responseBody:
              '={{ { output: $json, executionId: $execution.id, invocationId: $("Receive input").first().json.body.invocationId } }}',
            options: { responseCode: 200 },
          },
          id: 'respond',
          name: 'Return result',
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1.4,
          position: [528, 0],
        },
      ],
      connections: structuredClone(baseWorkflow.connections),
      settings: structuredClone(baseWorkflow.settings),
    };
    const result = review(saved);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.workflow).toEqual(saved);
    expect(result.workflowHash).toBe(canonicalJsonSha256(saved));
    expect(result.workflowHash).not.toBe(canonicalJsonSha256(baseWorkflow));
    expect(result.spec.fields).toEqual([
      { source: 'name', target: 'customer', transform: 'uppercase' },
    ]);
    expect(expectedSolutionOutput(result.spec, { name: ' Alice ' })).toEqual({
      customer: ' ALICE ',
    });
    expect(expectedSolutionOutput(baseSpec, { name: ' Alice ' })).toEqual({ customer: 'Alice' });
    expect(result.changes.map((change) => change.kind)).toEqual(['mapping_changed', 'layout']);
  });

  it('accepts native manual string transforms without rewriting them into generated raw mode', () => {
    const workflow = draft();
    workflow.nodes[1].parameters = {
      mode: 'manual',
      assignments: {
        assignments: [
          {
            id: 'native-field-1',
            name: 'customer',
            type: 'string',
            value: '={{ $json.body.input["name"].trim() }}',
          },
          {
            id: 'native-field-2',
            name: 'email',
            type: 'string',
            value: "={{ $json.body.input['email'].toLowerCase() }}",
          },
        ],
      },
      includeOtherFields: false,
      options: { ignoreConversionErrors: false, dotNotation: false },
    };
    const result = review(workflow);
    expect(result.valid).toBe(true);
    expect(result.workflow.nodes[1].parameters).toEqual(workflow.nodes[1].parameters);
    expect(result.spec.fields[1]).toEqual({
      source: 'email',
      target: 'email',
      transform: 'lowercase',
    });
  });

  it('reports node movement and mapping representation changes as non-behavioral', () => {
    const workflow = replaceRaw("={{ {'customer' : $json.body.input['name'].trim( )} }}");
    workflow.nodes[0].position = [-230, 40];
    const result = review(workflow);
    expect(result.valid).toBe(true);
    expect(result.changes.map((change) => change.kind)).toEqual(['layout', 'representation']);
    expect(result.summary).toContain('No execution behavior changed');
  });

  it('strips known native version, sharing, note and data placeholders from the approved snapshot', () => {
    const workflow = draft();
    Object.assign(workflow, {
      id: 'native-workflow',
      active: false,
      versionId: 'native-version',
      activeVersionId: null,
      createdAt: '2026-09-05T10:00:00Z',
      updatedAt: '2026-09-05T11:00:00Z',
      meta: { instanceId: 'native-instance', templateCredsSetupCompleted: true },
      shared: [{ projectId: 'editor-project' }],
      scopes: ['workflow:update'],
      tags: [],
      pinData: {},
      staticData: null,
      isArchived: false,
    });
    Object.assign(workflow.nodes[0], {
      disabled: false,
      notes: 'Only an editor note',
      notesInFlow: true,
      onError: 'stopWorkflow',
    });
    const result = review(workflow);
    expect(result.valid).toBe(true);
    expect(result.workflow).toEqual(baseWorkflow);
    expect(result.workflowHash).toBe(canonicalJsonSha256(baseWorkflow));
  });

  it.each([
    '$json.body.input["name"].constructor("return process")()',
    '$json.body.input["name"].trim().toLowerCase()',
    '$json.body.input["name"] || $env.SECRET',
    '$json.body.input["name"] + $json.body.input["email"]',
    '$json.body.input["name"]; process.exit()',
    '$json.body.input["name"].trim($env.SECRET)',
    '$json.body.input["name\'].trim()',
    '$json.body.input["na\\u006de"].trim()',
    '$json.body.input.name',
    '$env.SECRET',
    '$("Credentials").first().json',
    '(()=>{globalThis.__reviewExecuted = true; return "x"})()',
  ])('rejects expression escape or unsupported JavaScript: %s', (expression) => {
    expectRejected(replaceRaw(`={{ { "customer": ${expression} } }}`), 'UNSUPPORTED_EXPRESSION');
    expect(globalThis.__reviewExecuted).toBeUndefined();
  });

  it.each([
    '={{ { "customer": $json.body.input["name"], "customer": $json.body.input["email"] } }}',
    '={{ { "constructor": $json.body.input["name"] } }}',
    '={{ { "customer": $json.body.input["prototype"] } }}',
    '={{ {} }}',
  ])('rejects invalid or reserved mapping fields', (expression) => {
    expectRejected(replaceRaw(expression), 'INVALID_MAPPINGS');
  });

  it.each([
    { type: 'string', value: '={{ $json.body.input["name"] }}' },
    { type: 'number', value: '={{ $json.body.input["name"].trim() }}' },
    { type: 'object', value: '={{ $json.body.input["name"].trim() }}' },
  ])('rejects manual type conversions that change the inferred scalar contract', (assignment) => {
    const workflow = draft();
    workflow.nodes[1].parameters = {
      mode: 'manual',
      options: {},
      assignments: { assignments: [{ name: 'customer', ...assignment }] },
    };
    expectRejected(workflow, 'UNSUPPORTED_TYPE_CONVERSION');
  });

  it.each(['n8n-nodes-base.httpRequest', 'n8n-nodes-base.code', 'n8n-nodes-base.executeCommand'])(
    'rejects new capability %s',
    (type) => {
      const workflow = draft();
      workflow.nodes[1].type = type;
      expectRejected(workflow, 'UNSUPPORTED_NODE');
    }
  );

  it('rejects credentials, extra nodes, disabled nodes, retries, and custom execution settings', () => {
    const credentialDraft = draft();
    credentialDraft.nodes[1].credentials = { httpHeaderAuth: { id: 'private-credential' } };
    expectRejected(credentialDraft, 'CREDENTIALS_NOT_SUPPORTED');
    const extraDraft = draft();
    extraDraft.nodes.push({ ...extraDraft.nodes[1], id: 'extra' });
    expectRejected(extraDraft, 'UNSUPPORTED_NODE');
    for (const key of [
      'disabled',
      'retryOnFail',
      'executeOnce',
      'alwaysOutputData',
      'continueOnFail',
    ]) {
      const changed = draft();
      changed.nodes[1][key] = true;
      expectRejected(changed, 'UNSUPPORTED_NODE_BEHAVIOR');
    }
    const settingsDraft = draft();
    settingsDraft.settings.saveDataSuccessExecution = 'all';
    expectRejected(settingsDraft, 'WORKFLOW_SETTINGS_CHANGED');
  });

  it('rejects changing the webhook identity, response envelope or graph', () => {
    const webhookDraft = draft();
    webhookDraft.nodes[0].parameters.path = 'another-tenant';
    expectRejected(webhookDraft, 'TRIGGER_CHANGED');
    const idDraft = draft();
    idDraft.nodes[0].webhookId = 'another-tenant';
    expectRejected(idDraft, 'TRIGGER_CHANGED');
    const responseDraft = draft();
    responseDraft.nodes[2].parameters.responseBody = '={{ $env.SECRET }}';
    expectRejected(responseDraft, 'RESPONSE_CHANGED');
    const graphDraft = draft();
    graphDraft.connections['Transform fields'].main[0][0].node = 'Receive input';
    expectRejected(graphDraft, 'UNSUPPORTED_GRAPH');
  });

  it.each([
    ['includeOtherFields', true, 'UNSUPPORTED_DATA_FLOW'],
    ['duplicateItem', true, 'UNSUPPORTED_DATA_FLOW'],
    ['options', { ignoreConversionErrors: true }, 'UNSUPPORTED_TYPE_CONVERSION'],
    ['options', { stripBinary: false }, 'UNSUPPORTED_DATA_FLOW'],
    ['options', { dotNotation: '={{ true }}' }, 'UNSUPPORTED_NODE_CONFIGURATION'],
    ['jsonOutputExpression', 'anything', 'UNSUPPORTED_NODE_CONFIGURATION'],
  ])('rejects unsupported Set setting %s', (key, value, code) => {
    const workflow = draft();
    workflow.nodes[1].parameters[key] = value;
    expectRejected(workflow, code);
  });

  it('rejects pinned data, stored state, activation, and unknown root metadata', () => {
    for (const key of ['pinData', 'staticData']) {
      expectRejected(
        { ...draft(), [key]: { customer: 'private-input' } },
        'WORKFLOW_DATA_NOT_SUPPORTED'
      );
    }
    expectRejected({ ...draft(), active: true }, 'EDITOR_ACTIVATION_FORBIDDEN');
    expectRejected(
      { ...draft(), unexpected: 'configuration' },
      'UNSUPPORTED_WORKFLOW_CONFIGURATION'
    );
    expectRejected(
      { ...draft(), meta: { executable: 'something' } },
      'UNSUPPORTED_WORKFLOW_METADATA'
    );
  });

  it('rejects malformed, oversized, cyclic, prototype-bearing and non-finite JSON without execution', () => {
    expectRejected(null, 'UNSUPPORTED_WORKFLOW_CONFIGURATION');
    expectRejected({ ...draft(), name: 'x'.repeat(64001) }, 'WORKFLOW_TOO_LARGE');
    const cycle = draft();
    cycle.meta = cycle;
    expectRejected(cycle, 'INVALID_WORKFLOW');
    const poison = JSON.parse('{"__proto__":{"polluted":true}}');
    expectRejected({ ...draft(), meta: poison }, 'INVALID_WORKFLOW');
    const positionDraft = draft();
    positionDraft.nodes[0].position = [Infinity, 0];
    expectRejected(positionDraft, 'INVALID_WORKFLOW');
    const getterDraft = draft();
    Object.defineProperty(getterDraft, 'extra', {
      enumerable: true,
      get: () => {
        throw new Error('getter must not run');
      },
    });
    expectRejected(getterDraft, 'INVALID_WORKFLOW');
    expect({}.polluted).toBeUndefined();
  });
});
