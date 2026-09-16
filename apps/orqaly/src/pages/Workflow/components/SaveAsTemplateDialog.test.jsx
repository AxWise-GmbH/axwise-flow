import { beforeEach, describe, expect, it } from 'vitest';

import { loadCustomTemplates, saveCustomTemplate } from './SaveAsTemplateDialog';

const STORAGE_KEY = 'orch_custom_templates';

describe('workflow custom-template credential boundary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes nested credentials before writing a custom template', () => {
    const stored = saveCustomTemplate({
      id: 'template-1',
      nodes: [
        {
          id: 'node-1',
          data: {
            apiKey: 'template-api-secret',
            webhookSigningSecret: 'template-webhook-secret',
            url: 'https://example.test/hook',
          },
        },
      ],
    });

    expect(stored[0].nodes[0].data).toEqual({ url: 'https://example.test/hook' });
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('template-api-secret');
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('template-webhook-secret');
  });

  it('fails closed and rewrites legacy plaintext template storage on read', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'legacy', nodes: [{ data: { api_key: 'legacy-secret', label: 'Run' } }] },
      ])
    );

    expect(loadCustomTemplates()).toEqual([{ id: 'legacy', nodes: [{ data: { label: 'Run' } }] }]);
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('legacy-secret');
  });
});
