/**
 * ReAct tool runner for agent tasks.
 *
 * Implements a Reason-Act loop where the LLM can call tools (GitHub, Vercel,
 * etc.) and receive results before producing a final answer.
 *
 * Max 3 iterations to stay within Vercel's 10s function timeout.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { executeLlmV2 } from '../concilium-handlers/llm-executor-v2.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  generateEmbedding,
  hashEmbedding,
  estimateTokens,
  EMBEDDING_DIM,
} from '../_shared/embeddings.js';
import { executeComposioAction } from '../composio/executor.js';
import { scoreHtml, buildRejectionMessage } from './html-critic.js';
import { executeLandingPagePublish } from './landing-pages-tool.js';
import { executeVisionQa } from './vision-qa-tool.js';
import { assertCurrentJobLeaseLive, isJobLeaseLostError } from './job-lease-runtime.js';

const log = createLogger('tool-runner');
// ReAct loop: up to 3 iterations. Each iteration = 1 LLM call +
// any number of tool calls returned in that response.
// Previously MAX_ITERATIONS=3 with 8s LLM timeout caused every
// tool-calling task to fail with "This operation was aborted" because
// gpt-4o-mini with tool schemas takes 10-15s per call. Bumped to 20s
// per LLM call (3 × 20s = 60s max, slightly over the 50s job budget,
// but the average case is ~5s/iter so the ceiling rarely trips).
const MAX_ITERATIONS = 3;
const TOOL_TIMEOUT_MS = 6000;
// Bumped 20000 -> 45000 because Claude Sonnet (and Opus via the Agent SDK)
// with a full landing-page system prompt + tool schemas routinely take
// 25-40s per call. At 20s every iteration hit AbortSignal.timeout and the
// task surfaced "This operation was aborted" — every Phase 2 Implementation
// task failed this way. 45s per call x 3 iterations = 135s LLM budget,
// plus tool calls = ~155s worst case, safely under api/agent.js's 180s
// Vercel maxDuration and the 160s job-processor EXECUTION_TIMEOUT_MS.
const REACT_LLM_TIMEOUT_MS = 45000;

function rethrowExecutionAuthorization(error) {
  if (error?.code === 'EXECUTION_AUTHORIZATION_REVOKED' || isJobLeaseLostError(error)) throw error;
}

function liveRetryGuard(beforeExternalAction, action) {
  if (typeof beforeExternalAction !== 'function') return undefined;
  return ({ attempt, url }) => beforeExternalAction({ ...action, attempt, url });
}

// ── Tool execution ────────────────────────────────────────────────

/**
 * Resolve path parameters like /repos/{owner}/{repo} using the args object.
 */
function resolvePath(pathTemplate, args) {
  return pathTemplate.replaceAll(/\{(\w+)\}/g, (_, key) => {
    const val = args[key];
    if (val === undefined) return `{${key}}`;
    delete args[key]; // consumed — don't send as body param
    return encodeURIComponent(String(val));
  });
}

/**
 * Execute a single tool call against the matching tool endpoint.
 *
 * @param {object} call - { id, name, arguments }
 * @param {Array} tools - Tool records with an in-memory Vault-resolved apiKey
 * @param {Array} toolDefs - Predefined tool definitions with endpoints
 * @param {string} [entityId] - User ID for Composio entity scoping
 * @returns {{ success: boolean, result: any, error?: string, durationMs: number }}
 */
async function executeToolCall(call, tools, toolDefs, entityId, beforeExternalAction) {
  const start = Date.now();

  // Tool function names are formatted as "{toolId}_{endpointName}" e.g. "tool_github__create_repo"
  // We use double underscore to separate tool ID from endpoint name
  const separatorIdx = call.name.indexOf('__');
  if (separatorIdx < 0) {
    return {
      success: false,
      result: null,
      error: `Invalid tool call name: ${call.name}`,
      durationMs: 0,
    };
  }

  const toolId = call.name.slice(0, separatorIdx).replaceAll('_', '-');
  const endpointName = call.name.slice(separatorIdx + 2);

  // Find the tool definition (has endpoints, baseUrl)
  const toolDef = toolDefs.find((t) => t.id === toolId);
  if (!toolDef) {
    return {
      success: false,
      result: null,
      error: `Unknown tool: ${toolId}`,
      durationMs: Date.now() - start,
    };
  }

  // Composio (MCP) tools — route to Composio executor
  if (toolDef.connectionType === 'composio') {
    const actionName = endpointName; // e.g. GITHUB_CREATE_ISSUE
    if (!Array.isArray(toolDef.actions) || !toolDef.actions.includes(actionName)) {
      return {
        success: false,
        result: null,
        error: `Action not authorized for ${toolId}: ${actionName}`,
        durationMs: Date.now() - start,
      };
    }
    const args = call.arguments?.input || call.arguments || {};
    return executeComposioAction(actionName, args, entityId);
  }

  // Find the endpoint definition
  const endpoint = toolDef.endpoints?.find((e) => e.name === endpointName);
  if (!endpoint) {
    return {
      success: false,
      result: null,
      error: `Unknown endpoint: ${endpointName} on ${toolId}`,
      durationMs: Date.now() - start,
    };
  }

  // execute-task resolves this from Vault and injects it only into the
  // in-memory execution record. Never read a persisted data.apiKey fallback.
  const toolRecord = tools.find((t) => t.id === toolId);
  const apiKey = toolRecord?.apiKey || '';

  if (toolDef.connectionType === 'api' && !apiKey) {
    return {
      success: false,
      result: null,
      error: `No API key configured for ${toolDef.name}`,
      durationMs: Date.now() - start,
    };
  }

  // Internal tools (doc-generator, http-client) are handled in-process
  if (toolDef.connectionType === 'internal') {
    return handleInternalTool(
      toolId,
      endpointName,
      call.arguments,
      start,
      entityId,
      beforeExternalAction
    );
  }

  // Build the HTTP request
  const callArgs = call.arguments || {};
  const args = { ...callArgs };
  const path = resolvePath(endpoint.path, args);
  const url = `${toolDef.baseUrl}${path}`;
  const method = (endpoint.method || 'GET').toUpperCase();
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  // Endpoint-specific preprocessing
  // GitHub put_file requires content to be base64-encoded
  if (toolId === 'tool-github' && endpointName === 'put_file' && typeof args.content === 'string') {
    args.content = Buffer.from(args.content, 'utf-8').toString('base64');
  }
  // GitHub enable_pages accepts a default source if the agent doesn't provide one
  if (toolId === 'tool-github' && endpointName === 'enable_pages' && !args.source) {
    args.source = { branch: 'main', path: '/' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  // GitHub API requires a User-Agent header
  if (toolId === 'tool-github') headers['User-Agent'] = 'Orqaly-Agent';
  // GitHub Pages endpoints require an explicit API version header
  if (
    toolId === 'tool-github' &&
    (endpointName === 'enable_pages' ||
      endpointName === 'get_pages_info' ||
      endpointName === 'trigger_pages_build')
  ) {
    headers['Accept'] = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }
  // Pexels uses raw API key in Authorization header (not Bearer)
  if (toolId === 'tool-pexels' && apiKey) {
    headers['Authorization'] = apiKey;
  }
  // Unsplash uses Client-ID format
  if (toolId === 'tool-unsplash' && apiKey) {
    headers['Authorization'] = `Client-ID ${apiKey}`;
  }
  // Figma uses X-Figma-Token header instead of Authorization
  if (toolId === 'tool-figma' && apiKey) {
    headers['X-Figma-Token'] = apiKey;
    delete headers['Authorization'];
  }

  // Some tools (Vercel deployments, GitHub PRs, large operations) need more time than the default 6s
  const SLOW_TOOLS = new Set(['tool-vercel', 'tool-github', 'tool-figma']);
  const timeoutMs = SLOW_TOOLS.has(toolId) ? 25000 : TOOL_TIMEOUT_MS;

  try {
    const res = await fetchWithRetry(
      url,
      {
        method,
        headers,
        body: hasBody ? JSON.stringify(args) : undefined,
      },
      {
        timeoutMs,
        retries: 0,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'tool_http_request',
          toolId,
          endpointName,
        }),
      }
    );

    const bodyText = await res.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }

    // Trim large responses to avoid bloating the LLM context
    const trimmed =
      typeof body === 'string' ? body.slice(0, 3000) : JSON.stringify(body).slice(0, 3000);

    return {
      success: res.ok,
      result: res.ok ? trimmed : `HTTP ${res.status}: ${trimmed}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return { success: false, result: null, error: err.message, durationMs: Date.now() - start };
  }
}

/**
 * Handle internal tools that don't make external HTTP calls.
 * entityId is the agent's user_id, threaded through for tools that need to
 * write user-scoped rows (e.g. tool-landing-pages).
 */
async function handleInternalTool(
  toolId,
  endpointName,
  args,
  start,
  entityId,
  beforeExternalAction
) {
  if (toolId === 'tool-doc-generator') {
    // Document generator — the LLM itself generates the content
    return {
      success: true,
      result: JSON.stringify({
        generated: true,
        type: args?.format || 'document',
        title: args?.title || 'Untitled',
        note: 'Document content was generated by the agent. Use the content from your analysis.',
      }),
      durationMs: Date.now() - start,
    };
  }

  if (toolId === 'tool-http-client') {
    // HTTP client — pass through to fetchWithRetry
    return executeHttpClientTool(args, start, beforeExternalAction);
  }

  if (toolId === 'tool-cloudflare-pages') {
    // Critic gate: validate HTML quality before deploying
    if (endpointName === 'deploy_site' && args?.html) {
      const critique = scoreHtml(args.html);
      if (!critique.passed) {
        log.warn(null, 'critic.rejected', { score: critique.score, failures: critique.failures });
        return {
          success: false,
          result: buildRejectionMessage(critique),
          durationMs: Date.now() - start,
        };
      }
      log.info(null, 'critic.passed', { score: critique.score });
    }
    return executeCloudflareDeploy(endpointName, args, start, beforeExternalAction);
  }

  if (toolId === 'tool-landing-pages') {
    // Full landing-page publish: critic + Cloudflare deploy + landing_pages
    // row insert. Needs the agent's user_id to scope the DB row — threaded
    // through entityId. Without a user_id we can't persist, so fail loud.
    if (!entityId) {
      return {
        success: false,
        result: null,
        error: 'tool-landing-pages requires userId (entityId) — not provided by executor',
        durationMs: Date.now() - start,
      };
    }
    return executeLandingPagePublish({
      endpointName,
      args,
      userId: entityId,
      cloudflareDeployFn: executeCloudflareDeploy,
      start,
      beforeExternalAction,
    });
  }

  if (toolId === 'tool-pdf-generator') {
    return executePdfGenerator(endpointName, args, start);
  }

  if (toolId === 'tool-vision-qa') {
    return executeVisionQa({ endpointName, args, start });
  }

  if (toolId === 'tool-stability-ai') {
    return executeStabilityAi(endpointName, args, start, beforeExternalAction);
  }

  if (toolId === 'tool-color-palette') {
    return executeColorPalette(endpointName, args, start);
  }

  if (toolId === 'tool-nda-generator') {
    return executeNdaGenerator(endpointName, args, start);
  }

  if (toolId === 'tool-temp-email') {
    return executeTempEmailTool(endpointName, args, start);
  }

  if (toolId === 'tool-brandfetch') {
    return executeBrandfetch(endpointName, args, start, beforeExternalAction);
  }

  if (toolId === 'tool-bookmarks') {
    return executeBookmarksTool(endpointName, args, start, entityId);
  }

  // Browser and CAPTCHA tools are too slow for inline ReAct (15-30s+).
  // They must be executed via browser-task job (ops.js, 60s timeout).
  if (toolId === 'tool-browser' || toolId === 'tool-captcha-solver') {
    return {
      success: true,
      result: JSON.stringify({
        message:
          'Browser/CAPTCHA operations require a long-running job. Enqueue a browser-task job via /api/agent/enqueue with type "browser-task", providerUrl, and targetToolId.',
        action: 'enqueue-browser-task',
      }),
      durationMs: Date.now() - start,
    };
  }

  return {
    success: false,
    result: null,
    error: `Unknown internal tool: ${toolId}`,
    durationMs: Date.now() - start,
  };
}

/**
 * Bookmarks tool — lets an agent save and reuse categorized links.
 * Bookmarks are stored in the Knowledge Base (knowledge_documents) as link
 * docs under category 'bookmark', so they show up in the KB Bookmarks tab and
 * are retrievable by KB semantic search. `collection` is a tag used to group
 * links for later reuse. Scoped to the agent's user via entityId.
 */
export async function executeBookmarksTool(endpointName, args, start, entityId) {
  const done = (patch) => ({ durationMs: Date.now() - start, ...patch });
  if (!entityId) {
    return done({
      success: false,
      result: null,
      error: 'tool-bookmarks requires userId (entityId) — not provided by executor',
    });
  }
  const admin = buildSupabaseAdminClient();
  if (!admin) return done({ success: false, result: null, error: 'Database not configured' });

  if (endpointName === 'save_bookmark') {
    const url = (args?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return done({ success: false, result: null, error: 'A valid http(s) url is required' });
    }
    const collection = (args?.collection || '').trim();
    const note = (args?.note || '').trim();
    const title = (args?.title || '').trim() || url;
    const tags = collection ? ['bookmark', collection] : ['bookmark'];
    const embedding = note
      ? await generateEmbedding(note)
      : hashEmbedding(title || url, EMBEDDING_DIM);
    const row = {
      user_id: entityId,
      title,
      content: note,
      source: 'agent-bookmark',
      category: 'bookmark',
      owner_type: 'agent',
      owner_id: null,
      content_type: 'link',
      url,
      tags,
      token_count: estimateTokens(note),
      embedding: `[${embedding.join(',')}]`,
    };
    const { data, error } = await admin
      .from('knowledge_documents')
      .insert(row)
      .select('id, title, url, tags')
      .single();
    if (error) return done({ success: false, result: null, error: error.message });
    return done({ success: true, result: JSON.stringify({ saved: true, ...data }) });
  }

  if (endpointName === 'list_bookmarks') {
    const collection = (args?.collection || '').trim();
    const query = (args?.query || '').trim();
    const limit = Math.min(parseInt(args?.limit, 10) || 20, 50);
    let q = admin
      .from('knowledge_documents')
      .select('id, title, url, tags, created_at')
      .eq('user_id', entityId)
      .eq('category', 'bookmark')
      .eq('content_type', 'link')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (collection) q = q.contains('tags', [collection]);
    if (query) q = q.ilike('title', `%${query}%`);
    const { data, error } = await q;
    if (error) return done({ success: false, result: null, error: error.message });
    return done({ success: true, result: JSON.stringify({ bookmarks: data || [] }) });
  }

  return done({
    success: false,
    result: null,
    error: `Unknown endpoint: ${endpointName} on tool-bookmarks`,
  });
}

async function executeHttpClientTool(args, start, beforeExternalAction) {
  const { url, method = 'GET', headers = {}, body } = args || {};
  if (!url) return { success: false, result: null, error: 'Missing url parameter', durationMs: 0 };

  try {
    const res = await fetchWithRetry(
      url,
      {
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json', ...headers },
        body: ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())
          ? JSON.stringify(body || {})
          : undefined,
      },
      {
        timeoutMs: TOOL_TIMEOUT_MS,
        retries: 0,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'http_client_request',
        }),
      }
    );
    const text = await res.text();
    return { success: res.ok, result: text.slice(0, 3000), durationMs: Date.now() - start };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return { success: false, result: null, error: err.message, durationMs: Date.now() - start };
  }
}

// Brandfetch returns canonical brand identity (logo, colors, fonts) for a
// domain. Used by Browser Automation Lead during phase-0 Brand & Site
// Research to seed Designer/Frontend tasks with REAL brand data instead
// of LLM-hallucinated hex codes (see goal f505dbeb post-mortem).
export async function executeBrandfetch(endpointName, args, start, beforeExternalAction) {
  if (endpointName !== 'lookup_brand') {
    return {
      success: false,
      result: null,
      error: `Unknown Brandfetch endpoint: ${endpointName}`,
      durationMs: Date.now() - start,
    };
  }
  const apiKey = process.env.BRANDFETCH_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      result: null,
      error: 'BRANDFETCH_API_KEY not set in server env',
      durationMs: Date.now() - start,
    };
  }
  const { domain } = args || {};
  if (!domain) {
    return {
      success: false,
      result: null,
      error: 'Missing domain parameter (e.g. { domain: "stripe.com" })',
      durationMs: Date.now() - start,
    };
  }
  try {
    const res = await fetchWithRetry(
      `https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      {
        timeoutMs: TOOL_TIMEOUT_MS,
        retries: 1,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'brandfetch_request',
        }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text();
      return {
        success: false,
        result: null,
        error: `Brandfetch HTTP ${res.status}: ${errBody.slice(0, 200)}`,
        durationMs: Date.now() - start,
      };
    }
    const json = await res.json();
    const projected = {
      name: json.name,
      domain: json.domain,
      description: json.description,
      logos: (json.logos || []).slice(0, 3).map((l) => ({
        type: l.type,
        src: l.formats?.[0]?.src,
        format: l.formats?.[0]?.format,
      })),
      colors: (json.colors || []).map((c) => ({
        hex: c.hex,
        type: c.type,
        brightness: c.brightness,
      })),
      fonts: (json.fonts || []).map((f) => ({ name: f.name, type: f.type, origin: f.origin })),
    };
    return {
      success: true,
      result: JSON.stringify(projected).slice(0, 3000),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return {
      success: false,
      result: null,
      error: `Brandfetch fetch failed: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Deploy a static HTML site to Cloudflare's edge network.
 *
 * Uses the Cloudflare Workers API (3 JSON calls) rather than Pages Direct Upload
 * (5-step hash-based multipart flow) because Workers are simpler, more reliable,
 * and produce a URL on the same edge CDN. The resulting URL format is:
 *   https://{projectName}.{accountSubdomain}.workers.dev
 *
 * Requires server env:
 *   CLOUDFLARE_API_TOKEN  — API token with "Account → Workers Scripts → Edit"
 *   CLOUDFLARE_ACCOUNT_ID — the 32-char hex account ID
 */
export async function executeCloudflareDeploy(endpointName, args, start, beforeExternalAction) {
  if (endpointName !== 'deploy_site') {
    return {
      success: false,
      result: null,
      error: `Unknown Cloudflare endpoint: ${endpointName}`,
      durationMs: Date.now() - start,
    };
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    const missing = [];
    if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
    if (!apiToken) missing.push('CLOUDFLARE_API_TOKEN');
    return {
      success: false,
      result: null,
      error: `Cannot deploy landing page: server env var${missing.length > 1 ? 's' : ''} ${missing.join(' and ')} not set. Admin must add ${missing.length > 1 ? 'them' : 'it'} in Vercel → Project Settings → Environment Variables, then redeploy.`,
      durationMs: Date.now() - start,
    };
  }

  const { projectName, html } = args || {};
  if (!projectName || !html) {
    return {
      success: false,
      result: null,
      error: 'Missing required parameter: projectName and html are both required',
      durationMs: Date.now() - start,
    };
  }

  // Normalize: lowercase, alphanumeric + hyphens, collapsed, trimmed, max 58 chars.
  // Cloudflare worker names must match /^[a-z0-9][a-z0-9-]*$/ and be ≤ 63 chars.
  //
  // CRITICAL: append a short timestamp suffix UNLESS the caller passed
  // skipUniqueSuffix: true. Without this, every goal that asks for a
  // 'rustic-roots-landing' (or whatever) deploys to the same Cloudflare
  // Workers slug and silently overwrites the previous goal's live site.
  // The 8-char base36 timestamp keeps URLs unique per call AND human-
  // readable. Calibration callers can opt out by passing skipUniqueSuffix
  // when they want stable URLs across iterations of the same step.
  const baseName =
    String(projectName)
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 49) || `site-${Date.now().toString(36)}`;
  const uniqueSuffix = args?.skipUniqueSuffix ? '' : `-${Date.now().toString(36)}`;
  const scriptName = `${baseName}${uniqueSuffix}`.slice(0, 58);

  // Escape HTML for embedding as a JS string literal inside the worker script.
  // Using JSON.stringify gives proper escaping for quotes, backslashes, newlines.
  const htmlLiteral = JSON.stringify(html);

  // Service-worker format is the simplest Workers upload path — single JS file,
  // plain Content-Type: application/javascript, no multipart, no bindings.
  const workerScript = `addEventListener('fetch', (event) => {
  event.respondWith(new Response(${htmlLiteral}, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'public, max-age=300',
    },
  }));
});`;

  const authHeaders = { Authorization: `Bearer ${apiToken}` };

  try {
    // Step 1 — upload the worker script
    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;
    const uploadRes = await fetchWithRetry(
      uploadUrl,
      {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/javascript' },
        body: workerScript,
      },
      {
        timeoutMs: 25000,
        retries: 0,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'cloudflare_script_upload',
        }),
      }
    );
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return {
        success: false,
        result: null,
        error: `Cloudflare script upload failed: HTTP ${uploadRes.status}: ${text.slice(0, 500)}`,
        durationMs: Date.now() - start,
      };
    }

    // Step 2 — enable the workers.dev subdomain so the script is publicly routable
    const subdomainRes = await fetchWithRetry(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      },
      {
        timeoutMs: 10000,
        retries: 0,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'cloudflare_subdomain_enable',
        }),
      }
    );
    if (!subdomainRes.ok) {
      const text = await subdomainRes.text();
      return {
        success: false,
        result: null,
        error: `Cloudflare enable subdomain failed: HTTP ${subdomainRes.status}: ${text.slice(0, 500)}`,
        durationMs: Date.now() - start,
      };
    }

    // Step 3 — fetch the account's workers.dev subdomain (e.g. "myuser")
    //          so we can construct the public URL. This is a one-time-per-account
    //          value, but caching it adds complexity for little gain at this scale.
    const accountSubRes = await fetchWithRetry(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      { method: 'GET', headers: authHeaders },
      {
        timeoutMs: 10000,
        retries: 0,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'cloudflare_subdomain_read',
        }),
      }
    );
    if (!accountSubRes.ok) {
      const text = await accountSubRes.text();
      return {
        success: false,
        result: null,
        error: `Cloudflare get subdomain failed: HTTP ${accountSubRes.status}: ${text.slice(0, 500)}`,
        durationMs: Date.now() - start,
      };
    }
    const accountSubData = await accountSubRes.json();
    const subdomain = accountSubData?.result?.subdomain;
    if (!subdomain) {
      return {
        success: false,
        result: null,
        error:
          'Cloudflare account has no workers.dev subdomain configured — enable it once at dash.cloudflare.com → Workers & Pages → Subdomain',
        durationMs: Date.now() - start,
      };
    }

    const deploymentUrl = `https://${scriptName}.${subdomain}.workers.dev`;
    return {
      success: true,
      result: JSON.stringify({
        deployed: true,
        projectName: scriptName,
        deploymentUrl,
        message: `Deployed to ${deploymentUrl}`,
      }),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return {
      success: false,
      result: null,
      error: `Cloudflare deploy error: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Generate a PDF deck from structured slide input and upload to Supabase Storage.
 *
 * Flow:
 *   1. Build a landscape-oriented PDF with jspdf — one page per slide, with
 *      title + bullets + optional body text.
 *   2. Upload to the "goal-deliverables" public Supabase Storage bucket.
 *   3. Return the public URL. Bucket is created on first use if missing.
 *
 * Requires server env: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 */
export async function executePdfGenerator(endpointName, args, start) {
  if (endpointName !== 'create_slides') {
    return {
      success: false,
      result: null,
      error: `Unknown PDF endpoint: ${endpointName}`,
      durationMs: Date.now() - start,
    };
  }

  const { projectName, title, subtitle, slides, comment, preferredTool } = args || {};
  if (!projectName || !title || !Array.isArray(slides) || slides.length === 0) {
    return {
      success: false,
      result: null,
      error: 'Missing required parameter: projectName, title, and slides[] are all required',
      durationMs: Date.now() - start,
    };
  }

  // ── NEW: route through deck-renderer (HTML + browserless) by default ──
  // Three modes via env var DECK_RENDERER:
  //   'auto' (default) — try HTML, fall back to jsPDF on any failure
  //   'html'           — HTML only, fail loud if browserless is down
  //   'jspdf'          — legacy path only (rollback escape hatch)
  // If preferredTool is explicitly 'jspdf', honor that. Anything else
  // (including the default html-browserless tool id) routes through HTML.
  const rendererMode = process.env.DECK_RENDERER || 'auto';
  const wantsJspdf = preferredTool === 'jspdf' || rendererMode === 'jspdf';

  if (!wantsJspdf) {
    try {
      const { renderDeckViaHtml } = await import('../_shared/deck-renderer.js');
      const result = await renderDeckViaHtml({ projectName, title, subtitle, slides, comment });
      return {
        success: true,
        result: JSON.stringify({
          generated: true,
          projectName,
          slideCount: result.slideCount,
          // The renderer now produces an HTML file, not a PDF. Surface BOTH
          // pdfUrl (for callers that still expect that field) and htmlUrl
          // pointing at the same .html file. The wizard checks `kind` to
          // pick the right renderer.
          pdfUrl: result.htmlUrl,
          htmlUrl: result.htmlUrl,
          sizeBytes: result.sizeBytes,
          renderer: 'html-llm',
          kind: 'html',
          message: `Deck rendered as HTML: ${result.htmlUrl}`,
        }),
        durationMs: Date.now() - start,
      };
    } catch (htmlErr) {
      rethrowExecutionAuthorization(htmlErr);
      log.warn(null, 'pdf-generator.html-render.failed', { error: htmlErr.message });
      // In 'html' mode (no fallback) propagate the error so the caller knows
      if (rendererMode === 'html') {
        return {
          success: false,
          result: null,
          error: `HTML deck render failed (no fallback in DECK_RENDERER=html mode): ${htmlErr.message}`,
          durationMs: Date.now() - start,
        };
      }
      // In 'auto' mode fall through to the legacy jsPDF path
    }
  }

  try {
    // Dynamic imports keep cold starts fast for tasks that don't need PDF gen
    const { jsPDF } = await import('jspdf');
    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');

    const admin = buildSupabaseAdminClient();
    const BUCKET = 'goal-deliverables';

    // Ensure the bucket exists (public). Idempotent — getBucket fails silently
    // if missing, then we create; if it already exists the create will error
    // with "already exists" which we treat as success.
    try {
      const { data: existing } = await admin.storage.getBucket(BUCKET);
      if (!existing) {
        const { error: createErr } = await admin.storage.createBucket(BUCKET, { public: true });
        if (createErr && !String(createErr.message || '').includes('already exists')) {
          throw new Error(`Create bucket failed: ${createErr.message}`);
        }
      }
    } catch (bucketErr) {
      rethrowExecutionAuthorization(bucketErr);
      // Non-fatal — try the upload anyway, bucket may already exist
      log.warn(null, 'pdf-generator.ensure-bucket.warn', { error: bucketErr.message });
    }

    // ── Build the PDF ─────────────────────────────────────────────
    // Landscape A4, millimeter units. ~297 x 210mm.
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setProperties({ title, subject: subtitle || title, creator: 'Orqaly' });

    const PAGE_W = 297;
    const PAGE_H = 210;
    const MARGIN = 18;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    // Cover slide
    doc.setFillColor(248, 240, 228);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    doc.setTextColor(44, 24, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    const titleLines = doc.splitTextToSize(title, CONTENT_W);
    doc.text(titleLines, PAGE_W / 2, PAGE_H / 2 - 10, { align: 'center' });
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(16);
      doc.setTextColor(107, 85, 68);
      const subLines = doc.splitTextToSize(subtitle, CONTENT_W - 20);
      doc.text(subLines, PAGE_W / 2, PAGE_H / 2 + 10, { align: 'center' });
    }
    doc.setFontSize(10);
    doc.setTextColor(140, 110, 90);
    doc.text(new Date().getFullYear().toString(), PAGE_W / 2, PAGE_H - 12, { align: 'center' });

    // Content slides
    for (const slide of slides) {
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

      // Title bar
      doc.setFillColor(139, 69, 19);
      doc.rect(0, 0, PAGE_W, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      const slideTitle = String(slide.title || 'Slide');
      doc.text(doc.splitTextToSize(slideTitle, CONTENT_W), MARGIN, 15);

      // Body content
      doc.setTextColor(44, 24, 16);
      doc.setFont('helvetica', 'normal');
      let y = 40;

      if (slide.body) {
        doc.setFontSize(13);
        const bodyLines = doc.splitTextToSize(String(slide.body), CONTENT_W);
        doc.text(bodyLines, MARGIN, y);
        y += bodyLines.length * 6 + 6;
      }

      if (Array.isArray(slide.bullets) && slide.bullets.length > 0) {
        doc.setFontSize(14);
        for (const bullet of slide.bullets) {
          const bulletLines = doc.splitTextToSize(`• ${String(bullet)}`, CONTENT_W - 6);
          if (y + bulletLines.length * 7 > PAGE_H - MARGIN) break; // out of space
          doc.text(bulletLines, MARGIN + 4, y);
          y += bulletLines.length * 7 + 2;
        }
      }

      if (slide.note) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(120, 100, 85);
        const noteLines = doc.splitTextToSize(String(slide.note), CONTENT_W);
        doc.text(noteLines, MARGIN, PAGE_H - 14);
      }

      // Footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(160, 140, 120);
      const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
      doc.text(`${pageNum} / ${slides.length + 1}`, PAGE_W - MARGIN, PAGE_H - 8, {
        align: 'right',
      });
    }

    // ── Upload to Supabase Storage ───────────────────────────────
    const pdfBytes = doc.output('arraybuffer');
    const buffer = Buffer.from(pdfBytes);

    const safeName =
      String(projectName)
        .toLowerCase()
        .replaceAll(/[^a-z0-9-]/g, '-')
        .replaceAll(/-+/g, '-')
        .replaceAll(/^-+|-+$/g, '')
        .slice(0, 80) || `deck-${Date.now().toString(36)}`;
    const path = `pdf/${safeName}-${Date.now().toString(36)}.pdf`;

    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadErr) {
      return {
        success: false,
        result: null,
        error: `PDF upload failed: ${uploadErr.message}`,
        durationMs: Date.now() - start,
      };
    }

    // Get public URL
    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData?.publicUrl || '';

    return {
      success: true,
      result: JSON.stringify({
        generated: true,
        projectName: safeName,
        slideCount: slides.length + 1, // +1 for cover
        pdfUrl: publicUrl,
        sizeBytes: buffer.length,
        message: `PDF generated: ${publicUrl}`,
      }),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return {
      success: false,
      result: null,
      error: `PDF generator error: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Generate an image via Stability AI SDXL and upload to Supabase Storage.
 * Returns the public URL.
 *
 * Uses the v1 SDXL endpoint (JSON body + base64 response) which is simpler
 * than v2beta core (multipart form). Supported dimensions per SDXL docs:
 *   1024x1024, 1152x896, 1216x832, 1344x768, 1536x640,
 *   640x1536, 768x1344, 832x1216, 896x1152
 *
 * We map a friendly aspectRatio to the nearest supported size:
 *   square    → 1024x1024 (Instagram post)
 *   landscape → 1344x768  (~16:9.1, LinkedIn/Twitter post)
 *   wide      → 1536x640  (~21:9, hero banners)
 *   portrait  → 768x1344  (Instagram story)
 *
 * Requires STABILITY_API_KEY in server env. Per-call cost ~$0.03 for SDXL.
 */
/**
 * NDA generator — wraps lib/_shared/nda-renderer.js for the tool dispatcher.
 * Returns the standard tool-runner envelope. The renderer uses Vercel AI
 * Gateway → Claude Sonnet to write a structured legal-document HTML and
 * uploads it to Supabase Storage. The returned URL is the /api/render-deck
 * proxy URL (NOT the raw Storage URL — that would be served as text/plain).
 */
async function executeNdaGenerator(endpointName, args, start) {
  if (endpointName !== 'generate_nda') {
    return {
      success: false,
      result: null,
      error: `Unknown NDA endpoint: ${endpointName}`,
      durationMs: Date.now() - start,
    };
  }
  const { projectName, partyA, partyB, purpose, jurisdiction, termYears, additionalTerms } =
    args || {};
  if (!projectName || !partyA || !partyB) {
    return {
      success: false,
      result: null,
      error: 'Missing required parameter: projectName, partyA, and partyB are all required',
      durationMs: Date.now() - start,
    };
  }
  try {
    const { renderNdaViaHtml } = await import('../_shared/nda-renderer.js');
    const result = await renderNdaViaHtml({
      projectName,
      partyA,
      partyB,
      purpose,
      jurisdiction,
      termYears,
      additionalTerms,
    });
    return {
      success: true,
      result: JSON.stringify({
        generated: true,
        projectName,
        htmlUrl: result.htmlUrl,
        pdfUrl: result.htmlUrl, // alias so callers expecting a 'pdfUrl' field still work
        sizeBytes: result.sizeBytes,
        renderer: 'nda-html-llm',
        kind: 'html',
        documentType: 'nda',
        message: `NDA rendered: ${result.htmlUrl}`,
      }),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return {
      success: false,
      result: null,
      error: `NDA generation failed: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Tier-0 free image generator: Together AI FLUX.1 [schnell]-Free.
 * Returns a tool-runner-shaped success envelope on success, OR null on
 * any failure (caller should fall through to the next tier).
 *
 * Activation: set TOGETHER_API_KEY in Vercel env vars. Free for 3 months
 * unlimited per account. Docs: https://docs.together.ai/docs/quickstart
 */
async function tryTogetherFluxFree({
  projectName,
  prompt,
  width,
  height,
  start,
  beforeExternalAction,
}) {
  if (!process.env.TOGETHER_API_KEY) return null;
  try {
    const res = await fetchWithRetry(
      'https://api.together.xyz/v1/images/generations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'black-forest-labs/FLUX.1-schnell-Free',
          prompt: String(prompt).slice(0, 2000),
          width,
          height,
          steps: 4,
          n: 1,
          response_format: 'b64_json',
        }),
      },
      {
        timeoutMs: 60000,
        retries: 0,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'together_image_generation',
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      log.warn(null, 'image-gen.together.http-error', {
        status: res.status,
        body: errText.slice(0, 200),
      });
      return null;
    }
    const body = await res.json();
    const b64 = body?.data?.[0]?.b64_json;
    if (!b64) return null;

    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
    const admin = buildSupabaseAdminClient();
    const BUCKET = 'goal-deliverables';
    try {
      const { data: existing } = await admin.storage.getBucket(BUCKET);
      if (!existing) await admin.storage.createBucket(BUCKET, { public: true });
    } catch {
      /* non-fatal */
    }

    const safeName =
      String(projectName)
        .toLowerCase()
        .replaceAll(/[^a-z0-9-]/g, '-')
        .replaceAll(/-+/g, '-')
        .replaceAll(/^-+|-+$/g, '')
        .slice(0, 80) || `img-${Date.now().toString(36)}`;
    const path = `images/${safeName}-flux-${Date.now().toString(36)}.png`;
    const buffer = Buffer.from(b64, 'base64');
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'image/png',
      upsert: false,
    });
    if (uploadErr) {
      log.warn(null, 'image-gen.together.upload-failed', { error: uploadErr.message });
      return null;
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const imageUrl = urlData?.publicUrl || '';
    log.info(null, 'image-gen.together.success', {
      projectName: safeName,
      sizeBytes: buffer.length,
    });
    return {
      success: true,
      result: JSON.stringify({
        generated: true,
        projectName: safeName,
        imageUrl,
        width,
        height,
        sizeBytes: buffer.length,
        renderer: 'together-flux-schnell-free',
        message: `Image generated via Together AI FLUX.1 [schnell]: ${imageUrl}`,
      }),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    log.warn(null, 'image-gen.together.exception', { error: err.message });
    return null;
  }
}

export async function executeStabilityAi(endpointName, args, start, beforeExternalAction) {
  if (endpointName !== 'generate_image') {
    return {
      success: false,
      result: null,
      error: `Unknown Stability endpoint: ${endpointName}`,
      durationMs: Date.now() - start,
    };
  }

  const { projectName, prompt, aspectRatio = 'square' } = args || {};
  if (!projectName || !prompt) {
    return {
      success: false,
      result: null,
      error: 'Missing required parameter: projectName and prompt are both required',
      durationMs: Date.now() - start,
    };
  }

  // Map friendly names to SDXL's supported dimensions
  const ASPECT_MAP = {
    square: { width: 1024, height: 1024 },
    landscape: { width: 1344, height: 768 },
    wide: { width: 1536, height: 640 },
    portrait: { width: 768, height: 1344 },
  };
  const { width, height } = ASPECT_MAP[aspectRatio] || ASPECT_MAP.square;

  // ── Tier 0: Together AI FLUX.1 [schnell]-Free ──
  // Tries first when TOGETHER_API_KEY is set. Falls through to Stability
  // on any failure (key missing, HTTP error, upload fail).
  const togetherResult = await tryTogetherFluxFree({
    projectName,
    prompt,
    width,
    height,
    start,
    beforeExternalAction,
  });
  if (togetherResult) return togetherResult;

  // ── Tier 1: Stability AI SDXL ──
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      result: null,
      error:
        'Missing STABILITY_API_KEY in server env (and TOGETHER_API_KEY also missing or failed)',
      durationMs: Date.now() - start,
    };
  }

  try {
    const stabilityRes = await fetchWithRetry(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text_prompts: [{ text: String(prompt).slice(0, 2000), weight: 1 }],
          cfg_scale: 7,
          width,
          height,
          samples: 1,
          steps: 30,
        }),
      },
      {
        timeoutMs: 60000,
        retries: 0,
        beforeAttempt: liveRetryGuard(beforeExternalAction, {
          kind: 'tool',
          phase: 'stability_image_generation',
        }),
      }
    );

    if (!stabilityRes.ok) {
      const text = await stabilityRes.text();
      return {
        success: false,
        result: null,
        error: `Stability API failed: HTTP ${stabilityRes.status}: ${text.slice(0, 500)}`,
        durationMs: Date.now() - start,
      };
    }

    const body = await stabilityRes.json();
    const artifact = body?.artifacts?.[0];
    if (!artifact?.base64) {
      return {
        success: false,
        result: null,
        error: 'Stability API returned no image artifact',
        durationMs: Date.now() - start,
      };
    }

    // Upload to Supabase Storage
    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
    const admin = buildSupabaseAdminClient();
    const BUCKET = 'goal-deliverables';

    try {
      const { data: existing } = await admin.storage.getBucket(BUCKET);
      if (!existing) {
        const { error: createErr } = await admin.storage.createBucket(BUCKET, { public: true });
        if (createErr && !String(createErr.message || '').includes('already exists')) {
          throw new Error(`Create bucket failed: ${createErr.message}`);
        }
      }
    } catch (bucketErr) {
      rethrowExecutionAuthorization(bucketErr);
      log.warn(null, 'stability-ai.ensure-bucket.warn', { error: bucketErr.message });
    }

    const safeName =
      String(projectName)
        .toLowerCase()
        .replaceAll(/[^a-z0-9-]/g, '-')
        .replaceAll(/-+/g, '-')
        .replaceAll(/^-+|-+$/g, '')
        .slice(0, 80) || `img-${Date.now().toString(36)}`;
    const path = `images/${safeName}-${Date.now().toString(36)}.png`;

    const buffer = Buffer.from(artifact.base64, 'base64');
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'image/png',
      upsert: false,
    });
    if (uploadErr) {
      return {
        success: false,
        result: null,
        error: `Image upload failed: ${uploadErr.message}`,
        durationMs: Date.now() - start,
      };
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const imageUrl = urlData?.publicUrl || '';

    return {
      success: true,
      result: JSON.stringify({
        generated: true,
        projectName: safeName,
        imageUrl,
        width,
        height,
        sizeBytes: buffer.length,
        message: `Image generated: ${imageUrl}`,
      }),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return {
      success: false,
      result: null,
      error: `Stability AI error: ${err.message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ── Color Palette Generator (internal, no API key) ───────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1, rgb2) {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const MOOD_HUE_MAP = {
  warm: [15, 45],
  earthy: [20, 50],
  cozy: [25, 45],
  cool: [190, 230],
  tech: [200, 240],
  corporate: [210, 230],
  vibrant: [280, 340],
  playful: [300, 360],
  fun: [280, 330],
  luxury: [260, 290],
  elegant: [270, 300],
  premium: [265, 295],
  fresh: [90, 150],
  organic: [80, 140],
  natural: [85, 135],
  bold: [0, 20],
  startup: [200, 260],
  energy: [350, 30],
  calm: [170, 200],
  serene: [180, 210],
  minimal: [0, 0],
  dark: [220, 260],
};

function getMoodHue(mood) {
  const lower = (mood || '').toLowerCase();
  for (const [key, [min, max]] of Object.entries(MOOD_HUE_MAP)) {
    if (lower.includes(key)) return min + Math.random() * (max - min);
  }
  return Math.random() * 360;
}

async function executeColorPalette(endpointName, args, start) {
  if (endpointName === 'generate_palette') {
    const { mood, base_color } = args || {};
    if (!mood)
      return {
        success: false,
        result: null,
        error: 'Missing mood parameter',
        durationMs: Date.now() - start,
      };

    let hue = getMoodHue(mood);
    let baseSat = 0.55;
    let baseLit = 0.4;

    // If a base color is provided, derive hue from it
    if (base_color && /^#[0-9a-fA-F]{6}$/.test(base_color)) {
      const [r, g, b] = hexToRgb(base_color);
      const max = Math.max(r, g, b) / 255,
        min = Math.min(r, g, b) / 255;
      const d = max - min;
      if (d > 0) {
        if (max === r / 255) hue = 60 * (((g / 255 - b / 255) / d) % 6);
        else if (max === g / 255) hue = 60 * ((b / 255 - r / 255) / d + 2);
        else hue = 60 * ((r / 255 - g / 255) / d + 4);
        if (hue < 0) hue += 360;
        baseSat = d / max;
        baseLit = (max + min) / 2;
      }
    }

    const isDark = (mood || '').toLowerCase().includes('dark');

    const primary = rgbToHex(...hslToRgb(hue, baseSat, isDark ? 0.55 : baseLit));
    const accent = rgbToHex(
      ...hslToRgb((hue + 30) % 360, baseSat + 0.1, isDark ? 0.6 : baseLit + 0.1)
    );
    const surface = isDark
      ? rgbToHex(...hslToRgb(hue, 0.08, 0.1))
      : rgbToHex(...hslToRgb(hue, 0.15, 0.97));
    const text = isDark
      ? rgbToHex(...hslToRgb(hue, 0.05, 0.9))
      : rgbToHex(...hslToRgb(hue, 0.3, 0.15));
    const textMuted = isDark
      ? rgbToHex(...hslToRgb(hue, 0.08, 0.6))
      : rgbToHex(...hslToRgb(hue, 0.15, 0.4));
    const border = isDark
      ? rgbToHex(...hslToRgb(hue, 0.1, 0.25))
      : rgbToHex(...hslToRgb(hue, 0.2, 0.85));

    const cssBlock = `:root {\n  --primary: ${primary};\n  --accent: ${accent};\n  --surface: ${surface};\n  --text: ${text};\n  --text-muted: ${textMuted};\n  --border: ${border};\n}`;

    // Validate key contrasts
    const textOnSurface = contrastRatio(hexToRgb(text), hexToRgb(surface));
    const mutedOnSurface = contrastRatio(hexToRgb(textMuted), hexToRgb(surface));

    return {
      success: true,
      result: JSON.stringify({
        mood,
        css: cssBlock,
        palette: { primary, accent, surface, text, textMuted, border },
        contrast: {
          textOnSurface: {
            ratio: textOnSurface.toFixed(2),
            aa: textOnSurface >= 4.5,
            aaa: textOnSurface >= 7,
          },
          mutedOnSurface: {
            ratio: mutedOnSurface.toFixed(2),
            aa: mutedOnSurface >= 4.5,
            aaa: mutedOnSurface >= 7,
          },
        },
      }),
      durationMs: Date.now() - start,
    };
  }

  if (endpointName === 'check_contrast') {
    const { foreground, background } = args || {};
    if (!foreground || !background)
      return {
        success: false,
        result: null,
        error: 'Missing foreground or background parameter',
        durationMs: Date.now() - start,
      };
    if (!/^#[0-9a-fA-F]{6}$/.test(foreground) || !/^#[0-9a-fA-F]{6}$/.test(background)) {
      return {
        success: false,
        result: null,
        error: 'Colors must be 6-digit hex format e.g. "#2C1810"',
        durationMs: Date.now() - start,
      };
    }

    const ratio = contrastRatio(hexToRgb(foreground), hexToRgb(background));
    return {
      success: true,
      result: JSON.stringify({
        foreground,
        background,
        ratio: ratio.toFixed(2),
        normalText: { aa: ratio >= 4.5, aaa: ratio >= 7 },
        largeText: { aa: ratio >= 3, aaa: ratio >= 4.5 },
      }),
      durationMs: Date.now() - start,
    };
  }

  return {
    success: false,
    result: null,
    error: `Unknown color-palette endpoint: ${endpointName}`,
    durationMs: Date.now() - start,
  };
}

async function executeTempEmailTool(endpointName, args, start) {
  const { createEmail, checkInbox, readMessage } = await import('../browser/temp-email.js');
  try {
    if (endpointName === 'create_email') {
      const result = await createEmail();
      return { success: true, result: JSON.stringify(result), durationMs: Date.now() - start };
    }
    if (endpointName === 'check_inbox') {
      const messages = await checkInbox(args?.token);
      return { success: true, result: JSON.stringify(messages), durationMs: Date.now() - start };
    }
    if (endpointName === 'read_message') {
      const msg = await readMessage(args?.token, args?.messageId);
      return { success: true, result: JSON.stringify(msg), durationMs: Date.now() - start };
    }
    return {
      success: false,
      result: null,
      error: `Unknown temp-email endpoint: ${endpointName}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    rethrowExecutionAuthorization(err);
    return { success: false, result: null, error: err.message, durationMs: Date.now() - start };
  }
}

// ── Convert tool definitions to LLM function format ───────────────

/**
 * Build JSON Schema properties + required list from an endpoint's parameter map.
 *
 * Handles the predefinedTools.js format:
 *   { paramName: { type: 'string', required: true, description: '...' } }
 *
 * Also supports the legacy "paramName?" optional convention and short-form
 *   "foo: 'string[]'" arrays, so this stays backwards-compatible.
 *
 * OpenAI function-calling strict mode requires:
 *   - `type: 'array'` MUST include `items: { type: '...' }`
 *   - `type: 'object'` should include `properties` (or `additionalProperties`)
 *   - Only a fixed set of type strings are accepted
 */
function buildParamSchema(params) {
  const properties = {};
  const required = [];

  for (const [pName, pDef] of Object.entries(params || {})) {
    // Two conventions for "optional": trailing '?' in name, OR required:false in def
    const nameHasOptional = pName.endsWith('?');
    const cleanName = pName.replace(/\?$/, '');
    const isObj = pDef && typeof pDef === 'object';
    const explicitRequired = isObj && pDef.required === true;
    const explicitOptional = isObj && pDef.required === false;
    const isRequired = explicitRequired || (!nameHasOptional && !explicitOptional && !isObj);

    const rawType = typeof pDef === 'string' ? pDef : pDef?.type || 'string';
    const description = isObj && pDef.description ? pDef.description : undefined;

    let schema;
    if (rawType.endsWith('[]')) {
      // Short-form "string[]" → array of that item type
      schema = { type: 'array', items: { type: rawType.slice(0, -2) } };
    } else if (rawType === 'array') {
      // predefinedTools.js "type: 'array'" — default items to string, the most common case
      schema = { type: 'array', items: { type: 'string' } };
    } else if (rawType === 'object') {
      // OpenAI strict mode requires object schemas to have properties OR additionalProperties
      schema = { type: 'object', additionalProperties: true };
    } else {
      schema = { type: rawType };
    }
    if (description) schema.description = description;

    properties[cleanName] = schema;
    if (isRequired) required.push(cleanName);
  }

  return { properties, required };
}

/**
 * Convert a single tool definition's endpoints to OpenAI function-calling format.
 */
function toolDefToFunctions(def) {
  return (def.endpoints || []).map((ep) => {
    const { properties, required } = buildParamSchema(ep.parameters);
    const fnName = `${def.id.replaceAll('-', '_')}__${ep.name}`;
    return {
      type: 'function',
      function: {
        name: fnName,
        description: `[${def.name}] ${ep.description}`,
        parameters: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      },
    };
  });
}

/**
 * Convert a Composio tool's curated actions to OpenAI function-calling format.
 */
function composioToolToFunctions(def) {
  if (!def.actions?.length) return [];

  return def.actions.map((actionName) => {
    const fnName = `${def.id.replaceAll('-', '_')}__${actionName}`;
    return {
      type: 'function',
      function: {
        name: fnName,
        description: `[${def.name}] Execute ${actionName.replaceAll('_', ' ').toLowerCase()}`,
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'object',
              description: 'Action parameters as key-value pairs',
            },
          },
        },
      },
    };
  });
}

/**
 * Check if a tool def + DB record pair is usable (has credentials or is internal).
 */
function isToolUsable(def, record) {
  if (def.connectionType === 'internal') return true;
  if (def.connectionType === 'composio') return true;
  return !!record?.apiKey;
}

/**
 * Convert predefined tool definitions + DB records to OpenAI function-calling format.
 * Only includes tools that have credentials configured (or are internal).
 */
function buildLlmToolDefs(toolDefs, toolRecords) {
  const recordById = new Map(toolRecords.map((t) => [t.id, t]));
  const functions = [];

  for (const def of toolDefs) {
    const record = recordById.get(def.id);
    if (!isToolUsable(def, record)) continue;

    // Composio tools use actions instead of endpoints
    if (def.connectionType === 'composio') {
      functions.push(...composioToolToFunctions(def));
      continue;
    }

    if (!def.endpoints?.length) continue;
    functions.push(...toolDefToFunctions(def));
  }

  return functions;
}

// ── Main ReAct loop ───────────────────────────────────────────────

// ── StuckDetector (inspired by OpenHands) ─────────────────────────
// Detects agent loop patterns and breaks early to save tokens.
function detectStuck(history) {
  if (history.length < 3) return false;
  const last3 = history.slice(-3);
  const last4 = history.slice(-4);
  // Pattern 1: Same action repeated 3x
  if (last3.every((h) => h.action === last3[0].action)) return true;
  // Pattern 2: Same action + always errors, 3x
  if (last3.every((h) => h.isError && h.action === last3[0].action)) return true;
  // Pattern 3: A-B-A-B alternating (need 4 entries)
  if (
    last4.length >= 4 &&
    last4[0].action === last4[2].action &&
    last4[1].action === last4[3].action &&
    last4[0].action !== last4[1].action
  )
    return true;
  return false;
}

function tokenLimitFinishReason(value) {
  return ['length', 'max_tokens', 'max_output_tokens', 'token_limit'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
  );
}

function mergeContinuation(initialContent, continuationContent) {
  const initial = String(initialContent || '').trimEnd();
  const continuation = String(continuationContent || '').trimStart();
  if (!initial) return continuation;
  if (!continuation) return initial;
  return `${initial}\n\n${continuation}`;
}

function truncatedToolResponseError(result) {
  const error = new Error(
    'LLM_OUTPUT_TRUNCATED: tool-enabled provider reached its output-token limit after one pinned continuation.'
  );
  error.code = 'LLM_OUTPUT_TRUNCATED';
  error.llmResult = result;
  return error;
}

/**
 * Run an agent task with tool-use support.
 *
 * @param {object} opts
 * @param {string} opts.prompt - User task/prompt
 * @param {string} opts.systemPrompt - Agent system prompt
 * @param {string} opts.provider - LLM provider name
 * @param {string} [opts.model] - LLM model override
 * @param {boolean} [opts.pinnedProvider] - Disable cross-provider failover
 * @param {Array} opts.toolDefs - Predefined tool definitions (from predefinedTools.js)
 * @param {Array} opts.toolRecords - Tool records from DB (with credentials)
 * @param {string} [opts.entityId] - User ID for Composio entity scoping
 * @param {string} [opts.userId] - Owner ID for resolving encrypted LLM BYOK credentials
 * @param {Function} [opts.beforeExternalAction] - Revalidate execution authority immediately
 *   before each provider turn, output continuation, and tool invocation. A truthy return value
 *   aborts the loop with EXECUTION_AUTHORIZATION_REVOKED and is exposed as authorizationResult.
 * @returns {Promise<{ content: string, toolLog: Array, usage: object, model: string, provider: string, durationMs: number, estimatedCostUsd: number }>}
 */
export async function runAgentWithTools({
  prompt,
  systemPrompt,
  provider,
  model,
  pinnedProvider = false,
  toolDefs,
  toolRecords,
  entityId,
  userId,
  maxFinalTokens = 3000,
  beforeExternalAction,
}) {
  const llmTools = buildLlmToolDefs(toolDefs, toolRecords);
  const hasTools = llmTools.length > 0;

  // Build initial messages
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const toolLog = [];
  const stuckHistory = []; // StuckDetector: track actions for loop detection
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let totalCost = 0;
  let totalDuration = 0;
  let finalModel = model;
  let finalProvider = provider;
  let finalContent = '';
  let finalFinishReason = null;
  const effectiveMaxFinalTokens = Math.max(3000, Math.min(65536, Number(maxFinalTokens) || 3000));

  const authorizeExternalAction = async (action) => {
    await assertCurrentJobLeaseLive(`${action?.kind || 'external'} ${action?.phase || 'action'}`);
    if (typeof beforeExternalAction !== 'function') return;
    const authorizationResult = await beforeExternalAction(action);
    if (!authorizationResult) return;
    const error = new Error('Execution authorization was revoked before an external action');
    error.code = 'EXECUTION_AUTHORIZATION_REVOKED';
    error.authorizationResult = authorizationResult;
    throw error;
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    await authorizeExternalAction({
      kind: 'llm',
      phase: i === 0 ? 'initial' : 'tool_continuation',
      iteration: i,
    });
    const llmResult = await executeLlmV2({
      messages,
      provider,
      model,
      pinnedProvider,
      temperature: 0.3,
      maxTokens: effectiveMaxFinalTokens,
      tools: hasTools ? llmTools : undefined,
      timeoutMs: REACT_LLM_TIMEOUT_MS,
      beforeInternalExternalAction: beforeExternalAction,
      ...(userId ? { userId } : {}),
    });

    // Accumulate usage
    totalUsage.prompt_tokens += llmResult.usage?.prompt_tokens || 0;
    totalUsage.completion_tokens += llmResult.usage?.completion_tokens || 0;
    totalUsage.total_tokens += llmResult.usage?.total_tokens || 0;
    totalCost += llmResult.estimatedCostUsd || 0;
    totalDuration += llmResult.durationMs || 0;
    finalModel = llmResult.model;
    finalProvider = llmResult.provider;

    // No tool calls — we're done
    if (!llmResult.toolCalls || llmResult.toolCalls.length === 0) {
      finalContent = llmResult.content;
      finalFinishReason = llmResult.finishReason || null;
      if (tokenLimitFinishReason(finalFinishReason) && String(finalContent || '').trim()) {
        await authorizeExternalAction({
          kind: 'llm',
          phase: 'output_continuation',
          iteration: i,
        });
        const continuationResult = await executeLlmV2({
          messages: [
            ...messages,
            { role: 'assistant', content: finalContent },
            {
              role: 'user',
              content:
                'Your response reached the output-token limit. Continue exactly where it stopped and finish the required artifact. Return continuation text only, do not repeat completed content, and do not call tools.',
            },
          ],
          provider: llmResult.provider || provider,
          model: llmResult.model || model,
          pinnedProvider: true,
          temperature: 0.3,
          maxTokens: effectiveMaxFinalTokens,
          timeoutMs: REACT_LLM_TIMEOUT_MS,
          beforeInternalExternalAction: beforeExternalAction,
          ...(userId ? { userId } : {}),
        });
        totalUsage.prompt_tokens += continuationResult.usage?.prompt_tokens || 0;
        totalUsage.completion_tokens += continuationResult.usage?.completion_tokens || 0;
        totalUsage.total_tokens += continuationResult.usage?.total_tokens || 0;
        totalCost += continuationResult.estimatedCostUsd || 0;
        totalDuration += continuationResult.durationMs || 0;
        finalModel = continuationResult.model || finalModel;
        finalProvider = continuationResult.provider || finalProvider;
        finalFinishReason = continuationResult.finishReason || null;
        finalContent = mergeContinuation(finalContent, continuationResult.content);
        if (
          !String(continuationResult.content || '').trim() ||
          tokenLimitFinishReason(finalFinishReason)
        ) {
          throw truncatedToolResponseError({
            ...continuationResult,
            content: finalContent,
          });
        }
      }
      break;
    }

    // Add assistant message with tool calls to conversation
    messages.push(buildAssistantToolCallMessage(llmResult, llmResult.provider));

    // Execute each tool call
    for (const call of llmResult.toolCalls) {
      log.info(null, 'tool.execute', { iteration: i, tool: call.name });

      await authorizeExternalAction({
        kind: 'tool',
        phase: 'tool_call',
        iteration: i,
        toolName: call.name,
        callId: call.id,
      });
      const result = await executeToolCall(
        call,
        toolRecords,
        toolDefs,
        entityId,
        authorizeExternalAction
      );
      toolLog.push({ name: call.name, arguments: call.arguments, ...result });

      // Add tool result to conversation
      messages.push(buildToolResultMessage(call, result, llmResult.provider));

      // StuckDetector: record action signature for loop detection
      stuckHistory.push({
        action: call.name + JSON.stringify(call.arguments || {}).slice(0, 200),
        isError: !result.success,
      });
    }

    // StuckDetector: break if agent is looping
    if (detectStuck(stuckHistory)) {
      log.warn(null, 'stuck.detected', { iteration: i, history: stuckHistory.length });
      messages.push({
        role: 'user',
        content:
          'You appear to be stuck in a loop. Provide your best final answer now with what you have.',
      });
      break;
    }

    // If this is the last iteration, force a text response on next call
    if (i === MAX_ITERATIONS - 2) {
      messages.push({
        role: 'user',
        content: 'Please provide your final answer now based on the tool results above.',
      });
    }
  }

  // If we exhausted iterations without a text response, get one via a
  // synthesis call. Explicit prompt "no more tools, give me the complete
  // deliverable" ensures models like GLM/Qwen don't narrate "Let me try
  // another search..." as their final output (the 63-char fragment bug).
  if (!finalContent) {
    messages.push({
      role: 'user',
      content:
        'You\'ve used all available tool calls. Based on the tool results above, synthesize and output your COMPLETE final deliverable now. No more tool calls. No "let me try" narration. Output the full artifact that satisfies the task requirements.',
    });
    await authorizeExternalAction({
      kind: 'llm',
      phase: 'exhausted_iterations_synthesis',
      iteration: MAX_ITERATIONS,
    });
    const lastResult = await executeLlmV2({
      messages,
      provider,
      model,
      pinnedProvider,
      temperature: 0.3,
      maxTokens: Math.max(6000, effectiveMaxFinalTokens),
      timeoutMs: REACT_LLM_TIMEOUT_MS,
      beforeInternalExternalAction: beforeExternalAction,
      ...(userId ? { userId } : {}),
    });
    finalContent = lastResult.content;
    totalUsage.prompt_tokens += lastResult.usage?.prompt_tokens || 0;
    totalUsage.completion_tokens += lastResult.usage?.completion_tokens || 0;
    totalUsage.total_tokens += lastResult.usage?.total_tokens || 0;
    totalCost += lastResult.estimatedCostUsd || 0;
    totalDuration += lastResult.durationMs || 0;
    finalModel = lastResult.model || finalModel;
    finalProvider = lastResult.provider || finalProvider;
    finalFinishReason = lastResult.finishReason || null;
  }

  // Mid-thought fragment detection: even if we got content, it may be a
  // short stalled line ("Let me try another search:"). Run one more
  // synthesis pass if so. Budget: one extra LLM call worst case.
  const looksLikeFragment = (text) => {
    if (!text || text.length > 400) return false;
    const trimmed = text.trim();
    if (trimmed.endsWith(':') || trimmed.endsWith('...')) return true;
    if (/\b(let me|i'll|i will|searching for|trying to)\b/i.test(trimmed) && trimmed.length < 300)
      return true;
    return false;
  };
  if (looksLikeFragment(finalContent)) {
    log.warn(null, 'react.fragment-detected', { contentPreview: finalContent.slice(0, 100) });
    messages.push({ role: 'assistant', content: finalContent });
    messages.push({
      role: 'user',
      content:
        'That was incomplete. Output the COMPLETE final deliverable now, in full, matching all task requirements. Do not announce further actions — just produce the final artifact.',
    });
    await authorizeExternalAction({
      kind: 'llm',
      phase: 'fragment_repair',
      iteration: MAX_ITERATIONS + 1,
    });
    try {
      const synthResult = await executeLlmV2({
        messages,
        provider,
        model,
        pinnedProvider,
        temperature: 0.3,
        maxTokens: Math.max(8000, effectiveMaxFinalTokens),
        timeoutMs: REACT_LLM_TIMEOUT_MS,
        beforeInternalExternalAction: beforeExternalAction,
        ...(userId ? { userId } : {}),
      });
      if (synthResult.content && synthResult.content.length > (finalContent?.length || 0)) {
        finalContent = synthResult.content;
        totalUsage.prompt_tokens += synthResult.usage?.prompt_tokens || 0;
        totalUsage.completion_tokens += synthResult.usage?.completion_tokens || 0;
        totalUsage.total_tokens += synthResult.usage?.total_tokens || 0;
        totalCost += synthResult.estimatedCostUsd || 0;
        totalDuration += synthResult.durationMs || 0;
        finalModel = synthResult.model || finalModel;
        finalProvider = synthResult.provider || finalProvider;
        finalFinishReason = synthResult.finishReason || null;
      }
    } catch (synthErr) {
      rethrowExecutionAuthorization(synthErr);
      log.warn(null, 'react.fragment-synth-failed', { error: synthErr.message });
    }
  }

  return {
    content: finalContent,
    toolLog,
    usage: totalUsage,
    model: finalModel,
    provider: finalProvider,
    durationMs: totalDuration,
    estimatedCostUsd: totalCost,
    finishReason: finalFinishReason,
  };
}

// ── Message formatting helpers ────────────────────────────────────

/**
 * Build assistant message with tool calls for different provider formats.
 * Both Anthropic and OpenAI need the assistant's tool call in the conversation.
 */
function buildAssistantToolCallMessage(llmResult, provider) {
  if (provider === 'anthropic') {
    const content = [];
    if (llmResult.content) content.push({ type: 'text', text: llmResult.content });
    for (const tc of llmResult.toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
    }
    return { role: 'assistant', content };
  }

  // OpenAI-compatible format
  return {
    role: 'assistant',
    content: llmResult.content || null,
    tool_calls: llmResult.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      // Echo Gemini's thought_signature back or the follow-up turn 400s. Preserved
      // by parseResponse in llm-executor-v2.js; absent for every other provider,
      // so the emitted message is unchanged for them.
      ...(tc.extraContent ? { extra_content: tc.extraContent } : {}),
    })),
  };
}

/**
 * Build tool result message for different provider formats.
 */
function formatToolResult(result) {
  if (typeof result === 'string') return result;
  return JSON.stringify(result);
}

function buildToolResultMessage(call, result, provider) {
  const content = result.success
    ? formatToolResult(result.result)
    : `Error: ${result.error || 'Tool execution failed'}`;

  if (provider === 'anthropic') {
    return {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call.id, content }],
    };
  }

  // OpenAI-compatible format
  return { role: 'tool', tool_call_id: call.id, content };
}
