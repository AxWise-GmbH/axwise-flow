import express from 'express';
import { getAuth, clerkMiddleware } from '@clerk/express';
import { z, ZodError } from 'zod';
import { WorkflowTransitionError } from '../../lib/workflow-v2/state-machine.js';
import { PublicWorkflowSnapshotSchema } from '../../shared/workflow-v2/contracts.js';
import { AgenticControlPlaneError } from './agentic-control-plane-client.js';
import { WorkflowCommandError } from './command-service.js';
import { ExecutableActionError } from './executable-action-service.js';
import { SolutionError } from './solution-service.js';
import { SolutionBuildError } from './solution-build-service.js';
import { createSolutionApplicationRouter } from './solution-application-http.js';
import { createCodingWorkerRouter, createCodingDispatchRouter } from './coding-worker-http.js';
import {
  SolutionConversationKeySchema,
  SolutionConversationReadSchema,
  SolutionConversationTurnSchema,
} from '../../shared/workflow-v2/solution-conversation-contracts.js';
import {
  AnswerSolutionBuildSchema,
  ConfirmSolutionBuildSchema,
  CreateSolutionBuildSchema,
  ReviewSolutionBuildSchema,
  SaveSolutionBuildSchema,
  SolutionBuildKeySchema,
  TestSolutionBuildSchema,
  RepairSolutionBuildSchema,
  CancelSolutionBuildSchema,
  CreateSolutionBuildConnectionSchema,
  RevokeSolutionBuildConnectionSchema,
} from '../../shared/workflow-v2/solution-build-contracts.js';
import {
  CreateSolutionRevisionConnectionSchema,
  RevokeSolutionRevisionConnectionSchema,
} from '../../shared/workflow-v2/solution-revision-connection-contracts.js';
import {
  SolutionFailureProbeCommandSchema,
  SolutionFailureProbeKeySchema,
} from '../../shared/workflow-v2/solution-failure-probe-contracts.js';

export function createMemoryRateLimiter({ limit = 120, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  return function rateLimit(req, res, next) {
    const identity = req.authContext?.userId || req.ip || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(identity);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(identity, { count: 1, resetAt: now + windowMs });
      res.set('RateLimit-Limit', String(limit));
      res.set('RateLimit-Remaining', String(limit - 1));
      return next();
    }
    bucket.count += 1;
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    if (bucket.count > limit) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'try again later' } });
    }
    return next();
  };
}

export function createCorsMiddleware(allowedOrigins = []) {
  const allowed = new Set(allowedOrigins.filter(Boolean));
  return function cors(req, res, next) {
    const origin = req.get('origin');
    if (origin) {
      if (!allowed.has(origin)) {
        return res.status(403).json({ error: { code: 'ORIGIN_DENIED', message: 'origin denied' } });
      }
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Expose-Headers', 'ETag,X-Request-ID,Retry-After');
      res.set('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
      res.set(
        'Access-Control-Allow-Headers',
        'Authorization,Content-Type,If-Match,Idempotency-Key'
      );
      return res.status(204).end();
    }
    return next();
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function sendAgentServiceResponse(res, result) {
  res.set('Cache-Control', 'no-store');
  if (result.headers?.requestId) res.set('X-Request-ID', result.headers.requestId);
  if (result.headers?.etag) res.set('ETag', result.headers.etag);
  if (result.headers?.retryAfter) res.set('Retry-After', result.headers.retryAfter);
  return res.status(result.status).json(result.body);
}

function readLimit(req, fallback) {
  const limit = req.query.limit === undefined ? fallback : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new WorkflowCommandError('INVALID_LIMIT', 'limit must be 1..100', 400);
  }
  return limit;
}

function readAssistantEventCursor(req) {
  const cursor = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new WorkflowCommandError(
      'INVALID_ASSISTANT_EVENT_CURSOR',
      'assistant event cursor must be a nonnegative integer',
      400
    );
  }
  return cursor;
}

function readExactRowVersion(req) {
  const value = req.get('if-match');
  const match = typeof value === 'string' ? /^"([0-9]+)"$/.exec(value) : null;
  if (!match) {
    throw new ExecutableActionError(
      'IF_MATCH_REQUIRED',
      'If-Match must contain the exact quoted action row version',
      428
    );
  }
  const rowVersion = Number(match[1]);
  if (!Number.isSafeInteger(rowVersion)) {
    throw new ExecutableActionError(
      'IF_MATCH_INVALID',
      'If-Match action row version is invalid',
      400
    );
  }
  return rowVersion;
}

function setActionEtag(res, aggregate) {
  if (aggregate.action) res.set('ETag', `"${aggregate.action.rowVersion}"`);
}

export function browserOriginsFromEnvironment(environment = process.env) {
  return [
    ...new Set(
      (environment.ORQALY_BROWSER_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].map((value) => {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.origin !== value) {
      throw new Error('ORQALY_BROWSER_ORIGINS must contain exact HTTPS origins');
    }
    return value;
  });
}

export function clerkMiddlewareOptionsFromEnvironment(environment = process.env) {
  return { authorizedParties: browserOriginsFromEnvironment(environment) };
}

export function isClerkEnvironmentConfigured(environment = process.env) {
  return Boolean(
    environment.CLERK_SECRET_KEY &&
    environment.CLERK_PUBLISHABLE_KEY &&
    browserOriginsFromEnvironment(environment).length
  );
}

export function personalClerkAuthContext(auth) {
  return auth?.isAuthenticated && auth.userId ? { userId: auth.userId } : null;
}

function defaultAuth() {
  return {
    middleware: clerkMiddleware(clerkMiddlewareOptionsFromEnvironment()),
    context(req) {
      return personalClerkAuthContext(getAuth(req));
    },
  };
}

export function createWorkflowHttpApp({
  commandService,
  assistantService = null,
  executableActionService = null,
  executionConfigured = false,
  agentService = null,
  solutionService = null,
  solutionRevisionService = null,
  solutionFailureProbeService = null,
  solutionBuildService = null,
  solutionApplicationKeyService = null,
  solutionScheduleService = null,
  solutionConversationService = null,
  goalWorkflowViewService = null,
  capabilityWorkService = null,
  codingWorkerService = null,
  nativeN8nGateway = null,
  gooseProviderRouter = null,
  agentEvaluationRouter = null,
  auth = defaultAuth(),
  rateLimiter = createMemoryRateLimiter(),
  cors = createCorsMiddleware(browserOriginsFromEnvironment()),
}) {
  const app = express();
  app.disable('x-powered-by');
  // Desktop OAuth stays separate from browser sessions and its larger request
  // parser runs only after authentication inside the provider router.
  if (gooseProviderRouter) app.use('/desktop/v1', cors, gooseProviderRouter);
  if (agentEvaluationRouter) app.use('/internal/evaluations/v1', agentEvaluationRouter);
  // The editor has its own narrowly scoped cookie/session and origin checks.
  // It runs on the API origin, separate from the Orqaly browser application's origin.
  if (nativeN8nGateway) app.use('/native-n8n', nativeN8nGateway.router);
  if (codingWorkerService)
    app.use('/coding/v1', createCodingDispatchRouter({ service: codingWorkerService }));
  app.use(
    '/invoke/v1',
    createSolutionApplicationRouter({ service: solutionApplicationKeyService })
  );
  const capabilityAuthContext = (req, res, next) => {
    req.authContext = auth.context(req);
    if (!req.authContext?.userId) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'sign-in required' } });
    return next();
  };
  const capabilityCommand = (method) => asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!capabilityWorkService?.enabled) throw new WorkflowCommandError('CAPABILITY_WORK_UNAVAILABLE', 'capability work is not configured', 503);
    if (Object.keys(req.query).length) throw new WorkflowCommandError('INVALID_COMMAND', 'capability commands do not accept query overrides', 400);
    const runId = req.params.runId === undefined ? null : z.string().uuid().parse(req.params.runId);
    try {
      const result = method === 'start'
        ? await capabilityWorkService.start(req.authContext, req.body)
        : await capabilityWorkService[method](req.authContext, runId, req.body);
      return res.status(200).json(result);
    } catch (error) {
      // New source-bearing routes never echo validation values or source text.
      if (error instanceof ZodError) throw new WorkflowCommandError('INVALID_CAPABILITY_COMMAND', 'capability command validation failed', 400);
      throw error;
    }
  });
  const corpusPath = '/v2/capability-work/:runId/corpus';
  app.options(corpusPath, cors);
  app.post(corpusPath, cors, auth.middleware, capabilityAuthContext, rateLimiter,
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (!capabilityWorkService?.enabled) return res.status(503).json({ error: { code: 'CAPABILITY_WORK_UNAVAILABLE', message: 'capability work is not configured' } });
      return next();
    },
    express.json({ limit: 1_000_000, strict: true }), capabilityCommand('admitCorpus'));
  app.use(
    '/v2/solution-build-requests/:buildId/draft',
    express.json({ limit: '640kb', strict: true })
  );
  // A valid 24k-character command may occupy substantially more bytes once UTF-8 or JSON
  // escaping is applied. Keep the byte ceiling bounded while honoring the public contract.
  app.use(express.json({ limit: '192kb', strict: true }));
  app.use(cors);
  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.get(
    '/readyz',
    asyncRoute(async (_req, res) => {
      try {
        const readiness = await commandService.ready();
        res.status(200).json({ status: 'ok', ...readiness, executionConfigured });
      } catch (error) {
        res.status(503).json({ status: 'unavailable', code: error.code || error.name });
      }
    })
  );
  app.use('/v2', auth.middleware);
  app.use('/v2', (req, res, next) => {
    req.authContext = auth.context(req);
    if (!req.authContext?.userId) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'sign-in required' } });
    }
    return next();
  });
  app.use('/v2', rateLimiter);
  app.get('/v2/capability-work/configuration', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ configured: capabilityWorkService?.enabled === true });
  });
  app.post('/v2/capability-work', capabilityCommand('start'));
  app.post('/v2/capability-work/:runId/scope', capabilityCommand('approveScope'));
  app.post('/v2/capability-work/:runId/prepare', capabilityCommand('prepareOperation'));
  app.post('/v2/capability-work/:runId/confirm', capabilityCommand('confirmOperation'));
  if (codingWorkerService)
    app.use(
      '/v2/solutions/:solutionId/coding-jobs',
      createCodingWorkerRouter({ service: codingWorkerService })
    );
  app.use('/v2/solution-build-requests', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const requireBuilds = () => {
    if (!solutionBuildService)
      throw new SolutionBuildError(
        'SOLUTION_BUILDS_UNAVAILABLE',
        'Workflow building is not configured',
        503
      );
    return solutionBuildService;
  };
  const buildId = (req) => z.uuid().parse(req.params.buildId);
  const buildKey = (req) => SolutionBuildKeySchema.parse(req.get('idempotency-key'));
  app.get(
    '/v2/solution-build-requests',
    asyncRoute(async (req, res) => {
      const filter = z
        .object({ runId: z.uuid().optional(), agentId: z.uuid().optional() })
        .strict()
        .parse(req.query);
      res
        .set('Cache-Control', 'no-store')
        .json(await requireBuilds().list(req.authContext, filter));
    })
  );
  app.post(
    '/v2/solution-build-requests',
    asyncRoute(async (req, res) => {
      const command = CreateSolutionBuildSchema.parse(req.body);
      res
        .set('Cache-Control', 'no-store')
        .status(201)
        .json(await requireBuilds().create(req.authContext, command, buildKey(req)));
    })
  );
  app.get(
    '/v2/solution-build-requests/:buildId',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await requireBuilds().read(req.authContext, buildId(req)));
    })
  );
  app.post(
    '/v2/solution-build-requests/:buildId/answers',
    asyncRoute(async (req, res) => {
      const command = AnswerSolutionBuildSchema.parse(req.body);
      res
        .set('Cache-Control', 'no-store')
        .json(await requireBuilds().answer(req.authContext, buildId(req), command, buildKey(req)));
    })
  );
  app.patch(
    '/v2/solution-build-requests/:buildId/draft',
    asyncRoute(async (req, res) => {
      const command = SaveSolutionBuildSchema.parse(req.body);
      res
        .set('Cache-Control', 'no-store')
        .json(await requireBuilds().saveDraft(req.authContext, buildId(req), command));
    })
  );
  for (const [path, method] of [
    ['review', 'review'],
    ['retry', 'retry'],
    ['confirm', 'confirm'],
  ]) {
    app.post(
      `/v2/solution-build-requests/:buildId/${path}`,
      asyncRoute(async (req, res) => {
        const command = (
          path === 'confirm' ? ConfirmSolutionBuildSchema : ReviewSolutionBuildSchema
        ).parse(req.body);
        const args = [req.authContext, buildId(req), command];
        if (path !== 'review') args.push(buildKey(req));
        res.set('Cache-Control', 'no-store').json(await requireBuilds()[method](...args));
      })
    );
  }
  app.post(
    '/v2/solution-build-requests/:buildId/native-session',
    asyncRoute(async (req, res) => {
      requireBuilds();
      const command = z
        .object({ mode: z.enum(['view', 'edit']).default('view') })
        .strict()
        .parse(req.body);
      if (typeof nativeN8nGateway?.issueBuild !== 'function')
        throw new SolutionBuildError(
          'NATIVE_EDITOR_UNAVAILABLE',
          'The native editor is not connected to this environment yet.',
          503
        );
      res
        .set('Cache-Control', 'no-store')
        .json(await nativeN8nGateway.issueBuild(req.authContext, buildId(req), command));
    })
  );

  for (const [path, method, schema] of [
    ['test', 'test', TestSolutionBuildSchema],
    ['repair', 'repair', RepairSolutionBuildSchema],
    ['cancel', 'cancel', CancelSolutionBuildSchema],
    ['connections', 'createConnection', CreateSolutionBuildConnectionSchema],
    ['connections/revoke', 'revokeConnection', RevokeSolutionBuildConnectionSchema],
  ]) {
    app.post(
      `/v2/solution-build-requests/:buildId/${path}`,
      asyncRoute(async (req, res) => {
        const service = requireBuilds();
        if (typeof service[method] !== 'function')
          throw new SolutionBuildError(
            'NATIVE_BUILD_ACTION_UNAVAILABLE',
            'This native workflow action is not configured.',
            503
          );
        let command;
        try {
          command = schema.parse(req.body);
        } catch (error) {
          // Credential keys/values are never reflected into schema-error paths.
          if (method === 'createConnection' && error instanceof ZodError)
            throw new SolutionBuildError(
              'INVALID_CONNECTION_COMMAND',
              'The secure connection request is invalid.',
              400
            );
          throw error;
        }
        res.set('Cache-Control', 'no-store');
        if (method === 'createConnection') res.set('Pragma', 'no-cache');
        const result = await service[method](req.authContext, buildId(req), command, buildKey(req));
        res.status(method === 'createConnection' ? 201 : 200).json(result);
      })
    );
  }

  const requireSolutions = () => {
    if (!solutionService)
      throw new SolutionError('SOLUTIONS_UNAVAILABLE', 'Solutions are not configured', 503);
    return solutionService;
  };
  const requireApplicationKeys = () => {
    if (!solutionApplicationKeyService)
      throw new SolutionError(
        'APPLICATION_ACCESS_UNAVAILABLE',
        'Application access is not configured.',
        503
      );
    return solutionApplicationKeyService;
  };
  app.get(
    '/v2/solutions/:solutionId/app-keys',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await requireApplicationKeys().list(req.authContext, req.params.solutionId));
    })
  );
  app.post(
    '/v2/solutions/:solutionId/app-keys',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .status(201)
        .json(
          await requireApplicationKeys().create(
            req.authContext,
            req.params.solutionId,
            req.body,
            readExactRowVersion(req),
            req.get('idempotency-key')
          )
        );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/app-keys/:keyId/revoke',
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.body);
      res
        .set('Cache-Control', 'no-store')
        .json(
          await requireApplicationKeys().revoke(
            req.authContext,
            req.params.solutionId,
            req.params.keyId,
            readExactRowVersion(req)
          )
        );
    })
  );
  app.get(
    '/v2/agents/:agentId/solutions',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await requireSolutions().list(req.authContext, req.params.agentId));
    })
  );
  const requireSchedules = () => {
    if (!solutionScheduleService)
      throw new SolutionError('SCHEDULES_UNAVAILABLE', 'Schedules are not configured', 503);
    return solutionScheduleService;
  };
  app.get(
    '/v2/solutions/:solutionId/schedules',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await requireSchedules().list(req.authContext, req.params.solutionId));
    })
  );
  app.post(
    '/v2/solutions/:solutionId/schedules',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .status(201)
        .json(
          await requireSchedules().create(
            req.authContext,
            req.params.solutionId,
            req.body,
            req.get('idempotency-key')
          )
        );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/schedules/:scheduleId/pause',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(
          await requireSchedules().pause(
            req.authContext,
            req.params.solutionId,
            req.params.scheduleId
          )
        );
    })
  );
  app.get(
    '/v2/solutions',
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.query);
      const value = await requireSolutions().list(req.authContext);
      res.set('Cache-Control', 'no-store').json({ solutions: value.solutions });
    })
  );
  const requireConversation = () => {
    if (!solutionConversationService)
      throw new SolutionError(
        'SOLUTION_CONVERSATION_DISABLED',
        'Workflow conversation is not configured',
        503
      );
    return solutionConversationService;
  };
  app.get(
    '/v2/solutions/:solutionId/conversation',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(
          await requireConversation().read(
            req.authContext,
            z.uuid().parse(req.params.solutionId),
            SolutionConversationReadSchema.parse(req.query)
          )
        );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/conversation/turns',
    asyncRoute(async (req, res) => {
      const result = await requireConversation().send(
        req.authContext,
        z.uuid().parse(req.params.solutionId),
        SolutionConversationTurnSchema.parse(req.body),
        SolutionConversationKeySchema.parse(req.get('idempotency-key'))
      );
      res
        .set('Cache-Control', 'no-store')
        .status(result.replayed ? 200 : 202)
        .json(result);
    })
  );
  app.post(
    '/v2/solutions',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .status(201)
        .json(
          await requireSolutions().create(req.authContext, req.body, req.get('idempotency-key'))
        );
    })
  );
  app.get(
    '/v2/solutions/:solutionId',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await requireSolutions().read(req.authContext, req.params.solutionId));
    })
  );
  const requireRevisions = () => {
    if (!solutionRevisionService)
      throw new SolutionError(
        'SOLUTION_REVISIONS_UNAVAILABLE',
        'Workflow revisions are not configured',
        503
      );
    return solutionRevisionService;
  };
  const requireFailureProbes = () => {
    if (!solutionFailureProbeService)
      throw new SolutionError('FAILURE_PROBE_UNAVAILABLE', 'Error-handler testing is not configured.', 503);
    return solutionFailureProbeService;
  };
  app.get(
    '/v2/solutions/:solutionId/revisions/:revisionId/failure-probes',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      z.object({}).strict().parse(req.query);
      res.json(await requireFailureProbes().read(
        req.authContext, z.uuid().parse(req.params.solutionId), z.uuid().parse(req.params.revisionId)
      ));
    })
  );
  app.post(
    '/v2/solutions/:solutionId/revisions/:revisionId/failure-probes',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await requireFailureProbes().run(
        req.authContext, z.uuid().parse(req.params.solutionId), z.uuid().parse(req.params.revisionId),
        SolutionFailureProbeCommandSchema.parse(req.body),
        SolutionFailureProbeKeySchema.parse(req.get('idempotency-key'))
      ));
    })
  );
  app.post(
    '/v2/solutions/:solutionId/revisions/:revisionId/failure-probes/:probeId/reconcile',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      z.object({}).strict().parse(req.body);
      res.json(await requireFailureProbes().reconcile(
        req.authContext, z.uuid().parse(req.params.solutionId), z.uuid().parse(req.params.revisionId),
        z.uuid().parse(req.params.probeId)
      ));
    })
  );
  app.get(
    '/v2/solutions/:solutionId/revisions',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await requireRevisions().read(req.authContext, req.params.solutionId));
    })
  );
  app.get(
    '/v2/solutions/:solutionId/revisions/:revisionId/connections',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache');
      z.object({}).strict().parse(req.query);
      const service = requireRevisions();
      if (typeof service.revisionSetup !== 'function')
        throw new SolutionError(
          'REVISION_CONNECTION_SETUP_UNAVAILABLE',
          'Secure draft connection setup is not available in this environment.',
          503
        );
      res.json(
        await service.revisionSetup(
          req.authContext,
          z.uuid().parse(req.params.solutionId),
          z.uuid().parse(req.params.revisionId)
        )
      );
    })
  );
  for (const [path, method, schema] of [
    ['connections', 'createRevisionConnection', CreateSolutionRevisionConnectionSchema],
    ['connections/revoke', 'revokeRevisionConnection', RevokeSolutionRevisionConnectionSchema],
  ]) {
    app.post(
      `/v2/solutions/:solutionId/revisions/:revisionId/${path}`,
      asyncRoute(async (req, res) => {
        res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache');
        const service = requireRevisions();
        if (typeof service[method] !== 'function')
          throw new SolutionError(
            'REVISION_CONNECTION_SETUP_UNAVAILABLE',
            'Secure draft connection setup is not available in this environment.',
            503
          );
        try {
          const result = await service[method](
            req.authContext,
            z.uuid().parse(req.params.solutionId),
            z.uuid().parse(req.params.revisionId),
            schema.parse(req.body),
            SolutionBuildKeySchema.parse(req.get('idempotency-key'))
          );
          res.status(method === 'createRevisionConnection' ? 201 : 200).json(result);
        } catch (error) {
          // Both command and service credential validation can contain dynamic
          // keys. Never reflect those keys or raw credential input to the caller.
          if (error instanceof ZodError)
            throw new SolutionError(
              'INVALID_CONNECTION_COMMAND',
              'The secure connection request is invalid.',
              400
            );
          throw error;
        }
      })
    );
  }
  app.post(
    '/v2/solutions/:solutionId/revisions',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(
        await requireRevisions().createDraft(req.authContext, req.params.solutionId, {
          expectedVersion: readExactRowVersion(req),
        })
      );
    })
  );
  app.patch(
    '/v2/solutions/:solutionId/revisions/:revisionId',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(
        await requireRevisions().saveDraft(
          req.authContext,
          req.params.solutionId,
          req.params.revisionId,
          {
            workflow: req.body?.workflow,
            expectedVersion: readExactRowVersion(req),
          }
        )
      );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/revisions/:revisionId/fork',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(
          await requireRevisions().forkRevision(
            req.authContext,
            req.params.solutionId,
            req.params.revisionId,
            { ...req.body, expectedVersion: readExactRowVersion(req) },
            req.get('idempotency-key')
          )
        );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/revisions/:revisionId/review',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(
        await requireRevisions().review(
          req.authContext,
          req.params.solutionId,
          req.params.revisionId,
          {
            expectedVersion: readExactRowVersion(req),
            ...(req.body?.bundleHash !== undefined ? { bundleHash: req.body.bundleHash } : {}),
          }
        )
      );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/revisions/:revisionId/decision',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(
        await requireRevisions().decide(
          req.authContext,
          req.params.solutionId,
          req.params.revisionId,
          {
            ...req.body,
            expectedVersion: readExactRowVersion(req),
          }
        )
      );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/revisions/:revisionId/invocations',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(
          await requireRevisions().invoke(
            req.authContext,
            req.params.solutionId,
            req.params.revisionId,
            req.body,
            req.get('idempotency-key')
          )
        );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/native-session',
    asyncRoute(async (req, res) => {
      if (!nativeN8nGateway)
        throw new SolutionError(
          'NATIVE_EDITOR_UNAVAILABLE',
          'The native editor is not connected to this environment yet.',
          503
        );
      res
        .set('Cache-Control', 'no-store')
        .json(await nativeN8nGateway.issue(req.authContext, req.params.solutionId, req.body));
    })
  );
  app.post(
    '/v2/solutions/:solutionId/decision',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(
          await requireSolutions().decide(
            req.authContext,
            req.params.solutionId,
            req.body,
            readExactRowVersion(req)
          )
        );
    })
  );
  app.post(
    '/v2/solutions/:solutionId/invocations',
    asyncRoute(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(
          await requireSolutions().invoke(
            req.authContext,
            req.params.solutionId,
            req.body,
            req.get('idempotency-key')
          )
        );
    })
  );

  app.use('/v1', auth.middleware);
  app.use('/v1', (req, res, next) => {
    req.authContext = auth.context(req);
    if (!req.authContext?.userId) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'sign-in required' } });
    }
    return next();
  });
  app.use('/v1', rateLimiter);

  app.get(
    '/v1/runs/:runId/executable-actions',
    asyncRoute(async (req, res) => {
      if (!executableActionService) {
        throw new ExecutableActionError(
          'EXECUTION_NOT_CONFIGURED',
          'executable actions are not configured',
          503
        );
      }
      const aggregate = await executableActionService.read(req.authContext, req.params.runId);
      setActionEtag(res, aggregate);
      res.set('Cache-Control', 'no-store');
      res.status(200).json(aggregate);
    })
  );

  app.post(
    '/v1/runs/:runId/executable-actions',
    asyncRoute(async (req, res) => {
      if (!executableActionService) {
        throw new ExecutableActionError(
          'EXECUTION_NOT_CONFIGURED',
          'executable actions are not configured',
          503
        );
      }
      const result = await executableActionService.propose(
        req.authContext,
        req.params.runId,
        req.body
      );
      setActionEtag(res, result.aggregate);
      res.set('Cache-Control', 'no-store');
      res.status(result.idempotent ? 200 : 201).json(result.aggregate);
    })
  );

  app.post(
    '/v1/executable-actions/:actionId/decision',
    asyncRoute(async (req, res) => {
      if (!executableActionService) {
        throw new ExecutableActionError(
          'EXECUTION_NOT_CONFIGURED',
          'executable actions are not configured',
          503
        );
      }
      const result = await executableActionService.decide(
        req.authContext,
        req.params.actionId,
        req.body,
        readExactRowVersion(req)
      );
      setActionEtag(res, result.aggregate);
      res.set('Cache-Control', 'no-store');
      res.status(200).json(result.aggregate);
    })
  );

  app.post(
    '/v2/session',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const session = await commandService.session(req.authContext);
      res.status(200).json({ session, ...(capabilityWorkService ? { capabilityWorkConfigured: capabilityWorkService.enabled === true } : {}) });
    })
  );

  app.get(
    '/v2/workspace',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.status(200).json(await commandService.workspace(req.authContext));
    })
  );
  app.get(
    '/v2/overview',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.status(200).json(await commandService.overview(req.authContext, readLimit(req, 25)));
    })
  );
  app.get(
    '/v2/activity',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.status(200).json(await commandService.activity(req.authContext, readLimit(req, 50)));
    })
  );

  app.get(
    '/v2/assistant/threads',
    asyncRoute(async (req, res) => {
      if (!assistantService) throw new Error('assistant service is not configured');
      const limit = readLimit(req, 25);
      res.status(200).json(await assistantService.list(req.authContext, limit));
    })
  );
  app.get(
    '/v2/agents',
    asyncRoute(async (req, res) => {
      const limit = readLimit(req, 100);
      if (agentService) {
        return sendAgentServiceResponse(
          res,
          await agentService.list(req.authContext, limit, req.query.state)
        );
      }
      if (!assistantService) throw new Error('assistant service is not configured');
      res.set('Cache-Control', 'no-store');
      return res.status(200).json(await assistantService.agents(req.authContext, limit));
    })
  );
  app.post(
    '/v2/agents',
    asyncRoute(async (req, res) => {
      if (!agentService) {
        throw new WorkflowCommandError(
          'AGENT_RUNTIME_NOT_CONFIGURED',
          'Agent runtime is not configured',
          503
        );
      }
      return sendAgentServiceResponse(res, await agentService.create(req.authContext, req.body));
    })
  );
  app.get(
    '/v2/agents/:agentId',
    asyncRoute(async (req, res) => {
      if (!agentService) {
        throw new WorkflowCommandError(
          'AGENT_RUNTIME_NOT_CONFIGURED',
          'Agent runtime is not configured',
          503
        );
      }
      return sendAgentServiceResponse(
        res,
        await agentService.read(req.authContext, req.params.agentId)
      );
    })
  );
  app.patch(
    '/v2/agents/:agentId/profile',
    asyncRoute(async (req, res) => {
      if (!agentService) {
        throw new WorkflowCommandError(
          'AGENT_RUNTIME_NOT_CONFIGURED',
          'Agent runtime is not configured',
          503
        );
      }
      return sendAgentServiceResponse(
        res,
        await agentService.updateProfile(
          req.authContext,
          req.params.agentId,
          req.get('if-match'),
          req.body
        )
      );
    })
  );
  app.post(
    '/v2/agents/:agentId/lifecycle',
    asyncRoute(async (req, res) => {
      if (!agentService) {
        throw new WorkflowCommandError(
          'AGENT_RUNTIME_NOT_CONFIGURED',
          'Agent runtime is not configured',
          503
        );
      }
      return sendAgentServiceResponse(
        res,
        await agentService.lifecycle(
          req.authContext,
          req.params.agentId,
          req.get('if-match'),
          req.body
        )
      );
    })
  );
  app.get(
    '/v2/agents/:agentId/runs',
    asyncRoute(async (req, res) => {
      if (!agentService) {
        throw new WorkflowCommandError(
          'AGENT_RUNTIME_NOT_CONFIGURED',
          'Agent runtime is not configured',
          503
        );
      }
      return sendAgentServiceResponse(
        res,
        await agentService.runs(req.authContext, req.params.agentId, readLimit(req, 100))
      );
    })
  );
  app.get(
    '/v2/agent-runtime/status',
    asyncRoute(async (req, res) => {
      if (!agentService) {
        res.set('Cache-Control', 'no-store');
        return res.status(200).json({
          version: 'orqaly_agent_runtime_status_v1',
          configured: false,
          status: 'not_configured',
          controlPlane: null,
          execution: {
            enabled: false,
            connected: false,
            status: 'not_connected',
            provider: 'n8n',
            mode: 'self_hosted',
          },
        });
      }
      const response = await agentService.runtimeStatus(req.authContext);
      if (executionConfigured) {
        response.body.execution = {
          ...response.body.execution,
          internalActions: ['operational_record_create_v1'],
          internalActionStatus: 'configured_requires_exact_approval',
        };
      }
      return sendAgentServiceResponse(res, response);
    })
  );
  app.get(
    '/v2/assistant/threads/:threadId',
    asyncRoute(async (req, res) => {
      if (!assistantService) throw new Error('assistant service is not configured');
      res.status(200).json(await assistantService.read(req.authContext, req.params.threadId));
    })
  );
  app.get(
    '/v2/assistant/threads/:threadId/events',
    asyncRoute(async (req, res) => {
      if (!assistantService) throw new Error('assistant service is not configured');
      const batch = await assistantService.events(
        req.authContext,
        req.params.threadId,
        readAssistantEventCursor(req),
        readLimit(req, 100)
      );
      if (!req.get('accept')?.includes('text/event-stream')) {
        res.set('Cache-Control', 'no-store');
        return res.status(200).json(batch);
      }
      res.status(200);
      res.set({
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      });
      for (const event of batch.events) {
        res.write(
          `id: ${event.sequence}\nevent: assistant_turn\ndata: ${JSON.stringify(event)}\n\n`
        );
      }
      res.write(`event: cursor\ndata: ${JSON.stringify({ cursor: batch.cursor })}\n\n`);
      return res.end();
    })
  );
  app.post(
    '/v2/assistant/threads/:threadId/messages',
    asyncRoute(async (req, res) => {
      if (!assistantService) throw new Error('assistant service is not configured');
      if (
        req.body !== null &&
        typeof req.body === 'object' &&
        Object.prototype.hasOwnProperty.call(req.body, 'capability')
      ) {
        throw new WorkflowCommandError(
          'ASSISTANT_CAPABILITY_DESKTOP_ONLY',
          'Assistant capabilities are available through the desktop work boundary.',
          400
        );
      }
      const result = await assistantService.send(req.authContext, req.params.threadId, req.body);
      res.status(result.persisted ? (result.idempotent ? 200 : 201) : 202).json(result);
    })
  );
  app.post(
    '/v2/assistant/threads/:threadId/turns/:turnId/retry',
    asyncRoute(async (req, res) => {
      if (!assistantService) throw new Error('assistant service is not configured');
      const result = await assistantService.retryPublic(
        req.authContext,
        req.params.threadId,
        req.params.turnId,
        req.body
      );
      res.status(result.persisted ? (result.idempotent ? 200 : 201) : 202).json(result);
    })
  );
  app.post(
    '/v2/assistant/threads/:threadId/turns/:turnId/resume',
    asyncRoute(async (req, res) => {
      if (!assistantService) throw new Error('assistant service is not configured');
      const result = await assistantService.resume(
        req.authContext,
        req.params.threadId,
        req.params.turnId
      );
      res.status(result.persisted ? 200 : 202).json(result);
    })
  );
  app.post(
    '/v2/assistant/threads/:threadId/turns/:turnId/cancel',
    asyncRoute(async (req, res) => {
      if (!assistantService) throw new Error('assistant service is not configured');
      const result = await assistantService.cancel(
        req.authContext,
        req.params.threadId,
        req.params.turnId
      );
      res.status(result.persisted ? 200 : 202).json(result);
    })
  );

  app.post(
    '/v2/workflows',
    asyncRoute(async (req, res) => {
      const result = await commandService.start(req.authContext, req.body);
      res.status(result.receipt.idempotent ? 200 : 201).json(result);
    })
  );
  app.get(
    '/v2/workflows',
    asyncRoute(async (req, res) => {
      const limit = readLimit(req, 25);
      res.status(200).json(await commandService.list(req.authContext, limit));
    })
  );
  app.get(
    '/v2/workflow-views/goal-runs/:runId',
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const runId = z.string().uuid().parse(req.params.runId);
      z.object({}).strict().parse(req.query);
      if (!goalWorkflowViewService) {
        throw new WorkflowCommandError(
          'WORKFLOW_VIEW_UNAVAILABLE',
          'Goal workflow metadata is unavailable.',
          503
        );
      }
      return res.json(await goalWorkflowViewService.read(req.authContext, runId));
    })
  );
  app.get(
    '/v2/workflows/:runId',
    asyncRoute(async (req, res) => {
      const workflow = await commandService.read(req.authContext, req.params.runId);
      res.status(200).json({ workflow: PublicWorkflowSnapshotSchema.parse(workflow) });
    })
  );
  app.post(
    '/v2/workflows/:runId/commands',
    asyncRoute(async (req, res) => {
      if (req.body?.type === 'approve_artifact') {
        return res
          .status(200)
          .json(await commandService.approve(req.authContext, req.params.runId, req.body));
      }
      if (req.body?.type === 'revise_scope') {
        const result = await commandService.reviseScope(
          req.authContext,
          req.params.runId,
          req.body
        );
        return res.status(200).json({ workflow: result.workflow });
      }
      throw new WorkflowCommandError('UNKNOWN_COMMAND', 'unsupported workflow command', 400);
    })
  );
  app.get(
    '/v2/workflows/:runId/artifacts/:artifactId',
    asyncRoute(async (req, res) => {
      const artifact = await commandService.artifact(
        req.authContext,
        req.params.runId,
        req.params.artifactId
      );
      if (artifact.contentType === 'text/markdown' && req.accepts('text/markdown')) {
        return res
          .set('ETag', `"sha256-${artifact.artifactHash}"`)
          .type('text/markdown')
          .status(200)
          .send(artifact.markdown);
      }
      return res.status(200).json({ artifact });
    })
  );

  app.use((error, _req, res, _next) => {
    if ((_req.path === '/v2/capability-work' || _req.path.startsWith('/v2/capability-work/')) && error?.type === 'entity.parse.failed') {
      res.set('Cache-Control', 'no-store');
      return res.status(400).json({ error: { code: 'INVALID_CAPABILITY_COMMAND', message: 'capability command validation failed' } });
    }
    if (error?.type === 'entity.too.large' || error?.status === 413) {
      return res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'request body is too large' },
      });
    }
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'INVALID_COMMAND',
          message: 'command validation failed',
          issues: error.issues,
        },
      });
    }
    if (error instanceof AgenticControlPlaneError) {
      res.set('Cache-Control', 'no-store');
      if (error.requestId) res.set('X-Request-ID', error.requestId);
      return res.status(error.status).json(error.publicBody);
    }
    if (
      error instanceof WorkflowCommandError ||
      error instanceof SolutionError ||
      error instanceof SolutionBuildError
    ) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ExecutableActionError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    if (
      typeof error?.code === 'string' &&
      error.code.startsWith('EXECUTABLE_ACTION_') &&
      Number.isInteger(error.status)
    ) {
      return res.status(error.status).json({
        error: { code: error.code, message: 'executable action state conflict' },
      });
    }
    if (error instanceof WorkflowTransitionError) {
      return res.status(409).json({ error: { code: error.code, message: error.message } });
    }
    console.error('workflow-v2 request failed', { name: error.name, code: error.code });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'request failed' } });
  });
  return app;
}
