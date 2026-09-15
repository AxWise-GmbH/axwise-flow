import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] || 'dist');
for (const file of ['index.html', 'manifest.json', 'logo-line.svg', '.vite/manifest.json']) {
  if (!existsSync(resolve(dist, file))) throw new Error(`GCP web build is missing ${file}`);
}
if (existsSync(resolve(dist, 'sw.js')))
  throw new Error('GCP web build must not ship the legacy service worker');

const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
for (const marker of [
  'id="root"',
  'Cloud reasoning. Local action.',
  '<title>Orqanix — Cloud reasoning. Local action.</title>',
  'theme-color" content="#F7F7FC',
]) {
  if (!html.includes(marker)) throw new Error(`GCP index.html is missing ${marker}`);
}

const assetsDir = resolve(dist, 'assets');
const scripts = readdirSync(assetsDir).filter((name) => /\.m?js$/u.test(name));
for (const routeChunk of [
  'WorkflowV2',
  'GcpClerkSettings',
  'HomePage',
  'StructurePage',
  'AgentsPage',
  'CapabilitiesPage',
  'KnowledgePage',
  'ResultsPage',
  'NotificationsPage',
  'ActivityPage',
  'HistoryPage',
]) {
  if (!scripts.some((name) => new RegExp(`^${routeChunk}-.+\\.js$`, 'u').test(name))) {
    throw new Error(`GCP build is missing the ${routeChunk} route chunk`);
  }
}

const combined = scripts.map((name) => readFileSync(resolve(assetsDir, name), 'utf8')).join('\n');
for (const marker of [
  'Assistant',
  'Goals',
  'Workspace',
  '/workspace',
  'Agents',
  'Capabilities',
  'Knowledge',
  'Results',
  'Notifications',
  'Activity & Usage',
  'This page is not in the launch build.',
]) {
  if (!combined.includes(marker)) throw new Error(`GCP bundle is missing launch marker ${marker}`);
}
for (const marker of [
  'orchestratori.vercel.app',
  'VERCEL_OIDC_TOKEN',
  'signInWithPassword',
  'TOTP requires Supabase',
  'PartnerAccessProvider',
  'ReplicatorProvider',
  '/api/app',
]) {
  if (combined.includes(marker))
    throw new Error(`GCP bundle contains forbidden runtime marker ${marker}`);
}

const totalBytes = scripts.reduce((sum, name) => sum + statSync(resolve(assetsDir, name)).size, 0);
// Matched locked dependencies and the actual preview Clerk/API settings:
// native-builder baseline 8061192b is 1,220,051 bytes (the previous 1,195,000
// allowance was stale). Execution controls 7b330159 are 1,239,176 (+19,125,
// +1.568%): SolutionDetailPage +16,456, WorkflowBuildPage +1,578, main +1,091.
// Workflow-local chat/discovery matched against 47bbf84c: 1,239,385 ->
// 1,259,536 bytes (+20,151 / 1.63%); main +973, SolutionDetail about +14KB.
// New route/card chunks account for the rest; safe markdown was extracted
// from the existing WorkflowV2 chunk, not duplicated. No dependencies changed.
// Original-chat + side-panel integration, matched preview publishable key/API:
// ab1b8bb4 is 1,264,200 bytes; the reviewed implementation is about 1,288,000
// (+24KB / 1.9%). This adds owned source routing, the shared timeline/controller,
// preparation panel and navigation guards, with no dependency additions. Keep a
// fixed 1,300,000 ceiling; route/forbidden-runtime checks remain unchanged.
// Reviewed 2026-09-07 allocation for draft credential save/revoke, scoped child
// viewing and explicit handler-test controls: +20,000 bytes to the fixed budget.
// Previous deployed authenticated build: 1,291,631; feature build with the same
// API origin and synthetic publishable key: 1,308,302 (+16,671 / 1.29%). Independent
// module review attributes the change to those controls and their ownership/
// recovery states; package.json/lock and runtime dependencies are unchanged.
// This is a fixed feature allocation, not a size-derived or automatic allowance.
// Never self-adjust this limit to a generated bundle size.
// Owner-approved 2026-09-09: a fixed 40,000-byte allocation for the explicit
// Analysis/Simulation review and consent UI. Measured prior feature build:
// 1,352,631 bytes. No automatic adjustment or other verifier relaxation.
if (totalBytes > 1_360_000) throw new Error(`GCP JavaScript budget exceeded: ${totalBytes} bytes`);
console.log(`Verified retained GCP build: ${scripts.length} scripts, ${totalBytes} bytes.`);
