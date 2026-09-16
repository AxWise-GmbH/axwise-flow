/**
 * Ops core: single serverless function for heavy/long-running API routes.
 * Dispatches by path (data-topology, reports, report-ingest, campaigns).
 * Static imports so Vercel bundler includes all handlers (dynamic import can omit files at deploy).
 */
import { jsonError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { stripRouteKey } from './_lib/route-key.js';
import { enforceDemoWriteGuard } from './_lib/demo-guard.js';
import { createLogger } from './_lib/logger.js';

const log = createLogger('ops');
import dataTopology from '../lib/ops-handlers/data-topology.js';
import reports from '../lib/ops-handlers/reports.js';
import reportInsights from '../lib/ops-handlers/report-insights.js';
import reportIngest from '../lib/ops-handlers/report-ingest.js';
import campaigns from '../lib/ops-handlers/campaigns.js';
import browserTask from '../lib/ops-handlers/browser-task.js';
import readSource from '../lib/ops-handlers/read-source.js';
import tablePreview from '../lib/ops-handlers/table-preview.js';
import toggleFeature from '../lib/ops-handlers/toggle-feature.js';
import goalTrace from '../lib/ops-handlers/goal-trace.js';
import scanLibraryEndpoints from '../lib/ops-handlers/scan-library-endpoints.js';
import snapshotReportKpis from '../lib/ops-handlers/snapshot-report-kpis.js';
import pulseTick from '../lib/ops-handlers/pulse-tick.js';
import processMaps from '../lib/ops-handlers/process-maps.js';
import usageAnalytics from '../lib/usage-handlers/usage-analytics.js';
import usageDirectory from '../lib/usage-handlers/usage-directory.js';

const HANDLERS = {
  'data-topology': dataTopology,
  reports,
  'report-insights': reportInsights,
  'report-ingest': reportIngest,
  campaigns,
  'browser-task': browserTask,
  'read-source': readSource,
  'table-preview': tablePreview,
  'toggle-feature': toggleFeature,
  'goal-trace': goalTrace,
  'scan-library-endpoints': scanLibraryEndpoints,
  'snapshot-report-kpis': snapshotReportKpis,
  'pulse-tick': pulseTick,
  'process-maps': processMaps,
  'usage-analytics': usageAnalytics,
  'usage-directory': usageDirectory,
};

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const path = (req.query?.path || '').trim().toLowerCase();
  stripRouteKey(req);
  const fn = HANDLERS[path];
  if (!fn) {
    log.warn(req, 'route.not_found', { path });
    return jsonError(res, 404, 'Not found');
  }
  if (await enforceDemoWriteGuard(req, res)) return;
  const done = log.startTimer(req, 'request', { method: req.method, path });
  try {
    const result = await fn(req, res);
    done({ status: res.statusCode });
    return result;
  } catch (err) {
    done({ status: 500, error: err?.message });
    return jsonError(res, 500, err?.message || 'Handler error');
  }
}
