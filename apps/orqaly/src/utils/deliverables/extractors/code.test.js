/**
 * Tests for the code-repo extractor.
 *
 * Focuses on the hasIndexHtml flag — the Result UI uses it to decide
 * whether to render a "Preview site" button (raw.githack proxy) on the
 * Code Repositories card.
 */
import { describe, it, expect } from 'vitest';
import { extractCodeRepos } from './code.js';

function makeTask({ output = '', title = 'Implement landing page', status = 'done' } = {}) {
  return { status, title, data: { output } };
}

describe('extractCodeRepos', () => {
  it('extracts a repo from a GITHUB_REPO: marker', () => {
    const tasks = [makeTask({ output: 'GITHUB_REPO: https://github.com/acme/widget' })];
    const out = extractCodeRepos(tasks);
    expect(out).toHaveLength(1);
    expect(out[0].fullName).toBe('acme/widget');
    expect(out[0].owner).toBe('acme');
    expect(out[0].repo).toBe('widget');
    expect(out[0].url).toBe('https://github.com/acme/widget');
  });

  it('marks hasIndexHtml=true when the task output mentions index.html', () => {
    const tasks = [
      makeTask({
        output: `Committed files:
- README.md
- index.html
- styles.css
GITHUB_REPO: https://github.com/acme/widget`,
      }),
    ];
    const out = extractCodeRepos(tasks);
    expect(out).toHaveLength(1);
    expect(out[0].hasIndexHtml).toBe(true);
  });

  it('marks hasIndexHtml=true when index.html appears in a put_file call', () => {
    const tasks = [
      makeTask({
        output: `Called tool_github__put_file with { path: "index.html", ... }
GITHUB_REPO: https://github.com/acme/widget`,
      }),
    ];
    const out = extractCodeRepos(tasks);
    expect(out[0].hasIndexHtml).toBe(true);
  });

  it('marks hasIndexHtml=false for non-static repos (CLI, library, server)', () => {
    const tasks = [
      makeTask({
        output: `Committed files:
- README.md
- src/cli.js
- src/server.js
- package.json
GITHUB_REPO: https://github.com/acme/cli-tool`,
      }),
    ];
    const out = extractCodeRepos(tasks);
    expect(out).toHaveLength(1);
    expect(out[0].hasIndexHtml).toBe(false);
  });

  it('dedupes the same repo emitted by multiple tasks', () => {
    const tasks = [
      makeTask({ output: 'GITHUB_REPO: https://github.com/acme/widget' }),
      makeTask({ output: 'GITHUB_REPO: https://github.com/acme/widget' }),
    ];
    expect(extractCodeRepos(tasks)).toHaveLength(1);
  });

  it('strips .git suffix and trailing slashes', () => {
    const tasks = [makeTask({ output: 'See https://github.com/acme/widget.git for details' })];
    const out = extractCodeRepos(tasks);
    expect(out[0].url).toBe('https://github.com/acme/widget');
  });
});
