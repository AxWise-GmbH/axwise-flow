/**
 * Composio introspection for the Replicator wizard.
 *
 * Given a Composio app name, returns a normalized DiscoveredEndpoint[] that the
 * wizard's preset-selector + 2-layer category picker both consume.
 */
import { getComposioActions } from '../composio/executor.js';

/**
 * @typedef {Object} DiscoveredEndpoint
 * @property {string} id                  stable identifier (action name)
 * @property {string} name                human-readable action label
 * @property {string} description
 * @property {string} category            group for the 2-layer picker
 * @property {'read'|'write'|'unknown'} verb  used by the Basic preset
 * @property {boolean} popular            true when marked popular / common by Composio
 * @property {object} inputSchema         JSON-schema-lite object with {type:'object', properties, required}
 * @property {object} raw                 the raw Composio action object (for traceability)
 */

const READ_PREFIXES = ['LIST_', 'GET_', 'SEARCH_', 'FETCH_', 'READ_', 'FIND_'];
const WRITE_PREFIXES = ['CREATE_', 'UPDATE_', 'DELETE_', 'REMOVE_', 'SEND_', 'POST_', 'PUT_', 'PATCH_'];

function classifyVerb(actionName) {
  if (!actionName) return 'unknown';
  const parts = String(actionName).toUpperCase().split('_');
  const afterApp = parts.slice(1).join('_') + '_';
  if (READ_PREFIXES.some((p) => afterApp.startsWith(p))) return 'read';
  if (WRITE_PREFIXES.some((p) => afterApp.startsWith(p))) return 'write';
  return 'unknown';
}

function categoryFor(action) {
  // Composio responses vary; try a few common spots.
  return (
    action.tags?.[0]
    || action.category
    || action.group
    || action.appName
    || 'General'
  );
}

function popularityFlag(action) {
  // Try several metadata flavours Composio has shipped over versions.
  if (action.popular === true) return true;
  if (Array.isArray(action.tags) && action.tags.some((t) => /popular|common|featured/i.test(t))) return true;
  return false;
}

function normalizeInputSchema(action) {
  const params = action.parameters || action.parametersSchema || action.inputSchema || {};
  // Composio sometimes returns { type, properties, required }; sometimes a
  // flat { fieldName: {type, description} } map. Normalize both shapes.
  if (params && typeof params === 'object' && params.properties) {
    return {
      type: 'object',
      properties: params.properties || {},
      required: Array.isArray(params.required) ? params.required : [],
    };
  }
  if (params && typeof params === 'object') {
    return {
      type: 'object',
      properties: params,
      required: [],
    };
  }
  return { type: 'object', properties: {}, required: [] };
}

/**
 * @param {string} appName
 * @returns {Promise<DiscoveredEndpoint[]>}
 */
export async function introspectComposioApp(appName) {
  if (!appName) return [];
  const actions = await getComposioActions(appName);
  if (!Array.isArray(actions) || actions.length === 0) return [];
  return actions
    .map((a) => {
      const id = a.name || a.actionName || a.id || a.slug;
      if (!id) return null;
      return {
        id,
        name: a.displayName || a.title || id,
        description: a.description || '',
        category: categoryFor(a),
        verb: classifyVerb(id),
        popular: popularityFlag(a),
        inputSchema: normalizeInputSchema(a),
        raw: a,
      };
    })
    .filter(Boolean);
}
