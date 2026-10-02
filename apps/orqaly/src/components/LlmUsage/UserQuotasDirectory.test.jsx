import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import UserQuotasDirectory from './UserQuotasDirectory';

const theme = createTheme({ palette: { mode: 'dark' } });

describe('UserQuotasDirectory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state then displays users table', async () => {
    const mockUsers = [
      {
        userId: 'user_admin_123',
        email: 'admin@axwise.de',
        displayName: 'Admin User',
        planTier: 'pro',
        limitUsd: 25.0,
        spendUsd: 4.5,
        tokens: { prompt: 50000, completion: 5000, total: 55000 },
        callCount: 12,
        isBlocked: false,
      },
      {
        userId: 'user_free_456',
        email: 'free@example.com',
        displayName: 'Free User',
        planTier: 'free',
        limitUsd: 5.0,
        spendUsd: 5.0,
        tokens: { prompt: 60000, completion: 2000, total: 62000 },
        callCount: 15,
        isBlocked: false,
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ users: mockUsers, total: 2 }),
    });

    render(
      <ThemeProvider theme={theme}>
        <UserQuotasDirectory />
      </ThemeProvider>
    );

    // Verify summary stats and users appear
    await waitFor(() => {
      expect(screen.getByText('admin@axwise.de')).toBeInTheDocument();
      expect(screen.getByText('free@example.com')).toBeInTheDocument();
      expect(screen.getByText(/user_admin_123/)).toBeInTheDocument();
    });

    expect(screen.getByText('Managed Users')).toBeInTheDocument();
    expect(screen.getByText('Cache Efficiency')).toBeInTheDocument();
    expect(screen.getByText('Cache Rate')).toBeInTheDocument();
    expect(screen.getByText('PRO')).toBeInTheDocument();
    expect(screen.getByText('FREE')).toBeInTheDocument();
    expect(screen.getAllByText('Over Quota').length).toBeGreaterThanOrEqual(1);
  });

  it('displays error alert when user is unauthorized', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'ADMIN_REQUIRED' } }),
    });

    render(
      <ThemeProvider theme={theme}>
        <UserQuotasDirectory />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/ADMIN_REQUIRED/)).toBeInTheDocument();
    });
  });

  it('opens edit dialog and updates quota', async () => {
    const mockUsers = [
      {
        userId: 'user_to_edit',
        email: 'edit@example.com',
        displayName: 'Editor User',
        planTier: 'free',
        limitUsd: 5.0,
        spendUsd: 1.0,
        tokens: { prompt: 10000, completion: 1000, total: 11000 },
        callCount: 2,
        isBlocked: false,
      },
    ];

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ users: mockUsers, total: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userId: 'user_to_edit',
          planTier: 'pro',
          limitCents: 2000,
          spendCents: 100,
          allowed: true,
        }),
      });

    render(
      <ThemeProvider theme={theme}>
        <UserQuotasDirectory />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('edit@example.com')).toBeInTheDocument();
    });

    // Click edit icon
    fireEvent.click(screen.getByTestId('EditOutlinedIcon'));
    expect(screen.getByText('Edit User Quota')).toBeInTheDocument();

    // Click save
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(screen.queryByText('Edit User Quota')).not.toBeInTheDocument();
      expect(screen.getByText('PRO')).toBeInTheDocument();
    });
  });
});
