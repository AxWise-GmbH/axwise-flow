import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import OrgOverviewTab from './OrgOverviewTab';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => (
  <MemoryRouter>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </MemoryRouter>
);

const baseProps = {
  org: { id: 'org-1', name: 'Traktor', consilium_id: '', created_at: '2026-03-31T00:00:00Z' },
  parentOrg: null,
  consiliumBoard: null,
  finances: {},
  counts: {},
  teamsCount: 0,
  loadingFinances: false,
  onTabChange: vi.fn(),
  concilium: [{ id: 'b1', name: 'Main Consilium' }],
};

describe('OrgOverviewTab consilium attach', () => {
  it('renders the Consilium board select on the Overview tab when onAttachConsilium is given', () => {
    render(
      <Wrap>
        <OrgOverviewTab {...baseProps} onAttachConsilium={vi.fn()} />
      </Wrap>
    );
    expect(screen.getByLabelText('Consilium board')).toBeInTheDocument();
  });

  it('omits the select without the handler', () => {
    render(
      <Wrap>
        <OrgOverviewTab {...baseProps} />
      </Wrap>
    );
    expect(screen.queryByLabelText('Consilium board')).not.toBeInTheDocument();
  });

  it('calls onAttachConsilium with the chosen board id', () => {
    const onAttach = vi.fn().mockResolvedValue();
    render(
      <Wrap>
        <OrgOverviewTab {...baseProps} onAttachConsilium={onAttach} />
      </Wrap>
    );
    fireEvent.mouseDown(screen.getByLabelText('Consilium board'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Main Consilium'));
    expect(onAttach).toHaveBeenCalledWith('b1');
  });
});
