import { describe, expect, it, vi } from 'vitest';
import { compileSolutionBlueprint, compileSolutionWorkflow } from './solution-compiler.js';
import {
  createSolutionBuildService,
  reviewSolutionBuildWorkflow,
  assertNativePreparationContract,
  nativeDesignFailureCode,
  nativePreparedDraftState,
} from './solution-build-service.js';
import {
  AnswerSolutionBuildSchema,
  CreateSolutionBuildSchema,
  SaveSolutionBuildSchema,
  containsSolutionBuildSecret,
} from '../../shared/workflow-v2/solution-build-contracts.js';
import { requestsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { projectNativeBuildDraft } from './native-build-model-context.js';
import { nativeOwnedErrorFixture } from './fixtures/native-owned-error.js';

const id = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const spec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'name', target: 'customer_name', transform: 'trim' }],
};

describe('native model repair completion contract', () => {
  const nativeQuestion = {
    id: 'decision_boundary',
    kind: 'information',
    prompt: 'How should equality be handled?',
    reason: 'Keep the existing decision rule explicit.',
  };
  it.each(['needs_input', 'dependencies'])(
    'preserves the exact prior graph and contract for a null %s response without granting readiness',
    (outcome) => {
      const workflow = {
        name: 'Existing customer graph',
        nodes: [{ id: 'keep-this-node', parameters: { value: 10 } }],
      };
      const value = {
        workflow,
        workflow_hash: hash(workflow),
        spec: draft().spec,
        native_metadata: { phase: 'repair', repairCount: 1, autoRetest: true },
      };
      const prepared = {
        outcome,
        workflow: null,
        spec: null,
        questions: outcome === 'needs_input' ? [nativeQuestion] : [],
        dependencies:
          outcome === 'dependencies'
            ? [{ id: 'runtime', kind: 'runtime', description: 'A reviewed capability is required' }]
            : [],
      };
      const state = nativePreparedDraftState({ value, prepared, compiled: null, checked: null });
      expect(state).toMatchObject({
        preserved: true,
        shouldRepair: false,
        workflow,
        workflowHash: value.workflow_hash,
        spec: value.spec,
        review: null,
        testEvidence: null,
        autoRetest: false,
        status: outcome === 'needs_input' ? 'needs_input' : 'unsupported',
      });
      expect(state.workflow).toBe(value.workflow);
      expect(state.spec).toBe(value.spec);
      expect(state.stage).not.toBe('ready');
    }
  );
  it('does not manufacture a graph for first-time clarification or repair dependency-only output', () => {
    const prepared = {
      outcome: 'needs_input',
      workflow: null,
      spec: null,
      questions: [nativeQuestion],
    };
    expect(
      nativePreparedDraftState({ value: {}, prepared, compiled: null, checked: null })
    ).toMatchObject({ workflow: null, spec: null, workflowHash: null, shouldRepair: false });
    const compiled = { workflow: { name: 'Dependency graph' }, workflowHash: 'a'.repeat(64) };
    const state = nativePreparedDraftState({
      value: { native_metadata: { repairCount: 0 } },
      prepared: {
        outcome: 'dependencies',
        workflow: compiled.workflow,
        spec: draft().spec,
        questions: [],
      },
      compiled,
      checked: { valid: false },
    });
    expect(state).toMatchObject({
      shouldRepair: false,
      status: 'unsupported',
      stage: 'dependencies',
      autoRetest: false,
    });
  });
  it('rejects corrupt prior hashes and replaces context only when a new candidate is actually supplied', () => {
    const workflow = { name: 'Prior graph' };
    const value = { workflow, workflow_hash: hash(workflow), spec: draft().spec };
    const questions = {
      outcome: 'needs_input',
      workflow: null,
      spec: null,
      questions: [nativeQuestion],
    };
    expect(() =>
      nativePreparedDraftState({
        value: { ...value, workflow_hash: '0'.repeat(64) },
        prepared: questions,
        compiled: null,
        checked: null,
      })
    ).toThrow('previous_draft_hash_mismatch');
    const compiled = { workflow: { name: 'New graph' }, workflowHash: 'a'.repeat(64) };
    expect(
      nativePreparedDraftState({
        value,
        prepared: {
          outcome: 'candidate',
          workflow: compiled.workflow,
          spec: value.spec,
          questions: [],
        },
        compiled,
        checked: { valid: true },
      })
    ).toMatchObject({
      preserved: false,
      workflow: compiled.workflow,
      workflowHash: compiled.workflowHash,
      status: 'draft',
      stage: 'ready',
    });
  });
  it.each([false, true])(
    'answers a clarification through the real service with private selectors=%s, preserving authoritative bytes but excluding them from repair',
    async (withSelectors) => {
      const workflow = compileSolutionWorkflow({ id, spec }).workflow;
      const business = {
        kind: 'n8n_workflow_v2',
        runtimeProfile: 'request_automation',
        connections: [],
        requirements: [{ id: 'decision', description: 'Trim the supplied name' }],
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        outputSchema: {
          type: 'object',
          properties: { customer_name: { type: 'string' } },
          required: ['customer_name'],
        },
        acceptanceCases: [
          {
            id: 'trimmed',
            description: 'Trim whitespace',
            requirementIds: ['decision'],
            input: { name: ' Ada ' },
            expectedOutput: { customer_name: 'Ada' },
            assertions: [],
          },
        ],
      };
      const auth = { userId: 'user_repairTest' };
      if (withSelectors) {
        workflow.nodes[0].credentials = {
          orqalyBoundedHttp: { id: 'main-private-opaque-selector', name: 'Private main reference' },
        };
        const linked = nativeOwnedErrorFixture(id).spec.ownedDependencies[0];
        linked.workflow.nodes[1].credentials = {
          orqalyBoundedHttp: {
            id: 'child-private-opaque-selector',
            name: 'Private child reference',
          },
        };
        business.ownedDependencies = [linked];
        workflow.settings.errorWorkflow = `orqaly:error:${linked.id}`;
      }
      let value = {
        id,
        agent_id: id,
        run_id: id,
        row_version: 3,
        input_version: 2,
        preparation_version: 2,
        status: 'preparing',
        instruction: 'Build a webhook to trim a name',
        workflow,
        workflow_hash: hash(workflow),
        spec: business,
        questions: [],
        answers: [],
        partial_fields: [],
        agent_snapshot: {
          id,
          name: 'Workflow agent',
          profileVersion: 1,
          roleLabel: 'Executor',
          description: 'Build the approved task',
          instructions: 'No external actions',
          profileHash: 'a'.repeat(64),
        },
        source_snapshot: {
          title: 'Webhook task',
          taskText: 'Trim the supplied name',
          taskHash: 'b'.repeat(64),
          contextHash: 'c'.repeat(64),
        },
        native_metadata: {
          phase: 'repair',
          repairCount: 1,
          frozenAcceptanceCases: business.acceptanceCases,
          autoRetest: true,
        },
      };
      const state = nativePreparedDraftState({
        value,
        prepared: {
          outcome: 'needs_input',
          workflow: null,
          spec: null,
          questions: [nativeQuestion],
        },
        compiled: null,
        checked: null,
      });
      value = {
        ...value,
        status: state.status,
        questions: [nativeQuestion],
        workflow: state.workflow,
        workflow_hash: state.workflowHash,
        spec: state.spec,
        review: state.review,
        native_metadata: {
          ...value.native_metadata,
          stage: state.stage,
          autoRetest: state.autoRetest,
          testEvidence: state.testEvidence,
        },
      };
      const envelopes = [];
      const client = {
        query: vi.fn(async (sql, params) => {
          if (sql.startsWith('SELECT * FROM orqaly.solution_build_requests'))
            return { rows: [structuredClone(value)] };
          if (sql.startsWith('UPDATE orqaly.solution_build_requests SET')) {
            const assignments = sql.match(/SET (.*?),row_version=row_version\+1/s)[1].split(',');
            assignments.forEach((assignment, index) => {
              const field = assignment.split('=')[0];
              const incoming = params[index + 3];
              value[field] =
                ['answers', 'questions', 'review', 'native_metadata'].includes(field) &&
                typeof incoming === 'string'
                  ? JSON.parse(incoming)
                  : incoming;
            });
            value.row_version++;
            return { rows: [structuredClone(value)], rowCount: 1 };
          }
          if (sql.startsWith('INSERT INTO orqaly.solution_build_attempts'))
            envelopes.push(JSON.parse(params[7]));
          else if (
            !/solution_build_attempts|solution_build_events|solution_connections|solution_build_tests/.test(
              sql
            )
          )
            throw new Error(`Unexpected clarification SQL ${sql}`);
          return { rows: [], rowCount: 0 };
        }),
      };
      const repository = {
        resolveTenant: vi.fn(async () => id),
        solutionBuildTransaction: async (scope, callback) => {
          expect(scope).toEqual({ tenantId: id, userId: auth.userId });
          return callback(client);
        },
      };
      const service = createSolutionBuildService({ repository, enableNativeWorkflows: true });
      const result = await service.answer(
        auth,
        id,
        {
          expectedVersion: 3,
          questionId: nativeQuestion.id,
          value: 'Keep equality included in the approved case.',
        },
        'answer_repair_question'
      );
      expect(result.buildRequest.status).toBe('preparing');
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0].input).toMatchObject({
        type: 'PrepareSolutionV2',
        phase: 'repair',
        inputVersion: 3,
        draft: projectNativeBuildDraft({
          workflow,
          spec: business,
          row_version: value.row_version,
        }),
        frozenAcceptanceCases: business.acceptanceCases,
        answers: [
          { questionId: nativeQuestion.id, value: 'Keep equality included in the approved case.' },
        ],
      });
      expect(result.buildRequest.testEvidence).toBeNull();
      expect(result.buildRequest.review).toBeNull();
      if (withSelectors) {
        expect(JSON.stringify(envelopes)).not.toContain('private-opaque-selector');
        expect(JSON.stringify(value.workflow)).toContain('main-private-opaque-selector');
        expect(JSON.stringify(value.spec)).toContain('child-private-opaque-selector');
        expect(envelopes[0].input.draft.workflowHash).not.toBe(value.workflow_hash);
        expect(envelopes[0].input.draft.workflowHash).toBe(hash(envelopes[0].input.draft.workflow));
      }
    }
  );
  it.each(['AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED', 'AXWISE_SOLUTION_DESIGN_DEADLINE'])(
    'preserves only the matching V2 stop reason %s without provider diagnostics',
    (errorClass) => {
      const attempt = {
        operation_id: id,
        input_hash: 'a'.repeat(64),
        envelope: { input: { type: 'PrepareSolutionV2' } },
      };
      const response = {
        operationId: id,
        canonicalInputHash: attempt.input_hash,
        status: 'failed',
        errorClass,
        diagnostics: { message: 'sensitive-provider-detail-not-returned' },
      };
      expect(nativeDesignFailureCode(attempt, response)).toBe(errorClass);
      for (const changed of [
        { ...response, status: 'cancelled' },
        { ...response, operationId: 'wrong-operation' },
        { ...response, canonicalInputHash: 'b'.repeat(64) },
        { ...response, errorClass: 'sensitive-provider-detail-not-returned' },
      ])
        expect(nativeDesignFailureCode(attempt, changed)).toBe('BUILD_DESIGN_FAILED');
      expect(
        nativeDesignFailureCode(
          { ...attempt, envelope: { input: { type: 'PrepareSolutionV1' } } },
          response
        )
      ).toBe('BUILD_DESIGN_FAILED');
    }
  );
  const draft = () => ({
    workflowHash: 'a'.repeat(64),
    spec: {
      kind: 'n8n_workflow_v2',
      requirements: [{ id: 'decision', description: 'Return the order decision' }],
      inputSchema: { type: 'object', properties: { amount: { type: 'number' } } },
      outputSchema: { type: 'object', properties: { accepted: { type: 'boolean' } } },
      acceptanceCases: [
        { id: 'accepted', input: { amount: 100 }, expectedOutput: { accepted: true } },
      ],
      runtimeProfile: 'request_automation',
      connections: [],
    },
  });
  it.each([
    ['requirements', [{ id: 'other', description: 'A different task' }]],
    ['inputSchema', { type: 'string' }],
    ['outputSchema', { type: 'number' }],
    [
      'acceptanceCases',
      [{ id: 'accepted', input: { amount: 100 }, expectedOutput: { accepted: false } }],
    ],
    ['runtimeProfile', 'software_development'],
  ])(
    'rejects changed %s using the guard called before provider completion is persisted',
    (field, value) => {
      const input = { phase: 'repair', draft: draft() };
      const prepared = {
        baseWorkflowHash: input.draft.workflowHash,
        spec: { ...structuredClone(input.draft.spec), [field]: value },
      };
      expect(() => assertNativePreparationContract(input, prepared)).toThrow(
        'native_repair_changed_acceptance_contract'
      );
    }
  );
  it('allows a new implementation only against the exact unchanged contract and source draft', () => {
    const input = { phase: 'repair', draft: draft() };
    const prepared = {
      baseWorkflowHash: input.draft.workflowHash,
      spec: structuredClone(input.draft.spec),
      workflow: { nodes: ['a repaired implementation'] },
    };
    expect(() => assertNativePreparationContract(input, prepared)).not.toThrow();
    expect(() =>
      assertNativePreparationContract(input, { ...prepared, baseWorkflowHash: 'b'.repeat(64) })
    ).toThrow('native_design_base_changed');
    expect(input.draft.spec.runtimeProfile).toBe('request_automation');
  });
});

describe('solution build authoring boundary', () => {
  it('renders an empty native blueprint without inventing a mapping or making it reviewable', () => {
    const { workflow } = compileSolutionBlueprint({ id, fields: [] });
    expect(workflow.nodes.map((node) => node.type)).toEqual([
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.set',
      'n8n-nodes-base.respondToWebhook',
    ]);
    expect(workflow.nodes[1].parameters.jsonOutput).toBe('={{ {  } }}');
    expect(JSON.stringify(workflow)).not.toContain('validation');
    expect(reviewSolutionBuildWorkflow({ id, workflow }).valid).toBe(false);
  });
  it('leaves incomplete field mappings out of the executable-looking native configuration', () => {
    const compiled = compileSolutionBlueprint({
      id,
      fields: [{ source: 'email', target: null, transform: 'lowercase' }],
    });
    expect(compiled.mappingCount).toBe(0);
    expect(compiled.workflow.nodes[1].parameters.jsonOutput).not.toContain('email');
  });
  it('rejects duplicate complete outputs in a partial blueprint', () => {
    expect(() =>
      compileSolutionBlueprint({ id, fields: [...spec.fields, ...spec.fields] })
    ).toThrow();
  });
  it('reviews an initial native candidate without changing its exact ID, safe serialization or positions', () => {
    const { workflow } = compileSolutionWorkflow({ id, spec });
    workflow.nodes[1].position = [330, 160];
    const reviewed = reviewSolutionBuildWorkflow({ id, workflow });
    expect(reviewed.valid).toBe(true);
    expect(reviewed.workflow).toEqual(workflow);
    expect(reviewed.spec).toEqual(spec);
    expect(reviewed.changes).toEqual([
      { kind: 'mapping_added', message: 'name → customer_name: trim' },
    ]);
    expect(JSON.stringify(reviewed)).not.toContain('validation');
  });
  it.each([
    (workflow) => {
      workflow.nodes[1].parameters.jsonOutput = '={{ $env.API_KEY }}';
    },
    (workflow) => {
      workflow.nodes[0].parameters.path = 'another-workflow';
    },
    (workflow) => {
      workflow.nodes[1].credentials = { some: 'reference' };
    },
    (workflow) => {
      workflow.nodes[1].type = 'n8n-nodes-base.code';
    },
  ])('cannot review unsupported execution authority', (mutate) => {
    const { workflow } = compileSolutionWorkflow({ id, spec });
    mutate(workflow);
    expect(reviewSolutionBuildWorkflow({ id, workflow }).valid).toBe(false);
  });
  it('creates only from a current explicit instruction and source IDs, never browser-supplied context', () => {
    expect(CreateSolutionBuildSchema.parse({ runId: id, instruction: 'Build a webhook' })).toEqual({
      runId: id,
      instruction: 'Build a webhook',
    });
    expect(
      CreateSolutionBuildSchema.safeParse({
        runId: id,
        instruction: 'Build a webhook',
        source: { authority: 'approved' },
      }).success
    ).toBe(false);
  });
  it.each([
    'api_key=abcdefghijklmnop',
    'Bearer abcdefghijklmnop',
    'sk_live_abcdefghijklmno',
    '-----BEGIN RSA PRIVATE KEY-----',
    '{"password":"abcdefghijklmnop"}',
    'eyJabcdefghijk.abcdefghijklm.abcdefghijklm',
  ])('rejects recognizable secrets from ordinary answer and instruction inputs', (value) => {
    expect(containsSolutionBuildSecret(value)).toBe(true);
    expect(
      AnswerSolutionBuildSchema.safeParse({
        expectedVersion: 1,
        questionId: 'output_name',
        value,
      }).success
    ).toBe(false);
    expect(CreateSolutionBuildSchema.safeParse({ runId: id, instruction: value }).success).toBe(
      false
    );
  });
  it.each([
    'Enter your API key',
    'What is the OAuth token?',
    'Provide card number',
    'What password should be used?',
  ])('does not allow the model to request secret/payment collection: %s', (question) => {
    expect(requestsSolutionBuildSecret(question)).toBe(true);
  });
  it('requires previous native checksum in addition to row version', () => {
    expect(SaveSolutionBuildSchema.safeParse({ expectedVersion: 0, workflow: {} }).success).toBe(
      false
    );
  });
  it('rejects unauthenticated reads without a tenant lookup', async () => {
    const repository = { resolveTenant: vi.fn() };
    await expect(createSolutionBuildService({ repository }).read({}, id)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(repository.resolveTenant).not.toHaveBeenCalled();
  });
  it('returns not found for an owner-scoped miss without provider access', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = {
      resolveTenant: vi.fn().mockResolvedValue(id),
      solutionBuildTransaction: (scope, fn) => {
        expect(scope).toEqual({ tenantId: id, userId: 'user_owner' });
        return fn({ query });
      },
    };
    const axwiseClient = { submit: vi.fn() };
    await expect(
      createSolutionBuildService({ repository, axwiseClient }).read({ userId: 'user_owner' }, id)
    ).rejects.toMatchObject({ code: 'BUILD_NOT_FOUND' });
    expect(query.mock.calls[0][1]).toEqual([id, 'user_owner', id]);
    expect(axwiseClient.submit).not.toHaveBeenCalled();
  });
  it('does not claim jobs when AxWise is unavailable', async () => {
    const repository = { claimSolutionBuildAttempt: vi.fn() };
    expect(await createSolutionBuildService({ repository }).advancePending()).toEqual({
      processed: false,
      reason: 'axwise_unavailable',
    });
    expect(repository.claimSolutionBuildAttempt).not.toHaveBeenCalled();
  });
});
