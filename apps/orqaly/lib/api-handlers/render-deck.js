/**
 * /api/render-deck — proxies an HTML deck file from Supabase Storage and
 * re-serves it with Content-Type: text/html so browsers actually render it
 * instead of showing source code.
 *
 * Why this exists: Supabase Storage forcibly serves all text-based files as
 * `text/plain` regardless of the upload contentType, as a security feature
 * for public buckets. So we can't serve our LLM-generated decks directly
 * from Storage. This thin proxy fixes that.
 *
 * Also overrides the dispatcher's X-Frame-Options DENY → SAMEORIGIN so the
 * calibration wizard can iframe the deck for live preview, and sends a
 * permissive CSP so inline <style> and Google Fonts work inside the iframe.
 *
 * Request: GET /api/render-deck?file=decks/some-file.html
 * Response: 200 text/html with the deck HTML body
 *
 * Note: the query parameter is `file` (not `path`) because the Vercel
 * rewrite uses `?path=render-deck` to dispatch to this handler — having
 * the user's parameter also named `path` would collide.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { jsonError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('render-deck');
const BUCKET = 'goal-deliverables';

// Path safety: only accept paths under the decks/ folder so this can't be
// abused to fetch arbitrary files from the bucket
function isSafePath(p) {
  if (typeof p !== 'string') return false;
  if (!p.startsWith('decks/')) return false;
  if (p.includes('..')) return false;
  if (!/^decks\/[a-z0-9-]+\.html?$/i.test(p)) return false;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return jsonError(res, 405, 'Method not allowed');

  const filePath = String(req.query?.file || '').trim();
  if (!isSafePath(filePath)) {
    return jsonError(res, 400, 'Invalid or missing file');
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Storage not configured');

  try {
    const { data, error } = await admin.storage.from(BUCKET).download(filePath);
    if (error || !data) {
      log.warn(req, 'render-deck.not-found', { filePath, error: error?.message });
      return jsonError(res, 404, 'Deck not found');
    }

    const html = await data.text();

    // Override the dispatcher's restrictive headers BEFORE sending the body.
    // - X-Frame-Options DENY would block iframing — switch to SAMEORIGIN so
    //   the wizard can iframe its own /api/render-deck URLs.
    // - The dispatcher's CSP blocks inline styles, but the LLM-generated
    //   decks are entirely inline. Send a relaxed CSP scoped to this single
    //   response that allows inline style + Google Fonts.
    res.removeHeader('X-Frame-Options');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.removeHeader('Content-Security-Policy');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; script-src 'none'; frame-ancestors 'self'",
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.status(200).send(html);
  } catch (err) {
    log.error(req, 'render-deck.error', err, { filePath });
    return jsonError(res, 500, err?.message || 'Failed to render deck');
  }
}
