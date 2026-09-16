import { describe, it, expect, vi, beforeEach } from 'vitest';

const U = '11111111-1111-4111-8111-111111111111';
const G = '22222222-2222-4222-8222-222222222222';

// vi.hoisted lets us share state with mock factories that get hoisted to
// the top of the file. Without this, the factories run before the const
// declarations exist.
const mocks = vi.hoisted(() => {
  const insertedRows = [];
  const mockBackend = {
    isPlatformDefault: true,
    upload: vi.fn(),
    signedUrl: vi.fn(),
    delete: vi.fn(),
  };
  const mockUserBackend = {
    isPlatformDefault: false,
    connectionId: 'conn-1',
    upload: vi.fn(),
    signedUrl: vi.fn(),
    delete: vi.fn(),
  };
  const resolveCurrentConnection = vi.fn();
  const getStorageQuotaRemaining = vi.fn();
  const mockAdmin = {
    from: vi.fn(() => ({
      insert: vi.fn((row) => {
        insertedRows.push(row);
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: 'artifact-1',
                storage_path: row.storage_path,
                storage_bucket: row.storage_bucket,
                public_url: row.public_url,
                bytes: row.bytes,
                storage_connection_id: row.storage_connection_id,
              },
              error: null,
            })),
          })),
        };
      }),
    })),
  };
  return { insertedRows, mockBackend, mockUserBackend, resolveCurrentConnection, getStorageQuotaRemaining, mockAdmin };
});

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => mocks.mockAdmin,
}));

vi.mock('../security/storage-connections.js', () => ({
  resolveCurrentConnection: mocks.resolveCurrentConnection,
}));

vi.mock('../security/user-quotas.js', () => ({
  getStorageQuotaRemaining: mocks.getStorageQuotaRemaining,
}));

vi.mock('./backends/supabase.js', () => ({
  platformDefault: mocks.mockBackend,
  userConnectedBackend: () => mocks.mockUserBackend,
}));

const { upload } = await import('./writer.js');

beforeEach(() => {
  mocks.insertedRows.length = 0;
  mocks.mockBackend.upload.mockReset().mockImplementation(async ({ path }) => ({ path, bucket: 'goal-deliverables', publicUrl: 'https://example/x' }));
  mocks.mockUserBackend.upload.mockReset().mockImplementation(async ({ path }) => ({ path, bucket: 'my-bucket', publicUrl: 'https://user/x' }));
  mocks.resolveCurrentConnection.mockReset().mockResolvedValue(null);
  mocks.getStorageQuotaRemaining.mockReset().mockResolvedValue(100 * 1024 * 1024);
});

describe('StorageWriter.upload', () => {
  it('uploads to platform default and records a goal_artifacts row', async () => {
    const result = await upload({
      userId: U,
      goalId: G,
      kind: 'pdf',
      filename: 'report.pdf',
      bytes: Buffer.from('hello world'),
      mime: 'application/pdf',
      source: 'unit-test',
    });

    expect(result.artifactId).toBe('artifact-1');
    expect(result.storagePath).toBe(`${U}/${G}/pdf/report.pdf`);
    expect(result.bytes).toBe(11);
    expect(result.connectionId).toBeNull();

    // Backend was called with the canonical path.
    expect(mocks.mockBackend.upload).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${U}/${G}/pdf/report.pdf` }),
    );

    // Row was inserted with the right shape.
    expect(mocks.insertedRows).toHaveLength(1);
    const row = mocks.insertedRows[0];
    expect(row.goal_id).toBe(G);
    expect(row.user_id).toBe(U);
    expect(row.kind).toBe('pdf');
    expect(row.filename).toBe('report.pdf');
    expect(row.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('routes to user-connected backend when BYOS is configured', async () => {
    mocks.resolveCurrentConnection.mockResolvedValue({
      connectionId: 'conn-1',
      credential: JSON.stringify({ url: 'https://x.supabase.co', serviceRoleKey: 'srk' }),
      metadata: { bucket: 'my-bucket' },
      kind: 'supabase',
    });

    const result = await upload({
      userId: U,
      goalId: G,
      kind: 'image',
      filename: 'photo.png',
      bytes: Buffer.from('binary'),
      mime: 'image/png',
    });

    expect(result.connectionId).toBe('conn-1');
    expect(mocks.insertedRows[0].storage_connection_id).toBe('conn-1');
  });

  it('rejects malformed paths via assertValidPath', async () => {
    await expect(upload({
      userId: 'not-a-uuid',
      goalId: G,
      kind: 'pdf',
      filename: 'x.pdf',
      bytes: Buffer.from('a'),
    })).rejects.toThrow(/userId must be a UUID/);
  });

  it('rejects unknown kind', async () => {
    await expect(upload({
      userId: U,
      goalId: G,
      kind: 'malware',
      filename: 'x',
      bytes: Buffer.from('a'),
    })).rejects.toThrow(/kind "malware" not in allowed/);
  });

  it('enforces storage quota on platform default', async () => {
    mocks.getStorageQuotaRemaining.mockResolvedValue(10); // 10 bytes left
    await expect(upload({
      userId: U,
      goalId: G,
      kind: 'pdf',
      filename: 'big.pdf',
      bytes: Buffer.from('this is more than ten bytes'),
    })).rejects.toThrow(/STORAGE_QUOTA_EXCEEDED/);
  });

  it('does NOT enforce platform-default quota when BYOS is connected', async () => {
    mocks.resolveCurrentConnection.mockResolvedValue({
      connectionId: 'conn-1',
      credential: JSON.stringify({ url: 'https://x.supabase.co', serviceRoleKey: 'srk' }),
      metadata: {},
      kind: 'supabase',
    });
    mocks.getStorageQuotaRemaining.mockResolvedValue(0); // platform full

    const result = await upload({
      userId: U,
      goalId: G,
      kind: 'pdf',
      filename: 'x.pdf',
      bytes: Buffer.from('a million bytes'),
    });
    expect(result.artifactId).toBe('artifact-1'); // succeeded — BYOS bypasses
  });

  it('sanitizes the filename', async () => {
    const result = await upload({
      userId: U,
      goalId: G,
      kind: 'pdf',
      filename: 'report with spaces!.pdf',
      bytes: Buffer.from('a'),
    });
    // Sanitization replaces spaces and ! with -
    expect(result.storagePath).toBe(`${U}/${G}/pdf/report-with-spaces-.pdf`);
  });

  it('requires userId and goalId', async () => {
    await expect(upload({ userId: null, goalId: G, kind: 'pdf', filename: 'x', bytes: Buffer.from('a') }))
      .rejects.toThrow(/userId and goalId are required/);
    await expect(upload({ userId: U, goalId: null, kind: 'pdf', filename: 'x', bytes: Buffer.from('a') }))
      .rejects.toThrow(/userId and goalId are required/);
  });
});
