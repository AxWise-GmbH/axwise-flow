// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archiveGitSource,
  assertCleanGitSource,
  assertExternalGitOutput,
  GIT_SOURCE_MAX_BUFFER,
  gitSourceRoot,
  readGitSourceFile,
} from './workflow-v2-git-source.mjs';

const temporaryRoots = [];
const git = (repository, ...args) => execFileSync('git', ['-C', repository, ...args], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'orqaly-git-source-test.')));
  temporaryRoots.push(root);
  const app = join(root, 'apps/orqaly');
  mkdirSync(app, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"root"}\n');
  writeFileSync(join(app, 'package.json'), '{"name":"orqaly"}\n');
  git(root, 'init', '--quiet');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Source test', '-c', 'user.email=source-test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic component sources');
  return { root, app, commit: git(root, 'rev-parse', 'HEAD') };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Git component sources in a shared monorepo', () => {
  it('reads the exact tracked component file even when the root has the same path', () => {
    const { root, app, commit } = fixture();
    expect(gitSourceRoot(app)).toBe(root);
    expect(assertCleanGitSource(app, { expectedCommit: commit })).toEqual({ root, commit });
    expect(readGitSourceFile(app, 'package.json')).toBe('{"name":"orqaly"}\n');
    expect(readGitSourceFile(root, 'package.json')).toBe('{"name":"root"}\n');
  });

  it('exports reproducible app-relative archives without sibling or untracked source', () => {
    const { root, app, commit } = fixture();
    writeFileSync(join(app, 'local.secret'), 'synthetic untracked input');
    const archive = archiveGitSource(app, { commit });
    expect(archiveGitSource(app, { commit }).equals(archive)).toBe(true);
    const entries = execFileSync('tar', ['-tf', '-'], { input: archive, encoding: 'utf8' });
    expect(entries.trim().split('\n')).toEqual(['package.json']);
    expect(archiveGitSource(root, { commit }).equals(archive)).toBe(false);
    // Keep room for a complete unified source archive exceeding 100 MB.
    expect(GIT_SOURCE_MAX_BUFFER).toBeGreaterThanOrEqual(256 * 1024 * 1024);
  });

  it('rejects tracked and untracked dirty siblings outside the app', () => {
    const { root, app } = fixture();
    writeFileSync(join(root, 'package.json'), '{"name":"dirty sibling"}\n');
    expect(() => assertCleanGitSource(app)).toThrow(/clean worktree/);
    writeFileSync(join(root, 'package.json'), '{"name":"root"}\n');
    writeFileSync(join(root, 'untracked.txt'), 'synthetic sibling');
    expect(() => assertCleanGitSource(app)).toThrow(/clean worktree/);
  });

  it('rejects a changed expected commit and untracked component files', () => {
    const { app } = fixture();
    expect(() => assertCleanGitSource(app, { expectedCommit: 'a'.repeat(40) }))
      .toThrow(/HEAD changed/);
    writeFileSync(join(app, 'untracked.txt'), 'synthetic source');
    expect(() => assertCleanGitSource(app)).toThrow(/clean worktree/);
    expect(() => readGitSourceFile(app, 'untracked.txt')).toThrow();
  });

  it('rejects paths or revision syntax that could escape the component', () => {
    const { app } = fixture();
    for (const path of ['../package.json', '/package.json', 'nested/../../package.json',
      'nested\\package.json', './package.json', 'nested//package.json']) {
      expect(() => readGitSourceFile(app, path)).toThrow(/relative path/);
    }
    expect(() => archiveGitSource(app, { commit: '--output=elsewhere' })).toThrow(/exact commit/);
  });

  it('keeps outputs outside the entire Git root, including symlink aliases', () => {
    const { root, app } = fixture();
    const external = realpathSync(mkdtempSync(join(tmpdir(), 'orqaly-evidence-test.')));
    temporaryRoots.push(external);
    expect(() => assertExternalGitOutput(join(root, 'evidence.json'), [app]))
      .toThrow(/outside the clean Git worktrees/);
    expect(() => assertExternalGitOutput(join(external, 'evidence.json'), [app, root]))
      .not.toThrow();
    symlinkSync(root, join(external, 'alias'));
    expect(() => assertExternalGitOutput(join(external, 'alias/evidence.json'), [app]))
      .toThrow(/outside the clean Git worktrees/);
  });
});
