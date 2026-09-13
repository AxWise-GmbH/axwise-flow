/**
 * [module: frontend]
 * Tests for ReplaceUnitDialog org-first flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ReplaceUnitDialog from './ReplaceUnitDialog';

vi.mock('../Common/FormDialog', () => ({
  default: ({ open, children, title, actions }) =>
    open ? (
      <div data-testid="form-dialog">
        <h2>{title}</h2>
        {children}
        <div>{actions}</div>
      </div>
    ) : null,
}));

vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(),
}));

vi.mock('../../services/goalUnitService', () => ({
  listUnits: vi.fn(),
  replaceUnit: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [] }),
    })),
  },
  hasSupabase: vi.fn(() => false),
}));

import { listOrganizations } from '../../services/organizationService';
import { listUnits } from '../../services/goalUnitService';

const goal = { id: 'g1', title: 'Ship feature' };

function renderDialog() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <ReplaceUnitDialog open onClose={vi.fn()} goal={goal} onSuccess={vi.fn()} />
    </ThemeProvider>
  );
}

describe('ReplaceUnitDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOrganizations.mockResolvedValue([
      { id: 'org-1', name: 'Acme Corp' },
      { id: 'org-2', name: 'Beta Inc' },
    ]);
    listUnits.mockImplementation((orgId) => {
      if (orgId === 'org-1')
        return Promise.resolve([
          { id: 'u1', name: 'Main Unit', unit_type: 'bundle', goalCount: 1, status: 'active' },
        ]);
      return Promise.resolve([]);
    });
  });

  it('starts with organization picker', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    });
  });

  it('loads units filtered by selected org', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Acme Corp'));
    await waitFor(() => {
      expect(listUnits).toHaveBeenCalledWith('org-1');
      expect(screen.getByText('Main Unit')).toBeInTheDocument();
    });
  });
});
