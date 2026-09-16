/**
 * Vision QA tool — screenshots a deployed page at 3 breakpoints, sends them to
 * Claude vision along with the design brief, and returns a structured score +
 * categorized failures the QA agent can act on.
 *
 * Closes the design-blind gap in the existing pipeline: today nothing in
 * Designer → Developer → QA actually *sees* the rendered page. The PM
 * reviewer only reads markdown; the html-critic only checks structure; the
 * Developer deploys and gets a URL back. With this tool, the existing QA
 * agent calls `tool_vision_qa__compare` during Phase 3 and gets back
 * structured failure categories (mobile_overflow, contrast_fail,
 * palette_mismatch, typography_mismatch, spacing_issue, image_quality,
 * cta_invisible) instead of prose feedback.
 *
 * Screenshot provider: Cloudflare Browser Rendering API
 * (https://api.cloudflare.com/client/v4/accounts/{accountId}/browser-rendering/screenshot).
 * Same account/credentials the existing tool-cloudflare-pages already uses.
 *
 * Vision LLM: Anthropic Sonnet 5 via the Messages API directly. The existing
 * executeLlm doesn't support multimodal content arrays, so this tool hits
 * the API directly — same pattern internal tools use for other specialised calls.
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('vision-qa-tool');

const ANTHROPIC_VISION_URL = 'https://api.anthropic.com/v1/messages';
const GROQ_VISION_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_VISION_URL = 'https://api.openai.com/v1/chat/completions';

// Provider priority: Groq is free and fast (Llama 3.2 Vision), so it goes
// first for local dev. OpenAI gpt-4o-mini is cheap. Anthropic Sonnet is best
// quality but most expensive — used last unless explicitly forced via
// VISION_QA_PROVIDER env var. Note: the Claude Max/Pro subscription via the
// Agent SDK is TEXT-ONLY — there is no way to route vision through it.
const VISION_PROVIDERS = [
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    url: GROQ_VISION_URL,
    model: 'llama-3.2-90b-vision-preview',
    isAnthropic: false,
    cost: 'free',
  },
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    url: OPENAI_VISION_URL,
    model: 'gpt-4o-mini',
    isAnthropic: false,
    cost: 'low',
  },
  {
    name: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    url: ANTHROPIC_VISION_URL,
    model: 'claude-sonnet-5',
    isAnthropic: true,
    cost: 'high',
  },
];

/**
 * Choose the vision provider to use for this call.
 *   - VISION_QA_PROVIDER=<name>  → force that one (errors if its key is missing)
 *   - otherwise: first provider in priority order whose env key is set
 *   - returns null if no provider is available
 */
function pickVisionProvider() {
  const forced = (process.env.VISION_QA_PROVIDER || '').trim().toLowerCase();
  if (forced) {
    const found = VISION_PROVIDERS.find((p) => p.name === forced);
    if (found && process.env[found.envKey]) return found;
    return null;
  }
  for (const p of VISION_PROVIDERS) {
    if (process.env[p.envKey]) return p;
  }
  return null;
}

const CF_BROWSER_RENDERING_URL = (accountId) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`;

const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

const VISION_BUCKET = 'goal-deliverables';

const FAILURE_CATEGORIES = [
  'mobile_overflow',
  'contrast_fail',
  'palette_mismatch',
  'typography_mismatch',
  'spacing_issue',
  'image_quality',
  'cta_invisible',
  'hero_blank',
  'layout_broken',
  'localization_visible_fail',
];

/**
 * Capture one screenshot via Cloudflare Browser Rendering API.
 * Returns the raw PNG buffer on success, null on failure.
 */
async function captureScreenshot({ url, width, height, accountId, apiToken }) {
  try {
    const res = await fetchWithRetry(
      CF_BROWSER_RENDERING_URL(accountId),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          viewport: { width, height },
          screenshotOptions: { fullPage: false, type: 'png' },
          gotoOptions: { waitUntil: 'networkidle0', timeout: 20000 },
        }),
      },
      { timeoutMs: 30000, retries: 1 },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log.warn(null, 'vision-qa.screenshot.http-error', {
        status: res.status, body: errText.slice(0, 200), width, height,
      });
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    log.warn(null, 'vision-qa.screenshot.exception', { error: err.message, width, height });
    return null;
  }
}

/**
 * Upload a PNG buffer to Supabase Storage and return its public URL.
 */
async function uploadScreenshot({ admin, buffer, goalId, viewportName }) {
  try {
    try {
      const { data: existing } = await admin.storage.getBucket(VISION_BUCKET);
      if (!existing) await admin.storage.createBucket(VISION_BUCKET, { public: true });
    } catch { /* idempotent */ }

    const ts = Date.now().toString(36);
    const path = `vision-qa/${goalId || 'unscoped'}/${viewportName}-${ts}.png`;
    const { error } = await admin.storage.from(VISION_BUCKET).upload(path, buffer, {
      contentType: 'image/png', upsert: false,
    });
    if (error) {
      log.warn(null, 'vision-qa.upload.failed', { error: error.message, path });
      return null;
    }
    const { data: urlData } = admin.storage.from(VISION_BUCKET).getPublicUrl(path);
    return urlData?.publicUrl || null;
  } catch (err) {
    log.warn(null, 'vision-qa.upload.exception', { error: err.message });
    return null;
  }
}

/**
 * Build the vision LLM prompt that asks for structured failures.
 */
function buildVisionSystemPrompt() {
  return [
    'You are a senior design QA reviewer evaluating a deployed landing page against its design brief.',
    'You receive screenshots at 3 viewports (desktop 1920, tablet 768, mobile 375) and the markdown design brief.',
    'Score the rendered page 0-100 on visual adherence to the brief AND general design quality (contrast, typography, spacing, hierarchy, image fit).',
    '',
    'Return STRICT JSON only — no markdown fences, no commentary. Schema:',
    '{',
    '  "score": 0-100,',
    '  "summary": "1-2 sentence overall assessment",',
    '  "failures": [',
    '    {',
    '      "category": "mobile_overflow|contrast_fail|palette_mismatch|typography_mismatch|spacing_issue|image_quality|cta_invisible|hero_blank|layout_broken|localization_visible_fail",',
    '      "severity": "low|medium|high",',
    '      "viewport": "desktop|tablet|mobile|all",',
    '      "location": "short description of where on the page (e.g. \\"hero CTA button\\", \\"feature card 2\\")",',
    '      "details": "what is wrong, 1-2 sentences",',
    '      "suggestion": "what the agent should change, actionable, 1 sentence"',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- If everything looks good, return failures: [].',
    '- Cap severity:"high" failures at issues that visibly break the page (text overflow, invisible CTA, missing hero).',
    '- Compare colors and typography against the brief — do NOT invent a "brand" the brief did not specify.',
    '- Be specific. "Page looks plain" is not actionable; "Hero background is white, brief specified gradient" is.',
  ].join('\n');
}

/**
 * Build the user content array in the shape the chosen provider expects.
 *
 * Anthropic: { type: 'image', source: { type: 'base64', media_type, data } }
 * OpenAI/Groq: { type: 'image_url', image_url: { url: 'data:image/png;base64,…' } }
 */
function buildVisionContent({ screenshots, designBrief, isAnthropic }) {
  const content = [];
  for (const shot of screenshots) {
    content.push({
      type: 'text',
      text: `[Screenshot at ${shot.viewport} viewport — width ${shot.width}px]`,
    });
    if (isAnthropic) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: shot.base64 },
      });
    } else {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${shot.base64}` },
      });
    }
  }
  content.push({
    type: 'text',
    text: [
      '## Design brief',
      '',
      designBrief.slice(0, 8000),
      '',
      'Now score the page and return the strict JSON specified.',
    ].join('\n'),
  });
  return content;
}

/**
 * Call the chosen vision provider with image content blocks + the design brief.
 * Returns { text, usage } regardless of provider.
 */
async function runVisionCompare({ screenshots, designBrief, provider }) {
  const apiKey = process.env[provider.envKey];
  const isAnthropic = provider.isAnthropic;
  const systemPrompt = buildVisionSystemPrompt();
  const content = buildVisionContent({ screenshots, designBrief, isAnthropic });

  let body;
  let headers;
  if (isAnthropic) {
    body = JSON.stringify({
      model: provider.model,
      max_tokens: 2000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    });
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  } else {
    // OpenAI-compatible (Groq, OpenAI): system is a message, response_format
    // optional. Groq's vision-preview models don't accept response_format,
    // so we lean on the prompt to enforce JSON.
    body = JSON.stringify({
      model: provider.model,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    });
    headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  const res = await fetchWithRetry(
    provider.url,
    { method: 'POST', headers, body },
    { timeoutMs: 45000, retries: 1 },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Vision API ${provider.name} ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();

  let text;
  let usage;
  if (isAnthropic) {
    text = data.content?.[0]?.text || '';
    usage = {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    };
  } else {
    text = data.choices?.[0]?.message?.content || '';
    usage = {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
    };
  }
  return { text, usage };
}

function parseVisionResponse(text) {
  if (!text || typeof text !== 'string') return null;
  // Strip code fences if the model still wrapped the JSON
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    return JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
}

function normalizeFailures(failures) {
  if (!Array.isArray(failures)) return [];
  return failures
    .filter((f) => f && typeof f === 'object')
    .map((f) => ({
      category: FAILURE_CATEGORIES.includes(f.category) ? f.category : 'layout_broken',
      severity: ['low', 'medium', 'high'].includes(f.severity) ? f.severity : 'medium',
      viewport: ['desktop', 'tablet', 'mobile', 'all'].includes(f.viewport) ? f.viewport : 'all',
      location: typeof f.location === 'string' ? f.location.slice(0, 200) : '',
      details: typeof f.details === 'string' ? f.details.slice(0, 500) : '',
      suggestion: typeof f.suggestion === 'string' ? f.suggestion.slice(0, 500) : '',
    }));
}

/**
 * Persist the QA result for audit + Phase 3 learning loop.
 */
async function persistResult({ admin, goalId, iteration, deploymentUrl, score, summary, failures, screenshotUrls, modelName, modelUsage }) {
  try {
    const { error } = await admin.from('design_qa_results').insert({
      goal_id: goalId || null,
      iteration: iteration ?? null,
      deployment_url: deploymentUrl,
      score,
      summary,
      failures,
      screenshot_urls: screenshotUrls,
      model: modelName,
      input_tokens: modelUsage?.input_tokens || 0,
      output_tokens: modelUsage?.output_tokens || 0,
    });
    if (error) log.warn(null, 'vision-qa.persist.failed', { error: error.message, goalId });
  } catch (err) {
    log.warn(null, 'vision-qa.persist.exception', { error: err.message });
  }
}

/**
 * Build the human-readable result the agent reads back from the tool.
 */
function buildAgentMessage({ score, summary, failures }) {
  if (!failures.length) {
    return JSON.stringify({
      score, summary,
      passed: score >= 70,
      failures: [],
      message: `Vision QA passed (${score}/100). ${summary}`,
    });
  }
  const grouped = failures.reduce((acc, f) => {
    (acc[f.severity] ||= []).push(f);
    return acc;
  }, {});
  const lines = [];
  for (const sev of ['high', 'medium', 'low']) {
    for (const f of grouped[sev] || []) {
      lines.push(`- [${sev}/${f.viewport}] ${f.category} @ ${f.location || 'unspecified'}: ${f.details} → ${f.suggestion}`);
    }
  }
  return JSON.stringify({
    score,
    summary,
    passed: score >= 70 && !failures.some((f) => f.severity === 'high'),
    failures,
    message: `Vision QA score ${score}/100. ${summary}\nIssues:\n${lines.join('\n')}`,
  });
}

/**
 * Execute tool_vision_qa__compare.
 *
 * @param {object} opts
 * @param {string} opts.endpointName - Must be 'compare'
 * @param {object} opts.args - { deploymentUrl, designBrief, goalId?, iteration?, viewports? }
 * @param {number} opts.start - Start timestamp for durationMs
 * @returns {Promise<{success, result, error?, durationMs}>}
 */
export async function executeVisionQa({ endpointName, args, start }) {
  if (endpointName !== 'compare') {
    return { success: false, result: null, error: `Unknown vision-qa endpoint: ${endpointName}`, durationMs: Date.now() - start };
  }

  const { deploymentUrl, designBrief, goalId, iteration, viewports } = args || {};

  if (!deploymentUrl || typeof deploymentUrl !== 'string') {
    return { success: false, result: null, error: 'Missing required parameter: deploymentUrl', durationMs: Date.now() - start };
  }
  if (!designBrief || typeof designBrief !== 'string') {
    return { success: false, result: null, error: 'Missing required parameter: designBrief (the markdown design brief from Phase 1)', durationMs: Date.now() - start };
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !cfToken) {
    return {
      success: false, result: null,
      error: 'Vision QA needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (for screenshots via Browser Rendering API). Same credentials the deploy tool uses.',
      durationMs: Date.now() - start,
    };
  }

  // Provider picker: Groq (free) → OpenAI (cheap) → Anthropic (best quality).
  // Override via VISION_QA_PROVIDER=groq|openai|anthropic. The Claude Max
  // subscription cannot serve vision — the Agent SDK is text-only.
  const provider = pickVisionProvider();
  if (!provider) {
    return {
      success: false, result: null,
      error: 'Vision QA needs at least one of GROQ_API_KEY (free Llama 3.2 Vision), OPENAI_API_KEY (gpt-4o-mini), or ANTHROPIC_API_KEY (claude-sonnet-5). Groq is free for local dev.',
      durationMs: Date.now() - start,
    };
  }

  const useViewports = Array.isArray(viewports) && viewports.length
    ? viewports.filter((v) => v && typeof v.width === 'number' && typeof v.height === 'number')
    : DEFAULT_VIEWPORTS;

  const admin = buildSupabaseAdminClient();

  // Capture screenshots in parallel — each takes ~5-10s, doing them serial
  // would blow the agent's tool-budget window.
  const captureResults = await Promise.all(
    useViewports.map(async (v) => {
      const buffer = await captureScreenshot({
        url: deploymentUrl, width: v.width, height: v.height, accountId, apiToken: cfToken,
      });
      if (!buffer) return null;
      const publicUrl = await uploadScreenshot({
        admin, buffer, goalId, viewportName: v.name || `w${v.width}`,
      });
      return {
        viewport: v.name || `w${v.width}`,
        width: v.width,
        height: v.height,
        base64: buffer.toString('base64'),
        url: publicUrl,
      };
    }),
  );

  const screenshots = captureResults.filter(Boolean);
  if (screenshots.length === 0) {
    return {
      success: false, result: null,
      error: 'Failed to capture any screenshots — Cloudflare Browser Rendering returned errors for every viewport. Check that the deployment URL is publicly reachable.',
      durationMs: Date.now() - start,
    };
  }

  let visionResult;
  try {
    visionResult = await runVisionCompare({ screenshots, designBrief, provider });
  } catch (err) {
    return { success: false, result: null, error: `Vision LLM call failed (${provider.name}): ${err.message}`, durationMs: Date.now() - start };
  }

  const parsed = parseVisionResponse(visionResult.text);
  if (!parsed) {
    return {
      success: false, result: null,
      error: `Vision LLM returned unparseable response: ${visionResult.text.slice(0, 200)}`,
      durationMs: Date.now() - start,
    };
  }

  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
  const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '';
  const failures = normalizeFailures(parsed.failures);
  const screenshotUrls = screenshots.map((s) => ({ viewport: s.viewport, width: s.width, url: s.url }));

  await persistResult({
    admin, goalId, iteration, deploymentUrl, score, summary, failures, screenshotUrls,
    modelName: provider.model,
    modelUsage: visionResult.usage,
  });

  log.info(null, 'vision-qa.complete', {
    goalId, deploymentUrl, score, failureCount: failures.length,
    highSev: failures.filter((f) => f.severity === 'high').length,
    provider: provider.name, model: provider.model,
  });

  const message = buildAgentMessage({ score, summary, failures });

  return {
    success: true,
    result: message,
    durationMs: Date.now() - start,
  };
}

export const VISION_QA_FAILURE_CATEGORIES = FAILURE_CATEGORIES;
