import crypto from 'node:crypto';
import { canonicalJsonSha256 } from './canonical.js';
import { DispatchReceiptSchema, parseConnectorRequest } from './contracts.js';
import {
  createDispatchReceipt,
  createGatewayAttestation,
  parseEd25519PrivateKey,
} from './signing.js';

export class ToolGatewayExecutionService {
  constructor({ config, store, now = () => new Date(), randomUUID = crypto.randomUUID }) {
    this.config = config;
    this.store = store;
    this.now = now;
    this.randomUUID = randomUUID;
    this.privateKey = parseEd25519PrivateKey(
      config.TOOL_GATEWAY_ATTESTATION_PRIVATE_KEY.replaceAll('\\n', '\n')
    );
  }

  async execute(rawRequest, headers = {}) {
    const observed = new Date(this.now());
    if (Number.isNaN(observed.valueOf())) throw new Error('gateway_clock_invalid');
    const request = parseConnectorRequest(rawRequest, this.config, observed);
    if (headers.requestId !== request.attemptId) throw new Error('request_id_mismatch');
    if (headers.idempotencyKey !== `${request.idempotencyScope}:${request.idempotencyKey}`) {
      throw new Error('idempotency_header_mismatch');
    }

    const proposedRecordId = this.randomUUID();
    const proposedCreatedAt = observed.toISOString();
    const proposedOutput = {
      version: 'orqaly_operational_record_result_v1',
      recordId: proposedRecordId,
      title: request.canonicalInput.title,
      details: request.canonicalInput.details ?? null,
      createdAt: proposedCreatedAt,
      canonicalInputHash: request.canonicalInputHash,
    };
    const proposedOutputHash = canonicalJsonSha256(proposedOutput);
    const proposedAttestation = createGatewayAttestation({
      request,
      outputHash: proposedOutputHash,
      recordId: proposedRecordId,
      recordCreatedAt: proposedCreatedAt,
      observedAt: proposedCreatedAt,
      idempotencyState: 'created',
      privateKey: this.privateKey,
      keyId: this.config.TOOL_GATEWAY_ATTESTATION_KEY_ID,
    });
    const proposedReceipt = createDispatchReceipt({
      request,
      attestation: proposedAttestation,
      observedAt: proposedCreatedAt,
      replayed: false,
    });
    const result = await this.store.commitOperationalRecord({
      request,
      recordId: proposedRecordId,
      dispatchReceipt: proposedReceipt,
      receiptHash: proposedAttestation.receiptHash,
      createdAt: proposedCreatedAt,
    });
    if (result.state === 'created') return DispatchReceiptSchema.parse(proposedReceipt);

    const storedReceipt = DispatchReceiptSchema.parse(result.dispatchReceipt);
    if (
      storedReceipt.effectId !== request.effectId ||
      storedReceipt.gatewayEffectAttestation?.receiptHash !== result.receiptHash ||
      storedReceipt.gatewayEffectAttestation?.outputHash == null
    ) {
      throw new Error('stored_effect_receipt_mismatch');
    }
    const receiptObservedAt = new Date(this.now()).toISOString();
    const attestation = createGatewayAttestation({
      request,
      outputHash: storedReceipt.gatewayEffectAttestation.outputHash,
      recordId: result.recordId,
      recordCreatedAt: result.createdAt,
      observedAt: receiptObservedAt,
      idempotencyState: 'replayed',
      privateKey: this.privateKey,
      keyId: this.config.TOOL_GATEWAY_ATTESTATION_KEY_ID,
    });
    return DispatchReceiptSchema.parse(
      createDispatchReceipt({
        request,
        attestation,
        observedAt: receiptObservedAt,
        replayed: result.state === 'replayed',
      })
    );
  }
}
