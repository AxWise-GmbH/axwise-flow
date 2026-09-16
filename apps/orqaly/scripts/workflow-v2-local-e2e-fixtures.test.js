import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artifactContentHash, canonicalHash } from '../lib/workflow-v2/canonical.js';
import { CompletionResultSchema } from '../shared/workflow-v2/contracts.js';
import {
  configuredModes,
  createResearchCompletion,
  createScopeCompletion,
  createTaskCompletion,
  createEvaluationCompletion,
  createSynthesisCompletion,
  LOCAL_E2E_REQUEST,
} from './workflow-v2-local-e2e-fixtures.mjs';

const hash = (character) => character.repeat(64);
const ref = (kind, character) => ({
  artifactId: randomUUID(),
  artifactHash: hash(character),
  kind,
});

describe('local workflow v2 E2E strict fixtures', () => {
  it('emits a hash-bound scope completion with explicit UTF-16 source units', () => {
    const inputHash = hash('a');
    const result = createScopeCompletion({
      request: LOCAL_E2E_REQUEST,
      inputHash,
      artifactId: randomUUID(),
    });

    expect(result.resultType).toBe('scope_compiled');
    expect(result.artifact.payload.authority.canonicalInputHash).toBe(inputHash);
    expect(result.artifact.payload.objectiveSourceSpans[0].offsetUnit).toBe(
      'utf16_code_units'
    );
    expect(result.artifact.artifactHash).toBe(artifactContentHash(result.artifact));
    expect(CompletionResultSchema.parse(result)).toEqual(result);
  });

  it('binds research to the exact accepted scope and carries a typed nonblocking gap', () => {
    const scope = createScopeCompletion({
      inputHash: hash('b'),
      artifactId: randomUUID(),
    }).artifact;
    const result = createResearchCompletion({
      artifactId: randomUUID(),
      claimLedgerArtifactId: randomUUID(),
      input: {
        type: 'ExecuteResearchV2',
        acceptedScope: {
          artifactId: scope.artifactId,
          artifactHash: scope.artifactHash,
          kind: scope.kind,
        },
        scope: scope.payload,
        selectedEvidence: [],
      },
    });

    expect(result.resultType).toBe('research_completed');
    expect(result.evidenceReadiness).toBe('ready_with_gaps');
    expect(result.artifact.payload.acceptedScopeHash).toBe(scope.artifactHash);
    expect(result.artifact.payload.researchInputHash).toBe(scope.payload.researchInputHash);
    expect(result.artifact.payload.findings).toEqual([
      expect.objectContaining({ blocking: false, status: 'missing' }),
    ]);
    expect(result.artifact.sourceArtifactIds).toEqual([scope.artifactId]);
    expect(CompletionResultSchema.parse(result)).toEqual(result);
  });

  it('emits final Markdown with exact sorted provenance and one canonical content hash', () => {
    const acceptedScope = ref('scope', '1');
    const research = ref('research', '2');
    const acceptedPlan = ref('plan', '3');
    const taskArtifact = ref('task_result', '4');
    const evaluation = ref('evaluation', '5');
    const requirementCore = {
      category: 'deliverable',
      description: 'Product requirements document',
      priority: 'P0',
      authority: 'owner',
    };
    const requirementId = `req-${canonicalHash(requirementCore).slice(0, 16)}`;
    const criterionCore = {
      given: 'The accepted scope and immutable research are available.',
      when: 'The requested artifact is evaluated.',
      then: 'The product requirements document satisfies the accepted deliverable.',
      supports: [requirementId],
    };
    const result = createSynthesisCompletion({
      artifactId: randomUUID(),
      input: {
        type: 'SynthesizeArtifactV1',
        purpose: 'final_synthesis',
        acceptedScope,
        research,
        acceptedPlan,
        taskArtifacts: [taskArtifact],
        evaluation,
        sourceArtifacts: [acceptedScope, research, acceptedPlan, taskArtifact, evaluation]
          .sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
        artifactContents: [],
        outputContract: {
          format: 'text/markdown',
          artifactType: 'product_prd',
          requiredSections: ['Product requirements document'],
          requirementIds: [requirementId],
          rubric: ['Produce a useful, traceable product requirements document.'],
          acceptanceCriteria: [{
            id: `acc-${canonicalHash(criterionCore).slice(0, 16)}`,
            ...criterionCore,
          }],
          evidenceReadiness: 'ready_with_gaps',
          launchReadyAllowed: false,
          sourceAppendixRequired: false,
        },
        repairPass: 1,
      },
    });
    const expectedIds = [
      acceptedScope,
      research,
      acceptedPlan,
      taskArtifact,
      evaluation,
    ]
      .map((artifact) => artifact.artifactId)
      .sort();

    expect(result.resultType).toBe('artifact_synthesized');
    expect(result.artifact.sourceArtifactIds).toEqual(expectedIds);
    expect(result.artifact.markdown).toBe(result.artifact.payload.markdown);
    expect(result.artifact.artifactHash).toBe(artifactContentHash(result.artifact));
    expect(result.artifact.payload.launchReady).toBe(false);
    expect(CompletionResultSchema.parse(result)).toEqual(result);
  });

  it('emits strict remote task and evaluation completions for the local vertical', () => {
    const golden = JSON.parse(readFileSync(
      'shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json',
      'utf8'
    ));
    const executeInput = golden.cases.find((entry) => entry.name === 'execute_task').input;
    const task = createTaskCompletion({ input: executeInput, artifactId: randomUUID() });
    expect(task.resultType).toBe('task_completed');
    expect(task.evidenceReadiness).toBe(executeInput.outputContract.evidenceReadiness);
    expect(CompletionResultSchema.parse(task)).toEqual(task);

    const evaluateInput = golden.cases.find(
      (entry) => entry.name === 'evaluate_output_repair'
    ).input;
    const evaluation = createEvaluationCompletion({
      input: evaluateInput,
      artifactId: randomUUID(),
    });
    expect(evaluation.resultType).toBe('evaluation_completed');
    expect(evaluation.directPromotionArtifact).toBeNull();
    expect(evaluation.artifact.sourceArtifactIds).toEqual(
      evaluateInput.sourceArtifacts.map((artifact) => artifact.artifactId).sort()
    );
    expect(CompletionResultSchema.parse(evaluation)).toEqual(evaluation);
  });

  it('runs both projections by default and rejects an unknown projection', () => {
    expect(configuredModes(undefined)).toEqual(['simple', 'advanced']);
    expect(configuredModes('simple')).toEqual(['simple']);
    expect(configuredModes('advanced')).toEqual(['advanced']);
    expect(() => configuredModes('legacy')).toThrow(/simple or advanced/);
  });
});
