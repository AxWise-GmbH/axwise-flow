import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { canonicalJsonSha256 } from './canonical.js';

export function gatewayAttestationHashPayload(attestation) {
  const { receiptHash: _receiptHash, signature: _signature, ...payload } = attestation;
  return payload;
}

export function createGatewayAttestation({
  request,
  outputHash,
  recordId,
  recordCreatedAt,
  observedAt,
  idempotencyState,
  privateKey,
  keyId,
}) {
  const unsigned = {
    version: 'orqaly_gateway_effect_attestation_v1',
    contractVersion: '1.0',
    canonicalization: 'rfc8785_v1',
    organizationId: request.organizationId,
    workspaceId: request.workspaceId,
    runId: request.runId,
    stepId: request.stepId,
    effectId: request.effectId,
    attemptId: request.attemptId,
    descriptor: request.descriptor,
    canonicalInputHash: request.canonicalInputHash,
    preconditionHash: null,
    outcome: 'succeeded',
    externalReferences: [
      { referenceType: 'idempotency_key', referenceValue: request.idempotencyKey },
      { referenceType: 'idempotency_state', referenceValue: idempotencyState },
      { referenceType: 'operational_record_created_at', referenceValue: recordCreatedAt },
      { referenceType: 'operational_record_id', referenceValue: recordId },
    ],
    outputHash,
    observedCost: { amountMinor: 0, currency: 'EUR' },
    observedAt,
    signatureAlgorithm: 'ed25519_v1',
    signatureKeyId: keyId,
  };
  const receiptHash = canonicalJsonSha256(unsigned);
  const signature = crypto
    .sign(null, Buffer.from(receiptHash, 'hex'), privateKey)
    .toString('base64url');
  return { ...unsigned, receiptHash, signature };
}

export function createDispatchReceipt({ request, attestation, observedAt, replayed = false }) {
  return {
    version: 'orqaly_dispatch_receipt_v1',
    contractVersion: '1.0',
    organizationId: request.organizationId,
    workspaceId: request.workspaceId,
    runId: request.runId,
    stepId: request.stepId,
    attemptId: request.attemptId,
    descriptor: request.descriptor,
    executorBinding: request.executorBinding,
    status: 'succeeded',
    observedAt,
    executorReference: `gateway-effect:${request.effectId}:${replayed ? 'replayed' : 'created'}`,
    effectId: request.effectId,
    gatewayEffectAttestation: attestation,
    errorCode: null,
    sanitizedError: null,
  };
}

export function parseEd25519PrivateKey(pem) {
  const key = crypto.createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('attestation_key_must_be_ed25519');
  return key;
}
