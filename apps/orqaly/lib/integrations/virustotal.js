/**
 * VirusTotal URL reputation client.
 *
 * Used by the weekly cron (lib/cron/scan-library-endpoints.js) to re-check
 * connected MCP library endpoint URLs and degrade their status if reputation
 * worsens. NOT used at connect time — curated catalog entries are trusted
 * by allowlist; VT runs as a background watchdog.
 *
 * Verdict thresholds (deliberately conservative — VT is a weak signal for
 * managed APIs which almost always score clean):
 *   malicious  >= 1  →  'block'
 *   suspicious >= 2  →  'warn'
 *   else             →  'clean'
 *
 * API: https://docs.virustotal.com/reference/url
 *   POST /api/v3/urls         (form-encoded body: url=<encoded>)
 *   GET  /api/v3/analyses/{id}
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';

const VT_API_BASE = 'https://www.virustotal.com/api/v3';
const POLL_DELAY_MS = 1500;

/**
 * Scan a URL and return a verdict.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {string} [opts.apiKey]    — defaults to process.env.VIRUSTOTAL_API_KEY
 * @param {number} [opts.timeoutMs] — per-request timeout (default 8000)
 * @returns {Promise<{ verdict: 'clean'|'warn'|'block', harmless: number, malicious: number, suspicious: number, scanned_at: string, url: string }>}
 * @throws {Error} when no API key configured or VT call fails
 */
export async function scanUrl(url, opts = {}) {
  if (!url || typeof url !== 'string') throw new Error('scanUrl: url is required');

  const apiKey = opts.apiKey || process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) throw new Error('VIRUSTOTAL_API_KEY not configured');

  const timeoutMs = opts.timeoutMs || 8000;
  const headers = { 'x-apikey': apiKey };

  // 1) Submit URL → returns analysis id
  const submitRes = await fetchWithRetry(
    `${VT_API_BASE}/urls`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(url)}`,
    },
    { timeoutMs, retries: 1 },
  );
  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`VT submit failed: HTTP ${submitRes.status}: ${body.slice(0, 200)}`);
  }
  const submitJson = await submitRes.json();
  const analysisId = submitJson?.data?.id;
  if (!analysisId) throw new Error('VT submit returned no analysis id');

  // 2) Poll analysis once (free tier has aggressive rate limits — single poll
  //    is enough for cached URLs, which most curated catalog endpoints will be)
  await new Promise((r) => setTimeout(r, POLL_DELAY_MS));

  const analysisRes = await fetchWithRetry(
    `${VT_API_BASE}/analyses/${analysisId}`,
    { method: 'GET', headers },
    { timeoutMs, retries: 1 },
  );
  if (!analysisRes.ok) {
    const body = await analysisRes.text();
    throw new Error(`VT analysis failed: HTTP ${analysisRes.status}: ${body.slice(0, 200)}`);
  }
  const analysisJson = await analysisRes.json();
  const stats = analysisJson?.data?.attributes?.stats || {};

  return verdictFromStats({
    harmless: Number(stats.harmless || 0),
    malicious: Number(stats.malicious || 0),
    suspicious: Number(stats.suspicious || 0),
    url,
  });
}

/**
 * Pure function: derive verdict from stats. Exported for tests.
 */
export function verdictFromStats({ harmless = 0, malicious = 0, suspicious = 0, url = '' } = {}) {
  let verdict = 'clean';
  if (malicious >= 1) verdict = 'block';
  else if (suspicious >= 2) verdict = 'warn';
  return {
    verdict,
    harmless,
    malicious,
    suspicious,
    scanned_at: new Date().toISOString(),
    url,
  };
}
