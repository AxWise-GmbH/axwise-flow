import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import IdeSyncStep from './IdeSyncStep';

const theme = createTheme();
const progress = { ideSync: { done: false, refresh: () => {} } };

describe('IdeSyncStep', () => {
  it('renders the coming-soon placeholder with the companion approach', () => {
    render(
      <ThemeProvider theme={theme}>
        <IdeSyncStep progress={progress} />
      </ThemeProvider>
    );
    expect(screen.getByText('IDE Synchronization')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.getByText(/orchestratori-sync/i)).toBeTruthy();
    expect(screen.getByText(/No extension per editor/i)).toBeTruthy();
  });
});
