import crypto from 'node:crypto';
import express from 'express';
import { z, ZodError } from 'zod';
import {
  PRINCIPAL_SCOPES,
  principalMiddleware,
  requireHumanPrincipal,
  requirePrincipalScope,
} from './auth/principal.js';
import { ApprovalDecisionRequestSchema } from './domain/approval-contracts.js';
import { evaluateTaskAdmission } from './domain/admission.js';
import { PlanVersionSubmissionSchema } from './domain/execution-contracts.js';
import {
  AGENT_STATES,
  AgentLifecycleRequestSchema,
  CreateAgentRequestSchema,
  MaterializeAgentRequestSchema,
  TaskAdmissionRequestSchema,
  UpdateAgentProfileRequestSchema,
} from './domain/contracts.js';
import { HttpError } from './http/errors.js';
import { createPrincipalRateLimiter } from './http/rate-limit.js';
import {
  changeAgentLifecycle,
  createAgent,
  getAgent,
  getRun,
  decideApproval,
  listAgentRuns,
  listAgents,
  listApprovals,
  materializeAgentTeam,
  submitExecutionPlanV2,
  updateAgentProfile,
} from './repositories/control-plane-repository.js';
import { parseCapabilities } from './services/capabilities.js';
import { withTenantTransaction } from './db/pool.js';

const RequestIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const UuidSchema = z.string().uuid();
const ListAgentsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    state: z.enum(AGENT_STATES).nullable().default(null),
  })
  .strict();
const ListApprovalsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: z
      .enum(['pending', 'approved', 'rejected', 'expired', 'superseded'])
      .nullable()
      .default('pending'),
  })
  .strict();
const ListAgentRunsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

function requestContext(req, res, next) {
  const requested = RequestIdSchema.safeParse(req.get('x-request-id'));
  req.requestId = requested.success ? requested.data : crypto.randomUUID();
  res.set('x-request-id', req.requestId);
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function expectedVersion(value) {
  const match = /^"?([1-9][0-9]*)"?$/.exec(value || '');
  if (!match) throw new HttpError(428, 'if_match_required');
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version)) throw new HttpError(400, 'if_match_invalid');
  return version;
}

function setAgentVersionEtag(res, agent) {
  res.set('ETag', `"${agent.version}"`);
}

function previewExecutionState(config) {
  // This service currently exposes the control-plane contracts only. Treat the
  // environment flag as operator intent, never as proof that the kernel, Gateway,
  // credentials, n8n workflow and reconciliation loop are actually ready.
  const executionRequested = config.AGENTIC_EXECUTION_ENABLED === true;
  return Object.freeze({
    executionRequested,
    executionEnabled: false,
    executionReady: false,
    executionStatus: executionRequested ? 'release_gated' : 'disabled',
  });
}

export function createApp({ config, pool, capabilities: capabilityOverride } = {}) {
  if (!config || !pool) throw new Error('config_and_pool_required');
  const capabilities = parseCapabilities(capabilityOverride ?? config.AGENTIC_CAPABILITIES_JSON);
  const execution = previewExecutionState(config);
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use((_, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/healthz', (_, res) => {
    res.json({
      service: 'orqaly-agentic-control-plane',
      status: 'ok',
      ...execution,
    });
  });
  app.get(
    '/readyz',
    asyncRoute(async (_, res) => {
      await pool.query('select 1');
      res.json({
        version: 'orqaly_agent_runtime_status_v1',
        service: 'orqaly-agentic-control-plane',
        status: 'ready',
        ...execution,
      });
    })
  );

  app.use(express.json({ limit: config.HTTP_JSON_LIMIT, type: 'application/json' }));
  app.use('/v1', principalMiddleware(config));
  app.use(
    '/v1',
    createPrincipalRateLimiter({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      maximumRequests: config.RATE_LIMIT_MAX_REQUESTS,
    })
  );

  app.post('/v1/task-admissions', requirePrincipalScope(PRINCIPAL_SCOPES.ADMIT), (req, res) => {
    const request = TaskAdmissionRequestSchema.parse(req.body);
    const result = evaluateTaskAdmission(request, capabilities);
    res.status(200).json({
      ...result,
      ...execution,
      dispatchable: result.executable && execution.executionReady,
    });
  });

  app.post(
    '/v1/agents/from-task',
    requirePrincipalScope(PRINCIPAL_SCOPES.MATERIALIZE),
    asyncRoute(async (req, res) => {
      const request = MaterializeAgentRequestSchema.parse(req.body);
      const headerKey = req.get('idempotency-key');
      if (!headerKey) throw new HttpError(400, 'idempotency_key_required');
      if (headerKey !== request.idempotencyKey) {
        throw new HttpError(400, 'idempotency_key_mismatch');
      }
      const result = await withTenantTransaction(pool, req.principal, (client) =>
        materializeAgentTeam(client, req.principal, request)
      );
      res.status(result.replayed ? 200 : 201).json({
        ...result,
        ...execution,
      });
    })
  );

  app.post(
    '/v1/agents',
    requirePrincipalScope(PRINCIPAL_SCOPES.AGENT_WRITE),
    requireHumanPrincipal,
    asyncRoute(async (req, res) => {
      const request = CreateAgentRequestSchema.parse(req.body);
      const headerKey = req.get('idempotency-key');
      if (!headerKey) throw new HttpError(400, 'idempotency_key_required');
      if (headerKey !== request.idempotencyKey) {
        throw new HttpError(400, 'idempotency_key_mismatch');
      }
      const result = await withTenantTransaction(pool, req.principal, (client) =>
        createAgent(client, req.principal, request)
      );
      setAgentVersionEtag(res, result.agent);
      res.status(result.replayed ? 200 : 201).json(result);
    })
  );

  app.get(
    '/v1/agents',
    requirePrincipalScope(PRINCIPAL_SCOPES.READ),
    asyncRoute(async (req, res) => {
      const query = ListAgentsQuerySchema.parse({
        limit: req.query.limit,
        state: req.query.state || null,
      });
      const agents = await withTenantTransaction(pool, req.principal, (client) =>
        listAgents(client, query)
      );
      res.json({ version: 'orqaly_agent_list_v1', agents });
    })
  );

  app.get(
    '/v1/agents/:agentId',
    requirePrincipalScope(PRINCIPAL_SCOPES.READ),
    asyncRoute(async (req, res) => {
      const agentId = UuidSchema.parse(req.params.agentId);
      const agent = await withTenantTransaction(pool, req.principal, (client) =>
        getAgent(client, agentId)
      );
      setAgentVersionEtag(res, agent);
      res.json({ version: 'orqaly_agent_detail_v1', agent });
    })
  );

  app.patch(
    '/v1/agents/:agentId/profile',
    requirePrincipalScope(PRINCIPAL_SCOPES.AGENT_WRITE),
    requireHumanPrincipal,
    asyncRoute(async (req, res) => {
      const agentId = UuidSchema.parse(req.params.agentId);
      const request = UpdateAgentProfileRequestSchema.parse(req.body);
      const headerKey = req.get('idempotency-key');
      if (!headerKey) throw new HttpError(400, 'idempotency_key_required');
      if (headerKey !== request.idempotencyKey) {
        throw new HttpError(400, 'idempotency_key_mismatch');
      }
      const agentVersion = expectedVersion(req.get('if-match'));
      const result = await withTenantTransaction(pool, req.principal, (client) =>
        updateAgentProfile(client, req.principal, agentId, agentVersion, request)
      );
      setAgentVersionEtag(res, result.agent);
      res.status(200).json(result);
    })
  );

  app.post(
    '/v1/agents/:agentId/lifecycle',
    requirePrincipalScope(PRINCIPAL_SCOPES.AGENT_WRITE),
    requireHumanPrincipal,
    asyncRoute(async (req, res) => {
      const agentId = UuidSchema.parse(req.params.agentId);
      const request = AgentLifecycleRequestSchema.parse(req.body);
      const headerKey = req.get('idempotency-key');
      if (!headerKey) throw new HttpError(400, 'idempotency_key_required');
      if (headerKey !== request.idempotencyKey) {
        throw new HttpError(400, 'idempotency_key_mismatch');
      }
      const agentVersion = expectedVersion(req.get('if-match'));
      const result = await withTenantTransaction(pool, req.principal, (client) =>
        changeAgentLifecycle(client, req.principal, agentId, agentVersion, request)
      );
      setAgentVersionEtag(res, result.agent);
      res.status(200).json(result);
    })
  );

  app.get(
    '/v1/agents/:agentId/runs',
    requirePrincipalScope(PRINCIPAL_SCOPES.READ),
    asyncRoute(async (req, res) => {
      const agentId = UuidSchema.parse(req.params.agentId);
      const query = ListAgentRunsQuerySchema.parse({ limit: req.query.limit });
      const runs = await withTenantTransaction(pool, req.principal, (client) =>
        listAgentRuns(client, agentId, query)
      );
      res.json({ version: 'orqaly_agent_run_list_v1', agentId, runs });
    })
  );

  app.get(
    '/v1/approvals',
    requirePrincipalScope(PRINCIPAL_SCOPES.READ),
    asyncRoute(async (req, res) => {
      const query = ListApprovalsQuerySchema.parse({
        limit: req.query.limit,
        status: req.query.status === 'all' ? null : req.query.status || 'pending',
      });
      const approvals = await withTenantTransaction(pool, req.principal, (client) =>
        listApprovals(client, query)
      );
      res.json({ version: 'orqaly_approval_list_v1', approvals });
    })
  );

  app.post(
    '/v1/approvals/:approvalId/decision',
    requirePrincipalScope(PRINCIPAL_SCOPES.APPROVAL_DECIDE),
    requireHumanPrincipal,
    asyncRoute(async (req, res) => {
      const approvalId = UuidSchema.parse(req.params.approvalId);
      const request = ApprovalDecisionRequestSchema.parse(req.body);
      const headerKey = req.get('idempotency-key');
      if (!headerKey) throw new HttpError(400, 'idempotency_key_required');
      if (headerKey !== request.idempotencyKey) {
        throw new HttpError(400, 'idempotency_key_mismatch');
      }
      const result = await withTenantTransaction(pool, req.principal, (client) =>
        decideApproval(
          client,
          req.principal,
          approvalId,
          expectedVersion(req.get('if-match')),
          request
        )
      );
      res.status(200).json({
        ...result,
        ...execution,
        dispatchable: result.status === 'approved' && execution.executionReady,
      });
    })
  );

  app.post(
    '/v1/runs/:runId/plan-versions',
    requirePrincipalScope(PRINCIPAL_SCOPES.PLAN_WRITE),
    asyncRoute(async (req, res) => {
      const runId = UuidSchema.parse(req.params.runId);
      const submission = PlanVersionSubmissionSchema.parse(req.body);
      const headerKey = req.get('idempotency-key');
      if (!headerKey) throw new HttpError(400, 'idempotency_key_required');
      if (headerKey !== submission.idempotencyKey) {
        throw new HttpError(400, 'idempotency_key_mismatch');
      }
      const result = await withTenantTransaction(pool, req.principal, (client) =>
        submitExecutionPlanV2(
          client,
          req.principal,
          runId,
          expectedVersion(req.get('if-match')),
          submission,
          { approvalTtlSeconds: config.PLAN_APPROVAL_TTL_SECONDS }
        )
      );
      res.status(result.replayed ? 200 : 201).json(result);
    })
  );

  app.get(
    '/v1/runs/:runId',
    requirePrincipalScope(PRINCIPAL_SCOPES.READ),
    asyncRoute(async (req, res) => {
      const runId = UuidSchema.parse(req.params.runId);
      const run = await withTenantTransaction(pool, req.principal, (client) =>
        getRun(client, runId)
      );
      res.json({ version: 'orqaly_run_detail_v1', run });
    })
  );

  app.use('/v1', (_, __, next) => next(new HttpError(404, 'route_not_found')));
  app.use((error, req, res, _next) => {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'request_contract_invalid',
          requestId: req.requestId,
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({
        error: { code: 'json_invalid', requestId: req.requestId },
      });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({
        error: {
          code: error.code,
          requestId: req.requestId,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }
    req.log?.error?.({ error, requestId: req.requestId }, 'unhandled request error');
    return res.status(500).json({
      error: { code: 'internal_error', requestId: req.requestId },
    });
  });

  return app;
}
