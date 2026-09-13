import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DestinationBlock from './DestinationBlock';

const orgs = [
  { id: 'org-1', name: 'Orqaly Main' },
  { id: 'org-2', name: 'Side Venture' },
];

function setup(overrides = {}) {
  const props = {
    value: 'standalone',
    onChange: vi.fn(),
    orgName: '',
    onOrgNameChange: vi.fn(),
    industry: '',
    onIndustryChange: vi.fn(),
    organizations: orgs,
    organizationsLoading: false,
    organizationLoadError: '',
    selectedOrgId: 'org-1',
    onSelectedOrgIdChange: vi.fn(),
    ...overrides,
  };
  render(<DestinationBlock {...props} />);
  return props;
}

describe('DestinationBlock', () => {
  it('defaults to Standalone and still binds a workspace', () => {
    setup();

    expect(screen.getByRole('radio', { name: 'Standalone' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    // Standalone means no business unit, not no tenant.
    expect(screen.getByLabelText('Execution workspace')).toBeInTheDocument();
    expect(screen.getByText('Runs on its own, scoped to this workspace.')).toBeInTheDocument();
  });

  it('asks for a business name and industry when creating a new business', () => {
    setup({ value: 'new_business' });

    expect(screen.getByLabelText(/Business name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Industry')).toBeInTheDocument();
    expect(screen.queryByLabelText('Execution workspace')).not.toBeInTheDocument();
  });

  it('relabels the picker as Organization for an existing business', () => {
    setup({ value: 'existing_business' });

    expect(screen.getByLabelText('Organization')).toBeInTheDocument();
    expect(screen.getByText(/choose its unit right after creation/)).toBeInTheDocument();
  });

  it('reports a destination change', () => {
    const props = setup();

    fireEvent.click(screen.getByRole('radio', { name: 'New' }));

    expect(props.onChange).toHaveBeenCalledWith('new_business');
  });

  it('disables the picker while workspaces are loading', () => {
    setup({ organizationsLoading: true });

    expect(screen.getByText('Loading workspaces…')).toBeInTheDocument();
  });

  it('surfaces a workspace load failure instead of an empty dropdown', () => {
    setup({ organizationLoadError: 'Could not reach the server' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    // The reassurance copy is suppressed so the error is the only message.
    expect(
      screen.queryByText('Runs on its own, scoped to this workspace.')
    ).not.toBeInTheDocument();
  });
});
