/**
 * Report-ingest handler (consolidated under api/ops for Vercel free plan).
 * POST/GET/DELETE /api/report-ingest
 */
import crypto from 'node:crypto';
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';

const SESSIONS = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function generateToken() {
  return 'orch_' + crypto.randomBytes(18).toString('base64url');
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of SESSIONS) {
    if (now - session.createdAt > SESSION_TTL_MS) SESSIONS.delete(token);
  }
}

function getOrCreateSession(token) {
  if (SESSIONS.has(token)) return SESSIONS.get(token);
  return null;
}

function buildWebhookUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'orchestratori.vercel.app';
  return `${proto}://${host}/api/report-ingest`;
}

export default async function handler(req, res) {
  cors(res, req);
  res.setHeader('Access-Control-Expose-Headers', 'x-report-token');
  res.setHeader('X-API-Version', '1');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  // ── Rate limit ────────────────────────────────────────────────
  const rlKey = getRateLimitIdentifier(req);
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  cleanExpiredSessions();

  try {
    if (req.method === 'POST' && req.body?.action === 'create-session') {
      const token = generateToken();
      const webhookUrl = buildWebhookUrl(req);
      const session = {
        token,
        userId: user.id,
        createdAt: Date.now(),
        data: {},
        meta: null,
        history: [],
        lastUpdated: null,
      };
      SESSIONS.set(token, session);
      return res.status(201).json({
        token,
        webhookUrl,
        expiresIn: '24h',
        usage: {
          curl: `curl -X POST ${webhookUrl} -H "Content-Type: application/json" -H "x-report-token: ${token}" -d '{"kpis":[{"label":"Revenue","value":50000}]}'`,
          n8n: {
            method: 'POST',
            url: webhookUrl,
            headers: { 'Content-Type': 'application/json', 'x-report-token': token },
            body: '{ "kpis": [...], "trends": [...] }',
          },
          make: {
            module: 'HTTP > Make a request',
            url: webhookUrl,
            method: 'POST',
            headers: [{ name: 'x-report-token', value: token }],
          },
          mcp: {
            tool: 'http_request',
            params: {
              url: webhookUrl,
              method: 'POST',
              headers: { 'x-report-token': token },
              body: '{ "kpis": [...] }',
            },
          },
        },
      });
    }

    if (req.method === 'POST') {
      const token =
        req.headers['x-report-token'] || req.headers['X-Report-Token'] || req.query?.token;
      if (!token) return jsonError(res, 401, 'Missing x-report-token header or token query param');
      const session = getOrCreateSession(token);
      if (!session) return jsonError(res, 404, 'Session not found. Create one first via action=create-session.');
      if (session.userId && session.userId !== user.id) {
        return jsonError(res, 403, 'Session belongs to another user');
      }
      const body = req.body || {};
      const { _meta, _append, ...reportData } = body;
      if (_meta) session.meta = { ...(session.meta || {}), ..._meta };
      if (_append) {
        for (const [key, value] of Object.entries(reportData)) {
          if (Array.isArray(value) && Array.isArray(session.data[key])) {
            session.data[key] = [...session.data[key], ...value];
          } else if (
            typeof value === 'object' &&
            value !== null &&
            typeof session.data[key] === 'object' &&
            session.data[key] !== null &&
            !Array.isArray(value)
          ) {
            session.data[key] = { ...session.data[key], ...value };
          } else {
            session.data[key] = value;
          }
        }
      } else {
        session.data = { ...session.data, ...reportData };
      }
      const timestamp = new Date().toISOString();
      session.lastUpdated = timestamp;
      session.history.push({
        at: timestamp,
        keys: Object.keys(reportData),
        append: !!_append,
        hasMeta: !!_meta,
        source: req.headers['user-agent']?.slice(0, 80) || 'unknown',
      });
      if (session.history.length > 100) session.history = session.history.slice(-100);
      return res.status(200).json({
        success: true,
        receivedKeys: Object.keys(reportData),
        totalKeys: Object.keys(session.data).length,
        timestamp,
        meta: session.meta,
      });
    }

    if (req.method === 'GET') {
      const token = req.query?.token;
      if (!token) return jsonError(res, 400, 'Missing "token" query parameter');
      const session = getOrCreateSession(token);
      if (!session) return jsonError(res, 404, 'Session not found or expired');
      const after = req.query?.after;
      const historyFiltered = after ? session.history.filter((h) => h.at > after) : session.history;
      return res.status(200).json({
        token: session.token,
        data: session.data,
        meta: session.meta,
        lastUpdated: session.lastUpdated,
        createdAt: new Date(session.createdAt).toISOString(),
        expiresAt: new Date(session.createdAt + SESSION_TTL_MS).toISOString(),
        history: historyFiltered.slice(-20),
        totalKeys: Object.keys(session.data).length,
      });
    }

    if (req.method === 'DELETE') {
      const token = req.query?.token;
      if (!token) return jsonError(res, 400, 'Missing "token" query parameter');
      SESSIONS.delete(token);
      return res.status(200).json({ success: true, message: 'Session cleared' });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'report-ingest');
  }
}
