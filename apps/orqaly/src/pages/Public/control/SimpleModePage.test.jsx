import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import SimpleModePage from './SimpleModePage';

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <SimpleModePage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Public SimpleModePage', () => {
  it('renders hero and gallery copy', () => {
    renderPage();
    expect(screen.getByText('The everyday interface for getting work done.')).toBeInTheDocument();
    expect(screen.getByText(/CONTROL POINT · Simple Mode/i)).toBeInTheDocument();
    expect(screen.getByText('See Simple Mode in the app')).toBeInTheDocument();
    expect(screen.getByText('Inside Simple Mode')).toBeInTheDocument();
  });
});
