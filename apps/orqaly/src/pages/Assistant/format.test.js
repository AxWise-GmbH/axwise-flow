import { describe, it, expect } from 'vitest';
import {
  formatDateParts,
  deriveBetween,
  groupThreads,
  mergeUsageSnapshots,
  formatTimeAgo,
  formatChatTime,
  buildKnowledgeData,
  shapeTeamChat,
  shapeContributions,
  buildActivitySeries,
} from './format';

describe('formatDateParts', () => {
  it('returns dd.mm and hh:mm:ss for a valid ISO string', () => {
    const parts = formatDateParts('2026-06-28T14:23:11');
    expect(parts.date).toBe('28.06');
    expect(parts.time).toBe('14:23:11');
  });

  it('handles missing / invalid input', () => {
    expect(formatDateParts(null)).toEqual({ date: '--.--', time: '--:--:--' });
    expect(formatDateParts('nonsense')).toEqual({ date: '--.--', time: '--:--:--' });
  });
});

describe('deriveBetween', () => {
  it('pairs a single counterparty with the assistant', () => {
    expect(deriveBetween(['P. Jackson'], 'Aurum')).toBe('Aurum & P. Jackson');
  });
  it('joins multiple distinct senders', () => {
    expect(deriveBetween(['Aurum', 'P. Jackson'], 'Aurum')).toBe('Aurum & P. Jackson');
  });
  it('falls back to the assistant name when empty', () => {
    expect(deriveBetween([], 'Aurum')).toBe('Aurum');
  });
});

describe('groupThreads', () => {
  it('collapses logs into one row per thread with the latest message', () => {
    const logs = [
      {
        thread_id: 't1',
        platform: 'telegram',
        sender_name: 'P. Jackson',
        content: 'first',
        created_at: '2026-06-28T10:00:00Z',
      },
      {
        thread_id: 't1',
        platform: 'telegram',
        sender_name: 'Aurum',
        content: 'latest',
        created_at: '2026-06-28T12:00:00Z',
      },
      {
        thread_id: 't2',
        platform: 'slack',
        sender_name: 'M. Lee',
        content: 'hello',
        created_at: '2026-06-28T09:00:00Z',
      },
    ];
    const rows = groupThreads(logs, 'Aurum');
    expect(rows).toHaveLength(2);
    const t1 = rows.find((r) => r.id === 't1');
    expect(t1.platform).toBe('telegram');
    expect(t1.lastMessage).toBe('latest');
    expect(t1.between).toContain('Aurum');
    expect(t1.between).toContain('P. Jackson');
  });
});

describe('formatTimeAgo', () => {
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  it('renders coarse relative buckets', () => {
    expect(formatTimeAgo('2026-06-28T11:59:40Z', now)).toBe('just now');
    expect(formatTimeAgo('2026-06-28T11:30:00Z', now)).toBe('30m ago');
    expect(formatTimeAgo('2026-06-28T10:00:00Z', now)).toBe('2h ago');
    expect(formatTimeAgo('2026-06-26T12:00:00Z', now)).toBe('2d ago');
  });
  it('falls back to dd.mm beyond a week and handles bad input', () => {
    expect(formatTimeAgo('2026-06-01T12:00:00', now)).toBe('01.06');
    expect(formatTimeAgo(null, now)).toBe('');
  });
});

describe('formatChatTime', () => {
  const now = new Date('2026-06-28T20:00:00').getTime();
  it('shows clock time today, Yesterday, then a date', () => {
    expect(formatChatTime('2026-06-28T13:05:00', now)).toBe('1:05 PM');
    expect(formatChatTime('2026-06-27T09:00:00', now)).toBe('Yesterday');
    expect(formatChatTime('2026-06-20T09:00:00', now)).toBe('20.06');
  });
});

describe('buildKnowledgeData', () => {
  it('counts by content_type, infers connectors, and caps tags', () => {
    const docs = [
      { content_type: 'note', source: 'obsidian' },
      { content_type: 'file' },
      { content_type: 'link', category: 'notion' },
      { source: 'manual' }, // missing type defaults to note
    ];
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const out = buildKnowledgeData(docs, tags, 6);
    expect(out.counts).toEqual({ notes: 2, files: 1, links: 1 });
    expect(out.connectors.map((c) => c.id)).toEqual(['obsidian', 'notion']);
    expect(out.tags).toHaveLength(6);
    expect(out.tagsMore).toBe(1);
  });
});

describe('shapeTeamChat', () => {
  it('maps goal_messages to the chat feed shape', () => {
    const now = new Date('2026-06-28T20:00:00').getTime();
    const out = shapeTeamChat(
      [{ id: 'm1', sender_name: 'Maria', message: 'hi', created_at: '2026-06-28T13:05:00' }],
      now
    );
    expect(out[0]).toEqual({ id: 'm1', author: 'Maria', time: '1:05 PM', message: 'hi' });
  });
});

describe('shapeContributions', () => {
  it('estimates words and resolves author/source', () => {
    const now = new Date('2026-06-28T12:00:00Z').getTime();
    const out = shapeContributions(
      [
        {
          id: 'k1',
          title: 'Guide',
          source: 'notion:abc',
          token_count: 130,
          owner_type: 'agent',
          metadata: { agent_name: 'Ops bot' },
          created_at: '2026-06-28T10:00:00Z',
        },
      ],
      now
    );
    expect(out[0]).toMatchObject({
      id: 'k1',
      title: 'Guide',
      author: 'Ops bot',
      source: 'Notion',
      words: 100,
      time: '2h ago',
    });
  });
  it('falls back to owner role when no agent name', () => {
    expect(shapeContributions([{ id: 'k2', owner_type: 'team' }])[0].author).toBe('Team');
  });
});

describe('mergeUsageSnapshots', () => {
  it('sums totals, models and timeseries across sources', () => {
    const a = {
      totals: { tokens: 100, cost: 1 },
      byModel: [{ model: 'gpt-4o', tokens: 100, cost: 1 }],
      timeseries: [{ date: '2026-06-28', tokens: 100, cost: 1 }],
    };
    const b = {
      totals: { tokens: 50, cost: 0.5 },
      byModel: [{ model: 'gpt-4o', tokens: 50, cost: 0.5 }],
      timeseries: [{ date: '2026-06-28', tokens: 50, cost: 0.5 }],
    };
    const merged = mergeUsageSnapshots([a, b, null]);
    expect(merged.totalTokens).toBe(150);
    expect(merged.models[0]).toMatchObject({ model: 'gpt-4o', tokens: 150, pct: 100 });
    expect(merged.timeseries).toEqual([{ date: '2026-06-28', tokens: 150, cost: 1.5 }]);
  });
});

describe('buildActivitySeries', () => {
  // Fixed reference day so buckets are deterministic (local time).
  const now = new Date('2026-06-28T12:00:00').getTime();

  it('returns a zero-filled series of the requested length, oldest-first', () => {
    const series = buildActivitySeries([], { days: 7, now });
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.count === 0)).toBe(true);
    expect(series[0].date < series[6].date).toBe(true);
    expect(series[6].date).toBe('2026-06-28');
    expect(series[0].date).toBe('2026-06-22');
  });

  it('counts inbound messages into their day bucket', () => {
    const logs = [
      { created_at: '2026-06-28T09:00:00', sender_type: 'contact' },
      { created_at: '2026-06-28T18:00:00', sender_type: 'user' },
      { created_at: '2026-06-27T10:00:00', sender_type: 'contact' },
    ];
    const series = buildActivitySeries(logs, { days: 7, now });
    const byDate = Object.fromEntries(series.map((p) => [p.date, p.count]));
    expect(byDate['2026-06-28']).toBe(2);
    expect(byDate['2026-06-27']).toBe(1);
  });

  it('excludes the assistant/agent own messages and out-of-range / invalid rows', () => {
    const logs = [
      { created_at: '2026-06-28T09:00:00', sender_type: 'agent' },
      { created_at: '2026-06-28T09:30:00', sender_type: 'assistant' },
      { created_at: '2026-06-28T10:00:00', sender_type: 'contact' },
      { created_at: '2026-01-01T10:00:00', sender_type: 'contact' },
      { created_at: 'nonsense', sender_type: 'contact' },
      { sender_type: 'contact' },
    ];
    const series = buildActivitySeries(logs, { days: 7, now });
    const total = series.reduce((sum, p) => sum + p.count, 0);
    expect(total).toBe(1);
  });
});
