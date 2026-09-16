/**
 * [module: frontend]
 * Tests for ImplementDialog org → unit picker flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ImplementDialog from './ImplementDialog';

vi.mock('../Common/FormDialog', () => ({
  default: ({ open, children, title, actions }) =>
    open ? (
      <div data-testid="form-dialog">
        <h2>{title}</h2>
        {children}
        <div>{actions}</div>
      </div>
    ) : null,
  FORM_FIELD_SX: {},
}));

vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(),
}));

vi.mock('../../services/goalUnitService', () => ({
  listUnits: vi.fn(),
  implementExisting: vi.fn(),
}));

import { listOrganizations } from '../../services/organizationService';
import { listUnits, implementExisting } from '../../services/goalUnitService';

const goal = { id: 'g1', title: 'Ship feature' };

function renderDialog(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <ImplementDialog open onClose={vi.fn()} goal={goal} onSuccess={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

describe('ImplementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Acme Corp', org_type: 'holding' }]);
    listUnits.mockResolvedValue([{ id: 'u1', name: 'Ops', unit_type: 'initiative', goalCount: 2 }]);
    implementExisting.mockResolvedValue({ org: { name: 'Acme Corp' }, unit: { name: 'Ops' } });
  });

  it('renders organization list on open', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
  });

  it('shows units after selecting an organization', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Acme Corp'));
    await waitFor(() => {
      expect(screen.getByText('Ops')).toBeInTheDocument();
      expect(listUnits).toHaveBeenCalledWith('org-1');
    });
  });

  it('calls implementExisting with orgId and unitId on submit', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Acme Corp'));
    await waitFor(() => expect(screen.getByText('Ops')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ops'));
    fireEvent.click(screen.getByText('Link Goal'));
    await waitFor(() => {
      expect(implementExisting).toHaveBeenCalledWith('g1', { orgId: 'org-1', unitId: 'u1' });
    });
  });

  it('starts at unit selection for a workspace chosen before goal creation', async () => {
    renderDialog({
      initialOrganization: { id: 'org-1', name: 'Acme Corp', org_type: 'holding' },
    });

    await waitFor(() => {
      expect(screen.getByText('Ops')).toBeInTheDocument();
      expect(listUnits).toHaveBeenCalledWith('org-1');
    });
    expect(screen.queryByText('Back')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Ops'));
    fireEvent.click(screen.getByText('Link Goal'));
    await waitFor(() => {
      expect(implementExisting).toHaveBeenCalledWith('g1', { orgId: 'org-1', unitId: 'u1' });
    });
  });
});
