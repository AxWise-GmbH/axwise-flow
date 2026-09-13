// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import { AxWiseOperationEnvelopeSchema } from '../../shared/workflow-v2/contracts.js';
import { capabilityScopeRequest } from '../../shared/workflow-v2/capability-work-primitives.js';
import {
  fixture,
  uid,
  userId,
  tenantId,
  clone,
  ref,
  analysisVector,
} from './capability-work-test-helpers.js';

describe('explicit capability owner commands', () => {
  it('is disabled by default and never resolves identity or creates work', async () => {
    const f = fixture({ enabled: false });
    await expect(f.start()).rejects.toMatchObject({
      code: 'CAPABILITY_WORK_UNAVAILABLE',
      status: 503,
    });
    expect(f.repository.resolveTenant).not.toHaveBeenCalled();
    expect(f.plans).toHaveLength(0);
  });
  it('requires authenticated personal ownership', async () => {
    const f = fixture();
    const command = await f.start();
    await expect(f.service.start({}, command)).rejects.toMatchObject({ status: 401 });
    expect(f.plans).toHaveLength(1);
  });
  it('starts exactly scope plus owner approval with the full disclosed compiler text, no research/plan/PRD stages', async () => {
    const f = fixture(),
      command = await f.start();
    expect(f.snapshot().stages.map((stage) => stage.kind)).toEqual(['compile_scope', 'gate_1']);
    expect(f.snapshot().attempts[0].inputPayload).toEqual({
      type: 'CompileScopeV2',
      request: capabilityScopeRequest(command),
      objectiveOnlyContext: [],
      safeDefaults: {
        geography: [],
        acceptedSourceTypes: [],
        assumptions: [],
        limits: [],
        policies: [],
      },
    });
    expect(f.snapshot().run.workProfile.capability).toBe('AnalyzeEvidenceV1');
    expect(f.plans[0].outbox).toHaveLength(1);
  });
  it.each(['corpus', 'processingConsent', 'selectedSources', 'owner'])(
    'rejects unrequested start member %s before identity resolution',
    async (field) => {
      const f = fixture(),
        command = await f.start();
      f.repository.resolveTenant.mockClear();
      await expect(
        f.service.start({ userId }, { ...command, [field]: 'private-source-must-not-be-compiled' })
      ).rejects.toThrow();
      expect(f.repository.resolveTenant).not.toHaveBeenCalled();
      expect(f.plans).toHaveLength(1);
    }
  );
  it('requires explicit compiler disclosure and supports exact idempotent start only', async () => {
    const f = fixture(),
      command = await f.start();
    await expect(
      f.service.start(
        { userId },
        {
          ...command,
          compilerDisclosure: { accepted: false, noticeVersion: 'google-scope-compiler-v1' },
        }
      )
    ).rejects.toThrow();
    const repeated = await f.service.start({ userId }, command);
    expect(repeated.receipt.idempotent).toBe(true);
    expect(repeated.workflow.attempts).toEqual([]);
    await expect(
      f.service.start({ userId }, { ...command, request: 'Changed purpose' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.plans).toHaveLength(1);
  });
  it('approves the exact scope and becomes idle without scheduling a model', async () => {
    const f = fixture();
    await f.start();
    f.compile();
    const before = f.plans.length,
      command = await f.approve();
    expect(f.snapshot().run.status).toBe('awaiting_capability_input');
    expect(f.plans.at(-1).createAttempts).toEqual([]);
    expect(f.plans.at(-1).outbox).toEqual([]);
    expect(f.plans.length).toBe(before + 1);
    expect(
      (await f.service.approveScope({ userId }, f.snapshot().run.id, command)).receipt.idempotent
    ).toBe(true);
  });
  it('rejects wrong owner, wrong tenant, legacy profile, and false scope compatibility', async () => {
    const f = fixture();
    await f.ready();
    const runId = f.snapshot().run.id;
    const command = {
      ...f.nextCommand(),
      artifact: f.snapshot().stages[0].outputArtifact,
      scopeCompatible: true,
    };
    await expect(
      f.service.approveScope({ userId: 'user_other' }, runId, command)
    ).rejects.toMatchObject({ status: 404 });
    f.repository.resolveExistingTenant.mockResolvedValueOnce(uid(888));
    await expect(f.service.approveScope({ userId }, runId, command)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      f.service.approveScope({ userId }, runId, { ...command, scopeCompatible: false })
    ).rejects.toThrow();
    delete f.snapshot().run.workProfile;
    await expect(f.service.approveScope({ userId }, runId, command)).rejects.toMatchObject({
      code: 'CAPABILITY_PROFILE_REQUIRED',
    });
  });
  it('admission schedules only a model-free operation and never returns source bytes in metadata', async () => {
    const f = fixture();
    await f.ready();
    const artifact = await f.admit();
    expect(f.snapshot().run.status).toBe('awaiting_capability_input');
    expect(artifact.kind).toBe('transcript_corpus');
    const event = f.plans.find(
      (plan) => plan.event.inputPayload?.type === 'AdmitTranscriptCorpusV1'
    ).event;
    expect(event.inputPayload.processingConsent).toBeUndefined();
    expect(event.reviewId).toBeNull();
    expect(f.plans.at(-1).createAttempts).toEqual([]);
    expect(f.repository.resolveTenant).toHaveBeenCalledTimes(1);
  });
  it('rejects synthetic relabels and stale admission versions', async () => {
    const f = fixture();
    await f.ready();
    const command = {
      ...f.nextCommand(),
      expectedRowVersion: f.snapshot().run.rowVersion,
      corpus: clone(analysisVector.context.corpus),
    };
    await expect(
      f.service.admitCorpus({ userId }, f.snapshot().run.id, { ...command, expectedRowVersion: 0 })
    ).rejects.toMatchObject({ code: 'CAPABILITY_REVIEW_STALE' });
    const synthetic = clone(command);
    synthetic.corpus.documents[0].origin = 'synthetic_transcript';
    await expect(
      f.service.admitCorpus({ userId }, f.snapshot().run.id, synthetic)
    ).rejects.toThrow();
  });
  it('prepares exact selected source data read-only with no consent, persistence, or provider authority', async () => {
    const f = fixture();
    await f.ready();
    const source = await f.admit(),
      draft = f.analysisDraft(source);
    const before = f.plans.length;
    const { review } = await f.service.prepareOperation({ userId }, f.snapshot().run.id, draft);
    expect(f.plans).toHaveLength(before);
    expect(review.request).toEqual(draft.request);
    expect(review.providerPayload).toEqual({
      request: draft.request,
      corpus: {
        schemaVersion: source.payload.schemaVersion,
        documents: source.payload.documents.map(
          ({ originArtifactRefs: _origin, ...document }) => document
        ),
      },
    });
    expect(JSON.stringify(review)).not.toMatch(
      /processingConsent|"granted"|stageAttemptId|ownerCommandHash/
    );
    expect(review.acceptedScope).toEqual(f.snapshot().stages[0].outputArtifact);
    expect(review.selectedSources[0].artifact).toEqual(ref(source));
    expect(review.limits.maxModelCalls).toBe(2);
  });
  it('only explicit exact confirmation persists consent and a single new operation', async () => {
    const f = fixture();
    await f.ready();
    const source = await f.admit(),
      draft = f.analysisDraft(source),
      runId = f.snapshot().run.id;
    const { review } = await f.service.prepareOperation({ userId }, runId, draft);
    const command = f.confirm(draft, review),
      before = f.plans.length;
    const result = await f.service.confirmOperation({ userId }, runId, command);
    expect(f.plans).toHaveLength(before + 1);
    expect(result.workflow.attempts).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(source.payload.documents[0].text);
    const event = f.plans.at(-1).event;
    const envelope = {
      operationId: event.operationId,
      operationType: event.inputPayload.type,
      owner: { tenantId, userId, organizationId: null },
      workflow: { runId, stageId: event.stageId, stageAttemptId: event.attemptId },
      contractVersion: 'axwise.operation.v2',
      input: event.inputPayload,
      canonicalInputHash: event.inputHash,
    };
    expect(AxWiseOperationEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(event.inputPayload.processingConsent.granted).toBe(true);
    expect((await f.service.confirmOperation({ userId }, runId, command)).receipt.idempotent).toBe(
      true
    );
    expect(f.plans).toHaveLength(before + 1);
  });
  it.each([
    'operationId',
    'bindingHash',
    'reviewId',
    'provider',
    'noticeVersion',
    'purpose',
    'granted',
    'scopeCompatible',
  ])('rejects tampered confirmation %s without queuing', async (field) => {
    const f = fixture();
    await f.ready();
    const source = await f.admit(),
      draft = f.analysisDraft(source),
      runId = f.snapshot().run.id;
    const { review } = await f.service.prepareOperation({ userId }, runId, draft),
      command = f.confirm(draft, review),
      count = f.plans.length;
    command.confirmation[field] =
      field === 'operationId'
        ? uid(999)
        : ['granted', 'scopeCompatible'].includes(field)
          ? false
          : 'changed';
    await expect(f.service.confirmOperation({ userId }, runId, command)).rejects.toThrow();
    expect(f.plans).toHaveLength(count);
  });
  it('invalidates a review when input, immutable identity or run version changes', async () => {
    const f = fixture();
    await f.ready();
    const source = await f.admit(),
      draft = f.analysisDraft(source),
      runId = f.snapshot().run.id;
    const { review } = await f.service.prepareOperation({ userId }, runId, draft);
    const altered = clone(draft);
    altered.request.decisionQuestion = 'A different question';
    await expect(
      f.service.confirmOperation({ userId }, runId, f.confirm(altered, review))
    ).rejects.toMatchObject({ code: 'CAPABILITY_REVIEW_STALE' });
    f.snapshot().run.rowVersion += 1;
    await expect(
      f.service.confirmOperation({ userId }, runId, f.confirm(draft, review))
    ).rejects.toMatchObject({ code: 'CAPABILITY_REVIEW_STALE' });
  });
  it.each(['artifactHash', 'artifactId', 'kind'])(
    'rejects mismatched selected source %s',
    async (field) => {
      const f = fixture();
      await f.ready();
      const source = await f.admit(),
        draft = f.analysisDraft(source);
      draft.sourceArtifact[field] =
        field === 'artifactId' ? uid(4444) : field === 'kind' ? 'simulation' : 'a'.repeat(64);
      await expect(
        f.service.prepareOperation({ userId }, f.snapshot().run.id, draft)
      ).rejects.toThrow();
    }
  );
  it('discloses deterministic simulation plan and only creates a synthetic output after confirmation', async () => {
    const f = fixture();
    await f.ready({ capability: 'SimulateV1', allowSimulationAnalysis: true });
    const draft = f.simulationDraft(),
      runId = f.snapshot().run.id;
    const { review } = await f.service.prepareOperation({ userId }, runId, draft);
    expect(review.providerPayload.plan).toHaveLength(
      draft.request.stakeholders.reduce((total, group) => total + group.participantCount, 0)
    );
    expect(review.providerPayload.selectedPassages).toEqual([]);
    expect(review.providerPayload.scenario).toEqual(draft.request.scenario);
    expect(review.limitations).toHaveLength(8);
    expect(review.limitations[0]).toContain('once for token counting and at most once for generation');
    expect(review.limitations[1]).toContain('even if the prompt is then rejected');
    expect(review.limitations[2]).toContain('not automatically anonymized');
    await f.service.confirmOperation({ userId }, runId, f.confirm(draft, review));
    const result = f.complete(f.simulationResult);
    expect(result.payload.origin).toBe('synthetic');
    expect(f.snapshot().run.status).toBe('completed');
    expect(f.snapshot().run.finalArtifact).toEqual(ref(result));
    const nextDraft = f.analysisDraft(result);
    const nextReview = await f.service.prepareOperation({ userId }, runId, nextDraft);
    expect(
      nextReview.review.providerPayload.corpus.documents.every(
        (document) => document.origin === 'synthetic_transcript'
      )
    ).toBe(true);
    expect(nextReview.review.operationId).not.toBe(review.operationId);
    expect(f.records.has(result.artifactId)).toBe(true);
  });
  it('rejects an unapproved simulation-to-analysis continuation and unrelated uploads', async () => {
    const f = fixture();
    await f.ready({ capability: 'SimulateV1', allowSimulationAnalysis: false });
    const draft = f.simulationDraft(),
      runId = f.snapshot().run.id;
    const { review } = await f.service.prepareOperation({ userId }, runId, draft);
    await f.service.confirmOperation({ userId }, runId, f.confirm(draft, review));
    const result = f.complete(f.simulationResult);
    await expect(
      f.service.prepareOperation({ userId }, runId, f.analysisDraft(result))
    ).rejects.toMatchObject({ code: 'CAPABILITY_SCOPE_MISMATCH' });
    await expect(
      f.service.admitCorpus({ userId }, runId, {
        ...f.nextCommand(),
        expectedRowVersion: f.snapshot().run.rowVersion,
        corpus: clone(analysisVector.context.corpus),
      })
    ).rejects.toMatchObject({ code: 'CAPABILITY_UPLOAD_ORIGIN_INVALID' });
  });
  it('keeps prior results and emits no successor when analysis completes', async () => {
    const f = fixture();
    await f.ready();
    const source = await f.admit(),
      draft = f.analysisDraft(source),
      runId = f.snapshot().run.id;
    const { review } = await f.service.prepareOperation({ userId }, runId, draft);
    await f.service.confirmOperation({ userId }, runId, f.confirm(draft, review));
    const output = f.complete(f.analysisResult);
    expect(output.kind).toBe('qualitative_analysis');
    expect(f.records.has(source.artifactId)).toBe(true);
    expect(f.plans.at(-1).createAttempts).toEqual([]);
    expect(f.plans.at(-1).outbox).toEqual([]);
    expect(f.snapshot().run.status).toBe('completed');
    expect(canonicalHash(f.snapshot().run.workProfile)).toBe(
      canonicalHash(f.plans[0].event.workProfile)
    );
  });
});
