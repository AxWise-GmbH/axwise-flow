import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, documentPage, escapeHtml, releaseSection, repository, siteRoot, validateRelease, verifyRelease } from '../scripts/build.mjs';

const data = Buffer.from('test-only artifact bytes, not a distributable package');
const digest = createHash('sha256').update(data).digest('hex');
function publishedRelease() {
  const tag = 'axwise-extension-v0.3.0';
  const artifacts = Object.fromEntries(Object.entries({ npm: 'axwise-extension-0.3.0.tgz', python: 'axwise_extension-0.3.0-py3-none-any.whl' }).map(([kind, filename]) => [kind, { filename, url: `${repository}/releases/download/${tag}/${filename}`, sha256: digest, bytes: data.length }]));
  return { published: true, version: '0.3.0', tag, artifacts };
}

test('checked-in release manifest has valid metadata for its publication state', async () => {
  validateRelease(JSON.parse(await readFile(join(siteRoot, 'release.json'), 'utf8')));
});

test('unpublished manifest does not publish unverified links or executable commands', () => {
  const release = { published: false, version: '0.3.0' };
  const html = releaseSection(release);
  assert.match(html, /release in preparation/);
  assert.doesNotMatch(html, /releases\/download|npx --|uvx --|Download npm/);
  assert.match(html, /Node.js 22/);
  assert.match(html, /Python 3.11/);
});

test('unpublished build makes no release network request', async () => {
  assert.equal(await verifyRelease({ published: false, version: '0.3.0' }, () => { throw new Error('must not fetch'); }), null);
});

test('published release requires exact package names, URLs and integrity metadata', () => {
  assert.doesNotThrow(() => validateRelease(publishedRelease()));
  for (const field of ['url', 'sha256', 'bytes', 'filename']) {
    const release = publishedRelease();
    release.artifacts.npm[field] = null;
    assert.throws(() => validateRelease(release));
  }
  const release = publishedRelease();
  delete release.artifacts.python;
  assert.throws(() => validateRelease(release), /filename/);
});

test('published release cannot point to another repository, registry, or version', () => {
  for (const url of ['https://example.com/file.tgz', 'https://registry.npmjs.org/axwise', `${repository}/releases/download/latest/axwise-extension-0.3.0.tgz`]) {
    const release = publishedRelease(); release.artifacts.npm.url = url;
    assert.throws(() => validateRelease(release), /URL/);
  }
  const release = publishedRelease(); release.tag = 'latest';
  assert.throws(() => validateRelease(release), /tag/);
});

test('invalid publication flag, version and size fail closed', () => {
  for (const release of [null, { published: 'true', version: '0.3.0' }, { published: false, version: '<script>' }]) assert.throws(() => validateRelease(release));
  for (const size of [0, -1, 2.2, 129 * 1024 * 1024]) { const release = publishedRelease(); release.artifacts.python.bytes = size; assert.throws(() => validateRelease(release), /size/); }
});

test('both public artifacts are fetched and verified before publication', async () => {
  const urls = [];
  const verifiedAt = await verifyRelease(publishedRelease(), async (url, options) => { urls.push(url); assert.ok(options.signal instanceof AbortSignal); return new Response(data); });
  assert.ok(Number.isFinite(Date.parse(verifiedAt)));
  assert.equal(urls.length, 2);
});

test('HTTP failures do not publish a release', async () => {
  await assert.rejects(verifyRelease(publishedRelease(), async () => new Response('not found', { status: 404 })), /not publicly downloadable/);
});

test('checksum mismatch and truncated or oversized artifacts fail publication', async () => {
  for (const bytes of [Buffer.alloc(data.length), data.subarray(0, 3), Buffer.concat([data, data])]) await assert.rejects(verifyRelease(publishedRelease(), async () => new Response(bytes)), /mismatch|exceeds/);
});

test('redirect destinations are limited to HTTPS GitHub artifact hosts', async () => {
  for (const url of ['http://github.com/file', 'https://github.com.evil.example/file', 'https://example.com/file']) {
    await assert.rejects(verifyRelease(publishedRelease(), async () => ({ ok: true, body: [data], url })), /redirect/);
  }
  await assert.doesNotReject(verifyRelease(publishedRelease(), async () => ({ ok: true, body: [data], url: 'https://release-assets.githubusercontent.com/github-production-release-asset/file' })));
});

test('install paths use the same exact version and do not imply registry publication', () => {
  const html = releaseSection(publishedRelease());
  assert.match(html, /npx --yes --package=https:\/\/github.com\/AxWise-GmbH/);
  assert.match(html, /uvx --from https:\/\/github.com\/AxWise-GmbH/);
  assert.match(html, /axwise --config \/absolute\/path\/axwise.json/);
  assert.match(html, /not an npm or PyPI registry listing/);
  assert.match(html, /#install-from-a-release/);
  assert.match(html, new RegExp(digest));
});

test('HTML escaping covers dynamic metadata', () => {
  assert.equal(escapeHtml('<script a="x">&\''), '&lt;script a=&quot;x&quot;&gt;&amp;&#39;');
  assert.doesNotMatch(documentPage({ title: '<script>', description: '" onload="x', body: '<p>known template</p>' }), /<title><script>|content="" onload/);
});

const normalize = (text) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
for (const name of ['privacy-policy', 'terms-of-service', 'impressum']) {
  test(`${name} preserves the published legal main text exactly`, async () => {
    const legacy = await readFile(resolve(siteRoot, '../../frontend/app', name, 'page.tsx'), 'utf8');
    const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(legacy)[1];
    const current = await readFile(join(siteRoot, 'src/legal', `${name}.html`), 'utf8');
    assert.equal(normalize(current), normalize(main));
  });
}

test('site explains boundaries and retains all eight specialist capability names', async () => {
  const html = await readFile(join(siteRoot, 'src/index.html'), 'utf8');
  for (const tool of ['prepare_discovery', 'research_market', 'generate_personas', 'simulate_interviews', 'chat_with_persona', 'analyze_interviews', 'create_prd', 'create_delivery_brief']) assert.ok(html.includes(tool));
  for (const claim of ['not an offline-inference claim', 'Model-provider usage may incur charges', 'does not require an Orqanix account', 'not a replacement search engine', 'not a promise of full legacy-web parity']) assert.ok(html.includes(claim));
  assert.doesNotMatch(html, /<script|clerk\.|pk_live_|pk_test_|axwise-flow-oss/);
});

test('unpublished build produces a small static site with no auth SDK or retired app bundle', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'axwise-site-test-'));
  try {
    await build({ outDir, release: { published: false, version: '0.3.0' } });
    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    assert.ok(Buffer.byteLength(html) < 30_000);
    assert.match(html, /href="https:\/\/orqanix.com\/login"/);
    assert.doesNotMatch(html, /\{\{RELEASE|<script|releases\/download/);
    assert.deepEqual(JSON.parse(await readFile(join(outDir, 'release.json'), 'utf8')), { published: false, version: '0.3.0' });
    assert.ok((await readdir(outDir)).includes('impressum'));
    assert.match(await readFile(join(outDir, 'retired/index.html'), 'utf8'), /does not transfer old web sessions/);
    assert.match(await readFile(join(outDir, '404.html'), 'utf8'), /Page not found/);
  } finally { await rm(outDir, { recursive: true, force: true }); }
});

test('failed release verification writes no build outputs', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'axwise-site-gate-'));
  try {
    await assert.rejects(build({ outDir, release: publishedRelease(), fetchImpl: async () => new Response('bad', { status: 404 }) }));
    assert.deepEqual(await readdir(outDir), []);
  } finally { await rm(outDir, { recursive: true, force: true }); }
});

test('published build exposes downloads only after both hashes pass verification', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'axwise-site-published-'));
  try {
    let requests = 0;
    await build({ outDir, release: publishedRelease(), fetchImpl: async () => { requests++; return new Response(data); } });
    assert.equal(requests, 2);
    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    assert.match(html, /Download npm archive/);
    assert.match(html, /Download Python wheel/);
    const manifest = JSON.parse(await readFile(join(outDir, 'release.json'), 'utf8'));
    assert.equal(manifest.published, true);
    assert.ok(Number.isFinite(Date.parse(manifest.verifiedAt)));
  } finally { await rm(outDir, { recursive: true, force: true }); }
});

test('production server retires dashboards and redirects old auth without forwarding tokens', async () => {
  const nginx = await readFile(join(siteRoot, 'nginx.conf'), 'utf8');
  assert.match(nginx, /listen 8080/);
  assert.match(nginx, /absolute_redirect off/);
  assert.match(nginx, /return 302 https:\/\/orqanix.com\/login;/);
  assert.doesNotMatch(nginx, /\$args|\$request_uri/);
  assert.match(nginx, /error_page 410 \/retired\/index.html/);
  assert.match(nginx, /script-src 'none'/);
  assert.match(nginx, /#install-from-a-release/);
});
