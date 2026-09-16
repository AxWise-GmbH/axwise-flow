import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';

// Release archives may contain the entire monorepo, not just the Orqaly app.
export const GIT_SOURCE_MAX_BUFFER = 1024 * 1024 * 1024;

export function gitSourceRoot(repository, { run = execFileSync } = {}) {
  const root = resolve(run('git', ['-C', repository, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim());
  const subdirectory = relative(root, resolve(repository));
  if (subdirectory === '..' || subdirectory.startsWith(`..${sep}`)) {
    throw new Error('source directory must be inside its Git worktree');
  }
  return root;
}

export function assertCleanGitSource(repository, {
  expectedCommit,
  label = 'Source',
  run = execFileSync,
} = {}) {
  const root = gitSourceRoot(repository, { run });
  // Check the complete worktree: a clean app must not conceal dirty siblings.
  const status = run('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8',
    maxBuffer: GIT_SOURCE_MAX_BUFFER,
  });
  if (status.trim()) {
    throw new Error(`${label} release evidence requires a clean worktree with no tracked or untracked files`);
  }
  const commit = run('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (expectedCommit !== undefined && commit !== expectedCommit) {
    throw new Error(`${label} HEAD changed before attestation`);
  }
  return { root, commit };
}

export function readGitSourceFile(repository, path, { run = execFileSync } = {}) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') ||
      path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('source file must be a relative path inside the component');
  }
  run('git', ['--literal-pathspecs', '-C', repository, 'ls-files', '--error-unmatch', '--', path], {
    encoding: 'utf8',
  });
  // The explicit ./ makes the object path relative to -C, including apps/orqaly.
  return run('git', ['-C', repository, 'show', `HEAD:./${path}`], {
    encoding: 'utf8',
    maxBuffer: GIT_SOURCE_MAX_BUFFER,
  });
}

export function archiveGitSource(repository, { commit = 'HEAD', run = execFileSync } = {}) {
  if (commit !== 'HEAD' && !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('source archive requires HEAD or an exact commit');
  }
  // Git archives from -C's subtree with app-relative names and commit timestamps.
  return run('git', ['-C', repository, 'archive', '--format=tar', commit], {
    encoding: null,
    maxBuffer: GIT_SOURCE_MAX_BUFFER,
  });
}

export function assertExternalGitOutput(output, repositories, { run = execFileSync } = {}) {
  // Resolve the existing parent to prevent an output-directory symlink from
  // placing evidence inside the clean worktree under an apparently external path.
  const target = resolve(realpathSync(dirname(resolve(output))), basename(output));
  for (const repository of repositories) {
    const root = gitSourceRoot(repository, { run });
    if (target === root || target.startsWith(`${root}${sep}`)) {
      throw new Error('release evidence output must be outside the clean Git worktrees');
    }
  }
}
