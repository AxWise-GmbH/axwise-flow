import { nativeOrderWorkflow, nativeOrderSpec } from './native-order-routing.js';
import { normalizeNativeBundle } from '../native-workflow-bundle.js';

// Synthetic test fixture only. A customer workflow is never replaced with this
// graph. The failure branch is part of these exact approved fixture bytes.
export function nativeOwnedErrorFixture(id, { fail = false, controlledTest = false } = {}) {
  const workflow = nativeOrderWorkflow();
  if (fail) {
    workflow.nodes[1].parameters.jsonOutput =
      '={{ { "amount": $json.body.order.amount, "customer": $json.body.order.missing.trim() } }}';
  }
  workflow.settings.errorWorkflow = 'orqaly:error:failure-handler';
  const spec = nativeOrderSpec();
  spec.ownedDependencies = [
    {
      id: 'failure-handler',
      kind: 'error_handler',
      workflow: {
        name: 'Record actual native failure',
        nodes: [
          {
            id: 'native-error',
            name: 'On workflow error',
            type: 'n8n-nodes-base.errorTrigger',
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
          {
            id: 'error-details',
            name: 'Extract failure details',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [240, 0],
            parameters: {
              mode: 'raw',
              jsonOutput:
                '={{ { "parentExecutionId": $json.execution.id, "workflowName": $json.workflow.name, "message": $json.execution.error.message } }}',
              options: {},
            },
          },
        ],
        connections: {
          'On workflow error': {
            main: [[{ node: 'Extract failure details', type: 'main', index: 0 }]],
          },
        },
        settings: {},
      },
      spec: {
        kind: 'n8n_workflow_v2',
        requirements: [
          {
            id: 'capture',
            description:
              'Extract parent execution, workflow name and error message from the actual native error event',
          },
        ],
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        acceptanceCases: [
          {
            id: 'error-event',
            description: 'Actual failure payload reaches the native handler',
            requirementIds: ['capture'],
            input: {},
            assertions: [{ path: '/parentExecutionId', operator: 'exists' }],
          },
        ],
        connections: [],
        runtimeProfile: 'request_automation',
      },
    },
  ];
  return normalizeNativeBundle({ workflow, spec, id, controlledTest });
}
