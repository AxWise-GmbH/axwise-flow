import { Buffer } from 'node:buffer';
import { ZodError } from 'zod';
import { canonicalJson } from '../domain/canonical.js';
import {
  DispatchReceiptV1Schema,
  ExecutionEnvelopeV1Schema,
  projectN8nConnectorRequestV1,
  verifyGatewayAttestationSignature,
} from '../domain/runtime-contracts.js';
import {
  N8nBindingManifestError,
  assertN8nDescriptorBinding,
  selectN8nBinding,
} from './n8n-binding-manifest.js';

export class N8nExecutorError extends Error {
  constructor(code, { ambiguous = false, cause = undefined, status = undefined } = {}) {
    super(code, { cause });
    this.name = 'N8nExecutorError';
    this.code = code;
    this.ambiguous = ambiguous;
    this.status = status;
  }
}

function executionMayHaveApplied(envelope) {
  return envelope.effectProfile.externality === 'write';
}

function dispatchIdempotencyKey(envelope) {
  if (executionMayHaveApplied(envelope)) {
    return `${envelope.idempotencyScope}:${envelope.idempotencyKey}`;
  }
  return `${envelope.runId}:${envelope.stepId}:${envelope.attemptId}`;
}

function fixedWebhookUrl(baseUrl, webhookPath) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(base.hostname)) {
    throw new Error('n8n_executor_https_required');
  }
  const url = new URL(`/webhook/${webhookPath}`, base);
  if (url.origin !== base.origin) throw new Error('n8n_executor_origin_invalid');
  return url;
}

function assertWorkloadToken(token) {
  if (
    typeof token !== 'string' ||
    token.length < 16 ||
    token.length > 8_192 ||
    !/^[A-Za-z0-9._~+/=-]+$/.test(token)
  ) {
    throw new N8nExecutorError(
      token ? 'gateway_workload_authorization_invalid' : 'gateway_workload_authorization_missing'
    );
  }
  return token;
}

async function boundedResponseText(response, maximumBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new N8nExecutorError('n8n_response_too_large', { status: response.status });
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new N8nExecutorError('n8n_response_too_large', { status: response.status });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function assertReceiptMatchesEnvelope(receipt, envelope) {
  const fields = [
    ['organizationId', receipt.organizationId, envelope.organizationId],
    ['workspaceId', receipt.workspaceId, envelope.workspaceId],
    ['runId', receipt.runId, envelope.runId],
    ['stepId', receipt.stepId, envelope.stepId],
    ['attemptId', receipt.attemptId, envelope.attemptId],
    ['effectId', receipt.effectId, envelope.effectId],
  ];
  for (const [field, actual, expected] of fields) {
    if (actual !== expected) {
      throw new N8nExecutorError('n8n_receipt_identity_mismatch', {
        cause: new Error(field),
      });
    }
  }
  if (
    canonicalJson(receipt.descriptor) !== canonicalJson(envelope.descriptor) ||
    canonicalJson(receipt.executorBinding) !== canonicalJson(envelope.executorBinding)
  ) {
    throw new N8nExecutorError('n8n_receipt_contract_mismatch');
  }
  if (
    receipt.gatewayEffectAttestation &&
    receipt.gatewayEffectAttestation.canonicalInputHash !== envelope.canonicalInputHash
  ) {
    throw new N8nExecutorError('gateway_attestation_input_mismatch');
  }
}

export class N8nExecutor {
  constructor({
    baseUrl,
    bindingManifest,
    bindingKey = 'tool_gateway_connector_v1',
    bindingVersion = '1.0',
    timeoutMs = 30_000,
    maximumResponseBytes = 262_144,
    fetchImpl = globalThis.fetch,
    identityTokenProvider = async () => null,
    gatewayWorkloadTokenProvider = async () => null,
    gatewayPublicKeyResolver = async () => null,
    now = () => new Date(),
  }) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch_implementation_required');
    const selected = selectN8nBinding(bindingManifest, { bindingKey, bindingVersion });
    this.bindingManifest = selected.manifest;
    this.binding = selected.binding;
    this.url = fixedWebhookUrl(baseUrl, this.binding.webhookPath);
    this.timeoutMs = timeoutMs;
    this.maximumResponseBytes = maximumResponseBytes;
    this.fetch = fetchImpl;
    this.identityTokenProvider = identityTokenProvider;
    this.gatewayWorkloadTokenProvider = gatewayWorkloadTokenProvider;
    this.gatewayPublicKeyResolver = gatewayPublicKeyResolver;
    this.now = now;
  }

  async dispatch(rawEnvelope) {
    const envelope = ExecutionEnvelopeV1Schema.parse(rawEnvelope);
    if (!['connector_read', 'connector_write', 'notify'].includes(envelope.stepKind)) {
      throw new N8nExecutorError('n8n_step_kind_not_supported');
    }
    if (envelope.stepKind === 'notify' && envelope.effectProfile.externality !== 'write') {
      throw new N8nExecutorError('internal_notification_does_not_use_n8n');
    }
    try {
      assertN8nDescriptorBinding(this.bindingManifest, this.binding, envelope);
    } catch (error) {
      if (error instanceof N8nBindingManifestError) {
        throw new N8nExecutorError(error.code, { cause: error });
      }
      throw error;
    }

    const connectorRequest = projectN8nConnectorRequestV1(envelope);
    if (connectorRequest.gatewayGrant.audience !== this.binding.toolGatewayAudience) {
      throw new N8nExecutorError('gateway_grant_audience_mismatch');
    }
    const dispatchTime = new Date(this.now());
    if (Number.isNaN(dispatchTime.valueOf())) {
      throw new N8nExecutorError('executor_clock_invalid');
    }
    if (new Date(connectorRequest.gatewayGrant.issuedAt) > dispatchTime) {
      throw new N8nExecutorError('gateway_grant_not_yet_valid');
    }
    if (new Date(connectorRequest.gatewayGrant.expiresAt) <= dispatchTime) {
      throw new N8nExecutorError('gateway_grant_expired');
    }

    const gatewayIdentityMode = this.binding.gatewayIdentityMode || 'forwarded_workload_token_v1';
    let gatewayWorkloadToken = null;
    if (gatewayIdentityMode === 'forwarded_workload_token_v1') {
      try {
        gatewayWorkloadToken = assertWorkloadToken(
          await this.gatewayWorkloadTokenProvider(this.binding.toolGatewayAudience)
        );
      } catch (error) {
        if (error instanceof N8nExecutorError) throw error;
        throw new N8nExecutorError('gateway_workload_authorization_failed', { cause: error });
      }
    }

    let n8nIdentityToken;
    try {
      n8nIdentityToken = await this.identityTokenProvider(this.url.origin);
    } catch (error) {
      throw new N8nExecutorError('n8n_identity_authorization_failed', { cause: error });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch(this.url, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-orqaly-request-id': envelope.attemptId,
          // Writes retain one logical-effect identity across attempts. The
          // attempt ID remains available separately for tracing and receipts.
          'idempotency-key': dispatchIdempotencyKey(envelope),
          ...(gatewayWorkloadToken
            ? { 'x-orqaly-tool-gateway-authorization': `Bearer ${gatewayWorkloadToken}` }
            : {}),
          ...(n8nIdentityToken ? { authorization: `Bearer ${n8nIdentityToken}` } : {}),
        },
        body: JSON.stringify(connectorRequest),
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new N8nExecutorError(
        error?.name === 'AbortError' ? 'n8n_dispatch_timeout' : 'n8n_dispatch_failed',
        { ambiguous: executionMayHaveApplied(envelope), cause: error }
      );
    }

    try {
      const responseText = await boundedResponseText(response, this.maximumResponseBytes);
      if (!response.ok) {
        throw new N8nExecutorError('n8n_http_error', { status: response.status });
      }
      let rawReceipt;
      try {
        rawReceipt = JSON.parse(responseText);
      } catch (error) {
        throw new N8nExecutorError('n8n_receipt_json_invalid', { cause: error });
      }

      return await this.verifyReceipt(rawReceipt, envelope);
    } catch (error) {
      if (error instanceof N8nExecutorError) {
        error.ambiguous = error.ambiguous || executionMayHaveApplied(envelope);
        throw error;
      }
      throw new N8nExecutorError('n8n_response_processing_failed', {
        ambiguous: executionMayHaveApplied(envelope),
        cause: error,
        status: response.status,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  // Reconcile a stored Gateway receipt without sending another connector call.
  // Identity, descriptor, input hash and signature checks are identical to dispatch.
  async verifyReceipt(rawReceipt, envelope) {
    let receipt;
    try {
      receipt = DispatchReceiptV1Schema.parse(rawReceipt);
    } catch (error) {
      throw new N8nExecutorError('n8n_receipt_contract_invalid', {
        cause: error instanceof ZodError ? error : undefined,
      });
    }
    assertReceiptMatchesEnvelope(receipt, envelope);
    if (receipt.gatewayEffectAttestation) {
      let key;
      try {
        key = await this.gatewayPublicKeyResolver(receipt.gatewayEffectAttestation.signatureKeyId);
      } catch (error) {
        throw new N8nExecutorError('gateway_attestation_key_resolution_failed', {
          cause: error,
        });
      }
      if (!key) throw new N8nExecutorError('gateway_attestation_key_unknown');
      try {
        verifyGatewayAttestationSignature(receipt.gatewayEffectAttestation, key);
      } catch (error) {
        throw new N8nExecutorError('gateway_attestation_signature_invalid', {
          cause: error,
        });
      }
    }
    return receipt;
  }
}
