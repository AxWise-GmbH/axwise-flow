/**
 * Tests for parseGithubUrl - parse and validate GitHub URLs for SSRF-safe fetching.
 */
import { describe, it, expect } from 'vitest';
import { parseGithubUrl, GITHUB_HOSTS } from './github-url.js';

describe('parseGithubUrl - full URLs', () => {
  it('parses https://github.com/owner/repo', () => {
    const result = parseGithubUrl('https://github.com/owner/repo');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      branch: null,
      path: null,
      kind: 'repo',
    });
  });

  it('strips .git suffix from repo name', () => {
    const result = parseGithubUrl('https://github.com/owner/repo.git');
    expect(result.repo).toBe('repo');
  });

  it('parses github.com/owner/repo/tree/main', () => {
    const result = parseGithubUrl('github.com/owner/repo/tree/main');
    expect(result).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: null,
      kind: 'tree',
    });
  });

  it('parses github.com/owner/repo/tree/main/sub/dir', () => {
    const result = parseGithubUrl('github.com/owner/repo/tree/main/sub/dir');
    expect(result).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: 'sub/dir',
      kind: 'tree',
    });
  });

  it('parses github.com/owner/repo/blob/dev/file.md', () => {
    const result = parseGithubUrl('github.com/owner/repo/blob/dev/file.md');
    expect(result).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      branch: 'dev',
      path: 'file.md',
      kind: 'blob',
    });
  });

  it('accepts www.github.com as valid host', () => {
    const result = parseGithubUrl('https://www.github.com/owner/repo');
    expect(result.owner).toBe('owner');
  });

  it('strips query and fragment', () => {
    const result = parseGithubUrl('https://github.com/owner/repo?tab=readme#installation');
    expect(result).toMatchObject({
      owner: 'owner',
      repo: 'repo',
    });
  });
});

describe('parseGithubUrl - shorthand', () => {
  it('parses owner/repo shorthand', () => {
    const result = parseGithubUrl('owner/repo');
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      branch: null,
      path: null,
      kind: 'repo',
    });
  });

  it('parses owner/repo@feat branch shorthand', () => {
    const result = parseGithubUrl('owner/repo@feat');
    expect(result).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      branch: 'feat',
    });
  });

  it('strips .git from shorthand', () => {
    const result = parseGithubUrl('owner/repo.git');
    expect(result.repo).toBe('repo');
  });

  it('strips query and fragment from shorthand', () => {
    const result = parseGithubUrl('owner/repo?x=1#top');
    expect(result).toMatchObject({
      owner: 'owner',
      repo: 'repo',
    });
  });
});

describe('parseGithubUrl - validation errors', () => {
  it('throws for non-github host', () => {
    expect(() => parseGithubUrl('https://gitlab.com/owner/repo')).toThrow(/only github.com/i);
  });

  it('throws for subdomain attack', () => {
    expect(() => parseGithubUrl('https://evil.com/github.com/owner/repo')).toThrow(/only github.com/i);
  });

  it('throws for empty string', () => {
    expect(() => parseGithubUrl('')).toThrow(/provide a github/i);
  });

  it('throws for null or undefined', () => {
    expect(() => parseGithubUrl(null)).toThrow(/provide a github/i);
    expect(() => parseGithubUrl(undefined)).toThrow(/provide a github/i);
  });

  it('throws for URL with only one segment', () => {
    expect(() => parseGithubUrl('https://github.com/owner')).toThrow(/must include owner\/repo/i);
  });

  it('throws for invalid owner (leading hyphen)', () => {
    expect(() => parseGithubUrl('https://github.com/-owner/repo')).toThrow(/invalid.*owner/i);
  });

  it('throws for invalid repo name (empty)', () => {
    expect(() => parseGithubUrl('https://github.com/owner/')).toThrow(/invalid.*repo/i);
  });

  it('throws for path containing ..', () => {
    expect(() => parseGithubUrl('github.com/owner/repo/tree/main/../etc/passwd')).toThrow(/invalid path/i);
  });

  it('throws for path too long', () => {
    const longPath = 'x'.repeat(600);
    expect(() => parseGithubUrl(`github.com/owner/repo/tree/main/${longPath}`)).toThrow(/invalid path/i);
  });
});

describe('GITHUB_HOSTS export', () => {
  it('is a frozen array with the three allowed hosts', () => {
    expect(GITHUB_HOSTS).toEqual(['github.com', 'api.github.com', 'raw.githubusercontent.com']);
    expect(Object.isFrozen(GITHUB_HOSTS)).toBe(true);
  });
});
