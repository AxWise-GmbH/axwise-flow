import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open, link, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const ACCOUNT = /^[a-f0-9]{64}$/;
const CONVERSATION = /^[A-Za-z0-9_-]{1,128}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const LIMIT = 1_048_576;
const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export class StateError extends Error {
  constructor(code = 'STATE_UNAVAILABLE') {
    super(code === 'ARTIFACT_REFERENCE_INVALID'
      ? 'Use a valid saved artifact reference from this account and conversation. No document was opened or inferred.'
      : 'The private local Axwise state could not be accessed. No artifact was published.');
    this.code = code;
  }
}

function scope({ stateDir, accountHash, conversationId, operationId }) {
  if (!isAbsolute(stateDir || '') || !ACCOUNT.test(accountHash || '')
    || !CONVERSATION.test(conversationId || '') || !UUID.test(operationId || '')) throw new StateError();
}

/** Caller-owned directory only. Model input never supplies a path. */
export async function scopedDirectory(options, create = true) {
  scope(options);
  const { stateDir, accountHash, conversationId } = options;
  if (create) await mkdir(stateDir, { recursive: true, mode: 0o700 });
  if (!(await lstat(stateDir)).isDirectory()) throw new StateError();
  let path = await realpath(stateDir);
  for (const part of [accountHash, conversationId]) {
    path = join(path, part);
    if (create) await mkdir(path, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    if (!(await lstat(path)).isDirectory()) throw new StateError();
  }
  return path;
}

export async function atomicPrivateFile(directory, name, record, signal,
  write = async (file, bytes) => { await file.writeFile(bytes); await file.sync(); }, rawText = false) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..') throw new StateError();
  const bytes = rawText ? record : `${JSON.stringify(record, null, 2)}\n`;
  if (typeof bytes !== 'string') throw new StateError();
  if (Buffer.byteLength(bytes) > LIMIT) throw new StateError();
  signal.throwIfAborted();
  const temporary = join(directory, `.${randomUUID()}.tmp`), path = join(directory, name);
  const file = await open(temporary, 'wx', 0o600);
  try {
    await write(file, bytes);
    await file.close();
    signal.throwIfAborted();
    await link(temporary, path);
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return { path, sha256: digest(bytes), bytes: Buffer.byteLength(bytes) };
}

/** Immutable numbered snapshots are not completed artifacts and never auto-resume. */
export async function createJournal(options, signal) {
  const root = await scopedDirectory(options);
  const operations = join(root, '.operations');
  await mkdir(operations, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  if (!(await lstat(operations)).isDirectory()) throw new StateError();
  const directory = join(operations, options.operationId);
  await mkdir(directory, { mode: 0o700 });
  let sequence = 0;
  return async (stage, data, snapshotSignal = signal) => {
    if (sequence >= 20 || !/^[a-z_]{1,40}$/.test(stage)) throw new StateError();
    await atomicPrivateFile(directory, `${String(sequence++).padStart(2, '0')}-${stage}.json`, {
      version: 'axwise.local-stage.v1', pipelineVersion: 'axwise.local-staged.v1', operationId: options.operationId,
      accountHash: options.accountHash, conversationId: options.conversationId,
      stage, createdAt: new Date().toISOString(), data,
    }, snapshotSignal);
  };
}

/** Only frozen, previously accepted analysis in this exact host scope may be reused. */
export async function resolveAnalysisReference(options, reference, signal) {
  const saved = await resolveArtifactReference(options, reference, signal);
  if (saved.tool !== 'analyze_interviews' || saved.qualityReview?.passed !== true)
    throw new StateError('ARTIFACT_REFERENCE_INVALID');
  return { input: saved.input, candidate: saved.candidate, artifact: saved.artifact, reference: saved.reference };
}

/** Exact same-account/conversation reference, never a caller-supplied filesystem path. */
export async function resolveArtifactReference(options, reference, signal) {
  try {
    if (!object(reference) || Object.keys(reference).sort().join(',') !== 'operationId,sha256'
      || !UUID.test(reference.operationId || '') || !ACCOUNT.test(reference.sha256 || '')) throw new StateError();
    const directory = await scopedDirectory({ ...options, operationId: reference.operationId }, false);
    const before = await lstat(directory);
    const path = join(directory, `${reference.operationId}.json`);
    signal.throwIfAborted();
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let bytes;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size < 1 || info.size > LIMIT) throw new StateError();
      // Do not trust stat alone: another writer could grow a file after open.
      const buffer = Buffer.alloc(LIMIT + 1); let count = 0;
      while (count < buffer.length) {
        signal.throwIfAborted();
        const read = await file.read(buffer, count, buffer.length - count, null);
        if (!read.bytesRead) break;
        count += read.bytesRead;
      }
      if (count > LIMIT) throw new StateError();
      bytes = buffer.subarray(0, count).toString('utf8');
    } finally { await file.close(); }
    const after = await lstat(directory);
    if (!after.isDirectory() || before.ino !== after.ino || before.dev !== after.dev
      || digest(bytes) !== reference.sha256) throw new StateError();
    const record = JSON.parse(bytes);
    if (!object(record) || record.version !== 'axwise.local-artifact.v2'
      || !['create_prd', 'analyze_interviews', 'simulate_interviews', 'prepare_discovery', 'generate_personas', 'chat_with_persona', 'research_market', 'create_delivery_brief'].includes(record.tool)
      || record.operationId !== reference.operationId || record.accountHash !== options.accountHash
      || record.conversationId !== options.conversationId || record.validation?.valid !== true
      || (record.tool !== 'simulate_interviews' && record.qualityReview?.passed !== true) || !object(record.selectedInput)
      || record.inputSha256 !== digest(record.selectedInput) || !object(record.artifact)
      || record.artifactSha256 !== digest(record.artifact)
      || (record.resolvedInput !== undefined && (!object(record.resolvedInput) || record.resolvedInputSha256 !== digest(record.resolvedInput)))
      || !(typeof record.candidate === 'string' || object(record.candidate))) throw new StateError();
    signal.throwIfAborted();
    const resultArtifact = record.resultArtifact;
    if (resultArtifact && (!object(resultArtifact) || !['orqanix.result.v1', 'axwise.result.v1'].includes(resultArtifact.schemaVersion)
      || !UUID.test(resultArtifact.artifactId || '') || resultArtifact.revisionId !== record.operationId
      || resultArtifact.path !== join(directory, `${record.operationId}.md`)
      || resultArtifact.sha256 !== digest(record.markdown))) throw new StateError();
    if (resultArtifact) {
      const markdownFile = await open(resultArtifact.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const info = await markdownFile.stat();
        if (!info.isFile() || info.size < 1 || info.size > LIMIT) throw new StateError();
        const buffer = Buffer.alloc(LIMIT + 1); let count = 0;
        while (count < buffer.length) {
          signal.throwIfAborted();
          const read = await markdownFile.read(buffer, count, buffer.length - count, null);
          if (!read.bytesRead) break;
          count += read.bytesRead;
        }
        if (count > LIMIT || digest(buffer.subarray(0, count).toString('utf8')) !== resultArtifact.sha256)
          throw new StateError();
      } finally { await markdownFile.close(); }
      const finalDirectory = await lstat(directory);
      if (!finalDirectory.isDirectory() || before.ino !== finalDirectory.ino || before.dev !== finalDirectory.dev) throw new StateError();
    }
    return { input: record.resolvedInput ?? record.selectedInput, candidate: record.candidate, artifact: record.artifact,
      reference: { ...reference }, tool: record.tool, markdown: record.markdown,
      qualityReview: record.qualityReview, resultArtifact: resultArtifact ?? null };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new StateError('ARTIFACT_REFERENCE_INVALID');
  }
}
