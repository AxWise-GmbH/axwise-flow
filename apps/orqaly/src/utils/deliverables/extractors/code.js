/**
 * Code repository extractor — scans task outputs for committed
 * GitHub repositories. Handles:
 *   - Explicit GITHUB_REPO: marker line (preferred)
 *   - Bare github.com/{owner}/{repo} URLs (but NOT .github.io —
 *     those are live sites, not source code)
 *
 * Returns { url, owner, repo, fullName, taskTitle } per unique repo.
 */
import { isPlaceholder, trimTrailingPunct, getTaskTitle } from '../shared.js';

const GITHUB_REPO_MARKER_RE =
  /GITHUB_REPO:\s*(https?:\/\/github\.com\/[\w.-]+\/[\w.-]+[^\s)>\]"']*)/gi;
const BARE_GITHUB_REPO_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:[.\s)>\]"'/]|$)/gi;

// Reserved paths that aren't user/repo pairs
const RESERVED_PATHS = new Set([
  'settings',
  'marketplace',
  'explore',
  'notifications',
  'pricing',
  'features',
  'enterprise',
  'security',
  'topics',
  'trending',
  'collections',
  'sponsors',
  'customer-stories',
  'readme',
  'issues',
  'pulls',
  'about',
  'login',
  'signup',
  'organizations',
  'users',
  'apps',
  'new',
  'search',
  'codespaces',
]);

export function parseGithubRepoUrl(url) {
  // Normalize, order matters: drop query/fragment first, then trailing
  // slashes, then the .git suffix. Order of `.replace` matters because
  // strings like "bar.git/" would leave ".git" intact if trailing slash
  // weren't stripped first.
  const clean = url
    .split('?')[0]
    .split('#')[0]
    .replace(/\/+$/, '') // strip trailing slashes
    .replace(/\.git$/, '') // then strip .git suffix
    .replace(/\/+$/, ''); // strip any remaining trailing slash after .git removal
  const match = clean.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (!match) return null;
  const owner = match[1];
  // The second capture can still include ".git" if the URL is "github.com/foo/bar.git"
  // without a trailing slash. Strip it defensively.
  const repo = match[2].replace(/\.git$/, '');
  if (RESERVED_PATHS.has(owner.toLowerCase())) return null;
  // github.io is a special suffix — those belong to the live-site extractor
  if (owner.toLowerCase().endsWith('.github.io')) return null;
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}

function extractFromText(text) {
  const results = new Map(); // normalizedUrl → parsed
  if (!text) return results;

  // Priority 1: GITHUB_REPO: marker
  for (const match of text.matchAll(GITHUB_REPO_MARKER_RE)) {
    const url = trimTrailingPunct(match[1]);
    if (url && !isPlaceholder(url)) {
      const parsed = parseGithubRepoUrl(url);
      if (parsed && !results.has(parsed.normalizedUrl)) {
        results.set(parsed.normalizedUrl, parsed);
      }
    }
  }

  // Priority 2: bare github.com/owner/repo URLs
  for (const match of text.matchAll(BARE_GITHUB_REPO_RE)) {
    const rawUrl = `https://github.com/${match[1]}/${match[2]}`;
    if (!isPlaceholder(rawUrl)) {
      const parsed = parseGithubRepoUrl(rawUrl);
      if (parsed && !results.has(parsed.normalizedUrl)) {
        results.set(parsed.normalizedUrl, parsed);
      }
    }
  }

  return results;
}

// Detects index.html in the task output — used by the UI to decide whether
// to render a "Preview site" button (via raw.githack.com) on the repo row.
// False positives just yield a Preview button that 404s, so a loose match
// (bare `index.html` or `path: "index.html"` etc.) is fine.
const INDEX_HTML_RE = /\bindex\.html\b/i;

// Code repos are external GitHub URLs with no refinement story today — no
// parent_id is attached, which means VersionPicker stays hidden for these
// rows. The ctx argument is accepted for signature compatibility.
export function extractCodeRepos(tasks, _allTasks = [], _ctx = {}) {
  const results = new Map();
  for (const task of tasks) {
    const output = String(task.data?.output || '');
    const title = getTaskTitle(task);
    const hasIndexHtml = INDEX_HTML_RE.test(output);
    const parsed = extractFromText(output);
    for (const [url, { owner, repo, fullName }] of parsed) {
      if (!results.has(url)) {
        results.set(url, { url, owner, repo, fullName, taskTitle: title, hasIndexHtml });
      }
    }
  }
  return Array.from(results.values());
}
