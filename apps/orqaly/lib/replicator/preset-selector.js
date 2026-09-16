/**
 * Preset selector — resolves Basic/Full/Custom into a concrete set of selected endpoint ids.
 *
 * Pure function so it's unit-testable without the UI. Same rules for the wizard form
 * and (later) for the local CLI generator.
 */

const BASIC_RULES = {
  composio: (endpoints) => {
    const popular = endpoints.filter((e) => e.popular).map((e) => e.id);
    const reads = endpoints.filter((e) => e.verb === 'read').map((e) => e.id);
    const set = new Set([...popular, ...reads]);
    return Array.from(set);
  },
  api: (endpoints) => {
    return endpoints
      .filter((e) => {
        const method = String(e.method || '').toUpperCase();
        if (method && method !== 'GET') return false;
        const pathParamCount = (String(e.path || '').match(/\{[^}]+\}/g) || []).length;
        return pathParamCount <= 1;
      })
      .map((e) => e.id);
  },
  mcp: (endpoints) => {
    return endpoints
      .filter((e) => !/^(admin_|delete_|destroy_)/i.test(e.id))
      .slice(0, 8)
      .map((e) => e.id);
  },
  webhook: (endpoints) => {
    if (!endpoints.length) return [];
    const primary = endpoints.find((e) => e.primary === true);
    return [(primary || endpoints[0]).id];
  },
  sdk: (endpoints) => {
    const entry = endpoints.find((e) => e.isEntryFunction === true);
    return entry ? [entry.id] : endpoints.slice(0, 1).map((e) => e.id);
  },
};

/**
 * @param {Array} endpoints - DiscoveredEndpoint[]
 * @param {'basic'|'full'|'custom'} preset
 * @param {'composio'|'api'|'mcp'|'webhook'|'sdk'} integrationType
 * @param {string[]} [customSelection] - required when preset === 'custom'
 * @returns {string[]} selected endpoint ids
 */
export function selectEndpointsByPreset(endpoints, preset, integrationType, customSelection) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) return [];
  if (preset === 'full') return endpoints.map((e) => e.id);
  if (preset === 'custom') {
    if (!Array.isArray(customSelection)) return [];
    const valid = new Set(endpoints.map((e) => e.id));
    return customSelection.filter((id) => valid.has(id));
  }
  const rule = BASIC_RULES[integrationType];
  if (!rule) return endpoints.map((e) => e.id);
  const result = rule(endpoints);
  return result.length ? result : endpoints.slice(0, 1).map((e) => e.id);
}

/**
 * Group endpoints by category for the 2-layer picker.
 * @returns {Array<{category: string, items: DiscoveredEndpoint[]}>}
 */
export function groupByCategory(endpoints) {
  const map = new Map();
  for (const ep of endpoints) {
    const cat = ep.category || 'General';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(ep);
  }
  return Array.from(map.entries())
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
