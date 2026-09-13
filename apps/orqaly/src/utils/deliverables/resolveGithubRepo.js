/**
 * [module: frontend]
 * Resolve the GitHub repository associated with a completed goal.
 */
import { parseGithubRepoUrl } from './extractors/code.js';
import { extractCodeRepos } from './extractors/code.js';
import { getRelevantTasks } from './registry.js';

const INDEX_HTML_RE = /\bindex\.html\b/i;

function detectIndexHtml(allTasks) {
  return getRelevantTasks(allTasks).some((t) => INDEX_HTML_RE.test(String(t.data?.output || '')));
}

function toRepoItem(parsed, allTasks, hasIndexHtmlOverride) {
  const hasIndexHtml =
    typeof hasIndexHtmlOverride === 'boolean' ? hasIndexHtmlOverride : detectIndexHtml(allTasks);
  return {
    url: parsed.normalizedUrl,
    owner: parsed.owner,
    repo: parsed.repo,
    fullName: parsed.fullName,
    hasIndexHtml,
  };
}

/**
 * @returns {{ url, owner, repo, fullName, hasIndexHtml } | null}
 */
export function resolveGithubRepoForGoal({ goal, allTasks = [], landingPages = [] }) {
  const overviewUrl = goal?.data?.project_overview?.key_links?.github;
  if (overviewUrl) {
    const parsed = parseGithubRepoUrl(overviewUrl);
    if (parsed) return toRepoItem(parsed, allTasks);
  }

  for (const lp of landingPages) {
    const lpUrl = lp?.data?.github?.repo_url;
    if (lpUrl) {
      const parsed = parseGithubRepoUrl(lpUrl);
      if (parsed) return toRepoItem(parsed, allTasks);
    }
  }

  const repos = extractCodeRepos(getRelevantTasks(allTasks));
  if (repos.length) {
    return {
      url: repos[0].url,
      owner: repos[0].owner,
      repo: repos[0].repo,
      fullName: repos[0].fullName,
      hasIndexHtml: repos[0].hasIndexHtml,
    };
  }

  return null;
}

/** Source URL for browsing repo files online. */
export function githubSourceViewUrl(githubRepo) {
  if (!githubRepo?.owner || !githubRepo?.repo) return null;
  if (githubRepo.hasIndexHtml) {
    return `https://raw.githack.com/${githubRepo.owner}/${githubRepo.repo}/main/index.html`;
  }
  return `https://github.com/${githubRepo.owner}/${githubRepo.repo}/tree/main`;
}
