/**
 * Shared helpers for the Personal Assistant chat history
 * (assistant_chat_messages, read via getAssistantHistory). Used by the
 * Communicator AssistantHistoryPanel and the Home History "Assistant" sub-tab
 * so both group and label conversations identically.
 */

export const MODE_LABEL = {
  assistant: 'Personal Assistant',
  talk: 'Talk',
  consilium: 'Consilium',
  team: 'Team Lead',
};

/** Format an ISO timestamp as `DD.MM.YY HH:MM`. Empty string for invalid input. */
export function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Group flat chat messages by conversation_id. Conversations are ordered by
 * their most recent message (newest first); messages inside each conversation
 * are ordered oldest -> newest.
 * @param {Array<{id:string, conversation_id:string, role:string, content:string, mode?:string, created_at:string}>} messages
 * @returns {Array<{id:string, mode:string, lastAt:string, messages:Array}>}
 */
export function groupConversations(messages = []) {
  const groups = new Map();
  for (const m of messages) {
    if (!groups.has(m.conversation_id)) groups.set(m.conversation_id, []);
    groups.get(m.conversation_id).push(m);
  }
  const list = [];
  for (const [id, msgs] of groups.entries()) {
    const ordered = [...msgs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    list.push({
      id,
      mode: ordered[0]?.mode || 'assistant',
      lastAt: ordered[ordered.length - 1]?.created_at,
      messages: ordered,
    });
  }
  return list.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}
