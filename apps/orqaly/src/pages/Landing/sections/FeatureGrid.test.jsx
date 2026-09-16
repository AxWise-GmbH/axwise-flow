import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import FeatureGrid, { FEATURES } from './FeatureGrid';

function renderGrid() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <FeatureGrid />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('FeatureGrid', () => {
  it('hides detail bullets when collapsed', () => {
    renderGrid();
    const goals = FEATURES[0];
    expect(screen.queryByText(goals.bullets[1])).not.toBeInTheDocument();
  });

  it('shows detail and bullets when a tile is expanded', () => {
    renderGrid();
    const goals = FEATURES[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(goals.title, 'i') }));
    expect(screen.getByText(goals.detail)).toBeVisible();
    expect(screen.getByText(goals.bullets[1])).toBeVisible();
  });
});
