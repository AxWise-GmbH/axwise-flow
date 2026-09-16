const CONTROL_PLANE_ENV_KEY = 'VITE_AGENTIC_CONTROL_PLANE_URL';
const API_PREFIX = '/v1';

function configuredBaseUrl(explicitBaseUrl) {
  const envBaseUrl = import.meta.env?.[CONTROL_PLANE_ENV_KEY];
  const value = explicitBaseUrl ?? envBaseUrl ?? '';
  return String(value).trim().replace(/\/+$/, '');
}

function appendQuery(url, query = {}) {
  const entries = Object.entries(query).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );
  if (entries.length === 0) return url;

  const params = new URLSearchParams();
  for (const [key, value] of entries) params.set(key, String(value));
  return `${url}?${params.toString()}`;
}

function readableErrorCode(code) {
  if (!code) return '';
  const words = String(code).replaceAll('_', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  const body = await response.text().catch(() => '');
  return body ? { message: body } : {};
}

export class AgenticControlPlaneError extends Error {
  constructor(
    message,
    { status = 0, code = 'CONTROL_PLANE_ERROR', details = null, requestId = null } = {}
  ) {
    super(message);
    this.name = 'AgenticControlPlaneError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * Provider-neutral client for the GCP control plane's currently published v1 API.
 * Authentication stays injectable; this frontend does not mint or persist a
 * signed Orqaly principal.
 */
export function createAgenticControlPlaneClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
  getAuthHeaders = async () => ({}),
} = {}) {
  const resolvedBaseUrl = configuredBaseUrl(baseUrl);

  async function request(
    path,
    { method = 'GET', query, body, stateVersion, signal, idempotencyKey } = {}
  ) {
    if (!resolvedBaseUrl) {
      throw new AgenticControlPlaneError(
        `Agentic Control is not connected. Set ${CONTROL_PLANE_ENV_KEY} to the GCP control-plane URL.`,
        { code: 'CONTROL_PLANE_NOT_CONFIGURED' }
      );
    }
    if (typeof fetchImpl !== 'function') {
      throw new AgenticControlPlaneError('Fetch is unavailable in this environment.', {
        code: 'FETCH_UNAVAILABLE',
      });
    }

    const injectedHeaders = await getAuthHeaders();
    const headers = { Accept: 'application/json', ...(injectedHeaders || {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    if (stateVersion !== undefined && stateVersion !== null) {
      headers['If-Match'] = String(stateVersion);
    }

    const response = await fetchImpl(appendQuery(`${resolvedBaseUrl}${path}`, query), {
      method,
      headers,
      credentials: 'include',
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      const errorEnvelope =
        payload?.error && typeof payload.error === 'object' ? payload.error : null;
      const code = errorEnvelope?.code || payload?.code || 'CONTROL_PLANE_REQUEST_FAILED';
      const message =
        payload?.message ||
        errorEnvelope?.message ||
        (typeof payload?.error === 'string' ? payload.error : '') ||
        readableErrorCode(code) ||
        `Control-plane request failed (${response.status}).`;
      throw new AgenticControlPlaneError(message, {
        status: response.status,
        code,
        details: errorEnvelope?.details ?? errorEnvelope?.issues ?? payload?.details ?? null,
        requestId: errorEnvelope?.requestId || payload?.requestId || null,
      });
    }
    return payload;
  }

  return {
    admitTask(input, options = {}) {
      return request(`${API_PREFIX}/task-admissions`, {
        ...options,
        method: 'POST',
        body: input,
      });
    },
    materializeAgentFromTask(input, options = {}) {
      return request(`${API_PREFIX}/agents/from-task`, {
        ...options,
        method: 'POST',
        body: input,
        idempotencyKey: options.idempotencyKey || input?.idempotencyKey,
      });
    },
    listAgents({ limit = 50, state } = {}, options = {}) {
      return request(`${API_PREFIX}/agents`, {
        ...options,
        query: { limit, state },
      });
    },
    getRun(runId, options = {}) {
      return request(`${API_PREFIX}/runs/${encodeURIComponent(runId)}`, options);
    },
    listApprovals({ limit = 50, status = 'pending' } = {}, options = {}) {
      return request(`${API_PREFIX}/approvals`, {
        ...options,
        query: { limit, status },
      });
    },
    decideApproval(approvalId, decision, stateVersion, options = {}) {
      return request(`${API_PREFIX}/approvals/${encodeURIComponent(approvalId)}/decision`, {
        ...options,
        method: 'POST',
        body: decision,
        stateVersion,
        idempotencyKey: options.idempotencyKey || decision?.idempotencyKey,
      });
    },
    submitPlanVersion(runId, submission, stateVersion, options = {}) {
      return request(`${API_PREFIX}/runs/${encodeURIComponent(runId)}/plan-versions`, {
        ...options,
        method: 'POST',
        body: submission,
        stateVersion,
        idempotencyKey: options.idempotencyKey || submission?.idempotencyKey,
      });
    },
  };
}

export const agenticControlPlaneClient = createAgenticControlPlaneClient();
