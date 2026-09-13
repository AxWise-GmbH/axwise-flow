import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Footer from './Footer';
import { CONTROL_NAV_SLUG_ORDER, GROUPS, INSTRUMENTS_BY_GROUP } from '../../../data/instruments';

function renderFooter() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ThemeProvider theme={createTheme()}>
        <Routes>
          <Route path="/" element={<Footer />} />
          <Route path="/search" element={<div data-testid="search-route">Search route</div>} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('Footer', () => {
  it('orders Control Point links for site chrome', () => {
    expect(INSTRUMENTS_BY_GROUP.control.map((it) => it.slug)).toEqual(CONTROL_NAV_SLUG_ORDER);
  });

  it('renders Instruments and Control Point columns with correct links', () => {
    renderFooter();

    expect(screen.getByText(GROUPS.instruments.label)).toBeInTheDocument();
    expect(screen.getByText(GROUPS.control.label)).toBeInTheDocument();

    INSTRUMENTS_BY_GROUP.instruments.forEach((it) => {
      const link = screen.getByRole('link', { name: it.label });
      expect(link.getAttribute('href')).toBe(`/instruments/${it.slug}`);
    });

    INSTRUMENTS_BY_GROUP.control.forEach((it) => {
      const link = screen.getByRole('link', { name: it.label });
      expect(link.getAttribute('href')).toBe(`/control/${it.slug}`);
    });
  });

  it('renders site search and navigates to search results on submit', () => {
    renderFooter();
    const input = screen.getByPlaceholderText(/Search agents, tools, FAQ/i);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'marketplace' } });
    fireEvent.submit(input.closest('form'));
    expect(screen.getByTestId('search-route')).toBeInTheDocument();
  });
});
