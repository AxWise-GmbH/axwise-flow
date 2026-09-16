/**
 * Landing pages handler — CRUD + deploy + AI-edit for the GrapesJS page builder.
 *
 * Routes (via query param `op`):
 *   GET  ?op=list              — List user's landing pages
 *   GET  ?op=get&id=           — Get single page (GrapesJS JSON + HTML)
 *   POST ?op=create            — Create new page (from agent output or blank)
 *   PATCH ?op=save&id=         — Save GrapesJS editor state
 *   POST ?op=deploy&id=        — Deploy HTML to Cloudflare Workers
 *   POST ?op=ai-edit&id=       — Send section HTML + prompt to Claude, get replacement
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeCloudflareDeploy } from '../agent-handlers/tool-runner.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';

const log = createLogger('landing-pages');

// ── List ──────────────────────────────────────────────────────────

async function handleList(admin, userId) {
  const { data, error } = await admin
    .from('landing_pages')
    .select('id, title, status, deployment_url, deployed_at, goal_id, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return { status: 200, data };
}

// ── Get ───────────────────────────────────────────────────────────

async function handleGet(admin, userId, id) {
  if (!id) return { status: 400, error: 'id is required' };

  const { data, error } = await admin
    .from('landing_pages')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  if (!data) return { status: 404, error: 'Page not found' };
  return { status: 200, data };
}

// ── Create ────────────────────────────────────────────────────────

async function handleCreate(admin, userId, body) {
  const { title, html, goal_id } = body || {};

  const { data, error } = await admin
    .from('landing_pages')
    .insert({
      user_id: userId,
      title: title || 'Untitled Page',
      html: html || null,
      goal_id: goal_id || null,
      status: html ? 'draft' : 'draft',
    })
    .select('id, title, status, created_at')
    .single();

  if (error) throw error;
  return { status: 201, data };
}

// ── Save (GrapesJS state) ────────────────────────────────────────

async function handleSave(admin, userId, id, body) {
  if (!id) return { status: 400, error: 'id is required' };

  const update = {};
  if (body.gjs_components !== undefined) update.gjs_components = body.gjs_components;
  if (body.gjs_styles !== undefined) update.gjs_styles = body.gjs_styles;
  if (body.gjs_assets !== undefined) update.gjs_assets = body.gjs_assets;
  if (body.html !== undefined) update.html = body.html;
  if (body.title !== undefined) update.title = body.title;

  if (Object.keys(update).length === 0) return { status: 400, error: 'Nothing to save' };

  const { data, error } = await admin
    .from('landing_pages')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, title, status, updated_at')
    .single();

  if (error) throw error;
  if (!data) return { status: 404, error: 'Page not found' };
  return { status: 200, data };
}

// ── Deploy ────────────────────────────────────────────────────────

async function handleDeploy(admin, userId, id, body) {
  if (!id) return { status: 400, error: 'id is required' };

  // Fetch the page
  const { data: page, error: fetchErr } = await admin
    .from('landing_pages')
    .select('id, title, html, cloudflare_project')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchErr) throw fetchErr;
  if (!page) return { status: 404, error: 'Page not found' };
  if (!page.html) return { status: 400, error: 'No HTML to deploy — save the page first' };

  // Derive project name: reuse existing or generate from title
  const projectName = page.cloudflare_project
    || page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '-lp';

  const result = await executeCloudflareDeploy('deploy_site', {
    projectName,
    html: page.html,
    skipUniqueSuffix: !!page.cloudflare_project, // stable URL on re-deploy
  }, Date.now());

  if (!result.success) {
    return { status: 502, error: result.error || 'Cloudflare deploy failed' };
  }

  // Parse deployment URL from result
  const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
  const deploymentUrl = parsed.deploymentUrl || parsed.url || '';

  // Update page record
  await admin
    .from('landing_pages')
    .update({
      status: 'deployed',
      cloudflare_project: parsed.projectName || projectName,
      deployment_url: deploymentUrl,
      deployed_at: new Date().toISOString(),
    })
    .eq('id', id);

  return { status: 200, data: { deploymentUrl, projectName: parsed.projectName || projectName } };
}

// ── AI Edit ───────────────────────────────────────────────────────

async function handleAiEdit(admin, userId, id, body) {
  const { sectionHtml, prompt, mode } = body || {};
  if (!prompt) return { status: 400, error: 'prompt is required' };

  // Full page generation mode — generates a complete landing page from a description
  const isFullPage = mode === 'full-page' || (!sectionHtml && !id);

  const systemPrompt = isFullPage
    ? `You are an expert landing page designer. Generate a COMPLETE, production-quality landing page as raw HTML. Requirements:
- Use Tailwind CSS utility classes for ALL styling (loaded via CDN in the parent document)
- Include these sections in order: <nav>, hero <header>, features/benefits, testimonials/social proof, pricing (if relevant), FAQ with <details>/<summary>, final CTA, <footer>
- Add data-aos="fade-up" attributes to cards and sections for scroll animations
- Use <span class="material-symbols-outlined">icon_name</span> for icons (at least 6 unique icons)
- Hero must have a gradient background (bg-gradient-to-br)
- Feature cards must use glassmorphism: backdrop-blur-md bg-white/10 border border-white/20
- Buttons: rounded-full with hover:scale-105 transition
- Use real, specific copy — NO placeholder text, NO lorem ipsum, NO "Your Company"
- Add <html class="scroll-smooth"> is NOT needed — just output the <body> contents
- Footer must contain copyright 2026
- Make the design modern, premium, and conversion-focused

Output ONLY raw HTML — no <!DOCTYPE>, no <html>, no <head>, no markdown fences, no explanation. Just the body content starting with <nav>.`
    : `You are a landing page designer. The user will give you an HTML section from a landing page and a request for changes. Return ONLY the updated HTML section — no explanation, no markdown fences, no preamble. Use Tailwind CSS classes. Keep the same section type (hero, features, etc.) unless told otherwise. Maintain data-aos attributes and Material Symbols icons.`;

  const userPrompt = isFullPage
    ? `Create a complete landing page for: ${prompt}`
    : sectionHtml
      ? `Here is the current section HTML:\n\n${sectionHtml}\n\nRequest: ${prompt}`
      : `Generate an HTML section for a landing page. Use Tailwind CSS, data-aos attributes, Material Symbols icons. Request: ${prompt}`;

  const result = await executeLlmV2Tracked({
    prompt: userPrompt,
    systemPrompt,
    provider: 'anthropic',
    model: isFullPage ? 'claude-opus-5' : 'claude-sonnet-5',
    temperature: 0.4,
    maxTokens: isFullPage ? 16000 : 4000,
    timeoutMs: isFullPage ? 60000 : 25000,
    usage: {
      admin,
      userId,
      source: 'landing-pages',
      operation: isFullPage ? 'full-page-generate' : 'section-edit',
    },
  });

  // Strip markdown fences if the LLM wraps them
  let html = (result.content || '').trim();
  html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

  return { status: 200, data: { html, isFullPage, usage: result.usage } };
}

// ── Router ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (cors(res, req)) return;

  const op = (req.query?.op || '').trim().toLowerCase();
  const id = req.query?.id || req.body?.id || '';

  // Auth
  const token = getBearerToken(req);
  if (!token) return jsonError(res, 401, 'Missing token');

  const user = await verifySupabaseToken(token);
  if (!user?.id) return jsonError(res, 401, 'Invalid token');

  // Rate limit
  const rl = await checkRateLimit(getRateLimitIdentifier(req), 'landing-pages', 30, 60);
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limited');

  const admin = buildSupabaseAdminClient();

  try {
    let result;
    switch (op) {
      case 'list':
        result = await handleList(admin, user.id);
        break;
      case 'get':
        result = await handleGet(admin, user.id, id);
        break;
      case 'create':
        result = await handleCreate(admin, user.id, req.body);
        break;
      case 'save':
        result = await handleSave(admin, user.id, id, req.body);
        break;
      case 'deploy':
        result = await handleDeploy(admin, user.id, id, req.body);
        break;
      case 'ai-edit':
        result = await handleAiEdit(admin, user.id, id, req.body);
        break;
      default:
        return jsonError(res, 400, `Unknown op: ${op}`);
    }

    if (result.error && result.status >= 400) {
      return jsonError(res, result.status, result.error);
    }
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, log, req);
  }
}
