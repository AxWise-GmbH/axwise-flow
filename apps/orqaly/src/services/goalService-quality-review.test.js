import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  hasSupabase: () => false,
  supabase: {},
}));

import {
  createGoal,
  createGoalSourceRequestId,
  getGoalResearchArtifact,
  getGoalResearchBundle,
  GoalServiceError,
  preparePhysicalEvidenceProfile,
  retryGoalPickup,
  rerunGoalQualityReview,
  submitGoalPoAnswers,
} from './goalService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rerunGoalQualityReview', () => {
  it('posts the authenticated goals operation for the selected goal', async () => {
    const response = {
      job_id: 'job-1',
      status: 'queued',
      already_queued: false,
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: async () => JSON.stringify(response),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(rerunGoalQualityReview('goal-1')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/app?path=goals&');
    expect(url).toContain('op=rerun-quality-review');
    expect(url).toContain('id=goal-1');
    expect(options).toMatchObject({ method: 'POST' });
  });
});

describe('goal create response-loss contract', () => {
  it('preserves durable reconciliation identities on a structured 503', async () => {
    const metadata = {
      goal_id: 'goal-durable-1',
      job_id: 'job-durable-1',
      reconciliation_state: 'duplicate-create:parked',
      retry_safe: false,
    };
    const response = {
      error:
        'Goal processing could not be handed to the Preview worker. Reconciliation is required.',
      data: metadata,
      goal_id: metadata.goal_id,
      job_id: metadata.job_id,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => JSON.stringify(response),
      }))
    );

    const error = await createGoal({
      title: 'Durable goal',
      source_request_id: 'request-1',
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(GoalServiceError);
    expect(error).toMatchObject({
      status: 503,
      response,
      data: metadata,
      metadata,
      goal_id: metadata.goal_id,
      job_id: metadata.job_id,
      reconciliation_state: metadata.reconciliation_state,
      retry_safe: false,
      goalId: metadata.goal_id,
      jobId: metadata.job_id,
      reconciliationState: metadata.reconciliation_state,
      retrySafe: false,
    });
    expect(error.message).toBe(response.error);
  });

  it('uses the browser UUID as the source request id when available', () => {
    const randomUUID = vi.fn(() => 'browser-request-uuid');
    vi.stubGlobal('crypto', { randomUUID });

    expect(createGoalSourceRequestId()).toBe('browser-request-uuid');
    expect(randomUUID).toHaveBeenCalledOnce();
  });
});

describe('Preview pickup recovery service', () => {
  it('keeps the goal id in the query and sends the opaque capability in the POST body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ pickup_requested: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await retryGoalPickup('goal-1', 'signed-pickup-capability');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('op=retry-pickup');
    expect(url).toContain('id=goal-1');
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse(options.body)).toEqual({
      pickup_capability: 'signed-pickup-capability',
    });
  });
});

describe('Expert PO answer service', () => {
  it('posts the goal id and exact question-answer snapshot to the dedicated goals operation', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ status: 'analyzing' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const answers = [{ question: 'Who benefits?', answer: 'Clinic operators' }];

    await submitGoalPoAnswers('goal-1', answers);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('op=answer-po-questions');
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse(options.body)).toEqual({ id: 'goal-1', answers });
  });
});

describe('goal research retrieval service', () => {
  it('requests the current research bundle and a single artifact', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'result-1' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await getGoalResearchBundle('goal-1');
    await getGoalResearchArtifact('goal-1', 'artifact-1');

    expect(fetchMock.mock.calls[0][0]).toContain('op=research-bundle');
    expect(fetchMock.mock.calls[0][0]).toContain('id=goal-1');
    expect(fetchMock.mock.calls[1][0]).toContain('op=research-artifact');
    expect(fetchMock.mock.calls[1][0]).toContain('artifact_id=artifact-1');
  });
});

describe('physical evidence profile preparation service', () => {
  it('posts the preparation inputs without adding client-side contract fields', async () => {
    const response = {
      business_evidence_profile_hash: 'a'.repeat(64),
      market_scope_hash: 'b'.repeat(64),
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(response),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      mode: 'advanced',
      org_id: 'org-1',
      research_mode: 'grounded_deep',
      research_location: 'Estonia',
      grounding_required: true,
      research_fail_closed: true,
    };

    await expect(preparePhysicalEvidenceProfile(input)).resolves.toEqual(response);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('op=prepare-physical-evidence-profile');
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse(options.body)).toEqual(input);
  });
});
