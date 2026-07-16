import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';
import { apiCore } from '@/lib/api/core';
import { getMarkdownExportUrl } from '@/lib/api/export';
import { getPriorityInsights } from '@/lib/api/insights';

describe('supported frontend baseline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the shared button primitive', () => {
    render(<Button>Continue</Button>);

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('builds the Markdown export URL through the application API', () => {
    expect(getMarkdownExportUrl('42')).toMatch(/\/api\/export\/42\/markdown$/);
  });

  it('normalizes a successful priority-insights response', async () => {
    vi.spyOn(apiCore.getClient(), 'get').mockResolvedValue({
      status: 200,
      data: {
        insights: [{ topic: 'Faster handoffs' }],
        metrics: { high_urgency_count: 1 },
      },
    });

    await expect(getPriorityInsights('42')).resolves.toEqual({
      insights: [{ topic: 'Faster handoffs' }],
      metrics: { high_urgency_count: 1 },
    });
  });

  it('treats a missing priority-insights result as an empty supported response', async () => {
    vi.spyOn(apiCore.getClient(), 'get').mockResolvedValue({ status: 404, data: null });

    await expect(getPriorityInsights('missing')).resolves.toEqual({
      insights: [],
      metrics: {
        high_urgency_count: 0,
        medium_urgency_count: 0,
        low_urgency_count: 0,
      },
    });
  });
});
