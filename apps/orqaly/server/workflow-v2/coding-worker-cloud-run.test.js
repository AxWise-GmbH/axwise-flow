// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCloudRunCodingSandbox, cloudRunSandboxStartArgs } from './coding-worker-cloud-run.js';
import { prepareCodingSpec, codingHash } from './coding-worker-contracts.js';

const image = `sha256:${'a'.repeat(64)}`;
const scope = { tenantId: randomUUID(), userId: 'user_scopedFixture', solutionId: randomUUID(), runId: randomUUID() };
function job(sandbox) {
  const spec = prepareCodingSpec({ kind: 'node_source_patch_v1', title: 'Scoped unit fixture', source: [{ path: 'a.mjs', content: 'x' }],
    changes: [{ path: 'b.mjs', previousHash: null, content: 'y' }], tests: [{ path: 'check.mjs', content: 'x' }], outputs: ['b.mjs'], timeoutMs: 1000 }, sandbox.descriptor);
  return { id: randomUUID(), execution_id: randomUUID(), spec, spec_hash: codingHash(spec) };
}
describe('Cloud Run sandbox controller identity and cleanup', () => {
  it('mounts only pristine root and exact workspace/read-only tests, with no inherited network or env', () => {
    const args = cloudRunSandboxStartArgs({ name: 'unit-job', directory: '/tmp/unit-exact-job' });
    expect(args).toContain('/opt/coding-rootfs'); expect(args).not.toContain('--allow-egress'); expect(args).not.toContain('--write');
    expect(args.filter(x => x.startsWith('type=bind'))).toEqual(['type=bind,source=/tmp/unit-exact-job/workspace,destination=/workspace', 'type=bind,source=/tmp/unit-exact-job/tests,destination=/approved-tests,readonly']);
    expect(args).toContain('PATH=/usr/local/bin:/usr/bin:/bin,HOME=/tmp,NODE_ENV=test');
  });
  it('never treats absence in a different/fresh instance as removal of the original sandbox', async () => {
    const command = vi.fn(async () => ({ code: 0 })); const fresh = createCloudRunCodingSandbox({ image, command });
    expect(await fresh.reconcile(scope, job(fresh))).toEqual({ status: 'pending' }); expect(command).not.toHaveBeenCalled();
  });
  it('keeps unknown cleanup blocking; only same recorded scope/attempt can remove it and cache proof', async () => {
    let permitRemoval = false;
    const command = vi.fn(async (args) => args[0] === 'exec' ? { code: null, signal: 'SIGPIPE', stdout: 'real command failed', stderr: '', timedOut: false, exceeded: false }
      : { code: args[0] === 'delete' && !permitRemoval ? 1 : 0, stdout: '', stderr: '' });
    const sandbox = createCloudRunCodingSandbox({ image, command }), original = job(sandbox);
    expect(await sandbox.run(scope, original)).toMatchObject({ status: 'outcome_unknown', evidence: { cleanup: { status: 'pending' } } });
    await expect(sandbox.run(scope, job(sandbox))).rejects.toThrow('CODING_WORKER_BUSY');
    permitRemoval = true; const calls = command.mock.calls.length;
    expect(await sandbox.reconcile({ ...scope, userId: 'user_another' }, original)).toEqual({ status: 'pending' });
    expect(await sandbox.reconcile(scope, { ...original, execution_id: randomUUID() })).toEqual({ status: 'pending' });
    expect(command.mock.calls).toHaveLength(calls);
    expect(await sandbox.reconcile(scope, original)).toEqual({ status: 'removed' });
    const after = command.mock.calls.length;
    expect(await sandbox.reconcile(scope, original)).toEqual({ status: 'removed' }); expect(command.mock.calls).toHaveLength(after);
    const result = await sandbox.run(scope, job(sandbox)); expect(result).toMatchObject({ status: 'failed', evidence: { command: { signal: 'SIGPIPE' }, cleanup: { status: 'removed' } } });
  });
});
