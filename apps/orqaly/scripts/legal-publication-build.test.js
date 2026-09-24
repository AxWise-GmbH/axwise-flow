import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures = [];
const verifier = resolve('deploy/workflow-v2/verify-gcp-web-build.mjs');
const put = (dist, path, text) => {
  const file = resolve(dist, path);
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, text);
};

function fixture() {
  const dist = mkdtempSync(resolve(tmpdir(), 'orqanix-legal-build-test-'));
  fixtures.push(dist);
  put(
    dist,
    'index.html',
    '<div id="root"></div>Instant Intelligence<title>Orqanix — Instant Intelligence on your Mac</title><meta name="theme-color" content="#000000">'
  );
  put(dist, 'manifest.json', '{}');
  put(dist, '.vite/manifest.json', '{}');
  put(dist, 'logo-line.svg', '<svg/>');
  put(dist, 'assets/AccountPage-fixture.js', '// route fixture');
  put(
    dist,
    'assets/index-fixture.js',
    JSON.stringify([
      'Your Orqanix account',
      'Account security and profile',
      'Sign out',
      'Cloud conversation sync is not enabled.',
    ])
  );
  return dist;
}

function verify(dist) {
  try {
    return {
      passed: true,
      output: execFileSync(process.execPath, [verifier, dist], { encoding: 'utf8', stdio: 'pipe' }),
    };
  } catch (error) {
    return { passed: false, output: error.stderr.toString() };
  }
}

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true });
});

describe('build verification of unpublished legal drafts', () => {
  it('accepts an account-only build with no policy drafts or workspace modules', () => {
    expect(verify(fixture()).passed).toBe(true);
  });

  it.each([
    ['.well-known/security.txt', 'Contact: mailto:security@orqanix.com', 'draft security.txt'],
    ['assets/LegalCenter-abc.js', 'export default {}', 'unpublished legal draft'],
    [
      'assets/terms.json',
      JSON.stringify({ meta: { review: { open: ['Unapproved'] } } }),
      'internal document review notes',
    ],
    ['security.txt.draft', 'unapproved', 'unpublished legal draft'],
  ])('rejects a published draft asset %s', (path, contents, reason) => {
    const dist = fixture();
    put(dist, path, contents);
    const result = verify(dist);
    expect(result.passed).toBe(false);
    expect(result.output).toContain(reason);
  });

  it('rejects draft documents in the manifest even when review notes were removed', () => {
    const dist = fixture();
    put(
      dist,
      '.vite/manifest.json',
      JSON.stringify({
        'src/pages/Landing/instant/pages/legal/docs/terms.json': { file: 'assets/terms-abc.json' },
      })
    );
    const result = verify(dist);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('imported an unpublished legal draft');
  });

  it.each(['WorkflowV2', 'GcpClerkSettings', 'HomePage', 'SolutionDetailPage', 'ResultsPage'])
  ('rejects emitted retired route chunks even when absent from the manifest: %s', (name) => {
    const dist = fixture();
    put(dist, `assets/${name}-fixture.js`, '// stale route');
    const result = verify(dist);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('retired workspace route chunk');
  });

  it.each([
    ['src/pages/GcpWorkspace/HomePage.jsx', { file: 'assets/generic-abc.js' }],
    ['src/pages/WorkflowV2/WorkflowV2.jsx', { file: 'assets/generic-abc.js' }],
    ['opaque-source', { file: 'assets/generic-abc.js', src: 'src/pages/Settings/GcpClerkSettings.jsx' }],
    ['src\\pages\\GcpWorkspace\\HomePage.jsx', { file: 'assets/generic-abc.js' }],
  ])('rejects retired workspace manifest sources with arbitrary output names: %s', (source, asset) => {
    const dist = fixture();
    put(dist, '.vite/manifest.json', JSON.stringify({ [source]: asset }));
    const result = verify(dist);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('retired workspace module');
  });

  it('requires the account route chunk', () => {
    const dist = fixture();
    rmSync(resolve(dist, 'assets/AccountPage-fixture.js'));
    const result = verify(dist);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('missing the AccountPage route chunk');
  });
});
