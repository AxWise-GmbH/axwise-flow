#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { inspectOmp, runEngineeringTask } from './omp-client.mjs';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const result = (data, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
  isError,
});
const schema = (properties, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const TASK_PROPERTIES = {
  task: {
    type: 'string',
    minLength: 1,
    maxLength: 12_000,
    description: 'The exact repository task to perform in this conversation’s workspace.',
  },
  timeout_seconds: {
    type: 'integer',
    minimum: 10,
    maximum: 1800,
    description: 'Optional task deadline, capped by local policy.',
  },
};

export const TOOLS = [
  {
    name: 'orqanix_engineering_status',
    title: 'Check engineering runtime',
    description:
      'Check the local Oh My Pi engineering runtime for this conversation’s workspace. Makes no model request and changes no project files.',
    inputSchema: schema({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'orqanix_engineering_inspect',
    title: 'Inspect repository with engineering runtime',
    description:
      'Delegate one bounded, read-only repository inspection to local Oh My Pi. Shell, network, browser, dependency installation, commits, pushes and deployment are unavailable. Relevant local skills remain enabled.',
    inputSchema: schema(TASK_PROPERTIES, ['task']),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'orqanix_engineering_edit',
    title: 'Edit repository with engineering runtime',
    description:
      'Delegate one approved, workspace-bounded file edit to local Oh My Pi. Shell, network, browser, dependency installation, commits, pushes and deployment are unavailable. Relevant local skills remain enabled.',
    inputSchema: schema(TASK_PROPERTIES, ['task']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

function validArguments(definition, args) {
  return (
    object(args) &&
    !Object.keys(args).some((key) => !Object.hasOwn(definition.inputSchema.properties, key)) &&
    definition.inputSchema.required.every((key) => args[key] !== undefined)
  );
}

function validTask(args) {
  return (
    typeof args.task === 'string' &&
    Boolean(args.task.trim()) &&
    args.task.length <= 12_000 &&
    (args.timeout_seconds === undefined ||
      (Number.isInteger(args.timeout_seconds) &&
        args.timeout_seconds >= 10 &&
        args.timeout_seconds <= 1800))
  );
}

export function createMcpTools({ config, inspect = inspectOmp, run = runEngineeringTask }) {
  return async function call(name, args, signal) {
    const definition = TOOLS.find((tool) => tool.name === name);
    if (!definition || !validArguments(definition, args)) {
      return result({ status: 'failed', code: 'INVALID_ARGUMENTS' }, true);
    }
    try {
      if (name === 'orqanix_engineering_status') {
        const data = await inspect({ config, signal });
        return result(data, data.status !== 'available');
      }
      if (!validTask(args)) {
        return result({ status: 'failed', code: 'INVALID_ARGUMENTS' }, true);
      }
      const mode = name === 'orqanix_engineering_edit' ? 'edit' : 'inspect';
      const data = await run({
        config,
        task: args.task.trim(),
        mode,
        timeoutMs: args.timeout_seconds ? args.timeout_seconds * 1000 : undefined,
        signal,
      });
      return result(data, data.status !== 'completed');
    } catch {
      return result({ status: 'failed', code: 'ENGINEERING_RUNTIME_FAILED' }, true);
    }
  };
}

export async function serveMcp({ input = process.stdin, output = process.stdout, call }) {
  const active = new Map();
  const write = (message) => output.write(`${JSON.stringify(message)}\n`);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let initialized = false;
  for await (const line of lines) {
    let message;
    try {
      if (Buffer.byteLength(line, 'utf8') > 1_048_576) throw new Error();
      message = JSON.parse(line);
    } catch {
      write({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Invalid JSON-RPC message' },
      });
      continue;
    }
    if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      continue;
    }
    if (message.method === 'notifications/cancelled') {
      active.get(message.params?.requestId)?.abort();
      continue;
    }
    if (message.id === undefined) continue;
    if (message.method === 'initialize') {
      initialized = true;
      write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'orqanix-engineering', version: '0.1.0' },
          instructions:
            'Local, workspace-bound engineering through Oh My Pi. Existing Goose tools and skills remain available. Inspect freely when useful; request the edit tool only when the user’s task requires local file changes.',
        },
      });
    } else if (message.method === 'ping') {
      write({ jsonrpc: '2.0', id: message.id, result: {} });
    } else if (!initialized) {
      write({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32002, message: 'Initialize first' },
      });
    } else if (message.method === 'tools/list') {
      write({ jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } });
    } else if (message.method === 'tools/call') {
      const controller = new AbortController();
      active.set(message.id, controller);
      Promise.resolve()
        .then(() => call(message.params?.name, message.params?.arguments || {}, controller.signal))
        .then((data) => write({ jsonrpc: '2.0', id: message.id, result: data }))
        .catch(() =>
          write({
            jsonrpc: '2.0',
            id: message.id,
            result: result({ status: 'failed', code: 'INTERNAL_ERROR' }, true),
          })
        )
        .finally(() => active.delete(message.id));
    } else {
      write({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not supported' },
      });
    }
  }
  for (const controller of active.values()) controller.abort();
}

export async function main(argv = process.argv.slice(2)) {
  const config = await loadConfig({ argv });
  await serveMcp({ call: createMcpTools({ config }) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write(
      'Orqanix engineering extension could not start. Check its local workspace configuration.\n'
    );
    process.exitCode = 1;
  });
}
