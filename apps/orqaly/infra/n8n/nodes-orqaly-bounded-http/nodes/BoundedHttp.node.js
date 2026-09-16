'use strict';
const { NodeOperationError } = require('n8n-workflow');
const { deliver, validateScope, hash } = require('../transport.cjs');
class BoundedHttp {
  constructor() {
    this.description = require('../description.json');
  }
  async execute() {
    const node = this.getNode();
    try {
      if (this.getInputData().length !== 1 || node.retryOnFail || node.continueOnFail || node.onError && node.onError !== 'stopWorkflow') throw new Error('OUTBOUND_EXECUTION_MODE_DENIED');
      const credentials = await this.getCredentials('orqalyBoundedHttp');
      const target = validateScope(JSON.parse(credentials.scope));
      if (node.id !== target.nodeId || node.typeVersion !== 1 || hash(node.parameters) !== target.parametersHash ||
          node.parameters.url !== target.destination || node.parameters.method !== target.method ||
          !/^[a-f0-9-]{36}$/.test(credentials.connectionId)) throw new Error('OUTBOUND_FROZEN_SCOPE_CHANGED');
      const raw = this.getNodeParameter('body', 0);
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const result = await deliver({ url: target.destination, method: target.method, body, headerName: credentials.headerName, headerValue: credentials.headerValue });
      return [[{ json: { ...result, connectionId: credentials.connectionId }, pairedItem: { item: 0 } }]];
    } catch (error) {
      // Known fixed diagnostics only. Never interpolate node inputs, provider
      // error strings, URLs or credential values into the execution error.
      const message = error?.delivery === 'unknown' ? 'ORQALY_OUTBOUND_RESULT_UNKNOWN' : 'ORQALY_OUTBOUND_NOT_SENT';
      throw new NodeOperationError(node, message, { description: message });
    }
  }
}
module.exports = { BoundedHttp };
