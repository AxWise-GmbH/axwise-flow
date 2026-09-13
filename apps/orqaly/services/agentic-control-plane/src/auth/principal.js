import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 } from '../domain/canonical.js';

export const PRINCIPAL_SCOPES = Object.freeze({
  READ: 'agentic:read',
  ADMIT: 'agentic:admit',
  AGENT_WRITE: 'agentic:agent:write',
  MATERIALIZE: 'agentic:materialize',
  PLAN_WRITE: 'agentic:plan:write',
  APPROVAL_DECIDE: 'agentic:approval:decide',
});

const PrincipalScopeSchema = z.enum(Object.values(PRINCIPAL_SCOPES));
const PrincipalRequestSchema = z
  .object({
    method: z
      .string()
      .regex(/^[A-Z]+$/)
      .max(16),
    path: z.string().startsWith('/v1/').max(2_048),
    bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
    idempotencyKey: z.string().min(1).max(200).nullable(),
    ifMatch: z.string().min(1).max(200).nullable(),
  })
  .strict();

const PrincipalSchema = z
  .object({
    version: z.literal('orqaly_request_principal_v1'),
    audience: z.string().min(1).max(200),
    requestId: z.string().min(1).max(200),
    organizationId: z.string().min(1).max(200),
    workspaceId: z.string().min(1).max(200),
    userId: z.string().min(1).max(200),
    actorType: z.enum(['user', 'service']),
    roles: z.array(z.string().min(1).max(100)).max(32).default([]),
    scopes: z
      .array(PrincipalScopeSchema)
      .min(1)
      .max(Object.keys(PRINCIPAL_SCOPES).length)
      .superRefine((scopes, context) => {
        const canonical = [...new Set(scopes)].sort();
        if (
          canonical.length !== scopes.length ||
          canonical.some((scope, index) => scope !== scopes[index])
        ) {
          context.addIssue({
            code: 'custom',
            message: 'principal scopes must be sorted and unique',
          });
        }
      }),
    request: PrincipalRequestSchema,
    issuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

function decodeBase64Url(value) {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    throw new PrincipalError('principal_encoding_invalid', 401);
  }
}

function expectedSignature(encodedPrincipal, key) {
  return crypto.createHmac('sha256', key).update(encodedPrincipal).digest('base64url');
}

function signaturesEqual(actual, expected) {
  const actualBytes = Buffer.from(actual || '', 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return (
    actualBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(actualBytes, expectedBytes)
  );
}

export class PrincipalError extends Error {
  constructor(code, status = 401) {
    super(code);
    this.name = 'PrincipalError';
    this.code = code;
    this.status = status;
  }
}

export function verifyPrincipalEnvelope({
  encodedPrincipal,
  signature,
  signingKey,
  audience,
  maxTtlSeconds = 300,
  now = new Date(),
  request = null,
  requestId = null,
}) {
  if (!encodedPrincipal || !signature) {
    throw new PrincipalError('principal_required', 401);
  }

  const expected = expectedSignature(encodedPrincipal, signingKey);
  if (!signaturesEqual(signature, expected)) {
    throw new PrincipalError('principal_signature_invalid', 401);
  }

  let decoded;
  try {
    decoded = JSON.parse(decodeBase64Url(encodedPrincipal));
  } catch (error) {
    if (error instanceof PrincipalError) throw error;
    throw new PrincipalError('principal_payload_invalid', 401);
  }

  const parsed = PrincipalSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new PrincipalError('principal_contract_invalid', 401);
  }

  const principal = parsed.data;
  if (principal.audience !== audience) {
    throw new PrincipalError('principal_audience_invalid', 403);
  }

  const issuedAt = new Date(principal.issuedAt);
  const expiresAt = new Date(principal.expiresAt);
  const ttlMs = expiresAt.getTime() - issuedAt.getTime();
  if (ttlMs <= 0 || ttlMs > maxTtlSeconds * 1000) {
    throw new PrincipalError('principal_ttl_invalid', 401);
  }
  if (issuedAt.getTime() > now.getTime() + 30_000) {
    throw new PrincipalError('principal_not_yet_valid', 401);
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new PrincipalError('principal_expired', 401);
  }
  if (requestId !== null && principal.requestId !== requestId) {
    throw new PrincipalError('principal_request_id_mismatch', 401);
  }
  if (request !== null) {
    const parsedRequest = PrincipalRequestSchema.safeParse(request);
    if (
      !parsedRequest.success ||
      canonicalJsonSha256(principal.request) !== canonicalJsonSha256(parsedRequest.data)
    ) {
      throw new PrincipalError('principal_request_binding_invalid', 401);
    }
  }

  return Object.freeze(principal);
}

export function principalMiddleware(config) {
  return (req, res, next) => {
    try {
      req.principal = verifyPrincipalEnvelope({
        encodedPrincipal: req.get('x-orqaly-principal'),
        signature: req.get('x-orqaly-principal-signature'),
        signingKey: config.ORQALY_PRINCIPAL_SIGNING_KEY,
        audience: config.ORQALY_PRINCIPAL_AUDIENCE,
        maxTtlSeconds: config.ORQALY_PRINCIPAL_MAX_TTL_SECONDS,
        requestId: req.requestId,
        request: {
          method: req.method,
          path: req.originalUrl,
          bodyHash: canonicalJsonSha256(req.body ?? null),
          idempotencyKey: req.get('idempotency-key') || null,
          ifMatch: req.get('if-match') || null,
        },
      });
      next();
    } catch (error) {
      if (error instanceof PrincipalError) {
        return res.status(error.status).json({
          error: {
            code: error.code,
            requestId: req.requestId || null,
          },
        });
      }
      next(error);
    }
  };
}

export function requirePrincipalScope(requiredScope) {
  if (!Object.values(PRINCIPAL_SCOPES).includes(requiredScope)) {
    throw new Error('principal_scope_unknown');
  }
  return (req, res, next) => {
    if (!req.principal?.scopes?.includes(requiredScope)) {
      return res.status(403).json({
        error: {
          code: 'principal_scope_required',
          requestId: req.requestId || null,
        },
      });
    }
    next();
  };
}

export function approvalAuditActorTypeForVerifiedPrincipal(principal) {
  return principal?.actorType === 'user' ? 'human' : null;
}

export function requireHumanPrincipal(req, res, next) {
  if (approvalAuditActorTypeForVerifiedPrincipal(req.principal) === null) {
    return res.status(403).json({
      error: {
        code: 'human_principal_required',
        requestId: req.requestId || null,
      },
    });
  }
  next();
}

export function signPrincipalForTest(principal, signingKey, request = principal.request) {
  const boundPrincipal = { ...principal, request: PrincipalRequestSchema.parse(request) };
  const encodedPrincipal = Buffer.from(JSON.stringify(boundPrincipal), 'utf8').toString(
    'base64url'
  );
  return {
    encodedPrincipal,
    signature: expectedSignature(encodedPrincipal, signingKey),
  };
}
