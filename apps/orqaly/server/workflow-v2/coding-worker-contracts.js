import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';

export class CodingWorkerError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export const codingHash = canonicalJsonSha256;
export const contentHash = (content) => createHash('sha256').update(content, 'utf8').digest('hex');
export const CodingScopeSchema = z.object({ tenantId: z.uuid(), userId: z.string().regex(/^user_[A-Za-z0-9]+$/), solutionId: z.uuid(), runId: z.uuid() }).strict();
export const CodingKeySchema = z.string().min(8).max(160).regex(/^[A-Za-z0-9_.:-]+$/);
export const CodingHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const CodingPathSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/).refine((path) =>
  !path.split('/').some((part) => !part || part === '.' || part === '..' || ['node_modules', '.git', '.env'].includes(part)) &&
  !path.includes('/.'));
const fileSchema = z.object({ path: CodingPathSchema, content: z.string().max(128000) }).strict();
export const CodingProposalSchema = z.object({
  kind: z.literal('node_source_patch_v1'),
  title: z.string().trim().min(1).max(120),
  source: z.array(fileSchema).min(1).max(50),
  changes: z.array(z.object({ path: CodingPathSchema, previousHash: CodingHashSchema.nullable(), content: z.string().max(128000).nullable() }).strict()).min(1).max(30),
  tests: z.array(fileSchema).min(1).max(10),
  outputs: z.array(CodingPathSchema).min(1).max(30),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
}).strict().superRefine((value, ctx) => {
  if (Buffer.byteLength(JSON.stringify(value)) > 384000 || containsSolutionBuildSecret(value))
    ctx.addIssue({ code: 'custom', message: 'Source exceeds the artifact budget or contains credential material' });
  for (const files of [value.source, value.changes, value.tests]) {
    if (new Set(files.map((file) => file.path)).size !== files.length)
      ctx.addIssue({ code: 'custom', message: 'File paths must be unique' });
    if (files.some((a) => files.some((b) => b.path.startsWith(`${a.path}/`))))
      ctx.addIssue({ code: 'custom', message: 'Files cannot also be parent directories' });
  }
  if (value.tests.some((file) => !/\.(?:mjs|cjs|js)$/.test(file.path)))
    ctx.addIssue({ code: 'custom', message: 'Approved tests must be Node JavaScript files' });
});

export function prepareCodingSpec(proposal, runtime) {
  const parsed = CodingProposalSchema.parse(proposal);
  const files = new Map(parsed.source.map((file) => [file.path, file.content]));
  for (const change of parsed.changes) {
    const previous = files.get(change.path);
    if ((previous === undefined ? null : contentHash(previous)) !== change.previousHash)
      throw new CodingWorkerError('CODING_SOURCE_VERSION_CONFLICT');
    if (change.content === null) {
      if (previous === undefined) throw new CodingWorkerError('CODING_SOURCE_VERSION_CONFLICT');
      files.delete(change.path);
    } else files.set(change.path, change.content);
  }
  const prepared = [...files].map(([path, content]) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path));
  if (prepared.some((a) => prepared.some((b) => b.path.startsWith(`${a.path}/`))))
    throw new CodingWorkerError('CODING_SOURCE_PATH_CONFLICT', 400);
  return { ...parsed, prepared, sourceHash: codingHash(parsed.source), preparedHash: codingHash(prepared),
    testsHash: codingHash(parsed.tests), command: 'node_test_v1', runtime: structuredClone(runtime),
    limits: { timeoutMs: parsed.timeoutMs, memoryMb: runtime.memoryMb || 256, memoryScope: runtime.isolation === 'cloud_run_sandbox' ? 'instance_shared' : 'container',
      cpus: 1, pids: 32, workspaceBytes: 16777216, artifactBytes: 256000, logBytes: 16000 },
    network: 'none', credentials: 'none', repositoryEffects: 'artifact_only' };
}

export function publicCodingJob(value, { includeSource = false } = {}) {
  return { id: value.id, solutionId: value.solution_id, runId: value.run_id, status: value.status, rowVersion: value.row_version,
    specHash: value.spec_hash, title: value.spec.title, runtime: value.spec.runtime, limits: value.spec.limits,
    sourceHash: value.spec.sourceHash, preparedHash: value.spec.preparedHash, testsHash: value.spec.testsHash,
    changes: value.spec.changes.map(({ path, content }) => ({ path, operation: content === null ? 'delete' : 'write' })),
    approvalId: value.approval_id, evidence: value.evidence, orchestration: value.orchestration || null, createdAt: value.created_at, updatedAt: value.updated_at,
    ...(includeSource ? { spec: value.spec, artifacts: value.artifacts } : {}) };
}
