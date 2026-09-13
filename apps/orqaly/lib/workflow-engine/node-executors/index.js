/**
 * Node executor registry — maps block type → executor function.
 *
 * Each executor has the signature:
 *   async (config, inputData, ctx) => { output, outputPort }
 */
import { executeTrigger } from './trigger-executor.js';
import { executeLlmNode } from './llm-node-executor.js';
import { executeHttpNode } from './http-node-executor.js';
import { executeCondition } from './condition-executor.js';
import { executeTransform } from './transform-executor.js';
import { executeDelay } from './delay-executor.js';
import { executeToolNode } from './tool-executor.js';
import { executeWebhookNode } from './webhook-node-executor.js';
import { executeDomainTool } from './domain-tool-executor.js';
import { executeCostGuard } from './cost-guard-executor.js';
import { executeReport } from './report-executor.js';
import { executeHumanApproval } from './human-approval-executor.js';
import { executeSubAgent } from './sub-agent-executor.js';

const EXECUTORS = {
  trigger: executeTrigger,
  llm: executeLlmNode,
  http: executeHttpNode,
  condition: executeCondition,
  transform: executeTransform,
  delay: executeDelay,
  tool: executeToolNode,
  webhook: executeWebhookNode,
  domaintool: executeDomainTool,
  costguard: executeCostGuard,
  report: executeReport,
  humanapproval: executeHumanApproval,
  subagent: executeSubAgent,
};

/**
 * Get the executor for a block type.
 * Falls back to a passthrough executor for unknown types.
 */
export function getExecutor(blockType) {
  const normalized = (blockType || '').toLowerCase().replace(/[-\s]/g, '');
  return EXECUTORS[normalized] || passthroughExecutor;
}

/**
 * Register a custom executor at runtime.
 */
export function registerExecutor(blockType, executorFn) {
  EXECUTORS[blockType] = executorFn;
}

/**
 * Default passthrough — forwards input as output for unknown block types.
 * This ensures unknown/funnel nodes (landing-page, campaign-attach, etc.)
 * don't break execution, they just pass data through.
 */
async function passthroughExecutor(config, inputData) {
  return {
    output: inputData,
    outputPort: 'out',
  };
}
