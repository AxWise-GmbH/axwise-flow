// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  reviewNativeWorkflow,
  REQUEST_AUTOMATION_POLICY,
  validateNativeWorkflowData,
  checkNativeWorkflowAcceptance,
} from './native-workflow-review.js';
import { inspectNativeExpression } from './native-expression-policy.js';
import {
  NativeWorkflowSpecV2Schema,
  PrepareSolutionResponseV2Schema,
  isBoundedNativeJson,
} from '../../shared/workflow-v2/native-workflow-contracts.js';
import {
  createNativeWorkflowKnowledge,
  getNativeNodeDefinition,
  listNativeNodeDefinitions,
  nativeWorkflowHash,
  NATIVE_WORKFLOW_CATALOG_PIN,
  verifyNativeWorkflowKnowledge,
} from './native-workflow-knowledge.js';

export const nativeSpec = () => ({
  kind: 'n8n_workflow_v2',
  requirements: [
    {
      id: 'routing',
      description: 'Route a sufficiently large order to accepted; reject smaller orders',
    },
  ],
  inputSchema: {
    type: 'object',
    properties: { amount: { type: 'number' } },
    required: ['amount'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: { accepted: { type: 'boolean' } },
    required: ['accepted'],
    additionalProperties: false,
  },
  acceptanceCases: [
    {
      id: 'large',
      description: 'Accept an order of 100',
      requirementIds: ['routing'],
      input: { amount: 100 },
      expectedOutput: { accepted: true },
      assertions: [],
    },
    {
      id: 'small',
      description: 'Reject an order of 2',
      requirementIds: ['routing'],
      input: { amount: 2 },
      expectedOutput: { accepted: false },
      expectedStatus: 422,
      assertions: [],
    },
  ],
  connections: [],
  runtimeProfile: 'request_automation',
});
const node = (id, name, type, typeVersion, parameters) => ({
  id,
  name,
  type: `n8n-nodes-base.${type}`,
  typeVersion,
  parameters,
  position: [Number(id.replace(/\D/g, '') || 0) * 250, 0],
});
const wire = (name, index = 0) => ({ node: name, type: 'main', index });
export const branchWorkflow = () => ({
  name: 'Route incoming orders',
  active: false,
  nodes: [
    node('n1', 'Receive order', 'webhook', 2.1, {
      httpMethod: 'POST',
      path: 'solution-test',
      responseMode: 'responseNode',
      options: {},
    }),
    node('n2', 'Check amount', 'if', 2.3, {
      conditions: {
        options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
        combinator: 'and',
        conditions: [
          {
            id: 'c1',
            leftValue: '={{ $json.body.amount }}',
            rightValue: 100,
            operator: { type: 'number', operation: 'gte' },
          },
        ],
      },
      options: {},
    }),
    node('n3', 'Accept order', 'respondToWebhook', 1.5, {
      respondWith: 'json',
      responseBody: '={{ { "accepted": true } }}',
      options: {},
    }),
    node('n4', 'Reject order', 'respondToWebhook', 1.5, {
      respondWith: 'json',
      responseBody: '={{ { "accepted": false } }}',
      options: { responseCode: 422 },
    }),
  ],
  connections: {
    'Receive order': { main: [[wire('Check amount')]] },
    'Check amount': { main: [[wire('Accept order')], [wire('Reject order')]] },
  },
  settings: {
    executionOrder: 'v1',
    executionTimeout: 30,
    saveDataSuccessExecution: 'none',
    saveDataErrorExecution: 'none',
  },
});
const review = (workflow, spec = nativeSpec(), policy = REQUEST_AUTOMATION_POLICY) =>
  reviewNativeWorkflow({ workflow, spec, runtimePolicy: policy });

describe('pinned native knowledge', () => {
  it('parses nested JSON and quoted brace pairs without terminating an expression early', () => {
    for (const expression of [
      '={{ {outer:{inner:1}} }}',
      '={{ {text:"}}", inner:{value:$json.amount}} }}',
      'Order {{ $json.id }}: {{ {payload: {accepted:true}} }}',
    ])
      expect(inspectNativeExpression(expression).safe).toBe(true);
    for (const expression of [
      '={{ {outer:{inner:1} }}',
      '={{ {text:"}}"} }} {{ process.env }}',
      '={{ {outer:{inner:1}} }} {{ fetch("https://unowned.example") }}',
    ])
      expect(inspectNativeExpression(expression).safe).toBe(false);
  });
  it('preserves exact skill content bytes across wire parsing and rejects changed knowledge pins', () => {
    const knowledge = createNativeWorkflowKnowledge({ instruction: 'Create a webhook' });
    expect(
      knowledge.skills.every(
        (skill) => createHash('sha256').update(skill.content).digest('hex') === skill.contentHash
      )
    ).toBe(true);
    expect(verifyNativeWorkflowKnowledge(JSON.parse(JSON.stringify(knowledge)))).toEqual(knowledge);
    for (const change of ['whitespace', 'catalog', 'source']) {
      const modified = structuredClone(knowledge);
      if (change === 'whitespace') modified.skills[0].content = modified.skills[0].content.trim();
      if (change === 'source') modified.skills[0].sourceCommit = '0'.repeat(40);
      if (change === 'catalog') modified.nodes[0].definition.displayName = 'Unreviewed change';
      expect(() => verifyNativeWorkflowKnowledge(modified)).toThrow('reviewed pins');
    }
  });
  it('extracts actual native versions, ports and operation parameters rather than synthetic templates', () => {
    expect(new Set(listNativeNodeDefinitions().map((n) => n.type)).size).toBe(31);
    expect(listNativeNodeDefinitions()).toHaveLength(97);
    expect(getNativeNodeDefinition('n8n-nodes-base.errorTrigger', 1).definition.inputs).toEqual([]);
    expect(
      getNativeNodeDefinition('n8n-nodes-base.set', 3.5).definition.properties.some(
        (p) => p.name === 'assignments' && p.type === 'assignmentCollection'
      )
    ).toBe(true);
    expect(getNativeNodeDefinition('n8n-nodes-base.if', 2.3).definition.outputs).toEqual([
      'main',
      'main',
    ]);
    expect(
      getNativeNodeDefinition('n8n-nodes-base.github', 1.1).definition.credentials.some(
        (c) => c.name === 'githubApi'
      )
    ).toBe(true);
    expect(getNativeNodeDefinition('n8n-nodes-base.twilio', 1)).not.toBeNull();
    expect(getNativeNodeDefinition('n8n-nodes-base.if', 99)).toBeNull();
  });
  it('returns pinned, hashed, bounded instruction-selected knowledge with no runtime access', () => {
    const knowledge = createNativeWorkflowKnowledge({
      instruction: 'Create a GitHub issue and SMS via HTTP webhook after branching',
    });
    expect(knowledge.catalogHash).toBe(nativeWorkflowHash(knowledge.nodes));
    expect(
      knowledge.skills.every((s) => s.sourceCommit === '180b8415e3b73f78828cfa01e908e67f89f2a139')
    ).toBe(true);
    expect(knowledge.skills[0].content).toContain('any unmocked node may really execute');
    expect(knowledge.nodes.map((n) => n.type)).toContain('n8n-nodes-base.github');
    expect(JSON.stringify(knowledge).length).toBeLessThan(150000);
  });
});

describe('general authoring separate from execution', () => {
  it('accepts a four-node genuine conditional graph without recompiling it to mappings', () => {
    const workflow = branchWorkflow();
    const result = review(workflow);
    expect(result.issues).toEqual([]);
    expect(result.execution.reasons).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.execution.allowed).toBe(true);
    expect(result.workflow).toEqual(workflow);
    expect(result.workflowHash).toBe(nativeWorkflowHash(workflow));
    expect(result.summary).toContain('actual test evidence is still required');
  });
  it('accepts native arrays/split/filter/aggregate topology', () => {
    const workflow = branchWorkflow();
    workflow.nodes.splice(
      1,
      1,
      node('n5', 'Split records', 'splitOut', 1, { fieldToSplitOut: 'body.records', options: {} }),
      node('n6', 'Keep eligible', 'filter', 2.3, {
        conditions: {
          combinator: 'and',
          options: {},
          conditions: [
            {
              leftValue: '={{ $json["body.records"].eligible }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'equals' },
            },
          ],
        },
        options: {},
      }),
      node('n7', 'Collect records', 'aggregate', 1, {
        aggregate: 'aggregateAllItemData',
        destinationFieldName: 'records',
        options: {},
      })
    );
    workflow.nodes = workflow.nodes.filter((n) => n.id !== 'n4');
    workflow.connections = {
      'Receive order': { main: [[wire('Split records')]] },
      'Split records': { main: [[wire('Keep eligible')]] },
      'Keep eligible': { main: [[wire('Collect records')]] },
      'Collect records': { main: [[wire('Accept order')]] },
    };
    const result = review(workflow);
    expect(result.issues).toEqual([]);
    expect(result.execution.reasons).toEqual([]);
    expect(result.execution.allowed).toBe(true);
  });
  it('keeps HTTP/GitHub/Twilio native designs visible without granting credentials or network', () => {
    for (const external of [
      node('http', 'Call approved service', 'httpRequest', 4.5, {
        method: 'GET',
        url: 'https://example.com/data',
        options: {},
      }),
      node('git', 'Create an issue', 'github', 1.1, {
        resource: 'issue',
        operation: 'create',
        owner: { __rl: true, mode: 'name', value: 'example' },
        repository: { __rl: true, mode: 'name', value: 'repo' },
        title: 'Issue',
        body: 'Requested change',
      }),
      node('sms', 'Send SMS', 'twilio', 1, {
        resource: 'sms',
        operation: 'send',
        from: '+15550000001',
        to: '+15550000002',
        message: 'Approved test',
      }),
    ]) {
      // Pinned Github uses resource locator modes not guessed IDs; authoring
      // placeholders are actual native names and remain unverified dependencies.
      if (external.id === 'git') {
        external.parameters.owner.mode = 'list';
        external.parameters.repository.mode = 'list';
      }
      const workflow = branchWorkflow();
      workflow.nodes.push(external);
      workflow.connections['Accept order'] = { main: [[wire(external.name)]] };
      const result = review(workflow);
      expect(result.issues, JSON.stringify(result.issues)).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.execution.allowed).toBe(false);
      expect(result.execution.reasons.some((r) => r.code === 'RUNTIME_CAPABILITY')).toBe(true);
    }
  });
  it('preserves an unknown community node as an explicit dependency, never auto-installs', () => {
    const workflow = branchWorkflow();
    workflow.nodes.push(node('custom', 'Customer integration', 'future', 1, {}));
    workflow.nodes.at(-1).type = 'community-reviewed.future';
    workflow.connections['Accept order'] = { main: [[wire('Customer integration')]] };
    const result = review(workflow);
    expect(result.valid).toBe(true);
    expect(result.dependencies[0]).toMatchObject({ kind: 'node', nodeId: 'custom' });
    expect(result.execution.allowed).toBe(false);
  });
  it('fails closed on no runtime policy, image/version drift and unsafe broader claims', () => {
    for (const policy of [
      null,
      { ...REQUEST_AUTOMATION_POLICY, imageDigest: 'sha256:wrong' },
      { ...REQUEST_AUTOMATION_POLICY, n8nVersion: 'latest' },
      { ...REQUEST_AUTOMATION_POLICY, egress: 'allow' },
      { ...REQUEST_AUTOMATION_POLICY, code: true },
    ])
      expect(review(branchWorkflow(), nativeSpec(), policy).execution.allowed).toBe(false);
    expect(NATIVE_WORKFLOW_CATALOG_PIN.n8nVersion).toBe('2.37.10');
  });
  it.each([
    [
      'duplicate ID',
      (w) => {
        w.nodes[1].id = w.nodes[0].id;
      },
      'NODE_ID',
    ],
    [
      'duplicate name',
      (w) => {
        w.nodes[1].name = w.nodes[0].name;
      },
      'NODE_NAME',
    ],
    [
      'invented type version',
      (w) => {
        w.nodes[1].typeVersion = 99;
      },
      'NODE_VERSION',
    ],
    [
      'missing target',
      (w) => {
        w.connections['Receive order'].main[0][0].node = 'Absent';
      },
      'GRAPH_TARGET',
    ],
    [
      'missing output',
      (w) => {
        w.connections['Check amount'].main.push([wire('Accept order')]);
      },
      'GRAPH_OUTPUT_PORT',
    ],
    [
      'missing input',
      (w) => {
        w.connections['Receive order'].main[0][0].index = 3;
      },
      'GRAPH_INPUT_PORT',
    ],
    [
      'invented parameter',
      (w) => {
        w.nodes[1].parameters.guess = 1;
      },
      'NODE_PARAMETER_UNKNOWN',
    ],
    [
      'invented operation',
      (w) => {
        w.nodes[1].parameters.conditions.conditions[0].operator.operation = 'fabricated';
      },
      'NODE_PARAMETER_FILTER',
    ],
    [
      'false saved pin data',
      (w) => {
        w.pinData = { 'Accept order': [{ json: { accepted: true } }] };
      },
      'WORKFLOW_STATE',
    ],
    [
      'raw credential IDs',
      (w) => {
        w.nodes[1].credentials = { githubApi: { id: 'another-customer' } };
      },
      'NODE_CREDENTIAL_AUTHORITY',
    ],
    [
      'active candidate',
      (w) => {
        w.active = true;
      },
      'WORKFLOW_ACTIVE',
    ],
    [
      'unknown native settings field',
      (w) => {
        w.nodes[1].surprise = true;
      },
      'NODE_FIELD',
    ],
  ])('rejects %s', (_name, mutate, code) => {
    const workflow = branchWorkflow();
    mutate(workflow);
    expect(review(workflow).issues.some((r) => r.code === code)).toBe(true);
  });
  it.each([
    '$env.SECRET',
    'process.env.SECRET',
    'globalThis.fetch("https://evil")',
    '$json.constructor.constructor("return process")()',
    '$json["con" + "structor"]',
    '(() => { while(true) {} })()',
    '$json.items.map(x => x.secret)',
  ])('keeps unsupported expression %s non-executable', (expr) => {
    const workflow = branchWorkflow();
    workflow.nodes[2].parameters.responseBody = `={{ ${expr} }}`;
    const result = review(workflow);
    expect(result.valid).toBe(true);
    expect(result.execution.reasons.some((r) => r.code === 'EXPRESSION_REVIEW')).toBe(true);
  });
  it('accepts exact server-injected correlation expressions, rejects broken named references', () => {
    const workflow = branchWorkflow();
    workflow.nodes[2].parameters.options.responseHeaders = {
      entries: [
        { name: 'x-orqaly-execution-id', value: '={{ $execution.id }}' },
        {
          name: 'x-orqaly-invocation-id',
          value: '={{ $("Receive order").first().json.headers["x-orqaly-invocation-id"] }}',
        },
      ],
    };
    expect(review(workflow).execution.reasons).toEqual([]);
    workflow.nodes[2].parameters.responseBody = '={{ $("Missing node").first().json }}';
    expect(review(workflow).issues.some((r) => r.code === 'EXPRESSION_REFERENCE')).toBe(true);
  });
  it('does not evaluate getters, cycles, prototype keys, unsafe numbers or enormous graphs', () => {
    let read = false;
    const value = {
      get nodes() {
        read = true;
        return [];
      },
    };
    expect(isBoundedNativeJson(value)).toBe(false);
    expect(read).toBe(false);
    const cycle = {};
    cycle.self = cycle;
    expect(isBoundedNativeJson(cycle)).toBe(false);
    expect(isBoundedNativeJson(JSON.parse('{"__proto__":{"polluted":true}}'))).toBe(false);
    expect(isBoundedNativeJson({ n: Infinity })).toBe(false);
    const workflow = branchWorkflow();
    workflow.nodes[0].parameters.test = 'x'.repeat(512001);
    expect(review(workflow).valid).toBe(false);
  });
  it('reports actual customer layout/configuration changes without mutating either snapshot', () => {
    const base = branchWorkflow();
    const changed = structuredClone(base);
    changed.nodes[1].position = [500, 200];
    const result = reviewNativeWorkflow({
      workflow: changed,
      spec: nativeSpec(),
      baseWorkflow: base,
      runtimePolicy: REQUEST_AUTOMATION_POLICY,
    });
    expect(result.changes).toEqual([{ kind: 'node_changed', message: 'Changed Check amount' }]);
    expect(base.nodes[1].position).toEqual([500, 0]);
    expect(result.workflowHash).not.toBe(nativeWorkflowHash(base));
  });
});

describe('bounded data contracts and truthful acceptance', () => {
  function inlineValidationFixture() {
    const spec = nativeSpec();
    spec.requirements = [
      {
        id: 'validate-text',
        description: 'Trim string text; return HTTP400 for missing or non-string text.',
      },
    ];
    spec.inputSchema = { type: 'object', additionalProperties: true };
    spec.outputSchema = {
      type: 'object',
      properties: { text: { type: 'string' }, error: { type: 'string' } },
      additionalProperties: false,
    };
    spec.acceptanceCases = [
      {
        id: 'padded-text',
        input: { text: '  preview schedule  ' },
        expectedOutput: { text: 'preview schedule' },
        expectedStatus: 200,
      },
      {
        id: 'missing-text',
        input: {},
        expectedOutput: { error: 'text must be a string' },
        expectedStatus: 400,
      },
      {
        id: 'numeric-text',
        input: { text: 42 },
        expectedOutput: { error: 'text must be a string' },
        expectedStatus: 400,
      },
    ].map((test) => ({
      ...test,
      description: test.id,
      requirementIds: ['validate-text'],
      assertions: [],
    }));
    const workflow = branchWorkflow();
    workflow.nodes[1].parameters.conditions.conditions[0] = {
      id: 'validate',
      leftValue: "={{ typeof $json.body?.text === 'string' }}",
      rightValue: true,
      operator: { type: 'boolean', operation: 'equals' },
    };
    workflow.nodes[2].parameters.responseBody = '={{ { text: $json.body.text.trim() } }}';
    workflow.nodes[3].parameters.responseBody = '={{ { error: "text must be a string" } }}';
    workflow.nodes[3].parameters.options.responseCode = 400;
    return { workflow, spec, runtimePolicy: REQUEST_AUTOMATION_POLICY };
  }
  it('admits broad object transport for valid, missing and numeric business-response cases', () => {
    const fixture = inlineValidationFixture();
    const before = structuredClone(fixture);
    const reviewed = reviewNativeWorkflow(fixture);
    expect(reviewed.valid).toBe(true);
    expect(reviewed.execution.allowed, JSON.stringify(reviewed.execution.reasons)).toBe(true);
    expect(reviewed.issues).toEqual([]);
    for (const test of fixture.spec.acceptanceCases) {
      expect(
        validateNativeWorkflowData({ schema: fixture.spec.inputSchema, value: test.input }).valid
      ).toBe(true);
      expect(
        checkNativeWorkflowAcceptance({
          spec: fixture.spec,
          input: test.input,
          output: test.expectedOutput,
          responseStatus: test.expectedStatus,
        }).passed
      ).toBe(true);
    }
    expect(fixture).toEqual(before);
    // This is structural/contract evidence, not a claim the graph was executed.
    expect(reviewed).not.toHaveProperty('executionId');
  });
  it('blocks a typed numeric negative case before review can authorize a never-dispatched test', () => {
    const fixture = inlineValidationFixture();
    fixture.spec.inputSchema.properties = { text: { type: 'string', maxLength: 200 } };
    const before = structuredClone(fixture);
    const reviewed = reviewNativeWorkflow(fixture);
    expect(reviewed).toMatchObject({
      valid: false,
      workflow: null,
      workflowHash: null,
      spec: null,
      execution: { allowed: false },
    });
    expect(reviewed.issues).toEqual([
      expect.objectContaining({
        code: 'ACCEPTANCE_INPUT_SCHEMA',
        caseId: 'numeric-text',
        dataPath: '/text',
        dataIssue: 'DATA_TYPE',
      }),
    ]);
    expect(reviewed.issues[0].message).toContain('numeric-text cannot reach n8n');
    expect(reviewed.issues[0].message).toContain('/text');
    expect(reviewed.issues[0].message).not.toContain('42');
    expect(fixture).toEqual(before);
  });
  it('reports an escaped nested missing-field path without echoing the case payload', () => {
    const fixture = inlineValidationFixture();
    fixture.spec.inputSchema = {
      type: 'object',
      properties: {
        nested: { type: 'object', properties: { 'a/b': { type: 'string' } }, required: ['a/b'] },
      },
      required: ['nested'],
    };
    fixture.spec.acceptanceCases = [
      {
        ...fixture.spec.acceptanceCases[0],
        id: 'missing-nested',
        input: { nested: { unrelated: 'synthetic-value-not-for-diagnostics' } },
      },
    ];
    const reviewed = reviewNativeWorkflow(fixture);
    expect(reviewed.issues).toEqual([
      expect.objectContaining({
        code: 'ACCEPTANCE_INPUT_SCHEMA',
        caseId: 'missing-nested',
        dataPath: '/nested/a~1b',
        dataIssue: 'DATA_REQUIRED',
      }),
    ]);
    expect(JSON.stringify(reviewed.issues)).not.toContain('synthetic-value-not-for-diagnostics');
  });
  it('validates nested array schemas, false/zero/null and JSON-pointer assertions', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { 'a/b': { type: 'integer', minimum: 0 } },
            required: ['a/b'],
            additionalProperties: false,
          },
          maxItems: 5,
        },
      },
      required: ['items'],
      additionalProperties: false,
    };
    expect(validateNativeWorkflowData({ schema, value: { items: [{ 'a/b': 0 }] } }).valid).toBe(
      true
    );
    expect(validateNativeWorkflowData({ schema, value: { items: [{ 'a/b': -1 }] } }).valid).toBe(
      false
    );
    expect(
      validateNativeWorkflowData({ schema: { type: 'string', pattern: '(a+)+' }, value: 'a' }).valid
    ).toBe(false);
    expect(
      validateNativeWorkflowData({ schema: { type: 'null', const: null }, value: null }).valid
    ).toBe(true);
  });
  it('checks fixed expected output/status and never reports schema-only production input as tested', () => {
    expect(
      checkNativeWorkflowAcceptance({
        spec: nativeSpec(),
        input: { amount: 100 },
        output: { accepted: true },
      }).passed
    ).toBe(true);
    expect(
      checkNativeWorkflowAcceptance({
        spec: nativeSpec(),
        input: { amount: 100 },
        output: { accepted: false },
      }).passed
    ).toBe(false);
    expect(
      checkNativeWorkflowAcceptance({
        spec: nativeSpec(),
        input: { amount: 2 },
        output: { accepted: false },
        responseStatus: 422,
      }).passed
    ).toBe(true);
    expect(
      checkNativeWorkflowAcceptance({
        spec: nativeSpec(),
        input: { amount: 2 },
        output: { accepted: false },
      }).passed
    ).toBe(false);
    expect(
      checkNativeWorkflowAcceptance({
        spec: nativeSpec(),
        input: { amount: 200 },
        output: { accepted: true },
      }).issues.some((r) => r.code === 'ACCEPTANCE_CASE_MISSING')
    ).toBe(true);
  });
  it('rejects fabricated model execution evidence and ungrounded requirement references', () => {
    const spec = nativeSpec();
    spec.acceptanceCases[0].requirementIds = ['invented'];
    expect(NativeWorkflowSpecV2Schema.safeParse(spec).success).toBe(false);
    const response = {
      schemaVersion: 'axwise.solution-preparation.v2',
      buildRequestId: '2031decc-b21e-48b5-9bd5-3ed3d4dfd024',
      inputVersion: 1,
      outcome: 'candidate',
      name: 'Route orders',
      purpose: 'Use routing',
      explanation: 'Proposed native design',
      workflow: branchWorkflow(),
      spec: nativeSpec(),
      questions: [],
      dependencies: [],
      baseWorkflowHash: null,
      semanticReview: { advisory: true, summary: 'Covers routing', concerns: [] },
    };
    expect(PrepareSolutionResponseV2Schema.safeParse(response).success).toBe(true);
    expect(
      PrepareSolutionResponseV2Schema.safeParse({ ...response, testPassed: true }).success
    ).toBe(false);
  });
  it('parses scalar and structured pure expressions without executing any expression', () => {
    for (const expr of [
      '={{ $json.customer?.name.trim().toUpperCase() }}',
      '={{ { "items": [1, 2], "large": $json.amount >= 100 ? true : false } }}',
      '={{ $("Receive order").first().json.body.amount + 1 }}',
    ])
      expect(inspectNativeExpression(expr).safe).toBe(true);
  });
});
