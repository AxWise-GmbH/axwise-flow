import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';

const DEFAULT_AUDIENCE = 'orqaly-agentic-control-plane';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const PRINCIPAL_TTL_MS = 60_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const AGENT_STATES = ['draft', 'proposed', 'active', 'paused', 'revoked', 'expired', 'archived'];
const RUN_STATES = [
  'draft',
  'awaiting_scope_approval',
  'planning',
  'awaiting_plan_approval',
  'queued',
  'running',
  'waiting_for_customer',
  'waiting_for_approval',
  'pause_requested',
  'paused',
  'cancel_requested',
  'cancelled',
  'completed',
  'completed_with_gaps',
  'failed',
  'outcome_unknown',
];

const TimestampSchema = z.string().datetime({ offset: true });
const NullableTimestampSchema = TimestampSchema.nullable();
const NullableReferenceSchema = z.string().min(1).max(4_000).nullable();
const AgentAvatarSchema = z
  .object({
    kind: z.enum(['icon', 'emoji']),
    value: z.string().min(1).max(32),
    color: z.string().regex(/^#[0-9A-F]{6}$/),
  })
  .strict();
const AgentProfileInputSchema = z
  .object({
    version: z.literal('orqaly_agent_profile_input_v1'),
    displayName: z.string().min(1).max(160),
    roleLabel: z.string().min(1).max(160),
    description: z.string().max(2_000),
    instructions: z.string().max(12_000),
    avatar: AgentAvatarSchema,
  })
  .strict();
const AgentProfileSchema = z
  .object({
    version: z.literal('orqaly_agent_profile_v1'),
    id: z.string().uuid(),
    agentId: z.string().uuid(),
    versionNumber: z.number().int().positive().safe(),
    contentHash: z.string().regex(SHA256_PATTERN),
    profile: AgentProfileInputSchema,
    createdBy: z.string().min(1).max(200),
    createdAt: TimestampSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (canonicalHash(record.profile) !== record.contentHash) {
      context.addIssue({
        code: 'custom',
        path: ['contentHash'],
        message: 'Agent profile content hash is invalid',
      });
    }
  });
const LatestAgentRunSchema = z
  .object({
    id: z.string().uuid(),
    source_task_id: NullableReferenceSchema,
    state: z.enum(RUN_STATES),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
  })
  .strict();
const AgentProjectionSchema = z
  .object({
    id: z.string().uuid(),
    display_name: z.string().min(1).max(160),
    agent_kind: z.enum(['temporary', 'persistent']),
    state: z.enum(AGENT_STATES),
    source_task_id: NullableReferenceSchema,
    source_decision_id: NullableReferenceSchema,
    project_id: NullableReferenceSchema,
    conversation_id: NullableReferenceSchema,
    originating_run_id: z.string().uuid().nullable(),
    workflow_run_id: z.string().uuid().nullable(),
    expires_at: NullableTimestampSchema,
    version: z.number().int().positive().safe(),
    created_from: z.enum(['manual', 'task']),
    activated_at: NullableTimestampSchema,
    paused_at: NullableTimestampSchema,
    revoked_at: NullableTimestampSchema,
    archived_at: NullableTimestampSchema,
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
    profile: AgentProfileSchema,
    persona_contract_version: NullableReferenceSchema,
    persona_id: NullableReferenceSchema,
    persona_content_hash: z.string().regex(SHA256_PATTERN).nullable(),
    run_count: z.number().int().nonnegative().safe(),
    latest_run: LatestAgentRunSchema.nullable(),
  })
  .strict()
  .superRefine((agent, context) => {
    if (agent.profile.agentId !== agent.id) {
      context.addIssue({
        code: 'custom',
        path: ['profile', 'agentId'],
        message: 'Agent profile belongs to another Agent',
      });
    }
  });
const ExecutionRunSchema = z
  .object({
    id: z.string().uuid(),
    source_task_id: z.string().min(1).max(4_000),
    team_id: z.string().uuid().nullable(),
    plan_id: z.string().uuid(),
    plan_version_id: z.string().uuid().nullable(),
    state: z.enum(RUN_STATES),
    requested_by: z.string().min(1).max(200),
    budget_minor: z.number().int().nonnegative().safe().nullable(),
    reserved_minor: z.number().int().nonnegative().safe(),
    spent_minor: z.number().int().nonnegative().safe(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    deadline_at: NullableTimestampSchema,
    started_at: NullableTimestampSchema,
    terminal_at: NullableTimestampSchema,
    version: z.number().int().positive().safe(),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
  })
  .strict();
const AgentListResponseSchema = z
  .object({
    version: z.literal('orqaly_agent_list_v1'),
    agents: z.array(AgentProjectionSchema).max(100),
  })
  .strict();
const AgentDetailResponseSchema = z
  .object({ version: z.literal('orqaly_agent_detail_v1'), agent: AgentProjectionSchema })
  .strict();
const AgentCreateResponseSchema = z
  .object({
    version: z.literal('orqaly_agent_create_result_v1'),
    agent: AgentProjectionSchema,
    replayed: z.boolean(),
  })
  .strict();
const AgentProfileUpdateResponseSchema = z
  .object({
    version: z.literal('orqaly_agent_profile_update_result_v1'),
    agent: AgentProjectionSchema,
    unchanged: z.boolean(),
    replayed: z.boolean(),
  })
  .strict();
const AgentLifecycleResponseSchema = z
  .object({
    version: z.literal('orqaly_agent_lifecycle_result_v1'),
    agent: AgentProjectionSchema,
    replayed: z.boolean(),
  })
  .strict();
const AgentRunListResponseSchema = z
  .object({
    version: z.literal('orqaly_agent_run_list_v1'),
    agentId: z.string().uuid(),
    runs: z.array(ExecutionRunSchema).max(100),
  })
  .strict();
const RuntimeStatusResponseSchema = z
  .object({
    version: z.literal('orqaly_agent_runtime_status_v1'),
    service: z.literal('orqaly-agentic-control-plane'),
    status: z.literal('ready'),
    executionRequested: z.boolean(),
    executionEnabled: z.boolean(),
    executionReady: z.boolean(),
    executionStatus: z.enum(['disabled', 'release_gated', 'ready']),
  })
  .strict()
  .superRefine((runtime, context) => {
    if (runtime.executionEnabled !== (runtime.executionRequested && runtime.executionReady)) {
      context.addIssue({
        code: 'custom',
        path: ['executionEnabled'],
        message: 'effective execution state is inconsistent',
      });
    }
    if (runtime.executionReady !== (runtime.executionStatus === 'ready')) {
      context.addIssue({
        code: 'custom',
        path: ['executionStatus'],
        message: 'execution readiness status is inconsistent',
      });
    }
  });

export const AGENTIC_PRINCIPAL_SCOPES = Object.freeze({
  READ: 'agentic:read',
  AGENT_WRITE: 'agentic:agent:write',
});

function publicStatusForUpstream(status) {
  if ([400, 404, 409, 412, 422, 428, 429].includes(status)) return status;
  return status >= 500 ? 503 : 502;
}

function normalizedHeaders(value) {
  if (!value) return {};
  if (typeof value.entries === 'function') return Object.fromEntries(value.entries());
  return { ...value };
}

function checkedBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('AGENTIC_CONTROL_PLANE_URL must be a valid URL');
  }
  const isLoopbackHttp =
    url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error('AGENTIC_CONTROL_PLANE_URL must use HTTPS (or loopback HTTP for local use)');
  }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('AGENTIC_CONTROL_PLANE_URL must be an origin without credentials or a path');
  }
  return new URL(url.origin);
}

function isCloudRunUrl(url) {
  return url.protocol === 'https:' && url.hostname.endsWith('.run.app');
}

function readBooleanOverride(value) {
  if (value === undefined || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('AGENTIC_CONTROL_PLANE_USE_ID_TOKEN must be true or false');
}

function safeUpstreamErrorBody(body, fallbackCode, requestId) {
  const error = body?.error;
  if (!error || typeof error !== 'object' || typeof error.code !== 'string') {
    return { error: { code: fallbackCode, message: 'Agent runtime request failed', requestId } };
  }
  return {
    error: {
      code: error.code,
      ...(typeof error.message === 'string' ? { message: error.message } : {}),
      ...(typeof error.requestId === 'string' ? { requestId: error.requestId } : { requestId }),
      ...(error.details && typeof error.details === 'object' ? { details: error.details } : {}),
      ...(Array.isArray(error.issues) ? { issues: error.issues } : {}),
    },
  };
}

async function readBoundedText(response, maximumBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new AgenticControlPlaneError('Agent runtime response exceeded its size limit', {
      code: 'AGENT_RUNTIME_RESPONSE_TOO_LARGE',
      status: 502,
      retryable: false,
      upstreamStatus: response.status,
    });
  }
  if (!response.body) return '';

  if (typeof response.body.getReader !== 'function') {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw new AgenticControlPlaneError('Agent runtime response exceeded its size limit', {
        code: 'AGENT_RUNTIME_RESPONSE_TOO_LARGE',
        status: 502,
        retryable: false,
        upstreamStatus: response.status,
      });
    }
    return new TextDecoder().decode(bytes);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel('response size limit exceeded');
        throw new AgenticControlPlaneError('Agent runtime response exceeded its size limit', {
          code: 'AGENT_RUNTIME_RESPONSE_TOO_LARGE',
          status: 502,
          retryable: false,
          upstreamStatus: response.status,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

async function parseBoundedJson(response, maximumBytes) {
  const text = await readBoundedText(response, maximumBytes);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AgenticControlPlaneError('Agent runtime returned invalid JSON', {
      code: 'AGENT_RUNTIME_INVALID_JSON',
      status: 502,
      retryable: response.status >= 500,
      upstreamStatus: response.status,
    });
  }
}

export class AgenticControlPlaneError extends Error {
  constructor(
    message,
    { code, status, retryable, upstreamStatus = null, requestId = null, publicBody = null, cause }
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AgenticControlPlaneError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.upstreamStatus = upstreamStatus;
    this.requestId = requestId;
    this.publicBody = publicBody || {
      error: { code, message, ...(requestId ? { requestId } : {}) },
    };
  }
}

export function createAgenticGoogleIdTokenProvider(audience) {
  const auth = new GoogleAuth();
  let clientPromise;
  return async function googleIdTokenHeaders() {
    clientPromise ||= auth.getIdTokenClient(audience);
    const client = await clientPromise;
    return client.getRequestHeaders(audience);
  };
}

export function signAgenticPrincipal({ principal, signingKey }) {
  const encodedPrincipal = Buffer.from(JSON.stringify(principal), 'utf8').toString('base64url');
  return {
    encodedPrincipal,
    signature: crypto.createHmac('sha256', signingKey).update(encodedPrincipal).digest('base64url'),
  };
}

export function createAgenticControlPlaneClient({
  baseUrl,
  signingKey,
  audience = DEFAULT_AUDIENCE,
  authHeaders = async () => ({}),
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  now = () => new Date(),
  requestId = () => crypto.randomUUID(),
}) {
  const base = checkedBaseUrl(baseUrl);
  if (typeof signingKey !== 'string' || signingKey.length < 32) {
    throw new Error('AGENTIC_PRINCIPAL_SIGNING_KEY must contain at least 32 characters');
  }
  if (typeof audience !== 'string' || !audience.trim() || audience.length > 200) {
    throw new Error('AGENTIC_PRINCIPAL_AUDIENCE must contain 1..200 characters');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new Error('agentic control-plane timeout must be 100..120000ms');
  }
  if (
    !Number.isInteger(maximumResponseBytes) ||
    maximumResponseBytes < 1_024 ||
    maximumResponseBytes > 8_388_608
  ) {
    throw new Error('agentic control-plane response limit must be 1024..8388608 bytes');
  }

  function principalEnvelope(owner, scopes, operationRequestId, requestBinding) {
    if (!owner?.organizationId || !owner?.workspaceId || !owner?.userId) {
      throw new Error('agentic control-plane owner identity is incomplete');
    }
    const issued = now();
    const principal = {
      version: 'orqaly_request_principal_v1',
      audience,
      requestId: operationRequestId,
      organizationId: owner.organizationId,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
      actorType: 'user',
      roles: ['owner'],
      scopes: [...new Set(scopes)].sort(),
      request: requestBinding,
      issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + PRINCIPAL_TTL_MS).toISOString(),
    };
    return { principal, ...signAgenticPrincipal({ principal, signingKey }) };
  }

  async function request({
    method,
    path,
    owner = null,
    scopes = [],
    body,
    idempotencyKey,
    ifMatch,
    authenticated = true,
    responseSchema,
    requireAgentVersionEtag = false,
  }) {
    const operationRequestId = requestId();
    const url = new URL(path, base);
    if (url.origin !== base.origin)
      throw new Error('agentic control-plane path escaped its origin');
    const controller = new AbortController();
    let timeout;
    const timeoutFailure = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        const error = new Error('agentic control-plane deadline exceeded');
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);
    });

    async function execute() {
      const authentication = normalizedHeaders(await authHeaders({ signal: controller.signal }));
      controller.signal.throwIfAborted();
      const headers = {
        accept: 'application/json',
        ...authentication,
        'x-request-id': operationRequestId,
      };
      if (authenticated) {
        const signed = principalEnvelope(owner, scopes, operationRequestId, {
          method,
          path: `${url.pathname}${url.search}`,
          bodyHash: canonicalHash(body ?? null),
          idempotencyKey: idempotencyKey || null,
          ifMatch: ifMatch || null,
        });
        headers['x-orqaly-principal'] = signed.encodedPrincipal;
        headers['x-orqaly-principal-signature'] = signed.signature;
      }
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
      if (ifMatch) headers['if-match'] = ifMatch;
      const response = await fetchImpl(url.href, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });

      const parsed = await parseBoundedJson(response, maximumResponseBytes);
      const upstreamRequestId = response.headers.get('x-request-id') || operationRequestId;
      if (!response.ok) {
        const bridgeAuthenticationFailure = [401, 403].includes(response.status);
        const code = bridgeAuthenticationFailure
          ? 'AGENT_RUNTIME_AUTHENTICATION_FAILED'
          : parsed?.error?.code || `AGENT_RUNTIME_HTTP_${response.status}`;
        const status = bridgeAuthenticationFailure ? 502 : publicStatusForUpstream(response.status);
        throw new AgenticControlPlaneError('Agent runtime rejected the request', {
          code,
          status,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          upstreamStatus: response.status,
          requestId: upstreamRequestId,
          publicBody: bridgeAuthenticationFailure
            ? {
                error: {
                  code,
                  message: 'Agent runtime authentication is unavailable',
                  requestId: upstreamRequestId,
                },
              }
            : safeUpstreamErrorBody(parsed, code, upstreamRequestId),
        });
      }
      const validated = responseSchema?.safeParse(parsed);
      if (!validated?.success) {
        throw new AgenticControlPlaneError('Agent runtime returned an invalid response contract', {
          code: 'AGENT_RUNTIME_INVALID_RESPONSE',
          status: 502,
          retryable: false,
          upstreamStatus: response.status,
          requestId: upstreamRequestId,
        });
      }
      if (requireAgentVersionEtag) {
        const etag = response.headers.get('etag');
        const match = /^"([1-9][0-9]*)"$/.exec(etag || '');
        const responseVersion = validated.data.agent.version;
        if (
          !match ||
          !Number.isSafeInteger(responseVersion) ||
          Number(match[1]) !== responseVersion
        ) {
          throw new AgenticControlPlaneError('Agent runtime returned an incoherent Agent version', {
            code: 'AGENT_RUNTIME_VERSION_ETAG_MISMATCH',
            status: 502,
            retryable: false,
            upstreamStatus: response.status,
            requestId: upstreamRequestId,
          });
        }
      }
      return {
        status: response.status,
        body: validated.data,
        headers: {
          requestId: upstreamRequestId,
          etag: response.headers.get('etag'),
          retryAfter: response.headers.get('retry-after'),
        },
      };
    }

    try {
      return await Promise.race([execute(), timeoutFailure]);
    } catch (error) {
      if (error instanceof AgenticControlPlaneError) throw error;
      const timedOut =
        controller.signal.aborted || ['AbortError', 'TimeoutError'].includes(error.name);
      throw new AgenticControlPlaneError(
        timedOut ? 'Agent runtime request timed out' : 'Agent runtime did not respond',
        {
          code: timedOut ? 'AGENT_RUNTIME_TIMEOUT' : 'AGENT_RUNTIME_UNAVAILABLE',
          status: timedOut ? 504 : 503,
          retryable: true,
          requestId: operationRequestId,
          cause: error,
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    listAgents(owner, { limit, state } = {}) {
      const query = new URLSearchParams();
      if (limit !== undefined) query.set('limit', String(limit));
      if (state) query.set('state', state);
      return request({
        method: 'GET',
        path: `/v1/agents${query.size ? `?${query}` : ''}`,
        owner,
        scopes: [AGENTIC_PRINCIPAL_SCOPES.READ],
        responseSchema: AgentListResponseSchema,
      });
    },
    createAgent(owner, body) {
      return request({
        method: 'POST',
        path: '/v1/agents',
        owner,
        scopes: [AGENTIC_PRINCIPAL_SCOPES.AGENT_WRITE],
        body,
        idempotencyKey: body?.idempotencyKey,
        responseSchema: AgentCreateResponseSchema,
        requireAgentVersionEtag: true,
      });
    },
    readAgent(owner, agentId) {
      return request({
        method: 'GET',
        path: `/v1/agents/${encodeURIComponent(agentId)}`,
        owner,
        scopes: [AGENTIC_PRINCIPAL_SCOPES.READ],
        responseSchema: AgentDetailResponseSchema,
        requireAgentVersionEtag: true,
      });
    },
    updateAgentProfile(owner, agentId, body, ifMatch) {
      return request({
        method: 'PATCH',
        path: `/v1/agents/${encodeURIComponent(agentId)}/profile`,
        owner,
        scopes: [AGENTIC_PRINCIPAL_SCOPES.AGENT_WRITE],
        body,
        idempotencyKey: body?.idempotencyKey,
        ifMatch,
        responseSchema: AgentProfileUpdateResponseSchema,
        requireAgentVersionEtag: true,
      });
    },
    changeAgentLifecycle(owner, agentId, body, ifMatch) {
      return request({
        method: 'POST',
        path: `/v1/agents/${encodeURIComponent(agentId)}/lifecycle`,
        owner,
        scopes: [AGENTIC_PRINCIPAL_SCOPES.AGENT_WRITE],
        body,
        idempotencyKey: body?.idempotencyKey,
        ifMatch,
        responseSchema: AgentLifecycleResponseSchema,
        requireAgentVersionEtag: true,
      });
    },
    listAgentRuns(owner, agentId, { limit } = {}) {
      const query = new URLSearchParams();
      if (limit !== undefined) query.set('limit', String(limit));
      return request({
        method: 'GET',
        path: `/v1/agents/${encodeURIComponent(agentId)}/runs${query.size ? `?${query}` : ''}`,
        owner,
        scopes: [AGENTIC_PRINCIPAL_SCOPES.READ],
        responseSchema: AgentRunListResponseSchema,
      });
    },
    runtimeStatus() {
      return request({
        method: 'GET',
        path: '/readyz',
        authenticated: false,
        responseSchema: RuntimeStatusResponseSchema,
      });
    },
  };
}

export function createAgenticControlPlaneClientFromEnvironment(environment = process.env) {
  const baseUrl = environment.AGENTIC_CONTROL_PLANE_URL;
  const signingKey = environment.AGENTIC_PRINCIPAL_SIGNING_KEY;
  if (!baseUrl && !signingKey) return null;
  if (!baseUrl || !signingKey) {
    throw new Error(
      'AGENTIC_CONTROL_PLANE_URL and AGENTIC_PRINCIPAL_SIGNING_KEY must be configured together'
    );
  }
  const base = checkedBaseUrl(baseUrl);
  const authOverride = readBooleanOverride(environment.AGENTIC_CONTROL_PLANE_USE_ID_TOKEN);
  const useGoogleIdToken = authOverride ?? isCloudRunUrl(base);
  return createAgenticControlPlaneClient({
    baseUrl: base.href,
    signingKey,
    audience: environment.AGENTIC_PRINCIPAL_AUDIENCE || DEFAULT_AUDIENCE,
    authHeaders: useGoogleIdToken
      ? createAgenticGoogleIdTokenProvider(base.origin)
      : async () => ({}),
  });
}
