/**
 * Stage: clone-reference
 *
 * For URL-clone landing-page goals, server-side prefetch the source URL(s)
 * so the Frontend Developer agent has bounded HTML + a structural outline as
 * explicitly untrusted task data — no agent-side tool call, no 3000-char
 * http-client truncation, and no Browser Automation Lead detour.
 *
 * Supports both modes:
 *   - single-source: one URL → output landing page in same structure, new brand
 *   - multi-source:  N URLs   → ONE aggregate affiliate landing page that
 *                    references content from all sources
 *
 * Cleans each page (strips scripts, styles, comments, svg data noise),
 * extracts a structural outline (title, meta, headings, section landmarks),
 * caps cleaned HTML at ~40KB per page, stores everything on
 * goal.data.clone_reference.
 *
 * Saved shape:
 *   goal.data.clone_reference = {
 *     mode: 'single' | 'multi',
 *     sources: [{
 *       url, status, cleaned_html, outline: {title, metas, h1s, h2s, sections},
 *       byte_count, fetched_at,
 *     }, ...],
 *     created_at,
 *   }
 *
 * Runs only after gate 2 and then advances to approved image enrichment.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { logGoalEvent, updateGoalIfExecutionAuthorized, loadGoal } from '../_helpers.js';
import { isCloneRestyleGoal, isMultiSourceCloneGoal } from '../_clone-detectors.js';
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
import { validateToolUrl } from '../../tool-executors/validate-url.js';

const log = createLogger('goal-stage:clone-reference');

// Per-page caps. Cleaned HTML is untrusted task data the LLM sees, so 40KB ≈ 10K tokens at
// worst-case 4 chars/token. With Sonnet's 200K context this still leaves
// plenty of room for the rest of the system prompt + brief + tool defs.
const MAX_CLEANED_HTML_BYTES = 40 * 1024;
const MAX_RAW_HTML_BYTES = 1024 * 1024; // 1MB hard ceiling on raw fetch
const FETCH_TIMEOUT_MS = 12_000;
const MAX_SOURCES_MULTI = 8; // affiliate use case rarely needs more than 5-8
const MAX_REDIRECTS = 3;

const BLOCKED_IPV4_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_IPV6_CIDRS = [
  ['::', 128],
  ['::1', 128],
  ['::', 96], // IPv4-compatible and IPv4-mapped space (handled conservatively).
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32], // Teredo.
  ['2001:2::', 48], // Benchmarking.
  ['2001:10::', 28], // ORCHID.
  ['2001:20::', 28], // ORCHIDv2.
  ['2001:db8::', 32], // Documentation.
  ['2002::', 16], // 6to4; do not tunnel around the IPv4 policy.
  ['3fff::', 20], // Documentation.
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

function ipv4ToInt(address) {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

function ipv4InCidr(address, network, prefix) {
  const value = ipv4ToInt(address);
  const base = ipv4ToInt(network);
  if (value === null || base === null) return false;
  const mask = prefix === 0 ? 0n : (0xffffffffn << BigInt(32 - prefix)) & 0xffffffffn;
  return (value & mask) === (base & mask);
}

function ipv6ToBytes(address) {
  let input = String(address).toLowerCase().split('%')[0];
  if (input.startsWith('[') && input.endsWith(']')) input = input.slice(1, -1);

  const embeddedIpv4 = input.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (embeddedIpv4) {
    const value = ipv4ToInt(embeddedIpv4);
    if (value === null) return null;
    input = input.slice(0, -embeddedIpv4.length);
    input += `${Number((value >> 16n) & 0xffffn).toString(16)}:${Number(value & 0xffffn).toString(16)}`;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;

  return Buffer.from(
    groups.flatMap((part) => {
      const value = Number.parseInt(part, 16);
      return [value >> 8, value & 0xff];
    })
  );
}

function ipv6InCidr(address, network, prefix) {
  const value = ipv6ToBytes(address);
  const base = ipv6ToBytes(network);
  if (!value || !base) return false;
  const wholeBytes = Math.floor(prefix / 8);
  const remainingBits = prefix % 8;
  for (let i = 0; i < wholeBytes; i += 1) {
    if (value[i] !== base[i]) return false;
  }
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (value[wholeBytes] & mask) === (base[wholeBytes] & mask);
}

/**
 * True only for globally routable unicast addresses. This is deliberately
 * stricter than validateToolUrl's lexical hostname checks: DNS answers are the
 * security boundary, including A/AAAA answers for apparently public names.
 */
export function isPublicIpAddress(address) {
  const normalized = String(address || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  const family = isIP(normalized);
  if (family === 4) {
    return !BLOCKED_IPV4_CIDRS.some(([network, prefix]) => ipv4InCidr(normalized, network, prefix));
  }
  if (family === 6) {
    // Global unicast is 2000::/3. Explicit exclusions above cover special
    // allocations within that range; everything outside it is non-global.
    if (!ipv6InCidr(normalized, '2000::', 3)) return false;
    return !BLOCKED_IPV6_CIDRS.some(([network, prefix]) => ipv6InCidr(normalized, network, prefix));
  }
  return false;
}

/** Resolve every A/AAAA answer and fail closed if any answer is non-public. */
export async function resolvePublicTarget(hostname, lookupHost = dnsLookup) {
  const normalized = String(hostname || '').replace(/^\[|\]$/g, '');
  const literalFamily = isIP(normalized);
  const answers = literalFamily
    ? [{ address: normalized, family: literalFamily }]
    : await lookupHost(normalized, { all: true, verbatim: true });

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error('Source hostname did not resolve to an address');
  }
  for (const answer of answers) {
    const family = Number(answer?.family) || isIP(answer?.address || '');
    if ((family !== 4 && family !== 6) || !isPublicIpAddress(answer?.address)) {
      throw new Error('Source hostname resolved to a non-public address');
    }
  }

  // requestPinnedHttps binds this exact validated answer into the socket
  // lookup callback. It cannot perform a second DNS lookup (DNS rebinding).
  const selected = answers[0];
  return { address: selected.address, family: Number(selected.family) || isIP(selected.address) };
}

function responseHeader(headers, name) {
  const value = headers?.[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : value || null;
}

/**
 * Connect to one validated address while retaining the original hostname for
 * Host, SNI, and certificate verification.
 */
export function buildPinnedHttpsRequestOptions(parsed, target, signal) {
  const tlsHostname = parsed.hostname.replace(/^\[|\]$/g, '');
  return {
    protocol: 'https:',
    hostname: tlsHostname,
    port: parsed.port || 443,
    path: `${parsed.pathname || '/'}${parsed.search || ''}`,
    method: 'GET',
    // Never reuse a pooled socket: the validated target must be the address
    // used for this request, not a connection created by an earlier lookup.
    agent: false,
    family: target.family,
    servername: isIP(tlsHostname) ? undefined : tlsHostname,
    lookup: (_hostname, options, callback) => {
      if (options?.all) callback(null, [target]);
      else callback(null, target.address, target.family);
    },
    signal,
    headers: {
      Host: parsed.host,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'identity',
    },
  };
}

export function requestPinnedHttps(parsed, target, signal) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      buildPinnedHttpsRequestOptions(parsed, target, signal),
      (response) => {
        const status = Number(response.statusCode || 0);
        const resultBase = {
          status,
          ok: status >= 200 && status < 300,
          headers: { get: (name) => responseHeader(response.headers, name) },
        };

        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ ...resultBase, text: async () => '' });
          return;
        }

        const chunks = [];
        let byteCount = 0;
        response.on('data', (chunk) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteCount += bytes.length;
          if (byteCount > MAX_RAW_HTML_BYTES) {
            request.destroy(new Error('Source response exceeded the maximum allowed size'));
            return;
          }
          chunks.push(bytes);
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ ...resultBase, text: async () => body });
        });
        response.on('error', reject);
      }
    );
    request.on('error', reject);
    request.end();
  });
}

export async function fetchPublicHtml(url, signal, dependencies = {}) {
  const lookupHost = dependencies.lookupHost || dnsLookup;
  const requestPinned = dependencies.requestPinned || requestPinnedHttps;
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const parsed = new URL(currentUrl);
    if (parsed.username || parsed.password)
      throw new Error('Source URL credentials are not allowed');
    validateToolUrl(parsed.toString());

    const target = await resolvePublicTarget(parsed.hostname, lookupHost);
    const response = await requestPinned(parsed, target, signal);
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers?.get?.('location');
    if (!location) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error('Source URL redirected too many times');
    currentUrl = new URL(location, parsed).toString();
  }
  throw new Error('Source URL redirected too many times');
}

export async function handle(admin, payload, req, dependencies = {}) {
  const goal = await loadGoal(admin, payload.goalId);

  const authorization = await requireSystemEnrichmentAuthorization({
    admin,
    goal,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE,
    planningFallbackAction: 'team-formation',
    req,
    log,
  });
  if (!authorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: authorization.deferred ? 'deferred_until_approval' : 'authorization_required',
    };
  }

  const enrichmentContext = resolveNativeEnrichmentContext(goal);
  if (!enrichmentContext.ready) {
    log.warn(req, 'clone-reference.native-scope-authority-invalid', {
      goalId: goal.id,
      reasons: enrichmentContext.reasons,
    });
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: 'native_scope_authority_invalid',
    };
  }
  const authorizedUrls = authorization.enrichment?.source_urls || [];
  const cloneGoal = enrichmentContext.native ? authorizedUrls.length > 0 : isCloneRestyleGoal(goal);

  // Not a clone goal → no-op, advance to team-formation
  if (!cloneGoal) {
    log.info(req, 'clone-reference.skipped.not-clone-goal', { goalId: goal.id });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE,
      action: 'image-pool',
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'clone-reference',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: 'skipped',
    };
  }

  // Already populated (e.g. iterate re-entered the pipeline)
  if (
    goal.data?.clone_reference?.sources?.length &&
    enrichmentScopeIsCurrent(enrichmentContext, goal.data?.clone_reference?.scope_hash)
  ) {
    log.info(req, 'clone-reference.skipped.already-set', { goalId: goal.id });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE,
      action: 'image-pool',
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'clone-reference',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: 'already_set',
    };
  }

  const mode =
    authorizedUrls.length > 1 || isMultiSourceCloneGoal(enrichmentContext.goal)
      ? 'multi'
      : 'single';
  // Fetch only the exact URLs shown to the user and frozen in the signed gate-2
  // manifest. The live-goal URL equality check above prevents post-approval edits.
  const allUrls = authorizedUrls;
  const urls = mode === 'single' ? allUrls.slice(0, 1) : allUrls.slice(0, MAX_SOURCES_MULTI);

  if (urls.length === 0) {
    // Detector said clone goal but no URLs extracted — degraded path,
    // skip without failing the pipeline.
    log.warn(req, 'clone-reference.no-urls', { goalId: goal.id });
    const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
      admin,
      goalId: goal.id,
      enrichmentId: SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE,
      action: 'image-pool',
      req,
      log,
    });
    if (!nextAuthorization.ok) {
      return {
        type: 'orchestrate-goal',
        action: 'clone-reference',
        goalId: goal.id,
        status: 'authorization_lost',
      };
    }
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: 'no_urls',
    };
  }

  log.info(req, 'clone-reference.start', { goalId: goal.id, mode, urlCount: urls.length });

  const fetchHtml = dependencies.fetchHtml || fetchPublicHtml;
  const sources = await Promise.all(urls.map((u) => fetchAndCleanOne(u, req, fetchHtml)));

  const cloneReference = {
    mode,
    sources,
    created_at: new Date().toISOString(),
    ...(enrichmentContext.native ? { scope_hash: enrichmentContext.scopeHash } : {}),
  };

  const writeAuthorization = await recheckSystemEnrichmentAuthorization({
    admin,
    goalId: goal.id,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE,
    req,
    log,
  });
  if (!writeAuthorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }

  const persisted = await updateGoalIfExecutionAuthorized(
    admin,
    goal.id,
    writeAuthorization.snapshot_hash,
    {
      data: { ...(writeAuthorization.goal.data || {}), clone_reference: cloneReference },
    }
  );
  if (!persisted) {
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }

  await logGoalEvent(admin, goal.id, 'clone_reference_created', {
    mode,
    source_count: sources.length,
    successful: sources.filter((s) => s.status === 'ok').length,
    total_bytes: sources.reduce((a, s) => a + (s.byte_count || 0), 0),
  });

  const nextAuthorization = await enqueueAuthorizedSystemEnrichmentNext({
    admin,
    goalId: goal.id,
    enrichmentId: SYSTEM_ENRICHMENT_IDS.CLONE_REFERENCE,
    action: 'image-pool',
    req,
    log,
  });
  if (!nextAuthorization.ok) {
    return {
      type: 'orchestrate-goal',
      action: 'clone-reference',
      goalId: goal.id,
      status: 'authorization_lost',
    };
  }
  return {
    type: 'orchestrate-goal',
    action: 'clone-reference',
    goalId: goal.id,
    status: 'created',
    mode,
    sourceCount: sources.length,
  };
}

/**
 * Fetch one URL and return a normalized source record. Never throws — on
 * failure returns { status: 'error', error: '...' } so partial multi-source
 * fetches still proceed.
 */
async function fetchAndCleanOne(url, req, fetchHtml = fetchPublicHtml) {
  const fetchedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html;
    try {
      const resp = await fetchHtml(url, controller.signal);
      if (!resp.ok) {
        return { url, status: 'error', error: `HTTP ${resp.status}`, fetched_at: fetchedAt };
      }
      html = await resp.text();
    } finally {
      clearTimeout(timer);
    }

    if (html.length > MAX_RAW_HTML_BYTES) {
      html = html.slice(0, MAX_RAW_HTML_BYTES);
    }

    const cleaned = cleanHtml(html);
    const outline = extractOutline(html);

    return {
      url,
      status: 'ok',
      byte_count: cleaned.length,
      cleaned_html: cleaned,
      outline,
      fetched_at: fetchedAt,
    };
  } catch (err) {
    log.warn(req, 'clone-reference.fetch-failed', { url, error: err.message });
    return { url, status: 'error', error: err.message, fetched_at: fetchedAt };
  }
}

/**
 * Strip behavior + noise from raw HTML, keep structure + content + inline CSS.
 * The LLM uses this as a structural reference; we want headings, copy, sections,
 * class names, color values — not analytics, ad pixels, or React hydration data.
 */
export function cleanHtml(raw) {
  if (!raw) return '';
  let html = String(raw);

  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css) => {
    // Keep CSS but compress whitespace — the LLM benefits from seeing palette
    // hex values and font-family declarations.
    const compact = String(css).replace(/\s+/g, ' ').trim();
    return `<style>${compact.slice(0, 4000)}</style>`;
  });
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '<svg/>');
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/\s+/g, ' ');
  html = html.replace(/>\s+</g, '><');

  if (html.length > MAX_CLEANED_HTML_BYTES) {
    html = html.slice(0, MAX_CLEANED_HTML_BYTES);
  }
  return html.trim();
}

/**
 * Extract a small structural outline so the LLM gets section landmarks even
 * if it doesn't read the full HTML carefully. Lightweight regex parsing —
 * good enough for marketing/landing pages.
 */
export function extractOutline(raw) {
  if (!raw) return { title: '', metas: [], h1s: [], h2s: [], sections: [] };
  const html = String(raw);

  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim().slice(0, 200);

  const metas = [];
  const metaRe = /<meta\b([^>]+)>/gi;
  let m;
  while ((m = metaRe.exec(html)) && metas.length < 20) {
    const attrs = m[1];
    const nameOrProp = attrs.match(/(?:name|property)\s*=\s*['"]([^'"]+)['"]/i)?.[1];
    const content = attrs.match(/content\s*=\s*['"]([^'"]*)['"]/i)?.[1];
    if (nameOrProp && content && content.length < 300) {
      if (
        /^(?:description|og:title|og:description|twitter:title|twitter:description|keywords|theme-color)$/i.test(
          nameOrProp
        )
      ) {
        metas.push({ key: nameOrProp, value: content.trim() });
      }
    }
  }

  const collect = (re, cap) => {
    const arr = [];
    let mm;
    while ((mm = re.exec(html)) && arr.length < cap) {
      const text = mm[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) arr.push(text.slice(0, 200));
    }
    return arr;
  };
  const h1s = collect(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, 5);
  const h2s = collect(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, 20);

  // Section landmarks present (just the tag types, count each)
  const sections = [];
  const landmarkRe = /<(section|header|footer|nav|aside|main)\b/gi;
  const counts = {};
  let lm;
  while ((lm = landmarkRe.exec(html))) {
    counts[lm[1].toLowerCase()] = (counts[lm[1].toLowerCase()] || 0) + 1;
  }
  for (const [tag, count] of Object.entries(counts)) {
    sections.push({ tag, count });
  }

  return { title, metas, h1s, h2s, sections };
}
