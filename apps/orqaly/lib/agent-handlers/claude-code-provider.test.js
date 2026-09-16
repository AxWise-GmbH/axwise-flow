import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  publish: vi.fn(),
  cloudflareDeploy: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mocks.query }));
vi.mock('./landing-pages-tool.js', () => ({
  executeLandingPagePublish: mocks.publish,
}));
vi.mock('./tool-runner.js', () => ({
  executeCloudflareDeploy: mocks.cloudflareDeploy,
}));

import { executeClaudeCode } from './claude-code-provider.js';

function streamWithContent(content) {
  return (async function* stream() {
    yield {
      type: 'assistant',
      message: { content: [{ type: 'text', text: content }] },
    };
    yield {
      type: 'result',
      usage: { input_tokens: 1, output_tokens: 2 },
    };
  })();
}

describe('executeClaudeCode live authorization', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.publish.mockReset();
    mocks.cloudflareDeploy.mockReset();
  });

  it('checks live authority before the initial SDK query', async () => {
    const beforeExternalAction = vi.fn(async () => ({ status: 'authorization_revoked' }));

    await expect(
      executeClaudeCode({ prompt: 'hello', beforeExternalAction })
    ).rejects.toMatchObject({ code: 'EXECUTION_AUTHORIZATION_REVOKED' });

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('does not swallow revocation before the HTML fallback query', async () => {
    mocks.query.mockReturnValueOnce(streamWithContent('prose without html'));
    const beforeExternalAction = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'authorization_revoked' });

    await expect(
      executeClaudeCode({
        prompt: 'build',
        taskContext: {
          deliverable_type: 'deployment',
          user_id: 'user-1',
          goal_id: 'goal-1',
          title: 'Landing page',
        },
        beforeExternalAction,
      })
    ).rejects.toMatchObject({ code: 'EXECUTION_AUTHORIZATION_REVOKED' });

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('does not publish HTML after live authority is revoked', async () => {
    mocks.query.mockReturnValueOnce(
      streamWithContent('<!DOCTYPE html><html><body>ready</body></html>')
    );
    const beforeExternalAction = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'authorization_revoked' });

    await expect(
      executeClaudeCode({
        prompt: 'build',
        taskContext: {
          deliverable_type: 'deployment',
          user_id: 'user-1',
          goal_id: 'goal-1',
          title: 'Landing page',
        },
        beforeExternalAction,
      })
    ).rejects.toMatchObject({ code: 'EXECUTION_AUTHORIZATION_REVOKED' });

    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
