import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { codingHash, contentHash, CodingWorkerError } from './coding-worker-contracts.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';

// This controller runs OUTSIDE the untrusted container. No Docker socket,
// host directory, control-plane environment or auth token is mounted/passed in.
const STAGE = String.raw`
const fs=require('node:fs'),path=require('node:path');let input='';
process.stdin.on('data',c=>{input+=c;if(input.length>1000000)process.exit(2)});
process.stdin.on('end',()=>{const files=JSON.parse(input),root=process.argv[1];
 for(const file of files){const target=path.join(root,file.path);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});
  const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o444);
  fs.writeFileSync(fd,file.content);fs.closeSync(fd);fs.chmodSync(target,root==='/workspace'?0o644:0o444);}
});`;
const COLLECT = String.raw`
const fs=require('node:fs'),path=require('node:path');const relative=process.argv[1];
const target=path.join('/workspace',relative),resolved=fs.realpathSync(target);
if(resolved!==target||!resolved.startsWith('/workspace/'))process.exit(2);
const fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),before=fs.fstatSync(fd);
if(!before.isFile()||before.size>256000)process.exit(2);
const data=fs.readFileSync(fd),after=fs.fstatSync(fd);fs.closeSync(fd);
if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)process.exit(2);
process.stdout.write(JSON.stringify({content:data.toString('base64')}));`;

function docker(args, { input, timeoutMs = 20000, maxBytes = 32000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    const out = []; const err = []; let bytes = 0; let exceeded = false; let timedOut = false;
    const capture = (array) => (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) { exceeded = true; child.kill('SIGKILL'); } else array.push(chunk);
    };
    child.stdout.on('data', capture(out)); child.stderr.on('data', capture(err));
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', () => { clearTimeout(timer); reject(new CodingWorkerError('CODING_RUNTIME_UNAVAILABLE', 503)); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err), timedOut, exceeded }); });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}

function requireOk(result) {
  if (result.code !== 0 || result.timedOut || result.exceeded) throw new CodingWorkerError('CODING_RUNTIME_OPERATION_FAILED', 503);
  return result.stdout.toString('utf8').trim();
}

// Never extract an untrusted archive onto the controller filesystem. A single
// bounded regular file is the only allowed docker-cp result; links/PAX overrides
// and path substitutions fail closed.
export function readCodingArtifactTar(buffer, expectedPath, budget) {
  let cursor = 0; let result;
  while (cursor + 512 <= buffer.length) {
    const header = buffer.subarray(cursor, cursor + 512); cursor += 512;
    if (header.every((byte) => byte === 0)) break;
    const string = (start, end) => header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const numeric = (start, end) => { const raw = string(start, end).trim(); if (!/^[0-7]+$/.test(raw)) throw new CodingWorkerError('CODING_ARTIFACT_INVALID'); return parseInt(raw, 8); };
    const size = numeric(124, 136); const expectedChecksum = numeric(148, 156);
    const checksum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== expectedChecksum || size > budget || cursor + size > buffer.length) throw new CodingWorkerError('CODING_ARTIFACT_INVALID');
    const type = string(156, 157);
    if (type === 'x') {
      // Docker may retain benign timestamp metadata, never a replacement path.
      const metadata = buffer.subarray(cursor, cursor + size).toString('utf8');
      if (!metadata.split('\n').filter(Boolean).every((line) => /^\d+ (?:mtime|atime|ctime)=[0-9.]+$/.test(line)))
        throw new CodingWorkerError('CODING_ARTIFACT_INVALID');
    } else {
      if (result || !['', '0'].includes(type) || string(0, 100) !== basename(expectedPath) || string(345, 500))
        throw new CodingWorkerError('CODING_ARTIFACT_INVALID');
      const raw = buffer.subarray(cursor, cursor + size); const content = raw.toString('utf8');
      if (!Buffer.from(content).equals(raw) || containsSolutionBuildSecret(content)) throw new CodingWorkerError('CODING_ARTIFACT_WITHHELD');
      result = { path: expectedPath, content, hash: contentHash(content), bytes: size };
    }
    cursor += Math.ceil(size / 512) * 512;
  }
  if (!result) throw new CodingWorkerError('CODING_ARTIFACT_INVALID');
  return result;
}

export function createDockerCodingSandbox({ image, isolation = 'gvisor', allowLocalFixture = false } = {}) {
  if (!/^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64})$/.test(image || ''))
    throw new CodingWorkerError('CODING_PINNED_IMAGE_REQUIRED', 503);
  if (!['gvisor', 'local_fixture'].includes(isolation) || (isolation === 'local_fixture' && !allowLocalFixture))
    throw new CodingWorkerError('CODING_ISOLATION_REQUIRED', 503);
  const descriptor = Object.freeze({ kind: 'node_offline_v1', image, isolation, productionEligible: isolation === 'gvisor' });
  const nameFor = (job) => `orqaly-code-${job.id}`;
  const scopeHash = (scope) => codingHash(scope);
  async function removeOwned(scope, job) {
    const inspect = await docker(['inspect', nameFor(job)]);
    if (inspect.code !== 0) {
      const missing = await docker(['ps', '-aq', '--filter', `name=^/${nameFor(job)}$`]);
      if (missing.code === 0 && !missing.stdout.toString().trim()) return { status: 'removed' };
      return { status: 'pending' };
    }
    const container = JSON.parse(requireOk(inspect))[0];
    if (container.Config.Labels?.['orqaly.coding.scope'] !== scopeHash(scope) || container.Config.Labels?.['orqaly.coding.spec'] !== job.spec_hash)
      return { status: 'pending' };
    const removed = await docker(['rm', '-f', nameFor(job)]);
    return { status: removed.code === 0 ? 'removed' : 'pending' };
  }
  return {
    descriptor,
    reconcile: removeOwned,
    async run(scope, job) {
      const spec = job.spec;
      if (codingHash(spec.runtime) !== codingHash(descriptor) || codingHash(spec) !== job.spec_hash)
        throw new CodingWorkerError('CODING_RUNTIME_BINDING_CHANGED');
      const name = nameFor(job); const startedAt = new Date().toISOString();
      let created = false; let execution; let artifacts = []; let status = 'outcome_unknown'; let failureCode;
      let cleanup = { status: 'pending' };
      try {
        const args = ['create', '--name', name, '--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges', '--pids-limit', '32', '--memory', '256m', '--memory-swap', '256m', '--cpus', '1',
          '--ulimit', 'nofile=128:128', '--ulimit', 'fsize=262144:262144', '--ipc', 'none', '--user', '0:0',
          '--tmpfs', '/workspace:rw,noexec,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=0755',
          '--tmpfs', '/approved-tests:rw,noexec,nosuid,nodev,size=2m,uid=0,gid=0,mode=0755',
          '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=0700',
          '--label', `orqaly.coding.scope=${scopeHash(scope)}`, '--label', `orqaly.coding.spec=${job.spec_hash}`,
          '--env', 'HOME=/tmp', '--env', 'NODE_OPTIONS=', '--env', 'NODE_PATH=', '--env', 'NODE_ENV=test',
          ...(isolation === 'gvisor' ? ['--runtime', 'runsc'] : []), '--entrypoint', 'node', image,
          '-e', 'setInterval(()=>{},1000)'];
        requireOk(await docker(args)); created = true;
        requireOk(await docker(['start', name]));
        requireOk(await docker(['exec', '-i', '--user', '10001:10001', name, 'node', '-e', STAGE, '/workspace'], { input: JSON.stringify(spec.prepared) }));
        requireOk(await docker(['exec', '-i', '--user', '0:0', name, 'node', '-e', STAGE, '/approved-tests'], { input: JSON.stringify(spec.tests) }));
        execution = await docker(['exec', '--user', '10001:10001', '--workdir', '/workspace', name,
          'node', '--test', ...spec.tests.map((file) => `/approved-tests/${file.path}`)], {
          timeoutMs: spec.limits.timeoutMs, maxBytes: spec.limits.logBytes,
        });
        status = execution.timedOut ? 'timed_out' : execution.code === 0 && !execution.exceeded ? 'succeeded' : 'failed';
        failureCode = execution.exceeded ? 'CODING_LOG_BUDGET_EXCEEDED' : execution.timedOut ? 'CODING_TIMEOUT' : execution.code ? 'CODING_TEST_COMMAND_FAILED' : null;
        if (status === 'succeeded') {
          let budget = spec.limits.artifactBytes;
          for (const path of spec.outputs) {
            // Trusted root collector only reads exact regular files; untrusted
            // UID10001 cannot replace its code or write its private stdout fd.
            // Reject symlinks and files changing during capture. Container-wide
            // deletion immediately follows, including lingering descendants.
            const collected = await docker(['exec', '--user', '0:0', name, 'node', '-e', COLLECT, path], { maxBytes: budget * 2 + 1024 });
            const encoded = JSON.parse(requireOk(collected)).content; const raw = Buffer.from(encoded, 'base64'); const content = raw.toString('utf8');
            if (!Buffer.from(content).equals(raw) || raw.length > budget || containsSolutionBuildSecret(content)) throw new CodingWorkerError('CODING_ARTIFACT_WITHHELD');
            const artifact = { path, content, hash: contentHash(content), bytes: raw.length }; artifacts.push(artifact); budget -= artifact.bytes;
          }
        }
      } catch (error) {
        status = 'outcome_unknown'; artifacts = [];
        failureCode = error instanceof CodingWorkerError ? error.code : 'CODING_RUNTIME_OPERATION_FAILED';
      } finally {
        if (created) cleanup = await removeOwned(scope, job).catch(() => ({ status: 'pending' }));
      }
      if (cleanup.status !== 'removed') { status = 'outcome_unknown'; artifacts = []; }
      const rawLog = execution ? Buffer.concat([execution.stdout, execution.stderr]).toString('utf8').slice(0, 16000) : '';
      const log = containsSolutionBuildSecret(rawLog) ? 'Output withheld: possible credential material.' : rawLog;
      return { status, artifacts, evidence: { kind: 'isolated_coding_worker', executionId: job.execution_id, specHash: job.spec_hash,
        sourceHash: spec.sourceHash, preparedHash: spec.preparedHash, testsHash: spec.testsHash, runtime: descriptor, scopeHash: scopeHash(scope),
        startedAt, completedAt: new Date().toISOString(), command: { kind: 'node_test_v1', exitCode: execution?.code ?? null,
          timedOut: !!execution?.timedOut, outputTruncated: !!execution?.exceeded }, log, failureCode,
        artifactHash: artifacts.length ? codingHash(artifacts.map(({ path, hash, bytes }) => ({ path, hash, bytes }))) : null,
        artifacts: artifacts.map(({ path, hash, bytes }) => ({ path, hash, bytes })), cleanup,
        boundary: { network: 'none', credentials: 'none', hostMounts: false, dockerSocket: false, codeUid: 10001, testsReadOnly: true } } };
    },
  };
}
