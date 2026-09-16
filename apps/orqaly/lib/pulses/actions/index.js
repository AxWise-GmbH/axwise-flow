/**
 * Pulse action registry. Each handler is `async (admin, pulse, { req }) =>
 * outcome` returning a small JSON blob that lands in pulse_runs.outcome.
 *
 * Adding a new pulse type = drop a new file in this folder + register in
 * ACTIONS below.
 */
import { handleArchivalSweep } from './archival-sweep.js';
import { handleBackupDatabase } from './backup-database.js';
import { handleKpiAnomalyScan } from './kpi-anomaly-scan.js';
import { handleReprioritizeRoadmap } from './reprioritize-roadmap.js';
import { handleRefreshCredentials } from './refresh-credentials.js';
import { handleExportDashboard } from './export-dashboard.js';
import { handleScheduledReport } from './scheduled-report.js';
import { handleRunInstruction } from './run-instruction.js';
import { handleSyncKbSources } from './sync-kb-sources.js';
import { handleSnapshotStorageMetrics } from './snapshot-storage-metrics.js';

export const ACTIONS = {
  'archival-sweep': handleArchivalSweep,
  'backup-database': handleBackupDatabase,
  'kpi-anomaly-scan': handleKpiAnomalyScan,
  'reprioritize-roadmap': handleReprioritizeRoadmap,
  'refresh-credentials': handleRefreshCredentials,
  'export-dashboard': handleExportDashboard,
  'scheduled-report': handleScheduledReport,
  'run-instruction': handleRunInstruction,
  'sync-kb-sources': handleSyncKbSources,
  'snapshot-storage-metrics': handleSnapshotStorageMetrics,
};
