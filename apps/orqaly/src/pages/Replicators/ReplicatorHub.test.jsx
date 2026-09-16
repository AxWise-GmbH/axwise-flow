import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../context/ReplicatorContext', () => ({
  useReplicators: () => ({ replicators: [], loaded: true, error: null, refresh: vi.fn() }),
}));
vi.mock('../../context/PartnerAccessContext', () => ({
  usePartnerAccessOptional: () => ({ roleId: 'role-super-admin', loaded: true }),
}));
vi.mock('../../components/Marketplace/CreateReplicatorWizard', () => ({ default: () => null }));
// The page-name title now lives in the top bar; the header shows the "?" help instead.
vi.mock('../../components/Common/PageExplain', () => ({
  default: () => <button type="button" aria-label="Explain this page" />,
}));

import ReplicatorHub from './ReplicatorHub';

function renderHub() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <ReplicatorHub />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('ReplicatorHub header', () => {
  it('hides the page-name title (it lives in the top bar) and shows the help "?"', () => {
    renderHub();
    expect(screen.queryByText('Replicators')).toBeNull();
    expect(screen.queryByText('Your replicators')).toBeNull();
    expect(screen.getByLabelText('Explain this page')).toBeInTheDocument();
  });

  it('renders the Create Replicator action for admins', () => {
    renderHub();
    expect(screen.getByRole('button', { name: /create replicator/i })).toBeInTheDocument();
  });
});
