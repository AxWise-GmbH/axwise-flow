import { GoogleAuth } from 'google-auth-library';
import {
  AxWiseOperationEventPageSchema,
  AxWiseOperationResponseSchema,
} from '../../shared/workflow-v2/contracts.js';

export class AxWiseDispatchError extends Error {
  constructor(message, { retryable, errorClass, status = null, disposition = 'terminal' }) {
    super(message);
    this.name = 'AxWiseDispatchError';
    this.retryable = retryable;
    this.errorClass = errorClass;
    this.status = status;
    this.disposition = disposition;
  }
}

function assertStatusUrl(baseUrl, statusUrl, operationId, tenantId) {
  const base = new URL(baseUrl);
  const status = new URL(statusUrl);
  if (
    status.origin !== base.origin ||
    status.pathname !== `/v2/operations/${operationId}` ||
    status.searchParams.get('tenantId') !== tenantId ||
    [...status.searchParams.keys()].some((key) => key !== 'tenantId')
  ) {
    throw new AxWiseDispatchError('AxWise returned an untrusted status URL', {
      retryable: false,
      errorClass: 'AXWISE_STATUS_URL_REJECTED',
    });
  }
  return status.href;
}

export function createGoogleIdTokenProvider(audience) {
  const auth = new GoogleAuth();
  let clientPromise;
  return async function headers() {
    clientPromise ||= auth.getIdTokenClient(audience);
    const client = await clientPromise;
    return client.getRequestHeaders(audience);
  };
}

export function createAxWiseClient({
  baseUrl,
  authHeaders = createGoogleIdTokenProvider(baseUrl),
  fetchImpl = fetch,
  timeoutMs = 120_000,
}) {
  const operationUrl = new URL('/v2/operations', baseUrl).href;

  function deterministicStatusUrl(operationId, tenantId) {
    const url = new URL(`/v2/operations/${operationId}`, baseUrl);
    url.searchParams.set('tenantId', tenantId);
    return url.href;
  }

  async function request(url, options, { operationId, tenantId, isPoll, signal }) {
    let response;
    try {
      signal?.throwIfAborted();
      const providedHeaders = await authHeaders();
      signal?.throwIfAborted();
      const authenticationHeaders =
        typeof providedHeaders?.entries === 'function'
          ? Object.fromEntries(providedHeaders.entries())
          : providedHeaders;
      response = await fetchImpl(url, {
        ...options,
        headers: { ...authenticationHeaders, ...options.headers },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
      signal?.throwIfAborted();
    } catch (error) {
      signal?.throwIfAborted();
      throw new AxWiseDispatchError('AxWise request did not return', {
        retryable: true,
        errorClass: error.name === 'TimeoutError' ? 'AXWISE_TIMEOUT' : 'AXWISE_NETWORK',
        disposition: 'ambiguous',
      });
    }
    if (isPoll && response.status === 404) {
      throw new AxWiseDispatchError('AxWise operation was not found', {
        retryable: true,
        errorClass: 'AXWISE_OPERATION_NOT_FOUND',
        status: 404,
        disposition: 'not_found',
      });
    }
    if (!response.ok && response.status !== 202) {
      throw new AxWiseDispatchError('AxWise request failed', {
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        errorClass: `AXWISE_HTTP_${response.status}`,
        status: response.status,
      });
    }
    let body;
    try {
      body = await response.json();
    } catch {
      signal?.throwIfAborted();
      throw new AxWiseDispatchError('AxWise returned invalid JSON', {
        retryable: true,
        errorClass: 'AXWISE_INVALID_JSON',
        status: response.status,
        disposition: 'ambiguous',
      });
    }
    signal?.throwIfAborted();
    let parsed;
    try {
      parsed = AxWiseOperationResponseSchema.parse(body);
    } catch {
      const terminalBody = ['completed', 'failed'].includes(body?.status);
      throw new AxWiseDispatchError('AxWise response violated the operation contract', {
        retryable: !terminalBody,
        errorClass: terminalBody
          ? 'AXWISE_INVALID_TERMINAL_CONTRACT'
          : 'AXWISE_INVALID_CONTRACT',
        status: response.status,
        disposition: terminalBody ? 'terminal' : 'ambiguous',
      });
    }
    if (['accepted', 'running', 'cancel_requested'].includes(parsed.status)) {
      parsed.statusUrl = assertStatusUrl(
        baseUrl,
        parsed.statusUrl,
        operationId,
        tenantId
      );
    }
    return parsed;
  }

  async function eventPage(operationId, tenantId, after = 0, limit = 200) {
    const url = new URL(`/v2/operations/${operationId}/events`, baseUrl);
    url.searchParams.set('tenantId', tenantId);
    url.searchParams.set('after', String(after));
    url.searchParams.set('limit', String(limit));
    let response;
    try {
      const providedHeaders = await authHeaders();
      const authenticationHeaders =
        typeof providedHeaders?.entries === 'function'
          ? Object.fromEntries(providedHeaders.entries())
          : providedHeaders;
      response = await fetchImpl(url.href, {
        method: 'GET',
        headers: authenticationHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AxWiseDispatchError('AxWise event request did not return', {
        retryable: true,
        errorClass: error.name === 'TimeoutError' ? 'AXWISE_TIMEOUT' : 'AXWISE_NETWORK',
        disposition: 'ambiguous',
      });
    }
    if (response.status === 404) {
      throw new AxWiseDispatchError('AxWise operation was not found', {
        retryable: true,
        errorClass: 'AXWISE_OPERATION_NOT_FOUND',
        status: 404,
        disposition: 'not_found',
      });
    }
    if (!response.ok) {
      throw new AxWiseDispatchError('AxWise event request failed', {
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        errorClass: `AXWISE_HTTP_${response.status}`,
        status: response.status,
      });
    }
    try {
      return AxWiseOperationEventPageSchema.parse(await response.json());
    } catch {
      throw new AxWiseDispatchError('AxWise returned invalid operation events', {
        retryable: true,
        errorClass: 'AXWISE_INVALID_EVENT_CONTRACT',
        status: response.status,
        disposition: 'ambiguous',
      });
    }
  }

  return {
    submit(envelope) {
      return request(operationUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': envelope.operationId,
        },
        body: JSON.stringify(envelope),
      }, {
        operationId: envelope.operationId,
        tenantId: envelope.owner.tenantId,
        isPoll: false,
      });
    },
    poll(statusUrl, operationId, tenantId, { signal } = {}) {
      return request(assertStatusUrl(baseUrl, statusUrl, operationId, tenantId), {
        method: 'GET',
        headers: { 'idempotency-key': operationId },
      }, { operationId, tenantId, isPoll: true, signal });
    },
    events(operationId, tenantId, { after = 0, limit = 200 } = {}) {
      return eventPage(operationId, tenantId, after, limit);
    },
    cancel(operationId, tenantId) {
      const url = new URL(`/v2/operations/${operationId}/cancel`, baseUrl);
      url.searchParams.set('tenantId', tenantId);
      return request(url.href, { method: 'POST', headers: {} }, {
        operationId,
        tenantId,
        isPoll: true,
      });
    },
    deterministicStatusUrl,
  };
}
