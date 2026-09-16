import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntityFormDialog from './EntityFormDialog';

const type = {
  type_key: 'partner',
  label: 'Partners',
  fields: [
    { key: 'category', label: 'Category', type: 'select', options: ['Webmaster', 'Partner'] },
    { key: 'revenue', label: 'Revenue', type: 'currency' },
  ],
};

describe('EntityFormDialog', () => {
  it('renders a control per configured field plus Name', () => {
    render(<EntityFormDialog open type={type} entity={null} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Revenue/)).toBeInTheDocument();
  });

  it('submits name + data and blocks empty names', () => {
    const onSubmit = vi.fn();
    render(<EntityFormDialog open type={type} entity={null} onSubmit={onSubmit} />);
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled(); // no name yet
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'AceMedia' } });
    fireEvent.change(screen.getByLabelText(/Revenue/), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'AceMedia', data: { revenue: 500 } });
  });

  it('prefills from an existing entity when editing', () => {
    render(
      <EntityFormDialog
        open
        type={type}
        entity={{ id: 'e1', name: 'Existing', data: { revenue: 100 } }}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Name/)).toHaveValue('Existing');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
