import http from 'node:http';
import { Buffer } from 'node:buffer';
import { ZodError } from 'zod';
import { authorizeWorkload, WorkloadAuthorizationError } from './auth.js';
import { ToolGatewayStoreError } from './store.js';

const MAXIMUM_BODY_BYTES = 64 * 1024;

function sendJson(response, status, payload) {
  const bytes = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(bytes.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(bytes);
}

async function readJson(request) {
  if (
    !String(request.headers['content-type'] || '')
      .toLowerCase()
      .startsWith('application/json')
  ) {
    throw new Error('content_type_invalid');
  }
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAXIMUM_BODY_BYTES)
    throw new Error('request_too_large');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAXIMUM_BODY_BYTES) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('request_json_invalid');
  }
}

function publicError(error) {
  if (error instanceof WorkloadAuthorizationError) return { status: 401, code: error.code };
  if (error instanceof ZodError) return { status: 400, code: 'connector_request_invalid' };
  if (error instanceof ToolGatewayStoreError) {
    if (['gateway_grant_denied', 'idempotency_identity_conflict'].includes(error.code)) {
      return { status: 409, code: error.code };
    }
    return { status: 503, code: error.code };
  }
  const safeCodes = new Set([
    'content_type_invalid',
    'request_too_large',
    'request_json_invalid',
    'descriptor_hash_not_allowlisted',
    'executor_binding_hash_not_allowlisted',
    'connection_reference_not_allowlisted',
    'gateway_audience_mismatch',
    'request_authority_expired_or_not_yet_valid',
    'request_id_mismatch',
    'idempotency_header_mismatch',
  ]);
  return {
    status: 400,
    code: safeCodes.has(error?.message) ? error.message : 'tool_gateway_failed',
  };
}

export function createToolGatewayHandler({ config, executionService, now = () => new Date() }) {
  return async function handler(request, response) {
    if (request.method === 'GET' && request.url === '/healthz') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (request.method !== 'POST' || request.url !== '/v1/effects/execute') {
      return sendJson(response, 404, { error: 'not_found' });
    }
    try {
      authorizeWorkload(request.headers.authorization, config, now());
      const body = await readJson(request);
      const receipt = await executionService.execute(body, {
        requestId: request.headers['x-orqaly-request-id'],
        idempotencyKey: request.headers['idempotency-key'],
      });
      return sendJson(response, 200, receipt);
    } catch (error) {
      const mapped = publicError(error);
      return sendJson(response, mapped.status, { error: mapped.code });
    }
  };
}

export function createToolGatewayServer(dependencies) {
  return http.createServer(createToolGatewayHandler(dependencies));
}
