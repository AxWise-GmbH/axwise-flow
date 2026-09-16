import { describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import { createDesktopContextService, DESKTOP_PRODUCT_GUIDANCE } from './desktop-context-service.js';

const runId = '11111111-1111-4111-8111-111111111111';
const auth = { userId: 'user_owner' };
function fixture() {
  const make = (id, kind, payload, markdown) => {
    const artifact = { artifactId: id, kind, payload, markdown, inputHash: 'a'.repeat(64),
      contentType: markdown ? 'text/markdown' : 'application/json' };
    artifact.artifactHash = canonicalHash({ contentType: artifact.contentType, payload, markdown });
    return artifact;
  };
  const scope = make('22222222-2222-4222-8222-222222222222', 'scope',
    { objective: 'Build resilient webhook delivery', limits: ['Written output only'] }, null);
  const final = make('33333333-3333-4333-8333-333333333333', 'final_markdown', {}, '# Webhook design\n\nRetry transient failures.');
  const ref = (a) => ({ artifactId: a.artifactId, artifactHash: a.artifactHash, kind: a.kind });
  const snapshot = { run: { id: runId, ownerUserId: auth.userId, status: 'completed', finalArtifact: ref(final) },
    approvals: [{ kind: 'scope', decision: 'approved', artifact: ref(scope), inputHash: scope.inputHash }],
    stages: [{ outputArtifact: ref(scope) }, { outputArtifact: ref(final) }] };
  const service = { read: vi.fn().mockResolvedValue(snapshot), artifact: vi.fn(async (_auth, _runId, id) =>
    [scope, final].find((a) => a.artifactId === id)) };
  return { scope, final, snapshot, service, context: createDesktopContextService({ commandService: service }) };
}

describe('desktop project context', () => {
  it('carries the completed design and labels original limits as history', async () => {
    const f = fixture();
    const result = await f.context.read(auth, runId);
    expect(result.title).toBe('Webhook design');
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0].markdown).toBe(f.final.markdown);
    expect(result.historicalScope.limits).toEqual(['Written output only']);
    expect(result).not.toHaveProperty('permissions');
    expect(DESKTOP_PRODUCT_GUIDANCE).toContain('not a permanent restriction');
  });
  it('loads exact referenced artifacts on demand, including structured output', async () => {
    const f = fixture();
    const result = await f.context.artifact(auth, runId, f.scope.artifactId);
    expect(result.markdown).toContain('```json');
    expect(result.artifactHash).toBe(f.scope.artifactHash);
    await expect(f.context.artifact(auth, runId, '44444444-4444-4444-8444-444444444444')).rejects.toThrow();
  });
  it('supports a selected brief before final publication without inventing completion', async () => {
    const f = fixture(); f.snapshot.run.finalArtifact = null; f.snapshot.stages.pop();
    f.snapshot.run.status = 'awaiting_plan_approval';
    const result = await f.context.read(auth, runId);
    expect(result.status).toBe('awaiting_plan_approval');
    expect(result.artifacts.every((a) => a.markdown === null)).toBe(true);
  });
  it.each(['owner', 'run', 'approval', 'scopeHash', 'scopeInput', 'finalHash'])('rejects mismatched %s', async (what) => {
    const f = fixture();
    if (what === 'owner') f.snapshot.run.ownerUserId = 'user_other';
    if (what === 'run') f.snapshot.run.id = '44444444-4444-4444-8444-444444444444';
    if (what === 'approval') f.snapshot.approvals = [];
    if (what === 'scopeHash') f.scope.payload.objective = 'Changed';
    if (what === 'scopeInput') f.scope.inputHash = 'b'.repeat(64);
    if (what === 'finalHash') f.final.markdown += 'changed';
    await expect(f.context.read(auth, runId)).rejects.toThrow();
  });
});
