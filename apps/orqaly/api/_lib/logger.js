/**
 * Structured JSON logger for Vercel serverless handlers.
 *
 * Vercel captures console.log/warn/error and surfaces them in the Functions
 * log tab. Emitting JSON makes entries machine-searchable (Vercel log drains,
 * Datadog, Axiom, etc.) without any additional transport layer.
 *
 * Usage:
 *   import { createLogger } from './_lib/logger.js';
 *   const log = createLogger('send-email');
 *
 *   const done = log.startTimer(req, 'request', { method: req.method });
 *   log.warn(req, 'rate.limited', { remaining: 0, reset_at: rl.resetAt });
 *   log.error(req, 'resend.error', err, { recipients: 2 });
 *   done({ status: 200, email_id: data.id });
 */

// ── Sensitive field masking ──────────────────────────────────────────────────

/**
 * Keys whose values are replaced with '[REDACTED]'.
 * Normalized before matching: lowercased, hyphens/underscores/spaces stripped.
 */
const SENSITIVE = new Set([
  'password',
  'passwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'apisecret',
  'secret',
  'authorization',
  'cookie',
  'privatekey',
  'servicekey',
  'supabasekey',
  'resendapikey',
  'xapikey',
  'xfigmatoken',
  'xsubscriptiontoken',
  'anthropicapikey',
  'openaiapikey',
  'groqapikey',
  'deepseekapikey',
  'glmapikey',
  'qwenapikey',
  'openrouterapikey',
  'elevenlabsapikey',
  'assemblyaiapikey',
  'deepgramapikey',
  'huggingfaceapikey',
  'composioapikey',
  'stabilityapikey',
  'replicateapitoken',
  'slackbottoken',
  'githubtoken',
  'vercelaigatewaykey',
  'orqkekv1',
  'dekwrap',
  'envelope',
  'ciphertext',
  'plaintext',
  'fingerprint',
  'vtapikey',
  'virustotalapikey',
  'vtscanid',
  'storagepath',
  'securitysample',
  'injectionflags',
  'rawmessage',
  'rawmsg',
]);

function normalizeKey(k) {
  return String(k).toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * Deep-clone obj, replacing values of sensitive keys with '[REDACTED]'.
 * Max depth 4 guards against accidental circular references.
 *
 * @param {unknown} obj
 * @param {number} [depth]
 * @returns {unknown}
 */
function maskObject(obj, depth = 0) {
  if (depth > 4 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => maskObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.has(normalizeKey(k))) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = maskObject(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Request context ──────────────────────────────────────────────────────────

/**
 * Extract a stable request ID from Vercel or standard proxy headers.
 * x-vercel-id is set on every Vercel invocation; x-request-id is a common
 * upstream convention. Returns null when neither is present.
 *
 * @param {import('http').IncomingMessage|null} req
 * @returns {string|null}
 */
function getRequestId(req) {
  return req?.headers?.['x-vercel-id'] || req?.headers?.['x-request-id'] || null;
}

// ── Entry builder ────────────────────────────────────────────────────────────

/**
 * @param {'info'|'warn'|'error'} level
 * @param {string} module
 * @param {string} action
 * @param {import('http').IncomingMessage|null} req
 * @param {object|null} extra
 * @returns {object}
 */
function buildEntry(level, module, action, req, extra) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    action,
  };
  const reqId = req ? getRequestId(req) : null;
  if (reqId) entry.request_id = reqId;
  if (extra && typeof extra === 'object') {
    Object.assign(entry, maskObject(extra));
  }
  return entry;
}

function emit(level, entry) {
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a module-scoped structured logger.
 *
 * All methods accept a nullable `req` parameter so they can be called both
 * inside and outside a request context (e.g. during module initialisation).
 *
 * Sensitive fields in `extra` are automatically masked before serialisation.
 *
 * @param {string} module - Handler or library name, e.g. 'send-email'
 * @returns {{ info, warn, error, startTimer }}
 */
export function createLogger(module) {
  return {
    /**
     * Log an informational event.
     *
     * @param {import('http').IncomingMessage|null} req
     * @param {string} action  - e.g. 'request.start', 'cache.hit'
     * @param {object} [extra] - Additional structured context
     */
    info(req, action, extra) {
      emit('info', buildEntry('info', module, action, req, extra));
    },

    /**
     * Log a warning — rate limits, degraded paths, non-fatal mismatches.
     *
     * @param {import('http').IncomingMessage|null} req
     * @param {string} action  - e.g. 'rate.limited', 'config.missing'
     * @param {object} [extra]
     */
    warn(req, action, extra) {
      emit('warn', buildEntry('warn', module, action, req, extra));
    },

    /**
     * Log an error.
     *
     * When errOrExtra is an Error (or error-shaped object), its .message and
     * status/code are extracted into `error` and `error_code` fields.
     * When errOrExtra is a plain object it is treated as extra context.
     *
     * @param {import('http').IncomingMessage|null} req
     * @param {string} action        - e.g. 'resend.error', 'unhandled'
     * @param {Error|object} errOrExtra
     * @param {object} [extra]       - Additional context when errOrExtra is an Error
     *
     * @example
     *   log.error(req, 'resend.error', err, { recipients: 2 });
     *   log.error(req, 'config.missing', { field: 'RESEND_API_KEY' });
     */
    error(req, action, errOrExtra, extra) {
      const isError =
        errOrExtra != null &&
        (errOrExtra instanceof Error || typeof errOrExtra.message === 'string');
      const errFields = isError
        ? {
            error: errOrExtra.message,
            error_code: errOrExtra.status ?? errOrExtra.code ?? errOrExtra.statusCode ?? null,
          }
        : null;
      const contextFields = isError ? extra || {} : errOrExtra || {};
      emit('error', buildEntry('error', module, action, req, { ...errFields, ...contextFields }));
    },

    /**
     * Start a wall-clock timer and emit an `<action>.start` log immediately.
     * Returns a completion function that emits `<action>.complete` with
     * `duration_ms` automatically included.
     *
     * Call the returned function at every exit point of the measured block.
     *
     * @param {import('http').IncomingMessage|null} req
     * @param {string} action  - Base name; produces '<action>.start' / '<action>.complete'
     * @param {object} [extra] - Context attached to the start log
     * @returns {(extra?: object) => void}
     *
     * @example
     *   const done = log.startTimer(req, 'request', { method: req.method });
     *   // ... handler work ...
     *   done({ status: 200, email_id: data.id });
     */
    startTimer(req, action, extra) {
      const start = Date.now();
      this.info(req, `${action}.start`, extra);
      return (completionExtra) => {
        this.info(req, `${action}.complete`, {
          ...completionExtra,
          duration_ms: Date.now() - start,
        });
      };
    },
  };
}
