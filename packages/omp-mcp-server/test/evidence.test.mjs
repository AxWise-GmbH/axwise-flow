import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  captureWorkspace,
  compareWorkspaceCaptures,
  runVerification,
} from '../src/evidence.mjs';

function git(workspace, args) {
  return execFileSync('git', args, { cwd: workspace });
}

async function committedWorkspace(t) {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-evidence-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  git(workspace, ['init', '-q']);
  await writeFile(join(workspace, 'edited.mjs'), 'export const edited = 1;\n');
  await writeFile(join(workspace, 'deleted.mjs'), 'export const deleted = true;\n');
  await writeFile(join(workspace, 'mode.mjs'), 'export const mode = true;\n');
  git(workspace, ['add', '.']);
  git(workspace, ['-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'commit', '-qm', 'fixture']);
  return workspace;
}

test('real Git workspace captures initial dirty state and bounded untracked changes', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-evidence-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', workspace]);
  await writeFile(join(workspace, 'feature.mjs'), 'export const value = 1;\n');
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, 'feature.mjs'), 'export const value = 2;\n');
  const after = await captureWorkspace(workspace);
  assert.equal(before.status, 'captured');
  assert.match(before.text, /value = 1/);
  assert.match(after.text, /value = 2/);
  await writeFile(join(workspace, '.env'), 'TOKEN=fixture');
  assert.equal((await captureWorkspace(workspace)).status, 'unavailable');
});

test('changed-file receipt isolates new, edited, deleted, and mode-only work from prior dirt', async (t) => {
  const workspace = await committedWorkspace(t);
  await writeFile(join(workspace, 'edited.mjs'), 'export const edited = 2;\n');
  await writeFile(join(workspace, 'existing-untracked.mjs'), 'before\n');
  await writeFile(join(workspace, 'untouched-dirty.mjs'), 'unchanged\n');
  const before = await captureWorkspace(workspace);

  await writeFile(join(workspace, 'edited.mjs'), 'export const edited = 3;\n');
  await writeFile(join(workspace, 'existing-untracked.mjs'), 'after\n');
  await writeFile(join(workspace, 'new.mjs'), 'new\n');
  await unlink(join(workspace, 'deleted.mjs'));
  await chmod(join(workspace, 'mode.mjs'), 0o755);
  const after = await captureWorkspace(workspace, undefined, before.fingerprints);

  assert.deepEqual(compareWorkspaceCaptures(before, after), {
    changedFilesStatus: 'captured',
    changedFiles: [
      { path: 'deleted.mjs', change: 'deleted' },
      { path: 'edited.mjs', change: 'edited' },
      { path: 'existing-untracked.mjs', change: 'edited' },
      { path: 'mode.mjs', change: 'edited' },
      { path: 'new.mjs', change: 'new' },
    ],
    relevantIgnoredFilesChanged: false,
  });
});

test('restored tracked files are edits and unchanged pre-existing dirt is not attributed', async (t) => {
  const workspace = await committedWorkspace(t);
  await writeFile(join(workspace, 'edited.mjs'), 'dirty before\n');
  await writeFile(join(workspace, 'untouched.mjs'), 'unchanged\n');
  const before = await captureWorkspace(workspace);
  git(workspace, ['checkout', '--', 'edited.mjs']);
  const after = await captureWorkspace(workspace, undefined, before.fingerprints);
  assert.deepEqual(compareWorkspaceCaptures(before, after), {
    changedFilesStatus: 'captured',
    changedFiles: [{ path: 'edited.mjs', change: 'edited' }],
    relevantIgnoredFilesChanged: false,
  });
});

test('unborn repositories report staged and untracked additions as new files', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-unborn-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  git(workspace, ['init', '-q']);
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, 'staged.mjs'), 'staged\n');
  await writeFile(join(workspace, 'untracked.mjs'), 'untracked\n');
  git(workspace, ['add', 'staged.mjs']);
  const after = await captureWorkspace(workspace, undefined, before.fingerprints);
  assert.deepEqual(compareWorkspaceCaptures(before, after).changedFiles, [
    { path: 'staged.mjs', change: 'new' },
    { path: 'untracked.mjs', change: 'new' },
  ]);
});

test('renames are represented as a deletion and a new file', async (t) => {
  const workspace = await committedWorkspace(t);
  const before = await captureWorkspace(workspace);
  await rename(join(workspace, 'edited.mjs'), join(workspace, 'renamed.mjs'));
  const after = await captureWorkspace(workspace, undefined, before.fingerprints);
  assert.deepEqual(compareWorkspaceCaptures(before, after).changedFiles, [
    { path: 'edited.mjs', change: 'deleted' },
    { path: 'renamed.mjs', change: 'new' },
  ]);
});

test('a commit during the task invalidates the pinned HEAD and index evidence', async (t) => {
  const workspace = await committedWorkspace(t);
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, 'edited.mjs'), 'committed during delegation\n');
  git(workspace, ['add', 'edited.mjs']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'delegated commit',
  ]);
  const after = await captureWorkspace(
    workspace,
    undefined,
    before.fingerprints,
    before.repositoryIdentity
  );
  assert.equal(after.status, 'unavailable');
  assert.equal(compareWorkspaceCaptures(before, after).changedFilesStatus, 'unavailable');
});

test('the first commit in an unborn repository cannot erase captured attribution', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-first-commit-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  git(workspace, ['init', '-q']);
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, 'first.mjs'), 'first commit\n');
  git(workspace, ['add', 'first.mjs']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'first',
  ]);
  const after = await captureWorkspace(
    workspace,
    undefined,
    before.fingerprints,
    before.repositoryIdentity
  );
  assert.equal(before.repositoryIdentity.head, null);
  assert.equal(after.status, 'unavailable');
});

test('staging during the task invalidates the pinned index evidence', async (t) => {
  const workspace = await committedWorkspace(t);
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, 'staged.mjs'), 'staged during delegation\n');
  git(workspace, ['add', 'staged.mjs']);
  const after = await captureWorkspace(
    workspace,
    undefined,
    before.fingerprints,
    before.repositoryIdentity
  );
  assert.equal(after.status, 'unavailable');
});

test('index identity supports normal repositories larger than the evidence text budget', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-large-index-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  git(workspace, ['init', '-q']);
  await mkdir(join(workspace, 'src'));
  await Promise.all(
    Array.from({ length: 400 }, (_, index) =>
      writeFile(join(workspace, 'src', `module-${index}.mjs`), `export default ${index};\n`)
    )
  );
  git(workspace, ['add', '.']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'large index fixture',
  ]);
  const capture = await captureWorkspace(workspace);
  assert.equal(capture.status, 'captured');
  assert.equal(capture.repositoryIdentity.indexHash.length, 64);
});

test('bounded ignored files are fingerprinted instead of creating a blind spot', async (t) => {
  const workspace = await committedWorkspace(t);
  await writeFile(join(workspace, '.gitignore'), 'cache/\n');
  git(workspace, ['add', '.gitignore']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'ignore cache',
  ]);
  await mkdir(join(workspace, 'cache'));
  await writeFile(join(workspace, 'cache', 'state.txt'), 'before\n');
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, 'cache', 'state.txt'), 'after\n');
  const after = await captureWorkspace(
    workspace,
    undefined,
    before.fingerprints,
    before.repositoryIdentity
  );
  assert.deepEqual(compareWorkspaceCaptures(before, after), {
    changedFilesStatus: 'captured',
    changedFiles: [{ path: 'cache/state.txt', change: 'edited' }],
    relevantIgnoredFilesChanged: true,
  });
});

test('known dependency and generated roots do not exhaust ignored-file attribution', async (t) => {
  const workspace = await committedWorkspace(t);
  const roots = [
    'node_modules',
    '.venv',
    'target',
    'dist',
    'build',
    '.next',
    '.turbo',
    '.cache',
    'coverage',
    'out',
  ];
  await writeFile(
    join(workspace, '.gitignore'),
    `${roots.map((root) => `${root}/`).join('\n')}\nprivate-state/\n`
  );
  git(workspace, ['add', '.gitignore']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'ignore generated roots',
  ]);
  for (const root of roots) {
    await mkdir(join(workspace, root), { recursive: true });
    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        writeFile(join(workspace, root, `${index}.txt`), `${index}\n`)
      )
    );
  }
  await mkdir(join(workspace, 'private-state'));
  await writeFile(join(workspace, 'private-state', 'state.txt'), 'before\n');
  const before = await captureWorkspace(workspace);
  assert.equal(before.status, 'captured');
  await writeFile(join(workspace, 'private-state', 'state.txt'), 'after\n');
  const after = await captureWorkspace(
    workspace,
    undefined,
    before.fingerprints,
    before.repositoryIdentity
  );
  const compared = compareWorkspaceCaptures(before, after);
  assert.deepEqual(compared.changedFiles, [
    { path: 'private-state/state.txt', change: 'edited' },
  ]);
  assert.equal(compared.relevantIgnoredFilesChanged, true);
});

test('a changed ignore rule cannot hide a newly ignored file', async (t) => {
  const workspace = await committedWorkspace(t);
  await writeFile(join(workspace, '.gitignore'), 'cache/\n');
  git(workspace, ['add', '.gitignore']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'initial ignore rules',
  ]);
  const before = await captureWorkspace(workspace);
  await writeFile(join(workspace, '.gitignore'), 'cache/\ngenerated/\n');
  await mkdir(join(workspace, 'generated'));
  await writeFile(join(workspace, 'generated', 'result.txt'), 'generated\n');
  const after = await captureWorkspace(
    workspace,
    undefined,
    before.fingerprints,
    before.repositoryIdentity
  );
  assert.deepEqual(compareWorkspaceCaptures(before, after).changedFiles, [
    { path: '.gitignore', change: 'edited' },
    { path: 'generated/result.txt', change: 'new' },
  ]);
});

test('too many ignored files make attribution unavailable instead of falsely empty', async (t) => {
  const workspace = await committedWorkspace(t);
  await writeFile(join(workspace, '.gitignore'), 'generated/\n');
  git(workspace, ['add', '.gitignore']);
  git(workspace, [
    '-c',
    'user.email=test@example.test',
    '-c',
    'user.name=Test',
    'commit',
    '-qm',
    'ignore generated files',
  ]);
  await mkdir(join(workspace, 'generated'));
  await Promise.all(
    Array.from({ length: 257 }, (_, index) =>
      writeFile(join(workspace, 'generated', `${index}.txt`), `${index}\n`)
    )
  );
  const capture = await captureWorkspace(workspace);
  assert.equal(capture.status, 'unavailable');
  assert.equal(
    compareWorkspaceCaptures(capture, capture).changedFilesStatus,
    'unavailable'
  );
});

test('unsafe, secret-like, symlink, and over-count workspaces fail closed', async (t) => {
  const secretWorkspace = await committedWorkspace(t);
  await writeFile(join(secretWorkspace, '.env.local'), 'TOKEN=fixture\n');
  assert.equal((await captureWorkspace(secretWorkspace)).status, 'unavailable');

  const symlinkWorkspace = await committedWorkspace(t);
  await symlink('edited.mjs', join(symlinkWorkspace, 'linked.mjs'));
  assert.equal((await captureWorkspace(symlinkWorkspace)).status, 'unavailable');

  const binaryWorkspace = await committedWorkspace(t);
  await writeFile(join(binaryWorkspace, 'binary.dat'), Buffer.from([0, 1, 2]));
  assert.equal((await captureWorkspace(binaryWorkspace)).status, 'unavailable');

  const crowdedWorkspace = await committedWorkspace(t);
  await mkdir(join(crowdedWorkspace, 'generated'));
  await Promise.all(
    Array.from({ length: 257 }, (_, index) =>
      writeFile(join(crowdedWorkspace, 'generated', `${index}.txt`), `${index}\n`)
    )
  );
  assert.equal((await captureWorkspace(crowdedWorkspace)).status, 'unavailable');
  assert.deepEqual(
    compareWorkspaceCaptures(
      { status: 'unavailable', fingerprints: [] },
      { status: 'captured', fingerprints: [] }
    ),
    {
      changedFilesStatus: 'unavailable',
      changedFiles: [],
      relevantIgnoredFilesChanged: false,
    }
  );
});

test('credential filenames and common secret content are never captured', async (t) => {
  const workspace = await committedWorkspace(t);
  for (const name of [
    '.npmrc',
    '.pypirc',
    '.netrc',
    '.git-credentials',
    'credentials.json',
    'id_rsa',
    'id_ed25519',
    'kubeconfig',
    'client.p12',
    'client.pfx',
    '.docker/config.json',
    '.kube/config',
    '.aws/credentials',
    '.aws/config',
    '.config/gcloud/application_default_credentials.json',
    '.azure/accessTokens.json',
  ]) {
    const path = join(workspace, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'credential material\n');
    assert.equal((await captureWorkspace(workspace)).status, 'unavailable', name);
    await unlink(path);
  }
  await writeFile(join(workspace, 'innocent-name.txt'), 'AWS_ACCESS_KEY_ID=AKIAABCDEFGHIJKLMNOP\n');
  assert.equal((await captureWorkspace(workspace)).status, 'unavailable');
  await writeFile(
    join(workspace, 'innocent-name.txt'),
    '-----BEGIN OPENSSH PRIVATE KEY-----\nnot-a-real-key\n'
  );
  assert.equal((await captureWorkspace(workspace)).status, 'unavailable');
});

test('verification records the actual local process outcome and never invents a test run', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-tests-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const config = { workspace, node: process.execPath };
  await writeFile(join(workspace, 'feature.test.mjs'), "import assert from 'node:assert/strict'; import test from 'node:test'; test('fixture', () => assert.equal(2+2, 4));\n");
  const passed = await runVerification({ config, command: ['node', '--test', 'feature.test.mjs'], timeoutMs: 5000 });
  assert.equal(passed.status, 'passed');
  assert.equal(passed.exitCode, 0);
  assert.match(passed.output, /pass 1/);
  assert.equal((await runVerification({ config })).status, 'not_run');
});

test('verification redacts sensitive process output and cannot pass', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-redaction-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const config = { workspace, node: process.execPath };
  const value = await runVerification({
    config,
    command: ['node', '-e', "console.log('AKIA' + 'ABCDEFGHIJKLMNOP')"],
    timeoutMs: 5000,
  });
  assert.equal(value.status, 'failed');
  assert.equal(value.reason, 'sensitive_output');
  assert.equal(value.redacted, true);
  assert.match(value.output, /REDACTED/);
  assert.equal(JSON.stringify(value).includes('AKIAABCDEFGHIJKLMNOP'), false);
});

test('verification does not execute or return a sensitive command argv', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'orqanix-command-redaction-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const config = { workspace, node: process.execPath };
  const value = await runVerification({
    config,
    command: ['node', '-e', "console.log('AKIAABCDEFGHIJKLMNOP')"],
    timeoutMs: 5000,
  });
  assert.equal(value.status, 'failed');
  assert.equal(value.reason, 'sensitive_command');
  assert.equal(value.redacted, true);
  assert.equal(JSON.stringify(value).includes('AKIAABCDEFGHIJKLMNOP'), false);
});
