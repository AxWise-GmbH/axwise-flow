#!/usr/bin/env node
/**
 * Local API server for dev:local.
 *
 * Reason this exists: `vercel dev` detects the Vite framework preset and
 * runs `vite` on the same port, which swallows all /api/* requests before
 * the serverless functions get a chance. This shim imports each api/*.js
 * handler directly and serves them over Express, so requests to
 * http://localhost:3001/api/* execute the same code that prod Vercel runs
 * — but with access to .env.local + ~/.claude/ OAuth tokens.
 *
 * The Vite dev server stays on its own port (5176) and proxies /api to
 * this server via VITE_API_URL=http://localhost:3001.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import { loadVercelRewrites } from './_lib/vercel-rewrites.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env.local explicitly (dotenv only picks up .env by default).
try {
  const envPath = resolve(ROOT, '.env.local');
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
} catch (err) {
  console.warn('[local-api] could not read .env.local:', err.message);
}

const PORT = Number(process.env.LOCAL_API_PORT || 3001);

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// CORS for the Vite dev origin (5176).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Import the Vercel-style function handlers. Each exports a default
// `(req, res) => void` that accepts a Node IncomingMessage/ServerResponse.
// Express req/res are compatible.
const handlers = {
  '/api/app': (await import('../api/app.js')).default,
  '/api/agent': (await import('../api/agent.js')).default,
  '/api/concilium': (await import('../api/concilium.js')).default,
  '/api/ops': (await import('../api/ops.js')).default,
  '/api/communicator': (await import('../api/communicator.js')).default,
  '/api/invest': (await import('../api/invest.js')).default,
  '/api/invest-public': (await import('../api/invest-public.js')).default,
  '/api/oauth-callback': (await import('../api/oauth-callback.js')).default,
};

for (const [path, handler] of Object.entries(handlers)) {
  app.all(path, async (req, res) => {
    try {
      // Vercel handlers read `req.query` — Express already populates it.
      await handler(req, res);
    } catch (err) {
      console.error(`[local-api] ${path} threw:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
      }
    }
  });
}

// Rewrites come straight from vercel.json — see scripts/_lib/vercel-rewrites.js
// for why they are not duplicated here.
const rewrites = loadVercelRewrites(resolve(ROOT, 'vercel.json'));

// A rewrite pointing at a dispatcher we never imported would only surface as a
// 404 at request time, which is the failure mode this whole module exists to
// kill. Fail at boot instead.
const orphans = rewrites.filter((r) => !handlers[r.base]);
if (orphans.length) {
  console.error('[local-api] vercel.json rewrites target handlers that are not imported here:');
  for (const { source, base } of orphans) console.error(`  ${source} -> ${base}`);
  process.exit(1);
}

for (const { source, base, staticQuery, paramQuery } of rewrites) {
  app.all(source, async (req, res) => {
    const merged = { ...staticQuery, ...(req.query || {}) };
    // Path params are applied last so the URL path wins over a query string
    // trying to override it (e.g. /webhook/telegram?platform=slack).
    for (const [key, param] of Object.entries(paramQuery)) merged[key] = req.params[param];
    // Express 5 defines req.query as a getter-only property, so plain
    // `req.query = merged` throws 'Cannot set property query'. Redefine
    // the property to replace the getter with a data slot — downstream
    // Vercel-style handlers read req.query directly and don't care how
    // the value got there.
    Object.defineProperty(req, 'query', {
      value: merged,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    req.url = `${base}?${new URLSearchParams(merged).toString()}`;
    try {
      await handlers[base](req, res);
    } catch (err) {
      console.error(`[local-api] rewrite ${source} -> ${base} threw:`, err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });
}

app.get('/', (_req, res) =>
  res.json({ ok: true, message: 'Local API dev server', endpoints: Object.keys(handlers) })
);

// Unmatched /api/* must answer in JSON. Express's default 404 is an HTML page,
// which callers doing `res.json().catch(() => ({}))` silently turn into a
// domain error ("Failed to send invitation.") that hides the real cause.
// Note: app.use('/api', ...) rather than app.all('/api/*', ...) — the latter
// throws at startup on Express 5 (an unnamed wildcard needs to be /api/*splat).
app.use('/api', (req, res) =>
  res.status(404).json({ error: `No local API route for ${req.method} ${req.originalUrl}` })
);

// Keep the dev server alive across unhandled async errors. Without these,
// any rejected promise in a route or background job (reconciler, pulse,
// self-healer) silently terminates the Node process — which is exactly the
// symptom that kept hiding "Create Goal does nothing" as an API outage.
// We log loud and leave the process standing so the next request works.
process.on('unhandledRejection', (err) => {
  console.error('[local-api] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[local-api] uncaught exception:', err);
});

app.listen(PORT, () => {
  console.log(`\n[local-api] listening on http://localhost:${PORT}`);
  console.log(`[local-api] endpoints:`, Object.keys(handlers).join(', '));
  console.log(`[local-api] set VITE_API_URL=http://localhost:${PORT} for the Vite dev server\n`);
});
