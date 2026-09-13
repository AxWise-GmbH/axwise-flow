import { describe, it, expect } from 'vitest';
import {
  SETTINGS_TABS,
  SETTINGS_SECTION_DEFS,
  SETTINGS_LAST_TAB_KEY,
  findTabForBlock,
  persistLastSettingsTab,
  readLastSettingsTab,
  resolveActiveTab,
  searchSettings,
} from './settingsSections.js';

describe('SETTINGS_TABS', () => {
  it('gives every tab an id, a label, an icon and at least one block', () => {
    for (const tab of SETTINGS_TABS) {
      expect(tab.id).toBeTruthy();
      expect(tab.label).toBeTruthy();
      expect(tab.icon).toBeTruthy();
      expect(tab.blocks.length).toBeGreaterThan(0);
    }
  });

  it('keeps tab ids and block keys unique', () => {
    const tabIds = SETTINGS_TABS.map((t) => t.id);
    expect(new Set(tabIds).size).toBe(tabIds.length);
    const blockKeys = SETTINGS_TABS.flatMap((t) => t.blocks.map((b) => `${t.id}.${b.key}`));
    expect(new Set(blockKeys).size).toBe(blockKeys.length);
  });

  it('survives a context that has not loaded yet', () => {
    for (const tab of SETTINGS_TABS) {
      for (const block of tab.blocks) {
        expect(() => block.done(undefined)).not.toThrow();
        expect(typeof block.done({})).toBe('boolean');
      }
    }
  });

  it('ticks a block once the thing it asks for exists', () => {
    const account = SETTINGS_TABS[0].blocks.find((b) => b.key === 'account');
    expect(account.done({ profile: { displayName: '' } })).toBe(false);
    expect(account.done({ profile: { displayName: 'Mr.V' } })).toBe(true);
  });

  it('carries the section defs the layout hook expects', () => {
    expect(SETTINGS_SECTION_DEFS).toHaveLength(SETTINGS_TABS.length);
    for (const def of SETTINGS_SECTION_DEFS) {
      expect(def).toEqual(
        expect.objectContaining({ id: expect.any(String), label: expect.any(String) })
      );
      expect(def.blocks).toBeUndefined();
    }
    expect(SETTINGS_SECTION_DEFS.filter((d) => d.partnerHidden).map((d) => d.id)).toEqual([
      'actionlog',
      'devmode',
    ]);
  });
});

describe('findTabForBlock', () => {
  it('finds the tab a block belongs to', () => {
    expect(findTabForBlock('password').id).toBe('security');
  });

  it('returns null for an unknown block', () => {
    expect(findTabForBlock('nope')).toBeNull();
  });
});

describe('searchSettings', () => {
  it('finds a block by a keyword that is not in its title', () => {
    const hits = searchSettings('telegram');
    expect(hits).toEqual([
      expect.objectContaining({ tabId: 'profile', blockKey: 'account', title: 'Account' }),
    ]);
  });

  it('matches the tab label too', () => {
    expect(searchSettings('developer').map((h) => h.tabId)).toContain('devmode');
  });

  it('is case-insensitive and returns nothing for an empty query', () => {
    expect(searchSettings('YUBIKEY')[0].blockKey).toBe('signin');
    expect(searchSettings('   ')).toEqual([]);
  });

  it('only searches the tabs it is given', () => {
    const visible = SETTINGS_TABS.filter((t) => !t.partnerHidden);
    expect(searchSettings('audit log', visible).some((h) => h.tabId === 'actionlog')).toBe(false);
  });
});

describe('resolveActiveTab', () => {
  const ids = ['profile', 'security', 'preferences'];

  it('honours what the URL asked for', () => {
    expect(resolveActiveTab('security', 'preferences', ids)).toBe('security');
  });

  it('falls back to the remembered tab when the URL says nothing', () => {
    expect(resolveActiveTab(null, 'preferences', ids)).toBe('preferences');
  });

  it('falls back to the first tab when neither is on the rail', () => {
    expect(resolveActiveTab('devmode', 'actionlog', ids)).toBe('profile');
  });

  it('returns null when there are no tabs at all', () => {
    expect(resolveActiveTab('profile', 'profile', [])).toBeNull();
  });
});

describe('the remembered tab', () => {
  it('round-trips through storage', () => {
    persistLastSettingsTab('security');
    expect(window.localStorage.getItem(SETTINGS_LAST_TAB_KEY)).toBe('security');
    expect(readLastSettingsTab()).toBe('security');
    window.localStorage.removeItem(SETTINGS_LAST_TAB_KEY);
    expect(readLastSettingsTab()).toBeNull();
  });
});
