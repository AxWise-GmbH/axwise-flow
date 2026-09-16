/**
 * Notification catalog integrity + role-scoping + channel preference tests.
 * The catalog (shared/notificationCatalog.js) is the single source of truth for
 * both the Settings UI and the API, so these lock its shape and the helpers the
 * UI/server depend on. (Lives under src/ so it matches the vitest include glob.)
 */
import { describe, it, expect } from 'vitest';
import {
  EMAIL_ACTION_CATEGORIES,
  CHANNEL_KEY,
  getDefaultChannels,
  getChannelPrefs,
  normalizeEmailPreferences,
  getActionLabel,
  getCategoryPageIds,
  getVisibleCategoryEntries,
  getAllEmailActionKeys,
} from '../../shared/notificationCatalog.js';
import { PAGE_DEFINITIONS } from './rolesPermissionsService.js';

const validPageIds = new Set(PAGE_DEFINITIONS.map((p) => p.id));

describe('notification catalog integrity', () => {
  it('every action has a non-empty label', () => {
    for (const cat of Object.values(EMAIL_ACTION_CATEGORIES)) {
      for (const [key, cfg] of Object.entries(cat.actions)) {
        expect(typeof cfg.label, key).toBe('string');
        expect(cfg.label.length, key).toBeGreaterThan(0);
      }
    }
  });

  it('every non-global category maps to real PAGE_DEFINITIONS pages', () => {
    for (const [catKey, cat] of Object.entries(EMAIL_ACTION_CATEGORIES)) {
      if (cat.global) continue;
      const pageIds = getCategoryPageIds(cat);
      expect(pageIds.length, catKey).toBeGreaterThan(0);
      for (const pid of pageIds) {
        expect(validPageIds.has(pid), `${catKey} -> ${pid}`).toBe(true);
      }
    }
  });

  it('action keys are unique across the catalog', () => {
    const keys = getAllEmailActionKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('getActionLabel resolves known keys and returns null for unknown', () => {
    expect(getActionLabel('partner_created')).toBe('New partner added');
    expect(getActionLabel('nope_nope')).toBeNull();
  });
});

describe('preferences normalization + channels', () => {
  it('preserves _channels and defaults them on when missing', () => {
    const norm = normalizeEmailPreferences({ partner_created: true });
    expect(norm.partner_created).toBe(true);
    expect(norm[CHANNEL_KEY]).toEqual({ email: true, inapp: true });
  });

  it('honors explicit channel overrides', () => {
    const norm = normalizeEmailPreferences({ [CHANNEL_KEY]: { email: false, inapp: true } });
    expect(getChannelPrefs(norm)).toEqual({ email: false, inapp: true });
  });

  it('drops unknown action keys but keeps catalog keys', () => {
    const norm = normalizeEmailPreferences({ bogus_key: true, role_created: true });
    expect(norm).not.toHaveProperty('bogus_key');
    expect(norm.role_created).toBe(true);
  });

  it('getChannelPrefs / getDefaultChannels default both channels on', () => {
    expect(getChannelPrefs({})).toEqual({ email: true, inapp: true });
    expect(getChannelPrefs(null)).toEqual({ email: true, inapp: true });
    expect(getDefaultChannels()).toEqual({ email: true, inapp: true });
  });
});

describe('role-scoping (getVisibleCategoryEntries)', () => {
  const allCount = Object.keys(EMAIL_ACTION_CATEGORIES).length;

  it('returns all categories when access is unknown (fail open)', () => {
    expect(getVisibleCategoryEntries(null).length).toBe(allCount);
  });

  it('shows only categories for accessible pages, plus global', () => {
    const access = new Set(['partners', 'reports']); // a restricted role
    const visible = getVisibleCategoryEntries(access).map(([k]) => k);
    expect(visible).toContain('partners');
    expect(visible).toContain('reports');
    expect(visible).toContain('security'); // global always shown
    expect(visible).not.toContain('consilium');
    expect(visible).not.toContain('agents');
    expect(visible.length).toBeLessThan(allCount);
  });

  it('shows the marketing category if any marketing page is accessible', () => {
    const visible = getVisibleCategoryEntries(new Set(['marketing_campaigns'])).map(([k]) => k);
    expect(visible).toContain('marketing');
  });
});
