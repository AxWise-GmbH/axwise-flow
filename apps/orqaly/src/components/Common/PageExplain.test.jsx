import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

import PageExplain from './PageExplain';

const theme = createTheme();
const renderWith = (ui, route = '/tools') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  }
});

describe('PageExplain', () => {
  it('renders an Explain button', () => {
    renderWith(<PageExplain />);
    expect(screen.getByLabelText('Explain this page')).toBeTruthy();
  });

  it('opens a tour over discovered blocks with registry content', async () => {
    renderWith(
      <>
        <PageExplain pageKey="/tools" />
        <div data-tour-block="tools-toolbar" data-tour-label="Controls">
          <div className="MuiPaper-root">content</div>
        </div>
      </>,
      '/tools'
    );
    fireEvent.click(screen.getByLabelText('Explain this page'));
    // ExplainTour popup shows the registry copy for the "tools-toolbar" block.
    await waitFor(() => expect(screen.getByText(/list or card view/i)).toBeTruthy());
    // step counter present
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('marks the active block with .explain-active', async () => {
    renderWith(
      <>
        <PageExplain pageKey="/tools" />
        <div data-tour-block="tools" data-tour-label="Tools" data-testid="blk">
          <div className="MuiPaper-root">content</div>
        </div>
      </>,
      '/tools'
    );
    fireEvent.click(screen.getByLabelText('Explain this page'));
    await waitFor(() => expect(screen.getByTestId('blk').classList.contains('explain-active')).toBe(true));
  });
});
