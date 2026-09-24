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
  for (const name of [
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
  ])
    put(dist, `assets/${name}-fixture.js`, '// route fixture');
  put(
    dist,
    'assets/index-fixture.js',
    JSON.stringify([
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
  it('accepts a retained build with no policy drafts', () => {
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
});
