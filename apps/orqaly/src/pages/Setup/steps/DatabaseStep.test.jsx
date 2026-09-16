import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({ saveUserKey: vi.fn() }));
vi.mock('../../../services/userKeysService', () => ({ saveUserKey: svc.saveUserKey }));

import DatabaseStep from './DatabaseStep';

const theme = createTheme();
const refresh = vi.fn();
const progress = { database: { done: false, refresh } };
const wrap = () =>
  render(
    <ThemeProvider theme={theme}>
      <DatabaseStep progress={progress} />
    </ThemeProvider>
  );

beforeEach(() => {
  svc.saveUserKey.mockResolvedValue({});
  refresh.mockClear();
});

describe('DatabaseStep', () => {
  it('explains the data split', () => {
    wrap();
    expect(screen.getByText('Platform Supabase')).toBeTruthy();
    expect(screen.getByText('Your Supabase')).toBeTruthy();
  });

  it('stores the Supabase credentials encrypted under database:supabase', async () => {
    wrap();
    fireEvent.change(screen.getByLabelText(/Supabase Project URL/i), {
      target: { value: 'https://abcd.supabase.co' },
    });
    fireEvent.change(screen.getByLabelText(/Service-role key/i), {
      target: { value: 'x'.repeat(40) },
    });
    fireEvent.click(screen.getByRole('button', { name: /connect my database/i }));
    await waitFor(() => {
      expect(svc.saveUserKey).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'database:supabase', skipProbe: true })
      );
      expect(refresh).toHaveBeenCalled();
    });
  });
});
