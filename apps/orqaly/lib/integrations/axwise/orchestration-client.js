/**
 * AxWise Phase 1-3 orchestration client.
 *
 * This is deliberately separate from client.js: conditions/evaluate is a
 * small advisory overlay, while orchestration decisions are immutable,
 * idempotent goal-planning records with their own lifecycle.
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { normalizeAxwiseApiUrl } from './url-policy.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const SAFE_PARTNER_CODE = /^AXWISE_[A-Z0-9_]{1,92}$/;

function bounded(value, maximum = 500) {
  const text =
    typeof value === 'string'
      ? [...value]
          .map((character) => {
            const code = character.codePointAt(0);
            return code < 32 || code === 127 ? ' ' : character;
          })
          .join('')
          .trim()
      : '';
  return text ? text.slice(0, maximum) : null;
}

async function partnerError(response) {
  const headerRequestId = bounded(response.headers?.get?.('x-request-id'), 255);
  let body = null;
  try {
    body = JSON.parse(await response.text());
  } catch {
    // Arbitrary text/HTML responses are intentionally never surfaced or stored.
  }
  const detail = body?.detail && typeof body.detail === 'object' ? body.detail : body;
  const code = bounded(detail?.code, 100);
  const trustedCode = code && SAFE_PARTNER_CODE.test(code) ? code : null;
  return {
    code: trustedCode,
    detail: trustedCode ? bounded(detail?.message, 500) : null,
    requestId: bounded(detail?.request_id, 255) || headerRequestId,
  };
}

function credentials(options = {}) {
  const apiUrl = options.apiUrl || process.env.AXWISE_API_URL;
  const apiKey = options.apiKey || process.env.AXWISE_API_KEY;
  if (!apiUrl) throw new Error('AXWISE_API_URL not configured');
  if (!apiKey) throw new Error('AXWISE_API_KEY not configured');
  return { baseUrl: normalizeAxwiseApiUrl(apiUrl), apiKey };
}

async function requestJson(path, { method = 'GET', body, headers = {}, ...options } = {}) {
  const { baseUrl, apiKey } = credentials(options);
  const response = await fetchWithRetry(
    `${baseUrl}${path}`,
    {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-axwise-key': apiKey,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS, retries: 1 }
  );

  if (!response.ok) {
    const partner = await partnerError(response);
    const suffix = [
      partner.code ? `[${partner.code}]` : null,
      partner.detail ? `: ${partner.detail}` : null,
      partner.requestId ? `(request ${partner.requestId})` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const error = new Error(
      `AxWise orchestration API error: HTTP ${response.status}${suffix ? ` ${suffix}` : ''}`
    );
    error.status = response.status;
    error.code = partner.code || `AXWISE_HTTP_${response.status}`;
    error.partnerCode = partner.code;
    error.requestId = partner.requestId;
    error.partnerDetail = partner.detail;
    throw error;
  }
  return response.json();
}

export function createOrchestrationDecision(request, options = {}) {
  if (!options.idempotencyKey) {
    throw new Error('createOrchestrationDecision: idempotencyKey is required');
  }
  return requestJson('/orchestration/decisions', {
    ...options,
    method: 'POST',
    body: request,
    headers: {
      'Idempotency-Key': options.idempotencyKey,
      ...(options.requestId ? { 'X-Request-ID': options.requestId } : {}),
    },
  });
}

function tenantHeaders(tenant) {
  if (!tenant?.orgId || !tenant?.userId) {
    throw new Error('AxWise orchestration tenant orgId and userId are required');
  }
  return {
    'X-Orqaly-Org-ID': tenant.orgId,
    'X-Orqaly-User-ID': tenant.userId,
  };
}

export function getOrchestrationDecision(decisionId, tenant, options = {}) {
  if (!decisionId) throw new Error('getOrchestrationDecision: decisionId is required');
  return requestJson(`/orchestration/decisions/${encodeURIComponent(decisionId)}`, {
    ...options,
    headers: tenantHeaders(tenant),
  });
}

export function getPersonaResearchStatus(jobId, tenant, options = {}) {
  if (!jobId) throw new Error('getPersonaResearchStatus: jobId is required');
  return requestJson(`/runs/${encodeURIComponent(jobId)}/status`, {
    ...options,
    headers: tenantHeaders(tenant),
  });
}

export function getPersonaResearchResult(jobId, tenant, options = {}) {
  if (!jobId) throw new Error('getPersonaResearchResult: jobId is required');
  return requestJson(`/runs/${encodeURIComponent(jobId)}`, {
    ...options,
    headers: tenantHeaders(tenant),
  });
}

export function refreshOrchestrationResearch(decisionId, tenant, options = {}) {
  if (!options.idempotencyKey) {
    throw new Error('refreshOrchestrationResearch: idempotencyKey is required');
  }
  return requestJson(
    `/orchestration/decisions/${encodeURIComponent(decisionId)}/research/refresh`,
    {
      ...options,
      method: 'POST',
      headers: {
        ...tenantHeaders(tenant),
        'Idempotency-Key': options.idempotencyKey,
        ...(options.requestId ? { 'X-Request-ID': options.requestId } : {}),
      },
    }
  );
}

export function replanOrchestrationDecision(decisionId, tenant, change, options = {}) {
  if (!options.idempotencyKey) {
    throw new Error('replanOrchestrationDecision: idempotencyKey is required');
  }
  return requestJson(`/orchestration/decisions/${encodeURIComponent(decisionId)}/replan`, {
    ...options,
    method: 'POST',
    body: change,
    headers: {
      ...tenantHeaders(tenant),
      'Idempotency-Key': options.idempotencyKey,
      ...(options.requestId ? { 'X-Request-ID': options.requestId } : {}),
    },
  });
}

export function submitOrchestrationOutcome(decisionId, tenant, outcome, options = {}) {
  if (!options.idempotencyKey) {
    throw new Error('submitOrchestrationOutcome: idempotencyKey is required');
  }
  return requestJson(`/orchestration/decisions/${encodeURIComponent(decisionId)}/outcomes`, {
    ...options,
    method: 'POST',
    body: outcome,
    headers: {
      ...tenantHeaders(tenant),
      'Idempotency-Key': options.idempotencyKey,
    },
  });
}

export function listOrchestrationOutcomes(decisionId, tenant, options = {}) {
  if (!decisionId) throw new Error('listOrchestrationOutcomes: decisionId is required');
  return requestJson(`/orchestration/decisions/${encodeURIComponent(decisionId)}/outcomes`, {
    ...options,
    headers: tenantHeaders(tenant),
  });
}
