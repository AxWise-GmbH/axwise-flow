/**
 * Deck renderer — Claude Sonnet 5 (or OpenAI fallback) writes a complete
 * designed HTML slide deck. The HTML is uploaded to Supabase Storage as a
 * .html file in the existing `goal-deliverables` bucket. The wizard can
 * then iframe it directly OR the user can open it in a new tab.
 *
 * Why HTML upload instead of PDF render:
 * - The original plan used browserless.io to render HTML → PDF, but the
 *   production BROWSERLESS_API_KEY is invalid (rejects every request with
 *   401). This is a pre-existing infrastructure issue, not something this
 *   renderer can solve.
 * - Adding @sparticuz/chromium would add ~50MB to every Vercel function
 *   cold start, slowing every job — bad trade-off.
 * - Uploading the HTML directly is simpler, faster (no browserless round
 *   trip), and gives the user a LIVE preview they can interact with —
 *   actually better UX than a static PDF.
 *
 * Cost: ~$0.05 per deck (Claude Sonnet HTML generation, OpenAI fallback if
 * Anthropic credit is exhausted).
 * Time: ~10-20s wall time.
 *
 * Caller responsibility: if this throws, fall back to jsPDF (which still
 * works, just produces ugly output).
 */
import { executeLlmV2 } from '../concilium-handlers/llm-executor-v2.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('deck-renderer');

const HTML_SYSTEM_PROMPT = `You are a presentation designer producing a complete HTML slide deck.

OUTPUT RULES (strict):
- Output ONLY valid HTML starting with <!DOCTYPE html>. No preamble. No markdown fences.
- Single self-contained file. ALL CSS inline in a <style> tag. NO external stylesheets except Google Fonts via @import.
- Use modern CSS: Grid, Flexbox, custom properties.
- @page { size: A4 landscape; margin: 0; } so PDF rendering produces clean page breaks.
- Each slide is a <section class="slide"> with: width: 297mm; height: 210mm; page-break-after: always; padding: 32mm 28mm.
- Use Google Fonts: import Inter or Manrope or similar modern sans-serif. ONE typeface family.
- Color palette: ONE primary color (saturated, distinctive), ONE accent, off-white background, dark text. Pick palette based on the deck topic.
- Real visual hierarchy: oversized titles (~48pt), supporting copy (~16pt), accent elements.
- DO NOT use stock illustrations, emoji, or placeholder images.
- DO NOT include navigation, footer, or page numbers.
- DO NOT include bullet lists unless absolutely necessary — prefer pull quotes, numbered cards, or grid layouts.
- The first slide is the title slide. The last slide is the call-to-action / contact slide.

QUALITY BAR: every slide must look like it came from a designer-led pitch deck (Stripe, Linear, Notion). If you produce something that looks like a corporate PowerPoint, you have failed.`;

function buildHtmlUserPrompt({ title, subtitle, slides, comment }) {
  const slideSpec = slides.map((s, i) => {
    const parts = [`Slide ${i + 1}: ${s.title || '(untitled)'}`];
    if (s.body) parts.push(`  Body: ${s.body}`);
    if (Array.isArray(s.bullets) && s.bullets.length > 0) {
      parts.push(`  Bullets: ${s.bullets.join(' | ')}`);
    }
    return parts.join('\n');
  }).join('\n\n');

  const commentBlock = comment
    ? `\n\nUSER FEEDBACK (apply this exactly — these are non-negotiable):\n${comment}\n`
    : '';

  return `Build a presentation deck with:

Title: ${title}
Subtitle: ${subtitle || '(none)'}

Slide structure:
${slideSpec}
${commentBlock}
Now produce the complete HTML.`;
}

/**
 * Generate a presentation by writing complete styled HTML with an LLM and
 * uploading the .html file to Supabase Storage. Returns the public URL —
 * the wizard iframes it for a live preview, the user opens it in a new tab.
 *
 * @param {object} args
 * @param {string} args.projectName - safe-name base for the storage path
 * @param {string} args.title - deck title
 * @param {string} [args.subtitle]
 * @param {Array<{title, body?, bullets?}>} args.slides
 * @param {string} [args.comment] - optional user feedback merged into LLM prompt
 * @returns {Promise<{ htmlUrl, sizeBytes, slideCount, htmlPreview }>}
 * @throws if any step fails (caller falls back to jsPDF)
 */
export async function renderDeckViaHtml({ projectName, title, subtitle, slides, comment }) {
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error('No slides provided to renderDeckViaHtml');
  }

  // 1. Generate HTML via Vercel AI Gateway → Claude Sonnet (with auto-failover
  //    to OpenAI if Anthropic is down or out of credit). Routing through
  //    gateway gives us:
  //      - $5/mo refreshing free credit (covers ~60 decks/month)
  //      - Automatic provider failover at the gateway layer
  //      - Single endpoint for cost tracking
  //    Auth uses VERCEL_OIDC_TOKEN (auto-provisioned) so no manual key needed.
  //
  // Build the admin client up front (also reused for the Storage upload below)
  // so the tracked executor can record one llm_usage row for this call.
  const admin = buildSupabaseAdminClient();
  const llmResult = await executeLlmV2Tracked({
    provider: 'gateway',
    model: 'anthropic/claude-sonnet-5',
    temperature: 0.4,
    maxTokens: 8000,
    timeoutMs: 60000,
    systemPrompt: HTML_SYSTEM_PROMPT,
    prompt: buildHtmlUserPrompt({ title, subtitle, slides, comment }),
    usage: { admin, source: 'deck-render', operation: 'render' },
  });

  let html = (llmResult.content || '').trim();
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
  }
  if (!html.toLowerCase().includes('<!doctype html')) {
    throw new Error('LLM did not produce a valid HTML document');
  }

  // 2. Upload the HTML file to Supabase Storage (public bucket).
  //    `admin` was built above (and reused here) for the usage recording.
  const BUCKET = 'goal-deliverables';

  // Ensure bucket exists (idempotent — same pattern as the existing tool runner)
  try {
    const { data: existing } = await admin.storage.getBucket(BUCKET);
    if (!existing) {
      const { error: createErr } = await admin.storage.createBucket(BUCKET, { public: true });
      if (createErr && !String(createErr.message || '').includes('already exists')) {
        throw new Error(`Create bucket failed: ${createErr.message}`);
      }
    }
  } catch (bucketErr) {
    log.warn(null, 'deck-renderer.ensure-bucket.warn', { error: bucketErr.message });
  }

  const safeName = String(projectName)
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 80) || `deck-${Date.now().toString(36)}`;
  const storagePath = `decks/${safeName}-${Date.now().toString(36)}.html`;

  const htmlBuffer = Buffer.from(html, 'utf-8');
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, htmlBuffer, {
    contentType: 'text/html; charset=utf-8',
    upsert: false,
  });
  if (uploadErr) {
    throw new Error(`HTML upload failed: ${uploadErr.message}`);
  }

  // Return the /api/render-deck proxy URL, NOT the raw Supabase Storage URL.
  // Supabase Storage forcibly serves text-based files as text/plain regardless
  // of the upload contentType, so a direct Storage URL would show source code
  // instead of a rendered page. The proxy fixes the Content-Type header.
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'https://orqaly.com';
  const htmlUrl = `${baseUrl}/api/render-deck?file=${encodeURIComponent(storagePath)}`;

  return {
    htmlUrl,
    storagePath,
    sizeBytes: htmlBuffer.length,
    slideCount: slides.length,
    htmlPreview: html.slice(0, 1500),
  };
}
