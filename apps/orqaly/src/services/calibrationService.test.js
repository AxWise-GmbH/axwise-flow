import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  from: vi.fn(),
  waitForJobResult: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
    from: mocks.from,
  },
}));
vi.mock('./agentJobService', () => ({ waitForJobResult: mocks.waitForJobResult }));

import {
  getCalibrationMode,
  loadCalibrationSamples,
  saveSampleComment,
  startCalibration,
} from './calibrationService.js';

function queryResult(result) {
  const filters = {};
  const query = {
    filters,
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn((field, value) => {
      filters[field] = value;
      return query;
    }),
    is: vi.fn((field, value) => {
      filters[field] = value;
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then(resolve) {
      return Promise.resolve(result).then(resolve);
    },
  };
  return query;
}

describe('calibration service tenant scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'access-token', user: { id: 'user-a' } } },
    });
    mocks.waitForJobResult.mockResolvedValue({
      status: 'done',
      result: { calibrationRunId: 'run-a' },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: 'job-1', status: 'queued' }),
    });
  });

  it('forwards the selected organization to the authenticated calibration request', async () => {
    await expect(
      startCalibration({ costPreference: 'free_first', organizationId: 'org-a' })
    ).resolves.toEqual({ calibrationRunId: 'run-a' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/app?path=library-calibration&action=start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ organizationId: 'org-a', costPreference: 'free_first' }),
      })
    );
    expect(mocks.waitForJobResult).toHaveBeenCalledWith(
      { job_id: 'job-1', status: 'queued' },
      180000
    );
  });

  it('loads personal samples with exact owner and null-organization scope', async () => {
    const query = queryResult({ data: [{ id: 'sample-a' }], error: null });
    mocks.from.mockReturnValue(query);

    await expect(loadCalibrationSamples('run-a')).resolves.toEqual([{ id: 'sample-a' }]);
    expect(query.filters).toMatchObject({
      category: 'calibration_sample',
      'metadata->>calibration_run_id': 'run-a',
      user_id: 'user-a',
      organization_id: null,
    });
  });

  it('updates comments only inside the exact owner and organization scope', async () => {
    const loadQuery = queryResult({
      data: { metadata: { calibration_run_id: 'run-a' } },
      error: null,
    });
    const updateQuery = queryResult({ data: null, error: null });
    mocks.from.mockReturnValueOnce(loadQuery).mockReturnValueOnce(updateQuery);

    await saveSampleComment('sample-a', 'Use tighter copy', 'org-a');

    expect(loadQuery.filters).toMatchObject({
      id: 'sample-a',
      category: 'calibration_sample',
      user_id: 'user-a',
      organization_id: 'org-a',
    });
    expect(updateQuery.update).toHaveBeenCalledWith({
      metadata: { calibration_run_id: 'run-a', user_comment: 'Use tighter copy' },
    });
    expect(updateQuery.filters).toMatchObject({
      id: 'sample-a',
      user_id: 'user-a',
      organization_id: 'org-a',
    });
  });

  it('reads a personal calibration mode only from the signed-in user scope', async () => {
    const query = queryResult({
      data: { content: 'comment', metadata: { active_run_id: 'run-a' } },
      error: null,
    });
    mocks.from.mockReturnValue(query);

    await expect(getCalibrationMode()).resolves.toEqual({
      mode: 'comment',
      active_run_id: 'run-a',
    });
    expect(query.filters).toMatchObject({
      category: 'system_flag',
      source: 'library_calibration_mode',
      user_id: 'user-a',
      organization_id: null,
    });
  });
});
