import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] || 'dist');

function requireFile(path) {
  if (!existsSync(resolve(dist, path))) {
    throw new Error(`full web build is missing ${path}`);
  }
}

for (const file of ['index.html', 'manifest.json', 'logo.svg', 'sw.js']) {
  requireFile(file);
}

const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
if (!html.includes('id="root"') || !html.includes('/manifest.json')) {
  throw new Error('index.html is not the full Orqaly application shell');
}

const assets = readdirSync(resolve(dist, 'assets'));
for (const routeChunk of ['Home', 'About', 'WorkflowV2']) {
  if (!assets.some((name) => new RegExp(`^${routeChunk}-.+\\.js$`).test(name))) {
    throw new Error(`full web build is missing the ${routeChunk} route chunk`);
  }
}

if (!assets.some((name) => /^index-[A-Za-z0-9_-]{8,}\.js$/.test(name))) {
  throw new Error('full web build is missing a content-hashed entry chunk');
}

const forbiddenRuntimeMarkers = [
  'orchestratori.vercel.app',
  'VERCEL_OIDC_TOKEN',
  '@vercel/functions',
  '@vercel/oidc',
  'orch_auth_users',
  'signInWithPassword',
  'TOTP requires Supabase',
];

for (const asset of assets.filter((name) => /\.m?js$/.test(name))) {
  const source = readFileSync(resolve(dist, 'assets', asset), 'utf8');
  const forbidden = forbiddenRuntimeMarkers.find((marker) => source.includes(marker));
  if (forbidden) {
    throw new Error(`full web build contains forbidden runtime marker ${forbidden} in ${asset}`);
  }
}

console.log(`Verified full Orqaly SPA: ${assets.length} generated assets plus public files.`);
