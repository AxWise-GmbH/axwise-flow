import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DemoToolsHub from './DemoToolsHub';

describe('DemoToolsHub', () => {
  it('renders tools metrics and connection types', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <DemoToolsHub />
      </ThemeProvider>,
    );
    expect(screen.getByText('app.orqaly.com / tools')).toBeInTheDocument();
    expect(screen.getByText('Total tools')).toBeInTheDocument();
    expect(screen.getAllByText('MCP').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Composio · 9 MCP subcategories/i)).toBeInTheDocument();
  });
});
