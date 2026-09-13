import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('reviewed GCP web shared dependencies', () => {
  it('packages the browser-safe build guard without copying backend contracts or secrets', () => {
    const dockerfile = readFileSync('deploy/workflow-v2/Dockerfile.web', 'utf8');
    const copy = dockerfile.split('\n').find((line) => line.startsWith('COPY shared/'));
    const files = copy.split(/\s+/).slice(1, -1);
    expect(files).toEqual([
      'shared/workflow-v2/assistant-events.js',
      'shared/workflow-v2/assistant-primitives.js',
      'shared/workflow-v2/executable-actions.js',
      'shared/workflow-v2/public-https-url.js',
      'shared/workflow-v2/solution-build-secrets.js',
      'shared/workflow-v2/goal-workflow-view-contract.js',
      'shared/workflow-v2/capability-work-primitives.js',
    ]);
    for (const file of files) expect(readFileSync(file, 'utf8').length).toBeGreaterThan(0);
    expect(dockerfile).not.toContain('COPY shared ./shared');
    const guard = readFileSync('shared/workflow-v2/solution-build-secrets.js', 'utf8');
    expect(guard).not.toMatch(/^\s*import\s|process\.env|secretmanager|node:fs/m);
    const viewContract = readFileSync('shared/workflow-v2/goal-workflow-view-contract.js', 'utf8');
    expect(viewContract).not.toMatch(/^\s*import\s|process\.env|secretmanager|node:fs/m);
    expect(viewContract).toContain('GoalWorkflowViewResponseSchema');
  });
});
