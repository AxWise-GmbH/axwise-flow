/**
 * Stage: brand-seed
 *
 * Extracts a deterministic brand identity (palette, fonts, vibe, mood,
 * target audience, tone) from the accepted native AxWise scope, or from the
 * legacy goal title + description — before the Designer agent runs. Injected
 * into every agent's system prompt in
 * execute-task.js so all three comparison LLMs build from the same
 * brand foundation. Eliminates the "generic Tailwind glassmorphism"
 * default every model falls into.
 *
 * Cheap LLM call (~$0.002, GLM default). Saves to goal.data.brand_seed.
 *
 * Only fires for landing-page goals (regex match on title+description).
 * Other goal types skip this stage via `status: 'skipped'`.
 */
import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  logGoalEvent,
  updateGoalIfExecutionAuthorized,
  loadGoal,
  pickTestModel,
} from '../_helpers.js';
import { isCloneRestyleGoal } from '../_clone-detectors.js';
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

const log = createLogger('goal-stage:brand-seed');

const LANDING_PAGE_REGEX =
  /\b(landing page|landing-page|website|web site|web app|web-app|marketing site|homepage|home page|microsite|one[-\s]?pager|splash page|affiliate|funnel|pre-?lander|sales page)\b/i;

// Gate 2 has already approved the team and tools. URL-clone goals fetch their
// declared reference next; other landing-page goals continue to image curation.
function nextActionFor(goal, enrichmentContext) {
  const enrichments = goal?.data?.execution_authorization?.manifest?.system_enrichments || [];
  if (enrichments.length) {
    return enrichments.some((item) => item?.id === SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE)
      ? 'clone-reference'
      : 'image-pool';
  }
  return !enrichmentContext?.native && isCloneRestyleGoal(goal) ? 'clone-reference' : 'image-pool';
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);

  const authorization = await requireSystemEnrichmentAuthorization({
    admin,
    goal,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.BRAND_SEED,
    planningFallbackAction: 'team-formation',
    req,
    log,
  });
  if (!authorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'brand-seed',
      goalId: goal.id,
      status: authorization.deferred ? 'deferred_until_approval' : 'authorization_required',
    };
  }

  const enrichmentContext = resolveNativeEnrichmentContext(goal);
  if (!enrichmentContext.ready) {
    log.warn(req, 'brand-seed.native-scope-authority-invalid', {
      goalId: goal.id,
      reasons: enrichmentContext.reasons,
    });
    return {
      type: 'orchestrate-goal',
      action: 'brand-seed',
      goalId: goal.id,
      status: 'native_scope_authority_invalid',
    };
  }
  const goalText = enrichmentContext.text;

  if (!LANDING_PAGE_REGEX.test(goalText)) {
    log.info(req, 'brand-seed.skipped.not-landing-page', { goalId: goal.id });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.BRAND_SEED,
      action: nextActionFor(goal, enrichmentContext),
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'brand-seed',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return { type: 'orchestrate-goal', action: 'brand-seed', goalId: goal.id, status: 'skipped' };
  }

  // Don't re-run if already set (e.g. iterate path came back through here)
  if (
    goal.data?.brand_seed?.palette?.length &&
    enrichmentScopeIsCurrent(enrichmentContext, goal.data?.brand_seed_scope_hash)
  ) {
    log.info(req, 'brand-seed.skipped.already-set', { goalId: goal.id });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.BRAND_SEED,
      action: nextActionFor(goal, enrichmentContext),
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'brand-seed',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return {
      type: 'orchestrate-goal',
      action: 'brand-seed',
      goalId: goal.id,
      status: 'already_set',
    };
  }

  // Phase 3: persistent team brand kit. If this user has a non-stale kit
  // from a prior goal, reuse it instead of regenerating. Keeps landing
  // pages visually consistent across goals for the same user — the
  // alternative is every goal restarting brand decisions from scratch
  // and producing a different palette/font pairing each time.
  let brand = null;
  let kitSource = 'fresh';
  try {
    if (goal.user_id && goal.data?.use_persistent_brand_kit === true) {
      const { data: kit } = await admin
        .from('team_brand_kits')
        .select('palette, fonts, vibe, mood_words, target_audience, tone, stale_at')
        .eq('user_id', goal.user_id)
        .maybeSingle();
      if (kit && Array.isArray(kit.palette) && kit.palette.length >= 3 && !kit.stale_at) {
        brand = {
          palette: kit.palette,
          fonts: Array.isArray(kit.fonts) ? kit.fonts : [],
          vibe: kit.vibe || 'modern professional',
          mood_words: Array.isArray(kit.mood_words) ? kit.mood_words : [],
          target_audience:
            kit.target_audience || 'General audience interested in the product or service.',
          tone: kit.tone || 'friendly',
        };
        kitSource = 'persistent';
        log.info(req, 'brand-seed.persistent-kit-reused', {
          goalId: goal.id,
          userId: goal.user_id,
        });
      }
    }
  } catch (kitErr) {
    log.warn(req, 'brand-seed.persistent-kit-lookup-failed', {
      goalId: goal.id,
      error: kitErr.message,
    });
  }
  if (!brand) {
    try {
      const result = await executeLlmTracked({
        prompt: [
          'Produce a brand identity for this landing-page project:',
          `Title: ${enrichmentContext.title}`,
          `Description: ${enrichmentContext.description || '(none)'}`,
          '',
          'Output this exact JSON shape (6 palette hex colors, 2 Google Fonts family names, concise strings, no prose):',
          '{',
          '  "palette": ["#hex-primary", "#hex-secondary", "#hex-accent", "#hex-bg", "#hex-text", "#hex-border"],',
          '  "fonts": ["Primary Family", "Secondary Family"],',
          '  "vibe": "2-5 words (e.g. \\"minimalist nordic\\", \\"bold luxurious\\", \\"warm artisan\\", \\"technical precise\\")",',
          '  "mood_words": ["word1", "word2", "word3", "word4"],',
          '  "target_audience": "1-sentence persona — include demographics, use case, and region if the goal mentions one",',
          '  "tone": "friendly|formal|urgent|informative|playful|authoritative"',
          '}',
          '',
          'Rules:',
          '- Palette must be cohesive — avoid default Tailwind blues unless the brand truly warrants it.',
          '- Fonts must be real Google Fonts families that load via fonts.googleapis.com.',
          '- If the project mentions a specific region/country/language, reflect that in target_audience.',
          '- Mood words drive image search — choose visual, concrete words, not abstract ones.',
          '- Keep output under 300 tokens.',
        ].join('\n'),
        systemPrompt:
          'You are a senior brand strategist. Produce a concise, distinctive brand identity. Output ONLY valid JSON matching the requested shape. No markdown, no explanation.',
        ...(authorization.enrichment?.llm
          ? { ...authorization.enrichment.llm, pinnedProvider: true }
          : pickTestModel(enrichmentContext.goal)),
        temperature: 0.5,
        maxTokens: 500,
        jsonMode: true,
        req,
        usage: {
          admin,
          userId: goal.user_id,
          goalId: goal.id,
          organizationId: goal.org_id,
          teamId: goal.agent_team_id || goal.team_id,
          consiliumId: goal.concilium_id,
          source: 'brand-seed',
          operation: 'brand-identity',
          description: `Brand seed: ${enrichmentContext.title}`,
        },
      });
      brand = parseLlmJson(result.content);
    } catch (err) {
      log.warn(req, 'brand-seed.llm-failed', { goalId: goal.id, error: err.message });
    }
  }

  // Graceful fallback — a generic seed is better than blocking the pipeline.
  if (!brand || !Array.isArray(brand.palette) || brand.palette.length < 3) {
    brand = {
      palette: ['#1E293B', '#475569', '#F59E0B', '#FAFAF9', '#0F172A', '#E2E8F0'],
      fonts: ['Inter', 'Playfair Display'],
      vibe: 'modern professional',
      mood_words: ['clean', 'trustworthy', 'modern', 'clear'],
      target_audience: 'General audience interested in the product or service.',
      tone: 'friendly',
    };
    log.info(req, 'brand-seed.fallback-used', { goalId: goal.id });
  }

  const writeAuthorization = await recheckSystemEnrichmentAuthorization({
    admin,
    goalId: goal.id,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.BRAND_SEED,
    req,
    log,
  });
  if (!writeAuthorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'brand-seed',
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
        brand_seed: brand,
        brand_seed_source: kitSource,
        ...(enrichmentContext.native ? { brand_seed_scope_hash: enrichmentContext.scopeHash } : {}),
      },
    }
  );
  if (!persisted) {
    return {
      type: 'orchestrate-goal',
      action: 'brand-seed',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }
  await logGoalEvent(admin, goal.id, 'brand_seed_created', {
    vibe: brand.vibe,
    palette_count: brand.palette.length,
    tone: brand.tone,
    source: kitSource,
  });

  const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
    admin,
    goalId: goal.id,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.BRAND_SEED,
    action: nextActionFor(goal, enrichmentContext),
    req,
    log,
  });
  if (!nextAuthorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'brand-seed',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }
  return {
    type: 'orchestrate-goal',
    action: 'brand-seed',
    goalId: goal.id,
    status: 'created',
    vibe: brand.vibe,
  };
}
