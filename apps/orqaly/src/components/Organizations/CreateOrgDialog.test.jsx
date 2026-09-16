import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/organizationService', () => ({ createOrganization: vi.fn() }));

import CreateOrgDialog from './CreateOrgDialog';

describe('CreateOrgDialog', () => {
  it('renders the new-organization form', () => {
    render(<CreateOrgDialog open onClose={vi.fn()} onCreated={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText('New organization')).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
