import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const mocks = vi.hoisted(() => ({
  fetchArenaStack: vi.fn(async () => ({ rows: [], composioConfigured: true })),
  initiateComposioConnection: vi.fn(async () => ({ redirectUrl: 'https://oauth.example/x' })),
}));
vi.mock('../../../../services/arenaService', () => ({ fetchArenaStack: mocks.fetchArenaStack }));
vi.mock('../../../../services/composioService', () => ({
  initiateComposioConnection: mocks.initiateComposioConnection,
}));

import ConnectStackCard from './ConnectStackCard';

const theme = createTheme();
const jira = { id: 'r1', key: 'mcp-jira', label: 'Jira', source: 'catalog', status: 'selected' };

function setup() {
  const onComplete = vi.fn(async () => {});
  render(
    <ThemeProvider theme={theme}>
      <ConnectStackCard onComplete={onComplete} embedded />
    </ThemeProvider>
  );
  return { onComplete };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchArenaStack.mockResolvedValue({ rows: [jira], composioConfigured: true });
  window.open = vi.fn(() => ({ closed: true }));
});

describe('ConnectStackCard', () => {
  it('lists each covered tool with a Connect button', async () => {
    setup();
    expect(await screen.findByText('Jira')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.getByText(/Read-only/)).toBeInTheDocument();
  });

  it('starts the sign-in popup with the real app name from the catalog', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mocks.initiateComposioConnection).toHaveBeenCalledWith('jira'));
    expect(window.open).toHaveBeenCalledWith(
      'https://oauth.example/x',
      'arena-connect',
      expect.any(String)
    );
  });

  it('shows a connected tool as done', async () => {
    mocks.fetchArenaStack.mockResolvedValue({
      rows: [{ ...jira, status: 'connected' }],
      composioConfigured: true,
    });
    setup();
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
  });

  it('degrades to an explanation, never a dead end, when connections are off', async () => {
    mocks.fetchArenaStack.mockResolvedValue({ rows: [jira], composioConfigured: false });
    const { onComplete } = setup();
    expect(await screen.findByText(/not switched on/)).toBeInTheDocument();
    // Next still works — the guide finishes anyway.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
