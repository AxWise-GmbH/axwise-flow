import express from 'express';
import { createActivityExecutor } from './activity-executor.js';
import { createAxWiseClient } from './axwise-client.js';
import { createFinalArtifactExporter } from './final-artifact-exporter.js';
import { createInternalActivityExecutor } from './internal-activity-executor.js';
import { createPostgresRepositories } from './postgres-repository.js';
import { capabilityWorkEnabledFromEnvironment } from './capability-work-config.js';
import { createWorkerEngine } from './worker-engine.js';
import { createWorkerLifecycle, workerErrorMetadata } from './worker-lifecycle.js';
import { createSolutionBuildService } from './solution-build-service.js';
import { nativeWorkflowBuilderEnabledFromEnvironment } from './native-workflow-config.js';
import { solutionRuntimeFromEnvironment } from './solution-runtime.js';
import {
  solutionSchedulesEnabledFromEnvironment,
  solutionScheduleEnvironmentIdsFromEnvironment,
} from './native-workflow-config.js';
import { createSolutionScheduleService } from './solution-schedule-service.js';
import { createSolutionService } from './solution-service.js';
import { createSolutionConversationService } from './solution-conversation-service.js';
import { solutionConversationEnabledFromEnvironment } from '../../shared/workflow-v2/solution-conversation-contracts.js';
import {
  codingWorkerFromEnvironment,
  codingWorkerConfiguredFromEnvironment,
} from './coding-worker-config.js';

const environment = process.env.ORQALY_ENVIRONMENT;
const enableNativeWorkflows = nativeWorkflowBuilderEnabledFromEnvironment();
const enableSolutionConversations = solutionConversationEnabledFromEnvironment(process.env);
const enableCapabilityWork = capabilityWorkEnabledFromEnvironment();
const scheduleEnvironmentIds = solutionScheduleEnvironmentIdsFromEnvironment();
const repository = createPostgresRepositories({
  environment,
  workerDatabaseUrl: process.env.ORQALY_WORKER_DATABASE_URL,
  requireSolutionBuilds: true,
  requireNativeWorkflowBuilds: enableNativeWorkflows,
  requireRevisionConnections: enableNativeWorkflows,
  requireSolutionConversations: enableSolutionConversations,
  requireSolutionSchedules: solutionSchedulesEnabledFromEnvironment(),
  requireCoding: codingWorkerConfiguredFromEnvironment(),
  requireCapabilityWork: enableCapabilityWork,
});
const axwiseConfigured = Boolean(process.env.AXWISE_SERVICE_URL);
const artifactExportConfigured = Boolean(process.env.ORQALY_ARTIFACT_BUCKET);
const unavailableAxWiseClient = {
  submit: async () => {
    throw new Error('AXWISE_SERVICE_URL is not configured');
  },
  poll: async () => {
    throw new Error('AXWISE_SERVICE_URL is not configured');
  },
  deterministicStatusUrl: () => {
    throw new Error('AXWISE_SERVICE_URL is not configured');
  },
};
const axwiseClient = axwiseConfigured
  ? createAxWiseClient({ baseUrl: process.env.AXWISE_SERVICE_URL })
  : unavailableAxWiseClient;
const buildService = createSolutionBuildService({
  repository,
  axwiseClient: axwiseConfigured ? axwiseClient : null,
  runtime: enableNativeWorkflows ? solutionRuntimeFromEnvironment() : null,
  enableNativeWorkflows,
});
const workerId = process.env.K_SERVICE || `orqaly-worker-${environment}`;
const scheduleRuntime = solutionRuntimeFromEnvironment();
const solutionConversationService = createSolutionConversationService({
  repository,
  runtime: scheduleRuntime,
  axwiseClient: axwiseConfigured ? axwiseClient : null,
  enabled: enableSolutionConversations,
});
const codingWorkerService = codingWorkerFromEnvironment({ repository, runtime: scheduleRuntime });
const scheduleService = createSolutionScheduleService({
  repository,
  solutionService: createSolutionService({ repository, runtime: scheduleRuntime }),
  enabled: solutionSchedulesEnabledFromEnvironment(),
  environmentIds: scheduleEnvironmentIds,
});
const activityExecutor = createActivityExecutor({
  axwiseClient,
  internalExecutor: createInternalActivityExecutor(),
});
const engine = createWorkerEngine({
  capabilityWorkEnabled: enableCapabilityWork,
  repository,
  activityExecutor,
  finalArtifactExporter: artifactExportConfigured ? createFinalArtifactExporter() : null,
  workerId,
  deploymentId: process.env.K_REVISION || 'local',
});

let lastResult = { status: 'starting' };
const queues = [
  {
    name: 'iteration',
    run: async () => {
      lastResult = await engine.processOne();
      if (lastResult.status !== 'idle') {
        console.log('workflow-v2 worker iteration', {
          status: lastResult.status,
          ...lastResult.trace,
        });
      }
    },
  },
  // Independent bounded work: a failed build must not starve research, and
  // neither queue may monopolize the worker while the other has pending work.
  {
    name: 'solution preparation',
    run: async () => {
      const build = await buildService.advancePending({ workerId });
      if (build.processed) {
        console.log('workflow-v2 solution preparation', { buildRequestId: build.buildRequestId });
        if (lastResult.status === 'idle') lastResult = { status: 'build_processed' };
      }
    },
  },
  {
    name: 'solution conversation',
    run: async () => {
      const turn = await solutionConversationService.advanceOne();
      if (turn.processed)
        console.log('workflow-v2 solution conversation', {
          turnId: turn.turnId,
          status: turn.status,
        });
    },
  },
  {
    name: 'schedule',
    run: async () => {
      const tick = await scheduleService.advanceOne();
      if (tick.processed)
        console.log('workflow-v2 schedule', {
          status: tick.status,
          invocationId: tick.invocationId,
        });
    },
  },
  {
    name: 'coding job',
    run: async () => {
      const job = await codingWorkerService?.advanceOne();
      if (job?.processed)
        console.log('workflow-v2 coding job', { jobId: job.jobId, status: job.status });
    },
  },
];

const app = express();
app.disable('x-powered-by');
let server;
const lifecycle = createWorkerLifecycle({
  readiness: async () => {
    if (!axwiseConfigured || !artifactExportConfigured) {
      throw Object.assign(new Error('worker configuration incomplete'), {
        code: 'WORKER_CONFIGURATION_INCOMPLETE',
      });
    }
    return repository.readiness();
  },
  queues,
  delayMs: () => (['idle', 'error'].includes(lastResult.status) ? 500 : 25),
  onQueueError: (queue, metadata) => {
    if (queue === 'iteration') {
      lastResult = { status: 'error', ...metadata };
      console.error('workflow-v2 worker iteration failed', lastResult);
    } else {
      console.error(`workflow-v2 ${queue} failed`, metadata);
    }
  },
  onStartupRetry: (metadata) => console.warn('workflow-v2 worker readiness retry', metadata),
  onReady: () =>
    console.log('workflow-v2 worker ready', {
      revision: process.env.K_REVISION || 'local',
    }),
  onFatal: (metadata) => {
    console.error('workflow-v2 worker startup failed', metadata);
    void shutdown('startup_failure', 1);
  },
  closeServer: () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  closeRepository: () => repository.close(),
  exit: (code) => {
    console.log('workflow-v2 worker stopped', { phase: lifecycle.state().phase, exitCode: code });
    process.exit(code);
  },
});
app.get('/healthz', (_req, res) => {
  const { stopping, phase } = lifecycle.state();
  res.status(stopping ? 503 : 200).json({
    status: stopping ? 'unavailable' : 'ok',
    worker: lastResult.status,
    phase,
  });
});
app.get('/readyz', async (_req, res) => {
  try {
    const database = await lifecycle.checkReadiness();
    if (lifecycle.state().stopping)
      return res.status(503).json({ status: 'unavailable', code: 'WORKER_STOPPING' });
    res.status(200).json({ status: 'ok', ...database, axwise: 'configured', export: 'configured' });
  } catch (error) {
    res.status(503).json({ status: 'unavailable', ...workerErrorMetadata(error) });
  }
});
server = app.listen(Number(process.env.PORT || 8080), () => {
  console.log('workflow-v2 worker listening', {
    environment,
    revision: process.env.K_REVISION || 'local',
  });
  void lifecycle.start();
});

function shutdown(signal, exitCode = 0) {
  if (!lifecycle.state().stopping) console.log('workflow-v2 worker stopping', { signal });
  return lifecycle.shutdown(exitCode);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
