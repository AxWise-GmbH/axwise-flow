import type { BlockDefinition } from '../types';

const inAny = (id: string, displayName: string) => ({
  id,
  direction: 'input' as const,
  portType: 'any' as const,
  displayName,
});

const outAny = (id: string, displayName: string) => ({
  id,
  direction: 'output' as const,
  portType: 'any' as const,
  displayName,
});

export const PREDEFINED_BLOCKS: BlockDefinition[] = [
  {
    type: 'trigger',
    displayName: 'Trigger',
    category: 'core',
    inputs: [],
    outputs: [outAny('out', 'Out')],
    configurableProperties: [
      { key: 'event', label: 'Event', type: 'string', description: 'Trigger event name' },
    ],
    allowCircularDependencies: false,
  },
  {
    type: 'webhook',
    displayName: 'Webhook',
    category: 'io',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('out', 'Out')],
    configurableProperties: [{ key: 'url', label: 'URL', type: 'string', required: true }],
    allowCircularDependencies: false,
  },
  {
    type: 'http',
    displayName: 'HTTP',
    category: 'io',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('out', 'Out')],
    configurableProperties: [
      {
        key: 'method',
        label: 'Method',
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      },
      { key: 'url', label: 'URL', type: 'string', required: true },
      { key: 'headers', label: 'Headers', type: 'json' },
      { key: 'body', label: 'Body', type: 'json' },
    ],
    allowCircularDependencies: false,
  },
  {
    type: 'llm',
    displayName: 'LLM',
    category: 'ai',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('out', 'Out')],
    configurableProperties: [
      {
        key: 'provider',
        label: 'Provider',
        type: 'string',
        enum: ['openai', 'groq', 'anthropic', 'other'],
      },
      { key: 'model', label: 'Model', type: 'string' },
      { key: 'prompt', label: 'Prompt', type: 'string' },
    ],
    allowCircularDependencies: false,
  },
  {
    type: 'condition',
    displayName: 'Condition',
    category: 'flow',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('true', 'True'), outAny('false', 'False')],
    configurableProperties: [
      { key: 'expression', label: 'Expression', type: 'string', required: true },
    ],
    allowCircularDependencies: false,
  },
  {
    type: 'transform',
    displayName: 'Transform',
    category: 'flow',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('out', 'Out')],
    configurableProperties: [{ key: 'mapping', label: 'Mapping', type: 'json' }],
    allowCircularDependencies: false,
  },
  {
    type: 'delay',
    displayName: 'Delay',
    category: 'flow',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('out', 'Out')],
    configurableProperties: [{ key: 'ms', label: 'Milliseconds', type: 'number', required: true }],
    allowCircularDependencies: false,
  },
  {
    type: 'tool',
    displayName: 'Tool',
    category: 'io',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('out', 'Out')],
    configurableProperties: [
      { key: 'toolId', label: 'Tool ID', type: 'string', required: true, description: 'ID of a registered tool' },
      { key: 'payload', label: 'Payload', type: 'json', description: 'Input data for the tool' },
    ],
    allowCircularDependencies: false,
  },
  {
    type: 'loop',
    displayName: 'Loop',
    category: 'flow',
    inputs: [inAny('in', 'In')],
    outputs: [outAny('item', 'Item'), outAny('done', 'Done')],
    configurableProperties: [
      { key: 'arrayPath', label: 'Array Path', type: 'string', required: true, description: 'Dot-notation path to array in input data' },
      { key: 'maxIterations', label: 'Max Iterations', type: 'number', description: 'Safety limit (default: 100)' },
    ],
    allowCircularDependencies: true,
  },
];

export const DEFAULT_ALIASES: Record<string, string> = {
  'web hook': 'webhook',
  webhook: 'webhook',
  'http request': 'http',
  http: 'http',
  llm: 'llm',
  'large language model': 'llm',
  'ai model': 'llm',
  condition: 'condition',
  'if else': 'condition',
  transform: 'transform',
  'data transform': 'transform',
  delay: 'delay',
  wait: 'delay',
  trigger: 'trigger',
  tool: 'tool',
  'execute tool': 'tool',
  loop: 'loop',
  'for each': 'loop',
  iterate: 'loop',
};
