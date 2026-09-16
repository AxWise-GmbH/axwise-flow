import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, realpath, lstat, open, rm, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { CodingWorkerError, codingHash, contentHash } from './coding-worker-contracts.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';

export const CLOUD_RUN_SANDBOX_BIN = '/usr/local/gcp/bin/sandbox';
export function cloudRunCodingDescriptor(image) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image || '')) throw new CodingWorkerError('CODING_PINNED_IMAGE_REQUIRED', 503);
  return Object.freeze({ kind: 'node_offline_v1', image, isolation: 'cloud_run_sandbox', productionEligible: true, memoryMb: 1024,
    rootfs: 'pristine_node22_v1', network: 'none', supervisorConcurrency: 1 });
}

export function runSandboxCommand(args, { timeoutMs = 15000, maxBytes = 16000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLOUD_RUN_SANDBOX_BIN, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal });
    const stdout = []; const stderr = []; let bytes = 0; let timedOut = false; let exceeded = false; let settled = false;
    const finish = (code, signal) => {
      if (settled) return; settled = true; clearTimeout(timeout);
      resolve({ code, signal, timedOut, exceeded, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    };
    const interrupt = () => {
      child.kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy();
      // Remote sandbox processes can hold their pipe open after the CLI dies.
      // Return immediately so the caller can FORCE DELETE the named sandbox.
      finish(null, 'SIGKILL');
    };
    const capture = (chunks) => (chunk) => { bytes += chunk.length; if (bytes > maxBytes) { exceeded = true; interrupt(); } else chunks.push(chunk); };
    child.stdout.on('data', capture(stdout)); child.stderr.on('data', capture(stderr));
    const timeout = setTimeout(() => { timedOut = true; interrupt(); }, timeoutMs);
    child.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new CodingWorkerError('CODING_SANDBOX_UNAVAILABLE', 503)); } });
    child.on('close', finish);
  });
}

export function cloudRunSandboxStartArgs({ name, directory, rootfs = '/opt/coding-rootfs' }) {
  // Official API: https://docs.cloud.google.com/run/docs/reference/sandbox-cli
  // Never inherit the parent rootfs, env, network or a broad writable mount.
  return ['run', name, '--detach', '--rootfs', rootfs, '--workdir', '/workspace',
    '--mount', `type=bind,source=${join(directory, 'workspace')},destination=/workspace`,
    '--mount', `type=bind,source=${join(directory, 'tests')},destination=/approved-tests,readonly`,
    '--env', 'PATH=/usr/local/bin:/usr/bin:/bin,HOME=/tmp,NODE_ENV=test',
    '--', '/bin/sleep', '300'];
}

export function createCloudRunCodingSandbox({ image, rootfs = '/opt/coding-rootfs', command = runSandboxCommand } = {}) {
  const descriptor = cloudRunCodingDescriptor(image);
  let busyJobId = null;
  const ownedJobs = new Map();
  async function cleanup(name) {
    try { const result = await command(['delete', name, '--force']); return { status: result.code === 0 ? 'removed' : 'pending' }; }
    catch { return { status: 'pending' }; }
  }
  return {
    descriptor,
    async reconcile(scope, job) {
      const owned = ownedJobs.get(job.id);
      if (!owned || owned.scopeHash !== codingHash(scope) || owned.specHash !== job.spec_hash || owned.executionId !== job.execution_id)
        return { status: 'pending' };
      // A new/different Cloud Run instance cannot prove the original sandbox
      // disappeared. Only this instance's captured ownership/removal is proof.
      if (owned.cleanup === 'removed') return { status: 'removed' };
      if (busyJobId && busyJobId !== job.id) throw new CodingWorkerError('CODING_WORKER_BUSY', 409);
      const removed = await cleanup(`orqaly-code-${job.id}`);
      if (removed.status === 'removed') { busyJobId = null; owned.cleanup = 'removed'; }
      return removed;
    },
    async run(scope, job) {
      if (busyJobId) throw new CodingWorkerError('CODING_WORKER_BUSY', 409);
      if (codingHash(job.spec.runtime) !== codingHash(descriptor) || codingHash(job.spec) !== job.spec_hash)
        throw new CodingWorkerError('CODING_RUNTIME_BINDING_CHANGED');
      if (ownedJobs.has(job.id)) throw new CodingWorkerError('CODING_INSTANCE_ATTEMPT_EXISTS');
      if (ownedJobs.size >= 30) throw new CodingWorkerError('CODING_INSTANCE_RECEIPT_LIMIT', 429);
      ownedJobs.set(job.id, { scopeHash: codingHash(scope), specHash: job.spec_hash, executionId: job.execution_id, cleanup: 'pending' });
      busyJobId = job.id; const name = `orqaly-code-${job.id}`; const startedAt = new Date().toISOString();
      let directory; let launched = false; let result; let artifacts = []; let status = 'outcome_unknown'; let failureCode;
      let removed = { status: 'pending' };
      try {
        directory = await mkdtemp(join(tmpdir(), 'orqaly-coding-'));
        // Only this job's input/output workspace crosses the sandbox boundary.
        // The pristine root excludes supervisor /tmp, app code, env and secrets.
        await chmod(directory, 0o755);
        for (const [part, files, mode] of [['workspace', job.spec.prepared, 0o666], ['tests', job.spec.tests, 0o444]]) {
          await mkdir(join(directory, part), { mode: part === 'workspace' ? 0o777 : 0o755 });
          await chmod(join(directory, part), part === 'workspace' ? 0o777 : 0o755);
          for (const file of files) {
            const target = join(directory, part, file.path); await mkdir(dirname(target), { recursive: true, mode: part === 'workspace' ? 0o777 : 0o755 });
            await writeFile(target, file.content, { flag: 'wx', mode }); await chmod(target, mode);
          }
        }
        const launch = await command(cloudRunSandboxStartArgs({ name, directory, rootfs }));
        if (launch.code !== 0) throw new CodingWorkerError('CODING_SANDBOX_START_FAILED', 503);
        launched = true;
        result = await command(['exec', name, '--workdir', '/workspace', '--', '/usr/bin/prlimit',
          '--nproc=32:32', '--nofile=128:128', '--fsize=262144:262144', '--cpu=120:120',
          '--', '/usr/local/bin/node', '--max-old-space-size=128', '--test', ...job.spec.tests.map((file) => `/approved-tests/${file.path}`)],
        { timeoutMs: job.spec.limits.timeoutMs, maxBytes: job.spec.limits.logBytes });
        status = result.timedOut ? 'timed_out' : result.code === 0 && !result.exceeded ? 'succeeded' : 'failed';
        failureCode = result.timedOut ? 'CODING_TIMEOUT' : result.exceeded ? 'CODING_LOG_BUDGET_EXCEEDED' : result.code !== 0 ? 'CODING_TEST_COMMAND_FAILED' : null;
        // Force deletion kills all descendants BEFORE any host artifact read.
        removed = await cleanup(name); launched = false;
        if (removed.status !== 'removed') throw new CodingWorkerError('CODING_CLEANUP_UNCONFIRMED');
        if (status === 'succeeded') {
          let budget = job.spec.limits.artifactBytes;
          for (const path of job.spec.outputs) {
            const target = join(directory, 'workspace', path);
            if (await realpath(target) !== target || !(await lstat(target)).isFile()) throw new CodingWorkerError('CODING_ARTIFACT_INVALID');
            const fd = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
            let content; let bytes;
            try { const stat = await fd.stat(); if (stat.size > budget) throw new CodingWorkerError('CODING_ARTIFACT_BUDGET'); bytes = await fd.readFile(); content = bytes.toString('utf8'); }
            finally { await fd.close(); }
            if (!Buffer.from(content).equals(bytes) || containsSolutionBuildSecret(content)) throw new CodingWorkerError('CODING_ARTIFACT_WITHHELD');
            artifacts.push({ path, content, hash: contentHash(content), bytes: bytes.length }); budget -= bytes.length;
          }
        }
      } catch (error) { status = 'outcome_unknown'; artifacts = []; failureCode = error instanceof CodingWorkerError ? error.code : 'CODING_RUNTIME_OPERATION_FAILED'; }
      finally {
        if (launched) removed = await cleanup(name);
        // Never remove a directory still mounted by a possibly running sandbox.
        if (directory && removed.status === 'removed') await rm(directory, { recursive: true, force: true }).catch(() => {});
        busyJobId = removed.status !== 'removed' ? job.id : null;
        ownedJobs.get(job.id).cleanup = removed.status;
      }
      if (removed.status !== 'removed') { status = 'outcome_unknown'; artifacts = []; }
      const rawLog = `${result?.stdout || ''}${result?.stderr || ''}`.slice(0, 16000);
      return { status, artifacts, evidence: { kind: 'isolated_coding_worker', executionId: job.execution_id, specHash: job.spec_hash,
        sourceHash: job.spec.sourceHash, preparedHash: job.spec.preparedHash, testsHash: job.spec.testsHash, runtime: descriptor,
        scopeHash: codingHash(scope), startedAt, completedAt: new Date().toISOString(), command: { kind: 'node_test_v1', exitCode: result?.code ?? null,
          signal: result?.signal ?? null, timedOut: !!result?.timedOut, outputTruncated: !!result?.exceeded }, failureCode,
        log: containsSolutionBuildSecret(rawLog) ? 'Output withheld: possible credential material.' : rawLog,
        artifacts: artifacts.map(({ path, hash, bytes }) => ({ path, hash, bytes })),
        artifactHash: artifacts.length ? codingHash(artifacts.map(({ path, hash, bytes }) => ({ path, hash, bytes }))) : null,
        cleanup: removed, boundary: { network: 'none', credentials: 'none', rootfs: 'pristine_node22_v1',
          workspace: 'job_scoped_only', testsReadOnly: true, memoryLimitScope: 'dedicated_instance_1GiB' } } };
    },
  };
}
