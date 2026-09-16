/**
 * Stage: image-pool
 *
 * Server-side Pexels fetch of real landscape images for the landing-page
 * deployment task. Eliminates the main visual-quality gap: Opus via
 * Agent SDK has no tool access (hallucinates image URLs), GLM/Qwen skip
 * Pexels tool calls to save tokens. We fetch once, slot images into
 * hero / features / testimonials, inject the list into every agent's
 * system prompt in execute-task.js with a "use these EXACT URLs" rule.
 *
 * Fires after gate 2 for landing-page goals and then starts the approved plan.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import {
  logGoalEvent,
  updateGoalIfExecutionAuthorized,
  loadGoal,
  pickTestModel,
} from '../_helpers.js';
import { SYSTEM_ENRICHMENT_IDS } from '../execution-authorization.js';
import {
  enrichmentScopeIsCurrent,
  resolveNativeEnrichmentContext,
} from '../native-enrichment-context.js';
import {
  enqueueAuthorizedSystemEnrichmentNext,
  recheckSystemEnrichmentAuthorization,
  requireSystemEnrichmentAuthorization,
} from './_system-enrichment-authorization.js';

const log = createLogger('goal-stage:image-pool');

const LANDING_PAGE_REGEX =
  /\b(landing page|landing-page|website|web site|web app|web-app|marketing site|homepage|home page|microsite|one[-\s]?pager|splash page)\b/i;

const SLOTS = [
  'hero',
  'feature_1',
  'feature_2',
  'feature_3',
  'testimonial_1',
  'testimonial_2',
  'testimonial_3',
  'misc',
];

async function pexelsSearch(query, perPage, apiKey) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
  const res = await fetchWithRetry(
    url,
    {
      headers: { Authorization: apiKey },
    },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Pexels ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.photos || [])
    .map((p) => ({
      url: p.src?.large2x || p.src?.large || p.src?.original,
      alt: p.alt || query,
      photographer: p.photographer,
      pexels_id: p.id,
    }))
    .filter((p) => p.url);
}

// Tier 5: LLM-driven Image Curator. Replaces the deterministic word-stripper
// in buildKeywords() with a small dedicated LLM call that reads the FULL goal
// context (accepted native projection or legacy title/description, plus the
// scope-bound brand_seed) and produces 6-10 slot-tagged,
// niche-specific Pexels queries.
//
// Why this is a separate function: handle() calls this first; if anything
// goes wrong (LLM hiccup, parse error, empty queries, fewer than 4 hits from
// Pexels), handle() silently falls back to buildKeywords(). Zero risk of
// regression on goals that worked before.
//
// Returns: Array<{ slot: string, query: string, why?: string }> | null
//   - null on any failure → caller falls back
//   - 3+ entries on success
const IMAGE_CURATOR_SYSTEM_PROMPT = `You are an Image Curator for landing pages. Your job is to produce highly specific stock-photo search queries that match the goal's REAL subject, audience, setting, and brand vibe — not generic product nouns.

Bad: "wool socks"  → matches anything; loses the goal's intent.
Good: "hiker wearing wool socks on Latvian forest trail" → matches the audience, product, and setting together.

Each query must be 4-9 words. Include:
- A concrete subject (the product, a person using it, or its environment)
- A descriptive modifier (texture, weather, lighting, mood, season)
- Where helpful, the geographic or cultural context
- NEVER include words like "landing page", "marketing", "website", "for", "of", "the"

For each of the 8 slots (hero, feature_1, feature_2, feature_3, testimonial_1, testimonial_2, testimonial_3, misc), produce one query. Hero is a wide emotional pull shot; feature_* are product/detail/use-case; testimonial_* are human faces in context; misc is a brand-story supporting shot.

Respond with JSON only. No prose.`;

const SLOTS_ORDER = [
  'hero',
  'feature_1',
  'feature_2',
  'feature_3',
  'testimonial_1',
  'testimonial_2',
  'testimonial_3',
  'misc',
];

export async function curateQueriesViaLlm(
  goal,
  brandSeed,
  req,
  admin = null,
  authorizedLlm = null
) {
  const goalTitle = (goal.title || '').trim();
  const goalDesc = (goal.description || '').trim().slice(0, 600);
  if (!goalTitle && !goalDesc) return null;

  const vibe = brandSeed?.vibe || '(unspecified)';
  const moodWords = Array.isArray(brandSeed?.mood_words)
    ? brandSeed.mood_words.slice(0, 8).join(', ')
    : '(unspecified)';
  const audience = brandSeed?.target_audience || '(unspecified)';

  const userPrompt = [
    `Goal title:       ${goalTitle}`,
    goalDesc ? `Goal description: ${goalDesc}` : '',
    `Brand vibe:       ${vibe}`,
    `Brand mood words: ${moodWords}`,
    `Target audience:  ${audience}`,
    '',
    `Slots needed (in order): ${SLOTS_ORDER.join(', ')}.`,
    '',
    'Respond as JSON: { "queries": [{ "slot": "<slot>", "query": "<4-9 words>", "why": "<1-line rationale>" }, ...] }',
  ]
    .filter(Boolean)
    .join('\n');

  let result;
  try {
    result = await executeLlmTracked({
      prompt: userPrompt,
      systemPrompt: IMAGE_CURATOR_SYSTEM_PROMPT,
      ...(authorizedLlm ? { ...authorizedLlm, pinnedProvider: true } : pickTestModel(goal)),
      temperature: 0.5,
      maxTokens: 1500,
      jsonMode: true,
      req,
      usage: admin
        ? {
            admin,
            userId: goal.user_id,
            goalId: goal.id,
            organizationId: goal.org_id,
            teamId: goal.agent_team_id || goal.team_id,
            consiliumId: goal.concilium_id,
            source: 'image-pool',
            operation: 'image-curation',
            description: `Image curator: ${goal.title}`,
          }
        : undefined,
    });
  } catch (err) {
    log.warn(req, 'image-pool.llm-curate.call-failed', { error: err.message, goalId: goal.id });
    return null;
  }

  const parsed = parseLlmJson(result?.content || '');
  if (!parsed || !Array.isArray(parsed.queries) || parsed.queries.length === 0) {
    log.warn(req, 'image-pool.llm-curate.parse-failed', {
      goalId: goal.id,
      contentPreview: String(result?.content || '').slice(0, 200),
    });
    return null;
  }

  // Filter: each entry must have a non-empty 4-9 word query and a valid slot.
  // Coerce slot names to known values; if model returned "hero_2" or similar,
  // map to the closest known slot or drop the entry.
  const cleaned = [];
  for (const entry of parsed.queries) {
    if (!entry || typeof entry.query !== 'string') continue;
    const query = entry.query.trim().replace(/\s+/g, ' ');
    if (query.length < 6) continue;
    const wc = query.split(' ').length;
    if (wc < 3 || wc > 12) continue;
    const slot =
      typeof entry.slot === 'string' && SLOTS_ORDER.includes(entry.slot) ? entry.slot : null;
    if (!slot) continue;
    cleaned.push({ slot, query, why: entry.why || '' });
  }

  if (cleaned.length < 3) {
    log.warn(req, 'image-pool.llm-curate.too-few-valid-queries', {
      goalId: goal.id,
      raw: parsed.queries.length,
      kept: cleaned.length,
    });
    return null;
  }
  return cleaned;
}

function buildKeywords(goal, brandSeed) {
  const title = (goal.title || '').toLowerCase();
  const moodWords = Array.isArray(brandSeed?.mood_words) ? brandSeed.mood_words.slice(0, 3) : [];
  const vibeParts = (brandSeed?.vibe || '').split(/\s+/).slice(0, 2).filter(Boolean);

  // Primary query: goal's subject noun phrase — strip boilerplate words
  const primaryClean =
    title
      .replaceAll(
        /\b(landing page|landing-page|website|marketing site|homepage|for|to|sell|the|a|an|in|with|of|create|build|make)\b/g,
        ' '
      )
      .replaceAll(/\s+/g, ' ')
      .trim()
      .split(/[—–-]/)[0] // take everything before first dash
      .trim() || title;

  return [
    primaryClean, // e.g. "wool socks men latvia"
    [primaryClean, ...vibeParts].join(' ').trim(), // "wool socks minimalist nordic"
    [primaryClean, ...moodWords.slice(0, 2)].join(' ').trim(), // "wool socks warm durable"
    [moodWords[0] || 'lifestyle', primaryClean.split(' ')[0] || 'product'].join(' ').trim(), // "warm wool"
  ].filter((q, i, arr) => q && q.length >= 3 && arr.indexOf(q) === i);
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);

  const authorization = await requireSystemEnrichmentAuthorization({
    admin,
    goal,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
    planningFallbackAction: 'tool-provisioning',
    req,
    log,
  });
  if (!authorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: authorization.deferred ? 'deferred_until_approval' : 'authorization_required',
    };
  }

  const enrichmentContext = resolveNativeEnrichmentContext(goal);
  if (!enrichmentContext.ready) {
    log.warn(req, 'image-pool.native-scope-authority-invalid', {
      goalId: goal.id,
      reasons: enrichmentContext.reasons,
    });
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: 'native_scope_authority_invalid',
    };
  }
  const goalText = enrichmentContext.text;
  const enrichmentGoal = enrichmentContext.goal;
  const brandSeed = enrichmentScopeIsCurrent(enrichmentContext, goal.data?.brand_seed_scope_hash)
    ? goal.data?.brand_seed
    : null;

  if (!LANDING_PAGE_REGEX.test(goalText)) {
    log.info(req, 'image-pool.skipped.not-landing-page', { goalId: goal.id });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
      action: 'execute-phase',
      extra: { phaseIndex: 0 },
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'image-pool',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return { type: 'orchestrate-goal', action: 'image-pool', goalId: goal.id, status: 'skipped' };
  }
  if (
    Array.isArray(goal.data?.image_pool) &&
    goal.data.image_pool.length > 0 &&
    enrichmentScopeIsCurrent(enrichmentContext, goal.data?.image_pool_scope_hash)
  ) {
    log.info(req, 'image-pool.skipped.already-set', { goalId: goal.id });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
      action: 'execute-phase',
      extra: { phaseIndex: 0 },
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'image-pool',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: 'already_set',
    };
  }

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    log.warn(req, 'image-pool.no-api-key');
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
      action: 'execute-phase',
      extra: { phaseIndex: 0 },
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'image-pool',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: 'no_api_key',
    };
  }

  const seenUrls = new Set();

  // Tier 5: try the LLM-curated, slot-aware path first. Per-slot fetch
  // means each slot gets a query tailored to it ("hero" = wide outdoor;
  // "feature_*" = product detail; "testimonial_*" = human face) instead
  // of throwing 4 generic queries and slotting by array index. If anything
  // fails (LLM throws / bad JSON / Pexels finds nothing for the niche),
  // we silently fall back to buildKeywords() below.
  log.info(req, 'image-pool.llm-curate.start', { goalId: goal.id });
  const curated = await curateQueriesViaLlm(
    enrichmentGoal,
    brandSeed,
    req,
    admin,
    authorization.enrichment?.llm || null
  );

  if (curated && curated.length >= 3) {
    const curatedPool = [];
    for (const { slot, query } of curated) {
      try {
        const photos = await pexelsSearch(query, 3, apiKey);
        const top = photos.find((p) => !seenUrls.has(p.url));
        if (top) {
          seenUrls.add(top.url);
          curatedPool.push({ ...top, query, slot });
        }
      } catch (err) {
        log.warn(req, 'image-pool.pexels-query-failed', { slot, query, error: err.message });
      }
      if (curatedPool.length >= 8) break;
    }
    if (curatedPool.length >= 4) {
      const curatedQueries = curated.map((c) => c.query);
      const writeAuthorization = await recheckSystemEnrichmentAuthorization({
        admin,
        goalId: goal.id,
        enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
        req,
        log,
      });
      if (!writeAuthorization.ok) {
        return {
          type: 'orchestrate-goal',
          action: 'image-pool',
          goalId: goal.id,
          status: 'authorization_lost',
        };
      }
      const persisted = await updateGoalIfExecutionAuthorized(
        admin,
        goal.id,
        writeAuthorization.snapshot_hash,
        {
          data: {
            ...(writeAuthorization.goal.data || {}),
            image_pool: curatedPool,
            image_pool_source: 'llm',
            ...(enrichmentContext.native
              ? { image_pool_scope_hash: enrichmentContext.scopeHash }
              : {}),
          },
        }
      );
      if (!persisted) {
        return {
          type: 'orchestrate-goal',
          action: 'image-pool',
          goalId: goal.id,
          status: 'authorization_lost',
        };
      }
      await logGoalEvent(admin, goal.id, 'image_pool_created', {
        count: curatedPool.length,
        source: 'llm',
        queries: curatedQueries,
      });
      log.info(req, 'image-pool.created.llm', {
        goalId: goal.id,
        count: curatedPool.length,
        queries: curatedQueries,
      });
      const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
        admin,
        goalId: goal.id,
        enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
        action: 'execute-phase',
        extra: { phaseIndex: 0 },
        req,
        log,
      });
      if (!nextAuthorization.ok) {
        return {
          type: 'orchestrate-goal',
          action: 'image-pool',
          goalId: goal.id,
          status: 'authorization_lost',
        };
      }
      return {
        type: 'orchestrate-goal',
        action: 'image-pool',
        goalId: goal.id,
        status: 'created',
        count: curatedPool.length,
        source: 'llm',
      };
    }
    log.warn(req, 'image-pool.llm-curate.too-few-results-using-fallback', {
      goalId: goal.id,
      llmHits: curatedPool.length,
    });
  }

  // Fallback: existing deterministic path. Unchanged.
  const queries = buildKeywords(enrichmentGoal, brandSeed);
  const all = [];

  for (const q of queries) {
    try {
      const photos = await pexelsSearch(q, 6, apiKey);
      for (const p of photos) {
        if (seenUrls.has(p.url)) continue;
        seenUrls.add(p.url);
        all.push({ ...p, query: q });
        if (all.length >= 12) break;
      }
      if (all.length >= 12) break;
    } catch (err) {
      log.warn(req, 'image-pool.pexels-query-failed', { query: q, error: err.message });
    }
  }

  if (all.length === 0) {
    log.warn(req, 'image-pool.no-results', { goalId: goal.id, queries });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
      action: 'execute-phase',
      extra: { phaseIndex: 0 },
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'image-pool',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: 'no_results',
    };
  }

  // Slot assignment: first 8 photos → structured slots, rest go to misc.
  const pool = all.slice(0, 8).map((p, i) => ({
    ...p,
    slot: SLOTS[i] || 'misc',
  }));

  const writeAuthorization = await recheckSystemEnrichmentAuthorization({
    admin,
    goalId: goal.id,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
    req,
    log,
  });
  if (!writeAuthorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }

  const persisted = await updateGoalIfExecutionAuthorized(
    admin,
    goal.id,
    writeAuthorization.snapshot_hash,
    {
      data: {
        ...(writeAuthorization.goal.data || {}),
        image_pool: pool,
        image_pool_source: 'keywords',
        ...(enrichmentContext.native ? { image_pool_scope_hash: enrichmentContext.scopeHash } : {}),
      },
    }
  );
  if (!persisted) {
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }
  await logGoalEvent(admin, goal.id, 'image_pool_created', {
    count: pool.length,
    source: 'keywords',
    queries,
  });

  log.info(req, 'image-pool.created', {
    goalId: goal.id,
    count: pool.length,
    source: 'keywords',
    queries,
  });
  const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
    admin,
    goalId: goal.id,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.IMAGE_POOL,
    action: 'execute-phase',
    extra: { phaseIndex: 0 },
    req,
    log,
  });
  if (!nextAuthorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'image-pool',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }
  return {
    type: 'orchestrate-goal',
    action: 'image-pool',
    goalId: goal.id,
    status: 'created',
    count: pool.length,
  };
}
