import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { assertArtifactContentHash } from '../../lib/workflow-v2/canonical.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

export class FinalArtifactExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FinalArtifactExportError';
    this.code = code;
  }
}

function requireUuid(label, value) {
  if (!UUID.test(value || '')) {
    throw new FinalArtifactExportError('INVALID_EXPORT_IDENTITY', `${label} must be a UUID`);
  }
  return value.toLowerCase();
}

function rawSha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function rawBufferSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function finalArtifactObjectName({ tenantId, runId, artifactId, artifactHash }) {
  if (!/^[a-f0-9]{64}$/.test(artifactHash || '')) {
    throw new FinalArtifactExportError(
      'INVALID_EXPORT_IDENTITY',
      'artifactHash must be a lowercase SHA-256 digest'
    );
  }
  return [
    'tenants',
    requireUuid('tenantId', tenantId),
    'runs',
    requireUuid('runId', runId),
    'artifacts',
    requireUuid('artifactId', artifactId),
    `${artifactHash}.md`,
  ].join('/');
}

function multipartUpload(metadata, markdown, seed) {
  let boundary = `orqaly_v2_${seed.slice(0, 32)}`;
  while (markdown.includes(boundary)) boundary += '_x';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/markdown',
    '',
    markdown,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

function responseStatus(error) {
  return error?.response?.status || error?.code || null;
}

function assertExistingObject(existing, expected) {
  const metadata = existing?.metadata || {};
  const matches =
    existing?.name === expected.name &&
    existing?.contentType === 'text/markdown' &&
    metadata.artifactContentHash === expected.metadata.artifactContentHash &&
    metadata.rawSha256 === expected.metadata.rawSha256 &&
    metadata.tenantId === expected.metadata.tenantId &&
    metadata.runId === expected.metadata.runId &&
    metadata.artifactId === expected.metadata.artifactId;
  if (!matches) {
    throw new FinalArtifactExportError(
      'GCS_EXPORT_CONFLICT',
      'the create-only object name already exists with different immutable metadata'
    );
  }
}

function authenticatedRequest(auth) {
  let clientPromise;
  return async (options) => {
    clientPromise ||= auth.getClient();
    const client = await clientPromise;
    return client.request(options);
  };
}

export function createFinalArtifactExporter({
  bucketName = process.env.ORQALY_ARTIFACT_BUCKET,
  auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] }),
  request,
} = {}) {
  if (!BUCKET.test(bucketName || '')) {
    throw new FinalArtifactExportError(
      'ARTIFACT_BUCKET_REQUIRED',
      'ORQALY_ARTIFACT_BUCKET must name the environment-specific bucket'
    );
  }
  const call = request || authenticatedRequest(auth);

  return {
    async exportFinalMarkdown({ tenantId, runId, artifact }) {
      if (
        artifact?.kind !== 'final_markdown' ||
        artifact?.contentType !== 'text/markdown' ||
        !artifact?.markdown
      ) {
        throw new FinalArtifactExportError(
          'FINAL_MARKDOWN_REQUIRED',
          'only an immutable final_markdown artifact can be exported'
        );
      }
      try {
        assertArtifactContentHash(artifact);
      } catch (error) {
        throw new FinalArtifactExportError('ARTIFACT_HASH_MISMATCH', error.message);
      }

      const objectName = finalArtifactObjectName({
        tenantId,
        runId,
        artifactId: artifact.artifactId,
        artifactHash: artifact.artifactHash,
      });
      const metadata = {
        name: objectName,
        contentType: 'text/markdown',
        cacheControl: 'private, max-age=0, no-store',
        metadata: {
          artifactContentHash: artifact.artifactHash,
          rawSha256: rawSha256(artifact.markdown),
          tenantId: tenantId.toLowerCase(),
          runId: runId.toLowerCase(),
          artifactId: artifact.artifactId.toLowerCase(),
          schemaVersion: String(artifact.payload?.schemaVersion || 'axwise.final-markdown.v1'),
        },
      };
      const upload = multipartUpload(metadata, artifact.markdown, artifact.artifactHash);
      const bucket = encodeURIComponent(bucketName);
      const encodedObject = encodeURIComponent(objectName);
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart&ifGenerationMatch=0`;

      try {
        const response = await call({
          method: 'POST',
          url: uploadUrl,
          headers: { 'content-type': upload.contentType },
          data: upload.body,
        });
        return {
          created: true,
          bucket: bucketName,
          objectName,
          generation: String(response.data?.generation || ''),
          uri: `gs://${bucketName}/${objectName}`,
          artifactContentHash: artifact.artifactHash,
          rawSha256: metadata.metadata.rawSha256,
        };
      } catch (error) {
        if (Number(responseStatus(error)) !== 412) throw error;
        const response = await call({
          method: 'GET',
          url: `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedObject}`,
        });
        assertExistingObject(response.data, metadata);
        const mediaResponse = await call({
          method: 'GET',
          url: `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedObject}?alt=media`,
          responseType: 'arraybuffer',
        });
        const existingBytes = Buffer.isBuffer(mediaResponse.data)
          ? mediaResponse.data
          : Buffer.from(mediaResponse.data);
        const expectedBytes = Buffer.from(artifact.markdown, 'utf8');
        if (
          rawBufferSha256(existingBytes) !== metadata.metadata.rawSha256 ||
          !existingBytes.equals(expectedBytes)
        ) {
          throw new FinalArtifactExportError(
            'GCS_EXPORT_CONFLICT',
            'the create-only object bytes differ from the DB-authoritative Markdown'
          );
        }
        return {
          created: false,
          bucket: bucketName,
          objectName,
          generation: String(response.data?.generation || ''),
          uri: `gs://${bucketName}/${objectName}`,
          artifactContentHash: artifact.artifactHash,
          rawSha256: metadata.metadata.rawSha256,
        };
      }
    },
  };
}
