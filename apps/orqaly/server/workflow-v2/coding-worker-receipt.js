import { codingHash, contentHash } from './coding-worker-contracts.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';

export function validateCodingReceipt(scope, job, receipt) {
  try {
    const evidence = receipt?.evidence, spec = job.spec, command = evidence?.command;
    const core = evidence?.kind === 'isolated_coding_worker' && evidence.specHash === job.spec_hash && evidence.executionId === job.execution_id &&
      evidence.scopeHash === codingHash(scope) && evidence.sourceHash === spec.sourceHash && evidence.preparedHash === spec.preparedHash &&
      evidence.testsHash === spec.testsHash && codingHash(evidence.runtime) === codingHash(spec.runtime) &&
      evidence.boundary?.network === 'none' && evidence.boundary?.credentials === 'none' && evidence.boundary?.testsReadOnly === true &&
      typeof evidence.log === 'string' && Buffer.byteLength(evidence.log) <= 64000 && !containsSolutionBuildSecret(evidence.log) &&
      Number.isFinite(Date.parse(evidence.startedAt)) && Number.isFinite(Date.parse(evidence.completedAt)) &&
      Date.parse(evidence.completedAt) >= Date.parse(evidence.startedAt) && JSON.stringify(evidence).length <= 64000;
    if (!core) return { bound: false, actual: false };
    const artifacts = receipt.artifacts;
    if (!Array.isArray(artifacts) || artifacts.length > spec.outputs.length) return { bound: true, actual: false };
    const meta = artifacts.map(({ path, hash, bytes }) => ({ path, hash, bytes }));
    if (artifacts.some(item => typeof item.content !== 'string' || item.hash !== contentHash(item.content) || item.bytes !== Buffer.byteLength(item.content) ||
      !spec.outputs.includes(item.path) || containsSolutionBuildSecret(item.content)) || new Set(artifacts.map(item => item.path)).size !== artifacts.length ||
      artifacts.reduce((sum, item) => sum + item.bytes, 0) > spec.limits.artifactBytes || codingHash(meta) !== codingHash(evidence.artifacts) ||
      evidence.artifactHash !== (artifacts.length ? codingHash(meta) : null)) return { bound: true, actual: false };
    const actualCommand = command?.kind === 'node_test_v1' && typeof command.timedOut === 'boolean' && typeof command.outputTruncated === 'boolean';
    const proven = receipt.status === 'succeeded' ? command?.exitCode === 0 && !command.timedOut && !command.outputTruncated && artifacts.length === spec.outputs.length :
      receipt.status === 'timed_out' ? command?.timedOut === true && artifacts.length === 0 :
        receipt.status === 'failed' ? !command?.timedOut && artifacts.length === 0 &&
          ((Number.isInteger(command?.exitCode) && command.exitCode !== 0) || (typeof command?.signal === 'string' && /^SIG[A-Z0-9]+$/.test(command.signal)) || command?.outputTruncated) : false;
    return { bound: true, actual: !!(actualCommand && proven && evidence.cleanup?.status === 'removed') };
  } catch { return { bound: false, actual: false }; }
}
