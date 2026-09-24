import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import {
  buildBuildAttestation,
  buildRuntimeAttestation,
} from './workflow-v2-release-attestations.mjs';
import {
  archiveGitSource,
  assertCleanGitSource,
  assertExternalGitOutput,
  gitSourceRoot,
  readGitSourceFile,
} from './workflow-v2-git-source.mjs';

const PROJECT_ID = 'axwise-v2-preview-001';
const REGION = 'europe-west4';
const REPOSITORY = 'workflow-v2-preview';
const BUILD_ACCOUNT = `projects/${PROJECT_ID}/serviceAccounts/workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com`;

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function jsonHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function textHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function required(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the verifier invocation`);
  return value;
}

function run(program, arguments_, options = {}) {
  return execFileSync(program, arguments_, { encoding: 'utf8', ...options }).trim();
}

function requireRepository(repository, expectedCommit, label) {
  assertCleanGitSource(repository, { expectedCommit, label });
}

function requireExternalOutput(output, repositories) {
  assertExternalGitOutput(output, repositories);
}

function headFile(repository, path) {
  return readGitSourceFile(repository, path);
}

function gcloudJson(arguments_) {
  const output = run('gcloud', [...arguments_, '--format=json']);
  return JSON.parse(output);
}

function imageParts(image) {
  const match = image.match(/^(.*)@(sha256:[a-f0-9]{64})$/);
  if (!match) throw new Error(`image is not digest-pinned: ${image}`);
  return { packageName: match[1], digest: match[2] };
}

function assertDocumentContainsImage(document, image) {
  const { packageName, digest } = imageParts(image);
  const serialized = JSON.stringify(document);
  if (!serialized.includes(packageName) || !serialized.includes(digest)) {
    throw new Error(`Artifact Registry descriptor does not bind ${image}`);
  }
}

function directoryEntries(root, current = root) {
  const entries = [];
  for (const name of readdirSync(current).sort()) {
    if (name === '.git') continue;
    const absolute = join(current, name);
    const path = relative(root, absolute).split(sep).join('/');
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      entries.push(...directoryEntries(root, absolute));
    } else if (stat.isSymbolicLink()) {
      entries.push({ path, type: 'symlink', target: readlinkSync(absolute) });
    } else if (stat.isFile()) {
      entries.push({
        path,
        type: 'file',
        executable: Boolean(stat.mode & 0o111),
        sha256: textHash(readFileSync(absolute)),
      });
    } else {
      throw new Error(`unsupported source entry ${path}`);
    }
  }
  return entries;
}

function extractArchive(bytes, destination, label) {
  const archive = join(destination, `${label}.archive`);
  const extracted = join(destination, label);
  mkdirSync(extracted);
  writeFileSync(archive, bytes);
  execFileSync('tar', ['-xf', archive, '-C', extracted], { stdio: 'pipe' });
  return extracted;
}

function sourceArchiveEvidence({ source, repository, sourceCommit, expectedArchiveSha256 }) {
  const gitArchive = archiveGitSource(repository, { commit: sourceCommit });
  if (textHash(gitArchive) !== expectedArchiveSha256) {
    throw new Error(`${repository} source snapshot SHA-256 was not independently reproduced`);
  }
  const versionedUri = `gs://${source.bucket}/${source.object}#${source.generation}`;
  const sourceObject = execFileSync(
    'gcloud',
    ['storage', 'cat', versionedUri, `--project=${PROJECT_ID}`],
    { encoding: null, maxBuffer: 1024 * 1024 * 1024 }
  );
  const staging = mkdtempSync(join(tmpdir(), 'workflow-v2-source-proof.'));
  try {
    const headRoot = extractArchive(gitArchive, staging, 'head');
    const cloudRoot = extractArchive(sourceObject, staging, 'cloud-build');
    const headTree = directoryEntries(headRoot);
    const cloudTree = directoryEntries(cloudRoot);
    const sourceTreeSha256 = jsonHash(headTree);
    if (stableJson(headTree) !== stableJson(cloudTree)) {
      throw new Error(`Cloud Build source ${versionedUri} differs from exact tracked HEAD`);
    }
    return {
      sourceObjectSha256: textHash(sourceObject),
      sourceTreeSha256,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function substitute(value, substitutions) {
  if (typeof value === 'string') {
    // Cloud Build resolves $$ to one literal dollar before the step runs. Hide
    // escaped dollars while applying declared substitutions so an escaped
    // $PROJECT_ID or $_NAME can never be mistaken for a real substitution.
    const escapedDollar = '\u0000CLOUD_BUILD_ESCAPED_DOLLAR\u0000';
    return value
      .replace(/\$\$/g, escapedDollar)
      .replace(/\$(PROJECT_ID|_[A-Z0-9_]+)/g, (match, name) =>
        Object.hasOwn(substitutions, name) ? substitutions[name] : match
      )
      .replaceAll(escapedDollar, '$');
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, substitutions));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, substitutions)])
    );
  }
  return value;
}

function normalizedBuildDefinition(build) {
  return {
    steps: (build.steps || []).map((step) => ({
      name: step.name,
      ...(step.entrypoint ? { entrypoint: step.entrypoint } : {}),
      ...(step.args ? { args: step.args } : {}),
      ...(step.env ? { env: step.env } : {}),
      ...(step.secretEnv ? { secretEnv: step.secretEnv } : {}),
    })),
    images: build.images || [],
    ...(build.availableSecrets ? { availableSecrets: build.availableSecrets } : {}),
    options: {
      logging: build.options?.logging,
      machineType: build.options?.machineType,
    },
  };
}

export function expectedBuildDefinition(config, expectedSubstitutions) {
  // Defaults are part of the exact committed build configuration, not values
  // trusted from the remote build. Explicit attested inputs still take priority.
  return normalizedBuildDefinition(substitute(config, {
    ...config.substitutions,
    PROJECT_ID,
    ...expectedSubstitutions,
  }));
}

export function buildRecord({
  buildId,
  image,
  sourceCommit,
  configPath,
  repository,
  sourceSnapshotSha256,
  expectedSubstitutions,
}) {
  const build = gcloudJson([
    'builds', 'describe', buildId,
    `--project=${PROJECT_ID}`,
    `--region=${REGION}`,
  ]);
  if (build.id !== buildId || build.status !== 'SUCCESS') {
    throw new Error(`Cloud Build ${buildId} is not the exact successful build`);
  }
  if (build.serviceAccount !== BUILD_ACCOUNT) {
    throw new Error(`Cloud Build ${buildId} used the wrong service account`);
  }
  for (const [name, value] of Object.entries(expectedSubstitutions)) {
    if (build.substitutions?.[name] !== value) {
      throw new Error(`Cloud Build ${buildId} does not bind substitution ${name}`);
    }
  }
  const expectedDigest = imageParts(image).digest;
  if (!(build.results?.images || []).some((item) => item.digest === expectedDigest)) {
    throw new Error(`Cloud Build ${buildId} result does not bind the requested digest`);
  }
  const source = build.source?.storageSource;
  if (!source?.bucket || !source?.object || !source?.generation) {
    throw new Error(`Cloud Build ${buildId} has no immutable uploaded source generation`);
  }
  const descriptor = gcloudJson([
    'artifacts', 'docker', 'images', 'describe', image,
    `--project=${PROJECT_ID}`,
  ]);
  assertDocumentContainsImage(descriptor, image);
  const configText = headFile(repository, configPath);
  const expectedDefinition = expectedBuildDefinition(yaml.load(configText), expectedSubstitutions);
  const observedDefinition = normalizedBuildDefinition(build);
  if (stableJson(expectedDefinition) !== stableJson(observedDefinition)) {
    throw new Error(`Cloud Build ${buildId} executed a definition different from exact HEAD config`);
  }
  const builderImageDigests = build.results?.buildStepImages || [];
  if (
    builderImageDigests.length !== observedDefinition.steps.length ||
    builderImageDigests.some((digest) => !/^sha256:[a-f0-9]{64}$/.test(digest))
  ) {
    throw new Error(`Cloud Build ${buildId} does not expose exact builder image digests`);
  }
  const sourceEvidence = sourceArchiveEvidence({
    source,
    repository,
    sourceCommit,
    expectedArchiveSha256: sourceSnapshotSha256,
  });
  return {
    buildId,
    status: 'SUCCESS',
    image,
    sourceCommit,
    sourceSnapshotSha256,
    sourceTreeSha256: sourceEvidence.sourceTreeSha256,
    configPath,
    configSha256: textHash(configText),
    cloudBuildRecordSha256: jsonHash(build),
    buildExecutionSha256: jsonHash({ definition: observedDefinition, builderImageDigests }),
    artifactRegistryDescriptorSha256: jsonHash(descriptor),
    sourceObjectSha256: sourceEvidence.sourceObjectSha256,
    builderImageDigests,
    substitutions: expectedSubstitutions,
    sourceArchive: {
      bucket: source.bucket,
      object: source.object,
      generation: String(source.generation),
    },
  };
}

async function buildMode() {
  const output = required('--output');
  const orqalyRepository = await realpath(required('--orqaly-repository'));
  const axwiseRepository = await realpath(argument('--axwise-repository') || gitSourceRoot(orqalyRepository));
  const orqalyCommit = required('--orqaly-commit');
  const axwiseCommit = required('--axwise-commit');
  const images = {
    web: required('--orqaly-web-image'),
    api: required('--orqaly-service-image'),
    orqalyWorker: required('--orqaly-service-image'),
    axwiseApi: required('--axwise-service-image'),
    axwiseWorker: required('--axwise-service-image'),
  };
  const orqalySourceSnapshotSha256 = required('--orqaly-source-snapshot-sha256');
  const axwiseSourceSnapshotSha256 = required('--axwise-source-snapshot-sha256');
  const webBuildInputs = {
    orqalyApiOrigin: required('--orqaly-api-origin'),
    clerkPublishableKeyVersion: required('--clerk-publishable-key-version'),
  };
  requireRepository(orqalyRepository, orqalyCommit, 'Orqaly');
  requireRepository(axwiseRepository, axwiseCommit, 'AxWise');
  requireExternalOutput(output, [orqalyRepository, axwiseRepository]);
  // The service image is released against an exact Orqaly/AxWise pair. A
  // commit-only tag would collide if AxWise changed while Orqaly stayed fixed.
  const orqalyServiceTag = `${imageParts(images.api).packageName}:${orqalyCommit.slice(0, 12)}-${axwiseCommit.slice(0, 12)}`;
  const orqalyWebTag = `${imageParts(images.web).packageName}:${orqalyCommit.slice(0, 12)}-${textHash(
    `${orqalyCommit}\n${webBuildInputs.orqalyApiOrigin}\n${webBuildInputs.clerkPublishableKeyVersion}\n`
  ).slice(0, 12)}`;
  const axwiseServiceTag = `${imageParts(images.axwiseApi).packageName}:${axwiseCommit.slice(0, 12)}-${orqalyCommit.slice(0, 12)}`;
  const core = {
    schemaVersion: 'orqaly.preview-build-attestation.v1',
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    region: REGION,
    repository: REPOSITORY,
    code: { orqalyCommit, axwiseCommit },
    webBuildInputs,
    sourceSnapshots: {
      orqaly: {
        format: 'git-archive-tar',
        sourceCommit: orqalyCommit,
        archiveSha256: orqalySourceSnapshotSha256,
        treeSha256: null,
      },
      axwise: {
        format: 'git-archive-tar',
        sourceCommit: axwiseCommit,
        archiveSha256: axwiseSourceSnapshotSha256,
        treeSha256: null,
      },
    },
    images,
    builds: {
      orqalyService: buildRecord({
        buildId: required('--orqaly-service-build-id'),
        image: images.api,
        sourceCommit: orqalyCommit,
        configPath: 'deploy/workflow-v2/cloudbuild.service.yaml',
        repository: orqalyRepository,
        sourceSnapshotSha256: orqalySourceSnapshotSha256,
        expectedSubstitutions: { _IMAGE_NAME: orqalyServiceTag },
      }),
      orqalyWeb: buildRecord({
        buildId: required('--orqaly-web-build-id'),
        image: images.web,
        sourceCommit: orqalyCommit,
        configPath: 'deploy/workflow-v2/cloudbuild.web.yaml',
        repository: orqalyRepository,
        sourceSnapshotSha256: orqalySourceSnapshotSha256,
        expectedSubstitutions: {
          _IMAGE_NAME: orqalyWebTag,
          _ORQALY_API_URL: webBuildInputs.orqalyApiOrigin,
          _CLERK_PUBLISHABLE_KEY_VERSION: webBuildInputs.clerkPublishableKeyVersion,
        },
      }),
      axwiseService: buildRecord({
        buildId: required('--axwise-service-build-id'),
        image: images.axwiseApi,
        sourceCommit: axwiseCommit,
        configPath: 'cloudbuild.workflow-v2.yaml',
        repository: axwiseRepository,
        sourceSnapshotSha256: axwiseSourceSnapshotSha256,
        expectedSubstitutions: { _IMAGE_NAME: axwiseServiceTag },
      }),
    },
  };
  core.sourceSnapshots.orqaly.treeSha256 = core.builds.orqalyService.sourceTreeSha256;
  core.sourceSnapshots.axwise.treeSha256 = core.builds.axwiseService.sourceTreeSha256;
  if (core.builds.orqalyWeb.sourceTreeSha256 !== core.sourceSnapshots.orqaly.treeSha256) {
    throw new Error('Orqaly service and web builds did not receive identical exact HEAD source trees');
  }
  const attestation = buildBuildAttestation(core);
  await writeFile(output, `${JSON.stringify(attestation, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Wrote create-only build provenance ${attestation.attestationSha256}.\n`);
}

function serviceEvidence(service, image) {
  const document = gcloudJson([
    'run', 'services', 'describe', service,
    `--project=${PROJECT_ID}`,
    `--region=${REGION}`,
  ]);
  const revision = document.status?.latestReadyRevisionName;
  if (
    !revision ||
    document.status?.latestCreatedRevisionName !== revision ||
    document.spec?.template?.spec?.containers?.[0]?.image !== image
  ) {
    throw new Error(`${service} does not bind the exact ready image revision`);
  }
  const traffic = (document.status?.traffic || [])
    .filter((entry) => entry.revisionName === revision)
    .reduce((total, entry) => total + Number(entry.percent || 0), 0);
  if (traffic !== 100) throw new Error(`${service} latest verified revision does not receive 100% traffic`);
  return { service, revision, image, serviceDocumentSha256: jsonHash(document) };
}

function policy(command) {
  return gcloudJson(command);
}

async function runtimeMode() {
  const output = required('--output');
  const orqalyRepository = await realpath(required('--orqaly-repository'));
  const axwiseRepository = await realpath(argument('--axwise-repository') || gitSourceRoot(orqalyRepository));
  const orqalyCommit = required('--orqaly-commit');
  const axwiseCommit = required('--axwise-commit');
  requireRepository(orqalyRepository, orqalyCommit, 'Orqaly');
  requireRepository(axwiseRepository, axwiseCommit, 'AxWise');
  requireExternalOutput(output, [orqalyRepository, axwiseRepository]);
  const images = {
    web: required('--orqaly-web-image'),
    api: required('--orqaly-service-image'),
    orqalyWorker: required('--orqaly-service-image'),
    axwiseApi: required('--axwise-service-image'),
    axwiseWorker: required('--axwise-service-image'),
  };
  const verifierPath = 'infra/gcp/workflow-v2/verify-preview-runtime.sh';
  const origins = {
    orqalyApi: requiredEnvironment('ORQALY_API_ORIGIN'),
    orqalyWeb: requiredEnvironment('ORQALY_WEB_ORIGIN'),
    axwiseApi: requiredEnvironment('AXWISE_API_ORIGIN'),
  };
  const secretVersions = {
    orqalyIdentityDatabaseUrl: requiredEnvironment('ORQALY_IDENTITY_DB_SECRET_VERSION'),
    orqalyApiDatabaseUrl: requiredEnvironment('ORQALY_API_DB_SECRET_VERSION'),
    orqalyWorkerDatabaseUrl: requiredEnvironment('ORQALY_WORKER_DB_SECRET_VERSION'),
    clerkSecretKey: requiredEnvironment('CLERK_SECRET_KEY_VERSION'),
    typesafeApiKey: requiredEnvironment('TYPESAFE_API_KEY_SECRET_VERSION'),
    axwiseApiDatabaseUrl: requiredEnvironment('AXWISE_API_DB_SECRET_VERSION'),
    axwiseWorkerDatabaseUrl: requiredEnvironment('AXWISE_WORKER_DB_SECRET_VERSION'),
    axwiseGeminiApiKey: requiredEnvironment('AXWISE_GEMINI_SECRET_VERSION'),
    axwiseAuthoritySeal: requiredEnvironment('AXWISE_SEAL_SECRET_VERSION'),
  };
  const verifierOutput = execFileSync('bash', [resolve(orqalyRepository, verifierPath)], {
    cwd: orqalyRepository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      ORQALY_SERVICE_IMAGE: images.api,
      ORQALY_WEB_IMAGE: images.web,
      AXWISE_SERVICE_IMAGE: images.axwiseApi,
      ORQALY_API_ORIGIN: origins.orqalyApi,
      ORQALY_WEB_ORIGIN: origins.orqalyWeb,
      AXWISE_API_ORIGIN: origins.axwiseApi,
      REQUIRE_LATEST_TRAFFIC: 'true',
      RUNTIME_ATTESTATION_OUTPUT: '',
    },
  });
  const services = {
    web: serviceEvidence('orqaly-v2-web-preview', images.web),
    api: serviceEvidence('orqaly-v2-api-preview', images.api),
    orqalyWorker: serviceEvidence('orqaly-v2-worker-preview', images.orqalyWorker),
    axwiseApi: serviceEvidence('axwise-v2-preview', images.axwiseApi),
    axwiseWorker: serviceEvidence('axwise-v2-worker-preview', images.axwiseWorker),
  };
  const projectIam = policy(['projects', 'get-iam-policy', PROJECT_ID]);
  const serviceIam = Object.values(services).map((entry) => policy([
    'run', 'services', 'get-iam-policy', entry.service,
    `--project=${PROJECT_ID}`,
    `--region=${REGION}`,
  ]));
  const secretNames = [
    'orqaly-v2-preview-001-db-identity-url',
    'orqaly-v2-preview-001-db-api-url',
    'orqaly-v2-preview-001-db-worker-url',
    'orqaly-v2-preview-001-clerk-secret-key',
    'orqaly-v2-preview-001-clerk-publishable-key',
    'axwise-v2-preview-001-db-api-url',
    'axwise-v2-preview-001-db-worker-url',
    'axwise-v2-preview-001-gemini-api-key',
    'axwise-v2-preview-001-authority-seal',
    'axwise-v2-preview-001-typesafe-api-key',
  ];
  const secretIam = secretNames.map((secret) => policy([
    'secrets', 'get-iam-policy', secret, `--project=${PROJECT_ID}`,
  ]));
  const network = [
    gcloudJson(['compute', 'networks', 'describe', 'workflow-v2-preview', `--project=${PROJECT_ID}`]),
    gcloudJson([
      'compute', 'networks', 'subnets', 'describe', 'workflow-v2-preview-ew4',
      `--project=${PROJECT_ID}`, `--region=${REGION}`,
    ]),
    gcloudJson([
      'compute', 'routers', 'describe', 'workflow-v2-preview-ew4',
      `--project=${PROJECT_ID}`, `--region=${REGION}`,
    ]),
    gcloudJson([
      'compute', 'routers', 'nats', 'describe', 'workflow-v2-preview-ew4',
      '--router=workflow-v2-preview-ew4', `--project=${PROJECT_ID}`, `--region=${REGION}`,
    ]),
  ];
  const bucket = [
    gcloudJson([
      'storage', 'buckets', 'describe', `gs://${PROJECT_ID}-orqaly-v2-preview-001-artifacts`,
      `--project=${PROJECT_ID}`,
    ]),
    gcloudJson([
      'storage', 'buckets', 'get-iam-policy', `gs://${PROJECT_ID}-orqaly-v2-preview-001-artifacts`,
      `--project=${PROJECT_ID}`,
    ]),
  ];
  const registry = [
    gcloudJson([
      'artifacts', 'repositories', 'describe', REPOSITORY,
      `--location=${REGION}`, `--project=${PROJECT_ID}`,
    ]),
    gcloudJson([
      'artifacts', 'repositories', 'get-iam-policy', REPOSITORY,
      `--location=${REGION}`, `--project=${PROJECT_ID}`,
    ]),
    ...[images.web, images.api, images.axwiseApi].map((image) => {
      const descriptor = gcloudJson([
        'artifacts', 'docker', 'images', 'describe', image, `--project=${PROJECT_ID}`,
      ]);
      assertDocumentContainsImage(descriptor, image);
      return descriptor;
    }),
  ];
  const core = {
    schemaVersion: 'orqaly.preview-runtime-attestation.v1',
    verifiedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    region: REGION,
    environment: 'preview',
    verifier: {
      sourceCommit: orqalyCommit,
      scriptPath: verifierPath,
      scriptSha256: textHash(headFile(orqalyRepository, verifierPath)),
    },
    latestTrafficRequired: true,
    images,
    verifierInvocation: {
      exitCode: 0,
      stdoutSha256: textHash(verifierOutput),
      inputs: {
        images,
        origins,
        secretVersions,
        requireLatestTraffic: true,
      },
    },
    services,
    boundaryEvidence: {
      projectIamSha256: jsonHash(projectIam),
      serviceIamSha256: jsonHash(serviceIam),
      secretIamSha256: jsonHash(secretIam),
      networkSha256: jsonHash(network),
      artifactBucketSha256: jsonHash(bucket),
      artifactRegistrySha256: jsonHash(registry),
    },
  };
  const attestation = buildRuntimeAttestation(core);
  await writeFile(output, `${JSON.stringify(attestation, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Wrote create-only runtime verification ${attestation.attestationSha256}.\n`);
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'build') return buildMode();
  if (mode === 'runtime') return runtimeMode();
  throw new Error('usage: node scripts/workflow-v2-gcp-attestation.mjs <build|runtime> ...');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export { jsonHash, stableJson, substitute };
