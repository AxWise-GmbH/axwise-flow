/**
 * Tool credential resolution for the agent execution path.
 *
 * Before this module, an agent could only use a tool whose API key was sitting in
 * `tools.data.apiKey` — a per-user row that, for catalog ids, only the FIRST user
 * in the database can own (`tools.id` is the primary key on its own). Every other
 * user was locked out of every catalog tool, permanently.
 *
 * Here the question changes from "does this user have a tools row?" to "is there a
 * credential for this tool?", answered against the per-user encrypted vault
 * (`user_api_keys` via resolveUserKey) with an optional env fallback for local dev.
 * No row required, so the tools_pkey collision stops mattering for agents.
 *
 * The LLM path already works this way — see llm-executor.js:403, which resolves
 * `llm:<provider>` per user with requireUser:true. This brings tools in line.
 */
import { resolveUserKey } from '../security/resolve-user-key.js';
import { TOOL_PROVIDER_ALIAS } from '../security/provider-catalog.js';
import { isComposioConfigured } from '../composio/client.js';

/**
 * The env var holding a tool's secret, or null when the def declares none.
 *
 * NOT `credentials[0]`: tool-analytics declares GA_PROPERTY_ID before GA_API_KEY,
 * and a property id is an identifier, not a secret — picking it would silently
 * authenticate with garbage. Take the last credential that isn't an *_ID.
 */
export function credentialEnvVar(def) {
  const creds = Array.isArray(def?.credentials) ? def.credentials : [];
  const secrets = creds.map((c) => c?.key).filter((k) => typeof k === 'string' && !/_ID$/.test(k));
  return secrets.length ? secrets[secrets.length - 1] : null;
}

/**
 * May this tool read its key from process.env?
 *
 * Local dev only, by construction. The deploy checks run BEFORE the flag is read,
 * so no amount of dashboard configuration can open this on a deployment: a shared
 * platform credential must never be reachable by one tenant's agent, least of all
 * by the third-party agent prompts users import from public GitHub repos.
 *
 * The allowlist is explicit and empty by default. A denylist would fail open for
 * every api tool added to predefinedTools.js later, auto-enabling it everywhere.
 */
export function envToolKeysAllowedFor(toolId) {
  if (process.env.VERCEL) return false;
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.VERCEL_ENV === 'production') return false;
  // Exact string: unset, 'TRUE', '1', 'yes' and typos all fail closed.
  if (process.env.ORQ_ALLOW_ENV_TOOL_KEYS !== 'true') return false;
  const allow = String(process.env.ORQ_ENV_TOOL_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(toolId);
}

/**
 * Resolve one tool's credential for one user.
 *
 * @param {object} opts
 * @param {object} opts.def    - a PREDEFINED_TOOLS definition
 * @param {string} opts.userId
 * @returns {Promise<{ source:'user'|'platform'|'alias'|'none', apiKey:string|null, ready:boolean }>}
 *   `ready` means the tool can be offered to the LLM. The field is named `apiKey`
 *   on purpose: logger.js's SENSITIVE set contains 'apikey' (it lowercases and
 *   strips -/_ before matching), so the name buys redaction for free. Do not rename it.
 */
export async function resolveToolCredential({ def, userId }) {
  // Internal tools run on server env inside tool-runner and need no per-user key.
  if (def?.connectionType === 'internal') return { source: 'none', apiKey: null, ready: true };

  // Composio auth is a per-user OAuth connection held at Composio (entityId), not
  // a key we hold. Offer these when a platform COMPOSIO_API_KEY is configured —
  // tool-runner scopes each call to entityId=userId, and a missing per-user
  // connection fails SOFT at call time (executor returns { success:false } and
  // the ReAct loop continues). Without the key, every call would throw
  // 'Missing COMPOSIO_API_KEY', so stay fenced (ready:false) and keep the tool
  // out of the LLM's hands rather than hand it a guaranteed throw.
  if (def?.connectionType === 'composio') {
    return isComposioConfigured()
      ? { source: 'composio', apiKey: null, ready: true }
      : { source: 'none', apiKey: null, ready: false };
  }

  const slot = def?.connectionType === 'webhook' ? 'webhook_secret' : 'default';
  const envVar = envToolKeysAllowedFor(def.id) ? credentialEnvVar(def) : undefined;
  // When the gate is shut we pass envVar: undefined, which makes the env branch in
  // resolve-user-key.js structurally unreachable — process.env is out of reach by
  // construction rather than by a boolean a caller could get wrong.
  const resolved = await resolveUserKey({
    userId,
    provider: `tool:${def.id}`, // matches tool-setup.js:201 / execute-tool.js:89
    slot,
    envVar,
    reason: `agent.tool:${def.id}`,
  });

  // The user has a vault key we could not decrypt. Do NOT fall through to a
  // platform key — that would silently swap in a different
  // identity than the one they configured. Fail closed and let the tool be absent.
  if (resolved.vaultError) return { source: 'none', apiKey: null, ready: false };

  if (resolved.key) return { source: resolved.source, apiKey: resolved.key, ready: true };

  // No `tool:<id>` key. Fall back to the same service's existing catalog provider:
  // a user who pasted their Tavily key at Settings -> Search -> Tavily stored it as
  // `search:tavily`, and that IS the key this tool needs. Read-only — we never write
  // to the alias, and `tool:<id>` above always wins.
  const aliasProvider = slot === 'default' ? TOOL_PROVIDER_ALIAS[def.id] : null;
  if (aliasProvider) {
    const viaAlias = await resolveUserKey({
      userId,
      provider: aliasProvider,
      // Distinct reason so SECURITY_KEY_USED stays attributable: without it an
      // agent's use of the GitHub key looks identical to the KB importer's.
      reason: `agent.tool:${def.id}.alias`,
    });
    if (viaAlias.vaultError) return { source: 'none', apiKey: null, ready: false };
    if (viaAlias.key) return { source: 'alias', apiKey: viaAlias.key, ready: true };
  }

  // Never read row.data credential fields. Migration 194 rejects new plaintext
  // writes, and legacy rows must be re-entered through encrypted setup.
  return { source: 'none', apiKey: null, ready: false };
}
