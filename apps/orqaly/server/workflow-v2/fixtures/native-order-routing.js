// Synthetic acceptance fixture: a real five-node native graph, not a workflow
// compiler/template used by the product. Models remain the draft authors.
export const nativeOrderSpec = () => ({
  kind: 'n8n_workflow_v2',
  requirements: [
    {
      id: 'route',
      description:
        'Trim the customer name and accept orders of at least 100; reject smaller orders with HTTP 422.',
    },
  ],
  inputSchema: {
    type: 'object',
    properties: {
      order: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          customer: { type: 'string' },
        },
        required: ['amount', 'customer'],
        additionalProperties: false,
      },
    },
    required: ['order'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: { accepted: { type: 'boolean' }, customer: { type: 'string' } },
    required: ['accepted', 'customer'],
    additionalProperties: false,
  },
  acceptanceCases: [
    {
      id: 'accepted',
      description: 'A large order is accepted and its name trimmed',
      requirementIds: ['route'],
      input: { order: { amount: 100, customer: ' Ada ' } },
      expectedOutput: { accepted: true, customer: 'Ada' },
      expectedStatus: 200,
      assertions: [],
    },
    {
      id: 'rejected',
      description: 'A small order gets a meaningful rejection',
      requirementIds: ['route'],
      input: { order: { amount: 2, customer: ' Lin ' } },
      expectedOutput: { accepted: false, customer: 'Lin' },
      expectedStatus: 422,
      assertions: [],
    },
  ],
  connections: [],
  runtimeProfile: 'request_automation',
});
const node = (id, name, type, typeVersion, parameters, position) => ({
  id,
  name,
  type: `n8n-nodes-base.${type}`,
  typeVersion,
  parameters,
  position,
});
const wire = (node) => ({ node, type: 'main', index: 0 });
export function nativeOrderWorkflow({ broken = false } = {}) {
  return {
    name: 'Route customer orders',
    nodes: [
      node(
        'receive',
        'Receive order',
        'webhook',
        2.1,
        { httpMethod: 'POST', path: 'draft', responseMode: 'responseNode', options: {} },
        [0, 0]
      ),
      node(
        'normalize',
        'Normalize order',
        'set',
        3.4,
        {
          mode: 'raw',
          jsonOutput:
            '={{ { "amount": $json.body.order.amount, "customer": $json.body.order.customer.trim() } }}',
          options: {},
        },
        [240, 0]
      ),
      node(
        'route',
        'Check amount',
        'if',
        2.3,
        {
          conditions: {
            options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
            combinator: 'and',
            conditions: [
              {
                id: 'minimum',
                leftValue: '={{ $json.amount }}',
                rightValue: broken ? 200 : 100,
                operator: { type: 'number', operation: 'gte' },
              },
            ],
          },
          options: {},
        },
        [480, 0]
      ),
      node(
        'accept',
        'Accept order',
        'respondToWebhook',
        1.5,
        {
          respondWith: 'json',
          responseBody: '={{ { "accepted": true, "customer": $json.customer } }}',
          options: {},
        },
        [720, -100]
      ),
      node(
        'reject',
        'Reject order',
        'respondToWebhook',
        1.5,
        {
          respondWith: 'json',
          responseBody: '={{ { "accepted": false, "customer": $json.customer } }}',
          options: { responseCode: 422 },
        },
        [720, 100]
      ),
    ],
    connections: {
      'Receive order': { main: [[wire('Normalize order')]] },
      'Normalize order': { main: [[wire('Check amount')]] },
      'Check amount': { main: [[wire('Accept order')], [wire('Reject order')]] },
    },
    settings: {},
  };
}
