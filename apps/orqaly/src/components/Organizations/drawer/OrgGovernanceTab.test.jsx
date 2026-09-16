import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import OrgGovernanceTab from './OrgGovernanceTab';

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
  org: { id: 'org-1', name: 'Traktor', consilium_id: '' },
  parentOrg: null,
  consiliumBoard: null,
  childOrgs: [],
  getTypeColor: () => '#888',
  getTypeLabel: () => 'Virtual',
  concilium: [
    { id: 'b1', name: 'Main Consilium' },
    { id: 'b2', name: 'Fintech Board' },
  ],
};

describe('OrgGovernanceTab consilium attach', () => {
  it('renders the Consilium board select when onAttachConsilium is provided', () => {
    render(
      <Wrap>
        <OrgGovernanceTab {...baseProps} onAttachConsilium={vi.fn()} />
      </Wrap>
    );
    expect(screen.getByLabelText('Consilium board')).toBeInTheDocument();
  });

  it('does not render the select without the handler', () => {
    render(
      <Wrap>
        <OrgGovernanceTab {...baseProps} />
      </Wrap>
    );
    expect(screen.queryByLabelText('Consilium board')).not.toBeInTheDocument();
  });

  it('calls onAttachConsilium with the chosen board id', async () => {
    const onAttach = vi.fn().mockResolvedValue();
    render(
      <Wrap>
        <OrgGovernanceTab {...baseProps} onAttachConsilium={onAttach} />
      </Wrap>
    );
    fireEvent.mouseDown(screen.getByLabelText('Consilium board'));
    const listbox = within(screen.getByRole('listbox'));
    fireEvent.click(listbox.getByText('Fintech Board'));
    expect(onAttach).toHaveBeenCalledWith('b2');
  });

  it('calls onAttachConsilium with null when None is chosen', () => {
    const onAttach = vi.fn().mockResolvedValue();
    const props = { ...baseProps, org: { ...baseProps.org, consilium_id: 'b1' } };
    render(
      <Wrap>
        <OrgGovernanceTab {...props} onAttachConsilium={onAttach} />
      </Wrap>
    );
    fireEvent.mouseDown(screen.getByLabelText('Consilium board'));
    const listbox = within(screen.getByRole('listbox'));
    fireEvent.click(listbox.getByText('None'));
    expect(onAttach).toHaveBeenCalledWith(null);
  });
});
