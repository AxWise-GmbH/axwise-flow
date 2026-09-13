import { describe, it, expect } from 'vitest';
import { groupConversations, formatDateTime, MODE_LABEL } from './assistantConversations';

describe('groupConversations', () => {
  it('groups messages by conversation_id', () => {
    const msgs = [
      {
        id: 'a1',
        conversation_id: 'c1',
        role: 'user',
        content: 'hi',
        mode: 'assistant',
        created_at: '2026-06-01T10:00:00Z',
      },
      {
        id: 'a2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'hello',
        mode: 'assistant',
        created_at: '2026-06-01T10:00:05Z',
      },
      {
        id: 'b1',
        conversation_id: 'c2',
        role: 'user',
        content: 'plan',
        mode: 'consilium',
        created_at: '2026-06-02T09:00:00Z',
      },
    ];
    const out = groupConversations(msgs);
    expect(out).toHaveLength(2);
    const c1 = out.find((c) => c.id === 'c1');
    expect(c1.messages).toHaveLength(2);
    expect(c1.mode).toBe('assistant');
  });

  it('orders conversations newest-first by last message', () => {
    const msgs = [
      {
        id: 'a1',
        conversation_id: 'older',
        role: 'user',
        content: 'x',
        created_at: '2026-06-01T10:00:00Z',
      },
      {
        id: 'b1',
        conversation_id: 'newer',
        role: 'user',
        content: 'y',
        created_at: '2026-06-05T10:00:00Z',
      },
    ];
    const out = groupConversations(msgs);
    expect(out[0].id).toBe('newer');
    expect(out[1].id).toBe('older');
  });

  it('orders messages oldest-first within a conversation', () => {
    const msgs = [
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'second',
        created_at: '2026-06-01T10:00:05Z',
      },
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'first',
        created_at: '2026-06-01T10:00:00Z',
      },
    ];
    const [c1] = groupConversations(msgs);
    expect(c1.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(c1.lastAt).toBe('2026-06-01T10:00:05Z');
  });

  it('defaults mode to assistant and handles empty input', () => {
    expect(groupConversations()).toEqual([]);
    const [c] = groupConversations([
      {
        id: '1',
        conversation_id: 'c',
        role: 'user',
        content: 'hi',
        created_at: '2026-06-01T10:00:00Z',
      },
    ]);
    expect(c.mode).toBe('assistant');
  });
});

describe('formatDateTime', () => {
  it('returns empty string for falsy/invalid input', () => {
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('not-a-date')).toBe('');
  });

  it('formats a valid ISO timestamp as DD.MM.YY HH:MM', () => {
    expect(formatDateTime('2026-06-05T09:07:00')).toBe('05.06.26 09:07');
  });
});

describe('MODE_LABEL', () => {
  it('covers the assistant modes', () => {
    expect(MODE_LABEL.assistant).toBe('Personal Assistant');
    expect(MODE_LABEL.consilium).toBe('Consilium');
    expect(MODE_LABEL.team).toBe('Team Lead');
    expect(MODE_LABEL.talk).toBe('Talk');
  });
});
