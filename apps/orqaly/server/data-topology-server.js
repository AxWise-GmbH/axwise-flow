/**
 * Lightweight local dev server for /api/data-topology.
 * Run with: node server/data-topology-server.js
 *
 * Loads env vars from .env, imports the Vercel handler,
 * and serves it on port 3002 so Vite can proxy to it.
 */

import 'dotenv/config';
import http from 'node:http';

// Dynamic import of the Vercel handler
const { default: handler } = await import('../api/data-topology.js');

const PORT = process.env.DATA_TOPOLOGY_PORT || 3099;

const server = http.createServer(async (req, res) => {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Adapt Node http req/res to the shape the Vercel handler expects
  req.query = Object.fromEntries(new URL(req.url, `http://localhost:${PORT}`).searchParams);

  const originalEnd = res.end.bind(res);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    originalEnd(JSON.stringify(data));
  };

  try {
    await handler(req, res);
  } catch (err) {
    console.error('data-topology error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    originalEnd(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`  data-topology API running at http://localhost:${PORT}/api/data-topology`);
});
