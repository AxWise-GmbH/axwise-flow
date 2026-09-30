/**
 * Experimental, unintegrated engineering helpers. Disabled by default.
 * Text/regex heuristics are not AST search or an LSP. The edit helper performs
 * optimistic conflict checks and optional tests; it does not auto-repair code.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile, unlink, lstat } from 'node:fs/promises';
import { readFileSync, lstatSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { evaluateArtifactSafetyWithJev } from './jev-loop-router.mjs';

export const FEATURE_FLAG = 'GOOSE_NATIVE_GEMS';
export function isNativeGemsEnabled(env = process.env) {
  return env[FEATURE_FLAG] === 'true' || env[FEATURE_FLAG] === '1';
}

/** Search literal token occurrences, including comments and strings; not syntax matching. */
export function searchTokenOccurrences({ code, pattern, language = 'javascript' }) {
  if (typeof code !== 'string' || typeof pattern !== 'string') return [];
  const tokens = pattern.trim().split(/(\$\$\$\w+|\s+|[(){}[\];,.<>=!+\-*/&|:?])/g).filter((token) => token?.trim());
  const keywords = new Set(['function', 'class', 'const', 'let', 'var', 'async', 'export', 'import', 'from', 'return']);
  const identifier = (token) => !token.startsWith('$$$') && /^[a-zA-Z_$][\w$]*$/.test(token);
  const headToken = tokens.find((token) => identifier(token) && !keywords.has(token)) || tokens.find(identifier);
  if (!headToken) return [];
  const escaped = headToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
  const lines = code.split('\n');
  return lines.flatMap((line, index) => tokenPattern.test(line) ? [{
    line: index + 1, snippet: line.trim(), context: lines.slice(index, index + 8).join('\n').slice(0, 300),
    symbol: headToken, language, matchType: 'text_token',
  }] : []);
}

/** @deprecated Compatibility alias only. Use searchTokenOccurrences; no AST is built. */
export const astSearch = searchTokenOccurrences;

export function computeLineHash(line) {
  return createHash('sha256').update((line ?? '').replace(/\r$/, '')).digest('hex').slice(0, 6);
}

export function formatHashlines(content) {
  return typeof content === 'string'
    ? content.split('\n').map((text, index) => ({ line: index + 1, hash: computeLineHash(text), text })) : [];
}

/** Require valid line numbers and both range anchors before applying an in-memory edit. */
export function applyHashlineEdit({ content, startLine, startHash, endLine, endHash, replacement } = {}) {
  const rejected = (error, message) => ({ success: false, error, message });
  if (typeof content !== 'string' || typeof replacement !== 'string') return rejected('INVALID_EDIT', 'Content and replacement must be text');
  const lines = content.split('\n');
  const lastLine = endLine ?? startLine;
  if (!Number.isInteger(startLine) || !Number.isInteger(lastLine) || startLine < 1 || lastLine < startLine || lastLine > lines.length) {
    return rejected('OUT_OF_BOUNDS', 'Line range must use in-bounds integers');
  }
  const hashPattern = /^[0-9a-f]{6}$/i;
  if (typeof startHash !== 'string' || !hashPattern.test(startHash) ||
      (lastLine !== startLine && (typeof endHash !== 'string' || !hashPattern.test(endHash))) ||
      (endHash !== undefined && (typeof endHash !== 'string' || !hashPattern.test(endHash)))) {
    return rejected('INVALID_ANCHOR', 'A six-character hash is required for each end of the edited range');
  }
  for (const [line, expectedHash] of [[startLine, startHash], [lastLine, endHash ?? startHash]]) {
    const actualHash = computeLineHash(lines[line - 1]);
    if (actualHash !== expectedHash.toLowerCase()) return {
      ...rejected('HASHLINE_ANCHOR_MISMATCH', `Anchor mismatch at line ${line}`), line, expectedHash, actualHash,
    };
  }
  const inserted = replacement ? replacement.split('\n') : [];
  return { success: true, content: [...lines.slice(0, startLine - 1), ...inserted, ...lines.slice(lastLine)].join('\n'),
    linesModified: lastLine - startLine + 1, linesInserted: inserted.length };
}

/** Regex hints only: not a compiler, reference engine, or syntax/semantic diagnostic service. */
export function inspectSourceHeuristically({ code } = {}) {
  const result = { method: 'regex_heuristic', symbols: [], diagnostics: [],
    capabilities: { syntaxValidation: false, referenceResolution: false, languageServer: false } };
  if (typeof code !== 'string') return result;
  const functionPattern = /\b(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/;
  const classPattern = /\bclass\s+([a-zA-Z_$][\w$]*)/;
  const arrowPattern = /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>/;
  code.split('\n').forEach((line, index) => {
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
    const classMatch = line.match(classPattern);
    const match = classMatch || line.match(functionPattern) || line.match(arrowPattern);
    if (match) result.symbols.push({ name: match[1], kind: classMatch ? 'class' : 'function', line: index + 1, hash: computeLineHash(line) });
    if (line.includes('console.log')) result.diagnostics.push({ line: index + 1, severity: 'hint', message: 'console.log occurrence (heuristic)' });
  });
  return result;
}

/** @deprecated Compatibility alias. This does not communicate with an LSP. */
export const lspQuery = inspectSourceHeuristically;

function runCommand(command, cwd, timeoutMs) {
  return new Promise((done) => {
    const file = typeof command === 'string' ? 'sh' : command.file;
    const args = typeof command === 'string' ? ['-c', command] : command.args ?? [];
    execFile(file, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      done({ exitCode: error ? error.code ?? 1 : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

const editsInProgress = new Set();
const MAX_EDIT_BYTES = 2 * 1024 * 1024;
async function snapshot(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > MAX_EDIT_BYTES) throw new Error('UNSUPPORTED_FILE');
  const bytes = await readFile(path);
  if (bytes.length > MAX_EDIT_BYTES || !Buffer.from(bytes.toString('utf8')).equals(bytes) || bytes.includes(0)) throw new Error('UNSUPPORTED_FILE');
  return { content: bytes.toString('utf8'), dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777 };
}

async function replaceIfUnchanged(path, expected, content) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: expected.mode });
    // Check after all asynchronous safety/temporary-file work, with no JS await
    // between the conflict check and replacement. Uncooperative external writers
    // can still race: this is optimistic protection, not a cross-process CAS.
    const current = lstatSync(path);
    if (!current.isFile() || current.dev !== expected.dev || current.ino !== expected.ino ||
        current.size > MAX_EDIT_BYTES || readFileSync(path, 'utf8') !== expected.content) return false;
    renameSync(temporary, path);
    return true;
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

/**
 * Experimental edit + optional tests. Not registered with the desktop runtime.
 * Disabled unless explicitly enabled. Dry runs/untested edits are never verified.
 * Failure rollback occurs only while the written candidate is still unchanged.
 * Remote safety inspection requires a separate explicit opt-in.
 */
export async function safeEditAndTest({ filePath, hashlineEdit, testCommand, cwd = process.cwd(),
  apiKey = process.env.TYPESAFE_API_KEY, dryRun = false, env = process.env,
  remoteSafety = env.AXWISE_REMOTE_ARTIFACT_SAFETY === 'true', safetyEvaluator,
  testTimeoutMs = 15000 } = {}) {
  const result = (status, phase, details = {}) => ({ status, phase, verified: false, ...details });
  if (!isNativeGemsEnabled(env)) return result('disabled', 'configuration');
  if (typeof filePath !== 'string' || !filePath || !hashlineEdit || typeof hashlineEdit !== 'object') return result('rejected', 'edit', { error: 'INVALID_EDIT' });
  if (testCommand !== undefined && !(typeof testCommand === 'string' && testCommand.trim()) &&
      !(testCommand && typeof testCommand.file === 'string' && testCommand.file &&
        (testCommand.args === undefined || (Array.isArray(testCommand.args) && testCommand.args.every((arg) => typeof arg === 'string'))))) {
    return result('rejected', 'test', { error: 'INVALID_TEST_COMMAND' });
  }
  if (!Number.isInteger(testTimeoutMs) || testTimeoutMs < 1 || testTimeoutMs > 60000) return result('rejected', 'test', { error: 'INVALID_TEST_TIMEOUT' });
  const path = resolve(filePath);
  if (editsInProgress.has(path)) return result('rejected', 'edit', { error: 'FILE_EDIT_IN_PROGRESS' });
  editsInProgress.add(path);
  try {
    const original = await snapshot(path);
    const edit = applyHashlineEdit({ ...hashlineEdit, content: original.content });
    if (!edit.success) return result('rejected', 'edit', { error: edit.error, message: edit.message });
    if (Buffer.byteLength(edit.content, 'utf8') > MAX_EDIT_BYTES) return result('rejected', 'edit', { error: 'EDIT_TOO_LARGE' });
    let safety = { evaluated: false, status: 'not_evaluated', passed: null, reason: 'REMOTE_CHECK_NOT_ENABLED' };
    const evaluate = safetyEvaluator ?? (remoteSafety ? evaluateArtifactSafetyWithJev : null);
    if (evaluate) {
      try { safety = await evaluate({ content: edit.content, apiKey }); }
      catch { safety = { evaluated: false, status: 'not_evaluated', passed: null, reason: 'SAFETY_UNAVAILABLE' }; }
    }
    if (safety?.passed === false || safety?.status === 'failed') return result('blocked', 'safety', { safety });
    if (!safety || safety.evaluated !== true || safety.passed !== true) safety = {
      ...safety, evaluated: false, status: 'not_evaluated', passed: null,
    };
    const details = { linesModified: edit.linesModified, safety };
    if (dryRun) return result('preview', 'dry_run', { ...details, proposedContent: edit.content });
    if (!(await replaceIfUnchanged(path, original, edit.content))) return result('rejected', 'edit', { ...details, error: 'FILE_CHANGED' });
    const edited = await snapshot(path);
    if (edited.content !== edit.content) return result('rejected', 'edit', { ...details, error: 'FILE_CHANGED' });
    if (!testCommand) return result('applied', 'complete', { ...details, tests: 'not_run' });
    const tests = await runCommand(testCommand, cwd, testTimeoutMs);
    const testDetails = { ...details, exitCode: tests.exitCode, stdout: tests.stdout.slice(-2000), stderr: tests.stderr.slice(-2000) };
    if (tests.exitCode !== 0) {
      let rollback;
      try { rollback = await replaceIfUnchanged(path, edited, original.content) ? 'restored' : 'skipped_file_changed'; }
      catch { rollback = 'failed'; }
      return result('test_failed', 'test', { ...testDetails, rollback });
    }
    const afterTests = await snapshot(path);
    if (afterTests.content !== edit.content || afterTests.dev !== edited.dev || afterTests.ino !== edited.ino) {
      return result('rejected', 'test', { ...testDetails, error: 'FILE_CHANGED' });
    }
    return result('passed', 'complete', { ...testDetails, verified: true, tests: 'passed' });
  } catch (error) {
    return result('error', 'filesystem', { error: error.code || (error.message === 'UNSUPPORTED_FILE' ? error.message : 'FILE_OPERATION_FAILED') });
  } finally { editsInProgress.delete(path); }
}
