import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatQuotaAuditRecords, toCsv, exportQuotaAuditLogs } from './export-production-quota-logs.mjs';

test('formatQuotaAuditRecords correctly computes cache hit rates and 75% savings', () => {
  const users = [
    {
      userId: 'test_user_1',
      planTier: 'enterprise',
      monthlyLimitCents: 5000,
      spendCents: 150,
      tokens: { prompt: 1000000, cached: 800000, completion: 50000 },
      callCount: 10,
    },
  ];

  const records = formatQuotaAuditRecords(users);
  assert.equal(records.length, 1);
  const r = records[0];
  assert.equal(r.userId, 'test_user_1');
  assert.equal(r.cacheHitRatePct, 80.0);
  assert.ok(r.cacheSavingsUsd > 0);
  assert.ok(r.cacheSavingsPct > 45);
});

test('exportQuotaAuditLogs writes valid JSON and CSV files to target directory', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'quota-export-test-'));
  try {
    const users = [
      {
        userId: 'u1',
        planTier: 'team',
        monthlyLimitCents: 2000,
        tokens: { prompt: 100000, cached: 60000, completion: 10000 },
        callCount: 5,
      },
    ];

    const res = await exportQuotaAuditLogs({ users, outputDir: tempDir });
    assert.equal(res.count, 1);
    assert.ok(res.outputs.json);
    assert.ok(res.outputs.csv);

    const jsonText = await readFile(res.outputs.json, 'utf8');
    const parsed = JSON.parse(jsonText);
    assert.equal(parsed[0].userId, 'u1');

    const csvText = await readFile(res.outputs.csv, 'utf8');
    assert.ok(csvText.includes('userId,planTier'));
    assert.ok(csvText.includes('"u1"'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
