import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
  hasSupabase: () => true,
}));

import { startExecution } from './workflowExecutionService.js';

describe('workflow execution dedicated route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'access-token', user: { id: 'user-1' } } },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: 'job-1', status: 'queued' }),
    });
  });

  it('sends only workflow inputs to the narrow authenticated action', async () => {
    await expect(startExecution('workflow-1', { source: 'button' })).resolves.toEqual({
      job_id: 'job-1',
      status: 'queued',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/app?path=workflows&action=execute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workflowId: 'workflow-1', triggerData: { source: 'button' } }),
      })
    );
  });
});
