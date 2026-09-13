import { createHash, webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityWorkPanel } from './CapabilityWorkPanel.jsx';
import {
  AdmitCapabilityCorpusCommandSchema,
  PrepareCapabilityOperationCommandSchema,
  StartCapabilityWorkCommandSchema,
  ConfirmCapabilityOperationCommandSchema,
} from '../../../shared/workflow-v2/capability-work-contracts.js';
import {
  capabilityScopeRequest,
  capabilityReviewLimitations,
} from '../../../shared/workflow-v2/capability-work-primitives.js';
import { simulationPlan } from '../../../shared/workflow-v2/capability-simulation-contracts.js';

const id = (number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const ref = (number, kind) => ({
  artifactId: id(number),
  artifactHash: number.toString(16).padStart(64, '0'),
  kind,
});
const scope = ref(2, 'scope'),
  corpus = ref(3, 'transcript_corpus'),
  simulation = ref(4, 'simulation'),
  analysis = ref(5, 'qualitative_analysis');
const owner = 'user_owner';
const clone = (value) => JSON.parse(JSON.stringify(value));
const change = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const check = (name) => fireEvent.click(screen.getByRole('checkbox', { name }));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function workflow({
  capability = 'AnalyzeEvidenceV1',
  allowSimulationAnalysis = false,
  status = 'awaiting_capability_input',
  references = [corpus],
  rowVersion = 3,
} = {}) {
  return {
    run: {
      id: id(1),
      tenantId: id(10),
      ownerUserId: owner,
      ownerOrganizationId: null,
      mode: 'simple',
      status,
      rowVersion,
      workProfile: {
        type: 'capability_work_v1',
        capability,
        purpose: 'A synthetic fixture purpose.',
        allowSimulationAnalysis,
        compilerNoticeVersion: 'google-scope-compiler-v1',
      },
    },
    stages: [
      {
        id: id(11),
        kind: 'compile_scope',
        status: 'completed',
        rowVersion: 1,
        outputArtifact: scope,
      },
      {
        id: id(12),
        kind: 'gate_1',
        status: status === 'awaiting_gate_1' ? 'awaiting_approval' : 'completed',
        rowVersion: 1,
        outputArtifact: null,
      },
      ...references.map((reference, index) => ({
        id: id(20 + index),
        kind: 'execution',
        status: 'completed',
        rowVersion: 1,
        outputArtifact: reference,
      })),
    ],
    attempts: [],
    dependencies: [],
    approvals: [],
  };
}
function reviewFor(draft, runId = id(1)) {
  const result = {
    review: {
      reviewId: 'a'.repeat(64),
      bindingHash: 'b'.repeat(64),
      operationId: id(6),
      provider: 'google',
      purpose: draft.operationType,
      noticeVersion: 'google-selected-sources-v1',
      runId,
      expectedRowVersion: draft.expectedRowVersion,
      acceptedScope: clone(scope),
      request: clone(draft.request),
      limits: {
        deadlineMs: 180000,
        maxModelCalls: 3,
        maxInputTokens: 120000,
        maxOutputTokens: 16000,
      },
      selectedSources:
        draft.operationType === 'AnalyzeEvidenceV1'
          ? [
              {
                artifact: clone(draft.sourceArtifact),
                title: 'Chosen transcript source',
                documents: [
                  {
                    documentId: id(7),
                    title: 'Fixture participant transcript',
                    text: 'EXACT_SYNTHETIC_REVIEW_TEXT\nSecond line.',
                    origin:
                      draft.sourceArtifact.kind === 'simulation'
                        ? 'synthetic_transcript'
                        : 'supplied_transcript',
                    participants: [
                      {
                        participantId: 'p1',
                        displayName: null,
                        role: 'participant',
                        stakeholderId: null,
                      },
                    ],
                    turns: [
                      {
                        turnId: 't1',
                        participantId: 'p1',
                        questionId:
                          draft.sourceArtifact.kind === 'simulation' ? 'interview-q1' : null,
                        start: 0,
                        end: new TextEncoder().encode('EXACT_SYNTHETIC_REVIEW_TEXT\nSecond line.')
                          .length,
                        offsetUnit: 'utf8_bytes',
                      },
                    ],
                  },
                ],
              },
            ]
          : draft.request.grounding.sourceArtifacts.map((reference) => ({
              artifact: clone(reference),
              title: 'Chosen analysis quotes',
              passages: draft.selectedGrounding
                .filter((entry) => entry.artifact.artifactId === reference.artifactId)
                .map((entry) => ({ entryId: entry.entryId, text: 'EXACT_GROUNDING_PASSAGE' })),
            })),
    },
  };
  const review = result.review;
  review.limitations = capabilityReviewLimitations(
    draft.operationType,
    draft.request.grounding?.mode
  );
  if (draft.operationType === 'AnalyzeEvidenceV1') {
    review.providerPayload = {
      request: clone(draft.request),
      corpus: {
        schemaVersion: 'axwise.transcript-corpus.v1',
        documents: review.selectedSources[0].documents.map((document) => ({
          ...clone(document),
          textSha256: createHash('sha256').update(document.text).digest('hex'),
        })),
      },
    };
  } else {
    const request = draft.request;
    review.providerPayload = {
      scenario: clone(request.scenario),
      stakeholders: clone(request.stakeholders),
      sampling: clone(request.sampling),
      responseStyle: request.responseStyle,
      generationProfile: request.generationProfile,
      plan: simulationPlan(request, { operationId: review.operationId }),
      selectedPassages: draft.selectedGrounding.map((_, index) => ({
        passageId: `passage-${index + 1}`,
        text: 'EXACT_GROUNDING_PASSAGE',
      })),
    };
  }
  return result;
}
function fixture(options = {}) {
  const initial = workflow(options);
  const client = {
    startCapabilityWork: vi.fn(async () => ({ workflow: workflow({ status: 'running' }) })),
    approveCapabilityScope: vi.fn(async () => ({ workflow: workflow({ rowVersion: 4 }) })),
    admitCapabilityCorpus: vi.fn(async () => ({ workflow: workflow({ rowVersion: 4 }) })),
    prepareCapabilityOperation: vi.fn(async (runId, draft) => reviewFor(draft, runId)),
    confirmCapabilityOperation: vi.fn(async () => ({
      workflow: workflow({ rowVersion: 4, status: 'running' }),
    })),
    read: vi.fn(async () => ({ workflow: clone(initial) })),
    artifact: vi.fn(async (_runId, artifactId) => ({
      artifact:
        artifactId === analysis.artifactId
          ? {
              ...analysis,
              payload: {
                schemaVersion: 'axwise.qualitative-analysis.v1',
                acceptedScope: scope,
                quotes: [
                  { quoteId: 'c'.repeat(64), text: 'EXACT_GROUNDING_PASSAGE' },
                  { quoteId: 'd'.repeat(64), text: 'UNSELECTED_PASSAGE' },
                ],
              },
            }
          : {
              ...scope,
              payload: {
                title: 'Owner-reviewed capability scope',
                objective: 'Review only the requested capability.',
              },
            },
    })),
  };
  return {
    client,
    workflow: initial,
    onWorkflow: vi.fn(),
    ownerUserId: owner,
    authScopeKey: `${owner}:session1`,
  };
}
function fillAnalysis(source = corpus) {
  change('Source from this work item', source.artifactId);
  change(/Decision question \(/, 'Which needs are supported?');
  change(/Analysis question 1 \(/, 'What is the stated difficulty?');
}
async function prepareAnalysis(source = corpus) {
  fillAnalysis(source);
  click('Prepare exact processing review (no Google call)');
  await screen.findByRole('heading', { name: 'Review exact Google processing payload' });
}
function fillSimulation() {
  change(/Scenario description \(/, 'A synthetic interview about scheduling.');
  change(/Target audience \(/, 'Independent workshop operators.');
  change(/Problem \(/, 'Scheduling is time-consuming.');
  change(/Group 1 label \(/, 'Workshop operators');
  change(/Group 1 description \(/, 'Owners managing appointment calendars.');
  change(/Group 1 interview question 1 \(/, 'How would you manage an unexpected cancellation?');
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('capability creation and owner scope review', () => {
  it('makes no automatic reads, provider requests, or mutations', () => {
    const props = fixture();
    render(<CapabilityWorkPanel {...props} />);
    for (const method of Object.values(props.client)) expect(method).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Confirm and run/ })).not.toBeInTheDocument();
  });
  it('discloses exact compiler text and requires fresh Google consent after every purpose or capability edit', async () => {
    const props = fixture();
    render(<CapabilityWorkPanel {...props} workflow={null} />);
    const submit = screen.getByRole('button', { name: 'Create work item and compile scope' });
    expect(submit).toBeDisabled();
    change(/Purpose \(/, 'Learn about scheduling needs.');
    check(/I authorize paid Google scope compilation/);
    change(/Purpose \(/, 'Compare scheduling needs.');
    expect(
      screen.getByRole('checkbox', { name: /I authorize paid Google scope compilation/ })
    ).not.toBeChecked();
    check(/I authorize paid Google scope compilation/);
    change('Capability', 'SimulateV1');
    expect(submit).toBeDisabled();
    check(/Include optional, separately confirmed analysis/);
    const expected = {
      capability: 'SimulateV1',
      request: 'Compare scheduling needs.',
      allowSimulationAnalysis: true,
    };
    expect(
      screen.getByText(
        (_, element) =>
          element.tagName === 'PRE' && element.textContent === capabilityScopeRequest(expected)
      )
    ).toBeInTheDocument();
    check(/I authorize paid Google scope compilation/);
    click('Create work item and compile scope');
    await waitFor(() => expect(props.client.startCapabilityWork).toHaveBeenCalledTimes(1));
    const command = props.client.startCapabilityWork.mock.calls[0][0];
    expect(StartCapabilityWorkCommandSchema.parse(command)).toMatchObject(expected);
    expect(command).not.toHaveProperty('corpus');
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
  });
  it('does not send an oversized compiler purpose or throw from the event handler', async () => {
    const props = fixture();
    render(<CapabilityWorkPanel {...props} workflow={null} />);
    change(/Purpose \(/, 'x'.repeat(4001));
    check(/I authorize paid Google scope compilation/);
    click('Create work item and compile scope');
    await screen.findByText(/This action could not be completed/);
    expect(props.client.startCapabilityWork).not.toHaveBeenCalled();
  });
  it('loads exact scope on request, then separately requires compatibility confirmation', async () => {
    const props = fixture({ status: 'awaiting_gate_1', references: [] });
    render(<CapabilityWorkPanel {...props} />);
    expect(
      screen.queryByRole('button', { name: 'Approve compatible scope' })
    ).not.toBeInTheDocument();
    click('Review compiled scope');
    await screen.findByText(/Owner-reviewed capability scope/);
    expect(props.client.artifact).toHaveBeenCalledWith(id(1), id(2));
    expect(screen.getByRole('button', { name: 'Approve compatible scope' })).toBeDisabled();
    check(/I reviewed this scope/);
    click('Approve compatible scope');
    await waitFor(() =>
      expect(props.client.approveCapabilityScope).toHaveBeenCalledWith(
        id(1),
        expect.objectContaining({ artifact: scope, scopeCompatible: true })
      )
    );
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
    expect(props.client.startCapabilityWork).not.toHaveBeenCalled();
  });
  it.each(['artifactId', 'artifactHash', 'kind', 'runId'])(
    'never renders scope content when its %s differs',
    async (field) => {
      const props = fixture({ status: 'awaiting_gate_1' });
      props.client.artifact.mockResolvedValue({
        artifact: {
          ...scope,
          [field]:
            field === 'kind' ? 'analysis' : field === 'artifactHash' ? 'f'.repeat(64) : id(99),
          payload: { private: 'WRONG_SCOPE_BYTES' },
        },
      });
      render(<CapabilityWorkPanel {...props} />);
      click('Review compiled scope');
      await screen.findByText(/The exact compiled scope could not be loaded/);
      expect(screen.queryByText(/WRONG_SCOPE_BYTES/)).not.toBeInTheDocument();
    }
  );
  it.each(['wrong owner', 'signed out', 'legacy Goal'])(
    'rejects %s without reads or commands',
    (scenario) => {
      const props = fixture();
      if (scenario === 'wrong owner') props.workflow.run.ownerUserId = 'user_other';
      if (scenario === 'signed out') props.authScopeKey = '';
      if (scenario === 'legacy Goal') delete props.workflow.run.workProfile;
      render(<CapabilityWorkPanel {...props} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      for (const method of Object.values(props.client)) expect(method).not.toHaveBeenCalled();
    }
  );
});

describe('explicit supplied source admission', () => {
  it('preserves exact UTF-8 text and explicit speaker identity, without Google consent or calls', async () => {
    const props = fixture({ references: [] });
    render(<CapabilityWorkPanel {...props} />);
    change('Document 1 title', 'Fixture transcript');
    change(/Document 1 participant ID/, 'participant-one');
    change(/Document 1 participant name/, 'Fixture participant');
    const text = '\ufeffExact words: café 😀\r\nNext line.';
    change('Document 1 exact participant transcript', text);
    const displayed = screen.getByLabelText('Document 1 exact participant transcript').value;
    check(/I confirm each document contains only/);
    click('Admit supplied sources (no Google processing)');
    await waitFor(() => expect(props.client.admitCapabilityCorpus).toHaveBeenCalledTimes(1));
    const [runId, command] = props.client.admitCapabilityCorpus.mock.calls[0];
    expect(runId).toBe(id(1));
    expect(AdmitCapabilityCorpusCommandSchema.safeParse(command).success).toBe(true);
    const document = command.corpus.documents[0];
    expect(document.text).toBe(displayed);
    expect(document.origin).toBe('supplied_transcript');
    expect(document.originArtifactRefs).toEqual([]);
    expect(document.participants).toEqual([
      {
        participantId: 'participant-one',
        displayName: 'Fixture participant',
        role: 'participant',
        stakeholderId: null,
      },
    ]);
    expect(document.turns).toEqual([
      {
        turnId: 't1',
        participantId: 'participant-one',
        questionId: null,
        start: 0,
        end: new TextEncoder().encode(displayed).length,
        offsetUnit: 'utf8_bytes',
      },
    ]);
    expect(props.client.prepareCapabilityOperation).not.toHaveBeenCalled();
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
  });
  it('resets the owner speaker assignment after an edit and admits multiple explicit documents', async () => {
    const props = fixture();
    render(<CapabilityWorkPanel {...props} />);
    change('Document 1 title', 'One');
    change(/Document 1 participant ID/, 'p1');
    change('Document 1 exact participant transcript', 'First participant.');
    check(/I confirm each document contains only/);
    click('Add participant document');
    expect(
      screen.getByRole('checkbox', { name: /I confirm each document contains only/ })
    ).not.toBeChecked();
    change('Document 2 title', 'Two');
    change(/Document 2 participant ID/, 'p2');
    change('Document 2 exact participant transcript', 'Second participant.');
    check(/I confirm each document contains only/);
    click('Admit supplied sources (no Google processing)');
    await waitFor(() => expect(props.client.admitCapabilityCorpus).toHaveBeenCalledOnce());
    expect(
      props.client.admitCapabilityCorpus.mock.calls[0][1].corpus.documents.map(
        (document) => document.participants[0].participantId
      )
    ).toEqual(['p1', 'p2']);
  });
  it.each(['missing participant', 'UTF-8 byte limit', 'unpaired surrogate'])(
    'rejects %s before source submission',
    async (scenario) => {
      const props = fixture();
      render(<CapabilityWorkPanel {...props} />);
      change('Document 1 title', 'One');
      change(/Document 1 participant ID/, scenario === 'missing participant' ? '' : 'p1');
      change(
        'Document 1 exact participant transcript',
        scenario === 'UTF-8 byte limit'
          ? '😀'.repeat(32001)
          : scenario === 'unpaired surrogate'
            ? '\ud800'
            : 'Exact words.'
      );
      check(/I confirm each document contains only/);
      click('Admit supplied sources (no Google processing)');
      await screen.findByText(/Sources were not submitted/);
      expect(props.client.admitCapabilityCorpus).not.toHaveBeenCalled();
    }
  );
});

describe('analysis review and confirmation', () => {
  it.each([
    'participant authority',
    'turn authority',
    'missing nullable name',
    'missing nullable question',
    'invalid role',
    'invalid document ID',
  ])(
    'rejects non-whitelisted nested source data even if provider and metadata agree: %s',
    async (field) => {
      const props = fixture();
      props.client.prepareCapabilityOperation.mockImplementation(async (runId, draft) => {
        const result = reviewFor(draft, runId);
        const sources = [
          result.review.selectedSources[0].documents[0],
          result.review.providerPayload.corpus.documents[0],
        ];
        for (const document of sources) {
          if (field === 'participant authority')
            document.participants[0].ownerUserId = 'user_unselected';
          if (field === 'turn authority')
            document.turns[0].scopeAuthoritySeal = 'not-provider-data';
          if (field === 'missing nullable name') delete document.participants[0].displayName;
          if (field === 'missing nullable question') delete document.turns[0].questionId;
          if (field === 'invalid role') document.participants[0].role = 'authority';
          if (field === 'invalid document ID') document.documentId = 'not-a-uuid';
        }
        return result;
      });
      render(<CapabilityWorkPanel {...props} />);
      fillAnalysis();
      click('Prepare exact processing review (no Google call)');
      await screen.findByText(/A matching processing review could not be prepared/);
      expect(screen.queryByText(/EXACT_SYNTHETIC_REVIEW_TEXT/)).not.toBeInTheDocument();
      expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
    }
  );
  it('shows exact full source and request then submits only with a new Google checkbox', async () => {
    const props = fixture();
    const original = clone(props.workflow);
    render(<CapabilityWorkPanel {...props} />);
    await prepareAnalysis();
    expect(screen.getByText(/EXACT_SYNTHETIC_REVIEW_TEXT/)).toBeInTheDocument();
    expect(
      screen.getByText(/Google receives the reviewed payload once for token counting/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Token counting sends the data even if generation is rejected/)
    ).toBeInTheDocument();
    const draft = props.client.prepareCapabilityOperation.mock.calls[0][1];
    expect(PrepareCapabilityOperationCommandSchema.safeParse(draft).success).toBe(true);
    expect(screen.getByRole('button', { name: 'Confirm and run with Google' })).toBeDisabled();
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
    check(/I confirm scope compatibility and authorize paid Google/);
    click('Confirm and run with Google');
    await waitFor(() => expect(props.client.confirmCapabilityOperation).toHaveBeenCalledOnce());
    const [runId, command] = props.client.confirmCapabilityOperation.mock.calls[0];
    expect(runId).toBe(id(1));
    expect(command.draft).toEqual(draft);
    expect(ConfirmCapabilityOperationCommandSchema.safeParse(command).success).toBe(true);
    expect(command.confirmation).toMatchObject({
      operationId: id(6),
      reviewId: 'a'.repeat(64),
      bindingHash: 'b'.repeat(64),
      provider: 'google',
      purpose: 'AnalyzeEvidenceV1',
    });
    expect(props.workflow).toEqual(original);
    expect(props.onWorkflow).toHaveBeenCalledOnce();
  });
  it.each(['decision', 'question', 'output', 'source', 'new document'])(
    'invalidates prepared review and Google consent on %s edits',
    async (field) => {
      const props = fixture();
      render(<CapabilityWorkPanel {...props} />);
      await prepareAnalysis();
      check(/I confirm scope compatibility and authorize paid Google/);
      if (field === 'decision') change(/Decision question \(/, 'A changed decision.');
      if (field === 'question') change(/Analysis question 1 \(/, 'A changed question.');
      if (field === 'output') check('Personas');
      if (field === 'source') change('Source from this work item', '');
      if (field === 'new document')
        change('Document 1 exact participant transcript', 'Different local bytes.');
      expect(
        screen.queryByRole('button', { name: 'Confirm and run with Google' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/EXACT_SYNTHETIC_REVIEW_TEXT/)).not.toBeInTheDocument();
      expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
    }
  );
  it.each([
    'runId',
    'expectedRowVersion',
    'purpose',
    'provider',
    'noticeVersion',
    'acceptedScope',
    'request',
    'selectedSources',
    'reviewId',
    'limits',
    'documents',
  ])('rejects mismatched review %s before rendering source bytes', async (field) => {
    const props = fixture();
    props.client.prepareCapabilityOperation.mockImplementation(async (runId, draft) => {
      const result = reviewFor(draft, runId);
      const review = result.review;
      const changes = {
        runId: id(99),
        expectedRowVersion: 4,
        purpose: 'SimulateV1',
        provider: 'other',
        noticeVersion: 'old',
        acceptedScope: ref(99, 'scope'),
        request: { ...draft.request, decisionQuestion: 'CHANGED_REQUEST' },
        selectedSources: [],
        reviewId: 'bad',
        limits: {},
      };
      if (field === 'documents') review.selectedSources[0].documents = [];
      else review[field] = changes[field];
      return result;
    });
    render(<CapabilityWorkPanel {...props} />);
    fillAnalysis();
    click('Prepare exact processing review (no Google call)');
    await screen.findByText(/A matching processing review could not be prepared/);
    expect(screen.queryByText(/EXACT_SYNTHETIC_REVIEW_TEXT/)).not.toBeInTheDocument();
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
  });
  it.each(['run', 'owner', 'auth', 'client', 'version', 'stage'])(
    'clears loaded source bytes and checkbox on %s context change',
    async (field) => {
      const props = fixture();
      const { rerender } = render(<CapabilityWorkPanel {...props} />);
      await prepareAnalysis();
      check(/I confirm scope compatibility and authorize paid Google/);
      const next = { ...props, workflow: clone(props.workflow) };
      if (field === 'run') next.workflow.run.id = id(99);
      if (field === 'owner') next.ownerUserId = 'user_other';
      if (field === 'auth') next.authScopeKey += ':new';
      if (field === 'client') next.client = { ...props.client };
      if (field === 'version') next.workflow.run.rowVersion += 1;
      if (field === 'stage') next.workflow.stages[2].rowVersion += 1;
      rerender(<CapabilityWorkPanel {...next} />);
      expect(screen.queryByText(/EXACT_SYNTHETIC_REVIEW_TEXT/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Confirm and run with Google' })
      ).not.toBeInTheDocument();
    }
  );
  it.each(['draft', 'run', 'auth', 'client', 'version', 'unmount'])(
    'ignores a late preparation response after %s changes',
    async (field) => {
      const props = fixture(),
        pending = deferred();
      props.client.prepareCapabilityOperation.mockReturnValue(pending.promise);
      const { rerender, unmount } = render(<CapabilityWorkPanel {...props} />);
      fillAnalysis();
      click('Prepare exact processing review (no Google call)');
      const draft = props.client.prepareCapabilityOperation.mock.calls[0][1];
      const next = { ...props, workflow: clone(props.workflow) };
      if (field === 'draft') change(/Decision question \(/, 'Changed while waiting.');
      if (field === 'run') next.workflow.run.id = id(99);
      if (field === 'auth') next.authScopeKey += ':new';
      if (field === 'client') next.client = { ...props.client };
      if (field === 'version') next.workflow.run.rowVersion += 1;
      if (field === 'unmount') unmount();
      else if (field !== 'draft') rerender(<CapabilityWorkPanel {...next} />);
      await act(async () => pending.resolve(reviewFor(draft)));
      expect(screen.queryByText(/EXACT_SYNTHETIC_REVIEW_TEXT/)).not.toBeInTheDocument();
      expect(props.onWorkflow).not.toHaveBeenCalled();
    }
  );
  it('deduplicates repeated confirmation clicks and requires refresh after an uncertain submission', async () => {
    const props = fixture(),
      pending = deferred();
    props.client.confirmCapabilityOperation.mockReturnValue(pending.promise);
    render(<CapabilityWorkPanel {...props} />);
    await prepareAnalysis();
    check(/I confirm scope compatibility and authorize paid Google/);
    const button = screen.getByRole('button', { name: 'Confirm and run with Google' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(props.client.confirmCapabilityOperation).toHaveBeenCalledOnce());
    await act(async () => pending.reject(new Error('NETWORK_FAILURE_PRIVATE_DETAIL')));
    await screen.findByText(/Submission status is unknown/);
    expect(screen.queryByText(/NETWORK_FAILURE_PRIVATE_DETAIL/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Prepare exact processing review (no Google call)' })
    ).toBeDisabled();
    expect(props.client.prepareCapabilityOperation).toHaveBeenCalledOnce();
    click('Refresh work item');
    await waitFor(() => expect(props.client.read).toHaveBeenCalledWith(id(1)));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Prepare exact processing review (no Google call)' })
      ).toBeEnabled()
    );
    expect(screen.getByLabelText(/Decision question \(/)).toHaveValue('');
    expect(props.client.confirmCapabilityOperation).toHaveBeenCalledOnce();
  });
  it('ignores a late mutation response after the owner changes', async () => {
    const props = fixture(),
      pending = deferred();
    props.client.confirmCapabilityOperation.mockReturnValue(pending.promise);
    const { rerender } = render(<CapabilityWorkPanel {...props} />);
    await prepareAnalysis();
    check(/I confirm scope compatibility and authorize paid Google/);
    click('Confirm and run with Google');
    await waitFor(() => expect(props.client.confirmCapabilityOperation).toHaveBeenCalledOnce());
    rerender(
      <CapabilityWorkPanel {...props} authScopeKey="user_other:session2" ownerUserId="user_other" />
    );
    await act(async () => pending.resolve({ workflow: workflow({ rowVersion: 4 }) }));
    expect(props.onWorkflow).not.toHaveBeenCalled();
  });
  it('offers only completed same-run corpus artifacts for primary Analysis', () => {
    const props = fixture({
      references: [corpus, simulation, { ...ref(99, 'transcript_corpus'), runId: id(99) }],
    });
    props.workflow.stages.push({
      id: id(77),
      kind: 'execution',
      status: 'running',
      outputArtifact: ref(77, 'transcript_corpus'),
    });
    render(<CapabilityWorkPanel {...props} />);
    expect(
      [...screen.getByLabelText('Source from this work item').options].map((option) => option.value)
    ).toEqual(['', corpus.artifactId]);
  });
});

describe('bounded explicit simulations', () => {
  it.each([
    'missing payload',
    'plan count',
    'participant ID',
    'personality vector',
    'market',
    'scenario',
    'extra authority',
    'limitations',
  ])('fails closed on altered simulation provider disclosure: %s', async (field) => {
    const props = fixture({ capability: 'SimulateV1', references: [] });
    props.client.prepareCapabilityOperation.mockImplementation(async (runId, draft) => {
      const result = reviewFor(draft, runId),
        payload = result.review.providerPayload;
      if (field === 'missing payload') delete result.review.providerPayload;
      if (field === 'plan count') payload.plan = [];
      if (field === 'participant ID') payload.plan[0].participantId = id(99);
      if (field === 'personality vector') payload.plan[0].oceanMicros.openness += 1;
      if (field === 'market') payload.plan[0].countryCode = 'US';
      if (field === 'scenario') payload.scenario.problem = 'CHANGED_PROVIDER_DATA';
      if (field === 'extra authority') payload.scopeApproved = true;
      if (field === 'limitations') result.review.limitations = ['Claimed population evidence.'];
      return result;
    });
    render(<CapabilityWorkPanel {...props} />);
    fillSimulation();
    click('Prepare exact processing review (no Google call)');
    await screen.findByText(/A matching processing review could not be prepared/);
    expect(
      screen.queryByRole('heading', { name: 'Exact data sent to Google' })
    ).not.toBeInTheDocument();
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
  });
  it.each([
    'missing payload',
    'document hash',
    'source text',
    'request',
    'extra source',
    'limitations',
  ])('fails closed on altered Analysis provider disclosure: %s', async (field) => {
    const props = fixture();
    props.client.prepareCapabilityOperation.mockImplementation(async (runId, draft) => {
      const result = reviewFor(draft, runId),
        payload = result.review.providerPayload;
      if (field === 'missing payload') delete result.review.providerPayload;
      if (field === 'document hash') payload.corpus.documents[0].textSha256 = 'f'.repeat(64);
      if (field === 'source text') payload.corpus.documents[0].text = 'UNDISCLOSED_SOURCE_BYTES';
      if (field === 'request') payload.request.decisionQuestion = 'Changed provider question.';
      if (field === 'extra source')
        payload.corpus.documents.push(clone(payload.corpus.documents[0]));
      if (field === 'limitations') delete result.review.limitations;
      return result;
    });
    render(<CapabilityWorkPanel {...props} />);
    fillAnalysis();
    click('Prepare exact processing review (no Google call)');
    await screen.findByText(/A matching processing review could not be prepared/);
    expect(
      screen.queryByText(/EXACT_SYNTHETIC_REVIEW_TEXT|UNDISCLOSED_SOURCE_BYTES/)
    ).not.toBeInTheDocument();
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
  });
  it('defaults to scenario-only, discloses synthetic status, and produces a contract-valid bounded request', async () => {
    const props = fixture({ capability: 'SimulateV1', references: [] });
    render(<CapabilityWorkPanel {...props} />);
    expect(screen.queryByText('Admit supplied transcripts')).not.toBeInTheDocument();
    expect(
      screen.getByText(/All generated participants and responses are synthetic hypotheses/)
    ).toBeInTheDocument();
    fillSimulation();
    change(/Group 1 country code/, 'DE');
    change(/Group 1 locality/, 'Berlin');
    change(/Group 1 synthetic participant count/, '3');
    change(/Sampling seed/, '9007199254740991');
    click('Prepare exact processing review (no Google call)');
    await screen.findByRole('heading', { name: 'Review exact Google processing payload' });
    const draft = props.client.prepareCapabilityOperation.mock.calls[0][1];
    expect(PrepareCapabilityOperationCommandSchema.safeParse(draft).success).toBe(true);
    expect(draft.request.grounding).toEqual({ mode: 'scenario_only', sourceArtifacts: [] });
    expect(draft.selectedGrounding).toEqual([]);
    expect(draft.request.stakeholders[0]).toMatchObject({
      participantCount: 3,
      countryCode: 'DE',
      locality: 'Berlin',
    });
    expect(draft.request.sampling.seed).toBe(Number.MAX_SAFE_INTEGER);
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
    expect(screen.getByText(/No source artifact content will be sent/)).toBeInTheDocument();
  });
  it('permits only own simulation for an explicitly scoped follow-on analysis', async () => {
    const props = fixture({
      capability: 'SimulateV1',
      allowSimulationAnalysis: true,
      references: [simulation, corpus],
    });
    render(<CapabilityWorkPanel {...props} />);
    change('Operation', 'AnalyzeEvidenceV1');
    expect(
      [...screen.getByLabelText('Source from this work item').options].map((option) => option.value)
    ).toEqual(['', simulation.artifactId]);
    await prepareAnalysis(simulation);
    expect(screen.getByRole('heading', { name: /synthetic_transcript/ })).toBeInTheDocument();
    expect(props.client.prepareCapabilityOperation.mock.calls[0][1].sourceArtifact).toEqual(
      simulation
    );
  });
  it('loads same-run analysis quotes only on demand and sends only explicitly selected passages', async () => {
    const props = fixture({
      capability: 'SimulateV1',
      allowSimulationAnalysis: true,
      references: [simulation, analysis],
    });
    render(<CapabilityWorkPanel {...props} />);
    fillSimulation();
    expect(props.client.artifact).not.toHaveBeenCalled();
    click(`Review grounding quotes from ${analysis.artifactId}`);
    await screen.findByText('EXACT_GROUNDING_PASSAGE');
    expect(screen.getByRole('checkbox', { name: `Use quote ${'c'.repeat(64)}` })).not.toBeChecked();
    check(`Use quote ${'c'.repeat(64)}`);
    click('Prepare exact processing review (no Google call)');
    await screen.findByRole('heading', { name: 'Review exact Google processing payload' });
    const draft = props.client.prepareCapabilityOperation.mock.calls[0][1];
    expect(PrepareCapabilityOperationCommandSchema.safeParse(draft).success).toBe(true);
    expect(draft.selectedGrounding).toEqual([
      { artifact: analysis, entryKind: 'quote', entryId: 'c'.repeat(64) },
    ]);
    expect(draft.request.grounding).toEqual({
      mode: 'source_grounded',
      sourceArtifacts: [analysis],
    });
    check(/I confirm scope compatibility and authorize paid Google/);
    check(`Use quote ${'c'.repeat(64)}`);
    expect(
      screen.queryByRole('button', { name: 'Confirm and run with Google' })
    ).not.toBeInTheDocument();
    expect(props.client.confirmCapabilityOperation).not.toHaveBeenCalled();
  });
  it.each(['count', 'seed', 'country', 'locality'])(
    'rejects invalid simulation %s before preparation',
    async (field) => {
      const props = fixture({ capability: 'SimulateV1', references: [] });
      render(<CapabilityWorkPanel {...props} />);
      fillSimulation();
      if (field === 'count') change(/Group 1 synthetic participant count/, '4');
      if (field === 'seed') change(/Sampling seed/, '9007199254740992');
      if (field === 'country') change(/Group 1 country code/, 'de');
      if (field === 'locality') change(/Group 1 locality/, 'Berlin');
      click('Prepare exact processing review (no Google call)');
      await screen.findByText(/A matching processing review could not be prepared/);
      expect(props.client.prepareCapabilityOperation).not.toHaveBeenCalled();
    }
  );
  it('does not reopen capability inputs while a request is active', () => {
    const props = fixture({ capability: 'SimulateV1', status: 'running' });
    render(<CapabilityWorkPanel {...props} />);
    expect(
      screen.queryByRole('button', { name: 'Prepare exact processing review (no Google call)' })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/not accepting new capability inputs/)).toBeInTheDocument();
  });
});
