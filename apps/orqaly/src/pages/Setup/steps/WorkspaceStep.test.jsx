import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({ createOrganization: vi.fn(), updateOrganization: vi.fn() }));
vi.mock('../../../services/organizationService', () => ({
  createOrganization: svc.createOrganization,
  updateOrganization: svc.updateOrganization,
}));

import WorkspaceStep from './WorkspaceStep';

const theme = createTheme();
const refresh = vi.fn();
const progress = { workspace: { orgs: [], done: false, refresh } };
const wrap = () =>
  render(
    <ThemeProvider theme={theme}>
      <WorkspaceStep progress={progress} />
    </ThemeProvider>
  );

beforeEach(() => {
  svc.createOrganization.mockResolvedValue({ id: 'o1' });
  refresh.mockClear();
});

describe('WorkspaceStep', () => {
  it('creates an organization from the name field', async () => {
    wrap();
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(svc.createOrganization).toHaveBeenCalledWith({ name: 'Acme' });
      expect(refresh).toHaveBeenCalled();
    });
  });
});
