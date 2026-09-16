/**
 * n8n node type → Orqaly block type mapping.
 *
 * Maps known n8n node types to our internal block types.
 * Unknown nodes map to 'transform' (passthrough with warning).
 */

export const N8N_NODE_MAP = {
  // Triggers
  'n8n-nodes-base.manualTrigger': 'trigger',
  'n8n-nodes-base.webhook': 'webhook',
  'n8n-nodes-base.scheduleTrigger': 'trigger',
  'n8n-nodes-base.cronTrigger': 'trigger',
  'n8n-nodes-base.emailTrigger': 'trigger',
  'n8n-nodes-base.httpRequestTrigger': 'webhook',
  '@n8n/n8n-nodes-langchain.manualChatTrigger': 'trigger',
  '@n8n/n8n-nodes-langchain.chatTrigger': 'trigger',

  // HTTP / API
  'n8n-nodes-base.httpRequest': 'http',
  'n8n-nodes-base.respondToWebhook': 'http',

  // AI / LLM
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatGroq': 'llm',
  '@n8n/n8n-nodes-langchain.lmChatOllama': 'llm',
  '@n8n/n8n-nodes-langchain.lmOpenAi': 'llm',
  '@n8n/n8n-nodes-langchain.agent': 'llm',
  '@n8n/n8n-nodes-langchain.chainLlm': 'llm',
  '@n8n/n8n-nodes-langchain.openAi': 'llm',
  '@n8n/n8n-nodes-langchain.chainSummarization': 'llm',
  '@n8n/n8n-nodes-langchain.textClassifier': 'llm',
  '@n8n/n8n-nodes-langchain.sentimentAnalysis': 'llm',
  '@n8n/n8n-nodes-langchain.informationExtractor': 'llm',

  // Flow control
  'n8n-nodes-base.if': 'condition',
  'n8n-nodes-base.switch': 'condition',
  'n8n-nodes-base.filter': 'condition',

  // Data transform
  'n8n-nodes-base.set': 'transform',
  'n8n-nodes-base.code': 'transform',
  'n8n-nodes-base.functionItem': 'transform',
  'n8n-nodes-base.function': 'transform',
  'n8n-nodes-base.merge': 'transform',
  'n8n-nodes-base.splitInBatches': 'transform',
  'n8n-nodes-base.itemLists': 'transform',
  'n8n-nodes-base.spreadsheetFile': 'transform',
  'n8n-nodes-base.markdown': 'transform',
  'n8n-nodes-base.html': 'transform',
  'n8n-nodes-base.xml': 'transform',
  'n8n-nodes-base.crypto': 'transform',
  'n8n-nodes-base.dateTime': 'transform',
  'n8n-nodes-base.convertToFile': 'transform',
  'n8n-nodes-base.extractFromFile': 'transform',
  'n8n-nodes-base.aggregate': 'transform',
  'n8n-nodes-base.removeDuplicates': 'transform',
  'n8n-nodes-base.limit': 'transform',
  'n8n-nodes-base.sort': 'transform',
  'n8n-nodes-base.summarize': 'transform',
  'n8n-nodes-base.compareDatasets': 'transform',

  // Delay / Wait
  'n8n-nodes-base.wait': 'delay',

  // Memory & vector stores (n8n AI)
  '@n8n/n8n-nodes-langchain.memoryBufferWindow': 'transform',
  '@n8n/n8n-nodes-langchain.memoryPostgresChat': 'transform',
  '@n8n/n8n-nodes-langchain.vectorStoreSupabase': 'transform',
  '@n8n/n8n-nodes-langchain.vectorStorePinecone': 'transform',
  '@n8n/n8n-nodes-langchain.vectorStoreQdrant': 'transform',
  '@n8n/n8n-nodes-langchain.embeddingsOpenAi': 'transform',
  '@n8n/n8n-nodes-langchain.retrieverVectorStore': 'transform',
  '@n8n/n8n-nodes-langchain.documentDefaultDataLoader': 'transform',
  '@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter': 'transform',

  // Tools (n8n AI)
  '@n8n/n8n-nodes-langchain.toolCode': 'tool',
  '@n8n/n8n-nodes-langchain.toolHttpRequest': 'http',
  '@n8n/n8n-nodes-langchain.toolCalculator': 'transform',
  '@n8n/n8n-nodes-langchain.toolWikipedia': 'http',
  '@n8n/n8n-nodes-langchain.toolSerpApi': 'http',
  '@n8n/n8n-nodes-langchain.toolWorkflow': 'transform',

  // Output parsers (n8n AI)
  '@n8n/n8n-nodes-langchain.outputParserStructured': 'transform',
  '@n8n/n8n-nodes-langchain.outputParserAutofixing': 'transform',
  '@n8n/n8n-nodes-langchain.outputParserItemList': 'transform',

  // Popular integrations → HTTP requests
  'n8n-nodes-base.slack': 'http',
  'n8n-nodes-base.discord': 'http',
  'n8n-nodes-base.telegram': 'http',
  'n8n-nodes-base.gmail': 'http',
  'n8n-nodes-base.googleSheets': 'http',
  'n8n-nodes-base.notion': 'http',
  'n8n-nodes-base.airtable': 'http',
  'n8n-nodes-base.postgres': 'http',
  'n8n-nodes-base.mysql': 'http',
  'n8n-nodes-base.redis': 'http',
  'n8n-nodes-base.microsoftExcel': 'http',
  'n8n-nodes-base.hubspot': 'http',
  'n8n-nodes-base.jira': 'http',
  'n8n-nodes-base.github': 'http',

  // Sticky / notes — skip
  'n8n-nodes-base.stickyNote': null,
  'n8n-nodes-base.noOp': null,
};

/**
 * Resolve an n8n node type to an Orqaly block type.
 * @param {string} n8nType - n8n node type string
 * @returns {{ blockType: string, warning?: string } | null} null means skip this node
 */
export function resolveN8nNodeType(n8nType) {
  if (N8N_NODE_MAP[n8nType] === null) return null; // Skip (sticky notes, etc.)

  const mapped = N8N_NODE_MAP[n8nType];
  if (mapped) return { blockType: mapped };

  // Unknown type → transform with warning
  return {
    blockType: 'transform',
    warning: `Unknown n8n node type "${n8nType}" — mapped to Transform. May need manual configuration.`,
  };
}
