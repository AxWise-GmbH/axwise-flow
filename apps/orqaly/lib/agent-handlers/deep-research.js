/**
 * Deep Research — iterative web search with automatic citation tracking.
 *
 * Wraps tool-web-search with 3-round iterative refinement:
 * 1. Initial broad queries (3 queries from topic)
 * 2. Gap analysis + follow-up queries
 * 3. Fact triangulation (if source diversity is low)
 *
 * Returns accumulated findings + citation registry for structured output.
 */
import { CitationRegistry } from './citation-registry.js';
import { parseLlmJson } from './llm-executor.js';
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { createLogger } from '../../api/_lib/logger.js';
import { defaultModel, defaultProvider } from '../_shared/llm-defaults.js';
import { fetchWithJobLease } from '../../api/_lib/fetch.js';

const log = createLogger('deep-research');

const DEEP_RESEARCH_AUTHORIZATION_VERSION = 'orqaly_deep_research_authorization_v1';
const WEB_RESEARCH_TOOL_ID = 'tool-web-search';

/**
 * Resolve the usage-recording context for the three planning LLM calls.
 *
 * These calls are a genuine usage gap: deepResearch returns only `totalCost`
 * (folded into goals.spent_usd + a financial_events row by the caller) and is
 * NOT part of the job result that finalizeJob/logLlmUsage records — so without
 * this the query-planning spend produces zero llm_usage rows.
 *
 * The caller passes whatever attribution it has (userId/goalId/... ) via the
 * `usage` arg. We build a service-role admin client locally (the established
 * lib/agent-handlers pattern) when one isn't supplied, so recording still works
 * for the current caller that only passes (topic, req). If the admin client
 * can't be built, recording silently no-ops (the wrapper is a passthrough).
 */
async function resolveUsageCtx(usage, operation) {
  const ctx = { source: 'deep-research', operation, ...(usage || {}) };
  if (!ctx.admin) {
    try {
      const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
      ctx.admin = buildSupabaseAdminClient();
    } catch (err) {
      log.warn(null, 'deep-research.usage.no-admin', { error: err.message });
    }
  }
  return ctx;
}

const RESEARCH_KEYWORDS =
  /research|analyz|investigat|benchmark|competit|market|survey|landscape|industry|trend|compar|audit|assess/i;

function resolveResearchLlm(llm) {
  return {
    provider: llm?.provider || defaultProvider(),
    model: llm?.model || (llm?.provider ? undefined : defaultModel()),
    pinnedProvider: true,
  };
}

/**
 * Check if a task should use deep research.
 */
export function isResearchTask(task) {
  const text = `${task?.title || ''} ${task?.description || ''} ${task?.data?.description || ''}`;
  const deliverable = task?.data?.deliverable_type || 'markdown';
  return (deliverable === 'markdown' || deliverable === 'data') && RESEARCH_KEYWORDS.test(text);
}

/**
 * Generate initial search queries from a research topic.
 */
async function requireLiveResearchAuthority(beforeExternalAction, action) {
  if (typeof beforeExternalAction === 'function') {
    await beforeExternalAction(action);
  }
}

async function generateInitialQueries(topic, req, usage, llm, beforeExternalAction) {
  const { provider, model, pinnedProvider } = resolveResearchLlm(llm);
  await requireLiveResearchAuthority(beforeExternalAction, {
    kind: 'llm',
    operation: 'query-planning',
  });
  const result = await executeLlmTracked({
    prompt: `Break this research topic into 3 distinct web search queries that cover different angles (competitive, market data, trends).\n\nTopic: ${topic}\n\nReturn JSON: { "queries": ["query1", "query2", "query3"] }`,
    systemPrompt:
      'You are a research strategist. Generate specific, search-engine-optimized queries. Return valid JSON only.',
    provider,
    model,
    pinnedProvider,
    temperature: 0.3,
    maxTokens: 300,
    jsonMode: true,
    beforeInternalExternalAction: beforeExternalAction,
    req,
    usage: await resolveUsageCtx(usage, 'query-planning'),
  });
  const parsed = parseLlmJson(result.content);
  return { queries: parsed?.queries || [topic], cost: result.estimatedCostUsd || 0 };
}

/**
 * Analyze gaps in current findings and generate follow-up queries.
 */
async function analyzeGaps(topic, findings, req, usage, llm, beforeExternalAction) {
  const { provider, model, pinnedProvider } = resolveResearchLlm(llm);
  const summaries = findings
    .map((f) => `Query: "${f.query}" → ${f.resultCount} results`)
    .join('\n');
  const snippets = findings
    .flatMap((f) => f.snippets || [])
    .slice(0, 10)
    .join('\n');

  await requireLiveResearchAuthority(beforeExternalAction, {
    kind: 'llm',
    operation: 'gap-analysis',
  });
  const result = await executeLlmTracked({
    prompt: [
      `Analyze these research findings and identify what's MISSING for a comprehensive report on: ${topic}`,
      '',
      'Searches done so far:',
      summaries,
      '',
      'Key snippets found:',
      snippets,
      '',
      'Generate 3 follow-up queries targeting the gaps. Focus on: missing data points, unexplored angles, verification of key claims.',
      '',
      'Return JSON: { "gaps": ["gap1", "gap2"], "followUpQueries": ["query1", "query2", "query3"] }',
    ].join('\n'),
    systemPrompt:
      'You are a research strategist. Identify gaps in existing research and generate targeted follow-up queries. Return valid JSON only.',
    provider,
    model,
    pinnedProvider,
    temperature: 0.3,
    maxTokens: 400,
    jsonMode: true,
    beforeInternalExternalAction: beforeExternalAction,
    req,
    usage: await resolveUsageCtx(usage, 'gap-analysis'),
  });
  const parsed = parseLlmJson(result.content);
  return {
    gaps: parsed?.gaps || [],
    followUpQueries: parsed?.followUpQueries || [],
    cost: result.estimatedCostUsd || 0,
  };
}

/**
 * Generate triangulation queries to verify key claims from multiple sources.
 */
async function generateTriangulationQueries(
  topic,
  findings,
  req,
  usage,
  llm,
  beforeExternalAction
) {
  const { provider, model, pinnedProvider } = resolveResearchLlm(llm);
  const claims = findings
    .flatMap((f) => f.snippets || [])
    .slice(0, 8)
    .join('\n');

  await requireLiveResearchAuthority(beforeExternalAction, {
    kind: 'llm',
    operation: 'triangulation',
  });
  const result = await executeLlmTracked({
    prompt: [
      `These claims about "${topic}" need verification from additional sources:`,
      claims,
      '',
      'Generate 2-3 targeted queries to find corroborating or contradicting data from different sources.',
      '',
      'Return JSON: { "queries": ["query1", "query2"] }',
    ].join('\n'),
    systemPrompt: 'Generate fact-checking search queries. Return valid JSON only.',
    provider,
    model,
    pinnedProvider,
    temperature: 0.2,
    maxTokens: 250,
    jsonMode: true,
    beforeInternalExternalAction: beforeExternalAction,
    req,
    usage: await resolveUsageCtx(usage, 'triangulation'),
  });
  const parsed = parseLlmJson(result.content);
  return { queries: parsed?.queries || [], cost: result.estimatedCostUsd || 0 };
}

/**
 * Execute a web search via Tavily API.
 * This is a standalone implementation that doesn't require the tool-runner ReAct loop.
 */
async function executeWebSearch(query, maxResults = 5, beforeExternalAction) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    log.warn(null, 'deep-research.no-tavily-key');
    return [];
  }
  await requireLiveResearchAuthority(beforeExternalAction, {
    kind: 'tool',
    operation: 'web-search',
    query,
  });
  try {
    const res = await fetchWithJobLease('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    log.warn(null, 'deep-research.search-failed', { query, error: err.message });
    return [];
  }
}

/**
 * Run deep research: 3-round iterative search with citation tracking.
 *
 * @param {string} topic - The research topic / task description
 * @param {object} [req] - Request object for logging
 * @param {object} [usage] - Optional usage-recording context (admin, userId,
 *   goalId, organizationId, teamId, ...) forwarded to recordLlmUsage for the
 *   query-planning LLM calls. Omit to let the function build a service-role
 *   admin client locally and record with whatever attribution is available.
 * @param {object} authorization - Capability produced by execute-task only after
 *   the live gate-2 manifest and AxWise route have both been verified.
 * @param {object} [llm] - Explicit per-goal provider/model selection. When
 *   omitted, the platform default pair is used.
 * @param {Function} [beforeExternalAction] - Revocable authority callback run
 *   immediately before every planning LLM call and Tavily request.
 * @returns {{ findings, registry: CitationRegistry, totalCost: number }}
 */
export async function deepResearch(topic, req, usage, authorization, llm, beforeExternalAction) {
  if (
    authorization?.allowed !== true ||
    authorization?.version !== DEEP_RESEARCH_AUTHORIZATION_VERSION ||
    authorization?.tool_id !== WEB_RESEARCH_TOOL_ID
  ) {
    const error = new Error('DEEP_RESEARCH_NOT_AUTHORIZED');
    error.code = 'DEEP_RESEARCH_NOT_AUTHORIZED';
    throw error;
  }

  const registry = new CitationRegistry();
  const allFindings = [];
  let totalCost = 0;

  log.info(req, 'deep-research.start', { topic: topic.slice(0, 100) });

  // Round 1: Initial broad search (3 queries)
  const { queries: initialQueries, cost: initCost } = await generateInitialQueries(
    topic,
    req,
    usage,
    llm,
    beforeExternalAction
  );
  totalCost += initCost;

  for (const query of initialQueries) {
    const results = await executeWebSearch(query, 5, beforeExternalAction);
    registry.addFromSearchResults(results);
    allFindings.push({
      round: 1,
      query,
      resultCount: results.length,
      snippets: results.map((r) => r.content?.slice(0, 150) || r.title || '').filter(Boolean),
    });
  }

  log.info(req, 'deep-research.round1-done', {
    sources: registry.getStats().totalSources,
    domains: registry.getStats().uniqueDomains,
  });

  // Round 2: Gap analysis + follow-up queries
  const { followUpQueries, cost: gapCost } = await analyzeGaps(
    topic,
    allFindings,
    req,
    usage,
    llm,
    beforeExternalAction
  );
  totalCost += gapCost;

  for (const query of followUpQueries.slice(0, 3)) {
    const results = await executeWebSearch(query, 5, beforeExternalAction);
    registry.addFromSearchResults(results);
    allFindings.push({
      round: 2,
      query,
      resultCount: results.length,
      snippets: results.map((r) => r.content?.slice(0, 150) || r.title || '').filter(Boolean),
    });
  }

  log.info(req, 'deep-research.round2-done', {
    sources: registry.getStats().totalSources,
    domains: registry.getStats().uniqueDomains,
  });

  // Round 3: Fact triangulation (only if source diversity is low)
  const stats = registry.getStats();
  if (stats.uniqueDomains < 5 && stats.totalSources < 10) {
    const { queries: triQueries, cost: triCost } = await generateTriangulationQueries(
      topic,
      allFindings,
      req,
      usage,
      llm,
      beforeExternalAction
    );
    totalCost += triCost;

    for (const query of triQueries.slice(0, 3)) {
      const results = await executeWebSearch(query, 3, beforeExternalAction);
      registry.addFromSearchResults(results);
      allFindings.push({
        round: 3,
        query,
        resultCount: results.length,
        snippets: results.map((r) => r.content?.slice(0, 150) || r.title || '').filter(Boolean),
      });
    }

    log.info(req, 'deep-research.round3-done', {
      sources: registry.getStats().totalSources,
      domains: registry.getStats().uniqueDomains,
    });
  }

  const finalStats = registry.getStats();
  log.info(req, 'deep-research.complete', {
    totalQueries: allFindings.length,
    totalSources: finalStats.totalSources,
    uniqueDomains: finalStats.uniqueDomains,
    totalCost,
  });

  return { findings: allFindings, registry, totalCost };
}

/**
 * Build citation injection block for the agent's system prompt.
 */
export function buildCitationPromptBlock(registry) {
  const stats = registry.getStats();
  if (stats.totalSources === 0) return '';

  return [
    '',
    `## RESEARCH SOURCES COLLECTED (${stats.totalSources} sources from ${stats.uniqueDomains} domains)`,
    '',
    registry.toPromptContext(),
    '',
    '## CITATION RULES',
    '- Use [1], [2], [3] etc. as inline citations referencing the numbered sources above',
    '- Every factual claim, statistic, or data point MUST have a citation',
    '- Add a "## References" section at the end listing all cited sources',
    '- Do NOT fabricate URLs — ONLY use sources from the list above',
    '- If you cannot find a source for a claim, state "source not found" instead of guessing',
    '- Aim for source diversity — cite from multiple domains, not just one',
  ].join('\n');
}
