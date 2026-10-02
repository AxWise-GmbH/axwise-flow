import { createAssistantService } from './assistant-service.js';
import { createAgentService } from './agent-service.js';
import { createAgenticControlPlaneClientFromEnvironment } from './agentic-control-plane-client.js';
import { createAxWiseClient } from './axwise-client.js';
import { createWorkflowCommandService } from './command-service.js';
import { createGoalWorkflowViewService } from './goal-workflow-view-service.js';
import { createCapabilityWorkService } from './capability-work-service.js';
import { capabilityWorkEnabledFromEnvironment } from './capability-work-config.js';
import { createExecutableActionRuntimeFromEnvironment } from './executable-action-runtime.js';
import { createExecutableActionService } from './executable-action-service.js';
import {
  createMemoryRateLimiter,
  createWorkflowHttpApp,
  isClerkEnvironmentConfigured,
} from './http-app.js';
import { createGooseProviderFromEnvironment } from './goose-provider-config.js';
import { createDesktopContextService } from './desktop-context-service.js';
import { createDesktopWorkService } from './desktop-work-service.js';
import {
  agentEvaluationConfigFromEnvironment,
  createAgentEvaluationOidcVerifier,
} from './agent-evaluation-config.js';
import { createAgentEvaluationService } from './agent-evaluation-service.js';
import { createAgentEvaluationRouter } from './agent-evaluation-http.js';
import { createEngineeringReviewService } from './engineering-review-service.js';
import { createPostgresRepositories } from './postgres-repository.js';
import { createSolutionService } from './solution-service.js';
import { createSolutionConversationService } from './solution-conversation-service.js';
import { solutionConversationEnabledFromEnvironment } from '../../shared/workflow-v2/solution-conversation-contracts.js';
import { solutionRuntimeFromEnvironment } from './solution-runtime.js';
import { createSolutionRevisionService } from './solution-revision-service.js';
import { createSolutionFailureProbeService } from './solution-failure-probe-service.js';
import { nativeN8nGatewayFromEnvironment } from './native-n8n-config.js';
import { createSolutionBuildService } from './solution-build-service.js';
import { createSolutionApplicationKeyService } from './solution-application-key-service.js';
import { createUserQuotaService } from './user-quota-service.js';
import { desktopAdminAccessFromEnvironment } from './desktop-admin-access.js';
import { nativeWorkflowBuilderEnabledFromEnvironment } from './native-workflow-config.js';
import {
  solutionSchedulesEnabledFromEnvironment,
  solutionScheduleEnvironmentIdsFromEnvironment,
} from './native-workflow-config.js';
import { createSolutionScheduleService } from './solution-schedule-service.js';
import {
  codingWorkerFromEnvironment,
  codingWorkerConfiguredFromEnvironment,
} from './coding-worker-config.js';

const enableNativeWorkflows = nativeWorkflowBuilderEnabledFromEnvironment();
const enableSolutionConversations = solutionConversationEnabledFromEnvironment(process.env);
const enableCapabilityWork = capabilityWorkEnabledFromEnvironment();
const scheduleEnvironmentIds = solutionScheduleEnvironmentIdsFromEnvironment();

const repository = createPostgresRepositories({
  environment: process.env.ORQALY_ENVIRONMENT,
  identityDatabaseUrl: process.env.ORQALY_IDENTITY_DATABASE_URL,
  apiDatabaseUrl: process.env.ORQALY_API_DATABASE_URL,
  workerDatabaseUrl: null,
  requireSolutionBuilds: true,
  requireSolutionApplicationKeys: true,
  requireNativeWorkflowBuilds: enableNativeWorkflows,
  requireRevisionConnections: enableNativeWorkflows,
  requireFailureProbes: enableNativeWorkflows,
  requireSolutionConversations: enableSolutionConversations,
  requireSolutionSchedules: solutionSchedulesEnabledFromEnvironment(),
  requireCoding: codingWorkerConfiguredFromEnvironment(),
  requireCapabilityWork: enableCapabilityWork,
});
const commandService = createWorkflowCommandService({
  repository,
  identityConfigured: isClerkEnvironmentConfigured(),
});
const axwiseClient = createAxWiseClient({ baseUrl: process.env.AXWISE_SERVICE_URL });
const agenticControlPlaneClient = createAgenticControlPlaneClientFromEnvironment();
const agentService = agenticControlPlaneClient
  ? createAgentService({ repository, controlPlaneClient: agenticControlPlaneClient })
  : null;
const assistantService = createAssistantService({
  repository,
  workflowCommandService: commandService,
  axwiseClient,
  agentService,
});
const desktopWorkService = createDesktopWorkService({
  assistantService,
  contextService: createDesktopContextService({ commandService }),
});
const agentEvaluationConfig = agentEvaluationConfigFromEnvironment();
const agentEvaluationEngineeringReview = agentEvaluationConfig
  ? createEngineeringReviewService({
      desktopWorkService,
      apiKey: process.env.TYPESAFE_API_KEY,
      timeoutMs: 20_000,
    })
  : null;
const agentEvaluationService = agentEvaluationConfig
  ? createAgentEvaluationService({
      assistantService,
      userId: agentEvaluationConfig.userId,
      geminiApiKey: process.env.ORQALY_GOOSE_GEMINI_API_KEY,
      typesafeApiKey: process.env.TYPESAFE_API_KEY,
    })
  : null;
const agentEvaluationRouter = agentEvaluationConfig
  ? createAgentEvaluationRouter({
      config: agentEvaluationConfig,
      service: agentEvaluationService,
      commandService,
      oidcVerifier: createAgentEvaluationOidcVerifier(agentEvaluationConfig),
      geminiApiKey: process.env.ORQALY_GOOSE_GEMINI_API_KEY,
      engineeringReviewService: agentEvaluationEngineeringReview,
      rateLimiter: createMemoryRateLimiter({ limit: 60 }),
    })
  : null;
// Missing execution configuration is an explicit disabled mode. Partial,
// malformed or hash-drifted configuration is a startup failure: a candidate
// revision must never look healthy while silently dropping execution.
const executableRuntime = await createExecutableActionRuntimeFromEnvironment(process.env);
const executableActionService = createExecutableActionService({
  repository,
  n8nExecutor: executableRuntime.n8nExecutor,
  bindingManifest: executableRuntime.bindingManifest,
});
const solutionRuntime = solutionRuntimeFromEnvironment();
const solutionService = createSolutionService({
  repository,
  agentService,
  runtime: solutionRuntime,
});
const codingWorkerService = codingWorkerFromEnvironment({ repository, runtime: solutionRuntime });
const solutionRevisionService = createSolutionRevisionService({
  repository,
  runtime: solutionRuntime,
});
const solutionFailureProbeService = createSolutionFailureProbeService({
  repository,
  runtime: solutionRuntime,
  enabled: enableNativeWorkflows,
});
const solutionScheduleService = createSolutionScheduleService({
  repository,
  solutionService,
  enabled: solutionSchedulesEnabledFromEnvironment(),
  environmentIds: scheduleEnvironmentIds,
});
const solutionBuildService = createSolutionBuildService({
  repository,
  agentService,
  axwiseClient,
  runtime: solutionRuntime,
  enableNativeWorkflows,
});
const solutionConversationService = createSolutionConversationService({
  repository,
  runtime: solutionRuntime,
  enabled: enableSolutionConversations,
});
const solutionApplicationKeyService = createSolutionApplicationKeyService({
  repository,
  solutionService,
  environment: process.env.ORQALY_ENVIRONMENT,
});
const nativeN8nGateway = nativeN8nGatewayFromEnvironment({
  solutionService,
  revisionService: solutionRevisionService,
  buildService: solutionBuildService,
});
const resolveAdminUser = desktopAdminAccessFromEnvironment();
const userQuotaService = createUserQuotaService({ pool: repository.apiPool, isUnlimitedUser: resolveAdminUser });
const app = createWorkflowHttpApp({
  commandService,
  gooseProviderRouter: createGooseProviderFromEnvironment({
    commandService,
    rateLimiter: createMemoryRateLimiter({ limit: 30 }),
    desktopWorkService,
    userQuotaService,
    resolveAdminUser,
  }),
  agentEvaluationRouter,
  goalWorkflowViewService: createGoalWorkflowViewService({ repository }),
  capabilityWorkService: createCapabilityWorkService({ repository, enabled: enableCapabilityWork }),
  assistantService,
  agentService,
  executableActionService,
  executionConfigured: executableRuntime.configured,
  solutionService,
  solutionRevisionService,
  solutionFailureProbeService,
  solutionBuildService,
  solutionApplicationKeyService,
  solutionScheduleService,
  solutionConversationService,
  codingWorkerService,
  nativeN8nGateway,
});
const port = Number(process.env.PORT || 8080);
const server = app.listen(port, () => {
  console.log('workflow-v2 api listening', {
    port,
    environment: process.env.ORQALY_ENVIRONMENT,
    revision: process.env.K_REVISION || 'local',
    executionConfigured: executableRuntime.configured,
  });
});

async function shutdown(signal) {
  console.log('workflow-v2 api stopping', { signal });
  server.close(async () => {
    await repository.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
