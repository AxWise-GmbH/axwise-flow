import { describe, it, expect } from 'vitest';
import { CATEGORIES, PROVIDERS, PROVIDERS_BY_CATEGORY } from './providerCatalog';
import { PROVIDER_CATALOG, TOOL_PROVIDER_ALIAS } from '../../../../lib/security/provider-catalog.js';

/**
 * The UI list and the backend allow-list are two hand-maintained copies of the
 * same set. Nothing kept them in step before this file: `llm:gemini` exists in
 * the backend and cannot be set from the UI, which is a live bug this pins.
 */
describe('providerCatalog ↔ backend catalog', () => {
  // Known, deliberate gaps. Shrink this list; never grow it without a reason.
  const UI_OMISSIONS = new Set([
    'llm:gemini', // BUG: backend supports it, UI offers no row — unsettable today
    'llm:ollama',
    'llm:local-openai', // local endpoints, configured in the Setup wizard instead
    'data:obsidian',
    'data:dropbox',
    'data:onedrive',
    'data:google-drive',
    'data:mega', // storage connections, handled by their own flow
  ]);

  it('every UI provider exists in the backend catalog, or is a tool: alias', () => {
    for (const p of PROVIDERS) {
      const known = Object.hasOwn(PROVIDER_CATALOG, p.id) || p.id.startsWith('tool:');
      expect(known, `${p.id} is offered by the UI but the backend rejects it`).toBe(true);
    }
  });

  it('every backend provider is settable from the UI, except known omissions', () => {
    for (const id of Object.keys(PROVIDER_CATALOG)) {
      if (UI_OMISSIONS.has(id)) continue;
      expect(
        PROVIDERS.some((p) => p.id === id),
        `${id} exists in the backend but has no UI row — users cannot set it`,
      ).toBe(true);
    }
  });

  it('every provider names a category that exists, or it renders nowhere', () => {
    // ApiKeys.jsx iterates CATEGORIES and looks up PROVIDERS_BY_CATEGORY; an
    // orphaned category means the row silently never appears.
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const p of PROVIDERS) expect(ids, p.id).toContain(p.category);
  });

  it('has no duplicate provider ids', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the tool: rows', () => {
  const toolRows = PROVIDERS.filter((p) => p.id.startsWith('tool:'));

  it('exist only for tools with no alias — the other 16 reuse an existing row', () => {
    // A row for an aliased tool would sit next to the provider that already holds
    // that key, and only one of the two would actually feed agents.
    for (const p of toolRows) {
      const toolId = p.id.slice(5);
      expect(TOOL_PROVIDER_ALIAS[toolId], `${p.id} is aliased; it must not have its own row`).toBeUndefined();
    }
  });

  it('covers every api tool that has no alias', () => {
    expect(toolRows.map((p) => p.id).sort()).toEqual([
      'tool:tool-analytics',
      'tool:tool-capsolver-solver',
      'tool:tool-rentahuman',
      'tool:tool-sms-verify',
    ]);
  });

  it('renders under the tool category', () => {
    expect(PROVIDERS_BY_CATEGORY.tool).toHaveLength(4);
  });

  it('gives every row a doc link, so a user can find the key', () => {
    for (const p of toolRows) expect(p.docUrl, p.id).toMatch(/^https:\/\//);
  });
});
