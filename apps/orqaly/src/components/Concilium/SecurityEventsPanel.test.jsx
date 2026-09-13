import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const limitMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: (...a) => limitMock(...a) }),
        }),
      }),
    })),
  },
  hasSupabase: vi.fn().mockReturnValue(true),
}));

vi.mock('../Common/EmptyState', () => ({
  default: ({ title }) => <div data-testid="empty-state">{title}</div>,
}));

import SecurityEventsPanel from './SecurityEventsPanel';

function renderPanel() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <SecurityEventsPanel theme={createTheme()} isDark={false} />
    </ThemeProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('SecurityEventsPanel', () => {
  it('surfaces a query error instead of a silent empty state', async () => {
    limitMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load security events/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no events and no error', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
  });
});
