import { describe, it, expect } from 'vitest';
import {
  addConversation,
  appendConversationMessage,
  createInitialChatState,
  deleteConversation,
  loadChatState,
  renameConversation,
  saveChatState,
  setActiveConversation,
} from './chatSessionService';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

describe('chatSessionService', () => {
  it('creates a valid initial state', () => {
    const state = createInitialChatState();
    expect(state.conversations.length).toBe(1);
    expect(state.activeConversationId).toBe(state.conversations[0].id);
  });

  it('creates, renames, and deletes conversations', () => {
    let state = createInitialChatState();
    state = addConversation(state, 'Sprint planning');
    const createdId = state.activeConversationId;
    expect(state.conversations[0].title).toBe('Sprint planning');

    state = renameConversation(state, createdId, 'Sprint planning v2');
    expect(state.conversations.find((c) => c.id === createdId)?.title).toBe('Sprint planning v2');

    state = deleteConversation(state, createdId);
    expect(state.conversations.find((c) => c.id === createdId)).toBeUndefined();
    expect(state.conversations.length).toBeGreaterThanOrEqual(1);
  });

  it('retains multi-turn messages in active conversation', () => {
    let state = createInitialChatState();
    const id = state.activeConversationId;
    state = appendConversationMessage(state, id, { role: 'user', message: 'Hello' });
    state = appendConversationMessage(state, id, {
      role: 'assistant',
      message: 'Hi, how can I help?',
    });
    const convo = state.conversations.find((c) => c.id === id);
    expect(convo?.messages.length).toBe(2);
    expect(convo?.messages[0].role).toBe('user');
    expect(convo?.messages[1].role).toBe('assistant');
  });

  it('persists and isolates sessions by user scope', () => {
    const storage = createMemoryStorage();
    let userA = createInitialChatState();
    userA = appendConversationMessage(userA, userA.activeConversationId, {
      role: 'user',
      message: 'A message',
    });
    saveChatState('user-a@example.com', userA, storage);

    let userB = createInitialChatState();
    userB = appendConversationMessage(userB, userB.activeConversationId, {
      role: 'user',
      message: 'B message',
    });
    saveChatState('user-b@example.com', userB, storage);

    const loadedA = loadChatState('user-a@example.com', storage);
    const loadedB = loadChatState('user-b@example.com', storage);
    expect(loadedA.conversations[0].messages[0].message).toBe('A message');
    expect(loadedB.conversations[0].messages[0].message).toBe('B message');
  });

  it('changes active conversation safely', () => {
    let state = createInitialChatState();
    state = addConversation(state, 'Second');
    const second = state.activeConversationId;
    const first = state.conversations.find((c) => c.id !== second)?.id;
    state = setActiveConversation(state, first);
    expect(state.activeConversationId).toBe(first);
  });
});
