import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRINCIPAL_SCOPES,
  PrincipalError,
  approvalAuditActorTypeForVerifiedPrincipal,
  requireHumanPrincipal,
  requirePrincipalScope,
  signPrincipalForTest,
  verifyPrincipalEnvelope,
} from '../src/auth/principal.js';
import { appConfig, principal } from './fixtures.js';

const config = appConfig();
const now = new Date('2026-09-04T10:01:00.000Z');

function verify(value = principal(), changes = {}) {
  const signed = signPrincipalForTest(value, config.ORQALY_PRINCIPAL_SIGNING_KEY);
  return verifyPrincipalEnvelope({
    ...signed,
    signingKey: config.ORQALY_PRINCIPAL_SIGNING_KEY,
    audience: config.ORQALY_PRINCIPAL_AUDIENCE,
    maxTtlSeconds: config.ORQALY_PRINCIPAL_MAX_TTL_SECONDS,
    now,
    ...changes,
  });
}

test('verifies a tenant-scoped short-lived principal', () => {
  assert.equal(verify().workspaceId, 'workspace-1');
});

test('rejects a forged signature without parsing authority', () => {
  assert.throws(
    () => verify(principal(), { signature: 'forged' }),
    (error) => error instanceof PrincipalError && error.code === 'principal_signature_invalid'
  );
});

test('rejects wrong audience, expired principals and excessive TTL', () => {
  assert.throws(
    () => verify(principal({ audience: 'other-service' })),
    (error) => error.code === 'principal_audience_invalid'
  );
  assert.throws(
    () => verify(principal({ expiresAt: '2026-09-04T10:00:30.000Z' })),
    (error) => error.code === 'principal_expired'
  );
  assert.throws(
    () => verify(principal({ expiresAt: '2026-09-04T10:10:00.000Z' })),
    (error) => error.code === 'principal_ttl_invalid'
  );
});

test('rejects missing, duplicate or unsorted authorization scopes', () => {
  assert.throws(
    () => verify(principal({ scopes: [] })),
    (error) => error.code === 'principal_contract_invalid'
  );
  assert.throws(
    () => verify(principal({ scopes: ['agentic:read', 'agentic:read'] })),
    (error) => error.code === 'principal_contract_invalid'
  );
  assert.throws(
    () => verify(principal({ scopes: ['agentic:read', 'agentic:admit'] })),
    (error) => error.code === 'principal_contract_invalid'
  );
});

test('binds the principal to one request ID, route, body, and mutation headers', () => {
  const value = principal();
  assert.equal(
    verify(value, { request: value.request, requestId: value.requestId }).requestId,
    value.requestId
  );
  assert.throws(
    () =>
      verify(value, {
        request: { ...value.request, path: '/v1/agents' },
        requestId: value.requestId,
      }),
    (error) => error.code === 'principal_request_binding_invalid'
  );
  assert.throws(
    () => verify(value, { request: value.request, requestId: 'different-request' }),
    (error) => error.code === 'principal_request_id_mismatch'
  );
});

test('route scope middleware denies a valid principal without action authority', () => {
  const middleware = requirePrincipalScope(PRINCIPAL_SCOPES.APPROVAL_DECIDE);
  let responseStatus;
  let responseBody;
  let nextCalled = false;
  middleware(
    { requestId: 'request-scope', principal: principal({ scopes: ['agentic:read'] }) },
    {
      status(status) {
        responseStatus = status;
        return this;
      },
      json(body) {
        responseBody = body;
      },
    },
    () => {
      nextCalled = true;
    }
  );
  assert.equal(responseStatus, 403);
  assert.equal(responseBody.error.code, 'principal_scope_required');
  assert.equal(nextCalled, false);
});

test('approval actor semantics accept a verified user as human and reject a service', () => {
  const verifiedUser = verify();
  const verifiedService = verify(principal({ actorType: 'service' }));
  assert.equal(approvalAuditActorTypeForVerifiedPrincipal(verifiedUser), 'human');
  assert.equal(approvalAuditActorTypeForVerifiedPrincipal(verifiedService), null);

  let responseStatus;
  let responseBody;
  let nextCalled = false;
  requireHumanPrincipal(
    { requestId: 'request-human', principal: verifiedService },
    {
      status(status) {
        responseStatus = status;
        return this;
      },
      json(body) {
        responseBody = body;
      },
    },
    () => {
      nextCalled = true;
    }
  );
  assert.equal(responseStatus, 403);
  assert.equal(responseBody.error.code, 'human_principal_required');
  assert.equal(nextCalled, false);
});
