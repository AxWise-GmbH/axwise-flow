/**
 * n8n Workflow JSON → Orqaly WorkflowGraph converter.
 *
 * Takes a standard n8n workflow export JSON and converts it to
 * the Orqaly format (ReactFlow nodes/edges + metadata).
 */
import { resolveN8nNodeType } from './n8n-node-map.js';
import { defaultProvider, defaultModel } from '../../_shared/llm-defaults.js';

/**
 * Convert an n8n workflow JSON to Orqaly workflow data.
 *
 * @param {object} n8nWorkflow - Parsed n8n workflow JSON
 * @returns {{ name: string, nodes: Array, edges: Array, warnings: string[], meta: object }}
 */
export function convertN8nWorkflow(n8nWorkflow) {
  const warnings = [];

  if (!n8nWorkflow || typeof n8nWorkflow !== 'object') {
    throw new Error('Invalid n8n workflow JSON');
  }

  const name = n8nWorkflow.name || 'Imported n8n Workflow';
  const n8nNodes = n8nWorkflow.nodes || [];
  const n8nConnections = n8nWorkflow.connections || {};

  if (n8nNodes.length === 0) {
    throw new Error('n8n workflow has no nodes');
  }

  // Build node ID mapping (n8n uses names as IDs in connections)
  const nodeNameToId = {};
  const nodes = [];
  let skippedCount = 0;

  for (const n8nNode of n8nNodes) {
    const resolution = resolveN8nNodeType(n8nNode.type);

    if (!resolution) {
      skippedCount++;
      continue; // Skip sticky notes, no-ops, etc.
    }

    if (resolution.warning) {
      warnings.push(resolution.warning);
    }

    const nodeId = n8nNode.id || `n8n_${n8nNode.name?.replace(/\s+/g, '_') || Date.now()}`;
    nodeNameToId[n8nNode.name] = nodeId;

    // Convert n8n node position
    const position = {
      x: n8nNode.position?.[0] ?? Math.random() * 600,
      y: n8nNode.position?.[1] ?? Math.random() * 400,
    };

    // Extract configuration from n8n parameters
    const config = convertN8nParameters(n8nNode, resolution.blockType);

    nodes.push({
      id: nodeId,
      type: 'workflow',
      position,
      data: {
        nodeId,
        blockType: resolution.blockType,
        blockId: resolution.blockType,
        label: n8nNode.name || resolution.blockType,
        config,
        _n8nType: n8nNode.type,
        _n8nTypeVersion: n8nNode.typeVersion,
      },
    });
  }

  // Convert connections
  const edges = [];
  let edgeCounter = 0;

  for (const [sourceName, outputs] of Object.entries(n8nConnections)) {
    const sourceId = nodeNameToId[sourceName];
    if (!sourceId) continue;

    // n8n connections: { "NodeName": { "main": [[{ "node": "TargetName", "type": "main", "index": 0 }]] } }
    const mainOutputs = outputs.main || [];

    for (let outputIdx = 0; outputIdx < mainOutputs.length; outputIdx++) {
      const connections = mainOutputs[outputIdx] || [];

      for (const conn of connections) {
        const targetId = nodeNameToId[conn.node];
        if (!targetId) continue;

        edgeCounter++;
        const sourcePort =
          outputIdx === 0 ? 'right-out' : outputIdx === 1 ? 'right-out-2' : 'right-out';

        edges.push({
          id: `e_n8n_${edgeCounter}`,
          source: sourceId,
          target: targetId,
          type: 'workflow',
          sourceHandle: sourcePort,
          targetHandle: 'left-in',
          style: { strokeWidth: 2 },
          data: {
            connectionType: 'outgoing',
            connectionId: `n8n_conn_${edgeCounter}`,
            _n8nOutputIndex: outputIdx,
          },
        });
      }
    }
  }

  if (skippedCount > 0) {
    warnings.push(`Skipped ${skippedCount} non-functional node(s) (sticky notes, etc.)`);
  }

  return {
    name,
    nodes,
    edges,
    warnings,
    meta: {
      importedFrom: 'n8n',
      originalNodeCount: n8nNodes.length,
      convertedNodeCount: nodes.length,
      connectionCount: edges.length,
      importedAt: new Date().toISOString(),
    },
  };
}

/**
 * Convert n8n node parameters to Orqaly block config.
 */
function convertN8nParameters(n8nNode, blockType) {
  const params = n8nNode.parameters || {};
  const config = {};

  switch (blockType) {
    case 'trigger':
      config.event = n8nNode.type?.includes('webhook') ? 'webhook' : 'manual';
      break;

    case 'webhook':
      config.url = params.url || params.path || '';
      break;

    case 'http':
      config.url = params.url || '';
      config.method = params.method || params.requestMethod || 'GET';
      if (params.headerParameters?.parameters) {
        config.headers = {};
        for (const h of params.headerParameters.parameters) {
          if (h.name) config.headers[h.name] = h.value || '';
        }
      }
      if (params.bodyParameters?.parameters || params.body) {
        config.body = params.body || params.bodyParameters?.parameters || {};
      }
      break;

    case 'llm':
      // Extract model and provider from n8n AI node type
      if (n8nNode.type?.includes('OpenAi') || n8nNode.type?.includes('openAi')) {
        config.provider = 'openai';
        config.model = params.model || params.modelId || 'gpt-4o-mini';
      } else if (n8nNode.type?.includes('Anthropic')) {
        config.provider = 'anthropic';
        config.model = params.model || params.modelId || '';
      } else if (n8nNode.type?.includes('Groq')) {
        config.provider = 'groq';
        config.model = params.model || params.modelId || '';
      } else {
        config.provider = defaultProvider();
        config.model = params.model || params.modelId || defaultModel();
      }
      config.prompt = params.prompt || params.text || params.messages || '';
      config.systemPrompt = params.systemMessage || params.systemPrompt || '';
      config.temperature = params.temperature;
      config.maxTokens = params.maxTokens || params.maxTokensToSample;
      break;

    case 'condition':
      if (params.conditions?.rules) {
        // Convert n8n IF conditions to expression string
        const rules = params.conditions.rules;
        if (rules.length > 0) {
          const r = rules[0];
          config.expression = `${r.value1 || 'value'} ${r.operation || '=='} ${JSON.stringify(r.value2 || '')}`;
        }
      } else {
        config.expression = params.expression || params.value1 || '';
      }
      break;

    case 'transform':
      if (params.values?.string || params.values?.number || params.values?.boolean) {
        config.mapping = {};
        for (const type of ['string', 'number', 'boolean']) {
          for (const v of params.values?.[type] || []) {
            if (v.name) config.mapping[v.name] = v.value;
          }
        }
      }
      if (params.jsCode || params.code) {
        config._code = params.jsCode || params.code;
        config._codeWarning = 'Contains JavaScript code from n8n. Review and adapt manually.';
      }
      break;

    case 'delay':
      config.ms =
        (params.amount || 1) *
        (params.unit === 'seconds' ? 1000 : params.unit === 'minutes' ? 60000 : 1000);
      break;

    default:
      // Copy all params as-is
      Object.assign(config, params);
  }

  return config;
}

/**
 * Validate and parse n8n JSON (from string or object).
 * @param {string|object} input
 * @returns {object} Parsed n8n workflow
 */
export function parseN8nJson(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new Error('Invalid JSON format');
    }
  }

  // n8n exports can be { nodes, connections } or wrapped in a meta object
  if (parsed.workflow) parsed = parsed.workflow;

  if (!parsed.nodes && !Array.isArray(parsed)) {
    throw new Error('Not a valid n8n workflow JSON. Expected "nodes" array.');
  }

  return parsed;
}
