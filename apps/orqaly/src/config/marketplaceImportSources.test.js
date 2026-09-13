import { describe, it, expect } from 'vitest';
import {
  MARKETPLACE_IMPORT_SOURCES,
  getLibrariesForCategory,
  itemKey,
} from './marketplaceImportSources';

// Required functional fields per category - mirrors each tab's "use" action.
// If an item is missing one of these, the imported item would not be usable.
const REQUIRED_ITEM_FIELDS = {
  orgs: ['name', 'type', 'entities'],
  teams: ['name', 'industry', 'members'],
  agents: ['_id', 'name', 'role', 'category', 'connection_type', 'system_prompt'],
  models: ['id', 'name', 'exactModel', 'sizeClass', 'status'],
  tools: ['id', 'name', 'connectionType', 'status'],
  skills: ['id', 'slug', 'name', 'category', 'content'],
};

const CATEGORIES = ['orgs', 'teams', 'agents', 'models', 'tools', 'skills'];

describe('marketplaceImportSources', () => {
  it('defines exactly the 6 categories', () => {
    expect(Object.keys(MARKETPLACE_IMPORT_SOURCES).sort()).toEqual([...CATEGORIES].sort());
  });

  it('getLibrariesForCategory returns an array and [] for unknown', () => {
    expect(Array.isArray(getLibrariesForCategory('agents'))).toBe(true);
    expect(getLibrariesForCategory('nope')).toEqual([]);
  });

  CATEGORIES.forEach((category) => {
    describe(`category ${category}`, () => {
      const libs = MARKETPLACE_IMPORT_SOURCES[category];

      it('has at least 6 libraries with unique ids and non-empty items', () => {
        expect(libs.length).toBeGreaterThanOrEqual(6);
        const ids = libs.map((l) => l.id);
        expect(new Set(ids).size).toBe(libs.length);
        for (const lib of libs) {
          expect(lib.name).toBeTruthy();
          expect(lib.url).toMatch(/^https?:\/\//);
          expect(Array.isArray(lib.items)).toBe(true);
          expect(lib.items.length).toBeGreaterThan(0);
        }
      });

      it('every item carries its tab functional fields', () => {
        const required = REQUIRED_ITEM_FIELDS[category];
        for (const lib of libs) {
          for (const item of lib.items) {
            for (const field of required) {
              const v = item[field];
              const missing = v == null || v === '' || (Array.isArray(v) && v.length === 0);
              expect(missing, `${category}/${lib.id} item missing "${field}"`).toBe(false);
            }
          }
        }
      });
    });
  });

  it('itemKey falls back through id, _id, slug, name', () => {
    expect(itemKey({ id: 'a', _id: 'b' })).toBe('a');
    expect(itemKey({ _id: 'b' })).toBe('b');
    expect(itemKey({ slug: 'c' })).toBe('c');
    expect(itemKey({ name: 'd' })).toBe('d');
    expect(itemKey({})).toBe('');
  });

  it('gives every catalog item a unique, non-empty key within its library', () => {
    for (const libs of Object.values(MARKETPLACE_IMPORT_SOURCES)) {
      for (const lib of libs) {
        const keys = lib.items.map(itemKey);
        expect(keys.every(Boolean)).toBe(true);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('uses plain hyphens only (no em or en dashes)', () => {
    const json = JSON.stringify(MARKETPLACE_IMPORT_SOURCES);
    expect(json).not.toMatch(/[–—]/);
  });
});
