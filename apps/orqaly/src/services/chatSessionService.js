const STORAGE_PREFIX = 'orch_ai_chat_sessions_v1';
const MAX_MESSAGES_PER_CONVERSATION = 200;

function nowIso() {
  return new Date().toISOString();
}

function toId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeScope(scope) {
  return (
    String(scope || 'anonymous')
      .trim()
      .toLowerCase() || 'anonymous'
  );
}

function storageKey(scope) {
  return `${STORAGE_PREFIX}:${normalizeScope(scope)}`;
}

export function createConversation(title = 'New conversation') {
  const ts = nowIso();
  return {
    id: toId('conv'),
    title: String(title || 'New conversation').trim() || 'New conversation',
    createdAt: ts,
    updatedAt: ts,
    messages: [],
  };
}

export function createInitialChatState() {
  const first = createConversation('New conversation');
  return {
    activeConversationId: first.id,
    conversations: [first],
  };
}

function ensureValidState(raw) {
  if (!raw || typeof raw !== 'object') return createInitialChatState();
  const conversations = Array.isArray(raw.conversations)
    ? raw.conversations.filter((c) => c && typeof c.id === 'string')
    : [];
  if (conversations.length === 0) return createInitialChatState();
  const activeExists = conversations.some((c) => c.id === raw.activeConversationId);
  return {
    activeConversationId: activeExists ? raw.activeConversationId : conversations[0].id,
    conversations: conversations.map((c) => ({
      ...c,
      title: String(c.title || 'New conversation').trim() || 'New conversation',
      messages: Array.isArray(c.messages) ? c.messages : [],
      createdAt: c.createdAt || nowIso(),
      updatedAt: c.updatedAt || c.createdAt || nowIso(),
    })),
  };
}

export function loadChatState(scope, storage = globalThis?.window?.localStorage) {
  if (!storage) return createInitialChatState();
  try {
    const raw = storage.getItem(storageKey(scope));
    if (!raw) return createInitialChatState();
    return ensureValidState(JSON.parse(raw));
  } catch {
    return createInitialChatState();
  }
}

export function saveChatState(scope, state, storage = globalThis?.window?.localStorage) {
  if (!storage) return;
  try {
    storage.setItem(storageKey(scope), JSON.stringify(ensureValidState(state)));
  } catch {
    // Ignore persistence failures.
  }
}

export function setActiveConversation(state, conversationId) {
  const safe = ensureValidState(state);
  if (!safe.conversations.some((c) => c.id === conversationId)) return safe;
  return { ...safe, activeConversationId: conversationId };
}

export function addConversation(state, title = 'New conversation') {
  const safe = ensureValidState(state);
  const next = createConversation(title);
  return {
    activeConversationId: next.id,
    conversations: [next, ...safe.conversations],
  };
}

export function renameConversation(state, conversationId, title) {
  const safe = ensureValidState(state);
  const nextTitle = String(title || '').trim();
  if (!nextTitle) return safe;
  return {
    ...safe,
    conversations: safe.conversations.map((c) =>
      c.id === conversationId ? { ...c, title: nextTitle, updatedAt: nowIso() } : c
    ),
  };
}

export function deleteConversation(state, conversationId) {
  const safe = ensureValidState(state);
  if (safe.conversations.length <= 1) return safe;
  const remaining = safe.conversations.filter((c) => c.id !== conversationId);
  if (remaining.length === safe.conversations.length) return safe;
  const activeConversationId = remaining.some((c) => c.id === safe.activeConversationId)
    ? safe.activeConversationId
    : remaining[0].id;
  return { activeConversationId, conversations: remaining };
}

export function appendConversationMessage(state, conversationId, message) {
  const safe = ensureValidState(state);
  const payload = {
    id: message?.id || toId('msg'),
    role: message?.role || 'assistant',
    message: String(message?.message || '').trim(),
    time: message?.time || nowIso(),
    source: message?.source || 'text',
  };
  // Preserve structured actions on assistant messages so the detail panel
  // can reconstruct them when the user scrolls back through the history.
  if (Array.isArray(message?.actions) && message.actions.length > 0) {
    payload.actions = message.actions;
  }
  if (!payload.message) return safe;
  return {
    ...safe,
    conversations: safe.conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const nextMessages = [...c.messages, payload].slice(-MAX_MESSAGES_PER_CONVERSATION);
      return { ...c, messages: nextMessages, updatedAt: nowIso() };
    }),
  };
}
