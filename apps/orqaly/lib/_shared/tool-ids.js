import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';

// This is the one platform tool whose task-scoped use is purely declarative:
// it needs no user credential and performs no network, publishing, or other
// external side effect. Keep side-effecting `connectionType: internal` tools
// out of this semantic constant.
export const CREDENTIAL_FREE_DOCUMENT_TOOL_ID = 'tool-doc-generator';

const KNOWN_TOOL_IDS = new Set(PREDEFINED_TOOLS.map((tool) => tool.id));

function normalizedLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._/]+/g, ' ')
    .replace(/[-:]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const TOOL_ALIASES = new Map([
  // Planner models sometimes describe ordinary authoring software instead of
  // returning the Tool Hub id they were given. These analysis-only aliases
  // resolve to Orqaly's credential-free document generator; they do not grant
  // browser, code-execution, publishing, or external-service access.
  ['document editor', 'tool-doc-generator'],
  ['markdown editor', 'tool-doc-generator'],
  ['review checklist', 'tool-doc-generator'],
  ['spreadsheet', 'tool-doc-generator'],
  ['word processor', 'tool-doc-generator'],
  ['spreadsheet software', 'tool-doc-generator'],
  ['spreadsheet software python', 'tool-doc-generator'],
  ['spreadsheet tool', 'tool-doc-generator'],
  ['excel', 'tool-doc-generator'],
  ['microsoft excel', 'tool-doc-generator'],
  ['google docs', 'tool-doc-generator'],
  ['google document', 'tool-doc-generator'],
  ['validation checklist', 'tool-doc-generator'],
  ['validation checklist tool', 'tool-doc-generator'],
  ['checklist tool', 'tool-doc-generator'],
  ['documentation platform', 'tool-doc-generator'],
  ['documentation tool', 'tool-doc-generator'],
  ['data analysis tool', 'tool-doc-generator'],
  ['data analysis tools', 'tool-doc-generator'],
  ['mermaid', 'tool-doc-generator'],
  ['mermaid js', 'tool-doc-generator'],
  ['mermaid diagram', 'tool-doc-generator'],
  ['diagram tool', 'tool-doc-generator'],
  ['diagramming tool', 'tool-doc-generator'],
]);

// Resolve real Tool Hub names as well as ids. Platform definitions are listed
// before MCP definitions, so an ambiguous name such as GitHub preserves the
// historical platform-tool preference while connector-only names such as
// Google Sheets resolve to their MCP id.
const KNOWN_TOOL_ID_BY_LABEL = new Map();
for (const tool of PREDEFINED_TOOLS) {
  const candidates = [tool.id, tool.id.replace(/^(tool|mcp)-/, ''), tool.name];
  for (const candidate of candidates) {
    const key = normalizedLabel(candidate);
    if (key && !KNOWN_TOOL_ID_BY_LABEL.has(key)) KNOWN_TOOL_ID_BY_LABEL.set(key, tool.id);
  }
}

function explicitUnknownToolId(raw) {
  const prefixMatch = raw.match(/^(tool|mcp)[\s:_-]+/i);
  const prefix = prefixMatch?.[1]?.toLowerCase() || 'tool';
  const withoutPrefix = prefixMatch ? raw.slice(prefixMatch[0].length) : raw;
  const slug = withoutPrefix
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${prefix}-${slug}` : null;
}

/**
 * Convert planner shorthand into the canonical Tool Hub identifier.
 *
 * Both platform tools (`tool-*`) and Composio/MCP libraries (`mcp-*`) are
 * first-class IDs. In particular, an already-canonical `mcp-github` must never
 * become `tool-mcp-github` while crossing the AxWise boundary.
 */
export function normalizeToolId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const key = normalizedLabel(raw);
  const alias = TOOL_ALIASES.get(key);
  if (alias) return alias;
  const knownId = KNOWN_TOOL_ID_BY_LABEL.get(key);
  if (knownId) return knownId;

  // Unknown explicit requirements get a stable canonical-looking id but are
  // deliberately NOT added to the known set. Tool provisioning will therefore
  // keep them visible and fail closed instead of silently granting capability.
  return explicitUnknownToolId(raw);
}

export function normalizeToolIds(values = []) {
  const normalized = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = normalizeToolId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

export function isCanonicalToolId(value) {
  return typeof value === 'string' && /^(tool-|mcp-)/.test(value);
}

export function isKnownToolId(value) {
  return KNOWN_TOOL_IDS.has(value);
}
