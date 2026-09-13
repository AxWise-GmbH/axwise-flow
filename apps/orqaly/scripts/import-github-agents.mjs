#!/usr/bin/env node
/**
 * Import front-matter markdown agents from a public GitHub repo into a user's
 * `agents` table, headlessly.
 *
 * Why this exists: the interactive path (Marketplace -> Import Library -> Bulk
 * Activate) needs a browser session logged in as the target account, and the
 * materializer behind it is frontend-only (localStorage + user JWT). This script
 * does the same job for an account you can name by email.
 *
 * Recognized format: front-matter markdown agents scoped by a root divisions.json
 * (the contains-studio/agency-agents family). This mirrors the primary case of
 * lib/api-handlers/github-agents-import.js, which stays untouched — its parsing
 * helpers are not exported, so the small amount of logic is repeated here.
 *
 * Imported agents land with metadata.tools = []. Repo agents declare no Orqaly
 * tool ids (the few `tools:` keys name Claude Code's own Read/Write/Bash), so
 * there is nothing to carry through. Tool assignment is a separate pass.
 *
 * Usage:
 *   node scripts/import-github-agents.mjs --email=someone@example.com \
 *     --repo=https://github.com/msitarzewski/agency-agents [--dry-run] [--limit=N]
 */
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { admin } from './_lib/admin-client.mjs';
import { screenSystemPrompt } from '../lib/concilium-handlers/agent-config-validator.js';
import { defaultProvider, defaultModel } from '../lib/_shared/llm-defaults.js';

const MAX_BYTES = 20000; // per raw file, mirrors github-agents-import.js
const RAW_CONCURRENCY = 6;
const INSERT_BATCH = 50;

export function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => {
      if (!a.startsWith('--')) return [a, true];
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
  );
}

// ── Parsing ────────────────────────────────────────────────────────────────
export function parseFrontMatter(text) {
  const m = /^﻿?---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(text || '');
  if (!m) return { data: null, body: text || '' };
  let data = null;
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch {
    data = null;
  }
  return { data, body: (text || '').slice(m[0].length) };
}

function toArray(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

/**
 * Map one repo file to an importable item, or null when it isn't an agent.
 * `data.tools` is deliberately ignored: in this repo family it holds Claude Code
 * tool names (Read/Write/Bash), not Orqaly `tool-*`/`mcp-*` ids.
 */
export function mapAgentFile(entry, text, repoUrl) {
  const { data, body } = parseFrontMatter(text);
  if (!data) return null;
  const role = String(data.name || data.title || '').trim();
  const systemPrompt = String(body || '').trim();
  if (!role || systemPrompt.length < 10) return null;
  return {
    role,
    description: typeof data.description === 'string' ? data.description : '',
    category: entry.category || 'Imported',
    capabilities: toArray(data.capabilities || data.tags),
    system_prompt: systemPrompt,
    _path: entry.path,
    _url: repoUrl,
  };
}

/**
 * Split items into what to insert and what to skip: roles already on the account,
 * and roles repeated within the repo itself (the same front-matter `name` can
 * appear in two divisions — first one wins).
 */
export function dedupe(items, existingRoles) {
  const seen = new Set();
  const fresh = [];
  const skippedExisting = [];
  const skippedDuplicate = [];
  for (const item of items) {
    if (existingRoles.has(item.role)) {
      skippedExisting.push(item);
      continue;
    }
    if (seen.has(item.role)) {
      skippedDuplicate.push(item);
      continue;
    }
    seen.add(item.role);
    fresh.push(item);
  }
  return { fresh, skippedExisting, skippedDuplicate };
}

// ── Row shape ──────────────────────────────────────────────────────────────
const rid = () => Math.random().toString(36).slice(2, 8);

/**
 * Source of truth for this shape is localToSupabase() in
 * src/services/agentHubService.js — frontend code this script cannot import.
 * Keep the two in step.
 *
 * The `name` column holds the ROLE, not the display name: execute-phase.js and
 * team-assigner.js identify an agent by agent.name. Friendly names live in
 * metadata.friendly_name.
 */
export function buildAgentRow(item, userId, repoFullName) {
  const stamp = Date.now();
  return {
    user_id: userId,
    name: item.role,
    description: item.description || '',
    category: item.category || 'Imported',
    status: 'active', // team-assigner selects .eq('status', 'active')
    cost_per_task: 0,
    capabilities: item.capabilities || [],
    metadata: {
      agent_id: `agent-${stamp}-${rid()}`,
      local_id: `ah-${stamp}-${rid()}`,
      friendly_name: null, // the repo's `name` IS the role here
      connection_type: defaultProvider(),
      connection_id: null,
      input_format: 'text',
      output_format: 'json',
      constraints: {},
      performance_kpis: {},
      availability_status: 'available',
      added_by: { uid: 'system', email: 'github-import', date: new Date().toISOString() },
      blueprint_id: null,
      system_prompt: item.system_prompt,
      tools: [], // repo declares no Orqaly tool ids; assigned by a later pass
      provider: defaultProvider(),
      model: defaultModel(),
      imported_from: {
        source: 'github',
        url: item._url || null,
        repo: repoFullName,
        path: item._path || null,
      },
    },
  };
}

// ── GitHub ─────────────────────────────────────────────────────────────────
export function parseRepoUrl(url) {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#]|$)/i.exec(
    String(url || '')
  );
  if (!m) throw new Error(`Not a GitHub repo URL: ${url}`);
  return { owner: m[1], repo: m[2] };
}

function ghHeaders(accept) {
  const h = {
    Accept: accept || 'application/vnd.github+json',
    'User-Agent': 'orqaly-agent-import',
  };
  // 282 anonymous raw fetches will be throttled; GITHUB_TOKEN raises the limit.
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function ghJson(url) {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${url}`);
  return res.json();
}

/**
 * Fetch a raw file, retrying transient failures. Without the retry, a hiccup on
 * one of ~260 fetches silently drops that agent from the import — the caller
 * cannot tell "GitHub blipped" from "this file isn't an agent". Returns null
 * only after every attempt fails; callers must treat that as an error, not as
 * a non-agent file.
 */
async function fetchRaw(owner, repo, branch, path, attempts = 3) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: ghHeaders('text/plain') });
      if (res.ok) {
        const text = await res.text();
        return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
      }
      if (res.status === 404) return null; // genuinely absent; no point retrying
    } catch {
      // network error — fall through to the backoff below
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * 2 ** i));
  }
  return null;
}

async function mapWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

/**
 * Build the candidate list: .md blobs whose first path segment is a division key.
 * Scoping by divisions.json is what drops README/CONTRIBUTING, strategy/ (playbooks,
 * no front-matter) and integrations/ (conversion outputs, not source agents).
 */
export function buildInventory(tree, divisions) {
  const keys = new Set(Object.keys(divisions || {}));
  const label = (k) => divisions?.[k]?.label || k;
  const inventory = [];
  for (const node of tree) {
    if (node.type !== 'blob' || typeof node.path !== 'string') continue;
    if (!/\.md$/i.test(node.path)) continue;
    const segments = node.path.split('/');
    if (segments.length < 2 || !keys.has(segments[0])) continue;
    inventory.push({ path: node.path, category: label(segments[0]) });
  }
  return inventory;
}

async function discover(repoUrl, limit, { skipScreen = false } = {}) {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const meta = await ghJson(`https://api.github.com/repos/${owner}/${repo}`);
  const branch = meta.default_branch || 'main';
  const fullName = meta.full_name || `${owner}/${repo}`;
  const canonicalUrl = `https://github.com/${owner}/${repo}`;

  const treeData = await ghJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  if (treeData.truncated) {
    console.warn('! GitHub truncated the repo tree; some agents may be missing.');
  }

  const divisionsRaw = await fetchRaw(owner, repo, branch, 'divisions.json');
  let divisions = null;
  try {
    divisions = JSON.parse(divisionsRaw || '')?.divisions || null;
  } catch {
    divisions = null;
  }
  if (!divisions)
    throw new Error('No divisions.json found at repo root; this script only handles that layout.');

  let inventory = buildInventory(treeData.tree || [], divisions);
  if (limit) inventory = inventory.slice(0, Number(limit));
  console.log(
    `Found ${inventory.length} candidate agent files across ${Object.keys(divisions).length} divisions.`
  );

  const mapped = await mapWithConcurrency(inventory, RAW_CONCURRENCY, async (entry) => {
    const text = await fetchRaw(owner, repo, branch, entry.path);
    // A failed fetch is NOT a non-agent file. Keep the two apart so a transient
    // GitHub failure surfaces instead of quietly shrinking the import.
    if (text === null) return { entry, fetchFailed: true };
    return { entry, item: mapAgentFile(entry, text, canonicalUrl) };
  });

  const items = [];
  const fetchFailed = [];
  const notAgents = [];
  const rejected = [];
  for (const result of mapped) {
    if (result.fetchFailed) {
      fetchFailed.push(result.entry.path);
      continue;
    }
    if (!result.item) {
      notAgents.push(result.entry.path);
      continue;
    }
    const screen = screenSystemPrompt(result.item.system_prompt);
    if (screen.decision === 'denied') {
      rejected.push({ path: result.entry.path, role: result.item.role, reason: screen.reason });
      // --skip-screen still records the denial — it is an audited override for a
      // library the operator has chosen to trust, not a silent removal of the check.
      if (!skipScreen) continue;
    }
    items.push(result.item);
  }
  return { items, rejected, notAgents, fetchFailed, fullName };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  const repoUrl = args.repo;
  const dryRun = Boolean(args['dry-run']);
  const skipScreen = Boolean(args['skip-screen']);

  if (!email || !repoUrl) {
    console.error(
      'Usage: node scripts/import-github-agents.mjs --email=<email> --repo=<github url> [--dry-run] [--limit=N] [--skip-screen]'
    );
    process.exit(1);
  }

  // Resolve the user via the Admin Auth API. There is no profiles table — users
  // live only in auth.users. Hard-fail rather than guess at an account.
  const { data: userList, error: userErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (userErr) {
    console.error(`Could not list users: ${userErr.message}`);
    process.exit(1);
  }
  const user = userList.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  console.log(`Target: ${user.email} (${user.id})`);

  const { items, rejected, notAgents, fetchFailed, fullName } = await discover(
    repoUrl,
    args.limit,
    { skipScreen }
  );

  // Never let a network blip silently shrink the import.
  if (fetchFailed.length) {
    console.error(`\n${fetchFailed.length} file(s) could not be fetched after retries:`);
    for (const p of fetchFailed) console.error(`  ! ${p}`);
    console.error('Refusing to import a partial set. Re-run when GitHub is reachable.');
    process.exit(1);
  }

  const { data: existing, error: existErr } = await admin
    .from('agents')
    .select('name')
    .eq('user_id', user.id);
  if (existErr) {
    console.error(`Could not read existing agents: ${existErr.message}`);
    process.exit(1);
  }
  const existingRoles = new Set((existing || []).map((r) => r.name));
  console.log(`Account has ${existing.length} agent rows (${existingRoles.size} distinct roles).`);

  const { fresh, skippedExisting, skippedDuplicate } = dedupe(items, existingRoles);

  console.log('');
  console.log(`  discovered        ${items.length}${skipScreen ? '  (screen bypassed)' : ''}`);
  console.log(`  not agent files   ${notAgents.length}`);
  console.log(`  ${skipScreen ? 'screen WOULD deny ' : 'rejected (screen) '}${rejected.length}`);
  console.log(`  skipped existing  ${skippedExisting.length}`);
  console.log(`  skipped duplicate ${skippedDuplicate.length}`);
  console.log(`  to insert         ${fresh.length}`);
  console.log('');

  // The prompt screen substring-matches prose, so agents that *discuss* risky
  // things (a code reviewer citing DROP TABLE, a pentester citing sudo) trip it.
  // Name them either way: excluded, or imported over an explicit override.
  if (rejected.length) {
    console.log(
      skipScreen
        ? '  OVERRIDDEN — the screen denied these and --skip-screen imported them anyway:'
        : '  Rejected by the prompt screen (excluded from the import):'
    );
    for (const r of rejected) console.log(`    - ${r.role}  [${r.reason}]  ${r.path}`);
    console.log('');
  }
  for (const p of notAgents) console.log(`  (skipped, no front matter: ${p})`);
  if (notAgents.length) console.log('');

  if (dryRun) {
    for (const item of fresh.slice(0, 15)) console.log(`  + [${item.category}] ${item.role}`);
    if (fresh.length > 15) console.log(`  ... and ${fresh.length - 15} more`);
    console.log('\nDry run — nothing written.');
    return;
  }

  let inserted = 0;
  for (let i = 0; i < fresh.length; i += INSERT_BATCH) {
    const batch = fresh
      .slice(i, i + INSERT_BATCH)
      .map((item) => buildAgentRow(item, user.id, fullName));
    const { error } = await admin.from('agents').insert(batch);
    if (error) {
      console.error(`Batch ${i / INSERT_BATCH + 1} failed: ${error.message}`);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`  inserted ${inserted}/${fresh.length}`);
  }
  console.log(`\nDone. Inserted ${inserted} agents for ${user.email}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
