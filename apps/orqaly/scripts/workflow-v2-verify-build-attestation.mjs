import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { BuildAttestationSchema } from './workflow-v2-release-attestations.mjs';
import { assertCleanGitSource, assertExternalGitOutput, gitSourceRoot } from './workflow-v2-git-source.mjs';

function argument(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function required(name, argv = process.argv) {
  const value = argument(name, argv);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function repositoryCommit(repository, label) {
  const { commit } = assertCleanGitSource(realpathSync(repository), { label });
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`${label} HEAD is not an exact commit`);
  return commit;
}

export function verifyBuildAttestation(raw, expected) {
  const attestation = BuildAttestationSchema.parse(raw);
  const expectedImages = {
    web: expected.orqalyWebImage,
    api: expected.orqalyServiceImage,
    orqalyWorker: expected.orqalyServiceImage,
    axwiseApi: expected.axwiseServiceImage,
    axwiseWorker: expected.axwiseServiceImage,
  };
  if (
    attestation.code.orqalyCommit !== expected.orqalyCommit ||
    attestation.code.axwiseCommit !== expected.axwiseCommit
  ) {
    throw new Error('build attestation does not bind the exact clean repository HEADs');
  }
  if (JSON.stringify(attestation.images) !== JSON.stringify(expectedImages)) {
    throw new Error('build attestation does not bind the exact deployment image digests');
  }
  if (
    attestation.webBuildInputs.orqalyApiOrigin !== expected.orqalyApiOrigin ||
    attestation.webBuildInputs.clerkPublishableKeyVersion !== expected.clerkPublishableKeyVersion
  ) {
    throw new Error('build attestation does not bind the exact web origin and Clerk key version');
  }
  return attestation;
}

function main() {
  const input = required('--input');
  if (resolve(input) !== input || realpathSync(input) !== input) {
    throw new Error('--input must be an absolute regular non-symlink path');
  }
  const orqalyRepository = realpathSync(required('--orqaly-repository'));
  const axwiseRepository = realpathSync(argument('--axwise-repository') || gitSourceRoot(orqalyRepository));
  assertExternalGitOutput(input, [orqalyRepository, axwiseRepository]);
  const attestation = verifyBuildAttestation(
    JSON.parse(readFileSync(input, 'utf8')),
    {
      orqalyCommit: repositoryCommit(orqalyRepository, 'Orqaly'),
      axwiseCommit: repositoryCommit(axwiseRepository, 'AxWise'),
      orqalyServiceImage: required('--orqaly-service-image'),
      orqalyWebImage: required('--orqaly-web-image'),
      axwiseServiceImage: required('--axwise-service-image'),
      orqalyApiOrigin: required('--orqaly-api-origin'),
      clerkPublishableKeyVersion: required('--clerk-publishable-key-version'),
    }
  );
  process.stdout.write(`Verified exact build attestation ${attestation.attestationSha256}.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
