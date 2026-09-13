/**
 * useImportedLibraries(category) - per-user imported Marketplace libraries.
 *
 * Backend-backed (RLS user-scoped via /api/app?path=marketplace-imports). Returns
 * the user's imported libraries for a category plus helpers to import, remove,
 * and register a custom one.
 *
 * Usability model:
 *  - Catalog tabs (orgs, teams, agents, models): imported items are merged into
 *    the tab's catalog grid and the existing action button (Use / Add / Rent)
 *    operates on the item object directly.
 *  - Owned-list tabs (tools, skills): the grid shows the user's real records, so
 *    importing also materializes each item via createTool / createSkill. The tab
 *    reloads its native list and badges the matching records.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  listImportedLibraries,
  importLibrary as apiImportLibrary,
  removeImportedLibrary as apiRemoveImportedLibrary,
} from '../services/importedLibrariesService';
import { createTool, getAllTools } from '../services/toolService';
import { createSkill, listSkills } from '../services/agentSkillsService';
import { itemKey } from '../config/marketplaceImportSources';

// ── Cross-instance sync: any write notifies every hook instance to refetch ──
const listeners = new Set();
function notify() {
  for (const cb of listeners) cb();
}

// Fields the category's "use" action needs; used to validate custom imports.
const REQUIRED_ITEM_FIELDS = {
  orgs: ['name', 'type', 'entities'],
  teams: ['name', 'members'],
  agents: ['role', 'system_prompt'],
  models: ['name', 'exactModel'],
  tools: ['name', 'connectionType'],
  skills: ['name', 'content'],
};

function validateItems(category, items) {
  const required = REQUIRED_ITEM_FIELDS[category] || ['name'];
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Provide at least one item' };
  }
  for (const item of items) {
    if (!item || typeof item !== 'object')
      return { ok: false, error: 'Each item must be an object' };
    for (const field of required) {
      const v = item[field];
      const missing = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (missing) return { ok: false, error: `Each item needs "${field}"` };
    }
  }
  return { ok: true };
}

// Materialize tools/skills into the user's real stores so they are usable.
async function materialize(category, lib) {
  if (category === 'skills') {
    let existing = [];
    try {
      existing = await listSkills();
    } catch {
      existing = [];
    }
    const seen = new Set((existing || []).map((s) => s.slug).filter(Boolean));
    for (const item of lib.items || []) {
      const slug = item.slug || item.id;
      if (slug && seen.has(slug)) continue;
      try {
        await createSkill({
          name: item.name,
          description: item.description || '',
          category: item.category || 'ops',
          tags: item.tags || [],
          content: item.content || `# ${item.name}\n\n${item.description || ''}`,
          icon: item.icon || 'extension',
        });
      } catch {
        // Skip an item the skill validator rejects; the rest still import.
      }
    }
  } else if (category === 'tools') {
    let existing = [];
    try {
      existing = await getAllTools();
    } catch {
      existing = [];
    }
    const seen = new Set((existing || []).map((t) => t.id).filter(Boolean));
    for (const item of lib.items || []) {
      if (item.id && seen.has(item.id)) continue;
      try {
        await createTool({
          id: item.id,
          name: item.name,
          description: item.description || '',
          connectionType: item.connectionType || 'api',
          status: item.status || 'active',
          category: item.category || null,
          url: item.url || '',
        });
      } catch {
        // Ignore a single failed item so the rest still import.
      }
    }
  }
}

export default function useImportedLibraries(category) {
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const list = await listImportedLibraries(category);
      if (mounted.current) setLibraries(Array.isArray(list) ? list : []);
    } catch {
      if (mounted.current) setLibraries([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const cb = () => refresh();
    listeners.add(cb);
    return () => {
      mounted.current = false;
      listeners.delete(cb);
    };
  }, [refresh]);

  const importLibrary = useCallback(
    async (lib) => {
      if (category === 'tools' || category === 'skills') {
        await materialize(category, lib);
      }
      await apiImportLibrary({
        category,
        sourceId: lib.id,
        name: lib.name,
        description: lib.description ?? null,
        author: lib.author ?? null,
        url: lib.url ?? null,
        custom: !!lib.custom,
        items: lib.items || [],
      });
      notify();
    },
    [category]
  );

  // Import a subset of a library's items. Merges with anything already imported
  // for the same source (union by itemKey) so picking more items later adds to,
  // rather than replaces, the stored set.
  const importItems = useCallback(
    async (lib, items) => {
      const selected = Array.isArray(items) ? items : [];
      if (selected.length === 0) return;

      const existingRow = libraries.find((l) => l.sourceId === lib.id);
      const existingItems = Array.isArray(existingRow?.items) ? existingRow.items : [];
      const seen = new Set(existingItems.map(itemKey));
      const merged = [...existingItems];
      for (const item of selected) {
        const key = itemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }

      if (category === 'tools' || category === 'skills') {
        // materialize only the newly selected items; it already dedupes by store.
        await materialize(category, { ...lib, items: selected });
      }
      await apiImportLibrary({
        category,
        sourceId: lib.id,
        name: lib.name,
        description: lib.description ?? null,
        author: lib.author ?? null,
        url: lib.url ?? null,
        custom: !!lib.custom,
        items: merged,
      });
      notify();
    },
    [category, libraries]
  );

  const removeLibrary = useCallback(async (id) => {
    await apiRemoveImportedLibrary(id);
    notify();
  }, []);

  const addCustomLibrary = useCallback(
    async ({ name, url, json }) => {
      const trimmedName = (name || '').trim();
      if (!trimmedName) return { ok: false, error: 'Name is required' };

      let items = [];
      if (json && json.trim()) {
        let parsed;
        try {
          parsed = JSON.parse(json);
        } catch {
          return { ok: false, error: 'Items must be valid JSON' };
        }
        items = Array.isArray(parsed) ? parsed : parsed?.items;
        if (!Array.isArray(items)) {
          return { ok: false, error: 'JSON must be an array of items or { items: [...] }' };
        }
        const v = validateItems(category, items);
        if (!v.ok) return v;
      }

      const lib = {
        id: `custom-${Date.now()}`,
        name: trimmedName,
        description: url ? `Custom library from ${url}` : 'Custom library',
        author: 'You',
        url: url || null,
        custom: true,
        items,
      };
      try {
        await importLibrary(lib);
      } catch (err) {
        return { ok: false, error: err.message || 'Failed to register library' };
      }
      return { ok: true };
    },
    [category, importLibrary]
  );

  const importedItems = useMemo(
    () =>
      libraries.flatMap((lib) =>
        (lib.items || []).map((item) => ({
          ...item,
          _imported: true,
          _sourceId: lib.sourceId,
          _sourceName: lib.name,
        }))
      ),
    [libraries]
  );

  const importedSources = useMemo(
    () =>
      libraries.map((lib) => ({
        id: lib.id,
        sourceId: lib.sourceId,
        name: lib.name,
        description: lib.description,
        author: lib.author,
        url: lib.url,
        custom: lib.custom,
        itemCount: Array.isArray(lib.items) ? lib.items.length : 0,
      })),
    [libraries]
  );

  const isImported = useCallback(
    (sourceId) => libraries.some((lib) => lib.sourceId === sourceId),
    [libraries]
  );

  return {
    loading,
    importedItems,
    importedSources,
    importLibrary,
    importItems,
    removeLibrary,
    addCustomLibrary,
    isImported,
    refresh,
  };
}
