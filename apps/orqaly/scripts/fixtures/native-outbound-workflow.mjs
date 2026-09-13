export function nativeOutboundFixture(url = 'https://outbound-fixture.orqaly.example/ok') {
  const wire = (node) => ({ node, type: 'main', index: 0 });
  const workflow = { name: 'Deliver approved JSON event', settings: {}, nodes: [
    { id: 'receive', name: 'Receive event', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0], parameters: { httpMethod: 'POST', path: 'unused', responseMode: 'responseNode', options: {} } },
    { id: 'deliver', name: 'Deliver event', type: 'CUSTOM.boundedHttp', typeVersion: 1, position: [240, 0], parameters: { url, method: 'POST', body: '={{ $json.body }}' } },
    { id: 'respond', name: 'Return receipt', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: [480, 0], parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} } },
  ], connections: { 'Receive event': { main: [[wire('Deliver event')]] }, 'Deliver event': { main: [[wire('Return receipt')]] } } };
  const spec = { kind: 'n8n_workflow_v2', runtimeProfile: 'request_automation', requirements: [{ id: 'deliver', description: 'Deliver one approved event and return only a bounded acknowledgement' }],
    inputSchema: { type: 'object', properties: { event: { type: 'string', maxLength: 100 } }, required: ['event'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { delivery: { type: 'string' }, statusCode: { type: 'integer' }, responseBytes: { type: 'integer' }, connectionId: { type: 'string' } }, required: ['delivery','statusCode','connectionId'], additionalProperties: true },
    acceptanceCases: [{ id: 'approved-event', description: 'Receiver accepts approved event', requirementIds: ['deliver'], input: { event: 'ready' }, assertions: [{ path: '/delivery', operator: 'equals', value: 'accepted' }, { path: '/statusCode', operator: 'equals', value: 200 }] }],
    connections: [{ id: 'receiver', provider: 'Customer HTTPS receiver', operation: 'POST JSON event', purpose: 'Deliver an approved event', credentialType: 'orqalyBoundedHttp', nodeIds: ['deliver'] }] };
  return { workflow, spec };
}
