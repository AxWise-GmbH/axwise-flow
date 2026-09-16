import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../services/goalService', () => ({ createGoal: vi.fn() }));
vi.mock('../../services/userKeysService', () => ({ saveUserKey: vi.fn() }));

import ManagedVsByoCards from './ManagedVsByoCards';

const theme = createTheme();
function renderCards() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <ManagedVsByoCards />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('ManagedVsByoCards', () => {
  it('renders all three account options with their CTAs', () => {
    renderCards();
    expect(screen.getByText('Have us create it')).toBeTruthy();
    expect(screen.getByText('I have keys')).toBeTruthy();
    expect(screen.getByText('Run Locally')).toBeTruthy();
    expect(screen.getByRole('button', { name: /start account creation/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /import a key/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /configure/i })).toBeTruthy();
    // Managed price is shown as a clean chip + helper (not interleaved text).
    expect(screen.getByText('$5 / account')).toBeTruthy();
    expect(screen.getByText(/you approve before any spend/i)).toBeTruthy();
  });

  it('reveals the BYO import form on demand', () => {
    renderCards();
    fireEvent.click(screen.getByRole('button', { name: /import a key/i }));
    expect(screen.getByLabelText('Provider name')).toBeTruthy();
    expect(screen.getByLabelText('API key')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save key/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('reveals the local-server form on demand', () => {
    renderCards();
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
    expect(screen.getByLabelText('Base URL')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
  });
});
