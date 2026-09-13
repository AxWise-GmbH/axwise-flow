import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(),
  updateOrganization: vi.fn(async () => ({})),
}));

import { listOrganizations, updateOrganization } from '../../services/organizationService';
import BoardOrgLinkDialog from './BoardOrgLinkDialog';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

const board = { id: 'b1', name: 'Main Consilium' };

beforeEach(() => {
  vi.clearAllMocks();
  listOrganizations.mockResolvedValue([
    { id: 'o1', name: 'Traktor', org_type: 'virtual', consilium_id: null }, // not linked
    { id: 'o2', name: 'Acme', org_type: 'holding', consilium_id: 'b1' }, // linked to THIS board
    { id: 'o3', name: 'Other', org_type: 'division', consilium_id: 'b2' }, // linked to a different board
  ]);
});

describe('BoardOrgLinkDialog', () => {
  it('pre-checks orgs already linked to this board', async () => {
    render(
      <Wrap>
        <BoardOrgLinkDialog open board={board} onClose={() => {}} />
      </Wrap>
    );
    await waitFor(() => expect(screen.getByText('Traktor')).toBeInTheDocument());
    const checkboxes = screen.getAllByRole('checkbox');
    // order: o1 (unchecked), o2 (checked), o3 (unchecked)
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
  });

  it('links newly-checked orgs and unlinks unchecked ones, leaving other-board orgs alone', async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrap>
        <BoardOrgLinkDialog open board={board} onChanged={onChanged} onClose={onClose} />
      </Wrap>
    );
    await waitFor(() => expect(screen.getByText('Traktor')).toBeInTheDocument());

    // Check o1 (Traktor) → should link; uncheck o2 (Acme) → should unlink.
    fireEvent.click(screen.getByText('Traktor'));
    fireEvent.click(screen.getByText('Acme'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateOrganization).toHaveBeenCalledWith('o1', { consilium_id: 'b1' });
    expect(updateOrganization).toHaveBeenCalledWith('o2', { consilium_id: null });
    // o3 (linked to a different board) is never touched.
    expect(updateOrganization).not.toHaveBeenCalledWith('o3', expect.anything());
    expect(updateOrganization).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalled();
  });
});
