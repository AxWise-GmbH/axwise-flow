import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('@clerk/react', () => ({
  UserProfile: ({ routing }) => <div data-testid="clerk-user-profile">{routing}</div>,
}));

vi.mock('../../components/Common/PageExplain', () => ({ default: () => null }));

import ClerkSettings from './ClerkSettings';

describe('ClerkSettings', () => {
  it('uses Clerk as the only account and security surface', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <ClerkSettings />
      </ThemeProvider>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByTestId('clerk-user-profile')).toHaveTextContent('hash');
    expect(screen.getByText(/does not maintain a second Supabase user account/i)).toBeTruthy();
  });
});
