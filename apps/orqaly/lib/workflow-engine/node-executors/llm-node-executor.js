/**
 * LLM node executor — wraps the existing llm-executor with ExecutionContext.
 * Supports optional tool calling and memory injection.
 */
import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { defaultProvider, defaultModel } from '../../_shared/llm-defaults.js';

/**
 * @param {object} config - Node configuration (provider, model, prompt, systemPrompt, temperature, etc.)
 * @param {object} inputData - Data from upstream nodes
 * @param {import('../execution-context.js').ExecutionContext} ctx - Execution context
 */
export async function executeLlmNode(config, inputData, ctx) {
  // Resolve prompt — support template variables like {{input.fieldName}}
  let prompt = config.prompt || '';
  let systemPrompt = config.systemPrompt || '';

  // Simple template resolution: replace {{input.key}} with inputData values
  prompt = resolveTemplate(prompt, inputData, ctx);
  systemPrompt = resolveTemplate(systemPrompt, inputData, ctx);

  // If no explicit prompt, stringify the input data as the prompt
  if (!prompt && inputData) {
    prompt = typeof inputData === 'string' ? inputData : JSON.stringify(inputData, null, 2);
  }

  if (!prompt) throw new Error('LLM node: no prompt provided and no input data');

  // Per-node LLM usage is buried inside the workflow result's nodeOutputs, so the
  // job-level logLlmUsage (which only sees the top-level result) never records it.
  // Build an admin client (established pattern for node executors) and record one
  // llm_usage row per node call. Recording is best-effort; if no admin is
  // available the tracked wrapper is a transparent passthrough.
  const admin = buildSupabaseAdminClient();
  const llmResult = await executeLlmTracked({
    prompt,
    systemPrompt: systemPrompt || undefined,
    provider: config.provider || defaultProvider(),
    model: config.model || (config.provider ? undefined : defaultModel()),
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? 2000,
    jsonMode: config.jsonMode || false,
    usage: admin
      ? {
          admin,
          userId: ctx?.userId ?? null,
          source: 'workflow-llm-node',
          operation: 'workflow-node',
        }
      : undefined,
  });

  const parsed = parseLlmJson(llmResult.content);

  return {
    output: {
      content: llmResult.content,
      parsed: parsed || undefined,
      model: llmResult.model,
      provider: llmResult.provider,
      usage: llmResult.usage,
      durationMs: llmResult.durationMs,
      estimatedCostUsd: llmResult.estimatedCostUsd,
    },
    outputPort: 'out',
  };
}

/** Replace {{input.key}} and {{var.key}} placeholders. */
function resolveTemplate(template, inputData, ctx) {
  if (!template || typeof template !== 'string') return template;

  return template.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let value;

    if (parts[0] === 'input') {
      value = getNestedValue(inputData, parts.slice(1));
    } else if (parts[0] === 'var') {
      value = getNestedValue(ctx?.variables, parts.slice(1));
    } else {
      value = getNestedValue(inputData, parts);
    }

    if (value === undefined) return match;
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

function getNestedValue(obj, path) {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}
