import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repository = 'https://github.com/AxWise-GmbH/axwise-flow';
const maxArtifactBytes = 128 * 1024 * 1024;
const legalPages = ['privacy-policy', 'terms-of-service', 'impressum'];

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function validateRelease(release) {
  if (!release || typeof release.published !== 'boolean') throw new Error('Release published must be a boolean');
  if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Release version must be stable semver');
  if (!release.published) return;
  if (release.tag !== `axwise-extension-v${release.version}`) throw new Error('Unexpected release tag');
  const expected = { npm: `axwise-extension-${release.version}.tgz`, python: `axwise_extension-${release.version}-py3-none-any.whl` };
  for (const [kind, filename] of Object.entries(expected)) {
    const artifact = release.artifacts?.[kind];
    if (!artifact || artifact.filename !== filename) throw new Error(`Unexpected ${kind} artifact filename`);
    if (artifact.url !== `${repository}/releases/download/${release.tag}/${filename}`) throw new Error(`Unexpected ${kind} artifact URL`);
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error(`Missing ${kind} SHA-256`);
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > maxArtifactBytes) throw new Error(`Invalid ${kind} artifact size`);
  }
}

// Publishing a link requires the exact public bytes to be obtainable at build time.
// Metadata alone is not a successful release verification; there is no bypass flag.
export async function verifyRelease(release, fetchImpl = fetch) {
  validateRelease(release);
  if (!release.published) return null;
  for (const [kind, artifact] of Object.entries(release.artifacts)) {
    if (!['npm', 'python'].includes(kind)) throw new Error('Unexpected release artifact kind');
    const response = await fetchImpl(artifact.url, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`${kind} artifact is not publicly downloadable`);
    const finalUrl = new URL(response.url || artifact.url);
    if (finalUrl.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(finalUrl.hostname)) throw new Error('Unexpected download redirect');
    let bytes = 0;
    const hash = createHash('sha256');
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > artifact.bytes) throw new Error(`${kind} artifact exceeds declared size`);
      hash.update(chunk);
    }
    if (bytes !== artifact.bytes || hash.digest('hex') !== artifact.sha256) throw new Error(`${kind} artifact checksum or size mismatch`);
  }
  return new Date().toISOString();
}

export function releaseSection(release) {
  validateRelease(release);
  const version = escapeHtml(release.version);
  if (!release.published) {
    return `<span class="example-tag">For your own MCP workspace</span><h3>A standalone extension</h3><span class="pending-badge">Version ${version} · release in preparation</span><p>Use the same discovery engine in another compatible host, with your own model credentials. We are preparing a lightweight, pure-Python FastMCP wheel with embedded SQLite storage.</p><p>Download links and exact commands will appear here after the public release artifacts pass verification. Nothing on this page requires you to install an unpublished package.</p><a class="text-link" href="${repository}">Follow the open-source project <span aria-hidden="true">↗</span></a><ul class="requirements"><li>Pure Python: Python 3.11 or newer (uv can provide Python).</li><li>Eliminates the legacy Node.js 22 requirement; no PostgreSQL required.</li><li>Embedded SQLite storage in <code>~/.axwise/state/axwise.db</code> and flat Markdown files.</li><li>Bring provider credentials and configure your host’s MCP connection.</li></ul>`;
  }
  const { npm, python } = release.artifacts;
  const npx = `npx --yes --package=${npm.url} axwise --config /absolute/path/axwise.json`;
  const uvx = `uvx --from ${python.url} axwise --config /absolute/path/axwise.json`;
  return `<span class="example-tag">For your own MCP workspace</span><h3>AxWise ${version}</h3><p>Two launch paths, the same engine. These commands use the versioned GitHub release artifacts—not an npm or PyPI registry listing.</p><div class="download-links"><a href="${escapeHtml(npm.url)}">Download npm archive (.tgz) ↓</a><a href="${escapeHtml(python.url)}">Download Python wheel (.whl) ↓</a></div><p class="command-label">Launch with npx</p><pre class="command"><code>${escapeHtml(npx)}</code></pre><p class="command-label">Or launch with uvx</p><pre class="command"><code>${escapeHtml(uvx)}</code></pre><ul class="requirements"><li>Pure Python FastMCP runtime with embedded SQLite storage.</li><li>Python 3.11+ (uv can provide Python). Zero PostgreSQL or Docker containers required.</li><li>Provide your own model credentials in your local configuration; do not paste secrets into chat or public config files.</li></ul><p><a class="text-link" href="${repository}#install-from-a-release">Configuration and host examples ↗</a></p><details class="checksums"><summary>Verified download checksums (SHA-256)</summary><p>npm archive · ${npm.bytes.toLocaleString('en-US')} bytes</p><code>${npm.sha256}</code><p>Python wheel · ${python.bytes.toLocaleString('en-US')} bytes</p><code>${python.sha256}</code></details>`;
}

export function documentPage({ title, description, body, path = '/', mainClass = '', noindex = false }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="theme-color" content="#fcfaf7"><link rel="canonical" href="https://axwise.de${escapeHtml(path)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="https://axwise.de${escapeHtml(path)}"><link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="stylesheet" href="/styles.css">${noindex ? '<meta name="robots" content="noindex">' : ''}</head><body>
<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="AxWise home"><img src="/icon.svg" width="29" height="29" alt="">AxWise</a><nav class="site-nav" aria-label="Main navigation"><a href="/#capabilities">Capabilities</a><a href="/#how-it-works">How it works</a><a href="/#examples">Examples</a><a href="${repository}">GitHub ↗</a></nav><a class="header-cta" href="https://orqanix.com/login">Orqanix sign in ↗</a></div></header>
<main id="main" class="${escapeHtml(mainClass)}">${body}</main>
<footer class="site-footer"><div class="wrap footer-inner"><p>© 2026 AxWise. Open-source code under Apache 2.0.</p><nav class="footer-nav" aria-label="Footer navigation"><a href="${repository}/blob/main/LICENSE">License</a><a href="/privacy-policy">Privacy Policy</a><a href="/terms-of-service">Terms of Service</a><a href="/impressum">Impressum</a></nav></div></footer></body></html>`;
}

export async function build({ outDir = join(siteRoot, 'dist'), release = null, fetchImpl = fetch } = {}) {
  release ??= JSON.parse(await readFile(join(siteRoot, 'release.json'), 'utf8'));
  const verifiedAt = await verifyRelease(release, fetchImpl);
  const home = (await readFile(join(siteRoot, 'src/index.html'), 'utf8')).replace('{{RELEASE_SECTION}}', releaseSection(release));
  if (/\{\{[A-Z_]+\}\}/.test(home)) throw new Error('Unresolved page template token');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), documentPage({ title: 'AxWise — Product discovery, inside your agent', description: 'An open-source local MCP extension for product discovery, interview analysis, personas and evidence-linked PRDs. Included in Orqanix. Built for compatible agent workspaces.', body: home }));
  for (const name of ['styles.css', 'icon.svg']) await copyFile(join(siteRoot, 'src', name), join(outDir, name));
  for (const path of legalPages) {
    const body = await readFile(join(siteRoot, 'src/legal', `${path}.html`), 'utf8');
    const title = /<h1>(.*?)<\/h1>/.exec(body)[1];
    await mkdir(join(outDir, path), { recursive: true });
    await writeFile(join(outDir, path, 'index.html'), documentPage({ title: `${title} — AxWise`, description: `AxWise ${title}.`, path: `/${path}`, mainClass: 'wrap legal-content', body }));
  }
  const retired = `<p class="eyebrow">AxWise has a new shape</p><h1>The web workspace<br>has moved on.</h1><p class="lede">AxWise now focuses on product discovery as a local extension inside an AI host. The old hosted dashboards are no longer served here.</p><p class="lede">For the desktop experience and sign-in, visit Orqanix. For the extension’s capabilities, examples and source, start on the AxWise home page. This change does not transfer old web sessions or promise every legacy feature in the extension.</p><div class="actions"><a class="button primary" href="https://orqanix.com/">Open Orqanix ↗</a><a class="button secondary" href="/">Explore AxWise</a></div>`;
  await mkdir(join(outDir, 'retired'), { recursive: true });
  await writeFile(join(outDir, 'retired/index.html'), documentPage({ title: 'AxWise web workspace — A new direction', description: 'The AxWise hosted workspace has moved to a local extension model.', path: '/retired/', mainClass: 'wrap retired-content', body: retired, noindex: true }));
  await writeFile(join(outDir, '404.html'), documentPage({ title: 'Page not found — AxWise', description: 'Find the current AxWise extension and Orqanix desktop.', path: '/404', mainClass: 'wrap retired-content', body: '<p class="eyebrow">404 / Page not found</p><h1>Let’s get you<br>back on track.</h1><p><a class="button primary" href="/">Go to AxWise home</a></p>', noindex: true }));
  await writeFile(join(outDir, 'release.json'), JSON.stringify(release.published ? { ...release, verifiedAt } : { published: false, version: release.version }, null, 2));
  await writeFile(join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /retired/\nSitemap: https://axwise.de/sitemap.xml\n');
  await writeFile(join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...legalPages].map(path => `<url><loc>https://axwise.de/${path}</loc></url>`).join('')}</urlset>`);
  return { outDir, published: release.published, verifiedAt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await build();
  console.log(`AxWise static site built. Standalone downloads: ${result.published ? 'public artifacts verified' : 'not yet published'}.`);
}
