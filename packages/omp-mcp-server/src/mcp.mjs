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
  acceptance_criteria: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 1000 }, description: 'Concrete conditions the edit and its tests must satisfy.' },
  research_references: { type: 'array', maxItems: 8, items: schema({ conversationId: { type: 'string' }, requestId: { type: 'string' }, artifactHash: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, ['conversationId', 'requestId', 'artifactHash']), description: 'Exact AxWise artifact identifiers from completed research in this conversation.' },
};

export const TOOLS = [
  {
    name: 'orqanix_engineering_status',
    title: 'Check engineering runtime',
    description:
      'Check the local Oh My Pi engineering runtime. This does not test Jev. Makes no model request and changes no project files.',
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
      'Explore and inspect the local repository with Oh My Pi (OMP). Use this tool for codebase search, symbol lookups, multi-file inspection, and architectural analysis. It does not edit files.',
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
      'Perform approved file modifications with the bounded Oh My Pi (OMP) edit and write tools; OMP shell access is not exposed in this mode. The optional test_command is an arbitrary local process and remains open-world unless the desktop separately sandboxes or allowlists it. Provide acceptance_criteria and exact research_references when using AxWise research. The bridge runs the approved test command, then captures workspace changes and test results. When the JEV capability is enabled, that evidence is sent for advisory review; when disabled, review is not evaluated and the edit cannot report that its checks passed.',
    inputSchema: schema({ ...TASK_PROPERTIES, test_command: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', maxLength: 2000 }, description: 'Approved executable and arguments for local tests, without a shell; e.g. ["node","--test","feature.test.mjs"].' } }, ['task']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'orqanix_engineering_exec',
    title: 'Execute terminal workflows with engineering runtime',
    description:
      'Run an approved terminal-oriented task with Oh My Pi (OMP), such as a build, test, Git operation, migration, or script. OMP can run local shell commands with filesystem or network effects. The result is the bounded OMP assistant report.',
    inputSchema: schema(TASK_PROPERTIES, ['task']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
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
    (args.acceptance_criteria === undefined || (Array.isArray(args.acceptance_criteria) && args.acceptance_criteria.length <= 12 && args.acceptance_criteria.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000))) &&
    (args.research_references === undefined || (Array.isArray(args.research_references) && args.research_references.length <= 8 && args.research_references.every(value => object(value) && Object.keys(value).length === 3 && /^[A-Za-z0-9_-]{1,128}$/.test(value.conversationId) && /^[a-f0-9-]{36}$/i.test(value.requestId) && /^[a-f0-9]{64}$/.test(value.artifactHash)))) &&
    (args.test_command === undefined || (Array.isArray(args.test_command) && args.test_command.length > 0 && args.test_command.length <= 32 && args.test_command.every(value => typeof value === 'string' && value.length <= 2000 && !value.includes('\0')) && Boolean(args.test_command[0]))) &&
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
      const mode = name === 'orqanix_engineering_edit'
        ? 'edit'
        : name === 'orqanix_engineering_exec'
          ? 'exec'
          : 'inspect';
      const data = await run({
        config,
        task: args.task.trim(),
        mode,
        acceptanceCriteria: args.acceptance_criteria,
        researchReferences: args.research_references,
        testCommand: args.test_command,
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
            'Local, workspace-bound engineering powered by Oh My Pi (OMP). Existing Goose tools and skills remain available. Use engineering_inspect for repository exploration, engineering_edit for approved edits, and engineering_exec for terminal-oriented workflows. Forward exact completed AxWise research references and acceptance criteria. Supply an approved test_command only to engineering_edit to capture real tests; that arbitrary local process is open-world unless the desktop separately sandboxes or allowlists it. When enabled, JEV is an advisory review of edit evidence, not proof of production readiness. Never describe review_required, failed or not_evaluated as checks passed or evidence reviewed.',
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
