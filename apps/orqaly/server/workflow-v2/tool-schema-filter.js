export const CORE_TOOLS = new Set([
  'shell',
  'write',
  'edit',
  'tree',
  'read_image',
  'load',
  'load_skill',
  'todo__todo_write',
]);

export const NATIVE_ENGINEERING_TOOL_NAMES = Object.freeze(
  new Set(['ast_search', 'lsp_query', 'hashline_edit', 'safe_edit_and_test'])
);

export const MULTI_FILE_REFACTOR_PATTERN =
  /(?:^|[^a-zA-Z0-9_а-яА-ЯёЁ])(refactor|rename|cross-file|multi-file|monorepo|workspace|lsp_query|ast_search|safe_edit|hashline|typecheck|interface|declaration|consumers|symbol|call graph|signature)(?:$|[^a-zA-Z0-9_а-яА-ЯёЁ])/iu;

export const ERROR_OR_RETRY_PATTERN =
  /(?:^|[^a-zA-Z0-9_а-яА-ЯёЁ])(error|failed|failure|exception|traceback|syntaxerror|typeerror|referenceerror|compilation error|rejection|retry|fix|rollback|broken)(?:$|[^a-zA-Z0-9_а-яА-ЯёЁ])/iu;

export const GOOSE_LANES = Object.freeze({
  QUICK_INFO: 'quick_info',
  RESEARCH: 'research',
  LOCAL_ENGINEERING: 'local_engineering',
  CONVERSATION: 'conversation',
  MIXED: 'mixed',
});

/**
 * Checks if a conversation history contains tool execution failures, compiler errors,
 * or retry signals that warrant auto-escalating tools and models.
 */
export function hasToolOrExecutionError(body) {
  const messages = body?.messages || [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
      if (m.is_error === true || ERROR_OR_RETRY_PATTERN.test(content)) return true;
    }
    if (
      m.role === 'assistant' &&
      typeof m.content === 'string' &&
      (m.content.includes('Error:') || m.content.includes('failed with status'))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts the Jev triage lane from explicit headers, settings, or embedded prompt resources.
 */
export function extractTriageLane(body, headers = {}) {
  const headerLane = headers?.['x-jev-lane'] || headers?.['X-Jev-Lane'];
  if (headerLane) return headerLane.toLowerCase();
  if (body?.lane) return body.lane;

  const messages = body?.messages || [];
  const serialized = typeof messages === 'string' ? messages : JSON.stringify(messages);
  const match = serialized.match(/orqaly\.jev-triage\.v1.*?lane[\\"\s:]+([a-zA-Z_-]+)/u);
  return match ? match[1] : null;
}

export function shouldGateNativeTools(body) {
  // Never gate native engineering tools if actively recovering from an error
  if (hasToolOrExecutionError(body)) return false;

  const messages = body?.messages || [];
  const serialized = typeof messages === 'string' ? messages : JSON.stringify(messages);
  if (MULTI_FILE_REFACTOR_PATTERN.test(serialized)) return false;
  return true;
}

export function filterToolsByJevLane(tools, lane, isErrorRecovery = false) {
  if (!lane || lane === GOOSE_LANES.MIXED || !Array.isArray(tools)) return tools;

  return tools.filter((tool) => {
    const rawName = tool?.name || tool?.function?.name || '';
    const shortName = rawName.split('__').at(-1);
    const prefix = rawName.includes('__') ? rawName.split('__')[0] : '';

    // Always preserve essential core interaction tools
    if (CORE_TOOLS.has(shortName) || CORE_TOOLS.has(rawName)) return true;

    // Error recovery exception: always preserve search tools so the model can look up error resolutions
    if (isErrorRecovery && (shortName.includes('search') || rawName.includes('search'))) {
      return true;
    }

    if (lane === GOOSE_LANES.CONVERSATION) {
      return prefix === 'memory' || prefix === 'todo' || prefix === 'chatrecall';
    }

    if (lane === GOOSE_LANES.QUICK_INFO) {
      return prefix === 'desktop-utilities' || prefix === 'orqanix-daily' || prefix === 'memory';
    }

    if (lane === GOOSE_LANES.LOCAL_ENGINEERING) {
      return (
        prefix === 'native_engineering' ||
        prefix === 'developer' ||
        prefix === 'analyze' ||
        prefix === 'memory' ||
        prefix === 'gavel' ||
        !prefix
      );
    }

    if (lane === GOOSE_LANES.RESEARCH) {
      return (
        prefix === 'axwise-local' ||
        prefix === 'axwise-mcp' ||
        prefix === 'autovisualiser' ||
        prefix === 'desktop-utilities' ||
        prefix === 'memory'
      );
    }

    return true;
  });
}

export function filterDynamicToolSchemas(tools, body, headers = {}) {
  if (!Array.isArray(tools) || tools.length === 0) return tools || [];

  const lane = extractTriageLane(body, headers);
  const isErrorRecovery = hasToolOrExecutionError(body);
  let filtered = tools;

  if (lane && lane !== GOOSE_LANES.MIXED) {
    filtered = filterToolsByJevLane(tools, lane, isErrorRecovery);
    if (filtered.length === 0) filtered = tools;
  }

  if (shouldGateNativeTools(body)) {
    filtered = filtered.filter((tool) => {
      const rawName = tool?.name || tool?.function?.name || '';
      const shortName = rawName.split('__').at(-1);
      return !NATIVE_ENGINEERING_TOOL_NAMES.has(shortName) && !rawName.startsWith('native_engineering__');
    });
  }

  return filtered.length > 0 ? filtered : tools;
}
