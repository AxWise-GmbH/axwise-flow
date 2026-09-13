/**
 * Parse a user-supplied GitHub reference into structured components.
 *
 * SSRF-safe by construction: only github.com is accepted here, and every
 * downstream request (api.github.com, raw.githubusercontent.com) is rebuilt
 * from these validated pieces - a raw user URL is never fetched directly.
 *
 * Accepts:
 *   https://github.com/owner/repo[.git]
 *   github.com/owner/repo/tree/{branch}[/sub/path]
 *   github.com/owner/repo/blob/{branch}/{file}
 *   owner/repo               (shorthand)
 *   owner/repo@branch        (shorthand with branch)
 *
 * Returns { owner, repo, branch|null, path|null, kind: 'repo'|'tree'|'blob' }
 * or throws an Error with a user-facing message.
 */

// GitHub owner (user/org): 1-39 chars, alphanumeric or hyphen, no leading hyphen.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
// GitHub repo: alphanumeric, hyphen, underscore, dot; up to 100 chars.
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

function stripQueryFragment(s) {
  return s.split('#')[0].split('?')[0];
}

export function parseGithubUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Provide a GitHub repository URL');
  }
  const raw = input.trim();

  // Reject path traversal up front - real git refs never contain '..' segments,
  // and URL() would silently normalize them away before our guard could see them.
  if (/(^|\/)\.\.(\/|$)/.test(raw)) throw new Error('Invalid path');

  const bare = stripQueryFragment(raw);

  let owner;
  let repo;
  let branch = null;
  let path = null;
  let kind = 'repo';

  const looksLikeShorthand =
    !bare.includes('://') &&
    !/github\.com/i.test(bare) &&
    /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:@[^/\s]+)?$/.test(bare);

  if (looksLikeShorthand) {
    const [ownerRepo, shortBranch] = bare.split('@');
    const [o, r] = ownerRepo.split('/');
    owner = o;
    repo = (r || '').replace(/\.git$/i, '');
    branch = shortBranch || null;
  } else {
    let urlStr = raw;
    if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
    let u;
    try {
      u = new URL(urlStr);
    } catch {
      throw new Error('Invalid URL');
    }
    const host = u.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      throw new Error('Only github.com repositories are supported');
    }
    const parts = u.pathname.split('/').filter(Boolean).map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
    if (parts.length < 2) {
      if (parts.length === 1 && /\/$/.test(u.pathname)) throw new Error('Invalid repository name');
      throw new Error('URL must include owner/repo');
    }
    owner = parts[0];
    repo = parts[1].replace(/\.git$/i, '');
    if (parts.length >= 4 && (parts[2] === 'tree' || parts[2] === 'blob')) {
      kind = parts[2];
      branch = parts[3];
      const rest = parts.slice(4);
      if (rest.length) path = rest.join('/');
    }
  }

  if (!OWNER_RE.test(owner || '')) throw new Error('Invalid repository owner');
  if (!REPO_RE.test(repo || '')) throw new Error('Invalid repository name');
  if (branch != null && !/^[^\s?#]{1,255}$/.test(branch)) throw new Error('Invalid branch');
  if (path != null && (path.includes('..') || path.length > 512)) {
    throw new Error('Invalid path');
  }

  return { owner, repo, branch, path, kind };
}

/** The only hosts this feature is ever allowed to fetch from. */
export const GITHUB_HOSTS = Object.freeze(['github.com', 'api.github.com', 'raw.githubusercontent.com']);
