import { execFile } from 'node:child_process';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';

const LIMIT = 24_000;
function execute(command, args, options) {
  return new Promise((resolve) => execFile(command, args, {
    encoding: 'utf8', windowsHide: true, shell: false, ...options,
  }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
}

// Keep the initial dirty state alongside the final state. This avoids presenting
// pre-existing work as a change made by this delegation. Oversize data is rejected.
export async function captureWorkspace(workspace, signal) {
  try {
    workspace = await realpath(workspace);
    const options = { cwd: workspace, signal, timeout: 5000, maxBuffer: LIMIT };
    const root = await execute('git', ['rev-parse', '--show-toplevel'], options);
    if (root.error || await realpath(root.stdout.trim()) !== await realpath(workspace)) throw new Error();
    let diff = await execute('git', ['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--'], options);
    if (diff.error) {
      const head = await execute('git', ['rev-parse', '--verify', 'HEAD'], options);
      if (!head.error) throw new Error();
      const staged = await execute('git', ['diff', '--cached', '--no-ext-diff', '--no-textconv'], options);
      const unstaged = await execute('git', ['diff', '--no-ext-diff', '--no-textconv'], options);
      if (staged.error || unstaged.error) throw new Error();
      diff = { stdout: staged.stdout + unstaged.stdout };
    }
    const untracked = await execute('git', ['ls-files', '--others', '--exclude-standard', '-z'], options);
    if (untracked.error) throw new Error();
    let text = diff.stdout;
    for (const name of untracked.stdout.split('\0').filter(Boolean)) {
      if (/(^|\/)(\.env(?:\..*)?|credentials|secrets?)(\/|$)|\.(pem|key)$/i.test(name)) throw new Error();
      const path = join(workspace, name);
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
    return { status: 'captured', text };
  } catch {
    return { status: 'unavailable', text: '' };
  }
}

export async function runVerification({ config, command, signal, timeoutMs, env }) {
  if (!command?.length) return { status: 'not_run', command: [], exitCode: null, output: '', truncated: false };
  const executable = command[0] === 'node' ? config.node : command[0];
  const result = await execute(executable, command.slice(1), {
    cwd: config.workspace, env: env ?? { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }, signal, timeout: Math.min(timeoutMs, 120_000), maxBuffer: 16_000,
  });
  const truncated = result.error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
  const exitCode = !result.error ? 0 : Number.isInteger(result.error.code) ? result.error.code : null;
  return {
    status: exitCode === 0 && !truncated ? 'passed' : 'failed', command, exitCode,
    output: (result.stdout + result.stderr).slice(0, 16_000), truncated: truncated || (result.stdout + result.stderr).length > 16_000,
  };
}
