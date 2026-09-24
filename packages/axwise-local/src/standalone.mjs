#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { createKernel, createSpecialistTools, validateTools } from './runtime.mjs';
import { serveMcp } from './mcp.mjs';
import { createByokProvider } from './byok-provider.mjs';
import { parseStandaloneArguments, readStandaloneConfig, standaloneScope } from './standalone-config.mjs';
import { AXWISE_STANDALONE_BOUNDARY, AXWISE_STANDALONE_POLICY } from './conversation-policy.mjs';

/** Reword trusted host guidance only, never selected evidence or user prompts. */
export function standaloneKernel(kernel) {
  const generic = (text) => typeof text === 'string' ? text.replaceAll('Goose Code Mode', 'host tool orchestration')
    .replaceAll('to Goose', 'to the MCP host').replaceAll('for Goose', 'for the MCP host')
    .replaceAll('inside Goose', 'inside the MCP host').replaceAll('authorize Goose', 'authorize the MCP host') : text;
  return async (request, signal) => {
    const result = await kernel(request, signal);
    if (request.operation === 'describe' && Array.isArray(result?.tools))
      return { ...result, tools: result.tools.map((tool) => ({ ...tool, description: generic(tool.description) })) };
    if (request.operation.startsWith('prepare') && result && typeof result === 'object')
      return { ...result, systemPrompt: generic(result.systemPrompt),
        ...(Array.isArray(result.generationTasks) ? { generationTasks: result.generationTasks.map((task) => ({ ...task,
          systemPrompt: generic(task.systemPrompt) })) } : {}) };
    return result;
  };
}

export async function main(argv, { input = process.stdin, output = process.stdout, env = process.env,
  fetchImpl = fetch, kernelFactory = createKernel } = {}) {
  const options = parseStandaloneArguments(argv);
  const config = await readStandaloneConfig(options.configPath);
  const kernel = standaloneKernel(kernelFactory(options));
  const tools = validateTools(await kernel({ operation: 'describe' }), { boundary: AXWISE_STANDALONE_BOUNDARY });
  const provider = createByokProvider({ config, env, fetchImpl });
  await serveMcp({ tools, input, output, instructions: AXWISE_STANDALONE_POLICY, strictInitialization: true,
    serverInfo: { name: 'axwise-extension', version: '0.3.0' },
    call: createSpecialistTools({ ...standaloneScope(config), kernel, provider, presentation: 'generic' }) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('Standalone Axwise could not start. Check its configuration and packaged Node/Python runtime.\n');
    process.exitCode = 1;
  });
}
