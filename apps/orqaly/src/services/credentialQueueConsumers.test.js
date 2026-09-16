import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('credential UI queue policy', () => {
  it('AgentHub does not expose the legacy browser-task credential action', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/pages/AgentHub/AgentHub.jsx'), 'utf8');
    expect(source).not.toMatch(/type\s*:\s*['"]browser-task['"]/);
    expect(source).not.toContain('handleProvisionAllTools');
    expect(source).not.toContain('Provision Keys');
  });

  it('TeamToolDialog does not enqueue a privileged agent job', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'src/components/Goals/TeamToolDialog.jsx'),
      'utf8'
    );
    expect(source).not.toMatch(/type\s*:\s*['"]agent['"]/);
    expect(source).not.toContain('/api/agent?action=enqueue');
  });
});
