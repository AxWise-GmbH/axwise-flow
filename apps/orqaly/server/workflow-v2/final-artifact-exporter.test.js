import { describe, expect, it, vi } from 'vitest';
import { artifactContentHash } from '../../lib/workflow-v2/canonical.js';
import {
  FinalArtifactExportError,
  createFinalArtifactExporter,
  finalArtifactObjectName,
} from './final-artifact-exporter.js';

const tenantId = '10000000-0000-4000-8000-000000000001';
const runId = '20000000-0000-4000-8000-000000000002';
const artifactId = '30000000-0000-4000-8000-000000000003';

function finalArtifact(markdown = '# Final\n\nEvidence-aware result.') {
  const artifact = {
    artifactId,
    kind: 'final_markdown',
    contentType: 'text/markdown',
    payload: { schemaVersion: 'axwise.final-markdown.v1' },
    markdown,
  };
  return { ...artifact, artifactHash: artifactContentHash(artifact) };
}

describe('final Markdown GCS exporter', () => {
  it('uses a deterministic tenant/run/artifact path and create-only generation precondition', async () => {
    const request = vi.fn().mockResolvedValue({ data: { generation: '7' } });
    const exporter = createFinalArtifactExporter({
      bucketName: 'axwise-v2-preview-001-orqaly-v2-preview-artifacts',
      request,
    });
    const artifact = finalArtifact();

    const result = await exporter.exportFinalMarkdown({ tenantId, runId, artifact });

    expect(result).toMatchObject({
      created: true,
      generation: '7',
      objectName: `tenants/${tenantId}/runs/${runId}/artifacts/${artifactId}/${artifact.artifactHash}.md`,
      artifactContentHash: artifact.artifactHash,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('uploadType=multipart&ifGenerationMatch=0'),
        data: expect.stringContaining(`"artifactContentHash":"${artifact.artifactHash}"`),
      })
    );
    expect(request.mock.calls[0][0].data).toContain('"rawSha256"');
    expect(request.mock.calls[0][0].data).toContain(
      'Content-Type: text/markdown\r\n\r\n'
    );
    expect(request.mock.calls[0][0].data).not.toContain(
      'Content-Type: text/markdown;'
    );
    expect(request.mock.calls[0][0].data).toContain(artifact.markdown);
  });

  it('exports a grouped source row byte-for-byte without rewriting the Markdown', async () => {
    const claimId = 'a'.repeat(64);
    const sourceRow =
      `- \`[evidence:${claimId}]\` — EU Feed Law Register — ` +
      'https://example.eu/feed-law — class: `primary_law` — ' +
      'retrieved: `2026-08-27T12:00:00Z` — ' +
      'section: Evidence decision · Remediation plan — supported claim: Exact legal fact.';
    const markdown = [
      '# Evidence decision',
      '',
      `Exact legal fact [evidence:${claimId}].`,
      '',
      '## Sources',
      '',
      sourceRow,
      '',
    ].join('\n');
    const artifact = finalArtifact(markdown);
    const request = vi.fn().mockResolvedValue({ data: { generation: '11' } });
    const exporter = createFinalArtifactExporter({
      bucketName: 'axwise-v2-preview-001-orqaly-v2-preview-artifacts',
      request,
    });

    await exporter.exportFinalMarkdown({ tenantId, runId, artifact });

    const uploadBody = request.mock.calls[0][0].data;
    expect(uploadBody).toContain(markdown);
    expect(uploadBody.match(/section: Evidence decision · Remediation plan/gu)).toHaveLength(1);
  });

  it('adopts an identical immutable object after a create-only replay', async () => {
    const artifact = finalArtifact();
    const objectName = finalArtifactObjectName({
      tenantId,
      runId,
      artifactId,
      artifactHash: artifact.artifactHash,
    });
    const first = Object.assign(new Error('precondition'), { response: { status: 412 } });
    const request = vi
      .fn()
      .mockRejectedValueOnce(first)
      .mockResolvedValueOnce({
        data: {
          name: objectName,
          contentType: 'text/markdown',
          generation: '9',
          metadata: {
            artifactContentHash: artifact.artifactHash,
            rawSha256: '4449617381f09bc0bbdc67d0dbffed3dc4b3125c459018257107c1f450114e05',
            tenantId,
            runId,
            artifactId,
          },
        },
      })
      .mockResolvedValueOnce({ data: Buffer.from(artifact.markdown, 'utf8') });
    const exporter = createFinalArtifactExporter({
      bucketName: 'axwise-v2-preview-001-orqaly-v2-preview-artifacts',
      request,
    });

    await expect(
      exporter.exportFinalMarkdown({ tenantId, runId, artifact })
    ).resolves.toMatchObject({
      created: false,
      generation: '9',
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1][0]).toMatchObject({ method: 'GET' });
    expect(request.mock.calls[2][0]).toMatchObject({
      method: 'GET',
      responseType: 'arraybuffer',
      url: expect.stringContaining('?alt=media'),
    });
  });

  it('fails closed when the DB artifact hash or existing object metadata differs', async () => {
    const badArtifact = { ...finalArtifact(), artifactHash: 'f'.repeat(64) };
    const exporter = createFinalArtifactExporter({
      bucketName: 'axwise-v2-preview-001-orqaly-v2-preview-artifacts',
      request: vi.fn(),
    });
    await expect(
      exporter.exportFinalMarkdown({ tenantId, runId, artifact: badArtifact })
    ).rejects.toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });

    const artifact = finalArtifact();
    const precondition = Object.assign(new Error('precondition'), { response: { status: 412 } });
    const conflictRequest = vi
      .fn()
      .mockRejectedValueOnce(precondition)
      .mockResolvedValueOnce({
        data: {
          name: finalArtifactObjectName({
            tenantId,
            runId,
            artifactId,
            artifactHash: artifact.artifactHash,
          }),
          contentType: 'text/markdown',
          metadata: { artifactContentHash: '0'.repeat(64) },
        },
      });
    const conflictExporter = createFinalArtifactExporter({
      bucketName: 'axwise-v2-preview-001-orqaly-v2-preview-artifacts',
      request: conflictRequest,
    });
    await expect(
      conflictExporter.exportFinalMarkdown({ tenantId, runId, artifact })
    ).rejects.toEqual(expect.any(FinalArtifactExportError));

    const byteConflictRequest = vi
      .fn()
      .mockRejectedValueOnce(precondition)
      .mockResolvedValueOnce({
        data: {
          name: finalArtifactObjectName({
            tenantId,
            runId,
            artifactId,
            artifactHash: artifact.artifactHash,
          }),
          contentType: 'text/markdown',
          metadata: {
            artifactContentHash: artifact.artifactHash,
            rawSha256: '4449617381f09bc0bbdc67d0dbffed3dc4b3125c459018257107c1f450114e05',
            tenantId,
            runId,
            artifactId,
          },
        },
      })
      .mockResolvedValueOnce({ data: Buffer.from('different bytes', 'utf8') });
    const byteConflictExporter = createFinalArtifactExporter({
      bucketName: 'axwise-v2-preview-001-orqaly-v2-preview-artifacts',
      request: byteConflictRequest,
    });
    await expect(
      byteConflictExporter.exportFinalMarkdown({ tenantId, runId, artifact })
    ).rejects.toMatchObject({ code: 'GCS_EXPORT_CONFLICT' });
  });
});
