import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SearchResults from './SearchResults';

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div data-testid="public-shell">{children}</div>,
}));

function renderPage(initialPath = '/search?q=agents') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider theme={createTheme()}>
        <Routes>
          <Route path="/search" element={<SearchResults />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('SearchResults page', () => {
  it('renders results for a query with links and snippets', () => {
    renderPage('/search?q=agents');
    expect(screen.getByText(/Results for “agents”/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Agents$/i })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ results$/)).toBeInTheDocument();
  });

  it('shows empty state prompt without query', () => {
    renderPage('/search');
    expect(screen.getByText('Search the site')).toBeInTheDocument();
    expect(screen.getByText('Agent Hub')).toBeInTheDocument();
  });
});
