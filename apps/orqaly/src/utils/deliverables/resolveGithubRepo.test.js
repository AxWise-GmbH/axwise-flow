/**
 * [module: frontend]
 * Tests for resolveGithubRepoForGoal.
 */
import { describe, it, expect } from 'vitest';
import { resolveGithubRepoForGoal, githubSourceViewUrl } from './resolveGithubRepo.js';

describe('resolveGithubRepoForGoal', () => {
  it('prefers project_overview.key_links.github', () => {
    const repo = resolveGithubRepoForGoal({
      goal: {
        data: {
          project_overview: {
            key_links: { github: 'https://github.com/acme/landing-page' },
          },
        },
      },
      allTasks: [],
      landingPages: [],
    });
    expect(repo?.fullName).toBe('acme/landing-page');
  });

  it('falls back to landing_pages.data.github.repo_url', () => {
    const repo = resolveGithubRepoForGoal({
      goal: { data: {} },
      allTasks: [],
      landingPages: [{ data: { github: { repo_url: 'https://github.com/acme/casino' } } }],
    });
    expect(repo?.fullName).toBe('acme/casino');
  });

  it('scans all done tasks for GITHUB_REPO marker', () => {
    const repo = resolveGithubRepoForGoal({
      goal: { data: {} },
      allTasks: [
        {
          status: 'done',
          data: {
            output: 'GITHUB_REPO: https://github.com/builder/nebula-jackpot',
            deliverable_type: 'deployment',
          },
        },
      ],
      landingPages: [],
    });
    expect(repo?.fullName).toBe('builder/nebula-jackpot');
  });

  it('returns null when no repo is found', () => {
    expect(
      resolveGithubRepoForGoal({ goal: { data: {} }, allTasks: [], landingPages: [] })
    ).toBeNull();
  });
});

describe('githubSourceViewUrl', () => {
  it('uses raw.githack when index.html is present', () => {
    expect(
      githubSourceViewUrl({
        owner: 'acme',
        repo: 'site',
        hasIndexHtml: true,
      })
    ).toBe('https://raw.githack.com/acme/site/main/index.html');
  });

  it('uses github tree when not a static site', () => {
    expect(
      githubSourceViewUrl({
        owner: 'acme',
        repo: 'cli',
        hasIndexHtml: false,
      })
    ).toBe('https://github.com/acme/cli/tree/main');
  });
});
