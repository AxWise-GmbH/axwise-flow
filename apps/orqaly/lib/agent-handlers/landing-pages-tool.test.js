import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildAdmin: vi.fn(),
  scoreHtml: vi.fn(() => ({ passed: true, score: 100, failures: [] })),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildAdmin,
}));
vi.mock('./html-critic.js', () => ({
  scoreHtml: mocks.scoreHtml,
  buildRejectionMessage: vi.fn(),
}));

import { executeLandingPagePublish } from './landing-pages-tool.js';

describe('executeLandingPagePublish live authorization', () => {
  it('stops before the hidden goal read and deploy when authority is revoked', async () => {
    const beforeExternalAction = vi.fn(async () => ({
      status: 'authorization_revoked',
    }));
    const cloudflareDeployFn = vi.fn();

    await expect(
      executeLandingPagePublish({
        endpointName: 'publish',
        args: {
          title: 'Authorized page',
          html: '<!DOCTYPE html><html><body>ready</body></html>',
          goal_id: 'goal-1',
        },
        userId: 'user-1',
        cloudflareDeployFn,
        start: Date.now(),
        beforeExternalAction,
      })
    ).rejects.toMatchObject({ code: 'EXECUTION_AUTHORIZATION_REVOKED' });

    expect(beforeExternalAction).toHaveBeenCalledWith({
      kind: 'persistence',
      phase: 'landing_page_localization_goal_read',
    });
    expect(mocks.buildAdmin).not.toHaveBeenCalled();
    expect(cloudflareDeployFn).not.toHaveBeenCalled();
  });
});
