/**
 * 2Captcha API client for solving reCAPTCHA and hCaptcha challenges.
 * Uses submit + poll pattern: submit task → poll for solution.
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('captcha-solver');
const BASE_URL = 'https://2captcha.com';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 6; // 30s max wait
const TIMEOUT_MS = 8000;

/**
 * Submit a CAPTCHA task and poll for the solution.
 *
 * @param {object} params - { method, siteKey, pageUrl }
 * @param {string} apiKey - 2Captcha API key
 * @returns {Promise<{ token: string, cost: string }>}
 */
async function submitAndPoll(params, apiKey) {
  // Step 1: Submit task
  const submitUrl = new URL('/in.php', BASE_URL);
  submitUrl.searchParams.set('key', apiKey);
  submitUrl.searchParams.set('json', '1');
  for (const [k, v] of Object.entries(params)) {
    submitUrl.searchParams.set(k, v);
  }

  const submitRes = await fetchWithRetry(
    submitUrl.toString(),
    { method: 'POST' },
    { timeoutMs: TIMEOUT_MS, retries: 0 },
  );

  const submitBody = await submitRes.json();
  if (submitBody.status !== 1) {
    throw new Error(`2Captcha submit failed: ${submitBody.request || JSON.stringify(submitBody)}`);
  }

  const taskId = submitBody.request;
  log.info(null, 'captcha.submitted', { taskId, method: params.method });

  // Step 2: Poll for result
  const pollUrl = new URL('/res.php', BASE_URL);
  pollUrl.searchParams.set('key', apiKey);
  pollUrl.searchParams.set('action', 'get');
  pollUrl.searchParams.set('id', taskId);
  pollUrl.searchParams.set('json', '1');

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetchWithRetry(
      pollUrl.toString(),
      { method: 'GET' },
      { timeoutMs: TIMEOUT_MS, retries: 0 },
    );

    const pollBody = await pollRes.json();

    if (pollBody.status === 1) {
      log.info(null, 'captcha.solved', { taskId, attempt: attempt + 1 });
      return { token: pollBody.request, cost: pollBody.cost || '0' };
    }

    if (pollBody.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha solve failed: ${pollBody.request}`);
    }
  }

  throw new Error(`2Captcha timeout: no solution after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

/**
 * Solve a reCAPTCHA v2 challenge.
 *
 * @param {string} siteKey - reCAPTCHA site key (data-sitekey)
 * @param {string} pageUrl - URL of the page with CAPTCHA
 * @param {string} apiKey - 2Captcha API key
 * @returns {Promise<{ token: string, cost: string }>}
 */
export async function solveRecaptcha(siteKey, pageUrl, apiKey) {
  if (!siteKey || !pageUrl || !apiKey) {
    throw new Error('Missing siteKey, pageUrl, or apiKey for reCAPTCHA solve');
  }

  return submitAndPoll(
    { method: 'userrecaptcha', googlekey: siteKey, pageurl: pageUrl },
    apiKey,
  );
}

/**
 * Solve an hCaptcha challenge.
 *
 * @param {string} siteKey - hCaptcha site key (data-sitekey)
 * @param {string} pageUrl - URL of the page with CAPTCHA
 * @param {string} apiKey - 2Captcha API key
 * @returns {Promise<{ token: string, cost: string }>}
 */
export async function solveHcaptcha(siteKey, pageUrl, apiKey) {
  if (!siteKey || !pageUrl || !apiKey) {
    throw new Error('Missing siteKey, pageUrl, or apiKey for hCaptcha solve');
  }

  return submitAndPoll(
    { method: 'hcaptcha', sitekey: siteKey, pageurl: pageUrl },
    apiKey,
  );
}

/**
 * Detect CAPTCHA type from page HTML.
 * Phase 1: reCAPTCHA v2, hCaptcha (2Captcha-supported).
 * Phase 7: Turnstile, reCAPTCHA v3, FunCaptcha/Arkose, DataDome (CapSolver-supported).
 *
 * @param {string} html - Page HTML content
 * @returns {{ type: string|null, siteKey: string|null }}
 */
export function detectCaptcha(html) {
  if (!html) return { type: null, siteKey: null };

  // reCAPTCHA v2: <div class="g-recaptcha" data-sitekey="...">
  const recaptchaRe1 = /class=["'][^"']*g-recaptcha[^"']*["'][^>]*data-sitekey=["']([^"']+)["']/i;
  const recaptchaRe2 = /data-sitekey=["']([^"']+)["'][^>]*class=["'][^"']*g-recaptcha/i;
  const recaptchaMatch = recaptchaRe1.exec(html) || recaptchaRe2.exec(html);
  if (recaptchaMatch) return { type: 'recaptcha', siteKey: recaptchaMatch[1] };

  // reCAPTCHA v3 (invisible): grecaptcha.execute('SITEKEY', ...)
  const recaptchaV3Re = /grecaptcha\.execute\(['"]([\w-]+)['"]/i;
  const recaptchaV3Match = recaptchaV3Re.exec(html);
  if (recaptchaV3Match) return { type: 'recaptcha_v3', siteKey: recaptchaV3Match[1] };

  // reCAPTCHA via script src (render= param — usually v3 enterprise)
  const recaptchaScriptRe = /recaptcha\/api\.js\?.*render=([\w-]+)/i;
  const recaptchaScriptMatch = recaptchaScriptRe.exec(html);
  if (recaptchaScriptMatch) return { type: 'recaptcha_v3', siteKey: recaptchaScriptMatch[1] };

  // hCaptcha: <div class="h-captcha" data-sitekey="...">
  const hcaptchaRe1 = /class=["'][^"']*h-captcha[^"']*["'][^>]*data-sitekey=["']([^"']+)["']/i;
  const hcaptchaRe2 = /data-sitekey=["']([^"']+)["'][^>]*class=["'][^"']*h-captcha/i;
  const hcaptchaMatch = hcaptchaRe1.exec(html) || hcaptchaRe2.exec(html);
  if (hcaptchaMatch) return { type: 'hcaptcha', siteKey: hcaptchaMatch[1] };

  // Cloudflare Turnstile: <div class="cf-turnstile" data-sitekey="...">
  const turnstileRe1 = /class=["'][^"']*cf-turnstile[^"']*["'][^>]*data-sitekey=["']([^"']+)["']/i;
  const turnstileRe2 = /data-sitekey=["']([^"']+)["'][^>]*class=["'][^"']*cf-turnstile/i;
  const turnstileMatch = turnstileRe1.exec(html) || turnstileRe2.exec(html);
  if (turnstileMatch) return { type: 'turnstile', siteKey: turnstileMatch[1] };

  // Arkose / FunCaptcha: look for the public key in an iframe URL first, then the JS API
  const funcaptchaIframeRe = /arkoselabs\.com\/fc\/api\/[^"']*pkey=([\w-]+)/i;
  const funcaptchaIframeMatch = funcaptchaIframeRe.exec(html);
  if (funcaptchaIframeMatch) return { type: 'funcaptcha', siteKey: funcaptchaIframeMatch[1] };
  const funcaptchaJsRe = /public_key["']?\s*[:=]\s*["']([\w-]+)/i;
  if (/funcaptcha|arkoselabs/i.test(html)) {
    const m = funcaptchaJsRe.exec(html);
    if (m) return { type: 'funcaptcha', siteKey: m[1] };
  }

  // DataDome bot wall (no siteKey concept — just a flag)
  if (/dd[-_]captcha|datadome\.co/i.test(html)) return { type: 'datadome', siteKey: null };

  return { type: null, siteKey: null };
}

// ─── CapSolver (Phase 7) ─────────────────────────────────────────────

const CAPSOLVER_URL = 'https://api.capsolver.com';

async function capsolverTask(taskType, taskParams, apiKey) {
  // Submit
  const create = await fetchWithRetry(
    `${CAPSOLVER_URL}/createTask`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: apiKey, task: { type: taskType, ...taskParams } }),
    },
    { timeoutMs: TIMEOUT_MS, retries: 0 },
  );
  const createBody = await create.json();
  if (createBody.errorId !== 0) {
    throw new Error(`CapSolver create failed: ${createBody.errorDescription || createBody.errorCode}`);
  }
  const taskId = createBody.taskId;
  log.info(null, 'capsolver.submitted', { taskId, taskType });

  // Poll
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const poll = await fetchWithRetry(
      `${CAPSOLVER_URL}/getTaskResult`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      },
      { timeoutMs: TIMEOUT_MS, retries: 0 },
    );
    const pollBody = await poll.json();
    if (pollBody.errorId !== 0) {
      throw new Error(`CapSolver solve failed: ${pollBody.errorDescription || pollBody.errorCode}`);
    }
    if (pollBody.status === 'ready') {
      log.info(null, 'capsolver.solved', { taskId, attempt: attempt + 1 });
      return pollBody.solution;
    }
  }
  throw new Error(`CapSolver timeout: no solution after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

export async function solveTurnstile(siteKey, pageUrl, apiKey) {
  if (!siteKey || !pageUrl || !apiKey) throw new Error('Missing siteKey, pageUrl, or apiKey for Turnstile');
  const sol = await capsolverTask('AntiTurnstileTaskProxyLess', { websiteURL: pageUrl, websiteKey: siteKey }, apiKey);
  return { token: sol.token, cost: String(sol.cost || '0') };
}

export async function solveRecaptchaV3(siteKey, pageUrl, apiKey, { action = 'verify', minScore = 0.7 } = {}) {
  if (!siteKey || !pageUrl || !apiKey) throw new Error('Missing siteKey, pageUrl, or apiKey for reCAPTCHA v3');
  const sol = await capsolverTask(
    'ReCaptchaV3TaskProxyLess',
    { websiteURL: pageUrl, websiteKey: siteKey, pageAction: action, minScore },
    apiKey,
  );
  return { token: sol.gRecaptchaResponse, cost: String(sol.cost || '0') };
}

export async function solveFunCaptcha(siteKey, pageUrl, apiKey) {
  if (!siteKey || !pageUrl || !apiKey) throw new Error('Missing siteKey, pageUrl, or apiKey for FunCaptcha');
  const sol = await capsolverTask(
    'FunCaptchaTaskProxyLess',
    { websiteURL: pageUrl, websitePublicKey: siteKey },
    apiKey,
  );
  return { token: sol.token, cost: String(sol.cost || '0') };
}

/**
 * Unified dispatcher — tries 2Captcha first for types it supports, falls
 * back to CapSolver for everything else. Returns { token, solver } or null.
 */
export async function solveCaptcha(detected, pageUrl, creds) {
  if (!detected?.type) return null;
  const twoCaptchaKey = creds['tool-captcha-solver'];
  const capSolverKey = creds['tool-capsolver-solver'];

  try {
    if (detected.type === 'recaptcha' && twoCaptchaKey) {
      const s = await solveRecaptcha(detected.siteKey, pageUrl, twoCaptchaKey);
      return { token: s.token, solver: '2captcha', cost: s.cost };
    }
    if (detected.type === 'hcaptcha' && twoCaptchaKey) {
      const s = await solveHcaptcha(detected.siteKey, pageUrl, twoCaptchaKey);
      return { token: s.token, solver: '2captcha', cost: s.cost };
    }
  } catch (err) {
    log.warn(null, 'captcha.2captcha-failed-will-try-capsolver', { error: err.message, type: detected.type });
  }

  if (!capSolverKey) return { token: null, solver: null, reason: 'capsolver_not_configured' };

  try {
    if (detected.type === 'turnstile') {
      const s = await solveTurnstile(detected.siteKey, pageUrl, capSolverKey);
      return { token: s.token, solver: 'capsolver', cost: s.cost };
    }
    if (detected.type === 'recaptcha_v3') {
      const s = await solveRecaptchaV3(detected.siteKey, pageUrl, capSolverKey);
      return { token: s.token, solver: 'capsolver', cost: s.cost };
    }
    if (detected.type === 'funcaptcha') {
      const s = await solveFunCaptcha(detected.siteKey, pageUrl, capSolverKey);
      return { token: s.token, solver: 'capsolver', cost: s.cost };
    }
    if (detected.type === 'datadome') {
      return { token: null, solver: null, reason: 'datadome_needs_human' };
    }
  } catch (err) {
    log.warn(null, 'captcha.capsolver-failed', { error: err.message, type: detected.type });
    return { token: null, solver: null, reason: 'capsolver_failed', error: err.message };
  }
  return { token: null, solver: null, reason: 'unsupported_type' };
}
