/**
 * Live site extractor — scans task outputs for DEPLOYMENT_URL markers
 * and bare host-specific URLs (workers.dev / pages.dev / github.io /
 * vercel.app / netlify.app).
 *
 * Returns an array of { url, host, taskTitle } deduped by URL.
 *
 * Keep the host regex list in sync with
 * lib/goal-handlers/stages/complete.js extractDeploymentUrl.
 */
import { isPlaceholder, trimTrailingPunct, getTaskTitle, urlsEqual } from '../shared.js';
import { resolveGithubRepoForGoal } from '../resolveGithubRepo.js';

const HOST_PATTERNS = [
  { re: /https?:\/\/[\w.-]+\.workers\.dev\/?[^\s)>\]"']*/gi, host: 'workers.dev' },
  { re: /https?:\/\/[\w.-]+\.pages\.dev\/?[^\s)>\]"']*/gi, host: 'pages.dev' },
  { re: /https?:\/\/[\w.-]+\.github\.io\/[^\s)>\]"']*/gi, host: 'github.io' },
  { re: /https?:\/\/[\w.-]+\.vercel\.app\/?[^\s)>\]"']*/gi, host: 'vercel.app' },
  { re: /https?:\/\/[\w.-]+\.netlify\.app\/?[^\s)>\]"']*/gi, host: 'netlify.app' },
];

const DEPLOYMENT_MARKER_RE = /DEPLOYMENT_URL:\s*(https?:\/\/[^\s)>\]"']+)/gi;

function detectHost(url) {
  for (const { re, host } of HOST_PATTERNS) {
    const singleRe = new RegExp(re.source, 'i');
    if (singleRe.test(url)) return host;
  }
  return 'unknown';
}

function extractFromText(text) {
  const results = new Map();
  if (!text) return results;

  // Priority 1: explicit DEPLOYMENT_URL: marker line
  for (const match of text.matchAll(DEPLOYMENT_MARKER_RE)) {
    const url = trimTrailingPunct(match[1]);
    if (url && !isPlaceholder(url)) results.set(url, detectHost(url));
  }

  // Priority 2: bare host-specific patterns
  for (const { re, host } of HOST_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const url = trimTrailingPunct(match[0]);
      if (url && !isPlaceholder(url) && !results.has(url)) {
        results.set(url, host);
      }
    }
  }
  return results;
}

export function extractLiveSites(tasks, allTasks = [], ctx = {}) {
  const landingPages = Array.isArray(ctx.landingPages) ? ctx.landingPages : [];
  const githubRepo = resolveGithubRepoForGoal({
    goal: ctx.goal,
    allTasks: allTasks.length ? allTasks : tasks,
    landingPages,
  });
  const results = new Map();
  for (const task of tasks) {
    const output = String(task.data?.output || '');
    const title = getTaskTitle(task);
    const urls = extractFromText(output);
    for (const [url, host] of urls) {
      if (results.has(url)) continue;
      // Prefer matching against landing_pages (Cloudflare Workers deploys
      // get a row there). If no match — e.g. the site is hosted on
      // GitHub Pages, Vercel, Netlify, etc. — fall back to refining the
      // task that produced the deployment. The backend's task_output
      // refiner rewrites task.data.output, which contains the HTML and
      // any deploy metadata the agent emitted.
      const matchedPage = landingPages.find((p) => urlsEqual(p.deployment_url, url));
      const parentKind = matchedPage ? 'landing_page' : task?.id ? 'task_output' : undefined;
      const parentId = matchedPage ? matchedPage.id : task?.id || undefined;
      results.set(url, {
        url,
        host,
        taskTitle: title,
        parentKind,
        parentId,
        originalContent: matchedPage ? undefined : output,
        githubRepo,
      });
    }
  }
  return Array.from(results.values());
}
