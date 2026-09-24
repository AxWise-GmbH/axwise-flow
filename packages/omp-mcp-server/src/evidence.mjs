import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { relative, isAbsolute, posix, resolve } from 'node:path';

const LIMIT = 24_000;
const MAX_CHANGED_FILES = 256;
const MAX_PATH_BYTES = 65_536;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_INDEX_IDENTITY_BYTES = 8 * 1024 * 1024;
const SECRET_PATH = [
  /(^|\/)(?:\.env(?:\..*)?|credentials?(?:\.json)?|secrets?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|id_rsa|id_ed25519)(?:\/|$)/i,
  /(^|\/)\.docker\/config\.json$/i,
  /(^|\/)(?:kubeconfig|\.kube\/config)$/i,
  /(^|\/)\.aws\/(?:credentials|config)$/i,
  /(^|\/)(?:application_default_credentials|google-application-credentials|service-account(?:-[^/]*)?)\.json$/i,
  /(^|\/)\.config\/gcloud\/application_default_credentials\.json$/i,
  /(^|\/)\.azure\/(?:accessTokens|azureProfile)\.json$/i,
  /(^|\/)\.config\/(?:gh\/hosts\.yml|glab-cli\/config\.yml)$/i,
  /\.(?:pem|key|p12|pfx)$/i,
];
const GENERATED_IGNORED_ROOTS = [
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
const SECRET_CONTENT = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,255}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,255}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/,
  /(?:^|[\n,{])\s*["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i,
];
function execute(command, args, options) {
  return new Promise((resolve) => execFile(command, args, {
    encoding: 'utf8', windowsHide: true, shell: false, ...options,
  }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
}

function safeRelativePath(workspace, name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\0') ||
    name.includes('\ufffd') ||
    isAbsolute(name) ||
    posix.normalize(name) !== name ||
    name.split('/').some((part) => !part || part === '.' || part === '..') ||
    Buffer.byteLength(name, 'utf8') > 1_024 ||
    SECRET_PATH.some((pattern) => pattern.test(name))
  ) {
    throw new Error('Unsafe Git path.');
  }
  const absolute = resolve(workspace, name);
  const rel = relative(workspace, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path escapes workspace.');
  return absolute;
}

export function containsSensitiveContent(value) {
  if (Buffer.isBuffer(value)) {
    return SECRET_CONTENT.some((pattern) => pattern.test(value.toString('utf8')));
  }
  if (typeof value === 'string') {
    return SECRET_CONTENT.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) return value.some((item) => containsSensitiveContent(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => {
      if (
        typeof item === 'string' &&
        /^(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)$/i.test(key) &&
        item.length >= 16 &&
        !/\s/.test(item)
      ) {
        return true;
      }
      return containsSensitiveContent(item);
    });
  }
  return false;
}

function parseNameStatus(value) {
  const fields = value.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0) throw new Error('Invalid Git name-status output.');
  const entries = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (!/^[ACDMTUXB]$/.test(status)) throw new Error('Unsupported Git status.');
    entries.push({ path, tracked: true, status });
  }
  return entries;
}

function parseUntracked(value) {
  const paths = value.split('\0').filter(Boolean);
  return paths.map((path) => ({ path, tracked: false, status: '?' }));
}

async function fingerprintPath(workspace, entry) {
  const path = safeRelativePath(workspace, entry.path);
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ...entry, exists: false, fingerprint: 'missing' };
    }
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_FILE_BYTES) {
    throw new Error('Changed path is not a bounded regular file.');
  }
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    const current = await lstat(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino ||
      opened.size > MAX_FILE_BYTES
    ) {
      throw new Error('Changed path changed identity during capture.');
    }
    const content = await handle.readFile();
    const final = await handle.stat();
    if (
      content.length > MAX_FILE_BYTES ||
      final.size !== opened.size ||
      final.mtimeMs !== opened.mtimeMs ||
      content.includes(0) ||
      containsSensitiveContent(content)
    ) {
      throw new Error('Changed path is unstable, oversized, or binary.');
    }
    const digest = createHash('sha256')
      .update(String(final.mode & 0o7777))
      .update('\0')
      .update(content)
      .digest('hex');
    return { ...entry, exists: true, fingerprint: digest };
  } finally {
    await handle.close();
  }
}

async function gitEntries(workspace, options) {
  let names = await execute(
    'git',
    ['diff', '--name-status', '-z', '--no-renames', 'HEAD', '--'],
    options
  );
  if (names.error) {
    const head = await execute('git', ['rev-parse', '--verify', 'HEAD'], options);
    if (!head.error) throw new Error('Git name-status failed.');
    names = await execute(
      'git',
      ['diff', '--cached', '--name-status', '-z', '--no-renames', '--'],
      options
    );
    if (names.error) throw new Error('Unborn Git name-status failed.');
  }
  const untracked = await execute(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    options
  );
  if (untracked.error) throw new Error('Git untracked listing failed.');
  const ignored = await execute(
    'git',
    [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '-z',
      '--',
      '.',
      ...GENERATED_IGNORED_ROOTS.flatMap((root) => [
        `:(exclude,glob)${root}/**`,
        `:(exclude,glob)**/${root}/**`,
      ]),
    ],
    options
  );
  if (ignored.error) throw new Error('Git ignored listing failed.');
  return [
    ...parseNameStatus(names.stdout),
    ...parseUntracked(untracked.stdout),
    ...parseUntracked(ignored.stdout).map((entry) => ({ ...entry, ignored: true, status: '!' })),
  ];
}

async function repositoryIdentity(options) {
  const head = await execute('git', ['rev-parse', '--verify', 'HEAD'], options);
  const index = await execute('git', ['ls-files', '--stage', '-z'], {
    ...options,
    maxBuffer: MAX_INDEX_IDENTITY_BYTES,
  });
  if (index.error) throw new Error('Git index identity is unavailable.');
  return {
    head: head.error ? null : head.stdout.trim(),
    indexHash: createHash('sha256').update(index.stdout).digest('hex'),
  };
}

function sameRepositoryIdentity(left, right) {
  return left?.head === right?.head && left?.indexHash === right?.indexHash;
}

// Keep the initial dirty state alongside the final state. This avoids presenting
// pre-existing work as a change made by this delegation. Oversize data is rejected.
export async function captureWorkspace(
  workspace,
  signal,
  retainPaths = [],
  expectedRepositoryIdentity
) {
  try {
    workspace = await realpath(workspace);
    const options = { cwd: workspace, signal, timeout: 5000, maxBuffer: LIMIT };
    const root = await execute('git', ['rev-parse', '--show-toplevel'], options);
    if (root.error || await realpath(root.stdout.trim()) !== await realpath(workspace)) throw new Error();
    const initialRepositoryIdentity = await repositoryIdentity(options);
    if (
      expectedRepositoryIdentity &&
      !sameRepositoryIdentity(initialRepositoryIdentity, expectedRepositoryIdentity)
    ) {
      throw new Error('Git HEAD or index changed during the delegated edit.');
    }
    let diff = await execute('git', ['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--'], options);
    if (diff.error) {
      const head = await execute('git', ['rev-parse', '--verify', 'HEAD'], options);
      if (!head.error) throw new Error();
      const staged = await execute('git', ['diff', '--cached', '--no-ext-diff', '--no-textconv'], options);
      const unstaged = await execute('git', ['diff', '--no-ext-diff', '--no-textconv'], options);
      if (staged.error || unstaged.error) throw new Error();
      diff = { stdout: staged.stdout + unstaged.stdout };
    }
    if (containsSensitiveContent(diff.stdout)) throw new Error();
    const entries = await gitEntries(workspace, options);
    const retained = new Map();
    for (const entry of retainPaths) {
      if (!entry || typeof entry !== 'object') throw new Error();
      retained.set(entry.path, {
        path: entry.path,
        tracked: Boolean(entry.tracked),
        ignored: Boolean(entry.ignored),
        status: 'clean',
      });
    }
    for (const entry of entries) retained.set(entry.path, entry);
    if (retained.size > MAX_CHANGED_FILES) throw new Error();
    const pathBytes = [...retained.keys()].reduce(
      (total, name) => total + Buffer.byteLength(name, 'utf8'),
      0
    );
    if (pathBytes > MAX_PATH_BYTES) throw new Error();
    const fingerprints = [];
    for (const entry of [...retained.values()].sort((a, b) => a.path.localeCompare(b.path))) {
      fingerprints.push(await fingerprintPath(workspace, entry));
    }
    let text = diff.stdout;
    for (const { path: name, tracked, ignored } of entries) {
      if (tracked || ignored) continue;
      const path = safeRelativePath(workspace, name);
      const rel = relative(workspace, await realpath(path));
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error();
      const meta = await lstat(path);
      if (!meta.isFile() || meta.isSymbolicLink() || meta.size > LIMIT) throw new Error();
      const content = await readFile(path);
      if (content.includes(0)) throw new Error();
      text += `\nUntracked file: ${JSON.stringify(name)}\n${content.toString('utf8')}\n`;
      if (Buffer.byteLength(text) > LIMIT) throw new Error();
    }
    if (Buffer.byteLength(text) > LIMIT) throw new Error();
    const finalRepositoryIdentity = await repositoryIdentity(options);
    if (!sameRepositoryIdentity(initialRepositoryIdentity, finalRepositoryIdentity)) {
      throw new Error('Git HEAD or index changed during evidence capture.');
    }
    return {
      status: 'captured',
      text,
      fingerprints,
      repositoryIdentity: finalRepositoryIdentity,
    };
  } catch {
    return { status: 'unavailable', text: '', fingerprints: [], repositoryIdentity: null };
  }
}

export function compareWorkspaceCaptures(before, after) {
  if (before?.status !== 'captured' || after?.status !== 'captured') {
    return {
      changedFilesStatus: 'unavailable',
      changedFiles: [],
      relevantIgnoredFilesChanged: false,
    };
  }
  const initial = new Map(before.fingerprints.map((entry) => [entry.path, entry]));
  const final = new Map(after.fingerprints.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...initial.keys(), ...final.keys()])].sort((a, b) =>
    a.localeCompare(b)
  );
  const changedFiles = [];
  let relevantIgnoredFilesChanged = false;
  for (const path of paths) {
    const oldEntry = initial.get(path);
    const newEntry = final.get(path);
    const beforeFingerprint = oldEntry?.fingerprint ?? null;
    const afterFingerprint = newEntry?.fingerprint ?? null;
    if (beforeFingerprint === afterFingerprint) continue;
    if (oldEntry?.ignored || newEntry?.ignored) relevantIgnoredFilesChanged = true;
    let change;
    if (!newEntry?.exists) change = 'deleted';
    else if (!oldEntry && (!newEntry.tracked || newEntry.status === 'A')) change = 'new';
    else change = 'edited';
    changedFiles.push({ path, change });
  }
  return { changedFilesStatus: 'captured', changedFiles, relevantIgnoredFilesChanged };
}

export async function runVerification({ config, command, signal, timeoutMs, env }) {
  if (!command?.length) return { status: 'not_run', command: [], exitCode: null, output: '', truncated: false };
  if (containsSensitiveContent(command)) {
    return {
      status: 'failed',
      command: ['[REDACTED: sensitive test command]'],
      exitCode: null,
      output: '',
      truncated: false,
      reason: 'sensitive_command',
      redacted: true,
    };
  }
  const executable = command[0] === 'node' ? config.node : command[0];
  const result = await execute(executable, command.slice(1), {
    cwd: config.workspace, env: env ?? { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, signal, timeout: Math.min(timeoutMs, 120_000), maxBuffer: 16_000,
  });
  const truncated = result.error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
  const exitCode = !result.error ? 0 : Number.isInteger(result.error.code) ? result.error.code : null;
  const combinedOutput = result.stdout + result.stderr;
  if (containsSensitiveContent(combinedOutput)) {
    return {
      status: 'failed',
      command,
      exitCode,
      output: '[REDACTED: sensitive test output]',
      truncated,
      reason: 'sensitive_output',
      redacted: true,
    };
  }
  return {
    status: exitCode === 0 && !truncated ? 'passed' : 'failed', command, exitCode,
    output: combinedOutput.slice(0, 16_000), truncated: truncated || combinedOutput.length > 16_000,
  };
}
