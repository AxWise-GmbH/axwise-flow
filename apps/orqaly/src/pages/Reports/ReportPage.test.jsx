import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../hooks/useReport', () => ({
  useReport: () => ({
    template: null,
    templateId: null,
    builtInTemplates: [],
    selectTemplate: vi.fn(),
    filters: {},
    setFilter: vi.fn(),
    clearFilters: vi.fn(),
    snapshot: null,
    loading: false,
    error: null,
    errorStatus: null,
    freshness: null,
    version: null,
    computedAt: null,
    autoRefresh: false,
    setAutoRefresh: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('./components/TrendChart', () => ({ default: () => null }));
vi.mock('./components/FunnelChart', () => ({ default: () => null }));
// The page-name title now lives in the top bar; the header shows the "?" help instead.
vi.mock('../../components/Common/PageExplain', () => ({
  default: () => <button type="button" aria-label="Explain this page" />,
}));

import ReportPage from './ReportPage';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (q) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

describe('ReportPage header', () => {
  it('shows the header help "?" and keeps the Reports/LLM tabs (page title hidden)', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter>
          <ReportPage />
        </MemoryRouter>
      </ThemeProvider>
    );
    // The page-name title is hidden in the header; the "Reports" tab still reads "Reports".
    expect(screen.getByText('LLM')).toBeInTheDocument();
    expect(screen.getAllByText('Reports').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Explain this page')).toBeInTheDocument();
  });
});
