/**
 * [module: frontend]
 * Tests for extractLiveSites githubRepo attachment.
 */
import { describe, it, expect } from 'vitest';
import { extractLiveSites } from './liveSite.js';

describe('extractLiveSites', () => {
  it('attaches githubRepo from task outputs to live site items', () => {
    const tasks = [
      {
        id: 't1',
        status: 'done',
        title: 'Deploy landing page',
        data: {
          deliverable_type: 'deployment',
          output: [
            'DEPLOYMENT_URL: https://nebula-jackpot.misters-builder.workers.dev/',
            'GITHUB_REPO: https://github.com/builder/nebula-jackpot',
          ].join('\n'),
        },
      },
    ];

    const items = extractLiveSites(tasks, tasks, { goal: { data: {} }, landingPages: [] });
    expect(items).toHaveLength(1);
    expect(items[0].githubRepo?.fullName).toBe('builder/nebula-jackpot');
  });
});
