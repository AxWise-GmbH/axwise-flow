import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../config/assistantBrain';

/**
 * Frontend n8n importer — converts n8n workflow JSON to Orqaly format.
 * Pure functions, no server dependencies.
 */

const N8N_TYPE_MAP = {
  // Triggers
  'n8n-nodes-base.manualTrigger': 'trigger',
  'n8n-nodes-base.webhook': 'webhook',
  'n8n-nodes-base.scheduleTrigger': 'trigger',
  'n8n-nodes-base.cronTrigger': 'trigger',
  'n8n-nodes-base.emailTrigger': 'trigger',
  'n8n-nodes-base.start': 'trigger',
  'n8n-nodes-base.executeWorkflowTrigger': 'trigger',
  'n8n-nodes-base.errorTrigger': 'trigger',
  // HTTP / API
  'n8n-nodes-base.httpRequest': 'http',
  'n8n-nodes-base.respondToWebhook': 'http',
  'n8n-nodes-base.executeCommand': 'http',
  'n8n-nodes-base.ssh': 'http',
  'n8n-nodes-base.ftp': 'http',
  'n8n-nodes-base.graphql': 'http',
  'n8n-nodes-base.xml': 'transform',
  // Conditions / logic
  'n8n-nodes-base.if': 'condition',
  'n8n-nodes-base.switch': 'condition',
  'n8n-nodes-base.filter': 'condition',
  'n8n-nodes-base.compareDatasets': 'condition',
  // Data transformation
  'n8n-nodes-base.set': 'transform',
  'n8n-nodes-base.setV2': 'transform',
  'n8n-nodes-base.code': 'transform',
  'n8n-nodes-base.codeV2': 'transform',
  'n8n-nodes-base.function': 'transform',
  'n8n-nodes-base.functionItem': 'transform',
  'n8n-nodes-base.merge': 'transform',
  'n8n-nodes-base.mergeV2': 'transform',
  'n8n-nodes-base.splitInBatches': 'transform',
  'n8n-nodes-base.itemLists': 'transform',
  'n8n-nodes-base.renameKeys': 'transform',
  'n8n-nodes-base.spreadsheetFile': 'transform',
  'n8n-nodes-base.moveBinaryData': 'transform',
  'n8n-nodes-base.convertToFile': 'transform',
  'n8n-nodes-base.extractFromFile': 'transform',
  'n8n-nodes-base.compression': 'transform',
  'n8n-nodes-base.crypto': 'transform',
  'n8n-nodes-base.dateTime': 'transform',
  'n8n-nodes-base.editFields': 'transform',
  'n8n-nodes-base.summarize': 'transform',
  'n8n-nodes-base.removeDuplicates': 'transform',
  'n8n-nodes-base.sort': 'transform',
  'n8n-nodes-base.limit': 'transform',
  'n8n-nodes-base.aggregate': 'transform',
  // Timing
  'n8n-nodes-base.wait': 'delay',
  // Skip
  'n8n-nodes-base.stickyNote': null,
  'n8n-nodes-base.noOp': null,
  // AI / LLM nodes
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatGroq': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatOllama': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatMistralCloud': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatAzureOpenAi': 'llm',
  '@n8n/n8n-nodes-langchain.lmOpenAi': 'llm',
  '@n8n/n8n-nodes-langchain.agent': 'llm',
  '@n8n/n8n-nodes-langchain.chainLlm': 'llm',
  '@n8n/n8n-nodes-langchain.chainSummarization': 'llm',
  '@n8n/n8n-nodes-langchain.chainRetrievalQa': 'llm',
  '@n8n/n8n-nodes-langchain.openAi': 'llm',
  '@n8n/n8n-nodes-langchain.manualChatTrigger': 'trigger',
  '@n8n/n8n-nodes-langchain.chatTrigger': 'trigger',
  '@n8n/n8n-nodes-langchain.toolHttpRequest': 'http',
  '@n8n/n8n-nodes-langchain.toolCode': 'transform',
  '@n8n/n8n-nodes-langchain.toolWorkflow': 'tool',
  '@n8n/n8n-nodes-langchain.toolCalculator': 'tool',
  '@n8n/n8n-nodes-langchain.toolWikipedia': 'tool',
  '@n8n/n8n-nodes-langchain.toolSerpApi': 'tool',
  // Memory & vector
  '@n8n/n8n-nodes-langchain.memoryBufferWindow': 'transform',
  '@n8n/n8n-nodes-langchain.memoryXata': 'transform',
  '@n8n/n8n-nodes-langchain.memoryPostgresChat': 'transform',
  '@n8n/n8n-nodes-langchain.vectorStoreSupabase': 'transform',
  '@n8n/n8n-nodes-langchain.vectorStorePinecone': 'transform',
  '@n8n/n8n-nodes-langchain.vectorStoreQdrant': 'transform',
  '@n8n/n8n-nodes-langchain.vectorStoreInMemory': 'transform',
  '@n8n/n8n-nodes-langchain.embeddingsOpenAi': 'transform',
  '@n8n/n8n-nodes-langchain.embeddingsCohere': 'transform',
  '@n8n/n8n-nodes-langchain.retrieverVectorStore': 'transform',
  '@n8n/n8n-nodes-langchain.documentDefaultDataLoader': 'transform',
  '@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter': 'transform',
  '@n8n/n8n-nodes-langchain.textSplitterTokenSplitter': 'transform',
  '@n8n/n8n-nodes-langchain.outputParserStructured': 'transform',
  '@n8n/n8n-nodes-langchain.outputParserAutofixing': 'transform',
  // Popular integrations
  'n8n-nodes-base.slack': 'http',
  'n8n-nodes-base.discord': 'http',
  'n8n-nodes-base.telegram': 'http',
  'n8n-nodes-base.telegramTrigger': 'trigger',
  'n8n-nodes-base.gmail': 'http',
  'n8n-nodes-base.googleSheets': 'http',
  'n8n-nodes-base.googleDrive': 'http',
  'n8n-nodes-base.googleCalendar': 'http',
  'n8n-nodes-base.notion': 'http',
  'n8n-nodes-base.airtable': 'http',
  'n8n-nodes-base.postgres': 'http',
  'n8n-nodes-base.mysql': 'http',
  'n8n-nodes-base.mongoDb': 'http',
  'n8n-nodes-base.redis': 'http',
  'n8n-nodes-base.supabase': 'http',
  'n8n-nodes-base.microsoftExcel': 'http',
  'n8n-nodes-base.microsoftTeams': 'http',
  'n8n-nodes-base.hubspot': 'http',
  'n8n-nodes-base.jira': 'http',
  'n8n-nodes-base.github': 'http',
  'n8n-nodes-base.gitlab': 'http',
  'n8n-nodes-base.stripe': 'http',
  'n8n-nodes-base.shopify': 'http',
  'n8n-nodes-base.twilio': 'http',
  'n8n-nodes-base.sendGrid': 'http',
  'n8n-nodes-base.mailchimp': 'http',
  'n8n-nodes-base.trello': 'http',
  'n8n-nodes-base.asana': 'http',
  'n8n-nodes-base.clickUp': 'http',
  'n8n-nodes-base.todoist': 'http',
  'n8n-nodes-base.dropbox': 'http',
  'n8n-nodes-base.box': 'http',
  'n8n-nodes-base.s3': 'http',
  'n8n-nodes-base.awsS3': 'http',
  'n8n-nodes-base.awsLambda': 'http',
  'n8n-nodes-base.openAi': 'llm',
  'n8n-nodes-base.executeWorkflow': 'tool',
};

function resolveType(n8nType) {
  if (!n8nType) return { blockType: 'transform', warning: 'Missing n8n type → Transform' };
  if (N8N_TYPE_MAP[n8nType] === null) return null;
  if (N8N_TYPE_MAP[n8nType]) return { blockType: N8N_TYPE_MAP[n8nType] };
  const lower = n8nType.toLowerCase();
  // LLM-related by heuristic
  if (
    lower.includes('langchain') ||
    lower.includes('openai') ||
    lower.includes('anthropic') ||
    lower.includes('llm') ||
    lower.includes('gemini') ||
    lower.includes('ollama') ||
    lower.includes('mistral')
  ) {
    return { blockType: 'llm', warning: `Mapped "${n8nType}" to LLM (heuristic)` };
  }
  // Trigger heuristic
  if (lower.includes('trigger') || lower.includes('start')) {
    return { blockType: 'trigger', warning: `Mapped "${n8nType}" to Trigger (heuristic)` };
  }
  // Webhook heuristic
  if (lower.includes('webhook')) {
    return { blockType: 'webhook', warning: `Mapped "${n8nType}" to Webhook (heuristic)` };
  }
  // HTTP/API heuristic
  if (lower.includes('http') || lower.includes('request') || lower.includes('api')) {
    return { blockType: 'http', warning: `Mapped "${n8nType}" to HTTP (heuristic)` };
  }
  // Condition heuristic
  if (
    lower.includes('if') ||
    lower.includes('switch') ||
    lower.includes('filter') ||
    lower.includes('condition')
  ) {
    return { blockType: 'condition', warning: `Mapped "${n8nType}" to Condition (heuristic)` };
  }
  // Wait/delay heuristic
  if (lower.includes('wait') || lower.includes('delay') || lower.includes('sleep')) {
    return { blockType: 'delay', warning: `Mapped "${n8nType}" to Delay (heuristic)` };
  }
  // Tool heuristic
  if (lower.includes('tool')) {
    return { blockType: 'tool', warning: `Mapped "${n8nType}" to Tool (heuristic)` };
  }
  return { blockType: 'transform', warning: `Unknown n8n type "${n8nType}" → Transform` };
}

function convertParams(params, blockType, n8nType) {
  const config = {};
  if (!params) return config;

  if (blockType === 'http') {
    config.url = params.url || '';
    config.method = params.method || params.requestMethod || 'GET';
  } else if (blockType === 'llm') {
    if (n8nType?.includes('OpenAi') || n8nType?.includes('openAi')) config.provider = 'openai';
    else if (n8nType?.includes('Anthropic')) config.provider = 'anthropic';
    else if (n8nType?.includes('Groq')) config.provider = 'groq';
    else {
      config.provider = DEFAULT_LLM_PROVIDER;
      config.model = DEFAULT_LLM_MODEL;
    }
    config.prompt = params.prompt || params.text || '';
    config.systemPrompt = params.systemMessage || '';
    config.model = config.model || params.model || params.modelId || '';
  } else if (blockType === 'condition') {
    config.expression = params.expression || '';
  } else if (blockType === 'delay') {
    config.ms = (params.amount || 1) * (params.unit === 'minutes' ? 60000 : 1000);
  }

  return config;
}

/** Parse position from n8n node — handles both [x,y] arrays and {x,y} objects. */
function parsePosition(pos, fallbackIndex) {
  if (Array.isArray(pos) && pos.length >= 2) {
    return { x: Number(pos[0]) || fallbackIndex * 280, y: Number(pos[1]) || 200 };
  }
  if (pos && typeof pos === 'object' && !Array.isArray(pos)) {
    const x = typeof pos.x === 'number' ? pos.x : typeof pos.left === 'number' ? pos.left : null;
    const y = typeof pos.y === 'number' ? pos.y : typeof pos.top === 'number' ? pos.top : null;
    if (x != null && y != null) return { x, y };
  }
  return { x: fallbackIndex * 280, y: 200 };
}

/**
 * Convert n8n workflow JSON to Orqaly nodes + edges.
 * @param {string|object} input — Raw JSON string or parsed object
 * @returns {{ name: string, nodes: Array, edges: Array, warnings: string[] }}
 */
export function importN8nWorkflow(input) {
  let parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (parsed.workflow) parsed = parsed.workflow;

  const n8nNodes = parsed.nodes || [];
  const n8nConns = parsed.connections || {};
  const warnings = [];
  const nameToId = {};
  const idToId = {};
  const nodes = [];
  let edgeId = 0;

  for (const n of n8nNodes) {
    const res = resolveType(n.type);
    if (!res) continue;
    if (res.warning) warnings.push(res.warning);

    const id = n.id || `n8n_${(n.name || '').replace(/\s+/g, '_')}_${Date.now()}_${nodes.length}`;
    if (n.name) nameToId[n.name] = id;
    if (n.id) idToId[n.id] = id;

    nodes.push({
      id,
      type: 'workflow',
      position: parsePosition(n.position, nodes.length),
      data: {
        nodeId: id,
        blockType: res.blockType,
        blockId: res.blockType,
        label: n.name || res.blockType,
        config: convertParams(n.parameters, res.blockType, n.type),
        _n8nType: n.type,
      },
    });
  }

  /** Resolve a target reference — n8n uses node name OR node id depending on version. */
  const resolveTarget = (ref) => {
    if (!ref) return null;
    // Try name first, then id
    return nameToId[ref] || idToId[ref] || null;
  };

  const edges = [];
  const edgeSeen = new Set();

  // n8n connections can be under 'main', 'ai_tool', 'ai_languageModel',
  // 'ai_memory', 'ai_outputParser', 'ai_agent', etc.
  for (const [srcName, outputs] of Object.entries(n8nConns)) {
    const srcId = resolveTarget(srcName);
    if (!srcId) continue;
    for (const [connType, outputGroups] of Object.entries(outputs)) {
      const groups = Array.isArray(outputGroups) ? outputGroups : [];
      for (let oi = 0; oi < groups.length; oi++) {
        for (const c of groups[oi] || []) {
          const tgtRef = c.node ?? c.name ?? c.id;
          const tgtId = resolveTarget(tgtRef);
          if (!tgtId) continue;
          const edgeKey = `${srcId}→${tgtId}`;
          if (edgeSeen.has(edgeKey)) continue;
          edgeSeen.add(edgeKey);
          edgeId++;
          edges.push({
            id: `e_n8n_${edgeId}`,
            source: srcId,
            target: tgtId,
            sourceHandle: 'right-out',
            targetHandle: 'left-out',
            type: 'workflow',
            style: { strokeWidth: 2 },
            data: { connectionType: 'outgoing', connectionId: `n8n_conn_${edgeId}` },
          });
        }
      }
    }
  }

  return {
    name: parsed.name || 'Imported n8n Workflow',
    nodes,
    edges,
    warnings,
  };
}
