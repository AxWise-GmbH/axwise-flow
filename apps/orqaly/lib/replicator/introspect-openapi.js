/**
 * OpenAPI 3.0 introspection for the Replicator wizard.
 *
 * Parses an OpenAPI JSON document into a DiscoveredEndpoint[] that reuses the
 * same shape as introspect-composio.js so downstream wizard + preset-selector
 * code is integration-agnostic.
 */

const READ_METHODS = new Set(['get', 'head', 'options']);

function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let node = root;
  for (const p of parts) {
    if (!node || typeof node !== 'object') return null;
    node = node[p];
  }
  return node || null;
}

function resolveSchema(root, schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    seen.add(schema.$ref);
    return resolveSchema(root, resolveRef(root, schema.$ref), seen);
  }
  // Shallow-resolve properties + items; don't blow up on deeply recursive graphs.
  const copy = { ...schema };
  if (copy.properties && typeof copy.properties === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(copy.properties)) {
      out[k] = v?.$ref ? resolveSchema(root, v, new Set(seen)) : v;
    }
    copy.properties = out;
  }
  if (copy.items?.$ref) {
    copy.items = resolveSchema(root, copy.items, new Set(seen));
  }
  return copy;
}

function synthesizeId(method, path) {
  return `${method.toUpperCase()}_${path}`
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function verbFromMethod(method) {
  return READ_METHODS.has(method.toLowerCase()) ? 'read' : 'write';
}

function buildInputSchema(root, operation, pathItem) {
  const properties = {};
  const required = [];
  const paramLocations = {};

  const pathLevelParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
  const opLevelParams = Array.isArray(operation.parameters) ? operation.parameters : [];
  const byName = new Map();
  for (const p of [...pathLevelParams, ...opLevelParams]) {
    const resolved = p.$ref ? resolveRef(root, p.$ref) : p;
    if (!resolved?.name) continue;
    byName.set(resolved.name, resolved);
  }
  for (const param of byName.values()) {
    const schema = param.schema ? resolveSchema(root, param.schema) : { type: 'string' };
    properties[param.name] = {
      ...schema,
      title: param.name,
      description: param.description || schema.description || '',
    };
    if (param.required || param.in === 'path') required.push(param.name);
    paramLocations[param.name] = param.in; // 'query' | 'path' | 'header' | 'cookie'
  }

  // requestBody (JSON only)
  if (operation.requestBody) {
    const body = operation.requestBody.$ref
      ? resolveRef(root, operation.requestBody.$ref)
      : operation.requestBody;
    const jsonContent = body?.content?.['application/json']?.schema;
    if (jsonContent) {
      const resolved = resolveSchema(root, jsonContent);
      if (resolved?.type === 'object' && resolved.properties) {
        for (const [k, v] of Object.entries(resolved.properties)) {
          properties[k] = v;
          paramLocations[k] = 'body';
        }
        for (const r of resolved.required || []) {
          if (!required.includes(r)) required.push(r);
        }
      } else {
        // Opaque body — single field the admin fills with raw JSON.
        properties.body = {
          type: 'string',
          title: 'Request body (JSON)',
          description: 'Raw JSON body for this endpoint.',
        };
        paramLocations.body = 'body';
        if (body.required) required.push('body');
      }
    }
  }

  return {
    inputSchema: { type: 'object', properties, required },
    paramLocations,
  };
}

/**
 * @param {object} doc - parsed OpenAPI document (3.0.x)
 * @returns {Array} DiscoveredEndpoint[]
 */
export function introspectOpenApiDoc(doc) {
  if (!doc || typeof doc !== 'object' || !doc.paths) return [];
  const endpoints = [];
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const pathLevelParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const op = pathItem[method];
      if (!op) continue;
      const { inputSchema, paramLocations } = buildInputSchema(doc, op, { parameters: pathLevelParams });
      const id = op.operationId || synthesizeId(method, path);
      const category = (Array.isArray(op.tags) && op.tags[0]) || 'General';
      endpoints.push({
        id,
        name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
        description: op.description || '',
        category,
        method: method.toUpperCase(),
        path,
        paramLocations,
        verb: verbFromMethod(method),
        popular: false,
        inputSchema,
        raw: { method, path, operationId: op.operationId },
      });
    }
  }
  return endpoints;
}

/**
 * @param {string} jsonText - raw OpenAPI JSON
 */
export function introspectOpenApiJson(jsonText) {
  let doc;
  try {
    doc = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }
  if (!doc?.openapi && !doc?.swagger) {
    throw new Error('Document does not look like OpenAPI / Swagger (missing openapi or swagger field).');
  }
  return introspectOpenApiDoc(doc);
}
