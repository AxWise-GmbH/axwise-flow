/**
 * Library Calibration — generates one sample per deliverable category, lets
 * the user comment on each via the wizard, then synthesizes Quality Criteria
 * docs that get injected into every future goal's PM and execute-phase
 * agent prompts.
 *
 * Two phases:
 *   1. 'start'      — generate 6 samples (1 per category), persist them as
 *                     knowledge_documents with category='calibration_sample'
 *   2. 'synthesize' — read all samples + user comments, call Osja, write
 *                     6 quality_criteria rows
 *
 * Triggered by:
 *   - User clicks "Run calibration" in the Library Universe tab
 *   - Auto-enqueued by osja-review.js after 20 promoted entries (drift refresh)
 *
 * The wizard polls knowledge_documents for samples by calibration_run_id,
 * lets the user write comments inline, then triggers synthesize when done.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { executeLlmV2Tracked } from '../../usage-handlers/tracked-llm.js';
import { selectBestTool, optsFromCostPreference } from '../../agent-handlers/tool-router.js';
import { listToolsForCategory } from '../../../shared/libraryMcpCatalog.js';
import {
  clearCriteriaCache,
  DELIVERABLE_TYPES,
  TYPE_LABELS,
} from '../../_shared/quality-criteria.js';
import { defaultProvider, defaultModel } from '../../_shared/llm-defaults.js';
import { resolveGoalStageLlm } from '../goal-stage-llm.js';
import {
  executeCloudflareDeploy,
  executeStabilityAi,
  executePdfGenerator,
} from '../../agent-handlers/tool-runner.js';

const log = createLogger('library-calibration');

function calibrationScope(payload = {}) {
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  if (!userId) throw new Error('Library calibration requires a tenant owner');
  return {
    userId,
    organizationId: payload.organizationId || null,
  };
}

function applyCalibrationScope(query, { userId, organizationId }) {
  const ownerQuery = query.eq('user_id', userId);
  return organizationId
    ? ownerQuery.eq('organization_id', organizationId)
    : ownerQuery.is('organization_id', null);
}

// Build the recordLlmUsage context for a calibration LLM call. Calibration is a
// user-triggered (not goal-scoped) activity, so there is no goalId — we attribute
// rows to the user. Returns undefined when no admin client is in scope so the
// tracked wrapper stays a transparent passthrough (no recording).
function calUsage(admin, userId, operation, description) {
  if (!admin) return undefined;
  return {
    admin,
    userId: userId || null,
    source: 'library-calibration',
    operation,
    description: description || `Library calibration: ${operation}`,
  };
}

// Fixed sample prompts — same prompt every run so before/after calibrations
// are comparable. Picked to be representative but achievable by free tools.
const SAMPLE_PROMPTS = {
  landing_page:
    'Build a landing page for a SaaS product called "Inboxly" — an AI email triage assistant that helps users hit inbox zero. Audience: busy founders. Single primary CTA: start free trial.',
  presentation:
    'Build a 10-slide pitch deck for "Inboxly" — AI email triage for founders. Cover the YC framework: problem, solution, why now, market, business model, traction, team, ask.',
  smm_banner:
    'Generate a 1200x630 social launch banner for "Inboxly" — AI email triage. Modern, minimal, single value-prop headline, brand-consistent color palette.',
  document_template:
    'Write a 1-page product brief for "Inboxly" using a structured template: problem statement, target user, solution overview, key features, success metrics, open questions.',
  table_structure:
    'Generate a feature comparison table for "Inboxly" vs 3 competitors (Superhuman, SaneBox, Front). Columns: feature, Inboxly, Superhuman, SaneBox, Front. Rows: 8 features.',
  code: 'Build a minimal Next.js starter for "Inboxly" — single page, hero with CTA, signup form that posts to /api/waitlist, tailwind styling. Production-ready, typed.',
  nda: 'Generate a mutual NDA for a DevOps consulting engagement between "Inboxly Inc." (the client) and "CloudShift Solutions" (the contractor). Purpose: contractor will access production Kubernetes clusters, CI/CD pipelines, and AWS accounts for infrastructure optimization. Jurisdiction: Delaware, USA. Term: 2 years.',
};

/**
 * Generate a placeholder sample. The full implementation would call the
 * actual platform tools via tool-runner. For the calibration MVP we generate
 * a text description of what each tool would produce, plus the recommended
 * tool from the free-first router. The wizard renders this description while
 * the user comments — synthesis still works because the user's comments are
 * the dominant signal (per locked decision #6).
 *
 * Uses Groq (fast + cheap) instead of Claude Sonnet to keep total parallel
 * generation under ~10 seconds. Sample quality matters less than total wall
 * time here — the human comment is what really shapes the final criteria.
 *
 * Future enhancement: invoke the real tools (deploy_site, generate_image, etc)
 * and link the produced artifact URLs into the sample row.
 */
// Centralized so the preview phase can reuse the exact same prompt template
const SAMPLE_SYSTEM_PROMPT =
  'You are a calibration sample generator. Given a deliverable prompt and a chosen tool, produce a concrete description of what the output would look like — specific layout, copy, structure, visual choices. Be opinionated and detailed. The description will be shown to a human reviewer for critique.';

function buildSampleUserPrompt(deliverableType, toolName, toolTier, samplePrompt) {
  return `Deliverable type: ${deliverableType}\nTool: ${toolName} (tier: ${toolTier})\nPrompt: ${samplePrompt}\n\nProduce a detailed description of the output as if you'd just generated it. Include specific copy, layout, visual choices, and any decisions you made. Keep it under 400 words.`;
}

// Categories that have a real artifact pipeline (URL/image/PDF). Other types
// (document/table/code) fall back to text-only descriptions.
const REAL_ARTIFACT_TYPES = new Set(['landing_page', 'smm_banner', 'presentation', 'nda']);

/**
 * Generate a real artifact for one deliverable type, optionally informed by
 * accumulated user comments. Returns { kind, url, ... } where kind is one of
 * 'site' | 'image' | 'pdf' | 'text'. The 'text' kind is the fallback for
 * categories that don't have a real generator (document/table/code) AND
 * the failure path for the others.
 *
 * Used by both handleStart (no comments yet) and handlePreview (with the
 * accumulated comment merged in). Each path is best-effort: if the real
 * artifact tool fails, returns { kind: 'text', text: '...' } so the wizard
 * can still render something.
 */
async function generateRealArtifact({
  deliverableType,
  samplePrompt,
  comment,
  runId,
  iteration,
  preferredTool,
  admin,
  userId,
}) {
  // Build a unique-but-stable project name so iterations don't collide
  const safeBase = `cal-${deliverableType}-${runId}-${iteration || 0}`.toLowerCase();

  if (deliverableType === 'smm_banner') {
    // 1) Refine the prompt for SDXL with the user's comment if any
    const refinePrompt = comment
      ? `Original brief: ${samplePrompt}\n\nUser feedback (apply this exactly):\n${comment}\n\nProduce a single-paragraph image generation prompt for SDXL. Focus on visual elements. ≤400 chars.`
      : `Original brief: ${samplePrompt}\n\nProduce a single-paragraph image generation prompt for SDXL. Focus on visual elements. ≤400 chars.`;

    let imagePrompt = '';
    try {
      const refined = await executeLlmV2Tracked({
        provider: defaultProvider(),
        model: defaultModel(),
        temperature: 0.4,
        maxTokens: 300,
        timeoutMs: 15000,
        systemPrompt:
          'You produce SDXL image prompts. Single paragraph, ≤400 characters, no preamble.',
        prompt: refinePrompt,
        usage: calUsage(admin, userId, 'banner-prompt-refine', 'Calibration: SDXL prompt refine'),
      });
      imagePrompt = (refined.content || '').trim().slice(0, 400) || samplePrompt;
    } catch {
      imagePrompt = samplePrompt;
    }

    const t0 = Date.now();
    const result = await executeStabilityAi(
      'generate_image',
      {
        projectName: safeBase,
        prompt: imagePrompt,
        aspectRatio: 'landscape',
      },
      t0
    );

    if (!result.success) {
      return {
        kind: 'text',
        text: `[Image generation failed: ${result.error}]\n\nIntended prompt:\n${imagePrompt}`,
      };
    }
    const parsed = JSON.parse(result.result);
    return {
      kind: 'image',
      url: parsed.imageUrl,
      width: parsed.width,
      height: parsed.height,
      summary: imagePrompt,
    };
  }

  if (deliverableType === 'landing_page') {
    // 1) Ask Groq to write a complete inline HTML page
    const htmlPrompt = comment
      ? `Original brief: ${samplePrompt}\n\nUser feedback (MANDATORY — apply this exactly):\n${comment}\n\nProduce a complete, standalone HTML landing page. Inline CSS in a <style> tag. No external scripts or fonts. Single file. Production-ready. Output ONLY the HTML, no markdown fences, no preamble.`
      : `Original brief: ${samplePrompt}\n\nProduce a complete, standalone HTML landing page. Inline CSS in a <style> tag. No external scripts or fonts. Single file. Production-ready. Output ONLY the HTML, no markdown fences, no preamble.`;

    let html = '';
    try {
      const htmlResult = await executeLlmV2Tracked({
        provider: defaultProvider(),
        model: defaultModel(),
        temperature: 0.3,
        maxTokens: 4000,
        timeoutMs: 30000,
        systemPrompt:
          'You are a frontend developer. You output complete, standalone HTML files with inline CSS. No preamble. No markdown fences. Just raw HTML starting with <!DOCTYPE html>.',
        prompt: htmlPrompt,
        usage: calUsage(admin, userId, 'landing-page-html', 'Calibration: landing page HTML'),
      });
      html = (htmlResult.content || '').trim();
      // Strip accidental fences
      if (html.startsWith('```')) {
        html = html
          .replace(/^```(?:html)?/i, '')
          .replace(/```$/, '')
          .trim();
      }
    } catch (err) {
      return { kind: 'text', text: `[HTML generation failed: ${err.message}]` };
    }

    if (!html.toLowerCase().includes('<html')) {
      return {
        kind: 'text',
        text: '[HTML generation produced no valid <html> tag — falling back to text]',
        preview: html.slice(0, 1000),
      };
    }

    // 2) Deploy via Cloudflare Workers
    const t0 = Date.now();
    const result = await executeCloudflareDeploy(
      'deploy_site',
      {
        projectName: safeBase,
        html,
      },
      t0
    );

    if (!result.success) {
      return {
        kind: 'text',
        text: `[Cloudflare deploy failed: ${result.error}]\n\nGenerated HTML preview:\n${html.slice(0, 1000)}`,
      };
    }
    const parsed = JSON.parse(result.result);
    return {
      kind: 'site',
      url: parsed.deploymentUrl,
      summary: `Deployed to Cloudflare: ${parsed.projectName}`,
      htmlPreview: html.slice(0, 1500),
    };
  }

  if (deliverableType === 'presentation') {
    // 1) Ask Groq to emit structured slide JSON
    const slidesPrompt = comment
      ? `Original brief: ${samplePrompt}\n\nUser feedback (MANDATORY — apply this exactly):\n${comment}\n\nProduce a JSON object for a slide deck. Schema:\n{\n  "title": "<deck title>",\n  "subtitle": "<optional subtitle>",\n  "slides": [\n    { "title": "...", "body": "...", "bullets": ["...", "..."] }\n  ]\n}\nProduce 8-12 slides. Each slide has either body OR bullets, not both. Output ONLY valid JSON, no preamble, no fences.`
      : `Original brief: ${samplePrompt}\n\nProduce a JSON object for a slide deck. Schema:\n{\n  "title": "<deck title>",\n  "subtitle": "<optional subtitle>",\n  "slides": [\n    { "title": "...", "body": "...", "bullets": ["...", "..."] }\n  ]\n}\nProduce 8-12 slides. Each slide has either body OR bullets, not both. Output ONLY valid JSON, no preamble, no fences.`;

    let deckData;
    try {
      const deckResult = await executeLlmV2Tracked({
        provider: defaultProvider(),
        model: defaultModel(),
        temperature: 0.3,
        maxTokens: 3000,
        timeoutMs: 25000,
        systemPrompt:
          'You produce structured JSON for slide decks. Output only the JSON object, no preamble, no fences.',
        prompt: slidesPrompt,
        usage: calUsage(admin, userId, 'presentation-slides-json', 'Calibration: slide deck JSON'),
      });
      let jsonText = (deckResult.content || '').trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText
          .replace(/^```(?:json)?/i, '')
          .replace(/```$/, '')
          .trim();
      }
      deckData = JSON.parse(jsonText);
    } catch (err) {
      return { kind: 'text', text: `[Slide JSON generation failed: ${err.message}]` };
    }

    if (!deckData?.title || !Array.isArray(deckData.slides) || deckData.slides.length === 0) {
      return { kind: 'text', text: '[Slide JSON missing required fields — falling back to text]' };
    }

    // 2) Render via the deck-renderer pipeline. By default produces an HTML
    //    file (uploaded to Supabase Storage as text/html, viewable in iframe).
    //    preferredTool === 'jspdf' forces the legacy jsPDF path which still
    //    returns a PDF.
    const t0 = Date.now();
    const result = await executePdfGenerator(
      'create_slides',
      {
        projectName: safeBase,
        title: deckData.title,
        subtitle: deckData.subtitle || '',
        slides: deckData.slides,
        comment: comment || null,
        preferredTool: preferredTool || null,
      },
      t0
    );

    if (!result.success) {
      return { kind: 'text', text: `[Deck generation failed: ${result.error}]` };
    }
    const parsed = JSON.parse(result.result);
    // The new renderer sets kind: 'html' and returns htmlUrl. The legacy
    // jsPDF path returns pdfUrl with no kind field. Surface both cases as
    // the wizard's existing artifact kinds: 'site' (iframe-able HTML) or
    // 'pdf' (download button).
    if (parsed.kind === 'html' && parsed.htmlUrl) {
      return {
        kind: 'site', // wizard's SitePreview iframe + open-in-tab works for any HTML URL
        url: parsed.htmlUrl,
        slideCount: parsed.slideCount,
        summary: `${deckData.title} — ${parsed.slideCount} slides (HTML deck)`,
      };
    }
    return {
      kind: 'pdf',
      url: parsed.pdfUrl,
      slideCount: parsed.slideCount,
      summary: `${deckData.title} — ${parsed.slideCount} slides`,
    };
  }

  if (deliverableType === 'nda') {
    // NDA: LLM writes structured legal HTML, uploads to Storage, returns proxy URL
    try {
      const { renderNdaViaHtml } = await import('../../_shared/nda-renderer.js');
      const ndaResult = await renderNdaViaHtml({
        projectName: safeBase,
        partyA: 'Inboxly Inc.',
        partyB: 'CloudShift Solutions',
        purpose: samplePrompt,
        jurisdiction: 'Delaware, USA',
        termYears: 2,
        additionalTerms: comment || null,
      });
      return {
        kind: 'site',
        url: ndaResult.htmlUrl,
        summary: 'Mutual NDA (HTML)',
      };
    } catch (err) {
      return { kind: 'text', text: `[NDA generation failed: ${err.message}]` };
    }
  }

  // Fallback: text-only categories (document, table, code)
  return { kind: 'text', text: null };
}

async function generateSample(
  deliverableType,
  costPreference = 'free_first',
  runId = 'init',
  admin = null,
  userId = null
) {
  const opts = optsFromCostPreference(costPreference);
  const tool = selectBestTool(deliverableType, opts);
  const prompt = SAMPLE_PROMPTS[deliverableType];
  const toolName = tool?.name || 'platform default';
  const toolTier = tool?.tier || 'paid';

  const llmSystemPrompt = SAMPLE_SYSTEM_PROMPT;
  const llmUserPrompt = buildSampleUserPrompt(deliverableType, toolName, toolTier, prompt);

  // Always generate the text description (cheap, fast, used as fallback &
  // shown when the visual category renders nothing yet).
  const llmResult = await executeLlmV2Tracked({
    provider: defaultProvider(),
    model: defaultModel(),
    temperature: 0.4,
    maxTokens: 800,
    timeoutMs: 20000,
    systemPrompt: llmSystemPrompt,
    prompt: llmUserPrompt,
    usage: calUsage(admin, userId, 'sample-description', `Calibration sample: ${deliverableType}`),
  });

  // For visual categories (landing_page, smm_banner, presentation), also
  // generate a real artifact in parallel-friendly fashion. The artifact has
  // its own retry/error handling and falls back to text if the tool fails.
  let artifact = { kind: 'text', text: null };
  if (REAL_ARTIFACT_TYPES.has(deliverableType)) {
    try {
      artifact = await generateRealArtifact({
        deliverableType,
        samplePrompt: prompt,
        comment: null,
        runId,
        iteration: 0,
        admin,
        userId,
      });
    } catch (err) {
      artifact = { kind: 'text', text: `[Real artifact generation failed: ${err.message}]` };
    }
  }

  // Audit field: top 5 tools the router considered for this category, with
  // their tier and quality_estimate. Lets the wizard show "alternatives".
  const toolAlternatives = listToolsForCategory(deliverableType)
    .map((t) => ({
      id: t.id,
      name: t.name,
      tier: t.tier,
      quality_estimate: t.quality_estimate || 0,
    }))
    .sort((a, b) => b.quality_estimate - a.quality_estimate)
    .slice(0, 5);

  return {
    deliverable_type: deliverableType,
    label: TYPE_LABELS[deliverableType],
    sample_prompt: prompt,
    tool_used: tool?.id || null,
    tool_name: toolName,
    tool_tier: toolTier,
    tool_quality_estimate: tool?.quality_estimate || null,
    description: llmResult.content,
    artifact_before: artifact, // ← real artifact for visual categories
    generated_at: new Date().toISOString(),
    // ── audit trail for the wizard ──
    tool_alternatives_considered: toolAlternatives,
    // Audit trail: report what actually ran, not a hardcoded guess.
    llm_provider: llmResult.provider || defaultProvider(),
    llm_model: llmResult.model || defaultModel(),
    llm_system_prompt: llmSystemPrompt,
    llm_user_prompt: llmUserPrompt,
  };
}

/**
 * Have a fast LLM compare the generated sample against the top library
 * anchors and emit a structured assessment for the wizard's audit panel:
 *   { score: 0-100, summary: "1-2 sentences", gaps: ["...", "..."] }
 *
 * This is a mini-Osja read — gives the user a starting point for their
 * comment ("the system thinks the sample is missing X — do I agree?"),
 * not a verdict that gets persisted into criteria. Cost: ~$0.001 per call
 * (Groq llama, ~600 tokens). Runs in parallel with sample generation.
 */
async function assessSampleAgainstLibrary({ deliverableType, sampleText, anchors, admin, userId }) {
  if (!sampleText || !anchors || anchors.length === 0) {
    return {
      score: null,
      summary: 'No library anchors available for this category — assessment skipped.',
      gaps: [],
    };
  }

  const anchorBlocks = anchors
    .slice(0, 3)
    .map(
      (a, i) =>
        `Anchor ${i + 1}: ${a.brand || a.title} (score ${a.quality_score}/100)\n  Why it's great: ${a.what_makes_it_great}`
    )
    .join('\n\n');

  const systemPrompt =
    'You are a strict design critic. You compare a generated deliverable description against best-in-class library anchors and emit a JSON verdict. Be honest and specific. Output ONLY valid JSON, no markdown fences, no preamble.';

  const userPrompt = `Compare this generated ${deliverableType} sample against the library anchors. Return your verdict as JSON.

## Generated sample
${sampleText.slice(0, 2000)}

## Library anchors
${anchorBlocks}

## Required JSON shape
{
  "score": <0-100 — how close is the sample to library quality?>,
  "summary": "<1-2 sentence verdict>",
  "gaps": ["<specific gap 1>", "<specific gap 2>", "<specific gap 3>"]
}

Scoring: 95+ = library-grade. 85-94 = strong. 70-84 = competent. <70 = significant gaps.`;

  try {
    const llmResult = await executeLlmV2Tracked({
      provider: defaultProvider(),
      model: defaultModel(),
      temperature: 0.2,
      maxTokens: 600,
      timeoutMs: 15000,
      systemPrompt,
      prompt: userPrompt,
      usage: calUsage(
        admin,
        userId,
        'sample-assessment',
        `Calibration assessment: ${deliverableType}`
      ),
    });

    let jsonText = (llmResult.content || '').trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();
    }
    const parsed = JSON.parse(jsonText);

    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      summary: String(parsed.summary || '').slice(0, 400),
      gaps: Array.isArray(parsed.gaps)
        ? parsed.gaps.slice(0, 5).map((g) => String(g).slice(0, 200))
        : [],
    };
  } catch (err) {
    return {
      score: null,
      summary: `Assessment failed: ${err.message}`,
      gaps: [],
    };
  }
}

/**
 * Pre-fetch the top 3 library anchors for one deliverable type. Stashed on
 * the sample row so the wizard's ANCHOR column has zero extra DB calls.
 */
async function loadAnchorsForType(admin, deliverableType, scope) {
  const anchors = await loadCalibrationAnchors(
    admin,
    deliverableType,
    scope,
    'id, title, content, metadata, source'
  );

  return anchors.map((a) => ({
    id: a.id,
    title: a.title,
    brand: a.metadata?.brand || null,
    asset_url: a.metadata?.asset_url || a.source || null,
    preview_url: a.metadata?.preview_url || null,
    quality_score: a.metadata?.quality_score || 0,
    what_makes_it_great: a.metadata?.what_makes_it_great || a.content || '',
  }));
}

async function loadCalibrationAnchors(admin, deliverableType, scope, columns) {
  let tenantQuery = admin
    .from('knowledge_documents')
    .select(columns)
    .eq('category', 'library_example')
    .eq('metadata->>deliverable_type', deliverableType);
  tenantQuery = applyCalibrationScope(tenantQuery, scope);

  // Migration 100 exposes a system-owned curated corpus to every authenticated
  // tenant. Keep it in a separate exact branch so the service-role client never
  // widens the private branch to another user's examples.
  const publicQuery = admin
    .from('knowledge_documents')
    .select(columns)
    .eq('category', 'library_example')
    .eq('metadata->>deliverable_type', deliverableType)
    .eq('metadata->>source', 'curated')
    .is('user_id', null)
    .is('organization_id', null);

  const [{ data: tenantAnchors, error: tenantError }, { data: publicAnchors, error: publicError }] =
    await Promise.all([
      tenantQuery.order('metadata->quality_score', { ascending: false }).limit(3),
      publicQuery.order('metadata->quality_score', { ascending: false }).limit(3),
    ]);
  if (tenantError) throw tenantError;
  if (publicError) throw publicError;

  const byId = new Map();
  for (const anchor of [...(tenantAnchors || []), ...(publicAnchors || [])]) {
    const key = anchor.id || `${anchor.title}:${anchor.metadata?.quality_score || 0}`;
    if (!byId.has(key)) byId.set(key, anchor);
  }
  return [...byId.values()]
    .sort(
      (left, right) =>
        Number(right.metadata?.quality_score || 0) - Number(left.metadata?.quality_score || 0)
    )
    .slice(0, 3);
}

/**
 * Phase 1: pre-generate all 6 samples and persist them. The wizard then
 * loads samples by calibration_run_id and shows them to the user.
 */
async function handleStart(admin, payload, req) {
  const scope = calibrationScope(payload);
  const { userId, organizationId } = scope;
  const costPreference = payload.costPreference || 'free_first';
  const calibrationRunId = `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  log.info(req, 'calibration.start', { calibrationRunId, costPreference });

  // For each deliverable type: in parallel run sample generation + anchor
  // load, then once both finish run the library alignment assessment.
  // All 6 categories run concurrently. Total wall time ≈ slowest pipeline
  // (sample gen ~5-10s + assessment ~3-5s = ~10-15s).
  // Short tag from the run id for use as part of cloudflare/storage project names
  const runTag = calibrationRunId.replace(/^cal_/, '').slice(0, 12);

  const sampleRecords = await Promise.all(
    DELIVERABLE_TYPES.map(async (type) => {
      // Phase A: sample + anchors in parallel
      const [sampleResult, anchorsResult] = await Promise.allSettled([
        generateSample(type, costPreference, runTag, admin, userId),
        loadAnchorsForType(admin, type, scope),
      ]);

      const sample =
        sampleResult.status === 'fulfilled'
          ? sampleResult.value
          : {
              deliverable_type: type,
              label: TYPE_LABELS[type],
              sample_prompt: SAMPLE_PROMPTS[type],
              description: `[Sample generation failed: ${sampleResult.reason?.message || 'unknown error'}. You can still leave a comment below describing what you'd want for ${TYPE_LABELS[type]}.]`,
              tool_used: null,
              tool_name: 'unknown',
              tool_tier: 'unknown',
              tool_quality_estimate: null,
              artifact_before: { kind: 'text', text: null },
              generated_at: new Date().toISOString(),
              tool_alternatives_considered: [],
              llm_provider: null,
              llm_model: null,
              llm_system_prompt: null,
              llm_user_prompt: null,
            };

      const anchors = anchorsResult.status === 'fulfilled' ? anchorsResult.value : [];
      if (anchorsResult.status === 'rejected') {
        log.warn(req, 'calibration.anchors-load-failed', {
          type,
          error: anchorsResult.reason?.message,
        });
      }
      if (sampleResult.status === 'rejected') {
        log.warn(req, 'calibration.sample-failed', { type, error: sampleResult.reason?.message });
      }

      // Phase B: assess sample against anchors (mini-Osja read for the audit panel)
      let library_alignment;
      try {
        library_alignment = await assessSampleAgainstLibrary({
          deliverableType: type,
          sampleText: sample.description,
          anchors,
          admin,
          userId,
        });
      } catch (err) {
        log.warn(req, 'calibration.assessment-failed', { type, error: err.message });
        library_alignment = { score: null, summary: `Assessment failed: ${err.message}`, gaps: [] };
      }

      return { sample, anchors, library_alignment };
    })
  );

  // Persist each sample as a knowledge_documents row, attaching the anchors
  // and the library_alignment assessment so the wizard renders zero extra
  // DB or LLM calls per step.
  const rows = sampleRecords.map(({ sample, anchors, library_alignment }) => ({
    user_id: userId,
    organization_id: organizationId,
    title: `Calibration sample — ${sample.label}`,
    content: sample.description,
    source: 'calibration',
    category: 'calibration_sample',
    metadata: {
      ...sample,
      library_anchors: anchors,
      library_alignment,
      calibration_run_id: calibrationRunId,
      user_comment: null,
    },
    content_type: 'note',
    tags: ['calibration', sample.deliverable_type],
  }));

  const { data: inserted, error } = await admin.from('knowledge_documents').insert(rows).select();

  if (error) {
    log.error(req, 'calibration.persist-failed', { error: error.message });
    throw new Error(`Failed to persist calibration samples: ${error.message}`);
  }

  log.info(req, 'calibration.samples-ready', { calibrationRunId, count: inserted.length });

  // Set the calibration mode flag so the UI knows to show the wizard
  await setCalibrationMode(admin, scope, 'comment', calibrationRunId);

  return {
    type: 'library-calibration',
    phase: 'start',
    calibrationRunId,
    sampleCount: inserted.length,
    samples: inserted.map((r) => ({ id: r.id, deliverable_type: r.metadata.deliverable_type })),
  };
}

/**
 * Phase 2: read all samples + comments for a calibration run, ask Osja to
 * synthesize 6 Quality Criteria docs, write them to knowledge_documents.
 */
async function handleSynthesize(admin, payload, req) {
  const { calibrationRunId } = payload;
  if (!calibrationRunId) throw new Error('Missing calibrationRunId for synthesize phase');
  const scope = calibrationScope(payload);
  const { userId, organizationId } = scope;

  log.info(req, 'calibration.synthesize.start', { calibrationRunId });

  // Load samples for this run
  let samplesQuery = admin
    .from('knowledge_documents')
    .select('*')
    .eq('category', 'calibration_sample')
    .eq('metadata->>calibration_run_id', calibrationRunId);
  samplesQuery = applyCalibrationScope(samplesQuery, scope);
  const { data: samples, error: loadErr } = await samplesQuery;

  if (loadErr) throw new Error(`Failed to load samples: ${loadErr.message}`);
  if (!samples || samples.length === 0)
    throw new Error(`No samples found for run ${calibrationRunId}`);

  // For each deliverable type, load top 3 library anchors so Osja can compare
  const criteriaDocs = [];
  for (const sample of samples) {
    const dType = sample.metadata.deliverable_type;

    const anchors = await loadCalibrationAnchors(
      admin,
      dType,
      scope,
      'id, title, content, metadata'
    );

    const userComment = sample.metadata.user_comment || '(no comment provided)';

    // Ask Osja to synthesize criteria for this category
    const synthesisPrompt = buildSynthesisPrompt({
      deliverableType: dType,
      label: TYPE_LABELS[dType],
      sample: sample,
      anchors,
      userComment,
    });

    let criteriaText = '';
    try {
      const llmResult = await executeLlmV2Tracked({
        ...resolveGoalStageLlm(),
        temperature: 0.2,
        maxTokens: 1200,
        systemPrompt: OSJA_SYNTHESIS_SYSTEM_PROMPT,
        prompt: synthesisPrompt,
        usage: calUsage(admin, userId, 'criteria-synthesis', `Calibration synthesis: ${dType}`),
      });
      criteriaText = (llmResult.content || '').trim();
    } catch (err) {
      log.warn(req, 'calibration.synthesis-failed', { type: dType, error: err.message });
      criteriaText = `[Synthesis failed for ${TYPE_LABELS[dType]}: ${err.message}]`;
    }

    criteriaDocs.push({
      deliverable_type: dType,
      criteria_text: criteriaText,
      had_user_comment: !!sample.metadata.user_comment,
    });
  }

  // Upsert criteria rows: delete any existing for these types, then insert new
  const existingTypes = criteriaDocs.map((c) => c.deliverable_type);
  let deleteQuery = admin
    .from('knowledge_documents')
    .delete()
    .eq('category', 'quality_criteria')
    .in('metadata->>deliverable_type', existingTypes);
  deleteQuery = applyCalibrationScope(deleteQuery, scope);
  const { error: deleteErr } = await deleteQuery;
  if (deleteErr) {
    throw new Error(`Failed to replace criteria: ${deleteErr.message}`);
  }

  const rowsToInsert = criteriaDocs.map((c) => ({
    user_id: userId,
    organization_id: organizationId,
    title: `Quality Criteria — ${TYPE_LABELS[c.deliverable_type]}`,
    content: c.criteria_text,
    source: 'osja-calibration',
    category: 'quality_criteria',
    metadata: {
      deliverable_type: c.deliverable_type,
      calibration_run_id: calibrationRunId,
      had_user_comment: c.had_user_comment,
      generated_at: new Date().toISOString(),
    },
    content_type: 'note',
    tags: ['quality-criteria', c.deliverable_type],
  }));

  const { error: insertErr } = await admin.from('knowledge_documents').insert(rowsToInsert);

  if (insertErr) {
    log.error(req, 'calibration.criteria-insert-failed', { error: insertErr.message });
    throw new Error(`Failed to write criteria: ${insertErr.message}`);
  }

  // Flip flag back to observe; clear in-memory cache so next pm-planning picks up new criteria
  await setCalibrationMode(admin, scope, 'observe', null);
  clearCriteriaCache({ userId, organizationId });

  log.info(req, 'calibration.synthesize.done', {
    calibrationRunId,
    criteriaCount: criteriaDocs.length,
  });

  return {
    type: 'library-calibration',
    phase: 'synthesize',
    calibrationRunId,
    criteriaCount: criteriaDocs.length,
    deliverableTypes: existingTypes,
  };
}

const OSJA_SYNTHESIS_SYSTEM_PROMPT = `You are Osja, a General Manager focused on shipping library-grade deliverables.

Your job: synthesize Quality Criteria for a single deliverable category, drawing from:
1. A generated sample (what the platform produces today)
2. Top 3 library anchors (best-in-class references)
3. A user comment expressing their personal taste preferences

CRITICAL RULES:
- The user comment is the dominant signal. Weight it 2× heavier than your own observations of failure modes in the sample.
- Output a tight imperative criteria block in markdown. ≤25 lines. Each line is one rule.
- Use second-person imperative: "Use a single primary CTA above the fold." NOT "The page should have a CTA."
- No preamble, no explanation, no closing remarks. Just the criteria list.
- Cover: structure, copy style, visual hierarchy, what to include, what to avoid.
- If the user comment was empty or trivial, fall back to extracting criteria from the gap between the sample and the anchors.`;

function buildSynthesisPrompt({ deliverableType, label, sample, anchors, userComment }) {
  const anchorBlocks = anchors
    .map((a, i) => {
      const meta = a.metadata || {};
      return `### Anchor ${i + 1}: ${a.title}\nQuality score: ${meta.quality_score || '?'}/100\nWhy it's great: ${meta.what_makes_it_great || a.content || ''}\nRecreate prompt: ${meta.recreate_prompt || '(none)'}`;
    })
    .join('\n\n');

  return `Synthesize Quality Criteria for: **${label}** (type: ${deliverableType})

## The generated sample
Tool used: ${sample.metadata.tool_name} (tier: ${sample.metadata.tool_tier})
Prompt: ${sample.metadata.sample_prompt}

Output description:
${sample.content}

## Library anchors (best-in-class references)

${anchorBlocks || '(no anchors available — fall back to general best practices)'}

## User's comment on the sample (HIGHEST PRIORITY SIGNAL)
${userComment}

---

Now produce the Quality Criteria block for ${label}. Imperative, ≤25 lines, second-person, no preamble.`;
}

/**
 * Set the calibration mode flag. Stored as a knowledge_documents row with
 * category='system_flag' so we don't need a new table.
 */
async function setCalibrationMode(admin, scope, mode, calibrationRunId) {
  let deleteQuery = admin
    .from('knowledge_documents')
    .delete()
    .eq('category', 'system_flag')
    .eq('source', 'library_calibration_mode');
  deleteQuery = applyCalibrationScope(deleteQuery, scope);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error(`Failed to update calibration mode: ${deleteError.message}`);

  await admin.from('knowledge_documents').insert({
    user_id: scope.userId,
    organization_id: scope.organizationId,
    title: 'Library Calibration Mode',
    content: mode,
    source: 'library_calibration_mode',
    category: 'system_flag',
    metadata: { mode, active_run_id: calibrationRunId },
    content_type: 'note',
    tags: ['system'],
  });
}

/**
 * Phase 3: 'preview' — regenerate one sample with the user's comment merged
 * into the prompt. For visual categories (landing_page, smm_banner,
 * presentation), this produces a real artifact (Cloudflare URL / image / PDF).
 * For text categories, returns regenerated text only. Used by the wizard's
 * "Iterate" button. Display-only — the result is not persisted into the
 * sample row, but it IS persisted into a sibling iteration row so iterations
 * can be reviewed.
 */
async function handlePreview(admin, payload, req) {
  const { sampleId, comment, iteration = 1, preferredTool = null } = payload;
  if (!sampleId) throw new Error('Missing sampleId for preview phase');
  if (!comment?.trim()) throw new Error('Missing comment for preview phase');
  const scope = calibrationScope(payload);

  let sampleQuery = admin
    .from('knowledge_documents')
    .select('content, metadata, user_id, organization_id')
    .eq('id', sampleId)
    .eq('category', 'calibration_sample');
  sampleQuery = applyCalibrationScope(sampleQuery, scope);
  const { data: sample, error: loadErr } = await sampleQuery.single();

  if (loadErr || !sample) throw new Error(`Sample not found: ${loadErr?.message || sampleId}`);
  const previewUserId = scope.userId;

  const meta = sample.metadata || {};
  const dType = meta.deliverable_type || 'document_template';
  const toolName = meta.tool_name || 'platform default';
  const toolTier = meta.tool_tier || 'paid';
  const originalPrompt = meta.sample_prompt || '';
  const calibrationRunId = meta.calibration_run_id || 'preview';
  const runTag = String(calibrationRunId).replace(/^cal_/, '').slice(0, 12);

  log.info(req, 'calibration.preview.start', { sampleId, dType, iteration });

  // Always regenerate the text description (used as fallback + for text-only categories)
  const llmResult = await executeLlmV2Tracked({
    provider: defaultProvider(),
    model: defaultModel(),
    temperature: 0.4,
    maxTokens: 800,
    timeoutMs: 20000,
    systemPrompt:
      'You are a calibration sample generator. Same task as before — describe what the deliverable would look like — but this time you have explicit user feedback that you MUST incorporate. Do not ignore the feedback. Lead your response with a 1-sentence note saying which specific feedback items you applied and how.',
    prompt: `Deliverable type: ${dType}\nTool: ${toolName} (tier: ${toolTier})\nOriginal prompt: ${originalPrompt}\n\nUser feedback (apply this exactly):\n${comment}\n\nProduce the improved description, ≤400 words. Lead with a 1-line note on what specifically you changed in response to the feedback.`,
    usage: calUsage(admin, previewUserId, 'preview-regen', `Calibration preview: ${dType}`),
  });

  // For visual categories, also produce a real artifact informed by the comment
  let artifact = { kind: 'text', text: null };
  if (REAL_ARTIFACT_TYPES.has(dType)) {
    try {
      artifact = await generateRealArtifact({
        deliverableType: dType,
        samplePrompt: originalPrompt,
        comment,
        runId: runTag,
        iteration,
        preferredTool,
        admin,
        userId: previewUserId,
      });
    } catch (err) {
      log.warn(req, 'calibration.preview.artifact-failed', { error: err.message });
      artifact = { kind: 'text', text: `[Real artifact regeneration failed: ${err.message}]` };
    }
  }

  return {
    type: 'library-calibration',
    phase: 'preview',
    sampleId,
    iteration,
    improvedDescription: llmResult.content || '',
    originalDescription: sample.content || '',
    artifact_after: artifact,
  };
}

/**
 * Main handler — dispatched from job-processor for type='library-calibration'.
 */
export async function handle(admin, payload, req) {
  const phase = payload.phase || 'start';

  if (phase === 'start') return handleStart(admin, payload, req);
  if (phase === 'preview') return handlePreview(admin, payload, req);
  if (phase === 'synthesize') return handleSynthesize(admin, payload, req);
  throw new Error(
    `Unknown calibration phase: ${phase}. Expected 'start', 'preview', or 'synthesize'.`
  );
}
