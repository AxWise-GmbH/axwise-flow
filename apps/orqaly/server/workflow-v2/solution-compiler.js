import { canonicalJsonSha256 as canonicalHash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  SolutionInputSchema,
  SolutionSpecSchema,
} from '../../shared/workflow-v2/solution-contracts.js';

// Only the compiler creates n8n expressions. Neither user input nor an LLM can
// supply executable expressions, arbitrary node types, URLs or credentials.
export function compileSolutionWorkflow({ id, spec }) {
  const parsed = SolutionSpecSchema.parse(spec);
  return workflowForMappings(id, parsed.fields);
}

// A partial authoring blueprint is never an executable Solution specification.
// Only complete, individually validated mappings appear on its native canvas;
// unresolved mappings remain explicit questions/partial fields beside it.
export function compileSolutionBlueprint({ id, fields = [] }) {
  const complete = fields.filter((field) => field.source && field.target && field.transform);
  if (complete.length) SolutionSpecSchema.parse({ kind: 'webhook_transform_v1', fields: complete });
  return workflowForMappings(id, complete);
}

function workflowForMappings(id, fields) {
  // Set's raw JSON mode preserves scalar types for copy mappings.
  const entries = fields.map(({ source, target, transform }) => {
    const value = `$json.body.input[${JSON.stringify(source)}]`;
    const suffix = {
      copy: '',
      trim: '.trim()',
      lowercase: '.toLowerCase()',
      uppercase: '.toUpperCase()',
    }[transform];
    return `${JSON.stringify(target)}: ${value}${suffix}`;
  });
  const workflow = {
    name: `Orqaly solution ${id} v1`,
    nodes: [
      {
        id: 'receive',
        name: 'Receive input',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: id,
        parameters: {
          httpMethod: 'POST',
          path: `solution-${id}`,
          responseMode: 'responseNode',
          options: {},
        },
      },
      {
        id: 'transform',
        name: 'Transform fields',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [260, 0],
        parameters: { mode: 'raw', jsonOutput: `={{ { ${entries.join(', ')} } }}`, options: {} },
      },
      {
        id: 'respond',
        name: 'Return result',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [520, 0],
        parameters: {
          respondWith: 'json',
          responseBody:
            '={{ { output: $json, executionId: $execution.id, invocationId: $("Receive input").first().json.body.invocationId } }}',
          options: { responseCode: 200 },
        },
      },
    ],
    connections: {
      'Receive input': { main: [[{ node: 'Transform fields', type: 'main', index: 0 }]] },
      'Transform fields': { main: [[{ node: 'Return result', type: 'main', index: 0 }]] },
    },
    settings: {
      executionOrder: 'v1',
      executionTimeout: 30,
      saveDataSuccessExecution: 'none',
      saveDataErrorExecution: 'none',
    },
  };
  return { workflow, workflowHash: canonicalHash(workflow), mappingCount: fields.length };
}

// Reference evaluator is a test oracle / validator, NEVER the execution fallback.
export function expectedSolutionOutput(spec, input) {
  SolutionSpecSchema.parse(spec);
  SolutionInputSchema.parse(input);
  return Object.fromEntries(
    spec.fields.map(({ source, target, transform }) => {
      if (!Object.hasOwn(input, source)) throw new Error(`Missing required input field: ${source}`);
      const value = input[source];
      if (transform !== 'copy' && typeof value !== 'string') {
        throw new Error(`Input field ${source} must be text for ${transform}`);
      }
      return [
        target,
        transform === 'copy'
          ? value
          : transform === 'trim'
            ? value.trim()
            : transform === 'lowercase'
              ? value.toLowerCase()
              : value.toUpperCase(),
      ];
    })
  );
}
