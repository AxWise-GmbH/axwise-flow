import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES_CHECKED_ON,
  CAPABILITY_GROUPS,
  DEVELOPER_EARLY_LINES,
  DEVELOPER_LINES,
  PLANNED,
  PLANNED_PATTERN,
} from './capabilities.data';

const ITEMS = CAPABILITY_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.id }))
);
const CLAIM_TEXTS = [
  ...ITEMS.map((item) => item.text),
  ...DEVELOPER_LINES,
  ...DEVELOPER_EARLY_LINES,
];

describe('capabilities data', () => {
  it('gives every claim a text, an honest mark, a place and a source path', () => {
    expect(ITEMS.length).toBeGreaterThan(0);
    for (const item of ITEMS) {
      expect(item.text.trim(), item.group).not.toBe('');
      expect(['now', 'switch-on'], item.text).toContain(item.badge);
      expect(['card', 'more'], item.text).toContain(item.show);
      expect(item.evidence, item.text).toMatch(/^[\w./-]+$/);
    }
  });

  it('keeps each card to three lines of at most five words', () => {
    expect(CAPABILITY_GROUPS.map((group) => group.title)).toEqual([
      'Work',
      'Remember',
      'Protect',
      'Connect',
    ]);
    for (const group of CAPABILITY_GROUPS) {
      const lines = group.items.filter((item) => item.show === 'card');
      expect(lines, group.id).toHaveLength(3);
      for (const line of lines) {
        expect(line.text.trim().split(/\s+/).length, line.text).toBeLessThanOrEqual(5);
      }
    }
  });

  it('never puts a switched-off part on a card face, where its mark cannot show', () => {
    // Card lines render without a badge, so only factory-on features may sit there.
    for (const item of ITEMS.filter((entry) => entry.show === 'card')) {
      expect(item.badge, item.text).toBe('now');
    }
  });

  it('uses each text once per card, because the text is the list key', () => {
    for (const group of CAPABILITY_GROUPS) {
      const texts = group.items.map((item) => item.text);
      expect(new Set(texts).size, group.id).toBe(texts.length);
    }
  });

  it('records the day the claims were checked as an ISO date', () => {
    expect(CAPABILITIES_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${CAPABILITIES_CHECKED_ON}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
      CAPABILITIES_CHECKED_ON
    );
  });

  it('lists the seven planned items, and nothing planned anywhere else', () => {
    expect(PLANNED).toEqual([
      'App lock (PIN, YubiKey)',
      'Password vault',
      'Spoken replies',
      'Built-in browser',
      'Mind map',
      'Business details vault',
      'Project folders',
    ]);
    for (const text of CLAIM_TEXTS) {
      expect(text).not.toMatch(PLANNED_PATTERN);
    }
  });

  it('never words a claim the app cannot back', () => {
    for (const text of CLAIM_TEXTS) {
      expect(text).not.toMatch(/shield|data leaks|checks itself|IDE replacement/i);
    }
  });
});
