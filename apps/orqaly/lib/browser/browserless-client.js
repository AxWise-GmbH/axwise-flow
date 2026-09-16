/**
 * Browserless.io REST API client for cloud Chrome automation.
 * Provides headless browser capabilities without local Playwright/Puppeteer.
 *
 * Endpoints used:
 * - /content  — Navigate and return rendered HTML
 * - /function — Execute Puppeteer scripts (fill forms, click, interact)
 * - /screenshot — Capture page screenshots
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('browserless');
const BASE_URL = 'https://chrome.browserless.io';
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Build URL with API key token.
 */
function buildUrl(path, apiKey) {
  return `${BASE_URL}${path}?token=${encodeURIComponent(apiKey)}`;
}

/**
 * Navigate to a URL and return the rendered page HTML.
 *
 * @param {string} url - Target URL
 * @param {string} apiKey - Browserless API key
 * @param {object} [opts] - { waitForSelector, waitForTimeout, timeoutMs }
 * @returns {Promise<{ html: string, status: number }>}
 */
export async function navigate(url, apiKey, opts = {}) {
  if (!url || !apiKey) throw new Error('Missing url or apiKey for navigate');

  const body = {
    url,
    waitForSelector: opts.waitForSelector ? { selector: opts.waitForSelector, timeout: 8000 } : undefined,
    waitForTimeout: opts.waitForTimeout || undefined,
    gotoOptions: { waitUntil: 'networkidle2', timeout: 12000 },
  };

  const res = await fetchWithRetry(
    buildUrl('/content', apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS, retries: 0 },
  );

  const html = await res.text();
  log.info(null, 'browser.navigate', { url, status: res.status, htmlLen: html.length });
  return { html, status: res.status };
}

/**
 * Fill form fields, optionally inject CAPTCHA token, and submit.
 * Uses the /function endpoint to run a Puppeteer script.
 *
 * @param {string} url - Page URL with the form
 * @param {Array<{selector: string, value: string}>} fields - Form fields to fill
 * @param {string} submitSelector - CSS selector for submit button
 * @param {string} apiKey - Browserless API key
 * @param {string} [captchaToken] - Pre-solved CAPTCHA token to inject
 * @returns {Promise<{ html: string, success: boolean, error?: string }>}
 */
export async function fillAndSubmit(url, fields, submitSelector, apiKey, captchaToken) {
  if (!url || !apiKey) throw new Error('Missing url or apiKey for fillAndSubmit');
  if (!fields || fields.length === 0) throw new Error('No form fields provided');

  // Build Puppeteer script for the /function endpoint
  const fieldOps = fields.map((f) =>
    `await page.type('${escapeSel(f.selector)}', '${escapeVal(f.value)}', { delay: 50 });`
  ).join('\n    ');

  const captchaInject = captchaToken
    ? `await page.evaluate((token) => {
        const el = document.getElementById('g-recaptcha-response') || document.querySelector('[name="g-recaptcha-response"]') || document.querySelector('[name="h-captcha-response"]');
        if (el) { el.value = token; el.style.display = 'block'; }
        if (window.___grecaptcha_cfg) { window.___grecaptcha_cfg.clients[0]?.S?.S?.callback?.(token); }
      }, '${escapeVal(captchaToken)}');`
    : '';

  const code = `
    module.exports = async ({ page }) => {
      await page.goto('${escapeVal(url)}', { waitUntil: 'networkidle2', timeout: 12000 });
      ${fieldOps}
      ${captchaInject}
      await page.click('${escapeSel(submitSelector)}');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      const html = await page.content();
      return { html: html.slice(0, 5000), success: true };
    };
  `;

  const res = await fetchWithRetry(
    buildUrl('/function', apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: {} }),
    },
    { timeoutMs: 20000, retries: 0 },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.warn(null, 'browser.fillAndSubmit.failed', { url, status: res.status });
    return { html: '', success: false, error: `Browserless error: ${res.status} ${errText.slice(0, 200)}` };
  }

  const result = await res.json();
  log.info(null, 'browser.fillAndSubmit', { url, success: true });
  return { html: result.html || '', success: true };
}

/**
 * Click an element on a page and return resulting content.
 *
 * @param {string} url - Page URL
 * @param {string} selector - CSS selector to click
 * @param {string} apiKey - Browserless API key
 * @returns {Promise<{ html: string, success: boolean }>}
 */
export async function click(url, selector, apiKey) {
  if (!url || !selector || !apiKey) throw new Error('Missing url, selector, or apiKey for click');

  const code = `
    module.exports = async ({ page }) => {
      await page.goto('${escapeVal(url)}', { waitUntil: 'networkidle2', timeout: 12000 });
      await page.click('${escapeSel(selector)}');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {});
      const html = await page.content();
      return { html: html.slice(0, 5000), success: true };
    };
  `;

  const res = await fetchWithRetry(
    buildUrl('/function', apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: {} }),
    },
    { timeoutMs: DEFAULT_TIMEOUT_MS, retries: 0 },
  );

  if (!res.ok) return { html: '', success: false };
  const result = await res.json();
  return { html: result.html || '', success: true };
}

/**
 * Extract text content from a CSS selector on a page.
 *
 * @param {string} url - Page URL
 * @param {string} selector - CSS selector to extract text from
 * @param {string} apiKey - Browserless API key
 * @returns {Promise<{ text: string, success: boolean }>}
 */
export async function extract(url, selector, apiKey) {
  if (!url || !selector || !apiKey) throw new Error('Missing url, selector, or apiKey for extract');

  const code = `
    module.exports = async ({ page }) => {
      await page.goto('${escapeVal(url)}', { waitUntil: 'networkidle2', timeout: 12000 });
      const el = await page.$('${escapeSel(selector)}');
      const text = el ? await page.evaluate((e) => e.textContent || e.value || '', el) : null;
      return { text: text ? text.trim().slice(0, 3000) : null, success: !!text };
    };
  `;

  const res = await fetchWithRetry(
    buildUrl('/function', apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context: {} }),
    },
    { timeoutMs: DEFAULT_TIMEOUT_MS, retries: 0 },
  );

  if (!res.ok) return { text: null, success: false };
  const result = await res.json();
  return { text: result.text || null, success: result.success || false };
}

/**
 * Take a screenshot of a page.
 *
 * @param {string} url - Page URL
 * @param {string} apiKey - Browserless API key
 * @param {object} [opts] - { fullPage }
 * @returns {Promise<{ base64: string, success: boolean }>}
 */
export async function screenshot(url, apiKey, opts = {}) {
  if (!url || !apiKey) throw new Error('Missing url or apiKey for screenshot');

  const body = {
    url,
    gotoOptions: { waitUntil: 'networkidle2', timeout: 12000 },
    options: { fullPage: opts.fullPage || false, type: 'png' },
  };

  const res = await fetchWithRetry(
    buildUrl('/screenshot', apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { timeoutMs: DEFAULT_TIMEOUT_MS, retries: 0 },
  );

  if (!res.ok) return { base64: '', success: false };

  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { base64, success: true };
}

// ── Helpers ────────────────────────────────────────────────────────

/** Escape single quotes for safe injection into Puppeteer script strings. */
function escapeVal(str) {
  return String(str || '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

/** Escape CSS selectors for safe injection into Puppeteer scripts. */
function escapeSel(str) {
  return String(str || '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}
