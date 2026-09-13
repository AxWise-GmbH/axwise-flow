// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryCommit } from './workflow-v2-verify-build-attestation.mjs';

const roots = [];
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'orqaly-build-proof-test.')));
  roots.push(root);
  const app = join(root, 'apps/orqaly');
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, 'source.txt'), 'synthetic Orqaly source');
  writeFileSync(join(root, 'axwise.txt'), 'synthetic AxWise source');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=Build proof test', '-c', 'user.email=build-proof@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic unified source');
  return { root, app, commit: git('rev-parse', 'HEAD') };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('deployment attestation component commits', () => {
  it('binds the app and AxWise root to the same clean unified commit', () => {
    const { root, app, commit } = fixture();
    expect(repositoryCommit(app, 'Orqaly')).toBe(commit);
    expect(repositoryCommit(root, 'AxWise')).toBe(commit);
  });

  it('rejects a dirty root sibling even when the Orqaly component is unchanged', () => {
    const { root, app } = fixture();
    writeFileSync(join(root, 'axwise.txt'), 'changed source');
    expect(() => repositoryCommit(app, 'Orqaly')).toThrow(/clean worktree/);
  });
});
