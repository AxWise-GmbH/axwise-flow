#!/usr/bin/env node
/**
 * Production Quota & Prompt Cache Savings Audit Log Exporter
 * Exports aggregated usage, prompt cache hit rates, and net billing savings
 * in JSON or CSV format.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_PRICING_TABLE } from '../apps/orqaly/server/workflow-v2/user-quota-service.js';

export function formatQuotaAuditRecords(users = []) {
  return users.map((u) => {
    const prompt = u.tokens?.prompt || 0;
    const cached = u.tokens?.cached || 0;
    const completion = u.tokens?.completion || 0;
    const total = u.tokens?.total || (prompt + completion);
    const hitRate = prompt > 0 ? Number(((cached / prompt) * 100).toFixed(1)) : 0;

    // Gross cost without cache discount ($0.75 / 1M prompt, $3.75 / 1M completion)
    const baseInputPerM = MODEL_PRICING_TABLE['gemini-3.8-flash'].inputPerMillion;
    const baseOutputPerM = MODEL_PRICING_TABLE['gemini-3.8-flash'].outputPerMillion;

    const grossCostUsd = Number(((prompt * baseInputPerM + completion * baseOutputPerM) / 1_000_000).toFixed(4));
    const netCostUsd = Number((((prompt - cached) * baseInputPerM + cached * (baseInputPerM * 0.25) + completion * baseOutputPerM) / 1_000_000).toFixed(4));
    const savingsUsd = Number(Math.max(0, grossCostUsd - netCostUsd).toFixed(4));
    const savingsPct = grossCostUsd > 0 ? Number(((savingsUsd / grossCostUsd) * 100).toFixed(1)) : 0;

    return {
      userId: u.userId,
      planTier: u.planTier || 'free',
      monthlyLimitUsd: u.monthlyLimitCents ? Number((u.monthlyLimitCents / 100).toFixed(2)) : 5.0,
      spendUsd: Number(((u.spendCents || 0) / 100).toFixed(4)),
      promptTokens: prompt,
      cachedTokens: cached,
      cacheHitRatePct: hitRate,
      completionTokens: completion,
      totalTokens: total,
      grossCostUsd,
      netCostUsd,
      cacheSavingsUsd: savingsUsd,
      cacheSavingsPct: savingsPct,
      callCount: u.callCount || 0,
    };
  });
}

export function toCsv(records = []) {
  if (records.length === 0) return 'userId,planTier,spendUsd,promptTokens,cachedTokens,cacheHitRatePct,completionTokens,totalTokens,netCostUsd,cacheSavingsUsd,cacheSavingsPct,callCount\n';

  const headers = Object.keys(records[0]);
  const rows = records.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n') + '\n';
}

export async function exportQuotaAuditLogs({ users = [], outputDir = './audit-exports', format = 'both' } = {}) {
  await mkdir(outputDir, { recursive: true });
  const records = formatQuotaAuditRecords(users);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const outputs = {};
  if (format === 'json' || format === 'both') {
    const jsonPath = join(outputDir, `quota-audit-${timestamp}.json`);
    await writeFile(jsonPath, JSON.stringify(records, null, 2), 'utf8');
    outputs.json = jsonPath;
  }
  if (format === 'csv' || format === 'both') {
    const csvPath = join(outputDir, `quota-audit-${timestamp}.csv`);
    await writeFile(csvPath, toCsv(records), 'utf8');
    outputs.csv = csvPath;
  }
  return { count: records.length, outputs, records };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Demonstration / CLI runner with mock active users
  const sampleUsers = [
    {
      userId: 'user_live_enterprise_01',
      planTier: 'enterprise',
      monthlyLimitCents: 50000,
      spendCents: 1420,
      tokens: { prompt: 5968623, cached: 4544848, completion: 62752, total: 6031375 },
      callCount: 180,
    },
    {
      userId: 'user_live_team_02',
      planTier: 'team',
      monthlyLimitCents: 10000,
      spendCents: 685,
      tokens: { prompt: 2899102, cached: 1649341, completion: 46511, total: 2945613 },
      callCount: 168,
    },
    {
      userId: 'user_live_free_03',
      planTier: 'free',
      monthlyLimitCents: 500,
      spendCents: 125,
      tokens: { prompt: 2495599, cached: 1269958, completion: 22768, total: 2518367 },
      callCount: 163,
    },
  ];

  console.log('Exporting production quota audit logs...');
  const res = await exportQuotaAuditLogs({ users: sampleUsers, outputDir: './audit-exports' });
  console.log(`[DONE] Exported ${res.count} records:`);
  console.log(`  • JSON: ${res.outputs.json}`);
  console.log(`  • CSV:  ${res.outputs.csv}\n`);

  console.table(res.records.map(r => ({
    'User ID': r.userId,
    'Plan': r.planTier,
    'Prompt Tok': r.promptTokens.toLocaleString(),
    'Cached Tok': r.cachedTokens.toLocaleString(),
    'Cache Hit': `${r.cacheHitRatePct}%`,
    'Net Cost': `$${r.netCostUsd}`,
    'Saved ($)': `$${r.cacheSavingsUsd} (${r.cacheSavingsPct}%)`,
  })));
}
