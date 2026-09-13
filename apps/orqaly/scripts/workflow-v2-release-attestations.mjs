import { z } from 'zod';
import { canonicalHash, canonicalJson, sha256Hex } from '../lib/workflow-v2/canonical.js';

export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .refine((value) => !/^0+$/.test(value), 'placeholder SHA-256 is forbidden');
export const CommitSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .refine((value) => !/^0+$/.test(value), 'placeholder commit is forbidden');
const IMAGE_PREFIX = 'europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview';
const IMAGE_PREFIX_PATTERN =
  'europe-west4-docker\\.pkg\\.dev/axwise-v2-preview-001/workflow-v2-preview';
const imageSchema = (name) => z
  .string()
  .regex(new RegExp(`^${IMAGE_PREFIX_PATTERN}/${name}@sha256:[a-f0-9]{64}$`))
  .refine((value) => !/@sha256:0{64}$/.test(value), 'placeholder image digest is forbidden');
export const ImageSchema = z.union([
  imageSchema('orqaly-web'),
  imageSchema('orqaly-service'),
  imageSchema('axwise-service'),
]);

export const ImageSetSchema = z
  .object({
    web: imageSchema('orqaly-web'),
    api: imageSchema('orqaly-service'),
    orqalyWorker: imageSchema('orqaly-service'),
    axwiseApi: imageSchema('axwise-service'),
    axwiseWorker: imageSchema('axwise-service'),
  })
  .strict()
  .superRefine((images, context) => {
    if (images.api !== images.orqalyWorker) {
      context.addIssue({
        code: 'custom',
        path: ['orqalyWorker'],
        message: 'Orqaly roles must share the tested service digest',
      });
    }
    if (images.axwiseApi !== images.axwiseWorker) {
      context.addIssue({
        code: 'custom',
        path: ['axwiseWorker'],
        message: 'AxWise roles must share the tested service digest',
      });
    }
  });

const BuildId = z.string().regex(/^[a-f0-9-]{20,80}$/);

function buildRecord(configPath) {
  return z
    .object({
      buildId: BuildId,
      status: z.literal('SUCCESS'),
      image: ImageSchema,
      sourceCommit: CommitSchema,
      sourceSnapshotSha256: Sha256Schema,
      sourceTreeSha256: Sha256Schema,
      configPath: z.literal(configPath),
      configSha256: Sha256Schema,
      cloudBuildRecordSha256: Sha256Schema,
      buildExecutionSha256: Sha256Schema,
      artifactRegistryDescriptorSha256: Sha256Schema,
      sourceObjectSha256: Sha256Schema,
      builderImageDigests: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/)).min(1).max(20),
      substitutions: z.record(z.string().regex(/^_[A-Z0-9_]+$/), z.string().min(1).max(2000)),
      sourceArchive: z
        .object({
          bucket: z.string().min(3).max(500),
          object: z.string().min(1).max(1000),
          generation: z.string().regex(/^[1-9][0-9]*$/),
        })
        .strict(),
    })
    .strict();
}

const BuildAttestationCoreSchema = z
  .object({
    schemaVersion: z.literal('orqaly.preview-build-attestation.v1'),
    generatedAt: z.string().datetime(),
    projectId: z.literal('axwise-v2-preview-001'),
    region: z.literal('europe-west4'),
    repository: z.literal('workflow-v2-preview'),
    code: z
      .object({ orqalyCommit: CommitSchema, axwiseCommit: CommitSchema })
      .strict(),
    sourceSnapshots: z
      .object({
        orqaly: z
          .object({
            format: z.literal('git-archive-tar'),
            sourceCommit: CommitSchema,
            archiveSha256: Sha256Schema,
            treeSha256: Sha256Schema,
          })
          .strict(),
        axwise: z
          .object({
            format: z.literal('git-archive-tar'),
            sourceCommit: CommitSchema,
            archiveSha256: Sha256Schema,
            treeSha256: Sha256Schema,
          })
          .strict(),
      })
      .strict(),
    webBuildInputs: z
      .object({
        orqalyApiOrigin: z.string().url(),
        clerkPublishableKeyVersion: z.string().regex(/^[1-9][0-9]*$/),
      })
      .strict(),
    images: ImageSetSchema,
    builds: z
      .object({
        orqalyService: buildRecord('deploy/workflow-v2/cloudbuild.service.yaml'),
        orqalyWeb: buildRecord('deploy/workflow-v2/cloudbuild.web.yaml'),
        axwiseService: buildRecord('cloudbuild.workflow-v2.yaml'),
      })
      .strict(),
  })
  .strict()
  .superRefine((attestation, context) => {
    const expected = {
      orqalyService: [attestation.images.api, attestation.code.orqalyCommit, attestation.sourceSnapshots.orqaly.archiveSha256],
      orqalyWeb: [attestation.images.web, attestation.code.orqalyCommit, attestation.sourceSnapshots.orqaly.archiveSha256],
      axwiseService: [attestation.images.axwiseApi, attestation.code.axwiseCommit, attestation.sourceSnapshots.axwise.archiveSha256],
    };
    for (const [name, [image, commit, snapshotSha256]] of Object.entries(expected)) {
      const build = attestation.builds[name];
      if (
        build.image !== image ||
        build.sourceCommit !== commit ||
        build.sourceSnapshotSha256 !== snapshotSha256 ||
        build.sourceTreeSha256 !== (
          name === 'axwiseService'
            ? attestation.sourceSnapshots.axwise.treeSha256
            : attestation.sourceSnapshots.orqaly.treeSha256
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['builds', name],
          message: 'build record does not bind the exact image and source commit',
        });
      }
    }
    if (
      attestation.sourceSnapshots.orqaly.sourceCommit !== attestation.code.orqalyCommit ||
      attestation.sourceSnapshots.axwise.sourceCommit !== attestation.code.axwiseCommit
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSnapshots'],
        message: 'source snapshots must bind the exact repository commits',
      });
    }
    if (new Set(Object.values(attestation.builds).map((build) => build.buildId)).size !== 3) {
      context.addIssue({
        code: 'custom',
        path: ['builds'],
        message: 'each image role requires a distinct Cloud Build record',
      });
    }
    const expectedSubstitutions = {
      orqalyService: {
        _IMAGE_NAME: `${IMAGE_PREFIX}/orqaly-service:${attestation.code.orqalyCommit.slice(0, 12)}-${attestation.code.axwiseCommit.slice(0, 12)}`,
      },
      orqalyWeb: {
        _IMAGE_NAME: `${IMAGE_PREFIX}/orqaly-web:${attestation.code.orqalyCommit.slice(0, 12)}-${sha256Hex(
          `${attestation.code.orqalyCommit}\n${attestation.webBuildInputs.orqalyApiOrigin}\n${attestation.webBuildInputs.clerkPublishableKeyVersion}\n`
        ).slice(0, 12)}`,
        _ORQALY_API_URL: attestation.webBuildInputs.orqalyApiOrigin,
        _CLERK_PUBLISHABLE_KEY_VERSION: attestation.webBuildInputs.clerkPublishableKeyVersion,
      },
      axwiseService: {
        _IMAGE_NAME: `${IMAGE_PREFIX}/axwise-service:${attestation.code.axwiseCommit.slice(0, 12)}-${attestation.code.orqalyCommit.slice(0, 12)}`,
      },
    };
    for (const [name, substitutions] of Object.entries(expectedSubstitutions)) {
      if (canonicalJson(attestation.builds[name].substitutions) !== canonicalJson(substitutions)) {
        context.addIssue({
          code: 'custom',
          path: ['builds', name, 'substitutions'],
          message: 'Cloud Build substitutions do not bind the exact immutable build inputs',
        });
      }
    }
  });

export const BuildAttestationSchema = BuildAttestationCoreSchema.extend({
  attestationSha256: Sha256Schema,
}).superRefine((attestation, context) => {
  const { attestationSha256, ...core } = attestation;
  if (canonicalHash(core) !== attestationSha256) {
    context.addIssue({
      code: 'custom',
      path: ['attestationSha256'],
      message: 'build attestation hash is invalid',
    });
  }
});

const ServiceEvidenceSchema = z
  .object({
    service: z.enum([
      'orqaly-v2-web-preview',
      'orqaly-v2-api-preview',
      'orqaly-v2-worker-preview',
      'axwise-v2-preview',
      'axwise-v2-worker-preview',
    ]),
    revision: z.string().regex(/^(?:orqaly|axwise)-v2-[a-z-]*preview-[a-z0-9-]+$/),
    image: ImageSchema,
    serviceDocumentSha256: Sha256Schema,
  })
  .strict();

const RuntimeAttestationCoreSchema = z
  .object({
    schemaVersion: z.literal('orqaly.preview-runtime-attestation.v1'),
    verifiedAt: z.string().datetime(),
    projectId: z.literal('axwise-v2-preview-001'),
    region: z.literal('europe-west4'),
    environment: z.literal('preview'),
    verifier: z
      .object({
        sourceCommit: CommitSchema,
        scriptPath: z.literal('infra/gcp/workflow-v2/verify-preview-runtime.sh'),
        scriptSha256: Sha256Schema,
      })
      .strict(),
    latestTrafficRequired: z.literal(true),
    images: ImageSetSchema,
    verifierInvocation: z
      .object({
        exitCode: z.literal(0),
        stdoutSha256: Sha256Schema,
        inputs: z
          .object({
            images: ImageSetSchema,
            origins: z
              .object({
                orqalyApi: z.string().url(),
                orqalyWeb: z.string().url(),
                axwiseApi: z.string().url(),
              })
              .strict(),
            secretVersions: z
              .object({
                orqalyIdentityDatabaseUrl: z.string().regex(/^[1-9][0-9]*$/),
                orqalyApiDatabaseUrl: z.string().regex(/^[1-9][0-9]*$/),
                orqalyWorkerDatabaseUrl: z.string().regex(/^[1-9][0-9]*$/),
                clerkSecretKey: z.string().regex(/^[1-9][0-9]*$/),
                axwiseApiDatabaseUrl: z.string().regex(/^[1-9][0-9]*$/),
                axwiseWorkerDatabaseUrl: z.string().regex(/^[1-9][0-9]*$/),
                axwiseGeminiApiKey: z.string().regex(/^[1-9][0-9]*$/),
                axwiseAuthoritySeal: z.string().regex(/^[1-9][0-9]*$/),
              })
              .strict(),
            requireLatestTraffic: z.literal(true),
          })
          .strict(),
      })
      .strict(),
    services: z
      .object({
        web: ServiceEvidenceSchema,
        api: ServiceEvidenceSchema,
        orqalyWorker: ServiceEvidenceSchema,
        axwiseApi: ServiceEvidenceSchema,
        axwiseWorker: ServiceEvidenceSchema,
      })
      .strict(),
    boundaryEvidence: z
      .object({
        projectIamSha256: Sha256Schema,
        serviceIamSha256: Sha256Schema,
        secretIamSha256: Sha256Schema,
        networkSha256: Sha256Schema,
        artifactBucketSha256: Sha256Schema,
        artifactRegistrySha256: Sha256Schema,
      })
      .strict(),
  })
  .strict()
  .superRefine((attestation, context) => {
    if (JSON.stringify(attestation.verifierInvocation.inputs.images) !== JSON.stringify(attestation.images)) {
      context.addIssue({
        code: 'custom',
        path: ['verifierInvocation', 'inputs', 'images'],
        message: 'verifier invocation images differ from the attested runtime images',
      });
    }
    const expected = {
      web: ['orqaly-v2-web-preview', attestation.images.web],
      api: ['orqaly-v2-api-preview', attestation.images.api],
      orqalyWorker: ['orqaly-v2-worker-preview', attestation.images.orqalyWorker],
      axwiseApi: ['axwise-v2-preview', attestation.images.axwiseApi],
      axwiseWorker: ['axwise-v2-worker-preview', attestation.images.axwiseWorker],
    };
    for (const [name, [service, image]] of Object.entries(expected)) {
      const observed = attestation.services[name];
      if (observed.service !== service || observed.image !== image) {
        context.addIssue({
          code: 'custom',
          path: ['services', name],
          message: 'runtime service evidence does not bind the exact service and image',
        });
      }
    }
    if (new Set(Object.values(attestation.services).map((service) => service.revision)).size !== 5) {
      context.addIssue({
        code: 'custom',
        path: ['services'],
        message: 'each runtime role requires its own exact revision identity',
      });
    }
  });

export const RuntimeAttestationSchema = RuntimeAttestationCoreSchema.extend({
  attestationSha256: Sha256Schema,
}).superRefine((attestation, context) => {
  const { attestationSha256, ...core } = attestation;
  if (canonicalHash(core) !== attestationSha256) {
    context.addIssue({
      code: 'custom',
      path: ['attestationSha256'],
      message: 'runtime attestation hash is invalid',
    });
  }
});

export const ImmutableEvidenceReferenceSchema = z
  .object({
    reportUri: z
      .string()
      .regex(
        /^gs:\/\/axwise-v2-preview-001-orqaly-v2-preview-001-artifacts\/release-evidence\/[A-Za-z0-9._/-]+\.json$/
      ),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    reportSha256: Sha256Schema,
    caseId: z.string().regex(/^[a-z0-9][a-z0-9_.:-]{2,199}$/),
  })
  .strict();

export function buildContentAddressedAttestation(core, coreSchema, finalSchema) {
  const parsed = coreSchema.parse(core);
  return finalSchema.parse({ ...parsed, attestationSha256: canonicalHash(parsed) });
}

export function buildBuildAttestation(core) {
  return buildContentAddressedAttestation(core, BuildAttestationCoreSchema, BuildAttestationSchema);
}

export function buildRuntimeAttestation(core) {
  return buildContentAddressedAttestation(core, RuntimeAttestationCoreSchema, RuntimeAttestationSchema);
}
