import { describe, expect, it } from 'vitest';
import {
  EMPTY_GCP_NAV_PREFERENCES,
  buildGcpRecentItems,
  normalizeGcpSectionOrder,
} from './gcpNavPreferences.js';

describe('GCP navigation data', () => {
  it('seeds the PR59 section break before Structure', () => {
    expect(EMPTY_GCP_NAV_PREFERENCES.sectionGapIds).toEqual(['structure']);
  });

  it('combines Assistant threads and flat overview workflows newest first', () => {
    const items = buildGcpRecentItems(
      {
        threads: [
          {
            id: 'thread-old',
            title: 'Older assistant chat',
            updatedAt: '2026-09-01T08:00:00.000Z',
          },
          {
            id: 'thread-new',
            title: 'Newest assistant chat',
            updatedAt: '2026-09-01T12:00:00.000Z',
          },
        ],
      },
      {
        workflows: [
          {
            id: 'goal-middle',
            title: 'Middle goal run',
            status: 'running',
            updatedAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      }
    );

    expect(items.map((item) => item.id)).toEqual([
      'chat:thread-new',
      'goal:goal-middle',
      'chat:thread-old',
    ]);
    expect(items[1]).toMatchObject({
      label: 'Middle goal run',
      meta: 'Running',
      to: '/goals?run=goal-middle',
    });
  });

  it('repairs a saved order with unknown, duplicate, or newly added sections', () => {
    const normalized = normalizeGcpSectionOrder(['goals', 'unknown', 'goals', 'home']);
    expect(normalized.slice(0, 2)).toEqual(['goals', 'home']);
    expect(new Set(normalized).size).toBe(normalized.length);
    expect(normalized).toEqual(
      expect.arrayContaining([
        'recents',
        'pinned',
        'assistant',
        'structure',
        'intelligence',
        'history',
      ])
    );
  });
});
