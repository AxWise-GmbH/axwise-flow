import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material';

vi.mock('../../lib/supabase', () => ({
  hasSupabase: () => false,
  supabase: null,
}));

vi.mock('../VoiceControl/AiOrb', () => ({
  default: () => <div data-testid="ai-orb" />,
}));

vi.mock('../icons/AppIcon', () => ({
  default: () => <span aria-hidden="true" />,
}));

import TeamToolDialog from './TeamToolDialog';

const tool = {
  id: 'tool-resend',
  name: 'Resend',
  description: 'Transactional email',
  connectionType: 'api',
  configured: false,
  credentials: [
    {
      key: 'RESEND_API_KEY',
      helpText: 'Create a key in Resend settings.',
      helpUrl: 'https://resend.com/api-keys',
    },
  ],
};

function renderDialog() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <TeamToolDialog open onClose={vi.fn()} goalTitle="Send launch email" toolIds={[tool.id]} />
    </ThemeProvider>
  );
}

describe('TeamToolDialog credential safety', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn(async (_url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ ok: true }) };
      return { ok: true, json: async () => ({ tools: [tool] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers only the encrypted manual-key flow', async () => {
    renderDialog();

    expect(await screen.findByText('Resend')).toBeInTheDocument();
    expect(
      screen.getByText('Add keys manually below. Automatic account creation is unavailable.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^auto$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add key/i }));
    const input = screen.getByPlaceholderText('Paste your API key');
    fireEvent.change(input, { target: { value: 'test-key' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/app?path=tool-setup'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ toolId: 'tool-resend', apiKey: 'test-key' }),
        })
      );
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/agent'))).toBe(false);
  });
});
