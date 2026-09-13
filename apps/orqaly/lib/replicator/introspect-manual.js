/**
 * Manual endpoint introspection — turns admin-authored rows into the same
 * DiscoveredEndpoint[] shape the OpenAPI + Composio introspectors produce.
 */

const PATH_PARAM_RE = /\{([^}]+)\}/g;

function extractPathParams(path) {
  const params = [];
  const seen = new Set();
  let match;
  while ((match = PATH_PARAM_RE.exec(path)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      params.push(name);
    }
  }
  return params;
}

/**
 * @param {Array<{method: string, path: string, name?: string, description?: string, category?: string, fields?: Array<{name, in, required, description, type}>}>} rows
 * @returns {Array} DiscoveredEndpoint[]
 */
export function introspectManualRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && row.method && row.path)
    .map((row) => {
      const method = String(row.method).toUpperCase();
      const path = String(row.path);
      const pathParams = extractPathParams(path);
      const paramLocations = {};
      const properties = {};
      const required = [];

      for (const pp of pathParams) {
        properties[pp] = { type: 'string', title: pp, description: 'Path parameter.' };
        paramLocations[pp] = 'path';
        if (!required.includes(pp)) required.push(pp);
      }

      for (const f of row.fields || []) {
        if (!f?.name) continue;
        properties[f.name] = {
          type: f.type || 'string',
          title: f.name,
          description: f.description || '',
        };
        paramLocations[f.name] = f.in || 'query';
        if (f.required && !required.includes(f.name)) required.push(f.name);
      }

      return {
        id: row.id || `${method}_${path}`.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase(),
        name: row.name || `${method} ${path}`,
        description: row.description || '',
        category: row.category || 'General',
        method,
        path,
        paramLocations,
        verb: method === 'GET' || method === 'HEAD' ? 'read' : 'write',
        popular: false,
        inputSchema: { type: 'object', properties, required },
        raw: { source: 'manual' },
      };
    });
}
