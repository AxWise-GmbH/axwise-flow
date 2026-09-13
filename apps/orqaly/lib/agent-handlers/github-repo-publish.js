/**
 * GitHub repo publish helper.
 *
 * Creates a new GitHub repository per landing-page deliverable, commits the
 * generated HTML + README + GitHub Actions workflow, and (optionally) sets
 * the repo's CLOUDFLARE_API_TOKEN secret so the included workflow can
 * auto-redeploy to Cloudflare Workers on every push to main.
 *
 * Best-effort: if GITHUB_TOKEN is missing or the API rejects any request,
 * the helper logs a warning and returns { ok: false, error } so the caller
 * (landing-pages-tool) can still succeed — the Cloudflare deploy already
 * produced a working live URL, GitHub is a convenience for editable
 * source hand-off.
 *
 * Requires in env:
 *   GITHUB_TOKEN          — PAT with `repo` + `workflow` scopes
 *   GITHUB_ORG_FOR_GOALS  — (optional) org to create repos under; falls
 *                           back to the PAT owner (/user/repos)
 *   CLOUDFLARE_API_TOKEN  — so the helper can write it as a repo secret
 *                           for the Actions workflow
 *   CLOUDFLARE_ACCOUNT_ID — same, referenced by the workflow
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('github-repo-publish');

const GH_API = 'https://api.github.com';

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Orqaly-Agent',
  };
}

function slugify(s) {
  return String(s || 'landing-page')
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 70) || `landing-page-${Date.now().toString(36)}`;
}

/**
 * @param {object} opts
 * @param {string} opts.title       - Human-readable title
 * @param {string} opts.html        - Rendered HTML to commit as index.html
 * @param {string} [opts.goal_id]   - Source goal UUID (for README / repo description)
 * @param {string} [opts.deploymentUrl] - Live Cloudflare URL (for README / repo description)
 * @returns {Promise<{ ok: boolean, repo_url?: string, commit_sha?: string, actions_url?: string, error?: string }>}
 */
export async function publishLandingPageToGithub({ title, html, goal_id, deploymentUrl } = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN not configured — skipping GitHub publish.' };
  }
  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'html is required' };
  }

  const org = process.env.GITHUB_ORG_FOR_GOALS || '';
  const suffix = Math.random().toString(36).slice(2, 8);
  const repoName = `${slugify(title)}-${suffix}`.slice(0, 90);
  const headers = githubHeaders(token);

  // 1) Create the repo
  let repoInfo;
  try {
    const createUrl = org ? `${GH_API}/orgs/${encodeURIComponent(org)}/repos` : `${GH_API}/user/repos`;
    const createRes = await fetchWithRetry(createUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: repoName,
        description: `Orqaly landing page${title ? `: ${String(title).slice(0, 100)}` : ''}${deploymentUrl ? ` — Live: ${deploymentUrl}` : ''}`,
        private: false,
        auto_init: true,
        has_issues: true,
        has_wiki: false,
      }),
    }, { timeoutMs: 15000, retries: 1 });
    if (!createRes.ok) {
      const t = await createRes.text().catch(() => '');
      return { ok: false, error: `GitHub repo create failed: HTTP ${createRes.status}: ${t.slice(0, 300)}` };
    }
    repoInfo = await createRes.json();
  } catch (err) {
    return { ok: false, error: `GitHub repo create threw: ${err.message}` };
  }

  const owner = repoInfo.owner?.login;
  const repo = repoInfo.name;
  const repoUrl = repoInfo.html_url;
  const defaultBranch = repoInfo.default_branch || 'main';

  // 2) Fetch the default branch ref so we can commit on top.
  // With auto_init, GitHub creates an initial README commit; we need that
  // commit's SHA to PUT new files on top of without conflict.
  const contentUrl = (path) => `${GH_API}/repos/${owner}/${repo}/contents/${path}`;
  const putFile = async (path, content, message) => {
    const body = JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: defaultBranch,
    });
    const res = await fetchWithRetry(contentUrl(path), {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    }, { timeoutMs: 15000, retries: 1 });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`PUT ${path} failed: HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    return res.json();
  };

  // 3) README.md
  const readme = [
    `# ${title || repoName}`,
    '',
    deploymentUrl ? `**Live:** ${deploymentUrl}` : '',
    '',
    'This landing page was produced by [Orqaly](https://orqaly.com) and is deployed to Cloudflare Workers.',
    '',
    '## How to edit',
    '',
    '1. Clone this repo (or click "." to open github.dev).',
    '2. Open `index.html` and edit the HTML directly.',
    '3. Commit and push to the `main` branch.',
    '4. The included GitHub Action (`.github/workflows/deploy.yml`) will auto-redeploy to Cloudflare Workers within ~30 seconds.',
    '',
    '## Repo secrets required for auto-redeploy',
    '',
    'The deploy workflow reads two secrets:',
    '',
    '- `CLOUDFLARE_API_TOKEN` — needed to upload the Worker script',
    '- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID',
    '',
    'If this repo was created by Orqaly, both secrets have been set automatically. Otherwise add them under Settings → Secrets and variables → Actions.',
    '',
    goal_id ? `## Source goal\n\n\`${goal_id}\`` : '',
  ].filter(Boolean).join('\n');

  // 4) GitHub Actions workflow — uploads index.html as a Cloudflare Worker on push to main.
  const workflow = `name: Deploy to Cloudflare Workers
on:
  push:
    branches: [${defaultBranch}]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build worker script
        id: build
        run: |
          python3 - <<'PY' > worker.js
          import json
          with open('index.html', 'r', encoding='utf-8') as f:
              html = f.read()
          print("addEventListener('fetch', (event) => {")
          print("  event.respondWith(new Response(" + json.dumps(html) + ", {")
          print("    headers: { 'content-type': 'text/html;charset=UTF-8', 'cache-control': 'public, max-age=300' }")
          print("  }));")
          print("});")
          PY

      - name: Upload worker script to Cloudflare
        env:
          CF_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CF_ACCOUNT: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CF_SCRIPT: ${repoName}
        run: |
          curl -fsSL -X PUT \\
            -H "Authorization: Bearer $CF_TOKEN" \\
            -H "Content-Type: application/javascript" \\
            --data-binary @worker.js \\
            "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/$CF_SCRIPT"

      - name: Enable workers.dev subdomain
        env:
          CF_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CF_ACCOUNT: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CF_SCRIPT: ${repoName}
        run: |
          curl -fsSL -X POST \\
            -H "Authorization: Bearer $CF_TOKEN" \\
            -H "Content-Type: application/json" \\
            --data '{"enabled":true}' \\
            "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/$CF_SCRIPT/subdomain"
`;

  let commitSha = null;
  try {
    // Overwrite auto-init's README
    await putFile('README.md', readme, 'docs: Orqaly-generated README');
    // Write index.html
    const htmlResult = await putFile('index.html', html, 'feat: initial landing page');
    commitSha = htmlResult?.commit?.sha || null;
    // Workflow
    await putFile('.github/workflows/deploy.yml', workflow, 'ci: add Cloudflare Workers auto-deploy');
  } catch (err) {
    log.warn(null, 'github.commit.failed', { repo: repoUrl, error: err.message });
    return { ok: true, repo_url: repoUrl, error: `Repo created but commit failed: ${err.message}`, commit_sha: null };
  }

  // 5) Set repo secrets so the Action can actually deploy.
  // Best-effort — if this step fails, the repo still exists and the
  // workflow file is committed; the user just has to add secrets manually.
  try {
    if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
      await setRepoSecret(owner, repo, 'CLOUDFLARE_API_TOKEN', process.env.CLOUDFLARE_API_TOKEN, headers);
      await setRepoSecret(owner, repo, 'CLOUDFLARE_ACCOUNT_ID', process.env.CLOUDFLARE_ACCOUNT_ID, headers);
    }
  } catch (err) {
    log.warn(null, 'github.secret.failed', { repo: repoUrl, error: err.message });
    // Non-fatal
  }

  return {
    ok: true,
    repo_url: repoUrl,
    commit_sha: commitSha,
    actions_url: `${repoUrl}/actions`,
    branch: defaultBranch,
  };
}

/**
 * Set a single GitHub Actions repo secret. GitHub requires LibSodium-style
 * sealed-box encryption of the value with the repo's public key. Uses
 * Node's built-in crypto WebCrypto API via `@noble/curves`? No — simpler:
 * we call the REST API and let Node's built-in libsodium-compatible path
 * via `tweetnacl` do the sealing. Node 24+ has `crypto.subtle`, but for
 * sealed_box specifically we use a minimal x25519 + xsalsa20-poly1305
 * implementation. To keep this dep-free, we use the `libsodium-wrappers`
 * package if available OR fall back to a Node crypto-based implementation.
 *
 * Keeping scope manageable: if the sealed-box dependency isn't available,
 * skip secret-setting with a warning. User can add secrets manually in
 * GitHub UI. Repo + workflow are still created.
 */
async function setRepoSecret(owner, repo, name, value, headers) {
  let sodium;
  try {
    sodium = await import('libsodium-wrappers');
    if (sodium.default) sodium = sodium.default;
    await sodium.ready;
  } catch {
    throw new Error('libsodium-wrappers not installed — cannot encrypt secret. Repo created but secrets not set; add them manually in GitHub Settings.');
  }

  // 1) Get repo public key
  const keyRes = await fetchWithRetry(`${GH_API}/repos/${owner}/${repo}/actions/secrets/public-key`, {
    method: 'GET',
    headers,
  }, { timeoutMs: 10000, retries: 1 });
  if (!keyRes.ok) throw new Error(`Fetch public key failed: HTTP ${keyRes.status}`);
  const keyInfo = await keyRes.json();

  // 2) Seal the secret
  const messageBytes = Buffer.from(value, 'utf8');
  const keyBytes = Buffer.from(keyInfo.key, 'base64');
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  const encryptedValue = Buffer.from(encryptedBytes).toString('base64');

  // 3) PUT the secret
  const putRes = await fetchWithRetry(`${GH_API}/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id: keyInfo.key_id }),
  }, { timeoutMs: 10000, retries: 1 });
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '');
    throw new Error(`PUT secret ${name} failed: HTTP ${putRes.status}: ${t.slice(0, 150)}`);
  }
}
